import { expect, jest, test } from "@jest/globals";

import type { PositionUpdates } from "@rtc/domain";

import { analyticsScreenPage } from "#tests/pages/AnalyticsScreenPage";

const page = analyticsScreenPage();

const DATA: PositionUpdates = {
  history: [
    { timestamp: "t0", usdPnl: 0 },
    { timestamp: "t1", usdPnl: 1200 },
  ],
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: 12000,
      baseTradedAmount: 1_000_000,
      counterTradedAmount: -1_100_000,
    },
  ],
};

test("shows a loading state before the first emission", async () => {
  await page.mount(null, false);
  expect(page.exists("analytics-loading")).toBeTruthy();
  expect(page.exists("analytics-panel")).toBe(false);
});

test("renders the three sections when data has arrived", async () => {
  await page.mount(DATA, false);
  expect(page.exists("analytics-panel")).toBeTruthy();
  expect(page.exists("analytics-widget-pnl")).toBeTruthy();
  expect(page.exists("analytics-widget-exposure")).toBeTruthy();
  expect(page.exists("analytics-widget-pairs")).toBeTruthy();
  expect(page.exists("pnl-value")).toBeTruthy();
  expect(page.exists("pnl-chart")).toBeTruthy();
  expect(page.exists("exposure-bubbles")).toBeTruthy();
  expect(page.exists("pair-pnl-bars")).toBeTruthy();
  expect(page.exists("pair-pnl-row-EURUSD")).toBeTruthy();
  expect(page.exists("analytics-stale")).toBe(false);
});

test("surfaces a stale indicator when the stream is stale", async () => {
  await page.mount(DATA, true);
  expect(page.exists("analytics-stale")).toBeTruthy();
});

// The prototype's card order is P&L -> Pair P&L -> Exposure. RN rendered
// Exposure second. Asserted positionally because the testIDs alone cannot
// express order, and order is the whole content of this fix.
test("renders the cards in the prototype's order", async () => {
  await page.mount(DATA, false);

  const ids = page.testIdsMatching(/^analytics-widget-/);

  expect(ids).toStrictEqual([
    "analytics-widget-pnl",
    "analytics-widget-pairs",
    "analytics-widget-exposure",
  ]);
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
