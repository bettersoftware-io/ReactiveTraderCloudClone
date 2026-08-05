# Drawing Tools 3b — Drag-Edit (Design)

**Date:** 2026-08-06
**Workstream:** TradingView tier, sub-project 3b — the second and final slice
of the drawing-tools sub-project. Lands on 3a's handles, hit-testing, and
gesture fork ([3a spec](2026-08-05-drawing-tools-design.md)). After this, the
tier's remaining item is comparison series.

## 1. Goal

Drag-editing of the chart drawings 3a shipped, in both web clients: move a
selected trendline's endpoints individually, translate a whole trendline
rigidly, and slide a horizontal level vertically — all with the pointer,
committed through the existing `EqDrawingsMachine` seam.

## 2. Decisions (settled during brainstorm)

- **Selected-only drag.** A drawing must be click-selected first (3a's
  gesture); only then does pointer-down on its handles or body start a drag.
  Panning is untouched everywhere else — even directly on an *unselected*
  drawing. Rationale: selection is already the mode gate for delete, and a
  chart crowded with lines never steals a pan. The TradingView-style
  immediate-grab alternative was considered and rejected for exactly that
  pan-theft cost.
- **Hook-owned drag draft, single commit at pointer-up.** 3a's draft doctrine
  verbatim: the in-flight drag lives in the gesture hook as view state
  (ADR-005), the preview renders by overriding the dragged drawing's
  geometry before `drawingScene`, and the machine sees exactly one
  `updateDrawing` at pointer-up. Escape reverts for free because the machine
  never saw the drag. Live per-move machine updates and CSS-transform
  previews were considered and rejected (per-frame state in the machine /
  only valid for rigid translation, respectively).
- **No new visual scenarios.** Drag is interaction; every intermediate state
  is the selected-drawing render the 3a goldens already pin. Zero golden
  churn expected — no sync PR in this cycle unless a pixel shifts
  unexpectedly.

## 3. Motion-core additions (`packages/motion-core/src/drawingScene.ts`)

Three additions; no changes to existing exports.

```ts
/** What a cursor-tool pointer-down grabbed on the SELECTED drawing.
 * "a"/"b" are a trendline's endpoint handles; "body" is its line body
 * (rigid translate); "level" is an hline's handle OR body — both mean the
 * same vertical-only drag. */
export interface DrawingGrip {
  readonly id: string;
  readonly part: "a" | "b" | "body" | "level";
}

/** Handle grab tolerance, in plot-percent — deliberately looser than the
 * line-body tolerance (handles are point targets, lines are extended). */
const HANDLE_TOL_PCT = 2.5;

/** Hit-tests a pointer position against the SELECTED item's grab points:
 * handles first (point distance, HANDLE_TOL_PCT), then the line body
 * (segmentDistance, DEFAULT_TOL_PCT). Items with `selected: false` are
 * never grips — selected-only drag is enforced here, in one pure function.
 * Returns null on a miss. Same %-space anisotropy caveat as
 * hitTestDrawings: fine for grabbing; not pixel-square. */
export function hitTestGrip(
  scene: readonly DrawingSceneItem[],
  xPct: number,
  yPct: number,
): DrawingGrip | null;

/** Projects a drag gesture onto a drawing — the one entry point for every
 * grip kind, shared verbatim by the preview and the commit (preview ≡
 * committed by construction, the same property 3a's draw draft has).
 *
 * - part "a"/"b": that anchor goes through pointerToAnchor(to) — candle-
 *   center x-snap, free price. Identical feel to drawing the line.
 * - part "body": rigid translate. ONE index delta, computed once as
 *   round(dxFrac * span) and applied to both anchors, clamped so BOTH stay
 *   in [0, seriesLen-1] (clamping the delta, not each anchor, preserves the
 *   segment's shape at the series edges). The y delta is applied in
 *   plot-fraction space to each endpoint's PROJECTED y and re-inverted
 *   through yToPrice — rigid under linear AND log scale (a price-space
 *   delta would deform the segment under log).
 * - part "level": price = yToPrice(scale, to.yFrac * 100); x ignored.
 *
 * Returns the drawing unchanged if the grip id doesn't match. */
export function dragDrawing(
  drawing: Drawing,
  grip: DrawingGrip,
  from: { xFrac: number; yFrac: number },
  to: { xFrac: number; yFrac: number },
  viewport: ChartViewport,
  scale: ChartScale,
  seriesLen: number,
): Drawing;
```

Handle hit-testing iterates the scene's `handles` arrays (already populated
only for the selected item). For a trendline, handle index 0 is anchor `a`
and index 1 is `b` (the order `drawingScene` emits them). When both a handle
and the body are within tolerance, the handle wins (tested).

## 4. Gesture hook fork (`useChartGestures` / `createChartGestures`)

`DrawGestureSlots` gains two slots; the hook gains one piece of state.
Everything mirrors the 3a draft mechanics.

```ts
export interface DrawGestureSlots {
  // ... 3a slots unchanged ...
  /** Consulted at pointer-down when tool === "cursor": returns the grip at
   * the pointer, or null. The hook stays projection-blind — CandleChart
   * implements this against its own drawItems. */
  readonly hitGrip: (p: PlotFrac) => DrawingGrip | null;
  /** Commits a finished drag-edit (pointer-up beyond CLICK_MAX_PX). */
  readonly onCommitEdit: (grip: DrawingGrip, from: PlotFrac, to: PlotFrac) => void;
}

/** The in-flight drag-edit, exposed alongside `draft`. */
export interface EditDrag {
  readonly grip: DrawingGrip;
  readonly from: PlotFrac;
  readonly to: PlotFrac;
}
// ChartGestures gains: readonly editDrag: EditDrag | null;
```

Behaviour, all in the existing handlers:

- **Pointer-down** (`tool === "cursor"`, after the button-descendant guard,
  before pan bookkeeping): `hitGrip(p)` non-null → capture the pointer,
  set `editDrag = { grip, from: p, to: p }`, and record `downClient` for the
  click threshold. Pan never starts. Null → today's pan/click path,
  untouched.
- **Pointer-move**: `editDrag` updates `to` on every move; the crosshair
  keeps tracking alongside (same as the draw draft — the aiming aid stays
  live).
- **Pointer-up**: excursion ≤ `CLICK_MAX_PX` → discard `editDrag` and STOP —
  a no-move tap on a grip keeps the selection as-is (NOT a fall-through to
  `onPlotClick`: the handle tolerance (2.5%) is looser than the body
  tolerance (1.5%), so a tap ~2% from an endpoint would grab the grip on
  pointer-down yet miss `hitTestDrawings` on a fall-through click and
  wrongly DESELECT). Beyond it → `onCommitEdit(grip, from, to)`, then clear
  `editDrag`.
- **Escape / pointercancel**: discard `editDrag`, null `dragRef` — the
  eventual stale pointerup no-ops, exactly the 3a cancel pattern.
- **`Delete`/`Backspace`** while an `editDrag` is open: ignored (the drag
  owns the gesture; delete stays a resting-state action).

Solid twin (`createChartGestures`) mirrors with the recorded 3a deviation:
slots arrive with `tool` as an `Accessor<EqDrawTool>` (setup-once
semantics); `hitGrip`/`onCommitEdit` are plain functions like the other
slots.

## 5. Machine (`EqDrawingsMachine`) + bindings

One new intent:

```ts
/** Replaces the drawing with the matching id in `sym`'s list, positionally
 * (z-order stable). No-op when the id isn't present (same defensive shape
 * as deleteSelected). Selection and tool are untouched — after a drag the
 * user is still holding the same selected drawing. */
updateDrawing(sym: string, drawing: EqDrawing): void;
```

Both bindings (`react-bindings` / `solid-bindings` `createViewModel.ts`)
gain the effect-named wrapper `updateEqDrawing(sym, drawing)`.

## 6. Wiring (`CandleChart` + `ChartPanel`, both clients)

Prop-driven, so contract tests stay setProps exercises:

- New optional prop `onUpdateDrawing?: (drawing: EqDrawing) => void`
  (default no-op, like the other drawing slots).
- `hitGrip` slot: `hitTestGrip(drawItems, p.xFrac * 100, p.yFrac * 100)` —
  one line. Note `drawItems` already includes selection state; no new
  plumbing.
- Preview: when `gestures.editDrag` is non-null, the list handed to
  `drawingScene` replaces the selected drawing with
  `dragDrawing(committed, grip, from, to, viewport, scale, seriesLen)`.
- `onCommitEdit`: calls `onUpdateDrawing` with the same `dragDrawing`
  result — preview ≡ committed by construction.

`ChartPanel` wires `onUpdateDrawing` → `updateEqDrawing(sym, drawing)`.

No new DOM, no new testids, node budget unchanged (the ≤4-nodes-per-drawing
contract assert from 3a keeps passing untouched).

## 7. Testing

- **motion-core units** (`drawingScene.test.ts`): `hitTestGrip` — handle
  beats body when both are in tolerance; unselected items never grip; miss
  → null; hline body and handle both yield "level". `dragDrawing` —
  endpoint drag candle-snaps x and frees price; body drag under LOG scale
  keeps both endpoints' projected y-deltas equal (rigidity); body index
  delta clamps at both series edges without deforming; hline ignores x;
  mismatched grip id returns the drawing unchanged.
- **machine** (`EqDrawingsMachine.test.ts`): replace-by-id preserves list
  position; unknown id no-ops; selection and tool survive an update.
- **shared contract specs** (`ChartDrawings.contract.spec.ts`, both clients
  via the swap-trio): drag an endpoint → the drawing's geometry attribute
  changes and equals a fresh `drawingScene` projection of the updated
  anchors; body drag moves both ends; Escape mid-drag reverts to the
  committed geometry byte-for-byte; pointer-down on empty plot with a
  selection still pans; hline drag changes `y` only; a no-move tap on a
  handle keeps the selection (the §4 deselect trap, pinned).
- **e2e** (`equitiesChart.spec.ts`, both clients): extend the existing
  draw→select→delete journey — after select, drag an endpoint handle with
  `page.mouse`, assert the drawing's `x2`/`y2` moved.
- **Visual tier**: no new scenarios, no golden changes expected (§2).

## 8. Out of scope (recorded)

- Multi-select; snap-to-OHLC while dragging; ray/extend modes.
- Cursor CSS affordances (`grab`/`grabbing`) — would require per-hover
  hit-testing on every pointermove; the visible handles are the drag
  affordance.
- Mobile/RN drawings; persistence beyond the in-memory machine.
- Timeframe scope (inherited from 3a, unchanged): anchors are candle
  indices within the selected timeframe's series and drawings are keyed per
  symbol only — a drawing made on one timeframe projects onto unrelated
  candles on another. Recorded limitation, not a bug; unchanged by 3b.
