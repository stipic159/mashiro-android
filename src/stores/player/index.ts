import { watch } from "vue";
import { defineStore } from "pinia";
import { Notify } from "quasar";
import { api } from "@/api/client";
import type { Quality, RepeatMode, Track } from "@/api/types";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  clearWarm,
  isCurrentToken,
  nextSourceToken,
  resetNormalization,
  setNormalization,
  warmNext,
} from "@/lib/audio";
import {
  bindMediaSession,
  mediaSessionAvailable,
  setMediaSessionEnabled,
  updateMediaMetadata,
  updatePlaybackState,
  updatePositionState,
} from "@/lib/mediaSession";
import { releaseMemoryCache } from "@/lib/cache";
import { proxyStream } from "@/lib/stream";
import {
  censorUrl,
  ensureCensorList,
  prefersOriginal,
  setPrefersOriginal,
} from "@/lib/censor";
import { overrideUrl } from "@/lib/censorOverrides";
import { createLogger, logQuality } from "@/lib/log";
import { useLibraryStore } from "@/stores/library";
import { useSleepStore } from "@/stores/sleep";
import { useStatsStore } from "@/stores/stats";
import { useTogetherStore } from "@/stores/together/index";
import type { LyricsSource } from "@/stores/ui/defaults";
import { useUiStore } from "@/stores/ui/index";
import { getAudioDriver } from "@/stores/audio";
import { loadSession, saveSession } from "./session";
import type { PlaybackSettings } from "./settings";
import { loadPlaybackSettings, savePlaybackSettings } from "./settings";
import type { PlayerState } from "./state";
import { createInitialPlayerState } from "./state";
import {
  dedupeQueue as dedupeQueueHelper,
  dedupeTracks,
  removeFromQueue as removeFromQueueHelper,
  shuffleQueue,
  unshuffleQueue,
} from "./queue";
import {
  DEFAULT_STATION,
  fetchInitialWaveTracks,
  fetchMoreWaveTracks,
  rememberSeenTracks,
  rescueWaveTracks,
} from "./wave";
import { fetchLyricsTranslation, fetchTrackLyrics } from "./lyrics";

const log = createLogger("player");

interface PrefetchEntry {
  url: string;
  rawUrl?: string;
  codec: string | null;
  bitrate: number | null;
  local: boolean;
  censored: boolean;
  source: string;
}

const prefetched = new Map<string, PrefetchEntry>();
const PREFETCH_LIMIT = 4;

function rememberPrefetch(id: string, entry: PrefetchEntry): void {
  prefetched.delete(id);
  prefetched.set(id, entry);
  while (prefetched.size > PREFETCH_LIMIT) {
    const oldest = prefetched.keys().next().value;
    if (oldest === undefined) break;
    prefetched.delete(oldest);
  }
}

let lastSessionSave = 0;
let lastProgress = 0;
let seekingUntil = 0;
let seekingTarget: number | null = null;
let lastMediaSync = 0;
let mediaBound = false;
let normBound = false;
let translateBound = false;
let skipGuard = 0;
let loadChain: Promise<void> = Promise.resolve();
let navSeq = 0;
let radioStarted = false;

export const usePlayerStore = defineStore("player", {
  state: (): PlayerState => {
    const s = loadPlaybackSettings();
    const initial = createInitialPlayerState();
    return {
      ...initial,
      volume: s.volume,
      muted: s.muted,
      quality: s.quality,
      playbackRate: s.playbackRate,
      repeat: s.repeat,
    };
  },

  getters: {
    hasNext: (s) => {
      if (s.isWave && Boolean(s.current)) return true;
      if (s.index < s.queue.length - 1 || s.repeat === "all") return true;
      if (!s.queue.length) return false;
      const ui = useUiStore().settings;
      return ui.repeatPlaylistAlways || ui.autoWaveOnQueueEnd;
    },
    hasPrev: (s) => s.index > 0,
    waveActive: (s) => s.isWave && Boolean(s.current),
    qualityLabel: (s) => {
      if (!s.currentCodec) return "";
      const codec = s.currentCodec.toUpperCase();
      return s.currentBitrate ? `${codec} ${s.currentBitrate} kbps` : codec;
    },
    activeLine: (s) => {
      const lines = s.lyrics?.lines || [];
      if (!s.lyrics?.synced || !lines.length) return -1;
      const ms = s.progress * 1000;
      let found = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && line.time_ms <= ms + 150) found = i;
        else break;
      }
      return found;
    },
  },

  actions: {
    persist() {
      const payload: PlaybackSettings = {
        volume: this.volume,
        quality: this.quality,
        playbackRate: this.playbackRate,
        repeat: this.repeat,
        muted: this.muted,
      };
      savePlaybackSettings(payload);
    },

    bind() {
      const driver = getAudioDriver();
      void driver.init({
        onPlaybackState: (isPlaying, _state) => {
          this.isPlaying = isPlaying;
          updatePlaybackState(isPlaying, Boolean(this.current));
          updatePositionState(this.duration, this.progress, this.playbackRate);
        },
        onProgress: (posSec, durSec) => {
          if (seekingTarget !== null) {
            if (Math.abs(posSec - seekingTarget) < 2.0 || Date.now() > seekingUntil) {
              seekingTarget = null;
            } else {
              return;
            }
          }
          const previous = lastProgress;
          this.progress = posSec;
          if (durSec > 0 && Number.isFinite(durSec)) {
            this.duration = durSec;
          }
          lastProgress = this.progress;

          const delta = this.progress - previous;
          if (delta > 0 && delta < 6 && this.isPlaying) {
            useStatsStore().tick(delta);
          }

          const now = Date.now();
          if (now - lastSessionSave > 5000) {
            lastSessionSave = now;
            this.persistSession();
          }
        },
        onEnded: () => {
          if (useSleepStore().onTrackEnded()) return;
          if (useTogetherStore().isGuest) return;
          void this.next(true);
        },
        onMediaButtonAction: (action) => {
          if (action === "next") void this.next();
          else if (action === "prev") void this.prev();
          else if (action === "like" && this.current) void this.like();
        },
        onBackPressed: () => {
          if (this.fullscreen) {
            this.fullscreen = false;
          }
        },
      });

      watch(
        () => this.fullscreen,
        (open) => {
          void driver.setFullscreen?.(open);
        },
      );

      if (useUiStore().settings.censorBypass) void ensureCensorList();
      void driver.setVolume(this.muted ? 0 : this.volume);
      void driver.setPlaybackRate(this.playbackRate);

      this.setupMediaSession();

      setNormalization(useUiStore().settings.normalizeVolume);
      if (!normBound) {
        normBound = true;
        watch(
          () => useUiStore().settings.normalizeVolume,
          (on) => setNormalization(on),
        );
      }

      if (!translateBound) {
        translateBound = true;
        watch(
          () => [
            useUiStore().settings.lyricsTranslate,
            useUiStore().settings.lyricsTranslateTarget,
          ],
          () => void this.loadTranslation(true),
        );
      }
    },

    setupMediaSession() {
      if (!mediaSessionAvailable()) return;
      const driver = getAudioDriver();
      const sync = () => {
        setMediaSessionEnabled(true);
        bindMediaSession({
          play: () => {
            if (this.pendingResume) {
              void this.loadCurrent({ startAt: this.progress, autoplay: true });
            } else {
              void driver.resume();
            }
          },
          pause: () => {
            void driver.pause();
          },
          stop: () => {
            void driver.pause();
          },
          next: () => void this.next(),
          prev: () => void this.prev(),
          seekTo: (time) => this.seek(time),
          seekBy: (offset) => this.seek(this.progress + offset),
        });
        updateMediaMetadata(this.current);
        updatePlaybackState(this.isPlaying, Boolean(this.current));
        updatePositionState(this.duration, this.progress, this.playbackRate);
      };
      sync();
      if (!mediaBound) {
        mediaBound = true;
        watch(
          () => [this.current?.id ?? null, this.isPlaying] as const,
          () => sync(),
        );
      }
    },

    persistSession() {
      if (!this.current || !this.queue.length) return;
      saveSession({
        queue: this.queue,
        sourceQueue: this.sourceQueue.length ? this.sourceQueue : this.queue,
        shuffle: this.shuffle,
        index: this.index,
        progress: this.progress,
        isWave: this.isWave,
        stationId: this.stationId,
        stationName: this.stationName,
        waveBatchId: this.waveBatchId,
        savedAt: Date.now(),
      });
    },

    async restoreSession(autoplay: boolean) {
      if (this.current) return false;
      const data = loadSession();
      if (!data) return false;
      const track = data.queue[data.index];
      if (!track) return false;
      this.queue = data.queue;
      this.sourceQueue = data.sourceQueue.length
        ? [...data.sourceQueue]
        : [...data.queue];
      this.shuffle = data.shuffle;
      this.index = data.index;
      this.isWave = data.isWave;
      this.stationId = data.stationId;
      this.stationName = data.stationName;
      this.waveBatchId = data.waveBatchId;
      this.seenIds = data.queue.map((t) => t.id).slice(-2000);
      this.current = track;
      this.duration = (track.duration_ms ?? 0) / 1000;
      this.progress = data.progress;
      this.pendingResume = true;
      updateMediaMetadata(track);
      updatePlaybackState(false, true);
      updatePositionState(this.duration, this.progress, this.playbackRate);
      log.info("session restored", track.title, data.progress);
      if (autoplay) {
        await this.loadCurrent({ startAt: data.progress, autoplay: true });
      }
      if (this.isWave) void this.armWave();
      return true;
    },

    releaseMemory() {
      prefetched.clear();
      void api.clearStreamCache().catch(() => undefined);
      releaseMemoryCache();
      this.lyrics = null;
      this.lyricsOrigin = null;
      this.showLyrics = false;
      this.lyricsFullscreen = false;
      this.fullscreen = false;
      if (this.queue.length > 120) {
        const from = Math.max(0, this.index - 20);
        const slice = this.queue.slice(from, from + 120);
        this.index = Math.max(0, this.index - from);
        this.queue = slice;
        this.sourceQueue = [...slice];
      }
      if (this.seenIds.length > 2000) this.seenIds = this.seenIds.slice(-2000);
      log.info("memory released");
    },

    remember(tracks: Track[]) {
      this.seenIds = rememberSeenTracks(this.seenIds, tracks);
    },

    async startWave(stationId?: string, stationName?: string) {
      this.loading = true;
      this.waveError = null;
      const station = stationId ?? this.stationId ?? DEFAULT_STATION;
      if (station !== this.stationId) this.seenIds = [];
      try {
        await api
          .sendFeedback({ type: "radioStarted", station_id: station })
          .catch(() => undefined);
        radioStarted = true;

        const { tracks, batchId, sessionId } = await fetchInitialWaveTracks(
          station,
          this.seenIds,
        );

        this.stationId = station;
        if (stationName) this.stationName = stationName;
        else if (station === DEFAULT_STATION) this.stationName = "Моя волна";
        this.waveBatchId = batchId;
        this.waveSessionId = sessionId;
        this.queue = [...tracks];
        this.sourceQueue = [...tracks];
        this.shuffle = false;
        this.remember(tracks);
        this.index = 0;
        this.isWave = true;
        await this.loadCurrent();
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Не удалось запустить волну";
        this.waveError = message;
        Notify.create({ type: "negative", message });
      } finally {
        this.loading = false;
      }
    },

    async playQueue(
      tracks: Track[],
      startIndex = 0,
      opts?: { wave?: boolean; batchId?: string | null },
    ) {
      this.sourceQueue = [...tracks];
      this.queue = [...tracks];
      this.shuffle = false;
      this.index = startIndex;
      this.isWave = opts?.wave ?? false;
      this.waveBatchId = opts?.batchId ?? null;
      radioStarted = false;
      await this.loadCurrent();
    },

    async loadCurrent(opts?: { startAt?: number; autoplay?: boolean }) {
      const ticket = ++navSeq;
      const previous = loadChain;
      const run = (async () => {
        await previous.catch(() => undefined);
        if (ticket !== navSeq) return;
        await this.performLoad(opts);
      })();
      loadChain = run.catch(() => undefined);
      await run;
    },

    async performLoad(opts?: { startAt?: number; autoplay?: boolean }) {
      const track = this.queue[this.index];
      if (!track) return;
      if (
        useUiStore().settings.autoSkipDisliked &&
        useLibraryStore().disliked(track.id) &&
        skipGuard < 30 &&
        this.index < this.queue.length - 1
      ) {
        skipGuard += 1;
        this.index += 1;
        await this.performLoad(opts);
        return;
      }
      skipGuard = 0;
      const startAt = Math.max(0, opts?.startAt ?? 0);
      const autoplay = opts?.autoplay ?? true;
      this.pendingResume = false;
      this.current = track;
      this.progress = startAt;
      lastProgress = startAt;
      updateMediaMetadata(track);
      updatePositionState(
        (track.duration_ms ?? 0) / 1000,
        startAt,
        this.playbackRate,
      );
      useStatsStore().begin(track);
      this.duration = (track.duration_ms ?? 0) / 1000;
      this.loading = true;
      this.lyrics = null;
      this.lyricsError = null;
      this.lyricsOrigin = null;
      this.lyricsPick = null;
      const token = nextSourceToken();
      const ui = useUiStore().settings;
      if (ui.normalizeVolume) resetNormalization();

      try {
        let source: string | null = null;
        let rawStreamUrl = "";
        this.playingLocal = false;
        this.censorReplaced = false;
        this.censorAvailable = false;

        const custom = overrideUrl(track.id);
        if (custom) {
          source = custom;
          this.censorReplaced = true;
          this.currentCodec = null;
          this.currentBitrate = null;
          this.currentSource = "custom-replacement";
          log.info("source from custom replacement", track.title);
        }

        if (!source && ui.censorBypass) {
          await ensureCensorList();
          const replacement = censorUrl(track.id);
          this.censorAvailable = Boolean(replacement);
          if (replacement && !prefersOriginal(track.id)) {
            source = replacement;
            this.censorReplaced = true;
            this.currentCodec = null;
            this.currentBitrate = null;
            log.info("source from FckCensor", track.title);
          }
        }

        const ready = source ? undefined : prefetched.get(track.id);
        if (ready) {
          prefetched.delete(track.id);
          source = ready.url;
          rawStreamUrl = ready.rawUrl || "";
          this.playingLocal = ready.local;
          this.censorReplaced = ready.censored;
          this.currentCodec = ready.codec;
          this.currentBitrate = ready.bitrate;
          this.currentSource = ready.source;
          logQuality({
            title: track.title,
            codec: ready.codec,
            bitrate: ready.bitrate,
            source: ready.source,
            requested: this.quality,
          });
          log.info("source from prefetch", track.title);
        }

        if (!source && ui.preferLocalFiles) {
          const local = await api
            .findLocalTrack(track.id, ui.downloadDir || null)
            .catch(() => null);
          if (local) {
            source = convertFileSrc(local);
            this.playingLocal = true;
            this.currentCodec = local.split(".").pop() ?? null;
            this.currentBitrate = null;
            this.currentSource = "local-file";
            logQuality({
              title: track.title,
              codec: this.currentCodec,
              bitrate: null,
              source: "local-file",
              requested: this.quality,
            });
            log.info("source from disk", local);
          }
        }

        if (!source) {
          const stream = await log.time(`stream ${track.id}`, () =>
            api.stream(track.id, this.quality),
          );
          if (!isCurrentToken(token)) return;
          this.currentCodec = stream.codec;
          this.currentBitrate = stream.bitrate;
          this.currentSource = "network";
          rawStreamUrl = stream.url;
          source = proxyStream(stream.url);
          logQuality({
            title: track.title,
            codec: stream.codec,
            bitrate: stream.bitrate,
            source: "network",
            requested: this.quality,
          });
        }

        if (!isCurrentToken(token)) return;

        const driver = getAudioDriver();
        await driver.play({
          track,
          streamUrl: rawStreamUrl || source,
          startPositionSeconds: startAt,
        });
        void driver.setRepeat(this.repeat);
        this.isPlaying = autoplay;

        this.persistSession();
        void this.prefetchNext();
        if (this.isWave) {
          void api.sendFeedback({
            type: "trackStarted",
            track_id: track.id,
            batch_id: this.waveBatchId,
            station_id: this.stationId ?? undefined,
          });
        }
        if (this.showLyrics) void this.loadLyrics();
      } catch (e) {
        log.error("loadCurrent failed", e);
        if (!isCurrentToken(token)) return;
        Notify.create({
          type: "negative",
          message:
            e instanceof Error ? e.message : "Не удалось воспроизвести трек",
        });
      } finally {
        this.loading = false;
      }
    },

    dedupeQueue() {
      const res = dedupeQueueHelper(this.queue, this.index);
      this.queue = res.queue;
      this.index = res.newIndex;
      this.sourceQueue = dedupeTracks(this.sourceQueue);
    },

    async prefetchNext() {
      const ui = useUiStore().settings;
      if (
        this.isWave &&
        !this.fetchingMore &&
        this.index >= this.queue.length - 2
      ) {
        await this.extendWave();
      }
      const targets = [this.queue[this.index + 1], this.queue[this.index + 2]]
        .filter((track): track is Track => Boolean(track))
        .filter((track) => !prefetched.has(track.id));
      await Promise.all(
        targets.map(async (next) => {
          if (ui.censorBypass && !prefersOriginal(next.id)) {
            const censored = censorUrl(next.id);
            if (censored) {
              rememberPrefetch(next.id, {
                url: proxyStream(censored),
                codec: null,
                bitrate: null,
                local: false,
                censored: true,
                source: "censor-replacement",
              });
              void api.prefetchStream(censored).catch(() => undefined);
              return;
            }
          }
          try {
            if (ui.preferLocalFiles) {
              const local = await api
                .findLocalTrack(next.id, ui.downloadDir || null)
                .catch(() => null);
              if (local) {
                rememberPrefetch(next.id, {
                  url: convertFileSrc(local),
                  codec: local.split(".").pop() ?? null,
                  bitrate: null,
                  local: true,
                  censored: false,
                  source: "local-file",
                });
                log.info("prefetched from disk", next.title);
                return;
              }
            }
            const stream = await api.stream(next.id, this.quality);
            rememberPrefetch(next.id, {
              url: proxyStream(stream.url),
              rawUrl: stream.url,
              codec: stream.codec,
              bitrate: stream.bitrate,
              local: false,
              censored: false,
              source: "network",
            });
            await api.prefetchStream(stream.url).catch(() => undefined);
            log.info("prefetched from network", next.title, stream.codec);
          } catch (error) {
            log.warn("prefetch failed", next.title, error);
          }
        }),
      );

      if (ui.gaplessEnabled) {
        const upcoming = this.queue[this.index + 1];
        const entry = upcoming ? prefetched.get(upcoming.id) : undefined;
        if (entry && !entry.local) warmNext(entry.url);
        else clearWarm();
      } else {
        clearWarm();
      }
    },

    async loadLyrics(force = false, mode?: LyricsSource) {
      const track = this.current;
      if (!track) return;
      if (!force && this.lyrics?.track_id === track.id) {
        void this.loadTranslation();
        return;
      }

      const pick = mode ?? this.lyricsPick ?? undefined;
      this.lyricsLoading = true;
      this.lyricsError = null;
      this.lyricsTranslation = null;
      this.lyricsTranslateKey = null;

      try {
        const result = await fetchTrackLyrics(track, pick, force);
        if (this.current?.id !== track.id) return;
        this.lyrics = result.lyrics;
        this.lyricsOrigin = result.origin;
        this.lyricsError = result.error;
      } finally {
        if (this.current?.id === track.id) this.lyricsLoading = false;
      }

      if (this.lyricsFullscreen && !this.lyrics?.lines?.length) {
        this.openFullscreen();
      }

      void this.loadTranslation();
    },

    async loadTranslation(force = false) {
      const ui = useUiStore().settings;
      const track = this.current;
      const lyrics = this.lyrics;
      if (!ui.lyricsTranslate || !track || !lyrics?.lines?.length) {
        this.lyricsTranslation = null;
        this.lyricsTranslateKey = null;
        return;
      }
      const target = (ui.lyricsTranslateTarget || "ru").toLowerCase();
      const key = `${track.id}:${target}`;
      if (!force && key === this.lyricsTranslateKey && this.lyricsTranslation) {
        return;
      }
      this.lyricsTranslateLoading = true;
      try {
        const source = lyrics.lines.map((l) => l.text ?? "");
        const res = await fetchLyricsTranslation(track.id, source, target);
        if (this.current?.id !== track.id || this.lyrics !== lyrics) return;
        this.lyricsTranslation = res.translation;
        this.lyricsTranslateKey = res.key;
      } finally {
        if (this.current?.id === track.id) this.lyricsTranslateLoading = false;
      }
    },

    async setLyricsSource(mode: LyricsSource | null, force = false) {
      if (this.lyricsPick === mode && !force) return;
      this.lyricsPick = mode;
      this.lyrics = null;
      this.lyricsOrigin = null;
      await this.loadLyrics(true, mode ?? undefined);
    },

    toggleLyrics() {
      if (!this.current) {
        this.showLyrics = false;
        return;
      }
      this.showLyrics = !this.showLyrics;
      if (this.showLyrics) void this.loadLyrics();
    },

    closeLyrics() {
      this.showLyrics = false;
      this.lyricsFullscreen = false;
    },

    openFullscreen() {
      if (!this.current) return;
      this.lyricsFullscreen = false;
      this.showLyrics = false;
      this.fullscreen = true;
    },

    closeFullscreen() {
      this.fullscreen = false;
    },

    toggleFullscreen() {
      if (this.fullscreen) this.closeFullscreen();
      else this.openFullscreen();
    },

    async openLyricsFullscreen() {
      const track = this.current;
      if (!track) return;

      if (this.lyrics?.lines?.length && this.lyrics.track_id === track.id) {
        this.fullscreen = false;
        this.showLyrics = true;
        this.lyricsFullscreen = true;
        return;
      }

      this.openFullscreen();
      await this.loadLyrics();
      if (
        this.fullscreen &&
        this.current?.id === track.id &&
        this.lyrics?.lines?.length
      ) {
        this.fullscreen = false;
        this.showLyrics = true;
        this.lyricsFullscreen = true;
      }
    },

    toggleLyricsFullscreen() {
      this.lyricsFullscreen = !this.lyricsFullscreen;
    },

    async useOriginalVersion(id: string, original: boolean) {
      if (!setPrefersOriginal(id, original)) return;
      prefetched.delete(id);
      if (this.current?.id !== id) return;
      const position = this.progress;
      const wasPlaying = this.isPlaying;
      await this.loadCurrent({ startAt: position, autoplay: wasPlaying });
    },

    async setQuality(quality: Quality) {
      if (quality === this.quality) return;
      this.quality = quality;
      this.persist();
      if (!this.current) return;
      if (overrideUrl(this.current.id)) return;
      const position = this.progress;
      const wasPlaying = this.isPlaying;
      await this.loadCurrent({ startAt: position, autoplay: wasPlaying });
    },

    setPlaybackRate(rate: number) {
      this.playbackRate = rate;
      const driver = getAudioDriver();
      void driver.setPlaybackRate(rate);
      this.persist();
      updatePositionState(this.duration, this.progress, rate);
    },

    cycleRepeat() {
      const order: RepeatMode[] = ["off", "all", "one"];
      const next = order[(order.indexOf(this.repeat) + 1) % order.length];
      this.setRepeat(next ?? "off");
    },

    setRepeat(mode: RepeatMode) {
      this.repeat = mode;
      this.persist();
      const driver = getAudioDriver();
      void driver.setRepeat(mode);
    },

    toggleShuffle() {
      if (!this.queue.length) return;
      if (this.shuffle) {
        const res = unshuffleQueue(this.sourceQueue, this.current?.id);
        this.queue = res.queue;
        this.index = res.newIndex;
        this.shuffle = false;
        return;
      }

      const res = shuffleQueue(this.queue, this.index);
      this.queue = res.queue;
      this.index = res.newIndex;
      this.shuffle = true;
    },

    toggle() {
      if (!this.current) return;
      if (this.pendingResume) {
        void this.loadCurrent({ startAt: this.progress, autoplay: true });
        return;
      }
      const driver = getAudioDriver();
      if (this.isPlaying) {
        void driver.pause();
        this.isPlaying = false;
      } else {
        void driver.resume();
        this.isPlaying = true;
      }
    },

    async next(auto = false) {
      if (useTogetherStore().isGuest) return;
      if (auto && this.repeat === "one") {
        const driver = getAudioDriver();
        void driver.seek(0);
        void driver.resume();
        return;
      }

      if (this.isWave && this.current) {
        await api
          .sendFeedback({
            type: auto ? "trackFinished" : "skip",
            track_id: this.current.id,
            batch_id: this.waveBatchId,
            station_id: this.stationId ?? undefined,
            total_played_seconds: this.progress,
          })
          .catch(() => undefined);
      }

      if (this.isWave && this.index >= this.queue.length - 2) {
        await this.extendWave();
      }

      if (this.index < this.queue.length - 1) {
        this.index += 1;
        await this.loadCurrent();
        return;
      }

      const ui = useUiStore().settings;

      if (
        this.queue.length &&
        (this.repeat === "all" || ui.repeatPlaylistAlways)
      ) {
        this.index = 0;
        await this.loadCurrent();
        return;
      }

      if (ui.autoWaveOnQueueEnd && (await this.continueWithWave())) return;

      this.isPlaying = false;
      const driver = getAudioDriver();
      void driver.pause();
    },

    async ensureRadioStarted() {
      if (!this.isWave || radioStarted) return;
      const station = this.stationId ?? DEFAULT_STATION;
      this.stationId = station;
      radioStarted = true;
      await api
        .sendFeedback({ type: "radioStarted", station_id: station })
        .catch(() => undefined);
    },

    async armWave() {
      if (useTogetherStore().isGuest) return;
      if (!this.isWave) return;
      radioStarted = false;
      const station = this.stationId ?? DEFAULT_STATION;
      this.stationId = station;
      if (!this.stationName) {
        this.stationName = station === DEFAULT_STATION ? "Моя волна" : "Волна";
      }
      await this.ensureRadioStarted();
      if (this.index >= this.queue.length - 2) {
        const added = await this.extendWave();
        if (!added) log.warn("wave did not extend after restart", station);
      }
      this.waveError = null;
      log.info("wave armed", station, this.queue.length - this.index - 1);
    },

    async rescueWave(station: string) {
      const res = await rescueWaveTracks(
        station,
        this.waveSessionId,
        this.queue,
        this.current?.id,
      );
      if (res.sessionId) this.waveSessionId = res.sessionId;
      if (res.batchId) this.waveBatchId = res.batchId;
      if (!res.tracks.length) return 0;

      this.queue.push(...res.tracks);
      if (this.sourceQueue !== this.queue) this.sourceQueue.push(...res.tracks);
      this.remember(res.tracks);
      this.dedupeQueue();
      return res.tracks.length;
    },

    async continueWithWave(): Promise<boolean> {
      if (useTogetherStore().isGuest) return false;
      const ui = useUiStore().settings;
      const seed = this.queue[this.index] ?? this.current;
      const personal = ui.autoWaveSource === "personal" || !seed;
      const station = personal ? DEFAULT_STATION : `track:${seed?.id}`;
      try {
        const res = await api.wave({ station });
        const all = dedupeTracks(res.tracks).filter((t) => t.id !== seed?.id);
        const inQueue = new Set(this.queue.map((t) => t.id));
        const fresh = all.filter((t) => !inQueue.has(t.id));
        const tracks = fresh.length ? fresh : all;
        if (!tracks.length) return false;

        this.stationId = station;
        this.stationName = personal
          ? "Моя волна"
          : `Волна по «${seed?.title ?? "плейлисту"}»`;
        this.waveBatchId = res.batch_id ?? null;
        this.waveSessionId = res.radio_session_id ?? null;
        this.isWave = true;
        radioStarted = false;
        await this.ensureRadioStarted();

        this.queue.push(...tracks);
        if (this.sourceQueue !== this.queue) this.sourceQueue.push(...tracks);
        this.remember(tracks);
        this.index += 1;
        Notify.create({
          message: personal
            ? "Очередь закончилась - включаю мою волну"
            : "Очередь закончилась - включаю волну по плейлисту",
        });
        log.info("queue continued with wave", station, tracks.length);
        await this.loadCurrent();
        return true;
      } catch (error) {
        log.warn("continueWithWave failed", error);
        return false;
      }
    },

    async extendWave() {
      if (useTogetherStore().isGuest) return 0;
      if (this.fetchingMore || !this.isWave) return 0;
      this.fetchingMore = true;
      let added = 0;
      try {
        await this.ensureRadioStarted();
        const station = this.stationId ?? DEFAULT_STATION;
        const res = await fetchMoreWaveTracks(
          station,
          this.waveSessionId,
          this.queue,
          this.seenIds,
        );
        if (res.sessionId) this.waveSessionId = res.sessionId;
        if (res.batchId) this.waveBatchId = res.batchId;

        if (res.freshTracks.length) {
          this.queue.push(...res.freshTracks);
          if (this.sourceQueue !== this.queue) {
            this.sourceQueue.push(...res.freshTracks);
          }
          this.remember(res.freshTracks);
          this.dedupeQueue();
          added = res.freshTracks.length;
        }

        if (added === 0) added = await this.rescueWave(station);
      } catch (error) {
        log.warn("extendWave failed", error);
      } finally {
        this.fetchingMore = false;
      }
      return added;
    },

    async prev() {
      if (this.progress > 3) {
        const driver = getAudioDriver();
        void driver.seek(0);
        return;
      }
      if (this.hasPrev) {
        this.index -= 1;
        await this.loadCurrent();
      }
    },

    seek(seconds: number) {
      const limit = this.duration > 0 ? this.duration : seconds;
      const target = Math.max(0, Math.min(seconds, limit));
      this.progress = target;
      lastProgress = target;
      seekingTarget = target;
      seekingUntil = Date.now() + 2500;
      const driver = getAudioDriver();
      void driver.seek(target);
      updatePositionState(this.duration, target, this.playbackRate);
      lastMediaSync = Date.now();
    },

    setVolume(v: number) {
      this.volume = v;
      this.muted = v === 0;
      const driver = getAudioDriver();
      void driver.setVolume(this.muted ? 0 : v);
      this.persist();
    },

    toggleMute() {
      this.muted = !this.muted;
      const driver = getAudioDriver();
      void driver.setVolume(this.muted ? 0 : this.volume);
      this.persist();
    },

    playNext(track: Track) {
      if (!this.queue.length) {
        void this.playQueue([track], 0);
        return;
      }
      this.queue.splice(this.index + 1, 0, track);
      this.sourceQueue = [...this.queue];
      Notify.create({ message: "Играет следующим" });
    },

    enqueue(track: Track) {
      if (!this.queue.length) {
        void this.playQueue([track], 0);
        return;
      }
      this.queue.push(track);
      this.sourceQueue = [...this.queue];
      Notify.create({ message: "Добавил в конец очереди" });
    },

    jumpTo(index: number) {
      if (index >= 0 && index < this.queue.length) {
        this.index = index;
        void this.loadCurrent();
      }
    },

    removeFromQueue(index: number) {
      const res = removeFromQueueHelper(this.queue, this.index, index);
      this.queue = res.queue;
      this.sourceQueue = [...this.queue];
      this.index = res.newIndex;
      if (res.shouldReload) {
        void this.loadCurrent();
      }
    },

    clearQueue() {
      this.queue = [];
      this.sourceQueue = [];
      this.index = -1;
      this.current = null;
      this.isPlaying = false;
      const driver = getAudioDriver();
      void driver.pause();
    },

    async waveByTrack(track: Track) {
      await this.startWave(`track:${track.id}`, `Волна по «${track.title}»`);
    },

    async like() {
      if (!this.current) return;
      await useLibraryStore().toggleLike(this.current);
    },

    async dislike() {
      if (!this.current) return;
      const track = this.current;
      await useLibraryStore().dislike(track);
      if (this.isWave) {
        await api
          .sendFeedback({
            type: "dislike",
            track_id: track.id,
            station_id: this.stationId ?? undefined,
          })
          .catch(() => undefined);
      }
      await this.next(false);
    },
  },
});
