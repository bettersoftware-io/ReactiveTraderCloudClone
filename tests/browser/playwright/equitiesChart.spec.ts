// The lifecycles jsdom can't witness (see CandleChartPage/useChartGestures'
// unit coverage for the rest of the gesture contract): panning away from the
// live edge freezes the visible time window while real wall-clock ticks keep
// arriving in the background, and clicking BACK TO LIVE resumes following;
// plus an indicator pane's live RSI/MACD readout, which only updates from a
// REAL pointermove (jsdom can't dispatch one) over the shared crosshair
// cursor. Runs pre-authenticated like every other spec in this suite (no
// per-tab beforeEach hook — a single test doesn't need one, mirrors
// forceBootAnimation.spec.ts's direct openBoot(ctx) call).
//
// All assertions delegate to scenario helpers — gates 9-11 compliant (no raw
// driver handles or page-object access in this file).
import * as common from "../scenarios/common";
import * as equitiesChart from "../scenarios/equitiesChart";
import { test } from "./_context";

test.describe("Equities chart", () => {
  test("panning away freezes the window; BACK TO LIVE resumes following", async ({
    ctx,
  }) => {
    await equitiesChart.openEquitiesWorkspace(ctx);
    await equitiesChart.expectPlotVisibleWithin(ctx, 5);

    await equitiesChart.focusPlot(ctx);
    await equitiesChart.pressArrowLeft(ctx);
    await equitiesChart.expectBackToLiveVisibleWithin(ctx, 3);

    await equitiesChart.recordTimeLabels(ctx, "panned");
    await common.waitSeconds(ctx, 1.5); // live ticks continue in the background
    await equitiesChart.expectTimeLabelsMatch(ctx, "panned"); // frozen while panned away

    await equitiesChart.clickBackToLive(ctx);
    await equitiesChart.expectBackToLiveHiddenWithin(ctx, 3);
  });

  test("navigator brush pans away; dragging its right handle to the edge resumes live", async ({
    ctx,
  }) => {
    await equitiesChart.openEquitiesWorkspace(ctx);
    await equitiesChart.expectPlotVisibleWithin(ctx, 5);
    await equitiesChart.expectNavigatorVisibleWithin(ctx, 3);

    await equitiesChart.dragNavigatorWindowBy(ctx, -0.2);
    await equitiesChart.expectBackToLiveVisibleWithin(ctx, 3);

    await equitiesChart.recordTimeLabels(ctx, "brushed");
    await common.waitSeconds(ctx, 1.5); // live ticks continue in the background
    await equitiesChart.expectTimeLabelsMatch(ctx, "brushed");

    await equitiesChart.dragNavigatorRightHandleToLiveEdge(ctx);
    await equitiesChart.expectBackToLiveHiddenWithin(ctx, 3);
  });

  test("panning to the left edge backfills an older page", async ({ ctx }) => {
    await equitiesChart.openEquitiesWorkspace(ctx);
    await equitiesChart.expectPlotVisibleWithin(ctx, 5);

    await equitiesChart.focusPlot(ctx);
    // One Home already reaches index 0 of the 300 candles preloaded at
    // mount, with zero fetching — record THAT as the baseline (the deepest
    // label reachable without a genuine backfill), not the live edge.
    await equitiesChart.pressHome(ctx);
    await equitiesChart.recordOldestTimeLabel(ctx, "afterFirstHome");
    // The near-edge trigger fires; the chip may resolve fast in sim mode, so
    // assert the OUTCOME — a FRESH Home reaching a label older than the
    // baseline, which only a delivered page can produce.
    await equitiesChart.expectHomeToReachOlderHistoryWithin(
      ctx,
      "afterFirstHome",
      5,
    );
  });

  test("RSI pane pill reveals the pane; hovering the plot shows a live RSI readout", async ({
    ctx,
  }) => {
    await equitiesChart.openEquitiesWorkspace(ctx);
    await equitiesChart.expectPlotVisibleWithin(ctx, 5);

    await equitiesChart.clickPanePill(ctx, "rsi");
    await equitiesChart.expectPaneVisibleWithin(ctx, "rsi", 3);

    await equitiesChart.hoverPlotCenter(ctx);
    await equitiesChart.expectRsiReadoutShowsRealValueWithin(ctx, 3);
  });

  test("LOG pill switches the price axis to log scale and back", async ({
    ctx,
  }) => {
    await equitiesChart.openEquitiesWorkspace(ctx);
    await equitiesChart.expectPlotVisibleWithin(ctx, 5);

    await equitiesChart.clickYScalePill(ctx);
    await equitiesChart.expectYScaleWithin(ctx, "log", 5);

    await equitiesChart.clickYScalePill(ctx);
    await equitiesChart.expectYScaleWithin(ctx, "linear", 5);
  });

  test("draw a trendline, select it, drag its endpoint, and delete it", async ({
    ctx,
  }) => {
    await equitiesChart.openEquitiesWorkspace(ctx);
    await equitiesChart.expectPlotVisibleWithin(ctx, 5);

    await equitiesChart.clickDrawPill(ctx, "trendline");
    await equitiesChart.dragOnPlot(
      ctx,
      { x: 0.25, y: 0.7 },
      { x: 0.7, y: 0.35 },
    );
    await equitiesChart.expectDrawingVisibleWithin(ctx, 3);

    await equitiesChart.clickDrawingAtLine(ctx);
    await equitiesChart.expectDrawingSelectedWithin(ctx, 3);

    const before = await equitiesChart.readDrawingGeometry(ctx);
    await equitiesChart.dragSelectedDrawingEndpoint(ctx);
    await equitiesChart.expectDrawingGeometryChangedWithin(ctx, before, 3);

    await equitiesChart.pressDelete(ctx);
    await equitiesChart.expectDrawingGoneWithin(ctx, 3);
  });
});
