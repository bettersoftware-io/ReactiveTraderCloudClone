import { describe, expect, it } from "vitest";

import {
  defaultViewport,
  followLive,
  isAtLiveEdge,
  MIN_VIEWPORT_SPAN,
  panBy,
  zoomAt,
} from "./chartViewport.js";

describe("defaultViewport", () => {
  it("shows the newest `visible` candles", () => {
    expect(defaultViewport(300, 60)).toEqual({ start: 240, end: 300 });
  });

  it("shows everything when the series is shorter than `visible`", () => {
    expect(defaultViewport(40, 60)).toEqual({ start: 0, end: 40 });
  });
});

describe("zoomAt", () => {
  it("keeps the candle under the anchor stationary", () => {
    const vp = { start: 100, end: 200 };
    // anchor at 25% of the window = candle index 125
    const zoomed = zoomAt(vp, 0.25, 0.5, 300);
    const anchorIdx = zoomed.start + 0.25 * (zoomed.end - zoomed.start);

    expect(anchorIdx).toBeCloseTo(125, 6);
    expect(zoomed.end - zoomed.start).toBeCloseTo(50, 6);
  });

  it("never zooms below MIN_VIEWPORT_SPAN nor beyond the full series", () => {
    const tiny = zoomAt({ start: 0, end: MIN_VIEWPORT_SPAN }, 0.5, 0.01, 300);
    expect(tiny.end - tiny.start).toBeCloseTo(MIN_VIEWPORT_SPAN, 6);

    const huge = zoomAt({ start: 100, end: 200 }, 0.5, 100, 300);
    expect(huge).toEqual({ start: 0, end: 300 });
  });
});

describe("panBy", () => {
  it("shifts the window and clamps at the left wall preserving span", () => {
    expect(panBy({ start: 10, end: 70 }, -30, 300)).toEqual({
      start: 0,
      end: 60,
    });
  });

  it("clamps at the live edge preserving span", () => {
    expect(panBy({ start: 200, end: 260 }, 100, 300)).toEqual({
      start: 240,
      end: 300,
    });
  });
});

describe("live edge", () => {
  it("isAtLiveEdge is true only when end reaches the series end", () => {
    expect(isAtLiveEdge({ start: 240, end: 300 }, 300)).toBe(true);
    expect(isAtLiveEdge({ start: 100, end: 160 }, 300)).toBe(false);
  });

  it("followLive slides an at-edge window and freezes a panned-away one", () => {
    expect(followLive({ start: 240, end: 300 }, 300, 301)).toEqual({
      start: 241,
      end: 301,
    });
    expect(followLive({ start: 100, end: 160 }, 300, 301)).toEqual({
      start: 100,
      end: 160,
    });
  });
});
