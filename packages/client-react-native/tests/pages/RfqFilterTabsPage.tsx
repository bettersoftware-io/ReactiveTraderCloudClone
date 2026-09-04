// packages/client-react-native/tests/pages/RfqFilterTabsPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { ViewStyle } from "react-native";
import { StyleSheet } from "react-native";

import type { CreditRfqFilter } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface RfqFilterTabsPage {
  mount(
    filter: CreditRfqFilter,
    setFilter: (f: CreditRfqFilter) => void,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  press(testId: string): Promise<void>;
  // RNTL v13 dropped `toHaveAccessibilityState`, so this reads the prop
  // directly.
  selected(testId: string): boolean | undefined;
  styleOf(testId: string): ViewStyle;
}

/** The framework surface for `RfqFilterTabs.test.tsx`. */
export function rfqFilterTabsPage(): RfqFilterTabsPage {
  return {
    async mount(
      filter: CreditRfqFilter,
      setFilter: (f: CreditRfqFilter) => void,
    ): Promise<void> {
      const viewModel = {
        useCreditRfqFilterPreference: () => {
          return { filter, setFilter };
        },
      } as unknown as ViewModel;

      await renderWithTheme(
        <ViewModelProvider viewModel={viewModel}>
          <RfqFilterTabs />
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
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
    selected(testId: string): boolean | undefined {
      const state = screen.getByTestId(testId).props.accessibilityState as
        | { selected?: boolean }
        | undefined;
      return state?.selected;
    },
    styleOf(testId: string): ViewStyle {
      return StyleSheet.flatten(
        screen.getByTestId(testId).props.style as ViewStyle,
      );
    },
  };
}
