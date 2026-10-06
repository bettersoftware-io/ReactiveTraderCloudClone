import { execFile } from "node:child_process";
import { env } from "node:process";

/**
 * What an Android capture run does to the emulator around the Maestro flows —
 * the `adb` siblings of `bootedUdid.ts` and `devMenuFab.ts`, which speak
 * `xcrun simctl` and so reach nothing here.
 *
 * `adb` is found on `PATH` unless `RTC_VISUAL_ADB` names it: the Android SDK
 * does not put `platform-tools` on `PATH` by itself.
 */
const ADB: string = env.RTC_VISUAL_ADB ?? "adb";

/** Resolves the one running emulator or device's serial.
 *
 * The same contract as `resolveBootedUdid`: refuse to guess between two. The
 * goldens sit under a path naming one device, so a shot from an arbitrary
 * second one would be compared against a set it cannot match. */
export async function resolveAndroidSerial(): Promise<string> {
  const stdout = await runAdb(["devices"]);
  const serials = stdout
    .split("\n")
    .slice(1)
    .map((line) => {
      return line.trim().split(/\s+/);
    })
    .filter((columns) => {
      return columns[1] === "device";
    })
    .map((columns) => {
      return columns[0] ?? "";
    });

  if (serials.length === 0) {
    throw new Error(
      "No running Android emulator or device found. Start one " +
        "(`emulator -avd <name>`) or set RTC_VISUAL_UDID explicitly.",
    );
  }

  if (serials.length > 1) {
    throw new Error(
      `${serials.length} Android devices are attached (${serials.join(", ")}). ` +
        "Set RTC_VISUAL_UDID to choose one — guessing would capture from an " +
        "arbitrary device.",
    );
  }

  return serials[0] ?? "";
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

function runAdb(args: readonly string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(ADB, [...args], (error, stdout) => {
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
