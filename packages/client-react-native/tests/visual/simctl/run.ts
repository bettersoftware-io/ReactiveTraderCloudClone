import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { argv, env, exit } from "node:process";

import { SCENARIO_IDS } from "../scenarioIds";
import { compareToGolden } from "../shared/diff";
import { goldenPath } from "../shared/goldens";
import { createSimctlDriver } from "./capture";

const SCRATCH_FLAG = "--scratch";
const DEFAULT_SCRATCH_DIR = "/tmp/rtc-visual-scratch";

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
 * Any bare (non-flag) args filter which scenario ids run — useful when
 * debugging a single scenario instead of the full suite, e.g.:
 *
 *   tsx tests/visual/simctl/run.ts blotter/seeded
 *
 * `--scratch[=<dir>]` captures the (optionally filtered) scenarios to a
 * directory OUTSIDE the golden tree instead of diffing/updating goldens —
 * for inspecting what the driver currently sees without touching the
 * committed baseline. Defaults to `RTC_VISUAL_SCRATCH` or
 * `/tmp/rtc-visual-scratch`, e.g.:
 *
 *   tsx tests/visual/simctl/run.ts --scratch blotter/seeded shell/appearance
 *   tsx tests/visual/simctl/run.ts --scratch=/path/to/dir blotter/seeded
 *
 * Config via env: `RTC_VISUAL_UDID` (defaults to the `simctl` "booted"
 * alias — set explicitly for `idb`, which is less consistently tolerant of
 * it), `RTC_VISUAL_METRO_PORT` (default `8083`), `RTC_VISUAL_IDB` (path to
 * the `idb` binary, default resolves via `PATH`).
 */
async function main(): Promise<void> {
  const args = argv.slice(2);
  const update = args.includes("--update");
  const scratchArg = args.find((a) => {
    return a === SCRATCH_FLAG || a.startsWith(`${SCRATCH_FLAG}=`);
  });

  const scratchDir =
    scratchArg === undefined
      ? undefined
      : (scratchArg.split("=")[1] ??
        env.RTC_VISUAL_SCRATCH ??
        DEFAULT_SCRATCH_DIR);

  const idFilter = new Set(
    args.filter((a) => {
      return !a.startsWith("--");
    }),
  );

  const ids =
    idFilter.size === 0
      ? SCENARIO_IDS
      : SCENARIO_IDS.filter((id) => {
          return idFilter.has(id);
        });

  const driver = createSimctlDriver({
    udid: env.RTC_VISUAL_UDID ?? "booted",
    metroPort: env.RTC_VISUAL_METRO_PORT,
    idbPath: env.RTC_VISUAL_IDB,
  });

  let failures = 0;

  for (const id of ids) {
    const png = await driver.capture(id);

    if (scratchDir !== undefined) {
      const out = join(scratchDir, `${id.replace(/\//g, "_")}.png`);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, png);
      console.log(`scratch  ${id} -> ${out}`);
      continue;
    }

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
