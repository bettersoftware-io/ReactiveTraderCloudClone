// packages/client-react-native/tests/pages/SheetSwitchPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { ViewStyle } from "react-native";
import { StyleSheet } from "react-native";

import { SheetSwitch } from "#/ui/shell/appearance/SheetSwitch";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface SheetSwitchPage {
  mount(checked: boolean, onToggle: (next: boolean) => void): Promise<void>;
  unmountAll(): void;
  press(): Promise<void>;
  accessibilityRole(): unknown;
  accessibilityLabel(): unknown;
  accessibilityChecked(): boolean | undefined;
  trackStyle(): ViewStyle;
  knobStyle(): ViewStyle;
}

/** The framework surface for `SheetSwitch.test.tsx`. */
export function sheetSwitchPage(): SheetSwitchPage {
  return {
    async mount(
      checked: boolean,
      onToggle: (next: boolean) => void,
    ): Promise<void> {
      await renderWithTheme(
        <SheetSwitch
          testID="switch"
          accessibilityLabel="Ambient background"
          checked={checked}
          onToggle={onToggle}
        />,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    async press(): Promise<void> {
      await fireEvent.press(screen.getByTestId("switch"));
    },
    accessibilityRole(): unknown {
      return screen.getByTestId("switch").props.accessibilityRole;
    },
    accessibilityLabel(): unknown {
      return screen.getByTestId("switch").props.accessibilityLabel;
    },
    accessibilityChecked(): boolean | undefined {
      return (
        screen.getByTestId("switch").props.accessibilityState as
          | { checked?: boolean }
          | undefined
      )?.checked;
    },
    trackStyle(): ViewStyle {
      return StyleSheet.flatten(
        screen.getByTestId("switch").props.style as ViewStyle,
      );
    },
    knobStyle(): ViewStyle {
      return StyleSheet.flatten(
        screen.getByTestId("switch-knob").props.style as ViewStyle,
      );
    },
  };
}
