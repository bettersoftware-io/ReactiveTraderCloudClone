import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityOrder } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { OrdersBlotter } from "#/ui/equities/blotters/OrdersBlotter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

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
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(orders)}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("orders-panel")).toBeTruthy();
  expect(screen.getByTestId("order-row-o1")).toBeTruthy();
  expect(screen.getByText("182.40")).toBeTruthy();
  expect(screen.getByText("100")).toBeTruthy();
  expect(screen.getByTestId("eq-order-side-o1")).toHaveTextContent("BUY MKT");
});

test("prints the limit price for a resting order, a dash for a bare market order", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(TWO_WORKING_ORDERS)}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByText("—")).toBeTruthy();
  expect(screen.getByText("227.17")).toBeTruthy();
  expect(screen.getByTestId("eq-order-side-o2")).toHaveTextContent("SELL LMT");
});

test("pill labels never wrap: PARTIAL, CANCELLED, REJECTED", async () => {
  const orders: readonly EquityOrder[] = [
    order("p", "TSLA", "partiallyFilled"),
    order("c", "AMZN", "cancelled"),
    order("r", "JPM", "rejected"),
    order("n", "MSFT", "new"),
  ];
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(orders)}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-order-status-p")).toHaveTextContent("PARTIAL");
  expect(screen.getByTestId("eq-order-status-c")).toHaveTextContent(
    "CANCELLED",
  );
  expect(screen.getByTestId("eq-order-status-r")).toHaveTextContent("REJECTED");
  expect(screen.getByTestId("eq-order-status-n")).toHaveTextContent("NEW");
});

test("pill colour: filled positive, open aware, terminal negative — border at 45%", async () => {
  const t = rnThemeTokens.holo.dark;
  const orders: readonly EquityOrder[] = [
    order("f", "AAPL", "filled"),
    order("w", "NVDA", "working"),
    order("p", "TSLA", "partiallyFilled"),
    order("x", "JPM", "rejected"),
  ];
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(orders)}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-order-status-f")).toHaveStyle({
    color: t.accentPositive,
    borderColor: `${t.accentPositive}73`,
  });
  expect(screen.getByTestId("eq-order-status-w")).toHaveStyle({
    color: t.accentAware,
  });
  expect(screen.getByTestId("eq-order-status-p")).toHaveStyle({
    color: t.accentAware,
  });
  expect(screen.getByTestId("eq-order-status-x")).toHaveStyle({
    color: t.accentNegative,
  });
  expect(screen.getByTestId("eq-order-side-f")).toHaveStyle({
    color: t.accentPositive,
  });
});

test("shows an empty state with no orders", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith([])}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("orders-empty")).toBeTruthy();
});

test("renders a status pill per order, coloured by status", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-order-status-o1")).toHaveTextContent("WORKING");
  expect(screen.getByTestId("eq-order-status-o2")).toHaveTextContent("FILLED");
});

test("two orders sharing a status each still carry their own pill", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(TWO_WORKING_ORDERS)}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-order-status-o1")).toHaveTextContent("WORKING");
  expect(screen.getByTestId("eq-order-status-o2")).toHaveTextContent("WORKING");
});

// Split from a single test that only proved the mount guard ("nothing counts
// as newest on first mount" — `useNewestOrderId`'s own doc) while its title
// claimed "never two", which was never exercised. `order-row-${id}` is a
// STABLE testID (Important 3): it does not mutate to `-newest`, so "newest"
// is read back via `accessibilityState.selected` instead.
test("flags no row as newest on first mount", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(selected("o1")).toBe(false);
  expect(selected("o2")).toBe(false);
});

test("flags exactly one row — the newly appended order — as newest", async () => {
  const { rerender } = await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(ORDERS)}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(selected("o1")).toBe(false);
  expect(selected("o2")).toBe(false);

  const appended: readonly EquityOrder[] = [...ORDERS, order("o3", "TSLA")];

  // `rerender` (unlike `render`/`renderWithTheme`) swaps the tree at the SAME
  // root verbatim — it does NOT re-apply `renderWithTheme`'s own
  // `ThemeContext.Provider` wrapping (see MoversBoard.test.tsx for the same
  // note), so it's reapplied explicitly here.
  await rerender(
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <ViewModelProvider viewModel={vmWith(appended)}>
        <OrdersBlotter />
      </ViewModelProvider>
    </ThemeContext.Provider>,
  );

  expect(selected("o1")).toBe(false);
  expect(selected("o2")).toBe(false);
  expect(selected("o3")).toBe(true);
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

function selected(orderId: string): boolean {
  const state = screen.getByTestId(`order-row-${orderId}`).props
    .accessibilityState as { selected?: boolean } | undefined;
  return state?.selected === true;
}

function vmWith(orders: readonly EquityOrder[]): ViewModel {
  return {
    useEquityOrders: () => {
      return orders;
    },
  } as unknown as ViewModel;
}

function vm(): ViewModel {
  return {
    useEquityOrders: () => {
      return ORDERS;
    },
    useEqBlotterView: () => {
      return {
        view: "orders",
        setView: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}

// `vm()`/`vmWith()` only stub `useEquityOrders`/`useEqBlotterView`; the row
// insert flash's `useShellMotionEnabled` reads `usePowerSaver` off the same
// ViewModel context, so it's mocked directly here rather than widening every
// vm — mirrors InstrumentHeader.test.tsx/SpotTile.test.tsx, the other
// useRowInsertFlash-adjacent consumers.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
