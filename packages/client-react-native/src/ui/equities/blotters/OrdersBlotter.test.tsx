import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityOrder } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { OrdersBlotter } from "#/ui/equities/blotters/OrdersBlotter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

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

test("flags exactly one newest row, never two", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <OrdersBlotter />
    </ViewModelProvider>,
  );
  expect(screen.queryAllByTestId(/-newest$/)).toHaveLength(0);
});

const ORDERS = [
  {
    id: "o1",
    symbol: "NVDA",
    side: "buy",
    qty: 500,
    price: 131.14,
    status: "working",
  },
  {
    id: "o2",
    symbol: "AAPL",
    side: "sell",
    qty: 100,
    price: 227.17,
    status: "filled",
  },
] as never;

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
