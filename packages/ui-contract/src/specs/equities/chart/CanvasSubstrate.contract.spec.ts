/**
 * Canvas substrate contract cases — Task 5 of the canvas-substrate plan
 * (.superpowers/sdd/2026-08-09-canvas-substrate/task-5-brief.md): the
 * preference-driven geometry swap, the node-count perf pin, and a
 * canvas-mode interaction smoke (crosshair, drawing commit, compare),
 * running against BOTH web clients via the shared harness.
 *
 * `substrate` is a plain controlled prop on `CandleChart` (defaults to
 * `"dom"`, forwarded verbatim to `ChartPlot`/`VolumePane`/`IndicatorPane`) —
 * Tasks 3/4 already shipped the DOM↔canvas geometry swap itself, so every
 * case here mounts `CandleChart` DIRECTLY (the "Rendering" direct-mount
 * style ChartCompare/ChartPanes/ChartDrawings already use for props that
 * don't need the real eqWorkspace/eqDrawings machine coupling) and flips
 * `substrate` via `setProps` — no production edits, this is the shared pin.
 */

import { CandleChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import type { CandleChartPage } from "@ui-contract/pages/equities/chart/CandleChartPage";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  EqDrawing,
  EqDrawTool,
  EqIndicatorId,
  EqPaneId,
} from "@rtc/client-core";
import type { Candle, ChartSubstrate } from "@rtc/domain";

import { candleAt, generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

// 300 candles, matching every other CandleChart contract spec: long enough
// that the 1D default visible window (60) is a small slice, so the default
// viewport lands deep in the series ({240, 300} — see candleFixture.ts) —
// the SAME fixture ChartInteraction.contract.spec.ts pins its crosshair
// readout literal against, reused verbatim by case 3 below.
const CANDLES = generateCandles(300);
const DEFAULT_VISIBLE = 60;
const LAST = candleAt(299);

// A second deterministic series on the SAME time buckets as candleFixture
// (time = i × 60_000), identical construction to ChartCompare.contract.spec.ts's
// own COMPARE_CANDLES (duplicated per this repo's established per-spec-file
// fixture convention) — a steeper close slope so the two series' pct paths
// genuinely differ.
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

describe("Canvas substrate — preference-driven geometry swap (shared harness)", () => {
  it("substrate=canvas swaps plot geometry DOM for one canvas and back", () => {
    const trendline = makeTrendline("t1", 250, 360, 280, 380);
    const chart = mountChart({
      indicators: ["sma20"],
      drawings: [trendline],
    });

    chart.setPointer(0.5, 0.5);

    // DOM mode: every per-datum geometry layer is real DOM.
    expect(chart.candleCount()).toBeGreaterThan(0);
    expect(chart.gridLineCount()).toBeGreaterThan(0);
    expect(chart.visibleTestids("chart-indicator-path")).toBe(1);
    expect(chart.drawings()).toHaveLength(1);
    expect(chart.visibleTestids("chart-crosshair-v")).toBe(1);
    expect(chart.visibleTestids("chart-crosshair-h")).toBe(1);
    expect(chart.visibleTestids("chart-volume-bar")).toBeGreaterThan(0);
    expect(chart.visibleTestids("chart-canvas-plot")).toBe(0);
    expect(chart.priceLabels().length).toBeGreaterThan(0);
    expect(chart.timeLabels().length).toBeGreaterThan(0);

    chart.setProps({ substrate: "canvas" });

    // Canvas mode: one canvas host replaces every geometry layer above —
    // text (price labels, time axis) stays DOM either way.
    expect(chart.visibleTestids("chart-canvas-plot")).toBe(1);
    expect(chart.candleCount()).toBe(0);
    expect(chart.gridLineCount()).toBe(0);
    expect(chart.visibleTestids("chart-indicator-path")).toBe(0);
    expect(chart.drawings()).toHaveLength(0);
    expect(chart.visibleTestids("chart-crosshair-v")).toBe(0);
    expect(chart.visibleTestids("chart-crosshair-h")).toBe(0);
    expect(chart.visibleTestids("chart-volume-bar")).toBe(0);
    expect(chart.priceLabels().length).toBeGreaterThan(0);
    expect(chart.timeLabels().length).toBeGreaterThan(0);
    // The DOM-only DrawingsLayer is gone, but the scene still carries the
    // drawing — canvasAttr is the substrate-neutral witness for it.
    expect(chart.canvasAttr("data-drawings")).toBe("1");

    chart.setProps({ substrate: "dom" });

    // Flipping back restores the DOM geometry byte-for-byte.
    expect(chart.visibleTestids("chart-canvas-plot")).toBe(0);
    expect(chart.candleCount()).toBeGreaterThan(0);
    expect(chart.gridLineCount()).toBeGreaterThan(0);
    expect(chart.visibleTestids("chart-indicator-path")).toBe(1);
    expect(chart.drawings()).toHaveLength(1);
  });

  // Measured directly against BOTH clients (a temporary console.log during
  // authoring, since removed — see task-5-report.md): with panes
  // ["rsi","macd"] + a compare series + 2 drawings, DOM mode renders 287
  // nodes under the wrap (the viewport only ever paints `defaultVisible`
  // (60) candles, not the full 300-candle fixture — each a 3-node wrapper,
  // plus the volume bars and both panes' SVG guides/lines/histogram);
  // canvas mode collapses all of that to 3 `<canvas>` hosts plus the
  // unchanged text layers, 28 nodes — IDENTICAL on react and solid (no
  // compiler-emitted wrapper-node skew here, unlike the coverage report's
  // statement counts). `- 200` stays comfortably below 287 and far above
  // 28, so it can't mask a regression in either direction; the literal
  // ceiling pins the canvas side too.
  it("node-count pin: canvas mode collapses the plot's per-datum DOM", () => {
    const drawings = [
      makeTrendline("t1", 250, 360, 280, 380),
      makeHline("h1", 370),
    ];

    const chart = mountChart({
      panes: ["rsi", "macd"],
      compare: { series: COMPARE_CANDLES },
      drawings,
    });

    const domNodes = chart.wrapNodeCount();

    chart.setProps({ substrate: "canvas" });

    const canvasNodes = chart.wrapNodeCount();

    // The visible-window candle wrappers (3 nodes each), the volume bars,
    // and both panes' SVG geometry all collapse to canvas hosts.
    expect(canvasNodes).toBeLessThan(domNodes - 200);
    // A generous, literal ceiling on the collapsed side — this is the
    // number that would move if a canvas-mode regression started emitting
    // per-datum DOM again alongside the canvas host.
    expect(canvasNodes).toBeLessThanOrEqual(60);
    expect(chart.visibleTestids("chart-canvas-plot")).toBe(1);
  });

  it("canvas-mode crosshair: readout text works without hairline DOM", () => {
    const chart = mountChart({ substrate: "canvas" });

    // Same fixture + pointer position as ChartInteraction.contract.spec.ts's
    // own forced-crosshair case — the readout text is substrate-neutral
    // (crosshairVm never reads `substrate`), so the literal is reused
    // verbatim rather than recomputed.
    chart.setPointer(0.5, 0.5);

    expect(chart.crosshairReadout()).toBe(
      "04:30O 370.00H 372.00L 369.00C 371.00V 1.3M",
    );
    expect(chart.visibleTestids("chart-crosshair-v")).toBe(0);
    expect(chart.visibleTestids("chart-crosshair-h")).toBe(0);
  });

  it("canvas-mode drawing commit: intents + data-drawings witness + DOM-mode survival", () => {
    const onCommitDrawing = vi.fn();
    const chart = mountChart({
      substrate: "canvas",
      drawTool: "trendline",
      onCommitDrawing,
    });

    chart.pointerDown(0.2, 0.7);
    chart.setPointer(0.6, 0.3);
    chart.pointerUp(0.6, 0.3);

    expect(onCommitDrawing).toHaveBeenCalledTimes(1);

    // CandleChart doesn't own `drawings` itself (a plain prop) — simulate
    // the parent's reaction, the same convention ChartDrawings'
    // "Delete removes the selected drawing" direct-mount case uses.
    const committed = onCommitDrawing.mock.calls[0]?.[0] as EqDrawing;
    chart.setProps({ drawings: [committed] });

    expect(chart.canvasAttr("data-drawings")).toBe("1");

    chart.setProps({ substrate: "dom" });

    // The committed drawing is plain prop state (owned by the caller, not
    // the substrate) — it survives the swap unchanged.
    expect(
      chart.drawings().map((d) => {
        return d.getAttribute("data-kind");
      }),
    ).toEqual(["trendline"]);
  });

  // Title says exactly what this asserts — no pill. The PCT pill itself is
  // head-level eqWorkspace machine state, substrate-independent (EqChartHead
  // never reads `substrate`), and its lock (pill label "PCT" + disabled)
  // is already pinned substrate-independently by ChartCompare.contract.spec.ts's
  // workspace-mounted "picking a comparison switches the axis to percent…"
  // case — re-asserting it here would just be a second, narrower copy of
  // that same coverage under a different substrate that can't move it.
  it("canvas-mode compare: percent axis + data-compare witness, compare line never DOM", () => {
    const chart = mountChart({
      substrate: "canvas",
      compare: { series: COMPARE_CANDLES },
    });

    expect(chart.yScaleAttr()).toBe("percent");
    expect(chart.canvasAttr("data-compare")).toBe("true");
    expect(chart.visibleTestids("chart-compare-line")).toBe(0);
  });
});

interface MountChartOptions {
  substrate?: ChartSubstrate;
  indicators?: readonly EqIndicatorId[];
  panes?: readonly EqPaneId[];
  compare?: { readonly series: readonly Candle[] };
  drawings?: readonly EqDrawing[];
  drawTool?: EqDrawTool;
  onCommitDrawing?: (drawing: EqDrawing) => void;
}

/** Mounts CandleChart directly with the established ChartInteraction props,
 * plus the canvas-substrate-specific ones — mirrors ChartPanes'/ChartYScale's
 * own `mountChart` helper. */
function mountChart({
  substrate,
  indicators = [],
  panes = [],
  compare,
  drawings,
  drawTool,
  onCommitDrawing,
}: MountChartOptions = {}): CandleChartPage {
  return mount(CandleChart, {
    props: {
      candles: CANDLES,
      liveRate: LAST.close,
      flashOn: false,
      kind: "candles",
      indicators,
      panes,
      compare,
      substrate,
      defaultVisible: DEFAULT_VISIBLE,
      loadingOlder: false,
      historyExhausted: false,
      onLoadOlder: () => {},
      drawings,
      drawTool,
      onCommitDrawing,
    },
  });
}

/** A trendline drawing anchored at two (candle index, price) points — the
 * same construction ChartDrawings.contract.spec.ts's own `makeTrendline`
 * uses (duplicated per this repo's established per-spec-file convention),
 * with both indices inside the fixture's default {240,300} viewport and
 * both prices inside the viewport's candle range. */
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
