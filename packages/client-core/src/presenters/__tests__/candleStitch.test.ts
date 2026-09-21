import { describe, expect, it } from "vitest";

import type { Candle } from "@rtc/domain";

import { stitchCandles } from "#/presenters/candleStitch";

describe("stitchCandles", () => {
  it("an empty older returns the base deduped by time", () => {
    const base = [createCandle(1), createCandle(2), createCandle(2)];
    expect(stitchCandles([], base)).toEqual([createCandle(1), createCandle(2)]);
  });

  it("older candles at or after base[0].time are dropped", () => {
    const older = [createCandle(1), createCandle(2), createCandle(3)];
    const base = [createCandle(3), createCandle(4)];
    expect(stitchCandles(older, base)).toEqual([
      createCandle(1),
      createCandle(2),
      createCandle(3),
      createCandle(4),
    ]);
  });

  it("a duplicate time keeps its FIRST position with the LAST value", () => {
    const first = createCandle(1);
    const dupe = { ...createCandle(1), close: 999 };
    const base = [createCandle(2)];
    const stitched = stitchCandles([first, dupe], base);
    expect(
      stitched.map((c) => {
        return c.time;
      }),
    ).toEqual([1, 2]);
    expect(stitched[0]).toEqual(dupe);
  });

  it("an empty base returns [] whatever older holds", () => {
    expect(stitchCandles([createCandle(1), createCandle(2)], [])).toEqual([]);
  });

  // I1: the contiguity guard's witness. An older candle that is NOT strictly
  // before base[0].time contributes nothing — even when it is not itself a
  // base candle, so dedupeByTime alone (matching by time) cannot explain the
  // result. Without the `< first.time` filter in stitchCandles, time 5 here
  // would survive dedup and leak into the series ahead of the base.
  it("an older candle strictly NEWER than base[0].time, and absent from base, contributes nothing", () => {
    const older = [createCandle(5)];
    const base = [createCandle(3), createCandle(4)];
    expect(stitchCandles(older, base)).toEqual([
      createCandle(3),
      createCandle(4),
    ]);
  });

  it("a mixed older page keeps only the candles strictly before base[0].time", () => {
    const older = [createCandle(1), createCandle(5)];
    const base = [createCandle(3), createCandle(4)];
    expect(
      stitchCandles(older, base).map((c) => {
        return c.time;
      }),
    ).toEqual([1, 3, 4]);
  });
});

function createCandle(time: number): Candle {
  return { time, open: 100, high: 101, low: 99, close: 100, volume: 10 };
}
