<template>
  <q-page class="playlist-page">
    <PlaylistHeader
      :cover="cover"
      :title="title"
      :tracks="tracks"
      :kind="props.kind"
      :is-pinned="isPinned"
      :header-collapsed="headerCollapsed"
      :downloading="downloading"
      :download-label="downloadLabel"
      :fully-downloaded="fullyDownloaded"
      :editing="editing"
      v-model:draft-title="draftTitle"
      :other-playlists="otherPlaylists"
      @play="playFrom(0)"
      @shuffle="shufflePlay"
      @download="downloadAll"
      @cancel-download="cancelDownload"
      @toggle-pin="library.togglePin(kindNumber)"
      @begin-edit="beginEdit"
      @commit-title="commitTitle"
      @cancel-title="cancelTitle"
      @enqueue-all="enqueueAll"
      @play-recommended="playRecommended"
      @set-public="setPublic"
      @clear-tracks="clearTracks"
      @remove-playlist="removePlaylist"
    />

    <div v-if="loading" class="playlist-loading">
      <q-spinner size="24px" color="primary" />
    </div>

    <div v-else class="playlist-tracks-scroll">
      <PlaylistSelectionBar
        :selected-count="selectedIds.length"
        :all-visible-selected="allVisibleSelected"
        :other-playlists="otherPlaylists"
        :can-reorder="canReorder"
        :downloading="downloading"
        @toggle-select-all="toggleSelectAllRows"
        @play="playRowSelection"
        @enqueue="enqueueRowSelection"
        @add-to-playlist="addRowSelectionTo"
        @download="downloadRowSelection"
        @remove="removeRowSelection"
        @clear="clearRowSelection"
      />

      <PlaylistToolbar
        v-if="tracks.length"
        v-model:filter="filter"
        v-model:sort-mode="sortMode"
        v-model:sort-dir="sortDir"
        :sort-options="sortOptions"
        :match-count="rows.length"
        :can-reorder="canReorder"
      />

      <div class="head-row">
        <div style="width: 26px" />
        <div style="width: 20px; text-align: center">#</div>
        <div style="width: 38px" />
        <div class="col">Название</div>
        <div class="gt-sm" style="width: 190px">Альбом</div>
        <div style="width: 84px" />
        <div style="width: 40px; text-align: right">Время</div>
      </div>

      <q-virtual-scroll
        v-if="rows.length"
        ref="virtualRef"
        v-slot="{ item }"
        class="track-virtual"
        :items="rows"
        :virtual-scroll-item-size="52"
        :virtual-scroll-slice-size="20"
        @scroll="onTracksScroll"
      >
        <TrackRow
          :key="`${item.track.id}-${item.index}`"
          :track="item.track"
          :index="item.index"
          :playlist-kind="props.kind"
          :dragging="dragFrom === item.index"
          :drop-target="dragOver === item.index && dragFrom !== item.index"
          :selectable="true"
          :selected="isRowSelected(item.track)"
          :downloaded="localIds.has(item.track.id)"
          @play="playFrom(item.index)"
          @remove="removeAt(item.index)"
          @reorder-start="startReorder"
          @toggle-select="toggleRow(item.track, $event)"
        />
      </q-virtual-scroll>

      <div v-else-if="filter" class="playlist-empty">
        <Icon name="mingcute:search-2-line" :size="22" class="faint" />
        <div class="t-13">По запросу «{{ filter }}» ничего нет</div>
        <button class="btn" type="button" @click="filter = ''">
          Сбросить поиск
        </button>
      </div>

      <div v-else class="playlist-empty">
        <Icon name="mingcute:playlist-2-line" :size="22" class="faint" />
        <div class="t-13">Плейлист пуст</div>
        <div class="faint t-12">
          Добавляй треки через меню трека - «Добавить в плейлист»
        </div>
        <button class="btn" type="button" @click="playRecommended">
          <Icon name="mingcute:wave-line" :size="15" />
          <span>Подобрать похожее</span>
        </button>
      </div>
    </div>

    <PlaylistBatchModal
      v-model:open="pickerOpen"
      :tracks="tracks"
      :other-playlists="otherPlaylists"
      :downloading="downloading"
      @play-selected="handleBatchPlay"
      @enqueue-selected="handleBatchEnqueue"
      @add-selected-to="handleBatchAddTo"
      @download-selected="handleBatchDownload"
      @remove-selected="handleBatchRemove"
    />
  </q-page>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  toRef,
  watch,
} from "vue";
import { Notify } from "quasar";
import { useRoute, useRouter } from "vue-router";
import TrackRow from "@/components/TrackRow.vue";
import PlaylistHeader from "@/components/playlist/PlaylistHeader.vue";
import PlaylistToolbar, {
  type SortMode,
  type SortOption,
} from "@/components/playlist/PlaylistToolbar.vue";
import PlaylistSelectionBar from "@/components/playlist/PlaylistSelectionBar.vue";
import PlaylistBatchModal from "@/components/playlist/PlaylistBatchModal.vue";
import { api } from "@/api/client";
import type { Playlist, Track } from "@/api/types";
import { artistNames } from "@/lib/format";
import { readCache, swr, writeCache } from "@/lib/cache";
import { askConfirm } from "@/lib/dialogs";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player/index";
import { usePlaylistActions } from "@/composables/usePlaylistActions";

const props = defineProps<{ kind: string }>();
const router = useRouter();
const route = useRoute();
const player = usePlayerStore();
const library = useLibraryStore();

const tracks = ref<Track[]>([]);
const title = ref("Плейлист");
const cover = ref<string | null>(null);
const loading = ref(false);
const filter = ref("");
const dragFrom = ref<number | null>(null);
const dragOver = ref<number | null>(null);
const editing = ref(false);
const draftTitle = ref("");
const sortMode = ref<SortMode>("custom");
const sortDir = ref<"asc" | "desc">("asc");
const pickerOpen = ref(false);
const selectedIds = ref<string[]>([]);
const lastPicked = ref<string | null>(null);
const headerCollapsed = ref(false);
const virtualRef = ref<{
  scrollTo: (index: number, edge?: string) => void;
} | null>(null);

const {
  downloading,
  downloadDone,
  downloadTotal,
  cancelRequested,
  localIds,
  refreshLocal,
  cancelDownload,
  downloadList,
  downloadAll,
} = usePlaylistActions(toRef(props, "kind"), title, tracks);

const sortOptions: SortOption[] = [
  { id: "custom", label: "Как в плейлисте" },
  { id: "title", label: "По названию" },
  { id: "artist", label: "По исполнителю" },
  { id: "album", label: "По альбому" },
  { id: "duration", label: "По длительности" },
];

const kindNumber = computed(() => Number(props.kind));
const isPinned = computed(() => library.isPinned(kindNumber.value));
const canReorder = computed(
  () => sortMode.value === "custom" && sortDir.value === "asc" && !filter.value,
);

const otherPlaylists = computed(() =>
  library.sortedPlaylists.filter(
    (playlist) => String(playlist.kind) !== String(props.kind),
  ),
);

const pendingTracks = computed(() =>
  tracks.value.filter((track) => !localIds.value.has(track.id)),
);

const fullyDownloaded = computed(
  () => tracks.value.length > 0 && pendingTracks.value.length === 0,
);

const downloadLabel = computed(() => {
  if (downloading.value)
    return cancelRequested.value
      ? "Отменяю…"
      : `${downloadDone.value} / ${downloadTotal.value}`;
  if (fullyDownloaded.value) return "Уже скачано";
  const left = pendingTracks.value.length;
  if (left && left !== tracks.value.length) return `Дозакачать (${left})`;
  return "Скачать всё";
});

function sortKey(track: Track): string {
  if (sortMode.value === "artist") return artistNames(track.artists) || "";
  if (sortMode.value === "album") return track.album_title || "";
  return track.title || "";
}

const rows = computed(() => {
  const all = tracks.value.map((track, index) => ({ track, index }));
  const query = filter.value.trim().toLowerCase();
  const found = query
    ? all.filter(({ track }) => {
        const artists = track.artists.map((artist) => artist.name).join(" ");
        const haystack = `${track.title} ${artists} ${track.album_title || ""}`;
        return haystack.toLowerCase().includes(query);
      })
    : all;

  let result: Array<{ track: Track; index: number }>;
  if (sortMode.value === "custom") {
    result = found;
  } else {
    result = [...found];
    result.sort((a, b) => {
      if (sortMode.value === "duration")
        return (a.track.duration_ms || 0) - (b.track.duration_ms || 0);
      const left = sortKey(a.track);
      const right = sortKey(b.track);
      return left.localeCompare(right, "ru");
    });
  }

  if (sortDir.value === "desc") result = [...result].reverse();
  return result;
});

const selectedRowTracks = computed(() =>
  tracks.value.filter((track) => selectedIds.value.includes(track.id)),
);

const allVisibleSelected = computed(
  () =>
    rows.value.length > 0 &&
    rows.value.every((row) => selectedIds.value.includes(row.track.id)),
);

function isRowSelected(track: Track): boolean {
  return selectedIds.value.includes(track.id);
}

function clearRowSelection() {
  selectedIds.value = [];
}

function toggleRow(track: Track, event?: MouseEvent) {
  const visible = rows.value.map((row) => row.track.id);
  const lastId = lastPicked.value !== null ? String(lastPicked.value) : null;

  if (event?.shiftKey && lastId) {
    const from = visible.indexOf(lastId);
    const to = visible.indexOf(track.id);
    if (from >= 0 && to >= 0) {
      const range = visible.slice(Math.min(from, to), Math.max(from, to) + 1);
      selectedIds.value = [...new Set([...selectedIds.value, ...range])];
      return;
    }
  }

  selectedIds.value = selectedIds.value.includes(track.id)
    ? selectedIds.value.filter((id) => id !== track.id)
    : [...selectedIds.value, track.id];
  lastPicked.value = track.id;
}

function toggleSelectAllRows() {
  selectedIds.value = allVisibleSelected.value
    ? []
    : rows.value.map((row) => row.track.id);
}

function playFrom(index: number) {
  if (tracks.value.length) void player.playQueue(tracks.value, index);
}

function shufflePlay() {
  if (!tracks.value.length) return;
  void player.playQueue(tracks.value, 0).then(() => {
    if (!player.shuffle) player.toggleShuffle();
  });
}

function enqueueAll() {
  if (!tracks.value.length) return;
  tracks.value.forEach((track) => player.enqueue(track));
  Notify.create({ message: `В очередь добавлено: ${tracks.value.length}` });
}

function playRowSelection() {
  const list = selectedRowTracks.value;
  if (list.length) void player.playQueue(list, 0);
}

function enqueueRowSelection() {
  const list = selectedRowTracks.value;
  if (!list.length) return;
  list.forEach((track) => player.enqueue(track));
  Notify.create({ message: `В очередь добавлено: ${list.length}` });
}

async function addRowSelectionTo(kind: number | string) {
  const list = selectedRowTracks.value;
  if (!list.length) return;
  await library.addTracksToPlaylist(Number(kind), list);
}

async function downloadRowSelection() {
  await downloadList(selectedRowTracks.value);
}

async function removeRowSelection() {
  const list = selectedRowTracks.value;
  if (!list.length) return;
  const ok = await askConfirm({
    title: "Удалить выбранные треки?",
    message: `Из «${title.value}» будет убрано ${list.length}.`,
    okLabel: "Удалить",
    danger: true,
  });
  if (!ok) return;

  const ids = new Set(list.map((track) => track.id));
  let removed = 0;
  for (let index = tracks.value.length - 1; index >= 0; index -= 1) {
    const track = tracks.value[index];
    if (!track || !ids.has(track.id)) continue;
    if (await library.removeFromPlaylist(kindNumber.value, track, index)) {
      tracks.value.splice(index, 1);
      removed += 1;
    }
  }
  selectedIds.value = [];
  writeCache(`playlist.${props.kind}`, tracks.value);
  Notify.create({ message: `Удалено треков: ${removed}` });
}

function handleBatchPlay(list: Track[]) {
  if (list.length) void player.playQueue(list, 0);
}

function handleBatchEnqueue(list: Track[]) {
  if (!list.length) return;
  list.forEach((track) => player.enqueue(track));
  Notify.create({ message: `В очередь добавлено: ${list.length}` });
}

async function handleBatchAddTo(kind: number | string, list: Track[]) {
  if (!list.length) return;
  let added = 0;
  for (const track of list) {
    if (await library.addToPlaylist(Number(kind), track)) added += 1;
  }
  Notify.create({ message: `Добавлено треков: ${added}` });
}

async function handleBatchDownload(list: Track[]) {
  await downloadList(list);
}

async function handleBatchRemove(indices: number[]) {
  const list = indices.slice().sort((a, b) => b - a);
  if (!list.length) return;
  const ok = await askConfirm({
    title: "Удалить выбранные треки?",
    message: `Из «${title.value}» будет убрано ${list.length}.`,
    okLabel: "Удалить",
    danger: true,
  });
  if (!ok) return;

  let removed = 0;
  for (const index of list) {
    const track = tracks.value[index];
    if (!track) continue;
    if (await library.removeFromPlaylist(kindNumber.value, track, index)) {
      tracks.value.splice(index, 1);
      removed += 1;
    }
  }
  writeCache(`playlist.${props.kind}`, tracks.value);
  Notify.create({ message: `Удалено треков: ${removed}` });
}

async function playRecommended() {
  try {
    const list = await api.playlistRecommendations(props.kind);
    if (!list.length) {
      Notify.create({ message: "Яндекс не предложил похожих треков" });
      return;
    }
    await player.playQueue(list, 0);
    Notify.create({ message: `Похожих треков: ${list.length}` });
  } catch {
    Notify.create({ message: "Не удалось получить рекомендации" });
  }
}

function syncMeta(nextTitle?: string) {
  const cached = readCache<Playlist[]>("home.playlists") ?? [];
  const updated = cached.map((playlist) =>
    String(playlist.kind) === String(props.kind) && nextTitle
      ? { ...playlist, title: nextTitle }
      : playlist,
  );
  writeCache("home.playlists", updated);
  const inStore = library.playlists.find(
    (playlist) => String(playlist.kind) === String(props.kind),
  );
  if (inStore && nextTitle) inStore.title = nextTitle;
}

function beginEdit() {
  draftTitle.value = title.value;
  editing.value = true;
}

function cancelTitle() {
  editing.value = false;
  draftTitle.value = title.value;
}

async function commitTitle() {
  if (!editing.value) return;
  editing.value = false;
  const next = draftTitle.value.trim();
  if (!next || next === title.value) return;
  if (await library.renamePlaylist(kindNumber.value, next)) {
    title.value = next;
    syncMeta(next);
  }
}

function setPublic(isPublic: boolean) {
  void library.setPlaylistPublic(kindNumber.value, isPublic);
}

async function clearTracks() {
  const ok = await askConfirm({
    title: "Очистить плейлист?",
    message: `Из «${title.value}» будут убраны все треки.`,
    okLabel: "Очистить",
    danger: true,
  });
  if (!ok) return;
  if (await library.clearPlaylist(kindNumber.value)) {
    tracks.value = [];
    selectedIds.value = [];
    writeCache(`playlist.${props.kind}`, []);
  }
}

async function removePlaylist() {
  const ok = await askConfirm({
    title: "Удалить плейлист?",
    message: `«${title.value}» будет удалён безвозвратно.`,
    okLabel: "Удалить",
    danger: true,
  });
  if (!ok) return;
  if (await library.deletePlaylist(kindNumber.value)) {
    void router.push("/playlists");
  }
}

async function removeAt(index: number) {
  const track = tracks.value[index];
  if (!track) return;
  const ok = await library.removeFromPlaylist(kindNumber.value, track, index);
  if (ok) {
    tracks.value.splice(index, 1);
  }
}

function startReorder(index: number, event: PointerEvent) {
  if (event.button !== 0) return;
  if (!canReorder.value) {
    Notify.create({
      message: "Сбрось поиск и сортировку, чтобы менять порядок",
    });
    return;
  }
  dragFrom.value = index;
  dragOver.value = index;
  document.body.classList.add("track-reordering");
  window.addEventListener("pointermove", trackPointer, { passive: false });
  window.addEventListener("pointerup", finishReorder, { once: true });
  window.addEventListener("pointercancel", cancelReorder, { once: true });
}

function trackPointer(event: PointerEvent) {
  if (dragFrom.value === null) return;
  event.preventDefault();
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const row = element?.closest<HTMLElement>(".row-track[data-track-index]");
  const index = Number(row?.dataset.trackIndex);
  if (Number.isInteger(index) && index >= 0 && index < tracks.value.length) {
    dragOver.value = index;
  }
  const area = document.querySelector<HTMLElement>(
    ".playlist-tracks-scroll .q-scrollarea__container",
  );
  if (!area) return;
  const bounds = area.getBoundingClientRect();
  if (event.clientY < bounds.top + 48) area.scrollTop -= 18;
  if (event.clientY > bounds.bottom - 48) area.scrollTop += 18;
}

async function finishReorder() {
  const from = dragFrom.value;
  const to = dragOver.value;
  clearReorder();
  if (from === null || to === null || from === to) return;
  const track = tracks.value[from];
  if (!track) return;
  const next = [...tracks.value];
  next.splice(from, 1);
  next.splice(to, 0, track);
  tracks.value = next;
  const ok = await library.moveInPlaylist(kindNumber.value, track, from, to);
  if (!ok) await load();
}

function cancelReorder() {
  clearReorder();
}

function clearReorder() {
  dragFrom.value = null;
  dragOver.value = null;
  document.body.classList.remove("track-reordering");
  window.removeEventListener("pointermove", trackPointer);
  window.removeEventListener("pointerup", finishReorder);
  window.removeEventListener("pointercancel", cancelReorder);
}

function onTracksScroll(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  headerCollapsed.value = target.scrollTop > 24;
}

function jumpToTrack(id: string) {
  const at = rows.value.findIndex((row) => row.track.id === id);
  if (at < 0) return;
  void nextTick(() => {
    virtualRef.value?.scrollTo(at, "start");
    headerCollapsed.value = true;
  });
}

function applyMeta(list: Track[]) {
  const all = readCache<Playlist[]>("home.playlists") ?? [];
  const meta = all.find(
    (playlist) => String(playlist.kind) === String(props.kind),
  );
  title.value = meta?.title || title.value || "Плейлист";
  cover.value = meta?.cover_url || list[0]?.cover_url || null;
}

async function load() {
  const key = `playlist.${props.kind}`;
  const cached = readCache<Track[]>(key) ?? [];
  tracks.value = cached;
  filter.value = "";
  headerCollapsed.value = false;
  editing.value = false;
  pickerOpen.value = false;
  applyMeta(cached);
  loading.value = !cached.length;

  void swr<Playlist[]>("home.playlists", () => api.playlists(), {
    onData: () => applyMeta(tracks.value),
  });

  await swr<Track[]>(key, () => api.playlistTracks(props.kind), {
    onData: (list) => {
      tracks.value = list;
      applyMeta(list);
    },
    onSettled: () => {
      loading.value = false;
      void refreshLocal();
      const target = route.query.track;
      if (target) void nextTick(() => jumpToTrack(String(target)));
    },
  });
}

watch(() => props.kind, load);
onMounted(load);
onBeforeUnmount(clearReorder);
</script>
