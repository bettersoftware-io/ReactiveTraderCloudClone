import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  choosePinnedSimulator,
  describeMissingIosPin,
  describeOffPinSimulator,
  IOS_PIN,
  matchesIosPin,
  parseSimulators,
  type Simulator,
} from "./devicePin.ts";

const exec = promisify(execFile);

/**
 * Resolves the UDID of the simulator the iOS goldens were shot on, booting it
 * when it is shut down. Which other simulators are booted does not matter: the
 * run addresses this one by UDID.
 *
 * `requested` (`RTC_VISUAL_UDID`) picks among several pinned simulators, and is
 * refused when it is not one of them. A concrete UDID is returned, never the
 * literal `"booted"` alias: `simctl` accepts that, **`idb` does not** — it
 * answers `Cannot spawn companion for booted, no matching target`, and because
 * `waitForAppBoot` swallows describe failures, the run then died claiming the
 * simulator was "still showing the Expo dev-client launcher". Maestro needs the
 * same UDID for `maestro --udid`, or it picks a device itself.
 */
export async function resolvePinnedSimulator(
  requested: string | undefined,
): Promise<string> {
  const { stdout } = await exec("xcrun", ["simctl", "list", "devices", "-j"]);
  const simulator = choosePinned(parseSimulators(stdout), requested);

  if (simulator.state !== "Booted") {
    console.log(
      `Booting ${IOS_PIN.displayName} (${simulator.udid}), the simulator the iOS goldens were shot on…`,
    );
    // `-b` boots it if needed and returns once it has finished booting.
    await exec("xcrun", ["simctl", "bootstatus", simulator.udid, "-b"]);
  }

  return simulator.udid;
}

/**
 * Throws when the dev client is not installed on `udid`. The pinned simulator
 * is often not the one `pnpm dev:ios` installed the app on, and without this
 * the run would wait out its boot timeout on the iOS home screen.
 */
export async function refuseMissingDevClient(udid: string): Promise<void> {
  try {
    await exec("xcrun", ["simctl", "get_app_container", udid, APP_BUNDLE_ID]);
  } catch {
    throw new Error(
      `The dev client (${APP_BUNDLE_ID}) is not installed on the pinned simulator ${udid}. ` +
        "Build and install it there once:\n" +
        `  pnpm --filter @rtc/client-react-native ios --device ${udid}`,
    );
  }
}

/** The requested simulator when it matches the pin, else the pinned one this
 * machine has; throws when neither exists. */
function choosePinned(
  simulators: readonly Simulator[],
  requested: string | undefined,
): Simulator {
  if (requested !== undefined) {
    const simulator = simulators.find((candidate) => {
      return candidate.udid === requested;
    });

    if (simulator === undefined || !matchesIosPin(simulator)) {
      throw new Error(describeOffPinSimulator(requested, simulator));
    }

    return simulator;
  }

  const simulator = choosePinnedSimulator(simulators);

  if (simulator === null) {
    throw new Error(describeMissingIosPin());
  }

  return simulator;
}

/** `ios.bundleIdentifier` in `app.config.ts`. */
const APP_BUNDLE_ID = "io.bettersoftware.rtcmobile";
