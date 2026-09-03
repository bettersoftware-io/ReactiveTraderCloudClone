// packages/client-react-native/tests/pages/InstrumentTabsPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { InstrumentTabs } from "#/ui/equities/trade/InstrumentTabs";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface InstrumentTabsPage {
  mount(
    selectedSymbol: string | null,
    onSelect: (symbol: string) => void,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  press(testId: string): Promise<void>;
}

/** The framework surface for `InstrumentTabs.test.tsx`. */
export function instrumentTabsPage(): InstrumentTabsPage {
  return {
    async mount(
      selectedSymbol: string | null,
      onSelect: (symbol: string) => void,
    ): Promise<void> {
      const instruments: readonly EquityInstrument[] = [
        { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
        { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ" },
      ];

      const vm = {
        useWatchlist: () => {
          return instruments;
        },
      } as unknown as ViewModel;
      await renderWithTheme(
        <ViewModelProvider viewModel={vm}>
          <InstrumentTabs selectedSymbol={selectedSymbol} onSelect={onSelect} />
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
