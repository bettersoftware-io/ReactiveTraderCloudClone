import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityInstrument, EquityQuote } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { Watchlist } from "#/ui/equities/markets/Watchlist";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
  { symbol: "JPM", name: "JPMorgan", exchange: "NYSE" },
];
const QUOTES: Record<string, EquityQuote> = {
  AAPL: { symbol: "AAPL", bid: 181.9, ask: 182.1, last: 182.0, changePct: 1.2, timestamp: 0 },
  JPM: { symbol: "JPM", bid: 199.5, ask: 199.7, last: 199.6, changePct: -0.4, timestamp: 0 },
};

function fakeVM(instruments: readonly EquityInstrument[]): ViewModel {
  return {
    useWatchlist: () => instruments,
    useEquityQuote: (symbol: string) => QUOTES[symbol] ?? null,
  } as unknown as ViewModel;
}

async function renderWatchlist(instruments: readonly EquityInstrument[] = INSTS): Promise<void> {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeVM(instruments)}>
      <Watchlist selectedSymbol="AAPL" onSelect={() => {}} />
    </ViewModelProvider>,
  );
}

test("renders a row per instrument with last price and change", async () => {
  await renderWatchlist();
  expect(screen.getByTestId("watchlist-row-AAPL")).toBeTruthy();
  expect(screen.getByTestId("watchlist-row-JPM")).toBeTruthy();
  expect(screen.getByText("182.00")).toBeTruthy();
  expect(screen.getByText("+1.20%")).toBeTruthy();
  expect(screen.getByText("-0.40%")).toBeTruthy();
});

test("shows an empty state when there are no instruments", async () => {
  await renderWatchlist([]);
  expect(screen.getByTestId("watchlist-empty")).toBeTruthy();
});
