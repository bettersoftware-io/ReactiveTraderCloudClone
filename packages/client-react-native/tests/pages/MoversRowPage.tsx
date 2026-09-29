// packages/client-react-native/tests/pages/MoversRowPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { EquityQuote } from "@rtc/domain";

import { MoversRow } from "#/ui/equities/markets/MoversRow";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import type { RnTheme } from "#/ui/theme/tokens";

// RowSparkline takes `history` as a plain prop (the price-history read lives
// in MoversBoard's MoversBoardRow, so this leaf and RowSparkline stay
// compiler-memoizable) — an empty window is enough: these
// tests assert the row's own text/press behaviour, not the sparkline (that's
// RowSparkline.test.tsx's job).
const NO_HISTORY: readonly EquityQuote[] = [];

interface MoversRowFixture {
  symbol: string;
  name: string;
  last: number | null;
  changePct: number | null;
}

export interface MoversRowPage {
  mount(
    row: MoversRowFixture,
    rank: number,
    onSelect: (symbol: string) => void,
    theme?: RnTheme,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  hasText(text: string): boolean;
  exists(testId: string): boolean;
  press(testId: string): Promise<void>;
}

/** The framework surface for `MoversRow.test.tsx`. */
export function moversRowPage(): MoversRowPage {
  return {
    async mount(
      row: MoversRowFixture,
      rank: number,
      onSelect: (symbol: string) => void,
      theme?: RnTheme,
    ): Promise<void> {
      await renderWithTheme(
        <MoversRow
          row={row}
          rank={rank}
          selected={false}
          onSelect={onSelect}
          history={NO_HISTORY}
        />,
        theme,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
  };
}
