// packages/client-react-native/tests/pages/QuantityChipsPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import { QuantityChips } from "#/ui/credit/newRfq/QuantityChips";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface QuantityChipsPage {
  mount(
    selected: number | null,
    onSelect: (quantity: number) => void,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  matchingCount(pattern: RegExp): number;
  hasText(text: string): boolean;
  // RNTL v13 dropped `toHaveAccessibilityState`, so this reads the prop
  // directly.
  selected(testId: string): boolean | undefined;
  press(testId: string): Promise<void>;
}

/** The framework surface for `QuantityChips.test.tsx`. */
export function quantityChipsPage(): QuantityChipsPage {
  return {
    async mount(
      selected: number | null,
      onSelect: (quantity: number) => void,
    ): Promise<void> {
      await renderWithTheme(
        <QuantityChips selected={selected} onSelect={onSelect} />,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    matchingCount(pattern: RegExp): number {
      return screen.queryAllByTestId(pattern).length;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    selected(testId: string): boolean | undefined {
      const state = screen.getByTestId(testId).props.accessibilityState as
        | { selected?: boolean }
        | undefined;
      return state?.selected;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
  };
}
