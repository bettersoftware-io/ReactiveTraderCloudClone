import type { CSSProperties } from "react";
import { describe, expect, it } from "vitest";

import type { Candle } from "@rtc/domain";

import { chartVm } from "./chartVm";

describe("chartVm (PROTO chartVm, y in [6%, 92%] inverted)", () => {
  it("returns empty candles/grid/labels for an empty series", () => {
    const vm = chartVm([], 100, true);

    expect(vm).toEqual({ candles: [], grid: [], labels: [] });
  });

  it("pins x/top/h/wick percentages for a known two-candle series", () => {
    const series: readonly Candle[] = [
      { time: 0, open: 10, high: 12, low: 8, close: 11 },
      { time: 60, open: 11, high: 14, low: 9, close: 13 },
    ];

    // liveRate === the stored close: the live-last overlay is a no-op here,
    // so the plot's price range stays [cmin=8, cmax=14] (crng=6).
    const vm = chartVm(series, 13, false);

    expect(vm.candles).toHaveLength(2);

    const [c0, c1] = vm.candles;

    // c0: x=25%, up (11>=10), top=min(yPct(10),yPct(11))=49%, h=|63.33-49|.
    expect(c0.up).toBe(true);
    expect(c0.last).toBe(false);
    expect(c0.glow).toBe(false);
    expect(cssVar(c0.style, "--x")).toBe("25%");
    expect(pct(c0.style, "--top")).toBeCloseTo(49, 5);
    expect(pct(c0.style, "--h")).toBeCloseTo(14.333333, 5);
    expect(pct(c0.style, "--w")).toBeCloseTo(32, 5); // cw(50) * BODY_FRAC(0.64)
    expect(pct(c0.wickStyle, "--wtop")).toBeCloseTo(34.666667, 5); // yPct(high=12)
    expect(pct(c0.wickStyle, "--wh")).toBeCloseTo(57.333333, 5); // yPct(8)-yPct(12)

    // c1: x=75%, up (13>=11), the last candle.
    expect(c1.up).toBe(true);
    expect(c1.last).toBe(true);
    expect(c1.glow).toBe(false); // flashOn=false
    expect(cssVar(c1.style, "--x")).toBe("75%");
    expect(pct(c1.style, "--top")).toBeCloseTo(20.333333, 5); // yPct(close=13)
    expect(pct(c1.style, "--h")).toBeCloseTo(28.666667, 5); // |49-20.33|
    expect(pct(c1.wickStyle, "--wtop")).toBeCloseTo(6, 5); // yPct(high=14)=6 (top of plot)
    expect(pct(c1.wickStyle, "--wh")).toBeCloseTo(71.666667, 5); // yPct(9)-yPct(14)

    // Grid: 4 fixed fractions, each carrying only --gtop.
    expect(vm.grid).toHaveLength(4);
    expect(
      vm.grid.map((g) => {
        return cssVar(g.style, "--gtop");
      }),
    ).toEqual(["20%", "40%", "60%", "80%"]);

    // Labels: 4 fixed fractions, price = cmax - f*crng = 14 - f*6.
    expect(vm.labels).toHaveLength(4);
    expect(
      vm.labels.map((l) => {
        return l.txt;
      }),
    ).toEqual([
      (14 - 0.12 * 6).toFixed(2),
      (14 - 0.37 * 6).toFixed(2),
      (14 - 0.62 * 6).toFixed(2),
      (14 - 0.87 * 6).toFixed(2),
    ]);
  });

  it("glows only the last candle, and only when flashOn is true", () => {
    const series: readonly Candle[] = [
      { time: 0, open: 10, high: 11, low: 9, close: 10.5 },
    ];

    const glowing = chartVm(series, 10.5, true);
    const notGlowing = chartVm(series, 10.5, false);

    expect(glowing.candles[0]?.last).toBe(true);
    expect(glowing.candles[0]?.glow).toBe(true);
    expect(notGlowing.candles[0]?.glow).toBe(false);
  });

  it("falls back to a range of 1 when every OHLC value is flat (cmax === cmin)", () => {
    const series: readonly Candle[] = [
      { time: 0, open: 10, high: 10, low: 10, close: 10 },
      { time: 60, open: 10, high: 10, low: 10, close: 10 },
    ];

    // liveRate === the flat price too, so withLiveLast is also a no-op: cmax
    // and cmin both stay 10, and `crng = cmax - cmin || 1` must fall back to
    // 1 rather than dividing yPct by zero.
    const vm = chartVm(series, 10, false);

    expect(vm.candles).toHaveLength(2);

    for (const candle of vm.candles) {
      // yPct(10) = ((10 - 10) / 1) * Y_SPAN + Y_TOP = Y_TOP = 6%.
      expect(pct(candle.style, "--top")).toBeCloseTo(6, 5);
      expect(pct(candle.wickStyle, "--wtop")).toBeCloseTo(6, 5);
      expect(pct(candle.wickStyle, "--wh")).toBeCloseTo(0, 5);
      expect(Number.isFinite(pct(candle.style, "--top"))).toBe(true);
    }

    // Labels are likewise finite (no NaN/Infinity leaking from a /0).
    expect(
      vm.labels.every((l) => {
        return Number.isFinite(Number.parseFloat(l.txt));
      }),
    ).toBe(true);
  });

  it("overlays the live price onto the last candle: close=liveRate, high/low stretch to include it", () => {
    const series: readonly Candle[] = [
      { time: 0, open: 10, high: 12, low: 8, close: 11 },
    ];

    // liveRate above the stored high — the plot's range must stretch to it,
    // and the lone candle's direction flips (10 -> 15 is now "up").
    const vm = chartVm(series, 15, false);
    const last = vm.candles[0];

    if (!last) {
      throw new Error("expected one candle");
    }

    expect(last.up).toBe(true);
    // The plot's cmax is now 15 (not the stored high of 12): whenever a
    // candle's high equals cmax its wick top pins to Y_TOP (6%).
    expect(pct(last.wickStyle, "--wtop")).toBeCloseTo(6, 5);

    // The stored series is not mutated by the overlay.
    expect(series[0]).toEqual({
      time: 0,
      open: 10,
      high: 12,
      low: 8,
      close: 11,
    });
  });
});

/** Every geometry value rides in as a `"NN.NN%"` (or `calc(...)`) string
 * custom property — CSSProperties has no index signature for them, so reads
 * (unlike the sanctioned write-only `as CSSProperties` cast) need this one
 * escape hatch to pull a named custom property back out for assertions. */
function cssVar(style: CSSProperties, name: string): unknown {
  return (style as Record<string, unknown>)[name];
}

function pct(style: CSSProperties, name: string): number {
  return Number.parseFloat(String(cssVar(style, name)));
}
