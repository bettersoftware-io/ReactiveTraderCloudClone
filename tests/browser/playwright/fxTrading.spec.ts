import * as common from "../scenarios/common";
import * as fxLiveRates from "../scenarios/fxLiveRates";
import * as fxTrading from "../scenarios/fxTrading";
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";

test.describe("FX trading", () => {
  withFxWorkspaceOpen();

  test("execute a buy trade and see confirmation", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await fxTrading.expectTradeConfirmationWithin(ctx, 5);
    await fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/Executing/i, /You Bought/i, /rejected/i",
    );
  });

  test("execute a sell trade and see confirmation", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickSellOnFirstTile(ctx);
    await fxTrading.expectTradeConfirmationWithin(ctx, 5);
    await fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/Executing/i, /You Sold/i, /rejected/i",
    );
  });

  test("trade confirmation is dismissible by clicking", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await fxTrading.expectTradeConfirmationWithin(ctx, 5);
    await fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/You Bought/i, /You Sold/i, /rejected/i, /timed out/i, /Credit limit/i",
      10_000,
    );
    await fxTrading.dismissTradeConfirmation(ctx);
    await fxTrading.expectTradeConfirmationHidesWithin(ctx, 5);
  });

  test("executed trade appears in the blotter", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await common.waitSeconds(ctx, 2);
    await fxTrading.expectBlotterVisible(ctx);
    await fxTrading.expectBlotterHasAtLeastNRows(ctx, 1);
  });

  test("notional input accepts custom values", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.expectFirstTileNotionalInputVisible(ctx);
    await fxTrading.setFirstTileNotional(ctx, "5000000");
  });

  test("executed trade carries the requested notional", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.setNotionalAndBuy(ctx, "1000000");
    await fxTrading.expectBlotterContainsText(ctx, "1000000");
  });

  test("rejected trades occur with non-zero probability across multiple attempts", async ({
    ctx,
  }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnGbpjpy(ctx);
    await fxTrading.expectAtLeastOneRejectionInBlotter(ctx);
  });
});
