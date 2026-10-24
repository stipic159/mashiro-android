<template>
  <div>
    <button
      v-if="hint"
      ref="hintEl"
      type="button"
      class="lyric-hint"
      :style="{ left: `${hint.x}px`, top: `${hint.y}px` }"
      @click.stop="emit('openHint')"
    >
      <Icon name="mingcute:information-line" :size="14" />
      <span>Разбор строки</span>
    </button>

    <q-dialog
      :model-value="Boolean(activeAnnotation)"
      @update:model-value="emit('update:activeAnnotation', null)"
    >
      <div class="ann-card">
        <div class="ann-head">
          <div class="ann-title ellipsis">{{ trackTitle }}</div>
          <div class="icon-btn round" @click="emit('update:activeAnnotation', null)">
            <Icon name="mingcute:close-line" :size="16" />
          </div>
        </div>
        <div v-if="activeAnnotation" class="ann-frag">
          {{ activeAnnotation.fragment }}
        </div>
        <p v-if="activeAnnotation" class="ann-text">
          {{ activeAnnotation.text }}
        </p>
        <div class="ann-foot">
          <span class="ann-by ellipsis">
            {{
              activeAnnotation?.authors?.length
                ? activeAnnotation.authors.map((a) => a.name).join(", ")
                : "Genius"
            }}
          </span>
          <a
            v-if="activeAnnotation?.url"
            class="ann-link"
            @click.prevent="openExternal(activeAnnotation.url)"
            >Источник</a
          >
        </div>
      </div>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { GeniusQuote } from "@/api/types";

defineProps<{
  activeAnnotation: GeniusQuote | null;
  hint: { x: number; y: number; quote: GeniusQuote } | null;
  trackTitle: string;
}>();

const emit = defineEmits<{
  (e: "update:activeAnnotation", val: GeniusQuote | null): void;
  (e: "openHint"): void;
}>();

const hintEl = ref<HTMLElement | null>(null);

function openExternal(url: string) {
  window.open(url, "_blank");
}
</script>
