import { CandleChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { candleAt, generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

const CANDLES = generateCandles(300);
const DEFAULT_VISIBLE = 60;
const LAST = candleAt(299);

describe("CandleChart — chart-type pills (candles/line/area)", () => {
  it("switches candles → line → area, swapping the path testids in/out", () => {
    const chart = mount(CandleChart, {
      props: {
        candles: CANDLES,
        liveRate: LAST.close,
        flashOn: false,
        kind: "candles",
        indicators: [],
        defaultVisible: DEFAULT_VISIBLE,
      },
    });

    expect(chart.candleCount()).toBe(60);
    expect(chart.visibleTestids("chart-path-line")).toBe(0);
    expect(chart.visibleTestids("chart-path-area")).toBe(0);

    chart.setProps({ kind: "line" });

    expect(chart.candleCount()).toBe(0);
    expect(chart.visibleTestids("chart-path-line")).toBe(1);
    expect(chart.visibleTestids("chart-path-area")).toBe(0);

    chart.setProps({ kind: "area" });

    expect(chart.candleCount()).toBe(0);
    expect(chart.visibleTestids("chart-path-line")).toBe(1);
    expect(chart.visibleTestids("chart-path-area")).toBe(1);
  });

  it("area renders the gradient-filled path (chart-path-area)", () => {
    const chart = mount(CandleChart, {
      props: {
        candles: CANDLES,
        liveRate: LAST.close,
        flashOn: false,
        kind: "area",
        indicators: [],
        defaultVisible: DEFAULT_VISIBLE,
      },
    });

    expect(chart.visibleTestids("chart-path-area")).toBe(1);
  });
});

describe("CandleChart — indicator overlays (SMA 20 / EMA 50)", () => {
  it("toggles the SMA 20 and EMA 50 polylines independently", () => {
    const chart = mount(CandleChart, {
      props: {
        candles: CANDLES,
        liveRate: LAST.close,
        flashOn: false,
        kind: "candles",
        indicators: [],
        defaultVisible: DEFAULT_VISIBLE,
      },
    });

    expect(chart.indicatorPathIds()).toEqual([]);

    chart.setProps({ indicators: ["sma20"] });
    expect(chart.indicatorPathIds()).toEqual(["sma20"]);

    chart.setProps({ indicators: ["sma20", "ema50"] });
    expect(chart.indicatorPathIds()).toEqual(["sma20", "ema50"]);

    // Turning sma20 off leaves ema50 rendered — the two toggle independently.
    chart.setProps({ indicators: ["ema50"] });
    expect(chart.indicatorPathIds()).toEqual(["ema50"]);

    chart.setProps({ indicators: [] });
    expect(chart.indicatorPathIds()).toEqual([]);
  });
});

describe("CandleChart — volume pane", () => {
  it("renders one bar per visible candle, coloured by direction", () => {
    const chart = mount(CandleChart, {
      props: {
        candles: CANDLES,
        liveRate: LAST.close,
        flashOn: false,
        kind: "candles",
        indicators: [],
        defaultVisible: DEFAULT_VISIBLE,
      },
    });

    expect(chart.visibleTestids("chart-volume-bar")).toBe(chart.candleCount());
    // Each bar's direction matches its own candle's — proof the colouring
    // isn't just a static count-per-candle but actually direction-keyed.
    expect(chart.volumeBarUps()).toEqual(chart.candleUps());
  });
});

describe("CandleChart — time axis", () => {
  it("renders UTC HH:MM labels for the visible window", () => {
    const chart = mount(CandleChart, {
      props: {
        candles: CANDLES,
        liveRate: LAST.close,
        flashOn: false,
        kind: "candles",
        indicators: [],
        defaultVisible: DEFAULT_VISIBLE,
      },
    });

    const labels = chart.timeLabels();

    expect(labels.length).toBeGreaterThanOrEqual(3);
    // Default viewport {240,300}: one-minute buckets step every 15 candles —
    // series indices 240/255/270/285 land at 04:00/04:15/04:30/04:45 UTC.
    expect(labels).toEqual(["04:00", "04:15", "04:30", "04:45"]);
  });
});
