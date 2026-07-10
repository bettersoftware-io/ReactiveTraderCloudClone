// tests/presenter/steps/fxLiveRates.steps.ts
import { Then, When } from "@cucumber/cucumber";

import type { PresenterWorld } from "../cucumber/world";
import * as fx from "../scenarios/_shared/fxLiveRates";

Then(
  "a price tile is visible within {int} seconds",
  function priceTileVisibleWithin(this: PresenterWorld, n: number) {
    return fx.expectPriceTileVisibleWithin(this, n);
  },
);

Then(
  "a price tile is visible",
  function priceTileVisible(this: PresenterWorld) {
    return fx.expectPriceTileVisibleWithin(this, 5);
  },
);

Then(
  "there is at least 1 visible tile",
  function atLeastOneVisibleTile(this: PresenterWorld) {
    return fx.expectAtLeastNVisibleTilesWithin(this, 1, 5);
  },
);

Then(
  "there are at least {int} visible tiles within {int} seconds",
  function atLeastNVisibleTilesWithin(
    this: PresenterWorld,
    n: number,
    s: number,
  ) {
    return fx.expectAtLeastNVisibleTilesWithin(this, n, s);
  },
);

When(
  "the trader records the first tile text",
  function recordFirstTileText(this: PresenterWorld) {
    return fx.recordFirstTileText(this);
  },
);

Then(
  "the first tile text is non-empty",
  function firstTileTextNonEmpty(this: PresenterWorld) {
    return fx.expectFirstTileTextNonEmpty(this);
  },
);

Then(
  "the first tile text matches {}",
  function firstTileTextMatches(this: PresenterWorld, regexAsString: string) {
    const m = regexAsString.match(/^\/(.+)\/([a-z]*)$/);

    if (!m) {
      throw new Error(`bad regex literal in: ${regexAsString}`);
    }

    const [, pattern, flags] = m;
    return fx.expectFirstTileTextMatches(this, new RegExp(pattern, flags));
  },
);
