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

  it("the navigator strip carries a group role + label and stays out of the tab order", () => {
    const chart = mountChart();
    const a11y = chart.navigatorA11y();

    expect(a11y.role).toBe("group");
    expect(a11y.ariaLabel).toBe("Chart navigator");
    expect(a11y.hasTabIndex).toBe(false);
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

  it("labels frozen across new candles arriving while panned away", () => {
    const panned = mountChart();
    // Same pan as the first test above: {240,300} → {210,270}, off the live
    // edge.
    panned.dragNavigatorWindow(0.9, 0.8);
    const before = panned.timeLabels();

    // 5 new candles arrive (300 → 305) while the window sits away from the
    // live edge: followLive must leave a panned-away viewport untouched, so
    // the rendered labels — and BACK TO LIVE — don't move under the user.
    panned.setProps({
      candles: generateCandles(305),
      liveRate: candleAt(304).close,
    });

    expect(panned.timeLabels()).toEqual(before);
    expect(panned.backToLive().visible).toBe(true);

    // The follow half, cheaply: a fresh mount left at the live edge sees the
    // SAME new candles slide its window (labels change, BACK TO LIVE hides).
    const atLiveEdge = mountChart();
    const beforeAtEdge = atLiveEdge.timeLabels();

    atLiveEdge.setProps({
      candles: generateCandles(305),
      liveRate: candleAt(304).close,
    });

    expect(atLiveEdge.timeLabels()).not.toEqual(beforeAtEdge);
    expect(atLiveEdge.backToLive().visible).toBe(false);
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
      loadingOlder: false,
      historyExhausted: false,
      onLoadOlder: () => {},
    },
  });
}
