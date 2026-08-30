import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { MarketsView } from "#/ui/equities/markets/MarketsView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
];

test("composes the RANK BY chips over the movers board", async () => {
  const vm = {
    useWatchlist: () => {
      return INSTS;
    },
    useEquityQuote: () => {
      return null;
    },
    useCandles: () => {
      return [];
    },
    useEqWatchlistSort: () => {
      return {
        sort: "chg",
        setSort: jest.fn(),
        cycle: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
  await renderWithTheme(
    <ViewModelProvider viewModel={vm}>
      <MarketsView selectedSymbol={null} onSelect={(): void => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("markets-view")).toBeTruthy();
  expect(screen.getByTestId("eq-rank-row")).toBeTruthy();
  expect(screen.getByTestId("eq-mover-AAPL")).toBeTruthy();
  // The design goes sub-nav -> RANK BY -> board: no `MOVERS`/`SECTORS`
  // headings, and no sector heatmap (deleted with this view's own block).
  expect(screen.queryByText("MOVERS")).toBeNull();
  expect(screen.queryByText("SECTORS")).toBeNull();
  expect(screen.queryByTestId("heatmap-cell-AAPL")).toBeNull();
});

// `vm` doesn't stub `usePowerSaver`; MoversBoard's rows read it via
// `useShellMotionEnabled` (see MoversBoard.test.tsx for the same fix).
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
