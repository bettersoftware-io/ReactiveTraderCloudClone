// packages/client-react-native/tests/pages/ThemeModePillPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { TextStyle, ViewStyle } from "react-native";

import { ThemeModePill } from "#/ui/shell/appearance/ThemeModePill";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { flattenStyleOf } from "#tests/pages/support/flattenStyle";

export type ThemeMode = "dark" | "light" | "system";

export interface ThemeModePillPage {
  mount(value: ThemeMode, onSelect: (mode: ThemeMode) => void): Promise<void>;
  unmountAll(): Promise<void>;
  hasCellLabel(label: string): boolean;
  pressCell(mode: ThemeMode): Promise<void>;
  cellStyle(mode: ThemeMode): ViewStyle;
  labelStyle(label: string): TextStyle;
  cellSelected(mode: ThemeMode): boolean | undefined;
}

/** The framework surface for `ThemeModePill.test.tsx`. */
export function themeModePillPage(): ThemeModePillPage {
  return {
    async mount(
      value: ThemeMode,
      onSelect: (mode: ThemeMode) => void,
    ): Promise<void> {
      await renderWithTheme(
        <ThemeModePill value={value} onSelect={onSelect} />,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    hasCellLabel(label: string): boolean {
      return screen.queryByText(label) != null;
    },
    async pressCell(mode: ThemeMode): Promise<void> {
      await fireEvent.press(screen.getByTestId(`appearance-mode-${mode}`));
    },
    cellStyle(mode: ThemeMode): ViewStyle {
      return flattenStyleOf(screen.getByTestId(`appearance-mode-${mode}`));
    },
    labelStyle(label: string): TextStyle {
      return flattenStyleOf(screen.getByText(label));
    },
    cellSelected(mode: ThemeMode): boolean | undefined {
      return (
        screen.getByTestId(`appearance-mode-${mode}`).props
          .accessibilityState as { selected?: boolean } | undefined
      )?.selected;
    },
  };
}
