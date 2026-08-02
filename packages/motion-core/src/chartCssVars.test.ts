import { describe, expect, it } from "vitest";

import {
  chartVmFromScene,
  crosshairVmFromScene,
  navigatorWindowStyleFromScene,
  volumeBarsFromScene,
} from "./chartCssVars.js";
import {
  type ChartCandle,
  chartScene,
  crosshairScene,
  navigatorWindowScene,
  volumeScene,
} from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";
import { chartVm, volumeVm } from "./chartVm.js";
import { crosshairVm } from "./crosshairVm.js";
import { navigatorWindowStyle } from "./navigatorVm.js";

/** Domain-Candle-shaped fixture rows (motion-core cannot import @rtc/domain;
 * ChartCandle is the structural subset chartVm/chartScene read). */
type Candle = ChartCandle & { readonly time: number };

const EMPTY: readonly Candle[] = [];

const SINGLE: readonly Candle[] = [
  { time: 0, open: 10, high: 12, low: 8, close: 11, volume: 1_000 },
];

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

const MIXED_VIEWPORT: ChartViewport = { start: 2.4, end: 9.6 };

interface Fixture {
  readonly name: string;
  readonly series: readonly Candle[];
  readonly liveRate: number;
  readonly flashOn: boolean;
  readonly viewport?: ChartViewport;
  readonly kind?: "candles" | "line" | "area";
}

const FIXTURES: readonly Fixture[] = [
  { name: "empty series", series: EMPTY, liveRate: 0, flashOn: false },
  { name: "single candle", series: SINGLE, liveRate: 11, flashOn: false },
  {
    name: "12 mixed candles, fractional clamped viewport",
    series: TWELVE_MIXED,
    liveRate: 0,
    flashOn: false,
    viewport: MIXED_VIEWPORT,
  },
  {
    name: "kind line",
    series: TWELVE_MIXED,
    liveRate: 0,
    flashOn: false,
    viewport: MIXED_VIEWPORT,
    kind: "line",
  },
  {
    name: "kind area",
    series: TWELVE_MIXED,
    liveRate: 0,
    flashOn: false,
    viewport: MIXED_VIEWPORT,
    kind: "area",
  },
  {
    name: "liveRate above the last high",
    series: TWELVE_MIXED,
    liveRate: 500,
    flashOn: false,
    viewport: MIXED_VIEWPORT,
  },
  {
    name: "flashOn true",
    series: TWELVE_MIXED,
    liveRate: 0,
    flashOn: true,
    viewport: MIXED_VIEWPORT,
  },
];

describe("chartCssVars: chartVmFromScene(chartScene(...)) === chartVm(...)", () => {
  for (const f of FIXTURES) {
    it(`matches for: ${f.name}`, () => {
      const opts = { viewport: f.viewport, kind: f.kind };
      const viaScene = chartVmFromScene(
        chartScene(f.series, f.liveRate, f.flashOn, opts),
      );
      const direct = chartVm(f.series, f.liveRate, f.flashOn, opts);
      expect(viaScene).toEqual(direct);
    });
  }
});

describe("chartCssVars: volumeBarsFromScene(volumeScene(...)) === volumeVm(...)", () => {
  for (const f of FIXTURES) {
    it(`matches for: ${f.name}`, () => {
      const viaScene = volumeBarsFromScene(volumeScene(f.series, f.viewport));
      const direct = volumeVm(f.series, f.viewport);
      expect(viaScene).toEqual(direct);
    });
  }
});

interface CrosshairFixture {
  readonly name: string;
  readonly series: readonly Candle[];
  readonly xFrac: number;
  readonly yFrac: number;
  readonly viewport: ChartViewport;
  readonly scale: { readonly cmin: number; readonly cmax: number };
}

const CROSSHAIR_FIXTURES: readonly CrosshairFixture[] = [
  {
    name: "empty series",
    series: EMPTY,
    xFrac: 0.5,
    yFrac: 0.5,
    viewport: { start: 0, end: 0 },
    scale: { cmin: 0, cmax: 0 },
  },
  {
    name: "center hit",
    series: TWELVE_MIXED,
    xFrac: 0.5,
    yFrac: 0.5,
    viewport: { start: 0, end: 12 },
    scale: { cmin: 90, cmax: 120 },
  },
  {
    name: "xFrac 0 clamped to the first candle",
    series: TWELVE_MIXED,
    xFrac: 0,
    yFrac: 0.5,
    viewport: { start: 0, end: 12 },
    scale: { cmin: 90, cmax: 120 },
  },
  {
    name: "xFrac 1 clamped to the last candle",
    series: TWELVE_MIXED,
    xFrac: 1,
    yFrac: 0.5,
    viewport: { start: 0, end: 12 },
    scale: { cmin: 90, cmax: 120 },
  },
];

describe("chartCssVars: crosshairVmFromScene(crosshairScene(...)) === crosshairVm(...)", () => {
  for (const f of CROSSHAIR_FIXTURES) {
    it(`matches for: ${f.name}`, () => {
      const viaScene = crosshairVmFromScene(
        crosshairScene(f.xFrac, f.yFrac, f.series, f.viewport, f.scale),
      );
      const direct = crosshairVm(
        f.xFrac,
        f.yFrac,
        f.series,
        f.viewport,
        f.scale,
      );
      expect(viaScene).toEqual(direct);
    });
  }
});

interface NavigatorFixture {
  readonly name: string;
  readonly viewport: ChartViewport;
  readonly seriesLen: number;
}

const NAVIGATOR_FIXTURES: readonly NavigatorFixture[] = [
  { name: "normal window", viewport: { start: 3, end: 9 }, seriesLen: 12 },
  { name: "seriesLen 0", viewport: { start: 0, end: 0 }, seriesLen: 0 },
];

describe("chartCssVars: navigatorWindowStyleFromScene(navigatorWindowScene(...)) === navigatorWindowStyle(...)", () => {
  for (const f of NAVIGATOR_FIXTURES) {
    it(`matches for: ${f.name}`, () => {
      const viaScene = navigatorWindowStyleFromScene(
        navigatorWindowScene(f.viewport, f.seriesLen),
      );
      const direct = navigatorWindowStyle(f.viewport, f.seriesLen);
      expect(viaScene).toEqual(direct);
    });
  }
});
