import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { OrderCeremony } from "#/ui/equities/trade/OrderCeremony";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const Haptics = require("expo-haptics") as MockedHaptics;

const ORDER = {
  id: "o1",
  symbol: "NVDA",
  side: "buy",
  qty: 500,
  price: 131.14,
  status: "filled",
} as never;

test("shows a fill toast on the filled phase", async () => {
  await renderWithTheme(
    <OrderCeremony state={{ phase: "filled", order: ORDER }} />,
  );
  expect(screen.getByTestId("eq-order-toast-filled")).toBeTruthy();
});

test("shows a reject toast carrying the reason", async () => {
  await renderWithTheme(
    <OrderCeremony state={{ phase: "rejected", reason: "NO LIQUIDITY" }} />,
  );
  expect(screen.getByTestId("eq-order-toast-rejected")).toBeTruthy();
  expect(screen.getByText("NO LIQUIDITY")).toBeTruthy();
});

test("renders nothing while editing — the toast is terminal-only", async () => {
  await renderWithTheme(
    <OrderCeremony
      state={{ phase: "editing", form: {} as never, error: null }}
    />,
  );
  expect(screen.queryByTestId(/^eq-order-toast/)).toBeNull();
});

test("shows a busy state while submitting", async () => {
  await renderWithTheme(<OrderCeremony state={{ phase: "submitting" }} />);
  expect(screen.getByTestId("eq-order-busy")).toBeTruthy();
});

test("shows a working pill on the working phase", async () => {
  await renderWithTheme(
    <OrderCeremony state={{ phase: "working", order: ORDER }} />,
  );
  expect(screen.getByTestId("eq-order-working")).toBeTruthy();
});

test("shows a working pill on the partiallyFilled phase", async () => {
  await renderWithTheme(
    <OrderCeremony state={{ phase: "partiallyFilled", order: ORDER }} />,
  );
  expect(screen.getByTestId("eq-order-working")).toBeTruthy();
});

test("fires a Success haptic entering the filled phase", async () => {
  Haptics.notificationAsync.mockClear();
  await renderWithTheme(
    <OrderCeremony state={{ phase: "filled", order: ORDER }} />,
  );
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Success,
  );
});

test("fires an Error haptic entering the rejected phase", async () => {
  Haptics.notificationAsync.mockClear();
  await renderWithTheme(
    <OrderCeremony state={{ phase: "rejected", reason: "NO LIQUIDITY" }} />,
  );
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Error,
  );
});

test("mutes the haptic when motion is disabled, but still renders the toast", async () => {
  Haptics.notificationAsync.mockClear();
  mockMotionEnabled.mockReturnValueOnce(false);
  await renderWithTheme(
    <OrderCeremony state={{ phase: "filled", order: ORDER }} />,
  );
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  expect(screen.getByTestId("eq-order-toast-filled")).toBeTruthy();
});

const mockMotionEnabled = jest.fn<() => boolean>(() => {
  return true;
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
      return mockMotionEnabled();
    },
  };
});

interface MockedHaptics {
  notificationAsync: jest.Mock;
  NotificationFeedbackType: { Success: string; Error: string };
}
