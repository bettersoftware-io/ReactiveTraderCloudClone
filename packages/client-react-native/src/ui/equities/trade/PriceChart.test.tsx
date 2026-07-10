import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { Candle } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { PriceChart } from "#/ui/equities/trade/PriceChart";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

const CANDLES: readonly Candle[] = [
  { time: 1, open: 2, high: 10, low: 0, close: 8 },
  { time: 2, open: 8, high: 9, low: 3, close: 4 },
];

test("renders the chart svg when candles are present", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(CANDLES)}>
      <PriceChart symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("price-chart")).toBeTruthy();
});

test("shows an empty state when there are no candles", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith([])}>
      <PriceChart symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("price-chart-empty")).toBeTruthy();
});

test("renders no gradient tile surface even on a 3d skin (dense panel, not a hero tile)", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(CANDLES)}>
      <PriceChart symbol="AAPL" />
    </ViewModelProvider>,
    rnThemeTokens.holo3d.dark,
  );
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});

function vmWith(candles: readonly Candle[]): ViewModel {
  return {
    useCandles: () => {
      return candles;
    },
  } as unknown as ViewModel;
}
