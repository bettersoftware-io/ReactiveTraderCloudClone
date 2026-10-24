import { execFileSync, spawnSync } from "node:child_process";
import { argv, exit } from "node:process";

import {
  choosePinnedSimulator,
  IOS_PIN,
  parseSimulators,
  type Simulator,
} from "../tests/visual/shared/devicePin.ts";
import { hasDeviceArgument } from "./devDevice.ts";
import { refreshStaleNativeProject } from "./nativeProject.ts";

/**
 * `expo run:ios`, with `ios/` regenerated first when its native inputs changed
 * since it was generated — `expo run:ios` alone only prebuilds a MISSING
 * `ios/`, and builds a stale one as it is. What the `dev:ios*` scripts run;
 * arguments pass through to `expo run:ios`:
 *
 *   pnpm dev:ios                          # from the repo root
 *   pnpm dev:ios --device "iPhone Duo"    # any other simulator (name or UDID)
 *
 * Without `--device` it builds for the simulator the visual goldens are shot
 * on (iPhone 17, iOS 26), so the dev client lands where the visual runners
 * need it — not on whichever simulator happens to be booted, which is what
 * `expo run:ios` would pick.
 */
async function main(): Promise<void> {
  await refreshStaleNativeProject("ios");

  const args = argv.slice(2);

  if (!hasDeviceArgument(args)) {
    const pinned = findPinnedSimulator();

    if (pinned === null) {
      console.log(
        `No ${IOS_PIN.displayName} simulator on an iOS ${IOS_PIN.runtimeMajor} runtime here, the device the visual goldens are shot on — Expo picks one instead. See tests/visual/README.md to create it.`,
      );
    } else {
      console.log(
        `Using ${IOS_PIN.displayName} (${pinned.udid}), the simulator the visual goldens are shot on. Pass --device to choose another.`,
      );
      args.push("--device", pinned.udid);
    }
  }

  showSimulatorWindow();

  const run = spawnSync("pnpm", ["exec", "expo", "run:ios", ...args], {
    stdio: "inherit",
  });

  exit(run.status ?? 1);
}

function findPinnedSimulator(): Simulator | null {
  try {
    return choosePinnedSimulator(
      parseSimulators(
        execFileSync("xcrun", ["simctl", "list", "devices", "-j"], {
          encoding: "utf8",
        }),
      ),
    );
  } catch {
    return null;
  }
}

/**
 * Opens Simulator.app. `expo run:ios` opens it only when it boots the device
 * itself; a simulator already booted from the command line (`simctl boot`, a
 * visual run) has no window, and the app then runs where nobody can see it.
 * Best-effort: a failure here should not stop the build.
 */
function showSimulatorWindow(): void {
  try {
    execFileSync("open", ["-a", "Simulator"], { stdio: "ignore" });
  } catch {
    // No Simulator.app (Xcode not installed) — `expo run:ios` will say so.
  }
}

await main();
