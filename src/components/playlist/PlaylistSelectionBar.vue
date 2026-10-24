<template>
  <div v-if="selectedCount > 0" class="select-float">
    <button
      class="track-check-box"
      :class="{ on: allVisibleSelected }"
      type="button"
      title="Выбрать все"
      @click="emit('toggleSelectAll')"
    >
      <Icon v-if="allVisibleSelected" name="mingcute:check-line" :size="13" />
    </button>

    <div class="select-bar-count t-12 w-600">
      {{ plural(selectedCount, "трек", "трека", "треков") }}
    </div>

    <div class="select-bar-actions">
      <button
        class="btn"
        type="button"
        :disabled="!selectedCount"
        @click="emit('play')"
      >
        <Icon name="mingcute:play-fill" :size="14" />
        <span>Слушать</span>
      </button>

      <button
        class="btn"
        type="button"
        :disabled="!selectedCount"
        @click="emit('enqueue')"
      >
        <Icon name="mingcute:add-circle-line" :size="14" />
        <span>В очередь</span>
      </button>

      <button class="btn" type="button" :disabled="!selectedCount">
        <Icon name="mingcute:classify-add-line" :size="14" />
        <span>В плейлист</span>
        <q-menu class="menu" anchor="bottom start" self="top start">
          <div class="menu-body">
            <div v-if="!otherPlaylists.length" class="menu-item disabled">
              <span>Нет других плейлистов</span>
            </div>
            <div
              v-for="playlist in otherPlaylists"
              :key="playlist.kind"
              class="menu-item"
              v-close-popup
              @click="emit('addToPlaylist', playlist.kind)"
            >
              <div class="cover menu-cover">
                <img
                  v-if="playlist.cover_url"
                  :src="playlist.cover_url"
                  loading="lazy"
                  decoding="async"
                />
                <Icon v-else name="mingcute:playlist-2-line" :size="14" class="faint" />
              </div>
              <span class="ellipsis">{{ playlist.title }}</span>
            </div>
          </div>
        </q-menu>
      </button>

      <button
        class="btn"
        type="button"
        :disabled="!selectedCount || downloading"
        @click="emit('download')"
      >
        <Icon name="mingcute:download-2-line" :size="14" />
        <span>Скачать</span>
      </button>

      <button
        v-if="canReorder"
        class="btn danger-btn"
        type="button"
        :disabled="!selectedCount"
        @click="emit('remove')"
      >
        <Icon name="mingcute:delete-2-line" :size="14" />
        <span>Удалить</span>
      </button>

      <button
        class="icon-btn sm"
        type="button"
        title="Снять выделение"
        @click="emit('clear')"
      >
        <Icon name="mingcute:close-line" :size="15" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Playlist } from "@/api/types";
import { plural } from "@/lib/format";

defineProps<{
  selectedCount: number;
  allVisibleSelected: boolean;
  otherPlaylists: Playlist[];
  canReorder: boolean;
  downloading: boolean;
}>();

const emit = defineEmits<{
  (e: "toggleSelectAll"): void;
  (e: "play"): void;
  (e: "enqueue"): void;
  (e: "addToPlaylist", kind: number | string): void;
  (e: "download"): void;
  (e: "remove"): void;
  (e: "clear"): void;
}>();
</script>
