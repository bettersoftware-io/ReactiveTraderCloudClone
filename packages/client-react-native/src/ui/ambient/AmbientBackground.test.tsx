// packages/client-react-native/src/ui/ambient/AmbientBackground.test.tsx
import { afterEach, expect, jest, test } from "@jest/globals";
import * as Reanimated from "react-native-reanimated";

import { ambientBackgroundPage } from "#tests/pages/AmbientBackgroundPage";

const page = ambientBackgroundPage();

test("renders nothing when the animated-background preference is off (the mobile default)", async () => {
  await page.mount({ animatedBackground: false });
  expect(page.exists("ambient-background")).toBe(false);
});

test("renders the canvas when the animated-background preference is on", async () => {
  await page.mount({ animatedBackground: true });
  expect(await page.awaitExists("ambient-background")).toBeTruthy();
});

test("draws the aurora wash group when ambientStyle is aurora and ambient is enabled", async () => {
  await page.mount({ animatedBackground: true, ambientStyle: "aurora" });
  expect(await page.awaitExists("ambient-aurora-wash")).toBeTruthy();
  expect(page.exists("ambient-rays-blobs")).toBe(false);
});

test("draws the rays blobs group when ambientStyle is rays and ambient is enabled", async () => {
  await page.mount({ animatedBackground: true, ambientStyle: "rays" });
  expect(await page.awaitExists("ambient-rays-blobs")).toBeTruthy();
  expect(page.exists("ambient-aurora-wash")).toBe(false);
});

// The drift loop is the one piece of ambient motion Freeze did not reach
// before: `useAmbientEnabled` reads only the preference and OS reduced-motion.
// Asserted on `withRepeat` itself — the loop is a UI-thread worklet the render
// tree cannot show, and the mock's shared values would resolve instantly
// either way.
test("does not start the drift loop under power-saver Freeze, but still paints the canvas", async () => {
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  await page.mount({ animatedBackground: true, powerSaverLevel: "freeze" });
  expect(await page.awaitExists("ambient-background")).toBeTruthy();
  expect(withRepeat).not.toHaveBeenCalled();
});

test("starts the drift loop when power-saver is off", async () => {
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  await page.mount({ animatedBackground: true, powerSaverLevel: "off" });
  expect(withRepeat).toHaveBeenCalledTimes(1);
});

afterEach(() => {
  jest.restoreAllMocks();
});
