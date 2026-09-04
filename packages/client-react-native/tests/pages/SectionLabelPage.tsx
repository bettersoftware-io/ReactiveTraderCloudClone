// packages/client-react-native/tests/pages/SectionLabelPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { TextStyle } from "react-native";
import { StyleSheet } from "react-native";

import { SectionLabel } from "#/ui/equities/SectionLabel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface SectionLabelPage {
  // Renders `plain` bare and `spaced` under the `spaced` prop, side by side —
  // names the prop under test rather than the shape of the render call.
  mountPlainAndSpaced(plain: string, spaced: string): Promise<void>;
  mountOne(text: string): Promise<void>;
  unmountAll(): Promise<void>;
  styleOfText(text: string): TextStyle;
}

/** The framework surface for `SectionLabel.test.tsx`. */
export function sectionLabelPage(): SectionLabelPage {
  return {
    async mountPlainAndSpaced(plain: string, spaced: string): Promise<void> {
      await renderWithTheme(
        <>
          <SectionLabel>{plain}</SectionLabel>
          <SectionLabel spaced>{spaced}</SectionLabel>
        </>,
      );
    },
    async mountOne(text: string): Promise<void> {
      await renderWithTheme(<SectionLabel>{text}</SectionLabel>);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    styleOfText(text: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByText(text).props.style as TextStyle,
      );
    },
  };
}
