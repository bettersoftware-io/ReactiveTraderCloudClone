import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../../support/testContext";
import * as fxLiveRates from "../../scenarios/fxLiveRates";

Then("a price tile is visible within {int} seconds",
  function(this: StepContext, seconds: number) {
    return fxLiveRates.expectFirstPriceTileVisibleWithin(this.ctx, seconds);
  });

Then("there is at least {int} visible tile",
  function(this: StepContext, n: number) {
    return fxLiveRates.expectAtLeastNTilesVisible(this.ctx, n);
  });

Then("the first tile has visible sell and buy buttons",
  function(this: StepContext) { return fxLiveRates.expectFirstTileHasBuyAndSellButtons(this.ctx); });

When("the trader records the visible tile count as {string}",
  function(this: StepContext, key: string) {
    return fxLiveRates.recordVisibleTileCount(this.ctx, key);
  });

When("the trader clicks the {string} currency filter",
  function(this: StepContext, category: string) {
    return fxLiveRates.clickCurrencyFilter(this.ctx, category);
  });

Then("the visible tile count is at most {string}",
  function(this: StepContext, key: string) {
    return fxLiveRates.expectVisibleTileCountAtMost(this.ctx, key);
  });

Then("the visible tile count equals {string}",
  function(this: StepContext, key: string) {
    return fxLiveRates.expectVisibleTileCountEquals(this.ctx, key);
  });

Then("the view toggle button is visible",
  function(this: StepContext) { return fxLiveRates.expectViewToggleVisible(this.ctx); });

Then("the view toggle button shows {string}",
  function(this: StepContext, expected: string) {
    return fxLiveRates.expectViewToggleShows(this.ctx, expected);
  });

When("the trader clicks the view toggle",
  function(this: StepContext) { return fxLiveRates.clickViewToggle(this.ctx); });

When("the trader records the first tile text",
  function(this: StepContext) { return fxLiveRates.recordFirstTileText(this.ctx); });

When("the trader waits {int} seconds",
  function(this: StepContext, n: number) { return fxLiveRates.waitSeconds(this.ctx, n); });

Then("the first tile text is non-empty",
  function(this: StepContext) { return fxLiveRates.expectFirstTileTextNonEmpty(this.ctx); });
