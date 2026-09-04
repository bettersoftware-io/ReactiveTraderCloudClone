import { afterEach, expect, test } from "@jest/globals";

import type { Candle } from "@rtc/domain";

import { rowSparklinePage } from "#tests/pages/RowSparklinePage";

const page = rowSparklinePage();

afterEach(() => {
  return page.unmountAll();
});

test("draws a path once there are at least two closes", async () => {
  await page.mount("TSLA", candles([1, 2, 3]));
  expect(page.exists("eq-sparkline-TSLA")).toBe(true);
});

test("renders nothing when there is not enough history to draw", async () => {
  await page.mount("TSLA", candles([1]));
  expect(page.exists("eq-sparkline-TSLA")).toBe(false);
});

function candles(closes: number[]): readonly Candle[] {
  return closes.map((close, i) => {
    return {
      time: i,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
    };
  });
}
