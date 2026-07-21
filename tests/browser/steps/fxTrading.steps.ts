import { Then, When } from "@cucumber/cucumber";

import * as fxTrading from "../scenarios/fxTrading";
import type { StepContext } from "../testContext";

When(
  "the trader clicks buy on the first tile",
  function clickBuyOnFirstTile(this: StepContext) {
    return fxTrading.clickBuyOnFirstTile(this.ctx);
  },
);

When(
  "the trader clicks sell on the first tile",
  function clickSellOnFirstTile(this: StepContext) {
    return fxTrading.clickSellOnFirstTile(this.ctx);
  },
);

Then(
  "the trade confirmation appears within {int} seconds",
  function expectTradeConfirmationWithin(this: StepContext, seconds: number) {
    return fxTrading.expectTradeConfirmationWithin(this.ctx, seconds);
  },
);

Then(
  // `[^/]*` (not `.*`) keeps each /…/ token bounded by its delimiters — linear
  // matching, no catastrophic backtracking (CodeQL js/redos). Regex literals in
  // the .feature steps never contain an inner `/`, so this preserves behaviour.
  /^the trade confirmation matches one of (\/[^/]*\/[gimsuy]?(?:,\s*\/[^/]*\/[gimsuy]?)*)$/,
  function expectTradeConfirmationMatchesOneOfRegex(
    this: StepContext,
    raw: string,
  ) {
    return fxTrading.expectTradeConfirmationMatchesOneOf(this.ctx, raw);
  },
);

Then(
  "the trade confirmation matches one of {} within {int} seconds",
  function expectTradeConfirmationMatchesOneOfWithin(
    this: StepContext,
    raw: string,
    seconds: number,
  ) {
    return fxTrading.expectTradeConfirmationMatchesOneOf(
      this.ctx,
      raw,
      seconds * 1_000,
    );
  },
);

When(
  "the trader dismisses the trade confirmation",
  function dismissTradeConfirmation(this: StepContext) {
    return fxTrading.dismissTradeConfirmation(this.ctx);
  },
);

Then(
  "the trade confirmation hides within {int} seconds",
  function expectTradeConfirmationHidesWithin(
    this: StepContext,
    seconds: number,
  ) {
    return fxTrading.expectTradeConfirmationHidesWithin(this.ctx, seconds);
  },
);

Then(
  "the blotter table is visible",
  function expectBlotterVisible(this: StepContext) {
    return fxTrading.expectBlotterVisible(this.ctx);
  },
);

Then(
  "the blotter has at least {int} row",
  function expectBlotterHasAtLeastNRow(this: StepContext, n: number) {
    return fxTrading.expectBlotterHasAtLeastNRows(this.ctx, n);
  },
);

Then(
  "the blotter has at least {int} rows",
  function expectBlotterHasAtLeastNRows(this: StepContext, n: number) {
    return fxTrading.expectBlotterHasAtLeastNRows(this.ctx, n);
  },
);

Then(
  "the notional input on the first tile is visible",
  function expectFirstTileNotionalInputVisible(this: StepContext) {
    return fxTrading.expectFirstTileNotionalInputVisible(this.ctx);
  },
);

When(
  "the trader sets the first tile notional to {string}",
  function setFirstTileNotional(this: StepContext, value: string) {
    return fxTrading.setFirstTileNotional(this.ctx, value);
  },
);

When(
  "the trader executes a buy for {string} on the first tile",
  function setNotionalAndBuy(this: StepContext, notional: string) {
    return fxTrading.setNotionalAndBuy(this.ctx, notional);
  },
);

Then(
  "the executed trade carries notional {string}",
  function expectExecutedTradeCarriesNotional(
    this: StepContext,
    value: string,
  ) {
    return fxTrading.expectBlotterContainsText(this.ctx, value);
  },
);

Then(
  "at least one trade was rejected",
  function expectAtLeastOneRejection(this: StepContext) {
    return fxTrading.expectAtLeastOneRejectionInBlotter(this.ctx);
  },
);
