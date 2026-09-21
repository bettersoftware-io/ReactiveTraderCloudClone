import { describe, expect, it } from "vitest";

import type { Candle } from "@rtc/domain";

import { stitchCandles } from "#/presenters/candleStitch";

describe("stitchCandles", () => {
  it("an empty older returns the base deduped by time", () => {
    const base = [candle(1), candle(2), candle(2)];
    expect(stitchCandles([], base)).toEqual([candle(1), candle(2)]);
  });

  it("older candles at or after base[0].time are dropped", () => {
    const older = [candle(1), candle(2), candle(3)];
    const base = [candle(3), candle(4)];
    expect(stitchCandles(older, base)).toEqual([
      candle(1),
      candle(2),
      candle(3),
      candle(4),
    ]);
  });

  it("a duplicate time keeps its FIRST position with the LAST value", () => {
    const first = candle(1);
    const dupe = { ...candle(1), close: 999 };
    const base = [candle(2)];
    const stitched = stitchCandles([first, dupe], base);
    expect(
      stitched.map((c) => {
        return c.time;
      }),
    ).toEqual([1, 2]);
    expect(stitched[0]).toEqual(dupe);
  });

  it("an empty base returns [] whatever older holds", () => {
    expect(stitchCandles([candle(1), candle(2)], [])).toEqual([]);
  });
});

function candle(time: number): Candle {
  return { time, open: 100, high: 101, low: 99, close: 100, volume: 10 };
}
