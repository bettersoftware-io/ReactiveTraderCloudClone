import * as common from "../scenarios/common";
import * as fxLiveRates from "../scenarios/fxLiveRates";
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";

test.describe("FX live rates", () => {
  withFxWorkspaceOpen();

  test("tile grid renders streaming prices", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.expectAtLeastNTilesVisible(ctx, 1);
  });

  test("each tile shows sell and buy buttons", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.expectFirstTileHasBuyAndSellButtons(ctx);
  });

  test("currency filter narrows visible tiles", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.recordVisibleTileCount(ctx, "all");
    await fxLiveRates.clickCurrencyFilter(ctx, "EUR");
    await fxLiveRates.expectVisibleTileCountAtMost(ctx, "all");
    await fxLiveRates.clickCurrencyFilter(ctx, "All");
    await fxLiveRates.expectVisibleTileCountEquals(ctx, "all");
  });

  test("view toggle switches between chart and price view", async ({ ctx }) => {
    await fxLiveRates.expectViewToggleVisible(ctx);
    await fxLiveRates.expectViewToggleShows(ctx, "Price");
    await fxLiveRates.clickViewToggle(ctx);
    await fxLiveRates.expectViewToggleShows(ctx, "Chart");
    await fxLiveRates.clickViewToggle(ctx);
    await fxLiveRates.expectViewToggleShows(ctx, "Price");
  });

  test("view preference persists across reloads", async ({ ctx }) => {
    await fxLiveRates.expectViewToggleVisible(ctx);
    await fxLiveRates.clickViewToggle(ctx);
    await fxLiveRates.expectViewToggleShows(ctx, "Chart");
    await common.reloadPage(ctx);
    await common.clickTab(ctx, "fx");
    await fxLiveRates.expectViewToggleShows(ctx, "Chart");
  });

  test("prices update over time", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.recordFirstTileText(ctx);
    await common.waitSeconds(ctx, 2);
    await fxLiveRates.expectFirstTileTextNonEmpty(ctx);
  });

  test("currency pairs list has at least 7 entries", async ({ ctx }) => {
    await fxLiveRates.expectAtLeastNTilesVisibleWithin(ctx, 7, 5);
  });

  test("first tile shows a numeric mid value", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.expectFirstTileTextMatches(ctx, /\d+\.\d+/);
  });
});
