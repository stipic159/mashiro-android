<template>
  <div
    v-if="player.showLyrics"
    ref="root"
    class="lyrics-wrap"
    :class="{ 'lyrics-fs': player.lyricsFullscreen, glow: s.glow }"
    :style="visualStyle"
  >
    <div
      v-if="s.backdrop === 'cover' && coverUrl"
      class="lyrics-backdrop"
      :style="{ backgroundImage: `url(${coverUrl})` }"
    />
    <div v-else-if="s.backdrop === 'gradient'" class="lyrics-gradient" />
    <div class="lyrics-shade" />
    <canvas v-if="ambientOn" ref="vizCanvas" class="lyrics-visualizer" />

    <LyricsToolbar
      :current-track="player.current"
      :cover-url="coverUrl"
      :artist-label="artistLabel"
      :sources="sources"
      :pick="pick"
      :show-settings="showSettings"
      :lyrics-fullscreen="player.lyricsFullscreen"
      @open-album="openAlbum"
      @open-artist="openArtist"
      @choose-source="choose"
      @reload-lyrics="player.loadLyrics(true)"
      @toggle-settings="showSettings = !showSettings"
      @toggle-fullscreen="player.toggleLyricsFullscreen()"
      @open-artwork-fullscreen="player.openFullscreen()"
      @close-lyrics="player.toggleLyrics()"
    />

    <LyricsSettingsPanel v-if="showSettings" />

    <div
      v-if="player.lyricsLoading && !lines.length"
      class="lyrics-empty lyrics-layer"
    >
      <q-spinner size="24px" color="primary" />
      <div class="lyrics-empty-sub">Ищем текст в {{ searchingIn }}…</div>
    </div>

    <div v-else-if="!lines.length" class="lyrics-empty lyrics-layer">
      <Icon name="mingcute:subtitle-line" :size="26" />
      <div class="lyrics-empty-title">
        {{ player.lyricsError || "Текста для этого трека нет" }}
      </div>
      <div class="lyrics-empty-sub">
        Можно поискать в другом источнике: LRCLIB даёт строки с таймингами,
        Genius - полный текст с авторами.
      </div>
      <div class="lyrics-empty-actions">
        <button
          type="button"
          class="lyrics-chip"
          @click="choose('lrclib', true)"
        >
          Искать в LRCLIB
        </button>
        <button
          type="button"
          class="lyrics-chip"
          @click="choose('genius', true)"
        >
          Искать в Genius
        </button>
        <button type="button" class="lyrics-chip" @click="choose('auto', true)">
          Автоматически
        </button>
      </div>
    </div>

    <template v-else>
      <div
        class="lyrics-stage lyrics-layer"
        :class="{ 'no-artwork': !artworkVisible }"
        @wheel="onStageWheel"
      >
        <div v-if="artworkVisible" class="lyrics-artwork-column">
          <div
            class="lyrics-artwork"
            :class="{ playing: player.isPlaying && s.motion }"
            @click="player.toggleLyricsFullscreen()"
          >
            <img loading="lazy" decoding="async" :src="coverUrl" />
            <div class="lyrics-artwork-side">
              <button
                type="button"
                class="la-btn"
                :class="{ on: isLiked }"
                @click.stop="toggleLike"
              >
                <Icon :name="isLiked ? 'mingcute:heart-fill' : 'mingcute:heart-line'" :size="17" />
                <q-tooltip>
                  {{ isLiked ? "Убрать из любимых" : "Мне нравится" }}
                </q-tooltip>
              </button>
              <button
                type="button"
                class="la-btn"
                @click.stop="player.openFullscreen()"
              >
                <Icon name="mingcute:album-line" :size="17" />
                <q-tooltip>Большая обложка</q-tooltip>
              </button>
            </div>

            <div class="lyrics-artwork-controls">
              <button
                type="button"
                class="la-btn"
                :class="{ on: player.shuffle }"
                @click.stop="player.toggleShuffle()"
              >
                <Icon name="mingcute:shuffle-line" :size="16" />
                <q-tooltip>Перемешать</q-tooltip>
              </button>
              <button
                type="button"
                class="la-btn"
                :disabled="!player.hasPrev"
                @click.stop="player.prev()"
              >
                <Icon name="mingcute:skip-previous-fill" :size="18" />
              </button>
              <button
                type="button"
                class="la-btn la-btn-main"
                @click.stop="player.toggle()"
              >
                <Icon :name="player.isPlaying ? 'mingcute:pause-fill' : 'mingcute:play-fill'" :size="22" />
              </button>
              <button
                type="button"
                class="la-btn"
                :disabled="!player.hasNext"
                @click.stop="player.next()"
              >
                <Icon name="mingcute:fast-forward-fill" :size="18" />
              </button>
              <button
                type="button"
                class="la-btn"
                :class="{ on: player.repeat !== 'off' }"
                @click.stop="player.cycleRepeat()"
              >
                <Icon
                  :name="player.repeat === 'one' ? 'mingcute:repeat-one-line' : 'mingcute:repeat-line'"
                  :size="16"
                />
                <q-tooltip>Повтор</q-tooltip>
              </button>
            </div>
          </div>
          <div class="lyrics-artwork-meta">
            <div class="lyrics-artwork-title">{{ player.current?.title }}</div>
            <div class="lyrics-subtitle ellipsis">{{ artistLabel }}</div>
          </div>
        </div>

        <q-scroll-area ref="scroller" class="lyrics-scroll">
          <div
            class="lyrics-lines"
            :class="[
              `align-${s.align}`,
              `hl-${s.highlight}`,
              `ann-${markMode}`,
              { motion: s.motion && synced, plain: !synced },
            ]"
          >
            <template v-if="synced">
              <div v-if="introDots" class="lyrics-intro-dots">
                <span class="lyric-dots live" :class="{ out: dotsOut }">
                  <i
                    v-for="n in 3"
                    :key="n"
                    :style="{ '--f': dotLevel(n - 1) }"
                  />
                </span>
              </div>
              <button
                v-for="(line, i) in lines"
                :key="i"
                :ref="(el) => setLineRef(el, i)"
                class="lyric-line"
                :class="[
                  lineClass(i),
                  {
                    annotated: !!lineAnnotations[i],
                    'kw-on': karaokeWordActive(i),
                  },
                ]"
                :style="i === player.activeLine ? fillStyle : undefined"
                @click="seekTo(line.time_ms)"
                @contextmenu.stop.prevent="onLineMenu($event, i)"
              >
                <span class="lyric-text"
                  ><template v-if="translateReplace && lineTranslation(i)">{{
                    lineTranslation(i)
                  }}</template
                  ><template v-else-if="karaokeWordActive(i)"
                    ><span
                      v-for="(w, wi) in activeWords"
                      :key="wi"
                      class="lyric-kw"
                      :style="{ '--wp': wordFill(wi) + '%' }"
                      >{{ w }}</span
                    ></template
                  ><template v-else-if="line.text">{{ line.text }}</template
                  ><span
                    v-else-if="dotsAllowed(i)"
                    class="lyric-dots"
                    :class="{
                      live: i === player.activeLine,
                      out: i === player.activeLine && dotsOut,
                    }"
                    ><i
                      v-for="n in 3"
                      :key="n"
                      :style="{ '--f': lineDotLevel(i, n - 1) }"
                  /></span> </span
                ><span
                  v-if="lineAnnotations[i]"
                  class="lyric-note"
                  title="Разбор строки"
                  @click.stop="openAnnotation(lineAnnotations[i])"
                >
                  <Icon name="mingcute:information-line" :size="10" />
                </span>
                <span
                  v-if="!translateReplace && lineTranslation(i)"
                  class="lyric-tr"
                  >{{ lineTranslation(i) }}</span
                >
              </button>
            </template>
            <div v-else class="lyrics-plain-text">
              <p
                v-for="(line, i) in lines"
                :key="i"
                :class="{
                  'lyric-part': isPart(line.text),
                  annotated: !isPart(line.text) && !!lineAnnotations[i],
                }"
                @click="
                  !isPart(line.text) &&
                  lineAnnotations[i] &&
                  openAnnotation(lineAnnotations[i])
                "
                @contextmenu.stop.prevent="onLineMenu($event, i)"
              >
                <span class="lyric-text">{{
                  !isPart(line.text) && translateReplace && lineTranslation(i)
                    ? lineTranslation(i)
                    : partLabel(line.text)
                }}</span>
                <span
                  v-if="!isPart(line.text) && lineAnnotations[i]"
                  class="lyric-note"
                  title="Разбор строки"
                  @click.stop="openAnnotation(lineAnnotations[i])"
                >
                  <Icon name="mingcute:information-line" :size="10" />
                </span>
                <span
                  v-if="
                    !isPart(line.text) &&
                    !translateReplace &&
                    lineTranslation(i)
                  "
                  class="lyric-tr"
                  >{{ lineTranslation(i) }}</span
                >
              </p>
            </div>
          </div>
        </q-scroll-area>
      </div>

      <div v-if="footVisible" class="lyrics-foot">
        <span v-if="originTag && ui.settings.lyricsShowOrigin"
          >Источник: <b>{{ originTag }}</b></span
        >

        <template v-if="creditsVisible">
          <span v-if="credits.length" class="lyrics-people">
            <button
              v-for="person in credits"
              :key="`${person.id}-${person.role}-${person.name}`"
              type="button"
              class="lyrics-person"
              @click="openPerson(person)"
            >
              <img v-if="person.image" :src="person.image" alt="" />
              <span v-else class="lyrics-person-dot">{{
                person.name.slice(0, 1)
              }}</span>
              <span>{{ person.name }}</span>
              <i>{{ person.role }}</i>
            </button>
          </span>
          <span v-else-if="writers"
            >Авторы: <b>{{ writers }}</b></span
          >
        </template>
      </div>
    </template>

    <LyricsAnnotationModal
      :active-annotation="activeAnnotation"
      :hint="hint"
      :track-title="player.current?.title || ''"
      @update:active-annotation="activeAnnotation = $event"
      @open-hint="openHint"
    />

    <TrackMenu
      v-if="player.current"
      :track="player.current"
      :context-menu="true"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { QScrollArea } from "quasar";
import { useRoute, useRouter } from "vue-router";
import LyricsSettingsPanel from "@/components/lyrics/LyricsSettingsPanel.vue";
import LyricsToolbar, { type SourcePick } from "@/components/lyrics/LyricsToolbar.vue";
import LyricsAnnotationModal from "@/components/lyrics/LyricsAnnotationModal.vue";
import TrackMenu from "@/components/TrackMenu.vue";
import type { GeniusQuote } from "@/api/types";
import { audio } from "@/lib/audio";
import { useVisualizer } from "@/composables/useVisualizer";
import { artistNames } from "@/lib/format";
import { ORIGIN_LABEL } from "@/lib/lyricsSource";
import { useGeniusStore } from "@/stores/genius";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player/index";
import { useUiStore } from "@/stores/ui/index";

type Credit = { id: number; name: string; role: string; image: string };

const player = usePlayerStore();
const router = useRouter();
const route = useRoute();
const ui = useUiStore();
const genius = useGeniusStore();
const library = useLibraryStore();

const s = computed(() => ({
  fontSize: ui.settings.lyricsFontSize,
  lineHeight: ui.settings.lyricsLineHeight,
  weight: ui.settings.lyricsWeight,
  backgroundBlur: ui.settings.lyricsBackgroundBlur,
  backgroundOpacity: ui.settings.lyricsBackgroundOpacity,
  lineBlur: ui.settings.lyricsLineBlur,
  inactive: ui.settings.lyricsInactive,
  align: ui.settings.lyricsAlign,
  backdrop: ui.settings.lyricsBackdrop,
  highlight: ui.settings.lyricsHighlight,
  glow: ui.settings.lyricsGlow,
  showArtwork: ui.settings.lyricsShowArtwork,
  motion: ui.settings.lyricsMotion,
  annotations: ui.settings.lyricsAnnotations,
  annotationMark: ui.settings.lyricsAnnotationMark,
}));

const markMode = computed(() =>
  s.value.annotations ? s.value.annotationMark : "off",
);

const showSettings = ref(false);
const scroller = ref<QScrollArea | null>(null);
const lineRefs = ref<Array<HTMLElement | null>>([]);

const ARTWORK_MIN_WIDTH = 900;
const root = ref<HTMLElement | null>(null);
const panelWidth = ref(1400);
let sizeObserver: ResizeObserver | null = null;

watch(root, (el) => {
  sizeObserver?.disconnect();
  sizeObserver = null;
  if (!el || typeof ResizeObserver === "undefined") return;
  panelWidth.value = el.clientWidth || panelWidth.value;
  sizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width;
    if (width) panelWidth.value = width;
  });
  sizeObserver.observe(el);
});

onBeforeUnmount(() => {
  sizeObserver?.disconnect();
  sizeObserver = null;
});

const lines = computed(() => player.lyrics?.lines || []);
const synced = computed(() => Boolean(player.lyrics?.synced));

const coverUrl = computed(() => {
  const track = player.current;
  const url = track?.cover_url_large || track?.cover_url || "";
  return url.replace(/\/\d+x\d+(?=$|\?)/, "/1000x1000");
});
const artistLabel = computed(() =>
  player.current ? artistNames(player.current.artists) : "",
);
const writers = computed(() => player.lyrics?.writers?.join(", ") || "");

const artworkVisible = computed(
  () =>
    s.value.showArtwork &&
    Boolean(coverUrl.value) &&
    panelWidth.value >= ARTWORK_MIN_WIDTH,
);

const isLiked = computed(() =>
  player.current ? library.liked(player.current.id) : false,
);

function toggleLike() {
  if (player.current) void library.toggleLike(player.current);
}

const credits = computed<Credit[]>(() => {
  const current = player.current;
  if (!current || genius.songKey !== String(current.id)) return [];
  return (genius.songPeople as Credit[])
    .filter((person) => person.id > 0)
    .slice(0, 8);
});

function openPerson(person: Credit) {
  void router.push({
    name: "genius-artist",
    params: { id: String(person.id) },
    query: { role: person.role },
  });
}

const annotations = computed<GeniusQuote[]>(() => {
  const current = player.current;
  if (!current || genius.songKey !== String(current.id)) return [];
  return genius.song?.quotes || [];
});

function normText(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function annotationFor(text: string): GeniusQuote | null {
  const line = normText(text);
  if (line.length < 6) return null;

  for (const quote of annotations.value) {
    const frag = normText(quote.fragment);
    if (!frag) continue;
    if (frag.includes(line) || line.includes(frag)) return quote;

    const parts = (quote.fragment || "")
      .split(/\r?\n/)
      .map(normText)
      .filter((part) => part.length >= 6);
    if (parts.some((part) => part === line || part.includes(line))) {
      return quote;
    }
  }
  return null;
}

const lineAnnotations = computed<Array<GeniusQuote | null>>(() => {
  if (!s.value.annotations) return lines.value.map(() => null);
  return lines.value.map((line) => annotationFor(line.text));
});

const activeAnnotation = ref<GeniusQuote | null>(null);

function openAnnotation(quote: GeniusQuote | null) {
  if (quote) activeAnnotation.value = quote;
  hint.value = null;
}

const hint = ref<{ x: number; y: number; quote: GeniusQuote } | null>(null);

function onLineMenu(event: MouseEvent, index: number) {
  const quote = lineAnnotations.value[index];
  if (!quote) {
    hint.value = null;
    return;
  }
  hint.value = {
    x: Math.min(event.clientX, window.innerWidth - 190),
    y: Math.min(event.clientY, window.innerHeight - 60),
    quote,
  };
}

function openHint() {
  openAnnotation(hint.value?.quote ?? null);
}

const pick = computed<SourcePick>(
  () => (player.lyricsPick as SourcePick) || "auto",
);

const sources: Array<{ id: SourcePick; label: string }> = [
  { id: "auto", label: "Авто" },
  { id: "lrclib", label: "LRCLIB" },
  { id: "genius", label: "Genius" },
];

const searchingIn = computed(() => {
  if (pick.value === "lrclib") return "LRCLIB";
  if (pick.value === "genius") return "Genius";
  return "Яндекс Музыке, LRCLIB и Genius";
});

const originTag = computed(() => {
  const orig = player.lyricsOrigin;
  return orig ? ORIGIN_LABEL[orig] : "";
});

const footVisible = computed(() => {
  if (!ui.settings.lyricsShowCredits) return false;
  return Boolean(originTag.value || credits.value.length || writers.value);
});

const creditsVisible = computed(
  () => credits.value.length > 0 || Boolean(writers.value),
);

const translateReplace = computed(
  () =>
    ui.settings.lyricsTranslate &&
    ui.settings.lyricsTranslateMode === "replace",
);

function lineTranslation(i: number): string {
  if (!ui.settings.lyricsTranslate) return "";
  const t = player.lyricsTranslation;
  return t && t[i] ? t[i].trim() : "";
}

function isPart(text: string): boolean {
  const t = (text || "").trim();
  return (
    (t.startsWith("[") && t.endsWith("]")) ||
    (t.startsWith("(") && t.endsWith(")"))
  );
}

function partLabel(text: string): string {
  const t = (text || "").trim();
  if (isPart(t)) return t.slice(1, -1);
  return t;
}

function choose(p: SourcePick, force = false) {
  void player.setLyricsSource(p, force);
}

const ambientOn = computed(
  () => ui.settings.lyricsVisualizer && player.isPlaying,
);

const vizCanvas = ref<HTMLCanvasElement | null>(null);
useVisualizer(vizCanvas, () => ambientOn.value, { bars: 48 });

const visualStyle = computed(() => {
  const st = s.value;
  return {
    "--lyrics-fs": `${st.fontSize}px`,
    "--lyrics-lh": String(st.lineHeight),
    "--lyrics-fw": String(st.weight),
    "--lyrics-blur": `${st.backgroundBlur}px`,
    "--lyrics-opacity": `${st.backgroundOpacity / 100}`,
    "--lyrics-line-blur": `${st.lineBlur}px`,
    "--lyrics-inactive": `${st.inactive / 100}`,
  };
});

const fill = ref(0);
const dotsFill = ref(0);

const fillStyle = computed(() => {
  const p = fill.value;
  return {
    "--fill": `${p}%`,
    "--fill-ratio": (p / 100).toFixed(3),
  };
});

const wordKaraoke = computed(
  () => s.value.highlight === "karaoke" && ui.settings.lyricsKaraokeWord,
);

const DOTS_MIN_GAP = 5500;
const DOTS_LEAD = 400;
const DOTS_TAIL = 400;

const dotsOut = computed(() => dotsFill.value >= 98);

function gapProgress(elapsed: number, total: number): number {
  if (elapsed < DOTS_LEAD) return 0;
  const usable = total - DOTS_LEAD - DOTS_TAIL;
  if (usable <= 0) return 0;
  return Math.min(100, Math.max(0, ((elapsed - DOTS_LEAD) / usable) * 100));
}

function dotLevel(n: number): number {
  return Math.min(1, Math.max(0, (dotsFill.value / 100) * 3 - n));
}

function lineDotLevel(i: number, n: number): number {
  return i === player.activeLine ? dotLevel(n) : 0;
}

function dotsAllowed(i: number): boolean {
  const list = lines.value;
  const next = list[i + 1];
  return !!next && next.time_ms - list[i].time_ms >= DOTS_MIN_GAP;
}

const tickOn = computed(() => player.showLyrics && synced.value);

const introDots = computed(
  () =>
    synced.value &&
    player.activeLine < 0 &&
    (lines.value[0]?.time_ms ?? 0) >= DOTS_MIN_GAP,
);

const activeWords = computed<string[]>(() => {
  if (!wordKaraoke.value) return [];
  const line = lines.value[player.activeLine];
  return (line?.text || "").match(/\S+\s*/gu) ?? [];
});

const wordBounds = computed<Array<[number, number]>>(() => {
  const words = activeWords.value;
  const total = words.reduce((sum, w) => sum + w.length, 0) || 1;
  let acc = 0;
  return words.map((w) => {
    const start = acc / total;
    acc += w.length;
    return [start, acc / total] as [number, number];
  });
});

function wordFill(index: number): number {
  const bounds = wordBounds.value[index];
  if (!bounds) return 0;
  const [start, end] = bounds;
  const p = fill.value / 100;
  if (p <= start) return 0;
  if (p >= end) return 100;
  return ((p - start) / (end - start || 1)) * 100;
}

function karaokeWordActive(i: number): boolean {
  return (
    wordKaraoke.value && i === player.activeLine && activeWords.value.length > 0
  );
}

let raf = 0;

function tick() {
  const index = player.activeLine;
  const list = lines.value;
  const line = index >= 0 ? list[index] : null;
  const now = audio.currentTime * 1000;
  if (line) {
    const start = line.time_ms;
    const end = list[index + 1]?.time_ms ?? start + 4200;
    const span = Math.max(320, end - start);
    fill.value = Math.min(100, Math.max(0, ((now - start) / span) * 100));
    dotsFill.value = line.text ? 0 : gapProgress(now - start, end - start);
  } else {
    fill.value = 0;
    const first = list[0]?.time_ms ?? 0;
    dotsFill.value = first > 0 ? gapProgress(now, first) : 0;
  }
  raf = requestAnimationFrame(tick);
}

function stopTick() {
  if (!raf) return;
  cancelAnimationFrame(raf);
  raf = 0;
  fill.value = 0;
  dotsFill.value = 0;
}

watch(
  tickOn,
  (on) => {
    if (on && !raf) raf = requestAnimationFrame(tick);
    if (!on) stopTick();
  },
  { immediate: true },
);

onBeforeUnmount(stopTick);

function openAlbum() {
  const id = player.current?.album_id;
  if (id) void router.push(`/album/${id}`);
}

function openArtist() {
  const id = player.current?.artists[0]?.id;
  if (id) void router.push(`/artist/${id}`);
}

function setLineRef(el: unknown, i: number) {
  lineRefs.value[i] = (el as HTMLElement | null) ?? null;
}

function seekTo(ms: number) {
  if (synced.value && ms >= 0) player.seek(ms / 1000);
}

function lineClass(i: number) {
  const active = player.activeLine;
  return {
    on: i === active,
    past: synced.value && i < active,
    near: synced.value && Math.abs(i - active) === 1,
    far: synced.value && active >= 0 && Math.abs(i - active) > 1,
  };
}

function onStageWheel(event: WheelEvent) {
  const area = scroller.value;
  if (!area) return;
  const target = area.getScrollTarget() as HTMLElement | null;
  if (!target) return;
  const max = target.scrollHeight - target.clientHeight;
  if (max <= 0) return;
  event.preventDefault();
  event.stopPropagation();
  let step = event.deltaY;
  if (event.deltaMode === 1) step *= 18;
  else if (event.deltaMode === 2) step *= target.clientHeight;
  target.scrollTop = Math.min(max, Math.max(0, target.scrollTop + step));
}

watch(
  () => player.activeLine,
  (i) => {
    if (!synced.value || i < 0) return;
    const el = lineRefs.value[i];
    const area = scroller.value;
    if (!el || !area) return;
    const target = Math.max(0, el.offsetTop - area.$el.clientHeight * 0.42);
    area.setScrollPosition("vertical", target, s.value.motion ? 520 : 0);
  },
);

watch(
  () => route.fullPath,
  () => {
    if (player.lyricsFullscreen) player.closeLyrics();
  },
);
</script>
