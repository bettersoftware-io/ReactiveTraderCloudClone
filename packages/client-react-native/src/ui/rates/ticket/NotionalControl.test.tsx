import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { NotionalControl } from "./NotionalControl";

test("steppers halve/double with a 250k floor", async () => {
  const n = makeNotional(1_000_000);
  await renderWithTheme(<NotionalControl notional={n} base="EUR" />);

  await fireEvent.press(screen.getByTestId("notional-up"));
  expect(n.change).toHaveBeenCalledWith("2000000");

  n.change.mockClear();
  await fireEvent.press(screen.getByTestId("notional-down"));
  expect(n.change).toHaveBeenCalledWith("500000");
});

test("does not go below the 250k floor", async () => {
  const n = makeNotional(250_000);
  await renderWithTheme(<NotionalControl notional={n} base="EUR" />);
  await fireEvent.press(screen.getByTestId("notional-down"));
  expect(n.change).toHaveBeenCalledWith("250000");
});

test("quick chip sets the notional", async () => {
  const n = makeNotional(1_000_000);
  await renderWithTheme(<NotionalControl notional={n} base="EUR" />);
  await fireEvent.press(screen.getByText("5M"));
  expect(n.change).toHaveBeenCalledWith("5000000");
});

interface FakeNotional {
  state: { displayValue: string; numericValue: number; error: string | null };
  change: jest.Mock;
  reset: jest.Mock;
}

function makeNotional(numericValue: number): FakeNotional {
  return {
    state: {
      displayValue: numericValue.toLocaleString("en-US"),
      numericValue,
      error: null,
    },
    change: jest.fn(),
    reset: jest.fn(),
  };
}
