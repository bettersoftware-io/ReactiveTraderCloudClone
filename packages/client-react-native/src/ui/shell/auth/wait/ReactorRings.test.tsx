import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import * as Reanimated from "react-native-reanimated";

import { authWaitPage } from "#tests/pages/AuthWaitPage";

const mockMotionEnabled = jest.fn<() => boolean>();
beforeEach(() => {
  jest.clearAllMocks();
  mockMotionEnabled.mockReturnValue(true);
});

afterEach(() => {
  return page.unmountAll();
});

test("renders its child with both rings around it", async () => {
  await page.mountReactorRings();

  expect(page.exists("auth-wait-rings")).toBe(true);
  expect(page.exists("emblem-marker")).toBe(true);
  expect(page.exists("auth-wait-ring-outer")).toBe(true);
  expect(page.exists("auth-wait-ring-inner")).toBe(true);
});

test("with motion enabled, both rings and the emblem pulse loop", async () => {
  const withRepeatSpy = jest.spyOn(Reanimated, "withRepeat");
  await page.mountReactorRings();

  expect(withRepeatSpy).toHaveBeenCalledTimes(3);
  expect(withRepeatSpy).toHaveBeenCalledWith(expect.anything(), -1);
});

test("with motion disabled, nothing loops and the rings rest unrotated", async () => {
  mockMotionEnabled.mockReturnValue(false);
  const withRepeatSpy = jest.spyOn(Reanimated, "withRepeat");
  await page.mountReactorRings();

  expect(withRepeatSpy).not.toHaveBeenCalled();
  expect(page.transformOf("auth-wait-ring-outer")).toEqual([
    { rotate: "0deg" },
  ]);
  expect(page.transformOf("auth-wait-ring-inner")).toEqual([
    { rotate: "0deg" },
  ]);
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: (): boolean => {
      return mockMotionEnabled();
    },
  };
});

const page = authWaitPage();
