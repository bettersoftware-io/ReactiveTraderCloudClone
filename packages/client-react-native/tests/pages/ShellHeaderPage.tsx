// packages/client-react-native/tests/pages/ShellHeaderPage.tsx
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import type { TextStyle } from "react-native";
import { StyleSheet } from "react-native";

import { ShellHeader } from "#/ui/shell/hud/ShellHeader";
import { textContentOf } from "#tests/pages/support/textContent";

export interface ShellHeaderPage {
  mount(
    simulator: boolean,
    onToggleSimulator?: (v: boolean) => void,
  ): Promise<void>;
  unmountAll(): void;
  hasTextContent(testId: string, text: string): boolean;
  pressEnvBadge(): Promise<void>;
  wordmarkStyle(): TextStyle;
  styleOfText(text: string): TextStyle;
}

/** The framework surface for `ShellHeader.test.tsx`. Relies on the spec's
 * own `jest.mock` calls, hoisted above every import in the spec file. */
export function shellHeaderPage(): ShellHeaderPage {
  return {
    async mount(
      simulator: boolean,
      onToggleSimulator: (v: boolean) => void = (): void => {},
    ): Promise<void> {
      await render(
        <ShellHeader
          simulator={simulator}
          onToggleSimulator={onToggleSimulator}
          onOpenAppearance={(): void => {}}
        />,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    hasTextContent(testId: string, text: string): boolean {
      return textContentOf(screen.getByTestId(testId)).includes(text);
    },
    async pressEnvBadge(): Promise<void> {
      await fireEvent.press(screen.getByTestId("hud-env-badge"));
    },
    wordmarkStyle(): TextStyle {
      return StyleSheet.flatten(
        screen.getByTestId("hud-wordmark").props.style as TextStyle,
      );
    },
    styleOfText(text: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByText(text).props.style as TextStyle,
      );
    },
  };
}
