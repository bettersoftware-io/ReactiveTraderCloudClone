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
/** Terminated before every capture so each scenario starts from an identical
 * cold launch — see `capture` below. */
const APP_BUNDLE_ID = "io.bettersoftware.rtcmobile";

/** Release/standalone deep-link scheme (`app.config.ts` `scheme`), used for
 * the in-app `__visual/<id>` navigation once the dev client has loaded the
 * Metro bundle. */
const APP_SCHEME = "rtcmobile";

/** Pinned into the status bar before every capture — see `pinStatusBar`. */
const STATUS_BAR_TIME = "09:41";

const DEFAULT_METRO_PORT = "8083";
const DEFAULT_IDB_PATH = "idb";

/** Blind-tap FALLBACK ONLY (screen-POINT coordinates, not pixels) for the
 * "Open" button in iOS's "Open in RTC Mobile?" confirmation. Used only when
 * the accessibility tree can't locate an "Open" button by label — see
 * `findOpenConfirmation`. This was previously the ONLY dismissal mechanism,
 * which is exactly the reliability defect this file now fixes: when the
 * confirmation didn't appear where expected (e.g. a stale "RECENTLY OPENED"
 * row from a prior Metro session sitting underneath), the blind tap landed
 * on the dev-client launcher instead, and a fixed post-tap delay screenshot
 * silently captured the wrong screen — see `tests/visual/README.md`. */
const DEFAULT_IDB_TAP_X = 274;
const DEFAULT_IDB_TAP_Y = 474;

/** Bounded poll for the app to leave the dev-client launcher after loading
 * the Metro base URL — i.e. our bundle is on screen, in whatever state. */
const DEFAULT_APP_BOOT_TIMEOUT_MS = 20_000;
/** Bounded poll for the `visual-ready` a11y marker after the in-app scenario
 * deep link. This is the core fix: the driver must not screenshot until this
 * marker is observed, and must throw — never return a screenshot — if it
 * times out. */
const DEFAULT_READY_TIMEOUT_MS = 20_000;
const DEFAULT_POLL_INTERVAL_MS = 400;
/** Small buffer after `visual-ready` is observed, to let the frame that set
 * the marker fully composite before the shot. Short on purpose — the marker
 * itself (`VisualScenarioHost`, one frame after fonts load) is the real
 * readiness gate now, not a guessed fixed wait. */
const DEFAULT_POST_READY_SETTLE_MS = 300;
/** Bounded wait for the dev client's "Tools" hint to retract on its own.
 * Measured on device: it clears between ~10s and ~15s after launch. */
const DEFAULT_DEV_CHROME_TIMEOUT_MS = 25_000;

const VISUAL_READY_ID = "visual-ready";
const OPEN_CONFIRM_LABEL = "Open";

/**
 * A subset of the fields `idb ui describe-all --udid <udid>` emits per
 * accessibility-tree node (JSON array on stdout). Confirmed empirically
 * against a live iPhone 17 sim (rehaul reliability-fix investigation): RN's
 * `testID` surfaces as `AXUniqueId` (iOS `accessibilityIdentifier`), and
 * frames are already in POINT units (matching `idb ui tap`'s coordinate
 * space, not the pixel space `simctl io screenshot` writes).
 */
interface AXElement {
  AXUniqueId: string | null;
  AXLabel: string | null;
  title: string | null;
  role: string | null;
  frame: { x: number; y: number; width: number; height: number };
}

/** Labels unique to the Expo dev-client launcher's home screen (confirmed
 * empirically: capturing this screen's `describe-all` output during the
 * reliability-fix investigation). None of these ever appear inside a
 * `VisualScenarioHost`-mounted scenario, regardless of skin/mode — this is
 * the "launcher-shaped capture" guard (Task 2 of the reliability fix). A
 * pixel-based guard (e.g. "mostly light background") was considered and
 * REJECTED: `shell/connection-banner` is pinned `classic`/`light`, so a
 * blanket light-background heuristic would misfire on a legitimately
 * passing capture — see `tests/visual/scenarios.tsx`'s skin×mode table. */
/** Stock iOS home-screen icons, used to recognise SpringBoard. Deliberately
 * first-party apps that cannot be uninstalled, so the signature holds on any
 * simulator the goldens are captured on. */
/** The expanded state of the dev client's floating menu button. */
const DEV_TOOLS_HINT_LABEL = "Tools";

const SPRINGBOARD_ICON_IDS: ReadonlySet<string> = new Set([
  "Safari",
  "Messages",
  "Settings",
  "Photos",
  "spotlight-pill",
]);

const LAUNCHER_HOME_LABELS: ReadonlySet<string> = new Set([
  "DEVELOPMENT SERVERS",
  "RECENTLY OPENED",
  "Enter URL manually",
  "Development Build",
]);

export interface SimctlDriverConfig {
  /** Target simulator UDID (`xcrun simctl list devices`), pinned to iPhone
   * 17 / iOS 26.x for golden captures. */
  udid: string;
  /** Metro dev-server port on the host. The simulator reaches the host's
   * loopback directly (unlike a physical device), so `localhost` is correct
   * here — not a LAN IP. Defaults to `8083`. */
  metroPort?: string;
  /** Path to the `idb` binary (commonly `~/.local/bin/idb`, not always on a
   * non-interactive shell's `PATH`). Defaults to `"idb"` (resolved via
   * `PATH`). */
  idbPath?: string;
  /** Blind-tap FALLBACK coordinates for the "Open" confirmation, used only
   * when it can't be located in the accessibility tree by label. Defaults to
   * the iPhone 17 pin's on-device-measured coordinates. */
  idbTapX?: number;
  idbTapY?: number;
  /** Bounded wait (ms) for the app to leave the dev-client launcher after
   * loading the Metro base URL. Throws if it never does. */
  appBootTimeoutMs?: number;
  /** Bounded wait (ms) for the `visual-ready` marker after the in-app
   * scenario deep link. Throws if never observed — this is what makes a
   * capture failure loud instead of silently screenshotting whatever's on
   * screen (e.g. the dev-client launcher). */
  readyTimeoutMs?: number;
  /** Poll interval (ms) for both accessibility-tree waits above. */
  pollIntervalMs?: number;
  /** Settle buffer (ms) after `visual-ready` is observed, before the shot. */
  postReadySettleMs?: number;
  /** Bounded wait (ms) for the dev client's "Tools" hint to retract before
   * the shot. */
  devChromeTimeoutMs?: number;
}

/**
 * Tier 1 capture adapter: drives the iOS Simulator via `xcrun simctl` +
 * `idb` to screenshot one registered `Scenario` (`../scenarios.tsx`) through
 * the dev-only `__visual/<id>` harness route.
 *
 * The on-device sequence (rehaul Phase 1 amendment A2, later hardened by the
 * reliability fix below): load the dev client at its Metro base URL first
 * (the combined `?url=.../--/<route>` form does NOT work), poll the a11y
 * tree until the app has left the dev-client launcher (NOT for a
 * `login-screen` marker — the session persists in AsyncStorage, so a
 * simulator that has ever signed in boots straight to the shell and that
 * marker never appears), THEN deep-link in-app to the
 * scenario route, poll the a11y tree for the iOS "Open in RTC Mobile?"
 * confirmation and dismiss it by tapping the located "Open" button (falling
 * back to a blind coordinate tap only if it can't be found), poll the a11y
 * tree for the `visual-ready` marker the scenario host sets one frame after
 * mount, re-check at shot time that the screen isn't launcher-shaped, and
 * only then screenshot.
 *
 * This replaces the earlier "blind tap + fixed sleep" sequence, which could
 * not tell a capture failure (app never reached the scenario — e.g. a stale
 * "RECENTLY OPENED" row under the blind tap point, or the confirmation
 * simply taking longer to appear) apart from a genuine visual regression:
 * both produced a "screenshot", just of the wrong screen. See
 * `tests/visual/README.md` for the failure mode this fixes.
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
  const appBootTimeoutMs = cfg.appBootTimeoutMs ?? DEFAULT_APP_BOOT_TIMEOUT_MS;
  const readyTimeoutMs = cfg.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const pollIntervalMs = cfg.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const postReadySettleMs =
    cfg.postReadySettleMs ?? DEFAULT_POST_READY_SETTLE_MS;

  const devChromeTimeoutMs =
    cfg.devChromeTimeoutMs ?? DEFAULT_DEV_CHROME_TIMEOUT_MS;

  return {
    name: "simctl",
    async capture(scenarioId: string): Promise<Buffer> {
      // Cold-start every scenario. Re-opening the dev-client URL against an
      // ALREADY-RUNNING app does not reliably re-navigate it: observed on
      // device, the app instead tears down to the iOS home screen and never
      // comes back, so every scenario after the first in a multi-scenario
      // run was driving a dead app. Terminating first makes each capture
      // independent of what the previous one left on screen — the property a
      // golden harness needs anyway.
      await pinStatusBar(cfg.udid);
      await terminateApp(cfg.udid);
      await openMetroBase(cfg.udid, metroPort);
      await waitForAppBoot(idbPath, cfg.udid, {
        timeoutMs: appBootTimeoutMs,
        pollIntervalMs,
        scenarioId,
      });

      await openScenarioDeepLink(cfg.udid, scenarioId);
      await waitForVisualReady({
        idbPath,
        udid: cfg.udid,
        scenarioId,
        readyTimeoutMs,
        pollIntervalMs,
        idbTapX,
        idbTapY,
      });
      await waitForDevChromeRetracted(idbPath, cfg.udid, {
        timeoutMs: devChromeTimeoutMs,
        pollIntervalMs,
      });
      await delay(postReadySettleMs);

      // Defence in depth: re-check the a11y tree at the moment of the shot,
      // not just at the moment `visual-ready` first appeared — catches a
      // crash/relaunch race landing back on the launcher between the ready
      // tick and the screenshot.
      const finalTree = await describeAll(idbPath, cfg.udid);
      assertNotLauncherShaped(finalTree, scenarioId);

      return screenshot(cfg.udid, scenarioId);
    },
  };
}

/**
 * Freeze the iOS status bar, which is IN FRAME on every capture.
 *
 * Its clock advances every minute, so each golden otherwise bakes in a
 * wall-clock that can never reproduce — the same class of defect that kept
 * `boot/topo` out of the harness entirely, sitting unnoticed in the chrome of
 * all fourteen scenarios. Battery, wifi and cellular are pinned too: battery
 * level drifts and the cellular glyph is not stable across boots.
 *
 * 9:41 is Apple's own screenshot convention, chosen here only because it is
 * conventional and obviously deliberate to a reader.
 *
 * Best-effort: an older `simctl` without `status_bar` should degrade to a
 * noisier golden, never to a failed run.
 */
async function pinStatusBar(udid: string): Promise<void> {
  try {
    await exec("xcrun", [
      "simctl",
      "status_bar",
      udid,
      "override",
      "--time",
      STATUS_BAR_TIME,
      "--batteryState",
      "charged",
      "--batteryLevel",
      "100",
      "--cellularMode",
      "active",
      "--cellularBars",
      "4",
      "--wifiMode",
      "active",
      "--wifiBars",
      "3",
    ]);
  } catch {
    // Status-bar overrides are unavailable — capture anyway.
  }
}

/** Best-effort: `simctl terminate` exits non-zero when the app is not
 * running, which is a perfectly normal state here (first scenario of a run,
 * or a previous crash). Swallowed so a cold simulator is not an error. */
async function terminateApp(udid: string): Promise<void> {
  try {
    await exec("xcrun", ["simctl", "terminate", udid, APP_BUNDLE_ID]);
  } catch {
    // Not running — nothing to terminate.
  }
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

async function describeAll(
  idbPath: string,
  udid: string,
): Promise<AXElement[]> {
  const { stdout } = await exec(
    idbPath,
    ["ui", "describe-all", "--udid", udid],
    {
      timeout: 5_000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout) as AXElement[];
}

function findById(tree: AXElement[], id: string): AXElement | undefined {
  return tree.find((el) => {
    return el.AXUniqueId === id;
  });
}

function findOpenConfirmation(tree: AXElement[]): AXElement | undefined {
  return tree.find((el) => {
    return (
      el.role === "AXButton" &&
      (el.AXLabel === OPEN_CONFIRM_LABEL || el.title === OPEN_CONFIRM_LABEL)
    );
  });
}

/** True if the a11y tree matches the Expo dev-client launcher's home screen
 * signature — see `LAUNCHER_HOME_LABELS`. */
function looksLikeLauncherHome(tree: AXElement[]): boolean {
  let hits = 0;

  for (const el of tree) {
    if (el.AXLabel !== null && LAUNCHER_HOME_LABELS.has(el.AXLabel)) {
      hits += 1;
    }
  }

  // Require 2+ hits, not 1: guards against a coincidental single-label
  // collision (none expected today, but cheap insurance for future
  // scenario copy) while still reliably catching the launcher, which
  // exposes all four labels at once.
  return hits >= 2;
}

/** True for the iOS home screen. Matched on the stock first-page app icons,
 * which are present on a fresh simulator and survive the app being
 * terminated — the state a capture must never mistake for a running app.
 * Same 2+ hit threshold as `looksLikeLauncherHome`, for the same reason. */
function looksLikeSpringBoard(tree: AXElement[]): boolean {
  let hits = 0;

  for (const el of tree) {
    if (el.AXUniqueId !== null && SPRINGBOARD_ICON_IDS.has(el.AXUniqueId)) {
      hits += 1;
    }
  }

  return hits >= 2;
}

function assertNotLauncherShaped(tree: AXElement[], scenarioId: string): void {
  if (looksLikeLauncherHome(tree)) {
    throw new Error(
      `simctl capture for scenario "${scenarioId}" looks like the Expo ` +
        `dev-client launcher home screen, not the mounted scenario — the ` +
        `app dropped out of the harness between the "visual-ready" check ` +
        `and the screenshot. Refusing to return a screenshot. See ` +
        `tests/visual/README.md.`,
    );
  }
}

async function tapElementCenter(
  idbPath: string,
  udid: string,
  el: AXElement,
): Promise<void> {
  const x = Math.round(el.frame.x + el.frame.width / 2);
  const y = Math.round(el.frame.y + el.frame.height / 2);
  await exec(idbPath, ["ui", "tap", "--udid", udid, String(x), String(y)]);
}

async function tapBlindFallback(
  idbPath: string,
  udid: string,
  x: number,
  y: number,
): Promise<void> {
  await exec(idbPath, ["ui", "tap", "--udid", udid, String(x), String(y)]);
}

/** Polls until the dev client has left its launcher home screen — i.e. OUR
 * app is on screen, whatever it is showing.
 *
 * This deliberately does NOT wait for `login-screen`. That marker only
 * renders when the app is signed OUT, and the session persists in
 * AsyncStorage, so a simulator that has ever signed in boots straight to the
 * shell and the login marker never appears. Waiting for it timed out against
 * a perfectly healthy app (observed: the tree carried `logout-button` and the
 * spot-tile ids instead).
 *
 * An earlier version of this gate claimed that inverting the launcher
 * signature is "false only while the dev client is still on its own home
 * screen". That was wrong, and it cost a debugging session: the iOS
 * SpringBoard home screen is not the Expo launcher either, so a terminated
 * app read as "booted" and the scenario deep link went nowhere. The same
 * mistake this harness exists to prevent — inferring a good state from the
 * absence of one known-bad state — reproduced one level up.
 *
 * Both screens are now rejected. This gate remains a negative one (there is
 * no app-side marker to assert before the scenario route mounts — the
 * harness host, and so `visual-pending`, only exists under `__visual/`), but
 * it can no longer pass on an app that is not running: `visual-ready` is
 * still the only thing a capture ever proceeds on. */
interface AppBootWaitConfig {
  timeoutMs: number;
  pollIntervalMs: number;
  scenarioId: string;
}

async function waitForAppBoot(
  idbPath: string,
  udid: string,
  { timeoutMs, pollIntervalMs, scenarioId }: AppBootWaitConfig,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const tree = await describeAll(idbPath, udid);

      if (!looksLikeLauncherHome(tree) && !looksLikeSpringBoard(tree)) {
        return;
      }
    } catch {
      // `idb ui describe-all` can transiently fail while the app is mid
      // relaunch; keep polling rather than failing on the blip.
    }

    await delay(pollIntervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for the app to start for ` +
      `scenario "${scenarioId}" — the simulator is still showing the Expo ` +
      `dev-client launcher or the iOS home screen, so the app never loaded ` +
      `from Metro. Refusing to return a screenshot (a capture failure is ` +
      `not the same as a visual regression).`,
  );
}

interface DevChromeWaitConfig {
  timeoutMs: number;
  pollIntervalMs: number;
}

/**
 * Waits for the Expo dev client's floating "Tools" hint to retract to its
 * bare gear.
 *
 * Cold-launching every scenario (see `capture`) means the shot now lands
 * while that hint is still expanded — a large blue pill over the top-right
 * of the frame, which would bake into the goldens. It is dev-client chrome
 * with a launch-relative timer, so its state is a function of how fast the
 * capture ran: precisely the kind of variability a golden must not carry.
 *
 * Waited for as a CONDITION rather than slept past. A fixed delay long
 * enough to cover it is how this harness got into trouble the first time.
 *
 * Not fatal on timeout: the hint retracting is cosmetic, and failing an
 * otherwise-good capture over dev chrome would be worse than a diff that
 * says plainly what changed. The pixel comparison still catches it.
 */
async function waitForDevChromeRetracted(
  idbPath: string,
  udid: string,
  { timeoutMs, pollIntervalMs }: DevChromeWaitConfig,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const tree = await describeAll(idbPath, udid);

      if (!hasDevToolsHint(tree)) {
        return;
      }
    } catch {
      // Transient `idb` failure — keep polling.
    }

    await delay(pollIntervalMs);
  }
}

function hasDevToolsHint(tree: AXElement[]): boolean {
  return tree.some((el) => {
    return el.AXLabel === DEV_TOOLS_HINT_LABEL;
  });
}

interface ReadyWaitConfig {
  idbPath: string;
  udid: string;
  scenarioId: string;
  readyTimeoutMs: number;
  pollIntervalMs: number;
  idbTapX: number;
  idbTapY: number;
}

/**
 * Polls for `visual-ready`, opportunistically dismissing the iOS "Open in
 * RTC Mobile?" confirmation along the way (by locating its "Open" button in
 * the a11y tree; only if that never surfaces does it fall back to a single
 * blind coordinate tap, roughly halfway through the budget — giving the a11y
 * route every reasonable chance first). Throws — never returns a "close
 * enough" result — if `visual-ready` is never observed within budget.
 */
async function waitForVisualReady({
  idbPath,
  udid,
  scenarioId,
  readyTimeoutMs,
  pollIntervalMs,
  idbTapX,
  idbTapY,
}: ReadyWaitConfig): Promise<void> {
  const deadline = Date.now() + readyTimeoutMs;
  const blindFallbackAt = Date.now() + readyTimeoutMs / 2;
  let usedBlindFallback = false;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const tree = await describeAll(idbPath, udid);

      if (findById(tree, VISUAL_READY_ID) !== undefined) {
        return;
      }

      const openButton = findOpenConfirmation(tree);

      if (openButton !== undefined) {
        await tapElementCenter(idbPath, udid, openButton);
      } else if (!usedBlindFallback && Date.now() >= blindFallbackAt) {
        // Last resort: the a11y tree never showed an "Open" button (maybe it
        // already came and went, maybe the a11y label differs on this iOS
        // build) — try the historically-measured coordinate once, then keep
        // polling for `visual-ready` either way.
        usedBlindFallback = true;
        await tapBlindFallback(idbPath, udid, idbTapX, idbTapY);
      }

      lastError = undefined;
    } catch (err) {
      lastError = err;
    }

    await delay(pollIntervalMs);
  }

  const suffix =
    lastError === undefined
      ? ""
      : ` Last "idb ui describe-all" error: ${String(lastError)}`;

  throw new Error(
    `Timed out after ${readyTimeoutMs}ms waiting for "${VISUAL_READY_ID}" ` +
      `for scenario "${scenarioId}" — the app never reached the visual ` +
      `harness. Refusing to return a screenshot (a capture failure is not ` +
      `the same as a visual regression).${suffix}`,
  );
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
