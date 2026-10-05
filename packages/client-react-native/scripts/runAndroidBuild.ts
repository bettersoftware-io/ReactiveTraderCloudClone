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
} from "./androidEmulator.ts";

/**
 * Installs and opens the latest EAS cloud build in an Android emulator,
 * starting the emulator first if none is running:
 *
 *   pnpm preview:android:run                       # from the repo root
 *   RTC_ANDROID_AVD=Pixel_8 pnpm preview:android:run
 *
 * It does not build anything. The build is whatever `eas build -p android
 * --profile preview` last produced; this downloads that APK (EAS caches it)
 * and runs it.
 *
 * The Android SDK's tools are usually not on PATH on macOS, so they are
 * addressed by path under `ANDROID_HOME`, defaulting to where Android Studio
 * installs the SDK. A virtual device must already exist — creating one needs a
 * system image, which Android Studio's Device Manager downloads.
 */
async function main(): Promise<void> {
  const sdk = env.ANDROID_HOME ?? path.join(homedir(), "Library/Android/sdk");
  const adb = path.join(sdk, "platform-tools/adb");
  const emulator = path.join(sdk, "emulator/emulator");

  if (!existsSync(adb) || !existsSync(emulator)) {
    console.error(
      `No Android SDK at ${sdk}. Install Android Studio, or set ANDROID_HOME.`,
    );
    exit(1);
  }

  if (listRunningEmulators(readOutput(adb, ["devices"])).length === 0) {
    const available = listVirtualDevices(readOutput(emulator, ["-list-avds"]));
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
    spawn(emulator, ["-avd", device], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }

  await waitForBoot(adb);

  console.log("Installing the latest EAS build…");
  // `build:run` finds adb through ANDROID_HOME, so hand it the SDK we resolved.
  execFileSync(
    "pnpm",
    ["dlx", `eas-cli@${EAS_CLI}`, "build:run", "-p", "android", "--latest"],
    { stdio: "inherit", env: { ...env, ANDROID_HOME: sdk } },
  );
}

/** Blocks until Android reports the boot finished. `adb wait-for-device`
 * returns as soon as the device is visible, which is well before it can take
 * an install — `sys.boot_completed` is the signal that it can. */
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

function readOutput(command: string, args: readonly string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/** Kept in step with `demo:ios:publish` in package.json: one exact, known-good
 * eas-cli rather than whatever is newest on npm. */
const EAS_CLI = "24.10.0";
const BOOT_TIMEOUT_MS = 180_000;
const BOOT_POLL_MS = 2_000;

await main();
