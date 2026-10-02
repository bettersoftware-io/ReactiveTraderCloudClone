import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Resolves the booted simulator's real UDID.
 *
 * `simctl` accepts the literal `"booted"` as a target; **`idb` does not** — it
 * answers `Cannot spawn companion for booted, no matching target`. Passing
 * `"booted"` through therefore broke every `idb ui describe-all` poll, and
 * because `waitForAppBoot` swallows describe failures to ride out mid-relaunch
 * blips, the run died 20s later claiming the simulator was "still showing the
 * Expo dev-client launcher" — a confident, wrong diagnosis of a healthy app.
 * Resolving the concrete UDID up front keeps both tools addressable.
 *
 * Shared by both tiers: the Maestro runner needs the same UDID to pin
 * `maestro --udid` (otherwise Maestro picks a device itself, and a second
 * booted simulator could be shot against goldens that claim iPhone 17) and to
 * hand `hideDevMenuFab` the device it must write the preference to. */
export async function resolveBootedUdid(): Promise<string> {
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
