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
  expect(screen.getByTestId("eq-order-status-working")).toBeTruthy();
  expect(screen.getByTestId("eq-order-status-filled")).toBeTruthy();
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
