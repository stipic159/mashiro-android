<template>
  <q-dialog
    v-model="isOpen"
    position="bottom"
    class="mobile-queue-sheet"
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <div class="queue-content">
      <!-- Drag handle -->
      <div class="sheet-handle-bar">
        <div class="sheet-handle" />
      </div>

      <!-- Queue Header -->
      <div class="queue-header">
        <div class="queue-header-left">
          <span class="queue-title">Очередь</span>
          <span class="queue-counter">{{ player.index + 1 }} / {{ player.queue.length }}</span>
        </div>

        <div class="queue-header-actions">
          <button
            type="button"
            class="queue-action-btn"
            title="К текущему треку"
            @click="scrollToCurrent"
          >
            <Icon name="mingcute:target-line" :size="18" />
          </button>
          <button
            type="button"
            class="queue-action-btn"
            title="Очистить очередь"
            @click="clearQueue"
          >
            <Icon name="mingcute:delete-2-line" :size="18" />
          </button>
        </div>
      </div>

      <!-- Scrollable Track List -->
      <div ref="scrollContainer" class="queue-scroll-list">
        <div
          v-for="(track, idx) in player.queue"
          :key="`${track.id}-${idx}`"
          :ref="(el) => { if (idx === player.index) currentTrackEl = el as HTMLElement }"
          class="queue-item"
          :class="{
            'is-current': idx === player.index,
            'is-played': idx < player.index
          }"
          @click="selectTrack(idx)"
        >
          <div class="queue-item-cover">
            <img
              v-if="track.cover_url"
              :src="track.cover_url"
              :alt="track.title"
              loading="lazy"
            />
            <Icon v-else name="mingcute:music-line" :size="16" class="faint" />
            <div v-if="idx === player.index" class="queue-playing-badge">
              <Icon
                :name="player.isPlaying ? 'mingcute:volume-fill' : 'mingcute:pause-fill'"
                :size="12"
              />
            </div>
          </div>

          <div class="queue-item-meta">
            <div class="queue-item-title ellipsis">{{ track.title }}</div>
            <div class="queue-item-artist ellipsis">{{ artistNames(track.artists) }}</div>
          </div>

          <button
            type="button"
            class="queue-item-remove"
            @click.stop="removeTrack(idx)"
          >
            <Icon name="mingcute:close-line" :size="16" />
          </button>
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { usePlayerStore } from "@/stores/player";
import { artistNames } from "@/lib/format";
import { vibrateTick } from "@/composables/useMobile";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const player = usePlayerStore();
const scrollContainer = ref<HTMLElement | null>(null);
const currentTrackEl = ref<HTMLElement | null>(null);

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

watch(isOpen, (open) => {
  if (open) {
    nextTick(() => scrollToCurrent());
  }
});

function scrollToCurrent() {
  if (currentTrackEl.value) {
    currentTrackEl.value.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function selectTrack(index: number) {
  vibrateTick(10);
  player.jumpTo(index);
}

function removeTrack(index: number) {
  vibrateTick(10);
  player.removeFromQueue(index);
}

function clearQueue() {
  vibrateTick(15);
  player.clearQueue();
  isOpen.value = false;
}
</script>

<style scoped>
.mobile-queue-sheet :deep(.q-dialog__inner) {
  padding: 0;
}

.queue-content {
  width: 100vw;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  background: #151518;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding: 12px 16px calc(env(safe-area-inset-bottom, 16px) + 12px);
  color: #fff;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.6);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.sheet-handle-bar {
  display: flex;
  justify-content: center;
  padding-bottom: 8px;
}

.sheet-handle {
  width: 36px;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.queue-header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.queue-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.queue-counter {
  font-size: 13px;
  font-family: monospace;
  color: rgba(255, 255, 255, 0.5);
}

.queue-header-actions {
  display: flex;
  gap: 8px;
}

.queue-action-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  cursor: pointer;
}

.queue-scroll-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
}

.queue-item:active {
  background: rgba(255, 255, 255, 0.06);
}

.queue-item.is-current {
  background: rgba(250, 45, 72, 0.12);
  border: 1px solid rgba(250, 45, 72, 0.3);
}

.queue-item.is-played {
  opacity: 0.55;
}

.queue-item-cover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  background: #232328;
  position: relative;
  flex-shrink: 0;
}

.queue-item-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.queue-playing-badge {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fa2d48;
}

.queue-item-meta {
  flex: 1;
  min-width: 0;
}

.queue-item-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.queue-item.is-current .queue-item-title {
  color: #fa2d48;
}

.queue-item-artist {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 1px;
}

.queue-item-remove {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  border-radius: 50%;
}

.queue-item-remove:active {
  color: #fff;
}
</style>
