import { afterEach, expect, jest, test } from "@jest/globals";

import type { CreditRfqFilter } from "@rtc/domain";

import { rfqFilterTabsPage } from "#tests/pages/RfqFilterTabsPage";

const page = rfqFilterTabsPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders the three shared filter tabs under the prototype's labels", async () => {
  await page.mount("live", noop);

  for (const f of ["live", "closed", "all"]) {
    expect(page.exists(`rfq-filter-${f}`)).toBe(true);
  }

  expect(page.hasText("LIVE")).toBe(true);
  expect(page.hasText("DONE")).toBe(true);
  expect(page.hasText("ALL")).toBe(true);
});

test("pressing a tab writes the shared preference", async () => {
  const setFilter = jest.fn<(f: CreditRfqFilter) => void>();
  await page.mount("live", setFilter);
  await page.press("rfq-filter-closed");
  expect(setFilter).toHaveBeenCalledWith("closed");
});

// The seam is the single source of truth: the tabs render the stored value,
// they do not keep a copy of it.
test("the active tab follows the stored preference", async () => {
  await page.mount("all", noop);
  expect(page.selected("rfq-filter-all")).toBe(true);
  expect(page.selected("rfq-filter-live")).toBe(false);
});

// dc.html:216 — every chip is an outlined pill; only the fill and the border
// COLOUR change with selection. The app's inactive chip was a filled `panel`
// rectangle with no border at all, so the row read as three solid blocks
// rather than the design's three outlines with one filled.
test("every chip is an outlined pill, selected or not", async () => {
  await page.mount("live", noop);

  for (const f of ["live", "closed", "all"]) {
    expect(page.styleOf(`rfq-filter-${f}`)).toMatchObject({
      borderWidth: 1,
      borderRadius: 999,
    });
  }
});

function noop(): void {}
