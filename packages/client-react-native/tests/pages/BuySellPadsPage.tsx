// packages/client-react-native/tests/pages/BuySellPadsPage.tsx
import { fireEvent, screen } from "@testing-library/react-native";

import type { CurrencyPair, Direction, Price } from "@rtc/domain";

import { BuySellPads } from "#/ui/rates/ticket/BuySellPads";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface BuySellPadsPage {
  mount(
    pair: CurrencyPair,
    price: Price,
    onExecute: (direction: Direction) => void,
  ): Promise<void>;
  hasText(text: string): boolean;
  press(testId: string): Promise<void>;
}

/** The framework surface for `BuySellPads.test.tsx`. */
export function buySellPadsPage(): BuySellPadsPage {
  return {
    async mount(
      pair: CurrencyPair,
      price: Price,
      onExecute: (direction: Direction) => void,
    ): Promise<void> {
      await renderWithTheme(
        <BuySellPads pair={pair} price={price} onExecute={onExecute} />,
      );
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
  };
}
