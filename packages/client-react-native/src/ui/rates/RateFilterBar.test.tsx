import { expect, jest, test } from "@jest/globals";

import type { RateFilter } from "#/ui/rates/ratesFilter";
import { rateFilterBarPage } from "#tests/pages/RateFilterBarPage";

const page = rateFilterBarPage();

test("renders every prototype filter and reports selection", async () => {
  const onSelect = jest.fn<(f: RateFilter) => void>();
  await page.mount("ALL", onSelect);

  expect(page.hasText("ALL")).toBeTruthy();
  expect(page.hasText("JPY")).toBeTruthy();

  await page.pressText("EUR");
  expect(onSelect).toHaveBeenCalledWith("EUR");
  await page.unmountAll();
});
