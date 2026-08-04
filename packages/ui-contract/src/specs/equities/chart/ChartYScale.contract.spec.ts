/**
 * Y-scale (linear/log) contract cases — Task 5 of the log-scale plan
 * (docs/superpowers/specs/2026-08-04-log-scale-design.md).
 *
 * Two mounting strategies, mirroring ChartPanes.contract.spec.ts:
 *  - Pill → axis mode (case 1): the LOG pill renders in EqChartHead and
 *    drives the real eqWorkspace machine's `yScale` field, which ChartPanel's
 *    CandleChart reads — both mounted on one shared World (mountWith).
 *  - Rendering (cases 2-4): CandleChart takes `yScale` as a plain prop
 *    (independent of the workspace machine — ChartPanel just forwards its
 *    `state.yScale`), so these mount CandleChart directly, matching
 *    ChartPanes'/ChartInteraction's existing direct-mount style.
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

import type { EquityInstrument, EquityQuote } from "@rtc/domain";
import { chartVm } from "@rtc/motion-core";

import { candleAt, generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
];

// 300 candles, matching every other CandleChart contract spec: long enough
// that the 1D default visible window (60) is a small slice, so the default
// viewport lands deep in the series ({240, 300} — see candleFixture.ts).
const CANDLES = generateCandles(300);
const DEFAULT_VISIBLE = 60;
const LAST = candleAt(299);

describe("Y-scale pill — head pill drives the real chart column (shared eqWorkspace)", () => {
  it("LOG pill toggles the axis mode on and off, and the panel's chart follows", async () => {
    const { head, panel } = mountPillWorkspace();

    expect(head.yScaleActive()).toBe(false);
    await panel.waitUntilYScaleAttr("linear");

    await head.toggleYScale();
    expect(head.yScaleActive()).toBe(true);
    await panel.waitUntilYScaleAttr("log");

    await head.toggleYScale();
    expect(head.yScaleActive()).toBe(false);
    await panel.waitUntilYScaleAttr("linear");
  });
});

describe("Y-scale rendering — CandleChart direct mount", () => {
  it("data-yscale reflects the prop, defaulting linear", () => {
    const chart = mountChart();
    expect(chart.yScaleAttr()).toBe("linear");

    chart.setProps({ yScale: "log" });
    expect(chart.yScaleAttr()).toBe("log");
  });

  it("log mode moves candle geometry; grid and label positions hold still", () => {
    const chart = mountChart();
    const linTop = chart.candleBodyVar(30, "--top");
    const linLabels = chart.priceLabels();

    // 4 grid lines BEFORE the switch too — the case below only proves the
    // count holds if both sides of the comparison are actually asserted.
    expect(chart.visibleTestids("chart-grid-line")).toBe(4);
    expect(linLabels).toHaveLength(4);

    chart.setProps({ yScale: "log" });

    expect(chart.candleBodyVar(30, "--top")).not.toBe(linTop);
    // Same 4 labels at the same slots — only the text moved.
    expect(chart.priceLabels()).toHaveLength(linLabels.length);
    expect(chart.priceLabels()).not.toEqual(linLabels);
    expect(chart.visibleTestids("chart-grid-line")).toBe(4);
  });

  it("label text matches the log interpolation exactly", () => {
    const chart = mountChart({ yScale: "log" });
    const vm = chartVm(CANDLES, LAST.close, false, {
      viewport: { start: 240, end: 300 },
      kind: "candles",
      yScale: "log",
    });
    const lmax = Math.log10(vm.scale.cmax);
    const lrng = lmax - Math.log10(vm.scale.cmin) || 1;
    const expected = [0.12, 0.37, 0.62, 0.87].map((f) => {
      return (10 ** (lmax - f * lrng)).toFixed(2);
    });

    expect(chart.priceLabels()).toEqual(expected);
  });
});

interface PillWorkspace {
  readonly head: EqChartHeadPage;
  readonly panel: ChartPanelPage;
}

/** Mounts EqChartHead + ChartPanel on one shared World (mountWith) so a pill
 * click on the head drives the real eqWorkspace machine's `yScale` field
 * that ChartPanel's CandleChart renders from — the coupling-spec pattern
 * ChartPanes.contract.spec.ts established for two components that must react
 * to the same World. */
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
      candles: { AAPL: CANDLES },
      quotes: { AAPL: quote() },
    },
  );
  const head = mountWith(world, EqChartHead, {});
  const panel = mountWith(world, ChartPanel, {});

  return { head, panel };
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
  yScale?: "linear" | "log";
}

/** Mounts CandleChart directly with the established ChartInteraction props,
 * plus an optional `yScale` — mirrors ChartPanes.contract.spec.ts's own
 * `mountChart` helper, factored out only because every case here needs the
 * same boilerplate. */
function mountChart({ yScale }: MountChartOptions = {}): CandleChartPage {
  return mount(CandleChart, {
    props: {
      candles: CANDLES,
      liveRate: LAST.close,
      flashOn: false,
      kind: "candles",
      indicators: [],
      panes: [],
      yScale,
      defaultVisible: DEFAULT_VISIBLE,
      loadingOlder: false,
      historyExhausted: false,
      onLoadOlder: () => {},
    },
  });
}
