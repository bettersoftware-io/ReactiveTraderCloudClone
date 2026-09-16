// packages/client-react-native/tests/pages/SheetSwitchPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { ViewStyle } from "react-native";

import { SheetSwitch } from "#/ui/shell/appearance/SheetSwitch";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { flattenStyleOf } from "#tests/pages/support/flattenStyle";

export interface SheetSwitchPage {
  mount(checked: boolean, onToggle: (next: boolean) => void): Promise<void>;
  unmountAll(): Promise<void>;
  press(): Promise<void>;
  accessibilityRole(): string | undefined;
  accessibilityLabel(): string | undefined;
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
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    async press(): Promise<void> {
      await fireEvent.press(screen.getByTestId("switch"));
    },
    accessibilityRole(): string | undefined {
      return screen.getByTestId("switch").props.accessibilityRole as
        | string
        | undefined;
    },
    accessibilityLabel(): string | undefined {
      return screen.getByTestId("switch").props.accessibilityLabel as
        | string
        | undefined;
    },
    accessibilityChecked(): boolean | undefined {
      return (
        screen.getByTestId("switch").props.accessibilityState as
          | { checked?: boolean }
          | undefined
      )?.checked;
    },
    trackStyle(): ViewStyle {
      return flattenStyleOf(screen.getByTestId("switch"));
    },
    knobStyle(): ViewStyle {
      return flattenStyleOf(screen.getByTestId("switch-knob"));
    },
  };
}
