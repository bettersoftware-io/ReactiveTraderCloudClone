import { afterEach, beforeEach, describe, it } from "vitest";
import * as fx from "../scenarios/_shared/fxLiveRates";
import * as rfq from "../scenarios/_shared/fxRfq";
import {
  buildWorld,
  teardownWorld,
  type VitestPlainPresenterWorld,
} from "./_world";

describe("@presenter Feature: FX RFQ flow", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => {
    w = buildWorld();
  });
  afterEach(() => {
    teardownWorld(w);
  });

  it("large notional triggers an RFQ flow on the first tile", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await rfq.setFirstTileNotional(w, 10_000_000);
    await rfq.requestRfqQuoteOnFirstTile(w);
    await rfq.expectRfqQuoteArrivesWithin(w, 5);
  });
});
