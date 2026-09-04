// packages/client-react-native/tests/pages/InstrumentChipGridPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { Instrument } from "@rtc/domain";

import { InstrumentChipGrid } from "#/ui/credit/newRfq/InstrumentChipGrid";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface InstrumentChipGridPage {
  mount(
    instruments: readonly Instrument[],
    selectedId: number | null,
    onSelect: (id: number) => void,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  matchingCount(pattern: RegExp): number;
  // RNTL v13 dropped `toHaveAccessibilityState`, so this reads the prop
  // directly.
  selected(testId: string): boolean | undefined;
  press(testId: string): Promise<void>;
}

/** The framework surface for `InstrumentChipGrid.test.tsx`. */
export function instrumentChipGridPage(): InstrumentChipGridPage {
  return {
    async mount(
      instruments: readonly Instrument[],
      selectedId: number | null,
      onSelect: (id: number) => void,
    ): Promise<void> {
      await renderWithTheme(
        <InstrumentChipGrid
          instruments={instruments}
          selectedId={selectedId}
          onSelect={onSelect}
        />,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    matchingCount(pattern: RegExp): number {
      return screen.queryAllByTestId(pattern).length;
    },
    selected(testId: string): boolean | undefined {
      const state = screen.getByTestId(testId).props.accessibilityState as
        | { selected?: boolean }
        | undefined;
      return state?.selected;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
  };
}
