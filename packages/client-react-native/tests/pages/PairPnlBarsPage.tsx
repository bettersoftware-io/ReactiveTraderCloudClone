// packages/client-react-native/tests/pages/PairPnlBarsPage.tsx
import { screen } from "@testing-library/react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { PairPnlBars } from "#/ui/analytics/PairPnlBars";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface PairPnlBarsPage {
  mount(positions: readonly CurrencyPairPosition[]): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  labelColorOf(testId: string): unknown;
}

/** The framework surface for `PairPnlBars.test.tsx`. */
export function pairPnlBarsPage(): PairPnlBarsPage {
  return {
    async mount(positions: readonly CurrencyPairPosition[]): Promise<void> {
      await renderWithTheme(<PairPnlBars positions={positions} />);
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    labelColorOf(testId: string): unknown {
      return screen.getByTestId(testId).props.style.color;
    },
  };
}
