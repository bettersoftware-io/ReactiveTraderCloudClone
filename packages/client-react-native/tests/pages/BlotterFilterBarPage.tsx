// packages/client-react-native/tests/pages/BlotterFilterBarPage.tsx
import { fireEvent, screen } from "@testing-library/react-native";

import { BlotterFilterBar } from "#/ui/blotter/BlotterFilterBar";
import type { BlotterFilter } from "#/ui/blotter/blotterFilter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

interface Summary {
  fills: number;
  buys: number;
  sells: number;
}

export interface BlotterFilterBarPage {
  mount(
    selected: BlotterFilter,
    onSelect: (f: BlotterFilter) => void,
    summary: Summary,
  ): Promise<void>;
  hasText(text: string): boolean;
  hasTextMatching(pattern: RegExp): boolean;
  pressText(text: string): Promise<void>;
}

/** The framework surface for `BlotterFilterBar.test.tsx`. */
export function blotterFilterBarPage(): BlotterFilterBarPage {
  return {
    async mount(
      selected: BlotterFilter,
      onSelect: (f: BlotterFilter) => void,
      summary: Summary,
    ): Promise<void> {
      await renderWithTheme(
        <BlotterFilterBar
          selected={selected}
          onSelect={onSelect}
          summary={summary}
        />,
      );
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    hasTextMatching(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    async pressText(text: string): Promise<void> {
      await fireEvent.press(screen.getByText(text));
    },
  };
}
