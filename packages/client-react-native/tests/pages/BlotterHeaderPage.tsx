// packages/client-react-native/tests/pages/BlotterHeaderPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { TextStyle } from "react-native";

import { BlotterHeader } from "#/ui/blotter/BlotterHeader";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { flattenStyleOf } from "#tests/pages/support/flattenStyle";

export interface BlotterHeaderPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  hasText(text: string): boolean;
  styleOfText(text: string): TextStyle;
}

/** The framework surface for `BlotterHeader.test.tsx`. */
export function blotterHeaderPage(): BlotterHeaderPage {
  return {
    async mount(): Promise<void> {
      await renderWithTheme(<BlotterHeader />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    styleOfText(text: string): TextStyle {
      return flattenStyleOf(screen.getByText(text));
    },
  };
}
