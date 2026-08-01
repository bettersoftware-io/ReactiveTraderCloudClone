import { CandleChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import type { CandleChartPage } from "@ui-contract/pages/equities/chart/CandleChartPage";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Candle } from "@rtc/domain";

import { candleAt, generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

// 300 candles: long enough that the 1D default visible window (60) is a
// small slice of the series, exactly matching ChartInteraction's fixture —
// default viewport lands at {240, 300}, so Home ({0, 60}) undershoots the
// span (60) and fires the near-edge trigger.
const CANDLES = generateCandles(300);
const DEFAULT_VISIBLE = 60;
const LAST = candleAt(299);

/**
 * `count` candles chronologically BEFORE CANDLES[0] (time 0): the same
 * candleAt-shaped OHLCV, but with `time` shifted so every one predates the
 * series — `(i - count) * 60_000` puts the last of them one bucket before
 * time 0 and the rest walking further back, chronological throughout.
 * Prepending these to CANDLES simulates one delivered older-history page.
 */
function olderCandles(count: number): readonly Candle[] {
  return Array.from({ length: count }, (_, i) => {
    return { ...candleAt(i), time: (i - count) * 60_000 };
  });
}

interface MountBackfillOptions {
  loadingOlder?: boolean;
  historyExhausted?: boolean;
}

/** Mounts CandleChart with the established ChartInteraction props plus the
 * three backfill props — `onLoadOlder` is a fresh `vi.fn()` spy unless the
 * caller wants a shared one. */
function mountChart(
  onLoadOlder: () => void,
  { loadingOlder = false, historyExhausted = false }: MountBackfillOptions = {},
): CandleChartPage {
  return mount(CandleChart, {
    props: {
      candles: CANDLES,
      liveRate: LAST.close,
      flashOn: false,
      kind: "candles",
      indicators: [],
      defaultVisible: DEFAULT_VISIBLE,
      loadingOlder,
      historyExhausted,
      onLoadOlder,
    },
  });
}

describe("CandleChart — backfill (near-edge trigger, prepend-hold, exhaustion)", () => {
  it("idle at the live edge: never fetches, no chips", () => {
    const onLoadOlder = vi.fn();
    const chart = mountChart(onLoadOlder);

    expect(onLoadOlder).not.toHaveBeenCalled();
    expect(chart.loadingOlderChip()).toBe(false);
    expect(chart.historyStartChip()).toBe(false);
  });

  it("panning to the trigger (Home) fetches once; loadingOlder renders the chip", () => {
    const onLoadOlder = vi.fn();
    const chart = mountChart(onLoadOlder);

    chart.pressPlotKey("Home");

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(chart.loadingOlderChip()).toBe(false);

    chart.setProps({ loadingOlder: true });

    expect(chart.loadingOlderChip()).toBe(true);
    // Setting loadingOlder doesn't itself re-fire the trigger.
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it("THE HEADLINE: a prepended page holds the view — time labels unchanged, span unchanged", () => {
    const onLoadOlder = vi.fn();
    const chart = mountChart(onLoadOlder);

    chart.pressPlotKey("Home");
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    chart.setProps({ loadingOlder: true });
    const labelsBefore = chart.timeLabels();

    // The delivered page: 300 older candles prepended in front of the
    // existing series — the real gesture-fork/stitch consumption path.
    chart.setProps({
      candles: [...olderCandles(300), ...CANDLES],
      loadingOlder: false,
    });

    expect(chart.timeLabels()).toEqual(labelsBefore);
    expect(chart.candleCount()).toBe(60);
  });

  it("no re-trigger while loading: further ArrowLeft pans don't fetch again", () => {
    const onLoadOlder = vi.fn();
    const chart = mountChart(onLoadOlder);

    chart.pressPlotKey("Home");
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    chart.setProps({ loadingOlder: true });

    chart.pressPlotKey("ArrowLeft");
    chart.pressPlotKey("ArrowLeft");

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it("exhaustion: historyExhausted + Home renders START OF HISTORY, no fetch", () => {
    const onLoadOlder = vi.fn();
    const chart = mountChart(onLoadOlder, { historyExhausted: true });

    chart.pressPlotKey("Home");

    expect(chart.historyStartChip()).toBe(true);
    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it("exhausted but mid-series: panning off index 0 hides START OF HISTORY", () => {
    const onLoadOlder = vi.fn();
    const chart = mountChart(onLoadOlder, { historyExhausted: true });

    chart.pressPlotKey("Home");
    expect(chart.historyStartChip()).toBe(true);

    chart.pressPlotKey("ArrowRight");

    expect(chart.historyStartChip()).toBe(false);
  });

  it("pressing Home again after a prepend walks deeper and re-fires the trigger", () => {
    const onLoadOlder = vi.fn();
    const chart = mountChart(onLoadOlder);

    chart.pressPlotKey("Home");
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    chart.setProps({ loadingOlder: true });
    chart.setProps({
      candles: [...olderCandles(300), ...CANDLES],
      loadingOlder: false,
    });

    // Viewport shifted to {300, 360} by the prepend-hold; a second Home
    // walks all the way back to {0, 60} of the now-600-long series —
    // undershooting the span again, so the trigger fires a second time.
    chart.pressPlotKey("Home");

    expect(onLoadOlder).toHaveBeenCalledTimes(2);
  });
});
