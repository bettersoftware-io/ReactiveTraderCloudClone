import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { env, exit } from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  chooseVirtualDevice,
  listRunningEmulators,
  listVirtualDevices,
  readInstalledBuildKind,
} from "./androidEmulator.ts";

/** The process half of the Android scripts — finding the SDK, starting an
 * emulator, clearing a build that would block an install. What `adb` and
 * `emulator` print is read by the pure functions in `androidEmulator.ts`. */

export interface AndroidTools {
  readonly sdk: string;
  readonly adb: string;
  readonly emulator: string;
}

/** The Android SDK's tools are usually not on PATH on macOS, so they are
 * addressed by path under `ANDROID_HOME`, defaulting to where Android Studio
 * installs the SDK. Exits when there is no SDK there. */
export function resolveAndroidTools(): AndroidTools {
  const sdk = env.ANDROID_HOME ?? path.join(homedir(), "Library/Android/sdk");
  const adb = path.join(sdk, "platform-tools/adb");
  const emulator = path.join(sdk, "emulator/emulator");

  if (!existsSync(adb) || !existsSync(emulator)) {
    console.error(
      `No Android SDK at ${sdk}. Install Android Studio, or set ANDROID_HOME.`,
    );
    exit(1);
  }

  return { sdk, adb, emulator };
}

/** Starts an emulator when none is running, then blocks until Android has
 * finished booting. A virtual device must already exist — creating one needs a
 * system image, which Android Studio's Device Manager downloads. */
export async function bootEmulator(tools: AndroidTools): Promise<void> {
  if (listRunningEmulators(readOutput(tools.adb, ["devices"])).length === 0) {
    const available = listVirtualDevices(
      readOutput(tools.emulator, ["-list-avds"]),
    );
    const device = chooseVirtualDevice(available, env.RTC_ANDROID_AVD);

    if (device === null) {
      console.error(
        available.length === 0
          ? "No Android virtual device exists. Create one in Android Studio → Device Manager (an arm64 system image on Apple silicon)."
          : `No virtual device named "${env.RTC_ANDROID_AVD ?? ""}". Available: ${available.join(", ")}.`,
      );
      exit(1);
    }

    console.log(`Starting emulator ${device}…`);
    // Detached and unreferenced: the emulator is a window the user keeps, not
    // a child that should die when this script exits.
    spawn(tools.emulator, ["-avd", device], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }

  await waitForBoot(tools.adb);
}

/** Uninstalls the app when the installed build is of the other kind. The dev
 * build and the EAS preview APK share one application id but are signed with
 * different keys, so installing one over the other fails with
 * `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Uninstalling drops that build's stored
 * session and preferences, which is why it is said out loud. */
export function uninstallOtherBuildKind(
  tools: AndroidTools,
  wanted: "debug" | "release",
): void {
  const installed = readInstalledBuildKind(
    readOutput(tools.adb, ["shell", "dumpsys", "package", APPLICATION_ID]),
  );

  if (installed === null || installed === wanted) {
    return;
  }

  console.log(
    `Removing the installed ${installed} build — Android will not install a ${wanted} build over it (different signing key).`,
  );
  execFileSync(tools.adb, ["uninstall", APPLICATION_ID], { stdio: "ignore" });
}

function readOutput(command: string, args: readonly string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/** `adb wait-for-device` returns as soon as the device is visible, which is
 * well before it can take an install — `sys.boot_completed` is the signal
 * that it can. */
async function waitForBoot(adb: string): Promise<void> {
  execFileSync(adb, ["wait-for-device"], { stdio: "ignore" });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (readBootCompleted(adb) === "1") {
      return;
    }

    await delay(BOOT_POLL_MS);
  }

  console.error(
    `The emulator did not finish booting within ${BOOT_TIMEOUT_MS / 1000}s.`,
  );
  exit(1);
}

/** `""` while the property service is not up yet — adb exits non-zero then. */
function readBootCompleted(adb: string): string {
  try {
    return readOutput(adb, ["shell", "getprop", "sys.boot_completed"]).trim();
  } catch {
    return "";
  }
}

/** `android.package` in `app.config.ts`. */
const APPLICATION_ID = "io.bettersoftware.rtcmobile";
const BOOT_TIMEOUT_MS = 180_000;
const BOOT_POLL_MS = 2_000;
