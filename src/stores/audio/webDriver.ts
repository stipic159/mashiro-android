import { audio, cancelFade, resumeAudioContext, safePlay } from "@/lib/audio";
import { useEqualizerStore } from "@/stores/equalizer";
import type { AudioDriver, AudioDriverCallbacks, PlayTrackPayload } from "./driver";

export class WebAudioDriver implements AudioDriver {
  private callbacks: AudioDriverCallbacks = {};

  async init(callbacks: AudioDriverCallbacks): Promise<void> {
    this.callbacks = callbacks;
    audio.onplay = () => {
      resumeAudioContext();
      this.callbacks.onPlaybackState?.(true, "playing");
    };
    audio.onpause = () => {
      this.callbacks.onPlaybackState?.(false, "paused");
    };
    audio.onended = () => {
      this.callbacks.onEnded?.();
    };
    audio.ontimeupdate = () => {
      if (Number.isFinite(audio.currentTime)) {
        this.callbacks.onProgress?.(audio.currentTime, audio.duration || 0);
      }
    };
  }

  async play(payload: PlayTrackPayload): Promise<void> {
    audio.src = payload.streamUrl;
    if (payload.startPositionSeconds && payload.startPositionSeconds > 0) {
      const seekOnce = () => {
        audio.removeEventListener("loadedmetadata", seekOnce);
        try {
          audio.currentTime = payload.startPositionSeconds!;
        } catch {}
      };
      audio.addEventListener("loadedmetadata", seekOnce);
    }
    useEqualizerStore().apply();
    await safePlay();
  }

  async resume(): Promise<void> {
    resumeAudioContext();
    await safePlay();
  }

  async pause(): Promise<void> {
    audio.pause();
  }

  async seek(positionSeconds: number): Promise<void> {
    try {
      audio.currentTime = positionSeconds;
    } catch {}
  }

  async setVolume(volume: number): Promise<void> {
    audio.volume = Math.max(0, Math.min(1, volume));
  }

  async setPlaybackRate(rate: number): Promise<void> {
    audio.playbackRate = rate;
  }

  async setRepeat(mode: string): Promise<void> {
    audio.loop = mode === "one";
  }

  async setFullscreen(_open: boolean): Promise<void> {
    // No-op for web
  }

  dispose(): void {
    cancelFade(0);
    audio.pause();
    audio.src = "";
  }
}
