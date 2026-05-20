import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../support/testContext";
import * as fxTrading from "../scenarios/fxTrading";

When("the trader clicks buy on the first tile",
  function(this: StepContext) { return fxTrading.clickBuyOnFirstTile(this.ctx); });

When("the trader clicks sell on the first tile",
  function(this: StepContext) { return fxTrading.clickSellOnFirstTile(this.ctx); });

Then("the trade confirmation appears within {int} seconds",
  function(this: StepContext, seconds: number) {
    return fxTrading.expectTradeConfirmationWithin(this.ctx, seconds);
  });

Then(
  /^the trade confirmation matches one of (\/.*\/[gimsuy]?(?:,\s*\/.*\/[gimsuy]?)*)$/,
  function(this: StepContext, raw: string) {
    return fxTrading.expectTradeConfirmationMatchesOneOf(this.ctx, raw);
  },
);

Then("the trade confirmation matches one of {} within {int} seconds",
  function(this: StepContext, raw: string, seconds: number) {
    return fxTrading.expectTradeConfirmationMatchesOneOf(this.ctx, raw, seconds * 1_000);
  });

When("the trader dismisses the trade confirmation",
  function(this: StepContext) { return fxTrading.dismissTradeConfirmation(this.ctx); });

Then("the trade confirmation hides within {int} seconds",
  function(this: StepContext, seconds: number) {
    return fxTrading.expectTradeConfirmationHidesWithin(this.ctx, seconds);
  });

Then("the blotter table is visible",
  function(this: StepContext) { return fxTrading.expectBlotterVisible(this.ctx); });

Then("the blotter has at least {int} row",
  function(this: StepContext, n: number) {
    return fxTrading.expectBlotterHasAtLeastNRows(this.ctx, n);
  });

Then("the blotter has at least {int} rows",
  function(this: StepContext, n: number) {
    return fxTrading.expectBlotterHasAtLeastNRows(this.ctx, n);
  });

Then("the notional input on the first tile is visible",
  function(this: StepContext) { return fxTrading.expectFirstTileNotionalInputVisible(this.ctx); });

When("the trader sets the first tile notional to {string}",
  function(this: StepContext, value: string) {
    return fxTrading.setFirstTileNotional(this.ctx, value);
  });

When("the trader executes a buy for {string} on the first tile",
  function(this: StepContext, notional: string) {
    return fxTrading.setNotionalAndBuy(this.ctx, notional);
  });

Then("the executed trade carries notional {string}",
  function(this: StepContext, value: string) {
    return fxTrading.expectBlotterContainsText(this.ctx, value);
  });

Then("at least one trade was rejected",
  function(this: StepContext) {
    return fxTrading.expectAtLeastOneRejectionInBlotter(this.ctx);
  });
