// packages/client-react-native/tests/pages/SegmentedPillPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";

import { type PillSegment, SegmentedPill } from "#/ui/SegmentedPill";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { matchesTextExactly } from "#tests/pages/support/textContent";

export interface SegmentedPillPage {
  mount<K extends string>(
    segments: readonly PillSegment<K>[],
    value: K,
    onChange: (key: K) => void,
    variant: "subNav" | "sheetSegment" | "modePill",
    frameTestID?: string,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  hasTextContent(testId: string, text: string): boolean;
  selected(testId: string): boolean;
  press(testId: string): Promise<void>;
  cellStyleOf(testId: string): ViewStyle;
}

/** The framework surface for `SegmentedPill.test.tsx`. */
export function segmentedPillPage(): SegmentedPillPage {
  return {
    async mount<K extends string>(
      segments: readonly PillSegment<K>[],
      value: K,
      onChange: (key: K) => void,
      variant: "subNav" | "sheetSegment" | "modePill",
      frameTestID?: string,
    ): Promise<void> {
      await renderWithTheme(
        <SegmentedPill
          segments={segments}
          value={value}
          onChange={onChange}
          variant={variant}
          frameTestID={frameTestID}
        />,
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
      return matchesTextExactly(screen.getByTestId(testId), text);
    },
    selected(testId: string): boolean {
      const state = screen.getByTestId(testId).props.accessibilityState as
        | { selected?: boolean }
        | undefined;
      return state?.selected === true;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
    cellStyleOf(testId: string): ViewStyle {
      return StyleSheet.flatten(
        screen.getByTestId(testId).props.style as ViewStyle,
      );
    },
  };
}
