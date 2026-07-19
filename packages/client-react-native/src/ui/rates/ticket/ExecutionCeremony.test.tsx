import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { Direction, ExecutionStatus } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

const { ExecutionCeremony } =
  require("./ExecutionCeremony") as typeof import("./ExecutionCeremony");

const Haptics = require("expo-haptics") as MockedHaptics;

test("ready renders nothing", async () => {
  const { toJSON } = await renderWithTheme(
    <ExecutionCeremony state={{ status: "ready" }} direction={null} />,
  );
  expect(toJSON()).toBeNull();
});

test("started shows the busy overlay", async () => {
  await renderWithTheme(
    <ExecutionCeremony
      state={{ status: "started" }}
      direction={Direction.Buy}
    />,
  );
  expect(screen.getByText(/EXECUTING/)).toBeTruthy();
});

test("finished+Done shows FILLED", async () => {
  await renderWithTheme(
    <ExecutionCeremony
      state={{ status: "finished", executionStatus: ExecutionStatus.Done }}
      direction={Direction.Buy}
    />,
  );
  expect(screen.getByText("FILLED")).toBeTruthy();
});

test("finished+Rejected shows REJECTED", async () => {
  await renderWithTheme(
    <ExecutionCeremony
      state={{ status: "finished", executionStatus: ExecutionStatus.Rejected }}
      direction={Direction.Sell}
    />,
  );
  expect(screen.getByText("REJECTED")).toBeTruthy();
});

test("timeout shows TIMED OUT", async () => {
  await renderWithTheme(
    <ExecutionCeremony
      state={{ status: "timeout" }}
      direction={Direction.Buy}
    />,
  );
  expect(screen.getByText("TIMED OUT")).toBeTruthy();
});

test("haptic fires once entering a terminal state, not on a re-render staying finished", async () => {
  Haptics.notificationAsync.mockClear();
  const { rerender } = await renderWithTheme(
    <ExecutionCeremony state={{ status: "ready" }} direction={null} />,
  );

  await rerender(
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <ExecutionCeremony
        state={{ status: "finished", executionStatus: ExecutionStatus.Done }}
        direction={Direction.Buy}
      />
    </ThemeContext.Provider>,
  );
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Success,
  );

  // Re-render with a fresh (but logically identical) finished state object —
  // must NOT re-fire the once-guard.
  await rerender(
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <ExecutionCeremony
        state={{ status: "finished", executionStatus: ExecutionStatus.Done }}
        direction={Direction.Buy}
      />
    </ThemeContext.Provider>,
  );
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
});

test("haptic fires Error for a rejected finish", async () => {
  Haptics.notificationAsync.mockClear();
  const { rerender } = await renderWithTheme(
    <ExecutionCeremony
      state={{ status: "started" }}
      direction={Direction.Sell}
    />,
  );

  await rerender(
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <ExecutionCeremony
        state={{
          status: "finished",
          executionStatus: ExecutionStatus.Rejected,
        }}
        direction={Direction.Sell}
      />
    </ThemeContext.Provider>,
  );
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Error,
  );
});

jest.mock("expo-haptics", () => {
  return {
    notificationAsync: jest.fn(),
    NotificationFeedbackType: { Success: "s", Error: "e" },
  };
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});

interface MockedHaptics {
  notificationAsync: jest.Mock;
  NotificationFeedbackType: { Success: string; Error: string };
}
