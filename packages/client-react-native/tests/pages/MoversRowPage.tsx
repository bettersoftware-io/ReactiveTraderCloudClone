// packages/client-react-native/tests/pages/MoversRowPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { Candle } from "@rtc/domain";

import { MoversRow } from "#/ui/equities/markets/MoversRow";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import type { RnTheme } from "#/ui/theme/tokens";

const NO_CANDLES: readonly Candle[] = [];

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
          candles={NO_CANDLES}
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
