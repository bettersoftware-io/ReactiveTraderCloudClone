import { spawnSync } from "node:child_process";
import { argv, exit } from "node:process";

import { refreshStaleNativeProject } from "./nativeProject.ts";

/**
 * `expo run:ios`, with `ios/` regenerated first when its native inputs changed
 * since it was generated — `expo run:ios` alone only prebuilds a MISSING
 * `ios/`, and builds a stale one as it is. What the `dev:ios*` scripts run;
 * arguments pass through to `expo run:ios`:
 *
 *   pnpm dev:ios                          # from the repo root
 *   pnpm dev:ios --device "iPhone 17"
 */
async function main(): Promise<void> {
  await refreshStaleNativeProject("ios");

  const run = spawnSync("pnpm", ["exec", "expo", "run:ios", ...argv.slice(2)], {
    stdio: "inherit",
  });

  exit(run.status ?? 1);
}

await main();
