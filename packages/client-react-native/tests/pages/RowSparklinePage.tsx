// packages/client-react-native/tests/pages/RowSparklinePage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import type { Candle } from "@rtc/domain";

import { RowSparkline } from "#/ui/equities/markets/RowSparkline";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface RowSparklinePage {
  mount(symbol: string, candles: readonly Candle[]): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `RowSparkline.test.tsx`. */
export function rowSparklinePage(): RowSparklinePage {
  return {
    async mount(symbol: string, candles: readonly Candle[]): Promise<void> {
      await renderWithTheme(
        <RowSparkline symbol={symbol} positive candles={candles} />,
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
