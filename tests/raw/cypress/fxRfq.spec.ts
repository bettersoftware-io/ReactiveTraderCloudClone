// tests/raw/cypress/fxRfq.spec.ts
import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as fxRfq from "../../scenarios/cypress/fxRfq";
import * as fxTrading from "../../scenarios/cypress/fxTrading";
import * as fxLiveRates from "../../scenarios/cypress/fxLiveRates";

describe("FX RFQ flow", () => {
  withFxWorkspaceOpen();

  it("entering large notional triggers RFQ mode on the tile", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.setFirstTileNotional(ctx, "10000000");
    fxRfq.expectRfqInitiationButtonWithin(ctx, 3);
  });

  it("RFQ can be initiated and shows countdown", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.setFirstTileNotional(ctx, "10000000");
    fxRfq.expectRfqInitiationButtonWithin(ctx, 3);
    fxRfq.clickRfqInitiationButton(ctx);
    fxRfq.expectCountdownOrQuoteWithin(ctx, 5);
  });

  it("large notional triggers an RFQ flow on the first tile", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.setFirstTileNotional(ctx, "10000000");
    fxRfq.expectCountdownOrQuoteWithin(ctx, 5);
  });
});
