import { Platform } from "quasar";
import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const isNativeAudio = Boolean(Platform.is.android || Platform.is.mobile);

export interface NativePlayPayload {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  coverUrl?: string | null;
  streamUrl: string;
  startPositionMs?: number;
}

export interface NativeAudioCallbacks {
  onPlaybackState?: (isPlaying: boolean, state: string) => void;
  onProgress?: (positionMs: number, durationMs: number) => void;
  onEnded?: () => void;
  onMediaButtonAction?: (action: string) => void;
  onBackPressed?: () => void;
}

let unlistens: Array<() => void> = [];

export async function initNativeAudio(callbacks: NativeAudioCallbacks): Promise<void> {
  if (!isNativeAudio) return;

  // Clean up any existing listeners
  disposeNativeAudio();

  try {
    // 1. Android Tauri 2 plugin listeners (via addPluginListener -> Kotlin trigger)
    const subState = await addPluginListener<{ isPlaying: boolean; state: string }>(
      "media",
      "media-playback-state",
      (payload) => {
        callbacks.onPlaybackState?.(payload.isPlaying, payload.state);
      }
    ).catch(() => null);
    if (subState) unlistens.push(() => subState.unregister());

    const subProgress = await addPluginListener<{ positionMs: number; durationMs: number }>(
      "media",
      "media-progress",
      (payload) => {
        callbacks.onProgress?.(payload.positionMs, payload.durationMs);
      }
    ).catch(() => null);
    if (subProgress) unlistens.push(() => subProgress.unregister());

    const subEnded = await addPluginListener(
      "media",
      "media-ended",
      () => {
        callbacks.onEnded?.();
      }
    ).catch(() => null);
    if (subEnded) unlistens.push(() => subEnded.unregister());

    const subAction = await addPluginListener<{ action: string }>(
      "media",
      "media-action",
      (payload) => {
        callbacks.onMediaButtonAction?.(payload.action);
      }
    ).catch(() => null);
    if (subAction) unlistens.push(() => subAction.unregister());

    const subBack = await addPluginListener(
      "media",
      "android-back-pressed",
      () => {
        callbacks.onBackPressed?.();
      }
    ).catch(() => null);
    if (subBack) unlistens.push(() => subBack.unregister());

    // 2. Window-level event fallback (via Tauri event.listen)
    const unlistenState = await listen<{ isPlaying: boolean; state: string }>(
      "media-playback-state",
      (event) => {
        callbacks.onPlaybackState?.(event.payload.isPlaying, event.payload.state);
      }
    ).catch(() => null);
    if (unlistenState) unlistens.push(unlistenState);

    const unlistenProgress = await listen<{ positionMs: number; durationMs: number }>(
      "media-progress",
      (event) => {
        callbacks.onProgress?.(event.payload.positionMs, event.payload.durationMs);
      }
    ).catch(() => null);
    if (unlistenProgress) unlistens.push(unlistenProgress);

    const unlistenEnded = await listen("media-ended", () => {
      callbacks.onEnded?.();
    });
    if (unlistenEnded) unlistens.push(unlistenEnded);

    const unlistenAction = await listen<{ action: string }>(
      "media-action",
      (event) => {
        callbacks.onMediaButtonAction?.(event.payload.action);
      }
    ).catch(() => null);
    if (unlistenAction) unlistens.push(unlistenAction);
  } catch (e) {
    console.warn("[nativeAudio] failed to bind event listeners:", e);
  }
}

export function disposeNativeAudio(): void {
  for (const unlisten of unlistens) {
    try {
      unlisten();
    } catch {}
  }
  unlistens = [];
}

export async function nativePlay(payload: NativePlayPayload): Promise<void> {
  if (!isNativeAudio) return;
  await invoke("media_play", {
    payload: {
      id: payload.id,
      title: payload.title,
      artist: payload.artist,
      album: payload.album ?? null,
      coverUrl: payload.coverUrl ?? null,
      streamUrl: payload.streamUrl,
      startPositionMs: payload.startPositionMs ?? 0,
    },
  });
}

export async function nativePause(): Promise<void> {
  if (!isNativeAudio) return;
  await invoke("media_pause");
}

export async function nativeResume(): Promise<void> {
  if (!isNativeAudio) return;
  await invoke("media_resume");
}

export async function nativeSeek(positionSeconds: number): Promise<void> {
  if (!isNativeAudio) return;
  await invoke("media_seek", {
    positionMs: Math.round(positionSeconds * 1000),
  });
}

export async function nativeSetVolume(volume: number): Promise<void> {
  if (!isNativeAudio) return;
  await invoke("media_set_volume", {
    volume: Math.max(0, Math.min(1, volume)),
  });
}

export async function nativeSetPlaybackRate(rate: number): Promise<void> {
  if (!isNativeAudio) return;
  await invoke("media_set_playback_rate", {
    rate: Math.max(0.25, Math.min(3.0, rate)),
  });
}

export async function nativeSetRepeat(mode: string): Promise<void> {
  if (!isNativeAudio) return;
  await invoke("media_set_repeat", { mode });
}

export async function nativeSetFullscreen(open: boolean): Promise<void> {
  if (!isNativeAudio) return;
  await invoke("media_set_fullscreen", { open });
}
