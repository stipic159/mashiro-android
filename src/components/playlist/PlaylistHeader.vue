<template>
  <div class="playlist-page-header" :class="{ collapsed: headerCollapsed }">
    <div class="page-head">
      <div
        class="cover head-cover playlist-cover"
        :title="tracks.length ? 'Слушать плейлист' : ''"
        @click="emit('play')"
      >
        <img loading="lazy" decoding="async" v-if="cover" :src="cover" />
        <Icon v-else name="mingcute:playlist-2-line" :size="42" class="faint" />
        <div v-if="tracks.length" class="playlist-cover-play">
          <Icon name="mingcute:play-fill" :size="20" />
        </div>
      </div>

      <div class="head-info">
        <div class="head-kind">
          Плейлист
          <span v-if="isPinned" class="head-pin-mark">
            <Icon name="mingcute:pin-2-line" :size="12" />
            закреплён
          </span>
        </div>

        <input
          v-if="editing"
          ref="titleInputRef"
          :value="draftTitle"
          class="head-title head-title-input"
          type="text"
          spellcheck="false"
          maxlength="120"
          @input="emit('update:draftTitle', ($event.target as HTMLInputElement).value)"
          @keyup.enter="emit('commitTitle')"
          @keyup.esc="emit('cancelTitle')"
          @blur="emit('commitTitle')"
        />
        <button
          v-else
          class="head-title head-title-edit"
          type="button"
          title="Нажми, чтобы переименовать"
          @click="emit('beginEdit')"
        >
          <span>{{ title }}</span>
          <Icon class="head-title-pen" name="mingcute:pencil-line" :size="20" />
        </button>

        <div class="head-meta">
          {{ plural(tracks.length, "трек", "трека", "треков") }}
          <span v-if="totalLabel" class="faint"> · {{ totalLabel }}</span>
        </div>

        <div class="head-actions">
          <button
            class="btn-solid"
            type="button"
            :disabled="!tracks.length"
            @click="emit('play')"
          >
            <Icon name="mingcute:play-fill" :size="15" />
            <span>Слушать</span>
          </button>

          <button
            class="btn"
            type="button"
            :disabled="!tracks.length"
            @click="emit('shuffle')"
          >
            <Icon name="mingcute:shuffle-line" :size="15" />
            <span>Перемешать</span>
          </button>

          <button
            v-if="downloading"
            class="btn danger-btn"
            type="button"
            title="Отменить загрузку плейлиста"
            @click="emit('cancelDownload')"
          >
            <q-spinner size="15px" />
            <span>{{ downloadLabel }}</span>
            <Icon name="mingcute:close-line" :size="14" />
          </button>

          <button
            v-else
            class="btn"
            type="button"
            :class="{ on: fullyDownloaded }"
            :disabled="!tracks.length || fullyDownloaded"
            :title="
              fullyDownloaded
                ? 'Плейлист уже скачан целиком'
                : 'Скачать все треки плейлиста в отдельную папку'
            "
            @click="emit('download')"
          >
            <Icon :name="fullyDownloaded ? 'mingcute:check-line' : 'mingcute:download-2-line'" :size="15" />
            <span>{{ downloadLabel }}</span>
          </button>

          <button
            class="btn"
            type="button"
            :class="{ on: isPinned }"
            :title="
              isPinned
                ? 'Открепить от боковой панели'
                : 'Закрепить в боковой панели'
            "
            @click="emit('togglePin')"
          >
            <Icon :name="isPinned ? 'gravity-ui:pin-slash' : 'mingcute:pin-2-line'" :size="15" />
            <span>{{ isPinned ? "Открепить" : "Закрепить" }}</span>
          </button>

          <button class="icon-btn" type="button" title="Ещё">
            <Icon name="mingcute:more-2-fill" :size="18" />
            <q-menu class="menu" anchor="bottom left" self="top left">
              <div class="menu-body" style="min-width: 232px">
                <div class="menu-item" v-close-popup @click="emit('beginEdit')">
                  <Icon name="mingcute:pencil-line" :size="17" />
                  <span>Переименовать</span>
                </div>

                <div
                  class="menu-item"
                  v-close-popup
                  @click="emit('enqueueAll')"
                  :class="{ disabled: !tracks.length }"
                >
                  <Icon name="mingcute:add-circle-line" :size="17" />
                  <span>Добавить всё в очередь</span>
                </div>

                <div
                  class="menu-item"
                  v-close-popup
                  :class="{ disabled: !tracks.length || fullyDownloaded }"
                  @click="emit('download')"
                >
                  <Icon name="mingcute:download-2-line" :size="17" />
                  <span>{{
                    fullyDownloaded ? "Уже скачано" : "Скачать всё"
                  }}</span>
                </div>

                <div
                  v-if="downloading"
                  class="menu-item danger"
                  v-close-popup
                  @click="emit('cancelDownload')"
                >
                  <Icon name="mingcute:close-line" :size="17" />
                  <span>Отменить загрузку</span>
                </div>

                <div class="menu-item" v-close-popup @click="emit('playRecommended')">
                  <Icon name="mingcute:wave-line" :size="17" />
                  <span>Похожее на плейлист</span>
                </div>

                <div class="menu-sep" />

                <div class="menu-item" v-close-popup @click="emit('setPublic', true)">
                  <Icon name="mingcute:share-2-line" :size="17" />
                  <span>Сделать публичным</span>
                </div>

                <div
                  class="menu-item"
                  v-close-popup
                  @click="emit('setPublic', false)"
                >
                  <Icon name="mingcute:user-2-line" :size="17" />
                  <span>Сделать личным</span>
                </div>

                <div class="menu-sep" />

                <div class="menu-item" v-close-popup @click="emit('clearTracks')">
                  <Icon name="mingcute:filter-line" :size="17" />
                  <span>Очистить плейлист</span>
                </div>

                <div
                  class="menu-item danger"
                  v-close-popup
                  @click="emit('removePlaylist')"
                >
                  <Icon name="mingcute:delete-2-line" :size="17" />
                  <span>Удалить плейлист</span>
                </div>
              </div>
            </q-menu>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { Playlist, Track } from "@/api/types";
import { plural } from "@/lib/format";

const props = defineProps<{
  cover: string | null;
  title: string;
  tracks: Track[];
  isPinned: boolean;
  headerCollapsed: boolean;
  downloading: boolean;
  downloadLabel: string;
  fullyDownloaded: boolean;
  editing: boolean;
  draftTitle: string;
  otherPlaylists: Playlist[];
}>();

const emit = defineEmits<{
  (e: "play"): void;
  (e: "shuffle"): void;
  (e: "download"): void;
  (e: "cancelDownload"): void;
  (e: "togglePin"): void;
  (e: "beginEdit"): void;
  (e: "commitTitle"): void;
  (e: "cancelTitle"): void;
  (e: "update:draftTitle", value: string): void;
  (e: "enqueueAll"): void;
  (e: "playRecommended"): void;
  (e: "setPublic", isPublic: boolean): void;
  (e: "clearTracks"): void;
  (e: "removePlaylist"): void;
}>();

const titleInputRef = ref<HTMLInputElement | null>(null);

const totalLabel = computed(() => {
  const ms = props.tracks.reduce(
    (sum, track) => sum + (track.duration_ms || 0),
    0,
  );
  if (!ms) return "";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
});

watch(
  () => props.editing,
  (isEditing) => {
    if (isEditing) {
      void nextTick(() => {
        titleInputRef.value?.focus();
        titleInputRef.value?.select();
      });
    }
  },
);
</script>
