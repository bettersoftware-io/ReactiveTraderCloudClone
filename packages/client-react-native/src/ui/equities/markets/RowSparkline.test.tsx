import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { Candle } from "@rtc/domain";

import { RowSparkline } from "#/ui/equities/markets/RowSparkline";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("draws a path once there are at least two closes", async () => {
  await renderWithTheme(
    <RowSparkline symbol="TSLA" positive candles={candles([1, 2, 3])} />,
  );
  expect(screen.getByTestId("eq-sparkline-TSLA")).toBeTruthy();
});

test("renders nothing when there is not enough history to draw", async () => {
  await renderWithTheme(
    <RowSparkline symbol="TSLA" positive candles={candles([1])} />,
  );
  expect(screen.queryByTestId("eq-sparkline-TSLA")).toBeNull();
});

function candles(closes: number[]): readonly Candle[] {
  return closes.map((close, i) => {
    return {
      time: i,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
    };
  });
}
