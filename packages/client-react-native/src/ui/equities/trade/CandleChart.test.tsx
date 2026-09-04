import { afterEach, expect, jest, test } from "@jest/globals";

import type { Candle } from "@rtc/domain";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { candleChartPage } from "#tests/pages/CandleChartPage";

const page = candleChartPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders the canvas once candles exist", async () => {
  await page.mount(candles(3));
  expect(page.exists("eq-candle-chart")).toBe(true);
});

test("shows an empty state instead of a blank canvas with no candles", async () => {
  await page.mount(candles(0));
  expect(page.exists("eq-candle-empty")).toBe(true);
});

// Recovered from the deleted PriceChart.test.tsx (this component's SVG
// predecessor), which asserted the same thing for the same reason: a live
// convention still carried by rfqTiles/QuoteCard.test.tsx. `CandleChart` is
// chrome-less since the fidelity pass (it sits inside `InstrumentCard`'s
// tile, which owns the gradient surface) so it never mounts a `SurfaceCard`,
// sheen or otherwise — this asserts that stays true.
test("renders no gradient tile surface even on a 3d skin (dense panel, not a hero tile)", async () => {
  await page.mount(candles(3), rnThemeTokens.holo3d.dark);
  expect(page.exists("surface-sheen")).toBe(false);
});

function candles(n: number): readonly Candle[] {
  return Array.from({ length: n }, (_, i) => {
    return { time: i, open: 10, high: 12, low: 9, close: 11, volume: 1000 };
  });
}

// CandleChart reads useShellMotionEnabled for the body morph; that hook reads
// `usePowerSaver` off the ViewModel context, so it's mocked directly here —
// the SpotTile.test.tsx pattern, same reason.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
