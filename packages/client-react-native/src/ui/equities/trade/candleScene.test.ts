import { describe, expect, test } from "vitest";

import {
  bodyGeometriesBySlot,
  buildCandleScene,
  lerpBodyGeometries,
} from "./candleScene";

const CANDLES = [
  { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 0 },
  { time: 2, open: 11, high: 11.5, low: 8, close: 9, volume: 0 },
];

describe("buildCandleScene", () => {
  test("marks rising and falling bars by close vs open", () => {
    const bars = buildCandleScene(CANDLES, 100, 50, 6);

    expect(
      bars.map((b) => {
        return b.rising;
      }),
    ).toEqual([true, false]);
  });

  test("the series high touches the top and the low touches the bottom", () => {
    const bars = buildCandleScene(CANDLES, 100, 50, 6);

    expect(
      Math.min(
        ...bars.map((b) => {
          return b.wickTop;
        }),
      ),
    ).toBe(0);
    const lowest = Math.max(
      ...bars.map((b) => {
        return b.wickTop + b.wickHeight;
      }),
    );

    expect(lowest).toBe(50);
  });

  test("a doji (open === close) still gets a visible body", () => {
    const bars = buildCandleScene(
      [{ time: 1, open: 10, high: 11, low: 9, close: 10, volume: 0 }],
      100,
      50,
      6,
    );

    expect(bars[0].bodyHeight).toBeGreaterThan(0);
  });

  test("no candles yields no bars rather than throwing", () => {
    expect(buildCandleScene([], 100, 50, 6)).toEqual([]);
  });

  test("the rightmost bar's centre sits barWidth/2 inside the right edge", () => {
    const bars = buildCandleScene(CANDLES, 100, 50, 6);

    expect(bars.at(-1)?.x).toBe(97); // width(100) - barWidth/2(3)
  });
});

describe("bodyGeometriesBySlot", () => {
  test("re-indexes bodies so the newest bar is slot 0", () => {
    const bars = buildCandleScene(CANDLES, 100, 50, 6);
    const slots = bodyGeometriesBySlot(bars);

    expect(slots).toHaveLength(2);
    expect(slots[0]).toEqual({
      top: bars[1].bodyTop,
      height: bars[1].bodyHeight,
    });
    expect(slots[1]).toEqual({
      top: bars[0].bodyTop,
      height: bars[0].bodyHeight,
    });
  });
});

describe("lerpBodyGeometries", () => {
  test("interpolates each slot between from and to", () => {
    const mid = lerpBodyGeometries(
      [{ top: 0, height: 10 }],
      [{ top: 20, height: 30 }],
      0.5,
    );

    expect(mid).toEqual([{ top: 10, height: 20 }]);
  });

  test("a slot the from side lacks starts at its target (snaps)", () => {
    const mid = lerpBodyGeometries([], [{ top: 20, height: 30 }], 0.25);

    expect(mid).toEqual([{ top: 20, height: 30 }]);
  });

  test("progress 1 lands exactly on the targets", () => {
    const done = lerpBodyGeometries(
      [{ top: 5, height: 5 }],
      [{ top: 20, height: 30 }],
      1,
    );

    expect(done).toEqual([{ top: 20, height: 30 }]);
  });
});
