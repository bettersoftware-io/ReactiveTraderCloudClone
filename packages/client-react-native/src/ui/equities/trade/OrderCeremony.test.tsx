import { afterEach, expect, jest, test } from "@jest/globals";

import type { EquityOrder } from "@rtc/domain";

import { orderCeremonyPage } from "#tests/pages/OrderCeremonyPage";

const Haptics = require("expo-haptics") as MockedHaptics;

const ORDER: EquityOrder = {
  id: "o1",
  symbol: "NVDA",
  side: "buy",
  type: "market",
  qty: 500,
  status: "filled",
  filledQty: 500,
  avgPrice: 131.14,
  createdAt: 0,
};

const page = orderCeremonyPage();

afterEach(() => {
  return page.unmountAll();
});

test("shows a fill toast on the filled phase", async () => {
  const ceremony = await page.mount({ phase: "filled", order: ORDER });
  expect(ceremony.exists("eq-order-toast-filled")).toBe(true);
});

test("shows a reject toast carrying the reason", async () => {
  const ceremony = await page.mount({
    phase: "rejected",
    reason: "NO LIQUIDITY",
  });
  expect(ceremony.exists("eq-order-toast-rejected")).toBe(true);
  expect(ceremony.hasText("NO LIQUIDITY")).toBe(true);
});

test("renders nothing while editing — the toast is terminal-only", async () => {
  const ceremony = await page.mount({
    phase: "editing",
    form: {} as never,
    error: null,
  });
  expect(ceremony.existsMatching(/^eq-order-toast/)).toBe(false);
});

test("shows a busy state while submitting", async () => {
  const ceremony = await page.mount({ phase: "submitting" });
  expect(ceremony.exists("eq-order-busy")).toBe(true);
});

test("shows a working pill on the working phase", async () => {
  const ceremony = await page.mount({ phase: "working", order: ORDER });
  expect(ceremony.exists("eq-order-working")).toBe(true);
});

test("shows a working pill on the partiallyFilled phase", async () => {
  const ceremony = await page.mount({
    phase: "partiallyFilled",
    order: ORDER,
  });
  expect(ceremony.exists("eq-order-working")).toBe(true);
});

test("fires a Success haptic entering the filled phase", async () => {
  Haptics.notificationAsync.mockClear();
  await page.mount({ phase: "filled", order: ORDER });
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Success,
  );
});

test("fires an Error haptic entering the rejected phase", async () => {
  Haptics.notificationAsync.mockClear();
  await page.mount({ phase: "rejected", reason: "NO LIQUIDITY" });
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Error,
  );
});

test("keeps a fixed-height slot across submitting/working/partiallyFilled/filled/rejected, so a sibling control below it in OrderTicket never has to move", async () => {
  // The regression this guards: OrderCeremony used to sit directly in-flow,
  // so its BusyPill (~one text line) vs Toast (~two text lines) variants
  // gave working/filled/etc. different natural heights — pushing whatever
  // OrderTicket renders below it (the ResetButton) down by ~20px, right as a
  // user reached to tap "NEW ORDER". A fixed-height slot is the fix: assert
  // the slot's height is identical across all five phases that carry one,
  // not just the one pair from the report.
  //
  // `editing` is deliberately EXCLUDED from this set, not merely untested:
  // it renders no slot at all (see "reserves no height while editing"
  // below), because it has no ResetButton or other continuous sibling below
  // OrderCeremony for a reserved slot to protect — entering/leaving
  // `editing` already swaps the ticket's whole child tree for the order
  // form. Folding `editing` back into this height set would silently
  // reintroduce the ~62px blank strip a first attempt at this fix shipped
  // (52px slot + the ticket's own `gap: 10`) on the ticket's default
  // resting state.
  const submitting = await page.mount({ phase: "submitting" });
  const working = await page.mount({ phase: "working", order: ORDER });
  const partiallyFilled = await page.mount({
    phase: "partiallyFilled",
    order: ORDER,
  });
  const filled = await page.mount({ phase: "filled", order: ORDER });
  const rejected = await page.mount({
    phase: "rejected",
    reason: "NO LIQUIDITY",
  });

  const heights = [submitting, working, partiallyFilled, filled, rejected].map(
    (ceremony) => {
      return ceremony.slotHeight();
    },
  );

  expect(heights[0]).toEqual(expect.any(Number));
  expect(new Set(heights).size).toBe(1);
});

test("reserves no height while editing — no ~62px blank strip on the ticket's default resting state", async () => {
  const ceremony = await page.mount({
    phase: "editing",
    form: {} as never,
    error: null,
  });

  expect(ceremony.exists("eq-order-ceremony-slot")).toBe(false);
  expect(ceremony.isEmpty()).toBe(true);
});

test("mutes the haptic when motion is disabled, but still renders the toast", async () => {
  Haptics.notificationAsync.mockClear();
  mockMotionEnabled.mockReturnValueOnce(false);
  const ceremony = await page.mount({ phase: "filled", order: ORDER });
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  expect(ceremony.exists("eq-order-toast-filled")).toBe(true);
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
