import { CandleChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import type { CandleChartPage } from "@ui-contract/pages/equities/chart/CandleChartPage";
import { afterEach, describe, expect, it } from "vitest";

import { candleAt, generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

const CANDLES = generateCandles(300);
const DEFAULT_VISIBLE = 60;
const LAST = candleAt(299);

describe("CandleChart — navigator brush", () => {
  it("renders the navigator with the window; hides it entirely on an empty series", () => {
    const chart = mountChart();
    expect(chart.hasNavigator()).toBe(true);

    const empty = mountChart([]);
    expect(empty.hasNavigator()).toBe(false);
  });

  it("dragging the window body left pans away from the live edge and shifts the time window", () => {
    const chart = mountChart();
    const before = chart.timeLabels();

    // −0.1 of the strip = −30 candles: {240,300} → {210,270}.
    chart.dragNavigatorWindow(0.9, 0.8);

    expect(chart.candleCount()).toBe(60);
    expect(chart.backToLive().visible).toBe(true);
    expect(chart.timeLabels()).not.toEqual(before);
  });

  it("dragging the right handle left zooms in on the window's end edge", () => {
    const chart = mountChart();

    // end 300 → 270: {240,270} = 30 candles, no longer at the live edge.
    chart.dragNavigatorHandle("right", 1, 0.9);

    expect(chart.candleCount()).toBe(30);
    expect(chart.backToLive().visible).toBe(true);
  });

  it("dragging the left handle left widens the window WITHOUT leaving the live edge", () => {
    const chart = mountChart();

    // start 240 → 210: {210,300} = 90 candles, end untouched → still live.
    chart.dragNavigatorHandle("left", 0.8, 0.7);

    expect(chart.candleCount()).toBe(90);
    expect(chart.backToLive().visible).toBe(false);
  });

  it("the right handle can never resize the window below MIN_VIEWPORT_SPAN", () => {
    const chart = mountChart();

    chart.dragNavigatorHandle("right", 1, 0);

    expect(chart.candleCount()).toBe(5);
    expect(chart.backToLive().visible).toBe(true);
  });

  it("pressing the empty track recentres the window on the pressed index", () => {
    const chart = mountChart();

    // 0.5 × 300 = idx 150 → {120, 180}: span preserved, live edge left,
    // the real last candle (299) far out of view.
    chart.pressNavigatorTrack(0.5);

    expect(chart.candleCount()).toBe(60);
    expect(chart.backToLive().visible).toBe(true);
    expect(chart.lastCandleUp()).toBeNull();
  });

  it("dragging the window back to the right edge re-enters live-follow", () => {
    const chart = mountChart();

    chart.dragNavigatorWindow(0.9, 0.5);
    expect(chart.backToLive().visible).toBe(true);

    chart.dragNavigatorWindow(0.5, 1);

    expect(chart.backToLive().visible).toBe(false);
    expect(chart.lastCandleUp()).toBe(LAST.close >= LAST.open);
  });
});

function mountChart(candles = CANDLES): CandleChartPage {
  return mount(CandleChart, {
    props: {
      candles,
      liveRate: LAST.close,
      flashOn: false,
      kind: "candles" as const,
      indicators: [],
      defaultVisible: DEFAULT_VISIBLE,
    },
  });
}
