import { describe, expect, it } from "vitest";

import { chartVmFromScene, volumeBarsFromScene } from "./chartCssVars.js";
import { type ChartCandle, chartScene, volumeScene } from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";
import { chartVm, volumeVm } from "./chartVm.js";

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
