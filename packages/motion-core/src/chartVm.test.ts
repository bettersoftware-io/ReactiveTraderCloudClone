import { describe, expect, it } from "vitest";

import { priceToY } from "./chartScene.js";
import {
  type ChartCandle,
  type ChartVarStyle,
  chartVm,
  volumeVm,
} from "./chartVm.js";
import { priceTicks } from "./priceTicks.js";

describe("chartVm (PROTO chartVm, y in [6%, 92%] inverted)", () => {
  it("returns empty candles/grid/labels for an empty series", () => {
    const vm = chartVm([], 100, true);

    expect(vm).toEqual({
      candles: [],
      grid: [],
      labels: [],
      linePoints: [],
      compareLinePoints: [],
      timeLabels: [],
      scale: { cmin: 0, cmax: 0 },
    });
  });

  it("pins x/top/h/wick percentages for a known two-candle series", () => {
    const series: readonly Candle[] = [
      { time: 0, open: 10, high: 12, low: 8, close: 11, volume: 1_000 },
      { time: 60, open: 11, high: 14, low: 9, close: 13, volume: 2_000 },
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
    // Exact ChartVarStyle strings (characterization pins): --w and
    // --wleft-offset are both derived from cw alone (candle-agnostic), and
    // --wx carries the `calc(...% - 0.5px)` 1px-nudge format verbatim.
    expect(cssVar(c0.style, "--w")).toBe("32%");
    expect(cssVar(c0.style, "--wleft-offset")).toBe("16%"); // cw(50) * HALF_BODY_FRAC(0.32)
    expect(cssVar(c0.wickStyle, "--wx")).toBe("calc(25% - 0.5px)");

    // c1: x=75%, up (13>=11), the last candle.
    expect(c1.up).toBe(true);
    expect(c1.last).toBe(true);
    expect(c1.glow).toBe(false); // flashOn=false
    expect(cssVar(c1.style, "--x")).toBe("75%");
    expect(pct(c1.style, "--top")).toBeCloseTo(20.333333, 5); // yPct(close=13)
    expect(pct(c1.style, "--h")).toBeCloseTo(28.666667, 5); // |49-20.33|
    expect(pct(c1.wickStyle, "--wtop")).toBeCloseTo(6, 5); // yPct(high=14)=6 (top of plot)
    expect(pct(c1.wickStyle, "--wh")).toBeCloseTo(71.666667, 5); // yPct(9)-yPct(14)
    expect(cssVar(c1.style, "--w")).toBe("32%");
    expect(cssVar(c1.style, "--wleft-offset")).toBe("16%");
    expect(cssVar(c1.wickStyle, "--wx")).toBe("calc(75% - 0.5px)");

    // Grid: one nice tick per line (cmin=8, cmax=14 -> ticks [8,10,12,14],
    // highest first), each carrying only --gtop at priceToY(scale, tick).
    const scale = { cmin: 8, cmax: 14 };
    const ticks = [...priceTicks(scale.cmin, scale.cmax)].reverse();
    const gridTops = ticks.map((t) => {
      return `${priceToY(scale, t)}%`;
    });

    expect(vm.grid).toHaveLength(ticks.length);
    expect(
      vm.grid.map((g) => {
        return cssVar(g.style, "--gtop");
      }),
    ).toEqual(gridTops);

    // Labels: same ticks, price text is the tick value itself (not
    // interpolated).
    expect(vm.labels).toHaveLength(ticks.length);
    expect(
      vm.labels.map((l) => {
        return l.txt;
      }),
    ).toEqual(
      ticks.map((t) => {
        return t.toFixed(2);
      }),
    );
    // Exact --ltop calc(...% - 6px) strings for the same ticks.
    expect(
      vm.labels.map((l) => {
        return cssVar(l.style, "--ltop");
      }),
    ).toEqual(
      gridTops.map((t) => {
        return `calc(${t} - 6px)`;
      }),
    );
  });

  it("glows only the last candle, and only when flashOn is true", () => {
    const series: readonly Candle[] = [
      { time: 0, open: 10, high: 11, low: 9, close: 10.5, volume: 1_000 },
    ];

    const glowing = chartVm(series, 10.5, true);
    const notGlowing = chartVm(series, 10.5, false);

    expect(glowing.candles[0]?.last).toBe(true);
    expect(glowing.candles[0]?.glow).toBe(true);
    expect(notGlowing.candles[0]?.glow).toBe(false);
  });

  it("falls back to a range of 1 when every OHLC value is flat (cmax === cmin)", () => {
    const series: readonly Candle[] = [
      { time: 0, open: 10, high: 10, low: 10, close: 10, volume: 1_000 },
      { time: 60, open: 10, high: 10, low: 10, close: 10, volume: 1_000 },
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
      { time: 0, open: 10, high: 12, low: 8, close: 11, volume: 1_000 },
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
      volume: 1_000,
    });
  });
});

describe("chartVm (viewport slicing, chart kinds, time axis, volume vm)", () => {
  it("renders only the viewport slice", () => {
    const vm = chartVm(SERIES, 0, false, {
      viewport: { start: 240, end: 300 },
    });
    expect(vm.candles.length).toBeGreaterThanOrEqual(60);
    expect(vm.candles.length).toBeLessThanOrEqual(62); // + clipped edges
  });

  it("defaults to the whole series and candles kind (back-compat)", () => {
    const vm = chartVm(SERIES, 0, false);
    expect(vm.candles).toHaveLength(300);
    expect(vm.linePoints).toHaveLength(0);
  });

  it("Y-fits the visible slice, not the whole series", () => {
    // craft a series with a huge spike OUTSIDE the viewport; the visible
    // candles' --top values must span most of the plot, proving the spike
    // didn't compress the scale. Assert via vm.scale.
    const spiked = SERIES.map((c, i) => {
      return i === 0 ? { ...c, high: 10_000 } : c;
    });

    const vm = chartVm(spiked, 0, false, {
      viewport: { start: 240, end: 300 },
    });
    expect(vm.scale.cmax).toBeLessThan(200);
  });

  it("applies the live overlay only when the last candle is visible", () => {
    const away = chartVm(SERIES, 9_999, false, {
      viewport: { start: 0, end: 60 },
    });
    expect(away.scale.cmax).toBeLessThan(200);
  });

  it("emits linePoints for kind line/area and no candles", () => {
    const vm = chartVm(SERIES, 0, false, {
      viewport: { start: 240, end: 300 },
      kind: "line",
    });
    expect(vm.candles).toHaveLength(0);
    expect(vm.linePoints.length).toBeGreaterThanOrEqual(60);

    for (const p of vm.linePoints) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });

  it("kind area behaves identically to line: linePoints populated, candles empty", () => {
    const lineVm = chartVm(SERIES, 0, false, {
      viewport: { start: 240, end: 300 },
      kind: "line",
    });

    const areaVm = chartVm(SERIES, 0, false, {
      viewport: { start: 240, end: 300 },
      kind: "area",
    });
    expect(areaVm.candles).toHaveLength(0);
    expect(areaVm.linePoints).toEqual(lineVm.linePoints);
  });

  it("time labels are stable under panning (keyed to series indices)", () => {
    const a = chartVm(SERIES, 0, false, { viewport: { start: 240, end: 300 } });
    const b = chartVm(SERIES, 0, false, { viewport: { start: 239, end: 299 } });
    const aKeys = a.timeLabels.map((l) => {
      return l.key;
    });

    const bKeys = b.timeLabels.map((l) => {
      return l.key;
    });
    expect(
      aKeys.filter((k) => {
        return bKeys.includes(k);
      }).length,
    ).toBeGreaterThan(0);
  });

  it("formats intraday ticks HH:MM UTC and daily ticks DD MMM", () => {
    const vm = chartVm(SERIES, 0, false, {
      viewport: { start: 240, end: 300 },
    });
    expect(vm.timeLabels[0]?.txt).toMatch(/^\d{2}:\d{2}$/);

    const daily = SERIES.map((c, i) => {
      return { ...c, time: 1_782_864_000_000 + i * 86_400_000 };
    });

    const dvm = chartVm(daily, 0, false, {
      viewport: { start: 240, end: 300 },
    });
    expect(dvm.timeLabels[0]?.txt).toMatch(/^\d{2} [A-Z]{3}$/);
  });

  it("volumeVm scales bars to the visible max", () => {
    const bars = volumeVm(SERIES, { start: 240, end: 300 });
    const hs = bars.map((b) => {
      return Number.parseFloat(b.style["--h"] as string);
    });
    expect(Math.max(...hs)).toBeCloseTo(100, 1);
  });

  it("pins exact geometry for a clamped fractional viewport (iFirst/iLast clamp)", () => {
    // start=2.4 floors to iFirst=2; end=9.6 ceils-then-minus-1 to iLast=9 —
    // the unclamped span (7.2) still drives x/width, so edge candles land at
    // fractional (non-grid-aligned) x/wick positions instead of snapping to
    // whole percents. These exact strings were captured from the (unsplit)
    // implementation and re-verified for both split halves in
    // chartCssVars.test.ts's equivalence pins.
    const vp = { start: 2.4, end: 9.6 };
    const vm = chartVm(TWELVE_CANDLES, 0, false, { viewport: vp });

    expect(vm.candles).toHaveLength(8); // indices 2..9 inclusive
    expect(vm.scale).toEqual({ cmin: 85, cmax: 115 });

    const first = vm.candles[0];
    const last = vm.candles[vm.candles.length - 1];

    if (!first || !last) {
      throw new Error("expected first and last candles");
    }

    expect(first.key).toBe(2);
    expect(first.up).toBe(false);
    expect(cssVar(first.style, "--x")).toBe("1.3888888888888902%");
    expect(cssVar(first.style, "--top")).toBe("43.266666666666666%");
    expect(cssVar(first.style, "--h")).toBe("8.600000000000001%");
    expect(cssVar(first.style, "--w")).toBe("8.888888888888891%");
    expect(cssVar(first.style, "--wleft-offset")).toBe("4.4444444444444455%");
    expect(cssVar(first.wickStyle, "--wx")).toBe(
      "calc(1.3888888888888902% - 0.5px)",
    );
    expect(cssVar(first.wickStyle, "--wtop")).toBe("26.066666666666666%");
    expect(cssVar(first.wickStyle, "--wh")).toBe("45.866666666666674%");

    expect(last.key).toBe(9);
    expect(last.up).toBe(true);
    expect(cssVar(last.style, "--x")).toBe("98.61111111111111%");
    expect(cssVar(last.wickStyle, "--wtop")).toBe("6%");
    expect(cssVar(last.wickStyle, "--wh")).toBe("86%");

    // Labels are the nice ticks for this slice's [cmin, cmax]=[85, 115]:
    // rawStep=7.5, err=7.5 >= sqrt(50) -> step 10 -> ticks [90, 100, 110].
    expect(
      vm.labels.map((l) => {
        return l.txt;
      }),
    ).toEqual(
      [...priceTicks(85, 115)].reverse().map((t) => {
        return t.toFixed(2);
      }),
    );

    // Time labels are keyed to absolute series indices, exact --tx strings.
    expect(vm.timeLabels).toHaveLength(4);
    expect(
      vm.timeLabels.map((l) => {
        return { key: l.key, txt: l.txt, tx: cssVar(l.style, "--tx") };
      }),
    ).toEqual([
      { key: 2, txt: "00:02", tx: "1.3888888888888902%" },
      { key: 4, txt: "00:04", tx: "29.166666666666668%" },
      { key: 6, txt: "00:06", tx: "56.94444444444444%" },
      { key: 8, txt: "00:08", tx: "84.72222222222221%" },
    ]);

    const bars = volumeVm(TWELVE_CANDLES, vp);
    expect(bars).toHaveLength(8);
    expect(
      bars.map((b) => {
        return { key: b.key, up: b.up, x: cssVar(b.style, "--x") };
      }),
    ).toEqual([
      { key: 2, up: false, x: "1.3888888888888902%" },
      { key: 3, up: true, x: "15.277777777777782%" },
      { key: 4, up: false, x: "29.166666666666668%" },
      { key: 5, up: true, x: "43.055555555555564%" },
      { key: 6, up: false, x: "56.94444444444444%" },
      { key: 7, up: true, x: "70.83333333333334%" },
      { key: 8, up: false, x: "84.72222222222221%" },
      { key: 9, up: true, x: "98.61111111111111%" },
    ]);
    expect(cssVar(bars[bars.length - 1]?.style ?? {}, "--h")).toBe("100%");
  });
});

/** 12 mixed (alternating up/down) candles, 1-minute buckets — shared with
 * chartCssVars.test.ts's equivalence pins for the same viewport fixture. */
const TWELVE_CANDLES: readonly Candle[] = Array.from({ length: 12 }, (_, i) => {
  const dir = i % 2 === 0 ? 1 : -1;
  return {
    time: 1_782_864_000_000 + i * 60_000,
    open: 100 + dir * i,
    high: 106 + i,
    low: 94 - i,
    close: 100 - dir * i * 0.5,
    volume: 1_000 + i * 137,
  };
});

const SERIES: readonly Candle[] = Array.from({ length: 300 }, (_, i) => {
  return {
    time: 1_782_864_000_000 + i * 60_000,
    open: 100 + Math.sin(i / 7) * 5,
    high: 102 + Math.sin(i / 7) * 5,
    low: 98 + Math.sin(i / 7) * 5,
    close: 101 + Math.sin(i / 7) * 5,
    volume: 800_000 + i * 1_000,
  };
});

/** Domain-Candle-shaped fixture rows (motion-core cannot import @rtc/domain;
 * ChartCandle is the structural subset chartVm reads, and the extra `time`
 * field mirrors how real domain Candles satisfy it with fields to spare). */
type Candle = ChartCandle & { readonly time: number };

/** Every geometry value rides in as a `"NN.NN%"` (or `calc(...)`) string
 * custom property; pull a named one back out for assertions. */
function cssVar(style: ChartVarStyle, name: string): unknown {
  return (style as Record<string, unknown>)[name];
}

function pct(style: ChartVarStyle, name: string): number {
  return Number.parseFloat(String(cssVar(style, name)));
}
