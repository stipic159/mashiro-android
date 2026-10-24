package app.mashiro.client

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class MashiroMediaService : MediaSessionService() {

    private var mediaSession: MediaSession? = null
    private lateinit var exoPlayer: ExoPlayer
    private val handler = Handler(Looper.getMainLooper())
    private var progressRunnable: Runnable? = null

    companion object {
        var instance: MashiroMediaService? = null
            private set

        var listener: MediaEventListener? = null

        interface MediaEventListener {
            fun onPlaybackStateChanged(isPlaying: Boolean, state: String)
            fun onProgress(positionMs: Long, durationMs: Long)
            fun onTrackEnded()
            fun onMediaButtonAction(action: String)
        }

        fun play(
            id: String,
            title: String,
            artist: String,
            album: String?,
            coverUrl: String?,
            streamUrl: String,
            startPositionMs: Long = 0L
        ) {
            instance?.playInternal(id, title, artist, album, coverUrl, streamUrl, startPositionMs)
        }

        fun pause() {
            instance?.exoPlayer?.pause()
        }

        fun resume() {
            instance?.exoPlayer?.play()
        }

        fun seek(positionMs: Long) {
            instance?.exoPlayer?.seekTo(positionMs)
        }

        fun setVolume(volume: Float) {
            instance?.exoPlayer?.volume = volume.coerceIn(0f, 1f)
        }

        fun setPlaybackRate(rate: Float) {
            instance?.exoPlayer?.setPlaybackSpeed(rate)
        }

        fun isPlaying(): Boolean {
            return instance?.exoPlayer?.isPlaying ?: false
        }

        fun getCurrentPosition(): Long {
            return instance?.exoPlayer?.currentPosition ?: 0L
        }

        fun getDuration(): Long {
            return instance?.exoPlayer?.duration ?: 0L
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()

        exoPlayer = ExoPlayer.Builder(this)
            .setAudioAttributes(audioAttributes, true)
            .setHandleAudioBecomingNoisy(true)
            .build()

        exoPlayer.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                val stateStr = if (isPlaying) "playing" else "paused"
                listener?.onPlaybackStateChanged(isPlaying, stateStr)
                if (isPlaying) {
                    startProgressTracker()
                } else {
                    stopProgressTracker()
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_ENDED -> {
                        listener?.onTrackEnded()
                    }
                    Player.STATE_BUFFERING -> {
                        listener?.onPlaybackStateChanged(exoPlayer.isPlaying, "buffering")
                    }
                    Player.STATE_READY -> {
                        val stateStr = if (exoPlayer.isPlaying) "playing" else "paused"
                        listener?.onPlaybackStateChanged(exoPlayer.isPlaying, stateStr)
                    }
                    Player.STATE_IDLE -> {
                        listener?.onPlaybackStateChanged(false, "idle")
                    }
                }
            }
        })

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        mediaSession = MediaSession.Builder(this, exoPlayer)
            .setSessionActivity(pendingIntent)
            .setCallback(object : MediaSession.Callback {
                override fun onCustomCommand(
                    session: MediaSession,
                    controller: MediaSession.ControllerInfo,
                    customCommand: androidx.media3.session.SessionCommand,
                    args: Bundle
                ): com.google.common.util.concurrent.ListenableFuture<androidx.media3.session.SessionResult> {
                    when (customCommand.customAction) {
                        "ACTION_LIKE" -> listener?.onMediaButtonAction("like")
                        "ACTION_NEXT" -> listener?.onMediaButtonAction("next")
                        "ACTION_PREV" -> listener?.onMediaButtonAction("prev")
                    }
                    return super.onCustomCommand(session, controller, customCommand, args)
                }
            })
            .build()
    }

    private fun playInternal(
        id: String,
        title: String,
        artist: String,
        album: String?,
        coverUrl: String?,
        streamUrl: String,
        startPositionMs: Long
    ) {
        val metadataBuilder = MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)

        if (!album.isNullOrEmpty()) {
            metadataBuilder.setAlbumTitle(album)
        }

        if (!coverUrl.isNullOrEmpty()) {
            metadataBuilder.setArtworkUri(Uri.parse(coverUrl))
        }

        val mediaItem = MediaItem.Builder()
            .setMediaId(id)
            .setUri(streamUrl)
            .setMediaMetadata(metadataBuilder.build())
            .build()

        exoPlayer.setMediaItem(mediaItem, startPositionMs)
        exoPlayer.prepare()
        exoPlayer.play()
    }

    private fun startProgressTracker() {
        stopProgressTracker()
        progressRunnable = object : Runnable {
            override fun run() {
                if (exoPlayer.isPlaying) {
                    val pos = exoPlayer.currentPosition
                    val dur = exoPlayer.duration
                    listener?.onProgress(pos, dur)
                    handler.postDelayed(this, 250)
                }
            }
        }
        handler.post(progressRunnable!!)
    }

    private fun stopProgressTracker() {
        progressRunnable?.let { handler.removeCallbacks(it) }
        progressRunnable = null
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onDestroy() {
        stopProgressTracker()
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        instance = null
        super.onDestroy()
    }
}
