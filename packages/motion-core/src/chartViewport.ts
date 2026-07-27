export interface ChartViewport {
  readonly start: number;
  readonly end: number;
}

/** Zoom-in floor, in candles. */
export const MIN_VIEWPORT_SPAN = 5;

export function defaultViewport(
  seriesLen: number,
  visible: number,
): ChartViewport {
  return { start: Math.max(0, seriesLen - visible), end: seriesLen };
}

export function clampViewport(
  vp: ChartViewport,
  seriesLen: number,
): ChartViewport {
  const span = Math.min(
    Math.max(vp.end - vp.start, MIN_VIEWPORT_SPAN),
    seriesLen,
  );
  let start = vp.start;

  if (start < 0) {
    start = 0;
  }

  if (start + span > seriesLen) {
    start = seriesLen - span;
  }

  return { start, end: start + span };
}

export function zoomAt(
  vp: ChartViewport,
  anchorFrac: number,
  factor: number,
  seriesLen: number,
): ChartViewport {
  const span = vp.end - vp.start;
  const newSpan = span * factor;
  const anchorIdx = vp.start + anchorFrac * span;
  const start = anchorIdx - anchorFrac * newSpan;
  return clampViewport({ start, end: start + newSpan }, seriesLen);
}

export function panBy(
  vp: ChartViewport,
  dCandles: number,
  seriesLen: number,
): ChartViewport {
  return clampViewport(
    { start: vp.start + dCandles, end: vp.end + dCandles },
    seriesLen,
  );
}

export function isAtLiveEdge(vp: ChartViewport, seriesLen: number): boolean {
  const EDGE_EPS = 0.5;
  return vp.end >= seriesLen - EDGE_EPS;
}

/** New bars arrived (prevLen → newLen): an at-edge window slides with them;
 * a panned-away window holds still (the UI shows "back to live" instead). */
export function followLive(
  vp: ChartViewport,
  prevLen: number,
  newLen: number,
): ChartViewport {
  if (!isAtLiveEdge(vp, prevLen)) {
    return vp;
  }

  const d = newLen - prevLen;
  return { start: vp.start + d, end: vp.end + d };
}

export type ViewportEdge = "start" | "end";

/** Moves ONE edge by dCandles (a navigator-handle resize); the other edge
 * stays fixed. The moving edge clamps into [0, end − MIN] / [start + MIN,
 * seriesLen] directly — deliberately NOT via `clampViewport`, whose
 * span-preserving clamp would move the fixed edge at a series boundary. */
export function resizeViewportEdge(
  edge: ViewportEdge,
  vp: ChartViewport,
  dCandles: number,
  seriesLen: number,
): ChartViewport {
  if (edge === "start") {
    const maxStart = Math.max(0, vp.end - MIN_VIEWPORT_SPAN);
    const start = Math.min(Math.max(vp.start + dCandles, 0), maxStart);
    return { start, end: vp.end };
  }

  const minEnd = Math.min(seriesLen, vp.start + MIN_VIEWPORT_SPAN);
  const end = Math.max(Math.min(vp.end + dCandles, seriesLen), minEnd);
  return { start: vp.start, end };
}

/** Re-centres the window on a series index (a navigator track click), span
 * preserved; `clampViewport`'s span-preserving clamp is exactly right here. */
export function centerViewportAt(
  idx: number,
  vp: ChartViewport,
  seriesLen: number,
): ChartViewport {
  const span = vp.end - vp.start;
  const start = idx - span / 2;
  return clampViewport({ start, end: start + span }, seriesLen);
}
