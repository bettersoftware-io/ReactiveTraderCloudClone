import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as fx from "../../scenarios/presenter/_shared/fxLiveRates";
import * as rfq from "../../scenarios/presenter/_shared/fxRfq";

describe("@presenter Feature: FX RFQ flow", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("large notional triggers an RFQ flow on the first tile", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await rfq.setFirstTileNotional(w, 10_000_000);
    await rfq.requestRfqQuoteOnFirstTile(w);
    await rfq.expectRfqQuoteArrivesWithin(w, 5);
  });
});
