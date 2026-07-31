import { describe, expect, it } from "vitest";

import {
  navigatorLinePoints,
  navigatorVm,
  navigatorWindowStyle,
} from "./navigatorVm";

describe("navigatorLinePoints", () => {
  it("returns no points for an empty series", () => {
    expect(navigatorLinePoints([])).toEqual([]);
  });

  it("maps indices to slot centres across x 0..100 and close min/max to the padded y band", () => {
    // Slot-centre space ((i + 0.5) / len × 100) — the SAME space the window
    // style uses, so the line and the shade register exactly.
    expect(navigatorLinePoints(closes([10, 30, 20, 30]))).toEqual([
      { x: 12.5, y: 90 }, // min close → NAV_Y_TOP + NAV_Y_SPAN
      { x: 37.5, y: 10 }, // max close → NAV_Y_TOP
      { x: 62.5, y: 50 }, // midpoint
      { x: 87.5, y: 10 },
    ]);
  });

  it("pins a single-candle series at x=50 and mid-band y (no special case — 0.5/1 of the slot space)", () => {
    expect(navigatorLinePoints(closes([42]))).toEqual([{ x: 50, y: 50 }]);
  });

  it("y stays mid-band when every close is identical (zero range)", () => {
    for (const p of navigatorLinePoints(closes([5, 5, 5]))) {
      expect(p.y).toBe(50);
    }
  });
});

describe("navigatorWindowStyle", () => {
  it("maps the viewport to window percentages of the series length", () => {
    expect(navigatorWindowStyle({ start: 240, end: 300 }, 300)).toEqual({
      "--nav-left": "80%",
      "--nav-w": "20%",
    });
    expect(navigatorWindowStyle({ start: 120, end: 180 }, 300)).toEqual({
      "--nav-left": "40%",
      "--nav-w": "20%",
    });
  });

  it("covers the whole strip for an empty series", () => {
    expect(navigatorWindowStyle({ start: 0, end: 0 }, 0)).toEqual({
      "--nav-left": "0%",
      "--nav-w": "100%",
    });
  });
});

describe("navigatorVm", () => {
  it("composes the two halves (empty series)", () => {
    expect(navigatorVm([], { start: 0, end: 0 })).toEqual({
      linePoints: [],
      windowStyle: { "--nav-left": "0%", "--nav-w": "100%" },
    });
  });

  it("composes the two halves (populated series)", () => {
    const series = closes([10, 30, 20, 30]);
    const viewport = { start: 1, end: 3 };

    expect(navigatorVm(series, viewport)).toEqual({
      linePoints: navigatorLinePoints(series),
      windowStyle: navigatorWindowStyle(viewport, series.length),
    });
  });
});

interface CloseOnly {
  readonly close: number;
}

function closes(values: readonly number[]): CloseOnly[] {
  return values.map((close) => {
    return { close };
  });
}
