import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { takeScreenshot } from "react-native-owl";

import { SCENARIO_IDS } from "../scenarioIds";

const exec = promisify(execFile);

const APP_SCHEME = "rtcmobile";
const SETTLE_MS = 2500;

/**
 * Tier 3 (react-native-owl): the batteries-included contrast — owl owns
 * capture + diff + baseline via its own jest matcher, so it does NOT use the
 * shared `pixelmatch` core. The only shared piece is `SCENARIO_IDS`.
 *
 * owl drives the built (native) app; we deep-link each scenario with
 * `simctl openurl` (owl runs against the already-launched app on the booted
 * sim), let it settle, then snapshot. Requires the harness native build
 * (`EXPO_PUBLIC_VISUAL_HARNESS=1`) — see `owl.config.json`.
 */
describe("rn-visual (owl)", () => {
  for (const id of SCENARIO_IDS) {
    it(`matches ${id}`, async () => {
      await openScenario(id);
      const screen = await takeScreenshot(id.replace(/\//g, "_"));
      expect(screen).toMatchBaseline({ threshold: 0.06 });
    });
  }
});

async function openScenario(id: string): Promise<void> {
  await exec("xcrun", [
    "simctl",
    "openurl",
    "booted",
    `${APP_SCHEME}://__visual/${id}`,
  ]);
  await new Promise((r) => {
    setTimeout(r, SETTLE_MS);
  });
}
