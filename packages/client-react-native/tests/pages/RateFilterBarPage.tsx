// packages/client-react-native/tests/pages/RateFilterBarPage.tsx
import { fireEvent, screen } from "@testing-library/react-native";

import { RateFilterBar } from "#/ui/rates/RateFilterBar";
import type { RateFilter } from "#/ui/rates/ratesFilter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface RateFilterBarPage {
  mount(selected: RateFilter, onSelect: (f: RateFilter) => void): Promise<void>;
  hasText(text: string): boolean;
  pressText(text: string): Promise<void>;
}

/** The framework surface for `RateFilterBar.test.tsx`. */
export function rateFilterBarPage(): RateFilterBarPage {
  return {
    async mount(
      selected: RateFilter,
      onSelect: (f: RateFilter) => void,
    ): Promise<void> {
      await renderWithTheme(
        <RateFilterBar selected={selected} onSelect={onSelect} />,
      );
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    async pressText(text: string): Promise<void> {
      await fireEvent.press(screen.getByText(text));
    },
  };
}
