# 02. Перенос и компиляция Rust-ядра под Android

В данном документе описана миграция Rust-бэкенда `mashiro_lib` на платформу Android: настройка NDK, адаптация платформозависимого кода, аудит зависимостей и архитектура взаимодействия с мобильной ОС.

---

## 1. Целевые архитектуры (ABIs) и компиляция

Для поддержки 99.9% современных Android-устройств и эмулятора на ПК компиляция Rust-библиотеки производится под три целевые архитектуры:

1. **`aarch64-linux-android`** (ARM64-v8a) — основная архитектура всех современных смартфонов (начиная с Android 8+).
2. **`armv7-linux-androideabi`** (armeabi-v7a) — устаревшие 32-битные бюджетные устройства.
3. **`x86_64-linux-android`** (x86_64) — эмуляторы Android Studio на компьютерах разработчиков.

### Настройка инструментария:
```bash
# Установка целевых платформ Rust
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android

# Установка cargo-ndk (утилита для удобной сборки нативных библиотек)
cargo install cargo-ndk
```

При сборке через Tauri CLI 2 (`tauri android build`) утилита автоматически использует переменные окружения `ANDROID_HOME` и `NDK_HOME`, компилируя динамическую библиотеку `libmashiro_lib.so` и помещая её в папку `jniLibs/<abi>/` Android-проекта.

---

## 2. Аудит и адаптация зависимостей `Cargo.toml`

В оригинальном `desktop/src-tauri/Cargo.toml` содержатся следующие зависимости:

```toml
[lib]
name = "mashiro_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[dependencies]
tauri = { version = "2", features = ["protocol-asset", "image-png"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
tokio = { version = "1", features = ["macros", "net", "rt", "sync", "time"] }
md-5 = "0.10"
sha2 = "0.10"
hmac = "0.12"
base64 = "0.22"
hex = "0.4"
tokio-tungstenite = { version = "0.21", features = ["rustls-tls-webpki-roots"] }
futures-util = { version = "0.3", default-features = false, features = ["sink", "std"] }
mashiro-together-crypto = { path = "crates/together-crypto", version = "0.1.0" }
ed25519-dalek = "2"
```

### Анализ совместимости с Android:
- **`reqwest` + `rustls-tls`**: Идеально подходит для Android. В отличие от `native-tls` (OpenSSL), `rustls` написан полностью на Rust, не требует сборки OpenSSL под NDK и использует встроенные корневые сертификаты `webpki-roots`.
- **`tokio` и `tokio-tungstenite`**: Полностью поддерживаются в Android Linux Kernel.
- **Криптография (`ed25519-dalek`, `sha2`, `hmac`, `md-5`)**: Чистый Rust, компилируется без дополнительных настроек.
- **`keyring`**: В десктопной версии он присутствовал в зависимостях. На Android десктопный Secret Service недоступен. Токен в Mashiro сохраняется во фронтенде через `localStorage` или передается в Android Keystore. Зависимость `keyring` исключается из сборки для Android.
- **Десктопные плагины Tauri**: `tray-icon` и `tauri-plugin-global-shortcut` отключаются директивой условной компиляции `#[cfg(desktop)]`.

---

## 3. Адаптация платформозависимого кода в `src-tauri/src`

### 3.1. Условная изоляция десктопного функционала в `lib.rs`

В десктопной версии `lib.rs` инициализируются системный трей (`tray::build`), глобальные горячие клавиши и управление окнами:

```rust
// Адаптация в lib.rs:
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .setup(|app| {
                tray::build(app.handle())?;
                Ok(())
            });
    }

    #[cfg(mobile)]
    {
        builder = builder
            .plugin(tauri_plugin_opener::init()); // Открытие ссылок в нативном браузере
    }

    builder
        .manage(AppState::default())
        .manage(together::TogetherState::default())
        .manage(together::relay::RelayState::default())
        .invoke_handler(tauri::generate_handler![
            // ... регистрация общих команд
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mashiro");
}
```

### 3.2. Замена открытия ссылок в браузере (`oauth.rs`, `files.rs`)

В оригинале использовался вызов процессов `cmd /C start`, `open`, `xdg-open`, которые завершаются ошибкой на Android:

```rust
// Было (files.rs, oauth.rs):
#[cfg(target_os = "windows")]
std::process::Command::new("rundll32.exe")...

// Стало (универсальный кроссплатформенный подход):
#[tauri::command]
pub fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        opener::open(&url).map_err(|e| e.to_string())
    }
    #[cfg(mobile)]
    {
        // Использование официального плагина tauri-plugin-opener
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())
    }
}
```

### 3.3. Пути хранения файлов (`files.rs`, `playback.rs`)

На Android вызовы `std::env::var("USERPROFILE")` и `std::env::var("HOME")` возвращают ошибку. Требуется использование `app.path()` из Tauri API:

```rust
pub fn resolve_download_dir(app: &tauri::AppHandle, dir: Option<String>) -> Result<std::path::PathBuf, String> {
    if let Some(custom) = dir.filter(|d| !d.trim().is_empty()) {
        return Ok(std::path::PathBuf::from(custom));
    }

    #[cfg(desktop)]
    {
        let base = app.path().audio_dir().or_else(|_| app.path().download_dir())
            .map_err(|e| e.to_string())?;
        Ok(base.join("Mashiro"))
    }

    #[cfg(target_os = "android")]
    {
        // На Android используем стандартный путь Music/Mashiro или внутреннее хранилище
        let base = app.path().app_data_dir()
            .map_err(|e| e.to_string())?;
        let mashiro_music = base.join("music");
        std::fs::create_dir_all(&mashiro_music).map_err(|e| e.to_string())?;
        Ok(mashiro_music)
    }
}
```

---

## 4. Архитектура проксирования аудиопотока

В настольной версии `proxy.rs` регистрировал кастомную схему `ymstream://` для перехвата запросов `<audio>` тега, чтения кусками (по 1 МБ) и предварительного прогрева кэша.

На Android:
1. **Для веб-части (WebView)** схема `ymstream` может продолжать работать через `register_asynchronous_uri_scheme_protocol` (Tauri 2 поддерживает это через Android `WebViewAssetLoader`).
2. **Для нативного аудиоплеера (ExoPlayer)** создается локальный легковесный HTTP-прокси на Rust (`127.0.0.1:PORT`), либо прямая передача URL с заголовками авторизации в `MediaItem` ExoPlayer. Второй вариант предпочтительнее, так как встроенный `CacheDataSource` ExoPlayer выполняет кэширование на диск эффективнее и без лишних накладных расходов памяти.

---

## 5. Процедура сборки Rust-ядра

1. Генерация Android-шаблона:
   ```bash
   npm run tauri android init
   ```
2. Подготовка NDK в файле `src-tauri/.cargo/config.toml`:
   ```toml
   [target.aarch64-linux-android]
   ar = "llvm-ar"
   linker = "aarch64-linux-android33-clang"

   [target.armv7-linux-androideabi]
   ar = "llvm-ar"
   linker = "armv7a-linux-androideabi33-clang"

   [target.x86_64-linux-android]
   ar = "llvm-ar"
   linker = "x86_64-linux-android33-clang"
   ```
3. Тестовая компиляция библиотеки:
   ```bash
   cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 build --release
   ```

В результате ядро `mashiro_lib` компилируется в виде бинарных библиотек `.so`, готовых для связывания с интерфейсом и нативным Android-кодом.
