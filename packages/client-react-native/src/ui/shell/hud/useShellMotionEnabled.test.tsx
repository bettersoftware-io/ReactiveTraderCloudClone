import { afterEach, expect, jest, test } from "@jest/globals";

import { shellMotionEnabledPage } from "#tests/pages/UseShellMotionEnabledPage";

const mockReducedMotion = jest.fn<() => boolean>();
const mockPowerSaver = jest.fn<() => MockPowerSaverResult>();
const page = shellMotionEnabledPage();

afterEach(() => {
  return page.unmountAll();
});

test("motion runs when reduced-motion is off and not freezing", async () => {
  mockReducedMotion.mockReturnValue(false);
  mockPowerSaver.mockReturnValue({ isCalm: false, isFreeze: false });
  await page.mount();
  expect(page.hasText("on")).toBe(true);
});

test("reduced motion stills the shell", async () => {
  mockReducedMotion.mockReturnValue(true);
  mockPowerSaver.mockReturnValue({ isCalm: false, isFreeze: false });
  await page.mount();
  expect(page.hasText("off")).toBe(true);
});

test("power-saver Freeze stills the shell", async () => {
  mockReducedMotion.mockReturnValue(false);
  mockPowerSaver.mockReturnValue({ isCalm: true, isFreeze: true });
  await page.mount();
  expect(page.hasText("off")).toBe(true);
});

interface MockPowerSaverResult {
  isCalm: boolean;
  isFreeze: boolean;
}

jest.mock("react-native-reanimated", () => {
  return {
    useReducedMotion: (): boolean => {
      return mockReducedMotion();
    },
  };
});

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return {
        usePowerSaver: () => {
          return mockPowerSaver();
        },
      };
    },
  };
});
