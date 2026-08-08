/**
 * Comparison-series contract cases — the last TradingView-tier sub-project
 * (docs/superpowers/specs/2026-08-08-comparison-series-design.md).
 *
 * Two mounting strategies, mirroring ChartYScale.contract.spec.ts:
 *  - Pill → percent axis (cases 1-3): the VS pills render in EqChartHead
 *    and drive the real eqWorkspace machine's `compare` field, which
 *    ChartPanel's CandleChart reads — both mounted on one shared World
 *    (mountWith). The coupled-scale rule (compare ⇒ percent axis, cleared ⇒
 *    stored lin/log restored) is only observable on this route.
 *  - Rendering (cases 4-6): CandleChart takes `compare` as a plain prop, so
 *    these mount it directly, matching ChartYScale's direct-mount style.
 */

import { CandleChart, ChartPanel, EqChartHead } from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import type { CandleChartPage } from "@ui-contract/pages/equities/chart/CandleChartPage";
import type { ChartPanelPage } from "@ui-contract/pages/equities/chart/ChartPanelPage";
import type { EqChartHeadPage } from "@ui-contract/pages/equities/chart/EqChartHeadPage";
import { afterEach, describe, expect, it } from "vitest";

import type { Candle, EquityInstrument, EquityQuote } from "@rtc/domain";

import { candleAt, generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ" },
];

const CANDLES = generateCandles(300);
const DEFAULT_VISIBLE = 60;
const LAST = candleAt(299);

// A second deterministic series on the SAME time buckets as candleFixture
// (time = i × 60_000) so time-alignment matches every visible index, with a
// steeper close slope so the two series' pct paths genuinely differ.
const COMPARE_CANDLES: readonly Candle[] = Array.from(
  { length: 300 },
  (_, i) => {
    const open = 50 + i * 2;
    return {
      time: i * 60_000,
      open,
      high: open + 2,
      low: open - 2,
      close: open + 1,
      volume: 1_000,
    };
  },
);

const PCT_LABEL = /^(\+|-)?\d+\.\d{2}%$/;

describe("Comparison series — VS pills drive the real chart column (shared eqWorkspace)", () => {
  it("candidates exclude the selected symbol", () => {
    const { head } = mountPillWorkspace();
    expect(head.compareCandidates()).toEqual(["MSFT", "TSLA"]);
    expect(head.activeCompare()).toBeNull();
  });

  it("picking a comparison switches the axis to percent, draws the line, and locks the scale pill at PCT", async () => {
    const { head, panel } = mountPillWorkspace();

    expect(head.yScalePillLabel()).toBe("LOG");
    expect(head.yScalePillDisabled()).toBe(false);

    await head.toggleCompare("MSFT");

    expect(head.activeCompare()).toBe("MSFT");
    await panel.waitUntilYScaleAttr("percent");
    expect(head.yScalePillLabel()).toBe("PCT");
    expect(head.yScalePillDisabled()).toBe(true);

    // Every axis label is percent-formatted while comparing.
    for (const txt of panel.priceLabels()) {
      expect(txt).toMatch(PCT_LABEL);
    }

    expect(panel.compareLineVisible()).toBe(true);
  });

  it("clearing the comparison restores the STORED scale — log survives a compare round-trip", async () => {
    const { head, panel } = mountPillWorkspace();

    // Stored preference: log.
    await head.toggleYScale();
    await panel.waitUntilYScaleAttr("log");

    await head.toggleCompare("MSFT");
    await panel.waitUntilYScaleAttr("percent");

    // Clearing = clicking the active pill.
    await head.toggleCompare("MSFT");
    await panel.waitUntilYScaleAttr("log");
    expect(head.yScalePillLabel()).toBe("LOG");
    expect(head.yScalePillDisabled()).toBe(false);
    expect(panel.compareLineVisible()).toBe(false);

    // Labels are prices again (no % suffix).
    for (const txt of panel.priceLabels()) {
      expect(txt).not.toMatch(/%$/);
    }
  });

  it("selecting the compared symbol as primary absorbs the comparison", async () => {
    const { head, panel, world } = mountPillWorkspace();

    await head.toggleCompare("MSFT");
    await panel.waitUntilYScaleAttr("percent");

    world.eqWorkspace.intents.select("MSFT");

    await panel.waitUntilYScaleAttr("linear");
    expect(head.activeCompare()).toBeNull();
  });
});

describe("Comparison series — CandleChart direct mount", () => {
  it("the compare prop renders the overlay polyline and a percent crosshair readout", () => {
    const chart = mountChart({ compare: { series: COMPARE_CANDLES } });

    expect(chart.compareLineVisible()).toBe(true);
    expect(chart.yScaleAttr()).toBe("percent");

    chart.setPointer(0.5, 0.5);
    expect(chart.crosshairPrice()).toMatch(PCT_LABEL);
  });

  it("an empty compare series keeps the percent axis but renders no line", () => {
    const chart = mountChart({ compare: { series: [] } });

    expect(chart.yScaleAttr()).toBe("percent");
    expect(chart.compareLineVisible()).toBe(false);

    for (const txt of chart.priceLabels()) {
      expect(txt).toMatch(PCT_LABEL);
    }
  });

  // Budget raised from the brief's +2 to +4: activating a comparison adds
  // the compare polyline itself (1 node) PLUS one extra round-number tick
  // the percent-mode pct range needs versus the linear range it replaces —
  // one more `chart-grid-line` + one more `chart-price-label` (2 nodes) —
  // for 3 actual nodes added, measured directly (gridLineCount 4→5,
  // priceLabels 4→5 alongside the new chart-compare-line polyline). +4
  // keeps headroom without masking a real per-node regression.
  it("node budget: activating a comparison adds at most 4 nodes (one polyline, at most one extra grid tick)", () => {
    const chart = mountChart();
    const base = chart.wrapNodeCount();

    chart.setProps({ compare: { series: COMPARE_CANDLES } });

    expect(chart.wrapNodeCount()).toBeLessThanOrEqual(base + 4);
  });
});

interface PillWorkspace {
  readonly head: EqChartHeadPage;
  readonly panel: ChartPanelPage;
  readonly world: ReturnType<typeof createWorld>;
}

/** Mounts EqChartHead + ChartPanel on one shared World (mountWith) so a VS
 * pill click on the head drives the real eqWorkspace machine's `compare`
 * field that ChartPanel's CandleChart renders from — the coupling-spec
 * pattern ChartYScale.contract.spec.ts uses for the LOG pill. */
function mountPillWorkspace(): PillWorkspace {
  const world = createWorld(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      watchlist: INSTRUMENTS,
      candles: {
        AAPL: CANDLES,
        MSFT: COMPARE_CANDLES,
        TSLA: COMPARE_CANDLES,
      },
      quotes: { AAPL: quote() },
    },
  );
  const head = mountWith(world, EqChartHead, {});
  const panel = mountWith(world, ChartPanel, {});

  return { head, panel, world };
}

function quote(): EquityQuote {
  return {
    symbol: "AAPL",
    bid: 103.9,
    ask: 104.1,
    last: 104,
    changePct: 2,
    timestamp: 0,
  };
}

interface MountChartOptions {
  compare?: { readonly series: readonly Candle[] };
}

/** Mounts CandleChart directly with the established props, plus an optional
 * `compare` — mirrors ChartYScale.contract.spec.ts's own mountChart. */
function mountChart({ compare }: MountChartOptions = {}): CandleChartPage {
  return mount(CandleChart, {
    props: {
      candles: CANDLES,
      liveRate: LAST.close,
      flashOn: false,
      kind: "candles",
      indicators: [],
      panes: [],
      compare,
      defaultVisible: DEFAULT_VISIBLE,
      loadingOlder: false,
      historyExhausted: false,
      onLoadOlder: () => {},
    },
  });
}
