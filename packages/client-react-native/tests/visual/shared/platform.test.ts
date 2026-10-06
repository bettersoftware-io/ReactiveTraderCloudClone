import { expect, test } from "vitest";

import { resolvePlatform } from "./platform";

test("an unset or empty value means iOS, the platform both tiers were built on", () => {
  expect(resolvePlatform(undefined)).toBe("ios");
  expect(resolvePlatform("")).toBe("ios");
  expect(resolvePlatform("ios")).toBe("ios");
});

test("android names itself", () => {
  expect(resolvePlatform("android")).toBe("android");
});

// Falling back to iOS here would compare an iPhone's shots against goldens the
// caller did not ask about, and print the result as a verdict.
test("an unknown value throws instead of falling back", () => {
  expect(() => {
    return resolvePlatform("Android");
  }).toThrow('must be "ios" or "android", got "Android"');
});
