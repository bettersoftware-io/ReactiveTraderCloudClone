import { expect, jest, test } from "@jest/globals";

import { useShellMotionEnabledPage } from "#tests/pages/UseShellMotionEnabledPage";

const mockReducedMotion = jest.fn<() => boolean>();
const mockPowerSaver = jest.fn<() => MockPowerSaverResult>();

test("motion runs when reduced-motion is off and not freezing", async () => {
  mockReducedMotion.mockReturnValue(false);
  mockPowerSaver.mockReturnValue({ isCalm: false, isFreeze: false });
  const page = useShellMotionEnabledPage();
  await page.mount();
  expect(page.isOn()).toBe(true);
});

test("reduced motion stills the shell", async () => {
  mockReducedMotion.mockReturnValue(true);
  mockPowerSaver.mockReturnValue({ isCalm: false, isFreeze: false });
  const page = useShellMotionEnabledPage();
  await page.mount();
  expect(page.isOn()).toBe(false);
});

test("power-saver Freeze stills the shell", async () => {
  mockReducedMotion.mockReturnValue(false);
  mockPowerSaver.mockReturnValue({ isCalm: true, isFreeze: true });
  const page = useShellMotionEnabledPage();
  await page.mount();
  expect(page.isOn()).toBe(false);
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
