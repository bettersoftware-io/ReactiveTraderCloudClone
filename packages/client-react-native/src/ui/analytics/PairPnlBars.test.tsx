import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { NEGATIVE, POSITIVE } from "#/ui/analytics/colours";
import { PairPnlBars } from "#/ui/analytics/PairPnlBars";

test("renders one row per position with a scaled label", async () => {
  await render(
    <PairPnlBars positions={[pos("EURUSD", 12000), pos("USDJPY", -3400)]} />,
  );
  expect(screen.getByTestId("pair-pnl-row-EURUSD")).toBeTruthy();
  expect(screen.getByTestId("pair-pnl-row-USDJPY")).toBeTruthy();
  expect(screen.getByText("EURUSD")).toBeTruthy();
  expect(screen.getByText("12k")).toBeTruthy();
});

test("renders nothing but the container when there are no positions", async () => {
  await render(<PairPnlBars positions={[]} />);
  expect(screen.getByTestId("pair-pnl-bars")).toBeTruthy();
  expect(screen.queryByTestId("pair-pnl-row-EURUSD")).toBeNull();
});

test("colours a row's label by the sign of its basePnl", async () => {
  await render(
    <PairPnlBars positions={[pos("EURUSD", 12000), pos("USDJPY", -3400)]} />,
  );
  expect(screen.getByTestId("pair-pnl-label-EURUSD").props.style.color).toBe(
    POSITIVE,
  );
  expect(screen.getByTestId("pair-pnl-label-USDJPY").props.style.color).toBe(
    NEGATIVE,
  );
});

function pos(symbol: string, basePnl: number): CurrencyPairPosition {
  return { symbol, basePnl, baseTradedAmount: 0, counterTradedAmount: 0 };
}
