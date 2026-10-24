import type { Lyrics, Quality, Track } from "@/api/types";
import type { LyricsSource } from "@/stores/ui/defaults";

export type RepeatMode = "off" | "all" | "one";
export type LyricsOrigin = "yandex" | "lrclib" | "genius";

export interface PlayerState {
  queue: Track[];
  sourceQueue: Track[];
  index: number;
  current: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  quality: Quality;
  playbackRate: number;
  repeat: RepeatMode;
  shuffle: boolean;
  currentCodec: string | null;
  currentBitrate: number | null;
  currentSource: string | null;
  playingLocal: boolean;
  censorReplaced: boolean;
  censorAvailable: boolean;
  loading: boolean;
  waveBatchId: string | null;
  waveSessionId: string | null;
  isWave: boolean;
  stationId: string | null;
  stationName: string | null;
  fetchingMore: boolean;
  seenIds: string[];
  lyrics: Lyrics | null;
  lyricsLoading: boolean;
  lyricsError: string | null;
  lyricsOrigin: LyricsOrigin | null;
  lyricsPick: LyricsSource | null;
  lyricsTranslation: string[] | null;
  lyricsTranslateKey: string | null;
  lyricsTranslateLoading: boolean;
  showLyrics: boolean;
  lyricsFullscreen: boolean;
  fullscreen: boolean;
  waveError: string | null;
  pendingResume: boolean;
}

export function createInitialPlayerState(): PlayerState {
  return {
    queue: [],
    sourceQueue: [],
    index: -1,
    current: null,
    isPlaying: false,
    progress: 0,
    duration: 0,
    volume: 1,
    muted: false,
    quality: "lossless",
    playbackRate: 1,
    repeat: "off",
    shuffle: false,
    currentCodec: null,
    currentBitrate: null,
    currentSource: null,
    playingLocal: false,
    censorReplaced: false,
    censorAvailable: false,
    loading: false,
    waveBatchId: null,
    waveSessionId: null,
    isWave: false,
    stationId: null,
    stationName: null,
    fetchingMore: false,
    seenIds: [],
    lyrics: null,
    lyricsLoading: false,
    lyricsError: null,
    lyricsOrigin: null,
    lyricsPick: null,
    lyricsTranslation: null,
    lyricsTranslateKey: null,
    lyricsTranslateLoading: false,
    showLyrics: false,
    lyricsFullscreen: false,
    fullscreen: false,
    waveError: null,
    pendingResume: false,
  };
}
