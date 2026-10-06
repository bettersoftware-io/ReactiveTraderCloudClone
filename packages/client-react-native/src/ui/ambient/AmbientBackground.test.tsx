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

test("draws the aurora curtains group when ambientStyle is aurora and ambient is enabled", async () => {
  await page.mount({ animatedBackground: true, ambientStyle: "aurora" });
  expect(await page.awaitExists("ambient-aurora-curtains")).toBeTruthy();
  expect(page.exists("ambient-rays-blobs")).toBe(false);
});

test("draws the rays blobs group when ambientStyle is rays and ambient is enabled", async () => {
  await page.mount({ animatedBackground: true, ambientStyle: "rays" });
  expect(await page.awaitExists("ambient-rays-blobs")).toBeTruthy();
  expect(page.exists("ambient-aurora-curtains")).toBe(false);
});

// The web draws its curtains and wash at their own strength in every skin;
// only the two glow layers follow the skin's intensity. Scaling the curtains
// too is what once made the whole style read as absent.
test.each([
  ["classic dark", rnThemeTokens.classic.dark],
  ["neon dark", rnThemeTokens.neon.dark],
  ["terminal light", rnThemeTokens.terminal.light],
])(
  "draws the three aurora curtains and the wash at the web's strengths on %s",
  async (_name, theme) => {
    await page.mount({
      animatedBackground: true,
      ambientStyle: "aurora",
      theme,
    });
    await page.awaitExists("ambient-aurora-curtains");
    expect(page.shapeOpacities(/^aurora-curtain-/)).toEqual([0.3, 0.24, 0.22]);
    expect(page.shapeOpacities(/^aurora-wash$/)).toEqual([0.5]);
  },
);

test("scales the two aurora glow layers, and only them, by the skin's intensity", async () => {
  const theme = rnThemeTokens.neon.dark;
  await page.mount({ animatedBackground: true, ambientStyle: "aurora", theme });
  await page.awaitExists("ambient-aurora-curtains");

  const [glowA, glowB] = page.shapeOpacities(/^aurora-glow-/);

  expect(glowA).toBeCloseTo(0.26 * theme.aurora);
  expect(glowB).toBeCloseTo(0.2 * theme.aurora);
});

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

// One loop per CSS animation the aurora ports (`aurora-a` … `aurora-e`); the
// rays blobs share a single one. Only the active style's loops run.
test("starts the aurora's five loops, and not the rays loop, when power-saver is off", async () => {
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  await page.mount({
    animatedBackground: true,
    ambientStyle: "aurora",
    powerSaverLevel: "off",
  });
  expect(withRepeat).toHaveBeenCalledTimes(5);
});

test("starts the one rays loop, and none of the aurora's, when power-saver is off", async () => {
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  await page.mount({
    animatedBackground: true,
    ambientStyle: "rays",
    powerSaverLevel: "off",
  });
  expect(withRepeat).toHaveBeenCalledTimes(1);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const page = ambientBackgroundPage();
