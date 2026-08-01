import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { CreditRfqFilter } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the three shared filter tabs under the prototype's labels", async () => {
  await renderTabs("live", NOOP);

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
  await renderTabs("all", NOOP);
  expect(selectedState(screen.getByTestId("rfq-filter-all"))).toBe(true);
  expect(selectedState(screen.getByTestId("rfq-filter-live"))).toBe(false);
});

function NOOP(): void {}

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
