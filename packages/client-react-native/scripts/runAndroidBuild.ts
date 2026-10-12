import { execFileSync } from "node:child_process";
import { env } from "node:process";

import {
  bootEmulator,
  resolveAndroidTools,
  uninstallOtherBuildKind,
} from "./androidDevice.ts";

/**
 * Installs and opens the latest EAS cloud build in an Android emulator,
 * starting the emulator first if none is running:
 *
 *   pnpm preview:android:run                       # from the repo root
 *   RTC_ANDROID_AVD=Pixel_8 pnpm preview:android:run
 *
 * It does not build anything. The build is whatever `eas build -p android
 * --profile preview` last produced; this downloads that APK (EAS caches it)
 * and runs it. A dev build left by `pnpm dev:android` is removed first.
 */
async function main(): Promise<void> {
  const tools = resolveAndroidTools();

  await bootEmulator(tools);
  uninstallOtherBuildKind(tools, "release");

  console.log("Installing the latest EAS build…");
  // `build:run` finds adb through ANDROID_HOME, so hand it the SDK we resolved.
  execFileSync(
    "pnpm",
    ["dlx", `eas-cli@${EAS_CLI}`, "build:run", "-p", "android", "--latest"],
    { stdio: "inherit", env: { ...env, ANDROID_HOME: tools.sdk } },
  );
}

/** Kept in step with `demo:ios:publish` in package.json: one exact, known-good
 * eas-cli rather than whatever is newest on npm. */
const EAS_CLI = "24.10.0";

await main();
