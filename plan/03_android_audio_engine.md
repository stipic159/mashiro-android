# 03. Нативный аудиодвижок Android и фоновое воспроизведение

В данном документе детально проработана архитектура фонового воспроизведения звука на Android с использованием **Jetpack Media3 (ExoPlayer)**, интеграция с **MediaSession**, системными уведомлениями, Bluetooth-гарнитурами и мостом связи с веб-интерфейсом.

---

## 1. Проблема воспроизведения через WebView на смартфонах

В десктопной версии Mashiro воспроизведение реализовано через HTML5 `<audio>` и `AudioContext` в `src/lib/audio.ts`. На операционной системе Android данный подход **непригоден** для повседневного использования:

1. **Doze Mode и сон WebView**: Спустя 15–30 секунд после выключения экрана или перехода в другое приложение (например, Telegram) Android переводит WebView в состояние глубокого сна, останавливает таймеры JavaScript и замораживает процесс.
2. **Отсутствие управления в шторке**: WebView не умеет самостоятельно создавать системное интерактивное уведомление Android с ползунком перемотки (seekbar) и кнопками управления.
3. **Bluetooth и наушники**: Нажатия на кнопки гарнитуры (play/pause/next) передаются в систему через системный `MediaSession`. Без нативного сервиса эти события теряются.
4. **Конфликт звука (Audio Focus)**: При поступлении телефонного звонка или воспроизведении подсказки навигатора WebView продолжает играть поверх голоса, нарушая требования Android.

---

## 2. Архитектура нативного сервиса: Jetpack Media3

Для стабильного фонового воспроизведения 24/7 создается нативный Android-сервис **`MashiroMediaService`** на базе **Jetpack Media3**:

```text
+-------------------------------------------------------+
|                    Vue 3 Фронтенд                     |
|  - Нажатие Play / Pause / Seek / Смена трека          |
|  - Подписка на событие прогресса для текста (LRC)    |
+---------------------------+---------------------------+
                            | Tauri IPC (Channel)
                            v
+-------------------------------------------------------+
|             MediaBridgePlugin (Kotlin / JNI)          |
+---------------------------+---------------------------+
                            | Intent / Binder
                            v
+-------------------------------------------------------+
|             MashiroMediaService (MediaSessionService) |
|  - Foreground Service (FOREGROUND_SERVICE_MEDIA_...)  |
|  - MediaSessionCompat / MediaSession (Media3)         |
|  - ExoPlayer (кэширование, декодирование, gapless)    |
|  - MediaStyle Notification (шторка и локскрин)        |
|  - AudioFocusRequest (пауза при звонке)               |
+-------------------------------------------------------+
```

### Необходимые зависимости Gradle (`app/build.gradle.kts`):
```kotlin
dependencies {
    implementation("androidx.media3:media3-exoplayer:1.3.1")
    implementation("androidx.media3:media3-session:1.3.1")
    implementation("androidx.media3:media3-ui:1.3.1")
    implementation("androidx.media3:media3-datasource-okhttp:1.3.1")
    implementation("io.coil-kt:coil:2.6.0") // Быстрая загрузка обложек для уведомлений
}
```

### Разрешения в `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.INTERNET" />

<service
    android:name=".MashiroMediaService"
    android:foregroundServiceType="mediaPlayback"
    android:exported="true">
    <intent-filter>
        <action android:name="androidx.media3.session.MediaSessionService" />
    </intent-filter>
</service>
```

---

## 3. Реализация `MashiroMediaService.kt`

Сервис удерживает `WakeLock` на время воспроизведения, управляет жизненным циклом `ExoPlayer` и транслирует статус в `MediaSession`:

```kotlin
package app.mashiro

import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.MediaStyleNotificationHelper
import androidx.core.app.NotificationCompat

class MashiroMediaService : MediaSessionService() {
    private var mediaSession: MediaSession? = null
    lateinit var player: ExoPlayer

    override fun onCreate() {
        super.onCreate()
        
        // Настройка аудиоатрибутов для автоматического управления фокусом
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()

        player = ExoPlayer.Builder(this)
            .setAudioAttributes(audioAttributes, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true) // Пауза при отключении наушников
            .build()

        // Клик по уведомлению открывает приложение
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        mediaSession = MediaSession.Builder(this, player)
            .setSessionActivity(pendingIntent)
            .setCallback(CustomSessionCallback())
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }

    inner class CustomSessionCallback : MediaSession.Callback {
        // Обработка кастомных действий (например, лайк трека прямо из шторки)
    }
}
```

---

## 4. Двусторонний мост связи: Tauri Plugin <-> Kotlin

Создается плагин `MediaBridgePlugin.kt`, регистрируемый в Tauri Android рантайме:

### Команды, отправляемые из интерфейса (Vue -> Kotlin):
1. **`nativePlay(payload)`**: передает метаданные трека (id, title, artists, coverUrl, streamUrl, duration) и начинает воспроизведение.
2. **`nativePause()`** / **`nativeResume()`**: управление состоянием.
3. **`nativeSeek(positionMs)`**: быстрая перемотка.
4. **`nativeSetVolume(volume)`** и **`nativeSetRate(speed)`**: громкость и скорость.
5. **`nativeSetEqualizer(enabled, gains[])`**: передача параметров эквалайзера.

### События, отправляемые из сервиса в интерфейс (Kotlin -> Vue):
1. **`playback-state`**: `{"state": "playing" | "paused" | "buffering" | "ended"}`.
2. **`playback-progress`**: периодический тик (каждые 200 мс) с текущей позицией трека `{"position": 42150, "duration": 185000}`. Это обеспечивает плавный скролл караоке-текста LRC без рассинхронизации.
3. **`remote-action`**: `{"action": "next" | "prev" | "like"}` — когда пользователь переключил трек с кнопок руля автомобиля, умных часов или гарнитуры.

---

## 5. Эквалайзер и звуковые эффекты на Android

В настольном приложении эквалайзер реализован через цепочку Biquad-фильтров Web Audio API (`desktop/src/lib/audio.ts`).

На Android эквалайзер реализуется через нативную подсистему аудиоэффектов:
- Использование нативного класса **`android.media.audiofx.Equalizer`**, привязанного к `player.audioSessionId`.
- Поддержка стандартных полос частот (от 32 Гц до 16 кГц).
- Поддержка **BassBoost** (усиление баса) и **Virtualizer** (объемный 3D-звук), которые встроены в Android DSP на аппаратном уровне.
- Сохранение и синхронизация пресетов эквалайзера (Rock, Pop, Techno, Flat, Custom) через Pinia `equalizerStore`.

---

## 6. Кэширование аудиопотока и Gapless-воспроизведение

Для экономии мобильного интернета и плавного перехода между треками (без секундных пауз):
1. **Disk Cache**: ExoPlayer настраивается с `SimpleCache` и `LeastRecentlyUsedCacheEvictor` (лимит кэша, например, 1 ГБ). Уже прослушанные треки при повторном воспроизведении загружаются мгновенно без обращения к сети.
2. **Бесшовный переход (Gapless)**: Перед завершением текущего трека (за 10 секунд до конца) сервис автоматически подготавливает следующий `MediaItem` в очереди ExoPlayer. Звук воспроизводится непрерывно.
