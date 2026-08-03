import { describe, expect, it } from "vitest";

import {
  type ChartCandle,
  type ChartScene,
  type CrosshairScene,
  chartScene,
  crosshairScene,
  type NavigatorWindowScene,
  navigatorWindowScene,
  type SceneCandle,
  type VolumeSceneBar,
  volumeScene,
} from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";
import {
  type PaneBar,
  type PaneGuide,
  type PaneLine,
  type PaneScene,
  paneScene,
} from "./paneScene.js";

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
