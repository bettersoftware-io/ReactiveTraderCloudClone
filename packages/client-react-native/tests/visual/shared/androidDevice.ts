import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  ANDROID_PIN,
  type AvdConfig,
  describeMissingAndroidPin,
  describeOffPinEmulator,
  matchesAndroidPin,
  readAvdConfig,
} from "./devicePin.ts";

/**
 * What an Android capture run does to the emulator around the Maestro flows —
 * the `adb` siblings of `pinnedSimulator.ts` and `devMenuFab.ts`, which speak
 * `xcrun simctl` and so reach nothing here.
 *
 * `adb` and `emulator` are addressed by path under the Android SDK
 * (`ANDROID_HOME`, else where Android Studio installs it), as
 * `scripts/androidDevice.ts` does: the SDK puts neither on `PATH`.
 * `RTC_VISUAL_ADB` / `RTC_VISUAL_EMULATOR` override them.
 */
const SDK: string = env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk");
const ADB: string = env.RTC_VISUAL_ADB ?? join(SDK, "platform-tools/adb");
const EMULATOR: string =
  env.RTC_VISUAL_EMULATOR ?? join(SDK, "emulator/emulator");

/**
 * Resolves the serial of a running emulator on the AVD the Android goldens
 * were shot on, starting that AVD when none is running. Other emulators and
 * attached phones do not matter: the run addresses this one by serial.
 *
 * An emulator is recognised by its AVD's `config.ini` (hardware profile and
 * system image), never by its name. A started emulator is headless and cold:
 * `-no-window` because macOS App Nap throttles a covered emulator window 6-8x,
 * which is what made the first Android runs slow and flaky; `-no-snapshot`
 * because a resumed snapshot once lost its package service. It is left running
 * for the next run (`adb -s <serial> emu kill` stops it).
 *
 * `requested` (`RTC_VISUAL_UDID`) picks among several pinned emulators, and is
 * refused when it is not one of them, including any physical device.
 */
export async function resolvePinnedEmulator(
  requested: string | undefined,
): Promise<string> {
  const running = await listRunningAvds();

  if (requested !== undefined) {
    const avd =
      running.find((emulator) => {
        return emulator.serial === requested;
      })?.avd ?? null;

    if (avd === null || !matchesAndroidPin(await readAvdOnDisk(avd))) {
      throw new Error(describeOffPinEmulator(requested, avd));
    }

    return requested;
  }

  for (const emulator of running) {
    if (matchesAndroidPin(await readAvdOnDisk(emulator.avd))) {
      return emulator.serial;
    }
  }

  const avd = await findPinnedAvd();

  if (avd === null) {
    throw new Error(describeMissingAndroidPin());
  }

  const serial = await startEmulator(
    avd,
    running.map((emulator) => {
      return emulator.serial;
    }),
  );
  await waitForBoot(serial);

  return serial;
}

/** Makes the emulator's `localhost:<port>` reach Metro on this machine.
 *
 * Inside the emulator `localhost` is the emulator. The flows' dev-client link
 * says `http://localhost:<port>`, the same text the iOS simulator uses (it
 * shares the Mac's network), so the port is forwarded rather than the link
 * rewritten per platform. Not best-effort: without it the dev client cannot
 * load the bundle at all, and every flow would time out on `login-screen`. */
export async function reverseMetroPort(
  serial: string,
  port: string,
): Promise<void> {
  await runAdb(["-s", serial, "reverse", `tcp:${port}`, `tcp:${port}`]);
}

/**
 * Keeps expo-dev-menu out of the shots, and returns what the app's dev-menu
 * preferences held before, for {@link restoreAndroidDevMenu}.
 *
 * Three preferences, where iOS needs one. Besides the floating gear button
 * (`showFab`), the Android dev menu OPENS ITSELF over the app at launch while
 * `showsAtLaunch` is true or `isOnboardingFinished` is false
 * (`DevMenuFragment.kt`: `showsAtLaunch || !isOnboardingFinished`) — and both
 * defaults make it open. Left alone, every scenario would be shot with the menu
 * sheet covering it.
 *
 * They live in a `SharedPreferences` file private to the app, written here
 * through `run-as`, which a dev build allows because it is debuggable. The app
 * is stopped first: a running app holds the file in memory and would write its
 * own copy back over ours. The flows cold-start the app for every scenario, so
 * one write before the run covers all of them.
 *
 * Best-effort, like `hideDevMenuFab`: a device that refuses should cost a
 * noisier golden, never a failed run.
 */
export async function hideAndroidDevMenu(
  serial: string,
): Promise<DevMenuBackup> {
  try {
    await runAdb(["-s", serial, "shell", "am", "force-stop", APP_PACKAGE]);
    const previous = await readDevMenuPreferences(serial);
    await runAdb(
      [
        "-s",
        serial,
        "shell",
        `run-as ${APP_PACKAGE} sh -c 'mkdir -p shared_prefs && cat > ${DEV_MENU_PREFERENCES_FILE}'`,
      ],
      QUIET_DEV_MENU_PREFERENCES,
    );
    return { previous };
  } catch {
    return { previous: null };
  }
}

/** Undoes {@link hideAndroidDevMenu}: writes the earlier file back, or removes
 * ours when there was none, so the app returns to its own defaults instead of
 * to values this harness chose. Call in a `finally`. */
export async function restoreAndroidDevMenu(
  serial: string,
  backup: DevMenuBackup,
): Promise<void> {
  try {
    await runAdb(["-s", serial, "shell", "am", "force-stop", APP_PACKAGE]);

    if (backup.previous === null) {
      await runAdb([
        "-s",
        serial,
        "shell",
        `run-as ${APP_PACKAGE} rm -f ${DEV_MENU_PREFERENCES_FILE}`,
      ]);
      return;
    }

    await runAdb(
      [
        "-s",
        serial,
        "shell",
        `run-as ${APP_PACKAGE} sh -c 'cat > ${DEV_MENU_PREFERENCES_FILE}'`,
      ],
      backup.previous,
    );
  } catch {
    // The app was uninstalled mid-run, or the device went away.
  }
}

interface RunningAvd {
  readonly serial: string;
  readonly avd: string;
}

export interface DevMenuBackup {
  /** The preferences file as it was, or `null` when the app had none. */
  readonly previous: string | null;
}

async function readDevMenuPreferences(serial: string): Promise<string | null> {
  try {
    return await runAdb([
      "-s",
      serial,
      "shell",
      `run-as ${APP_PACKAGE} cat ${DEV_MENU_PREFERENCES_FILE}`,
    ]);
  } catch {
    // `cat` exits non-zero when the file does not exist: a fresh install.
    return null;
  }
}

/** Each running emulator's serial and the AVD it runs. A physical device has
 * no AVD and is left out. */
async function listRunningAvds(): Promise<RunningAvd[]> {
  const stdout = await runAdb(["devices"]);
  const serials = stdout
    .split("\n")
    .slice(1)
    .map((line) => {
      return line.trim().split(/\s+/);
    })
    .filter((columns) => {
      // `offline` and `unauthorized` rows are listed but cannot be driven.
      return columns[1] === "device" && columns[0]?.startsWith("emulator-");
    })
    .map((columns) => {
      return columns[0] ?? "";
    })
    .sort();

  const running: RunningAvd[] = [];

  for (const serial of serials) {
    const avd = await readRunningAvdName(serial);

    if (avd !== null) {
      running.push({ serial, avd });
    }
  }

  return running;
}

/** The emulator console answers with the name, then `OK`. `null` when the
 * console does not answer, which leaves that emulator out rather than failing
 * the run over a device it would not have used. */
async function readRunningAvdName(serial: string): Promise<string | null> {
  try {
    const name = (await runAdb(["-s", serial, "emu", "avd", "name"]))
      .split("\n")[0]
      ?.trim();

    return name === undefined || name === "" ? null : name;
  } catch {
    return null;
  }
}

/** The first AVD on this machine that matches the pin, by name order so the
 * same machine always starts the same one. */
async function findPinnedAvd(): Promise<string | null> {
  // The emulator mixes log lines (`INFO | …`) into this output; an AVD name is
  // a single bare token. Same parse as `scripts/androidEmulator.ts`.
  const avds = (await runTool(EMULATOR, ["-list-avds"]))
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .filter((line) => {
      return /^[A-Za-z0-9._-]+$/.test(line);
    })
    .sort();

  for (const avd of avds) {
    if (matchesAndroidPin(await readAvdOnDisk(avd))) {
      return avd;
    }
  }

  return null;
}

/** Reads `<avd>.ini`, which says where the AVD's directory is, then that
 * directory's `config.ini`. An AVD that cannot be read matches nothing. */
async function readAvdOnDisk(avd: string): Promise<AvdConfig> {
  const home = env.ANDROID_AVD_HOME ?? join(homedir(), ".android/avd");

  try {
    const pointer = await readFile(join(home, `${avd}.ini`), "utf8");
    const directory =
      /^path=(.+)$/m.exec(pointer)?.[1]?.trim() ?? join(home, `${avd}.avd`);

    return readAvdConfig(await readFile(join(directory, "config.ini"), "utf8"));
  } catch {
    return { hardwareProfile: null, apiLevel: null };
  }
}

/** Starts `avd` headless on the first console port no running emulator holds,
 * so its serial is known before it appears. Detached and unreferenced: the
 * emulator outlives this run. */
async function startEmulator(
  avd: string,
  runningSerials: readonly string[],
): Promise<string> {
  let port = FIRST_CONSOLE_PORT;

  while (runningSerials.includes(`emulator-${port}`)) {
    port += 2;
  }

  console.log(
    `Starting ${ANDROID_PIN.displayName} (AVD ${avd}) headless on port ${port}, the emulator the Android goldens were shot on…`,
  );
  spawn(
    EMULATOR,
    ["-avd", avd, "-port", String(port), "-no-window", "-no-snapshot"],
    { detached: true, stdio: "ignore" },
  ).unref();

  return `emulator-${port}`;
}

/** Polls `sys.boot_completed`, the signal that the device can take an app
 * launch; `adb` itself answers well before that. */
async function waitForBoot(serial: string): Promise<void> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const booted = await runAdb([
        "-s",
        serial,
        "shell",
        "getprop",
        "sys.boot_completed",
      ]);

      if (booted.trim() === "1") {
        return;
      }
    } catch {
      // Not attached yet.
    }

    await delay(BOOT_POLL_MS);
  }

  throw new Error(
    `${serial} did not finish booting within ${BOOT_TIMEOUT_MS / 1000}s.`,
  );
}

function runAdb(args: readonly string[], input?: string): Promise<string> {
  return runTool(ADB, args, input);
}

function runTool(
  command: string,
  args: readonly string[],
  input?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, [...args], (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout);
    });

    if (input !== undefined) {
      child.stdin?.end(input);
    }
  });
}

/** The emulator's default console port; each one takes two. */
const FIRST_CONSOLE_PORT = 5554;
const BOOT_TIMEOUT_MS = 180_000;
const BOOT_POLL_MS = 2_000;

/** Matches `devMenuFab.ts`'s `APP_BUNDLE_ID` — `app.config.ts` gives both
 * platforms the same identifier. */
const APP_PACKAGE = "io.bettersoftware.rtcmobile";

/** `DEV_SETTINGS_PREFERENCES` in expo-dev-menu's `DevMenuPreferences.kt`,
 * relative to the app's data directory, where `run-as` starts. Restated as a
 * literal because it belongs to a native module: if a future expo-dev-menu
 * renames it, the symptom is the menu quietly returning to the goldens. */
const DEV_MENU_PREFERENCES_FILE =
  "shared_prefs/expo.modules.devmenu.sharedpreferences.xml";

/** Each key is the Kotlin property name — `SharedPreferencesDelegate` stores a
 * preference under `property.name`. */
const QUIET_DEV_MENU_PREFERENCES = [
  "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>",
  "<map>",
  '    <boolean name="showFab" value="false" />',
  '    <boolean name="showsAtLaunch" value="false" />',
  '    <boolean name="isOnboardingFinished" value="true" />',
  "</map>",
  "",
].join("\n");
