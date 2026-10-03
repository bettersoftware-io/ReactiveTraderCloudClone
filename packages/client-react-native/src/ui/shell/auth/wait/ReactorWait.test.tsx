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

test("renders the status line and the indeterminate bar inside its track", async () => {
  await page.mountReactorWait();

  expect(page.exists("auth-wait-reactor")).toBe(true);
  expect(page.hasText("▸ AWAITING AUTH GRANT")).toBe(true);
  expect(page.exists("auth-wait-reactor-track")).toBe(true);
  expect(page.exists("auth-wait-reactor-bar")).toBe(true);
});

test("with motion enabled, the bar slide and the status pulse both loop", async () => {
  const withRepeatSpy = jest.spyOn(Reanimated, "withRepeat");
  await page.mountReactorWait();

  expect(withRepeatSpy).toHaveBeenCalledTimes(2);
  expect(withRepeatSpy).toHaveBeenCalledWith(expect.anything(), -1);
});

test("with motion disabled, nothing loops and the bar rests at the start of its track", async () => {
  mockMotionEnabled.mockReturnValue(false);
  const withRepeatSpy = jest.spyOn(Reanimated, "withRepeat");
  await page.mountReactorWait();

  expect(withRepeatSpy).not.toHaveBeenCalled();
  expect(page.transformOf("auth-wait-reactor-bar")).toEqual([
    { translateX: 0 },
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
