import { describe, expect, it } from "vitest";

import type { ChartScale } from "./chartScene.js";
import { priceToY, yToPrice } from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";
import type { Drawing } from "./drawingScene.js";
import {
  drawingScene,
  hitTestDrawings,
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
