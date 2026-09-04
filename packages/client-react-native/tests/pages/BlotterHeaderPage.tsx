// packages/client-react-native/tests/pages/BlotterHeaderPage.tsx
import { screen } from "@testing-library/react-native";
import { StyleSheet, type TextStyle } from "react-native";

import { BlotterHeader } from "#/ui/blotter/BlotterHeader";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface BlotterHeaderPage {
  mount(): Promise<void>;
  hasText(text: string): boolean;
  styleOfText(text: string): TextStyle;
}

/** The framework surface for `BlotterHeader.test.tsx`. */
export function blotterHeaderPage(): BlotterHeaderPage {
  return {
    async mount(): Promise<void> {
      await renderWithTheme(<BlotterHeader />);
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    styleOfText(text: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByText(text).props.style as TextStyle,
      );
    },
  };
}
