import { computed, onMounted, onUnmounted, ref } from "vue";
import { Platform } from "quasar";

const width = ref(typeof window !== "undefined" ? window.innerWidth : 1024);

function onResize() {
  width.value = window.innerWidth;
}

if (typeof window !== "undefined") {
  window.addEventListener("resize", onResize, { passive: true });
}

export function vibrateTick(durationMs = 15) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(durationMs);
    }
  } catch {
    // Ignore vibration errors if not permitted
  }
}

export function useMobile() {
  const isMobile = computed(() => {
    return width.value <= 768 || Boolean(Platform.is.mobile) || Boolean(Platform.is.android);
  });

  const isTablet = computed(() => {
    return width.value > 768 && width.value <= 1024;
  });

  const triggerHaptic = (durationMs = 15) => {
    vibrateTick(durationMs);
  };

  return {
    isMobile,
    isTablet,
    triggerHaptic,
  };
}
