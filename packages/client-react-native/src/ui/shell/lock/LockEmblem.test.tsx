import { beforeEach, expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import * as Reanimated from "react-native-reanimated";

import { LockEmblem } from "#/ui/shell/lock/LockEmblem";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

beforeEach(() => {
  jest.clearAllMocks();
  mockMotionEnabled.mockReturnValue(true);
});

test("renders the emblem under the lock-emblem testID", async () => {
  await renderWithTheme(<LockEmblem />);
  expect(screen.getByTestId("lock-emblem")).toBeTruthy();
});

test("with motion enabled, the orbit runs an endless linear spin", async () => {
  const withRepeatSpy = jest.spyOn(Reanimated, "withRepeat");
  await renderWithTheme(<LockEmblem />);
  expect(withRepeatSpy).toHaveBeenCalledTimes(1);
  expect(withRepeatSpy).toHaveBeenCalledWith(expect.anything(), -1);
});

test("with motion disabled, no spin is started and the orbit rests at 0°", async () => {
  mockMotionEnabled.mockReturnValue(false);
  const withRepeatSpy = jest.spyOn(Reanimated, "withRepeat");
  const cancelSpy = jest.spyOn(Reanimated, "cancelAnimation");
  await renderWithTheme(<LockEmblem />);
  expect(withRepeatSpy).not.toHaveBeenCalled();
  expect(cancelSpy).toHaveBeenCalled();
});

const mockMotionEnabled = jest.fn<() => boolean>();

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: (): boolean => {
      return mockMotionEnabled();
    },
  };
});
