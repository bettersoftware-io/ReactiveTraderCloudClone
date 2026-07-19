import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { CurrencyPair, Price } from "@rtc/domain";
import { Direction, PriceMovementType } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { BuySellPads } from "./BuySellPads";

const pair: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
  baseMid: 1.08,
  typicalSpreadPips: 1,
};

const price: Price = {
  symbol: "EURUSD",
  bid: 1.08716,
  ask: 1.0873,
  mid: 1.08723,
  spread: "1.4",
  movementType: PriceMovementType.UP,
  valueDate: "",
  creationTimestamp: 0,
};

test("SELL uses bid → Sell, BUY uses ask → Buy", async () => {
  const onExecute = jest.fn();
  await renderWithTheme(
    <BuySellPads pair={pair} price={price} onExecute={onExecute} />,
  );

  await fireEvent.press(screen.getByTestId("sell-pad"));
  expect(onExecute).toHaveBeenCalledWith(Direction.Sell);

  await fireEvent.press(screen.getByTestId("buy-pad"));
  expect(onExecute).toHaveBeenCalledWith(Direction.Buy);

  expect(screen.getByText("1.4")).toBeTruthy(); // spread pill
});
