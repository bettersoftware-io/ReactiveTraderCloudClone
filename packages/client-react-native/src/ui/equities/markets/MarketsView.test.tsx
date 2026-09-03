import { afterEach, expect, jest, test } from "@jest/globals";

import { marketsViewPage } from "#tests/pages/MarketsViewPage";

const page = marketsViewPage();

afterEach(() => {
  return page.unmountAll();
});

test("composes the RANK BY chips over the movers board", async () => {
  await page.mount();
  expect(page.exists("markets-view")).toBe(true);
  expect(page.exists("eq-rank-row")).toBe(true);
  expect(page.exists("eq-mover-AAPL")).toBe(true);
  // The design goes sub-nav -> RANK BY -> board: no `MOVERS`/`SECTORS`
  // headings, and no sector heatmap (deleted with this view's own block).
  expect(page.hasText("MOVERS")).toBe(false);
  expect(page.hasText("SECTORS")).toBe(false);
  expect(page.exists("heatmap-cell-AAPL")).toBe(false);
});

// `page.mount()` doesn't stub `usePowerSaver`; MoversBoard's rows read it via
// `useShellMotionEnabled` (see MoversBoard.test.tsx for the same fix).
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
