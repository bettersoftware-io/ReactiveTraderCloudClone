import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { CreditRfqFilter } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the three shared filter tabs under the prototype's labels", async () => {
  await renderTabs("live", noop);

  for (const f of ["live", "closed", "all"]) {
    expect(screen.getByTestId(`rfq-filter-${f}`)).toBeTruthy();
  }

  expect(screen.getByText("LIVE")).toBeTruthy();
  expect(screen.getByText("DONE")).toBeTruthy();
  expect(screen.getByText("ALL")).toBeTruthy();
});

test("pressing a tab writes the shared preference", async () => {
  const setFilter = jest.fn<(f: CreditRfqFilter) => void>();
  await renderTabs("live", setFilter);
  void fireEvent.press(screen.getByTestId("rfq-filter-closed"));
  expect(setFilter).toHaveBeenCalledWith("closed");
});

// The seam is the single source of truth: the tabs render the stored value,
// they do not keep a copy of it.
test("the active tab follows the stored preference", async () => {
  await renderTabs("all", noop);
  expect(selectedState(screen.getByTestId("rfq-filter-all"))).toBe(true);
  expect(selectedState(screen.getByTestId("rfq-filter-live"))).toBe(false);
});

// dc.html:216 — every chip is an outlined pill; only the fill and the border
// COLOUR change with selection. The app's inactive chip was a filled `panel`
// rectangle with no border at all, so the row read as three solid blocks
// rather than the design's three outlines with one filled.
test("every chip is an outlined pill, selected or not", async () => {
  await renderTabs("live", noop);

  for (const f of ["live", "closed", "all"]) {
    expect(screen.getByTestId(`rfq-filter-${f}`)).toHaveStyle({
      borderWidth: 1,
      borderRadius: 999,
    });
  }
});

function noop(): void {}

function selectedState(
  element: ReturnType<typeof screen.getByTestId>,
): boolean | undefined {
  const state = element.props.accessibilityState as
    | { selected?: boolean }
    | undefined;
  return state?.selected;
}

function renderTabs(
  filter: CreditRfqFilter,
  setFilter: (f: CreditRfqFilter) => void,
): Promise<unknown> {
  const viewModel = {
    useCreditRfqFilterPreference: () => {
      return { filter, setFilter };
    },
  } as unknown as ViewModel;

  return renderWithTheme(
    <ViewModelProvider viewModel={viewModel}>
      <RfqFilterTabs />
    </ViewModelProvider>,
  );
}
