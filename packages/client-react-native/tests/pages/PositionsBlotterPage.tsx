// packages/client-react-native/tests/pages/PositionsBlotterPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { TextStyle } from "react-native";
import { StyleSheet } from "react-native";

import type { EquityPosition } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { PositionsBlotter } from "#/ui/equities/blotters/PositionsBlotter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { normalizeText, textContentOf } from "#tests/pages/support/textContent";

function vmWith(positions: readonly EquityPosition[]): ViewModel {
  return {
    useEquityPositions: () => {
      return positions;
    },
  } as unknown as ViewModel;
}

export interface PositionsBlotterPage {
  mount(positions: readonly EquityPosition[]): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  hasTextContent(testId: string, text: string): boolean;
  styleOfText(text: string): TextStyle;
  styleOf(testId: string): TextStyle;
}

/** The framework surface for `PositionsBlotter.test.tsx`. */
export function positionsBlotterPage(): PositionsBlotterPage {
  return {
    async mount(positions: readonly EquityPosition[]): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={vmWith(positions)}>
          <PositionsBlotter />
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    hasTextContent(testId: string, text: string): boolean {
      return (
        normalizeText(textContentOf(screen.getByTestId(testId))) ===
        normalizeText(text)
      );
    },
    styleOfText(text: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByText(text).props.style as TextStyle,
      );
    },
    styleOf(testId: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByTestId(testId).props.style as TextStyle,
      );
    },
  };
}
