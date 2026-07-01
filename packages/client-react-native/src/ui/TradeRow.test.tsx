import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { TradeRow } from "#/ui/TradeRow";

const DONE_TRADE: Trade = {
  tradeId: 42,
  tradeName: "Trade 42",
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.53818,
  status: TradeStatus.Done,
  tradeDate: "2026-07-01",
  valueDate: "2026-07-03",
};

test("renders pair, direction, notional, rate and status", async () => {
  await render(<TradeRow trade={DONE_TRADE} />);
  expect(screen.getByText("EURUSD")).toBeTruthy();
  expect(screen.getByText("Buy")).toBeTruthy();
  expect(screen.getByText("1,000,000")).toBeTruthy();
  expect(screen.getByText("1.53818")).toBeTruthy();
  expect(screen.getByText("Done")).toBeTruthy();
});
