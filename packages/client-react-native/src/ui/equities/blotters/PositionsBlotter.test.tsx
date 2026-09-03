import { afterEach, expect, test } from "@jest/globals";

import type { EquityPosition } from "@rtc/domain";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { positionsBlotterPage } from "#tests/pages/PositionsBlotterPage";

const page = positionsBlotterPage();

afterEach(() => {
  return page.unmountAll();
});

const POSITIONS: readonly EquityPosition[] = [
  {
    symbol: "AAPL",
    qty: 1200,
    avgPrice: 118.4,
    markPrice: 131.2,
    unrealisedPnl: 15_440,
  },
  {
    symbol: "JPM",
    qty: -300,
    avgPrice: 252,
    markPrice: 255.08,
    unrealisedPnl: -924,
  },
];

test("renders a card per position with signed qty, @avg and compact P&L", async () => {
  await page.mount(POSITIONS);
  expect(page.exists("positions-panel")).toBe(true);
  expect(page.exists("position-row-AAPL")).toBe(true);
  expect(page.hasText("+1,200")).toBe(true);
  expect(page.hasText("@118.40")).toBe(true);
  expect(page.hasTextContent("eq-position-pnl-AAPL", "+15.4K")).toBe(true);
  expect(page.hasText("−300")).toBe(true);
  expect(page.hasTextContent("eq-position-pnl-JPM", "−924")).toBe(true);
});

test("colours quantity and P&L by sign", async () => {
  const t = rnThemeTokens.holo.dark;
  await page.mount(POSITIONS);
  expect(page.styleOfText("+1,200")).toMatchObject({
    color: t.accentPositive,
  });
  expect(page.styleOfText("−300")).toMatchObject({ color: t.accentNegative });
  expect(page.styleOf("eq-position-pnl-AAPL")).toMatchObject({
    color: t.accentPositive,
  });
  expect(page.styleOf("eq-position-pnl-JPM")).toMatchObject({
    color: t.accentNegative,
  });
});

test("shows an empty state with no positions", async () => {
  await page.mount([]);
  expect(page.exists("positions-empty")).toBe(true);
  expect(page.exists("positions-panel")).toBe(false);
});
