import { afterEach, expect, test } from "@jest/globals";

import { rowSparklinePage } from "#tests/pages/RowSparklinePage";

afterEach(() => {
  return page.unmountAll();
});

test("draws a path once there are at least two prices", async () => {
  await page.mount("TSLA", [1, 2, 3]);
  expect(page.exists("eq-sparkline-TSLA")).toBe(true);
});

test("renders nothing when there is not enough history to draw", async () => {
  await page.mount("TSLA", [1]);
  expect(page.exists("eq-sparkline-TSLA")).toBe(false);
});

test("renders nothing for a symbol that has had no quote yet", async () => {
  await page.mount("TSLA", []);
  expect(page.exists("eq-sparkline-TSLA")).toBe(false);
});

const page = rowSparklinePage();
