import * as fxLiveRates from "../scenarios/fxLiveRates.ts";
import * as fxRfq from "../scenarios/fxRfq.ts";
import * as fxTrading from "../scenarios/fxTrading.ts";
import { test } from "./_context.ts";
import { withFxWorkspaceOpen } from "./_openWorkspace.ts";

test.describe("FX RFQ flow", () => {
  withFxWorkspaceOpen();

  test("entering large notional triggers RFQ mode on the tile", async ({
    ctx,
  }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.setFirstTileNotional(ctx, "10000000");
    await fxRfq.expectRfqInitiationButtonWithin(ctx, 3);
  });

  test("RFQ can be initiated and shows countdown", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.setFirstTileNotional(ctx, "10000000");
    await fxRfq.expectRfqInitiationButtonWithin(ctx, 3);
    await fxRfq.clickRfqInitiationButton(ctx);
    await fxRfq.expectCountdownOrQuoteWithin(ctx, 5);
  });

  test("large notional triggers an RFQ flow on the first tile", async ({
    ctx,
  }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.setFirstTileNotional(ctx, "10000000");
    await fxRfq.expectRfqInitiationButtonWithin(ctx, 3);
    await fxRfq.clickRfqInitiationButton(ctx);
    await fxRfq.expectCountdownOrQuoteWithin(ctx, 5);
  });
});
