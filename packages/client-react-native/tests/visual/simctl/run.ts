import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { argv, env, exit } from "node:process";

import { SCENARIO_IDS } from "../scenarioIds";
import { compareToGolden } from "../shared/diff";
import { goldenPath } from "../shared/goldens";
import { createSimctlDriver } from "./capture";

/**
 * Tier 1 CLI runner: captures every registered `Scenario` via the `simctl`
 * driver, diffs each against its committed golden with the shared
 * `pixelmatch` core, and reports pass/fail per scenario.
 *
 * Mac-local only, never wired into CI (iOS pixels need a Mac + a running
 * simulator + dev client + Metro — see `tests/visual/README.md`).
 *
 *   pnpm --filter @rtc/client-react-native test:rn:visual:simctl
 *   pnpm --filter @rtc/client-react-native test:rn:visual:simctl:update
 *
 * Config via env: `RTC_VISUAL_UDID` (defaults to the `simctl` "booted"
 * alias — set explicitly for `idb`, which is less consistently tolerant of
 * it), `RTC_VISUAL_METRO_PORT` (default `8083`), `RTC_VISUAL_IDB` (path to
 * the `idb` binary, default resolves via `PATH`).
 */
async function main(): Promise<void> {
  const update = argv.includes("--update");
  const driver = createSimctlDriver({
    udid: env.RTC_VISUAL_UDID ?? "booted",
    metroPort: env.RTC_VISUAL_METRO_PORT,
    idbPath: env.RTC_VISUAL_IDB,
  });

  let failures = 0;

  for (const id of SCENARIO_IDS) {
    const png = await driver.capture(id);
    const gp = goldenPath("simctl", id);

    if (update) {
      await mkdir(dirname(gp), { recursive: true });
      await writeFile(gp, png);
      console.log(`updated  ${id}`);
      continue;
    }

    const result = await compareToGolden(png, gp);

    if (result.pass) {
      console.log(`pass     ${id}  (${(result.ratio * 100).toFixed(2)}%)`);
    } else {
      failures += 1;
      console.error(`FAIL     ${id}  (${(result.ratio * 100).toFixed(2)}%)`);
    }
  }

  if (failures > 0) {
    console.error(`${failures} scenario(s) failed`);
    exit(1);
  }

  exit(0);
}

main().catch((e: unknown): void => {
  console.error("simctl visual run failed:", e);
  exit(1);
});
