import { afterEach, expect, jest, test } from "@jest/globals";

import type { Instrument } from "@rtc/domain";

import { instrumentChipGridPage } from "#tests/pages/InstrumentChipGridPage";

const page = instrumentChipGridPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders a chip per instrument and reports the pressed one", async () => {
  const onSelect = jest.fn<(id: number) => void>();
  await page.mount(instruments(2), null, onSelect);

  expect(page.matchingCount(/^instrument-chip-/)).toBe(2);

  await page.press("instrument-chip-2");

  expect(onSelect).toHaveBeenCalledWith(2);
});

// The prototype hardcodes six instruments; real `useInstruments()` data does
// not. A seventh must still be reachable — which is why this wraps rather than
// scrolling horizontally, where the overflow would be off-screen.
test("renders every instrument when there are more than six", async () => {
  await page.mount(instruments(9), null, noop);

  expect(page.matchingCount(/^instrument-chip-/)).toBe(9);
});

test("marks the selected chip and no other", async () => {
  await page.mount(instruments(3), 2, noop);

  expect(page.selected("instrument-chip-2")).toBe(true);
  expect(page.selected("instrument-chip-1")).toBe(false);
});

test("renders nothing but stays mounted with no instruments yet", async () => {
  await page.mount([], null, noop);

  expect(page.matchingCount(/^instrument-chip-/)).toBe(0);
});

function noop(): void {}

function instruments(count: number): readonly Instrument[] {
  return Array.from({ length: count }, (_unused, i) => {
    return {
      id: i + 1,
      name: `Instrument ${i + 1}`,
      cusip: `00000${i}AA1`,
      ticker: `INST${i + 1}`,
      maturity: "2030",
      interestRate: 5.5,
      benchmark: "T 4.0 2030",
      refPrice: 98.4,
    };
  });
}
