import { describe, expect, it } from "vitest";

import { navigatorVm } from "./navigatorVm";

function closes(values: readonly number[]): { close: number }[] {
  return values.map((close) => {
    return { close };
  });
}

describe("navigatorVm", () => {
  it("returns an empty vm for an empty series", () => {
    expect(navigatorVm([], { start: 0, end: 0 })).toEqual({
      linePoints: [],
      windowStyle: { "--nav-left": "0%", "--nav-w": "100%" },
    });
  });

  it("spreads the full series across x 0..100 and maps close min/max to the padded y band", () => {
    const vm = navigatorVm(closes([10, 30, 20]), { start: 0, end: 3 });

    expect(vm.linePoints).toEqual([
      { x: 0, y: 90 }, // min close → NAV_Y_TOP + NAV_Y_SPAN
      { x: 50, y: 10 }, // max close → NAV_Y_TOP
      { x: 100, y: 50 }, // midpoint
    ]);
  });

  it("pins a single-candle series at x=50 and mid-band y", () => {
    expect(navigatorVm(closes([42]), { start: 0, end: 1 }).linePoints).toEqual([
      { x: 50, y: 50 },
    ]);
  });

  it("maps the viewport to window percentages of the series length", () => {
    const series = closes(Array.from({ length: 300 }, (_, i) => i));

    expect(navigatorVm(series, { start: 240, end: 300 }).windowStyle).toEqual({
      "--nav-left": "80%",
      "--nav-w": "20%",
    });
    expect(navigatorVm(series, { start: 120, end: 180 }).windowStyle).toEqual({
      "--nav-left": "40%",
      "--nav-w": "20%",
    });
  });

  it("y stays mid-band when every close is identical (zero range)", () => {
    const vm = navigatorVm(closes([5, 5, 5]), { start: 0, end: 3 });

    for (const p of vm.linePoints) {
      expect(p.y).toBe(50);
    }
  });
});
