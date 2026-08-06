import type { ChartScale } from "./chartScene.js";
import { priceToY, yToPrice } from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";

/** A drawing anchor in data-space: a candle index (not a plot fraction) plus
 * a price. Anchoring drawings to data — not screen position — is what keeps
 * them stable across panning/zooming/live prepends (see `drawingScene`'s
 * "anchor index + N" test). */
export interface DrawingAnchor {
  readonly index: number;
  readonly price: number;
}

/** A user-placed chart drawing, keyed by a stable id. A trendline anchors
 * two data points; a horizontal level anchors one price and spans the full
 * plot width. */
export type Drawing =
  | {
      readonly id: string;
      readonly kind: "trendline";
      readonly a: DrawingAnchor;
      readonly b: DrawingAnchor;
    }
  | { readonly id: string; readonly kind: "hline"; readonly price: number };

/** A selection handle's projected position, in plot-percent coordinates. */
export interface DrawingHandle {
  readonly x: number;
  readonly y: number;
}

/** A drawing projected into plot-percent geometry — the scene-side twin of
 * `Drawing`, ready for an SVG overlay. `handles` is empty unless the drawing
 * is selected. */
export type DrawingSceneItem =
  | {
      readonly id: string;
      readonly kind: "trendline";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly selected: boolean;
      readonly handles: readonly DrawingHandle[];
    }
  | {
      readonly id: string;
      readonly kind: "hline";
      readonly y: number;
      readonly selected: boolean;
      readonly handles: readonly DrawingHandle[];
    };

/** Default hit-test tolerance, in plot-percent, for {@link hitTestDrawings}. */
const DEFAULT_TOL_PCT = 1.5;

/** Snaps a pointer's fractional plot position onto a data-space anchor: the
 * x fraction maps to the nearest candle index (the same candle-center rule
 * `crosshairScene` uses), clamped into the series; the y fraction inverts
 * through the scale to a price. */
export function pointerToAnchor(
  xFrac: number,
  yFrac: number,
  viewport: ChartViewport,
  scale: ChartScale,
  seriesLen: number,
): DrawingAnchor {
  const span = viewport.end - viewport.start || 1;
  const rawIdx = viewport.start + xFrac * span - 0.5;
  const index = Math.min(Math.max(Math.round(rawIdx), 0), seriesLen - 1);
  return { index, price: yToPrice(scale, yFrac * 100) };
}

/** Projects data-anchored drawings into plot-percent geometry for the given
 * viewport/scale. Anchors are re-projected from data space every call, so a
 * drawing renders at the same position after panning or a live prepend as
 * long as its index shifts with the viewport (see the "anchor index + N"
 * test). Off-viewport anchors still produce finite geometry — the SVG
 * viewBox clips them. */
export function drawingScene(
  drawings: readonly Drawing[],
  viewport: ChartViewport,
  scale: ChartScale,
  selectedId: string | null,
): readonly DrawingSceneItem[] {
  const span = viewport.end - viewport.start || 1;

  function xPct(index: number): number {
    return ((index + 0.5 - viewport.start) / span) * 100;
  }

  return drawings.map((d) => {
    const selected = d.id === selectedId;

    if (d.kind === "hline") {
      const y = priceToY(scale, d.price);
      return {
        id: d.id,
        kind: "hline",
        y,
        selected,
        handles: selected ? [{ x: 50, y }] : [],
      };
    }

    const x1 = xPct(d.a.index);
    const y1 = priceToY(scale, d.a.price);
    const x2 = xPct(d.b.index);
    const y2 = priceToY(scale, d.b.price);
    return {
      id: d.id,
      kind: "trendline",
      x1,
      y1,
      x2,
      y2,
      selected,
      handles: selected
        ? [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
          ]
        : [],
    };
  });
}

/** Point-to-segment distance in plot-% space. Documented limit: %-space is
 * anisotropic in pixels (the plot isn't square) — fine for click-select. */
function segmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.min(Math.max(((px - x1) * dx + (py - y1) * dy) / lenSq, 0), 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Hit-tests a pointer position (plot-percent) against a projected scene,
 * returning the nearest drawing's id within `tolPct`, or `null`. Never
 * touches the DOM — pure geometry, matched to the overlay SVG's
 * `pointer-events: none` (hit-testing happens on the plot wrapper's own
 * handlers, not the drawing elements). */
export function hitTestDrawings(
  scene: readonly DrawingSceneItem[],
  xPct: number,
  yPct: number,
  tolPct: number = DEFAULT_TOL_PCT,
): string | null {
  let best: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;

  for (const item of scene) {
    const d =
      item.kind === "hline"
        ? segmentDistance(xPct, yPct, 0, item.y, 100, item.y)
        : segmentDistance(xPct, yPct, item.x1, item.y1, item.x2, item.y2);

    if (d <= tolPct && d < bestD) {
      bestD = d;
      best = item.id;
    }
  }

  return best;
}

/** What a cursor-tool pointer-down grabbed on the SELECTED drawing.
 * `"a"`/`"b"` are a trendline's endpoint handles; `"body"` is its line body
 * (rigid translate); `"level"` is an hline's handle OR body — both mean the
 * same vertical-only drag. */
export interface DrawingGrip {
  readonly id: string;
  readonly part: "a" | "b" | "body" | "level";
}

/** Handle grab tolerance, in plot-percent — deliberately looser than the
 * line-body tolerance (handles are point targets, lines are extended). */
const HANDLE_TOL_PCT = 2.5;

/** Hit-tests a pointer position against the SELECTED item's grab points:
 * handles first (point distance, HANDLE_TOL_PCT), then the line body
 * (segment distance, DEFAULT_TOL_PCT). Items with `selected: false` are
 * never grips — selected-only drag is enforced here, in one pure function.
 * Same %-space anisotropy caveat as {@link hitTestDrawings}. */
export function hitTestGrip(
  scene: readonly DrawingSceneItem[],
  xPct: number,
  yPct: number,
): DrawingGrip | null {
  for (const item of scene) {
    if (!item.selected) {
      continue;
    }

    if (item.kind === "trendline") {
      // Handle order matches drawingScene's emission: [a, b].
      const parts = ["a", "b"] as const;

      for (let i = 0; i < item.handles.length; i++) {
        const h = item.handles[i];

        if (h && Math.hypot(xPct - h.x, yPct - h.y) <= HANDLE_TOL_PCT) {
          return { id: item.id, part: parts[i] ?? "b" };
        }
      }

      const bodyD = segmentDistance(
        xPct,
        yPct,
        item.x1,
        item.y1,
        item.x2,
        item.y2,
      );

      if (bodyD <= DEFAULT_TOL_PCT) {
        return { id: item.id, part: "body" };
      }

      continue;
    }

    // hline: the handle and the body both mean the same vertical-only drag.
    const onHandle = item.handles.some((h) => {
      return Math.hypot(xPct - h.x, yPct - h.y) <= HANDLE_TOL_PCT;
    });

    if (
      onHandle ||
      segmentDistance(xPct, yPct, 0, item.y, 100, item.y) <= DEFAULT_TOL_PCT
    ) {
      return { id: item.id, part: "level" };
    }
  }

  return null;
}

/** A pointer position as fractions (0-1) of the plot box — the coordinate
 * currency the clients' gesture hooks speak (each declares its own
 * structural twin; they unify). */
export interface PlotFrac {
  readonly xFrac: number;
  readonly yFrac: number;
}

/** Projects a drag gesture onto a drawing — the one entry point for every
 * grip kind, shared verbatim by the preview and the commit (preview ≡
 * committed by construction, the same property the draw draft has).
 * Returns the drawing unchanged (same reference) when the grip id doesn't
 * match. */
export function dragDrawing(
  drawing: Drawing,
  grip: DrawingGrip,
  from: PlotFrac,
  to: PlotFrac,
  viewport: ChartViewport,
  scale: ChartScale,
  seriesLen: number,
): Drawing {
  if (drawing.id !== grip.id) {
    return drawing;
  }

  if (drawing.kind === "hline") {
    return { ...drawing, price: yToPrice(scale, to.yFrac * 100) };
  }

  if (grip.part === "a" || grip.part === "b") {
    const anchor = pointerToAnchor(
      to.xFrac,
      to.yFrac,
      viewport,
      scale,
      seriesLen,
    );
    return grip.part === "a"
      ? { ...drawing, a: anchor }
      : { ...drawing, b: anchor };
  }

  // Body: rigid translate. ONE index delta applied to both anchors, clamped
  // so BOTH stay in [0, seriesLen-1] (clamping the delta, not each anchor,
  // preserves the segment's shape at the series edges). The y delta is
  // applied in plot-fraction space to each endpoint's PROJECTED y and
  // re-inverted — rigid under linear AND log scale (a price-space delta
  // would deform the segment under log).
  const span = viewport.end - viewport.start || 1;
  const rawDelta = Math.round((to.xFrac - from.xFrac) * span);
  const minIdx = Math.min(drawing.a.index, drawing.b.index);
  const maxIdx = Math.max(drawing.a.index, drawing.b.index);
  const delta = Math.min(Math.max(rawDelta, -minIdx), seriesLen - 1 - maxIdx);
  const dyPct = (to.yFrac - from.yFrac) * 100;

  function translateAnchor(anchor: DrawingAnchor): DrawingAnchor {
    return {
      index: anchor.index + delta,
      price: yToPrice(scale, priceToY(scale, anchor.price) + dyPct),
    };
  }

  return {
    ...drawing,
    a: translateAnchor(drawing.a),
    b: translateAnchor(drawing.b),
  };
}
