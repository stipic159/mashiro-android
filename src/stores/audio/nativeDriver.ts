import { audio, cancelFade, resumeAudioContext, safePlay } from "@/lib/audio";
import { artistNames } from "@/lib/format";
import {
  disposeNativeAudio,
  initNativeAudio,
  nativePause,
  nativePlay,
  nativePrepareNext,
  nativeResume,
  nativeSeek,
  nativeSetFullscreen,
  nativeSetPlaybackRate,
  nativeSetRepeat,
  nativeSetVolume,
} from "@/lib/nativeAudio";
import { useEqualizerStore } from "@/stores/equalizer";
import type { AudioDriver, AudioDriverCallbacks, PlayTrackPayload } from "./driver";

export class NativeAudioDriver implements AudioDriver {
  private usingHtmlFallback = false;
  private callbacks: AudioDriverCallbacks = {};

  async init(callbacks: AudioDriverCallbacks): Promise<void> {
    this.callbacks = callbacks;

    // 1. Setup native event callbacks from Kotlin ExoPlayer
    await initNativeAudio({
      onPlaybackState: (isPlaying, state) => {
        if (!this.usingHtmlFallback) {
          callbacks.onPlaybackState?.(isPlaying, state);
        }
      },
      onProgress: (posMs, durMs) => {
        if (!this.usingHtmlFallback) {
          callbacks.onProgress?.(posMs / 1000, durMs / 1000);
        }
      },
      onEnded: () => {
        if (!this.usingHtmlFallback) {
          callbacks.onEnded?.();
        }
      },
      onMediaButtonAction: callbacks.onMediaButtonAction,
      onBackPressed: callbacks.onBackPressed,
      onTrackTransition: callbacks.onTrackTransition,
    });

    // 2. Setup HTML5 audio listeners for fallback mode
    audio.onplay = () => {
      if (this.usingHtmlFallback) {
        resumeAudioContext();
        this.callbacks.onPlaybackState?.(true, "playing");
      }
    };
    audio.onpause = () => {
      if (this.usingHtmlFallback) {
        this.callbacks.onPlaybackState?.(false, "paused");
      }
    };
    audio.onended = () => {
      if (this.usingHtmlFallback) {
        this.callbacks.onEnded?.();
      }
    };
    audio.ontimeupdate = () => {
      if (this.usingHtmlFallback && Number.isFinite(audio.currentTime)) {
        this.callbacks.onProgress?.(audio.currentTime, audio.duration || 0);
      }
    };
  }

  async play(payload: PlayTrackPayload): Promise<void> {
    const { track, streamUrl, fallbackUrl, startPositionSeconds } = payload;
    try {
      this.usingHtmlFallback = false;
      audio.pause();
      await nativePlay({
        id: track.id,
        title: track.title,
        artist: artistNames(track.artists),
        album: track.album_title || null,
        coverUrl: track.cover_url || null,
        streamUrl,
        startPositionMs: startPositionSeconds ? Math.round(startPositionSeconds * 1000) : 0,
      });
    } catch (nativeErr) {
      console.warn(
        "[NativeAudioDriver] nativePlay failed, seamlessly falling back to HTML5 audio:",
        nativeErr,
      );
      this.usingHtmlFallback = true;
      audio.src = fallbackUrl || streamUrl;
      if (startPositionSeconds && startPositionSeconds > 0) {
        if (audio.readyState >= 1) {
          try {
            audio.currentTime = startPositionSeconds;
          } catch {}
        } else {
          const seekOnce = () => {
            audio.removeEventListener("loadedmetadata", seekOnce);
            try {
              audio.currentTime = startPositionSeconds;
            } catch {}
          };
          audio.addEventListener("loadedmetadata", seekOnce);
        }
      }
      useEqualizerStore().apply();
      await safePlay();
    }
  }

  async prepareNext(payload: PlayTrackPayload): Promise<void> {
    if (this.usingHtmlFallback) return;
    const { track, streamUrl } = payload;
    try {
      await nativePrepareNext({
        id: track.id,
        title: track.title,
        artist: artistNames(track.artists),
        album: track.album_title || null,
        coverUrl: track.cover_url || null,
        streamUrl,
      });
    } catch (e) {
      console.warn("[NativeAudioDriver] prepareNext failed:", e);
    }
  }

  async resume(): Promise<void> {
    if (this.usingHtmlFallback) {
      resumeAudioContext();
      await safePlay();
    } else {
      await nativeResume();
    }
  }

  async pause(): Promise<void> {
    if (this.usingHtmlFallback) {
      audio.pause();
    } else {
      await nativePause();
    }
  }

  async seek(positionSeconds: number): Promise<void> {
    if (this.usingHtmlFallback) {
      try {
        audio.currentTime = positionSeconds;
      } catch {}
    } else {
      await nativeSeek(positionSeconds);
    }
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.usingHtmlFallback) {
      audio.volume = clamped;
    } else {
      await nativeSetVolume(clamped);
    }
  }

  async setPlaybackRate(rate: number): Promise<void> {
    if (this.usingHtmlFallback) {
      audio.playbackRate = rate;
    } else {
      await nativeSetPlaybackRate(rate);
    }
  }

  async setRepeat(mode: string): Promise<void> {
    if (this.usingHtmlFallback) {
      audio.loop = mode === "one";
    } else {
      await nativeSetRepeat(mode);
    }
  }

  async setFullscreen(open: boolean): Promise<void> {
    await nativeSetFullscreen(open);
  }

  dispose(): void {
    disposeNativeAudio();
    cancelFade(0);
    audio.onplay = null;
    audio.onpause = null;
    audio.onended = null;
    audio.ontimeupdate = null;
    audio.pause();
    audio.src = "";
    this.usingHtmlFallback = false;
  }
}
