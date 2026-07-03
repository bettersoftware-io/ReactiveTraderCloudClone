// tests/browser/cypress/fxLiveRates.spec.ts
import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as common from "./scenarios/common";
import * as fxLiveRates from "./scenarios/fxLiveRates";

describe("FX live rates", () => {
  withFxWorkspaceOpen();

  it("tile grid renders streaming prices", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.expectAtLeastNTilesVisible(ctx, 1);
  });

  it("each tile shows sell and buy buttons", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.expectFirstTileHasBuyAndSellButtons(ctx);
  });

  it("currency filter narrows visible tiles", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.recordVisibleTileCount(ctx, "all");
    fxLiveRates.clickCurrencyFilter(ctx, "EUR");
    fxLiveRates.expectVisibleTileCountAtMost(ctx, "all");
    fxLiveRates.clickCurrencyFilter(ctx, "All");
    fxLiveRates.expectVisibleTileCountEquals(ctx, "all");
  });

  it("charts toggle switches tile sparklines on and off", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.expectChartsToggleVisible(ctx);
    fxLiveRates.expectChartsToggleActive(ctx, true);
    fxLiveRates.expectFirstTileChartVisible(ctx, true);
    fxLiveRates.clickChartsToggle(ctx);
    fxLiveRates.expectChartsToggleActive(ctx, false);
    fxLiveRates.expectFirstTileChartVisible(ctx, false);
    fxLiveRates.clickChartsToggle(ctx);
    fxLiveRates.expectChartsToggleActive(ctx, true);
    fxLiveRates.expectFirstTileChartVisible(ctx, true);
  });

  it("charts toggle preference persists across reloads", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.expectChartsToggleVisible(ctx);
    fxLiveRates.clickChartsToggle(ctx);
    fxLiveRates.expectChartsToggleActive(ctx, false);
    common.reloadPage(ctx);
    common.clickTab(ctx, "fx");
    fxLiveRates.expectChartsToggleActive(ctx, false);
  });

  it("prices update over time", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.recordFirstTileText(ctx);
    common.waitSeconds(ctx, 2);
    fxLiveRates.expectFirstTileTextNonEmpty(ctx);
  });

  it("currency pairs list has at least 7 entries", () => {
    const ctx = getCtx();
    fxLiveRates.expectAtLeastNTilesVisibleWithin(ctx, 7, 5);
  });

  it("first tile shows a numeric mid value", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.expectFirstTileTextMatches(ctx, /\d+\.\d+/);
  });
});
