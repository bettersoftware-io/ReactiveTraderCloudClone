import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import * as Reanimated from "react-native-reanimated";

import { lockEmblemPage } from "#tests/pages/LockEmblemPage";

const mockMotionEnabled = jest.fn<() => boolean>();
beforeEach(() => {
  jest.clearAllMocks();
  mockMotionEnabled.mockReturnValue(true);
});

afterEach(() => {
  return page.unmountAll();
});

test("renders the emblem under the lock-emblem testID", async () => {
  await page.mount();
  expect(page.exists("lock-emblem")).toBe(true);
});

// react-native-svg redraws a whole <Svg> when any child changes. With the
// animated orbit in the filtered <Svg>, Core Image re-ran the drop shadow on
// every frame and logged a CoreGraphics error burst each time (~250 lines a
// second while the sign-in screen was up).
test("the glow filter and the animated orbit are drawn in separate layers", async () => {
  await page.mount();
  const layers = page.layers();

  expect(
    layers.filter((layer) => {
      return layer.holdsGlowFilter && layer.holdsOrbit;
    }),
  ).toEqual([]);
  expect(
    layers.some((layer) => {
      return layer.holdsGlowFilter;
    }),
  ).toBe(true);
  expect(
    layers.some((layer) => {
      return layer.holdsOrbit;
    }),
  ).toBe(true);
});

test("with motion enabled, the orbit runs an endless linear spin", async () => {
  const withRepeatSpy = jest.spyOn(Reanimated, "withRepeat");
  await page.mount();
  expect(withRepeatSpy).toHaveBeenCalledTimes(1);
  expect(withRepeatSpy).toHaveBeenCalledWith(expect.anything(), -1);
});

test("with motion disabled, no spin is started and the orbit rests at 0°", async () => {
  mockMotionEnabled.mockReturnValue(false);
  const withRepeatSpy = jest.spyOn(Reanimated, "withRepeat");
  const cancelSpy = jest.spyOn(Reanimated, "cancelAnimation");
  await page.mount();
  expect(withRepeatSpy).not.toHaveBeenCalled();
  expect(cancelSpy).toHaveBeenCalled();
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: (): boolean => {
      return mockMotionEnabled();
    },
  };
});

const page = lockEmblemPage();
