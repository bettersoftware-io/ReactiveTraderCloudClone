import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SCENARIO_IDS } from "../scenarioIds";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Dev-client + release schemes — mirror `simctl/capture.ts` (the proven
 * two-step). Maestro's `openLink` drives the same custom-scheme handoff; the
 * dev client must load the Metro bundle before the in-app scenario link.
 * `${METRO_PORT}` is substituted by the runner's env at `maestro test` time. */
const DEV_CLIENT_LINK =
  "exp+rtc-mobile://expo-development-client/?url=http://localhost:${MAESTRO_METRO_PORT}";

export function flowYaml(id: string): string {
  const safe = id.replace(/\//g, "_");
  return [
    "appId: io.bettersoftware.rtcmobile",
    "---",
    "# Step 1: load the Metro bundle via the dev client (two-step deep link).",
    "- openLink:",
    `    link: "${DEV_CLIENT_LINK}"`,
    "- extendedWaitUntil:",
    "    visible:",
    "      id: \"visual-pending|visual-ready\"",
    "    timeout: 20000",
    "# Step 2: in-app navigation to the scenario route (release scheme).",
    "- openLink:",
    `    link: "rtcmobile://__visual/${id}"`,
    "# Dismiss the iOS 'Open in RTC Mobile?' confirmation if it appears.",
    "- runFlow:",
    "    when:",
    "      visible: \"Open\"",
    "    commands:",
    "      - tapOn: \"Open\"",
    "# Maestro CAN query the a11y tree (XCUITest) — unlike simctl/idb. If this",
    "# assert proves flaky on-device, fall back to a fixed wait (bake-off note).",
    "- assertVisible:",
    "    id: \"visual-ready\"",
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
