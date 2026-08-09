import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";

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

test("keeps a fixed-height slot across every phase, so a sibling control below it in OrderTicket never has to move", async () => {
  // The regression this guards: OrderCeremony used to sit directly in-flow,
  // so its BusyPill (~one text line) vs Toast (~two text lines) variants
  // gave working/filled/etc. different natural heights — pushing whatever
  // OrderTicket renders below it (the ResetButton) down by ~20px on a
  // working -> filled transition, right as a user reached to tap "NEW
  // ORDER". A fixed-height slot is the fix: assert the slot's height is
  // identical across all six phases, not just the one pair from the report.
  const editing = await renderWithTheme(
    <OrderCeremony
      state={{ phase: "editing", form: {} as never, error: null }}
    />,
  );

  const submitting = await renderWithTheme(
    <OrderCeremony state={{ phase: "submitting" }} />,
  );

  const working = await renderWithTheme(
    <OrderCeremony state={{ phase: "working", order: ORDER }} />,
  );

  const partiallyFilled = await renderWithTheme(
    <OrderCeremony state={{ phase: "partiallyFilled", order: ORDER }} />,
  );

  const filled = await renderWithTheme(
    <OrderCeremony state={{ phase: "filled", order: ORDER }} />,
  );

  const rejected = await renderWithTheme(
    <OrderCeremony state={{ phase: "rejected", reason: "NO LIQUIDITY" }} />,
  );

  const heights = [
    editing,
    submitting,
    working,
    partiallyFilled,
    filled,
    rejected,
  ].map((result) => {
    return heightOf(result.getByTestId("eq-order-ceremony-slot"));
  });

  expect(heights[0]).toEqual(expect.any(Number));
  expect(new Set(heights).size).toBe(1);
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

interface StyledNode {
  props: { style?: unknown };
}

function heightOf(node: StyledNode): number | undefined {
  const flattened = StyleSheet.flatten(node.props.style as ViewStyle);
  return typeof flattened.height === "number" ? flattened.height : undefined;
}
