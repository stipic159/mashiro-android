import { Platform } from "quasar";
import type { AudioDriver } from "./driver";
import { NativeAudioDriver } from "./nativeDriver";
import { WebAudioDriver } from "./webDriver";

export type { AudioDriver, AudioDriverCallbacks, PlayTrackPayload } from "./driver";

let driverInstance: AudioDriver | null = null;

export function getAudioDriver(): AudioDriver {
  if (!driverInstance) {
    const isMobile = Boolean(Platform.is.android || Platform.is.mobile);
    driverInstance = isMobile ? new NativeAudioDriver() : new WebAudioDriver();
  }
  return driverInstance;
}
