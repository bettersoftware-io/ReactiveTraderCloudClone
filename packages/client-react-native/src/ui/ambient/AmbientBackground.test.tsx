// packages/client-react-native/src/ui/ambient/AmbientBackground.test.tsx
import { afterEach, expect, jest, test } from "@jest/globals";
import * as Reanimated from "react-native-reanimated";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { ambientBackgroundPage } from "#tests/pages/AmbientBackgroundPage";

afterEach(() => {
  return page.unmountAll();
});

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

// The washes were once multiplied by a per-skin intensity, which put them at
// 2% on classic and made the layer read as absent. The design draws them at
// the same strength in every skin.
test.each([
  ["classic dark", rnThemeTokens.classic.dark],
  ["neon dark", rnThemeTokens.neon.dark],
  ["terminal light", rnThemeTokens.terminal.light],
])(
  "draws the aurora washes at the design's 0.13 and 0.10 on %s",
  async (_name, theme) => {
    await page.mount({
      animatedBackground: true,
      ambientStyle: "aurora",
      theme,
    });
    await page.awaitExists("ambient-aurora-wash");
    expect(page.shapeOpacities(/^aurora-wash-/)).toEqual([0.13, 0.1]);
  },
);

test("draws the three rays blobs at one strength in every skin", async () => {
  await page.mount({
    animatedBackground: true,
    ambientStyle: "rays",
    theme: rnThemeTokens.classic.dark,
  });
  await page.awaitExists("ambient-rays-blobs");
  expect(page.shapeOpacities(/^rays-\d$/)).toEqual([0.18, 0.18, 0.18]);
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

const page = ambientBackgroundPage();
