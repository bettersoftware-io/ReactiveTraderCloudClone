// packages/client-react-native/tests/pages/SegmentedControlPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import { type Segment, SegmentedControl } from "#/ui/SegmentedControl";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { matchesTextExactly } from "#tests/pages/support/textContent";

export interface SegmentedControlPage {
  mount<K extends string>(
    segments: readonly Segment<K>[],
    value: K,
    onChange: (key: K) => void,
    idPrefix: string,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasTextContent(testId: string, text: string): boolean;
  selected(testId: string): boolean;
  press(testId: string): Promise<void>;
}

/** The framework surface for `SegmentedControl.test.tsx`. */
export function segmentedControlPage(): SegmentedControlPage {
  return {
    async mount<K extends string>(
      segments: readonly Segment<K>[],
      value: K,
      onChange: (key: K) => void,
      idPrefix: string,
    ): Promise<void> {
      await renderWithTheme(
        <SegmentedControl
          segments={segments}
          value={value}
          onChange={onChange}
          idPrefix={idPrefix}
        />,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
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
  };
}
