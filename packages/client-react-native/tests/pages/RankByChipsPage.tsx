// packages/client-react-native/tests/pages/RankByChipsPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { ViewStyle } from "react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { RankByChips } from "#/ui/equities/markets/RankByChips";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { flattenStyleOf } from "#tests/pages/support/flattenStyle";

function vm(sort: string, setSort: (sort: string) => void): ViewModel {
  return {
    useEqWatchlistSort: () => {
      return {
        sort,
        setSort,
        cycle: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}

export interface RankByChipsPage {
  mount(sort: string, setSort: (sort: string) => void): Promise<void>;
  unmountAll(): Promise<void>;
  hasText(text: string): boolean;
  press(testId: string): Promise<void>;
  selected(testId: string): boolean | undefined;
  rowStyle(): ViewStyle;
  chipStyle(testId: string): ViewStyle;
}

/** The framework surface for `RankByChips.test.tsx`. */
export function rankByChipsPage(): RankByChipsPage {
  return {
    async mount(sort: string, setSort: (sort: string) => void): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={vm(sort, setSort)}>
          <RankByChips />
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
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
    rowStyle(): ViewStyle {
      return flattenStyleOf(screen.getByTestId("eq-rank-row"));
    },
    chipStyle(testId: string): ViewStyle {
      return flattenStyleOf(screen.getByTestId(testId));
    },
  };
}
