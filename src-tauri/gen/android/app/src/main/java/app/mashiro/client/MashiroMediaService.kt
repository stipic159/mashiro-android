package app.mashiro.client

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.MediaStyleNotificationHelper
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import coil.Coil
import coil.request.ImageRequest
import java.io.ByteArrayOutputStream

class MashiroMediaService : MediaSessionService() {

    private var mediaSession: MediaSession? = null
    private lateinit var exoPlayer: ExoPlayer
    private val handler = Handler(Looper.getMainLooper())
    private var progressRunnable: Runnable? = null

    private var currentTitle: String = ""
    private var currentArtist: String = ""
    private var currentAlbum: String? = null
    private var currentCoverBitmap: Bitmap? = null

    companion object {
        private const val TAG = "MashiroMediaService"
        private const val CHANNEL_ID = "mashiro_playback_channel_v2"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_PREV = "app.mashiro.client.ACTION_PREV"
        const val ACTION_NEXT = "app.mashiro.client.ACTION_NEXT"
        const val ACTION_TOGGLE = "app.mashiro.client.ACTION_TOGGLE"
        const val ACTION_STOP = "app.mashiro.client.ACTION_STOP"

        var instance: MashiroMediaService? = null
            private set

        private var listenerRef: java.lang.ref.WeakReference<MediaEventListener>? = null

        var listener: MediaEventListener?
            get() = listenerRef?.get()
            set(value) {
                listenerRef = if (value != null) java.lang.ref.WeakReference(value) else null
            }

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
            fun onMediaItemTransition(mediaId: String, reason: Int)
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

        fun prepareNext(
            id: String,
            title: String,
            artist: String,
            album: String?,
            coverUrl: String?,
            streamUrl: String
        ) {
            val srv = instance ?: return
            srv.handler.post {
                srv.prepareNextInternal(id, title, artist, album, coverUrl, streamUrl)
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
                    TAG,
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

        fun getAudioSessionId(): Int {
            val srv = instance ?: return C.AUDIO_SESSION_ID_UNSET
            return try {
                srv.exoPlayer.audioSessionId
            } catch (_: Exception) {
                C.AUDIO_SESSION_ID_UNSET
            }
        }

        @Volatile private var downloadCache: SimpleCache? = null

        @Synchronized
        fun getCache(context: Context): SimpleCache {
            var cache = downloadCache
            if (cache == null) {
                val cacheDir = java.io.File(context.cacheDir, "mashiro_audio_cache")
                val evictor = LeastRecentlyUsedCacheEvictor(1024L * 1024L * 1024L) // 1 GB LRU Cache
                val databaseProvider = StandaloneDatabaseProvider(context)
                cache = SimpleCache(cacheDir, evictor, databaseProvider)
                downloadCache = cache
            }
            return cache
        }

        fun getAudioCacheSizeBytes(): Long {
            return downloadCache?.cacheSpace ?: 0L
        }

        fun clearAudioCache(context: Context) {
            try {
                val cache = downloadCache
                if (cache != null) {
                    for (key in cache.keys) {
                        cache.removeResource(key)
                    }
                } else {
                    val cacheDir = java.io.File(context.cacheDir, "mashiro_audio_cache")
                    cacheDir.deleteRecursively()
                }
            } catch (e: Exception) {
                Log.e(TAG, "clearAudioCache error", e)
            }
        }
    }

    private class MediaForwardingPlayer(
        player: Player,
        private val onNext: () -> Unit,
        private val onPrev: () -> Unit
    ) : ForwardingPlayer(player) {

        override fun getAvailableCommands(): Player.Commands {
            return super.getAvailableCommands().buildUpon()
                .add(Player.COMMAND_SEEK_TO_NEXT)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                .build()
        }

        override fun isCommandAvailable(command: Int): Boolean {
            return when (command) {
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> true
                else -> super.isCommandAvailable(command)
            }
        }

        override fun hasNextMediaItem(): Boolean = true

        override fun hasPreviousMediaItem(): Boolean = true

        override fun seekToNext() {
            onNext()
        }

        override fun seekToPrevious() {
            onPrev()
        }

        override fun seekToNextMediaItem() {
            onNext()
        }

        override fun seekToPreviousMediaItem() {
            onPrev()
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        createNotificationChannel()

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()

        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("Yandex-Music-API")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(30000)

        val upstreamDataSourceFactory = DefaultDataSource.Factory(this, httpDataSourceFactory)

        val simpleCache = getCache(this)
        val cacheDataSourceFactory = CacheDataSource.Factory()
            .setCache(simpleCache)
            .setUpstreamDataSourceFactory(upstreamDataSourceFactory)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

        val extractorsFactory = DefaultExtractorsFactory()
            .setConstantBitrateSeekingEnabled(true)
            .setConstantBitrateSeekingAlwaysEnabled(true)

        val mediaSourceFactory = DefaultMediaSourceFactory(cacheDataSourceFactory, extractorsFactory)

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
                updateNotification(isPlaying)
                if (isPlaying) {
                    startProgressTracker()
                } else {
                    stopProgressTracker()
                }
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                Log.e(TAG, "Playback error for media: " + exoPlayer.currentMediaItem?.mediaId, error)
                listener?.onPlaybackStateChanged(false, "idle")
                updateNotification(false)
            }

            override fun onPositionDiscontinuity(
                oldPosition: Player.PositionInfo,
                newPosition: Player.PositionInfo,
                reason: Int
            ) {
                cachedPositionMs = newPosition.positionMs
                val dur = if (exoPlayer.duration > 0) exoPlayer.duration else cachedDurationMs
                Log.d(TAG, "onPositionDiscontinuity -> newPos=${newPosition.positionMs}, dur=$dur, reason=$reason")
                listener?.onProgress(newPosition.positionMs, dur)
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                if (mediaItem == null) return
                cachedPositionMs = 0L
                currentTitle = mediaItem.mediaMetadata.title?.toString() ?: ""
                currentArtist = mediaItem.mediaMetadata.artist?.toString() ?: ""
                currentAlbum = mediaItem.mediaMetadata.albumTitle?.toString()
                updateNotification(exoPlayer.isPlaying)

                val coverUri = mediaItem.mediaMetadata.artworkUri?.toString()
                if (!coverUri.isNullOrEmpty()) {
                    loadCoverArtwork(mediaItem.mediaId, coverUri)
                }

                Log.d(TAG, "onMediaItemTransition -> id=${mediaItem.mediaId}, reason=$reason, title=$currentTitle")
                listener?.onMediaItemTransition(mediaItem.mediaId, reason)
            }

            override fun onTimelineChanged(timeline: Timeline, reason: Int) {
                val dur = exoPlayer.duration
                if (dur > 0) cachedDurationMs = dur
                Log.d(TAG, "onTimelineChanged -> isSeekable=${exoPlayer.isCurrentMediaItemSeekable}, dur=$dur")
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_ENDED -> {
                        cachedIsPlaying = false
                        stopProgressTracker()
                        listener?.onPlaybackStateChanged(false, "ended")
                        listener?.onTrackEnded()
                        updateNotification(false)
                    }
                    Player.STATE_BUFFERING -> {
                        listener?.onPlaybackStateChanged(exoPlayer.isPlaying, "buffering")
                    }
                    Player.STATE_READY -> {
                        val dur = exoPlayer.duration
                        if (dur > 0) cachedDurationMs = dur
                        val stateStr = if (exoPlayer.isPlaying) "playing" else "paused"
                        listener?.onPlaybackStateChanged(exoPlayer.isPlaying, stateStr)
                        updateNotification(exoPlayer.isPlaying)
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

        val forwardingPlayer = MediaForwardingPlayer(
            exoPlayer,
            onNext = { listener?.onMediaButtonAction("next") },
            onPrev = { listener?.onMediaButtonAction("prev") }
        )

        mediaSession = MediaSession.Builder(this, forwardingPlayer)
            .setSessionActivity(pendingIntent)
            .setCallback(object : MediaSession.Callback {
                override fun onConnect(
                    session: MediaSession,
                    controller: MediaSession.ControllerInfo
                ): MediaSession.ConnectionResult {
                    val connectionResult = super.onConnect(session, controller)
                    val sessionCommands = connectionResult.availableSessionCommands.buildUpon()
                        .add(SessionCommand("ACTION_LIKE", Bundle.EMPTY))
                        .add(SessionCommand("ACTION_NEXT", Bundle.EMPTY))
                        .add(SessionCommand("ACTION_PREV", Bundle.EMPTY))
                        .build()
                    val playerCommands = connectionResult.availablePlayerCommands.buildUpon()
                        .add(Player.COMMAND_SEEK_TO_NEXT)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                        .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                        .build()
                    return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                        .setAvailableSessionCommands(sessionCommands)
                        .setAvailablePlayerCommands(playerCommands)
                        .build()
                }

                @Suppress("DEPRECATION")
                override fun onPlayerCommandRequest(
                    session: MediaSession,
                    controller: MediaSession.ControllerInfo,
                    playerCommand: Int
                ): Int {
                    when (playerCommand) {
                        Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> {
                            listener?.onMediaButtonAction("next")
                            return SessionResult.RESULT_SUCCESS
                        }
                        Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> {
                            listener?.onMediaButtonAction("prev")
                            return SessionResult.RESULT_SUCCESS
                        }
                    }
                    return super.onPlayerCommandRequest(session, controller, playerCommand)
                }

                override fun onCustomCommand(
                    session: MediaSession,
                    controller: MediaSession.ControllerInfo,
                    customCommand: SessionCommand,
                    args: Bundle
                ): com.google.common.util.concurrent.ListenableFuture<SessionResult> {
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

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PREV -> listener?.onMediaButtonAction("prev")
            ACTION_NEXT -> listener?.onMediaButtonAction("next")
            ACTION_TOGGLE -> {
                if (exoPlayer.isPlaying) {
                    pause()
                } else {
                    resume()
                }
            }
            ACTION_STOP -> {
                pause()
            }
        }
        return super.onStartCommand(intent, flags, startId)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.app_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Mashiro Music Playback"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun updateNotification(isPlaying: Boolean) {
        val session = mediaSession ?: return
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val prevIntent = Intent(this, MashiroMediaService::class.java).apply { action = ACTION_PREV }
        val prevPending = PendingIntent.getService(this, 1, prevIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        val toggleIntent = Intent(this, MashiroMediaService::class.java).apply { action = ACTION_TOGGLE }
        val togglePending = PendingIntent.getService(this, 2, toggleIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        val nextIntent = Intent(this, MashiroMediaService::class.java).apply { action = ACTION_NEXT }
        val nextPending = PendingIntent.getService(this, 3, nextIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPending = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(currentTitle.ifEmpty { getString(R.string.app_name) })
            .setContentText(currentArtist)
            .setContentIntent(contentPending)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(isPlaying)
            .addAction(R.drawable.ic_prev, "Previous", prevPending)
            .addAction(
                if (isPlaying) R.drawable.ic_pause else R.drawable.ic_play,
                if (isPlaying) "Pause" else "Play",
                togglePending
            )
            .addAction(R.drawable.ic_next, "Next", nextPending)
            .setStyle(
                MediaStyleNotificationHelper.MediaStyle(session)
                    .setShowActionsInCompactView(0, 1, 2)
            )

        if (currentCoverBitmap != null) {
            builder.setLargeIcon(currentCoverBitmap)
        }

        val notification = builder.build()

        try {
            if (isPlaying) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            } else {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_DETACH)
                }
                notificationManager.notify(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error updating notification: ${e.message}", e)
        }
    }

    private fun buildMediaItem(
        id: String,
        title: String,
        artist: String,
        album: String?,
        coverUrl: String?,
        streamUrl: String
    ): MediaItem {
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

        return MediaItem.Builder()
            .setMediaId(id)
            .setUri(parsedUri)
            .setMediaMetadata(metadataBuilder.build())
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
        currentTitle = title
        currentArtist = artist
        currentAlbum = album
        currentCoverBitmap = null

        if (!coverUrl.isNullOrEmpty()) {
            loadCoverArtwork(id, coverUrl)
        }

        val mediaItem = buildMediaItem(id, title, artist, album, coverUrl, streamUrl)

        exoPlayer.setMediaItem(mediaItem, startPositionMs)
        when (currentRepeatMode) {
            "one" -> exoPlayer.repeatMode = Player.REPEAT_MODE_ONE
            else -> exoPlayer.repeatMode = Player.REPEAT_MODE_OFF
        }
        cachedPositionMs = startPositionMs
        cachedIsPlaying = true
        exoPlayer.prepare()
        exoPlayer.play()
        updateNotification(true)
    }

    private fun prepareNextInternal(
        id: String,
        title: String,
        artist: String,
        album: String?,
        coverUrl: String?,
        streamUrl: String
    ) {
        // Avoid re-queueing if current item is already this ID
        if (exoPlayer.currentMediaItem?.mediaId == id) return

        // Avoid re-queueing if next item in playlist is already this ID
        if (exoPlayer.mediaItemCount > 1 && exoPlayer.getMediaItemAt(1).mediaId == id) return

        // Remove any previously queued upcoming item
        while (exoPlayer.mediaItemCount > 1) {
            exoPlayer.removeMediaItem(1)
        }

        val nextItem = buildMediaItem(id, title, artist, album, coverUrl, streamUrl)
        exoPlayer.addMediaItem(nextItem)
        Log.d(TAG, "Gapless prepareNext queued: $title ($id), total items: ${exoPlayer.mediaItemCount}")
    }

    private fun loadCoverArtwork(id: String, coverUrl: String) {
        val coverData: Any = when {
            coverUrl.startsWith("asset://localhost/") -> java.io.File(coverUrl.removePrefix("asset://localhost"))
            coverUrl.startsWith("http://asset.localhost/") -> java.io.File(coverUrl.removePrefix("http://asset.localhost"))
            coverUrl.startsWith("https://asset.localhost/") -> java.io.File(coverUrl.removePrefix("https://asset.localhost"))
            coverUrl.startsWith("/") -> java.io.File(coverUrl)
            else -> coverUrl
        }

        val imageLoader = Coil.imageLoader(this)
        val request = ImageRequest.Builder(this)
            .data(coverData)
            .allowHardware(false)
            .size(512, 512)
            .target(
                onSuccess = { drawable ->
                    val bitmap = (drawable as? BitmapDrawable)?.bitmap ?: return@target
                    currentCoverBitmap = bitmap

                    val stream = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.PNG, 90, stream)
                    val byteArray = stream.toByteArray()

                    handler.post {
                        val currentItem = exoPlayer.currentMediaItem
                        if (currentItem != null && currentItem.mediaId == id) {
                            val updatedMetadata = currentItem.mediaMetadata.buildUpon()
                                .setArtworkData(byteArray, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
                                .build()
                            val updatedItem = currentItem.buildUpon()
                                .setMediaMetadata(updatedMetadata)
                                .build()
                            exoPlayer.replaceMediaItem(exoPlayer.currentMediaItemIndex, updatedItem)
                            updateNotification(exoPlayer.isPlaying)
                        }
                    }
                }
            )
            .build()
        imageLoader.enqueue(request)
    }

    private fun startProgressTracker() {
        stopProgressTracker()
        val runnable = object : Runnable {
            override fun run() {
                val srv = instance ?: return
                if (!srv::exoPlayer.isInitialized) return
                val player = srv.exoPlayer
                val isPlaying = player.isPlaying || (player.playWhenReady && player.playbackState == Player.STATE_READY)
                val pos = player.currentPosition
                val dur = player.duration
                cachedPositionMs = pos
                val validDur = if (dur > 0) dur else cachedDurationMs
                if (dur > 0) cachedDurationMs = dur
                if (isPlaying || cachedIsPlaying) {
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
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(NOTIFICATION_ID)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            }
        } catch (_: Exception) {}

        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        instance = null
        super.onDestroy()
    }
}
