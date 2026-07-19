import { afterEach, beforeEach, expect, test } from "vitest";

import { visualHarnessEnabled } from "#/app/visualHarnessGate";

type DevGlobal = { __DEV__?: boolean };

const originalFlag: string | undefined = process.env.EXPO_PUBLIC_VISUAL_HARNESS;
const originalDev: boolean | undefined = (globalThis as DevGlobal).__DEV__;

beforeEach(() => {
  // React Native defines `__DEV__ === true` in dev/test builds (jest sets it
  // too); vitest's node env does not, so establish the same default here.
  (globalThis as DevGlobal).__DEV__ = true;
});

afterEach(() => {
  (globalThis as DevGlobal).__DEV__ = originalDev;
  if (originalFlag === undefined) {
    delete process.env.EXPO_PUBLIC_VISUAL_HARNESS;
  } else {
    process.env.EXPO_PUBLIC_VISUAL_HARNESS = originalFlag;
  }
});

test("is off by default", () => {
  delete process.env.EXPO_PUBLIC_VISUAL_HARNESS;
  expect(visualHarnessEnabled()).toBe(false);
});

test("is on when the flag is 1", () => {
  process.env.EXPO_PUBLIC_VISUAL_HARNESS = "1";
  expect(visualHarnessEnabled()).toBe(true);
});

test("is off for any other value", () => {
  process.env.EXPO_PUBLIC_VISUAL_HARNESS = "true";
  expect(visualHarnessEnabled()).toBe(false);
});

test("stays inert in a release build even when the flag is set", () => {
  (globalThis as DevGlobal).__DEV__ = false;
  process.env.EXPO_PUBLIC_VISUAL_HARNESS = "1";
  expect(visualHarnessEnabled()).toBe(false);
});
