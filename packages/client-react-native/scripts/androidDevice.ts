import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { env, exit } from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  ANDROID_PIN,
  type AvdConfig,
  matchesAndroidPin,
  readAvdConfig,
} from "../tests/visual/shared/devicePin.ts";
import {
  listRunningEmulators,
  listVirtualDevices,
  readInstalledBuildKind,
} from "./androidEmulator.ts";
import { chooseDevEmulator, type RunningEmulator } from "./devDevice.ts";

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

/**
 * Starts (or reuses) the emulator a run installs into, blocks until Android
 * has finished booting, and returns it. Which one: `requested` (`--device` /
 * `RTC_ANDROID_AVD`), else the AVD the visual goldens are shot on, else one
 * already running, else the first AVD (`chooseDevEmulator`). Defaulting to the
 * pinned AVD means the dev build lands where the visual runner needs it.
 *
 * Several emulators may be running, so the chosen one's serial is exported as
 * `ANDROID_SERIAL`: `adb` reads it, which routes every later `adb` call here
 * and in Expo to that device rather than failing on "more than one device".
 * A virtual device must already exist — creating one needs a system image,
 * which Android Studio's Device Manager downloads.
 */
export async function bootEmulator(
  tools: AndroidTools,
  requested: string | undefined,
): Promise<StartedEmulator> {
  const available = listVirtualDevices(
    readOutput(tools.emulator, ["-list-avds"]),
  );

  const running = listRunningEmulators(
    readOutput(tools.adb, ["devices"]),
  ).flatMap((serial) => {
    const avd = readRunningAvdName(tools.adb, serial);
    return avd === null ? [] : [{ serial, avd }];
  });

  const pinned =
    available.find((avd) => {
      return matchesAndroidPin(readAvdConfigOnDisk(avd));
    }) ?? null;
  const choice = chooseDevEmulator({ requested, pinned, running, available });

  if (choice === null) {
    console.error(
      available.length === 0
        ? "No Android virtual device exists. Create one in Android Studio → Device Manager (an arm64 system image on Apple silicon)."
        : `No virtual device named "${requested ?? ""}". Available: ${available.join(", ")}.`,
    );
    exit(1);
  }

  const role =
    choice.avd === pinned ? ", the device the visual goldens are shot on" : "";
  let serial = choice.serial;

  if (serial === null) {
    serial = `emulator-${findFreeConsolePort(running)}`;
    console.log(`Starting emulator ${choice.avd}${role}…`);
    // Detached and unreferenced: the emulator is a window the user keeps, not
    // a child that should die when this script exits.
    spawn(
      tools.emulator,
      ["-avd", choice.avd, "-port", serial.slice("emulator-".length)],
      { detached: true, stdio: "ignore" },
    ).unref();
  } else {
    console.log(`Using the running emulator ${choice.avd} (${serial})${role}.`);
  }

  if (pinned === null && requested === undefined) {
    console.log(
      `No ${ANDROID_PIN.displayName} AVD on API ${ANDROID_PIN.apiLevel} here, the device the visual goldens are shot on — see tests/visual/README.md to create one.`,
    );
  }

  env.ANDROID_SERIAL = serial;
  await waitForBoot(tools.adb, serial);

  return { avd: choice.avd, serial };
}

export interface StartedEmulator {
  readonly avd: string;
  readonly serial: string;
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
async function waitForBoot(adb: string, serial: string): Promise<void> {
  execFileSync(adb, ["-s", serial, "wait-for-device"], { stdio: "ignore" });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (readBootCompleted(adb, serial) === "1") {
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
function readBootCompleted(adb: string, serial: string): string {
  try {
    return readOutput(adb, [
      "-s",
      serial,
      "shell",
      "getprop",
      "sys.boot_completed",
    ]).trim();
  } catch {
    return "";
  }
}

/** The emulator console answers with the AVD's name, then `OK`. `null` when
 * the console does not answer, which leaves that emulator out. */
function readRunningAvdName(adb: string, serial: string): string | null {
  try {
    const name = readOutput(adb, ["-s", serial, "emu", "avd", "name"])
      .split("\n")[0]
      ?.trim();

    return name === undefined || name === "" ? null : name;
  } catch {
    return null;
  }
}

/** What an AVD's `config.ini` says it is. `<avd>.ini` says where the AVD's
 * directory is; an AVD that cannot be read matches nothing. */
function readAvdConfigOnDisk(avd: string): AvdConfig {
  const home = env.ANDROID_AVD_HOME ?? path.join(homedir(), ".android/avd");

  try {
    const pointer = readFileSync(path.join(home, `${avd}.ini`), "utf8");
    const directory =
      /^path=(.+)$/m.exec(pointer)?.[1]?.trim() ??
      path.join(home, `${avd}.avd`);

    return readAvdConfig(
      readFileSync(path.join(directory, "config.ini"), "utf8"),
    );
  } catch {
    return { hardwareProfile: null, apiLevel: null };
  }
}

/** The first console port no running emulator holds — each takes two,
 * starting at 5554 — so a started emulator's serial is known in advance. */
function findFreeConsolePort(running: readonly RunningEmulator[]): number {
  let port = 5554;

  while (
    running.some((emulator) => {
      return emulator.serial === `emulator-${port}`;
    })
  ) {
    port += 2;
  }

  return port;
}

/** `android.package` in `app.config.ts`. */
const APPLICATION_ID = "io.bettersoftware.rtcmobile";
const BOOT_TIMEOUT_MS = 180_000;
const BOOT_POLL_MS = 2_000;
