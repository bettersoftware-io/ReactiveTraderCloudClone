import type { TestContext } from "../testContext";
import { assertTrue } from "./assert";

export async function expectAnalyticsPanelVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.analyticsDashboard.waitVisible(seconds * 1_000);
}

export async function expectAnalyticsHasSection(
  ctx: TestContext,
  name: string,
): Promise<void> {
  assertTrue(await ctx.po.analyticsDashboard.hasSection(name), `analytics section not found: ${name}`);
}
