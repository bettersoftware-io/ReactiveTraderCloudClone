import { afterEach, expect, jest, test } from "@jest/globals";

import { RFQ_QUANTITY_CHIPS } from "#/ui/credit/newRfq/rfqQuantities";
import { quantityChipsPage } from "#tests/pages/QuantityChipsPage";

const page = quantityChipsPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders the fixed quantity chips and reports the pressed one", async () => {
  const onSelect = jest.fn<(quantity: number) => void>();
  await page.mount(null, onSelect);

  expect(page.matchingCount(/^quantity-chip-/)).toBe(RFQ_QUANTITY_CHIPS.length);

  await page.press(`quantity-chip-${RFQ_QUANTITY_CHIPS[1]}`);

  expect(onSelect).toHaveBeenCalledWith(RFQ_QUANTITY_CHIPS[1]);
});

// dc.html:2182 — `v / 1000000 + 'M'`. A chip reading "2000000" would be
// unreadable at 10px.
test("labels each chip in millions", async () => {
  await page.mount(null, noop);

  expect(page.hasText("1M")).toBe(true);
  expect(page.hasText("10M")).toBe(true);
});

test("marks the selected chip and no other", async () => {
  const [first, , third] = RFQ_QUANTITY_CHIPS;
  await page.mount(third, noop);

  expect(page.selected(`quantity-chip-${third}`)).toBe(true);
  expect(page.selected(`quantity-chip-${first}`)).toBe(false);
});

function noop(): void {}
