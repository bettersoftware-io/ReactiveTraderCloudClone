/**
 * Chart drawings (trendline/hline annotations) contract cases — Task 7 of
 * the drawing-tools plan
 * (docs/superpowers/sdd/2026-08-05-drawing-tools/*).
 *
 * Two mounting strategies, mirroring ChartPanes.contract.spec.ts and
 * ChartYScale.contract.spec.ts:
 *  - Pill → plot (case 1): the TL/H-LINE pills render in EqChartHead, the
 *    plot's gesture-committed drawings render in ChartPanel's chart column —
 *    both driven by the SAME real eqDrawings machine (World.eqDrawings), so
 *    a spec that clicks a pill and draws on the plot needs both mounted on
 *    one shared World (mountWith).
 *  - Direct mounts (case 2): CandleChart takes `drawings`/`selectedDrawingId`
 *    as plain props and the draw-gesture callbacks as plain slots
 *    (independent of the eqDrawings machine — ChartPanel just forwards its
 *    state/intents), so these mount CandleChart directly with literal props
 *    and `vi.fn()` spies, matching ChartBackfill's/ChartPanes' own
 *    direct-mount style.
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
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EqDrawing } from "@rtc/client-core";
import type { Candle, EquityInstrument, EquityQuote } from "@rtc/domain";
import { chartVm, drawingScene } from "@rtc/motion-core";

import { candleAt, generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
];

// 300 candles, matching every other CandleChart contract spec: long enough
// that the 1D default visible window (60) is a small slice, so the default
// viewport lands deep in the series ({240, 300} — see candleFixture.ts).
const CANDLES = generateCandles(300);
const DEFAULT_VISIBLE = 60;
const LAST = candleAt(299);
const DEFAULT_VIEWPORT = { start: 240, end: 300 };

describe("Drawing tools — pill drives the real plot (EqChartHead + ChartPanel, shared eqDrawings)", () => {
  it("the TL pill activates, and clicking it again reverts to cursor", async () => {
    const { head } = mountPillWorkspace();

    expect(head.activeDrawTool()).toBeNull();

    await head.setDrawTool("trendline");
    expect(head.activeDrawTool()).toBe("trendline");

    await head.setDrawTool("trendline");
    expect(head.activeDrawTool()).toBeNull();
  });

  it("drawing a trendline through the plot commits exactly one drawing and auto-reverts the tool pill to cursor", async () => {
    const { head, panel } = mountPillWorkspace();

    await head.setDrawTool("trendline");
    expect(head.activeDrawTool()).toBe("trendline");

    // The tool change landed on the head's root; force the panel's OWN
    // root to re-render before gesturing on it — panel.setProps({}) reads
    // the shared eqDrawings state$ fresh regardless of whether its change
    // notification has already propagated (the same "no-op setProps forces
    // a fresh read" idiom CandleChartPage.setPointer/leavePlot use), so the
    // plot sees the CURRENT tool rather than a possibly-stale one.
    panel.setProps({});
    panel.plotPointerDown(0.2, 0.7);
    panel.plotPointerMove(0.6, 0.3);
    panel.plotPointerUp(0.6, 0.3);

    expect(panel.drawingKinds()).toEqual(["trendline"]);
    // addDrawing's own patch (EqDrawingsMachine) auto-reverts the tool to
    // cursor — "draw one, then you're manipulating" (TradingView default).
    // Cross-root effect (the gesture ran on the panel's root, the pill
    // lives on the head's), so poll rather than assert immediately —
    // mirrors ChartPanelPage.waitUntilPaneVisible's own rationale.
    await head.waitUntilDrawToolReverted();
  });

  it("symbol isolation: a drawing lives on its own symbol, not the workspace at large", async () => {
    const { head, panel } = mountPillWorkspace();

    await head.setDrawTool("hline");
    // Force the panel to observe the tool change before gesturing on it —
    // see the identical rationale in the trendline case above.
    panel.setProps({});
    // hline commits on pointerdown alone — no drag/draft phase.
    panel.plotPointerDown(0.5, 0.5);

    expect(panel.drawingVisible()).toBe(true);

    panel.selectInstrument("MSFT");
    expect(panel.drawingVisible()).toBe(false);

    panel.selectInstrument("AAPL");
    expect(panel.drawingVisible()).toBe(true);
  });
});

describe("Drawing tools — plot rendering (CandleChart mounted directly)", () => {
  it("committed trendline geometry matches an independent drawingScene projection", () => {
    const trendline = makeTrendline("t1", 250, 360, 280, 380);
    const chart = mountChart({ drawings: [trendline] });

    const vm = chartVm(CANDLES, LAST.close, false, {
      viewport: DEFAULT_VIEWPORT,
      kind: "candles",
      yScale: "linear",
    });

    const [expected] = drawingScene(
      [trendline],
      DEFAULT_VIEWPORT,
      vm.scale,
      null,
    );

    if (expected?.kind !== "trendline") {
      throw new Error("expected a trendline scene item");
    }

    expect(chart.drawingAttr(0, "data-kind")).toBe("trendline");
    expect(chart.drawingAttr(0, "x1")).toBe(String(expected.x1));
    expect(chart.drawingAttr(0, "y1")).toBe(String(expected.y1));
    expect(chart.drawingAttr(0, "x2")).toBe(String(expected.x2));
    expect(chart.drawingAttr(0, "y2")).toBe(String(expected.y2));
  });

  it("selection drives data-selected and handle count: 2 for a trendline, 1 for an hline", () => {
    const trendline = makeTrendline("t1", 250, 360, 280, 380);
    const hline = makeHline("h1", 370);
    const chart = mountChart({
      drawings: [trendline, hline],
      selectedDrawingId: "t1",
    });

    expect(chart.drawingAttr(0, "data-selected")).toBe("true");
    expect(chart.drawingAttr(1, "data-selected")).toBe("false");
    expect(chart.selectionHandleCount()).toBe(2);

    chart.setProps({ selectedDrawingId: "h1" });

    expect(chart.drawingAttr(0, "data-selected")).toBe("false");
    expect(chart.drawingAttr(1, "data-selected")).toBe("true");
    expect(chart.selectionHandleCount()).toBe(1);
  });

  it("Delete removes the selected drawing (plot focused, cursor tool)", () => {
    const trendline = makeTrendline("t1", 250, 360, 280, 380);
    const onDeleteSelected = vi.fn();
    const chart = mountChart({
      drawings: [trendline],
      selectedDrawingId: "t1",
      onDeleteSelected,
    });

    chart.pressPlotKey("Delete");

    expect(onDeleteSelected).toHaveBeenCalledTimes(1);

    // CandleChart doesn't own `drawings` itself (a plain prop) — the real
    // eqDrawings machine (proved via the pill-workspace mount above) is what
    // actually removes it; simulate that parent reaction here.
    chart.setProps({ drawings: [], selectedDrawingId: null });

    expect(chart.drawings()).toHaveLength(0);
  });

  it("empty-click deselects (onSelectDrawing observes null via a spy slot)", () => {
    const trendline = makeTrendline("t1", 250, 360, 280, 380);
    const onSelectDrawing = vi.fn();
    const chart = mountChart({
      drawings: [trendline],
      selectedDrawingId: "t1",
      onSelectDrawing,
    });

    // Far from the trendline's projected geometry (index 250-280 inside the
    // {240,300} viewport, price 360-380) — a plain click-radius pointer
    // down/up at the plot's near corner never hits it.
    chart.pointerDown(0.02, 0.02);
    chart.pointerUp(0.02, 0.02);

    expect(onSelectDrawing).toHaveBeenCalledWith(null);
  });

  it("node budget: no drawings costs nothing; each drawing adds at most 4 nodes", () => {
    const chart = mountChart({ drawings: [] });
    const base = chart.wrapNodeCount();

    chart.setProps({ drawings: [makeTrendline("t1", 250, 360, 280, 380)] });
    expect(chart.wrapNodeCount()).toBeLessThanOrEqual(base + 4);

    chart.setProps({
      drawings: [makeTrendline("t1", 250, 360, 280, 380), makeHline("h1", 370)],
    });
    expect(chart.wrapNodeCount()).toBeLessThanOrEqual(base + 8);

    // …and selecting one (handles are extra nodes too) still respects the
    // SAME per-drawing budget on top of the two-drawing baseline above.
    const twoDrawingsBase = chart.wrapNodeCount();
    chart.setProps({ selectedDrawingId: "t1" });
    expect(chart.wrapNodeCount()).toBeLessThanOrEqual(twoDrawingsBase + 4);
  });
});

interface PillWorkspace {
  readonly head: EqChartHeadPage;
  readonly panel: ChartPanelPage;
}

/** Mounts EqChartHead + ChartPanel on one shared World (mountWith) so a
 * pill click on the head drives the real eqDrawings machine's tool/drawings
 * that ChartPanel's CandleChart renders from — the coupling-spec pattern
 * ChartPanes.contract.spec.ts established for two components that must
 * react to the same World. Two instruments (not one) so the symbol-isolation
 * case has somewhere to switch to. */
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
      candles: { AAPL: CANDLES, MSFT: CANDLES },
      quotes: { AAPL: quote("AAPL"), MSFT: quote("MSFT") },
    },
  );
  const head = mountWith(world, EqChartHead, {});
  const panel = mountWith(world, ChartPanel, {});

  return { head, panel };
}

function quote(symbol: string): EquityQuote {
  return {
    symbol,
    bid: 103.9,
    ask: 104.1,
    last: 104,
    changePct: 2,
    timestamp: 0,
  };
}

interface MountChartOptions {
  candles?: readonly Candle[];
  drawings?: readonly EqDrawing[];
  selectedDrawingId?: string | null;
  onCommitDrawing?: (drawing: EqDrawing) => void;
  onSelectDrawing?: (id: string | null) => void;
  onDeleteSelected?: () => void;
}

/** Mounts CandleChart directly with the established ChartInteraction/
 * ChartBackfill props, plus the drawings-specific ones — mirrors
 * ChartPanes'/ChartYScale's own `mountChart` helper. */
function mountChart({
  candles = CANDLES,
  drawings,
  selectedDrawingId,
  onCommitDrawing,
  onSelectDrawing,
  onDeleteSelected,
}: MountChartOptions = {}): CandleChartPage {
  return mount(CandleChart, {
    props: {
      candles,
      liveRate: LAST.close,
      flashOn: false,
      kind: "candles",
      indicators: [],
      panes: [],
      defaultVisible: DEFAULT_VISIBLE,
      loadingOlder: false,
      historyExhausted: false,
      onLoadOlder: () => {},
      drawings,
      selectedDrawingId,
      onCommitDrawing,
      onSelectDrawing,
      onDeleteSelected,
    },
  });
}

/** A trendline drawing anchored at two (candle index, price) points —
 * both indices inside the fixture's default {240,300} viewport, both
 * prices inside the viewport's candle range (opens ~340-399), so its
 * projected geometry is finite and comfortably on-plot. */
function makeTrendline(
  id: string,
  aIndex: number,
  aPrice: number,
  bIndex: number,
  bPrice: number,
): EqDrawing {
  return {
    id,
    kind: "trendline",
    a: { index: aIndex, price: aPrice },
    b: { index: bIndex, price: bPrice },
  };
}

function makeHline(id: string, price: number): EqDrawing {
  return { id, kind: "hline", price };
}
