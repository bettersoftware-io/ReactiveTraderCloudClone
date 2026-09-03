// packages/client-react-native/tests/pages/MarketsViewPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import type { EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { MarketsView } from "#/ui/equities/markets/MarketsView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
];

function vm(): ViewModel {
  return {
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
        setSort: () => {},
        cycle: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}

export interface MarketsViewPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
}

/** The framework surface for `MarketsView.test.tsx`. Relies on the spec's
 * own `jest.mock` of `useShellMotionEnabled`, hoisted above every import in
 * the spec file. */
export function marketsViewPage(): MarketsViewPage {
  return {
    async mount(): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={vm()}>
          <MarketsView selectedSymbol={null} onSelect={(): void => {}} />
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
  };
}
