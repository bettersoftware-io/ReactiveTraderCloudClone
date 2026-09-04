import { afterEach, expect, jest, test } from "@jest/globals";

import type { Trade } from "@rtc/domain";
import { Direction, ExecutionStatus, TradeStatus } from "@rtc/domain";

import { executionCeremonyPage } from "#tests/pages/ExecutionCeremonyPage";

const Haptics = require("expo-haptics") as MockedHaptics;

const page = executionCeremonyPage();

afterEach(() => {
  return page.unmountAll();
});

test("ready renders nothing", async () => {
  await page.mount({ status: "ready" }, null);
  expect(page.isEmpty()).toBe(true);
});

test("started shows the busy overlay", async () => {
  await page.mount({ status: "started" }, Direction.Buy);
  expect(page.hasTextMatching(/EXECUTING/)).toBeTruthy();
});

test("finished+Done shows FILLED", async () => {
  await page.mount(
    { status: "finished", executionStatus: ExecutionStatus.Done },
    Direction.Buy,
  );
  expect(page.hasText("FILLED")).toBeTruthy();
});

test("finished+Done with a trade shows the {DIR} {notional} @ {rate} detail", async () => {
  const trade: Trade = {
    tradeId: 1,
    tradeName: "You",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.0872,
    status: TradeStatus.Done,
    tradeDate: "",
    valueDate: "",
  };
  await page.mount(
    { status: "finished", executionStatus: ExecutionStatus.Done, trade },
    Direction.Buy,
  );
  expect(page.hasText("BUY 1,000,000 @ 1.0872")).toBeTruthy();
});

test("finished+Rejected shows REJECTED", async () => {
  await page.mount(
    { status: "finished", executionStatus: ExecutionStatus.Rejected },
    Direction.Sell,
  );
  expect(page.hasText("REJECTED")).toBeTruthy();
});

test("timeout shows TIMED OUT", async () => {
  await page.mount({ status: "timeout" }, Direction.Buy);
  expect(page.hasText("TIMED OUT")).toBeTruthy();
});

test("haptic fires once entering a terminal state, not on a re-render staying finished", async () => {
  Haptics.notificationAsync.mockClear();
  await page.mount({ status: "ready" }, null);

  await page.rerender(
    { status: "finished", executionStatus: ExecutionStatus.Done },
    Direction.Buy,
  );
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Success,
  );

  // Re-render with a fresh (but logically identical) finished state object —
  // must NOT re-fire the once-guard.
  await page.rerender(
    { status: "finished", executionStatus: ExecutionStatus.Done },
    Direction.Buy,
  );
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
});

test("haptic fires Error for a rejected finish", async () => {
  Haptics.notificationAsync.mockClear();
  await page.mount({ status: "started" }, Direction.Sell);

  await page.rerender(
    { status: "finished", executionStatus: ExecutionStatus.Rejected },
    Direction.Sell,
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
