package app.mashiro.client

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.extractor.DefaultExtractorsFactory
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

        @Volatile var cachedIsPlaying: Boolean = false
        @Volatile var cachedPositionMs: Long = 0L
        @Volatile var cachedDurationMs: Long = 0L
        @Volatile var currentRepeatMode: String = "off"

        private var pendingPlay: PlayRequest? = null

        data class PlayRequest(
            val id: String,
            val title: String,
            val artist: String,
            val album: String?,
            val coverUrl: String?,
            val streamUrl: String,
            val startPositionMs: Long
        )

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
            val srv = instance
            if (srv != null) {
                srv.handler.post {
                    srv.playInternal(id, title, artist, album, coverUrl, streamUrl, startPositionMs)
                }
            } else {
                pendingPlay = PlayRequest(id, title, artist, album, coverUrl, streamUrl, startPositionMs)
            }
        }

        fun pause() {
            cachedIsPlaying = false
            val srv = instance ?: return
            srv.handler.post {
                srv.exoPlayer.pause()
            }
        }

        fun resume() {
            cachedIsPlaying = true
            val srv = instance ?: return
            srv.handler.post {
                srv.exoPlayer.play()
            }
        }

        fun seek(positionMs: Long) {
            val pos = positionMs.coerceAtLeast(0L)
            cachedPositionMs = pos
            val srv = instance ?: return
            srv.handler.post {
                val player = srv.exoPlayer
                Log.d(
                    "MashiroMediaService",
                    "seekTo: $pos ms | isSeekable=${player.isCurrentMediaItemSeekable} | duration=${player.duration} | state=${player.playbackState}"
                )
                player.seekTo(pos)
                val dur = if (player.duration > 0) player.duration else cachedDurationMs
                listener?.onProgress(pos, dur)
            }
        }

        fun setRepeatMode(mode: String) {
            currentRepeatMode = mode
            val srv = instance ?: return
            srv.handler.post {
                when (mode) {
                    "one" -> srv.exoPlayer.repeatMode = Player.REPEAT_MODE_ONE
                    else -> srv.exoPlayer.repeatMode = Player.REPEAT_MODE_OFF
                }
            }
        }

        fun setVolume(volume: Float) {
            val srv = instance ?: return
            srv.handler.post {
                srv.exoPlayer.volume = volume.coerceIn(0f, 1f)
            }
        }

        fun setPlaybackRate(rate: Float) {
            val srv = instance ?: return
            srv.handler.post {
                srv.exoPlayer.setPlaybackSpeed(rate)
            }
        }

        fun isPlaying(): Boolean = cachedIsPlaying

        fun getCurrentPosition(): Long = cachedPositionMs

        fun getDuration(): Long = cachedDurationMs
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()

        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("Yandex-Music-API")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(30000)

        val dataSourceFactory = DefaultDataSource.Factory(this, httpDataSourceFactory)

        val extractorsFactory = DefaultExtractorsFactory()
            .setConstantBitrateSeekingEnabled(true)
            .setConstantBitrateSeekingAlwaysEnabled(true)

        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory, extractorsFactory)

        exoPlayer = ExoPlayer.Builder(this)
            .setMediaSourceFactory(mediaSourceFactory)
            .setAudioAttributes(audioAttributes, true)
            .setHandleAudioBecomingNoisy(true)
            .setSeekBackIncrementMs(10000)
            .setSeekForwardIncrementMs(10000)
            .build()

        exoPlayer.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                cachedIsPlaying = isPlaying
                val stateStr = if (isPlaying) "playing" else "paused"
                listener?.onPlaybackStateChanged(isPlaying, stateStr)
                if (isPlaying) {
                    startProgressTracker()
                } else {
                    stopProgressTracker()
                }
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                Log.e("MashiroMediaService", "Playback error for media: " + exoPlayer.currentMediaItem?.mediaId, error)
                listener?.onPlaybackStateChanged(false, "idle")
            }

            override fun onPositionDiscontinuity(
                oldPosition: Player.PositionInfo,
                newPosition: Player.PositionInfo,
                reason: Int
            ) {
                cachedPositionMs = newPosition.positionMs
                val dur = if (exoPlayer.duration > 0) exoPlayer.duration else cachedDurationMs
                Log.d("MashiroMediaService", "onPositionDiscontinuity -> newPos=${newPosition.positionMs}, dur=$dur, reason=$reason")
                listener?.onProgress(newPosition.positionMs, dur)
            }

            override fun onTimelineChanged(timeline: Timeline, reason: Int) {
                val dur = exoPlayer.duration
                if (dur > 0) cachedDurationMs = dur
                Log.d("MashiroMediaService", "onTimelineChanged -> isSeekable=${exoPlayer.isCurrentMediaItemSeekable}, dur=$dur")
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
                        val dur = exoPlayer.duration
                        if (dur > 0) cachedDurationMs = dur
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

        // Handle any pending play request that arrived before service started
        pendingPlay?.let { req ->
            playInternal(req.id, req.title, req.artist, req.album, req.coverUrl, req.streamUrl, req.startPositionMs)
            pendingPlay = null
        }
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

        val parsedUri = when {
            streamUrl.startsWith("/") -> Uri.fromFile(java.io.File(streamUrl))
            streamUrl.startsWith("file://") -> Uri.parse(streamUrl)
            streamUrl.startsWith("asset://localhost/") -> Uri.fromFile(java.io.File(streamUrl.removePrefix("asset://localhost")))
            streamUrl.startsWith("http://asset.localhost/") -> Uri.fromFile(java.io.File(streamUrl.removePrefix("http://asset.localhost")))
            streamUrl.startsWith("https://asset.localhost/") -> Uri.fromFile(java.io.File(streamUrl.removePrefix("https://asset.localhost")))
            else -> Uri.parse(streamUrl)
        }

        val mediaItem = MediaItem.Builder()
            .setMediaId(id)
            .setUri(parsedUri)
            .setMediaMetadata(metadataBuilder.build())
            .build()

        exoPlayer.setMediaItem(mediaItem, startPositionMs)
        when (currentRepeatMode) {
            "one" -> exoPlayer.repeatMode = Player.REPEAT_MODE_ONE
            else -> exoPlayer.repeatMode = Player.REPEAT_MODE_OFF
        }
        cachedPositionMs = startPositionMs
        cachedIsPlaying = true
        exoPlayer.prepare()
        exoPlayer.play()
    }

    private fun startProgressTracker() {
        stopProgressTracker()
        val runnable = object : Runnable {
            override fun run() {
                val player = exoPlayer
                if (player.isPlaying) {
                    val pos = player.currentPosition
                    val dur = player.duration
                    cachedPositionMs = pos
                    val validDur = if (dur > 0) dur else cachedDurationMs
                    if (dur > 0) cachedDurationMs = dur
                    listener?.onProgress(pos, validDur)
                    handler.postDelayed(this, 250)
                }
            }
        }
        progressRunnable = runnable
        handler.post(runnable)
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
