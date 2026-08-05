import { CandleChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { Candle } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const CANDLES: readonly Candle[] = [
  { time: 0, open: 100, high: 105, low: 98, close: 102, volume: 1_200_000 },
  { time: 60, open: 102, high: 108, low: 101, close: 96, volume: 1_350_000 },
];

describe("CandleChart", () => {
  it("renders one wrapper per candle, plus one grid line + on-line label per nice tick", () => {
    const chart = mount(CandleChart, {
      props: {
        candles: CANDLES,
        liveRate: 96,
        flashOn: false,
        kind: "candles",
        indicators: [],
        defaultVisible: 2,
        loadingOlder: false,
        historyExhausted: false,
        onLoadOlder: () => {},
      },
    });

    expect(chart.candleCount()).toBe(2);
    const gridTops = chart.gridLineTopVars();
    expect(gridTops.length).toBeGreaterThanOrEqual(2);
    expect(gridTops.length).toBeLessThanOrEqual(7);
    // One label per line, each centered ON its line: --ltop is the line's
    // --top wrapped in the projection's −6px centering calc.
    expect(chart.priceLabelTopVars()).toEqual(
      gridTops.map((t) => {
        return `calc(${t} - 6px)`;
      }),
    );
  });

  it("marks the last candle's direction and glows it only when flashOn", () => {
    const chart = mount(CandleChart, {
      props: {
        candles: CANDLES,
        liveRate: 96,
        flashOn: true,
        kind: "candles",
        indicators: [],
        defaultVisible: 2,
        loadingOlder: false,
        historyExhausted: false,
        onLoadOlder: () => {},
      },
    });

    // last candle: open=102, close overlaid with liveRate=96 -> down.
    expect(chart.lastCandleUp()).toBe(false);
    expect(chart.lastCandleGlows()).toBe(true);

    chart.setProps({ flashOn: false });

    expect(chart.lastCandleGlows()).toBe(false);
  });

  it("renders nothing for an empty candle series", () => {
    const chart = mount(CandleChart, {
      props: {
        candles: [],
        liveRate: 0,
        flashOn: false,
        kind: "candles",
        indicators: [],
        defaultVisible: 60,
        loadingOlder: false,
        historyExhausted: false,
        onLoadOlder: () => {},
      },
    });

    expect(chart.candleCount()).toBe(0);
    expect(chart.gridLineCount()).toBe(0);
    expect(chart.priceLabels()).toHaveLength(0);
  });
});
