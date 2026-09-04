import { afterEach, expect, jest, test } from "@jest/globals";

import { priceStepperPage } from "#tests/pages/PriceStepperPage";

const page = priceStepperPage();

afterEach(() => {
  return page.unmountAll();
});

test("steps up by 0.05", async () => {
  const onChange = jest.fn<(next: number) => void>();
  await page.mount(1.2, onChange);
  await page.press("price-stepper-up");

  expect(onChange).toHaveBeenCalledWith(1.25);
});

test("steps down by 0.05", async () => {
  const onChange = jest.fn<(next: number) => void>();
  await page.mount(1.2, onChange);
  await page.press("price-stepper-down");

  expect(onChange).toHaveBeenCalledWith(1.15);
});

test("does not step below zero", async () => {
  const onChange = jest.fn<(next: number) => void>();
  await page.mount(0.02, onChange);
  await page.press("price-stepper-down");

  expect(onChange).toHaveBeenCalledWith(0);
});

// 98.4 + 0.05 is 98.44999999999999 in float64. A price readout is the one
// place that must not leak that.
test("keeps two decimals rather than float noise", async () => {
  const onChange = jest.fn<(next: number) => void>();
  await page.mount(98.4, onChange);
  await page.press("price-stepper-up");

  expect(onChange).toHaveBeenCalledWith(98.45);
});

test("shows the current price to two decimals", async () => {
  await page.mount(98.4, noop);
  expect(page.hasText("98.40")).toBe(true);
});

function noop(): void {}
