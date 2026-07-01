import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { Blotter } from "#/ui/Blotter";

const TRADE: Trade = {
  tradeId: 7,
  tradeName: "Trade 7",
  currencyPair: "USDJPY",
  notional: 2_000_000,
  dealtCurrency: "USD",
  direction: Direction.Sell,
  spotRate: 110.25,
  status: TradeStatus.Done,
  tradeDate: "2026-07-01",
  valueDate: "2026-07-03",
};

function fakeViewModel(trades: readonly Trade[]): ViewModel {
  return { useTrades: () => trades } as unknown as ViewModel;
}

test("renders a row per trade", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel([TRADE])}>
      <Blotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("trade-row-7")).toBeTruthy();
  expect(screen.getByText("USDJPY")).toBeTruthy();
});

test("shows an empty state when there are no trades", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel([])}>
      <Blotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("blotter-empty")).toBeTruthy();
});
