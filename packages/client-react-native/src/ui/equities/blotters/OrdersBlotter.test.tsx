import { afterEach, expect, jest, test } from "@jest/globals";

import type { EquityOrder } from "@rtc/domain";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { ordersBlotterPage } from "#tests/pages/OrdersBlotterPage";

const page = ordersBlotterPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders a row per order", async () => {
  const orders: readonly EquityOrder[] = [
    {
      id: "o1",
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 100,
      status: "filled",
      filledQty: 100,
      avgPrice: 182.4,
      createdAt: 0,
    },
  ];
  await page.mount(orders);
  expect(page.exists("orders-panel")).toBe(true);
  expect(page.exists("order-row-o1")).toBe(true);
  expect(page.hasText("182.40")).toBe(true);
  expect(page.hasText("100")).toBe(true);
  expect(page.hasTextContent("eq-order-side-o1", "BUY MKT")).toBe(true);
});

test("prints the limit price for a resting order, a dash for a bare market order", async () => {
  await page.mount(TWO_WORKING_ORDERS);
  expect(page.hasText("—")).toBe(true);
  expect(page.hasText("227.17")).toBe(true);
  expect(page.hasTextContent("eq-order-side-o2", "SELL LMT")).toBe(true);
});

test("pill labels never wrap: PARTIAL, CANCELLED, REJECTED", async () => {
  const orders: readonly EquityOrder[] = [
    order("p", "TSLA", "partiallyFilled"),
    order("c", "AMZN", "cancelled"),
    order("r", "JPM", "rejected"),
    order("n", "MSFT", "new"),
  ];
  await page.mount(orders);
  expect(page.hasTextContent("eq-order-status-p", "PARTIAL")).toBe(true);
  expect(page.hasTextContent("eq-order-status-c", "CANCELLED")).toBe(true);
  expect(page.hasTextContent("eq-order-status-r", "REJECTED")).toBe(true);
  expect(page.hasTextContent("eq-order-status-n", "NEW")).toBe(true);
});

test("pill colour: filled positive, open aware, terminal negative — border at 45%", async () => {
  const t = rnThemeTokens.holo.dark;
  const orders: readonly EquityOrder[] = [
    order("f", "AAPL", "filled"),
    order("w", "NVDA", "working"),
    order("p", "TSLA", "partiallyFilled"),
    order("x", "JPM", "rejected"),
  ];
  await page.mount(orders);
  expect(page.styleOf("eq-order-status-f")).toMatchObject({
    color: t.accentPositive,
    borderColor: `${t.accentPositive}73`,
  });
  expect(page.styleOf("eq-order-status-w")).toMatchObject({
    color: t.accentAware,
  });
  expect(page.styleOf("eq-order-status-p")).toMatchObject({
    color: t.accentAware,
  });
  expect(page.styleOf("eq-order-status-x")).toMatchObject({
    color: t.accentNegative,
  });
  expect(page.styleOf("eq-order-side-f")).toMatchObject({
    color: t.accentPositive,
  });
});

test("shows an empty state with no orders", async () => {
  await page.mount([]);
  expect(page.exists("orders-empty")).toBe(true);
});

test("renders a status pill per order, coloured by status", async () => {
  await page.mount(ORDERS);
  expect(page.hasTextContent("eq-order-status-o1", "WORKING")).toBe(true);
  expect(page.hasTextContent("eq-order-status-o2", "FILLED")).toBe(true);
});

test("two orders sharing a status each still carry their own pill", async () => {
  await page.mount(TWO_WORKING_ORDERS);
  expect(page.hasTextContent("eq-order-status-o1", "WORKING")).toBe(true);
  expect(page.hasTextContent("eq-order-status-o2", "WORKING")).toBe(true);
});

// Split from a single test that only proved the mount guard ("nothing counts
// as newest on first mount" — `useNewestOrderId`'s own doc) while its title
// claimed "never two", which was never exercised. `order-row-${id}` is a
// STABLE testID (Important 3): it does not mutate to `-newest`, so "newest"
// is read back via `accessibilityState.selected` instead.
test("flags no row as newest on first mount", async () => {
  await page.mount(ORDERS);
  expect(page.selected("o1")).toBe(false);
  expect(page.selected("o2")).toBe(false);
});

test("flags exactly one row — the newly appended order — as newest", async () => {
  await page.mount(ORDERS);
  expect(page.selected("o1")).toBe(false);
  expect(page.selected("o2")).toBe(false);

  const appended: readonly EquityOrder[] = [...ORDERS, order("o3", "TSLA")];
  await page.rerenderWith(appended);

  expect(page.selected("o1")).toBe(false);
  expect(page.selected("o2")).toBe(false);
  expect(page.selected("o3")).toBe(true);
});

const ORDERS: readonly EquityOrder[] = [
  order("o1", "NVDA", "working"),
  order("o2", "AAPL", "filled"),
];

// The regression fixture for the id-scoped testID fix: two DIFFERENT orders
// sharing the SAME status ("working" is the commonest live blotter state).
// Under the old status-only testID (`eq-order-status-working`) this scenario
// couldn't be expressed at all — both pills would collide on one testID.
const TWO_WORKING_ORDERS: readonly EquityOrder[] = [
  {
    id: "o1",
    symbol: "NVDA",
    side: "buy",
    type: "market",
    qty: 500,
    status: "working",
    filledQty: 0,
    createdAt: 0,
  },
  {
    id: "o2",
    symbol: "AAPL",
    side: "sell",
    type: "limit",
    qty: 100,
    status: "working",
    filledQty: 0,
    limitPrice: 227.17,
    createdAt: 0,
  },
];

function order(
  id: string,
  symbol: string,
  status: EquityOrder["status"] = "working",
): EquityOrder {
  return {
    id,
    symbol,
    side: "buy",
    type: "market",
    qty: 500,
    status,
    filledQty: status === "filled" ? 500 : 0,
    avgPrice: status === "filled" ? 131.14 : undefined,
    createdAt: 0,
  };
}

// `page.mount()` only stubs `useEquityOrders`; the row insert flash's
// `useShellMotionEnabled` reads `usePowerSaver` off the same ViewModel
// context, so it's mocked directly here rather than widening the fake
// ViewModel — mirrors InstrumentCard.test.tsx/SpotTile.test.tsx, the other
// useRowInsertFlash-adjacent consumers.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
