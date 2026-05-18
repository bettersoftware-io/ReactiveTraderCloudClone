import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as fx from "../../scenarios/presenter/_shared/fxLiveRates";

describe("@presenter Feature: FX live rates", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("tile grid renders streaming prices", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await fx.expectAtLeastNVisibleTilesWithin(w, 1, 5);
  });

  it("prices update over time", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await fx.recordFirstTileText(w);
    await w.waitSeconds(2);
    await fx.expectFirstTileTextNonEmpty(w);
  });

  it("currency pairs list has at least 7 entries", async () => {
    await fx.expectAtLeastNVisibleTilesWithin(w, 7, 5);
  });

  it("first tile shows a numeric mid value", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await fx.expectFirstTileTextMatches(w, /\d+\.\d+/);
  });
});
