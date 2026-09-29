// packages/client-react-native/tests/pages/RowSparklinePage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import type { EquityQuote } from "@rtc/domain";

import { RowSparkline } from "#/ui/equities/markets/RowSparkline";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface RowSparklinePage {
  mount(symbol: string, prices: readonly number[]): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `RowSparkline.test.tsx`. */
export function rowSparklinePage(): RowSparklinePage {
  return {
    async mount(symbol: string, prices: readonly number[]): Promise<void> {
      await renderWithTheme(
        <RowSparkline
          symbol={symbol}
          positive
          history={createQuotes(symbol, prices)}
        />,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}

function createQuotes(
  symbol: string,
  prices: readonly number[],
): readonly EquityQuote[] {
  return prices.map((price, i) => {
    return {
      symbol,
      bid: price,
      ask: price,
      last: price,
      changePct: 0,
      timestamp: i,
    };
  });
}
