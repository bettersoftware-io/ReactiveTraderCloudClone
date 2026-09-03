// packages/client-react-native/tests/pages/SectionLabelPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { TextStyle } from "react-native";
import { StyleSheet } from "react-native";

import { SectionLabel } from "#/ui/equities/SectionLabel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface SectionLabelPage {
  mountPair(a: string, b: string): Promise<void>;
  mountOne(text: string): Promise<void>;
  unmountAll(): Promise<void>;
  styleOf(text: string): TextStyle;
}

/** The framework surface for `SectionLabel.test.tsx`. */
export function sectionLabelPage(): SectionLabelPage {
  return {
    async mountPair(a: string, b: string): Promise<void> {
      await renderWithTheme(
        <>
          <SectionLabel>{a}</SectionLabel>
          <SectionLabel spaced>{b}</SectionLabel>
        </>,
      );
    },
    async mountOne(text: string): Promise<void> {
      await renderWithTheme(<SectionLabel>{text}</SectionLabel>);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    styleOf(text: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByText(text).props.style as TextStyle,
      );
    },
  };
}
