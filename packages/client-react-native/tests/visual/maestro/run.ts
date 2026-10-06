import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { argv, cwd, env, exit } from "node:process";
import { promisify } from "node:util";

import { SCENARIO_IDS } from "../scenarioIds.ts";
import {
  hideAndroidDevMenu,
  resolveAndroidSerial,
  restoreAndroidDevMenu,
  reverseMetroPort,
} from "../shared/androidDevice.ts";
import { resolveBootedUdid } from "../shared/bootedUdid.ts";
import { hideDevMenuFab, restoreDevMenuFab } from "../shared/devMenuFab.ts";
import { compareToGolden, toleranceFor, verdictLine } from "../shared/diff.ts";
import {
  hasWindowedEmulator,
  WINDOWED_EMULATOR_WARNING,
} from "../shared/emulatorWindow.ts";
import { goldenPath } from "../shared/goldens.ts";
import { failedFlowLines, noShotLine } from "../shared/maestroOutcome.ts";
import { type Platform, resolvePlatform } from "../shared/platform.ts";
import { maskTopRows, STATUS_BAR_ROWS } from "../shared/statusBarMask.ts";

const exec = promisify(execFile);

/**
 * Tier 2 CLI runner: runs the generated Maestro flows (which screenshot each
 * scenario), then diffs each shot against its committed `maestro` golden using
 * the shared `pixelmatch` core. Mac-local only, never CI.
 *
 *   pnpm --filter @rtc/client-react-native test:rn:visual:maestro
 *   pnpm --filter @rtc/client-react-native test:rn:visual:maestro:update
 *   pnpm --filter @rtc/client-react-native test:rn:visual:maestro:android
 *   pnpm --filter @rtc/client-react-native test:rn:visual:maestro:android:update
 *
 * The SAME flows drive both platforms; what differs is the device this runner
 * prepares around them and the golden set it compares against.
 *
 * Env: `RTC_VISUAL_PLATFORM` (`ios`, the default, or `android`),
 * `RTC_VISUAL_UDID` (the simulator — or Android serial — to drive; defaults to
 * the single running one, and refuses to guess between two), `RTC_VISUAL_ADB`
 * (Android only: the `adb` binary, when it is not on `PATH`), `MAESTRO_METRO_PORT` (default `8083`, injected into the flow's
 * dev-client link — the `MAESTRO_` prefix is what makes Maestro interpolate
 * `${MAESTRO_METRO_PORT}`), `RTC_VISUAL_MAESTRO_SHOTS` (where the flows'
 * `takeScreenshot: shots/<id>` PNGs land). Maestro writes a relative
 * `takeScreenshot` path against ITS cwd, which is this runner's cwd (the RN
 * package root, since pnpm runs the script there), so the default read dir
 * must be `<cwd>/shots` to match `takeScreenshot: shots/<id>` in the flows.
 */
const FLOWS_DIR = "tests/visual/maestro/flows";
const SHOTS: string = env.RTC_VISUAL_MAESTRO_SHOTS ?? join(cwd(), "shots");

async function main(): Promise<void> {
  const update = argv.includes("--update");
  const platform = resolvePlatform(env.RTC_VISUAL_PLATFORM);
  const metroPort = env.MAESTRO_METRO_PORT ?? "8083";

  // A flow that dies before its `takeScreenshot` leaves no file, so a shot
  // left over from an earlier run would be scored as this run's.
  for (const id of SCENARIO_IDS) {
    await rm(shotPath(id), { force: true });
  }

  const device = await prepareDevice(platform, metroPort);

  let flowFailures: string[] | null = null;

  try {
    await exec(
      "maestro",
      ["--udid", device.id, "test", FLOWS_DIR, "--format", "junit"],
      {
        env: {
          ...env,
          MAESTRO_CLI_NO_ANALYTICS: "1",
          MAESTRO_METRO_PORT: metroPort,
        },
      },
    );
  } catch (e: unknown) {
    flowFailures = failedFlowLines(e);

    // Goldens are never written from a run in which a flow failed, and a
    // failure that names no flow (no device, no Maestro) has nothing to score.
    if (update || flowFailures.length === 0) {
      throw e;
    }
  } finally {
    await device.restore();
  }

  // One failed flow used to end the run here with a stack trace, discarding
  // the verdicts of the flows that did complete.
  for (const line of flowFailures ?? []) {
    console.error(line);
  }

  let failures = 0;

  for (const id of SCENARIO_IDS) {
    const shot = await readShot(id);

    if (shot === null) {
      failures += 1;
      console.error(noShotLine(id));
      continue;
    }

    const png = maskTopRows(shot, STATUS_BAR_ROWS[platform]);
    const gp = goldenPath("maestro", id, platform);

    if (update) {
      await mkdir(dirname(gp), { recursive: true });
      await writeFile(gp, png);
      console.log(`updated  ${id}`);
      continue;
    }

    const result = await compareToGolden(png, gp, {
      allowedMismatchedPixelRatio: toleranceFor(id),
    });

    // Four decimals, not two: the bar is exact reproduction, and at two decimals
    // every ratio below 0.005% prints as a reassuring "0.00%".
    if (result.pass) {
      console.log(verdictLine(id, result));
    } else {
      failures += 1;
      console.error(verdictLine(id, result));
    }
  }

  if (failures > 0) {
    console.error(`${failures} scenario(s) failed`);
    exit(1);
  }

  exit(0);
}

/** Says so when the emulator has a window. A warning, not a refusal: the run
 * is still valid while the window stays in view, and `ps` failing is no reason
 * to stop. */
async function warnOfWindowedEmulator(): Promise<void> {
  try {
    const { stdout } = await exec("ps", ["-Ao", "comm"]);

    if (hasWindowedEmulator(stdout)) {
      console.error(WINDOWED_EMULATOR_WARNING);
    }
  } catch {
    // Not knowing is not a finding.
  }
}

function shotPath(id: string): string {
  return join(SHOTS, `${id.replace(/\//g, "_")}.png`);
}

/** The scenario's shot from this run, or `null` when its flow took none. */
async function readShot(id: string): Promise<Buffer | null> {
  try {
    return await readFile(shotPath(id));
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      return null;
    }

    throw e;
  }
}

/** A device made ready for a run, and how to put it back. */
interface PreparedDevice {
  readonly id: string;
  restore(): Promise<void>;
}

/** Resolves the device and hides what must not be in a shot. The id is pinned,
 * never left to Maestro: the goldens sit under a path naming one device, and
 * with two running Maestro would pick one itself. Everything done here is
 * undone by `restore`, which the caller runs in a `finally`. */
async function prepareDevice(
  platform: Platform,
  metroPort: string,
): Promise<PreparedDevice> {
  if (platform === "android") {
    const serial = env.RTC_VISUAL_UDID ?? (await resolveAndroidSerial());

    if (serial.startsWith("emulator-")) {
      await warnOfWindowedEmulator();
    }

    await reverseMetroPort(serial, metroPort);
    const devMenu = await hideAndroidDevMenu(serial);

    return {
      id: serial,
      restore: async () => {
        await restoreAndroidDevMenu(serial, devMenu);
      },
    };
  }

  // The same UDID is what `hideDevMenuFab` needs — which is why this tier's
  // goldens carried the dev-menu gear until 2026-10-01.
  const udid = env.RTC_VISUAL_UDID ?? (await resolveBootedUdid());

  await hideDevMenuFab(udid);

  return {
    id: udid,
    restore: async () => {
      await restoreDevMenuFab(udid);
    },
  };
}

main().catch((e: unknown): void => {
  console.error("maestro visual run failed:", e);
  exit(1);
});
