import * as blotter from "../scenarios/blotter";
import * as common from "../scenarios/common";
import * as fxLiveRates from "../scenarios/fxLiveRates";
import * as fxTrading from "../scenarios/fxTrading";
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";

test.describe("FX trade blotter", () => {
  withFxWorkspaceOpen();

  test("blotter table is visible", async ({ ctx }) => {
    await fxTrading.expectBlotterVisible(ctx);
  });

  test("column headers are clickable for sorting", async ({ ctx }) => {
    await fxTrading.expectBlotterVisible(ctx);
    await blotter.clickFirstBlotterHeader(ctx);
    await blotter.clickFirstBlotterHeader(ctx);
  });

  test("quick filter narrows trade rows", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await common.waitSeconds(ctx, 2);
    await fxTrading.expectBlotterVisible(ctx);
    await blotter.recordBlotterRowCount(ctx, "all");
    await blotter.setBlotterQuickFilter(ctx, "ZZZZZ_NO_MATCH");
    await common.waitSeconds(ctx, 1);
    await blotter.expectBlotterRowCountAtMost(ctx, "all");
    await blotter.clearBlotterQuickFilter(ctx);
    await common.waitSeconds(ctx, 1);
    await blotter.expectBlotterRowCountEquals(ctx, "all");
  });

  test("export CSV button is visible and labeled", async ({ ctx }) => {
    await fxTrading.expectBlotterVisible(ctx);
    await blotter.expectExportCsvVisible(ctx);
    await blotter.expectExportCsvTextContains(ctx, "CSV");
  });

  test("new trade row has a non-empty background color", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await common.waitSeconds(ctx, 2);
    await fxTrading.expectBlotterVisible(ctx);
    await blotter.expectFirstBlotterRowVisible(ctx);
    await blotter.expectFirstBlotterRowBackgroundNonEmpty(ctx);
  });

  test("rejected trade flow does not error after multiple buys", async ({
    ctx,
  }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await blotter.buyNTimesWithDismissals(ctx, 3);
    await fxTrading.expectBlotterVisible(ctx);
    await fxTrading.expectBlotterHasAtLeastNRows(ctx, 1);
  });

  test("row hover yields a non-empty background color", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await common.waitSeconds(ctx, 2);
    await fxTrading.expectBlotterVisible(ctx);
    await blotter.expectFirstBlotterRowVisible(ctx);
    await blotter.hoverFirstBlotterRow(ctx);
    await blotter.expectFirstBlotterRowBackgroundNonEmpty(ctx);
  });

  test("blotter accumulates after multiple trades", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await common.waitSeconds(ctx, 2);
    await fxTrading.expectBlotterHasAtLeastNRows(ctx, 2);
  });
});
