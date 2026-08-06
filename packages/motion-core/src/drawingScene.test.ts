import { describe, expect, it } from "vitest";

import type { ChartScale } from "./chartScene.js";
import { priceToY, yToPrice } from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";
import type { Drawing } from "./drawingScene.js";
import {
  dragDrawing,
  drawingScene,
  hitTestDrawings,
  hitTestGrip,
  pointerToAnchor,
} from "./drawingScene.js";

const VP: ChartViewport = { start: 240, end: 300 };
const LIN: ChartScale = { cmin: 100, cmax: 200 };
const LOG: ChartScale = { cmin: 100, cmax: 200, yScale: "log" };

describe("pointerToAnchor", () => {
  it("snaps x to the crosshair's candle-index rule and inverts y through the scale", () => {
    // xFrac 0.5 → rawIdx = 240 + 0.5·60 − 0.5 = 269.5 → 270 (round).
    const a = pointerToAnchor(0.5, 0.5, VP, LIN, 300);
    expect(a.index).toBe(270);
    expect(a.price).toBeCloseTo(yToPrice(LIN, 50), 9);
  });

  it("clamps the index into the series", () => {
    expect(pointerToAnchor(1, 0.5, VP, LIN, 300).index).toBe(299);
    expect(pointerToAnchor(0, 0.5, { start: 0, end: 60 }, LIN, 300).index).toBe(
      0,
    );
  });
});

describe("drawingScene", () => {
  const TREND: Drawing = {
    id: "t1",
    kind: "trendline",
    a: { index: 250, price: 120 },
    b: { index: 290, price: 180 },
  };
  const LEVEL: Drawing = { id: "h1", kind: "hline", price: 150 };

  it("projects anchors via the candle-center rule and priceToY", () => {
    const [item] = drawingScene([TREND], VP, LIN, null);

    if (item?.kind !== "trendline") {
      throw new Error("expected trendline item");
    }

    expect(item.x1).toBeCloseTo(((250 + 0.5 - 240) / 60) * 100, 9);
    expect(item.y1).toBeCloseTo(priceToY(LIN, 120), 9);
    expect(item.x2).toBeCloseTo(((290 + 0.5 - 240) / 60) * 100, 9);
    expect(item.y2).toBeCloseTo(priceToY(LIN, 180), 9);
    expect(item.selected).toBe(false);
    expect(item.handles).toEqual([]);
  });

  it("is mode-correct: log y differs from linear for the same anchors", () => {
    const [lin] = drawingScene([TREND], VP, LIN, null);
    const [log] = drawingScene([TREND], VP, LOG, null);

    if (lin?.kind !== "trendline" || log?.kind !== "trendline") {
      throw new Error("expected trendline items");
    }

    expect(log.y1).toBeCloseTo(priceToY(LOG, 120), 9);
    expect(log.y1).not.toBeCloseTo(lin.y1, 3);
  });

  it("an hline spans full width at priceToY(price); selection adds handles", () => {
    const [item] = drawingScene([LEVEL], VP, LIN, "h1");

    if (item?.kind !== "hline") {
      throw new Error("expected hline item");
    }

    expect(item.y).toBeCloseTo(priceToY(LIN, 150), 9);
    expect(item.selected).toBe(true);
    expect(item.handles).toEqual([{ x: 50, y: item.y }]);
  });

  it("a selected trendline's handles sit on its two anchors", () => {
    const [item] = drawingScene([TREND], VP, LIN, "t1");

    if (item?.kind !== "trendline") {
      throw new Error("expected trendline item");
    }

    expect(item.handles).toEqual([
      { x: item.x1, y: item.y1 },
      { x: item.x2, y: item.y2 },
    ]);
  });

  it("off-viewport anchors still emit finite geometry (SVG clips)", () => {
    const far: Drawing = {
      id: "t2",
      kind: "trendline",
      a: { index: 0, price: 120 },
      b: { index: 100, price: 180 },
    };
    const [item] = drawingScene([far], VP, LIN, null);

    if (item?.kind !== "trendline") {
      throw new Error("expected trendline item");
    }

    expect(Number.isFinite(item.x1)).toBe(true);
    expect(item.x1).toBeLessThan(0);
  });

  it("anchor index + N renders at the same position after a prepend of N", () => {
    const before = drawingScene([TREND], VP, LIN, null);
    const shifted: Drawing = {
      ...TREND,
      a: { ...TREND.a, index: TREND.a.index + 30 },
      b: { ...TREND.b, index: TREND.b.index + 30 },
    };
    const vpAfter: ChartViewport = { start: VP.start + 30, end: VP.end + 30 };
    const after = drawingScene([shifted], vpAfter, LIN, null);

    expect(after).toEqual(before);
  });
});

describe("hitTestDrawings", () => {
  const scene = drawingScene(
    [
      { id: "h1", kind: "hline", price: 150 },
      { id: "h2", kind: "hline", price: 152 },
    ],
    VP,
    LIN,
    null,
  );
  const y1 = priceToY(LIN, 150);
  const y2 = priceToY(LIN, 152);

  it("hits within tolerance, rejects beyond it, nearest wins", () => {
    expect(hitTestDrawings(scene, 50, y1 + 0.5)).toBe("h1");
    expect(hitTestDrawings(scene, 50, y1 + 5)).toBe(null);
    // Midway-but-nearer-h2 point. NOTE: priceToY is inverted (higher price →
    // smaller y), so with price 150 < 152 here y1 (49) > y2 (47.28); moving
    // *toward* h2 from the midpoint means SUBTRACTING (y1 - y2)/4, not
    // adding it — verified numerically: mid=48.14, mid-0.43=47.71 sits 0.43
    // from y2 and 1.29 from y1. The brief's literal `mid + (y1 - y2) / 4`
    // computes 48.57, which is nearer h1 (0.43 vs 1.29) and would assert
    // "h2" against a point that is actually nearest "h1" — a sign error
    // against the file's own comment ("nearer-h2"). Fixed the sign here to
    // match the stated intent; implementation is unmodified from the brief.
    const mid = (y1 + y2) / 2;
    expect(hitTestDrawings(scene, 50, mid - (y1 - y2) / 4)).toBe("h2");
  });

  it("empty scene → null", () => {
    expect(hitTestDrawings([], 50, 50)).toBe(null);
  });
});

describe("hitTestGrip", () => {
  const vp: ChartViewport = { start: 0, end: 10 };
  const tl: Drawing = {
    id: "t1",
    kind: "trendline",
    a: { index: 2, price: 105 },
    b: { index: 7, price: 115 },
  };
  const hl: Drawing = { id: "h1", kind: "hline", price: 110 };

  it("returns the endpoint handle when the pointer is within HANDLE_TOL_PCT of it — and the handle beats the body when both are in tolerance", () => {
    const scene = drawingScene([tl], vp, LIN, "t1");
    const sel = scene[0];

    if (sel?.kind !== "trendline") {
      throw new Error("expected trendline");
    }

    // Exactly on handle a: both the handle (dist 0 <= 2.5) and the body
    // (dist 0 <= 1.5) hit; the handle must win.
    expect(hitTestGrip(scene, sel.x1, sel.y1)).toEqual({ id: "t1", part: "a" });
    expect(hitTestGrip(scene, sel.x2, sel.y2)).toEqual({ id: "t1", part: "b" });
  });

  it("returns body for a mid-segment hit outside both handle radii", () => {
    const scene = drawingScene([tl], vp, LIN, "t1");
    const sel = scene[0];

    if (sel?.kind !== "trendline") {
      throw new Error("expected trendline");
    }

    const midX = (sel.x1 + sel.x2) / 2;
    const midY = (sel.y1 + sel.y2) / 2;
    expect(hitTestGrip(scene, midX, midY)).toEqual({ id: "t1", part: "body" });
  });

  it("never grips an unselected drawing, even dead-on", () => {
    const scene = drawingScene([tl], vp, LIN, null);
    const item = scene[0];

    if (item?.kind !== "trendline") {
      throw new Error("expected trendline");
    }

    expect(hitTestGrip(scene, item.x1, item.y1)).toBeNull();
  });

  it("misses cleanly: far from everything returns null", () => {
    const scene = drawingScene([tl], vp, LIN, "t1");
    expect(hitTestGrip(scene, 0, 0)).toBeNull();
  });

  it("an hline yields part 'level' from its handle AND from its body", () => {
    const scene = drawingScene([hl], vp, LIN, "h1");
    const item = scene[0];

    if (item?.kind !== "hline") {
      throw new Error("expected hline");
    }

    // handle sits at x=50
    expect(hitTestGrip(scene, 50, item.y)).toEqual({ id: "h1", part: "level" });
    // far from the handle but on the line body
    expect(hitTestGrip(scene, 5, item.y)).toEqual({ id: "h1", part: "level" });
  });
});

describe("dragDrawing", () => {
  const vp: ChartViewport = { start: 0, end: 10 };
  const tl: Drawing = {
    id: "t1",
    kind: "trendline",
    a: { index: 2, price: 105 },
    b: { index: 7, price: 115 },
  };

  it("endpoint drag routes through pointerToAnchor: candle-center x snap, free price", () => {
    const out = dragDrawing(
      tl,
      { id: "t1", part: "b" },
      { xFrac: 0.75, yFrac: 0.2 },
      { xFrac: 0.31, yFrac: 0.5 },
      vp,
      LIN,
      10,
    );

    if (out.kind !== "trendline") {
      throw new Error("expected trendline");
    }

    // 0.31 * 10 - 0.5 = 2.6 -> rounds to 3
    expect(out.b.index).toBe(3);
    expect(out.a).toEqual(tl.a); // untouched anchor
  });

  it("body drag applies ONE rounded index delta to both anchors (rigid x)", () => {
    const out = dragDrawing(
      tl,
      { id: "t1", part: "body" },
      { xFrac: 0.2, yFrac: 0.5 },
      { xFrac: 0.42, yFrac: 0.5 }, // dxFrac 0.22 * span 10 = 2.2 -> +2
      vp,
      LIN,
      20,
    );

    if (out.kind !== "trendline") {
      throw new Error("expected trendline");
    }

    expect(out.a.index).toBe(4);
    expect(out.b.index).toBe(9);
  });

  it("body drag clamps the delta so BOTH anchors stay in range — shape preserved at the edges", () => {
    const out = dragDrawing(
      tl,
      { id: "t1", part: "body" },
      { xFrac: 0.0, yFrac: 0.5 },
      { xFrac: 0.9, yFrac: 0.5 }, // raw +9, but b can only move +2 (seriesLen 10)
      vp,
      LIN,
      10,
    );

    if (out.kind !== "trendline") {
      throw new Error("expected trendline");
    }

    expect(out.a.index).toBe(4); // 2 + 2
    expect(out.b.index).toBe(9); // 7 + 2 — same delta, shape intact
  });

  it("body drag is rigid in projected y under LOG scale (equal y-deltas, not equal price-deltas)", () => {
    const before = [priceToY(LOG, tl.a.price), priceToY(LOG, tl.b.price)];
    const out = dragDrawing(
      tl,
      { id: "t1", part: "body" },
      { xFrac: 0.5, yFrac: 0.3 },
      { xFrac: 0.5, yFrac: 0.55 }, // pure vertical, dyPct = +25
      vp,
      LOG,
      20,
    );

    if (out.kind !== "trendline") {
      throw new Error("expected trendline");
    }

    const after = [priceToY(LOG, out.a.price), priceToY(LOG, out.b.price)];
    expect(after[0] - before[0]).toBeCloseTo(25, 6);
    expect(after[1] - before[1]).toBeCloseTo(25, 6);
    // and the PRICE deltas differ (log): equal y-shift is not equal price-shift
    expect(out.a.price - tl.a.price).not.toBeCloseTo(
      out.b.price - tl.b.price,
      6,
    );
  });

  it("hline drag ('level') follows y only — x is ignored entirely", () => {
    const hl: Drawing = { id: "h1", kind: "hline", price: 110 };
    const out = dragDrawing(
      hl,
      { id: "h1", part: "level" },
      { xFrac: 0.5, yFrac: 0.5 },
      { xFrac: 0.99, yFrac: 0.25 },
      vp,
      LIN,
      10,
    );

    if (out.kind !== "hline") {
      throw new Error("expected hline");
    }

    // whatever yToPrice(scale, 25) is — assert via the inverse:
    expect(priceToY(LIN, out.price)).toBeCloseTo(25, 6);
  });

  it("a mismatched grip id returns the drawing unchanged (same reference)", () => {
    const out = dragDrawing(
      tl,
      { id: "OTHER", part: "body" },
      { xFrac: 0.2, yFrac: 0.2 },
      { xFrac: 0.8, yFrac: 0.8 },
      vp,
      LIN,
      10,
    );

    expect(out).toBe(tl);
  });
});
