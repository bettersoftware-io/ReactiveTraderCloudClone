import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { argv, env, exit } from "node:process";
import { promisify } from "node:util";

import type { VisualDriver } from "../driver";
import { SCENARIO_IDS } from "../scenarioIds";
import { hideDevMenuFab, restoreDevMenuFab } from "../shared/devMenuFab";
import { compareToGolden, toleranceFor } from "../shared/diff";
import { goldenPath } from "../shared/goldens";
import { createSimctlDriver } from "./capture";

const SCRATCH_FLAG = "--scratch";
const DEFAULT_SCRATCH_DIR = "/tmp/rtc-visual-scratch";

/** What a run does with each captured PNG: write it outside the golden tree
 * (`scratchDir`), overwrite the golden (`update`), or diff against it. */
interface RunOptions {
  readonly update: boolean;
  readonly scratchDir: string | undefined;
}

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
 * Config via env: `RTC_VISUAL_UDID` (defaults to the booted simulator's real
 * UDID, resolved via `simctl` — NOT the literal `"booted"` alias, which `idb`
 * rejects; see `resolveBootedUdid`), `RTC_VISUAL_METRO_PORT` (default `8083`),
 * `RTC_VISUAL_IDB` (path to the `idb` binary, default resolves via `PATH`).
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

  const udid = env.RTC_VISUAL_UDID ?? (await resolveBootedUdid());

  const driver = createSimctlDriver({
    udid,
    metroPort: env.RTC_VISUAL_METRO_PORT,
    idbPath: env.RTC_VISUAL_IDB,
  });

  // Once, around the WHOLE run, not per capture: the preference is read at app
  // start and the driver cold-starts the app for every scenario, so a single
  // write covers them all — while restoring between captures would put the
  // bubble back for the very next launch. See `hideDevMenuFab`.
  await hideDevMenuFab(udid);

  let code = 1;

  try {
    code = await runScenarios(driver, ids, { update, scratchDir });
  } finally {
    // A run that throws halfway must not leave a developer's dev menu switched
    // off — this is dev tooling they use outside the harness.
    await restoreDevMenuFab(udid);
  }

  // AFTER the finally, deliberately. `exit()` tears the process down
  // synchronously, so calling it inside the `try` would skip the restore
  // entirely and leave the bubble disabled on every successful run — the exact
  // case that matters most.
  exit(code);
}

/** Captures each scenario and reports it, returning the process exit code. */
async function runScenarios(
  driver: VisualDriver,
  ids: readonly string[],
  opts: RunOptions,
): Promise<number> {
  const { update, scratchDir } = opts;
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

    const result = await compareToGolden(png, gp, {
      allowedMismatchedPixelRatio: toleranceFor(id),
    });

    // Four decimals, not two: the bar is now exact reproduction, and at two
    // decimals every ratio below 0.005% prints as a reassuring "0.00%".
    if (result.pass) {
      console.log(`pass     ${id}  (${(result.ratio * 100).toFixed(4)}%)`);
    } else {
      failures += 1;
      console.error(`FAIL     ${id}  (${(result.ratio * 100).toFixed(4)}%)`);
    }
  }

  if (failures > 0) {
    console.error(`${failures} scenario(s) failed`);
    return 1;
  }

  return 0;
}

/** Resolves the booted simulator's real UDID.
 *
 * `simctl` accepts the literal `"booted"` as a target; **`idb` does not** — it
 * answers `Cannot spawn companion for booted, no matching target`. Passing
 * `"booted"` through therefore broke every `idb ui describe-all` poll, and
 * because `waitForAppBoot` swallows describe failures to ride out mid-relaunch
 * blips, the run died 20s later claiming the simulator was "still showing the
 * Expo dev-client launcher" — a confident, wrong diagnosis of a healthy app.
 * Resolving the concrete UDID up front keeps both tools addressable. */
async function resolveBootedUdid(): Promise<string> {
  const { stdout } = await promisify(execFile)("xcrun", [
    "simctl",
    "list",
    "devices",
    "booted",
    "-j",
  ]);
  const parsed = JSON.parse(stdout) as SimctlDeviceList;
  const booted = Object.values(parsed.devices)
    .flat()
    .filter((device) => {
      return device.state === "Booted";
    });

  if (booted.length === 0) {
    throw new Error(
      "No booted simulator found. Boot one (`xcrun simctl boot <udid>`) or " +
        "set RTC_VISUAL_UDID explicitly.",
    );
  }

  if (booted.length > 1) {
    throw new Error(
      `${booted.length} simulators are booted (${booted
        .map((device) => {
          return device.udid;
        })
        .join(", ")}). Set RTC_VISUAL_UDID to choose one — guessing would ` +
        "capture from an arbitrary device.",
    );
  }

  return booted[0]?.udid ?? "";
}

interface SimctlDevice {
  readonly udid: string;
  readonly state: string;
}

interface SimctlDeviceList {
  readonly devices: Record<string, readonly SimctlDevice[]>;
}

main().catch((e: unknown): void => {
  console.error("simctl visual run failed:", e);
  exit(1);
});
