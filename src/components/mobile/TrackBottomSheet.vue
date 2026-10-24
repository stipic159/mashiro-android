<template>
  <q-dialog
    v-model="isOpen"
    position="bottom"
    class="mobile-bottom-sheet"
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <div class="sheet-content">
      <!-- Drag handle -->
      <div class="sheet-handle-bar">
        <div class="sheet-handle" />
      </div>

      <!-- Track Preview Header -->
      <div class="sheet-header">
        <div class="sheet-cover">
          <img
            v-if="track.cover_url"
            :src="track.cover_url"
            :alt="track.title"
            loading="lazy"
          />
          <Icon v-else name="mingcute:music-line" :size="24" class="faint" />
        </div>
        <div class="sheet-header-meta">
          <div class="sheet-title ellipsis">{{ track.title }}</div>
          <div class="sheet-subtitle ellipsis">{{ artistNames(track.artists) }}</div>
        </div>
      </div>

      <div class="sheet-divider" />

      <!-- Action items -->
      <div class="sheet-actions">
        <button type="button" class="sheet-item" @click="toggleLike">
          <Icon
            :name="isLiked ? 'mingcute:heart-fill' : 'mingcute:heart-line'"
            :size="20"
            :class="{ 'text-red': isLiked }"
          />
          <span>{{ isLiked ? "Удалить из любимых" : "Добавить в любимые" }}</span>
        </button>

        <button type="button" class="sheet-item" @click="playNext">
          <Icon name="mingcute:list-check-line" :size="20" />
          <span>Включить следующим</span>
        </button>

        <button type="button" class="sheet-item" @click="addToQueue">
          <Icon name="mingcute:play-line" :size="20" />
          <span>Добавить в конец очереди</span>
        </button>

        <button
          v-if="hasCensor"
          type="button"
          class="sheet-item"
          @click="toggleCensorPreference"
        >
          <Icon name="mingcute:shield-shape-line" :size="20" />
          <span>{{ isOriginal ? "Включить без цензуры (FckCensor)" : "Вернуть исходную версию" }}</span>
        </button>

        <!-- Custom Replacement / Override -->
        <button type="button" class="sheet-item" @click="openReplaceDialog">
          <Icon name="mingcute:upload-2-line" :size="20" :class="{ 'text-accent': hasReplacement }" />
          <span class="col ellipsis">
            {{ hasReplacement ? `Своя версия: ${currentOverride?.label || 'активна'}` : "Подменить аудиофайл" }}
          </span>
          <span v-if="hasReplacement" class="badge-active">Заменен</span>
        </button>

        <button type="button" class="sheet-item" @click="goToArtist">
          <Icon name="mingcute:user-3-line" :size="20" />
          <span>Перейти к артисту</span>
        </button>

        <button v-if="track.album_id" type="button" class="sheet-item" @click="goToAlbum">
          <Icon name="mingcute:disc-line" :size="20" />
          <span>Перейти к альбому</span>
        </button>

        <button type="button" class="sheet-item" @click="copyLink">
          <Icon name="mingcute:share-forward-line" :size="20" />
          <span>Поделиться треком</span>
        </button>
      </div>
    </div>
  </q-dialog>

  <!-- Replace Dialog Modal -->
  <q-dialog v-model="replaceOpen" position="bottom" class="mobile-replace-dialog">
    <div class="replace-sheet-card">
      <div class="replace-sheet-head">
        <div>
          <div class="replace-title ellipsis">Своя версия трека</div>
          <div class="replace-subtitle ellipsis">{{ track.title }}</div>
        </div>
        <button type="button" class="icon-close" @click="replaceOpen = false">
          <Icon name="mingcute:close-line" :size="18" />
        </button>
      </div>

      <div class="replace-options">
        <!-- Option 1: File from phone -->
        <input
          ref="fileInputRef"
          type="file"
          accept="audio/*"
          style="display: none"
          @change="onFileSelected"
        />

        <button
          type="button"
          class="replace-btn primary"
          :disabled="importingFile"
          @click="pickFile"
        >
          <Icon name="mingcute:folder-music-line" :size="20" />
          <span>{{ importingFile ? "Импортирую файл..." : "Выбрать файл с телефона" }}</span>
        </button>

        <!-- Option 2: Direct URL -->
        <div class="replace-url-box">
          <div class="t-12 faint q-mb-xs">Или прямая ссылка на аудио (.mp3 / .flac):</div>
          <div class="replace-input-row">
            <input
              v-model="customUrl"
              type="text"
              placeholder="https://.../track.mp3"
              class="replace-input"
              spellcheck="false"
            />
          </div>
          <div class="replace-input-row q-mt-xs">
            <input
              v-model="customLabel"
              type="text"
              placeholder="Подпись (например: без цензуры)"
              class="replace-input"
              spellcheck="false"
            />
          </div>
          <button
            type="button"
            class="replace-btn secondary q-mt-sm"
            @click="saveUrlOverride"
          >
            <Icon name="mingcute:check-line" :size="18" />
            <span>Сохранить ссылку</span>
          </button>
        </div>

        <!-- Option 3: Wi-Fi Sync info -->
        <div class="wifi-sync-card">
          <div class="row items-center justify-between no-wrap">
            <div class="row items-center" style="gap: 6px;">
              <Icon name="mingcute:wifi-line" :size="18" class="text-accent" />
              <b class="t-13">Wi-Fi синхронизация с ПК</b>
            </div>
            <button
              type="button"
              class="sync-toggle-btn"
              :class="{ active: wifiRunning }"
              @click="toggleWifiServer"
            >
              {{ wifiRunning ? "Остановить" : "Включить" }}
            </button>
          </div>
          <div v-if="wifiRunning" class="q-mt-xs">
            <div class="wifi-url-text">{{ wifiUrl }}</div>
            <div class="t-11 faint q-mt-xs">
              Открой этот адрес в браузере на ПК для перетаскивания треков
            </div>
          </div>
        </div>

        <!-- Delete Replacement -->
        <button
          v-if="hasReplacement"
          type="button"
          class="replace-btn danger q-mt-xs"
          @click="dropReplacement"
        >
          <Icon name="mingcute:delete-2-line" :size="18" />
          <span>Удалить подмену (вернуть оригинал)</span>
        </button>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Notify } from "quasar";
import type { Track } from "@/api/types";
import { api } from "@/api/client";
import { usePlayerStore } from "@/stores/player";
import { useLibraryStore } from "@/stores/library";
import { artistNames } from "@/lib/format";
import { censorUrl, prefersOriginal, setPrefersOriginal } from "@/lib/censor";
import { clearOverride, getOverride, setOverride } from "@/lib/censorOverrides";
import { vibrateTick } from "@/composables/useMobile";

const props = defineProps<{
  modelValue: boolean;
  track: Track;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const router = useRouter();
const player = usePlayerStore();
const library = useLibraryStore();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const isLiked = computed(() => library.liked(props.track.id));
const hasCensor = computed(() => Boolean(censorUrl(props.track.id)));
const isOriginal = computed(() => prefersOriginal(props.track.id));

const replaceOpen = ref(false);
const replaceTick = ref(0);
const customUrl = ref("");
const customLabel = ref("");
const importingFile = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const wifiRunning = ref(false);
const wifiUrl = ref("");

const currentOverride = computed(() => {
  void replaceTick.value;
  return getOverride(props.track.id);
});

const hasReplacement = computed(() => Boolean(currentOverride.value));

function close() {
  isOpen.value = false;
}

function toggleLike() {
  vibrateTick(15);
  library.toggleLike(props.track);
  close();
}

function playNext() {
  vibrateTick(10);
  player.playNext(props.track);
  close();
}

function addToQueue() {
  vibrateTick(10);
  player.enqueue(props.track);
  close();
}

function toggleCensorPreference() {
  vibrateTick(15);
  setPrefersOriginal(props.track.id, !isOriginal.value);
  if (player.current?.id === props.track.id) {
    void player.loadCurrent({ startAt: player.progress, autoplay: player.isPlaying });
  }
  close();
}

function openReplaceDialog() {
  vibrateTick(10);
  const cur = getOverride(props.track.id);
  customUrl.value = cur?.source ?? "";
  customLabel.value = cur?.label ?? "своя версия";
  replaceOpen.value = true;
  void checkWifi();
}

async function checkWifi() {
  wifiRunning.value = await api.isSyncServerRunning().catch(() => false);
  if (wifiRunning.value && !wifiUrl.value) {
    wifiUrl.value = await api.startSyncServer().catch(() => "");
  }
}

async function toggleWifiServer() {
  vibrateTick(15);
  try {
    if (wifiRunning.value) {
      await api.stopSyncServer();
      wifiRunning.value = false;
      wifiUrl.value = "";
      Notify.create({ message: "Wi-Fi сервер остановлен", timeout: 1500 });
    } else {
      const url = await api.startSyncServer();
      wifiRunning.value = true;
      wifiUrl.value = url;
      Notify.create({ message: `Wi-Fi сервер запущен: ${url}`, timeout: 3000 });
    }
  } catch (err: any) {
    Notify.create({ type: "negative", message: err?.message || "Ошибка Wi-Fi сервера" });
  }
}

function pickFile() {
  vibrateTick(10);
  fileInputRef.value?.click();
}

async function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  importingFile.value = true;
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const savedPath = await api.importLocalTrack(props.track.id, file.name, bytes);

    setOverride(props.track.id, savedPath, file.name);
    replaceTick.value += 1;
    replaceOpen.value = false;

    Notify.create({ message: "Файл сохранён и привязан к треку!", timeout: 2000 });
    if (player.current?.id === props.track.id) {
      void player.loadCurrent({ startAt: 0, autoplay: player.isPlaying });
    }
  } catch (err: any) {
    Notify.create({ type: "negative", message: err?.message || "Не удалось сохранить файл" });
  } finally {
    importingFile.value = false;
    target.value = "";
  }
}

function saveUrlOverride() {
  vibrateTick(10);
  const src = customUrl.value.trim();
  if (!src) {
    Notify.create({ type: "negative", message: "Укажите ссылку на файл", timeout: 1500 });
    return;
  }
  setOverride(props.track.id, src, customLabel.value.trim() || "ссылка");
  replaceTick.value += 1;
  replaceOpen.value = false;
  Notify.create({ message: "Ссылка сохранена", timeout: 1500 });
  if (player.current?.id === props.track.id) {
    void player.loadCurrent({ startAt: 0, autoplay: player.isPlaying });
  }
}

async function dropReplacement() {
  vibrateTick(15);
  clearOverride(props.track.id);
  await api.removeLocalTrack(props.track.id).catch(() => {});
  replaceTick.value += 1;
  customUrl.value = "";
  replaceOpen.value = false;
  Notify.create({ message: "Подмена удалена, возвращён оригинал", timeout: 1500 });
  if (player.current?.id === props.track.id) {
    void player.loadCurrent({ startAt: 0, autoplay: player.isPlaying });
  }
}

function goToArtist() {
  const first = props.track.artists?.[0];
  if (first?.id) {
    close();
    player.fullscreen = false;
    router.push(`/artists/${first.id}`);
  }
}

function goToAlbum() {
  if (props.track.album_id) {
    close();
    player.fullscreen = false;
    router.push(`/albums/${props.track.album_id}`);
  }
}

function copyLink() {
  const url = `https://music.yandex.ru/track/${props.track.id}`;
  navigator.clipboard.writeText(url).then(() => {
    Notify.create({ message: "Ссылка скопирована", timeout: 1500 });
  });
  close();
}
</script>

<style scoped>
.mobile-bottom-sheet :deep(.q-dialog__inner),
.mobile-replace-dialog :deep(.q-dialog__inner) {
  padding: 0;
}

.sheet-content,
.replace-sheet-card {
  width: 100vw;
  background: #151518;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding: 12px 16px calc(env(safe-area-inset-bottom, 16px) + 16px);
  color: #fff;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.6);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.sheet-handle-bar {
  display: flex;
  justify-content: center;
  padding-bottom: 12px;
}

.sheet-handle {
  width: 36px;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.sheet-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 4px 12px;
}

.sheet-cover {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
  background: #232328;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sheet-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sheet-header-meta {
  flex: 1;
  min-width: 0;
}

.sheet-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.sheet-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 2px;
}

.sheet-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin-bottom: 8px;
}

.sheet-actions {
  display: flex;
  flex-direction: column;
}

.sheet-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  height: 48px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  font-weight: 500;
  padding: 0 8px;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
}

.sheet-item:active {
  background: rgba(255, 255, 255, 0.08);
}

.text-red {
  color: #fa2d48;
}

.text-accent {
  color: #fa2d48;
}

.badge-active {
  background: rgba(250, 45, 72, 0.2);
  color: #fa2d48;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  font-weight: 600;
}

/* Replace Sheet */
.replace-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.replace-title {
  font-size: 17px;
  font-weight: 650;
  color: #fff;
}

.replace-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.icon-close {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  cursor: pointer;
}

.replace-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.replace-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s;
}

.replace-btn.primary {
  background: #fa2d48;
  color: #fff;
}

.replace-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.replace-btn.danger {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.replace-url-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
}

.replace-input {
  width: 100%;
  background: #1c1c20;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: #fff;
  box-sizing: border-box;
}

.replace-input:focus {
  outline: none;
  border-color: #fa2d48;
}

.wifi-sync-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(250, 45, 72, 0.4);
  border-radius: 12px;
  padding: 12px;
}

.sync-toggle-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.sync-toggle-btn.active {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.wifi-url-text {
  font-family: monospace;
  font-size: 13px;
  font-weight: 650;
  color: #fa2d48;
}
</style>
