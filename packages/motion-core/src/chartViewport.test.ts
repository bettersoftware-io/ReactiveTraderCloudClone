import { describe, expect, it } from "vitest";

import {
  centerViewportAt,
  defaultViewport,
  followLive,
  isAtLiveEdge,
  MIN_VIEWPORT_SPAN,
  panBy,
  resizeViewportEdge,
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

describe("resizeViewportEdge", () => {
  it("moves only the dragged edge", () => {
    expect(
      resizeViewportEdge("start", { start: 100, end: 160 }, -20, 300),
    ).toEqual({ start: 80, end: 160 });
    expect(
      resizeViewportEdge("end", { start: 100, end: 160 }, 20, 300),
    ).toEqual({ start: 100, end: 180 });
  });

  it("floors the span at MIN_VIEWPORT_SPAN instead of letting edges cross", () => {
    expect(
      resizeViewportEdge("start", { start: 100, end: 160 }, 200, 300),
    ).toEqual({ start: 155, end: 160 });
    expect(
      resizeViewportEdge("end", { start: 100, end: 160 }, -200, 300),
    ).toEqual({ start: 100, end: 105 });
  });

  it("clamps the moving edge at the series bounds WITHOUT moving the fixed edge", () => {
    // clampViewport would return {0, 70} here (span-preserving); the resize must pin end at 60.
    expect(
      resizeViewportEdge("start", { start: 10, end: 60 }, -50, 300),
    ).toEqual({ start: 0, end: 60 });
    expect(
      resizeViewportEdge("end", { start: 240, end: 290 }, 50, 300),
    ).toEqual({ start: 240, end: 300 });
  });

  it("stays sane when the whole series is shorter than MIN_VIEWPORT_SPAN", () => {
    expect(resizeViewportEdge("start", { start: 0, end: 3 }, 2, 3)).toEqual({
      start: 0,
      end: 3,
    });
    expect(resizeViewportEdge("end", { start: 0, end: 3 }, -2, 3)).toEqual({
      start: 0,
      end: 3,
    });
  });
});

describe("centerViewportAt", () => {
  it("re-centres the window on the index, span preserved", () => {
    expect(centerViewportAt(150, { start: 240, end: 300 }, 300)).toEqual({
      start: 120,
      end: 180,
    });
  });

  it("clamps at both boundaries, span preserved", () => {
    expect(centerViewportAt(0, { start: 240, end: 300 }, 300)).toEqual({
      start: 0,
      end: 60,
    });
    expect(centerViewportAt(300, { start: 100, end: 160 }, 300)).toEqual({
      start: 240,
      end: 300,
    });
  });

  it("is a no-op when the index is already the centre", () => {
    expect(centerViewportAt(270, { start: 240, end: 300 }, 300)).toEqual({
      start: 240,
      end: 300,
    });
  });
});
