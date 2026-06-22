import { Then, When } from "@cucumber/cucumber";

import * as common from "../scenarios/common";
import * as fxLiveRates from "../scenarios/fxLiveRates";
import type { StepContext } from "../testContext";

Then(
  "a price tile is visible within {int} seconds",
  function aPriceTileVisibleWithin(this: StepContext, seconds: number) {
    return fxLiveRates.expectFirstPriceTileVisibleWithin(this.ctx, seconds);
  },
);

Then(
  "there is at least {int} visible tile",
  function atLeastNTilesVisible(this: StepContext, n: number) {
    return fxLiveRates.expectAtLeastNTilesVisible(this.ctx, n);
  },
);

Then(
  "the first tile has visible sell and buy buttons",
  function firstTileHasBuyAndSellButtons(this: StepContext) {
    return fxLiveRates.expectFirstTileHasBuyAndSellButtons(this.ctx);
  },
);

When(
  "the trader records the visible tile count as {string}",
  function recordVisibleTileCount(this: StepContext, key: string) {
    return fxLiveRates.recordVisibleTileCount(this.ctx, key);
  },
);

When(
  "the trader clicks the {string} currency filter",
  function clickCurrencyFilter(this: StepContext, category: string) {
    return fxLiveRates.clickCurrencyFilter(this.ctx, category);
  },
);

Then(
  "the visible tile count is at most {string}",
  function expectVisibleTileCountAtMost(this: StepContext, key: string) {
    return fxLiveRates.expectVisibleTileCountAtMost(this.ctx, key);
  },
);

Then(
  "the visible tile count equals {string}",
  function expectVisibleTileCountEquals(this: StepContext, key: string) {
    return fxLiveRates.expectVisibleTileCountEquals(this.ctx, key);
  },
);

Then(
  "the view toggle button is visible",
  function expectViewToggleVisible(this: StepContext) {
    return fxLiveRates.expectViewToggleVisible(this.ctx);
  },
);

Then(
  "the view toggle button shows {string}",
  function expectViewToggleShows(this: StepContext, expected: string) {
    return fxLiveRates.expectViewToggleShows(this.ctx, expected);
  },
);

When(
  "the trader clicks the view toggle",
  function clickViewToggle(this: StepContext) {
    return fxLiveRates.clickViewToggle(this.ctx);
  },
);

When(
  "the trader records the first tile text",
  function recordFirstTileText(this: StepContext) {
    return fxLiveRates.recordFirstTileText(this.ctx);
  },
);

When(
  "the trader waits {int} seconds",
  function traderWaitsSeconds(this: StepContext, n: number) {
    return common.waitSeconds(this.ctx, n);
  },
);

Then(
  "the first tile text is non-empty",
  function expectFirstTileTextNonEmpty(this: StepContext) {
    return fxLiveRates.expectFirstTileTextNonEmpty(this.ctx);
  },
);

Then(
  "there are at least {int} visible tiles within {int} seconds",
  function atLeastNTilesVisibleWithin(this: StepContext, n: number, s: number) {
    return fxLiveRates.expectAtLeastNTilesVisibleWithin(this.ctx, n, s);
  },
);

Then(
  "the first tile text matches {}",
  function expectFirstTileTextMatches(
    this: StepContext,
    regexAsString: string,
  ) {
    const m = regexAsString.match(/^\/(.+)\/([a-z]*)$/);
    if (!m) throw new Error(`bad regex literal in: ${regexAsString}`);
    const [, pattern, flags] = m;
    return fxLiveRates.expectFirstTileTextMatches(
      this.ctx,
      new RegExp(pattern, flags),
    );
  },
);
