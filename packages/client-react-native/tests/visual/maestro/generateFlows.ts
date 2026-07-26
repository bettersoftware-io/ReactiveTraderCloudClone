import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SCENARIO_IDS } from "../scenarioIds";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Dev-client + release schemes — mirror `simctl/capture.ts` (the proven
 * two-step). Maestro's `openLink` drives the same custom-scheme handoff; the
 * dev client must load the Metro bundle before the in-app scenario link.
 * `${MAESTRO_METRO_PORT}` is a literal Maestro flow variable — Maestro
 * interpolates it at `maestro test` time (from the runner's env), NOT a JS
 * template literal. */
// Escaped `\${…}` keeps the literal Maestro flow variable in the emitted YAML
// (Maestro interpolates it) without it being a JS template interpolation.
const DEV_CLIENT_LINK = `exp+rtc-mobile://expo-development-client/?url=http://localhost:\${MAESTRO_METRO_PORT}`;

/**
 * How long to wait for the app to finish booting the Metro bundle.
 *
 * This was 20 s, which is fine on a warm dev machine and far too short on a
 * cold CI runner. Measured on a GitHub `macos-26` runner (3 cores / 7 GB): the
 * FIRST bundle of this app takes **~40 s** and the dev client is still showing
 * "Bundling 16%…" when a 20 s budget expires. Even pre-warmed, executing ~3,000
 * modules on that machine is not instant.
 *
 * A generous ceiling is close to free: `extendedWaitUntil` returns the moment
 * the marker appears, so on a warm machine this still completes in a second or
 * two. It costs wall-clock only on a genuine failure — and a run that fails
 * slowly but tells you the truth beats one that fails fast for the wrong reason.
 */
const BOOT_WAIT_MS = 120_000;

/**
 * How long to wait for the harness's own ready marker after the in-app scenario
 * link. Shorter than {@link BOOT_WAIT_MS} because the bundle is already loaded
 * and executing by this point — this is a route transition plus one frame, not
 * a cold start. Still well above the old 20 s, because a scenario that mounts a
 * Skia canvas on a 3-core simulator is not instant either.
 */
const READY_WAIT_MS = 60_000;

export function flowYaml(id: string): string {
  const safe = id.replace(/\//g, "_");
  return [
    "appId: io.bettersoftware.rtcmobile",
    "---",
    "# Step 1: load the Metro bundle via the dev client (two-step deep link).",
    "- openLink:",
    `    link: "${DEV_CLIENT_LINK}"`,
    "# Dismiss the iOS 'Open in RTC Mobile?' confirmation if it appears.",
    "# REQUIRED on a COLD simulator, and easy to miss: on a dev machine the app",
    "# has been launched before, so iOS already trusts the scheme and this dialog",
    "# never shows. On a freshly created simulator with a never-launched app it",
    "# ALWAYS shows — and while it sits unanswered the app cannot launch, so the",
    "# `login-screen` wait below burns its whole timeout against the iOS home",
    "# screen. Diagnosed from a CI failure screenshot (the flow reported only",
    "# `Assertion is false: id: login-screen is visible`, which named what was",
    "# absent and nothing about the dialog that caused it).",
    "- runFlow:",
    "    when:",
    '      visible: "Open"',
    "    commands:",
    '      - tapOn: "Open"',
    "# Wait for the app to boot (bundle loaded). The unauthenticated LoginScreen",
    "# is the stable, scenario-agnostic boot marker; `visual-ready` only appears",
    "# AFTER the scenario deep link below, so waiting for it here would always",
    "# time out on the login screen.",
    "- extendedWaitUntil:",
    "    visible:",
    '      id: "login-screen"',
    `    timeout: ${BOOT_WAIT_MS}`,
    "# Step 2: in-app navigation to the scenario route (release scheme).",
    "- openLink:",
    `    link: "rtcmobile://__visual/${id}"`,
    "# Dismiss the iOS 'Open in RTC Mobile?' confirmation if it appears.",
    "- runFlow:",
    "    when:",
    '      visible: "Open"',
    "    commands:",
    '      - tapOn: "Open"',
    "# Maestro CAN query the a11y tree (XCUITest) — unlike simctl/idb. Wait for",
    "# the harness to signal ready (one frame after fonts load) before shooting.",
    "- extendedWaitUntil:",
    "    visible:",
    '      id: "visual-ready"',
    `    timeout: ${READY_WAIT_MS}`,
    `- takeScreenshot: shots/${safe}`,
    "",
  ].join("\n");
}

export async function generateFlows(): Promise<void> {
  for (const id of SCENARIO_IDS) {
    const p = join(HERE, "flows", `${id.replace(/\//g, "_")}.yaml`);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, flowYaml(id));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void generateFlows();
}
