import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Hides expo-dev-menu's floating action button for the duration of a capture
 * run, and puts it back afterwards.
 *
 * WHY THIS EXISTS. Every RN golden committed before 2026-08-05 contains a grey
 * `gearshape.fill` bubble at a fixed spot near the top-left — over the Rates
 * filter chips, over the shell header, over everything. It is not ours and not
 * the simulator's: expo-dev-menu mounts a `DevMenuFABWindow`, a passthrough
 * `UIWindow` layered above the app, so it sits on top of our UI and shows up in
 * the a11y tree as part of the app.
 *
 * It never destabilised a diff — it is in the same place every run, so captures
 * still reproduced at 0.00% — which is exactly why it survived unnoticed. The
 * cost is to the OTHER use of this corpus: these PNGs are read side by side
 * with the design prototype's shots to judge fidelity, and a dev-tooling
 * overlay baked into all of them is noise in every one of those comparisons.
 *
 * HOW. `DevMenuPreferences` gates the button on a plain `UserDefaults` bool in
 * the app's own domain, defaulting to `true` on iOS:
 *
 *     let showFloatingActionButtonKey = "EXDevMenuShowFloatingActionButton"
 *     let shouldShow = DevMenuPreferences.showFloatingActionButton && …
 *
 * so `simctl spawn … defaults write` reaches it. The value is read during the
 * dev-menu's `setup()`, i.e. at app start — which is why this is called ONCE
 * before the run rather than per scenario: the driver cold-starts the app for
 * every capture anyway, so one write covers all of them, whereas restoring
 * between captures would put the button back for the very next launch.
 *
 * Best-effort in both directions, mirroring `pinStatusBar`: a simulator that
 * will not take the write should degrade to a noisier golden, never to a failed
 * run. The restore is `defaults delete` rather than `write true`, so the app is
 * returned to "no opinion" — inheriting whatever default the installed
 * dev-client ships — instead of being pinned to a value we chose.
 */
export async function hideDevMenuFab(udid: string): Promise<void> {
  try {
    await exec("xcrun", [
      "simctl",
      "spawn",
      udid,
      "defaults",
      "write",
      APP_BUNDLE_ID,
      FAB_PREFERENCE_KEY,
      "-bool",
      "NO",
    ]);
  } catch {
    // Simulator not booted, app never installed, or an older `simctl` without
    // `spawn`. The run is still worth doing with the bubble in frame.
  }
}

/** Undoes {@link hideDevMenuFab}. Call in a `finally` — a run that throws
 * halfway must not leave a developer's dev menu silently switched off. */
export async function restoreDevMenuFab(udid: string): Promise<void> {
  try {
    await exec("xcrun", [
      "simctl",
      "spawn",
      udid,
      "defaults",
      "delete",
      APP_BUNDLE_ID,
      FAB_PREFERENCE_KEY,
    ]);
  } catch {
    // `defaults delete` also exits non-zero when the key is simply absent,
    // which is the common case on a machine that has never run a capture —
    // indistinguishable from a real failure here, and harmless either way.
  }
}

/** The dev-menu's own `UserDefaults` key (`DevMenuPreferences.swift:9`).
 * Duplicated as a literal because it belongs to a native pod, not to a JS
 * module we can import — if a future expo-dev-menu renames it, the symptom is
 * the bubble quietly returning to the goldens. */
const FAB_PREFERENCE_KEY = "EXDevMenuShowFloatingActionButton";

/** Matches `simctl/capture.ts`'s constant of the same name. Restated rather
 * than imported so this module owes nothing to a specific driver.
 *
 * WIRED INTO THE `simctl` TIER ONLY, and iOS-only besides. Maestro drives the
 * device through its own CLI and its runner never learns a UDID, so it has
 * nothing to pass here. Its three committed goldens (`blotter/seeded`,
 * `shell/appearance`, `shell/connection-banner`) therefore STILL contain the
 * bubble — stated plainly because "the goldens are clean now" would otherwise
 * be true of 18 files and false of 3. Pin Maestro's device (resolve the UDID
 * and pass it to `maestro test`) and it can call these two functions unchanged.
 *
 * Android will need a SIBLING, not this: the FAB exists there too, under the
 * same preference key, but in `SharedPreferences` via `adb shell` rather than
 * `UserDefaults` via `simctl`. The version that needs neither is the build-time
 * default (`Info.plist` / `AndroidManifest` meta-data), which no runner can
 * forget. See `tests/visual/BAKEOFF.md` — "The dev-menu gear, and how to hide
 * it on every tier". */
const APP_BUNDLE_ID = "io.bettersoftware.rtcmobile";
