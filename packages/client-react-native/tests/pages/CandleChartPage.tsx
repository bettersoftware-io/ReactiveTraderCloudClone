// packages/client-react-native/tests/pages/CandleChartPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import type { Candle } from "@rtc/domain";

import { CandleChart } from "#/ui/equities/trade/CandleChart";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import type { RnTheme } from "#/ui/theme/tokens";

export interface CandleChartPage {
  mount(candles: readonly Candle[], theme?: RnTheme): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `CandleChart.test.tsx`. Relies on the spec's
 * own `jest.mock` of `useShellMotionEnabled`, hoisted above every import in
 * the spec file. */
export function candleChartPage(): CandleChartPage {
  return {
    async mount(candles: readonly Candle[], theme?: RnTheme): Promise<void> {
      await renderWithTheme(<CandleChart candles={candles} />, theme);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
