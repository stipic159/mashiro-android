import { api } from "@/api/client";
import type { Lyrics, Track } from "@/api/types";
import { readCache, writeCache } from "@/lib/cache";
import type { LyricsOrigin } from "@/lib/lyricsSource";
import { hasText, loadTrackLyrics } from "@/lib/lyricsSource";
import type { LyricsSource } from "@/stores/ui/defaults";

export async function fetchTrackLyrics(
  track: Track,
  pick?: LyricsSource | null,
  force = false,
): Promise<{ lyrics: Lyrics | null; origin: LyricsOrigin | null; error: string | null }> {
  const key = pick ? `lyrics.${track.id}.${pick}` : `lyrics.${track.id}`;

  if (!force) {
    const cached = readCache<Lyrics>(key);
    if (hasText(cached)) {
      return { lyrics: cached, origin: null, error: null };
    }
  }

  try {
    const found = await loadTrackLyrics(track, pick ?? undefined, force);
    if (found) {
      writeCache(key, found.lyrics);
      return { lyrics: found.lyrics, origin: found.origin, error: null };
    }
    return { lyrics: null, origin: null, error: "Текста для этого трека нет" };
  } catch {
    return { lyrics: null, origin: null, error: "Не удалось загрузить текст" };
  }
}

export async function fetchLyricsTranslation(
  trackId: string,
  lines: string[],
  targetLanguage: string,
): Promise<{ translation: string[] | null; key: string | null }> {
  const target = targetLanguage.toLowerCase();
  const key = `${trackId}:${target}`;

  try {
    const translated = await api.translateLines(target, lines);
    if (translated.length === lines.length) {
      return { translation: translated, key };
    }
  } catch {}

  return { translation: null, key: null };
}
