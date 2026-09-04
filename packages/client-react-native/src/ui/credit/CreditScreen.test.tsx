import { afterEach, expect, test } from "@jest/globals";

import { creditScreenPage } from "#tests/pages/CreditScreenPage";

const page = creditScreenPage();

afterEach(() => {
  return page.unmountAll();
});

test("shows the RFQ tiles sub-view by default", async () => {
  await page.mount();
  expect(page.exists("credit-tiles-panel")).toBe(true);
});

test("switching to New RFQ shows the create form", async () => {
  await page.mount();
  await page.pressTab("new-rfq");
  expect(page.exists("new-rfq-form")).toBe(true);
});

test("switching to Sell Side shows the sell-side panel", async () => {
  await page.mount();
  await page.pressTab("sell-side");
  expect(page.exists("sell-side-panel")).toBe(true);
});
