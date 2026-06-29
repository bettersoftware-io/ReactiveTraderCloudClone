import { PriceChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { Candle } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const CANDLES: readonly Candle[] = [
  { time: 1, open: 100, high: 105, low: 99, close: 104 },
  { time: 2, open: 104, high: 106, low: 101, close: 102 },
];

describe("PriceChart", () => {
  it("renders a labelled canvas with a NO DATA placeholder when empty", () => {
    const chart = mount(PriceChart, { props: { symbol: "AAPL" } });

    expect(chart.hasCanvasFor("AAPL")).toBe(true);
    expect(chart.isEmpty()).toBe(true);
  });

  it("drops the placeholder once candles arrive", () => {
    const chart = mount(PriceChart, {
      props: { symbol: "AAPL" },
      equities: { candles: { AAPL: CANDLES } },
    });

    expect(chart.hasCanvasFor("AAPL")).toBe(true);
    expect(chart.isEmpty()).toBe(false);
  });
});
