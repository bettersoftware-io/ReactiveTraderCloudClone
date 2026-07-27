import type { TestContext } from "../testContext";
import { assertEquals } from "./assert";

export async function openEquitiesWorkspace(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.openEquities();
}

export async function expectPlotVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitPlotVisible(seconds * 1_000);
}

export async function focusPlot(ctx: TestContext): Promise<void> {
  await ctx.po.equitiesChart.focusPlot();
}

export async function pressArrowLeft(ctx: TestContext): Promise<void> {
  await ctx.po.equitiesChart.pressArrowLeft();
}

export async function expectBackToLiveVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitBackToLiveVisible(seconds * 1_000);
}

export async function expectBackToLiveHiddenWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitBackToLiveHidden(seconds * 1_000);
}

export async function clickBackToLive(ctx: TestContext): Promise<void> {
  await ctx.po.equitiesChart.clickBackToLive();
}

export async function recordTimeLabels(
  ctx: TestContext,
  key: string,
): Promise<void> {
  ctx.scratch.equitiesChart.recordedTimeLabels.set(
    key,
    await ctx.po.equitiesChart.timeLabels(),
  );
}

/** Compares the CURRENT time-axis labels against a prior {@link recordTimeLabels}
 * snapshot — the panned-away-freezes-the-window assertion (the labels must be
 * byte-identical while live ticks keep arriving in the background). */
export async function expectTimeLabelsMatch(
  ctx: TestContext,
  key: string,
): Promise<void> {
  const baseline = ctx.scratch.equitiesChart.recordedTimeLabels.get(key);

  if (baseline === undefined) {
    throw new Error(`no recorded time labels for ${key}`);
  }

  const current = await ctx.po.equitiesChart.timeLabels();
  assertEquals(
    JSON.stringify(current),
    JSON.stringify(baseline),
    `time labels changed while panned away: before=${JSON.stringify(baseline)} after=${JSON.stringify(current)}`,
  );
}

export async function expectNavigatorVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitNavigatorVisible(seconds * 1_000);
}

export async function dragNavigatorWindowBy(
  ctx: TestContext,
  stripWidthFrac: number,
): Promise<void> {
  await ctx.po.equitiesChart.dragNavigatorWindowBy(stripWidthFrac);
}

export async function dragNavigatorRightHandleToLiveEdge(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.equitiesChart.dragNavigatorRightHandleToLiveEdge();
}
