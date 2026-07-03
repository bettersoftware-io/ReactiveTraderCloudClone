import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityInstrument, EquityQuote } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { SectorHeatmap } from "#/ui/equities/markets/SectorHeatmap";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
  { symbol: "JPM", name: "JPMorgan", exchange: "NYSE" },
];

test("renders a cell per instrument grouped by sector", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeVM(INSTS)}>
      <SectorHeatmap selectedSymbol={null} onSelect={(): void => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("heatmap-cell-AAPL")).toBeTruthy();
  expect(screen.getByTestId("heatmap-cell-JPM")).toBeTruthy();
  expect(screen.getByText("TECHNOLOGY")).toBeTruthy();
  expect(screen.getByText("FINANCE")).toBeTruthy();
});

function fakeVM(instruments: readonly EquityInstrument[]): ViewModel {
  return {
    useWatchlist: () => {
      return instruments;
    },
    useEquityQuote: (symbol: string): EquityQuote => {
      return {
        symbol,
        bid: 1,
        ask: 1,
        last: 1,
        changePct: 2,
        timestamp: 0,
      };
    },
  } as unknown as ViewModel;
}
