import { expect, test } from "vitest";

import { resolveBootMotionEnabled } from "./resolveBootMotionEnabled";

test("plays when nothing suppresses it", () => {
  expect(resolveBootMotionEnabled(false, false, false)).toBe(true);
});

test("OS reduced-motion suppresses it", () => {
  expect(resolveBootMotionEnabled(true, false, false)).toBe(false);
});

test("forceBootAnimation overrides OS reduced-motion", () => {
  expect(resolveBootMotionEnabled(true, false, true)).toBe(true);
});

test("Freeze suppresses it even when forced", () => {
  expect(resolveBootMotionEnabled(false, true, true)).toBe(false);
});

test("Freeze suppresses it when reduced-motion is also set and forced", () => {
  expect(resolveBootMotionEnabled(true, true, true)).toBe(false);
});
