import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { PairPnlBars } from "#/ui/analytics/PairPnlBars";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

const THEME: RnTheme = rnThemeTokens.holo.dark;

// The MOBILE prototype's per-pair format (dc.html L950) is the compact `fmtK`
// — one decimal and an uppercase K from a thousand up, always signed, with a
// U+2212 on losses. RN rendered the shared `formatPnlK` ("+12k"), which is the
// WEB design's whole-thousands shorthand and rounds a 12,400 pair to the same
// text as a 12,000 one.
test("renders one row per position with the prototype's compact signed label", async () => {
  await renderWithTheme(
    <PairPnlBars positions={[pos("EURUSD", 12000), pos("USDJPY", -3400)]} />,
  );
  expect(screen.getByTestId("pair-pnl-row-EURUSD")).toBeTruthy();
  expect(screen.getByTestId("pair-pnl-row-USDJPY")).toBeTruthy();
  expect(screen.getByText("EUR/USD")).toBeTruthy();
  expect(screen.getByText("+12.0K")).toBeTruthy();
});

test("a positive pair carries an explicit plus, matching the negative's minus", async () => {
  await renderWithTheme(
    <PairPnlBars positions={[pos("EURUSD", 9000), pos("USDJPY", -4000)]} />,
  );
  expect(screen.getByText("+9.0K")).toBeTruthy();
  expect(screen.getByText("−4.0K")).toBeTruthy();
});

// Below a thousand the compact form drops the suffix entirely and prints the
// whole figure — the prototype's third `fmtK` branch. The old `formatPnlK`
// rounded this same pair to "-1k", losing it.
test("sub-thousand pairs print whole, with no suffix", async () => {
  await renderWithTheme(<PairPnlBars positions={[pos("EURAUD", -600)]} />);
  expect(screen.getByText("−600")).toBeTruthy();
});

test("renders nothing but the container when there are no positions", async () => {
  await renderWithTheme(<PairPnlBars positions={[]} />);
  expect(screen.getByTestId("pair-pnl-bars")).toBeTruthy();
  expect(screen.queryByTestId("pair-pnl-row-EURUSD")).toBeNull();
});

test("colours a row's label by the sign of its basePnl", async () => {
  await renderWithTheme(
    <PairPnlBars positions={[pos("EURUSD", 12000), pos("USDJPY", -3400)]} />,
  );
  expect(screen.getByTestId("pair-pnl-label-EURUSD").props.style.color).toBe(
    THEME.accentPositive,
  );
  expect(screen.getByTestId("pair-pnl-label-USDJPY").props.style.color).toBe(
    THEME.accentNegative,
  );
});

// The bar is now a transform, not a layout property: the previous version set
// `flex: fraction`, which animates layout — banned by docs/performance.md and
// impossible to run off the JS thread.
test("renders a bar per position, tinted by direction", async () => {
  await renderWithTheme(
    <PairPnlBars positions={[pos("EURUSD", 12000), pos("USDJPY", -3400)]} />,
  );
  expect(screen.getByTestId("pair-pnl-bar-pos")).toBeTruthy();
  expect(screen.getByTestId("pair-pnl-bar-neg")).toBeTruthy();
});

// A zero-P&L pair still occupies its row: the bar scales to 0 rather than the
// row disappearing, so the symbol and label stay readable.
test("a zero-P&L pair keeps its row, symbol and label", async () => {
  await renderWithTheme(<PairPnlBars positions={[pos("EURGBP", 0)]} />);
  expect(screen.getByTestId("pair-pnl-row-EURGBP")).toBeTruthy();
  expect(screen.getByText("EUR/GBP")).toBeTruthy();
  expect(screen.getByText("+0")).toBeTruthy();
});

test("survives every pair being zero, where the max-abs guard divides by 1", async () => {
  await renderWithTheme(
    <PairPnlBars positions={[pos("EURUSD", 0), pos("USDJPY", 0)]} />,
  );
  expect(screen.getByTestId("pair-pnl-bars")).toBeTruthy();
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
