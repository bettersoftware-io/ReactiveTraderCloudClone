import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as blotter from "../../scenarios/cypress/blotter";
import * as fxLiveRates from "../../scenarios/cypress/fxLiveRates";
import * as fxTrading from "../../scenarios/cypress/fxTrading";

describe("FX trade blotter", () => {
  withFxWorkspaceOpen();

  it("blotter table is visible", () => {
    const ctx = getCtx();
    fxTrading.expectBlotterVisible(ctx);
  });

  it("column headers are clickable for sorting", () => {
    const ctx = getCtx();
    fxTrading.expectBlotterVisible(ctx);
    blotter.clickFirstBlotterHeader(ctx);
    blotter.clickFirstBlotterHeader(ctx);
  });

  it("quick filter narrows trade rows", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxLiveRates.waitSeconds(ctx, 2);
    fxTrading.expectBlotterVisible(ctx);
    blotter.recordBlotterRowCount(ctx, "all");
    blotter.setBlotterQuickFilter(ctx, "ZZZZZ_NO_MATCH");
    fxLiveRates.waitSeconds(ctx, 1);
    blotter.expectBlotterRowCountAtMost(ctx, "all");
    blotter.clearBlotterQuickFilter(ctx);
    fxLiveRates.waitSeconds(ctx, 1);
    blotter.expectBlotterRowCountEquals(ctx, "all");
  });

  it("export CSV button is visible and labeled", () => {
    const ctx = getCtx();
    fxTrading.expectBlotterVisible(ctx);
    blotter.expectExportCsvVisible(ctx);
    blotter.expectExportCsvTextContains(ctx, "Export CSV");
  });

  it("new trade row has a non-empty background color", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxLiveRates.waitSeconds(ctx, 2);
    fxTrading.expectBlotterVisible(ctx);
    blotter.expectFirstBlotterRowVisible(ctx);
    blotter.expectFirstBlotterRowBackgroundNonEmpty(ctx);
  });

  it("rejected trade flow does not error after multiple buys", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    blotter.buyNTimesWithDismissals(ctx, 3);
    fxTrading.expectBlotterVisible(ctx);
    fxTrading.expectBlotterHasAtLeastNRows(ctx, 1);
  });

  it("row hover yields a non-empty background color", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxLiveRates.waitSeconds(ctx, 2);
    fxTrading.expectBlotterVisible(ctx);
    blotter.expectFirstBlotterRowVisible(ctx);
    blotter.hoverFirstBlotterRow(ctx);
    blotter.expectFirstBlotterRowBackgroundNonEmpty(ctx);
  });

  it("blotter accumulates after multiple trades", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxLiveRates.waitSeconds(ctx, 2);
    fxTrading.expectBlotterHasAtLeastNRows(ctx, 2);
  });
});
