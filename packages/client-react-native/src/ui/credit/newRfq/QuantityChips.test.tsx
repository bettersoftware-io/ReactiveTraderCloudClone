import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { QuantityChips } from "#/ui/credit/newRfq/QuantityChips";
import { RFQ_QUANTITY_CHIPS } from "#/ui/credit/newRfq/rfqQuantities";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the fixed quantity chips and reports the pressed one", async () => {
  const onSelect = jest.fn<(quantity: number) => void>();
  await renderWithTheme(<QuantityChips selected={null} onSelect={onSelect} />);

  expect(screen.getAllByTestId(/^quantity-chip-/)).toHaveLength(
    RFQ_QUANTITY_CHIPS.length,
  );

  await fireEvent.press(screen.getByTestId("quantity-chip-2000000"));

  expect(onSelect).toHaveBeenCalledWith(2_000_000);
});

// dc.html:2182 — `v / 1000000 + 'M'`. A chip reading "2000000" would be
// unreadable at 10px.
test("labels each chip in millions", async () => {
  await renderWithTheme(<QuantityChips selected={null} onSelect={noop} />);

  expect(screen.getByText("1M")).toBeTruthy();
  expect(screen.getByText("10M")).toBeTruthy();
});

test("marks the selected chip and no other", async () => {
  await renderWithTheme(<QuantityChips selected={5_000_000} onSelect={noop} />);

  expect(selectedState(screen.getByTestId("quantity-chip-5000000"))).toBe(true);
  expect(selectedState(screen.getByTestId("quantity-chip-1000000"))).toBe(
    false,
  );
});

function noop(): void {}

/** RNTL v13 dropped `toHaveAccessibilityState`, so read the prop directly. */
function selectedState(
  element: ReturnType<typeof screen.getByTestId>,
): boolean | undefined {
  const state = element.props.accessibilityState as
    | { selected?: boolean }
    | undefined;
  return state?.selected;
}
