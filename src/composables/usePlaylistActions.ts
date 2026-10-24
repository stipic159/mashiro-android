import { computed, ref, type Ref } from "vue";
import { Notify } from "quasar";
import { api } from "@/api/client";
import type { Track } from "@/api/types";
import { artistNames } from "@/lib/format";
import { askConfirm } from "@/lib/dialogs";
import { useUiStore } from "@/stores/ui/index";
import { useLibraryStore } from "@/stores/library";

export function usePlaylistActions(
  kind: Ref<string>,
  title: Ref<string>,
  tracks: Ref<Track[]>,
) {
  const ui = useUiStore();
  const library = useLibraryStore();

  const downloading = ref(false);
  const downloadDone = ref(0);
  const downloadTotal = ref(0);
  const cancelRequested = ref(false);
  const localIds = ref<Set<string>>(new Set());

  const kindNumber = computed(() => Number(kind.value));

  function safeFolder(name: string): string {
    const cleaned = name
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\.+$/, "");
    return cleaned || "Playlist";
  }

  const folderName = computed(() => safeFolder(title.value));

  function joinPath(base: string, folder: string): string {
    const sep = base.includes("\\") ? "\\" : "/";
    const trimmed = base.replace(/[\\/]+$/, "");
    return `${trimmed}${sep}${folder}`;
  }

  async function playlistDir(): Promise<string> {
    const base =
      ui.settings.downloadDir.trim() ||
      (await api.defaultDownloadDir().catch(() => ""));
    if (!base) return "";
    return joinPath(base, folderName.value);
  }

  async function refreshLocal() {
    const dir = await playlistDir();
    if (!dir) {
      localIds.value = new Set();
      return;
    }
    const found = new Set<string>();
    const list = tracks.value.slice();
    for (const track of list) {
      try {
        const path = await api.findLocalTrack(track.id, dir);
        if (path) found.add(track.id);
      } catch {}
    }
    localIds.value = found;
  }

  function cancelDownload() {
    if (!downloading.value) return;
    cancelRequested.value = true;
    Notify.create({ message: "Отменяю загрузку плейлиста…" });
  }

  async function downloadList(list: Track[], skipExisting = true) {
    if (!list.length || downloading.value) return;
    const dir = await playlistDir();
    const queue = skipExisting
      ? list.filter((track) => !localIds.value.has(track.id))
      : list;

    if (!queue.length) {
      Notify.create({ message: "Всё это уже скачано" });
      return;
    }

    downloading.value = true;
    cancelRequested.value = false;
    downloadTotal.value = queue.length;
    downloadDone.value = 0;
    let failed = 0;
    let done = 0;

    for (const track of queue) {
      if (cancelRequested.value) break;
      try {
        await api.download(
          track.id,
          `${artistNames(track.artists)} - ${track.title}`,
          "lossless",
          dir || null,
        );
        localIds.value = new Set([...localIds.value, track.id]);
        done += 1;
      } catch {
        failed += 1;
      }
      downloadDone.value += 1;
    }

    const wasCancelled = cancelRequested.value;
    downloading.value = false;
    cancelRequested.value = false;

    if (wasCancelled) {
      Notify.create({
        type: "warning",
        message: `Загрузка отменена. Успел скачать: ${done}`,
      });
      return;
    }

    Notify.create({
      type: failed ? "warning" : "positive",
      message: failed
        ? `Скачано ${done} из ${queue.length}`
        : `Скачано треков: ${done}${dir ? ` → ${folderName.value}` : ""}`,
    });
  }

  async function downloadAll() {
    if (downloading.value) return;
    const pending = tracks.value.filter((track) => !localIds.value.has(track.id));
    if (!pending.length) {
      Notify.create({ message: "Плейлист уже скачан целиком" });
      return;
    }
    const left = pending.length;
    const already = tracks.value.length - left;
    const ok = await askConfirm({
      title: "Скачать плейлист?",
      message: already
        ? `Будет скачано ${left} треков в папку «${folderName.value}». Уже на диске: ${already}.`
        : `Будет скачано ${left} треков в папку «${folderName.value}».`,
      okLabel: "Скачать",
    });
    if (ok) await downloadList(tracks.value);
  }

  return {
    downloading,
    downloadDone,
    downloadTotal,
    cancelRequested,
    localIds,
    folderName,
    refreshLocal,
    cancelDownload,
    downloadList,
    downloadAll,
  };
}
