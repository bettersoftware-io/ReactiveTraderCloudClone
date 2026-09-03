import { afterEach, expect, jest, test } from "@jest/globals";

import { equitiesNavPage } from "#tests/pages/EquitiesNavPage";

const page = equitiesNavPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders the three segments with the design's labels", async () => {
  await page.mount("markets", (): void => {});
  expect(page.exists("equities-nav")).toBe(true);
  expect(page.hasTextContent("equities-tab-markets", "MARKETS")).toBe(true);
  expect(page.hasTextContent("equities-tab-trade", "TRADE")).toBe(true);
  expect(page.hasTextContent("equities-tab-blotters", "BLOTTER")).toBe(true);
});

test("reports a change", async () => {
  const onChange = jest.fn();
  await page.mount("markets", onChange);
  await page.pressTab("trade");
  expect(onChange).toHaveBeenCalledWith("trade");
});
