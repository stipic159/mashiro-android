<template>
  <div class="eq-panel">
    <!-- Android System Equalizer Button -->
    <div v-if="isMobile" class="eq-mobile-card">
      <div class="row items-center no-wrap q-gutter-sm">
        <Icon name="mingcute:equalizer-line" :size="20" class="text-white" />
        <div class="col" style="min-width: 0">
          <div class="t-13 w-600">Системный эквалайзер устройства</div>
          <div class="t-11 faint">
            Dolby Atmos, Dirac или встроенные аудиоэффекты Android
          </div>
        </div>
        <button
          type="button"
          class="btn-primary sm round"
          @click="openSystemEq"
        >
          Открыть
        </button>
      </div>
    </div>

    <div class="eq-head">
      <button class="eq-power" :class="{ on: eq.enabled }" @click="eq.toggle()">
        {{ eq.enabled ? "Включён" : "Выключен" }}
      </button>
      <div class="eq-presets">
        <button
          v-for="preset in presets"
          :key="preset.id"
          :class="{ on: eq.activePreset === preset.id }"
          @click="eq.usePreset(preset.id)"
        >
          {{ preset.label }}
        </button>
      </div>
      <button class="eq-reset" @click="eq.reset()">Сбросить</button>
    </div>

    <div class="eq-bands" :class="{ off: !eq.enabled }">
      <div v-for="(band, index) in eq.bands" :key="band" class="eq-band">
        <span class="eq-gain">{{ formatGain(eq.gains[index] ?? 0) }}</span>
        <q-slider
          :model-value="eq.gains[index] ?? 0"
          :min="-12"
          :max="12"
          :step="0.5"
          vertical
          reverse
          dense
          @update:model-value="eq.setBand(index, Number($event ?? 0))"
        />
        <span class="eq-freq">{{ formatFreq(band) }}</span>
      </div>
    </div>

    <div class="eq-preamp">
      <span>Предусиление</span>
      <q-slider
        :model-value="eq.preamp"
        :min="-12"
        :max="12"
        :step="0.5"
        dense
        @update:model-value="eq.setPreamp(Number($event ?? 0))"
      />
      <code>{{ formatGain(eq.preamp) }}</code>
    </div>

    <div v-if="eq.unsupported" class="eq-warning">
      Эквалайзер недоступен для текущего потока. Попробуй перезапустить трек.
    </div>
  </div>
</template>

<script setup lang="ts">
import { Notify } from "quasar";
import { useMobile } from "@/composables/useMobile";
import { nativeOpenSystemEqualizer } from "@/lib/nativeAudio";
import { eqPresets, useEqualizerStore } from "@/stores/equalizer";

const { isMobile } = useMobile();
const eq = useEqualizerStore();
const presets = eqPresets;

async function openSystemEq() {
  try {
    await nativeOpenSystemEqualizer();
  } catch (e) {
    Notify.create({
      type: "warning",
      message: "Не удалось открыть системный эквалайзер на этом устройстве",
    });
  }
}

function formatFreq(value: number): string {
  return value >= 1000 ? `${value / 1000}k` : `${value}`;
}

function formatGain(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}
</script>

<style scoped>
.eq-mobile-card {
  padding: 12px 14px;
  background: var(--surface-2, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius, 12px);
  margin-bottom: 8px;
}
.btn-primary.sm {
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
