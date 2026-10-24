# 08. Подготовка среды разработки и сборка приложения

В данном руководстве представлена пошаговая инструкция по настройке окружения на компьютере под управлением Windows для сборки и отладки **Mashiro Android**.

---

## 1. Необходимое программное обеспечение

Для работы потребуются следующие компоненты:

1. **Node.js (LTS v20 или v22)** или **Bun**:
   - Проверка: `node -v` и `npm -v`.
2. **Rust (инструментарий `msvc`)**:
   - Проверка: `rustc --version` и `cargo --version`.
   - Установка через [rustup.rs](https://rustup.rs/).
3. **Android Studio** (версии Koala, Ladybug или новее):
   - Устанавливает базовый Android SDK, эмулятор и утилиты платформы (`adb`).
4. **Java Development Kit (JDK 17 или 21)**:
   - Рекомендуется использовать встроенный JDK из Android Studio (`jbr`) либо Eclipse Temurin 17/21.

---

## 2. Установка компонентов Android SDK и NDK

Откройте **Android Studio** -> **Settings** (Настройки) -> **Languages & Frameworks** -> **Android SDK** -> вкладка **SDK Tools**:

Обязательно отметьте галочками и установите:
1. ☑️ **Android SDK Platform-Tools** (содержит `adb.exe`).
2. ☑️ **Android SDK Build-Tools 34.0.0** (или 35.0.0).
3. ☑️ **NDK (Side by side)** (версия `26.x` или `27.x`).
4. ☑️ **CMake** (версия `3.22.1` или выше).
5. ☑️ **Android Emulator** (если планируется запуск на виртуальном устройстве).

Во вкладке **SDK Platforms**:
- ☑️ **Android 14.0 ("UpsideDownCake") / API Level 34** (или Android 15 / API 35).

---

## 3. Настройка системных переменных окружения (Windows)

Откройте *«Параметры среды»* Windows и проверьте/добавьте переменные:

| Переменная | Значение по умолчанию | Описание |
|---|---|---|
| `ANDROID_HOME` | `C:\Users\<ВашеИмя>\AppData\Local\Android\Sdk` | Путь к установленному Android SDK |
| `NDK_HOME` | `%ANDROID_HOME%\ndk\<версия_ndk>` (например, `26.1.10909125`) | Путь к установленному компилятору NDK |
| `JAVA_HOME` | `C:\Program Files\Android\Android Studio\jbr` (или путь к Temurin JDK) | Путь к JDK |
| `Path` (добавить) | `%ANDROID_HOME%\platform-tools`<br>`%USERPROFILE%\.cargo\bin` | Для доступа к `adb`, `cargo`, `tauri` |

Проверка в терминале PowerShell:
```powershell
adb version
javac -version
```

---

## 4. Настройка целевых платформ Rust

Добавьте мобильные архитектуры в компилятор Rust:
```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo install cargo-ndk
```

Проверьте готовность окружения командой Tauri:
```powershell
npx @tauri-apps/cli info
```

---

## 5. Инициализация и запуск в режиме разработки

### 5.1. Установка зависимостей проекта:
```powershell
cd f:\project\mashiro-android
npm install
```

### 5.2. Первичная генерация Android-проекта:
```powershell
npx tauri android init
```
Эта команда создаст папку `src-tauri/gen/android` со стандартным Gradle-проектом, настроенными биндингами JNI и манифестом.

### 5.3. Подключение устройства для тестирования:
1. **Реальный смартфон (Рекомендуется)**:
   - Включите *«Режим разработчика»* на телефоне (нажмите 7 раз на *«Номер сборки»* в настройках).
   - Включите пункт *«Отладка по USB»* (USB Debugging).
   - Подключите телефон кабелем к ПК и подтвердите отпечаток ключа на экране.
   - Проверьте обнаружение устройства:
     ```powershell
     adb devices
     ```
2. **Эмулятор Android Studio**:
   - Создайте виртуальное устройство через *Device Manager* (например, Pixel 8, Android 14, x86_64) и запустите его.

### 5.4. Запуск с «горячей перезагрузкой» (Live Reload):
```powershell
npx tauri android dev
```
Tauri автоматически скомпилирует Rust-библиотеку через NDK, соберет дебажный APK, установит его на устройство и запустит приложение. Изменения во Vue-файлах будут мгновенно отображаться на экране смартфона без перезапуска!

---

## 6. Сборка готового APK / AAB файла

### Сборка отладочного APK (для быстрой установки себе и друзьям):
```powershell
npx tauri android build -- --debug
```
Готовый установочный файл появится по пути:
```text
src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk
```
Установка на смартфон в одну команду:
```powershell
adb install -r src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk
```

### Сборка релизного подписанного APK:
1. Генерация ключа подписи (Keystore):
   ```powershell
   keytool -genkey -v -keystore mashiro-release.keystore -alias mashiro -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Указание переменных в `src-tauri/gen/android/keystore.properties` или запуск:
   ```powershell
   npx tauri android build
   ```
   Файл будет оптимизирован с помощью R8/ProGuard и уменьшен в размере.
