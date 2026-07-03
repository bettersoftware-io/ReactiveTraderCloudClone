import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { MarketsView } from "#/ui/equities/markets/MarketsView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTS: readonly EquityInstrument[] = [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ" }];

test("composes the watchlist and sector heatmap", async () => {
  const vm = {
    useWatchlist: () => INSTS,
    useEquityQuote: () => null,
  } as unknown as ViewModel;
  await renderWithTheme(
    <ViewModelProvider viewModel={vm}>
      <MarketsView selectedSymbol={null} onSelect={() => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("markets-view")).toBeTruthy();
  expect(screen.getByTestId("watchlist-row-AAPL")).toBeTruthy();
  expect(screen.getByTestId("heatmap-cell-AAPL")).toBeTruthy();
});
