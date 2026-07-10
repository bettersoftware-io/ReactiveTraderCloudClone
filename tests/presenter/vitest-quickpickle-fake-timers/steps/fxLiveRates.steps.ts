// tests/presenter/vitest-quickpickle-fake-timers/steps/fxLiveRates.steps.ts
import { Then, When } from "quickpickle";

import * as fx from "#/presenter/scenarios/_shared/fxLiveRates";

import type { VitestFakePresenterWorld } from "../world";

Then(
  "a price tile is visible within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => {
    return fx.expectPriceTileVisibleWithin(state, n);
  },
);

Then("a price tile is visible", async (state: VitestFakePresenterWorld) => {
  return fx.expectPriceTileVisibleWithin(state, 5);
});

Then(
  "there is at least 1 visible tile",
  async (state: VitestFakePresenterWorld) => {
    return fx.expectAtLeastNVisibleTilesWithin(state, 1, 5);
  },
);

Then(
  "there are at least {int} visible tiles within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number, s: number) => {
    return fx.expectAtLeastNVisibleTilesWithin(state, n, s);
  },
);

When(
  "the trader records the first tile text",
  async (state: VitestFakePresenterWorld) => {
    return fx.recordFirstTileText(state);
  },
);

Then(
  "the first tile text is non-empty",
  async (state: VitestFakePresenterWorld) => {
    return fx.expectFirstTileTextNonEmpty(state);
  },
);

Then(
  "the first tile text matches {}",
  async (state: VitestFakePresenterWorld, regexAsString: string) => {
    const m = regexAsString.match(/^\/(.+)\/([a-z]*)$/);

    if (!m) {
      throw new Error(`bad regex literal in: ${regexAsString}`);
    }

    const [, pattern, flags] = m;
    return fx.expectFirstTileTextMatches(state, new RegExp(pattern, flags));
  },
);
