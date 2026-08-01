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

export async function pressHome(ctx: TestContext): Promise<void> {
  await ctx.po.equitiesChart.pressHome();
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

export async function recordOldestTimeLabel(
  ctx: TestContext,
  key: string,
): Promise<void> {
  ctx.scratch.equitiesChart.recordedOldestLabels.set(
    key,
    await ctx.po.equitiesChart.oldestTimeLabel(),
  );
}

/** Parses a 1D-timeframe time-axis label ("HH:MM", UTC) into minutes since
 * midnight, or `null` for any other shape (e.g. the "DD MMM" label used by
 * wider timeframes) — callers fall back to plain inequality in that case. */
function minutesOfDay(label: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(label);

  if (!m) {
    return null;
  }

  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * True if `current` names an earlier point in time than `before`. Bare
 * string/numeric inequality is NOT proof of "older" here: HH:MM wraps at
 * midnight, so a smaller clock value can still be in the FUTURE relative to
 * `before` (e.g. 23:58 → 00:02). Instead this measures the clock distance
 * both ways around the 24h dial and calls `current` older when the
 * backward distance (how far before `before`) is the shorter of the two —
 * correct as long as the real elapsed time is under 12h, comfortably true
 * for a single 300-candle backfill page (minutes, not half a day) even if
 * the pan happens to straddle midnight.
 *
 * Falls back to plain inequality when either label isn't "HH:MM" (e.g. a
 * "DD MMM" tick from a wider timeframe) — the prepended page still shifts
 * the leftmost label, so "changed at all" remains meaningful there.
 */
function isOlderTimeLabel(current: string, before: string): boolean {
  if (current === before) {
    return false;
  }

  const curMin = minutesOfDay(current);
  const beforeMin = minutesOfDay(before);

  if (curMin === null || beforeMin === null) {
    return true; // already excluded the equal case above
  }

  const backwardDistance = (beforeMin - curMin + 1_440) % 1_440;
  const forwardDistance = (curMin - beforeMin + 1_440) % 1_440;
  return backwardDistance < forwardDistance;
}

/**
 * Polls (bounded, hand-rolled loop mirroring `connection.ts`'s
 * `expectConnectionStatusFooterShows` — expect.poll's role, kept
 * driver-free) until the CURRENT oldest time-axis label reads older than
 * the `key` snapshot taken by {@link recordOldestTimeLabel}. Deliberately
 * ignores the transient "loading older" chip (see `loadingOlder` testid
 * doc) — sim mode's candleHistory resolves fast enough that the chip can
 * come and go between polls, so this asserts the backfill's OUTCOME
 * instead.
 */
export async function expectOldestTimeLabelOlderThanWithin(
  ctx: TestContext,
  key: string,
  seconds: number,
): Promise<void> {
  const before = ctx.scratch.equitiesChart.recordedOldestLabels.get(key);

  if (before === undefined) {
    throw new Error(`no recorded oldest time label for ${key}`);
  }

  const deadline = Date.now() + seconds * 1_000;
  let last = before;

  while (Date.now() < deadline) {
    last = await ctx.po.equitiesChart.oldestTimeLabel();

    if (isOlderTimeLabel(last, before)) {
      return;
    }

    await ctx.po.workspace.wait(100);
  }

  throw new Error(
    `expected the oldest time label to age past ${JSON.stringify(before)} within ${seconds}s; last seen: ${JSON.stringify(last)}`,
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
