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
import type { World } from "@ui-contract/harness/world";
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

import type { EqDrawing, EqDrawingsState } from "@rtc/client-core";
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

  it("a history prepend shifts a drawn trendline's anchors by exactly grewBy (geometry unchanged); an ordinary live append leaves the machine's anchors untouched", async () => {
    const { head, panel, world } = mountPillWorkspace();

    await head.setDrawTool("trendline");
    // Force the panel to observe the tool change before gesturing on it —
    // see the identical rationale in the earlier trendline case.
    panel.setProps({});
    panel.plotPointerDown(0.2, 0.7);
    panel.plotPointerMove(0.6, 0.3);
    panel.plotPointerUp(0.6, 0.3);

    expect(panel.drawingKinds()).toEqual(["trendline"]);

    const before = {
      x1: panel.drawingAttr(0, "x1"),
      y1: panel.drawingAttr(0, "y1"),
      x2: panel.drawingAttr(0, "x2"),
      y2: panel.drawingAttr(0, "y2"),
    };

    // Deliver a prepended history page — the same construction
    // ChartBackfill.contract.spec.ts uses (grewBy older candles, strictly
    // before the existing series' first candle) — pushed through the
    // World's candle port directly, since this mount reads candles via
    // useCandles(sym, timeframe) rather than a CandleChart prop. The
    // viewport shifts by the SAME grewBy (useChartGestures' own prepend
    // fork), so if CandleChart's onShiftAnchors fired with exactly that
    // grewBy the anchor shift and the viewport shift cancel out and the
    // projected line lands in EXACTLY the same place; any other count
    // (including zero, i.e. the guard not firing at all) would move it.
    const grewBy = 50;
    world.setCandles("AAPL", [...olderCandles(grewBy), ...CANDLES]);
    // Force a fresh read/flush — same no-op setProps idiom used above.
    panel.setProps({});

    expect({
      x1: panel.drawingAttr(0, "x1"),
      y1: panel.drawingAttr(0, "y1"),
      x2: panel.drawingAttr(0, "x2"),
      y2: panel.drawingAttr(0, "y2"),
    }).toEqual(before);

    // Negative: an ordinary LIVE APPEND (one new candle at the tail, newer
    // than the series — candles[0] unchanged) must NOT trip the prepend
    // guard. Assert through the REAL machine's own state, not projected
    // geometry (which may legitimately move as the viewport follows live)
    // — reference-equal to the pre-append array proves onShiftAnchors was
    // never even called, not just called with by=0.
    const drawingsBeforeAppend = eqDrawingsState(world).drawings.AAPL;
    const seriesSoFar = world.candlesFor("AAPL").getValue();
    const lastTime = seriesSoFar[seriesSoFar.length - 1]?.time ?? 0;
    world.setCandles("AAPL", [
      ...seriesSoFar,
      { ...candleAt(seriesSoFar.length), time: lastTime + 60_000 },
    ]);
    panel.setProps({});

    expect(eqDrawingsState(world).drawings.AAPL).toBe(drawingsBeforeAppend);
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

describe("Drawing tools — drag-edit (ChartPanel, shared eqDrawings)", () => {
  it("dragging the selected trendline's endpoint handle moves that end only, and the geometry survives a re-render (machine-committed, not preview-only)", async () => {
    const { head, panel, world } = mountPillWorkspace();

    await head.setDrawTool("trendline");
    // Force the panel to observe the tool change before gesturing on it —
    // see the identical rationale in the pill-drives-plot describe above.
    panel.setProps({});
    panel.plotPointerDown(0.2, 0.7);
    panel.plotPointerMove(0.6, 0.3);
    panel.plotPointerUp(0.6, 0.3);

    // addDrawing's own patch (EqDrawingsMachine) both auto-selects the new
    // drawing AND reverts the tool to cursor — the very next pointer-down
    // below lands as a cursor-tool grip test, not a second trendline draft.
    expect(panel.drawingKinds()).toEqual(["trendline"]);
    expect(panel.drawingAttr(0, "data-selected")).toBe("true");

    const x1 = panel.drawingAttr(0, "x1");
    const y1 = panel.drawingAttr(0, "y1");
    const x2 = panel.drawingAttr(0, "x2");
    const y2 = panel.drawingAttr(0, "y2");

    // Grab the b endpoint's own rendered handle exactly (distance 0, well
    // inside HANDLE_TOL_PCT) and drag it far away — 0.4/0.15 lands many
    // multiples of the plot's stubbed 500x50 rect beyond the 4px
    // click/drag threshold, so this commits rather than merely selecting.
    panel.plotPointerDown(Number(x2) / 100, Number(y2) / 100);
    panel.plotPointerMove(0.4, 0.15);
    panel.plotPointerUp(0.4, 0.15);

    const newX2 = panel.drawingAttr(0, "x2");
    const newY2 = panel.drawingAttr(0, "y2");

    expect(newX2).not.toBe(x2);
    expect(newY2).not.toBe(y2);
    // The "a" endpoint is untouched by a "b"-grip drag (dragDrawing only
    // replaces the matching endpoint) — byte-identical since it's the same
    // deterministic projection re-run over an unchanged anchor.
    expect(panel.drawingAttr(0, "x1")).toBe(x1);
    expect(panel.drawingAttr(0, "y1")).toBe(y1);

    // Persistence check: force an UNRELATED re-render and confirm the
    // dragged geometry is still there — proves it's a real EqDrawingsMachine
    // update (onUpdateDrawing → updateDrawing), not a transient editDrag
    // preview that happened to render the same numbers at pointer-up.
    // Deliberately a SAME-LENGTH tail update (bump the last candle's close
    // in place), not a growing tail append: this mount's default viewport
    // ({240,300} of 300 candles) sits exactly at the live edge, so a
    // genuine tail APPEND would trigger useChartGestures' own
    // followLive fold and shift the viewport (and so every drawing's
    // projected x) by one candle — a real, harmless effect, but one that
    // would confound a byte-equality check on x2 with an unrelated cause.
    // Holding candles.length and candles[0].time fixed keeps the viewport
    // (and so the projection) untouched, isolating the persistence check.
    const seriesSoFar = world.candlesFor("AAPL").getValue();
    const lastIdx = seriesSoFar.length - 1;
    const last = seriesSoFar[lastIdx];

    if (!last) {
      throw new Error("expected at least one candle");
    }

    world.setCandles("AAPL", [
      ...seriesSoFar.slice(0, lastIdx),
      { ...last, close: last.close + 1 },
    ]);
    panel.setProps({});

    expect(panel.drawingAttr(0, "x2")).toBe(newX2);
    expect(panel.drawingAttr(0, "y2")).toBe(newY2);
  });

  it("dragging the line body translates both ends (rigid)", async () => {
    const { head, panel } = mountPillWorkspace();

    await head.setDrawTool("trendline");
    panel.setProps({});
    panel.plotPointerDown(0.2, 0.7);
    panel.plotPointerMove(0.6, 0.3);
    panel.plotPointerUp(0.6, 0.3);

    const x1 = Number(panel.drawingAttr(0, "x1"));
    const y1 = Number(panel.drawingAttr(0, "y1"));
    const x2 = Number(panel.drawingAttr(0, "x2"));
    const y2 = Number(panel.drawingAttr(0, "y2"));

    // The segment's own midpoint — far outside HANDLE_TOL_PCT (2.5%) from
    // either endpoint given this fixture's ~40%-wide draw, so this hits the
    // "body" grip, not a handle.
    const midXFrac = (x1 + x2) / 2 / 100;
    const midYFrac = (y1 + y2) / 2 / 100;
    const dxFrac = 0.15;
    const dyFrac = -0.1;

    panel.plotPointerDown(midXFrac, midYFrac);
    panel.plotPointerMove(midXFrac + dxFrac, midYFrac + dyFrac);
    panel.plotPointerUp(midXFrac + dxFrac, midYFrac + dyFrac);

    const newX1 = Number(panel.drawingAttr(0, "x1"));
    const newY1 = Number(panel.drawingAttr(0, "y1"));
    const newX2 = Number(panel.drawingAttr(0, "x2"));
    const newY2 = Number(panel.drawingAttr(0, "y2"));

    expect(newX1).not.toBe(x1);
    expect(newX2).not.toBe(x2);
    expect(newY1).not.toBe(y1);
    expect(newY2).not.toBe(y2);

    // Rigid translate: the segment's own shape (both deltas) is preserved,
    // not just "both ends moved" — dragDrawing's body branch applies ONE
    // index delta and ONE y%-delta to both anchors identically.
    const EPSILON = 0.01;

    expect(Math.abs(newX2 - newX1 - (x2 - x1))).toBeLessThan(EPSILON);
    expect(Math.abs(newY2 - newY1 - (y2 - y1))).toBeLessThan(EPSILON);

    // Shape alone doesn't pin MAGNITUDE — a double-application bug (e.g.
    // committing off the already-dragged preview instead of the original
    // committed drawing) would double the offset while leaving the
    // segment's own shape untouched, and both assertions above would still
    // pass. Pin the actual displacement against the pointer's OWN delta:
    // dragDrawing's body branch is a rigid translate of exactly
    // round(dxFrac*span) candles and dyFrac*100 percent, applied ONCE.
    // DEFAULT_VISIBLE doubles as the span here — this test never pans, so
    // the viewport stays exactly {240,300} (a 60-candle span) throughout.
    const expectedXShift =
      (Math.round(dxFrac * DEFAULT_VISIBLE) / DEFAULT_VISIBLE) * 100;
    const expectedYShift = dyFrac * 100;

    expect(newX1 - x1).toBeCloseTo(expectedXShift, 2);
    expect(newX2 - x2).toBeCloseTo(expectedXShift, 2);
    expect(newY1 - y1).toBeCloseTo(expectedYShift, 2);
    expect(newY2 - y2).toBeCloseTo(expectedYShift, 2);
  });

  it("Escape mid-drag reverts to the committed geometry byte-for-byte", async () => {
    const { head, panel } = mountPillWorkspace();

    await head.setDrawTool("trendline");
    panel.setProps({});
    panel.plotPointerDown(0.2, 0.7);
    panel.plotPointerMove(0.6, 0.3);
    panel.plotPointerUp(0.6, 0.3);

    const committed = {
      x1: panel.drawingAttr(0, "x1"),
      y1: panel.drawingAttr(0, "y1"),
      x2: panel.drawingAttr(0, "x2"),
      y2: panel.drawingAttr(0, "y2"),
    };

    panel.plotPointerDown(
      Number(committed.x2) / 100,
      Number(committed.y2) / 100,
    );
    panel.plotPointerMove(0.05, 0.9);
    panel.pressPlotKey("Escape");
    // The eventual real pointer-up for the now-discarded edit must not
    // resurrect or commit it (mirrors useChartGestures.test.ts's own
    // "Escape mid-editDrag discards it; the eventual stale pointer-up
    // no-ops" case).
    panel.plotPointerUp(0.05, 0.9);

    expect({
      x1: panel.drawingAttr(0, "x1"),
      y1: panel.drawingAttr(0, "y1"),
      x2: panel.drawingAttr(0, "x2"),
      y2: panel.drawingAttr(0, "y2"),
    }).toEqual(committed);
  });

  it("a no-move tap on a handle keeps the selection (the deselect trap)", async () => {
    const { head, panel, world } = mountPillWorkspace();

    await head.setDrawTool("trendline");
    panel.setProps({});
    panel.plotPointerDown(0.2, 0.7);
    panel.plotPointerMove(0.6, 0.3);
    panel.plotPointerUp(0.6, 0.3);

    expect(panel.drawingAttr(0, "data-selected")).toBe("true");

    const x1 = Number(panel.drawingAttr(0, "x1"));
    const y1 = Number(panel.drawingAttr(0, "y1"));
    const x2 = Number(panel.drawingAttr(0, "x2"));
    const y2 = Number(panel.drawingAttr(0, "y2"));

    // Self-documenting geometry: the trap only bites at a point where the
    // HANDLE test hits (≤2.5%) but the plain click/body test would MISS
    // (>1.5%) — tapping the endpoint itself (dist 0 from both) can't
    // exercise that gap. Move OUT along the segment's own direction, past
    // the b endpoint: for a point beyond the endpoint, point-to-segment
    // distance clamps to point-to-endpoint distance, so handle dist and
    // body dist are the SAME number — pick that number between the two
    // tolerances. Computed from the drawing's own rendered geometry, not
    // guessed, and asserted below (mirrors the pan case's own guard).
    const dx = x2 - x1;
    const dy = y2 - y1;
    const segLen = Math.hypot(dx, dy);
    const OFFSET_PCT = 2;
    const tapX = x2 + (dx / segLen) * OFFSET_PCT;
    const tapY = y2 + (dy / segLen) * OFFSET_PCT;

    const handleDist = Math.hypot(tapX - x2, tapY - y2);
    const bodyDist = distanceToSegment(tapX, tapY, x1, y1, x2, y2);

    expect(handleDist).toBeLessThanOrEqual(2.5);
    expect(bodyDist).toBeGreaterThan(1.5);

    const bxFrac = tapX / 100;
    const byFrac = tapY / 100;

    // The load-bearing assertion is on the underlying machine INTENT, not
    // just the resulting `data-selected` value: grabbing an "a"/"b" handle
    // opens an editDrag preview that projects the grabbed endpoint to
    // wherever the pointer CURRENTLY is (dragDrawing's endpoint branch is
    // an ABSOLUTE reprojection, not a from→to delta) — and that preview is
    // already live by the time this pointer-up's fall-through click (were
    // it to fire) would hit-test, so a fall-through click would very
    // likely re-select the SAME drawing anyway (its own preview has
    // already snapped to within a candle-width of the tap point). A
    // `data-selected==="true"` check alone can't tell "kept selected via
    // editDrag's early return" apart from "deselected, then silently
    // reselected via that self-referential fallback" — verified empirically
    // (see task-6-report.md's mutation-check notes). Spying on the real
    // machine's `selectDrawing` intent sidesteps that entirely: it must
    // NEVER be invoked by a no-move tap, regardless of what it would have
    // been invoked WITH.
    const selectDrawingSpy = vi.spyOn(
      world.eqDrawings.intents,
      "selectDrawing",
    );

    // Down and up at the EXACT same point (0px excursion, well under
    // CLICK_MAX_PX): endDrag's editDrag branch must return without falling
    // through to onPlotClick.
    panel.plotPointerDown(bxFrac, byFrac);
    panel.plotPointerUp(bxFrac, byFrac);

    expect(selectDrawingSpy).not.toHaveBeenCalled();
    expect(panel.drawingAttr(0, "data-selected")).toBe("true");
  });

  it("pointer-down on empty plot with a selection still pans (drag-edit never steals the pan)", async () => {
    const { head, panel } = mountPillWorkspace();

    await head.setDrawTool("trendline");
    panel.setProps({});
    panel.plotPointerDown(0.2, 0.7);
    panel.plotPointerMove(0.6, 0.3);
    panel.plotPointerUp(0.6, 0.3);

    const beforeX1 = panel.drawingAttr(0, "x1");
    const x1 = Number(beforeX1);
    const y1 = Number(panel.drawingAttr(0, "y1"));
    const x2 = Number(panel.drawingAttr(0, "x2"));
    const y2 = Number(panel.drawingAttr(0, "y2"));

    // Computed, not guessed: the plot's far corner (2%, 2%) must sit outside
    // BOTH hitTestGrip's handle tolerance (2.5%, point distance — always
    // >= the segment distance below) and its body tolerance (1.5%, segment
    // distance) or this case would silently exercise a drag-edit instead of
    // a pan.
    const missXFrac = 0.02;
    const missYFrac = 0.02;
    const missDistPct = distanceToSegment(
      missXFrac * 100,
      missYFrac * 100,
      x1,
      y1,
      x2,
      y2,
    );

    expect(missDistPct).toBeGreaterThan(2.5);

    panel.plotPointerDown(missXFrac, missYFrac);
    panel.plotPointerMove(missXFrac + 0.3, missYFrac);
    panel.plotPointerUp(missXFrac + 0.3, missYFrac);

    // The pan moved the viewport, so the SAME committed anchors now project
    // to a different screen x — the simplest robust signal that a pan (not
    // a drag-edit) happened, without hand-deriving the exact new value.
    expect(panel.drawingAttr(0, "x1")).not.toBe(beforeX1);
    expect(panel.drawingAttr(0, "data-selected")).toBe("true");
  });

  it("dragging a selected hline moves y only", async () => {
    const { head, panel } = mountPillWorkspace();

    await head.setDrawTool("hline");
    panel.setProps({});
    // hline commits on pointerdown alone — no drag/draft phase — and
    // addDrawing auto-selects it just like the trendline case.
    panel.plotPointerDown(0.5, 0.6);

    expect(panel.drawingKinds()).toEqual(["hline"]);
    expect(panel.drawingAttr(0, "data-selected")).toBe("true");

    // DrawingsLayer renders an hline's projected y on both the `y1`/`y2`
    // attrs (a full-width `<line>`, no plain `y`) — see the x1/x2 assertion
    // below for the same fixed span.
    const yFrac = Number(panel.drawingAttr(0, "y1")) / 100;

    // The hline's one handle always sits at x=50 (drawingScene) —
    // pointer-down there hits the "level" grip regardless of x.
    panel.plotPointerDown(0.5, yFrac);
    panel.plotPointerMove(0.9, 0.3);
    panel.plotPointerUp(0.9, 0.3);

    expect(Number(panel.drawingAttr(0, "y1"))).toBeCloseTo(30, 6);
    expect(panel.drawingAttr(0, "y2")).toBe(panel.drawingAttr(0, "y1"));
    expect(panel.drawingAttr(0, "data-kind")).toBe("hline");
    // x-independent: an hline always spans the full plot width regardless
    // of where its handle/body was grabbed (DrawingsLayer renders a fixed
    // 0/100 span for every hline, selected or not).
    expect(panel.drawingAttr(0, "x1")).toBe("0");
    expect(panel.drawingAttr(0, "x2")).toBe("100");
  });
});

/** Point-to-segment distance in plot-percent space — a local copy of
 * `@rtc/motion-core`'s own (unexported) `segmentDistance`, the same
 * per-spec-file duplication convention `olderCandles` below already
 * follows. Used only to GUARD the pan case's miss point against the real
 * hitTestGrip tolerances, never to assert projected drawing geometry. */
function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.min(Math.max(((px - x1) * dx + (py - y1) * dy) / lenSq, 0), 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

interface PillWorkspace {
  readonly head: EqChartHeadPage;
  readonly panel: ChartPanelPage;
  /** The shared World backing both mounts — exposed so a case can push
   * through its candle port directly (`world.setCandles`) or read the real
   * eqDrawings machine's state (`world.eqDrawings.state$`) without a
   * page-object seam for either (see the prepend/live-append anchor-shift
   * regression case below). */
  readonly world: World;
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

  return { head, panel, world };
}

/** `count` candles chronologically BEFORE CANDLES[0] (time 0) — identical
 * construction to ChartBackfill.contract.spec.ts's own `olderCandles`
 * helper (not shared/exported from there, so duplicated here per this
 * file's own established convention of local per-spec candle helpers). */
function olderCandles(count: number): readonly Candle[] {
  return Array.from({ length: count }, (_, i) => {
    return { ...candleAt(i), time: (i - count) * 60_000 };
  });
}

/** Reads the REAL eqDrawings machine's current state off a warm World —
 * `state$.getValue()` is typed to allow a cold `StatePromise` (the general
 * `@rx-state/core` contract), but `createEqDrawingsMachine` keeps its stream
 * warm from construction (an internal `.subscribe()`), so this always
 * resolves synchronously in practice; the guard mirrors
 * `viewModelFromWorld.ts`'s own `useMachineState` narrowing. */
function eqDrawingsState(world: World): EqDrawingsState {
  const value = world.eqDrawings.state$.getValue();

  if (value instanceof Promise) {
    throw new Error("eqDrawings state$ not initialized");
  }

  return value;
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
