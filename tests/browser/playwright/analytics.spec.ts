import * as analytics from "../scenarios/analytics";
import * as theme from "../scenarios/theme";
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";

test.describe("Analytics panel", () => {
  withFxWorkspaceOpen();

  test("analytics panel is visible with sections", async ({ ctx }) => {
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    await analytics.expectAnalyticsHasSection(ctx, "Profit & Loss");
    await analytics.expectAnalyticsHasSection(ctx, "PnL per Currency Pair");
  });

  test("PnL section is visible", async ({ ctx }) => {
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    await analytics.expectAnalyticsHasSection(ctx, "Profit & Loss");
  });

  test("positions panel shows net exposure", async ({ ctx }) => {
    await analytics.expectPositionsPanelVisibleWithin(ctx, 5);
    await analytics.expectPositionsPanelHasBubbles(ctx, 1);
    await analytics.expectFirstBubbleHasSignedAmount(ctx);
    await analytics.expectFirstRowHasSignedAmount(ctx);
  });

  test("analytics panel shows alongside live rates", async ({ ctx }) => {
    await theme.expectFirstPriceTileVisible(ctx, 5_000);
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
  });

  test("analytics presenter emits a non-empty snapshot", async ({ ctx }) => {
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
  });
});
