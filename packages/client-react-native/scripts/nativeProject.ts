import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env, exit } from "node:process";
import { fileURLToPath } from "node:url";

import { createFingerprintAsync, SourceSkips } from "@expo/fingerprint";

import {
  chooseNativeProjectAction,
  describeNativeProjectAction,
} from "./nativeProjectFreshness.ts";

/** The process half of keeping `ios/` and `android/` current: fingerprint the
 * native inputs, compare with the stamp from the last prebuild, and prebuild
 * again when they differ. The decision itself is `nativeProjectFreshness.ts`. */

export type NativePlatform = "ios" | "android";

/** Regenerates `ios/` (or `android/`) when its native inputs changed since it
 * was generated, and generates it when it is missing. What `dev:ios` and
 * `dev:android` run before building. */
export async function refreshStaleNativeProject(
  platform: NativePlatform,
): Promise<void> {
  const directory = path.join(PROJECT_ROOT, platform);
  const stampPath = path.join(directory, STAMP_FILE);
  const current = await fingerprintNativeInputs(platform);
  const action = chooseNativeProjectAction({
    exists: existsSync(directory),
    stamp: existsSync(stampPath)
      ? readFileSync(stampPath, "utf8").trim()
      : null,
    current,
  });
  const message = describeNativeProjectAction(action, platform);

  if (message !== null) {
    console.log(message);
    prebuildNativeProject(platform, current);
  }
}

/** Regenerates `ios/` (or `android/`) whatever its stamp says — the
 * `native:regenerate:*` scripts, for when a hand edit or a failed build left
 * it in a state its inputs do not describe. */
export async function regenerateNativeProject(
  platform: NativePlatform,
): Promise<void> {
  console.log(`Regenerating ${platform}/…`);
  prebuildNativeProject(platform, await fingerprintNativeInputs(platform));
}

/** Prebuilds from scratch, then stamps the folder with the fingerprint it was
 * generated from. Exits when prebuild fails, leaving no stamp. */
function prebuildNativeProject(
  platform: NativePlatform,
  fingerprint: string,
): void {
  const prebuild = spawnSync(
    "pnpm",
    ["exec", "expo", "prebuild", "--platform", platform, "--clean"],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      // The native folders are generated and git-ignored, so the warning
      // `--clean` gives about uncommitted changes protects nothing here —
      // and it would stop an otherwise unattended dev run at a prompt.
      env: { ...env, EXPO_NO_GIT_STATUS: "1" },
    },
  );

  if (prebuild.status !== 0) {
    console.error(`expo prebuild --platform ${platform} failed.`);
    exit(prebuild.status ?? 1);
  }

  writeFileSync(
    path.join(PROJECT_ROOT, platform, STAMP_FILE),
    `${fingerprint}\n`,
  );
}

/**
 * The hash of everything that shapes the generated native project: the app
 * config (config plugins included, and their source files), native
 * dependencies and their autolinking. `ios/` itself is git-ignored, so its
 * contents are not part of it.
 *
 * The app config's `extra` is skipped: it carries `serverUrl`, which each
 * `dev:*` data-source mode sets differently and which reaches the app through
 * the Metro manifest, not the native project. Hashing it would regenerate the
 * whole folder on every switch between modes.
 */
export async function fingerprintNativeInputs(
  platform: NativePlatform,
): Promise<string> {
  const fingerprint = await createFingerprintAsync(PROJECT_ROOT, {
    platforms: [platform],
    sourceSkips: SourceSkips.ExpoConfigExtraSection,
  });

  return fingerprint.hash;
}

const PROJECT_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Inside the native folder, so deleting the folder deletes its stamp. */
const STAMP_FILE = ".rtc-native-fingerprint";
