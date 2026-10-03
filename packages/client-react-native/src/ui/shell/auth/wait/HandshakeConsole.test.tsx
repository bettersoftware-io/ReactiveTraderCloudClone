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

test("renders all three handshake lines", async () => {
  await page.mountHandshake();

  expect(page.exists("auth-wait-handshake")).toBe(true);
  expect(page.hasText("▸ SECURE CHANNEL OPEN")).toBe(true);
  expect(page.hasText("▸ CREDENTIALS SEALED")).toBe(true);
  expect(page.hasText("▸ AWAITING AUTH GRANT")).toBe(true);
});

test("with motion enabled, the sealed line fades in once and only the caret loops", async () => {
  const withRepeatSpy = jest.spyOn(Reanimated, "withRepeat");
  const withDelaySpy = jest.spyOn(Reanimated, "withDelay");
  await page.mountHandshake();

  expect(withRepeatSpy).toHaveBeenCalledTimes(1);
  expect(withRepeatSpy).toHaveBeenCalledWith(expect.anything(), -1);
  expect(withDelaySpy).toHaveBeenCalledWith(350, expect.anything());
});

// The wait is longest on the devices that turn motion off, so the resting
// frame must still read in full.
test("with motion disabled, nothing animates and every line rests fully visible", async () => {
  mockMotionEnabled.mockReturnValue(false);
  const withRepeatSpy = jest.spyOn(Reanimated, "withRepeat");
  const withDelaySpy = jest.spyOn(Reanimated, "withDelay");
  await page.mountHandshake();

  expect(withRepeatSpy).not.toHaveBeenCalled();
  expect(withDelaySpy).not.toHaveBeenCalled();
  expect(page.opacityOf("auth-wait-handshake-sealed")).toBe(1);
  expect(page.opacityOf("auth-wait-handshake-caret")).toBe(1);
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: (): boolean => {
      return mockMotionEnabled();
    },
  };
});

const page = authWaitPage();
