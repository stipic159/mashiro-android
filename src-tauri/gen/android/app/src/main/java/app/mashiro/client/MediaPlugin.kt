package app.mashiro.client

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@InvokeArg
class PlayPayload {
    var id: String = ""
    var title: String = ""
    var artist: String = ""
    var album: String? = null
    var coverUrl: String? = null
    var streamUrl: String = ""
    var startPositionMs: Long? = 0L
}

@InvokeArg
class SeekPayload {
    var positionMs: Long = 0L
}

@InvokeArg
class VolumePayload {
    var volume: Float = 1.0f
}

@InvokeArg
class RatePayload {
    var rate: Float = 1.0f
}

@InvokeArg
class RepeatPayload {
    var mode: String = "off"
}

@InvokeArg
class FullscreenPayload {
    var open: Boolean = false
}

@TauriPlugin
class MediaPlugin(private val activity: Activity) : Plugin(activity) {

    private var mWebView: android.webkit.WebView? = null

    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        this.mWebView = webView
    }

    fun emitEvent(eventName: String, data: JSObject) {
        trigger(eventName, data)
        val json = data.toString()
        activity.runOnUiThread {
            mWebView?.evaluateJavascript(
                "(function() { window.dispatchEvent(new CustomEvent('$eventName', { detail: $json })); })();",
                null
            )
        }
    }

    init {
        instance = this
        MashiroMediaService.listener = object : MashiroMediaService.Companion.MediaEventListener {
            override fun onPlaybackStateChanged(isPlaying: Boolean, state: String) {
                val data = JSObject().apply {
                    put("isPlaying", isPlaying)
                    put("state", state)
                }
                emitEvent("media-playback-state", data)
            }

            override fun onProgress(positionMs: Long, durationMs: Long) {
                val data = JSObject().apply {
                    put("positionMs", positionMs)
                    put("durationMs", durationMs)
                }
                emitEvent("media-progress", data)
            }

            override fun onTrackEnded() {
                emitEvent("media-ended", JSObject())
            }

            override fun onMediaButtonAction(action: String) {
                val data = JSObject().apply {
                    put("action", action)
                }
                emitEvent("media-action", data)
            }
        }
    }

    private fun ensureServiceRunning() {
        if (MashiroMediaService.instance == null) {
            val intent = Intent(activity, MashiroMediaService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(activity, intent)
            } else {
                activity.startService(intent)
            }
        }
    }

    @Command
    fun play(invoke: Invoke) {
        val raw = try { invoke.getRawArgs() } catch (_: Exception) { "{}" }
        var id = ""
        var title = ""
        var artist = ""
        var album: String? = null
        var coverUrl: String? = null
        var streamUrl = ""
        var startPositionMs = 0L

        try {
            val json = JSONObject(raw)
            id = json.optString("id", "")
            title = json.optString("title", "")
            artist = json.optString("artist", "")
            album = if (json.has("album") && !json.isNull("album")) json.getString("album") else null
            coverUrl = if (json.has("coverUrl") && !json.isNull("coverUrl")) json.getString("coverUrl") else null
            streamUrl = json.optString("streamUrl", "")
            startPositionMs = json.optLong("startPositionMs", 0L)
        } catch (_: Exception) {}

        if (id.isEmpty() || streamUrl.isEmpty()) {
            try {
                val parsed = invoke.parseArgs(PlayPayload::class.java)
                if (id.isEmpty()) id = parsed.id
                if (title.isEmpty()) title = parsed.title
                if (artist.isEmpty()) artist = parsed.artist
                if (album == null) album = parsed.album
                if (coverUrl == null) coverUrl = parsed.coverUrl
                if (streamUrl.isEmpty()) streamUrl = parsed.streamUrl
                if (startPositionMs == 0L) startPositionMs = parsed.startPositionMs ?: 0L
            } catch (_: Exception) {}
        }

        Log.d("MediaPlugin", "play -> id=$id, title=$title, streamUrl=$streamUrl, startPositionMs=$startPositionMs")
        ensureServiceRunning()

        MashiroMediaService.play(
            id = id,
            title = title,
            artist = artist,
            album = album,
            coverUrl = coverUrl,
            streamUrl = streamUrl,
            startPositionMs = startPositionMs
        )
        invoke.resolve()
    }

    @Command
    fun pause(invoke: Invoke) {
        MashiroMediaService.pause()
        invoke.resolve()
    }

    @Command
    fun resume(invoke: Invoke) {
        MashiroMediaService.resume()
        invoke.resolve()
    }

    @Command
    fun seek(invoke: Invoke) {
        val raw = try { invoke.getRawArgs() } catch (_: Exception) { "{}" }
        var pos = 0L
        try {
            val json = JSONObject(raw)
            if (json.has("positionMs")) {
                pos = json.optLong("positionMs", 0L)
            } else if (json.has("position")) {
                pos = json.optLong("position", 0L)
            }
        } catch (_: Exception) {}

        if (pos == 0L) {
            try {
                pos = invoke.parseArgs(SeekPayload::class.java).positionMs
            } catch (_: Exception) {}
        }

        Log.d("MediaPlugin", "seek -> positionMs=$pos (raw: $raw)")
        MashiroMediaService.seek(pos)
        invoke.resolve()
    }

    @Command
    fun setRepeat(invoke: Invoke) {
        val raw = try { invoke.getRawArgs() } catch (_: Exception) { "{}" }
        var mode = "off"
        try {
            val json = JSONObject(raw)
            mode = json.optString("mode", "off")
        } catch (_: Exception) {
            try {
                mode = invoke.parseArgs(RepeatPayload::class.java).mode
            } catch (_: Exception) {}
        }
        MashiroMediaService.setRepeatMode(mode)
        invoke.resolve()
    }

    @Command
    fun setVolume(invoke: Invoke) {
        val raw = try { invoke.getRawArgs() } catch (_: Exception) { "{}" }
        var volume = 1.0f
        try {
            val json = JSONObject(raw)
            volume = json.optDouble("volume", 1.0).toFloat()
        } catch (_: Exception) {
            try {
                volume = invoke.parseArgs(VolumePayload::class.java).volume
            } catch (_: Exception) {}
        }
        MashiroMediaService.setVolume(volume)
        invoke.resolve()
    }

    @Command
    fun setPlaybackRate(invoke: Invoke) {
        val raw = try { invoke.getRawArgs() } catch (_: Exception) { "{}" }
        var rate = 1.0f
        try {
            val json = JSONObject(raw)
            rate = json.optDouble("rate", 1.0).toFloat()
        } catch (_: Exception) {
            try {
                rate = invoke.parseArgs(RatePayload::class.java).rate
            } catch (_: Exception) {}
        }
        MashiroMediaService.setPlaybackRate(rate)
        invoke.resolve()
    }

    @Command
    fun setFullscreen(invoke: Invoke) {
        val raw = try { invoke.getRawArgs() } catch (_: Exception) { "{}" }
        var open = false
        try {
            val json = JSONObject(raw)
            open = json.optBoolean("open", false)
        } catch (_: Exception) {
            try {
                open = invoke.parseArgs(FullscreenPayload::class.java).open
            } catch (_: Exception) {}
        }
        isFullscreenOpen = open
        invoke.resolve()
    }

    @Command
    fun getStatus(invoke: Invoke) {
        val data = JSObject().apply {
            put("isPlaying", MashiroMediaService.isPlaying())
            put("positionMs", MashiroMediaService.getCurrentPosition())
            put("durationMs", MashiroMediaService.getDuration())
        }
        invoke.resolve(data)
    }

    companion object {
        var instance: MediaPlugin? = null
        @Volatile var isFullscreenOpen: Boolean = false

        fun handleBackPress(): Boolean {
            if (isFullscreenOpen) {
                instance?.emitEvent("android-back-pressed", JSObject())
                return true
            }
            return false
        }
    }
}
