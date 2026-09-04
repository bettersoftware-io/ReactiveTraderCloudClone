// packages/client-react-native/tests/pages/TradeViewPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import type { OrderTicketState } from "@rtc/client-core";
import type {
  Candle,
  EquityInstrument,
  EquityPosition,
  EquityQuote,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { TradeView } from "#/ui/equities/trade/TradeView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const editing: OrderTicketState = {
  phase: "editing",
  form: { symbol: "AAPL", side: "buy", type: "market", qty: 0 },
  error: null,
};

function fullVM(): ViewModel {
  return {
    useWatchlist: (): readonly EquityInstrument[] => {
      return [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ" }];
    },
    useEquityQuote: (): EquityQuote => {
      return {
        symbol: "AAPL",
        bid: 0,
        ask: 0,
        last: 189.5,
        changePct: 0.42,
        timestamp: 0,
      };
    },
    useCandles: (): readonly Candle[] => {
      return [];
    },
    useEquityPositions: (): readonly EquityPosition[] => {
      return [
        {
          symbol: "AAPL",
          qty: 200,
          avgPrice: 185.4,
          markPrice: 191.9,
          unrealisedPnl: 1300,
        },
      ];
    },
    useOrderTicket: () => {
      return {
        state: editing,
        setSide: () => {},
        setType: () => {},
        setQty: () => {},
        setLimitPrice: () => {},
        submit: () => {},
        reset: () => {},
      };
    },
  } as unknown as ViewModel;
}

export interface TradeViewPage {
  mount(selectedSymbol: string | null): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
}

/** The framework surface for `TradeView.test.tsx`. Relies on the spec's own
 * `jest.mock` of `useShellMotionEnabled`, hoisted above every import in the
 * spec file. */
export function tradeViewPage(): TradeViewPage {
  return {
    async mount(selectedSymbol: string | null): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fullVM()}>
          <TradeView
            selectedSymbol={selectedSymbol}
            onSelect={(): void => {}}
          />
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
