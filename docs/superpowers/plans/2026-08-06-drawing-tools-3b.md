# Drawing Tools 3b — Drag-Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drag-editing of chart drawings in both web clients: move a selected trendline's endpoints, translate a whole trendline rigidly, slide an hline vertically — committed through `EqDrawingsMachine`.

**Architecture:** Selected-only drag on 3a's handles/hit-testing. Two new pure functions in motion-core (`hitTestGrip`, `dragDrawing`); a hook-owned `editDrag` draft in the gesture hooks (machine never sees the drag); one new machine intent `updateDrawing` fired once at pointer-up. Preview ≡ committed because both run the same `dragDrawing`.

**Tech Stack:** TypeScript, RxJS (machine), React 19 / SolidJS shells, vitest, shared `@rtc/ui-contract` specs, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-08-06-drawing-tools-3b-design.md` (committed on this branch).

## Global Constraints

- Selected-only drag: unselected drawings NEVER grip; pan is untouched everywhere a grip misses.
- Draft doctrine (ADR-005): the in-flight drag lives in the gesture hook as view state; the machine sees exactly ONE `updateDrawing` at pointer-up; Escape/pointercancel discard without any machine traffic.
- Pointer-up within `CLICK_MAX_PX` (= 4, existing constant) of pointer-down with an open editDrag: discard and STOP — do NOT fall through to `onPlotClick` (handle tol 2.5% > body tol 1.5% would deselect).
- `HANDLE_TOL_PCT = 2.5`; line-body tolerance stays the existing `DEFAULT_TOL_PCT = 1.5`.
- Body drag: ONE index delta `Math.round(dxFrac * span)` applied to both anchors, clamped so BOTH stay in `[0, seriesLen-1]`; y delta applied in plot-fraction space to each PROJECTED y then inverted via `yToPrice` (rigid under log).
- client-core must not import motion-core (`EqPaneId` doctrine) — the machine's types stay local; motion-core types unify structurally.
- No new DOM, no new testids, node budget unchanged (3a's ≤4-nodes-per-drawing assert must keep passing untouched).
- NO new visual scenarios, NO golden changes expected.
- Handler naming: concrete handlers named by effect; slots stay `onX` / bare nouns (`hitGrip`).
- Biome mandatory braces; `#/` subpath imports where the package uses them; run `pnpm exec biome ci .` scoped to touched packages before each commit.
- Worktree: `.claude/worktrees/drawing-tools-3b` (branch `worktree-drawing-tools-3b`, base 805d22591). All work happens there.

---

### Task 1: motion-core — `DrawingGrip`, `hitTestGrip`, `dragDrawing`

**Files:**
- Modify: `packages/motion-core/src/drawingScene.ts` (append after `hitTestDrawings`)
- Modify: `packages/motion-core/src/index.ts` (export the new names next to the existing drawingScene exports)
- Test: `packages/motion-core/src/drawingScene.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: existing `Drawing`, `DrawingAnchor`, `DrawingSceneItem`, `ChartViewport`, `ChartScale`, `priceToY`, `yToPrice`, `pointerToAnchor`, `segmentDistance` (module-local), `DEFAULT_TOL_PCT` (module-local).
- Produces (later tasks import these from `@rtc/motion-core`):
  - `interface DrawingGrip { readonly id: string; readonly part: "a" | "b" | "body" | "level" }`
  - `hitTestGrip(scene: readonly DrawingSceneItem[], xPct: number, yPct: number): DrawingGrip | null`
  - `dragDrawing(drawing: Drawing, grip: DrawingGrip, from: {xFrac: number; yFrac: number}, to: {xFrac: number; yFrac: number}, viewport: ChartViewport, scale: ChartScale, seriesLen: number): Drawing`

- [ ] **Step 1: Write the failing tests**

Append to `packages/motion-core/src/drawingScene.test.ts`. Reuse the file's existing fixtures/helpers where they exist (a linear `ChartScale` builder, viewport literals); the code below builds its own minimal ones so it stands alone — adapt identifiers to the file's conventions:

```ts
import {
  type Drawing,
  dragDrawing,
  drawingScene,
  hitTestGrip,
  priceToY,
} from "./drawingScene.js";
// (merge into the file's existing imports — priceToY/yToPrice come from
// chartScene.js in-module; the test file already imports from
// "./drawingScene.js" and "./chartScene.js" — follow its existing style.)

describe("hitTestGrip", () => {
  const vp = { start: 0, end: 10 };
  // linear scale: build exactly the way the file's existing drawingScene
  // tests build theirs (same ChartScale literal/helper).
  const tl: Drawing = {
    id: "t1",
    kind: "trendline",
    a: { index: 2, price: 105 },
    b: { index: 7, price: 115 },
  };
  const hl: Drawing = { id: "h1", kind: "hline", price: 110 };

  it("returns the endpoint handle when the pointer is within HANDLE_TOL_PCT of it — and the handle beats the body when both are in tolerance", () => {
    const scene = drawingScene([tl], vp, scale, "t1");
    const sel = scene[0];
    if (sel?.kind !== "trendline") throw new Error("expected trendline");
    // Exactly on handle a: both the handle (dist 0 <= 2.5) and the body
    // (dist 0 <= 1.5) hit; the handle must win.
    expect(hitTestGrip(scene, sel.x1, sel.y1)).toEqual({ id: "t1", part: "a" });
    expect(hitTestGrip(scene, sel.x2, sel.y2)).toEqual({ id: "t1", part: "b" });
  });

  it("returns body for a mid-segment hit outside both handle radii", () => {
    const scene = drawingScene([tl], vp, scale, "t1");
    const sel = scene[0];
    if (sel?.kind !== "trendline") throw new Error("expected trendline");
    const midX = (sel.x1 + sel.x2) / 2;
    const midY = (sel.y1 + sel.y2) / 2;
    expect(hitTestGrip(scene, midX, midY)).toEqual({ id: "t1", part: "body" });
  });

  it("never grips an unselected drawing, even dead-on", () => {
    const scene = drawingScene([tl], vp, scale, null);
    const item = scene[0];
    if (item?.kind !== "trendline") throw new Error("expected trendline");
    expect(hitTestGrip(scene, item.x1, item.y1)).toBeNull();
  });

  it("misses cleanly: far from everything returns null", () => {
    const scene = drawingScene([tl], vp, scale, "t1");
    expect(hitTestGrip(scene, 0, 0)).toBeNull();
  });

  it("an hline yields part 'level' from its handle AND from its body", () => {
    const scene = drawingScene([hl], vp, scale, "h1");
    const item = scene[0];
    if (item?.kind !== "hline") throw new Error("expected hline");
    // handle sits at x=50
    expect(hitTestGrip(scene, 50, item.y)).toEqual({ id: "h1", part: "level" });
    // far from the handle but on the line body
    expect(hitTestGrip(scene, 5, item.y)).toEqual({ id: "h1", part: "level" });
  });
});

describe("dragDrawing", () => {
  const vp = { start: 0, end: 10 };
  const tl: Drawing = {
    id: "t1",
    kind: "trendline",
    a: { index: 2, price: 105 },
    b: { index: 7, price: 115 },
  };

  it("endpoint drag routes through pointerToAnchor: candle-center x snap, free price", () => {
    const out = dragDrawing(
      tl,
      { id: "t1", part: "b" },
      { xFrac: 0.75, yFrac: 0.2 },
      { xFrac: 0.31, yFrac: 0.5 },
      vp,
      scale,
      10,
    );
    if (out.kind !== "trendline") throw new Error("expected trendline");
    // 0.31 * 10 - 0.5 = 2.6 -> rounds to 3
    expect(out.b.index).toBe(3);
    expect(out.a).toEqual(tl.a); // untouched anchor
  });

  it("body drag applies ONE rounded index delta to both anchors (rigid x)", () => {
    const out = dragDrawing(
      tl,
      { id: "t1", part: "body" },
      { xFrac: 0.2, yFrac: 0.5 },
      { xFrac: 0.42, yFrac: 0.5 }, // dxFrac 0.22 * span 10 = 2.2 -> +2
      vp,
      scale,
      20,
    );
    if (out.kind !== "trendline") throw new Error("expected trendline");
    expect(out.a.index).toBe(4);
    expect(out.b.index).toBe(9);
  });

  it("body drag clamps the delta so BOTH anchors stay in range — shape preserved at the edges", () => {
    const out = dragDrawing(
      tl,
      { id: "t1", part: "body" },
      { xFrac: 0.0, yFrac: 0.5 },
      { xFrac: 0.9, yFrac: 0.5 }, // raw +9, but b can only move +2 (seriesLen 10)
      vp,
      scale,
      10,
    );
    if (out.kind !== "trendline") throw new Error("expected trendline");
    expect(out.a.index).toBe(4); // 2 + 2
    expect(out.b.index).toBe(9); // 7 + 2 — same delta, shape intact
  });

  it("body drag is rigid in projected y under LOG scale (equal y-deltas, not equal price-deltas)", () => {
    // build a log ChartScale the same way the file's log-mode drawingScene
    // tests do (chartVm({yScale:"log"}) or the scale literal used there).
    const before = [priceToY(logScale, tl.a.price), priceToY(logScale, tl.b.price)];
    const out = dragDrawing(
      tl,
      { id: "t1", part: "body" },
      { xFrac: 0.5, yFrac: 0.3 },
      { xFrac: 0.5, yFrac: 0.55 }, // pure vertical, dyPct = +25
      vp,
      logScale,
      20,
    );
    if (out.kind !== "trendline") throw new Error("expected trendline");
    const after = [priceToY(logScale, out.a.price), priceToY(logScale, out.b.price)];
    expect(after[0] - before[0]).toBeCloseTo(25, 6);
    expect(after[1] - before[1]).toBeCloseTo(25, 6);
    // and the PRICE deltas differ (log): equal y-shift is not equal price-shift
    expect(out.a.price - tl.a.price).not.toBeCloseTo(out.b.price - tl.b.price, 6);
  });

  it("hline drag ('level') follows y only — x is ignored entirely", () => {
    const hl: Drawing = { id: "h1", kind: "hline", price: 110 };
    const out = dragDrawing(
      hl,
      { id: "h1", part: "level" },
      { xFrac: 0.5, yFrac: 0.5 },
      { xFrac: 0.99, yFrac: 0.25 },
      vp,
      scale,
      10,
    );
    if (out.kind !== "hline") throw new Error("expected hline");
    // whatever yToPrice(scale, 25) is — assert via the inverse:
    expect(priceToY(scale, out.price)).toBeCloseTo(25, 6);
  });

  it("a mismatched grip id returns the drawing unchanged (same reference)", () => {
    const out = dragDrawing(
      tl,
      { id: "OTHER", part: "body" },
      { xFrac: 0.2, yFrac: 0.2 },
      { xFrac: 0.8, yFrac: 0.8 },
      vp,
      scale,
      10,
    );
    expect(out).toBe(tl);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/motion-core test -- drawingScene`
Expected: FAIL — `hitTestGrip`/`dragDrawing` not exported.

- [ ] **Step 3: Implement**

Append to `packages/motion-core/src/drawingScene.ts`:

```ts
/** What a cursor-tool pointer-down grabbed on the SELECTED drawing.
 * `"a"`/`"b"` are a trendline's endpoint handles; `"body"` is its line body
 * (rigid translate); `"level"` is an hline's handle OR body — both mean the
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
 * (segment distance, DEFAULT_TOL_PCT). Items with `selected: false` are
 * never grips — selected-only drag is enforced here, in one pure function.
 * Same %-space anisotropy caveat as {@link hitTestDrawings}. */
export function hitTestGrip(
  scene: readonly DrawingSceneItem[],
  xPct: number,
  yPct: number,
): DrawingGrip | null {
  for (const item of scene) {
    if (!item.selected) {
      continue;
    }

    if (item.kind === "trendline") {
      // Handle order matches drawingScene's emission: [a, b].
      const parts = ["a", "b"] as const;

      for (let i = 0; i < item.handles.length; i++) {
        const h = item.handles[i];

        if (h && Math.hypot(xPct - h.x, yPct - h.y) <= HANDLE_TOL_PCT) {
          return { id: item.id, part: parts[i] ?? "b" };
        }
      }

      const bodyD = segmentDistance(
        xPct,
        yPct,
        item.x1,
        item.y1,
        item.x2,
        item.y2,
      );

      if (bodyD <= DEFAULT_TOL_PCT) {
        return { id: item.id, part: "body" };
      }

      continue;
    }

    // hline: the handle and the body both mean the same vertical-only drag.
    const onHandle = item.handles.some((h) => {
      return Math.hypot(xPct - h.x, yPct - h.y) <= HANDLE_TOL_PCT;
    });

    if (
      onHandle ||
      segmentDistance(xPct, yPct, 0, item.y, 100, item.y) <= DEFAULT_TOL_PCT
    ) {
      return { id: item.id, part: "level" };
    }
  }

  return null;
}

/** Projects a drag gesture onto a drawing — the one entry point for every
 * grip kind, shared verbatim by the preview and the commit (preview ≡
 * committed by construction, the same property the draw draft has).
 * Returns the drawing unchanged (same reference) when the grip id doesn't
 * match. */
export function dragDrawing(
  drawing: Drawing,
  grip: DrawingGrip,
  from: { readonly xFrac: number; readonly yFrac: number },
  to: { readonly xFrac: number; readonly yFrac: number },
  viewport: ChartViewport,
  scale: ChartScale,
  seriesLen: number,
): Drawing {
  if (drawing.id !== grip.id) {
    return drawing;
  }

  if (drawing.kind === "hline") {
    return { ...drawing, price: yToPrice(scale, to.yFrac * 100) };
  }

  if (grip.part === "a" || grip.part === "b") {
    const anchor = pointerToAnchor(
      to.xFrac,
      to.yFrac,
      viewport,
      scale,
      seriesLen,
    );
    return grip.part === "a"
      ? { ...drawing, a: anchor }
      : { ...drawing, b: anchor };
  }

  // Body: rigid translate. ONE index delta applied to both anchors, clamped
  // so BOTH stay in [0, seriesLen-1] (clamping the delta, not each anchor,
  // preserves the segment's shape at the series edges). The y delta is
  // applied in plot-fraction space to each endpoint's PROJECTED y and
  // re-inverted — rigid under linear AND log scale (a price-space delta
  // would deform the segment under log).
  const span = viewport.end - viewport.start || 1;
  const rawDelta = Math.round((to.xFrac - from.xFrac) * span);
  const minIdx = Math.min(drawing.a.index, drawing.b.index);
  const maxIdx = Math.max(drawing.a.index, drawing.b.index);
  const delta = Math.min(
    Math.max(rawDelta, -minIdx),
    seriesLen - 1 - maxIdx,
  );
  const dyPct = (to.yFrac - from.yFrac) * 100;

  function translateAnchor(anchor: DrawingAnchor): DrawingAnchor {
    return {
      index: anchor.index + delta,
      price: yToPrice(scale, priceToY(scale, anchor.price) + dyPct),
    };
  }

  return {
    ...drawing,
    a: translateAnchor(drawing.a),
    b: translateAnchor(drawing.b),
  };
}
```

Note: a trendline with `grip.part === "level"` cannot occur (`hitTestGrip` never emits it), and the code above naturally treats it as body — acceptable; do NOT add a dead guard branch (the repo deletes those — see the TileConfirmation precedent).

Export from `packages/motion-core/src/index.ts`: add `dragDrawing`, `hitTestGrip`, and `type DrawingGrip` alongside the existing `drawingScene`/`hitTestDrawings`/`pointerToAnchor` exports.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/motion-core test` and `pnpm --filter @rtc/motion-core typecheck` (script name per package.json — `tsc --noEmit`).
Expected: PASS, all pre-existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/motion-core/src/drawingScene.ts packages/motion-core/src/drawingScene.test.ts packages/motion-core/src/index.ts
git commit -m "feat(motion-core): hitTestGrip + dragDrawing for drawing drag-edit"
```

---

### Task 2: `EqDrawingsMachine.updateDrawing` + both bindings wrappers

**Files:**
- Modify: `packages/client-core/src/presenters/EqDrawingsMachine.ts`
- Test: `packages/client-core/src/presenters/EqDrawingsMachine.test.ts` (append)
- Modify: `packages/react-bindings/src/createViewModel.ts` (three spots: the stable-callback block ~line 900, the `useEqDrawings` return ~line 1132 — `UseEqDrawingsResult` extends `EqDrawingsIntents`, so the new intent is required by the type once added)
- Modify: `packages/solid-bindings/src/createViewModel.ts` (same three spots ~line 892 / ~line 1184)

**Interfaces:**
- Consumes: existing `EqDrawing`, `EqDrawingsState`, `Patch` pattern in the machine.
- Produces: `updateDrawing(sym: string, drawing: EqDrawing): void` on `EqDrawingsIntents`; `updateEqDrawing` wrapper exposed as `updateDrawing` on `useEqDrawings()` in BOTH bindings.

- [ ] **Step 1: Write the failing tests**

Append to `EqDrawingsMachine.test.ts` (follow the file's existing construction/teardown pattern):

```ts
it("updateDrawing replaces the drawing with the matching id IN PLACE (z-order stable)", () => {
  const m = createEqDrawingsMachine();
  const a: EqDrawing = { id: "d1", kind: "hline", price: 100 };
  const b: EqDrawing = { id: "d2", kind: "hline", price: 110 };
  const c: EqDrawing = { id: "d3", kind: "hline", price: 120 };
  m.intents.addDrawing("AAPL", a);
  m.intents.addDrawing("AAPL", b);
  m.intents.addDrawing("AAPL", c);

  m.intents.updateDrawing("AAPL", { id: "d2", kind: "hline", price: 999 });

  const list = m.state$.getValue().drawings.AAPL;
  expect(list?.map((d) => d.id)).toEqual(["d1", "d2", "d3"]);
  expect(list?.[1]).toEqual({ id: "d2", kind: "hline", price: 999 });
  m.dispose();
});

it("updateDrawing no-ops on an unknown id (state reference unchanged)", () => {
  const m = createEqDrawingsMachine();
  m.intents.addDrawing("AAPL", { id: "d1", kind: "hline", price: 100 });
  const before = m.state$.getValue();

  m.intents.updateDrawing("AAPL", { id: "ghost", kind: "hline", price: 1 });

  expect(m.state$.getValue()).toBe(before);
  m.dispose();
});

it("updateDrawing leaves selection and tool untouched — after a drag the user still holds the same selected drawing", () => {
  const m = createEqDrawingsMachine();
  m.intents.addDrawing("AAPL", { id: "d1", kind: "hline", price: 100 });
  // addDrawing auto-selected d1 and reverted tool to cursor

  m.intents.updateDrawing("AAPL", { id: "d1", kind: "hline", price: 200 });

  const s = m.state$.getValue();
  expect(s.selectedId).toBe("d1");
  expect(s.tool).toBe("cursor");
  m.dispose();
});
```

(If the file reads state via a helper other than `state$.getValue()` — e.g. a subscribe-and-capture util — use that; `@rx-state/core`'s `StateObservable` exposes `getValue()` and the 3a tests use whichever the file standardized on. Match it.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-core test -- EqDrawingsMachine`
Expected: FAIL — `updateDrawing` is not a function.

- [ ] **Step 3: Implement the machine intent**

In `EqDrawingsMachine.ts`:

1. `EqDrawingsIntents` gains (after `addDrawing`):
```ts
  updateDrawing(sym: string, drawing: EqDrawing): void;
```
2. Reuse `AddDrawingPayload` for the subject (same `{sym, drawing}` shape):
```ts
  const updateDrawing$ = new Subject<AddDrawingPayload>();
```
3. Patch stream (place after `addDrawingPatch$`):
```ts
  // updateDrawing: replaces the matching id in place (z-order stable);
  // no-op when the id isn't present (same defensive shape as
  // deleteSelected). Selection and tool are untouched — after a drag the
  // user is still holding the same selected drawing.
  const updateDrawingPatch$ = updateDrawing$.pipe(
    map(({ sym, drawing }): Patch => {
      return (s: EqDrawingsState): EqDrawingsState => {
        const list = s.drawings[sym] ?? [];
        const at = list.findIndex((d) => {
          return d.id === drawing.id;
        });

        if (at === -1) {
          return s;
        }

        const next = [...list];
        next[at] = drawing;
        return { ...s, drawings: { ...s.drawings, [sym]: next } };
      };
    }),
  );
```
4. Add `updateDrawingPatch$` to the `merge(...)`, the intent to the returned `intents` object, and `updateDrawing$.complete()` to `dispose()`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/client-core test -- EqDrawingsMachine`
Expected: PASS (including all 3a cases).

- [ ] **Step 5: Wire both bindings**

`packages/react-bindings/src/createViewModel.ts` — in the stable-callback block (after `addEqDrawing`, ~line 907):
```ts
  function updateEqDrawing(sym: string, drawing: EqDrawing): void {
    presenters.eqDrawings.intents.updateDrawing(sym, drawing);
  }
```
and in the `useEqDrawings` return object (~line 1137): `updateDrawing: updateEqDrawing,`.

`packages/solid-bindings/src/createViewModel.ts` — identical function after `addEqDrawing` (~line 899) and `updateDrawing: updateEqDrawing,` in its return (~line 1189).

Typecheck forces both: `UseEqDrawingsResult` extends `EqDrawingsIntents`, so a missing wrapper is a compile error — that IS the test.

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @rtc/client-core --filter @rtc/react-bindings --filter @rtc/solid-bindings typecheck && pnpm --filter @rtc/react-bindings --filter @rtc/solid-bindings test`
Expected: PASS.

```bash
git add packages/client-core/src/presenters/EqDrawingsMachine.ts packages/client-core/src/presenters/EqDrawingsMachine.test.ts packages/react-bindings/src/createViewModel.ts packages/solid-bindings/src/createViewModel.ts
git commit -m "feat(client-core): EqDrawingsMachine.updateDrawing + bindings wrappers"
```

---

### Task 3: React gesture hook — `editDrag` fork in `useChartGestures`

**Files:**
- Modify: `packages/client-react/src/ui/equities/chart/useChartGestures.ts`
- Test: `packages/client-react/src/ui/equities/chart/useChartGestures.test.ts` (append)

**Interfaces:**
- Consumes: `DrawingGrip` from `@rtc/motion-core` (Task 1); existing `PlotFrac`, `CLICK_MAX_PX`, `DragOrigin`, draft mechanics.
- Produces (Task 4 relies on these exact names):
  - `DrawGestureSlots` gains REQUIRED members `hitGrip: (p: PlotFrac) => DrawingGrip | null` and `onCommitEdit: (grip: DrawingGrip, from: PlotFrac, to: PlotFrac) => void`.
  - `export interface EditDrag { readonly grip: DrawingGrip; readonly from: PlotFrac; readonly to: PlotFrac }`
  - `ChartGestures` gains `readonly editDrag: EditDrag | null`.

- [ ] **Step 1: Write the failing tests**

Append to `useChartGestures.test.ts`. The file already has a harness for the 3a draw slots (fake pointer events with `clientX/clientY`, a stub rect, a `draw` slots object) — extend that harness; every existing slots literal in the file must gain the two new members (add `hitGrip: () => null` and `onCommitEdit: vi.fn()` to the shared builder so 3a cases keep compiling). New cases:

```ts
describe("editDrag (drag-edit fork)", () => {
  // Harness notes: tool "cursor". hitGrip returns a grip for pointer-downs
  // inside the "grab zone" the test controls — simplest: a vi.fn() the test
  // programs per-case.

  it("pointer-down on a grip opens editDrag instead of a pan; moves track `to`; pointer-up beyond CLICK_MAX_PX commits once with (grip, from, to)", () => {
    const grip = { id: "d1", part: "b" as const };
    const hitGrip = vi.fn().mockReturnValue(grip);
    const onCommitEdit = vi.fn();
    // pointer-down at (0.5, 0.5), move to (0.7, 0.3), up at (0.7, 0.3)
    // with a rect wide enough that the excursion is > 4px.
    // assert: editDrag !== null after down; editDrag.to tracks the move;
    // onCommitEdit called exactly once with (grip, {0.5,0.5}, {0.7,0.3});
    // viewport UNCHANGED (no pan happened).
  });

  it("pointer-up within CLICK_MAX_PX discards the editDrag WITHOUT calling onPlotClick or onCommitEdit (the deselect trap)", () => {
    // down on a grip, up 1px away: onCommitEdit NOT called, onPlotClick NOT
    // called, editDrag back to null.
  });

  it("Escape mid-editDrag discards it; the eventual stale pointer-up no-ops", () => {
    // down on grip, move, keyDown Escape -> editDrag null; then pointerUp
    // -> onCommitEdit NOT called, onPlotClick NOT called.
  });

  it("pointercancel mid-editDrag discards it", () => {
    // down on a grip, move, fire pointercancel (same pointerId) ->
    // editDrag null, onCommitEdit NOT called; a later pointerup no-ops.
  });

  it("hitGrip returning null falls through to the normal pan path (viewport changes on drag)", () => {
    // hitGrip -> null; down at 0.5, move to 0.3 (well beyond 4px on the
    // stub rect), up. Assert viewport.start CHANGED (the pan ran) and
    // onCommitEdit was never called.
  });

  it("Delete/Backspace is ignored while an editDrag is open", () => {
    // down on grip (editDrag open), keyDown Delete -> onDeleteKey NOT called.
  });

  it("hitGrip is only consulted when tool === 'cursor' (trendline tool pointer-down never calls it)", () => {
    // tool "trendline", hitGrip a vi.fn(); pointer-down on the plot ->
    // hitGrip NOT called (the trendline draft opened instead).
  });
});
```

Write these as REAL tests against the harness (renderHook / the file's existing pattern), not the sketches above — the sketches fix the behaviours and assertion targets; the file fixes the mechanics.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/client-react test -- useChartGestures`
Expected: FAIL — compile error on the new slot members / missing `editDrag`.

- [ ] **Step 3: Implement**

Edits to `useChartGestures.ts`:

1. Import the grip type: `import type { DrawingGrip } from "@rtc/motion-core";` (merge into the existing motion-core import).
2. After `DrawDraft`:
```ts
/** The in-flight drag-edit of an existing drawing — the editing twin of
 * `DrawDraft`, exposed alongside it. Lives here as view state (ADR-005);
 * the machine sees one updateDrawing only at commit. */
export interface EditDrag {
  readonly grip: DrawingGrip;
  readonly from: PlotFrac;
  readonly to: PlotFrac;
}
```
3. `DrawGestureSlots` gains (after `onPlotClick`):
```ts
  /** Consulted at pointer-down when tool === "cursor": the grip at the
   * pointer, or null. The hook stays projection-blind — CandleChart
   * implements this against its own drawItems. */
  readonly hitGrip: (p: PlotFrac) => DrawingGrip | null;
  /** Commits a finished drag-edit (pointer-up beyond CLICK_MAX_PX). */
  readonly onCommitEdit: (grip: DrawingGrip, from: PlotFrac, to: PlotFrac) => void;
```
4. State: `const [editDrag, setEditDrag] = useState<EditDrag | null>(null);` next to `draft`; expose `editDrag` in the returned object and in `ChartGestures`.
5. `startDrag`, after the hline branch and BEFORE the pan bookkeeping:
```ts
    if (draw?.tool === "cursor") {
      const p = plotFracOf(e);
      const grip = draw.hitGrip(p);

      if (grip) {
        const rect = e.currentTarget.getBoundingClientRect();
        dragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          rectWidth: rect.width,
          startViewport: viewport,
          downClient: { x: e.clientX, y: e.clientY },
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        setEditDrag({ grip, from: p, to: p });
        return;
      }
    }
```
(`dragRef` is still set — it carries the pointerId match and `downClient` for the click threshold; the pan path never runs because the move handler forks on `editDrag` first.)
6. `dragOrTrackCursor`, inside the `drag && drag.pointerId === e.pointerId` branch, BEFORE the `if (draft)` fork:
```ts
      if (editDrag) {
        const p = plotFracOf(e);
        setEditDrag((d) => {
          return d ? { ...d, to: p } : d;
        });
        setCursor({ ...p, inPlot: true });
        return;
      }
```
7. `endDrag`, after the excursion computation, BEFORE the `if (draft)` fork:
```ts
    if (editDrag) {
      // Beyond the click threshold: a deliberate drag — commit. Within it:
      // a no-move tap on a grip keeps the selection as-is; do NOT fall
      // through to onPlotClick (the handle tolerance is looser than the
      // body tolerance, so a fall-through click could miss the body test
      // and wrongly deselect).
      if (excursionPx > CLICK_MAX_PX) {
        draw?.onCommitEdit(editDrag.grip, editDrag.from, editDrag.to);
      }

      setEditDrag(null);
      return;
    }
```
8. `cancelDrag`: add `setEditDrag(null);` next to `setDraft(null);`.
9. `panOrZoomByKey` `"Escape"` case: change the guard to `if (!draft && !editDrag) { return; }` and add `setEditDrag(null);` after `setDraft(null);`. `"Delete"`/`"Backspace"` case: change the guard to `if (draw?.tool !== "cursor" || editDrag) { return; }`.

Note on the prepend-mid-editDrag interaction (C1's sibling): no extra handling needed. The editDrag's `from`/`to` are plot FRACTIONS; the commit projects through the viewport/scale current at pointer-up, and the committed drawing it starts from is the machine's (already prepend-shifted) one — everything stays consistent by construction. Document this in a short comment at the `EditDrag` interface if the reviewer asks; do not add code.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/client-react test -- useChartGestures`
Expected: PASS (all 3a cases + new). NOTE: `client-react`'s CandleChart won't compile yet if the required slot members break it — Task 4 fixes the one construction site; if `pnpm --filter @rtc/client-react typecheck` fails ONLY in CandleChart.tsx on the missing members, that is expected mid-stack; add the two members there as no-ops ONLY if needed to keep the test run compiling, and note it for Task 4 (vitest may compile the whole package). Prefer: implement Task 4's slot additions minimally here (two throw-free stubs) ONLY if the test runner requires it; otherwise leave untouched.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react/src/ui/equities/chart/useChartGestures.ts packages/client-react/src/ui/equities/chart/useChartGestures.test.ts
git commit -m "feat(client-react): editDrag fork in useChartGestures"
```

---

### Task 4: React wiring — `CandleChart` + `ChartPanel`

**Files:**
- Modify: `packages/client-react/src/ui/equities/chart/CandleChart.tsx`
- Modify: `packages/client-react/src/ui/equities/chart/ChartPanel.tsx`

**Interfaces:**
- Consumes: Task 1's `hitTestGrip`/`dragDrawing`/`DrawingGrip`, Task 2's `updateDrawing` on `useEqDrawings()`, Task 3's slots/`editDrag`.
- Produces: `CandleChartProps` gains `onUpdateDrawing?: (drawing: EqDrawing) => void` (default no-op `NOOP_UPDATE_DRAWING`). Contract tests (Task 5/6) rely on this prop name.

- [ ] **Step 1: Wire CandleChart**

1. Imports: add `dragDrawing`, `hitTestGrip`, `type DrawingGrip` to the `@rtc/motion-core` import.
2. Props: add `onUpdateDrawing = NOOP_UPDATE_DRAWING,` to the destructuring; to `CandleChartProps`:
```ts
  /** Replaces a drawing after a finished drag-edit (the same id, new
   * anchors). Slot: default no-op. */
  onUpdateDrawing?: (drawing: EqDrawing) => void;
```
and at the bottom: `function NOOP_UPDATE_DRAWING(_drawing: EqDrawing): void {}`.
3. `drawSlots` gains: `hitGrip: gripAt, onCommitEdit: commitEditedDrawing,`.
4. Destructure `editDrag` from `useChartGestures(...)`.
5. Preview — replace the `allDrawings` line with:
```ts
  // A drag-edit in flight previews by replacing the dragged drawing with
  // its dragDrawing projection — the SAME call the commit makes, so the
  // preview is byte-identical to what pointer-up will commit.
  const previewDrawings = editDrag
    ? drawings.map((d) => {
        return d.id === editDrag.grip.id
          ? dragDrawing(
              d,
              editDrag.grip,
              editDrag.from,
              editDrag.to,
              viewport,
              vm.scale,
              candles.length,
            )
          : d;
      })
    : drawings;
  const allDrawings = draft
    ? [...previewDrawings, draftToDrawing(draft)]
    : previewDrawings;
```
(motion-core's `Drawing` and client-core's `EqDrawing` unify structurally in BOTH directions — no casts.)
6. New hoisted handlers next to `selectHitDrawing`:
```ts
  function gripAt(p: PlotFrac): DrawingGrip | null {
    return hitTestGrip(drawItems, p.xFrac * 100, p.yFrac * 100);
  }

  function commitEditedDrawing(
    grip: DrawingGrip,
    from: PlotFrac,
    to: PlotFrac,
  ): void {
    const target = drawings.find((d) => {
      return d.id === grip.id;
    });

    if (!target) {
      return;
    }

    onUpdateDrawing(
      dragDrawing(target, grip, from, to, viewport, vm.scale, candles.length),
    );
  }
```

- [ ] **Step 2: Wire ChartPanel**

Destructure `updateDrawing` from `useEqDrawings()` (line ~34) and add to the `CandleChart` element (after `onCommitDrawing`):
```tsx
          onUpdateDrawing={(d: EqDrawing) => {
            updateDrawing(sel, d);
          }}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react test`
Expected: PASS — including the 3a contract-adjacent unit tests in the package.
Then run the react side of the shared contract suite: `pnpm --filter @rtc/client-react test:ui:contract` — 3a's ChartDrawings cases must still pass (nothing behavioural changed for them; the slots grew but CandleChart supplies the new members itself).

- [ ] **Step 4: Commit**

```bash
git add packages/client-react/src/ui/equities/chart/CandleChart.tsx packages/client-react/src/ui/equities/chart/ChartPanel.tsx
git commit -m "feat(client-react): drag-edit wiring — CandleChart preview/commit + ChartPanel updateDrawing"
```

---

### Task 5: Solid twins — `createChartGestures` + `CandleChart` + `ChartPanel`

**Files:**
- Modify: `packages/client-solid/src/ui/equities/chart/createChartGestures.ts`
- Test: `packages/client-solid/src/ui/equities/chart/createChartGestures.test.ts` (append — mirror Task 3's cases)
- Modify: `packages/client-solid/src/ui/equities/chart/CandleChart.tsx`
- Modify: `packages/client-solid/src/ui/equities/chart/ChartPanel.tsx`

**Interfaces:**
- Consumes: identical to Tasks 3–4.
- Produces: identical surface, Solid idioms: `editDrag` is exposed as `Accessor<EditDrag | null>` (like `draft`); `tool` stays the recorded `Accessor<EqDrawTool>` deviation; `hitGrip`/`onCommitEdit` are plain functions.

- [ ] **Step 1: Port the hook fork**

Mirror Task 3's nine edits into `createChartGestures.ts` with Solid idioms — the file is a line-for-line sibling; each 3a mechanism (draft signal, dragOrigin, plotFracOf, Escape case) has the same name or a signal twin:
- `const [editDrag, setEditDrag] = createSignal<EditDrag | null>(null);`
- every `draw?.tool === "cursor"` becomes `draw?.tool() === "cursor"` (the accessor deviation);
- reads inside handlers use `editDrag()`;
- expose `editDrag` (the accessor itself) on the returned object;
- `EditDrag` + the two new `DrawGestureSlots` members: identical declarations to Task 3 (plain functions, not accessors).

- [ ] **Step 2: Port the hook tests**

Append the same seven cases from Task 3 Step 1 to `createChartGestures.test.ts`, adapted to the file's existing Solid harness (it has one — 3a's draft cases live there). Extend the shared slots builder with `hitGrip: () => null, onCommitEdit: vi.fn()` so 3a cases compile.

Run: `pnpm --filter @rtc/client-solid test -- createChartGestures`
Expected: PASS.

- [ ] **Step 3: Port CandleChart + ChartPanel**

`CandleChart.tsx` (solid): same six edits as Task 4 Step 1, with Solid accessor syntax where the file uses it (props are plain in this component tree; `drawings` etc. arrive as props — mirror exactly how the 3a slots/preview are written there: the draft preview already exists as a `previewDrawings`-analogous computation; insert the editDrag branch the same way, reading `gestures.editDrag()`).
`ChartPanel.tsx` (solid): destructure `updateDrawing` and pass `onUpdateDrawing` — same shape as Task 4 Step 2 (check how the solid panel passes the 3a callbacks: same inline-arrow pattern).

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter @rtc/client-solid typecheck && pnpm --filter @rtc/client-solid test && pnpm --filter @rtc/client-solid test:ui:contract`
Expected: PASS.

```bash
git add packages/client-solid/src/ui/equities/chart/
git commit -m "feat(client-solid): drag-edit — createChartGestures fork + CandleChart/ChartPanel wiring"
```

---

### Task 6: Shared contract cases (both clients)

**Files:**
- Modify: `packages/ui-contract/src/specs/equities/chart/ChartDrawings.contract.spec.ts` (append a new `describe`)
- Modify (if a driver is missing): `packages/ui-contract/src/shared/pages/equities/chart/ChartPanelPage.ts` / `CandleChartPage.ts` — both already carry `plotPointerDown/Move/Up`, `pointerDown/setPointer/pointerUp`, `keyDown`, `drawingAttr`; add an Escape driver only if none exists (`keyDown("Escape")` on the plot may already cover it).

**Interfaces:**
- Consumes: the full stack Tasks 1–5; the harness `world` (real eqDrawings machine) and both clients' `viewModelFromWorld` — `updateDrawing` flows through automatically because the harness wires the REAL machine and the REAL bindings wrapper (verify: `packages/ui-contract/src/shared/harness/world.ts` and both `viewModelFromWorld.ts` — if the viewmodel object there enumerates intents explicitly, add `updateDrawing`).
- Produces: the six spec §7 contract cases, running against BOTH clients via the swap-trio.

- [ ] **Step 1: Write the cases (they should FAIL only if Tasks 1–5 mis-wired; write them to pin behaviour)**

New `describe("Drawing tools — drag-edit (ChartPanel, shared eqDrawings)")` following the existing first describe's setup (same world/panel/head page objects, same symbol/candle fixtures). The six cases:

```ts
it("dragging the selected trendline's endpoint handle moves that end only, and the geometry survives a re-render (machine-committed, not preview-only)", async () => {
  // 1. draw a trendline exactly like the existing pill-drives-plot case
  //    (head.setDrawTool("trendline"); panel.plotPointerDown(0.2, 0.7);
  //     panel.plotPointerMove(0.6, 0.3); panel.plotPointerUp(0.6, 0.3))
  //    — addDrawing auto-selects it.
  // 2. read the rendered x1/y1/x2/y2 via panel.drawingAttr(0, ...).
  // 3. pointer-down ON the b endpoint: xFrac = x2/100, yFrac = y2/100;
  //    move to (0.4, 0.15); pointer-up there.
  // 4. assert x2/y2 CHANGED, x1/y1 byte-unchanged.
  // 5. assert persistence: drive an unrelated re-render the way the
  //    prepend case does (world.setCandles with a same-length tail append)
  //    and re-assert the new x2/y2 — proves the machine holds the new
  //    anchors, not a transient preview.
});

it("dragging the line body translates both ends (rigid)", async () => {
  // draw as above; grab the segment midpoint ((x1+x2)/2/100, (y1+y2)/2/100),
  // move by (+0.15, -0.1), release. Assert BOTH x1/x2 changed and
  // y1/y2 changed, and (x2-x1, y2-y1) deltas are preserved within
  // rounding (parse floats, compare with a small epsilon).
});

it("Escape mid-drag reverts to the committed geometry byte-for-byte", async () => {
  // draw; snapshot all four attrs; pointer-down on the b handle; move
  // somewhere far; fire Escape on the plot (same driver the 3a
  // draft-cancel case uses); pointer-up. Assert all four attrs equal the
  // snapshot EXACTLY (string equality).
});

it("a no-move tap on a handle keeps the selection (the deselect trap)", async () => {
  // draw (auto-selected); pointer-down exactly on the b handle;
  // pointer-up at the SAME coordinates. Assert
  // panel.drawingAttr(0, "data-selected") === "true" still.
});

it("pointer-down on empty plot with a selection still pans (drag-edit never steals the pan)", async () => {
  // draw + selected; pointer-down far from the line (e.g. 0.05, 0.05 if
  // the line spans 0.2-0.6 — pick coords > 2.5% from handles and > 1.5%
  // from the body in %-space), drag horizontally, release.
  // Assert the drawing's committed attrs are UNCHANGED, and the pan
  // happened — assert via the navigator window style or the existing pan
  // assertion pattern in the chart specs (copy whichever signal the
  // existing pan case uses; if none exists in this file, asserting the
  // drawing geometry CHANGED-on-screen-but-not-in-anchors is wrong —
  // instead assert drawingAttr x1 shifted on screen because the viewport
  // moved, while a follow-up Escape-free pointer sequence shows no
  // updateDrawing occurred; simplest robust form: x1 attr changed
  // (viewport moved the projection) AND data-selected is still "true").
});

it("dragging a selected hline moves y only", async () => {
  // head.setDrawTool("hline"); panel.plotPointerDown(0.5, 0.6) commits +
  // auto-selects. Read y; pointer-down on (0.5, y/100) [the handle sits at
  // x=50]; move to (0.9, 0.3); release. Assert the y attr changed to ~30
  // and the drawing is still a full-width hline (x-independent: no x1/x2
  // attrs on the hline element per 3a's DrawingsLayer — assert data-kind
  // and the new y only).
});
```

Turn every comment into real driver calls — the existing 3a describes in this file show the exact world setup, symbol selection, and `await` points. The `data-selected`/`drawingAttr` drivers exist. Node-budget: do NOT touch the 3a budget case; it must pass unmodified.

- [ ] **Step 2: Run against BOTH clients**

Run: `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract`
Expected: PASS both. A failure here is a Task 3–5 defect: diagnose which client and fix in that task's files (amend that commit's area, new commit).

- [ ] **Step 3: Commit**

```bash
git add packages/ui-contract/src/
git commit -m "test(ui-contract): drag-edit contract cases — endpoint/body/hline drags, Escape revert, tap-keeps-selection, pan preserved"
```

---

### Task 7: e2e — endpoint drag journey (both clients)

**Files:**
- Modify: `tests/browser/scenarios/equitiesChart.ts` (new scenario steps)
- Modify: `tests/browser/page-objects/contracts/EquitiesChart.ts` (driver contract)
- Modify: `tests/browser/page-objects/playwright/EquitiesChart.ts` (playwright implementation)
- Modify: `tests/browser/playwright/equitiesChart.spec.ts` (extend the existing drawing test)

**Interfaces:**
- Consumes: the shipped 3a e2e drivers (`clickDrawPill`, `dragOnPlot`, `clickDrawingAtLine`, `expectDrawingVisibleWithin`, `expectDrawingSelectedWithin`) and testids (`chart-drawing`).
- Produces: `dragSelectedDrawingEndpoint(ctx)` + `expectDrawingGeometryChangedWithin(ctx, seconds)` (or equivalently-named per the contracts file's conventions — the page-object contract is grep-gated, so add the method to the contract interface AND the playwright implementation).

- [ ] **Step 1: Extend the journey**

In `equitiesChart.spec.ts`, extend the existing `"draw a trendline, select it, and delete it"` test — insert between the select assertion (line ~113) and `pressDelete`:

```ts
    const before = await equitiesChart.readDrawingGeometry(ctx);
    await equitiesChart.dragSelectedDrawingEndpoint(ctx);
    await equitiesChart.expectDrawingGeometryChangedWithin(ctx, before, 3);
```

and rename the test title to `"draw a trendline, select it, drag its endpoint, and delete it"`.

Driver implementations (playwright page object):
- `readDrawingGeometry`: return the `chart-drawing` line's `x1,y1,x2,y2` attribute string.
- `dragSelectedDrawingEndpoint`: locate the second `chart-drawing-handle` circle, read its `cx`/`cy` (percent coords) + the plot's bounding box, convert to page px, then `page.mouse.move → down → move(+80px, -60px, {steps: 10}) → up` (same steps discipline as `dragOnPlot`).
- `expectDrawingGeometryChangedWithin`: poll until the geometry string differs from `before` (expect.poll / the file's existing `*Within` wait pattern).

Follow the existing three-file pattern exactly (scenario step + contract method + playwright impl) — the contract is grep-gated (`tests/browser/page-objects/contracts` must declare every method the scenarios use).

- [ ] **Step 2: Run both clients' e2e for this suite**

Run (from repo root): `pnpm test:e2e -- --grep "equities chart"` — or the suite-scoped invocation the repo's `run-all.ts` supports; if scoping is awkward, run the full `pnpm test:e2e`. Both the react and solid targets must pass.
Expected: PASS. (The runner boots its own vite servers on RTC_DEV_PORT 3001+.)

- [ ] **Step 3: Commit**

```bash
git add tests/browser/
git commit -m "test(e2e): drag-edit endpoint step in the drawing journey (both clients)"
```

---

### Task 8: Docs + close-out (STATUS.md, §17.7) + full verification

**Files:**
- Modify: `docs/architecture/17-web-client-up-close.md` (§17.7 — extend the drawing-tools passage with one drag-edit sentence)
- Modify: `docs/STATUS.md` (the "Canvas chart renderer + TradingView tier" bullet: mark drawing tools 3a AND 3b done; Remaining: comparison series only. Bump the Last-updated line.)

**Interfaces:** none — prose only.

- [ ] **Step 1: §17.7** — after the existing 3a sentence (grep for "drawing tools" in the file), append one sentence in the section's voice, e.g.: "Drag-edit (3b) rides the same seam: `hitTestGrip` arbitrates handle-vs-body-vs-pan at pointer-down (selected drawing only), the in-flight drag lives in the gesture hook as an `editDrag` twin of the draw draft, and `dragDrawing` — shared verbatim by the preview and the pointer-up `updateDrawing` commit — keeps a body drag rigid under log scale by translating in projected-y space."

- [ ] **Step 2: STATUS.md** — edit the line-58 bullet: "**indicator panes (RSI + MACD) are DONE, log scale DONE, drawing tools DONE (3a + 3b drag-edit)**"; Remaining: "comparison series — …" (drop the 3b clause). Bump `**Last updated:**` to today.

- [ ] **Step 3: Full verification**

```bash
pnpm check:doc-links
pnpm --filter @rtc/motion-core --filter @rtc/client-core --filter @rtc/react-bindings --filter @rtc/solid-bindings --filter @rtc/client-react --filter @rtc/client-solid typecheck
pnpm exec biome ci .
```
Expected: all green (visual tier deliberately untouched — no golden run in this plan; the final review + gauntlet before the PR cover the rest).

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/17-web-client-up-close.md docs/STATUS.md
git commit -m "docs: drawing tools 3b close-out — §17.7 drag-edit + STATUS TradingView bullet"
```
