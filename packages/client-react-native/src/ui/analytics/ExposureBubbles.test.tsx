import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { ExposureBubbles } from "#/ui/analytics/ExposureBubbles";

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
  await render(<ExposureBubbles positions={POSITIONS} />);
  // EUR, USD, JPY -> three currencies with non-zero net traded amounts.
  expect(screen.getByTestId("exposure-bubble-EUR")).toBeTruthy();
  expect(screen.getByTestId("exposure-bubble-USD")).toBeTruthy();
  expect(screen.getByTestId("exposure-bubble-JPY")).toBeTruthy();
});

test("renders an empty svg when there are no positions", async () => {
  await render(<ExposureBubbles positions={[]} />);
  expect(screen.getByTestId("exposure-bubbles")).toBeTruthy();
  expect(screen.queryByTestId("exposure-bubble-EUR")).toBeNull();
});
