import type { Track } from "@/api/types";

export interface PlayTrackPayload {
  track: Track;
  streamUrl: string;
  startPositionSeconds?: number;
}

export interface AudioDriverCallbacks {
  onPlaybackState?: (isPlaying: boolean, state: string) => void;
  onProgress?: (positionSeconds: number, durationSeconds: number) => void;
  onEnded?: () => void;
  onMediaButtonAction?: (action: string) => void;
  onBackPressed?: () => void;
}

export interface AudioDriver {
  init(callbacks: AudioDriverCallbacks): Promise<void>;
  play(payload: PlayTrackPayload): Promise<void>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setPlaybackRate(rate: number): Promise<void>;
  setRepeat(mode: string): Promise<void>;
  setFullscreen?(open: boolean): Promise<void>;
  dispose(): void;
}
