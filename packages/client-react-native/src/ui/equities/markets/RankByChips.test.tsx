import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { RankByChips } from "#/ui/equities/markets/RankByChips";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const setSort = jest.fn();

test("renders the design's three chips, in order", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <RankByChips />
    </ViewModelProvider>,
  );
  expect(screen.getByText("% CHG")).toBeTruthy();
  expect(screen.getByText("PRICE")).toBeTruthy();
  expect(screen.getByText("A–Z")).toBeTruthy();
});

test("pressing a chip sets that sort directly", async () => {
  setSort.mockClear();
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <RankByChips />
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("eq-rank-price"));
  expect(setSort).toHaveBeenCalledWith("price");
});

test("marks the active chip from the preference", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm("sym")}>
      <RankByChips />
    </ViewModelProvider>,
  );
  // The testID stays stable across active/inactive (`eq-rank-${target}`) —
  // an earlier ruling: a testID must not change identity with its state, or
  // `getByTestId` breaks exactly when the state occurs. The active state is
  // exposed via `accessibilityState.selected` instead.
  const active = screen.getByTestId("eq-rank-sym").props.accessibilityState as
    | { selected?: boolean }
    | undefined;

  const inactive = screen.getByTestId("eq-rank-chg").props.accessibilityState as
    | { selected?: boolean }
    | undefined;

  expect(active?.selected).toBe(true);
  expect(inactive?.selected).toBe(false);
});

test("chips never stretch — the Phase 4a full-height-bar bug", async () => {
  const { StyleSheet } = require("react-native");

  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <RankByChips />
    </ViewModelProvider>,
  );
  const row = StyleSheet.flatten(screen.getByTestId("eq-rank-row").props.style);

  expect(row.alignItems).toBe("center");
  const chip = StyleSheet.flatten(
    screen.getByTestId("eq-rank-price").props.style,
  );

  expect(chip.flexGrow).toBe(0);
  expect(chip.flexShrink).toBe(0);
});

function vm(sort = "chg"): ViewModel {
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
