import { afterEach, expect, jest, test } from "@jest/globals";

import { tradeViewPage } from "#tests/pages/TradeViewPage";

const page = tradeViewPage();

afterEach(() => {
  return page.unmountAll();
});

test("prompts to pick an instrument when none is selected", async () => {
  await page.mount(null);
  expect(page.exists("trade-empty")).toBe(true);
});

test("renders chips, instrument card, ticket and POSITIONS for the selected symbol", async () => {
  await page.mount("AAPL");
  expect(page.exists("trade-view")).toBe(true);
  expect(page.exists("instrument-tab-AAPL")).toBe(true);
  expect(page.exists("instrument-card")).toBe(true);
  expect(page.exists("eq-candle-empty")).toBe(true); // fullVM's useCandles is []
  expect(page.exists("order-ticket")).toBe(true);
  expect(page.hasText("POSITIONS")).toBe(true);
  expect(page.exists("position-row-AAPL")).toBe(true);
  expect(page.hasText("DEPTH")).toBe(false);
});

// `fullVM()` doesn't stub `usePowerSaver`, which InstrumentCard's
// useShellMotionEnabled would otherwise call — mirrors
// InstrumentCard.test.tsx / SpotTile.test.tsx.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
