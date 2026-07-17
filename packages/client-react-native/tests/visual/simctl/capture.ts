import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pid } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import type { VisualDriver } from "../driver";

const exec = promisify(execFile);

/** Dev-client deep-link scheme (`app.config.ts` slug `rtc-mobile` -> Expo's
 * `exp+<slug>` dev-client convention), confirmed empirically on-device
 * (rehaul amendment A2). NOT the release scheme (`rtcmobile`, used below for
 * the in-app scenario deep link once the dev client is already foregrounded). */
const DEV_CLIENT_SCHEME = "exp+rtc-mobile";

/** Release/standalone deep-link scheme (`app.config.ts` `scheme`), used for
 * the in-app `__visual/<id>` navigation once the dev client has loaded the
 * Metro bundle. */
const APP_SCHEME = "rtcmobile";

const DEFAULT_METRO_PORT = "8083";
const DEFAULT_IDB_PATH = "idb";
const DEFAULT_IDB_TAP_X = 264;
const DEFAULT_IDB_TAP_Y = 469;
const DEFAULT_METRO_LOAD_DELAY_MS = 4000;
const DEFAULT_SETTLE_DELAY_MS = 2500;

export interface SimctlDriverConfig {
  /** Target simulator UDID (`xcrun simctl list devices`), pinned to iPhone
   * 15 / iOS 18.x for golden captures. */
  udid: string;
  /** Metro dev-server port on the host. The simulator reaches the host's
   * loopback directly (unlike a physical device), so `localhost` is correct
   * here — not a LAN IP. Defaults to `8083`. */
  metroPort?: string;
  /** Path to the `idb` binary (commonly `~/.local/bin/idb`, not always on a
   * non-interactive shell's `PATH`). Defaults to `"idb"` (resolved via
   * `PATH`). */
  idbPath?: string;
  /** Screen-POINT coordinates (not pixels — `simctl screenshot` output is
   * pixels, `idb ui tap` takes points, i.e. pixels / scale factor) of the
   * "Open" button in iOS's "Open in RTC Mobile?" confirmation dialog that
   * `simctl openurl` raises for the custom-scheme scenario deep link.
   * Defaults to the iPhone 15 pin's on-device-measured coordinates. */
  idbTapX?: number;
  idbTapY?: number;
  /** Delay after loading the Metro base URL, before deep-linking into the
   * scenario route, to let the JS bundle finish downloading + evaluating. */
  metroLoadDelayMs?: number;
  /** Delay after dismissing the confirmation dialog and before the
   * screenshot, to let the scenario render + settle. RN accessibility state
   * isn't queryable from `simctl`/`idb`, so this is a fixed wait rather than
   * a poll on the `visual-ready` marker. */
  settleDelayMs?: number;
}

/**
 * Tier 1 capture adapter: drives the iOS Simulator via `xcrun simctl` +
 * `idb` to screenshot one registered `Scenario` (`../scenarios.tsx`) through
 * the dev-only `__visual/<id>` harness route.
 *
 * The validated on-device sequence (rehaul Phase 1 amendment A2 +
 * empirical confirmation): load the dev client at its Metro base URL first
 * (the combined `?url=.../--/<route>` form does NOT work), wait for the
 * bundle, THEN deep-link in-app to the scenario route, dismiss the iOS
 * "Open in RTC Mobile?" confirmation the second `openurl` raises (via an
 * `idb ui tap`, since `simctl` has no way to dismiss system UI), wait for
 * the scenario to settle, and screenshot.
 *
 * Prerequisites (Mac-local only, never CI): `idb` on `PATH`, a running dev
 * client on the target simulator, and Metro started with
 * `EXPO_PUBLIC_VISUAL_HARNESS=1` (see `tests/visual/README.md`).
 */
export function createSimctlDriver(cfg: SimctlDriverConfig): VisualDriver {
  const metroPort = cfg.metroPort ?? DEFAULT_METRO_PORT;
  const idbPath = cfg.idbPath ?? DEFAULT_IDB_PATH;
  const idbTapX = cfg.idbTapX ?? DEFAULT_IDB_TAP_X;
  const idbTapY = cfg.idbTapY ?? DEFAULT_IDB_TAP_Y;
  const metroLoadDelayMs = cfg.metroLoadDelayMs ?? DEFAULT_METRO_LOAD_DELAY_MS;
  const settleDelayMs = cfg.settleDelayMs ?? DEFAULT_SETTLE_DELAY_MS;

  return {
    name: "simctl",
    async capture(scenarioId: string): Promise<Buffer> {
      await openMetroBase(cfg.udid, metroPort);
      await delay(metroLoadDelayMs);
      await openScenarioDeepLink(cfg.udid, scenarioId);
      await tapOpenConfirmation(idbPath, cfg.udid, idbTapX, idbTapY);
      await delay(settleDelayMs);
      return screenshot(cfg.udid, scenarioId);
    },
  };
}

async function openMetroBase(udid: string, metroPort: string): Promise<void> {
  const metroUrl = `http://localhost:${metroPort}`;
  const devClientUrl = `${DEV_CLIENT_SCHEME}://expo-development-client/?url=${metroUrl}`;
  await exec("xcrun", ["simctl", "openurl", udid, devClientUrl]);
}

async function openScenarioDeepLink(
  udid: string,
  scenarioId: string,
): Promise<void> {
  await exec("xcrun", [
    "simctl",
    "openurl",
    udid,
    `${APP_SCHEME}://__visual/${scenarioId}`,
  ]);
}

async function tapOpenConfirmation(
  idbPath: string,
  udid: string,
  x: number,
  y: number,
): Promise<void> {
  await exec(idbPath, ["ui", "tap", "--udid", udid, String(x), String(y)]);
}

async function screenshot(udid: string, scenarioId: string): Promise<Buffer> {
  const out = join(
    tmpdir(),
    `rtc-visual-simctl-${scenarioId.replace(/\//g, "_")}-${pid}.png`,
  );
  await exec("xcrun", ["simctl", "io", udid, "screenshot", out]);
  const png = await readFile(out);
  await rm(out, { force: true });
  return png;
}
