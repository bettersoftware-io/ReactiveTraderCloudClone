import { argv, exit } from "node:process";

import {
  type NativePlatform,
  regenerateNativeProject,
} from "./nativeProject.ts";

/**
 * Regenerates `ios/` or `android/` from scratch, whatever its stamp says:
 *
 *   pnpm native:regenerate:ios            # from the repo root
 *   pnpm native:regenerate:android
 *
 * `dev:ios` / `dev:android` already regenerate a folder whose native inputs
 * changed. This is for a folder its inputs do not describe — hand-edited, or
 * left half-written by an interrupted prebuild.
 */
async function main(): Promise<void> {
  const platform = argv[2];

  if (!isNativePlatform(platform)) {
    console.error(
      `Usage: regenerateNativeProject.ts ios|android (got "${platform ?? ""}")`,
    );
    exit(1);
  }

  await regenerateNativeProject(platform);
}

function isNativePlatform(value: string | undefined): value is NativePlatform {
  return value === "ios" || value === "android";
}

await main();
