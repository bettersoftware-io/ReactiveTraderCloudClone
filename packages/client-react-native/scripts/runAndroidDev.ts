import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { env, exit } from "node:process";

import {
  bootEmulator,
  resolveAndroidTools,
  uninstallOtherBuildKind,
} from "./androidDevice.ts";
import { readLocalServerPort } from "./androidEmulator.ts";

/**
 * The Android counterpart of `expo run:ios`: compiles the dev build, installs
 * it in an emulator and starts Metro. It is what the `dev:android*` scripts
 * run, each with its own `EXPO_PUBLIC_SERVER_URL`:
 *
 *   pnpm dev:android                              # from the repo root
 *   RTC_ANDROID_AVD=Pixel_8 pnpm dev:android
 *
 * Around `expo run:android` it does four things Expo leaves to the machine:
 * finds the SDK, picks a Java that can build, makes sure an emulator has
 * booted, and — when the app is pointed at a server on this machine — forwards
 * that port into the emulator, where `localhost` is otherwise the emulator
 * itself. A preview build left by `pnpm preview:android:run` is removed first.
 */
async function main(): Promise<void> {
  const tools = resolveAndroidTools();
  const javaHome = resolveJavaHome();

  await bootEmulator(tools);
  uninstallOtherBuildKind(tools, "debug");

  const serverPort = readLocalServerPort(env.EXPO_PUBLIC_SERVER_URL);

  if (serverPort !== null) {
    console.log(`Forwarding port ${serverPort} into the emulator…`);
    execFileSync(
      tools.adb,
      ["reverse", `tcp:${serverPort}`, `tcp:${serverPort}`],
      { stdio: "ignore" },
    );
  }

  const run = spawnSync("pnpm", ["exec", "expo", "run:android"], {
    stdio: "inherit",
    env: { ...env, ANDROID_HOME: tools.sdk, JAVA_HOME: javaHome },
  });

  exit(run.status ?? 1);
}

/** A `JAVA_HOME` that is already set is trusted. Otherwise Homebrew's Java 17
 * is used: the Java that Android Studio bundles (25) fails the native
 * `configureCMake` step on a warning Java 24 introduced, and macOS's own
 * `java` is a stub when no JDK is installed. */
function resolveJavaHome(): string {
  if (env.JAVA_HOME !== undefined && env.JAVA_HOME !== "") {
    return env.JAVA_HOME;
  }

  const found = HOMEBREW_JAVA_17.find((home) => {
    return existsSync(home);
  });

  if (found === undefined) {
    console.error(
      "No Java 17 found. Run `brew install openjdk@17`, or set JAVA_HOME to a JDK between 17 and 23.",
    );
    exit(1);
  }

  return found;
}

/** Apple silicon first, then Intel. */
const HOMEBREW_JAVA_17 = [
  "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
  "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
];

await main();
