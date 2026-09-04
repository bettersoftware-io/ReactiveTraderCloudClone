import { afterEach, expect, jest, test } from "@jest/globals";

import { creditNavPage } from "#tests/pages/CreditNavPage";

const page = creditNavPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders the three sub-view segments with the design's labels", async () => {
  await page.mount("tiles", (): void => {});
  expect(page.exists("credit-nav")).toBe(true);
  expect(page.hasTextContent("credit-tab-tiles", "RFQS")).toBe(true);
  expect(page.hasTextContent("credit-tab-new-rfq", "NEW RFQ")).toBe(true);
  expect(page.hasTextContent("credit-tab-sell-side", "SELL-SIDE")).toBe(true);
});

test("pressing a segment reports the new view", async () => {
  const onChange = jest.fn<(v: string) => void>();
  await page.mount("tiles", onChange);
  await page.pressTab("new-rfq");
  expect(onChange).toHaveBeenCalledWith("new-rfq");
});
