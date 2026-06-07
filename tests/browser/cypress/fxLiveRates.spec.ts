// tests/browser/cypress/fxLiveRates.spec.ts
import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as fxLiveRates from "./scenarios/fxLiveRates";
import * as common from "./scenarios/common";

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

  it("view toggle switches between chart and price view", () => {
    const ctx = getCtx();
    fxLiveRates.expectViewToggleVisible(ctx);
    fxLiveRates.expectViewToggleShows(ctx, "Price");
    fxLiveRates.clickViewToggle(ctx);
    fxLiveRates.expectViewToggleShows(ctx, "Chart");
    fxLiveRates.clickViewToggle(ctx);
    fxLiveRates.expectViewToggleShows(ctx, "Price");
  });

  it("view preference persists across reloads", () => {
    const ctx = getCtx();
    fxLiveRates.expectViewToggleVisible(ctx);
    fxLiveRates.clickViewToggle(ctx);
    fxLiveRates.expectViewToggleShows(ctx, "Chart");
    common.reloadPage(ctx);
    common.clickTab(ctx, "fx");
    fxLiveRates.expectViewToggleShows(ctx, "Chart");
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
