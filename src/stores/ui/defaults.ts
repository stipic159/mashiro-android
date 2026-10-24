import type {
  PlayerButtonId,
  PlayerButtonSlots,
} from "./playerButtons";
import {
  defaultPlayerButtonSlots,
  playerButtonOrder,
} from "./playerButtons";
import type { ThemeName } from "./themes";

export type Density = "compact" | "comfortable" | "spacious";
export type CoverStyle = "square" | "soft" | "rounded";
export type AutoWaveSource = "playlist" | "personal";

export type LyricsSource = "auto" | "lrclib" | "genius" | "yandex";

export type LyricsFont = "sans" | "serif" | "mono" | "custom";
export type LyricsAlign = "left" | "center" | "right";
export type LyricsBackdrop = "cover" | "gradient" | "solid";
export type LyricsHighlight = "white" | "accent" | "karaoke";
export type LyricsAnnotationMark = "off" | "underline" | "dot" | "tint";
export type LyricsTranslateMode = "under" | "replace";
// Что делать с треками, помеченными как AI-генерация.
export type AiTrackAction = "none" | "skip" | "dislike";

export interface InterfaceSettings {
  theme: ThemeName;
  accent: string;
  customBackground: string;
  customSurface: string;
  customSurface2: string;
  customText: string;
  radius: number;
  density: Density;
  sidebarWidth: number;
  searchWidth: number;
  pagePadding: number;
  cardSize: number;
  textScale: number;
  coverStyle: CoverStyle;
  glass: boolean;
  glassBlur: number;
  animations: boolean;
  thinScrollbar: boolean;
  showPlaylistCovers: boolean;
  showPlayerArtwork: boolean;
  playerButtons: PlayerButtonSlots;
  playerOrder: PlayerButtonId[];
  playerHeight: number;
  playerCoverSize: number;
  playerIconSize: number;
  playerGap: number;
  playerSidePadding: number;
  playerProgressWidth: number;
  playerProgressThickness: number;
  playerShowTimes: boolean;
  playerEditMode: boolean;
  playerMetaWidth: number;
  playerVisualizer: boolean;
  lyricsFontSize: number;
  lyricsLineHeight: number;
  lyricsWeight: number;
  lyricsFont: LyricsFont;
  lyricsFontCustom: string;
  lyricsBackgroundBlur: number;
  lyricsBackgroundOpacity: number;
  lyricsLineBlur: number;
  lyricsInactive: number;
  lyricsAlign: LyricsAlign;
  lyricsBackdrop: LyricsBackdrop;
  lyricsHighlight: LyricsHighlight;
  lyricsKaraokeWord: boolean;
  lyricsGlow: boolean;
  lyricsShowArtwork: boolean;
  lyricsMotion: boolean;
  lyricsVisualizer: boolean;
  lyricsShowCredits: boolean;
  lyricsShowOrigin: boolean;
  lyricsAnnotations: boolean;
  lyricsAnnotationMark: LyricsAnnotationMark;
  lyricsSource: LyricsSource;
  lyricsTranslate: boolean;
  lyricsTranslateTarget: string;
  lyricsTranslateMode: LyricsTranslateMode;
  togetherShowDock: boolean;
  cacheEnabled: boolean;
  downloadDir: string;
  autoSkipDisliked: boolean;
  preferLocalFiles: boolean;
  crossfadeEnabled: boolean;
  crossfadeSeconds: number;
  gaplessEnabled: boolean;
  normalizeVolume: boolean;
  trimSilence: boolean;
  autoWaveOnQueueEnd: boolean;
  autoWaveSource: AutoWaveSource;
  repeatPlaylistAlways: boolean;
  censorBypass: boolean;
  censorBadge: boolean;
  aiTrackAction: AiTrackAction;
  resumeLastSession: boolean;
  resumeAutoplay: boolean;
}

export const defaultInterfaceSettings: InterfaceSettings = {
  theme: "black",
  accent: "#fa2d48",
  customBackground: "#09090b",
  customSurface: "#151518",
  customSurface2: "#1c1c20",
  customText: "#f5f5f7",
  radius: 12,
  density: "comfortable",
  sidebarWidth: 236,
  searchWidth: 360,
  pagePadding: 40,
  cardSize: 150,
  textScale: 100,
  coverStyle: "soft",
  glass: true,
  glassBlur: 24,
  animations: true,
  thinScrollbar: false,
  showPlaylistCovers: true,
  showPlayerArtwork: true,
  playerButtons: { ...defaultPlayerButtonSlots },
  playerOrder: [...playerButtonOrder],
  playerHeight: 78,
  playerCoverSize: 48,
  playerIconSize: 18,
  playerGap: 6,
  playerSidePadding: 16,
  playerProgressWidth: 100,
  playerProgressThickness: 4,
  playerShowTimes: true,
  playerEditMode: false,
  playerMetaWidth: 260,
  playerVisualizer: true,
  lyricsFontSize: 36,
  lyricsLineHeight: 1.18,
  lyricsWeight: 700,
  lyricsFont: "sans",
  lyricsFontCustom: "",
  lyricsBackgroundBlur: 38,
  lyricsBackgroundOpacity: 48,
  lyricsLineBlur: 2.5,
  lyricsInactive: 32,
  lyricsAlign: "left",
  lyricsBackdrop: "cover",
  lyricsHighlight: "white",
  lyricsKaraokeWord: true,
  lyricsGlow: true,
  lyricsShowArtwork: true,
  lyricsMotion: true,
  lyricsVisualizer: true,
  lyricsShowCredits: true,
  lyricsShowOrigin: true,
  lyricsAnnotations: true,
  lyricsAnnotationMark: "underline",
  lyricsSource: "auto",
  lyricsTranslate: false,
  lyricsTranslateTarget: "ru",
  lyricsTranslateMode: "under",
  togetherShowDock: true,
  cacheEnabled: true,
  downloadDir: "",
  autoSkipDisliked: true,
  preferLocalFiles: true,
  crossfadeEnabled: true,
  crossfadeSeconds: 4,
  gaplessEnabled: false,
  normalizeVolume: false,
  trimSilence: false,
  autoWaveOnQueueEnd: true,
  autoWaveSource: "playlist",
  repeatPlaylistAlways: false,
  censorBypass: true,
  censorBadge: true,
  aiTrackAction: "none",
  resumeLastSession: true,
  resumeAutoplay: true,
};
