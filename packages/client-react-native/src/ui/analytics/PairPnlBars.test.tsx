import { afterEach, expect, jest, test } from "@jest/globals";

import type { CurrencyPairPosition } from "@rtc/domain";

import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";
import { pairPnlBarsPage } from "#tests/pages/PairPnlBarsPage";

const page = pairPnlBarsPage();

afterEach(() => {
  return page.unmountAll();
});

const THEME: RnTheme = rnThemeTokens.holo.dark;

// The MOBILE prototype's per-pair format (dc.html L950) is the compact `fmtK`
// — one decimal and an uppercase K from a thousand up, always signed, with a
// U+2212 on losses. RN rendered the shared `formatPnlK` ("+12k"), which is the
// WEB design's whole-thousands shorthand and rounds a 12,400 pair to the same
// text as a 12,000 one.
test("renders one row per position with the prototype's compact signed label", async () => {
  await page.mount([pos("EURUSD", 12000), pos("USDJPY", -3400)]);
  expect(page.exists("pair-pnl-row-EURUSD")).toBeTruthy();
  expect(page.exists("pair-pnl-row-USDJPY")).toBeTruthy();
  expect(page.hasText("EUR/USD")).toBeTruthy();
  expect(page.hasText("+12.0K")).toBeTruthy();
});

test("a positive pair carries an explicit plus, matching the negative's minus", async () => {
  await page.mount([pos("EURUSD", 9000), pos("USDJPY", -4000)]);
  expect(page.hasText("+9.0K")).toBeTruthy();
  expect(page.hasText("−4.0K")).toBeTruthy();
});

// Below a thousand the compact form drops the suffix entirely and prints the
// whole figure — the prototype's third `fmtK` branch. The old `formatPnlK`
// rounded this same pair to "-1k", losing it.
test("sub-thousand pairs print whole, with no suffix", async () => {
  await page.mount([pos("EURAUD", -600)]);
  expect(page.hasText("−600")).toBeTruthy();
});

test("renders nothing but the container when there are no positions", async () => {
  await page.mount([]);
  expect(page.exists("pair-pnl-bars")).toBeTruthy();
  expect(page.exists("pair-pnl-row-EURUSD")).toBe(false);
});

test("colours a row's label by the sign of its basePnl", async () => {
  await page.mount([pos("EURUSD", 12000), pos("USDJPY", -3400)]);
  expect(page.labelColorOf("pair-pnl-label-EURUSD")).toBe(THEME.accentPositive);
  expect(page.labelColorOf("pair-pnl-label-USDJPY")).toBe(THEME.accentNegative);
});

// The bar is now a transform, not a layout property: the previous version set
// `flex: fraction`, which animates layout — banned by docs/performance.md and
// impossible to run off the JS thread.
test("renders a bar per position, tinted by direction", async () => {
  await page.mount([pos("EURUSD", 12000), pos("USDJPY", -3400)]);
  expect(page.exists("pair-pnl-bar-pos")).toBeTruthy();
  expect(page.exists("pair-pnl-bar-neg")).toBeTruthy();
});

// A zero-P&L pair still occupies its row: the bar scales to 0 rather than the
// row disappearing, so the symbol and label stay readable.
test("a zero-P&L pair keeps its row, symbol and label", async () => {
  await page.mount([pos("EURGBP", 0)]);
  expect(page.exists("pair-pnl-row-EURGBP")).toBeTruthy();
  expect(page.hasText("EUR/GBP")).toBeTruthy();
  expect(page.hasText("+0")).toBeTruthy();
});

test("survives every pair being zero, where the max-abs guard divides by 1", async () => {
  await page.mount([pos("EURUSD", 0), pos("USDJPY", 0)]);
  expect(page.exists("pair-pnl-bars")).toBeTruthy();
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});

function pos(symbol: string, basePnl: number): CurrencyPairPosition {
  return { symbol, basePnl, baseTradedAmount: 0, counterTradedAmount: 0 };
}
