import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { CandleChart } from "#/ui/equities/trade/CandleChart";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the canvas once candles exist", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm(3)}>
      <CandleChart symbol="NVDA" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-candle-chart")).toBeTruthy();
});

test("shows an empty state instead of a blank canvas with no candles", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm(0)}>
      <CandleChart symbol="NVDA" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-candle-empty")).toBeTruthy();
});

function vm(n: number): ViewModel {
  return {
    useCandles: () => {
      return Array.from({ length: n }, (_, i) => {
        return { time: i, open: 10, high: 12, low: 9, close: 11 };
      });
    },
  } as unknown as ViewModel;
}
