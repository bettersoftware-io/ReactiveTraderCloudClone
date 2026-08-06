# Drawing Tools 3a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trendlines + horizontal levels on the equities chart — drawn by pointer, click-selectable, deletable — in both web clients (spec: `docs/superpowers/specs/2026-08-05-drawing-tools-design.md`).

**Architecture:** Data-space anchors (candle index + price) in a composition-root `EqDrawingsMachine`; pure projection/hit-test math in motion-core (`drawingScene.ts`); a `pointer-events: none` SVG overlay; the gesture fork lives in the existing hooks and emits plot *fractions* through slots — anchor snapping happens once, at commit, in `CandleChart`. `ChartPanel` wires machine→props so `CandleChart` stays prop-driven and contract-testable via `setProps`.

**Tech Stack:** TypeScript, RxJS (machine), React 19 + SolidJS shells, vitest + vitest-browser contract tier, Playwright (goldens + e2e).

## Global Constraints

- Dependency doctrine: motion-core stays zero-dep (no client-core import — structural twins, the `ChartKind`/`EqChartType` precedent); client-core stays motion-core-free.
- The draft (line-in-progress) NEVER enters the machine — hook state only (ADR-005).
- The drawings SVG has `pointer-events: none`; ALL pointer logic stays on the plot wrapper's existing handlers. Hit-testing is math, never DOM hit-testing.
- `CLICK_MAX_PX = 4` — one constant, both clients: ≤ 4 px pointer excursion = click, more = drag.
- Zero drawing DOM when no drawings exist; ≤ 4 nodes per drawing (contract-pinned). Zero new animations/transitions/rAF.
- New optional `CandleChartProps` fields default to inert values so every existing mount keeps compiling (the `panes`/`yScale` precedent).
- Handler naming: concrete handlers named for effect (`commitTrendline`, `selectHitDrawing`); function-typed props are slots and stay `onX`.
- Repo style: mandatory braces, `{ return … }` bodies, newspaper order per file, `#/` aliases in clients; `pnpm exec biome ci .` (not `pnpm lint`) before every commit.
- Solid parity: Tasks 6 twins every React edit; the shared contract tier is the parity oracle.
- Final verification runs the `/rtc:gauntlet` fast-tier commands **verbatim** + the heavy set (typecheck, unit, both contract-coverage gates ≥95%, build, devtools-dist).
- Commits end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01QjQPskCRRrWDKGMb5FhqX8`

---

### Task 1: motion-core `drawingScene.ts`

**Files:**
- Create: `packages/motion-core/src/drawingScene.ts`, `packages/motion-core/src/drawingScene.test.ts`
- Modify: `packages/motion-core/src/index.ts` (exports)

**Interfaces:**
- Consumes: `ChartViewport`, `ChartScale`, `priceToY`, `yToPrice` (existing).
- Produces (used by Tasks 4–7):

```ts
export interface DrawingAnchor { readonly index: number; readonly price: number }
export type Drawing =
  | { readonly id: string; readonly kind: "trendline"; readonly a: DrawingAnchor; readonly b: DrawingAnchor }
  | { readonly id: string; readonly kind: "hline"; readonly price: number };
export interface DrawingHandle { readonly x: number; readonly y: number }
export type DrawingSceneItem =
  | { readonly id: string; readonly kind: "trendline"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly selected: boolean; readonly handles: readonly DrawingHandle[] }
  | { readonly id: string; readonly kind: "hline"; readonly y: number; readonly selected: boolean; readonly handles: readonly DrawingHandle[] };
export function pointerToAnchor(xFrac: number, yFrac: number, viewport: ChartViewport, scale: ChartScale, seriesLen: number): DrawingAnchor;
export function drawingScene(drawings: readonly Drawing[], viewport: ChartViewport, scale: ChartScale, selectedId: string | null): readonly DrawingSceneItem[];
export function hitTestDrawings(scene: readonly DrawingSceneItem[], xPct: number, yPct: number, tolPct?: number): string | null;
```

- [ ] **Step 1: Failing tests** (`drawingScene.test.ts`):

```ts
import { describe, expect, it } from "vitest";

import type { ChartScale, ChartViewport } from "./chartScene.js";
import { priceToY, yToPrice } from "./chartScene.js";
import { drawingScene, hitTestDrawings, pointerToAnchor } from "./drawingScene.js";

const VP: ChartViewport = { start: 240, end: 300 };
const LIN: ChartScale = { cmin: 100, cmax: 200 };
const LOG: ChartScale = { cmin: 100, cmax: 200, yScale: "log" };

describe("pointerToAnchor", () => {
  it("snaps x to the crosshair's candle-index rule and inverts y through the scale", () => {
    // xFrac 0.5 → rawIdx = 240 + 0.5·60 − 0.5 = 269.5 → 270 (round).
    const a = pointerToAnchor(0.5, 0.5, VP, LIN, 300);
    expect(a.index).toBe(270);
    expect(a.price).toBeCloseTo(yToPrice(LIN, 50), 9);
  });

  it("clamps the index into the series", () => {
    expect(pointerToAnchor(1, 0.5, VP, LIN, 300).index).toBe(299);
    expect(pointerToAnchor(0, 0.5, { start: 0, end: 60 }, LIN, 300).index).toBe(0);
  });
});

describe("drawingScene", () => {
  const TREND: Drawing = {
    id: "t1",
    kind: "trendline",
    a: { index: 250, price: 120 },
    b: { index: 290, price: 180 },
  };
  const LEVEL: Drawing = { id: "h1", kind: "hline", price: 150 };

  it("projects anchors via the candle-center rule and priceToY", () => {
    const [item] = drawingScene([TREND], VP, LIN, null);

    if (item?.kind !== "trendline") {
      throw new Error("expected trendline item");
    }

    expect(item.x1).toBeCloseTo(((250 + 0.5 - 240) / 60) * 100, 9);
    expect(item.y1).toBeCloseTo(priceToY(LIN, 120), 9);
    expect(item.x2).toBeCloseTo(((290 + 0.5 - 240) / 60) * 100, 9);
    expect(item.y2).toBeCloseTo(priceToY(LIN, 180), 9);
    expect(item.selected).toBe(false);
    expect(item.handles).toEqual([]);
  });

  it("is mode-correct: log y differs from linear for the same anchors", () => {
    const [lin] = drawingScene([TREND], VP, LIN, null);
    const [log] = drawingScene([TREND], VP, LOG, null);

    if (lin?.kind !== "trendline" || log?.kind !== "trendline") {
      throw new Error("expected trendline items");
    }

    expect(log.y1).toBeCloseTo(priceToY(LOG, 120), 9);
    expect(log.y1).not.toBeCloseTo(lin.y1, 3);
  });

  it("an hline spans full width at priceToY(price); selection adds handles", () => {
    const [item] = drawingScene([LEVEL], VP, LIN, "h1");

    if (item?.kind !== "hline") {
      throw new Error("expected hline item");
    }

    expect(item.y).toBeCloseTo(priceToY(LIN, 150), 9);
    expect(item.selected).toBe(true);
    expect(item.handles).toEqual([{ x: 50, y: item.y }]);
  });

  it("a selected trendline's handles sit on its two anchors", () => {
    const [item] = drawingScene([TREND], VP, LIN, "t1");

    if (item?.kind !== "trendline") {
      throw new Error("expected trendline item");
    }

    expect(item.handles).toEqual([
      { x: item.x1, y: item.y1 },
      { x: item.x2, y: item.y2 },
    ]);
  });

  it("off-viewport anchors still emit finite geometry (SVG clips)", () => {
    const far: Drawing = {
      id: "t2",
      kind: "trendline",
      a: { index: 0, price: 120 },
      b: { index: 100, price: 180 },
    };
    const [item] = drawingScene([far], VP, LIN, null);

    if (item?.kind !== "trendline") {
      throw new Error("expected trendline item");
    }

    expect(Number.isFinite(item.x1)).toBe(true);
    expect(item.x1).toBeLessThan(0);
  });

  it("anchor index + N renders at the same position after a prepend of N", () => {
    const before = drawingScene([TREND], VP, LIN, null);
    const shifted: Drawing = {
      ...TREND,
      a: { ...TREND.a, index: TREND.a.index + 30 },
      b: { ...TREND.b, index: TREND.b.index + 30 },
    };
    const vpAfter: ChartViewport = { start: VP.start + 30, end: VP.end + 30 };
    const after = drawingScene([shifted], vpAfter, LIN, null);

    expect(after).toEqual(before);
  });
});

describe("hitTestDrawings", () => {
  const scene = drawingScene(
    [
      { id: "h1", kind: "hline", price: 150 },
      { id: "h2", kind: "hline", price: 152 },
    ],
    VP,
    LIN,
    null,
  );
  const y1 = priceToY(LIN, 150);
  const y2 = priceToY(LIN, 152);

  it("hits within tolerance, rejects beyond it, nearest wins", () => {
    expect(hitTestDrawings(scene, 50, y1 + 0.5)).toBe("h1");
    expect(hitTestDrawings(scene, 50, y1 + 5)).toBe(null);
    // Midway-but-nearer-h2 point:
    const mid = (y1 + y2) / 2;
    expect(hitTestDrawings(scene, 50, mid + (y1 - y2) / 4)).toBe("h2");
  });

  it("empty scene → null", () => {
    expect(hitTestDrawings([], 50, 50)).toBe(null);
  });
});
```

(Import `type Drawing` too; adjust the import list as the compiler demands.)

- [ ] **Step 2:** Run `pnpm --filter @rtc/motion-core test -- drawingScene` — FAIL (module not found).

- [ ] **Step 3: Implement** (`drawingScene.ts`) — types from the Interfaces block verbatim, plus:

```ts
const DEFAULT_TOL_PCT = 1.5;

export function pointerToAnchor(
  xFrac: number, yFrac: number,
  viewport: ChartViewport, scale: ChartScale, seriesLen: number,
): DrawingAnchor {
  const span = viewport.end - viewport.start || 1;
  const rawIdx = viewport.start + xFrac * span - 0.5;
  const index = Math.min(Math.max(Math.round(rawIdx), 0), seriesLen - 1);
  return { index, price: yToPrice(scale, yFrac * 100) };
}

export function drawingScene(
  drawings: readonly Drawing[],
  viewport: ChartViewport, scale: ChartScale,
  selectedId: string | null,
): readonly DrawingSceneItem[] {
  const span = viewport.end - viewport.start || 1;

  function xPct(index: number): number {
    return ((index + 0.5 - viewport.start) / span) * 100;
  }

  return drawings.map((d) => {
    const selected = d.id === selectedId;

    if (d.kind === "hline") {
      const y = priceToY(scale, d.price);
      return { id: d.id, kind: "hline", y, selected, handles: selected ? [{ x: 50, y }] : [] };
    }

    const x1 = xPct(d.a.index);
    const y1 = priceToY(scale, d.a.price);
    const x2 = xPct(d.b.index);
    const y2 = priceToY(scale, d.b.price);
    return {
      id: d.id, kind: "trendline", x1, y1, x2, y2, selected,
      handles: selected ? [{ x: x1, y: y1 }, { x: x2, y: y2 }] : [],
    };
  });
}

/** Point-to-segment distance in plot-% space. Documented limit: %-space is
 * anisotropic in pixels (the plot isn't square) — fine for click-select. */
function segmentDistance(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.min(Math.max(((px - x1) * dx + (py - y1) * dy) / lenSq, 0), 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function hitTestDrawings(
  scene: readonly DrawingSceneItem[],
  xPct: number, yPct: number,
  tolPct: number = DEFAULT_TOL_PCT,
): string | null {
  let best: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;

  for (const item of scene) {
    const d =
      item.kind === "hline"
        ? segmentDistance(xPct, yPct, 0, item.y, 100, item.y)
        : segmentDistance(xPct, yPct, item.x1, item.y1, item.x2, item.y2);

    if (d <= tolPct && d < bestD) {
      bestD = d;
      best = item.id;
    }
  }

  return best;
}
```

Export the module from `index.ts` beside the other chart exports (types + functions).

- [ ] **Step 4:** `pnpm --filter @rtc/motion-core test` — all pass, pre-existing suite untouched.
- [ ] **Step 5: Commit** `feat(motion-core): drawingScene — data-anchored drawing projection + hit-testing`

---

### Task 2: `EqDrawingsMachine` + composition wiring

**Files:**
- Create: `packages/client-core/src/presenters/EqDrawingsMachine.ts`, `packages/client-core/src/presenters/__tests__/EqDrawingsMachine.test.ts`
- Modify: `packages/client-core/src/composition.ts` (Presenters interface ~line 161 area + literal ~line 523 area + the dispose path), client-core's public index (mirror how `EqWorkspaceMachine` exports flow — likely automatic via the presenters barrel; verify `EqDrawTool` etc. are importable from `@rtc/client-core`).

**Interfaces:**
- Produces: the spec §3 types verbatim (`EqDrawTool`, `EqDrawingAnchor`, `EqDrawing`, `EqDrawingsState`) and `createEqDrawingsMachine(): Machine<EqDrawingsState, EqDrawingsIntents>` with intents `setTool(tool)`, `addDrawing(sym, drawing)`, `selectDrawing(id | null)`, `deleteSelected(sym)`, `shiftAnchors(sym, by)`.

- [ ] **Step 1: Failing tests** — in the file's sibling style (`firstValueFrom` idiom per `EqWorkspaceMachine.test.ts`), one case per behavior:

```ts
// Behaviors to pin (write each as its own it(), in the file's idiom):
// 1. initial state: { tool: "cursor", drawings: {}, selectedId: null }
// 2. setTool("trendline") sets tool AND clears a prior selection
// 3. addDrawing("AAPL", t1) appends, selects t1.id, reverts tool to "cursor"
// 4. per-symbol isolation: AAPL's list does not appear under TSLA
// 5. selectDrawing(null) deselects; selectDrawing("t1") selects
// 6. deleteSelected("AAPL") removes the selected drawing + clears selection;
//    no-op when selectedId is null or belongs to no drawing of that symbol
// 7. shiftAnchors("AAPL", 30) adds 30 to BOTH anchors of every AAPL
//    trendline, leaves hlines and other symbols untouched
// 8. dispose() completes without error; intents after dispose are inert
```

Write real test bodies for all 8 (construct `EqDrawing` literals inline; ids are plain strings in tests — no uuid needed).

- [ ] **Step 2:** Run `pnpm --filter @rtc/client-core test -- EqDrawingsMachine` — FAIL.
- [ ] **Step 3: Implement the machine** — the `togglePane` Subject→patch→merge→scan pattern exactly; state/type declarations from spec §3; every subject completed in `dispose()`; `state$` kept warm with an internal subscription like `EqWorkspaceMachine` (same doc-comment rationale — composition-root machine, panels mount/unmount around it).

Patch sketches (adapt to the file's style):

```ts
  // setTool: switching tool always drops the selection.
  return { ...s, tool, selectedId: null };
  // addDrawing: append + auto-select + revert to cursor (draw one, then manipulate).
  const list = s.drawings[sym] ?? [];
  return { ...s, drawings: { ...s.drawings, [sym]: [...list, drawing] }, selectedId: drawing.id, tool: "cursor" };
  // deleteSelected: filter by selectedId; identical state when nothing matches.
  // shiftAnchors: map trendlines to { ...d, a: {...d.a, index: d.a.index + by}, b: {...} }.
```

- [ ] **Step 4: Composition.** Add `eqDrawings: Machine<EqDrawingsState, EqDrawingsIntents>;` to the Presenters interface beside `eqWorkspace` (with a one-line doc comment: per-symbol chart annotations, shared by the chart head's tool pills and the plot), `eqDrawings: createEqDrawingsMachine(),` in the literal, and mirror `eqWorkspace`'s dispose path exactly (grep how composition disposes machines — follow it verbatim).
- [ ] **Step 5:** `pnpm --filter @rtc/client-core test && pnpm typecheck` — PASS.
- [ ] **Step 6: Commit** `feat(client-core): EqDrawingsMachine — per-symbol drawings, tool, selection`

---

### Task 3: Bindings exposure (`useEqDrawings`, both frameworks)

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts`, `packages/solid-bindings/src/createViewModel.ts`
- Test: append one case each to `packages/react-bindings/src/createViewModel.equities.test.ts` and `packages/solid-bindings/src/createViewModel.machines.test.tsx`
- Modify (compile fallout): every site `pnpm typecheck` flags — expected: both contract registries' `viewModelFromWorld.ts`, both clients' visual `buildFakeViewModel.ts`, ui-contract fixtures.

**Interfaces:**
- Produces: `useEqDrawings(): { state: …; setTool; addDrawing; selectDrawing; deleteSelected; shiftAnchors }` on both ViewModels — mirror `useEqWorkspace`'s exact state-binding shape per framework (react: the bound-state hook pattern; solid: `toSignal`). Effect-named wrappers (`setEqDrawTool`, `addEqDrawing`, `selectEqDrawing`, `deleteSelectedEqDrawing`, `shiftEqDrawingAnchors`) beside `toggleEqYScale`'s.

- [ ] **Step 1:** Implement both bindings, mirroring the `useEqWorkspace` block in each file (read it first; same placement, same idiom).
- [ ] **Step 2:** One test per bindings file, mirroring the neighbouring toggleYScale case: drive `addDrawing("AAPL", …)` and assert `state.drawings.AAPL` has it, selection set, tool reverted.
- [ ] **Step 3:** `pnpm typecheck` — widen every flagged double/fixture with inert literals (`useEqDrawings: () => ({ state: { tool: "cursor", drawings: {}, selectedId: null }, setTool: () => {}, … })` shaped to the site's existing style). Literal widening only.
- [ ] **Step 4:** `pnpm --filter @rtc/react-bindings test && pnpm --filter @rtc/solid-bindings test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(bindings): useEqDrawings on both view-models`

---

### Task 4: React render path — `DrawingsLayer` + `DrawToolPills` (no gestures yet)

**Files:**
- Create: `packages/client-react/src/ui/equities/chart/DrawingsLayer.tsx`, `DrawingsLayer.module.css`, `DrawToolPills.tsx`
- Modify: `EqChartHead.tsx` (pills), `ChartPanel.tsx` (machine→props wiring), `CandleChart.tsx` (props + scene call + layer), `ChartPlot.tsx` (render the layer)

**Interfaces:**
- Consumes: `drawingScene`/`DrawingSceneItem`/`Drawing` (Task 1), `useEqDrawings` (Task 3), `EqDrawTool`/`EqDrawing` (Task 2).
- Produces (Tasks 5–9 rely on): `CandleChartProps` gains OPTIONAL `drawTool?: EqDrawTool`, `drawings?: readonly EqDrawing[]` (the CURRENT symbol's list — ChartPanel selects `state.drawings[sel] ?? []`), `selectedDrawingId?: string | null`, and slots `onCommitDrawing?: (d: EqDrawing) => void`, `onSelectDrawing?: (id: string | null) => void`, `onDeleteSelected?: () => void`, `onShiftAnchors?: (by: number) => void`. DOM contract: `data-testid="chart-drawing"` + `data-kind` + `data-selected` + `data-draft` per line, `chart-drawing-handle` per handle, `chart-draw-pill` + `data-tool` + `data-active` per pill.

- [ ] **Step 1: DrawingsLayer.** Props `{ items: readonly DrawingSceneItem[] }`; returns `null` when empty; one `<svg>` (`viewBox="0 0 100 100"`, `preserveAspectRatio="none"`, class from module css: `position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;`); per item a `<line>` (`vector-effect="non-scaling-stroke"`, testids/attrs above; `data-draft={String(item.id === "draft")}`); selected items also render their `handles` as `<circle r="0.8">` with `chart-drawing-handle`. Stroke/fill via existing CSS theme vars (pick the vars the indicator paths use — read `SvgPathLayer` for the palette precedent); dashed stroke for the draft via a css class keyed on `data-draft`.
- [ ] **Step 2: DrawToolPills.** The `IndicatorPills` pill pattern: two pills `TL` (`data-tool="trendline"`) and `H-LINE` (`data-tool="hline"`), `data-active={String(tool === own)}`; clicking inactive → `onSet(own)`, clicking active → `onSet("cursor")`. Props `{ tool: EqDrawTool; onSet: (t: EqDrawTool) => void }`.
- [ ] **Step 3: EqChartHead.** `const { state: drawState, setTool } = useEqDrawings();` render `<DrawToolPills tool={drawState.tool} onSet={setTool} />` after `<IndicatorPills …>` (the row's fourth group; match how the head row lays out its children).
- [ ] **Step 4: ChartPanel.** `const { state: drawState, addDrawing, selectDrawing, deleteSelected, shiftAnchors } = useEqDrawings();` and pass to `<CandleChart>`:

```tsx
  drawTool={drawState.tool}
  drawings={drawState.drawings[sel] ?? EMPTY_DRAWINGS}
  selectedDrawingId={drawState.selectedId}
  onCommitDrawing={(d) => { addDrawing(sel, d); }}
  onSelectDrawing={selectDrawing}
  onDeleteSelected={() => { deleteSelected(sel); }}
  onShiftAnchors={(by) => { shiftAnchors(sel, by); }}
```

(`const EMPTY_DRAWINGS: readonly EqDrawing[] = [];` hoisted so the prop identity is stable.)
- [ ] **Step 5: CandleChart.** Add the optional props (defaults: `drawTool = "cursor"`, `drawings = EMPTY`, `selectedDrawingId = null`, slots default no-op); compute `const drawItems = drawingScene(drawings, viewport, vm.scale, selectedDrawingId);` and pass `drawItems` to `ChartPlot` → render `<DrawingsLayer items={drawItems} />` inside the plot box as a sibling of `SvgPathLayer` (after the candles, before the crosshair overlay — annotations above data, below the cursor). NOTE: `EqDrawing` (client-core) satisfies motion-core's structural `Drawing` — pass directly, no mapping.
- [ ] **Step 6:** `pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-react test:ui:contract && pnpm typecheck` — PASS (no behavior asserted yet; proves nothing broke).
- [ ] **Step 7: Commit** `feat(client-react): drawings render path — DrawingsLayer + tool pills + machine wiring`

---

### Task 5: React gestures — the draw/select fork

**Files:**
- Modify: `packages/client-react/src/ui/equities/chart/useChartGestures.ts`, `CandleChart.tsx`

**Interfaces:**
- Consumes: `pointerToAnchor` (Task 1), the Task 4 props/slots.
- Produces: `useChartGestures(seriesLen, defaultVisible, firstCandleTime?, draw?: DrawGestureSlots)` where

```ts
export interface PlotFrac { readonly xFrac: number; readonly yFrac: number }
export interface DrawGestureSlots {
  readonly tool: EqDrawTool;
  readonly onCommitLine: (a: PlotFrac, b: PlotFrac) => void;
  readonly onCommitLevel: (p: PlotFrac) => void;
  readonly onPlotClick: (p: PlotFrac) => void;
  readonly onDeleteKey: () => void;
}
```

and the hook's return gains `readonly draft: { readonly a: PlotFrac; readonly b: PlotFrac } | null`.

- [ ] **Step 1: Hook fork.** `const CLICK_MAX_PX = 4;` In `startDrag`: record `downClient: {x, y}` in the drag ref for click detection; if `draw?.tool === "hline"` → `draw.onCommitLevel(frac(e))` and return (no capture, no drag); if `draw?.tool === "trendline"` → set `draft` state `{ a: frac(e), b: frac(e) }` + capture, skip pan bookkeeping. In `dragOrTrackCursor`: when a draft is open, update `draft.b` (and keep the crosshair tracking as today). In `endDrag`: if a draft is open — excursion `> CLICK_MAX_PX` → `draw.onCommitLine(draft.a, draft.b)`; either way clear the draft and release capture. If NO draft and tool is `"cursor"` and excursion `≤ CLICK_MAX_PX` → `draw?.onPlotClick(frac(e))`. In `panOrZoomByKey`: `Escape` clears an open draft; `Delete`/`Backspace` (cursor tool only) → `draw?.onDeleteKey()`. `frac(e)` computes xFrac/yFrac against `e.currentTarget`'s rect exactly like the cursor tracker. The BACK-TO-LIVE button bypass, pane hover, wheel, and navigator paths are untouched.
- [ ] **Step 2: CandleChart wiring.** Build the slots (concrete handlers, effect-named):

```ts
  const drawSlots: DrawGestureSlots = {
    tool: drawTool,
    onCommitLine: commitTrendline,   // pointerToAnchor both ends → onCommitDrawing({ id: crypto.randomUUID(), kind: "trendline", a, b })
    onCommitLevel: commitLevel,      // pointerToAnchor → onCommitDrawing({ id: crypto.randomUUID(), kind: "hline", price })
    onPlotClick: selectHitDrawing,   // hitTestDrawings(drawItems, xFrac·100, yFrac·100) → onSelectDrawing(result)
    onDeleteKey: onDeleteSelected,
  };
```

Pass `drawSlots` to the hook; append the draft to the scene input: `const allDrawings = draft ? [...drawings, draftToDrawing(draft)] : drawings;` where `draftToDrawing` wraps the two fracs through `pointerToAnchor` with id `"draft"` — NOTE the preview therefore snaps x to candle centers live; that matches the committed result exactly (preview = what you'll get), which beats a free-floating preview that jumps on commit. `drawItems` is computed from `allDrawings`.
Prepend effect (the `onLoadOlder` precedent — an effect, not render-time):

```ts
  const firstTime = candles[0]?.time;
  const prevRef = useRef<{ len: number; firstTime: number | undefined }>({ len: candles.length, firstTime });

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { len: candles.length, firstTime };
    const grewBy = candles.length - prev.len;

    if (grewBy > 0 && prev.firstTime !== undefined && firstTime !== undefined && firstTime < prev.firstTime) {
      onShiftAnchors(grewBy);
    }
  }, [candles.length, firstTime, onShiftAnchors]);
```

- [ ] **Step 3:** `pnpm --filter @rtc/client-react test && pnpm typecheck` — PASS (the hook's own unit test file `useChartGestures.test.ts` gains cases: hline commit on down; trendline draft opens on down, commits on up beyond 4px, discards within 4px; Escape cancels; cursor click calls onPlotClick; Delete calls onDeleteKey — mirror the file's existing stub-rect event style).
- [ ] **Step 4: Commit** `feat(client-react): draw gestures — draft, click-select, delete key, prepend shift`

---

### Task 6: Solid twin (render + gestures)

**Files:**
- Create: `packages/client-solid/src/ui/equities/chart/DrawingsLayer.tsx`, `DrawingsLayer.module.css`, `DrawToolPills.tsx`
- Modify: `EqChartHead.tsx`, `ChartPanel.tsx`, `CandleChart.tsx`, `ChartPlot.tsx`, `createChartGestures.ts` (+ its test)

- [ ] **Step 1:** `git show` Tasks 4–5's commits; port each edit to its Solid twin with Solid idiom: `class=`, no prop destructuring (accessors), `state()` reads, options/scene built inside tracked scopes (memos), `createSignal` for the draft. The reactivity trap from the yScale review applies doubly here — the draft signal and the tool accessor must be read lazily inside the gesture handlers, not captured once.
- [ ] **Step 2:** `pnpm --filter @rtc/client-solid test && pnpm --filter @rtc/client-solid test:ui:contract && pnpm typecheck` — PASS.
- [ ] **Step 3: Commit** `feat(client-solid): drawings twin — layer, pills, gesture fork`

---

### Task 7: Shared contract spec + page-object drivers

**Files:**
- Create: `packages/ui-contract/src/specs/equities/chart/ChartDrawings.contract.spec.ts`
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts` (pointer down/up drivers + drawing observers), `EqChartHeadPage.ts` (draw-pill drivers)

**Interfaces:**
- Consumes: the Task 4 DOM contract + `CandleChartProps` additions; `drawingScene`/`hitTestDrawings` from `@rtc/motion-core` for independent expectations.
- Produces: `CandleChartPage.pointerDown(x, y)` / `pointerUp(x, y)` (fireEvent with the STUB_RECT coords, `pointerId: 1` — the capture stubs already exist in `plot()`), `drawings(): HTMLElement[]`, `drawingAttr(i, name)`, `handleCount()`; `EqChartHeadPage.activeDrawTool()` / `setDrawTool(tool)`.

- [ ] **Step 1:** Page drivers (mirror `setPointer`'s style — fireEvent + `setProps({})` flush).
- [ ] **Step 2:** The spec, two mounting strategies like `ChartPanes.contract.spec.ts`:
  - *Pill workspace (mountWith)*: `TL` pill activates (`data-active`), clicking it again reverts to cursor; drawing via the plot then flows through the REAL machine: pointer down (0.2, 0.7) → move (0.6, 0.3) → up commits → exactly one `chart-drawing[data-kind="trendline"]` exists AND the head's tool pill reverted to cursor.
  - *Direct mounts (setProps-driven)*: with literal `drawings`/`selectedDrawingId` props — geometry matches an independent `drawingScene` computation (read the line's x1/y1 attrs); `data-selected` + 2 handles on the selected trendline, 1 on an hline; symbol isolation is ChartPanel's selection of the record (assert via the pill-workspace mount: draw on AAPL, `head`-driven symbol switch, drawing gone, switch back, drawing returned); Delete key removes; empty-click deselects (drive `onSelectDrawing` observation via setProps + pointer click with a spy slot); **node budget**: `wrapNodeCount()` with zero drawings equals the no-drawings baseline; each drawing adds ≤ 4 nodes.
  - Every case must pass UNEDITED on both frameworks: `pnpm --filter @rtc/client-react test:ui:contract -- ChartDrawings` + solid equivalent.
- [ ] **Step 3: Commit** `test(ui-contract): drawings contract — draw, select, delete, isolation, node budget`

---

### Task 8: Visual scenario + darwin goldens

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts` (`"equities/chart-drawings": { componentKey: "EquitiesChartDrawings", fixtureKey: "equities-loaded" }` + comment), both clients' visual host files + registries
- Generate: 10 darwin-arm64 stems

- [ ] **Step 1:** Forced-state host in each client's `EquitiesChartInteractive.visual.tsx` family: mount `CandleChart` with literal props — a trendline (a: idx 250/price low-ish, b: idx 290/price high-ish across the default {240,300} window), an hline mid-range, `selectedDrawingId` = the trendline's id (handles visible). No gestures.
- [ ] **Step 2:** Registry entries both clients (registryCoverage enforces).
- [ ] **Step 3:** Golden generation per UPDATING-GOLDENS.md (build first; kill stale :32xx vite servers from other checkouts). Expect EXACTLY 10 new `equities-chart-drawings` stems + 10 MODIFIED `app-equities` stems (the two DrawToolPills render unconditionally in the head bar — the full-app shot changes, same mechanism as the LOG pill; amended 2026-08-05 after Task 4 landed the pills). The chart-body scenarios (`equities-chart-*`) must NOT change — drawings are opt-in DOM in the plot. Any OTHER modified stem = STOP and investigate before committing.
- [ ] **Step 4:** Full unscoped visual asserts, react AND solid — 100% green. Eyeball one PNG (two lines, handles on the selected one).
- [ ] **Step 5: Commit** `test(visual): equities/chart-drawings scenario + darwin-arm64 goldens`

---

### Task 9: e2e draw journey

**Files:**
- Modify: `tests/browser/page-objects/contracts/testids.ts` (+`drawPill`, `drawing` entries), `contracts/EquitiesChart.ts` + playwright impl, `scenarios/equitiesChart.ts`, `playwright/equitiesChart.spec.ts`

- [ ] **Step 1:** Contract + impl: `clickDrawPill(tool)`, `dragOnPlot(fromFrac, toFrac)` (real `page.mouse` down/move/up over the plot's bounding box), `waitDrawingVisible(timeoutMs)`, `clickDrawing()`, `waitDrawingSelected(timeoutMs)`, `pressDelete()`, `waitDrawingGone(timeoutMs)` — style-mirror `clickPanePill`/`waitPaneVisible`; no fixed sleeps, expect-based waits.
- [ ] **Step 2:** Scenario fns (ctx-forwarding) + the test after the LOG-pill journey: TL pill → drag (0.25, 0.7)→(0.7, 0.35) → drawing visible → click it → selected → Delete → gone. Take care per the flake ledger: waits with explicit timeouts, no snapshot races.
- [ ] **Step 3:** Full react e2e suite + `pnpm --filter @rtc/tests gates` + `pnpm lint:dead` + `pnpm typecheck` — green.
- [ ] **Step 4: Commit** `test(e2e): draw-select-delete journey`

---

### Task 10: Docs close-out

**Files:**
- Modify: `docs/architecture/17-web-client-up-close.md` (§17.7), `docs/STATUS.md`

- [ ] **Step 1:** Append to the §17.7 seam narrative (after the nice-tick sentence): `Drawing tools (3a, spec 2026-08-05) push the seam into user-generated content: annotations anchor in data space (candle index + price) and project through the same viewport-x/priceToY pair, so a trendline survives pan, zoom, backfill prepends (anchor shifting), and scale-mode flips without any drawing-specific geometry code in either client.`
- [ ] **Step 2:** STATUS.md TradingView bullet: mark drawing tools 3a DONE alongside panes/log/nice-tick; Remaining becomes "drawing tools 3b (drag-edit: endpoint/whole-line moving on 3a's handles + hit-testing) and comparison series". Bump `**Last updated:**`.
- [ ] **Step 3:** `pnpm check:doc-links` — green.
- [ ] **Step 4: Commit** `docs: drawing tools 3a shipped — §17.7 data-anchor note + STATUS close-out`

---

## Self-Review (done at authoring time)

- **Spec coverage:** §3 machine → Task 2; §4 math → Task 1; §5 layer → Task 4 (+6); §6 gestures incl. CLICK_MAX_PX/draft/Escape/Delete/prepend → Task 5 (+6); §7 pills → Task 4 (+6); §8 tests → Tasks 1, 2, 7, 8, 9; §9 perf → construction + Task 7's node budget; §11 docs → Task 10. Spec §6's draft-projection sentence is refined here (Task 5): the preview snaps through `pointerToAnchor` live, so preview ≡ committed result — a strictly better behavior than the spec's literal dashed-free-float, kept within the spec's "share one code path" intent.
- **Placeholders:** Task 2 Step 1 lists behaviors with an explicit instruction to write real bodies — the behaviors ARE the specification (values included); everything else carries code.
- **Type consistency:** `Drawing`/`DrawingSceneItem`/`DrawingHandle`/`pointerToAnchor` (Task 1) ≡ usage in Tasks 4, 5, 7, 8; `EqDrawTool`/`EqDrawing` (Task 2) ≡ bindings (3), props (4), slots (5); `DrawGestureSlots`/`PlotFrac` (Task 5) ≡ CandleChart wiring; testids consistent across 4, 7, 8, 9.
