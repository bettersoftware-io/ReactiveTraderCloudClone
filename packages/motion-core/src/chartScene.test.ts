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
