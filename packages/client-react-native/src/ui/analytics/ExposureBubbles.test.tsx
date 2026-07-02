import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { processColor } from "react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { ExposureBubbles } from "#/ui/analytics/ExposureBubbles";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

const THEME: RnTheme = rnThemeTokens.holo.dark;

// EURUSD contributes to EUR (base) and USD (counter); USDJPY to USD and JPY.
const POSITIONS: readonly CurrencyPairPosition[] = [
  {
    symbol: "EURUSD",
    basePnl: 0,
    baseTradedAmount: 1_000_000,
    counterTradedAmount: -1_100_000,
  },
  {
    symbol: "USDJPY",
    basePnl: 0,
    baseTradedAmount: 500_000,
    counterTradedAmount: -55_000_000,
  },
];

test("renders one bubble per aggregated currency", async () => {
  await renderWithTheme(<ExposureBubbles positions={POSITIONS} />);
  // EUR, USD, JPY -> three currencies with non-zero net traded amounts.
  expect(screen.getByTestId("exposure-bubble-EUR")).toBeTruthy();
  expect(screen.getByTestId("exposure-bubble-USD")).toBeTruthy();
  expect(screen.getByTestId("exposure-bubble-JPY")).toBeTruthy();
});

test("renders an empty svg when there are no positions", async () => {
  await renderWithTheme(<ExposureBubbles positions={[]} />);
  expect(screen.getByTestId("exposure-bubbles")).toBeTruthy();
  expect(screen.queryByTestId("exposure-bubble-EUR")).toBeNull();
});

test("colours a bubble by the aggregated sign of its net exposure", async () => {
  // Net traded amounts for POSITIONS: EUR = +1,000,000 (pos), USD = -600,000
  // (neg), JPY = -55,000,000 (neg) — see aggregatePositionsByCurrency. The
  // native SVG host node reports `fill` as a processed colour object, so
  // compare its payload against the theme's accent tokens run through
  // react-native's own colour processing rather than the raw hex.
  await renderWithTheme(<ExposureBubbles positions={POSITIONS} />, THEME);
  expect(screen.getByTestId("exposure-bubble-EUR").props.fill).toEqual(
    expect.objectContaining({ payload: processColor(THEME.accentPositive) }),
  );
  expect(screen.getByTestId("exposure-bubble-USD").props.fill).toEqual(
    expect.objectContaining({ payload: processColor(THEME.accentNegative) }),
  );
});
