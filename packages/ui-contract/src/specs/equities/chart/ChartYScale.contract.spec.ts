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
import { chartVm, priceTicks, yToPrice } from "@rtc/motion-core";

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

  it("log mode moves candle geometry AND grid positions; tick values hold still", () => {
    const chart = mountChart();
    const linTop = chart.candleBodyVar(30, "--top");
    const linLabels = chart.priceLabels();
    const linGridTops = chart.gridLineTopVars();

    chart.setProps({ yScale: "log" });

    expect(chart.candleBodyVar(30, "--top")).not.toBe(linTop);
    // Same round prices in both modes…
    expect(chart.priceLabels()).toEqual(linLabels);
    // …at different heights (log bunches toward the top).
    expect(chart.gridLineTopVars()).not.toEqual(linGridTops);
    expect(chart.gridLineTopVars()).toHaveLength(linGridTops.length);
  });

  it("label text matches the round ticks exactly", () => {
    const chart = mountChart({ yScale: "log" });
    const vm = chartVm(CANDLES, LAST.close, false, {
      viewport: { start: 240, end: 300 },
      kind: "candles",
      yScale: "log",
    });

    const expected = [...priceTicks(vm.scale.cmin, vm.scale.cmax)]
      .reverse()
      .map((t) => {
        return t.toFixed(2);
      });

    expect(chart.priceLabels()).toEqual(expected);
  });

  it("crosshair inverts through the log mapping, not the linear one", () => {
    const chart = mountChart({ yScale: "log" });
    const vm = chartVm(CANDLES, LAST.close, false, {
      viewport: { start: 240, end: 300 },
      kind: "candles",
      yScale: "log",
    });

    // Default viewport {240, 300}; plot-centre (0.5, 0.5) — same forced
    // crosshair position ChartInteraction.contract.spec.ts uses. yFrac=0.5
    // maps to y=50 in crosshairScene's y = yFrac * 100.
    chart.setPointer(0.5, 0.5);

    expect(chart.crosshairPrice()).toBe(yToPrice(vm.scale, 50).toFixed(2));
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
