import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VISUAL_ROOT = join(HERE, "..");

export const DEVICE_PIN = "ios-iphone15-18";

export type Tier = "simctl" | "maestro";

export function goldenPath(tier: Tier, scenarioId: string): string {
  return join(
    VISUAL_ROOT,
    "__screenshots__",
    DEVICE_PIN,
    tier,
    `${scenarioId}.png`,
  );
}
