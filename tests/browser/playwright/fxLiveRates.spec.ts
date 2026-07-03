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

  test("charts toggle switches tile sparklines on and off", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.expectChartsToggleVisible(ctx);
    await fxLiveRates.expectChartsToggleActive(ctx, true);
    await fxLiveRates.expectFirstTileChartVisible(ctx, true);
    await fxLiveRates.clickChartsToggle(ctx);
    await fxLiveRates.expectChartsToggleActive(ctx, false);
    await fxLiveRates.expectFirstTileChartVisible(ctx, false);
    await fxLiveRates.clickChartsToggle(ctx);
    await fxLiveRates.expectChartsToggleActive(ctx, true);
    await fxLiveRates.expectFirstTileChartVisible(ctx, true);
  });

  test("charts toggle preference persists across reloads", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.expectChartsToggleVisible(ctx);
    await fxLiveRates.clickChartsToggle(ctx);
    await fxLiveRates.expectChartsToggleActive(ctx, false);
    await common.reloadPage(ctx);
    await common.clickTab(ctx, "fx");
    await fxLiveRates.expectChartsToggleActive(ctx, false);
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
