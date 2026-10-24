<template>
  <div
    v-if="player.current"
    class="mobile-mini-player"
    @click="openFullscreen"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
  >
    <!-- Top progress line -->
    <div class="mini-progress-track">
      <div
        class="mini-progress-fill"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>

    <div class="mini-content">
      <!-- Cover art -->
      <div class="mini-cover">
        <img
          v-if="player.current.cover_url"
          :src="player.current.cover_url"
          loading="lazy"
          decoding="async"
          alt=""
        />
        <Icon v-else name="mingcute:music-line" :size="20" class="faint" />
      </div>

      <!-- Track info -->
      <div class="mini-info">
        <div class="mini-title-row">
          <span class="mini-title ellipsis">{{ player.current.title }}</span>
          <AiTag :show="isAiTrack" />
          <span v-if="isCensored" class="mini-censor-badge">без цензуры</span>
        </div>
        <div class="mini-artist ellipsis">
          <ArtistsLine :artists="player.current.artists" :limit="2" />
        </div>
      </div>

      <!-- Action buttons -->
      <div class="mini-actions" @click.stop>
        <button
          type="button"
          class="mini-btn"
          :class="{ liked: player.isLiked(player.current.id) }"
          @click="toggleLike"
        >
          <Icon
            :name="player.isLiked(player.current.id) ? 'mingcute:heart-fill' : 'mingcute:heart-line'"
            :size="20"
          />
        </button>

        <button
          type="button"
          class="mini-btn play-btn"
          @click="togglePlay"
        >
          <Icon
            :name="player.isPlaying ? 'mingcute:pause-fill' : 'mingcute:play-fill'"
            :size="22"
          />
        </button>

        <button
          type="button"
          class="mini-btn"
          @click="nextTrack"
        >
          <Icon name="mingcute:skip-forward-fill" :size="20" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { usePlayerStore } from "@/stores/player";
import { useMobile } from "@/composables/useMobile";
import { isAiArtist } from "@/lib/aiTag";
import { isCensored as checkCensored } from "@/lib/censor";
import AiTag from "@/components/AiTag.vue";
import ArtistsLine from "@/components/ArtistsLine.vue";

const player = usePlayerStore();
const { triggerHaptic } = useMobile();

const progressPercent = computed(() => {
  if (!player.duration || player.duration <= 0) return 0;
  return Math.min(100, Math.max(0, (player.progress / player.duration) * 100));
});

const isAiTrack = computed(() => {
  const artistId = player.current?.artists?.[0]?.id;
  return isAiArtist(artistId);
});

const isCensored = computed(() => {
  return checkCensored(player.current?.id);
});

function openFullscreen() {
  triggerHaptic(10);
  player.fullscreen = true;
}

function togglePlay() {
  triggerHaptic(15);
  void player.toggle();
}

function nextTrack() {
  triggerHaptic(12);
  void player.next(true);
}

function toggleLike() {
  if (!player.current) return;
  triggerHaptic(15);
  void player.toggleLike(player.current.id);
}

// Swipe gestures
let touchStartX = 0;
let touchStartY = 0;

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}

function onTouchEnd(e: TouchEvent) {
  const touch = e.changedTouches[0];
  if (!touch) return;
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;

  // Swipe up opens fullscreen
  if (deltaY < -50 && Math.abs(deltaY) > Math.abs(deltaX)) {
    openFullscreen();
    return;
  }

  // Horizontal swipes: skip track
  if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY)) {
    if (deltaX < 0) {
      nextTrack();
    } else {
      triggerHaptic(12);
      void player.prev();
    }
  }
}
</script>

<style scoped>
.mobile-mini-player {
  position: fixed;
  bottom: calc(56px + env(safe-area-inset-bottom, 0px));
  left: 8px;
  right: 8px;
  height: 56px;
  background: var(--bg-surface-elevated, rgba(26, 26, 30, 0.95));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 12px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.1));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.mini-progress-track {
  height: 2px;
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
}

.mini-progress-fill {
  height: 100%;
  background: var(--accent, #ffffff);
  transition: width 0.2s linear;
}

.mini-content {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 10px;
  min-width: 0;
}

.mini-cover {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mini-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mini-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.mini-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.mini-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #ffffff);
  line-height: 1.2;
}

.mini-censor-badge {
  font-size: 9px;
  font-weight: 600;
  color: #10b981;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  padding: 1px 4px;
  border-radius: 4px;
  flex-shrink: 0;
}

.mini-artist {
  font-size: 11px;
  color: var(--text-dim, rgba(255, 255, 255, 0.6));
  line-height: 1.2;
}

.mini-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.mini-btn {
  background: transparent;
  border: none;
  color: var(--text-dim, rgba(255, 255, 255, 0.75));
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s ease, color 0.15s ease;
}

.mini-btn:active {
  transform: scale(0.9);
}

.mini-btn.liked {
  color: var(--accent, #ef4444);
}

.play-btn {
  color: var(--text, #ffffff);
}
</style>
