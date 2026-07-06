import { CandleChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { Candle } from "@rtc/domain";

import { chartVm } from "#/ui/equities/chart/chartVm";

afterEach(() => {
  cleanupMounted();
});

const CANDLES: readonly Candle[] = [
  { time: 0, open: 100, high: 105, low: 98, close: 102 },
  { time: 60, open: 102, high: 108, low: 101, close: 96 },
];

describe("CandleChart", () => {
  it("renders one wrapper per candle, plus the fixed 4 grid lines and 4 price labels", () => {
    const vm = chartVm(CANDLES, 96, false);
    const chart = mount(CandleChart, { props: { vm } });

    expect(chart.candleCount()).toBe(2);
    expect(chart.gridLineCount()).toBe(4);
    expect(chart.priceLabels()).toHaveLength(4);
  });

  it("marks the last candle's direction and glows it only when flashOn", () => {
    const down = chartVm(CANDLES, 96, true);
    const chart = mount(CandleChart, { props: { vm: down } });

    // last candle: open=102, close=96 -> down.
    expect(chart.lastCandleUp()).toBe(false);
    expect(chart.lastCandleGlows()).toBe(true);

    const noFlash = chartVm(CANDLES, 96, false);
    chart.setProps({ vm: noFlash });

    expect(chart.lastCandleGlows()).toBe(false);
  });

  it("renders nothing for an empty vm", () => {
    const chart = mount(CandleChart, {
      props: { vm: { candles: [], grid: [], labels: [] } },
    });

    expect(chart.candleCount()).toBe(0);
    expect(chart.gridLineCount()).toBe(0);
    expect(chart.priceLabels()).toHaveLength(0);
  });
});
