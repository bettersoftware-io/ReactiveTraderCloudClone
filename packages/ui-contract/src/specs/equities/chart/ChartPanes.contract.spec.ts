/**
 * Indicator panes (RSI/MACD) contract cases — Task 6 of the indicator-panes
 * plan (docs/superpowers/specs/2026-08-02-indicator-panes-design.md).
 *
 * Two mounting strategies, matching where each half of the feature lives:
 *  - Pill → pane (cases 1-3): the pills render in EqChartHead, the panes in
 *    ChartPanel's chart column — both driven by the SAME real eqWorkspace
 *    machine, so a spec that clicks a pill and asserts a pane needs both
 *    mounted on one shared World (mountWith), mirroring the
 *    IncidentControls ↔ ConnectionOverlay coupling spec.
 *  - Pane rendering (cases 4-7): CandleChart takes `panes` as a plain prop
 *    (independent of the workspace machine — ChartPanel just forwards its
 *    `state.panes`), so these mount CandleChart directly with an explicit
 *    `panes` array, matching ChartInteraction/ChartTypesAndOverlays'
 *    existing direct-mount style.
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

import type { EqPaneId } from "@rtc/client-core";
import type { Candle, EquityInstrument, EquityQuote } from "@rtc/domain";

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

describe("Indicator panes — pill toggles the real chart-column pane (EqChartHead + ChartPanel, shared eqWorkspace)", () => {
  it("clicking the RSI pill mounts the RSI pane; clicking again removes it", async () => {
    const { head, panel } = mountPillWorkspace();

    expect(panel.paneVisible("rsi")).toBe(false);

    await head.togglePane("rsi");
    expect(head.activePanes()).toEqual(["rsi"]);
    await panel.waitUntilPaneVisible("rsi");

    await head.togglePane("rsi");
    expect(head.activePanes()).toEqual([]);
    await panel.waitUntilPaneHidden("rsi");
  });

  it("activating rsi then macd renders both, rsi first in DOM order", async () => {
    const { head, panel } = mountPillWorkspace();

    await head.togglePane("rsi");
    await panel.waitUntilPaneVisible("rsi");

    await head.togglePane("macd");
    await panel.waitUntilPaneVisible("macd");

    expect(head.activePanes()).toEqual(["rsi", "macd"]);
    expect(panel.paneOrder()).toEqual(["rsi", "macd"]);
  });

  it("data-panes tracks the active count: 0 → 1 → 2", async () => {
    const { head, panel } = mountPillWorkspace();

    expect(panel.panesAttr()).toBe(0);

    await head.togglePane("rsi");
    await panel.waitUntilPanesAttr(1);

    await head.togglePane("macd");
    await panel.waitUntilPanesAttr(2);
  });
});

describe("Indicator panes — chart-column rendering (CandleChart mounted directly)", () => {
  it("forced crosshair state: RSI shows its label + a number, MACD shows its 3 rows", () => {
    const chart = mountChart({ panes: ["rsi", "macd"] });

    // Default viewport {240, 300}: plot-centre (0.5, 0.5) snaps to series
    // index 270 (ChartInteraction.contract.spec.ts's own forced-crosshair
    // position) — comfortably past every warm-up window (RSI_WINDOW=14,
    // MACD's slow/signal warm-up), so every row reads a real number.
    chart.setPointer(0.5, 0.5);

    expect(chart.paneReadoutText("rsi")).toHaveLength(1);
    expect(chart.paneReadoutText("rsi")[0]).toMatch(/^RSI -?\d+\.\d$/);

    const macdRows = chart.paneReadoutText("macd");
    expect(macdRows).toHaveLength(3);
    expect(macdRows[0]).toMatch(/^MACD -?\d+\.\d\d$/);
    expect(macdRows[1]).toMatch(/^SIG -?\d+\.\d\d$/);
    expect(macdRows[2]).toMatch(/^HIST -?\d+\.\d\d$/);
  });

  it("hovering a pane extends the shared crosshair without the main plot's own horizontal hairline", () => {
    const chart = mountChart({ panes: ["rsi", "macd"] });

    expect(chart.visibleTestids("chart-crosshair-v")).toBe(0);

    chart.setPanePointer("rsi", 0.5);

    // A pane's own hover sets inPlot:false — CrosshairOverlay hides just its
    // `.h` hairline (ChartPlot's showHorizontal={cursor?.inPlot}); the
    // vertical line + OHLCV readout, and every pane's own crosshair echo,
    // are unaffected — the shared xFrac cursor still drives them all.
    expect(chart.visibleTestids("chart-crosshair-h")).toBe(0);
    expect(chart.visibleTestids("chart-crosshair-v")).toBe(1);
    expect(chart.visibleTestids("chart-pane-crosshair-v")).toBe(2);
    expect(chart.paneReadoutText("rsi")).toHaveLength(1);
    expect(chart.paneReadoutText("macd")).toHaveLength(3);
  });

  it("warm-up readout: a crosshair index still inside warm-up reads the em-dash", () => {
    // A short series (== defaultVisible) puts the live-edge viewport at
    // {0, 60}, so a near-left crosshair position lands well inside both
    // RSI_WINDOW (14) and MACD's slow/signal warm-up.
    const warmCandles = generateCandles(60);
    const chart = mountChart({
      candles: warmCandles,
      panes: ["rsi", "macd"],
    });

    // idx = round(viewport.start + xFrac*span - 0.5) = round(0.05*60-0.5) = 3.
    chart.setPointer(0.05, 0.5);

    expect(chart.paneReadoutText("rsi")).toEqual(["RSI —"]);
    expect(chart.paneReadoutText("macd")).toEqual([
      "MACD —",
      "SIG —",
      "HIST —",
    ]);
  });

  it("overlays and panes toggle independently of each other", () => {
    const chart = mountChart();

    chart.setProps({ indicators: ["sma20"] });
    expect(chart.indicatorPathIds()).toEqual(["sma20"]);
    // Toggling an overlay never mounts a pane.
    expect(chart.panesAttr()).toBe(0);
    expect(chart.paneVisible("rsi")).toBe(false);

    chart.setProps({ panes: ["rsi"] });
    expect(chart.paneVisible("rsi")).toBe(true);
    // …and toggling a pane leaves the overlay untouched.
    expect(chart.indicatorPathIds()).toEqual(["sma20"]);

    chart.setProps({ indicators: [] });
    // Clearing the overlay leaves the pane untouched, the other way round.
    expect(chart.paneVisible("rsi")).toBe(true);
    expect(chart.indicatorPathIds()).toEqual([]);
  });

  it("+40-node budget: activating both panes stays within the pre-registered tripwire", () => {
    // WHY (design doc §8, "Perf tripwire (pre-registered)" — written before
    // the DOM-vs-canvas decision, so it's a measurement, not a feeling):
    // a contract test asserts the chart column's total element count with
    // BOTH panes active is at most +40 nodes over the no-panes baseline
    // measured in the SAME test. The MACD histogram renders as one batched
    // SVG path per pane (never one node per bar) — that batching is what
    // keeps this budget holdable; a regression back to per-bar DOM nodes
    // fails this test loudly, which is the whole point of pre-registering
    // the number instead of discovering it after the fact.
    const chart = mountChart();
    const base = chart.wrapNodeCount();

    chart.setProps({ panes: ["rsi", "macd"] });

    expect(chart.wrapNodeCount()).toBeLessThanOrEqual(base + 40);
  });
});

interface PillWorkspace {
  readonly head: EqChartHeadPage;
  readonly panel: ChartPanelPage;
}

/** Mounts EqChartHead + ChartPanel on one shared World (mountWith) so a
 * pill click on the head drives the real eqWorkspace machine's `panes` set
 * that ChartPanel's CandleChart renders from — the coupling-spec pattern
 * IncidentControls.contract.spec.ts established for two components that
 * must react to the same World. */
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
  candles?: readonly Candle[];
  panes?: readonly EqPaneId[];
}

/** Mounts CandleChart directly with the established ChartInteraction props,
 * plus an optional `panes` array — mirrors ChartTypesAndOverlays'/
 * ChartInteraction's own `mount(CandleChart, {...})` inline style, factored
 * out only because every pane case needs the same boilerplate. */
function mountChart({
  candles = CANDLES,
  panes = [],
}: MountChartOptions = {}): CandleChartPage {
  return mount(CandleChart, {
    props: {
      candles,
      liveRate: LAST.close,
      flashOn: false,
      kind: "candles",
      indicators: [],
      panes,
      defaultVisible: DEFAULT_VISIBLE,
      loadingOlder: false,
      historyExhausted: false,
      onLoadOlder: () => {},
    },
  });
}
