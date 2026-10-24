import type { Track } from "@/api/types";

export function dedupeTracks(tracks: Track[], known?: Set<string>): Track[] {
  const seen = known ?? new Set<string>();
  const out: Track[] = [];
  for (const track of tracks) {
    if (!track?.id || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

export function dedupeQueue(
  queue: Track[],
  currentIndex: number,
): { queue: Track[]; newIndex: number } {
  const seen = new Set<string>();
  const cleaned: Track[] = [];
  let newIndex = currentIndex;

  queue.forEach((track, position) => {
    if (track?.id && !seen.has(track.id)) {
      seen.add(track.id);
      cleaned.push(track);
      return;
    }
    if (position <= newIndex && newIndex > 0) {
      newIndex -= 1;
    }
  });

  return {
    queue: cleaned,
    newIndex: Math.min(newIndex, Math.max(cleaned.length - 1, 0)),
  };
}

export function shuffleQueue(
  queue: Track[],
  currentIndex: number,
): { queue: Track[]; newIndex: number } {
  if (!queue.length) return { queue: [], newIndex: -1 };

  const rest = queue.filter((_, i) => i !== currentIndex);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = rest[i];
    const b = rest[j];
    if (a && b) {
      rest[i] = b;
      rest[j] = a;
    }
  }

  const head = queue[currentIndex];
  const shuffled = head ? [head, ...rest] : rest;
  return { queue: shuffled, newIndex: 0 };
}

export function unshuffleQueue(
  sourceQueue: Track[],
  currentTrackId?: string,
): { queue: Track[]; newIndex: number } {
  const queue = [...sourceQueue];
  const newIndex = currentTrackId
    ? Math.max(
        0,
        queue.findIndex((t) => t.id === currentTrackId),
      )
    : 0;
  return { queue, newIndex };
}

export function removeFromQueue(
  queue: Track[],
  currentIndex: number,
  removeIndex: number,
): { queue: Track[]; newIndex: number; shouldReload: boolean } {
  if (removeIndex < 0 || removeIndex >= queue.length) {
    return { queue, newIndex: currentIndex, shouldReload: false };
  }

  const updated = [...queue];
  updated.splice(removeIndex, 1);

  if (removeIndex === currentIndex) {
    const nextIndex = Math.min(currentIndex, Math.max(0, updated.length - 1));
    return { queue: updated, newIndex: nextIndex, shouldReload: true };
  }

  const nextIndex = removeIndex < currentIndex ? currentIndex - 1 : currentIndex;
  return { queue: updated, newIndex: nextIndex, shouldReload: false };
}
