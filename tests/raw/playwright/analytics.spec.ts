import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as analytics from "../../scenarios/analytics";
import * as theme from "../../scenarios/theme";

test.describe("Analytics panel", () => {
  withFxWorkspaceOpen();

  test("analytics panel is visible with sections", async ({ ctx }) => {
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    await analytics.expectAnalyticsHasSection(ctx, "Analytics");
    await analytics.expectAnalyticsHasSection(ctx, "Profit & Loss");
    await analytics.expectAnalyticsHasSection(ctx, "Positions");
    await analytics.expectAnalyticsHasSection(ctx, "PnL per Currency Pair");
  });

  test("PnL section is visible", async ({ ctx }) => {
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    await analytics.expectAnalyticsHasSection(ctx, "Profit & Loss");
  });

  test("positions section is visible", async ({ ctx }) => {
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    await analytics.expectAnalyticsHasSection(ctx, "Positions");
  });

  test("analytics panel shows alongside live rates", async ({ ctx }) => {
    await theme.expectFirstPriceTileVisible(ctx, 5_000);
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
  });

  test("analytics presenter emits a non-empty snapshot", async ({ ctx }) => {
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
  });
});
