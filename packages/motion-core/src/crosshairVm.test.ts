import { describe, expect, it } from "vitest";

import type { ChartViewport } from "./chartViewport.js";
import type { ChartCandle } from "./chartVm.js";
import { Y_SPAN, Y_TOP } from "./chartVm.js";
import { crosshairVm } from "./crosshairVm.js";

describe("crosshairVm", () => {
  it("returns null on an empty series", () => {
    expect(
      crosshairVm(0.5, 0.5, [], { start: 0, end: 0 }, { cmin: 0, cmax: 0 }),
    ).toBeNull();
  });

  it("snaps to a candle's dead centre", () => {
    // 10-candle window, idx 5's centre sits at xFrac = (5 + 0.5)/10 = 0.55.
    const series = makeSeries(10);
    const vp: ChartViewport = { start: 0, end: 10 };
    const cross = crosshairVm(0.55, 0.5, series, vp, { cmin: 0, cmax: 100 });

    expect(cross?.idx).toBe(5);
    expect(pct(cross?.style["--chx"])).toBeCloseTo(55, 5);
  });

  it("pins the exact --chx/--chy CSS-var strings (bit-for-bit, incl. float noise)", () => {
    const series = makeSeries(10);
    const vp: ChartViewport = { start: 0, end: 10 };
    const cross = crosshairVm(0.55, 0.5, series, vp, { cmin: 0, cmax: 100 });

    expect(cross?.style).toEqual({
      "--chx": "55.00000000000001%",
      "--chy": "50%",
    });
  });

  it("pins the exact price string for a fractional-viewport candle", () => {
    const series = makeSeries(3);
    const vp: ChartViewport = { start: 0, end: 3 };
    const cross = crosshairVm(0, 0.5, series, vp, { cmin: 8, cmax: 13 });

    expect(cross?.style).toEqual({
      "--chx": "16.666666666666664%",
      "--chy": "50%",
    });
    expect(cross?.price).toBe("10.44");
  });

  it("clamps the snapped index to 0 on a viewport scrolled before the series start", () => {
    const series = makeSeries(10);
    // span = 10, scrolled 7 candles before index 0: xFrac=0 -> rawIdx = -7-0.5
    // = -7.5, round -> -7 — must still clamp to the first real candle.
    const vp: ChartViewport = { start: -7, end: 3 };
    const cross = crosshairVm(0, 0.5, series, vp, { cmin: 0, cmax: 100 });

    expect(cross?.idx).toBe(0);
  });

  it("clamps the snapped index to len-1 on a viewport scrolled past the series end", () => {
    const series = makeSeries(10);
    // span = 10, scrolled 5 candles past the last real index (9): xFrac=1 ->
    // rawIdx = 15 + 10 - 0.5 = 24.5, round -> 25 — must clamp to 9.
    const vp: ChartViewport = { start: 15, end: 25 };
    const cross = crosshairVm(1, 0.5, series, vp, { cmin: 0, cmax: 100 });

    expect(cross?.idx).toBe(9);
  });

  it("never indexes outside the series across the full xFrac range on a part-scrolled viewport", () => {
    const series = makeSeries(10);
    const vp: ChartViewport = { start: -3, end: 13 };

    for (let i = 0; i <= 10; i++) {
      const xFrac = i / 10;
      const cross = crosshairVm(xFrac, 0.5, series, vp, { cmin: 0, cmax: 100 });
      expect(cross?.idx).toBeGreaterThanOrEqual(0);
      expect(cross?.idx).toBeLessThanOrEqual(series.length - 1);
    }
  });

  it("inverts the chartVm y-mapping to round-trip a known price", () => {
    const series = makeSeries(3);
    const vp: ChartViewport = { start: 0, end: 3 };
    const scale = { cmin: 50, cmax: 150 };
    const knownPrice = 120;
    // Same formula chartVm's yPct uses, inverted here to derive yFrac.
    const yPct =
      ((scale.cmax - knownPrice) / (scale.cmax - scale.cmin)) * Y_SPAN + Y_TOP;

    const cross = crosshairVm(0, yPct / 100, series, vp, scale);

    expect(Number(cross?.price)).toBeCloseTo(knownPrice, 5);
    expect(pct(cross?.style["--chy"])).toBeCloseTo(yPct, 5);
  });

  it("formats a full readout (2dp OHLC, HH:MM time, plain volume) for a known candle", () => {
    const series: readonly ChartCandle[] = [
      { time: 0, open: 10, high: 12, low: 8, close: 11.005, volume: 12 },
      { time: 60_000, open: 11, high: 13, low: 9, close: 12, volume: 34 },
    ];
    const vp: ChartViewport = { start: 0, end: 2 };
    const cross = crosshairVm(0, 0.5, series, vp, { cmin: 8, cmax: 13 });

    expect(cross?.idx).toBe(0);
    expect(cross?.readout).toEqual({
      time: "00:00",
      open: "10.00",
      high: "12.00",
      low: "8.00",
      close: "11.01",
      volume: "12",
    });
  });

  it("falls back to an intraday HH:MM time when the series has only one candle (no bucket to derive)", () => {
    const series: readonly ChartCandle[] = [
      { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ];
    const vp: ChartViewport = { start: 0, end: 1 };
    const cross = crosshairVm(0, 0.5, series, vp, { cmin: 0, cmax: 1 });

    expect(cross?.readout.time).toBe("00:00");
  });

  it("formats a daily-bucket time (DD MMM, upper-case) when the series' bucket is >= 24h", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const series: readonly ChartCandle[] = [
      {
        time: 1_782_864_000_000,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 1,
      },
      {
        time: 1_782_864_000_000 + dayMs,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 1,
      },
    ];
    const vp: ChartViewport = { start: 0, end: 2 };
    const cross = crosshairVm(0, 0.5, series, vp, { cmin: 0, cmax: 1 });

    expect(cross?.readout.time).toMatch(/^\d{2} [A-Z]{3}$/);
  });

  it("compacts volume: >= 1e6 as N.NM", () => {
    const series: readonly ChartCandle[] = [
      { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1_234_000 },
    ];
    const vp: ChartViewport = { start: 0, end: 1 };
    const cross = crosshairVm(0, 0.5, series, vp, { cmin: 0, cmax: 1 });

    expect(cross?.readout.volume).toBe("1.2M");
  });

  it("compacts volume: >= 1e3 and < 1e6 as NK", () => {
    const series: readonly ChartCandle[] = [
      { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 845_000 },
    ];
    const vp: ChartViewport = { start: 0, end: 1 };
    const cross = crosshairVm(0, 0.5, series, vp, { cmin: 0, cmax: 1 });

    expect(cross?.readout.volume).toBe("845K");
  });

  it("leaves volume < 1e3 as a plain integer", () => {
    const series: readonly ChartCandle[] = [
      { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 12 },
    ];
    const vp: ChartViewport = { start: 0, end: 1 };
    const cross = crosshairVm(0, 0.5, series, vp, { cmin: 0, cmax: 1 });

    expect(cross?.readout.volume).toBe("12");
  });
});

/** Every geometry value rides in as a `"NN.NN%"` string custom property;
 * pull the numeric percentage back out for float-tolerant assertions. */
function pct(value: unknown): number {
  return Number.parseFloat(String(value));
}

function makeSeries(len: number): readonly ChartCandle[] {
  return Array.from({ length: len }, (_, i) => {
    return {
      time: i * 60_000,
      open: 100 + i,
      high: 102 + i,
      low: 98 + i,
      close: 101 + i,
      volume: 1_000 + i,
    };
  });
}
