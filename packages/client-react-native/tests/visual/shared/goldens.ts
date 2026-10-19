import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ANDROID_PIN, IOS_PIN } from "./devicePin.ts";
import type { Platform } from "./platform.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const VISUAL_ROOT = join(HERE, "..");

/** One golden set per device, named for what took the shots: the iPhone 17
 * simulator on iOS 26, and the Pixel 10a emulator on API 37. A golden is only
 * comparable to a shot from the same device, so the pin is part of the path —
 * derived from `devicePin.ts`, which the runners also use to choose the device,
 * so the folder and the device cannot disagree. */
export const DEVICE_PINS: Record<Platform, string> = {
  ios: `ios-${slug(IOS_PIN.displayName)}-${IOS_PIN.runtimeMajor}`,
  android: `android-${slug(ANDROID_PIN.displayName)}-${ANDROID_PIN.apiLevel}`,
};

export type Tier = "simctl" | "maestro";

export function goldenPath(
  tier: Tier,
  scenarioId: string,
  platform: Platform = "ios",
): string {
  return join(
    VISUAL_ROOT,
    "__screenshots__",
    DEVICE_PINS[platform],
    tier,
    `${scenarioId}.png`,
  );
}

/** `iPhone 17` → `iphone17`. */
function slug(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
}
