import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { PairPnlBars } from "#/ui/analytics/PairPnlBars";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

const THEME: RnTheme = rnThemeTokens.holo.dark;

test("renders one row per position with a scaled label", async () => {
  await renderWithTheme(
    <PairPnlBars positions={[pos("EURUSD", 12000), pos("USDJPY", -3400)]} />,
  );
  expect(screen.getByTestId("pair-pnl-row-EURUSD")).toBeTruthy();
  expect(screen.getByTestId("pair-pnl-row-USDJPY")).toBeTruthy();
  expect(screen.getByText("EURUSD")).toBeTruthy();
  expect(screen.getByText("12k")).toBeTruthy();
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

function pos(symbol: string, basePnl: number): CurrencyPairPosition {
  return { symbol, basePnl, baseTradedAmount: 0, counterTradedAmount: 0 };
}
