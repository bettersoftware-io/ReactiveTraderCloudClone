import { expect, jest, test } from "@jest/globals";

import type { CurrencyPair, Price } from "@rtc/domain";
import { Direction, PriceMovementType } from "@rtc/domain";

import { buySellPadsPage } from "#tests/pages/BuySellPadsPage";

const page = buySellPadsPage();

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
  await page.mount(pair, price, onExecute);

  await page.press("sell-pad");
  expect(onExecute).toHaveBeenCalledWith(Direction.Sell);

  await page.press("buy-pad");
  expect(onExecute).toHaveBeenCalledWith(Direction.Buy);

  expect(page.hasText("1.4")).toBeTruthy(); // spread pill
  await page.unmountAll();
});
