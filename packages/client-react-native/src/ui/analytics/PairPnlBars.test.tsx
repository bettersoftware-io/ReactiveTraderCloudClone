import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { PairPnlBars } from "#/ui/analytics/PairPnlBars";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

const THEME: RnTheme = rnThemeTokens.holo.dark;

// The prototype's per-pair format (dc.html L1302) is whole-k with an EXPLICIT
// sign on both directions — `formatPnlK`, which both web clients already use.
// RN was on `formatWithScale`, which renders "12k" with no leading plus, so a
// positive and a negative pair were signed inconsistently.
test("renders one row per position with the prototype's signed whole-k label", async () => {
  await renderWithTheme(
    <PairPnlBars positions={[pos("EURUSD", 12000), pos("USDJPY", -3400)]} />,
  );
  expect(screen.getByTestId("pair-pnl-row-EURUSD")).toBeTruthy();
  expect(screen.getByTestId("pair-pnl-row-USDJPY")).toBeTruthy();
  expect(screen.getByText("EURUSD")).toBeTruthy();
  expect(screen.getByText("+12k")).toBeTruthy();
});

test("a positive pair carries an explicit plus, matching the negative's minus", async () => {
  await renderWithTheme(
    <PairPnlBars positions={[pos("EURUSD", 9000), pos("USDJPY", -4000)]} />,
  );
  expect(screen.getByText("+9k")).toBeTruthy();
  expect(screen.getByText("-4k")).toBeTruthy();
});

// `formatPnlK` rounds to whole thousands, so a sub-thousand pair reports as
// "+1k" or "-1k" rather than its exact figure. That is the prototype's format,
// not a rounding bug — pinned so it is not "corrected" later.
test("sub-thousand pairs round to whole thousands, as the prototype does", async () => {
  await renderWithTheme(<PairPnlBars positions={[pos("EURAUD", -600)]} />);
  expect(screen.getByText("-1k")).toBeTruthy();
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
  expect(screen.getByText("EURGBP")).toBeTruthy();
  expect(screen.getByText("+0k")).toBeTruthy();
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
