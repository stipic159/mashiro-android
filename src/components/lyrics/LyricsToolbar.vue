<template>
  <div class="lyrics-toolbar" @mousedown="emit('drag', $event)">
    <div class="lyrics-track">
      <div class="cover lyrics-mini-cover">
        <img
          v-if="coverUrl"
          loading="lazy"
          decoding="async"
          :src="coverUrl"
        />
        <Icon v-else name="mingcute:music-line" :size="16" class="faint" />
      </div>
      <div style="min-width: 0">
        <div
          class="t-13 w-600 ellipsis lyrics-link"
          data-no-drag
          @click="emit('openAlbum')"
        >
          {{ currentTrack?.title || "Текст песни" }}
        </div>
        <div
          class="lyrics-subtitle ellipsis lyrics-link"
          data-no-drag
          @click="emit('openArtist')"
        >
          {{ artistLabel }}
        </div>
      </div>
    </div>

    <div class="lyrics-src">
      <button
        v-for="opt in sources"
        :key="opt.id"
        type="button"
        class="lyrics-src-btn"
        :class="{ on: pick === opt.id }"
        :disabled="!currentTrack"
        @click="emit('chooseSource', opt.id)"
      >
        {{ opt.label }}
      </button>
    </div>

    <div class="lyrics-tools">
      <div
        class="icon-btn round"
        data-no-drag
        @click="emit('reloadLyrics')"
      >
        <Icon name="mingcute:repeat-line" :size="16" />
        <q-tooltip>Загрузить текст заново</q-tooltip>
      </div>
      <div v-if="currentTrack" class="icon-btn round" data-no-drag>
        <Icon name="mingcute:more-2-fill" :size="18" />
        <TrackMenu :track="currentTrack" />
      </div>
      <div
        class="icon-btn round"
        :class="{ on: showSettings }"
        data-no-drag
        @click="emit('toggleSettings')"
      >
        <Icon name="mingcute:settings-5-line" :size="17" />
        <q-tooltip>Вид текста</q-tooltip>
      </div>
      <div
        class="icon-btn round"
        :class="{ on: lyricsFullscreen }"
        data-no-drag
        @click="emit('toggleFullscreen')"
      >
        <Icon
          :name="lyricsFullscreen ? 'mingcute:restore-line' : 'mingcute:square-line'"
          :size="15"
        />
        <q-tooltip>
          {{
            lyricsFullscreen
              ? "Выйти из полного экрана"
              : "На полный экран"
          }}
        </q-tooltip>
      </div>
      <div
        class="icon-btn round"
        data-no-drag
        @click="emit('openArtworkFullscreen')"
      >
        <Icon name="mingcute:album-line" :size="17" />
        <q-tooltip>Большая обложка</q-tooltip>
      </div>
      <div class="icon-btn round" data-no-drag @click="emit('closeLyrics')">
        <Icon name="mingcute:close-line" :size="18" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Track } from "@/api/types";
import TrackMenu from "@/components/TrackMenu.vue";

export type SourcePick = "auto" | "lrclib" | "genius";

defineProps<{
  currentTrack: Track | null;
  coverUrl: string | null;
  artistLabel: string;
  sources: Array<{ id: SourcePick; label: string }>;
  pick: SourcePick;
  showSettings: boolean;
  lyricsFullscreen: boolean;
}>();

const emit = defineEmits<{
  (e: "drag", event: MouseEvent): void;
  (e: "openAlbum"): void;
  (e: "openArtist"): void;
  (e: "chooseSource", source: SourcePick): void;
  (e: "reloadLyrics"): void;
  (e: "toggleSettings"): void;
  (e: "toggleFullscreen"): void;
  (e: "openArtworkFullscreen"): void;
  (e: "closeLyrics"): void;
}>();
</script>
