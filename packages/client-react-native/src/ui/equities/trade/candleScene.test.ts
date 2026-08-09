import { describe, expect, test } from "vitest";

import { buildCandleScene } from "./candleScene";

const CANDLES = [
  { time: 1, open: 10, high: 12, low: 9, close: 11 },
  { time: 2, open: 11, high: 11.5, low: 8, close: 9 },
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
      [{ time: 1, open: 10, high: 11, low: 9, close: 10 }],
      100,
      50,
      6,
    );

    expect(bars[0].bodyHeight).toBeGreaterThan(0);
  });

  test("no candles yields no bars rather than throwing", () => {
    expect(buildCandleScene([], 100, 50, 6)).toEqual([]);
  });
});
