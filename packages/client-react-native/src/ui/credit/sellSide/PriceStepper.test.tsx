import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { PriceStepper } from "#/ui/credit/sellSide/PriceStepper";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("steps up by 0.05", async () => {
  const onChange = jest.fn<(next: number) => void>();
  await renderWithTheme(<PriceStepper value={1.2} onChange={onChange} />);
  await fireEvent.press(screen.getByTestId("price-stepper-up"));

  expect(onChange).toHaveBeenCalledWith(1.25);
});

test("steps down by 0.05", async () => {
  const onChange = jest.fn<(next: number) => void>();
  await renderWithTheme(<PriceStepper value={1.2} onChange={onChange} />);
  await fireEvent.press(screen.getByTestId("price-stepper-down"));

  expect(onChange).toHaveBeenCalledWith(1.15);
});

test("does not step below zero", async () => {
  const onChange = jest.fn<(next: number) => void>();
  await renderWithTheme(<PriceStepper value={0.02} onChange={onChange} />);
  await fireEvent.press(screen.getByTestId("price-stepper-down"));

  expect(onChange).toHaveBeenCalledWith(0);
});

// 98.4 + 0.05 is 98.44999999999999 in float64. A price readout is the one
// place that must not leak that.
test("keeps two decimals rather than float noise", async () => {
  const onChange = jest.fn<(next: number) => void>();
  await renderWithTheme(<PriceStepper value={98.4} onChange={onChange} />);
  await fireEvent.press(screen.getByTestId("price-stepper-up"));

  expect(onChange).toHaveBeenCalledWith(98.45);
});

test("shows the current price to two decimals", async () => {
  await renderWithTheme(<PriceStepper value={98.4} onChange={NOOP} />);
  expect(screen.getByText("98.40")).toBeTruthy();
});

function NOOP(): void {}
