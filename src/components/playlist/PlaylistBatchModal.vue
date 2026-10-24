<template>
  <q-dialog :model-value="open" @update:model-value="emit('update:open', $event)">
    <div class="app-modal picker-modal">
      <div class="picker-head">
        <div>
          <div class="app-modal-title">Выбор треков</div>
          <div class="app-modal-text">
            Отметь треки и примени действие сразу ко всем.
          </div>
        </div>
        <button
          class="icon-btn sm"
          type="button"
          title="Закрыть"
          @click="emit('update:open', false)"
        >
          <Icon name="mingcute:close-line" :size="15" />
        </button>
      </div>

      <div class="picker-toolbar">
        <div class="field picker-search">
          <Icon name="mingcute:search-2-line" :size="14" class="faint" />
          <input
            v-model="pickerFilter"
            type="text"
            spellcheck="false"
            placeholder="Фильтр по названию или артисту"
          />
          <button
            v-if="pickerFilter"
            class="icon-btn xs"
            type="button"
            title="Сбросить"
            @click="pickerFilter = ''"
          >
            <Icon name="mingcute:close-line" :size="12" />
          </button>
        </div>

        <button
          class="btn sm"
          type="button"
          :disabled="!pickerRows.length"
          @click="selectAllVisible"
        >
          <span>Выбрать все ({{ pickerRows.length }})</span>
        </button>

        <button
          v-if="selected.length"
          class="btn sm"
          type="button"
          @click="clearSelection"
        >
          <span>Снять выбор</span>
        </button>
      </div>

      <div class="picker-body">
        <div
          v-for="row in pickerRows"
          :key="`${row.track.id}-${row.index}`"
          class="picker-row"
          :class="{ on: selected.includes(row.index) }"
          @click="toggleSelect(row.index, $event)"
        >
          <div class="picker-check">
            <Icon
              v-if="selected.includes(row.index)"
              name="mingcute:check-line"
              :size="14"
            />
          </div>
          <div class="cover picker-cover">
            <img
              v-if="row.track.cover_url"
              :src="row.track.cover_url"
              loading="lazy"
              decoding="async"
            />
            <Icon v-else name="mingcute:music-2-line" :size="14" class="faint" />
          </div>
          <div class="picker-meta col">
            <div class="picker-title ellipsis">{{ row.track.title }}</div>
            <div class="picker-artist faint ellipsis">
              {{ artistNames(row.track.artists) }}
            </div>
          </div>
          <div class="picker-time faint">
            {{ formatDuration((row.track.duration_ms || 0) / 1000) }}
          </div>
        </div>
      </div>

      <div class="picker-actions">
        <div class="picker-count faint">
          {{
            selected.length
              ? `Выбрано: ${selected.length}`
              : "Ничего не выбрано"
          }}
        </div>

        <div class="col" />

        <button
          class="btn"
          type="button"
          :disabled="!selected.length"
          @click="handlePlay"
        >
          <Icon name="mingcute:play-fill" :size="15" />
          <span>Слушать</span>
        </button>

        <button
          class="btn"
          type="button"
          :disabled="!selected.length"
          @click="handleEnqueue"
        >
          <Icon name="mingcute:add-circle-line" :size="15" />
          <span>В очередь</span>
        </button>

        <button class="btn" type="button" :disabled="!selected.length">
          <Icon name="mingcute:classify-add-line" :size="15" />
          <span>В плейлист</span>
          <q-menu class="menu" anchor="top right" self="bottom right">
            <div class="menu-body" style="min-width: 220px">
              <div class="menu-head">Добавить в плейлист</div>
              <div
                v-for="item in otherPlaylists"
                :key="item.kind"
                class="menu-item"
                v-close-popup
                @click="handleAddSelectedTo(item.kind)"
              >
                <Icon name="mingcute:playlist-2-line" :size="16" />
                <span class="ellipsis">{{ item.title }}</span>
              </div>
              <div v-if="!otherPlaylists.length" class="menu-item disabled">
                <span class="faint">Нет других плейлистов</span>
              </div>
            </div>
          </q-menu>
        </button>

        <button
          class="btn"
          type="button"
          :disabled="!selected.length || downloading"
          @click="handleDownload"
        >
          <Icon name="mingcute:download-2-line" :size="15" />
          <span>Скачать</span>
        </button>

        <button
          class="btn danger-btn"
          type="button"
          :disabled="!selected.length"
          @click="handleRemove"
        >
          <Icon name="mingcute:delete-2-line" :size="15" />
          <span>Удалить</span>
        </button>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { Playlist, Track } from "@/api/types";
import { artistNames, formatDuration } from "@/lib/format";

const props = defineProps<{
  open: boolean;
  tracks: Track[];
  otherPlaylists: Playlist[];
  downloading: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", val: boolean): void;
  (e: "playSelected", tracks: Track[]): void;
  (e: "enqueueSelected", tracks: Track[]): void;
  (e: "addSelectedTo", kind: number | string, tracks: Track[]): void;
  (e: "downloadSelected", tracks: Track[]): void;
  (e: "removeSelected", indices: number[]): void;
}>();

const pickerFilter = ref("");
const selected = ref<number[]>([]);
const lastPicked = ref<number | null>(null);

const pickerRows = computed(() => {
  const query = pickerFilter.value.trim().toLowerCase();
  const all = props.tracks.map((track, index) => ({ track, index }));
  if (!query) return all;
  return all.filter(({ track }) => {
    const artists = artistNames(track.artists);
    return `${track.title} ${artists}`.toLowerCase().includes(query);
  });
});

const selectedTracks = computed(() =>
  selected.value
    .slice()
    .sort((a, b) => a - b)
    .map((index) => props.tracks[index])
    .filter((track): track is Track => Boolean(track)),
);

function selectAllVisible() {
  selected.value = pickerRows.value.map((row) => row.index);
}

function clearSelection() {
  selected.value = [];
  lastPicked.value = null;
}

function toggleSelect(index: number, event?: MouseEvent) {
  const visible = pickerRows.value.map((row) => row.index);
  if (event?.shiftKey && lastPicked.value !== null) {
    const from = visible.indexOf(lastPicked.value);
    const to = visible.indexOf(index);
    if (from >= 0 && to >= 0) {
      const range = visible.slice(Math.min(from, to), Math.max(from, to) + 1);
      const merged = new Set([...selected.value, ...range]);
      selected.value = [...merged];
      lastPicked.value = index;
      return;
    }
  }
  selected.value = selected.value.includes(index)
    ? selected.value.filter((value) => value !== index)
    : [...selected.value, index];
  lastPicked.value = index;
}

function handlePlay() {
  emit("playSelected", selectedTracks.value);
  emit("update:open", false);
}

function handleEnqueue() {
  emit("enqueueSelected", selectedTracks.value);
  emit("update:open", false);
}

function handleAddSelectedTo(kind: number | string) {
  emit("addSelectedTo", kind, selectedTracks.value);
  emit("update:open", false);
}

function handleDownload() {
  emit("downloadSelected", selectedTracks.value);
  emit("update:open", false);
}

function handleRemove() {
  emit("removeSelected", selected.value);
  emit("update:open", false);
}
</script>
