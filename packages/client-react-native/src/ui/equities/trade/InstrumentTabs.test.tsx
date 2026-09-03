import { expect, jest, test } from "@jest/globals";

import { instrumentTabsPage } from "#tests/pages/InstrumentTabsPage";

test("renders a tab per instrument and reports selection", async () => {
  const onSelect = jest.fn();
  const page = instrumentTabsPage();
  await page.mount("AAPL", onSelect);
  expect(page.exists("instrument-tab-AAPL")).toBe(true);
  await page.press("instrument-tab-MSFT");
  expect(onSelect).toHaveBeenCalledWith("MSFT");
  await page.unmountAll();
});
