import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Platform } from "./platform.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const VISUAL_ROOT = join(HERE, "..");

/** One golden set per device, named for what took the shots: the iPhone 17
 * simulator on iOS 26, and the Pixel 10a emulator on API 37. A golden is only
 * comparable to a shot from the same device, so the pin is part of the path. */
export const DEVICE_PINS: Record<Platform, string> = {
  ios: "ios-iphone17-26",
  android: "android-pixel10a-37",
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
