import { artistNames } from "@/lib/format";
import {
  disposeNativeAudio,
  initNativeAudio,
  nativePause,
  nativePlay,
  nativeResume,
  nativeSeek,
  nativeSetFullscreen,
  nativeSetPlaybackRate,
  nativeSetRepeat,
  nativeSetVolume,
} from "@/lib/nativeAudio";
import type { AudioDriver, AudioDriverCallbacks, PlayTrackPayload } from "./driver";

export class NativeAudioDriver implements AudioDriver {
  async init(callbacks: AudioDriverCallbacks): Promise<void> {
    await initNativeAudio({
      onPlaybackState: callbacks.onPlaybackState,
      onProgress: (posMs, durMs) => {
        callbacks.onProgress?.(posMs / 1000, durMs / 1000);
      },
      onEnded: callbacks.onEnded,
      onMediaButtonAction: callbacks.onMediaButtonAction,
      onBackPressed: callbacks.onBackPressed,
    });
  }

  async play(payload: PlayTrackPayload): Promise<void> {
    const { track, streamUrl, startPositionSeconds } = payload;
    await nativePlay({
      id: track.id,
      title: track.title,
      artist: artistNames(track.artists),
      album: track.album_title || null,
      coverUrl: track.cover_url || null,
      streamUrl,
      startPositionMs: startPositionSeconds ? Math.round(startPositionSeconds * 1000) : 0,
    });
  }

  async resume(): Promise<void> {
    await nativeResume();
  }

  async pause(): Promise<void> {
    await nativePause();
  }

  async seek(positionSeconds: number): Promise<void> {
    await nativeSeek(positionSeconds);
  }

  async setVolume(volume: number): Promise<void> {
    await nativeSetVolume(volume);
  }

  async setPlaybackRate(rate: number): Promise<void> {
    await nativeSetPlaybackRate(rate);
  }

  async setRepeat(mode: string): Promise<void> {
    await nativeSetRepeat(mode);
  }

  async setFullscreen(open: boolean): Promise<void> {
    await nativeSetFullscreen(open);
  }

  dispose(): void {
    disposeNativeAudio();
  }
}
