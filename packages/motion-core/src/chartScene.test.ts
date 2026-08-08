import { describe, expect, it } from "vitest";

import {
  type ChartCandle,
  type ChartScale,
  type ChartScene,
  type CrosshairScene,
  chartScene,
  crosshairScene,
  type NavigatorWindowScene,
  navigatorWindowScene,
  priceToY,
  type SceneCandle,
  type VolumeSceneBar,
  volumeScene,
  yToPrice,
} from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";
import {
  type PaneBar,
  type PaneGuide,
  type PaneLine,
  type PaneScene,
  paneScene,
} from "./paneScene.js";
import { priceTicks } from "./priceTicks.js";

const TWELVE_MIXED: readonly Candle[] = Array.from({ length: 12 }, (_, i) => {
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

// A close series long enough to clear both RSI's and MACD's warm-ups, for
// the paneScene neutrality checks below.
const PANE_CLOSES: readonly number[] = Array.from({ length: 60 }, (_, i) => {
  return 100 + Math.sin(i / 3) * 5;
});

describe("chartScene / volumeScene: CSS-neutral numeric output", () => {
  it("chartScene carries no % / calc( strings and no --keyed fields", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: { start: 2.4, end: 9.6 },
    });
    assertSceneNeutral(scene, "scene");
  });

  it("volumeScene carries no % / calc( strings and no --keyed fields", () => {
    const bars = volumeScene(TWELVE_MIXED, { start: 2.4, end: 9.6 });
    assertSceneNeutral(bars, "bars");
  });

  it("crosshairScene carries no % / calc( strings and no --keyed fields", () => {
    const vp: ChartViewport = { start: 2.4, end: 9.6 };
    const scene = crosshairScene(0.5, 0.5, TWELVE_MIXED, vp, {
      cmin: 90,
      cmax: 120,
    });
    assertSceneNeutral(scene, "scene");
  });

  it("navigatorWindowScene carries no % / calc( strings and no --keyed fields", () => {
    const scene = navigatorWindowScene({ start: 2, end: 9 }, 12);
    assertSceneNeutral(scene, "scene");
  });

  it("paneScene (rsi) carries no % / calc( strings and no --keyed fields", () => {
    const scene = paneScene("rsi", PANE_CLOSES, { start: 0, end: 60 });
    assertSceneNeutral(scene, "scene");
  });

  it("paneScene (macd) carries no % / calc( strings and no --keyed fields", () => {
    const scene = paneScene("macd", PANE_CLOSES, { start: 0, end: 60 });
    assertSceneNeutral(scene, "scene");
  });
});

describe("crosshairScene", () => {
  it("returns null on an empty series", () => {
    expect(
      crosshairScene(0.5, 0.5, [], { start: 0, end: 0 }, { cmin: 0, cmax: 0 }),
    ).toBeNull();
  });

  it("snaps a center hit to the middle candle", () => {
    // span=12, xFrac=0.5 -> rawIdx = 0.5*12 - 0.5 = 5.5, rounds to 6.
    const vp: ChartViewport = { start: 0, end: 12 };
    const scene = crosshairScene(0.5, 0.5, TWELVE_MIXED, vp, {
      cmin: 90,
      cmax: 120,
    });

    expect(scene?.idx).toBe(6);
  });

  it("clamps xFrac 0 to the first candle", () => {
    const vp: ChartViewport = { start: 0, end: 12 };
    const scene = crosshairScene(0, 0.5, TWELVE_MIXED, vp, {
      cmin: 90,
      cmax: 120,
    });

    expect(scene?.idx).toBe(0);
  });

  it("clamps xFrac 1 to the last candle", () => {
    const vp: ChartViewport = { start: 0, end: 12 };
    const scene = crosshairScene(1, 0.5, TWELVE_MIXED, vp, {
      cmin: 90,
      cmax: 120,
    });

    expect(scene?.idx).toBe(11);
  });
});

describe("navigatorWindowScene", () => {
  it("maps a populated viewport to numeric left/w percentages", () => {
    expect(navigatorWindowScene({ start: 3, end: 9 }, 12)).toEqual({
      left: 25,
      w: 50,
    });
  });

  it("covers the whole strip for an empty series", () => {
    expect(navigatorWindowScene({ start: 0, end: 0 }, 0)).toEqual({
      left: 0,
      w: 100,
    });
  });
});

describe("priceToY / yToPrice — the pluggable scale seam", () => {
  const LINEAR: ChartScale = { cmin: 100, cmax: 200 };
  const LOG: ChartScale = { cmin: 100, cmax: 200, yScale: "log" };

  it("linear branch reproduces the historical mapping verbatim", () => {
    // ((cmax − p) / crng) · Y_SPAN + Y_TOP with p=150, crng=100:
    expect(priceToY(LINEAR, 150)).toBeCloseTo(0.5 * 86 + 6, 10);
    expect(priceToY(LINEAR, 200)).toBeCloseTo(6, 10);
    expect(priceToY(LINEAR, 100)).toBeCloseTo(92, 10);
  });

  it("log branch interpolates in log10 space", () => {
    // sqrt(100·200) ≈ 141.42 is the log-midpoint → lands at the band middle.
    expect(priceToY(LOG, Math.sqrt(100 * 200))).toBeCloseTo(49, 6);
    expect(priceToY(LOG, 200)).toBeCloseTo(6, 10);
    expect(priceToY(LOG, 100)).toBeCloseTo(92, 10);
    // 150 sits ABOVE the linear midpoint under log (log compresses the top).
    expect(priceToY(LOG, 150)).toBeLessThan(priceToY(LINEAR, 150));
  });

  it("round-trips in both modes", () => {
    for (const scale of [LINEAR, LOG]) {
      for (const p of [100, 123.45, 150, 199.99, 200]) {
        expect(yToPrice(scale, priceToY(scale, p))).toBeCloseTo(p, 9);
      }
    }
  });

  it("cmin ≤ 0 falls back to the linear branch in both helpers", () => {
    const bad: ChartScale = { cmin: 0, cmax: 100, yScale: "log" };
    expect(priceToY(bad, 50)).toBeCloseTo(0.5 * 86 + 6, 10);
    expect(yToPrice(bad, 49)).toBeCloseTo(50, 9);
  });
});

describe("chartScene in log mode", () => {
  // 3 candles spanning a wide ratio so log vs linear geometry is unambiguous.
  const SERIES: ChartCandle[] = [
    { time: 0, open: 100, high: 110, low: 100, close: 110, volume: 1 },
    { time: 60_000, open: 110, high: 400, low: 110, close: 400, volume: 1 },
    { time: 120_000, open: 400, high: 1000, low: 400, close: 1000, volume: 1 },
  ];

  it("stamps yScale onto scene.scale and moves candle geometry", () => {
    const linear = chartScene(SERIES, 1000, false);
    const log = chartScene(SERIES, 1000, false, { yScale: "log" });

    expect(linear.scale).toEqual({ cmin: 100, cmax: 1000 });
    expect(log.scale).toEqual({ cmin: 100, cmax: 1000, yScale: "log" });
    // Candle 1's body top is y(close=400) — candle 2's would be y(1000),
    // which pins to Y_TOP in BOTH modes and proves nothing. Price 400's y:
    // linear ((1000−400)/900)·86+6 ≈ 63.33; log ((3−2.602)/1)·86+6 ≈ 40.22.
    const linTop = linear.candles[1]?.top ?? Number.NaN;
    const logTop = log.candles[1]?.top ?? Number.NaN;
    expect(logTop).toBeLessThan(linTop);
  });

  it("grid and labels derive from the same ticks; log moves positions, not values", () => {
    const linear = chartScene(SERIES, 1000, false);
    const log = chartScene(SERIES, 1000, false, { yScale: "log" });

    // Same round tick values in both modes, highest first…
    const values = [...priceTicks(100, 1000)].reverse().map((t) => {
      return t.toFixed(2);
    });
    expect(
      linear.priceLabels.map((l) => {
        return l.txt;
      }),
    ).toEqual(values);
    expect(
      log.priceLabels.map((l) => {
        return l.txt;
      }),
    ).toEqual(values);

    // …every label sits ON its grid line…
    for (const scene of [linear, log]) {
      expect(
        scene.priceLabels.map((l) => {
          return l.top;
        }),
      ).toEqual(
        scene.grid.map((g) => {
          return g.top;
        }),
      );
    }

    // …and log re-positions through priceToY (interior ticks differ).
    const logScale = { cmin: 100, cmax: 1000, yScale: "log" as const };
    expect(
      log.grid.map((g) => {
        return g.top;
      }),
    ).toEqual(
      [...priceTicks(100, 1000)].reverse().map((t) => {
        return priceToY(logScale, t);
      }),
    );
    expect(
      log.grid.map((g) => {
        return g.top;
      }),
    ).not.toEqual(
      linear.grid.map((g) => {
        return g.top;
      }),
    );
  });
});

describe("crosshairScene in log mode", () => {
  it("inverts through yToPrice, not the linear formula", () => {
    const series: ChartCandle[] = Array.from({ length: 10 }, (_, i) => {
      return {
        time: i * 60_000,
        open: 100,
        high: 1000,
        low: 100,
        close: 100,
        volume: 1,
      };
    });
    const scale: ChartScale = { cmin: 100, cmax: 1000, yScale: "log" };
    const cross = crosshairScene(
      0.5,
      0.5,
      series,
      { start: 0, end: 10 },
      scale,
    );

    // y = 50 → expected price = yToPrice(scale, 50). The linear inversion
    // would give 1000 − ((50−6)/86)·900 = 539.53 — assert we did NOT get it.
    expect(cross?.price).toBe(yToPrice(scale, 50).toFixed(2));
    expect(cross?.price).not.toBe("539.53");
  });
});

// Comparison-series fixtures: same 60s buckets/epoch as TWELVE_MIXED so the
// two series align by time exactly; closes climb twice as fast so the pct
// ranges genuinely differ (union must widen).
const COMPARE_TWELVE: readonly ChartCandle[] = Array.from(
  { length: 12 },
  (_, i) => {
    return {
      time: 1_782_864_000_000 + i * 60_000,
      open: 50 + i * 2,
      high: 53 + i * 2,
      low: 48 + i * 2,
      close: 50 + i * 2,
      volume: 1_000,
    };
  },
);

// A primary-only pct range engineered to straddle zero with round ±10/±20
// ticks (base=close=100, low=75 -> -25%, high=125 -> +25%; priceTicks(-25,
// 25) lands exactly on -20/-10/0/10/20), so formatPctLabel's sign and
// zero-unsigned rules can be pinned with literal string values instead of
// just the regex shape check above.
const STRADDLE_SERIES: readonly ChartCandle[] = [
  { time: 0, open: 100, high: 125, low: 75, close: 100, volume: 1 },
  { time: 60_000, open: 100, high: 125, low: 75, close: 100, volume: 1 },
];

describe("percent scale (comparison series)", () => {
  const VP: ChartViewport = { start: 0, end: 12 };

  it("priceToY's percent branch is numerically identical to linear for the primary", () => {
    const linear: ChartScale = { cmin: 90, cmax: 110 };
    const percent: ChartScale = {
      cmin: 90,
      cmax: 110,
      yScale: "percent",
      base: 100,
    };

    for (const p of [90, 95, 100, 104.37, 110]) {
      expect(priceToY(percent, p)).toBeCloseTo(priceToY(linear, p), 10);
      expect(yToPrice(percent, priceToY(percent, p))).toBeCloseTo(p, 8);
    }
  });

  it("a percent scale with a non-positive base falls back to the linear branch", () => {
    const linear: ChartScale = { cmin: 90, cmax: 110 };
    const broken: ChartScale = {
      cmin: 90,
      cmax: 110,
      yScale: "percent",
      base: 0,
    };
    expect(priceToY(broken, 95)).toBe(priceToY(linear, 95));
    expect(yToPrice(broken, 40)).toBe(yToPrice(linear, 40));
  });

  it("chartScene with compare derives a percent scale based at the first visible close", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });

    expect(scene.scale.yScale).toBe("percent");
    expect(scene.scale.base).toBe(TWELVE_MIXED[0]?.close);
  });

  it("compare is aligned by time: one point per primary index with a matching compare candle", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });
    expect(scene.compareLinePoints).toHaveLength(12);

    // A gappy compare series (every other candle removed) yields exactly the
    // surviving times' points — no interpolation.
    const gappy = COMPARE_TWELVE.filter((_, i) => {
      return i % 2 === 0;
    });

    const gappyScene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: gappy },
    });
    expect(gappyScene.compareLinePoints).toHaveLength(6);
  });

  it("the compare baseline is inclusive of an exact time match (pins >= over >)", () => {
    // COMPARE_TWELVE's first candle sits at EXACTLY the primary window-start
    // time, so an inclusive `>=` match picks it as cBase — the compare
    // line's very first point is then measured against its own close, so it
    // lands on pct 0, the same 0%-mark the primary itself starts at (base is
    // also the primary's first visible close). A strict `>` boundary would
    // instead skip to the NEXT compare candle as cBase, moving this point
    // off 0% — a literal numeric pin, not just a length/shape check.
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });
    const zeroPctY = priceToY(scene.scale, scene.scale.base as number);
    expect(scene.compareLinePoints[0]?.y).toBeCloseTo(zeroPctY, 8);
  });

  it("the pct-range union widens the scale to include the compare series", () => {
    // Compare alone spans 0% → +44% (close 50 → 72 over its base 50), far
    // beyond the primary's own pct range — so cmax back-converted must
    // exceed the primary's raw high.
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });
    const primaryOnly = chartScene(TWELVE_MIXED, 0, false, { viewport: VP });
    expect(scene.scale.cmax).toBeGreaterThan(primaryOnly.scale.cmax);
  });

  it("the baseline rebases when the viewport moves", () => {
    const late = chartScene(TWELVE_MIXED, 0, false, {
      viewport: { start: 6, end: 12 },
      compare: { series: COMPARE_TWELVE },
    });
    expect(late.scale.base).toBe(TWELVE_MIXED[6]?.close);
  });

  it("percent labels are signed, two-decimal, %-suffixed; zero is unsigned", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });

    for (const l of scene.priceLabels) {
      expect(l.txt).toMatch(/^(\+|-)?\d+\.\d{2}%$/);
    }

    const zero = scene.priceLabels.find((l) => {
      return l.txt === "0.00%";
    });
    // The compare's +44% swamps the primary range, so a 0% tick exists.
    expect(zero).toBeDefined();
    // No signed zero either way.
    expect(
      scene.priceLabels.some((l) => {
        return l.txt === "+0.00%" || l.txt === "-0.00%";
      }),
    ).toBe(false);
  });

  it("percent labels: literal signed values pin the sign and zero-unsigned rules", () => {
    // `compare` with an empty series is present purely to flip the scene
    // into percent mode; resolveCompare contributes nothing extra (no
    // cBase), so the pct range is exactly the primary's own -25%..+25%
    // (see STRADDLE_SERIES) and priceTicks(-25, 25) is the deterministic
    // -20/-10/0/10/20 set computed above. Exact strings — not the regex
    // shape check — so stripping the minus sign or the -0.00 branch in
    // formatPctLabel cannot slip through green. liveRate=100 matches the
    // last candle's own close, so withLiveLast's overlay is a no-op —
    // passing 0 here (as elsewhere in this file) would stretch that
    // candle's low to 0, blowing the pct range wide open.
    const scene = chartScene(STRADDLE_SERIES, 100, false, {
      viewport: { start: 0, end: 2 },
      compare: { series: [] },
    });

    expect(
      scene.priceLabels.map((l) => {
        return l.txt;
      }),
    ).toEqual(["+20.00%", "+10.00%", "0.00%", "-10.00%", "-20.00%"]);
  });

  it("an empty compare series still percent-projects the primary alone", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: [] },
    });
    expect(scene.scale.yScale).toBe("percent");
    expect(scene.compareLinePoints).toEqual([]);
  });

  it("a compare series entirely older than the window keeps percent but omits the line", () => {
    const older = COMPARE_TWELVE.map((c) => {
      return { ...c, time: c.time - 100 * 60_000 };
    });

    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: older },
    });
    expect(scene.scale.yScale).toBe("percent");
    expect(scene.compareLinePoints).toEqual([]);
  });

  it("compare overrides an explicit log yScale option", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      yScale: "log",
      compare: { series: COMPARE_TWELVE },
    });
    expect(scene.scale.yScale).toBe("percent");
  });

  it("scenes without compare emit an empty compareLinePoints and are otherwise unchanged", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, { viewport: VP });
    expect(scene.compareLinePoints).toEqual([]);
    expect(scene.scale.yScale).toBeUndefined();
  });

  it("crosshairScene formats its price readout as percent under a percent scale", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });
    const cross = crosshairScene(0.5, 0.5, TWELVE_MIXED, VP, scene.scale);
    expect(cross?.price).toMatch(/^(\+|-)?\d+\.\d{2}%$/);
    // OHLC readout stays in prices.
    expect(cross?.readout.close).toMatch(/^\d+(\.\d{2})?$/);
  });

  it("crosshairScene collapses a tiny negative percent rounding to unsigned zero", () => {
    // price = base·(1 - 0.00001) -> pct = -0.001, which .toFixed(2) rounds
    // to the literal string "-0.00" — the exact edge formatPctLabel's
    // zero-unsigned branch exists to catch. A literal "0.00%" pin, not the
    // permissive sign-optional regex used elsewhere in this file.
    const scale: ChartScale = {
      cmin: 90,
      cmax: 110,
      yScale: "percent",
      base: 100,
    };
    const y = priceToY(scale, 100 * (1 - 0.00001));
    const cross = crosshairScene(0.5, y / 100, TWELVE_MIXED, VP, scale);
    expect(cross?.price).toBe("0.00%");
  });
});

// Type-level neutrality: no field of SceneCandle/ChartScene is `--`-keyed.
// (Compile-only — these types are never instantiated; a violation fails
// `tsc`, not `vitest`.)
type CssVarKeys<T> = {
  [K in keyof T]: K extends `--${string}` ? K : never;
}[keyof T];
type AssertNever<T extends never> = T;
type _CandleClean = AssertNever<CssVarKeys<SceneCandle>>;
type _SceneClean = AssertNever<CssVarKeys<ChartScene>>;
type _CrosshairClean = AssertNever<CssVarKeys<CrosshairScene>>;
type _NavWindowClean = AssertNever<CssVarKeys<NavigatorWindowScene>>;
type _VolumeBarClean = AssertNever<CssVarKeys<VolumeSceneBar>>;
type _PaneSceneClean = AssertNever<CssVarKeys<PaneScene>>;
type _PaneLineClean = AssertNever<CssVarKeys<PaneLine>>;
type _PaneBarClean = AssertNever<CssVarKeys<PaneBar>>;
type _PaneGuideClean = AssertNever<CssVarKeys<PaneGuide>>;

/** Domain-Candle-shaped fixture rows (motion-core cannot import @rtc/domain;
 * ChartCandle is the structural subset chartScene reads). */
type Candle = ChartCandle & { readonly time: number };

// Recursively asserts a scene value carries no CSS syntax: no string field
// matches `%` or `calc(`, and no object key is `--`-prefixed. Run over both
// chartScene and volumeScene output to prove the numeric scene layer never
// leaks the projection's string formatting.
function assertSceneNeutral(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      assertSceneNeutral(v, `${path}[${i}]`);
    });
    return;
  }

  if (typeof node === "string") {
    expect(node, `${path} leaks CSS syntax`).not.toMatch(/%|calc\(/);
    return;
  }

  if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      expect(k.startsWith("--"), `${path}.${k} is a CSS var key`).toBe(false);
      assertSceneNeutral(v, `${path}.${k}`);
    }
  }
}
