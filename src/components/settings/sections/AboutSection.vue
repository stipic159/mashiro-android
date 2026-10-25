<template>
  <section id="settings-about" class="settings-group">
    <div class="settings-group-head">
      <h2>О проекте</h2>
      <p>Автор, версия сборки, лицензия и использованные проекты.</p>
    </div>

    <div class="about-card">
      <img class="about-avatar" :src="avatar" alt="elytrya" />
      <div class="about-ident">
        <div class="about-name">Mashiro</div>
        <div class="about-sub">неофициальный андроид-клиент Яндекс Музыки</div>
        <div class="about-links">
          автор:
          <a :href="AUTHOR_URL" @click.prevent="openLink(AUTHOR_URL)"
            >stipic159</a
          >
        </div>
      </div>
    </div>

    <div class="about-rows">
      <div class="about-row">
        <span class="about-key">Версия</span>
        <span class="about-val flex items-center gap-2">
          <span>0.5.0</span>
          <button
            type="button"
            class="btn-check-update"
            :disabled="checkingUpdate"
            @click="checkUpdates"
          >
            {{ checkingUpdate ? "Проверка…" : "Проверить обновления" }}
          </button>
        </span>
      </div>
      <div v-if="updateInfo" class="about-update-banner">
        <div class="about-update-head">
          <Icon name="mingcute:sparkles-line" :size="18" class="text-accent" />
          <span class="w-600">Доступно обновление {{ updateInfo.version }}!</span>
        </div>
        <div v-if="updateInfo.body" class="about-update-body clamp-3">
          {{ updateInfo.body }}
        </div>
        <button
          type="button"
          class="btn-primary sm round q-mt-xs"
          @click="openLink(updateInfo.url)"
        >
          Скачать обновление (GitHub)
        </button>
      </div>
      <div class="about-row">
        <span class="about-key">Лицензия</span>
        <span class="about-val">
          <a :href="LICENSE_URL" @click.prevent="openLink(LICENSE_URL)"
            >GPL-3.0</a
          >
        </span>
      </div>
      <div class="about-row">
        <span class="about-key">Авторство</span>
        <span class="about-val">
          ООО «Яндекс» к проекту отношения не имеет
        </span>
      </div>
    </div>

    <div class="about-block">
      <h3>Благодарности</h3>
      <p class="about-note">
        Проекты, без которых этот клиент не работал бы в текущем виде.
      </p>
      <a
        v-for="item in credits"
        :key="item.url"
        class="credit"
        :href="item.url"
        :title="item.url"
        @click.prevent="openLink(item.url)"
      >
        <span class="credit-name">{{ item.name }}</span>
        <span class="credit-desc">{{ item.desc }}</span>
      </a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Notify } from "quasar";
import { onMounted, ref } from "vue";
import { api } from "@/api/client";
import { cachedImage, loadCachedImage } from "@/lib/imageCache";

const CURRENT_VERSION = "0.5.0";
const REPO = "stipic159/mashiro-android";
const AUTHOR_URL = "https://github.com/stipic159";
const AVATAR_URL = "https://github.com/stipic159.png?size=200";
const LICENSE_URL = "https://www.gnu.org/licenses/gpl-3.0.html";
const FALLBACK = "icons/128x128.png";

const avatar = ref(cachedImage("stipic159") ?? FALLBACK);
const checkingUpdate = ref(false);
const updateInfo = ref<{ version: string; url: string; body: string } | null>(null);

function openLink(url: string) {
  void api.openExternal(url);
}

function compareVersions(v1: string, v2: string): number {
  const p1 = v1.replace(/^v/, "").split(".").map(Number);
  const p2 = v2.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] ?? 0;
    const n2 = p2[i] ?? 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

async function checkUpdates() {
  if (checkingUpdate.value) return;
  checkingUpdate.value = true;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) {
      throw new Error(`GitHub API вернул статус ${res.status}`);
    }
    const data = await res.json();
    const latestTag = (data.tag_name || "").trim();
    if (compareVersions(latestTag, CURRENT_VERSION) > 0) {
      updateInfo.value = {
        version: latestTag,
        url: data.html_url || `https://github.com/${REPO}/releases`,
        body: data.body || "",
      };
      Notify.create({
        type: "positive",
        message: `Найдено обновление: ${latestTag}`,
      });
    } else {
      updateInfo.value = null;
      Notify.create({
        type: "positive",
        message: "У вас установлена последняя версия Mashiro!",
      });
    }
  } catch (e) {
    Notify.create({
      type: "warning",
      message: "Не удалось проверить обновления: " + (e instanceof Error ? e.message : String(e)),
    });
  } finally {
    checkingUpdate.value = false;
  }
}

onMounted(async () => {
  avatar.value = await loadCachedImage("stipic159", AVATAR_URL);
});

const credits = [
  {
    name: "aeviww/yandex-music-client",
    desc: "десктоп mashiro",
    url: "https://github.com/aeviww/yandex-music-client"
  },
  {
    name: "MarshalX/yandex-music-api",
    desc: "описание неофициального API Яндекс Музыки",
    url: "https://github.com/MarshalX/yandex-music-api",
  },
  {
    name: "vyfor/yandex-music-rs",
    desc: "схемы ответов API для Rust-части",
    url: "https://github.com/vyfor/yandex-music-rs",
  },
  {
    name: "Hazzz895/FckCensor",
    desc: "оттуда позаимствована логика подмены зацензуренных треков",
    url: "https://github.com/Hazzz895/FckCensor",
  },
  {
    name: "Hazzz895/FckCensorData",
    desc: "база ссылок на незацензуренные версии треков",
    url: "https://github.com/Hazzz895/FckCensorData",
  },
  {
    name: "alexeyfv/slopless",
    desc: "база артистов с музыкой, сгенерированной нейросетями",
    url: "https://github.com/alexeyfv/slopless",
  },
];
</script>

<style scoped>
.about-card {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 18px 0 20px;
}
.about-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  flex: 0 0 auto;
}
.about-name {
  font-size: 16px;
  font-weight: 600;
}
.about-sub {
  font-size: 12px;
  opacity: 0.6;
  margin-top: 2px;
}
.about-links {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.8;
}
.about-links a,
.about-val a,
.credit-name {
  color: var(--accent, #fa2d48);
  text-decoration: none;
  cursor: pointer;
}
.about-links a:hover,
.about-val a:hover,
.credit:hover .credit-name {
  text-decoration: underline;
}
.about-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.about-row {
  display: flex;
  gap: 12px;
  font-size: 13px;
  line-height: 1.45;
}
.about-key {
  flex: 0 0 110px;
  opacity: 0.6;
}
.about-val {
  flex: 1 1 auto;
}
.about-block {
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px solid var(--line, rgba(255, 255, 255, 0.08));
}
.about-block h3 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}
.about-note {
  margin: 0 0 12px;
  font-size: 12px;
  opacity: 0.6;
}
.credit {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.06));
  text-decoration: none;
}
.credit:last-child {
  border-bottom: none;
}
.credit-name {
  font-size: 13px;
  font-weight: 500;
}
.credit-desc {
  font-size: 12px;
  color: var(--fg-dim);
}
.btn-check-update {
  margin-left: 8px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 999px;
  background: var(--surface-2, rgba(255, 255, 255, 0.08));
  border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  color: var(--fg, #fff);
  cursor: pointer;
  transition: opacity 0.2s ease;
}
.btn-check-update:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.about-update-banner {
  margin-top: 10px;
  padding: 12px 14px;
  background: var(--surface-2, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--accent, #fa2d48);
  border-radius: var(--radius, 10px);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.about-update-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.about-update-body {
  font-size: 12px;
  color: var(--fg-dim, #b3b3b3);
  line-height: 1.4;
}
.btn-primary.sm {
  align-self: flex-start;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  background: var(--accent, #fff);
  color: #000;
  border: none;
  cursor: pointer;
}
</style>
