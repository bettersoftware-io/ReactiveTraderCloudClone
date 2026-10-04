import { createRequire } from "node:module";

import { expect, test } from "vitest";

// Expo Go is the only free way to run this app on a real iPhone (no developer
// mode, no Apple account), and it ships FIXED native versions of the libraries
// below. Our JavaScript for each one must match the native half inside Expo
// Go, or every screen throws `undefined is not a function` on load — which is
// exactly what happened on 2026-10-04, after routine updates had carried seven
// of them ahead.
//
// Expo publishes the version it bundles in `expo/bundledNativeModules.json`,
// so the installed `expo` package is the source of truth and this test moves
// with an SDK upgrade on its own. Renovate is told to leave these alone
// (`.github/renovate.json5`); this is what fails if something bumps one anyway.

/** Native libraries the app imports that Expo Go bundles outside the `expo-*`
 * family (those move with `expo` itself). */
const BUNDLED_IN_EXPO_GO = [
  "@react-native-async-storage/async-storage",
  "@shopify/react-native-skia",
  "react-native-gesture-handler",
  "react-native-reanimated",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-svg",
  "react-native-worklets",
] as const;

test.each(BUNDLED_IN_EXPO_GO)(
  "%s is installed at the version Expo Go bundles",
  (name) => {
    const bundled: Record<
      string,
      string
    > = require("expo/bundledNativeModules.json");

    const expected = bundled[name];
    const installed: PackageManifest = require(`${name}/package.json`);

    expect(expected).toBeDefined();
    expect(isWithin(installed.version, expected ?? "")).toBe(true);
  },
);

// The check itself, so a typo in it cannot turn the cases above green.
test("a tilde range admits later patches only; a bare version admits itself", () => {
  expect(isWithin("5.7.3", "~5.7.0")).toBe(true);
  expect(isWithin("5.8.0", "~5.7.0")).toBe(false);
  expect(isWithin("5.6.9", "~5.7.0")).toBe(false);
  expect(isWithin("2.6.2", "2.6.2")).toBe(true);
  expect(isWithin("2.6.3", "2.6.2")).toBe(false);
});

/** Expo's list uses two spellings only: an exact version, or `~major.minor.patch`. */
function isWithin(installed: string, expected: string): boolean {
  if (!expected.startsWith("~")) {
    return installed === expected;
  }

  const [major, minor, patch] = expected.slice(1).split(".").map(Number);
  const [iMajor, iMinor, iPatch] = installed.split(".").map(Number);

  return iMajor === major && iMinor === minor && (iPatch ?? 0) >= (patch ?? 0);
}

interface PackageManifest {
  version: string;
}

const require = createRequire(import.meta.url);
