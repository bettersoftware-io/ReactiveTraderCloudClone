import type {
  EquitiesDrawTool,
  EquitiesPaneKind,
  PlotFraction,
} from "../page-objects/contracts/EquitiesChart";
import type { TestContext } from "../testContext";
import { assertEquals, assertTrue } from "./assert";

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
 * Repeatedly presses Home and polls (bounded, hand-rolled loop mirroring
 * `connection.ts`'s `expectConnectionStatusFooterShows` — expect.poll's
 * role, kept driver-free) until the oldest time-axis label reads older
 * than the `key` snapshot taken by {@link recordOldestTimeLabel} — which
 * must have been recorded AFTER an initial Home already landed the
 * viewport at the loaded series' left edge (`{0, span}`).
 *
 * Why press Home again on every iteration, not just wait: a single Home
 * only reaches index 0 of whatever the series ALREADY holds — with 300
 * candles preloaded at mount, that's trivially reachable with zero
 * fetching, so a baseline recorded before any Home (at the live edge) or a
 * check that never re-presses Home would pass even with backfill
 * completely broken. Only once a fetched page has been PREPENDED does
 * `shiftForPrepend` translate the viewport forward (e.g. `{0,60} →
 * {300,360}` for a 300-candle page), so a FRESH Home — recomputing
 * `{0, span}` off the then-current viewport — lands on the newly
 * delivered (genuinely older) candles instead of re-showing the same
 * ones. Pressing Home on every poll iteration is what lets this test
 * observe that transition instead of asserting on data that was already
 * in memory. Deliberately ignores the transient "loading older" chip (see
 * `loadingOlder` testid doc) — sim mode's candleHistory resolves fast
 * enough that the chip can come and go between polls, so this asserts the
 * backfill's OUTCOME instead.
 */
export async function expectHomeToReachOlderHistoryWithin(
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
    await ctx.po.equitiesChart.pressHome();
    last = await ctx.po.equitiesChart.oldestTimeLabel();

    if (isOlderTimeLabel(last, before)) {
      return;
    }

    await ctx.po.workspace.wait(100);
  }

  throw new Error(
    `expected a fresh Home to reach a label older than ${JSON.stringify(before)} within ${seconds}s; last seen: ${JSON.stringify(last)}`,
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

export async function clickPanePill(
  ctx: TestContext,
  kind: EquitiesPaneKind,
): Promise<void> {
  await ctx.po.equitiesChart.clickPanePill(kind);
}

export async function expectPaneVisibleWithin(
  ctx: TestContext,
  kind: EquitiesPaneKind,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitPaneVisible(kind, seconds * 1_000);
}

export async function hoverPlotCenter(ctx: TestContext): Promise<void> {
  await ctx.po.equitiesChart.hoverPlotCenter();
}

/** A real number, e.g. "RSI 63.2" — never the pre-warm-up/no-cursor
 * placeholder "RSI —" (see paneScene.ts's `paneReadout`/`formatReadoutValue`). */
const RSI_READOUT_PATTERN = /RSI\s+\d/;

/**
 * Waits for the RSI pane's live readout row to render (only true once the
 * shared crosshair cursor is active, see `hoverPlotCenter`), then asserts its
 * text is a genuine number — the tamper-proof half of this journey: a broken
 * `rsiValues` renders every index `null`, so `paneReadout` falls back to the
 * "—" placeholder and this regex misses.
 */
export async function expectRsiReadoutShowsRealValueWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitPaneReadoutVisible("rsi", seconds * 1_000);
  const text = await ctx.po.equitiesChart.paneReadoutText("rsi");
  assertTrue(
    RSI_READOUT_PATTERN.test(text),
    `expected the RSI pane readout to show a real number, got ${JSON.stringify(text)}`,
  );
}

export async function clickYScalePill(ctx: TestContext): Promise<void> {
  await ctx.po.equitiesChart.clickYScalePill();
}

export async function expectYScaleWithin(
  ctx: TestContext,
  mode: "linear" | "log",
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitYScale(mode, seconds * 1_000);
}

export async function clickDrawPill(
  ctx: TestContext,
  tool: EquitiesDrawTool,
): Promise<void> {
  await ctx.po.equitiesChart.clickDrawPill(tool);
}

export async function dragOnPlot(
  ctx: TestContext,
  from: PlotFraction,
  to: PlotFraction,
): Promise<void> {
  await ctx.po.equitiesChart.dragOnPlot(from, to);
}

export async function expectDrawingVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitDrawingVisible(seconds * 1_000);
}

/** Clicks the plot at the committed drawing's own coordinates — the real
 * hit-testing pointer path (see `PlaywrightEquitiesChart.clickDrawing`'s
 * pointer-events doc). */
export async function clickDrawingAtLine(ctx: TestContext): Promise<void> {
  await ctx.po.equitiesChart.clickDrawing();
}

export async function expectDrawingSelectedWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitDrawingSelected(seconds * 1_000);
}

export async function readDrawingGeometry(ctx: TestContext): Promise<string> {
  return await ctx.po.equitiesChart.readDrawingGeometry();
}

export async function dragSelectedDrawingEndpoint(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.equitiesChart.dragSelectedDrawingEndpoint();
}

export async function expectDrawingGeometryChangedWithin(
  ctx: TestContext,
  before: string,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.expectDrawingGeometryChangedWithin(
    before,
    seconds * 1_000,
  );
}

export async function pressDelete(ctx: TestContext): Promise<void> {
  await ctx.po.equitiesChart.pressDelete();
}

export async function expectDrawingGoneWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitDrawingGone(seconds * 1_000);
}
