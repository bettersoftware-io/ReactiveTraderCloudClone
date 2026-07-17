import { afterEach, expect, test } from "vitest";

import { visualHarnessEnabled } from "#/app/visualHarnessGate";

const original: string | undefined = process.env.EXPO_PUBLIC_VISUAL_HARNESS;

afterEach(() => {
  if (original === undefined) {
    delete process.env.EXPO_PUBLIC_VISUAL_HARNESS;
  } else {
    process.env.EXPO_PUBLIC_VISUAL_HARNESS = original;
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
