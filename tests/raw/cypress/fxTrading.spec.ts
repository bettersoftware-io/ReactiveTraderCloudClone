// tests/raw/cypress/fxTrading.spec.ts
import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as fxTrading from "../../scenarios/cypress/fxTrading";
import * as fxLiveRates from "../../scenarios/cypress/fxLiveRates";

describe("FX trading", () => {
  withFxWorkspaceOpen();

  it("execute a buy trade and see confirmation", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxTrading.expectTradeConfirmationWithin(ctx, 5);
    fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/Executing/i, /You Bought/i, /rejected/i",
    );
  });

  it("execute a sell trade and see confirmation", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickSellOnFirstTile(ctx);
    fxTrading.expectTradeConfirmationWithin(ctx, 5);
    fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/Executing/i, /You Sold/i, /rejected/i",
    );
  });

  it("trade confirmation is dismissible by clicking", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxTrading.expectTradeConfirmationWithin(ctx, 5);
    fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/You Bought/i, /You Sold/i, /rejected/i, /timed out/i, /Credit limit/i",
      10_000,
    );
    fxTrading.dismissTradeConfirmation(ctx);
    fxTrading.expectTradeConfirmationHidesWithin(ctx, 5);
  });

  it("executed trade appears in the blotter", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxLiveRates.waitSeconds(ctx, 2);
    fxTrading.expectBlotterVisible(ctx);
    fxTrading.expectBlotterHasAtLeastNRows(ctx, 1);
  });

  it("notional input accepts custom values", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.expectFirstTileNotionalInputVisible(ctx);
    fxTrading.setFirstTileNotional(ctx, "5000000");
  });

  it("executed trade carries the requested notional", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.setNotionalAndBuy(ctx, "1000000");
    fxTrading.expectBlotterContainsText(ctx, "1000000");
  });

  it("rejected trades occur with non-zero probability across multiple attempts", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnGbpjpy(ctx);
    fxTrading.expectAtLeastOneRejectionInBlotter(ctx);
  });
});
