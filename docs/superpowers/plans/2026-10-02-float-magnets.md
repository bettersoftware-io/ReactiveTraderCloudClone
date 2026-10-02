# Floating Panels as Magnets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A floating panel dragged near another snaps flush, attaches on release into one floating window, moves with it, and detaches by a header button or an Option-drag.

**Architecture:** All logic lives in `@rtc/layout-dockview`. A new pure module `floatMagnets.ts` owns the geometry (snap, flush side, attach sizing, the release decision). `createDockEngine.ts` wires it into dockview's `transformFloatingGroupDrag` hook and its own head-press gestures, and exposes `attachPanel` / `detachPanel` / `onAttachedChange`. An attached cluster is dockview's own multi-group floating window, so moving, the inner sash and persistence are dockview's. Both web clients add one header button and one state set through their existing `DockviewLayoutEngine` bridges.

**Tech Stack:** TypeScript, dockview 8.3.1 (pinned), vitest + jsdom (engine), @testing-library (ui-contract), Playwright (e2e + visual goldens), React 19 and SolidJS clients.

**Spec:** [docs/superpowers/specs/2026-10-02-float-magnets-design.md](../specs/2026-10-02-float-magnets-design.md)

## Global Constraints

- dockview stays at `8.3.1`; the only private reach added is `component.getFloatingWindowForGroup`, declared in `DockviewInternals` beside `gridview.moveView`.
- `smartGuides` is never set: it is a paid `dockview-enterprise` module (spec §1 "Not in scope").
- `FLOAT_SNAP_DISTANCE_PX = 14`, `FLOAT_FLUSH_TOLERANCE_PX = 12` (spec §3.1).
- Snap targets are other floats only — never the container edges or grid sashes (spec §1).
- A cluster (2+ panels) snaps but never attaches (spec §4.1). Shift-release never attaches (spec §3.2).
- Side by side: each panel keeps its width, height = the taller. Stacked: free width adopts a lock, two locks keep the target's, width anchored at the target's left (spec §4.2).
- Detach: the panel floats at its own on-screen rect; the remainder keeps its top-left and loses the removed extent, except when the FIRST member leaves, when the left/top edge moves by the removed extent (spec §4.3).
- `DOCK_BLOB_VERSION` stays `3` (spec §4.5).
- Detach button: `data-testid="panel-<id>-detach"`, `aria-label="Detach <title>"`, glyph `⇱`, before the ⚓ control, rendered only while attached (spec §3.3).
- Cue element: `.rtc-attach-preview`, 2px, `--accent-primary`, on the target's side of the shared edge, only when the drop would attach (spec §3.4).
- Repo rules: fixture factories are `create*`; JSON fixtures are object literal + `JSON.stringify`; functions are named by effect; braces on every control statement; every new test is proven with `node scripts/mutation-check.mjs`; timer waits use fake timers; `[skip ci]` never appears in a commit message.
- Commits end with the two attribution lines given in the session's system reminder.

## Review Focus

1. **A union that exceeds the container** (attaching near the right or bottom edge): dockview clamps the window; both panels must stay visible and resizable. Pinned by the e2e assertion in Task 6 (window right edge ≤ container right edge after an edge attach).
2. **A member removed while attached** (closed through the View menu): the remaining window must shrink and `onAttachedChange` must report `[]`. Pinned in Task 3 (`api.removePanel` on a member).
3. **⚓ Dock-home of a member**: the remainder shrinks, attached set empties, the docked panel keeps its pre-float home size. Pinned in Task 3.
4. **Shift-release while flush against a float**: docks into the grid under the pointer, never attaches. Pinned by `shouldAttachOnRelease` in Task 1 and the engine's use of it in Task 4.
5. **A reset / preset load that drops floats** must also clear the attached set in the client, or stale detach buttons stay on docked heads. Pinned in Task 5 (`setAttached([])` beside `setFloating([])`, asserted through the ui-contract reset spec).

---

### Task 1: Pure geometry — `floatMagnets.ts`

**Files:**
- Create: `packages/layout-dockview/src/floatMagnets.ts`
- Create: `packages/layout-dockview/src/floatMagnets.test.ts`
- Modify: `packages/layout-dockview/src/index.ts` (add `export * from "#/floatMagnets";`)

**Interfaces:**
- Produces:
  ```ts
  export interface Box { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
  export type AttachSide = "left" | "right" | "top" | "bottom";
  export interface SnapEngagement { readonly other: Box; readonly side: AttachSide }
  export interface SnapResult { readonly left: number; readonly top: number; readonly engaged: SnapEngagement | null }
  export const FLOAT_SNAP_DISTANCE_PX = 14;
  export const FLOAT_FLUSH_TOLERANCE_PX = 12;
  export function snapToSiblings(proposed: Box, others: readonly Box[], suspended: boolean): SnapResult;
  export function flushSideOf(mine: Box, theirs: Box): AttachSide | null;
  export interface WidthRule { readonly width: number; readonly lock: number | undefined }
  export function stackedWidthFor(target: WidthRule, incoming: WidthRule): number;
  export interface AttachPlan { readonly window: Box; readonly newcomerExtent: number; readonly memberWidth: number | null }
  export function attachedWindowFor(mine: Box, theirs: Box, side: AttachSide, locks: { mine: number | undefined; theirs: number | undefined }): AttachPlan;
  export interface ReleaseContext { readonly lone: boolean; readonly altKey: boolean; readonly shiftKey: boolean; readonly detachedThisDrag: boolean; readonly side: AttachSide | null }
  export function shouldAttachOnRelease(context: ReleaseContext): context is ReleaseContext & { side: AttachSide };
  ```
  `side` is relative to the TARGET (`"right"` = the newcomer sits to the target's right), which is also dockview's `moveTo` `position`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/layout-dockview/src/floatMagnets.test.ts
import { describe, expect, it } from "vitest";

import {
  attachedWindowFor,
  type Box,
  FLOAT_FLUSH_TOLERANCE_PX,
  FLOAT_SNAP_DISTANCE_PX,
  flushSideOf,
  shouldAttachOnRelease,
  snapToSiblings,
  stackedWidthFor,
} from "#/floatMagnets";

describe("snapToSiblings", () => {
  it("pulls the dragged box flush to a sibling's right edge at exactly the snap distance, not one px beyond", () => {
    const other = createBox(100, 100, 300, 200);
    const atLimit = snapToSiblings(createBox(400 + FLOAT_SNAP_DISTANCE_PX, 100, 300, 200), [other], false);
    const beyond = snapToSiblings(createBox(400 + FLOAT_SNAP_DISTANCE_PX + 1, 100, 300, 200), [other], false);

    expect(atLimit.left).toBe(400);
    expect(atLimit.engaged).toEqual({ other, side: "right" });
    expect(beyond.left).toBe(400 + FLOAT_SNAP_DISTANCE_PX + 1);
    expect(beyond.engaged).toBeNull();
  });

  it("snaps to the sibling's left edge when approaching from the left", () => {
    const other = createBox(500, 100, 300, 200);
    const result = snapToSiblings(createBox(500 - 300 - 10, 100, 300, 200), [other], false);

    expect(result.left).toBe(200);
    expect(result.engaged?.side).toBe("left");
  });

  it("snaps below and above along the vertical axis", () => {
    const other = createBox(100, 100, 300, 200);

    expect(snapToSiblings(createBox(100, 310, 300, 150), [other], false)).toMatchObject({ top: 300, engaged: { side: "bottom" } });
    expect(snapToSiblings(createBox(100, 100 - 150 - 9, 300, 150), [other], false)).toMatchObject({ top: -50, engaged: { side: "top" } });
  });

  it("aligns the tops only when they are within range too", () => {
    const other = createBox(100, 100, 300, 200);

    expect(snapToSiblings(createBox(405, 108, 300, 200), [other], false).top).toBe(100);
    expect(snapToSiblings(createBox(405, 140, 300, 200), [other], false).top).toBe(140);
  });

  it("ignores a sibling that does not overlap on the perpendicular axis", () => {
    const other = createBox(100, 100, 300, 200);
    const result = snapToSiblings(createBox(405, 400, 300, 200), [other], false);

    expect(result).toEqual({ left: 405, top: 400, engaged: null });
  });

  it("takes the nearest qualifying edge when two siblings qualify", () => {
    const near = createBox(100, 100, 300, 200); // right edge 400
    const far = createBox(720, 100, 300, 200); // left edge 720, dragged right edge 708
    const result = snapToSiblings(createBox(405, 100, 300, 200), [far, near], false);

    expect(result.left).toBe(400);
    expect(result.engaged?.other).toBe(near);
  });

  it("returns the proposal untouched while suspended (Option held)", () => {
    const proposed = createBox(405, 108, 300, 200);

    expect(snapToSiblings(proposed, [createBox(100, 100, 300, 200)], true)).toEqual({ left: 405, top: 108, engaged: null });
  });
});

describe("flushSideOf", () => {
  const theirs = createBox(100, 100, 300, 200);

  it.each([
    ["right", createBox(400 + FLOAT_FLUSH_TOLERANCE_PX, 120, 200, 100)],
    ["left", createBox(100 - 200 - FLOAT_FLUSH_TOLERANCE_PX, 120, 200, 100)],
    ["bottom", createBox(150, 300 + FLOAT_FLUSH_TOLERANCE_PX, 200, 100)],
    ["top", createBox(150, 100 - 100 - FLOAT_FLUSH_TOLERANCE_PX, 200, 100)],
  ] as const)("reports %s for a box touching that side within tolerance", (side, mine) => {
    expect(flushSideOf(mine, theirs)).toBe(side);
  });

  it("is null one px past the tolerance and for a corner-only touch", () => {
    expect(flushSideOf(createBox(400 + FLOAT_FLUSH_TOLERANCE_PX + 1, 120, 200, 100), theirs)).toBeNull();
    expect(flushSideOf(createBox(400, 300, 200, 100), theirs)).toBeNull();
  });
});

describe("stackedWidthFor", () => {
  it("keeps the target's width when neither is locked", () => {
    expect(stackedWidthFor({ width: 500, lock: undefined }, { width: 420, lock: undefined })).toBe(500);
  });

  it("adopts the lock from whichever side has one", () => {
    expect(stackedWidthFor({ width: 500, lock: undefined }, { width: 367, lock: 367 })).toBe(367);
    expect(stackedWidthFor({ width: 367, lock: 367 }, { width: 500, lock: undefined })).toBe(367);
  });

  it("keeps the target's lock when both are locked", () => {
    expect(stackedWidthFor({ width: 367, lock: 367 }, { width: 300, lock: 300 })).toBe(367);
  });
});

describe("attachedWindowFor", () => {
  const theirs = createBox(100, 100, 300, 200);

  it("side by side: the union, as tall as the taller, the newcomer keeping its width", () => {
    const plan = attachedWindowFor(createBox(400, 100, 250, 260), theirs, "right", { mine: undefined, theirs: undefined });

    expect(plan).toEqual({ window: createBox(100, 100, 550, 260), newcomerExtent: 250, memberWidth: null });
  });

  it("stacked: anchored at the target's left, the heights summed, the lock adopted as the member width", () => {
    const plan = attachedWindowFor(createBox(90, 300, 500, 150), theirs, "bottom", { mine: undefined, theirs: 300 });

    expect(plan).toEqual({ window: createBox(100, 100, 300, 350), newcomerExtent: 150, memberWidth: 300 });
  });

  it("stacked above: the window's top moves up by the newcomer's height", () => {
    const plan = attachedWindowFor(createBox(100, -50, 300, 150), theirs, "top", { mine: undefined, theirs: undefined });

    expect(plan.window).toEqual(createBox(100, -50, 300, 350));
  });
});

describe("shouldAttachOnRelease", () => {
  const base = { lone: true, altKey: false, shiftKey: false, detachedThisDrag: false, side: "right" as const };

  it("attaches a lone float released flush with no modifier", () => {
    expect(shouldAttachOnRelease(base)).toBe(true);
  });

  it.each([
    ["a cluster", { lone: false }],
    ["Option held", { altKey: true }],
    ["Shift held", { shiftKey: true }],
    ["a detach in the same drag", { detachedThisDrag: true }],
    ["no flush side", { side: null }],
  ])("refuses for %s", (_label, override) => {
    expect(shouldAttachOnRelease({ ...base, ...override })).toBe(false);
  });
});

function createBox(left: number, top: number, width: number, height: number): Box {
  return { left, top, width, height };
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run src/floatMagnets.test.ts`
Expected: FAIL — `Failed to resolve import "#/floatMagnets"`.

- [ ] **Step 3: Implement the module**

```ts
// packages/layout-dockview/src/floatMagnets.ts
/** The geometry of floating panels that behave like magnets: snapping a
 * dragged float flush to its siblings, deciding which side two floats touch
 * on, sizing the window two floats merge into, and the release decision.
 * Pure — no DOM, no dockview — so every rule is provable on numbers alone.
 * Boxes are in the dock container's pixel space, top-left anchored. */

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Relative to the TARGET: `"right"` puts the newcomer to the target's right.
 * Same vocabulary as dockview's `moveTo` `position`. */
export type AttachSide = "left" | "right" | "top" | "bottom";

export interface SnapEngagement {
  readonly other: Box;
  readonly side: AttachSide;
}

export interface SnapResult {
  readonly left: number;
  readonly top: number;
  /** The sibling edge the drag engaged on, or null when nothing snapped. */
  readonly engaged: SnapEngagement | null;
}

/** How near, in px, a dragged edge must come to a sibling's edge to snap. */
export const FLOAT_SNAP_DISTANCE_PX = 14;
/** How far apart two edges may still be at release and count as touching. */
export const FLOAT_FLUSH_TOLERANCE_PX = 12;

/** The dragged box pulled flush to the nearest sibling edge within
 * {@link FLOAT_SNAP_DISTANCE_PX}, its top (side by side) or left (stacked)
 * aligned too when that is also within range. Only floats that overlap the
 * dragged box on the perpendicular axis count. `suspended` (Option held)
 * returns the proposal as is. */
export function snapToSiblings(
  proposed: Box,
  others: readonly Box[],
  suspended: boolean,
): SnapResult {
  if (suspended) {
    return { left: proposed.left, top: proposed.top, engaged: null };
  }

  let best: { distance: number; left: number; top: number; engaged: SnapEngagement } | null = null;

  for (const other of others) {
    for (const candidate of edgeCandidates(proposed, other)) {
      if (candidate.distance <= FLOAT_SNAP_DISTANCE_PX && (best === null || candidate.distance < best.distance)) {
        best = candidate;
      }
    }
  }

  return best === null
    ? { left: proposed.left, top: proposed.top, engaged: null }
    : { left: best.left, top: best.top, engaged: best.engaged };
}

/** Which side of `theirs` the box `mine` sits flush against, within
 * {@link FLOAT_FLUSH_TOLERANCE_PX}, or null — a corner-only touch is null. */
export function flushSideOf(mine: Box, theirs: Box): AttachSide | null {
  if (overlapsVertically(mine, theirs)) {
    if (Math.abs(mine.left - right(theirs)) <= FLOAT_FLUSH_TOLERANCE_PX) {
      return "right";
    }

    if (Math.abs(right(mine) - theirs.left) <= FLOAT_FLUSH_TOLERANCE_PX) {
      return "left";
    }
  }

  if (overlapsHorizontally(mine, theirs)) {
    if (Math.abs(mine.top - bottom(theirs)) <= FLOAT_FLUSH_TOLERANCE_PX) {
      return "bottom";
    }

    if (Math.abs(bottom(mine) - theirs.top) <= FLOAT_FLUSH_TOLERANCE_PX) {
      return "top";
    }
  }

  return null;
}

export interface WidthRule {
  readonly width: number;
  readonly lock: number | undefined;
}

/** The width every member of a STACKED cluster takes: a lock wins over a
 * free width (spec §4.2 — the free panel adopts it), two locks keep the
 * target's, two free widths keep the target's. */
export function stackedWidthFor(target: WidthRule, incoming: WidthRule): number {
  if (target.lock !== undefined) {
    return target.lock;
  }

  return incoming.lock ?? target.width;
}

export interface AttachPlan {
  /** The merged window's box. */
  readonly window: Box;
  /** The newcomer's extent along the split axis — its width side by side,
   * its height stacked — so it keeps the size it arrived with. */
  readonly newcomerExtent: number;
  /** Stacked only: the width every member takes. Null side by side. */
  readonly memberWidth: number | null;
}

/** The window two floats merge into when `mine` attaches on `side` of
 * `theirs` (spec §4.2). */
export function attachedWindowFor(
  mine: Box,
  theirs: Box,
  side: AttachSide,
  locks: { readonly mine: number | undefined; readonly theirs: number | undefined },
): AttachPlan {
  if (side === "left" || side === "right") {
    const left = Math.min(mine.left, theirs.left);
    const top = Math.min(mine.top, theirs.top);

    return {
      window: {
        left,
        top,
        width: Math.max(right(mine), right(theirs)) - left,
        height: Math.max(mine.height, theirs.height),
      },
      newcomerExtent: mine.width,
      memberWidth: null,
    };
  }

  const width = stackedWidthFor(
    { width: theirs.width, lock: locks.theirs },
    { width: mine.width, lock: locks.mine },
  );

  return {
    window: {
      left: theirs.left,
      top: side === "top" ? theirs.top - mine.height : theirs.top,
      width,
      height: mine.height + theirs.height,
    },
    newcomerExtent: mine.height,
    memberWidth: width,
  };
}

export interface ReleaseContext {
  /** The dragged window holds exactly one group. */
  readonly lone: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  /** A detach happened earlier in this same drag. */
  readonly detachedThisDrag: boolean;
  readonly side: AttachSide | null;
}

/** Whether releasing the drag attaches (spec §3.2): a lone float, flush
 * against a sibling, with no Option (snap suspended), no Shift (dock home),
 * and no detach earlier in the same motion. */
export function shouldAttachOnRelease(
  context: ReleaseContext,
): context is ReleaseContext & { readonly side: AttachSide } {
  return (
    context.lone &&
    !context.altKey &&
    !context.shiftKey &&
    !context.detachedThisDrag &&
    context.side !== null
  );
}

interface EdgeCandidate {
  readonly distance: number;
  readonly left: number;
  readonly top: number;
  readonly engaged: SnapEngagement;
}

/** Every edge of `other` the `proposed` box could snap to, with the position
 * it would take there. */
function edgeCandidates(proposed: Box, other: Box): readonly EdgeCandidate[] {
  const candidates: EdgeCandidate[] = [];

  if (overlapsVertically(proposed, other)) {
    const top = Math.abs(other.top - proposed.top) <= FLOAT_SNAP_DISTANCE_PX ? other.top : proposed.top;

    candidates.push(
      { distance: Math.abs(proposed.left - right(other)), left: right(other), top, engaged: { other, side: "right" } },
      { distance: Math.abs(right(proposed) - other.left), left: other.left - proposed.width, top, engaged: { other, side: "left" } },
    );
  }

  if (overlapsHorizontally(proposed, other)) {
    const left = Math.abs(other.left - proposed.left) <= FLOAT_SNAP_DISTANCE_PX ? other.left : proposed.left;

    candidates.push(
      { distance: Math.abs(proposed.top - bottom(other)), left, top: bottom(other), engaged: { other, side: "bottom" } },
      { distance: Math.abs(bottom(proposed) - other.top), left, top: other.top - proposed.height, engaged: { other, side: "top" } },
    );
  }

  return candidates;
}

function right(box: Box): number {
  return box.left + box.width;
}

function bottom(box: Box): number {
  return box.top + box.height;
}

function overlapsVertically(a: Box, b: Box): boolean {
  return a.top < bottom(b) && b.top < bottom(a);
}

function overlapsHorizontally(a: Box, b: Box): boolean {
  return a.left < right(b) && b.left < right(a);
}
```

Add `export * from "#/floatMagnets";` to `packages/layout-dockview/src/index.ts`.

- [ ] **Step 4: Run to verify they pass; lint**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run src/floatMagnets.test.ts && pnpm exec biome ci packages/layout-dockview && pnpm exec eslint packages/layout-dockview/src/floatMagnets.ts packages/layout-dockview/src/floatMagnets.test.ts`
Expected: all tests PASS, no lint errors (use `pnpm exec eslint --fix` for padding lines, then re-run).

- [ ] **Step 5: Prove the tests can fail**

Write this spec to the scratchpad (not committed) and run `node scripts/mutation-check.mjs <path>`:

```json
[
  { "file": "packages/layout-dockview/src/floatMagnets.ts", "find": "candidate.distance <= FLOAT_SNAP_DISTANCE_PX", "replace": "candidate.distance < FLOAT_SNAP_DISTANCE_PX", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/floatMagnets.test.ts" },
  { "file": "packages/layout-dockview/src/floatMagnets.ts", "find": "candidate.distance < best.distance", "replace": "candidate.distance > best.distance", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/floatMagnets.test.ts" },
  { "file": "packages/layout-dockview/src/floatMagnets.ts", "find": "      return \"right\";\n    }\n\n    if (Math.abs(right(mine) - theirs.left)", "replace": "      return \"left\";\n    }\n\n    if (Math.abs(right(mine) - theirs.left)", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/floatMagnets.test.ts" },
  { "file": "packages/layout-dockview/src/floatMagnets.ts", "find": "return incoming.lock ?? target.width;", "replace": "return target.width;", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/floatMagnets.test.ts" },
  { "file": "packages/layout-dockview/src/floatMagnets.ts", "find": "top: side === \"top\" ? theirs.top - mine.height : theirs.top,", "replace": "top: theirs.top,", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/floatMagnets.test.ts" },
  { "file": "packages/layout-dockview/src/floatMagnets.ts", "find": "!context.detachedThisDrag &&", "replace": "", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/floatMagnets.test.ts" }
]
```
Expected: every row KILLED. A SURVIVED row means the matching test is too weak — strengthen it before continuing.

- [ ] **Step 6: Commit**

```bash
git add packages/layout-dockview/src/floatMagnets.ts packages/layout-dockview/src/floatMagnets.test.ts packages/layout-dockview/src/index.ts
git commit -m "feat(layout-dockview): pure geometry for magnetic floats"
```

---

### Task 2: Engine — the cluster model, `onAttachedChange`, and the width rule that broke restore

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` — `DockEngineOptions` (after `onFloatsChange`, ~line 134), `DockviewInternals` (~line 5418), `fitLockedFloatBoxes` (~line 2052), the publish block near `publishFloatingPanels` (~line 604), `settleFloatTransitions`'s tail (~line 3511)
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: `stackedWidthFor` from Task 1.
- Produces, inside `createDockEngine`'s closure (used by Tasks 3 and 4):
  ```ts
  interface FloatCluster { readonly memberIds: readonly string[]; readonly orientation: "HORIZONTAL" | "VERTICAL" | null; readonly box: DockFloatBox }
  function clusterOf(panelId: string): FloatCluster | null;      // the floating window holding panelId, from api.toJSON(); null when not floating
  function attachedPanelIds(): readonly string[];                 // sorted members of every window with >1 group
  function publishAttachedPanels(): void;                         // onAttachedChange on change only
  function floatingWindowOf(group): { readonly group: { readonly element: HTMLElement }; position(bounds: Partial<{top;left;width;height}>): void } | undefined;
  ```
  and the public option `onAttachedChange?: (attachedPanelIds: readonly string[]) => void`.

- [ ] **Step 1: Write the failing tests**

Append to `createDockEngine.test.ts`, before the trailing helper functions (the file ends in helpers; add this `describe` right above `function lastDockviewApi()`):

```ts
describe("attached floats — the cluster model and the width rule", () => {
  // A cluster is dockview's own multi-group floating window. These tests
  // build one through dockview's api (`moveTo` onto a floating group), not
  // through a gesture: jsdom reports zero-size rects, so the sizing rules
  // are proven on numbers in floatMagnets.test.ts and in the e2e run.
  it("publishes the whole attached set on attach and on detach, not on an unrelated change", () => {
    const reports: (readonly string[])[] = [];
    const engine = createDockEngine({
      ...createLockedRailBase(),
      container: sizedContainer(1440, 900),
      onAttachedChange: (ids: readonly string[]): void => {
        reports.push(ids);
      },
    });
    const api = lastDockviewApi();

    floatAt(api, "fx-analytics", 100, 100, 367, 300);
    floatAt(api, "fx-positions", 600, 100, 367, 300);
    expect(reports).toEqual([]);

    joinFloats(api, "fx-positions", "fx-analytics", "right");
    expect(reports).toEqual([["fx-analytics", "fx-positions"]]);

    engine.collapsePanel("fx-rates"); // unrelated: no new report
    expect(reports).toHaveLength(1);

    api.addFloatingGroup(groupOf(api, "fx-positions"), { x: 900, y: 500, width: 367, height: 300 });
    expect(reports).toEqual([["fx-analytics", "fx-positions"], []]);
    engine.dispose();
  });

  // The restore bug the spike hit: both members are 360-locked, so the old
  // rule box-locked the WHOLE window at one panel's width and the second
  // panel was clipped away after a reload.
  it("restores a side-by-side cluster of two locked panels without box-locking the window", () => {
    const container = sizedContainer(1440, 900);
    let saved = "";
    const first = createDockEngine({
      ...createLockedRailBase(),
      container,
      onLayoutChange: (blob: string): void => {
        saved = blob;
      },
    });
    const api = lastDockviewApi();

    floatAt(api, "fx-analytics", 100, 100, 367, 300);
    floatAt(api, "fx-positions", 600, 100, 367, 300);
    joinFloats(api, "fx-positions", "fx-analytics", "right");
    touchContainer(container);
    first.dispose();
    expect(saved).toContain('"orientation":"HORIZONTAL"');

    const second = createDockEngine({ ...createLockedRailBase(), container, blob: saved });
    const box = floatBoxElementOf(lastDockviewApi(), "fx-analytics");

    expect(floatMembersOf(lastDockviewApi(), "fx-analytics")).toEqual(["fx-analytics", "fx-positions"]);
    expect(box.classList.contains("rtc-dock-float-fixed-width")).toBe(false);
    // Each member keeps ITS OWN lock inside the cluster (min = max).
    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    expect(widthClampOf("fx-positions")).toEqual([367, 367]);
    second.dispose();
  });

  it("box-locks a STACKED cluster when a member is locked, and gives every member the lock", () => {
    const engine = createDockEngine({ ...createLockedRailBase(), container: sizedContainer(1440, 900) });
    const api = lastDockviewApi();

    floatAt(api, "fx-analytics", 100, 100, 367, 300);
    floatAt(api, "fx-blotter", 100, 500, 600, 200);
    joinFloats(api, "fx-blotter", "fx-analytics", "bottom");

    expect(floatBoxElementOf(api, "fx-analytics").classList.contains("rtc-dock-float-fixed-width")).toBe(true);
    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    engine.dispose();
  });

  it("leaves a stacked cluster of two FREE panels unlocked", () => {
    const engine = createDockEngine({ ...createRailBase(), container: sizedContainer(1440, 900) });
    const api = lastDockviewApi();

    floatAt(api, "fx-rates", 100, 100, 500, 300);
    floatAt(api, "fx-blotter", 100, 500, 600, 200);
    joinFloats(api, "fx-blotter", "fx-rates", "bottom");

    expect(floatBoxElementOf(api, "fx-rates").classList.contains("rtc-dock-float-fixed-width")).toBe(false);
    engine.dispose();
  });
});
```

And these helpers at the bottom of the file, beside `widthClampOf`:

```ts
/** dockview's own group object for `panelId` — what `addFloatingGroup` and
 * `moveTo` want (the engine's `SizableGroup` is a narrowed view). */
function groupOf(api: DockviewApi, panelId: string) {
  const panel = api.getPanel(panelId);

  if (panel === undefined) {
    throw new Error(`${panelId} is not in the dock`);
  }

  return panel.group;
}

/** Floats `panelId` at an explicit box — bypassing `floatPanel`, whose
 * opening box is measured from rects jsdom reports as zero. */
function floatAt(api: DockviewApi, panelId: string, x: number, y: number, width: number, height: number): void {
  api.addFloatingGroup(groupOf(api, panelId), { x, y, width, height });
}

/** Merges `panelId`'s float into `targetId`'s floating window on `side`
 * — the same dockview call the engine's attach makes. */
function joinFloats(api: DockviewApi, panelId: string, targetId: string, side: Position): void {
  groupOf(api, panelId).api.moveTo({ group: groupOf(api, targetId), position: side });
}

/** The `.dv-resize-container` box element of the float holding `panelId`. */
function floatBoxElementOf(api: DockviewApi, panelId: string): HTMLElement {
  const box = groupOf(api, panelId).element.closest<HTMLElement>(".dv-resize-container");

  if (box === null) {
    throw new Error(`${panelId} is not in a float`);
  }

  return box;
}

/** Every panel id in the floating window holding `panelId`, sorted. */
function floatMembersOf(api: DockviewApi, panelId: string): readonly string[] {
  return [...floatBoxElementOf(api, panelId).querySelectorAll(".dv-groupview")]
    .flatMap((element) => {
      return api.groups
        .filter((group) => {
          return group.element === element;
        })
        .flatMap((group) => {
          return group.panels.map((panel) => {
            return panel.id;
          });
        });
    })
    .sort();
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t "attached floats"`
Expected: FAIL — the first test reports nothing (`onAttachedChange` unknown → TS error or `[]`), the restore test finds the class present.

- [ ] **Step 3: Implement**

(a) In `DockEngineOptions`, directly after `onFloatsChange`:

```ts
  /** Every panel whose floating window holds MORE THAN ONE group — an
   * attached cluster (spec 2026-10-02 float magnets) — sorted. Fires only
   * on change; nothing at construction unless a restored blob holds one. */
  readonly onAttachedChange?: (attachedPanelIds: readonly string[]) => void;
```

(b) Extend `DockviewInternals` (keep `gridview`):

```ts
/** The dockview internals this engine reaches past the public api. Each is
 * re-verified on every dockview upgrade (8.3.1 pinned): a rename degrades to
 * a documented fallback and reds the test that names it here. */
interface DockviewInternals {
  readonly component?: {
    readonly gridview?: {
      moveView(parentLocation: number[], from: number, to: number): void;
    };
    /** The floating window hosting `group`, matched by membership (a window
     * holds a nested layout, not only its anchor group). Spec §2: the one
     * reach the attach feature adds. Test: "restores a side-by-side cluster". */
    getFloatingWindowForGroup?(group: unknown): FloatingWindowInternals | undefined;
  };
}

interface FloatingWindowInternals {
  /** The window's anchor group — the one dockview wired the move drag to. */
  readonly group: { readonly element: HTMLElement };
  position(bounds: Partial<{ top: number; left: number; width: number; height: number }>): void;
}
```

(c) Inside `createDockEngine`, next to `floatingPanelIds` / `publishFloatingPanels`:

```ts
  /** The floating window holding `panelId`, read from the MODEL
   * (`api.toJSON()`), never the DOM: at construction the members are not
   * laid out yet and all report the same rect. Null when not floating. */
  function clusterOf(panelId: string): FloatCluster | null {
    for (const entry of api.toJSON().floatingGroups ?? []) {
      const memberIds = entry.grid === undefined
        ? (entry.data?.views ?? [])
        : leafViewsOf(entry.grid.root);

      if (memberIds.includes(panelId)) {
        return {
          memberIds: [...memberIds].sort(),
          orientation: entry.grid?.orientation ?? null,
          box: entry.position,
        };
      }
    }

    return null;
  }

  /** Every panel in a floating window with more than one group, sorted. */
  function attachedPanelIds(): readonly string[] {
    const ids = new Set<string>();

    for (const entry of api.toJSON().floatingGroups ?? []) {
      if (entry.grid !== undefined) {
        const members = leafViewsOf(entry.grid.root);

        if (members.length > 1) {
          for (const id of members) {
            ids.add(id);
          }
        }
      }
    }

    return [...ids].sort();
  }

  let lastAttached: readonly string[] = [];

  function publishAttachedPanels(): void {
    const attached = attachedPanelIds();

    if (attached.join(" ") !== lastAttached.join(" ")) {
      lastAttached = attached;
      opts.onAttachedChange?.(attached);
    }
  }

  function floatingWindowOf(group: { readonly element: HTMLElement }): FloatingWindowInternals | undefined {
    const real = groupsAnywhere(api).find((candidate) => {
      return candidate.element === group.element;
    });

    return real === undefined
      ? undefined
      : (api as unknown as DockviewInternals).component?.getFloatingWindowForGroup?.(real);
  }
```

with, at module level (near `DockviewInternals`):

```ts
interface FloatCluster {
  readonly memberIds: readonly string[];
  /** The window's own split: HORIZONTAL = side by side, VERTICAL = stacked,
   * null = a single group (dockview's legacy `data` form). */
  readonly orientation: "HORIZONTAL" | "VERTICAL" | null;
  readonly box: SerializedDockview["floatingGroups"] extends (infer T)[] | undefined ? T extends { position: infer P } ? P : never : never;
}

/** The panel ids of every leaf under a serialised gridview node, in order. */
function leafViewsOf(node: { type: string; data: unknown }): readonly string[] {
  if (node.type === "leaf") {
    return (node.data as { views: readonly string[] }).views;
  }

  return (node.data as readonly { type: string; data: unknown }[]).flatMap(leafViewsOf);
}
```

(If the conditional type for `box` reads badly, declare `type DockFloatBox = NonNullable<SerializedDockview["floatingGroups"]>[number]["position"];` and use it — `SerializedDockview` is already imported.)

Call `publishAttachedPanels()` right after `publishFloatingPanels()` in the `onDidLayoutChange` subscription AND once after the construction-time `publishFloatingPanels()` call (so a restored cluster is reported, like a restored float is).

(d) Rewrite the per-box body of `fitLockedFloatBoxes`:

```ts
    for (const [box, members] of boxes) {
      const cluster = clusterOf(members[0]?.panels[0]?.id ?? "");
      const lock = lockOfGroup(members[0] ?? { panels: [] });

      // A SIDE-BY-SIDE cluster is never box-locked: each locked member keeps
      // its own min = max inside the window, and the free members take the
      // rest. (The old whole-window rule squeezed a restored pair to one
      // panel's width — the spike's reload bug.)
      if (cluster?.orientation === "HORIZONTAL") {
        box.classList.remove("rtc-dock-float-fixed-width");
        continue;
      }

      // A STACKED cluster: every member takes stackedWidthFor over the
      // members' locks (spec §4.2 — a free panel adopts the lock); the box is
      // width-locked only when some member is locked.
      if (cluster?.orientation === "VERTICAL") {
        const anchor = members[0];
        let width: number | undefined = anchor === undefined ? undefined : lockOfGroup(anchor);

        for (const member of members.slice(1)) {
          width = stackedWidthFor(
            { width: width ?? anchor?.api.width ?? 0, lock: width },
            { width: member.api.width, lock: lockOfGroup(member) },
          );
        }

        const locked = members.some((member) => {
          return lockOfGroup(member) !== undefined;
        });

        box.classList.toggle("rtc-dock-float-fixed-width", locked);

        if (locked && width !== undefined) {
          const target = lockedFloatWidth(width + GROUP_GAP_PX, opts.container.getBoundingClientRect().width);

          for (const member of members) {
            member.api.setSize({ width: target });
          }
        }

        continue;
      }

      const locked = lock !== undefined && members.every((member) => {
        return lockOfGroup(member) === lock;
      });

      box.classList.toggle("rtc-dock-float-fixed-width", locked);

      if (!locked) {
        continue;
      }

      const width = lockedFloatWidth(lock + GROUP_GAP_PX, opts.container.getBoundingClientRect().width);

      if (box.style.width !== `${width}px`) {
        for (const member of members) {
          member.api.setSize({ width });
        }
      }
    }
```

Import `stackedWidthFor` from `#/floatMagnets` at the top of `createDockEngine.ts`.

- [ ] **Step 4: Run the engine suite**

Run: `pnpm --filter @rtc/layout-dockview test`
Expected: all PASS (the file had 273+ tests; the four new ones included). If `joinFloats` leaves the stacked test's member widths unset in jsdom, assert only the class and the clamp, as written.

- [ ] **Step 5: Mutation check**

```json
[
  { "file": "packages/layout-dockview/src/createDockEngine.ts", "find": "if (cluster?.orientation === \"HORIZONTAL\") {\n        box.classList.remove(\"rtc-dock-float-fixed-width\");\n        continue;\n      }", "replace": "", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t \"restores a side-by-side cluster\"" },
  { "file": "packages/layout-dockview/src/createDockEngine.ts", "find": "if (attached.join(\" \") !== lastAttached.join(\" \")) {", "replace": "if (false) {", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t \"publishes the whole attached set\"" },
  { "file": "packages/layout-dockview/src/createDockEngine.ts", "find": "box.classList.toggle(\"rtc-dock-float-fixed-width\", locked);\n\n        if (locked && width !== undefined) {", "replace": "box.classList.toggle(\"rtc-dock-float-fixed-width\", false);\n\n        if (locked && width !== undefined) {", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t \"box-locks a STACKED cluster\"" }
]
```
Expected: all KILLED.

- [ ] **Step 6: Lint and commit**

```bash
pnpm exec biome ci packages/layout-dockview && pnpm exec eslint packages/layout-dockview/src/createDockEngine.ts packages/layout-dockview/src/createDockEngine.test.ts
git add packages/layout-dockview/src/createDockEngine.ts packages/layout-dockview/src/createDockEngine.test.ts
git commit -m "feat(layout-dockview): attached-float model, onAttachedChange, cluster-aware width lock"
```

---

### Task 3: Engine — `attachPanel`, `detachPanel`, and shrinking a window a member leaves

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` — `DockEngine` interface (after `dockPanel`, ~line 265), the returned object (after `dockPanel:`, ~line 4085), `settleFloatTransitions` (~line 3451)
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: `clusterOf`, `floatingWindowOf`, `publishAttachedPanels` (Task 2); `attachedWindowFor`, `AttachSide` (Task 1).
- Produces (public, on `DockEngine`):
  ```ts
  /** Merges panelId's lone float into targetPanelId's floating window on `side`
   * (relative to the target), sized per the spec's §4.2. False when refused:
   * either panel unknown or not floating, the same window, or panelId's window
   * already holds several groups (a cluster never attaches — spec §4.1). */
  attachPanel(panelId: string, targetPanelId: string, side: DockAttachSide): boolean;
  /** Pulls panelId out of its cluster into its own float at its current
   * on-screen rect; the remainder shrinks per §4.3. False (no-op) for a panel
   * that is not in a multi-group floating window. */
  detachPanel(panelId: string): boolean;
  ```
  with `export type DockAttachSide = AttachSide;` in `createDockEngine.ts`, and the closure function `floatWindowBoxOf(group): Box` (the `.dv-resize-container` rect relative to the container).

- [ ] **Step 1: Write the failing tests**

Append to the `describe("attached floats — …")` block from Task 2:

```ts
  it("attachPanel merges two lone floats into one window and refuses a cluster, the same window, or a docked target", () => {
    const engine = createDockEngine({ ...createRailBase(), container: sizedContainer(1440, 900) });
    const api = lastDockviewApi();

    floatAt(api, "fx-analytics", 100, 100, 367, 300);
    floatAt(api, "fx-positions", 600, 100, 367, 300);
    floatAt(api, "fx-blotter", 100, 600, 500, 200);

    expect(engine.attachPanel("fx-positions", "fx-analytics", "right")).toBe(true);
    expect(floatMembersOf(api, "fx-analytics")).toEqual(["fx-analytics", "fx-positions"]);
    expect(document.querySelectorAll(".dv-resize-container")).toHaveLength(2);

    // A cluster never attaches (spec §4.1) — and the target may not be itself.
    expect(engine.attachPanel("fx-positions", "fx-blotter", "right")).toBe(false);
    expect(engine.attachPanel("fx-blotter", "fx-blotter", "right")).toBe(false);
    // A docked target is not a float.
    expect(engine.attachPanel("fx-blotter", "fx-rates", "right")).toBe(false);
    expect(document.querySelectorAll(".dv-resize-container")).toHaveLength(2);
    engine.dispose();
  });

  it("detachPanel pops a member out into its own float and is a no-op on a lone float", () => {
    const reports: (readonly string[])[] = [];
    const engine = createDockEngine({
      ...createRailBase(),
      container: sizedContainer(1440, 900),
      onAttachedChange: (ids: readonly string[]): void => {
        reports.push(ids);
      },
    });
    const api = lastDockviewApi();

    floatAt(api, "fx-analytics", 100, 100, 367, 300);
    floatAt(api, "fx-positions", 600, 100, 367, 300);
    engine.attachPanel("fx-positions", "fx-analytics", "right");

    expect(engine.detachPanel("fx-positions")).toBe(true);
    expect(document.querySelectorAll(".dv-resize-container")).toHaveLength(2);
    expect(floatMembersOf(api, "fx-analytics")).toEqual(["fx-analytics"]);
    expect(locationOf("fx-positions")).toBe("floating");
    expect(reports.at(-1)).toEqual([]);

    expect(engine.detachPanel("fx-positions")).toBe(false);
    expect(engine.detachPanel("fx-rates")).toBe(false);
    engine.dispose();
  });

  it("closing a member empties the attached set and leaves the survivor floating alone", () => {
    const reports: (readonly string[])[] = [];
    const engine = createDockEngine({
      ...createRailBase(),
      container: sizedContainer(1440, 900),
      onAttachedChange: (ids: readonly string[]): void => {
        reports.push(ids);
      },
    });
    const api = lastDockviewApi();

    floatAt(api, "fx-analytics", 100, 100, 367, 300);
    floatAt(api, "fx-positions", 600, 100, 367, 300);
    engine.attachPanel("fx-positions", "fx-analytics", "right");
    api.removePanel(api.getPanel("fx-positions")!);

    expect(reports.at(-1)).toEqual([]);
    expect(locationOf("fx-analytics")).toBe("floating");
    expect(floatMembersOf(api, "fx-analytics")).toEqual(["fx-analytics"]);
    engine.dispose();
  });

  it("docking a member home leaves the other member a lone float and restores the docked panel's home", () => {
    const engine = createDockEngine({ ...createRailBase(), container: sizedContainer(1440, 900) });
    const api = lastDockviewApi();

    engine.floatPanel("fx-analytics");
    engine.floatPanel("fx-positions");
    engine.attachPanel("fx-positions", "fx-analytics", "right");
    engine.dockPanel("fx-positions");

    expect(locationOf("fx-positions")).toBe("grid");
    expect(locationOf("fx-analytics")).toBe("floating");
    expect(floatMembersOf(api, "fx-analytics")).toEqual(["fx-analytics"]);
    engine.dispose();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t "attached floats"`
Expected: FAIL — `engine.attachPanel is not a function`.

- [ ] **Step 3: Implement**

Add near the top of `createDockEngine.ts`:

```ts
import {
  type AttachSide,
  attachedWindowFor,
  type Box,
  stackedWidthFor,
} from "#/floatMagnets";

export type DockAttachSide = AttachSide;
```

In the `DockEngine` interface after `dockPanel`, add the two signatures with the doc comments from the Interfaces block above.

Inside the closure (place after `fitLockedFloatBoxes`):

```ts
  /** The on-screen box of the floating window holding `group`, in container
   * pixels — the `.dv-resize-container` dockview drags and resizes. Zero in
   * jsdom, which is why the sizing rules are proven in floatMagnets.test.ts
   * and the e2e run, and the engine tests assert structure only. */
  function floatWindowBoxOf(group: { readonly element: HTMLElement }): Box {
    const box = group.element.closest(FLOAT_BOX_SELECTOR);
    const origin = opts.container.getBoundingClientRect();
    const rect = (box ?? group.element).getBoundingClientRect();

    return {
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      width: rect.width,
      height: rect.height,
    };
  }

  /** Spec §3.2 attach. Both groups are dockview's own objects (`moveTo` and
   * `getFloatingWindowForGroup` want those), found through `api.getPanel`. */
  function attachPanel(panelId: string, targetPanelId: string, side: AttachSide): boolean {
    const panel = api.getPanel(panelId);
    const target = api.getPanel(targetPanelId);
    const mine = clusterOf(panelId);
    const theirs = clusterOf(targetPanelId);

    if (
      panel === undefined ||
      target === undefined ||
      mine === null ||
      theirs === null ||
      mine.memberIds.length > 1 ||
      mine.memberIds.includes(targetPanelId)
    ) {
      return false;
    }

    const plan = attachedWindowFor(
      floatWindowBoxOf(panel.group),
      floatWindowBoxOf(target.group),
      side,
      { mine: lockOfGroup(panel.group), theirs: lockOfGroup(target.group) },
    );

    panel.group.api.moveTo({ group: target.group, position: side });
    floatingWindowOf(target.group)?.position(plan.window);

    if (plan.memberWidth === null) {
      panel.group.api.setSize({ width: plan.newcomerExtent });
    } else {
      panel.group.api.setSize({ height: plan.newcomerExtent });

      for (const memberId of clusterOf(targetPanelId)?.memberIds ?? []) {
        api.getPanel(memberId)?.group.api.setSize({ width: plan.memberWidth });
      }
    }

    fitLockedFloatBoxes();
    publishAttachedPanels();

    return true;
  }

  /** Spec §4.3 detach. `addFloatingGroup` on a group already in a floating
   * window takes it out of that window into a new one — the same call the
   * ⚓ float control makes — so the remainder only needs shrinking. */
  function detachPanel(panelId: string): boolean {
    const panel = api.getPanel(panelId);
    const cluster = clusterOf(panelId);

    if (panel === undefined || cluster === null || cluster.memberIds.length < 2) {
      return false;
    }

    const windowBox = floatWindowBoxOf(panel.group);
    const rect = panel.group.element.getBoundingClientRect();
    const origin = opts.container.getBoundingClientRect();
    const leavingFirst = leafOrderOf(panelId)[0] === panelId;
    const survivorId = cluster.memberIds.find((id) => {
      return id !== panelId;
    });

    api.addFloatingGroup(panel.group, {
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      width: rect.width,
      height: rect.height,
    });

    if (survivorId !== undefined) {
      shrinkWindowAfterLeaving(survivorId, windowBox, cluster.orientation, { width: rect.width, height: rect.height }, leavingFirst);
    }

    fitLockedFloatBoxes();
    publishAttachedPanels();

    return true;
  }

  /** The member ids of `panelId`'s window in LAYOUT order (first = leftmost
   * or topmost), as opposed to `clusterOf`'s sorted ids. */
  function leafOrderOf(panelId: string): readonly string[] {
    for (const entry of api.toJSON().floatingGroups ?? []) {
      if (entry.grid !== undefined) {
        const order = leafViewsOf(entry.grid.root);

        if (order.includes(panelId)) {
          return order;
        }
      }
    }

    return [];
  }

  /** After a member leaves, the window keeps its top-left and loses the
   * removed extent along the split — except when the FIRST member left, when
   * the left (or top) edge moves by that extent so the survivor does not
   * slide (spec §4.3). */
  function shrinkWindowAfterLeaving(
    survivorId: string,
    windowBox: Box,
    orientation: FloatCluster["orientation"],
    removed: { readonly width: number; readonly height: number },
    leavingFirst: boolean,
  ): void {
    const survivor = api.getPanel(survivorId);

    if (survivor === undefined || orientation === null) {
      return;
    }

    const horizontal = orientation === "HORIZONTAL";

    floatingWindowOf(survivor.group)?.position({
      left: horizontal && leavingFirst ? windowBox.left + removed.width : windowBox.left,
      top: !horizontal && leavingFirst ? windowBox.top + removed.height : windowBox.top,
      width: horizontal ? windowBox.width - removed.width : windowBox.width,
      height: horizontal ? windowBox.height : windowBox.height - removed.height,
    });
  }
```

Add the constant beside `GROUP_SELECTOR`:

```ts
/** A floating window's own box — what dockview drags and resizes. */
const FLOAT_BOX_SELECTOR = ".dv-resize-container";
```

Replace the three literal `".dv-resize-container"` strings already in the file (`fitLockedFloatBoxes` and the attached tests use the class name directly — leave the tests) with `FLOAT_BOX_SELECTOR`.

Expose both on the returned object, after `dockPanel`:

```ts
    attachPanel,
    detachPanel,
```

**Dock-home and close of a member** (spec §3.2 last bullet): these go through dockview, so the remainder shrinks from `settleFloatTransitions`. Keep a per-window snapshot: at the top of the closure add `let clusterSnapshots = new Map<string, { box: Box; orientation: FloatCluster["orientation"]; order: readonly string[]; memberRects: Map<string, { width: number; height: number }> }>();` keyed by the window's FIRST member id, refreshed at the end of `settleFloatTransitions` from every multi-member window (`leafOrderOf`, `floatWindowBoxOf`, each member's `element.getBoundingClientRect()`), and consumed at its START: for each snapshot whose window now lacks one of its members and still has a survivor in a float, call `shrinkWindowAfterLeaving(survivorId, snapshot.box, snapshot.orientation, snapshot.memberRects.get(leftId), snapshot.order[0] === leftId)`. Then `publishAttachedPanels()`. In jsdom the rects are zero so the shrink is a no-op there; the structural outcome (survivor alone, set empty) is what the tests pin.

- [ ] **Step 4: Run the engine suite**

Run: `pnpm --filter @rtc/layout-dockview test`
Expected: all PASS.

- [ ] **Step 5: Mutation check**

```json
[
  { "file": "packages/layout-dockview/src/createDockEngine.ts", "find": "mine.memberIds.length > 1 ||", "replace": "", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t \"attachPanel merges two lone floats\"" },
  { "file": "packages/layout-dockview/src/createDockEngine.ts", "find": "if (panel === undefined || cluster === null || cluster.memberIds.length < 2) {\n      return false;\n    }", "replace": "if (panel === undefined || cluster === null) {\n      return false;\n    }", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t \"detachPanel pops a member out\"" }
]
```
Expected: both KILLED.

- [ ] **Step 6: Lint and commit**

```bash
pnpm exec biome ci packages/layout-dockview && pnpm exec eslint packages/layout-dockview/src/createDockEngine.ts packages/layout-dockview/src/createDockEngine.test.ts
git add packages/layout-dockview/src
git commit -m "feat(layout-dockview): attachPanel / detachPanel and window shrink on leave"
```

---

### Task 4: Engine — the gestures and the cue

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` — the `createDockview` options literal (~line 304–345), `moveFloatFromHead` (~line 2988), the listener block (~line 3165), `endFloatHeadMove`
- Modify: `packages/layout-dockview/src/styles/dockview-hud.css` — after the `.rtc-dock-preview` block (~line 243)
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: `snapToSiblings`, `flushSideOf`, `shouldAttachOnRelease`, `SnapEngagement` (Task 1); `attachPanel`, `detachPanel`, `clusterOf`, `floatingWindowOf`, `floatWindowBoxOf` (Tasks 2–3).
- Produces: nothing new on the public API. CSS classes `.rtc-attach-preview` and the float-sash rule.

- [ ] **Step 1: Write the failing tests (what jsdom can witness: the head-press routing)**

Append to the attached-floats `describe`:

```ts
  it("a plain press on a NON-anchor member's head is forwarded to the window's anchor void container", () => {
    const opts = { ...createRailBase(), container: sizedContainer(1440, 900) };
    const engine = createDockEngine(opts);
    const api = lastDockviewApi();

    floatAt(api, "fx-analytics", 100, 100, 367, 300);
    floatAt(api, "fx-positions", 600, 100, 367, 300);
    engine.attachPanel("fx-positions", "fx-analytics", "right");

    const anchorVoid = groupOf(api, "fx-analytics").element.querySelector(".dv-void-container");
    const forwarded: string[] = [];
    anchorVoid?.addEventListener("pointerdown", (event) => {
      forwarded.push(event.type);
    });

    pressHeadOf(api, "fx-positions", { altKey: false });

    expect(forwarded).toEqual(["pointerdown"]);
    window.dispatchEvent(new Event("pointerup"));
    engine.dispose();
  });

  it("an Option press on a member's head detaches it before the move starts", () => {
    const opts = { ...createRailBase(), container: sizedContainer(1440, 900) };
    const engine = createDockEngine(opts);
    const api = lastDockviewApi();

    floatAt(api, "fx-analytics", 100, 100, 367, 300);
    floatAt(api, "fx-positions", 600, 100, 367, 300);
    engine.attachPanel("fx-positions", "fx-analytics", "right");

    pressHeadOf(api, "fx-positions", { altKey: true });

    expect(document.querySelectorAll(".dv-resize-container")).toHaveLength(2);
    expect(floatMembersOf(api, "fx-analytics")).toEqual(["fx-analytics"]);
    window.dispatchEvent(new Event("pointerup"));
    engine.dispose();
  });

  it("renders no attach preview at rest", () => {
    const engine = createDockEngine({ ...createRailBase(), container: sizedContainer(1440, 900) });

    expect(document.querySelector(".rtc-attach-preview")).toBeNull();
    engine.dispose();
  });
```

and the helper (beside `floatAt`):

```ts
/** A left-button pointer press on the FREE part of `panelId`'s head bar —
 * the tab strip, not a control — as `moveFloatFromHead` sees one. */
function pressHeadOf(api: DockviewApi, panelId: string, init: { altKey: boolean }): void {
  const head = groupOf(api, panelId).element.querySelector(".dv-tabs-and-actions-container");

  if (head === null) {
    throw new Error(`${panelId} has no head bar`);
  }

  head.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, altKey: init.altKey }),
  );
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t "attached floats"`
Expected: the first two FAIL (the press lands on the pressed group's own void container; the Option press detaches nothing).

- [ ] **Step 3: Implement the gestures**

(a) In the `createDockview` options literal, after `floatingGroupDragHandle: "tabbar",`:

```ts
    // Magnets (spec 2026-10-02): a dragged float snaps flush to its siblings.
    // dockview hands us the proposed top-left each frame plus the sibling
    // boxes it snapshotted at drag start; we return the snapped position.
    // NOT dockview's own `smartGuides` — that option is implemented only in
    // the paid dockview-enterprise module.
    transformFloatingGroupDrag: snapFloatDrag,
```

Because the options literal runs before the closure's `let`s exist, declare `snapFloatDrag` as a hoisted `function` inside the closure (function declarations hoist; the drag never fires before construction completes):

```ts
  /** The engaged sibling edge of the drag in flight, for the cue and the
   * release decision. Null between drags and while nothing is snapped. */
  let snapEngaged: SnapEngagement | null = null;
  /** True from an Option-press detach until that drag's pointerup: snapping
   * resumes if Option is released mid-drag, attaching never does (spec §3.2). */
  let detachedThisDrag = false;

  function snapFloatDrag(context: {
    readonly proposed: Box;
    readonly others: readonly Box[];
    readonly modifiers: { readonly altKey: boolean };
  }): { top: number; left: number } {
    const result = snapToSiblings(context.proposed, context.others, context.modifiers.altKey);

    snapEngaged = result.engaged;
    showAttachPreview();

    return { top: result.top, left: result.left };
  }
```

(b) The cue. Beside `dockPreview`:

```ts
  /** The accent line along the edge a release would attach on (spec §3.4). */
  let attachPreview: HTMLElement | null = null;

  /** Shows the attach cue while the drag is engaged on a sibling edge AND the
   * release would attach — a lone float, no Option/Shift, no detach this
   * drag; hides it otherwise. Drawn on the TARGET's side of the shared edge,
   * so it stays put while the float moves. */
  function showAttachPreview(): void {
    const moving = floatBeingMoved;
    const lone = moving !== undefined && (clusterOf(moving.panels[0]?.id ?? "")?.memberIds.length ?? 0) === 1;

    if (snapEngaged === null || !lone || detachedThisDrag || lastModifiers.altKey || lastModifiers.shiftKey) {
      clearAttachPreview();

      return;
    }

    if (attachPreview === null) {
      attachPreview = opts.container.ownerDocument.createElement("div");
      attachPreview.className = ATTACH_PREVIEW_CLASS;
      opts.container.appendChild(attachPreview);
    }

    const origin = opts.container.getBoundingClientRect();
    const { other, side } = snapEngaged;
    const thickness = 2;
    const line =
      side === "right"
        ? { left: other.left + other.width - thickness, top: other.top, width: thickness, height: other.height }
        : side === "left"
          ? { left: other.left, top: other.top, width: thickness, height: other.height }
          : side === "bottom"
            ? { left: other.left, top: other.top + other.height - thickness, width: other.width, height: thickness }
            : { left: other.left, top: other.top, width: other.width, height: thickness };

    attachPreview.dataset.side = side;
    attachPreview.style.left = `${origin.left + line.left}px`;
    attachPreview.style.top = `${origin.top + line.top}px`;
    attachPreview.style.width = `${line.width}px`;
    attachPreview.style.height = `${line.height}px`;
  }

  function clearAttachPreview(): void {
    attachPreview?.remove();
    attachPreview = null;
  }

  /** The modifier state of the latest pointer event of the drag, read by the
   * cue (dockview's transform hook only reports modifiers per frame). */
  let lastModifiers = { altKey: false, shiftKey: false };

  function trackDragModifiers(event: Event): void {
    if (event instanceof PointerEvent && floatBeingMoved !== undefined) {
      lastModifiers = { altKey: event.altKey, shiftKey: event.shiftKey };
      showAttachPreview();
    }
  }
```

with `const ATTACH_PREVIEW_CLASS = "rtc-attach-preview";` beside `DOCK_PREVIEW_CLASS`.

(c) Attach on release, registered next to `dockFloatOnRelease`:

```ts
  /** Spec §3.2: a lone float released flush against another float attaches
   * on that side. Runs in the capture phase on `window`, like the dock-home
   * release, and reads the rects as they are at release — dockview has
   * already moved the box on each pointermove. */
  function attachFloatOnRelease(event: Event): void {
    const moving = floatBeingMoved;

    if (moving === undefined || !(event instanceof PointerEvent)) {
      return;
    }

    const panelId = moving.panels[0]?.id;
    const lone = panelId !== undefined && (clusterOf(panelId)?.memberIds.length ?? 0) === 1;
    const mine = floatWindowBoxOf(moving);
    let target: { panelId: string; side: AttachSide } | null = null;

    for (const group of groupsAnywhere(api)) {
      const otherId = group.panels[0]?.id;

      if (otherId === undefined || group.element === moving.element || group.api.location.type !== "floating") {
        continue;
      }

      const side = flushSideOf(mine, floatWindowBoxOf(group));

      if (side !== null) {
        target = { panelId: otherId, side };
        break;
      }
    }

    const decision = {
      lone,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      detachedThisDrag,
      side: target?.side ?? null,
    };

    if (panelId !== undefined && target !== null && shouldAttachOnRelease(decision)) {
      attachPanel(panelId, target.panelId, decision.side);
    }
  }
```

(d) In `moveFloatFromHead`, replace the block from `event.stopPropagation();` to the `dispatchEvent(...)` call with:

```ts
    const panelId = group.panels[0]?.id ?? "";
    const attached = (clusterOf(panelId)?.memberIds.length ?? 0) > 1;
    let moveHandle: Element = handle;

    if (attached && event.altKey) {
      // Option on a member's head: pull it out first, then move the NEW
      // lone window — its own void container is dockview's handle for it.
      detachPanel(panelId);
      detachedThisDrag = true;
    } else if (attached) {
      // A plain press anywhere on a cluster moves the whole window; dockview
      // wired that drag to the window's ANCHOR group's void container only.
      moveHandle = floatingWindowOf(group)?.group.element.querySelector(VOID_CONTAINER_SELECTOR) ?? handle;
    }

    event.stopPropagation();
    movingFloatFromHead = true;
    floatBeingMoved = group;
    lastModifiers = { altKey: event.altKey, shiftKey: event.shiftKey };
    moveHandle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        button: event.button,
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
      }),
    );
```

(e) `endFloatHeadMove` additionally resets: `detachedThisDrag = false; snapEngaged = null; clearAttachPreview();`.

(f) Listeners — add beside the existing ones, keeping `attachFloatOnRelease` BEFORE `endFloatHeadMove` so `floatBeingMoved` is still set:

```ts
  window.addEventListener("pointermove", trackDragModifiers, true);
  window.addEventListener("pointerup", attachFloatOnRelease, true);
```

and remove them in `dispose()` where the siblings are removed (search for `removeEventListener("pointerup", dockFloatOnRelease`).

(g) CSS, after the `.rtc-dock-preview` rule in `dockview-hud.css`:

```css
/* Attach cue (float magnets): a 2px accent line on the sibling's side of the
 * edge a release would attach on. Fixed, click-through and above the floats
 * for the same reasons as `.rtc-dock-preview`; no transition — it tracks the
 * drag frame by frame. */
.dockview-theme-rtc .rtc-attach-preview {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
  background: var(--accent-primary, #22d3ee);
  border-radius: 1px;
}

/* The sash INSIDE a floating window (an attached cluster's seam) wears the
 * grid sash's grip bar, so two attached panels read as one window split in
 * two, not as two cards touching. dockview reuses `.dv-split-view-container`
 * inside the float, so the grid rules above already size it; this only
 * paints the grip. */
.dockview-theme-rtc .dv-resize-container .dv-sash::after {
  background: var(--border, #334155);
}
```

- [ ] **Step 4: Run the engine suite, then try it in a browser**

Run: `pnpm --filter @rtc/layout-dockview test && pnpm --filter @rtc/layout-dockview build`
Expected: PASS.

Then `pnpm dev` (React, port 5173), sign in as `demo` / `mcdc2026`, float Analytics and Positions (◱ in their heads), drag one to within ~14px of the other: it snaps and an accent line shows on the other's edge; release → one window; drag either head → both move; Option-drag a head → that panel comes out alone. Note anything off in the ledger; the e2e in Task 6 pins it.

- [ ] **Step 5: Mutation check**

```json
[
  { "file": "packages/layout-dockview/src/createDockEngine.ts", "find": "moveHandle = floatingWindowOf(group)?.group.element.querySelector(VOID_CONTAINER_SELECTOR) ?? handle;", "replace": "moveHandle = handle;", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t \"forwarded to the window's anchor\"" },
  { "file": "packages/layout-dockview/src/createDockEngine.ts", "find": "if (attached && event.altKey) {", "replace": "if (false) {", "test": "pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t \"Option press on a member's head\"" }
]
```
Expected: both KILLED.

- [ ] **Step 6: Lint and commit**

```bash
pnpm exec biome ci packages/layout-dockview && pnpm exec eslint packages/layout-dockview/src && pnpm lint:css
git add packages/layout-dockview/src
git commit -m "feat(layout-dockview): snap, attach on release, cluster head move, Option detach, attach cue"
```

---

### Task 5: Clients — the detach button, the attached state, and the contract specs

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/engine/PanelHeadControls.tsx`
- Modify: `packages/client-solid/src/ui/shell/layout/engine/PanelHeadControls.tsx`
- Modify: `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` (state ~line 140, options ~line 371 and ~615, reset ~line 567, head props ~line 971, root attributes ~line 932)
- Modify: `packages/client-solid/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` (state ~line 113, options ~line 332, reset ~line 463, head props ~line 734, root attributes ~line 651)
- Create: `packages/ui-contract/src/shared/fixtures/attachedFxBlob.ts`
- Modify: `packages/ui-contract/src/shared/pages/shell/layout/DockviewEnginePage.ts`
- Modify: `packages/ui-contract/src/specs/shell/layout/DockviewEngine.contract.spec.ts`

**Interfaces:**
- Consumes: `DockEngine.detachPanel`, `DockEngineOptions.onAttachedChange` (Tasks 2–3).
- Produces: `PanelHeadControlsProps.attachedHere?: boolean` and `onDetach?: () => void` (both clients); the engine root attribute `data-attached="<ids space-joined>"`; page-object methods `attachedPanelIds()`, `waitForAttached(ids)`, `detachControlLabel(panelId)`, `detachPanel(panelId)`; the fixture `ATTACHED_FX_BLOB: string`.

- [ ] **Step 1: Capture the cluster fixture honestly**

With Task 4 built, run `pnpm dev` (React on 5173) and this one-off Playwright script from the scratchpad (`node capture.mjs`; `@playwright/test` is resolvable from `tests/node_modules` — run it with `NODE_PATH=tests/node_modules` or copy it under `tests/`, do not commit it):

```js
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
await page.goto("http://localhost:5173/");
await page.locator("input[type=text]").fill("demo");
await page.locator("input[type=password]").fill("mcdc2026");
await page.getByRole("button", { name: /AUTHENTICATE/ }).click();
await page.waitForSelector(".dv-groupview");
const skip = page.getByRole("button", { name: /SKIP/ });
if (await skip.count()) { await skip.first().click().catch(() => {}); }
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "Float Analytics" }).click();
await page.getByRole("button", { name: "Float Positions" }).click();
await page.waitForTimeout(500);

const boxOf = async (text) => page.locator(".dv-resize-container", { hasText: text }).first().boundingBox();
const headGrip = async (text) => {
  const b = await page.locator(".dv-resize-container .dv-tabs-and-actions-container", { hasText: text }).first().boundingBox();
  return { x: b.x + 60, y: b.y + b.height / 2 };
};
const dragTo = async (text, left, top, alt) => {
  const g = await headGrip(text);
  const b = await boxOf(text);
  if (alt) { await page.keyboard.down("Alt"); }
  await page.mouse.move(g.x, g.y); await page.mouse.down();
  await page.mouse.move(g.x + (left - b.x), g.y + (top - b.y), { steps: 25 });
  await page.mouse.up();
  if (alt) { await page.keyboard.up("Alt"); }
  await page.waitForTimeout(400);
};
await dragTo("Analytics", 60, 120, true);
const a = await boxOf("Analytics");
await dragTo("Positions", a.x + a.width + 8, a.y + 6, false);
await page.waitForTimeout(1500); // the 250ms save debounce, with margin
console.log(await page.evaluate(() => localStorage.getItem("rtc-dock-layout-fx")));
await browser.close();
```

Confirm the printed blob has exactly one `floatingGroups` entry with a `grid` whose `orientation` is `"HORIZONTAL"` and two leaves (`fx-analytics`, `fx-positions`). Write it to `packages/ui-contract/src/shared/fixtures/attachedFxBlob.ts` as an object literal + `JSON.stringify` (same shape and header style as `packages/client-react/tests/ui/visual/react/floatingFxBlob.ts`, importing `DOCK_BLOB_VERSION` is NOT possible here — ui-contract may not depend on layout-dockview — so keep the literal `rtcBlobVersion: 3` the capture produced and say so in the comment):

```ts
/** A current-version Dockview blob of the FX tab with `fx-analytics` and
 * `fx-positions` ATTACHED side by side in one floating window — the seed for
 * the `shell/layout-dockview-attached` golden and the contract specs' detach
 * button. Captured HONESTLY from a real engine save (see the plan
 * 2026-10-02-float-magnets.md, Task 5 step 1): the running React client at a
 * 1200×700 viewport, both panels floated by their head controls, dragged
 * flush by a real pointer, the debounced save read back from localStorage.
 * `rtcBlobVersion` is the literal 3 the save carried: this package may not
 * import `@rtc/layout-dockview`, and a version bump there is meant to fail
 * this fixture loudly (the engine falls back to the seed, un-attaching the
 * pair, and every consumer reds). */
const ATTACHED_FX_LAYOUT: Record<string, unknown> = {
  // …the captured object, re-indented…
};

export const ATTACHED_FX_BLOB = JSON.stringify(ATTACHED_FX_LAYOUT);
```

- [ ] **Step 2: Write the failing contract specs**

In `DockviewEnginePage.ts`, beside `floatingPanelIds` / `waitForFloating` / `floatControlLabel` / `floatPanel`:

```ts
  /** The attached set the bridge mirrors from the engine's `onAttachedChange`
   * onto `data-attached` — every panel in a multi-panel floating window. */
  attachedPanelIds(): readonly string[] {
    const raw = this.engineEl().getAttribute("data-attached") ?? "";

    return raw === "" ? [] : raw.split(" ");
  }

  async waitForAttached(panelIds: readonly string[]): Promise<void> {
    await waitFor(() => {
      const actual = this.attachedPanelIds();

      if (actual.join(" ") !== panelIds.join(" ")) {
        throw new Error(`expected data-attached to be "${panelIds.join(" ")}", was "${actual.join(" ")}"`);
      }
    });
  }

  /** The accessible name of `panelId`'s detach control, or null when the
   * head renders none — it exists only while the panel is attached. */
  detachControlLabel(panelId: string): string | null {
    return within(this.root).queryByTestId(`panel-${panelId}-detach`)?.getAttribute("aria-label") ?? null;
  }

  detachPanel(panelId: string): void {
    fireEvent.click(within(this.root).getByTestId(`panel-${panelId}-detach`));
  }
```

In `DockviewEngine.contract.spec.ts`, a new `describe` after the floating one, importing `ATTACHED_FX_BLOB` from `@ui-contract/fixtures/attachedFxBlob`:

```ts
describe("DockviewLayoutEngine attached floats (magnets)", () => {
  it("offers a detach control only on an attached panel, and reports the pair in attachedPanelIds", () => {
    const page = mount(DockviewEngine, { props: { seedBlob: ATTACHED_FX_BLOB } });

    expect(page.attachedPanelIds()).toEqual(["fx-analytics", "fx-positions"]);
    expect(page.detachControlLabel("fx-analytics")).toBe("Detach Analytics");
    expect(page.detachControlLabel("fx-positions")).toBe("Detach Positions");
    expect(page.detachControlLabel("fx-rates")).toBeNull();
    // Attached panels are floating too: their float control reads "Dock".
    expect(page.floatControlLabel("fx-positions")).toBe("Dock Positions");
  });

  it("detaches a panel from its header control: the control goes, the set empties, both stay floating", async () => {
    const page = mount(DockviewEngine, { props: { seedBlob: ATTACHED_FX_BLOB } });

    page.detachPanel("fx-positions");
    await page.waitForAttached([]);

    expect(page.detachControlLabel("fx-positions")).toBeNull();
    expect(page.detachControlLabel("fx-analytics")).toBeNull();
    expect(page.floatingPanelIds()).toEqual(["fx-analytics", "fx-positions"]);
  });

  it("renders no detach control for a LONE float", async () => {
    const page = mount(DockviewEngine, { props: {} });

    page.floatPanel("fx-rates");
    await page.waitForFloating(["fx-rates"]);

    expect(page.detachControlLabel("fx-rates")).toBeNull();
  });
});
```

Check the titles the contract registry gives `fx-analytics` / `fx-positions` (`layoutTestRegistry.tsx` in each client's `tests/ui/contract/<fw>/`) and use those exact strings in the two `Detach …` assertions.

- [ ] **Step 3: Run the contract tier to verify they fail**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- -t "attached floats"` and the same with `@rtc/client-solid`
Expected: FAIL — `data-attached` absent, no detach control.

- [ ] **Step 4: Implement the clients**

**React `PanelHeadControls.tsx`** — destructure `attachedHere` and `onDetach`; before the `onFloat` button insert:

```tsx
      {attachedHere && onDetach !== undefined ? (
        <button
          type="button"
          data-testid={`panel-${panelId}-detach`}
          className={styles.panelControl}
          aria-label={`Detach ${title}`}
          title={`Detach ${title}`}
          disabled={popped}
          aria-disabled={popped}
          onClick={onDetach}
        >
          ⇱
        </button>
      ) : null}
```

and in `PanelHeadControlsProps`:

```ts
  /** True while this panel's floating window holds other panels too (an
   * attached cluster, float magnets): the detach control renders. */
  attachedHere?: boolean;
  /** Pulls the panel out of its attached cluster into its own float. Optional
   * slot, attached only by the dockview bridge, like `onFloat`. */
  onDetach?: () => void;
```

**Solid `PanelHeadControls.tsx`** — the same control as a `<Show when={props.attachedHere === true && props.onDetach !== undefined}>` block before the float `<Show>`, with a `function detachPanel(): void { props.onDetach?.(); }` handler, and the same two props.

**React bridge** — beside `floating`:

```ts
  // Panels in a multi-panel floating window (float magnets) — the engine's
  // `onAttachedChange` set, the same whole-set idiom as `floating`. Cleared
  // wherever `floating` is: a reset's fresh engine reports only on change.
  const [attached, setAttached] = useState<readonly PanelId[]>([]);
```

In BOTH engine-construction option objects (mount effect ~line 371 and reset ~line 615) add `onAttachedChange: (next: readonly string[]): void => { setAttached(next as readonly PanelId[]); },` after `onFloatsChange`. Add `setAttached([]);` directly after each `setFloating([]);`. On the engine root element add `data-attached={attached.join(" ")}` beside `data-floating`. In the head render pass `attachedHere={attached.includes(panelId)}` and `onDetach={detachPanelFromCluster(panelId)}` with:

```ts
  function detachPanelFromCluster(panelId: PanelId) {
    return () => {
      engineRef.current?.detachPanel(panelId);
    };
  }
```

**Solid bridge** — `const [attached, setAttached] = createSignal<readonly PanelId[]>([]);`, the same `onAttachedChange` option in the engine options object (~line 332), `setAttached([])` after `setFloating([])` (~line 463), `data-attached={attached().join(" ")}` on the root, and in the actions slot `attachedHere={attached().includes(p.panelId)}` and `onDetach={detachHandler()}` where, next to `floatHandler`:

```ts
            const detachHandler = createMemo(() => {
              return detachPanelFromCluster(p.panelId);
            });
```

and `function detachPanelFromCluster(panelId: PanelId) { return () => { engine?.detachPanel(panelId); }; }` beside `floatOrDockPanel`.

- [ ] **Step 5: Run both contract tiers and the bridge unit tests**

Run: `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract && pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-solid test`
Expected: PASS. (The ui-contract tier runs the same specs against both frameworks; the reset spec that already exists for `floating` now also sees `data-attached` clear, because the fresh engine never reports a cluster.)

- [ ] **Step 6: Mutation check (one per client)**

```json
[
  { "file": "packages/client-react/src/ui/shell/layout/engine/PanelHeadControls.tsx", "find": "{attachedHere && onDetach !== undefined ? (", "replace": "{onDetach !== undefined ? (", "test": "pnpm --filter @rtc/client-react test:ui:contract -- -t \"no detach control for a LONE float\"" },
  { "file": "packages/client-solid/src/ui/shell/layout/engine/PanelHeadControls.tsx", "find": "props.attachedHere === true && props.onDetach !== undefined", "replace": "props.onDetach !== undefined", "test": "pnpm --filter @rtc/client-solid test:ui:contract -- -t \"no detach control for a LONE float\"" }
]
```
Expected: both KILLED.

- [ ] **Step 7: Lint and commit**

```bash
pnpm exec biome ci packages/client-react packages/client-solid packages/ui-contract && pnpm lint:eslint
git add packages/client-react/src packages/client-solid/src packages/ui-contract/src
git commit -m "feat(clients): detach control and attached-set witness for magnetic floats"
```

---

### Task 6: E2E — the real gesture on both clients

**Files:**
- Modify: `tests/browser/page-objects/contracts/testids.ts` (`layout` block)
- Modify: `tests/browser/page-objects/contracts/Layout.ts`
- Modify: `tests/browser/page-objects/playwright/Layout.ts`
- Modify: `tests/browser/scenarios/layout.ts`
- Modify: `tests/browser/playwright/layout.spec.ts`

**Interfaces:**
- Consumes: `data-attached`, `panel-<id>-detach` (Task 5); the engine behaviour (Task 4).
- Produces (page object, declared in the contract too):
  ```ts
  waitDockAttached(panelIds: readonly string[], timeoutMs: number): Promise<void>;
  floatWindowCount(): Promise<number>;
  /** Drags the float holding panelId by its head so the window's top-left lands at viewport (left, top); Option held throughout when `option`. */
  dragFloatByHeadTo(panelId: string, left: number, top: number, option?: boolean): Promise<void>;
  detachPanel(panelId: string): Promise<void>;
  ```

- [ ] **Step 1: Add the test id and the contract declarations**

In `testids.ts`'s `layout` block, after `floatControl`:

```ts
    /** The panel's ⇱ detach control (PanelHeadControls.tsx) — rendered only
     * while the panel is in an attached floating cluster (float magnets). */
    detachControl: (panelId: string) => {
      return `panel-${panelId}-detach`;
    },
```

In `contracts/Layout.ts`, after `dragFloatByHead`, the four declarations above with doc comments (`floatWindowCount` counts `.dv-resize-container`; `waitDockAttached` waits on the engine root's `data-attached` witness like `waitDockFloating`).

- [ ] **Step 2: Implement the page object**

In `playwright/Layout.ts`:

```ts
  async waitDockAttached(panelIds: readonly string[], timeoutMs: number): Promise<void> {
    await expect(this.engineRoot()).toHaveAttribute("data-attached", panelIds.join(" "), { timeout: timeoutMs });
  }

  async floatWindowCount(): Promise<number> {
    return this.page.locator(".dv-resize-container").count();
  }

  async dragFloatByHeadTo(panelId: string, left: number, top: number, option = false): Promise<void> {
    const grip = await this.floatHeadGrip(panelId);
    const box = await this.floatBox(panelId);

    if (option) {
      await this.page.keyboard.down("Alt");
    }

    await this.page.mouse.move(grip.x, grip.y);
    await this.page.mouse.down();
    // A first short step: an Option detach happens on the press and the
    // detached float then follows from ITS box, so the grip is re-read.
    await this.page.mouse.move(grip.x + 20, grip.y + 20, { steps: 4 });
    const now = option ? await this.floatBox(panelId) : { x: box.x + 20, y: box.y + 20 };
    await this.page.mouse.move(grip.x + 20 + (left - now.x), grip.y + 20 + (top - now.y), { steps: 20 });
    await this.page.mouse.up();

    if (option) {
      await this.page.keyboard.up("Alt");
    }
  }

  async detachPanel(panelId: string): Promise<void> {
    await this.page.getByTestId(TESTIDS.layout.detachControl(panelId)).click();
  }
```

- [ ] **Step 3: Write the scenario**

In `scenarios/layout.ts` add the constants `const ANALYTICS_PANEL_ID = "fx-analytics";` and `const POSITIONS_PANEL_ID = "fx-positions";` if not already declared (search first — `ANALYTICS_PANEL_ID` exists), then:

```ts
/** Float magnets end to end: two floats snap flush and attach into one
 * window, move together from either head, survive a reload, and come apart
 * by an Option-drag and by the detach control. Rects are read, never
 * eyeballed; every wait is on a witness. */
export async function floatsAttachMoveTogetherAndDetach(ctx: TestContext): Promise<void> {
  const layout = ctx.po.layout;

  await layout.floatPanel(ANALYTICS_PANEL_ID);
  await layout.floatPanel(POSITIONS_PANEL_ID);
  await layout.waitDockFloating([ANALYTICS_PANEL_ID, POSITIONS_PANEL_ID], ENGINE_SWITCH_TIMEOUT_MS);

  // Apart first, Option held so nothing snaps on the way.
  await layout.dragFloatByHeadTo(ANALYTICS_PANEL_ID, 80, 140, true);
  await layout.dragFloatByHeadTo(POSITIONS_PANEL_ID, 900, 420, true);
  assertEq(await layout.floatWindowCount(), 2, "expected two separate floats before attaching");

  // Within snap range, 8px off vertically: snaps flush and top-aligned, attaches.
  const analytics = await layout.floatBox(ANALYTICS_PANEL_ID);
  await layout.dragFloatByHeadTo(POSITIONS_PANEL_ID, analytics.x + analytics.width + 9, analytics.y + 8);
  await layout.waitDockAttached([ANALYTICS_PANEL_ID, POSITIONS_PANEL_ID], ENGINE_SWITCH_TIMEOUT_MS);
  assertEq(await layout.floatWindowCount(), 1, "expected one window after attaching");

  const attached = await layout.floatBox(POSITIONS_PANEL_ID);
  assertLte(Math.abs(attached.x - analytics.x), 1, `expected the window to keep Analytics' left edge (${analytics.x}), was ${attached.x}`);
  assertLte(Math.abs(attached.y - analytics.y), 1, `expected the tops aligned (${analytics.y}), was ${attached.y}`);

  // Dragging the NON-anchor member moves the whole window.
  await layout.dragFloatByHeadTo(POSITIONS_PANEL_ID, attached.x + 150, attached.y + 90);
  const moved = await layout.floatBox(ANALYTICS_PANEL_ID);
  assertLte(Math.abs(moved.x - (attached.x + 150)), FLOAT_DRAG_SLACK_PX, `expected the cluster to move with Positions' head, x=${moved.x}`);
  assertLte(Math.abs(moved.width - attached.width), 1, "expected the window width unchanged by a move");

  // Near the right edge the union is clamped, both panels still shown.
  const viewport = ctx.page.viewportSize() ?? { width: 1280, height: 720 };
  await layout.dragFloatByHeadTo(ANALYTICS_PANEL_ID, viewport.width - 200, moved.y);
  const clamped = await layout.floatBox(ANALYTICS_PANEL_ID);
  assertLte(clamped.x + clamped.width, viewport.width, "expected the window kept inside the viewport");
  assertEq(await layout.panelSitsInFloat(POSITIONS_PANEL_ID), true, "expected Positions still in the float after clamping");

  // Reload: the cluster comes back at full width, both panels visible.
  await ctx.page.reload();
  await common.waitForWorkspace(ctx);
  await layout.waitDockAttached([ANALYTICS_PANEL_ID, POSITIONS_PANEL_ID], ENGINE_SWITCH_TIMEOUT_MS);
  const restored = await layout.floatBox(ANALYTICS_PANEL_ID);
  assertLte(Math.abs(restored.width - clamped.width), 2, `expected the restored window as wide as before (${clamped.width}), was ${restored.width}`);

  // Option-drag detaches the pressed member into its own float.
  await layout.dragFloatByHeadTo(POSITIONS_PANEL_ID, 700, 100, true);
  await layout.waitDockAttached([], ENGINE_SWITCH_TIMEOUT_MS);
  assertEq(await layout.floatWindowCount(), 2, "expected two windows after an Option-drag detach");

  // Attach again, then detach from the header control.
  const again = await layout.floatBox(ANALYTICS_PANEL_ID);
  await layout.dragFloatByHeadTo(POSITIONS_PANEL_ID, again.x + again.width + 6, again.y + 4);
  await layout.waitDockAttached([ANALYTICS_PANEL_ID, POSITIONS_PANEL_ID], ENGINE_SWITCH_TIMEOUT_MS);
  await layout.detachPanel(POSITIONS_PANEL_ID);
  await layout.waitDockAttached([], ENGINE_SWITCH_TIMEOUT_MS);
  assertEq(await layout.floatWindowCount(), 2, "expected two windows after the detach control");

  await layout.dockPanel(ANALYTICS_PANEL_ID);
  await layout.dockPanel(POSITIONS_PANEL_ID);
  await layout.waitDockFloating([], ENGINE_SWITCH_TIMEOUT_MS);
}
```

Use the file's existing `assertEq` / `assertLte` helpers and `common.waitForWorkspace` (check their exact names at the top of `scenarios/layout.ts` and in `scenarios/common.ts`; reuse whatever the pop-out reload scenario `floatBlotterGrowsRatesSurvivesReloadAndDocksHome` uses for its reload wait).

- [ ] **Step 4: Add the spec**

In `layout.spec.ts`, after the "a floated panel resizes…" test:

```ts
  test("floats snap together like magnets, move as one, survive a reload, and detach by Option-drag and by the header control", async ({ ctx }) => {
    // Floating groups are a dockview-only feature; dockview is what the app
    // boots into.
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.floatsAttachMoveTogetherAndDetach(ctx);
  });
```

- [ ] **Step 5: Run it against both clients**

Run (from `tests/`): `pnpm test:browser:playwright -- browser/playwright/layout.spec.ts -g "magnets"` then `pnpm test:browser:playwright:solid -- browser/playwright/layout.spec.ts -g "magnets"`
Expected: PASS on both. Never filter the output through `head`/`tail`/`grep` — read the full summary.

Then the whole layout spec on both clients, unfiltered, to prove nothing else moved.

- [ ] **Step 6: Lint and commit**

```bash
pnpm exec biome ci tests && pnpm lint:eslint
git add tests/browser
git commit -m "test(e2e): magnetic floats attach, move together, reload, and detach"
```

---

### Task 7: Visual golden — `shell/layout-dockview-attached`

**Files:**
- Create: `packages/ui-contract/src/visual/attachedFxBlob.ts` (re-export)
- Modify: `packages/ui-contract/src/visual/scenarios.ts` (after `shell/layout-dockview-floating`)
- Modify: `packages/client-react/tests/ui/visual/react/DockviewEngine.visual.tsx`, `registry.tsx`
- Modify: `packages/client-solid/tests/ui/visual/solid/DockviewEngine.visual.tsx`, `registry.tsx`
- Goldens: `packages/ui-contract/goldens/playwright/__screenshots__/react/visual.spec.ts/<skin-mode>/shell-layout-dockview-attached.png` (10 files, from the dispatch) and the `react-local/<platform>` set (local)

- [ ] **Step 1: The scenario and the wrappers**

`packages/ui-contract/src/visual/attachedFxBlob.ts`:

```ts
export { ATTACHED_FX_BLOB } from "../shared/fixtures/attachedFxBlob";
```

In `scenarios.ts`, after the floating entry:

```ts
  // Two floats ATTACHED side by side in one floating window (float magnets,
  // spec 2026-10-02): the pixel witness for the cluster's chrome — one card
  // outline around both, the grid-style sash between them, and the ⇱ detach
  // control in each head. THE FIFTH SINGLE-ENGINE SCENARIO, for the same
  // reason as the floating one (no in-house twin; visual:engine-parity skips
  // it). Seeded by the committed `attachedFxBlob.ts`, captured honestly from
  // a real engine save (see that file).
  "shell/layout-dockview-attached": {
    componentKey: "DockviewEngineAttached",
    fixtureKey: "prefs-open",
  },
```

React `DockviewEngine.visual.tsx` — import `ATTACHED_FX_BLOB` from `@ui-visual-shared/attachedFxBlob` and add:

```tsx
/** The attached-cluster scenario (`shell/layout-dockview-attached`): the
 * same stage, the store pre-seeded with the committed attached blob —
 * fx-analytics and fx-positions side by side in ONE floating window. A
 * malformed blob falls back to the seed and un-floats both: this golden then
 * fails loudly. */
export function DockviewEngineAttachedVisual(): ReactElement {
  const storeRef = useRef<DockLayoutStore | null>(null);

  if (storeRef.current === null) {
    const store = new InMemoryDockLayoutStore();
    store.save("fx", ATTACHED_FX_BLOB);
    storeRef.current = store;
  }

  return (
    <div className={styles.stage}>
      <DockviewLayoutEngine
        tab="fx"
        registry={visualDockPanelRegistry}
        store={storeRef.current}
        maximized={null}
        collapsed={[]}
        closed={[]}
        docked={[]}
        instances={[]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onCloseInstance={noop}
      />
    </div>
  );
}
```

and in `registry.tsx` next to `DockviewEngineFloating`: `DockviewEngineAttached: () => { return <DockviewEngineAttachedVisual />; },` plus the import.

Solid: the same wrapper in Solid syntax (`const store = new InMemoryDockLayoutStore(); store.save("fx", ATTACHED_FX_BLOB);` then the `<DockviewLayoutEngine …/>` block exactly as `DockviewEngineFloatingVisual` has it) and the registry entry.

Then `pnpm --filter @rtc/ui-contract build`.

- [ ] **Step 2: Generate and check the local (arm64) goldens**

Run from the repo root: `SCENARIO_PATTERN='shell/layout-dockview-attached__' pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update` (check the exact script name in `packages/client-react/package.json`; the memory note says playwright is the only asserting tier). Then assert, no update, for react AND solid with the same pattern.
Expected: 10 new PNGs under `react-local/<platform>/…/shell-layout-dockview-attached.png`, both clients green against them. Open two of them (a dark and a light skin) and confirm: one window outline around both panels, a visible sash grip between them, a ⇱ in each head. If the seam or the button is missing, fix the CSS/button first — do not pin a wrong golden.

- [ ] **Step 3: Commit the code and the local goldens**

```bash
git add packages/ui-contract/src packages/client-react/tests/ui/visual packages/client-solid/tests/ui/visual packages/ui-contract/goldens
git commit -m "test(visual): shell/layout-dockview-attached golden for the attached cluster"
```

- [ ] **Step 4: The x86 `react/` set — an OUTWARD step, run on its own, after the push in Task 8**

Recorded here, executed in Task 8 step 3: `gh workflow run update-visual-goldens.yml --ref worktree-float-magnets -f scenario_pattern='shell/layout-dockview-attached__'`. When its auto-commit lands, verify `git show --name-only --format= <sha> | grep -v "__screenshots__/react/"` is empty and the count is 10. Its commit carries `[skip ci]`, so the branch needs a later real commit for CI (the docs commit in Task 8 provides it if ordered after; otherwise merge `origin/main` in).

---

### Task 8: Docs, follow-ups, and shipping

**Files:**
- Modify: `packages/layout-dockview/README.md` (new section before `## Saved layouts (Phase 6b)`, ~line 401)
- Modify: `docs/STATUS.md` (⚪ section, after the "Dockview root-slot placement" bullet; bump "Last updated")
- Modify: `CLAUDE.md` (the `layout-dockview` row: append "; magnetic floats — snap, attach into one window, detach (⇱ / Option-drag)" after "maximize scoped per `PanelSpec.maximizeScope`)")

- [ ] **Step 1: README section**

```md
## Attached floats — magnets (2026-10-02)

A float dragged within 14px of another float snaps flush to it (its top or
left aligning too when within range), and released flush it **attaches**:
the two become ONE floating window — dockview's own nested float layout
(`floatingGroups[n].grid`), so moving, the inner sash and persistence are
dockview's. Our part is `floatMagnets.ts` (pure geometry: `snapToSiblings`,
`flushSideOf`, `attachedWindowFor`, `shouldAttachOnRelease`) wired into
dockview's `transformFloatingGroupDrag` hook, `attachFloatOnRelease`, and
`attachPanel` / `detachPanel` on the engine. NOT dockview's `smartGuides`
option: the free core declares it but only the paid `dockview-enterprise`
module implements it.

- **Move:** a plain press on ANY member's head moves the whole window
  (`moveFloatFromHead` forwards to the window's anchor void container).
- **Detach:** the head's ⇱ control (`detachPanel`), or an Option-press on a
  member's head, which detaches and keeps dragging the member; attaching is
  refused for the rest of that drag. Option also suspends snapping.
- **Sizing (spec §4.2/§4.3):** side by side each keeps its width, height =
  the taller; stacked the free panel adopts a locked width, anchored at the
  target's left. On leave the remainder keeps its top-left and loses the
  removed extent (the edge moves when the FIRST member leaves).
- **Width locks:** a side-by-side cluster is never box-locked (each locked
  member keeps its own min = max); a stacked cluster with a locked member is
  box-locked at that width for every member. Read from the model, not the
  DOM — at construction the members all report the same rect.
- **Cue:** `.rtc-attach-preview`, a 2px accent line on the target's side of
  the edge a release would attach on.
- **Not in v1:** a cluster attaching to another float (it only snaps); see
  `docs/STATUS.md`.
```

- [ ] **Step 2: STATUS entries** (one bullet each, in the ⚪ section after the root-slot bullet; keep the file's one-paragraph-per-bullet style and bump `**Last updated:**` to today):

- **Float magnets — clusters joining other floats** (v1 attaches single panels only; a 2+ window dragged flush against a third float snaps and stays separate). Needs: where the pair lands in the target's split, and what the remaining two look like when one of three detaches. Spec: `superpowers/specs/2026-10-02-float-magnets-design.md`.
- **Float magnets — cue variants to try**: quieter (snap only, no accent line) and louder (an outline around the whole target float while in range). v1 ships the edge line; both alternatives are a CSS/`showAttachPreview` change behind the same `snapEngaged` state.
- **Float magnets — a parked cluster member restores as a lone float** after a dynamic-panel reconcile (`DockParkedGrid`'s float branch parks per panel at the cluster's box).
- Extend the existing root-slot bullet's "(3) Internal API" with: `getFloatingWindowForGroup` (float magnets, 2026-10-02) is the second private reach; the "restores a side-by-side cluster" engine test reds if it goes.

Run `pnpm check:doc-links`.

- [ ] **Step 3: Gate the final tree, then ship (outward steps each in their own call)**

```bash
pnpm exec biome ci . && pnpm lint:eslint && pnpm lint:css && pnpm check:doc-links && pnpm typecheck && pnpm --filter @rtc/layout-dockview test && pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract
git add -A && git commit -m "docs: attached floats — README, STATUS follow-ups, CLAUDE.md row"
```

Then, per `shipping-repo-changes` and `planning-uninterrupted-work`, each as its OWN Bash call from inside the worktree:
1. `git push -u origin worktree-float-magnets`
2. `gh pr create --base main --head worktree-float-magnets --title "feat(layout): floating panels as magnets — snap, attach, move together, detach" --body "<summary of the spec's decided scope, the test matrix, and the follow-ups; end with the session attribution>"`
3. `gh workflow run update-visual-goldens.yml --ref worktree-float-magnets -f scenario_pattern='shell/layout-dockview-attached__'`
4. Wait for the goldens auto-commit; verify the 10-file set (Task 7 step 4). If its `[skip ci]` commit is the branch head, land a real commit (e.g. the catch-up `git merge origin/main`) so CI runs on the head.
5. Poll CI by `headSha` (`gh run list --branch worktree-float-magnets --workflow CI --json status,conclusion,headSha`); `pnpm test:e2e` is CI's separate job — make sure it is green too.
6. Rule-3 triage against `origin/main`; CodeQL: `gh api "repos/{owner}/{repo}/code-scanning/alerts?ref=refs/pull/<n>/head&state=open" --jq length` must be 0.
7. `gh pr merge <n> --merge --subject "Merge PR #<n>: feat(layout): floating panels as magnets — snap, attach, move together, detach"`
8. Confirm ancestry on `origin/main`, remove the worktree and branch, and delete the spike branch `worktree-spike-float-magnets` and its worktree `.claude/worktrees/spike-float-magnets` (spec §6).

---

## Self-review notes

- **Spec coverage:** §3.1 → Task 1; §3.2 (transform, release, move from any member, Option detach, `detachPanel`, `onAttachedChange`, width rules, cue, shrink on leave) → Tasks 2–4; §3.3 → Task 5; §3.4 → Task 4; §4.1–4.3 → Tasks 1, 3, 4, 6; §4.4 reconcile note → Task 8 STATUS; §4.5 → Task 2 restore test (`DOCK_BLOB_VERSION` untouched); §5.1–5.5 → Tasks 1–7; §6 → Task 8.
- **Deviation from the spec, ruled here:** the engine exposes `attachPanel(panelId, targetPanelId, side)` publicly. The spec described attach only as a gesture; a programmatic primitive is what makes the engine tests possible in jsdom (zero rects) and is the symmetric counterpart of `detachPanel`. It changes nothing a user sees.
- **Type consistency:** `AttachSide`/`DockAttachSide`, `Box`, `SnapEngagement`, `FloatCluster`, `FloatingWindowInternals`, `FLOAT_BOX_SELECTOR`, `ATTACH_PREVIEW_CLASS` are each defined once (Tasks 1–4) and used by name afterwards.
- **jsdom limits are stated, not hidden:** sizes are proven on numbers (Task 1) and rects (Task 6); engine tests assert structure, classes and clamps.
