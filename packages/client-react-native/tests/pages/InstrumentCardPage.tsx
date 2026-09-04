// packages/client-react-native/tests/pages/InstrumentCardPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { TextStyle } from "react-native";
import { StyleSheet } from "react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { InstrumentCard } from "#/ui/equities/trade/InstrumentCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import type { RnTheme } from "#/ui/theme/tokens";

function vm(): ViewModel {
  return {
    useWatchlist: () => {
      return [{ symbol: "NVDA", name: "NVIDIA Corp", exchange: "NASDAQ" }];
    },
    useEquityQuote: () => {
      return {
        symbol: "NVDA",
        bid: 0,
        ask: 0,
        last: 131.14,
        changePct: -0.94,
        timestamp: 0,
      };
    },
  } as unknown as ViewModel;
}

export interface InstrumentCardPage {
  mount(symbol: string, theme?: RnTheme): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  hasTextMatching(pattern: RegExp): boolean;
  styleOfText(text: string): TextStyle;
}

/** The framework surface for `InstrumentCard.test.tsx`. Relies on the spec's
 * own `jest.mock` of `useShellMotionEnabled`, hoisted above every import in
 * the spec file. */
export function instrumentCardPage(): InstrumentCardPage {
  return {
    async mount(symbol: string, theme?: RnTheme): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={vm()}>
          <InstrumentCard symbol={symbol} candles={[]} />
        </ViewModelProvider>,
        theme,
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
    hasTextMatching(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    styleOfText(text: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByText(text).props.style as TextStyle,
      );
    },
  };
}
