import { describe, expect, it } from "vitest";

import { rowHeight } from "./useRankGlide";

describe("rowHeight", () => {
  function stubbedRow(top: number): HTMLElement {
    const el = document.createElement("div");

    el.getBoundingClientRect = (): DOMRect => {
      return { top } as DOMRect;
    };

    return el;
  }

  it("falls back to FALLBACK_ROW_HEIGHT with fewer than two rows — there's no gap to measure", () => {
    expect(rowHeight([])).toBe(52);
    expect(rowHeight([stubbedRow(0)])).toBe(52);
  });

  it("measures the gap between the first two rows' tops", () => {
    expect(rowHeight([stubbedRow(10), stubbedRow(60)])).toBe(50);
  });

  it("falls back to FALLBACK_ROW_HEIGHT when the measured gap is zero", () => {
    // Same top for both — e.g. rows haven't been laid out yet (0-height
    // container) — a zero/falsy delta must not glide by 0px forever.
    expect(rowHeight([stubbedRow(0), stubbedRow(0)])).toBe(52);
  });
});
