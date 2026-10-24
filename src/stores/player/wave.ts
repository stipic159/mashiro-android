import { api } from "@/api/client";
import type { Track } from "@/api/types";
import { readCache, writeCache } from "@/lib/cache";
import { createLogger } from "@/lib/log";
import { dedupeTracks } from "./queue";

export const DEFAULT_STATION = "user:onyourwave";
export const SEEN_LIMIT = 600;
export const WAVE_HISTORY_KEY = "wave.history.v1";
export const WAVE_HISTORY_LIMIT = 500;

const log = createLogger("player:wave");

export interface WaveSessionState {
  isWave: boolean;
  stationId: string | null;
  stationName: string | null;
  waveBatchId: string | null;
  waveSessionId: string | null;
  radioStarted: boolean;
  fetchingMore: boolean;
  seenIds: string[];
}

export function rememberSeenTracks(seenIds: string[], tracks: Track[]): string[] {
  const updated = [...seenIds];
  for (const t of tracks) {
    if (t?.id) updated.push(t.id);
  }

  try {
    const hist = readCache<string[]>(WAVE_HISTORY_KEY) ?? [];
    const set = new Set(hist);
    for (const t of tracks) {
      if (t?.id && !set.has(t.id)) {
        set.add(t.id);
        hist.push(t.id);
      }
    }
    writeCache(WAVE_HISTORY_KEY, hist.slice(-WAVE_HISTORY_LIMIT));
  } catch {}

  return updated.slice(-SEEN_LIMIT);
}

export async function fetchInitialWaveTracks(
  station: string,
  currentSeenIds: string[],
): Promise<{
  tracks: Track[];
  batchId: string | null;
  sessionId: string | null;
}> {
  const history = readCache<string[]>(WAVE_HISTORY_KEY) ?? [];
  const recent = new Set<string>([...history, ...currentSeenIds]);
  const fresh: Track[] = [];
  let batchId: string | null = null;
  let fallback: Track[] = [];
  let sessionId: string | null = null;
  const delivered: string[] = [];

  for (let attempt = 0; attempt < 6 && fresh.length < 8; attempt++) {
    const res = await api.wave(
      sessionId ? { station, sessionId, queue: delivered } : { station },
    );
    if (res.radio_session_id) sessionId = res.radio_session_id;
    if (!res.tracks.length) break;
    batchId = res.batch_id ?? batchId;
    if (!fallback.length) fallback = res.tracks;

    for (const t of res.tracks) {
      delivered.push(t.id);
      if (recent.has(t.id) || fresh.some((c) => c.id === t.id)) continue;
      recent.add(t.id);
      fresh.push(t);
    }
    if (!sessionId) break;
  }

  let tracks = dedupeTracks(fresh);
  if (!tracks.length) {
    const deduped = dedupeTracks(fallback);
    const offset = deduped.length
      ? Math.floor(Date.now() / 1000) % deduped.length
      : 0;
    tracks = offset
      ? [...deduped.slice(offset), ...deduped.slice(0, offset)]
      : deduped;
  }

  if (!tracks.length) {
    throw new Error("Ротор вернул пустой плейлист");
  }

  return { tracks, batchId, sessionId };
}

export async function fetchMoreWaveTracks(
  station: string,
  sessionId: string | null,
  currentQueue: Track[],
  seenIds: string[],
): Promise<{
  freshTracks: Track[];
  batchId: string | null;
  sessionId: string | null;
}> {
  const known = new Set([...seenIds, ...currentQueue.map((t) => t.id)]);
  const freshTracks: Track[] = [];
  let latestSessionId = sessionId;
  let latestBatchId: string | null = null;

  for (let attempt = 0; attempt < 4 && freshTracks.length === 0; attempt++) {
    const res = await api.wave(
      latestSessionId
        ? {
            station,
            sessionId: latestSessionId,
            queue: currentQueue.map((t) => t.id),
          }
        : { station },
    );
    if (res.radio_session_id) latestSessionId = res.radio_session_id;
    if (res.batch_id) latestBatchId = res.batch_id;

    for (const t of res.tracks) {
      if (known.has(t.id)) continue;
      known.add(t.id);
      freshTracks.push(t);
    }
  }

  return {
    freshTracks,
    batchId: latestBatchId,
    sessionId: latestSessionId,
  };
}

export async function rescueWaveTracks(
  station: string,
  sessionId: string | null,
  currentQueue: Track[],
  playingTrackId?: string,
): Promise<{
  tracks: Track[];
  batchId: string | null;
  sessionId: string | null;
}> {
  try {
    const res = await api.wave(
      sessionId
        ? {
            station,
            sessionId,
            queue: currentQueue.map((t) => t.id),
          }
        : { station },
    );
    const all = dedupeTracks(res.tracks).filter((t) => t.id !== playingTrackId);
    if (!all.length) {
      return { tracks: [], batchId: res.batch_id ?? null, sessionId: res.radio_session_id ?? sessionId };
    }

    const inQueue = new Set(currentQueue.map((t) => t.id));
    const tail = all.filter((t) => !inQueue.has(t.id));
    return {
      tracks: tail.length ? tail : all,
      batchId: res.batch_id ?? null,
      sessionId: res.radio_session_id ?? sessionId,
    };
  } catch (error) {
    log.warn("rescueWaveTracks failed", error);
    return { tracks: [], batchId: null, sessionId };
  }
}
