// packages/client-react-native/tests/pages/EquitiesScreenPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import { useState } from "react";

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

function vm(initialSymbol: string, selected: string[]): ViewModel {
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
    useEquityPriceHistory: () => {
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
    // Stateful, like the real singleton: the screen must re-render on the
    // workspace's own selection, not on anything it keeps itself.
    useEqWorkspace: () => {
      const [sel, setSel] = useState(initialSymbol);
      return {
        state: { sel },
        select: (symbol: string): void => {
          selected.push(symbol);
          setSel(symbol);
        },
      };
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
  /** `initialSymbol` is the workspace's selection at mount; `""` is its
   * "nothing selected yet". */
  mount(initialSymbol?: string): Promise<void>;
  /** Every symbol the screen asked the workspace to select, in order. */
  selectedSymbols(): readonly string[];
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  press(testId: string): Promise<void>;
}

/** The framework surface for `EquitiesScreen.test.tsx`. Relies on the spec's
 * own `jest.mock` of `useShellMotionEnabled`, hoisted above every import in
 * the spec file. */
export function equitiesScreenPage(): EquitiesScreenPage {
  let selected: string[] = [];

  return {
    async mount(initialSymbol = ""): Promise<void> {
      selected = [];
      await renderWithTheme(
        <ViewModelProvider viewModel={vm(initialSymbol, selected)}>
          <EquitiesScreen />
        </ViewModelProvider>,
      );
    },
    selectedSymbols(): readonly string[] {
      return selected;
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
