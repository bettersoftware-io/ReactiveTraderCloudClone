import { afterEach, expect, test } from "@jest/globals";

import { Direction, type Rfq, RfqState } from "@rtc/domain";

import { rfqTilesPanelPage } from "#tests/pages/RfqTilesPanelPage";

const page = rfqTilesPanelPage();

afterEach(() => {
  return page.unmountAll();
});

test("defaults to the Live filter, which hides settled-but-untraded RFQs", async () => {
  await page.mount({ rfqs: [rfq(1, RfqState.Open), rfq(3, RfqState.Expired)] });
  expect(page.exists("rfq-card-1")).toBe(true);
  expect(page.exists("rfq-card-3")).toBe(false);
});

// The accept linger, seen from the panel: a traded rfq stays put under LIVE so
// its ACCEPTED stamp can be read, and leaves only when dismissed.
test("a traded RFQ stays under Live until it is dismissed", async () => {
  await page.mount({ rfqs: [rfq(1, RfqState.Open), rfq(2, RfqState.Closed)] });
  expect(page.exists("rfq-card-2")).toBe(true);

  await page.press("rfq-dismiss-2");

  expect(page.exists("rfq-card-2")).toBe(false);
});

test("switching to ALL reveals closed RFQs", async () => {
  await page.mount({ rfqs: [rfq(1, RfqState.Open), rfq(2, RfqState.Closed)] });
  await page.press("rfq-filter-all");
  expect(page.exists("rfq-card-2")).toBe(true);
});

test("empty state when no RFQs match", async () => {
  // Expired, not Closed: a traded rfq deliberately survives the Live filter.
  await page.mount({ rfqs: [rfq(3, RfqState.Expired)] });
  expect(page.exists("credit-tiles-empty")).toBe(true);
});

test("renders one card per matching rfq", async () => {
  await page.mount({
    rfqs: [rfq(1, RfqState.Open), rfq(2, RfqState.Open), rfq(3, RfqState.Open)],
  });
  expect(page.matchingCount(/^rfq-card-/)).toBe(3);
});

test("dismissing a settled RFQ removes it from the list", async () => {
  await page.mount({ rfqs: [rfq(3, RfqState.Expired)] });
  await page.press("rfq-filter-all");
  expect(page.exists("rfq-card-3")).toBe(true);
  await page.press("rfq-dismiss-3");
  expect(page.exists("rfq-card-3")).toBe(false);
});

function rfq(id: number, state: RfqState): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 10,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: id,
  };
}
