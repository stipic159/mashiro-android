<template>
  <div class="playlist-toolbar">
    <div class="field playlist-filter">
      <Icon name="mingcute:search-2-line" :size="15" class="faint" />
      <input
        :value="filter"
        type="text"
        spellcheck="false"
        placeholder="Найти в плейлисте"
        @input="emit('update:filter', ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="filter"
        class="icon-btn xs"
        type="button"
        title="Сбросить"
        @click="emit('update:filter', '')"
      >
        <Icon name="mingcute:close-line" :size="13" />
      </button>
    </div>

    <button class="btn" type="button" title="Сортировка">
      <Icon name="mingcute:filter-line" :size="15" />
      <span>{{ sortLabel }}</span>
      <Icon name="mingcute:down-line" :size="13" />
      <q-menu class="menu" anchor="bottom left" self="top left">
        <div class="menu-body" style="min-width: 220px">
          <div
            v-for="option in sortOptions"
            :key="option.id"
            class="menu-item"
            v-close-popup
            @click="emit('update:sortMode', option.id)"
          >
            <Icon
              :name="sortMode === option.id ? 'mingcute:check-line' : 'mingcute:pencil-line'"
              :size="16"
            />
            <span>{{ option.label }}</span>
          </div>
        </div>
      </q-menu>
    </button>

    <button
      class="btn"
      type="button"
      :title="
        sortDir === 'asc'
          ? 'Сейчас по возрастанию - нажми для убывания'
          : 'Сейчас по убыванию - нажми для возрастания'
      "
      @click="emit('update:sortDir', sortDir === 'asc' ? 'desc' : 'asc')"
    >
      <span class="t-13 w-600">{{ sortDir === "asc" ? "↑" : "↓" }}</span>
      <span>{{ sortDir === "asc" ? "По возрастанию" : "По убыванию" }}</span>
    </button>

    <div class="col" />

    <div v-if="filter" class="faint t-12">
      {{ plural(matchCount, "совпадение", "совпадения", "совпадений") }}
    </div>
    <div v-else-if="canReorder" class="faint t-12">
      Перетаскивай треки, чтобы менять порядок
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { plural } from "@/lib/format";

export type SortMode = "custom" | "title" | "artist" | "album" | "duration";

export interface SortOption {
  id: SortMode;
  label: string;
}

const props = defineProps<{
  filter: string;
  sortMode: SortMode;
  sortDir: "asc" | "desc";
  sortOptions: SortOption[];
  matchCount: number;
  canReorder: boolean;
}>();

const emit = defineEmits<{
  (e: "update:filter", val: string): void;
  (e: "update:sortMode", val: SortMode): void;
  (e: "update:sortDir", val: "asc" | "desc"): void;
}>();

const sortLabel = computed(
  () => props.sortOptions.find((o) => o.id === props.sortMode)?.label ?? "",
);
</script>
