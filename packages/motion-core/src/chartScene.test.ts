import { describe, expect, it } from "vitest";

import {
  type ChartCandle,
  type ChartScene,
  chartScene,
  type SceneCandle,
  volumeScene,
} from "./chartScene.js";

/** Domain-Candle-shaped fixture rows (motion-core cannot import @rtc/domain;
 * ChartCandle is the structural subset chartScene reads). */
type Candle = ChartCandle & { readonly time: number };

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
