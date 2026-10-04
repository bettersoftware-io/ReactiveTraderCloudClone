import { afterEach, beforeEach, describe, it } from "vitest";

import * as blotter from "../scenarios/_shared/blotter.ts";
import * as fx from "../scenarios/_shared/fxLiveRates.ts";
import * as trading from "../scenarios/_shared/fxTrading.ts";
import {
  buildWorld,
  teardownWorld,
  type VitestPlainPresenterWorld,
} from "./_world.ts";

describe("@presenter Feature: FX trade blotter", () => {
  beforeEach(() => {
    w = buildWorld();
  });
  afterEach(() => {
    teardownWorld(w);
  });

  it("rejected trade flow does not error after multiple buys", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.buyNTimesWithDismissals(w, 3);
    await blotter.expectBlotterVisible(w);
    await blotter.expectBlotterHasAtLeastNRows(w, 1);
  });

  it("blotter accumulates after multiple trades", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await trading.executeBuyOnFirstTile(w);
    await trading.executeBuyOnFirstTile(w);
    await w.waitSeconds(2);
    await blotter.expectBlotterHasAtLeastNRows(w, 2);
  });

  let w: VitestPlainPresenterWorld;
});
