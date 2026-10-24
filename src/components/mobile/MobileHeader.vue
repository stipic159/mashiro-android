<template>
  <header class="mobile-header">
    <div class="header-brand" @click="router.push('/')">
      <span class="brand-text">Mashiro</span>
    </div>

    <div class="header-actions">
      <!-- Search quick button if not on search page -->
      <button
        v-if="route.path !== '/search'"
        type="button"
        class="header-btn"
        @click="router.push('/search')"
      >
        <Icon name="mingcute:search-2-line" :size="20" />
      </button>

      <!-- Account avatar -->
      <div class="header-avatar" @click="toggleMenu">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          loading="lazy"
          decoding="async"
          alt=""
          referrerpolicy="no-referrer"
          @error="avatarError = true"
        />
        <span v-else class="avatar-initial">{{ accountInitial }}</span>

        <q-menu class="menu" anchor="bottom right" self="top right">
          <div class="menu-body profile-menu">
            <div class="profile-head">
              <div class="profile-menu-name ellipsis">
                {{ accountName }}
              </div>
              <div class="profile-menu-sub ellipsis">{{ accountSub }}</div>
            </div>

            <div class="menu-sep" />

            <div
              class="menu-item"
              v-close-popup
              @click="router.push('/liked')"
            >
              <Icon name="mingcute:heart-line" :size="17" />
              <span>Любимое</span>
            </div>

            <div
              class="menu-item"
              v-close-popup
              @click="router.push('/settings')"
            >
              <Icon name="mingcute:settings-3-line" :size="17" />
              <span>Настройки</span>
            </div>

            <div class="menu-sep" />

            <div class="menu-item danger" v-close-popup @click="doLogout">
              <Icon name="mingcute:exit-line" :size="17" />
              <span>Выйти из аккаунта</span>
            </div>
          </div>
        </q-menu>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const avatarError = ref(false);

const avatarUrl = computed(() =>
  avatarError.value ? null : auth.profile?.avatar_url || null,
);

const accountName = computed(
  () => auth.profile?.display_name || auth.profile?.login || "Профиль",
);

const accountInitial = computed(() => {
  const src = (auth.profile?.display_name || auth.profile?.login || "").trim();
  return src ? src.charAt(0).toUpperCase() : "☺";
});

const accountLogin = computed(() => {
  const login = auth.profile?.login;
  if (!login || login === auth.profile?.display_name) return "";
  return "@" + login;
});

const accountSub = computed(() =>
  auth.profile?.has_plus
    ? "Яндекс Плюс"
    : accountLogin.value || "Яндекс Музыка",
);

function toggleMenu() {}

async function doLogout() {
  await auth.logout();
  void router.replace("/login");
}
</script>

<style scoped>
.mobile-header {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  height: calc(48px + env(safe-area-inset-top, 0px));
  padding-top: env(safe-area-inset-top, 0px);
  padding-left: 16px;
  padding-right: 16px;
  background: var(--bg-surface-glass, rgba(14, 14, 16, 0.88));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 900;
  user-select: none;
  -webkit-user-select: none;
}

.header-brand {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.brand-text {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text, #ffffff);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-btn {
  background: transparent;
  border: none;
  color: var(--text-dim, rgba(255, 255, 255, 0.7));
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
}

.header-btn:active {
  transform: scale(0.92);
}

.header-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  border: 1.5px solid var(--line, rgba(255, 255, 255, 0.15));
}

.header-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initial {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #ffffff);
}
</style>
