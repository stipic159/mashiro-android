<template>
  <Transition name="mobile-player-slide">
    <div
      v-if="player.fullscreen && player.current"
      class="mobile-fs-player"
      @touchstart="onBgTouchStart"
      @touchmove="onBgTouchMove"
      @touchend="onBgTouchEnd"
    >
      <!-- Ambient background blur of album cover -->
      <div
        v-if="player.current.cover_url"
        class="fs-ambient-bg"
        :style="{ backgroundImage: `url(${player.current.cover_url})` }"
      />
      <div class="fs-ambient-overlay" />

      <!-- Top action bar -->
      <div class="fs-top-bar">
        <button
          type="button"
          class="fs-btn-icon"
          aria-label="Свернуть плеер"
          @click="close"
        >
          <Icon name="mingcute:down-line" :size="24" />
        </button>

        <div class="fs-source-indicator ellipsis">
          <span v-if="player.isWave">Моя волна</span>
          <span v-else-if="player.playingLocal">Локальный файл</span>
          <span v-else-if="player.censorReplaced">Без цензуры (FckCensor)</span>
          <span v-else>Сейчас играет</span>
        </div>

        <button
          type="button"
          class="fs-btn-icon"
          aria-label="Опции трека"
          @click="openTrackMenu"
        >
          <Icon name="mingcute:more-2-line" :size="22" />
        </button>
      </div>

      <!-- Center Artwork Stage with touch swipe -->
      <div
        class="fs-artwork-container"
        @touchstart.stop="onArtTouchStart"
        @touchmove.stop="onArtTouchMove"
        @touchend.stop="onArtTouchEnd"
        @touchcancel.stop="onArtTouchEnd"
      >
        <div
          class="fs-artwork-card"
          :class="{ 'is-playing': player.isPlaying }"
          :style="artCardStyle"
        >
          <img
            v-if="player.current.cover_url"
            :src="player.current.cover_url"
            :alt="player.current.title"
            class="fs-cover-img"
            loading="eager"
            draggable="false"
          />
          <div v-else class="fs-cover-fallback">
            <Icon name="mingcute:music-line" :size="80" />
          </div>
        </div>
      </div>

      <!-- Track Information & Badges -->
      <div class="fs-info-section">
        <div class="fs-meta-left">
          <div class="fs-title-row">
            <div class="fs-track-title ellipsis">
              {{ player.current.title }}
            </div>
            <span
              v-if="isAiTrack"
              class="fs-tag fs-tag-ai"
              title="Сгенерировано ИИ"
            >
              AI
            </span>
            <span
              v-if="player.censorReplaced"
              class="fs-tag fs-tag-censor"
              title="Без цензуры"
            >
              EXP
            </span>
            <span
              v-if="hasOverride"
              class="fs-tag fs-tag-override"
              title="Своя версия трека"
            >
              MOD
            </span>
          </div>

          <div class="fs-track-artist ellipsis" @click="goToArtist">
            {{ artistList }}
          </div>
        </div>

        <button
          type="button"
          class="fs-like-btn"
          :class="{ 'is-liked': isLiked }"
          @click="toggleLike"
        >
          <Icon
            :name="isLiked ? 'mingcute:heart-fill' : 'mingcute:heart-line'"
            :size="26"
          />
        </button>
      </div>

      <!-- Scrubber / Timeline -->
      <div class="fs-scrubber-section" @touchstart.stop @touchmove.stop @touchend.stop>
        <q-slider
          :model-value="seekValue"
          :min="0"
          :max="Math.max(totalDuration, 1)"
          :step="0.5"
          color="white"
          track-color="rgba(255, 255, 255, 0.2)"
          thumb-size="16px"
          class="fs-slider"
          @update:model-value="onSeekInput"
          @change="onSeekCommit"
          @pan="onPan"
        />
        <div class="fs-time-row">
          <span>{{ formatTime(seekValue) }}</span>
          <span>-{{ formatTime(remainingTime) }}</span>
        </div>
      </div>

      <!-- Primary Thumb Controls -->
      <div class="fs-controls-section">
        <button
          type="button"
          class="fs-ctrl-sub"
          :class="{ active: player.shuffle }"
          aria-label="Перемешать"
          @click="toggleShuffle"
        >
          <Icon name="mingcute:shuffle-line" :size="20" />
        </button>

        <button
          type="button"
          class="fs-ctrl-btn"
          :disabled="!player.hasPrev"
          aria-label="Предыдущий трек"
          @click="prevTrack"
        >
          <Icon name="mingcute:skip-previous-fill" :size="30" />
        </button>

        <button
          type="button"
          class="fs-play-btn"
          aria-label="Воспроизведение/Пауза"
          @click="togglePlay"
        >
          <Icon
            :name="player.isPlaying ? 'mingcute:pause-fill' : 'mingcute:play-fill'"
            :size="36"
          />
        </button>

        <button
          type="button"
          class="fs-ctrl-btn"
          :disabled="!player.hasNext"
          aria-label="Следующий трек"
          @click="nextTrack"
        >
          <Icon name="mingcute:fast-forward-fill" :size="30" />
        </button>

        <button
          type="button"
          class="fs-ctrl-sub"
          :class="{ active: player.repeat !== 'off' }"
          :aria-label="repeatLabel"
          @click="cycleRepeat"
        >
          <Icon
            :name="player.repeat === 'one' ? 'mingcute:repeat-one-line' : 'mingcute:repeat-line'"
            :size="22"
          />
        </button>
      </div>

      <!-- Bottom secondary actions -->
      <div class="fs-bottom-row">
        <button
          type="button"
          class="fs-bottom-pill"
          :class="{ active: player.showLyrics }"
          @click="toggleLyrics"
        >
          <Icon name="mingcute:subtitle-line" :size="18" />
          <span>Текст</span>
        </button>

        <button
          type="button"
          class="fs-bottom-pill"
          @click="openQueue"
        >
          <Icon name="mingcute:playlist-2-line" :size="18" />
          <span>Очередь ({{ queueCount }})</span>
        </button>
      </div>

      <!-- Track Bottom Sheet -->
      <TrackBottomSheet
        v-if="showTrackMenu && player.current"
        v-model="showTrackMenu"
        :track="player.current"
      />

      <!-- Queue Bottom Sheet -->
      <QueueBottomSheet
        v-if="showQueue"
        v-model="showQueue"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { usePlayerStore } from "@/stores/player";
import { useLibraryStore } from "@/stores/library";
import { artistNames, formatTime } from "@/lib/format";
import { vibrateTick } from "@/composables/useMobile";
import { isNativeAudio, nativeSetFullscreen } from "@/lib/nativeAudio";
import TrackBottomSheet from "./TrackBottomSheet.vue";
import QueueBottomSheet from "./QueueBottomSheet.vue";
import { isAiArtist } from "@/lib/aiTag";
import { getOverride } from "@/lib/censorOverrides";

const player = usePlayerStore();
const library = useLibraryStore();
const router = useRouter();

onMounted(() => {
  if (isNativeAudio) {
    void nativeSetFullscreen(true);
  }
  window.history.pushState({ modal: "fullscreen-player" }, "");
  window.addEventListener("popstate", onPopState);
});

onUnmounted(() => {
  if (isNativeAudio) {
    void nativeSetFullscreen(false);
  }
  window.removeEventListener("popstate", onPopState);
});

function onPopState(_e: PopStateEvent) {
  if (player.fullscreen) {
    player.fullscreen = false;
    if (isNativeAudio) {
      void nativeSetFullscreen(false);
    }
  }
}

const scrubbing = ref<number | null>(null);
const seekValue = computed(() => scrubbing.value ?? player.progress);
const showTrackMenu = ref(false);
const showQueue = ref(false);

const artistList = computed(() => {
  return artistNames(player.current?.artists);
});

const isLiked = computed(() => {
  return player.current ? library.liked(player.current.id) : false;
});

const isAiTrack = computed(() => {
  const cur = player.current;
  if (!cur) return false;
  return Boolean((cur as any).ai || cur.artists?.some((a) => isAiArtist(a.id)));
});

const hasOverride = computed(() => {
  const cur = player.current;
  if (!cur) return false;
  return Boolean(getOverride(cur.id));
});

const queueCount = computed(() => {
  return player.queue.length;
});

const totalDuration = computed(() => {
  if (player.duration > 0 && isFinite(player.duration)) return player.duration;
  const metaDur = (player.current?.duration_ms ?? 0) / 1000;
  return metaDur > 0 ? metaDur : 0;
});

const remainingTime = computed(() => {
  const dur = totalDuration.value;
  return Math.max(0, dur - seekValue.value);
});

let lastSeekTime = 0;
let lastSeekPos = -1;

function commitSeek(target: number) {
  scrubbing.value = null;
  const now = Date.now();
  if (Math.abs(target - lastSeekPos) < 0.1 && now - lastSeekTime < 300) {
    return;
  }
  lastSeekTime = now;
  lastSeekPos = target;
  player.seek(target);
}

function onSeekInput(value: number | null) {
  if (value !== null && isFinite(value)) {
    scrubbing.value = Number(value);
  }
}

function onPan(phase: "start" | "end" | string) {
  if (phase === "start") {
    if (scrubbing.value === null) scrubbing.value = player.progress;
  } else if (phase === "end") {
    const target = scrubbing.value ?? player.progress;
    if (target !== null && isFinite(target)) {
      commitSeek(target);
    } else {
      scrubbing.value = null;
    }
  }
}

function onSeekCommit(value: number | null) {
  const target = (value !== null && isFinite(value)) ? Number(value) : (scrubbing.value ?? player.progress);
  if (target !== null && isFinite(target)) {
    commitSeek(target);
  } else {
    scrubbing.value = null;
  }
}

function togglePlay() {
  vibrateTick(15);
  player.toggle();
}

function prevTrack() {
  vibrateTick(12);
  player.prev();
}

function nextTrack() {
  vibrateTick(12);
  player.next();
}

function toggleShuffle() {
  vibrateTick(12);
  player.toggleShuffle();
}

function cycleRepeat() {
  vibrateTick(12);
  player.cycleRepeat();
}

const repeatLabel = computed(() => {
  if (player.repeat === "one") return "Повтор трека";
  if (player.repeat === "all") return "Повтор плейлиста";
  return "Повтор выключен";
});

function close() {
  vibrateTick(10);
  player.fullscreen = false;
  if (isNativeAudio) {
    void nativeSetFullscreen(false);
  }
  if (window.history.state?.modal === "fullscreen-player") {
    window.history.back();
  }
}

function openTrackMenu() {
  vibrateTick(10);
  showTrackMenu.value = true;
}

function openQueue() {
  vibrateTick(10);
  showQueue.value = true;
}

function toggleLyrics() {
  vibrateTick(10);
  player.showLyrics = !player.showLyrics;
}

function toggleLike() {
  if (!player.current) return;
  vibrateTick(15);
  void library.toggleLike(player.current);
}

function goToArtist() {
  const first = player.current?.artists?.[0];
  if (first?.id) {
    close();
    router.push(`/artist/${first.id}`);
  }
}

// Artwork interactive swipe to switch track
const artDragX = ref(0);
const artTransitioning = ref(false);

const artCardStyle = computed(() => {
  if (artDragX.value !== 0) {
    const rot = (artDragX.value / 300) * 10;
    return {
      transform: `translateX(${artDragX.value}px) rotate(${rot}deg)`,
      transition: artTransitioning.value ? "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
    };
  }
  return {};
});

let artStartX = 0;
let artStartY = 0;

function onArtTouchStart(e: TouchEvent) {
  const t = e.touches[0];
  if (!t) return;
  artStartX = t.clientX;
  artStartY = t.clientY;
  artTransitioning.value = false;
}

function onArtTouchMove(e: TouchEvent) {
  const t = e.touches[0];
  if (!t) return;
  const dx = t.clientX - artStartX;
  const dy = t.clientY - artStartY;

  // Track horizontal swipe on artwork
  if (Math.abs(dx) > Math.abs(dy)) {
    artDragX.value = dx * 0.7; // damping
  }
}

function onArtTouchEnd(e: TouchEvent) {
  const t = e.changedTouches[0];
  const dx = t ? t.clientX - artStartX : 0;
  const dy = t ? t.clientY - artStartY : 0;

  artTransitioning.value = true;
  artDragX.value = 0;

  // Swipe down on art to close
  if (dy > 90 && dy > Math.abs(dx) * 1.3) {
    close();
    return;
  }

  // Swipe left -> Next track
  if (dx < -40 && Math.abs(dx) > Math.abs(dy)) {
    if (player.hasNext) {
      vibrateTick(15);
      void player.next();
    }
    return;
  }

  // Swipe right -> Previous track
  if (dx > 40 && Math.abs(dx) > Math.abs(dy)) {
    if (player.hasPrev) {
      vibrateTick(15);
      void player.prev();
    }
    return;
  }
}

// Background swipe down to close
let bgStartY = 0;
let bgStartX = 0;

function onBgTouchStart(e: TouchEvent) {
  const t = e.touches[0];
  if (!t) return;
  bgStartX = t.clientX;
  bgStartY = t.clientY;
}

function onBgTouchMove(_e: TouchEvent) {}

function onBgTouchEnd(e: TouchEvent) {
  const t = e.changedTouches[0];
  if (!t) return;
  const dy = t.clientY - bgStartY;
  const dx = t.clientX - bgStartX;

  if (dy > 90 && dy > Math.abs(dx) * 1.2) {
    close();
  }
}
</script>

<style scoped>
.mobile-fs-player {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #09090b;
  color: #fff;
  padding: calc(env(safe-area-inset-top, 16px) + 8px) 24px calc(env(safe-area-inset-bottom, 16px) + 16px);
  overflow: hidden;
  user-select: none;
}

.fs-ambient-bg {
  position: absolute;
  inset: -40px;
  background-size: cover;
  background-position: center;
  filter: blur(50px) brightness(0.35) saturate(160%);
  transform: scale(1.15);
  pointer-events: none;
  z-index: 0;
}

.fs-ambient-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 30%, transparent 0%, rgba(9, 9, 11, 0.8) 85%);
  pointer-events: none;
  z-index: 1;
}

.fs-top-bar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
}

.fs-source-indicator {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.3px;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
}

.fs-btn-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #fff;
  border-radius: 50%;
  cursor: pointer;
}

.fs-artwork-container {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0;
  flex: 1;
  min-height: 240px;
}

.fs-artwork-card {
  width: min(78vw, 320px);
  height: min(78vw, 320px);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.fs-artwork-card.is-playing {
  transform: scale(1.02);
}

.fs-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

.fs-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1c1c20;
  color: #666;
}

.fs-info-section {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.fs-meta-left {
  flex: 1;
  min-width: 0;
  margin-right: 16px;
}

.fs-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fs-track-title {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: #fff;
}

.fs-track-artist {
  font-size: 15px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 3px;
  cursor: pointer;
}

.fs-like-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.fs-like-btn.is-liked {
  color: #fa2d48;
}

.fs-tag {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
}

.fs-tag-ai {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.fs-tag-censor {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.fs-scrubber-section {
  position: relative;
  z-index: 2;
  margin-bottom: 12px;
}

.fs-slider {
  padding: 8px 0;
}

.fs-time-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-family: monospace;
  color: rgba(255, 255, 255, 0.5);
  margin-top: -4px;
}

.fs-controls-section {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 12px;
}

.fs-ctrl-btn {
  background: transparent;
  border: none;
  color: #fff;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
}

.fs-ctrl-btn:disabled {
  opacity: 0.3;
}

.fs-ctrl-sub {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  transition: color 0.2s ease, transform 0.15s ease;
}

.fs-ctrl-sub:active {
  transform: scale(0.9);
}

.fs-ctrl-sub.active {
  color: var(--accent, #fa2d48);
}

.fs-play-btn {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: #fa2d48;
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(250, 45, 72, 0.4);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.fs-play-btn:active {
  transform: scale(0.92);
}

.fs-bottom-row {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding-top: 4px;
}

.fs-bottom-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.fs-bottom-pill.active {
  background: rgba(250, 45, 72, 0.2);
  border-color: rgba(250, 45, 72, 0.4);
  color: #fa2d48;
}

/* Animations */
.mobile-player-slide-enter-active,
.mobile-player-slide-leave-active {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}

.mobile-player-slide-enter-from,
.mobile-player-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
