// packages/client-react-native/tests/pages/EquitiesScreenPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { OrderTicketState } from "@rtc/client-core";
import type { Candle, DepthBook, EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { EquitiesScreen } from "#/ui/equities/EquitiesScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const editing: OrderTicketState = {
  phase: "editing",
  form: { symbol: "AAPL", side: "buy", type: "market", qty: 0 },
  error: null,
};

function vm(): ViewModel {
  return {
    useWatchlist: (): readonly EquityInstrument[] => {
      return [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ" }];
    },
    useEquityQuote: () => {
      return null;
    },
    useCandles: (): readonly Candle[] => {
      return [];
    },
    useDepth: (): DepthBook | null => {
      return null;
    },
    useEquityOrders: () => {
      return [];
    },
    useEquityPositions: () => {
      return [];
    },
    useEqWatchlistSort: () => {
      return { sort: "chg", setSort: () => {}, cycle: () => {} };
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

export interface EquitiesScreenPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  press(testId: string): Promise<void>;
}

/** The framework surface for `EquitiesScreen.test.tsx`. Relies on the spec's
 * own `jest.mock` of `useShellMotionEnabled`, hoisted above every import in
 * the spec file. */
export function equitiesScreenPage(): EquitiesScreenPage {
  return {
    async mount(): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={vm()}>
          <EquitiesScreen />
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
  };
}
