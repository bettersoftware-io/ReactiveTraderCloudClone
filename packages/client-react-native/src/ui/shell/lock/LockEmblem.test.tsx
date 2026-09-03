import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import * as Reanimated from "react-native-reanimated";

import { lockEmblemPage } from "#tests/pages/LockEmblemPage";

const mockMotionEnabled = jest.fn<() => boolean>();
const page = lockEmblemPage();

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
