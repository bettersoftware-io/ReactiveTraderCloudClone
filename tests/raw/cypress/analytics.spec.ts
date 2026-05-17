// tests/raw/cypress/analytics.spec.ts
import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as analytics from "../../scenarios/cypress/analytics";
import * as theme from "../../scenarios/cypress/theme";

describe("Analytics panel", () => {
  withFxWorkspaceOpen();

  it("analytics panel is visible with sections", () => {
    const ctx = getCtx();
    analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    analytics.expectAnalyticsHasSection(ctx, "Analytics");
    analytics.expectAnalyticsHasSection(ctx, "Profit & Loss");
    analytics.expectAnalyticsHasSection(ctx, "Positions");
    analytics.expectAnalyticsHasSection(ctx, "PnL per Currency Pair");
  });

  it("PnL section is visible", () => {
    const ctx = getCtx();
    analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    analytics.expectAnalyticsHasSection(ctx, "Profit & Loss");
  });

  it("positions section is visible", () => {
    const ctx = getCtx();
    analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    analytics.expectAnalyticsHasSection(ctx, "Positions");
  });

  it("analytics panel shows alongside live rates", () => {
    const ctx = getCtx();
    theme.expectFirstPriceTileVisible(ctx, 5_000);
    analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
  });

  it("analytics presenter emits a non-empty snapshot", () => {
    const ctx = getCtx();
    analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
  });
});
