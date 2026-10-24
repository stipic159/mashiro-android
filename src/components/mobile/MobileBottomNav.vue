<template>
  <nav class="mobile-bottom-nav">
    <div
      v-for="tab in tabs"
      :key="tab.to"
      class="nav-tab"
      :class="{ active: currentPath === tab.to }"
      @click="navigate(tab.to)"
    >
      <div class="nav-icon-wrap">
        <Icon
          :name="currentPath === tab.to ? tab.activeIcon : tab.icon"
          :size="22"
        />
      </div>
      <span class="nav-label">{{ tab.label }}</span>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMobile } from "@/composables/useMobile";

const route = useRoute();
const router = useRouter();
const { triggerHaptic } = useMobile();

const currentPath = computed(() => {
  if (route.path.startsWith("/playlists")) return "/playlists";
  if (route.path.startsWith("/artist") || route.path.startsWith("/album")) return "/playlists";
  return route.path;
});

const tabs = [
  {
    to: "/",
    label: "Главная",
    icon: "mingcute:home-4-line",
    activeIcon: "mingcute:home-4-fill",
  },
  {
    to: "/wave",
    label: "Волна",
    icon: "mingcute:sparkles-line",
    activeIcon: "mingcute:sparkles-fill",
  },
  {
    to: "/search",
    label: "Поиск",
    icon: "mingcute:search-2-line",
    activeIcon: "mingcute:search-2-fill",
  },
  {
    to: "/playlists",
    label: "Коллекция",
    icon: "mingcute:folder-music-line",
    activeIcon: "mingcute:folder-music-fill",
  },
  {
    to: "/settings",
    label: "Настройки",
    icon: "mingcute:settings-3-line",
    activeIcon: "mingcute:settings-3-fill",
  },
];

function navigate(to: string) {
  triggerHaptic(12);
  if (route.path !== to) {
    router.push(to);
  }
}
</script>

<style scoped>
.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(56px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--bg-surface-glass, rgba(14, 14, 16, 0.88));
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border-top: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 1000;
  user-select: none;
  -webkit-user-select: none;
}

.nav-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 52px;
  color: var(--text-dim, rgba(255, 255, 255, 0.55));
  cursor: pointer;
  transition: color 0.18s ease, transform 0.12s ease;
  position: relative;
}

.nav-tab:active {
  transform: scale(0.92);
}

.nav-tab.active {
  color: var(--accent, #ffffff);
}

.nav-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
}

.nav-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1;
}
</style>
