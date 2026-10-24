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
let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentIsPlaying = false;

function startPolling(callbacks: NativeAudioCallbacks): void {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!currentIsPlaying) return;
    try {
      const status = await invoke<{
        isPlaying: boolean;
        positionMs: number;
        durationMs: number;
      }>("media_get_status");
      if (status && status.durationMs > 0) {
        callbacks.onProgress?.(status.positionMs, status.durationMs);
        if (
          !status.isPlaying &&
          status.positionMs >= status.durationMs - 600 &&
          status.durationMs > 2000
        ) {
          stopPolling();
          currentIsPlaying = false;
          callbacks.onEnded?.();
        }
      }
    } catch {}
  }, 400);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function initNativeAudio(callbacks: NativeAudioCallbacks): Promise<void> {
  if (!isNativeAudio) return;

  // Clean up any existing listeners
  disposeNativeAudio();

  const handlePlaybackState = (isPlaying: boolean, state: string) => {
    currentIsPlaying = isPlaying;
    if (isPlaying) {
      startPolling(callbacks);
    } else {
      stopPolling();
    }
    callbacks.onPlaybackState?.(isPlaying, state);
  };

  try {
    // 1. Direct DOM CustomEvents from Kotlin WebView evaluateJavascript (most reliable)
    const onDomProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ positionMs: number; durationMs: number }>).detail;
      if (detail && typeof detail.positionMs === "number") {
        callbacks.onProgress?.(detail.positionMs, detail.durationMs);
      }
    };
    window.addEventListener("media-progress", onDomProgress);
    unlistens.push(() => window.removeEventListener("media-progress", onDomProgress));

    const onDomState = (e: Event) => {
      const detail = (e as CustomEvent<{ isPlaying: boolean; state: string }>).detail;
      if (detail) {
        handlePlaybackState(detail.isPlaying, detail.state);
      }
    };
    window.addEventListener("media-playback-state", onDomState);
    unlistens.push(() => window.removeEventListener("media-playback-state", onDomState));

    const onDomEnded = () => {
      currentIsPlaying = false;
      stopPolling();
      callbacks.onEnded?.();
    };
    window.addEventListener("media-ended", onDomEnded);
    unlistens.push(() => window.removeEventListener("media-ended", onDomEnded));

    const onDomAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string }>).detail;
      if (detail?.action) {
        callbacks.onMediaButtonAction?.(detail.action);
      }
    };
    window.addEventListener("media-action", onDomAction);
    unlistens.push(() => window.removeEventListener("media-action", onDomAction));

    const onDomBack = () => {
      callbacks.onBackPressed?.();
    };
    window.addEventListener("android-back-pressed", onDomBack);
    unlistens.push(() => window.removeEventListener("android-back-pressed", onDomBack));

    // 2. Tauri event.listen fallback
    const unlistenState = await listen<{ isPlaying: boolean; state: string }>(
      "media-playback-state",
      (event) => {
        handlePlaybackState(event.payload.isPlaying, event.payload.state);
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
      currentIsPlaying = false;
      stopPolling();
      callbacks.onEnded?.();
    }).catch(() => null);
    if (unlistenEnded) unlistens.push(unlistenEnded);

    const unlistenAction = await listen<{ action: string }>(
      "media-action",
      (event) => {
        callbacks.onMediaButtonAction?.(event.payload.action);
      }
    ).catch(() => null);
    if (unlistenAction) unlistens.push(unlistenAction);

    // 3. Android Tauri 2 plugin listeners fallback (addPluginListener)
    const subState = await addPluginListener<{ isPlaying: boolean; state: string }>(
      "media",
      "media-playback-state",
      (payload) => {
        handlePlaybackState(payload.isPlaying, payload.state);
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
        currentIsPlaying = false;
        stopPolling();
        callbacks.onEnded?.();
      }
    ).catch(() => null);
    if (subEnded) unlistens.push(() => subEnded.unregister());
  } catch (e) {
    console.warn("[nativeAudio] failed to bind event listeners:", e);
  }
}

export function disposeNativeAudio(): void {
  stopPolling();
  currentIsPlaying = false;
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
  currentIsPlaying = true;
}

export async function nativePause(): Promise<void> {
  if (!isNativeAudio) return;
  currentIsPlaying = false;
  stopPolling();
  await invoke("media_pause");
}

export async function nativeResume(): Promise<void> {
  if (!isNativeAudio) return;
  currentIsPlaying = true;
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
