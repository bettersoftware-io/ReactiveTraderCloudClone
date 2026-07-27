import { CandleChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { candleAt, generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

// 300 candles: long enough that the 1D default visible window (60) is a
// small slice of the series, so pan/zoom/Home/End viewport moves are
// observable against candles well outside the initial view.
const CANDLES = generateCandles(300);
const DEFAULT_VISIBLE = 60;
// The overall series' real last candle (index 299) — pinned so the live-rate
// overlay is a no-op and up/down assertions read straight off the fixture.
const LAST = candleAt(299);

describe("CandleChart — keyboard interaction", () => {
  it("defaults to the newest 60 candles for 1D, not the full 300-candle series", () => {
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
    expect(chart.backToLive().visible).toBe(false);
  });

  it("ArrowLeft pans away from the live edge and reveals BACK TO LIVE", () => {
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

    chart.pressPlotKey("ArrowLeft");

    // Same span (60), just shifted 6 candles (10%) toward the past.
    expect(chart.candleCount()).toBe(60);
    expect(chart.backToLive().visible).toBe(true);
  });

  it("BACK TO LIVE returns to the live edge and hides itself", () => {
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

    chart.pressPlotKey("ArrowLeft");
    expect(chart.backToLive().visible).toBe(true);

    chart.backToLive().click();

    expect(chart.backToLive().visible).toBe(false);
    expect(chart.candleCount()).toBe(60);
    // Back at the live edge, the real last candle (index 299) is in view again.
    expect(chart.lastCandleUp()).toBe(LAST.close >= LAST.open);
  });

  it("'+' zooms in (fewer candles rendered), '-' zooms out, never below 5", () => {
    const zoomedIn = mount(CandleChart, {
      props: {
        candles: CANDLES,
        liveRate: LAST.close,
        flashOn: false,
        kind: "candles",
        indicators: [],
        defaultVisible: DEFAULT_VISIBLE,
      },
    });

    zoomedIn.pressPlotKey("+");
    expect(zoomedIn.candleCount()).toBe(50);

    const zoomedOut = mount(CandleChart, {
      props: {
        candles: CANDLES,
        liveRate: LAST.close,
        flashOn: false,
        kind: "candles",
        indicators: [],
        defaultVisible: DEFAULT_VISIBLE,
      },
    });

    zoomedOut.pressPlotKey("-");
    expect(zoomedOut.candleCount()).toBe(72);

    // Repeated zoom-in keeps tightening, but never shrinks past the 5-candle
    // floor (MIN_VIEWPORT_SPAN in @rtc/motion-core's chartViewport).
    for (let i = 0; i < 30; i++) {
      zoomedIn.pressPlotKey("+");
    }

    expect(zoomedIn.candleCount()).toBeGreaterThanOrEqual(5);
    expect(zoomedIn.candleCount()).toBeLessThan(50);
  });

  it("Home jumps to the oldest window, End back to live", () => {
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

    chart.pressPlotKey("Home");

    expect(chart.candleCount()).toBe(60);
    expect(chart.backToLive().visible).toBe(true);
    // The real last candle (index 299) is far outside the oldest-60 window,
    // so it isn't rendered at all — no [data-last="true"] node exists.
    expect(chart.lastCandleUp()).toBeNull();

    chart.pressPlotKey("End");

    expect(chart.backToLive().visible).toBe(false);
    expect(chart.candleCount()).toBe(60);
    expect(chart.lastCandleUp()).toBe(LAST.close >= LAST.open);
  });

  it("pointer move shows the crosshair with the snapped candle's OHLC+V readout", () => {
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

    expect(chart.crosshairReadout()).toBeNull();

    // Default viewport is {start: 240, end: 300}; the plot-centre (0.5, 0.5)
    // snaps to series index 270 — see candleFixture.ts for the formula.
    chart.setPointer(0.5, 0.5);

    expect(chart.visibleTestids("chart-crosshair-v")).toBe(1);
    expect(chart.visibleTestids("chart-crosshair-h")).toBe(1);
    expect(chart.crosshairReadout()).toBe(
      "04:30O 370.00H 372.00L 369.00C 371.00V 1.3M",
    );
  });

  it("pointer leave hides the crosshair", () => {
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

    chart.setPointer(0.5, 0.5);
    expect(chart.crosshairReadout()).not.toBeNull();

    chart.leavePlot();

    expect(chart.crosshairReadout()).toBeNull();
    expect(chart.visibleTestids("chart-crosshair-v")).toBe(0);
    expect(chart.visibleTestids("chart-crosshair-h")).toBe(0);
  });
});
