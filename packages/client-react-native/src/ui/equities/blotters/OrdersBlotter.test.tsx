import { expect, test } from "@jest/globals";
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

function vmWith(orders: readonly EquityOrder[]): ViewModel {
  return {
    useEquityOrders: () => {
      return orders;
    },
  } as unknown as ViewModel;
}
