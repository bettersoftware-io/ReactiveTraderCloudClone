import { describe, expect, it } from "vitest";

import { clampDragOffset } from "./clampDragOffset.js";

const dialog = { width: 800, height: 600 };
const viewport = { width: 1440, height: 900 };
// centered dialog: free travel = (viewport - dialog) / 2 minus margin.
// x range ±(1440-800)/2 = ±320 → minus margin 16 → ±304. y: ±(900-600)/2-16 = ±134.

describe("clampDragOffset", () => {
  it("passes through an in-bounds offset unchanged", () => {
    expect(clampDragOffset({ x: 100, y: -50 }, dialog, viewport, 16)).toEqual({
      x: 100,
      y: -50,
    });
  });

  it("clamps x to the right edge", () => {
    expect(clampDragOffset({ x: 9999, y: 0 }, dialog, viewport, 16)).toEqual({
      x: 304,
      y: 0,
    });
  });

  it("clamps y to the top edge", () => {
    expect(clampDragOffset({ x: 0, y: -9999 }, dialog, viewport, 16)).toEqual({
      x: 0,
      y: -134,
    });
  });

  it("degrades gracefully when the dialog is larger than the viewport", () => {
    // range would be negative; clamp collapses to 0 so the dialog stays centered.
    const big = { width: 2000, height: 1200 };
    expect(clampDragOffset({ x: 500, y: 500 }, big, viewport, 16)).toEqual({
      x: 0,
      y: 0,
    });
  });
});
