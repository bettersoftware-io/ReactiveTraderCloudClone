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
  expect(page.exists("ambient-rays")).toBe(false);
});

test("draws the rays group when ambientStyle is rays and ambient is enabled", async () => {
  await page.mount({ animatedBackground: true, ambientStyle: "rays" });
  expect(await page.awaitExists("ambient-rays")).toBeTruthy();
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

// The web scales the rays by the skin's intensity, which hides them on the
// calm skins. Here every skin gets the web's Holo level (0.6): glows at
// 0.18 and 0.13 of it, the beam at 0.06.
test.each([
  ["classic dark", rnThemeTokens.classic.dark],
  ["neon dark", rnThemeTokens.neon.dark],
])(
  "draws the rays glows and beam at one strength on %s",
  async (_name, theme) => {
    await page.mount({ animatedBackground: true, ambientStyle: "rays", theme });
    await page.awaitExists("ambient-rays");

    const [glowA, glowB] = page.shapeOpacities(/^rays-glow-/);
    const [sweep] = page.shapeOpacities(/^rays-sweep$/);

    expect(glowA).toBeCloseTo(0.18 * 0.6);
    expect(glowB).toBeCloseTo(0.13 * 0.6);
    expect(sweep).toBeCloseTo(0.06 * 0.6);
  },
);

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

// One loop per CSS animation a style ports: five for the aurora (`aurora-a` …
// `aurora-e`), three for the rays (two glows and the beam). Only the mounted
// style's loops run.
test("starts the aurora's five loops, and none of the rays', when power-saver is off", async () => {
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  await page.mount({
    animatedBackground: true,
    ambientStyle: "aurora",
    powerSaverLevel: "off",
  });
  expect(withRepeat).toHaveBeenCalledTimes(5);
});

test("starts the rays' three loops, and none of the aurora's, when power-saver is off", async () => {
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  await page.mount({
    animatedBackground: true,
    ambientStyle: "rays",
    powerSaverLevel: "off",
  });
  expect(withRepeat).toHaveBeenCalledTimes(3);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const page = ambientBackgroundPage();
