// The one lifecycle jsdom can't witness (see CandleChartPage/useChartGestures'
// unit coverage for the rest of the gesture contract): panning away from the
// live edge freezes the visible time window while real wall-clock ticks keep
// arriving in the background, and clicking BACK TO LIVE resumes following.
// Runs pre-authenticated like every other spec in this suite (no per-tab
// beforeEach hook — a single test doesn't need one, mirrors
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
});
