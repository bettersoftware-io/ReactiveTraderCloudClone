# Fixed-Width Rails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make five panels width-locked, meaning nobody can resize them horizontally under either layout engine. The panels are the FX Analytics and Positions rail, the Credit New RFQ panel, and the Equities Order Ticket and Watchlist rail. The lock holds wherever the panel is docked.

**Architecture:** The lock belongs to the panel, not to a position in the layout tree. `PanelSpec` gains an optional `fixedWidthPx`, and both engines derive the lock from it at render time. The in-house engine renders a locked row-split child at the spec width and never draws a resize handle beside it. The Dockview wrapper holds every group that contains a locked panel at `min = max = width`. When a divider has no movable side, Dockview disables it on its own (`updateSashEnablement` → `dv-disabled`). The wrapper also refuses drops that would put a locked panel in a group or column with panels that don't share its width. Stored Dockview layouts and saved presets are discarded through version bumps; the user asked for this ("we can discard them").

**Tech Stack:** TypeScript 7, React 19, SolidJS, dockview 8.3.1 (`dockview-core`), Vitest (jsdom), Playwright e2e.

**Spec:** No separate spec. The design comes from the conversation of 2026-09-28 and the STATUS entry "Fixed-width rails that cannot be resized — explore" (`docs/STATUS.md`, ⚪ section). The user's decisions: *"keep those panels non resizable everywhere if we can"*, and stored layouts *"we can discard them"*. The rulings below are this plan's design record.

## Global Constraints

- Lock widths, in visible card px with the 7px gutter excluded: `fx-analytics` **360**, `fx-positions` **360**, `credit-new-rfq` **330**, `eq-ticket` **290**, `eq-watchlist` **290**. These are the existing seed `initialPx` design widths.
- Only the **width** is locked. Height stays resizable: a locked panel keeps its vertical dividers and its column maximize (`maximizeScope: "nearest-column"`).
- `@rtc/core-api` stays types-only (grep gate 42): the new field is a type, and it adds no runtime value.
- The dockview runtime dependency stays confined to `@rtc/layout-dockview` (dependency-cruiser). The clients reach the lock only through the `DockPanelHooks` slot.
- Both web clients change in lockstep: every React edit has a Solid twin in the same task.
- Slot vs handler naming (`docs/handler-naming.md`): the new hook `fixedWidth` is a slot, so it is a property with an `(id) => …` value. Concrete functions are named for their effect.
- Tests: use `create*` fixture factories, and prove a test can fail with a mutant (`node scripts/mutation-check.mjs`). Pure logic tests don't use fake timers. There are no timer-driven tests here.
- Commits end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Pj7VqoYEfNBSBdsad4BXSG
  ```
- Never write "[skip ci]" in a commit message.
- Never run two builds in one checkout at once (see CLAUDE.md, TypeScript toolchain).

## Rulings (the design record)

- **R1 — The lock is per panel, not per tree slot.** The lock is keyed by `PanelSpec.fixedWidthPx`. The seeds keep their `initialPx` values, because Dockview's seed conversion still uses them to allocate the first layout. A unit test pins seed and spec to the same numbers.
- **R2 — Width only.** Height dividers inside the rail stay usable. The rail panels' `nearest-column` maximize changes height only, so it stays.
- **R3 — A lock gives way to strips.** A collapsed locked panel, or a locked panel stripped by a sibling's root-scope maximize, becomes its 32px bar as before. Expanding it restores the locked width, not whatever width it had before.
- **R4 — A lock gives way when nothing is left to absorb space.** If every other panel in the dock is closed, stripped, or pinned, the locked panels fill the dock. The alternative is a blank void, which already happens with today's design pins (see `settlePinAbsorption`). The lock returns as soon as an absorbing panel does. The in-house engine follows the same rule per row split.
- **R5 — Drop rules (Dockview only; the in-house engine can't rearrange panels).** Define a group's lock as the lock of its panels; groups never mix panels with different locks. A drop is refused when:
  - it is a centre or tab drop and the dragged panel's lock differs from the target group's;
  - the target group is locked and the drop isn't a top, bottom, or centre drop by a panel with the same lock;
  - the dragged panel is locked, the target is unlocked, and the drop is top or bottom (that would make the whole column locked);
  - the drop is on the top or bottom edge of the whole layout with a locked panel (a full-width row would lock the entire dock).

  Left and right drops of a locked panel beside an unlocked group, and left and right edge drops on the whole layout, are allowed: they create their own column. The same rule covers the wrapper's own drag-to-dock for floats (`floatDockTargetAt` / `dockFloatOnRelease`).
- **R6 — Floats keep the width** (the class shipped as `rtc-dock-float-fixed-width`; stylelint allows only `rtc-dock-*` in `dockview-hud.css`). A floating locked panel opens at exactly its locked width. Its left, right, and corner resize handles are hidden, and its top and bottom handles stay. The group keeps its `min = max` width while floating, so the content can't stretch. This is the reverse of how design pins lift for floats; it matches the user's "non-resizable everywhere".
- **R7 — Pop-out is the one exception.** A popped-out panel lives in an OS browser window, and no web page can stop a user resizing that window. Pop-out is kept, and the exception is documented. It is not silently removed.
- **R8 — The dividers beside a locked rail.** When a locked rail is at the edge of the grid, Dockview disables its divider on its own. When another column sits beyond the rail (for example a docked Jarvis column to the right of the Equities rail), the divider between the rail and that column stays draggable. Dragging it moves the columns on either side and the rail keeps its width. The rail itself never changes width, which is what the requirement is about. In the in-house engine the handle is simply not rendered.
- **R9 — Discarding stored layouts.** Bump `DOCK_BLOB_VERSION` from 2 to 3. `loadBlobOrSeed` treats any blob not stamped 3 as absent and restores the seed. The gap-7 lift (`migrateDockBlob`) becomes unreachable and is deleted along with its tests. Bump `LAYOUT_PRESET_VERSION` from 1 to 2, so old presets appear as the existing *unreadable* row, which can be deleted. They don't silently load as Default, which would be the "absence reported as a clean reading" failure. Layer-2 state (`workspaceLayoutPersistence`, which includes docked Jarvis panels) is **kept**: the locks derive from the spec, so nothing stored there can defeat them.
- **R10 — Design pins give way to locks.** A design pin whose panels are all locked on its axis (`width`) is skipped at apply time, so it is never clamped, persisted, or released. The pin machinery keeps handling the unlocked pinned panels: docked Jarvis panels and pinned dynamic panels.

## Review Focus

1. **Collapse, then expand a locked rail** (either engine). A person expects the rail back at exactly 360, 330, or 290, not at its pre-collapse fraction. The test is in Task 3 (`collapse → expand returns to the lock`) and in the contract spec in Task 2.
2. **Close every unlocked panel in a tab.** A person expects the rail to fill the dock, with no void. When one of those panels is reopened, the rail snaps back to its locked width. Tested in Task 2 (in-house absorber rule) and Task 3 (`nothing absorbs`).
3. **Drag Blotter onto the New RFQ panel, or New RFQ onto the RFQs board** (Dockview). A person expects no drop to happen: no blue drop overlay, and the group count unchanged. Tested as a pure rule in Task 4 and end to end in Task 8.
4. **Float a locked panel, then dock it back by dragging its head.** A person expects the float to open at the locked width, have no width handle, and land docked at the locked width again. Tested in Task 5.
5. **A preset saved before this change.** A person expects to see it listed as unreadable and deletable, not to have it silently load Default. Tested in Task 7.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/core-api/src/layout.ts` | `PanelSpec.fixedWidthPx` type + doc | 1 |
| `packages/core-logic/src/layout/defaultLayoutPort.ts` | the five spec widths | 1 |
| `packages/core-logic/src/layout/__tests__/defaultLayoutPort.test.ts` | spec ↔ seed agreement | 1 |
| `packages/client-core/src/layout/lockedWidth.ts` (new) | pure `lockedWidthPx(node, specs)` | 1 |
| `packages/client-core/src/layout/__tests__/lockedWidth.test.ts` (new) | its tests | 1 |
| `packages/client-core/src/layout/index.ts` | export it | 1 |
| `packages/client-{react,solid}/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx` | locked cell + no handle + absorber rule | 2 |
| `packages/ui-contract/src/specs/shell/layout/LayoutEngine.contract.spec.ts` | flipped/added handle + lock assertions | 2 |
| `packages/ui-contract/src/shared/pages/shell/layout/LayoutEnginePage.ts` | `isLockedCell(pathKey, i)` reader | 2 |
| `packages/layout-dockview/src/createDockEngine.ts` | `fixedWidth` hook, width locks, drop veto, float width | 3, 4, 5 |
| `packages/layout-dockview/src/dockDropRules.ts` (new) | pure `refusesDockDrop` | 4 |
| `packages/layout-dockview/src/dockDropRules.test.ts` (new) | its tests | 4 |
| `packages/layout-dockview/src/dockview-hud.css` | hide a locked float's width handles | 5 |
| `packages/layout-dockview/src/createDockEngine.test.ts` | engine lock/float/discard tests | 3, 5, 7 |
| `packages/client-{react,solid}/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` | wire `fixedWidth` from specs | 6 |
| `packages/layout-dockview/src/dockBlob.ts` + test | v3, delete gap-7 lift | 7 |
| `packages/core-logic/src/layout/layoutPresetCodec.ts` + test | preset v2 | 7 |
| `tests/browser/scenarios/layout.ts`, `tests/browser/playwright/layout.spec.ts` | flipped rail e2e + drop refusal | 8 |
| `docs/adr/ADR-002-layout-management-port.md`, `docs/STATUS.md` | docs + backlog | 9 |

---

### Task 1: `fixedWidthPx` on the panel spec, and the shared lock helper

**Files:**
- Modify: `packages/core-api/src/layout.ts` (the `PanelSpec` interface)
- Modify: `packages/core-logic/src/layout/defaultLayoutPort.ts` (`PANEL_SPECS` + its header comment)
- Test: `packages/core-logic/src/layout/__tests__/defaultLayoutPort.test.ts`
- Create: `packages/client-core/src/layout/lockedWidth.ts`
- Create: `packages/client-core/src/layout/__tests__/lockedWidth.test.ts`
- Modify: `packages/client-core/src/layout/index.ts`

**Interfaces:**
- Produces: `PanelSpec.fixedWidthPx?: number`
- Produces: `lockedWidthPx(node: LayoutNode, specs: Readonly<Record<PanelId, PanelSpec>>): number | undefined`, exported from `@rtc/client-core`

- [ ] **Step 1: Write the failing seed-agreement test** (append to `defaultLayoutPort.test.ts`, using its existing imports and adding `PANEL_SPECS` / `createDefaultLayoutPort` if they are missing)

```ts
describe("width-locked panels", () => {
  it("locks exactly the five rail panels, at their design widths", () => {
    const locked = Object.values(PANEL_SPECS)
      .filter((spec) => {
        return spec.fixedWidthPx !== undefined;
      })
      .map((spec) => {
        return [spec.id, spec.fixedWidthPx];
      });

    expect(Object.fromEntries(locked)).toEqual({
      "fx-analytics": 360,
      "fx-positions": 360,
      "credit-new-rfq": 330,
      "eq-ticket": 290,
      "eq-watchlist": 290,
    });
  });

  it.each(["fx", "credit", "equities"] as const)(
    "the %s seed's initialPx for the locked child equals its panels' lock",
    (tab) => {
      const root = createDefaultLayoutPort(tab).initial.root;

      if (root.kind !== "split") {
        throw new Error(`${tab} seed root is not a split`);
      }

      const lockedIndex = root.children.findIndex((child) => {
        return panelIdsUnder(child).every((id) => {
          return PANEL_SPECS[id]?.fixedWidthPx !== undefined;
        });
      });
      const lockedChild = root.children[lockedIndex];

      expect(lockedChild).toBeDefined();
      expect(root.initialPx?.[lockedIndex]).toBe(
        PANEL_SPECS[panelIdsUnder(lockedChild as LayoutNode)[0] ?? ""]
          ?.fixedWidthPx,
      );
    },
  );
});

function panelIdsUnder(node: LayoutNode): readonly string[] {
  return node.kind === "panel"
    ? [node.panelId]
    : node.children.flatMap(panelIdsUnder);
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @rtc/core-logic exec vitest run src/layout/__tests__/defaultLayoutPort.test.ts`
Expected: FAIL. The typecheck reports that `fixedWidthPx` doesn't exist on `PanelSpec`, or the first test gets `{}`.

- [ ] **Step 3: Add the type.** In `packages/core-api/src/layout.ts`, add this after `maximizeScope` in `PanelSpec`:

```ts
  /** Locks the panel's WIDTH at this many visible card px (the in-house
   * 7px gutter excluded) wherever it docks — no engine renders a width
   * handle for it, and the Dockview engine holds its group at min = max
   * and refuses drops that would share a group or a column with a panel
   * of another width. Height stays resizable. Yields to a strip (collapse,
   * or a sibling's root maximize) and, when no other panel is left to
   * absorb the dock's spare width, to filling the dock. Absent → freely
   * resizable. Additive to the §5 contract, like `maximizeScope`. */
  readonly fixedWidthPx?: number;
```

- [ ] **Step 4: Set the five widths.** In `PANEL_SPECS` in `defaultLayoutPort.ts`, add `fixedWidthPx: 360` to `fx-analytics` and `fx-positions`, `fixedWidthPx: 330` to `credit-new-rfq`, and `fixedWidthPx: 290` to `eq-ticket` and `eq-watchlist`. Rewrite the file's header comment. Its current text ("Every current default tree is fully user-resizable instead (Task 2)") is now false. The new text should say the rail panels are width-locked via `fixedWidthPx`, and that `pinned` stays unused. Update the three seed comments that say "initialPx — still draggable; the first drag converts the split to plain fractions". The new text: the seed's `initialPx` is the first-layout allocation, and the width lock comes from the panels' `fixedWidthPx`.

- [ ] **Step 5: Run and confirm the test passes**

Run: `pnpm --filter @rtc/core-logic exec vitest run src/layout/__tests__/defaultLayoutPort.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing helper test** at `packages/client-core/src/layout/__tests__/lockedWidth.test.ts`

```ts
import { describe, expect, it } from "vitest";

import type { LayoutNode, PanelId, PanelSpec } from "@rtc/core-logic";

import { lockedWidthPx } from "../lockedWidth";

describe("lockedWidthPx", () => {
  it("returns a lone locked panel's width", () => {
    expect(lockedWidthPx(createPanel("a"), SPECS)).toBe(360);
  });

  it("returns the shared width when every panel under a split is locked alike", () => {
    expect(lockedWidthPx(createColumn(["a", "b"]), SPECS)).toBe(360);
  });

  it("is undefined when any panel under the node is unlocked", () => {
    expect(lockedWidthPx(createColumn(["a", "free"]), SPECS)).toBeUndefined();
  });

  it("is undefined when two locked panels disagree on the width", () => {
    expect(lockedWidthPx(createColumn(["a", "narrow"]), SPECS)).toBeUndefined();
  });

  it("is undefined for an unknown panel id", () => {
    expect(lockedWidthPx(createPanel("ghost"), SPECS)).toBeUndefined();
  });
});

const SPECS: Readonly<Record<PanelId, PanelSpec>> = {
  a: { id: "a", title: "A", fixedWidthPx: 360 },
  b: { id: "b", title: "B", fixedWidthPx: 360 },
  narrow: { id: "narrow", title: "N", fixedWidthPx: 290 },
  free: { id: "free", title: "F" },
};

function createPanel(panelId: string): LayoutNode {
  return { kind: "panel", panelId };
}

function createColumn(ids: readonly string[]): LayoutNode {
  return {
    kind: "split",
    dir: "column",
    sizes: ids.map(() => {
      return 1 / ids.length;
    }),
    children: ids.map(createPanel),
  };
}
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `pnpm --filter @rtc/client-core exec vitest run src/layout/__tests__/lockedWidth.test.ts`
Expected: FAIL with "Failed to resolve import ../lockedWidth".

- [ ] **Step 8: Implement** `packages/client-core/src/layout/lockedWidth.ts`

```ts
import type { LayoutNode, PanelId, PanelSpec } from "@rtc/core-logic";

/** The width every panel under `node` is locked at (`PanelSpec.fixedWidthPx`),
 * or `undefined` when any panel under it is unlocked, unknown, or locked at
 * a different width — a split only renders locked when ALL of its panels
 * agree, since one free panel inside would have to stretch with it. Pure
 * render-time policy, like `maximizeBoundaryPath`: LayoutState and the
 * layout machine know nothing of locks. */
export function lockedWidthPx(
  node: LayoutNode,
  specs: Readonly<Record<PanelId, PanelSpec>>,
): number | undefined {
  if (node.kind === "panel") {
    return specs[node.panelId]?.fixedWidthPx;
  }

  const widths = node.children.map((child) => {
    return lockedWidthPx(child, specs);
  });
  const first = widths[0];

  return first !== undefined &&
    widths.every((width) => {
      return width === first;
    })
    ? first
    : undefined;
}
```

Add `export * from "#/layout/lockedWidth";` to `packages/client-core/src/layout/index.ts`, next to the `maximizeBoundary` export.

- [ ] **Step 9: Run and confirm the tests pass, then run a mutation check**

Run: `pnpm --filter @rtc/client-core exec vitest run src/layout/__tests__/lockedWidth.test.ts`
Expected: PASS (5 tests).

Write `$SCRATCH/t1-mutants.json`. Each entry replaces one line with a wrong version:
1. `widths.every(...)` → `widths.some(...)`
2. `return width === first;` → `return true;`

Then run `node scripts/mutation-check.mjs $SCRATCH/t1-mutants.json`.
Expected: both mutants are RED (killed).

- [ ] **Step 10: Typecheck the three packages and commit**

Run: `pnpm --filter @rtc/core-api --filter @rtc/core-logic --filter @rtc/client-core typecheck`
Expected: exit 0.

```bash
git add packages/core-api/src/layout.ts packages/core-logic/src/layout/defaultLayoutPort.ts \
  packages/core-logic/src/layout/__tests__/defaultLayoutPort.test.ts \
  packages/client-core/src/layout/lockedWidth.ts packages/client-core/src/layout/__tests__/lockedWidth.test.ts \
  packages/client-core/src/layout/index.ts
git commit -m "feat(layout): PanelSpec.fixedWidthPx locks the five rail panels' width"
```

---

### Task 2: In-house engine renders locked cells with no width handle (React and Solid)

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx`: the split renderer's per-child block, where `childFixed` / `childInitial` / `showHandle` are computed (around lines 408–530)
- Modify: `packages/client-solid/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx`: the same block, which there is a set of per-child functions (`childFixed()`, `childInitial()`, `showHandle()`, around lines 425–600)
- Modify: `packages/ui-contract/src/shared/pages/shell/layout/LayoutEnginePage.ts`: add `isLockedCell`
- Test: `packages/ui-contract/src/specs/shell/layout/LayoutEngine.contract.spec.ts` (this one spec runs against both clients)

**Interfaces:**
- Consumes: `lockedWidthPx` from `@rtc/client-core` (Task 1); `PANEL_SPECS` widths
- Produces: the DOM attribute `data-locked-cell="true" | "false"` on every `.cell`, read by `LayoutEnginePage.isLockedCell(pathKey: string, index: number): boolean`

- [ ] **Step 1: Add the page-object reader.** In `LayoutEnginePage.ts`, add the following next to `isInitialCell`, following its exact shape (the same `cell-${pathKey}-${index}` lookup):

```ts
  isLockedCell(pathKey: string, index: number): boolean {
    return (
      this.cell(pathKey, index).getAttribute("data-locked-cell") === "true"
    );
  }
```

If the helper that `isInitialCell` uses has a different name than `this.cell`, use that helper.

- [ ] **Step 2: Flip and extend the contract spec.** In `LayoutEngine.contract.spec.ts`:
  - Replace the test `"shows a resize handle between the left column and the right rail"` with:

```ts
  it("shows NO resize handle between the left column and the width-locked right rail", () => {
    const page = mount(LayoutEngine, {});
    // root path is [] → pathKey ""
    expect(page.resizeHandleExists("", 0)).toBe(false);
    expect(page.isLockedCell("", 1)).toBe(true);
    expect(page.isLockedCell("", 0)).toBe(false);
  });
```

  - In the test `"keeps the main column|rail handle and the rates/blotter handle; only the rail-internal handle disappears"`, change the first expectation to `expect(page.resizeHandleExists("", 0)).toBe(false);` and rename the test to `"a rail maximize keeps the rates/blotter handle; the rail-internal handle disappears and the locked rail has none"`.
  - Add these tests to the same describe block as the handle tests (the default mount is FX; follow the file's existing pattern for closing and collapsing a panel, as used by its strip tests):

```ts
  it("keeps the rail-internal height handle — only the width is locked", () => {
    const page = mount(LayoutEngine, {});
    expect(page.resizeHandleExists("1", 0)).toBe(true);
  });

  it("a collapsed locked panel yields to its strip, and expands back locked", () => {
    const page = mount(LayoutEngine, {});
    page.collapse("fx-analytics");
    page.collapse("fx-positions");
    expect(page.isLockedCell("", 1)).toBe(false);
    page.expand("fx-analytics");
    expect(page.isLockedCell("", 1)).toBe(true);
  });

  it("the rail fills the row when nothing else is left to absorb it", () => {
    const page = mount(LayoutEngine, {});
    page.collapse("fx-rates");
    page.collapse("fx-blotter");
    expect(page.isLockedCell("", 1)).toBe(false);
  });
```

  If the page object's collapse and expand methods have different names, use the names the file's existing strip tests use.

- [ ] **Step 3: Run the contract tier for both clients and confirm it fails**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- LayoutEngine` and `pnpm --filter @rtc/client-solid test:ui:contract -- LayoutEngine`
Expected: FAIL. `data-locked-cell` is absent, so `isLockedCell` reads false, and the root handle still exists.

- [ ] **Step 4: Implement it in React.** Import `lockedWidthPx` from `@rtc/client-core`, alongside `maximizeBoundaryPath`. In the split renderer, before `node.children.map(...)`, compute:

```ts
  // Width locks (PanelSpec.fixedWidthPx) apply only along a ROW split's
  // axis — a column split divides height, which stays resizable. A lock
  // yields when no sibling is left to absorb the row's spare width
  // (every other child is itself locked or a strip): the rail then fills
  // instead of leaving a void — the dockview engine's settlePinAbsorption
  // rule, applied per row.
  const locks = node.children.map((child) => {
    return node.dir === "row" ? lockedWidthPx(child, specs) : undefined;
  });
  const rowAbsorbs = node.children.some((child, i) => {
    return (
      locks[i] === undefined &&
      !isStripSubtree(child, state, strippedByMaximize)
    );
  });
```

Inside the per-child block:

```ts
        const childLocked =
          rowAbsorbs && !childIsStripCell && !insideBoundary
            ? locks[i]
            : undefined;
        const nextLocked = rowAbsorbs ? locks[i + 1] : undefined;
```

Change `childInitial` so a lock wins over the seed's `initialPx`:

```ts
        const childInitial =
          childFixed === undefined && !insideBoundary && !childIsStripCell
            ? (childLocked ?? node.initialPx?.[i])
            : undefined;
```

Add `childLocked === undefined && nextLocked === undefined &&` to the `showHandle` conjunction. Add `data-locked-cell={childLocked !== undefined ? "true" : "false"}` on the `.cell` div, next to `data-initial-cell`.

`nextLocked` doesn't check whether the next child is a strip. A stripped next child already suppresses the handle through `!nextIsStripCell`, so the extra check isn't needed.

- [ ] **Step 5: Implement the same thing in Solid.** Add `locks()` and `rowAbsorbs()` as functions at the split level, reading `props.node`, `props.specs`, `props.state`, and `props.strippedByMaximize`. Add per-child `childLocked()` and `nextLocked()` functions. `childInitial()` returns `childLocked() ?? props.node.initialPx?.[i]` under the same guard. Add `childLocked() === undefined && nextLocked() === undefined &&` to `showHandle()`. Add `data-locked-cell={childLocked() !== undefined ? "true" : "false"}`. Keep Solid's reactive style: functions, not `const` snapshots.

- [ ] **Step 6: Run the contract tier and the smoke tests for both clients and confirm they pass**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- LayoutEngine && pnpm --filter @rtc/client-solid test:ui:contract -- LayoutEngine && pnpm --filter @rtc/client-react exec vitest run src/ui/shell/layout/engine && pnpm --filter @rtc/client-solid exec vitest run src/ui/shell/layout/engine`
Expected: PASS. The smoke tests use their own `abRegistry` specs without `fixedWidthPx`, so they don't change.

- [ ] **Step 7: Mutation check.** Write mutants for both clients:
1. `rowAbsorbs && ` removed from `childLocked` (expect the "fills the row" test to go RED)
2. `childLocked === undefined && nextLocked === undefined &&` removed from `showHandle` (expect the "NO resize handle" test to go RED)

Run: `node scripts/mutation-check.mjs $SCRATCH/t2-mutants.json`
Expected: every mutant is killed.

- [ ] **Step 8: Commit**

```bash
git add packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx \
  packages/client-solid/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx \
  packages/ui-contract/src/shared/pages/shell/layout/LayoutEnginePage.ts \
  packages/ui-contract/src/specs/shell/layout/LayoutEngine.contract.spec.ts
git commit -m "feat(inhouse-layout): width-locked rails render fixed with no width handle"
```

---

### Task 3: Dockview engine holds locked groups at their width

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts`
- Test: `packages/layout-dockview/src/createDockEngine.test.ts` (new `describe("width locks (PanelSpec.fixedWidthPx)")`)

**Interfaces:**
- Produces: `DockPanelHooks.fixedWidth?(panelId: string): number | undefined`. This is a hook slot. Its doc reads: "the panel's locked card width in px, or undefined when resizable". Declare it as a method signature, like its siblings `title` and `maximizeScope`, because it lives on the hooks interface.
- Produces (engine-internal, used by Tasks 4–5): `lockOfPanel(panelId): number | undefined`, `lockOfGroup(group: SizableGroup): number | undefined`, `settleWidthLocks(): boolean` (returns true when any constraint changed).

- [ ] **Step 1: Write the failing engine tests.** Add the following at the end of the existing design-pin suites. It reuses the file's helpers: `createRailBase`, `sizedContainer`, `widthClampOf`, `lastDockviewApi`, `dragSash`, `trackLayout`, `persistArranged`.

```ts
describe("width locks (PanelSpec.fixedWidthPx)", () => {
  it("holds every locked group at its card width plus the gap", () => {
    const engine = createDockEngine(createLockedRailBase());

    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    expect(widthClampOf("fx-positions")).toEqual([367, 367]);
    expect(widthClampOf("fx-rates")[0]).toBeLessThan(367);
    engine.dispose();
  });

  it("does not release on a sash drag in the declaring split", () => {
    const opts = createLockedRailBase();
    const engine = createDockEngine(opts);

    dragSash(opts.container, ".dv-horizontal");

    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    engine.dispose();
  });

  it("supersedes the seed's design pin: none is persisted", () => {
    const seen = trackLayout();
    persistArranged({ ...createLockedRailBase(), ...seen.options });

    expect(seen.pins()).toEqual([]);
  });

  it("collapse → expand returns to the lock, not the pre-collapse width", () => {
    const engine = createDockEngine(createLockedRailBase());

    engine.collapsePanel("fx-analytics");
    engine.collapsePanel("fx-positions");
    engine.expandPanel("fx-analytics");
    engine.expandPanel("fx-positions");

    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    engine.dispose();
  });

  it("nothing absorbs: the locked rail fills the dock, and re-locks when an absorber returns", () => {
    const engine = createDockEngine({
      ...createLockedRailBase(),
      container: sizedContainer(1440, 900),
    });

    engine.closePanel("fx-rates");
    engine.closePanel("fx-blotter");

    expect(lastDockviewApi().getPanel("fx-analytics")?.group.api.width).toBe(
      1440,
    );

    engine.reopenPanel("fx-rates");

    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    engine.dispose();
  });

  it("restores the lock from a blob that holds no pin sidecar at all", () => {
    const first = createDockEngine(createLockedRailBase());
    const blob = first.snapshotLayout();
    first.dispose();

    const engine = createDockEngine({ ...createLockedRailBase(), blob });

    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    engine.dispose();
  });

  function createLockedRailBase(): DockEngineOptions {
    const opts = createRailBase();

    return {
      ...opts,
      seed: { ...RAIL_LIKE, initialPx: [undefined, 360] },
      panels: {
        ...opts.panels,
        fixedWidth: (id: string): number | undefined => {
          return id === "fx-analytics" || id === "fx-positions"
            ? 360
            : undefined;
        },
      },
    };
  }
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t "width locks"`
Expected: FAIL. `fixedWidth` isn't a known hook (a type error), and after the drag the clamp reads `[100, Infinity]`-ish.

- [ ] **Step 3: Add the hook** to `DockPanelHooks`, next to `maximizeScope`:

```ts
  /** The panel's locked WIDTH in visible card px (gutter excluded), or
   * undefined when it is freely resizable — the in-house
   * `PanelSpec.fixedWidthPx`. A group holding a locked panel is held at
   * min = max on the width axis for as long as it lives in the grid or
   * floats (see settleWidthLocks), and drops that would mix widths are
   * refused. Absent → nothing is locked. */
  fixedWidth?(panelId: string): number | undefined;
```

- [ ] **Step 4: Implement the lock primitives** inside `createDockEngine`, in a new section right after the design-pin section (after `disarmSashUnpin`):

```ts
  // ——— Width locks (PanelSpec.fixedWidthPx) ———
  // A lock is a PANEL property, not a tree slot's: whichever group holds a
  // locked panel is clamped min = max on the width axis, and dockview's own
  // updateSashEnablement then disables any sash with no movable side.
  // Unlike a design pin it is never released by a drag; it yields only to a
  // strip (the strip machinery owns the group's constraints while it is a
  // bar, and its expand restores the captured lock) and, like a pin, to a
  // dock with nothing left to absorb the spare width (settlePinAbsorption).
  // The groups' pre-lock width constraints, by group element — what a
  // yield puts back.
  const widthLockBaselines = new Map<Element, readonly [number, number]>();
  let widthLocksYielded = false;

  function lockOfPanel(panelId: string): number | undefined {
    return opts.panels.fixedWidth?.(panelId);
  }

  function lockOfGroup(group: SizableGroup): number | undefined {
    for (const panel of group.panels) {
      const px = lockOfPanel(panel.id);

      if (px !== undefined) {
        return px;
      }
    }

    return undefined;
  }

  /** Clamps every locked grid or floating group at its lock, or — when no
   * grid group is left to absorb the spare width — puts every locked group
   * back to its baseline so the locked panels fill. Popped-out groups are
   * skipped (an OS window cannot be pinned — Ruling R7), and so are strips.
   * True when any constraint changed, so the caller owes a forced layout. */
  function settleWidthLocks(): boolean {
    const yielding = !someGroupAbsorbs([...designPins, ...unabsorbedPins]);
    let changed = yielding !== widthLocksYielded;
    widthLocksYielded = yielding;

    for (const group of api.groups) {
      const px = lockOfGroup(group);

      if (
        px === undefined ||
        group.api.location?.type === "popout" ||
        holdsStrippedPanel(group)
      ) {
        continue;
      }

      const axis = axisOf(group, "vertical");
      const model = px + GROUP_GAP_PX;

      if (!widthLockBaselines.has(group.element)) {
        widthLockBaselines.set(group.element, [axis.minimum(), axis.maximum()]);
      }

      if (yielding && isInGrid(group)) {
        const [minimum, maximum] = widthLockBaselines.get(group.element) ?? [
          axis.minimum(),
          axis.maximum(),
        ];

        if (axis.minimum() !== minimum || axis.maximum() !== maximum) {
          axis.constrain(minimum, maximum);
          axis.set(axis.size());
          changed = true;
        }

        continue;
      }

      if (axis.minimum() !== model || axis.maximum() !== model) {
        clampTo(axis, model);
        changed = true;
      }
    }

    return changed;
  }
```

The engine's `api.groups` elements are the dockview groups the rest of the file narrows to `SizableGroup`. If the compiler needs it, use the same cast or filter the file already applies (see `gridGroups(api)` and `groupOf`).

- [ ] **Step 5: Make locked panels non-absorbers.** In `someGroupAbsorbs`, extend the inner predicate so a locked panel never counts as an absorber:

```ts
        return (
          !pinned.has(panel.id) &&
          !records.has(panel.id) &&
          lockOfPanel(panel.id) === undefined
        );
```

- [ ] **Step 6: Make design pins give way (R10).** At the top of the loop in `applyDesignPins`, before `panelsExactlyFill`, add:

```ts
      // Ruling R10: a width pin over panels that are all width-LOCKED is
      // superseded by the lock — skipped whole, so it is never clamped,
      // persisted, or released by a sash drag.
      if (
        pin.axis === "width" &&
        pin.panelIds.every((panelId) => {
          return lockOfPanel(panelId) !== undefined;
        })
      ) {
        continue;
      }
```

- [ ] **Step 7: Settle at every point where the layout changes.**
  - At the very top of `settlePinAbsorption()`, before its early return:

```ts
    if (settleWidthLocks() && designPins.length === 0 && unabsorbedPins.length === 0) {
      api.layout(trackedWidth, trackedHeight, true);
      return;
    }
```

    Leave the rest of the function unchanged. In the branch where it continues, its own final `api.layout(..., true)` already covers any lock change.
  - Right after `applyDesignPins(restored.pins);` at construction, add `settlePinAbsorption();` if it isn't already reached on that path. If it is, add nothing.
  - In the `api.onDidLayoutChange` handler, next to `intactDesignPins();`, add `settleWidthLocks();`. This catches user drags and floats, which don't pass through an intent.

- [ ] **Step 8: Run and confirm the tests pass, along with the whole engine suite**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run`
Expected: PASS. Existing design-pin tests use seeds without a `fixedWidth` hook, so they are untouched.

- [ ] **Step 9: Mutation check.** Mutants:
1. `if (pin.axis === "width" && …) { continue; }` → `if (false) { continue; }` (expect "supersedes the seed's design pin" to go RED)
2. `lockOfPanel(panel.id) === undefined` → `true` in `someGroupAbsorbs` (expect "nothing absorbs" to go RED)
3. `settleWidthLocks();` removed from `onDidLayoutChange` (expect "does not release on a sash drag" to go RED; if it survives, the construction path already holds the clamp, so record that as the witness and add a test that drags a locked tab to a new right-edge column, then asserts the clamp)

Run: `node scripts/mutation-check.mjs $SCRATCH/t3-mutants.json`
Expected: killed, or the survivor handled as described.

- [ ] **Step 10: Commit**

```bash
git add packages/layout-dockview/src/createDockEngine.ts packages/layout-dockview/src/createDockEngine.test.ts
git commit -m "feat(layout-dockview): width locks hold a locked panel's group at min = max"
```

---

### Task 4: Dockview refuses drops that would mix widths

**Files:**
- Create: `packages/layout-dockview/src/dockDropRules.ts`
- Create: `packages/layout-dockview/src/dockDropRules.test.ts`
- Modify: `packages/layout-dockview/src/index.ts` (export it)
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (the `onWillShowOverlay` wiring and the float-dock path)

**Interfaces:**
- Consumes: `lockOfPanel`, `lockOfGroup` (Task 3)
- Produces:

```ts
export type DockDropPosition = "top" | "bottom" | "left" | "right" | "center";
export type DockDropTarget =
  | { readonly kind: "layout-edge"; readonly position: DockDropPosition }
  | { readonly kind: "group"; readonly position: DockDropPosition; readonly lock: number | undefined };
export function refusesDockDrop(draggedLock: number | undefined, target: DockDropTarget): boolean;
```

- [ ] **Step 1: Write the failing rule table test** in `dockDropRules.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { type DockDropTarget, refusesDockDrop } from "#/dockDropRules";

describe("refusesDockDrop (Ruling R5)", () => {
  it.each([
    // dragged, target, refused
    [undefined, createGroup("center", undefined), false],
    [undefined, createGroup("top", undefined), false],
    [undefined, createGroup("left", undefined), false],
    [undefined, createGroup("center", 360), true],
    [undefined, createGroup("top", 360), true],
    [undefined, createGroup("left", 360), true],
    [360, createGroup("center", undefined), true],
    [360, createGroup("top", undefined), true],
    [360, createGroup("bottom", undefined), true],
    [360, createGroup("left", undefined), false],
    [360, createGroup("right", undefined), false],
    [360, createGroup("center", 360), false],
    [360, createGroup("top", 360), false],
    [360, createGroup("left", 360), true],
    [360, createGroup("center", 290), true],
    [360, createGroup("top", 290), true],
    [360, createEdge("left"), false],
    [360, createEdge("right"), false],
    [360, createEdge("top"), true],
    [360, createEdge("bottom"), true],
    [undefined, createEdge("top"), false],
  ] as const)("dragged %s onto %j → refused %s", (dragged, target, refused) => {
    expect(refusesDockDrop(dragged, target)).toBe(refused);
  });
});

function createGroup(
  position: DockDropTarget["position"],
  lock: number | undefined,
): DockDropTarget {
  return { kind: "group", position, lock };
}

function createEdge(position: DockDropTarget["position"]): DockDropTarget {
  return { kind: "layout-edge", position };
}
```

- [ ] **Step 2: Run it and confirm it fails** because the module can't be resolved.

Run: `pnpm --filter @rtc/layout-dockview exec vitest run src/dockDropRules.test.ts`

- [ ] **Step 3: Implement** `dockDropRules.ts`

```ts
export type DockDropPosition = "top" | "bottom" | "left" | "right" | "center";

/** Where a drop lands: the outer edge of the whole layout, or one group
 * (whose `lock` is its panels' shared `fixedWidth`, undefined if free). */
export type DockDropTarget =
  | { readonly kind: "layout-edge"; readonly position: DockDropPosition }
  | {
      readonly kind: "group";
      readonly position: DockDropPosition;
      readonly lock: number | undefined;
    };

/** Ruling R5 — the invariant it protects: a group never mixes widths, and
 * a column never holds a locked group beside anything that must stretch.
 * A locked panel may start its own column (a left/right drop), stack onto
 * or above/below a group locked at the SAME width, and nothing else; a
 * free panel may go anywhere except onto a locked group. A top/bottom drop
 * on the whole layout's edge makes a full-width row, which a lock would
 * pin the entire dock to — refused for a locked panel. */
export function refusesDockDrop(
  draggedLock: number | undefined,
  target: DockDropTarget,
): boolean {
  const vertical = target.position === "top" || target.position === "bottom";

  if (target.kind === "layout-edge") {
    return draggedLock !== undefined && vertical;
  }

  if (target.lock !== undefined) {
    return (
      draggedLock !== target.lock ||
      !(vertical || target.position === "center")
    );
  }

  return draggedLock !== undefined && (vertical || target.position === "center");
}
```

Add `export * from "#/dockDropRules";` to `index.ts`.

- [ ] **Step 4: Run and confirm it passes (21 cases).** Mutation check: change `vertical || target.position === "center"` in the last line to `vertical`. Expect the `[360, center, undefined]` case to go RED.

- [ ] **Step 5: Wire it to dockview's overlay veto** in `createDockEngine`, next to the other construction-time subscriptions. `DockviewWillShowOverlayLocationEvent` (dockview-core 8.3.1 `dockview/events.d.ts`) exposes `kind`, `position`, `group`, `getData()` (a `PanelTransfer`: `panelId` is null when a whole group is dragged, `groupId` otherwise), and `preventDefault()`:

```ts
  /** Refuses (hides the overlay of, and so cancels) any drop Ruling R5
   * forbids. A whole-group drag carries no panelId — its lock is its
   * group's. */
  function refuseLockBreakingDrop(
    event: DockviewWillShowOverlayLocationEvent,
  ): void {
    const data = event.getData();
    const draggedGroup =
      data === undefined ? undefined : api.getGroup(data.groupId);
    const draggedLock =
      data?.panelId !== null && data?.panelId !== undefined
        ? lockOfPanel(data.panelId)
        : draggedGroup === undefined
          ? undefined
          : lockOfGroup(draggedGroup);
    const target: DockDropTarget =
      event.kind === "edge" || event.group === undefined
        ? { kind: "layout-edge", position: event.position }
        : {
            kind: "group",
            position: event.position,
            lock: lockOfGroup(event.group),
          };

    if (refusesDockDrop(draggedLock, target)) {
      event.preventDefault();
    }
  }

  const overlaySub = api.onWillShowOverlay(refuseLockBreakingDrop);
```

Dispose `overlaySub` wherever `changeSub` is disposed. Import `DockviewWillShowOverlayLocationEvent` as a type from `"dockview"`, and `refusesDockDrop` / `DockDropTarget` from `#/dockDropRules`. If `event.position` is typed as dockview's `Position` string union, it already matches `DockDropPosition`. Confirm this in `dockview/events.d.ts` and don't cast.

- [ ] **Step 6: Apply the same rule to the wrapper's own float drag-to-dock.** In `dockFloatOnRelease` and `previewFloatDock`, take the `FloatDockTarget` that `floatDockTargetAt(x, y)` returns. Build `{ kind: "group", position, lock: lockOfGroup(target group) }` from it, with the floating group's `lockOfGroup` as `draggedLock`. When `refusesDockDrop` returns true, treat it exactly like "no target": no preview, and on release no dock. Read `FloatDockTarget` (the interface near `DOCK_PREVIEW_CLASS`) for its field names.

- [ ] **Step 7: Engine test for the float path.** In the float suite of `createDockEngine.test.ts`, add a case alongside the existing tests for docking floats home, using the same helpers they use to press and move a float's head. With the locked rail base from Task 3, float `fx-analytics` and drag it with Shift onto the centre of `fx-rates`. Expect `engine.groupCount()` to be unchanged and `fx-analytics` to still be floating (`onFloatsChange` list). If the file has no helper that performs a float head drag in jsdom, add the case to Task 8's e2e instead and note that in the report.

- [ ] **Step 8: Run the package suite, then commit**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run && pnpm --filter @rtc/layout-dockview typecheck`
Expected: PASS

```bash
git add packages/layout-dockview/src/dockDropRules.ts packages/layout-dockview/src/dockDropRules.test.ts \
  packages/layout-dockview/src/index.ts packages/layout-dockview/src/createDockEngine.ts \
  packages/layout-dockview/src/createDockEngine.test.ts
git commit -m "feat(layout-dockview): refuse drops that would mix a locked panel's width"
```

---

### Task 5: A floating locked panel keeps its width

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (`floatingBoundsFor`, `floatPanel`, `settleFloatTransitions`)
- Modify: `packages/layout-dockview/src/dockview-hud.css`
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`, `packages/layout-dockview/src/dockviewHud.test.ts`

**Interfaces:**
- Consumes: `lockOfGroup`, `settleWidthLocks` (Task 3)
- Produces: the CSS class `rtc-float-fixed-width` (shipped as `rtc-dock-float-fixed-width`) on a floating group's `.dv-resize-container` while that group is locked

- [ ] **Step 1: Write the failing tests.** Add to the Task 3 describe block, reusing `createLockedRailBase`:

```ts
  it("floats a locked panel at exactly its locked width, width handles hidden", () => {
    const opts = createLockedRailBase();
    const engine = createDockEngine(opts);

    expect(engine.floatPanel("fx-analytics")).toBe(true);

    const group = lastDockviewApi().getPanel("fx-analytics")?.group;
    const overlay = group?.element.closest(".dv-resize-container");

    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    expect(overlay?.classList.contains("rtc-float-fixed-width")).toBe(true);
    engine.dispose();
  });

  it("docks back home still locked, and the class goes with the float", () => {
    const engine = createDockEngine(createLockedRailBase());

    engine.floatPanel("fx-analytics");
    engine.dockPanel("fx-analytics");

    expect(widthClampOf("fx-analytics")).toEqual([367, 367]);
    expect(document.querySelector(".rtc-float-fixed-width")).toBeNull();
    engine.dispose();
  });
```

In `dockviewHud.test.ts`, following its existing pattern of asserting rules in the stylesheet, add an assertion that `dockview-hud.css` contains a rule hiding `.rtc-float-fixed-width > .dv-resize-handle-left` and the `right`, `topleft`, `topright`, `bottomleft`, and `bottomright` handles, and does **not** hide `-top` or `-bottom`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run -t "locked width|docks back home still locked" && pnpm --filter @rtc/layout-dockview exec vitest run src/dockviewHud.test.ts`
Expected: FAIL. The class is absent, and the float width is floored at 420 by `FLOAT_MIN_WIDTH_PX`.

- [ ] **Step 3: Size a locked float exactly.** Give `floatingBoundsFor` a fourth parameter, `lockedModelWidth: number | undefined`. When it's defined, `width = Math.min(lockedModelWidth, containerRect.width)`, and the `FLOAT_MIN_WIDTH_PX` floor and the share cap are skipped. Everything else stays the same. In `floatPanel`, pass `lock === undefined ? undefined : lock + GROUP_GAP_PX`, where `lock = lockOfGroup(group)`.

- [ ] **Step 4: Keep the lock through the float.** In `settleFloatTransitions`, the R5 path calls `suspendPinsFor` when a group leaves the grid. **Leave it alone for pins.** Pins are already skipped for locked panels (Task 3, R10), so no pin record exists for them. After its existing work, add:

```ts
    // Ruling R6: a locked float keeps its width — its group stays clamped
    // (settleWidthLocks includes floating groups) and its overlay's width
    // handles are hidden; height handles stay.
    for (const group of api.groups) {
      const overlay = group.element.closest(".dv-resize-container");

      overlay?.classList.toggle(
        "rtc-float-fixed-width",
        group.api.location?.type === "floating" && lockOfGroup(group) !== undefined,
      );
    }
    settleWidthLocks();
```

- [ ] **Step 5: Add the CSS** to `dockview-hud.css`:

```css
/* Ruling R6: a floating width-locked panel keeps its width — only its
   height handles stay. */
.rtc-float-fixed-width > .dv-resize-handle-left,
.rtc-float-fixed-width > .dv-resize-handle-right,
.rtc-float-fixed-width > .dv-resize-handle-topleft,
.rtc-float-fixed-width > .dv-resize-handle-topright,
.rtc-float-fixed-width > .dv-resize-handle-bottomleft,
.rtc-float-fixed-width > .dv-resize-handle-bottomright {
  display: none;
}
```

In dockview-core 8.3.1, `Overlay` appends its handles as direct children named `dv-resize-handle-${direction}` (see `setupResize`). Confirm the six direction names by reading `Overlay`'s constructor in `node_modules/.pnpm/dockview-core@8.3.1/node_modules/dockview-core/dist/dockview-core.js`. If a name differs, use the real one and note it in the report.

- [ ] **Step 6: Run the package suite and stylelint, then commit**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run && pnpm lint:css`
Expected: PASS

```bash
git add packages/layout-dockview/src/createDockEngine.ts packages/layout-dockview/src/dockview-hud.css \
  packages/layout-dockview/src/createDockEngine.test.ts packages/layout-dockview/src/dockviewHud.test.ts
git commit -m "feat(layout-dockview): a floating locked panel opens at and keeps its width"
```

---

### Task 6: Wire the `fixedWidth` hook in both Dockview bridges

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` (**both** engine-construction sites, around lines 343 and 584, where `maximizeScope` is wired)
- Modify: `packages/client-solid/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` (the `buildEngine()` hooks object, around line 303)
- Test: the existing `packages/client-{react,solid}/src/ui/shell/layout/dockview/__tests__/` suites. Add one case per client in the file that already asserts the `maximizeScope` wiring (find it with `grep -rln maximizeScope packages/client-*/src/ui/shell/layout/dockview/__tests__`).

**Interfaces:**
- Consumes: `DockPanelHooks.fixedWidth` (Task 3); `PanelSpec.fixedWidthPx` (Task 1)

- [ ] **Step 1: Write the failing bridge test (React; mirror it in Solid).** Mount the FX dockview engine the same way the neighbouring tests do. Assert that the Analytics panel's dockview group reads `minimumWidth === maximumWidth === 367`, reading the group through the same accessor those tests use for group geometry. Name the test `"locks the FX rail at 360 + gap from PANEL_SPECS.fixedWidthPx"`.

- [ ] **Step 2: Run it and confirm it fails.** Run each client's dockview test directory, for example `pnpm --filter @rtc/client-react exec vitest run src/ui/shell/layout/dockview`. Expected: FAIL (the group is unclamped).

- [ ] **Step 3: Add the hook** right below each `maximizeScope` entry. React:

```ts
        fixedWidth: (id: string): number | undefined => {
          return specsRef.current[id as PanelId]?.fixedWidthPx;
        },
```

Solid:

```ts
        fixedWidth: (id: string): number | undefined => {
          return specs()[id as PanelId]?.fixedWidthPx;
        },
```

React has **two** construction sites. Add the hook to both; a missed site is exactly the gap the Phase 6b review caught with `onSnapshotSourceChange`.

- [ ] **Step 4: Run and confirm both client suites pass, then commit**

Run: `pnpm --filter @rtc/client-react exec vitest run src/ui/shell/layout/dockview && pnpm --filter @rtc/client-solid exec vitest run src/ui/shell/layout/dockview`

```bash
git add packages/client-react/src/ui/shell/layout/dockview packages/client-solid/src/ui/shell/layout/dockview
git commit -m "feat(dockview-bridge): pass PanelSpec.fixedWidthPx to the engine as fixedWidth"
```

---

### Task 7: Discard stored Dockview layouts and saved presets

**Files:**
- Modify: `packages/layout-dockview/src/dockBlob.ts` (version 3; delete `migrateDockBlob` and its private helpers)
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (`loadBlobOrSeed`)
- Modify: `packages/layout-dockview/src/dockBlob.test.ts`, `packages/layout-dockview/src/createDockEngine.test.ts`
- Modify: `packages/core-logic/src/layout/layoutPresetCodec.ts` (`LAYOUT_PRESET_VERSION = 2`) + `__tests__/layoutPresetCodec.test.ts`
- Modify: `packages/client-{react,solid}/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.docked.test.tsx` (the hard-coded `rtcBlobVersion: 2` becomes `DOCK_BLOB_VERSION`)

**Interfaces:**
- Produces: `DOCK_BLOB_VERSION === 3`, `LAYOUT_PRESET_VERSION === 2`. `migrateDockBlob` no longer exists.

- [ ] **Step 1: Write the failing discard tests.** In `createDockEngine.test.ts`, replace the test `"migrates a legacy gap-7 blob's grid and re-clamps its pin at the design width"` with:

```ts
  it.each([
    ["an unstamped (gap-7 era) blob", undefined],
    ["a version-2 blob", 2],
  ])("discards %s and restores the seed", (_label, version) => {
    const first = createDockEngine(createRailBase());
    const parsed = JSON.parse(first.snapshotLayout()) as Record<string, unknown>;
    first.dispose();
    const stale = JSON.stringify({ ...parsed, rtcBlobVersion: version });

    const restored = loadBlobOrSeed(
      createDockview(sizedContainer(1200, 800), {
        createComponent: () => {
          throw new Error("unused");
        },
      }),
      { ...createRailBase(), blob: stale },
      1200,
      800,
    );

    expect(restored.restoreTier).toBe("seed");
  });
```

If `loadBlobOrSeed` is already exercised elsewhere in this file with a ready-made `DockviewApi` factory, use that factory instead of the inline `createDockview`.

In `layoutPresetCodec.test.ts`, add a case: a stored list entry with `v: 1` parses as the unreadable row, and a `v: 2` entry parses as readable. Build both with the file's existing entry factory, overriding `v`.

- [ ] **Step 2: Run them and confirm they fail.** The gap-7 blob migrates and restores as `"blob"`, and the `v: 1` preset still reads as readable.

- [ ] **Step 3: Implement the discard.**
  - `dockBlob.ts`: set `DOCK_BLOB_VERSION = 3`, and rewrite its doc comment. Version 3 adds nothing to the format; it exists to discard every earlier layout when width locks shipped (plan 2026-09-28, R9), and the gap-0 description stays. Delete `migrateDockBlob`, `migrateNode`, `migrateStripGeometry`, and any other type or helper used only by them. Delete their tests in `dockBlob.test.ts`. `pnpm lint:dead` (knip) must report nothing new.
  - `loadBlobOrSeed`: before the `try` ladder, compute:

```ts
  const blob = isCurrentDockBlob(opts.blob) ? opts.blob : null;
```

    Then replace `opts.blob` everywhere in the ladder with `blob`. Replace each `migrateDockBlob(JSON.parse(x), GROUP_GAP_PX)` with `JSON.parse(x)`. Add to `dockBlob.ts`:

```ts
/** True only for a blob stamped with the CURRENT version. Anything older —
 * including the unstamped gap-7 era — is discarded whole and the seed
 * restores (plan 2026-09-28, Ruling R9); an unparseable string is left to
 * the ladder's own seed fallback. */
export function isCurrentDockBlob(blob: string | null): blob is string {
  if (blob === null) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(blob);

    return (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as VersionCarrier).rtcBlobVersion === DOCK_BLOB_VERSION
    );
  } catch {
    return false;
  }
}
```

  - `layoutPresetCodec.ts`: set `LAYOUT_PRESET_VERSION = 2`, and add one line to its doc giving the reason (R9: presets from before width locks are shown as unreadable).
  - In both clients' `DockviewLayoutEngine.docked.test.tsx`, replace `rtcBlobVersion: 2` with `rtcBlobVersion: DOCK_BLOB_VERSION`, importing it from `@rtc/layout-dockview` as `presetLoad.test.tsx` already does.

- [ ] **Step 4: Sweep the fixtures that feed a blob.** Search for fixtures that build a blob without the stamp:

Run: `grep -rn -E "rtcBlobVersion|blob: JSON.stringify|snapshotLayout\(\)" packages/layout-dockview/src packages/client-*/src packages/ui-contract/src | grep -E "test|spec|fixture|harness"`

Every fixture that expects a *restore* must carry `rtcBlobVersion: DOCK_BLOB_VERSION`. Where the fixture deliberately stands for a legacy blob, the test's assertion is now "restores the seed". Run the suites below and fix each red case one of those two ways. Don't loosen any assertion.

- [ ] **Step 5: Run every suite that touches blobs or presets**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run && pnpm --filter @rtc/core-logic exec vitest run src/layout && pnpm --filter @rtc/client-core exec vitest run src/layout && pnpm --filter @rtc/client-react exec vitest run src/ui/shell && pnpm --filter @rtc/client-solid exec vitest run src/ui/shell && pnpm lint:dead`
Expected: PASS, and knip is clean.

- [ ] **Step 6: Commit**

```bash
git add packages/layout-dockview/src packages/core-logic/src/layout packages/client-react/src/ui/shell/layout/dockview packages/client-solid/src/ui/shell/layout/dockview
git commit -m "feat(layout): discard pre-lock dock layouts and presets (blob v3, preset v2)"
```

---

### Task 8: e2e — the rail can't be resized, and lock-breaking drops are refused

**Files:**
- Modify: `tests/browser/scenarios/layout.ts`
- Modify: `tests/browser/playwright/layout.spec.ts`

**Interfaces:**
- Consumes: page-object methods that already exist: `dockPanelWidth`, `dragDockSashLeftOf`, `dragDockTabOnto`, `floatPanel`, `waitDockFloating`, `dockGroupMates`, and `expectDockGroups`.

- [ ] **Step 1: Flip the two rail scenarios.** In `scenarios/layout.ts`, replace `expectRailSashDragResizes` with the following, and rewrite its doc comment: the rail is width-locked, and dragging its sash must not change its width.

```ts
const MAX_LOCKED_DRIFT_PX = 1;

export async function expectRailSashDragKeepsRailWidth(
  ctx: TestContext,
): Promise<void> {
  const before = await ctx.po.layout.dockPanelWidth(RAIL_PANEL_ID);
  await ctx.po.layout.dragDockSashLeftOf(RAIL_PANEL_ID, RAIL_DRAG_PX);
  const after = await ctx.po.layout.dockPanelWidth(RAIL_PANEL_ID);

  assertTrue(
    Math.abs(after - before) <= MAX_LOCKED_DRIFT_PX,
    `expected the width-locked rail to keep its width through a ${RAIL_DRAG_PX}px sash drag (before=${before}, after=${after})`,
  );
}
```

  Replace `expectRailSashDragResizesAfterFloatingRailMember` with `expectRailPartnerStaysLockedAfterFloatingRailMember`. It keeps the same float steps, and then makes the same `Math.abs(after - before) <= MAX_LOCKED_DRIFT_PX` assertion on `fx-positions`. Delete `MIN_RAIL_GROWTH_PX` if nothing uses it anymore.

- [ ] **Step 2: Add the drop-refusal scenario:**

```ts
/** Ruling R5, end to end: dragging the width-locked Analytics tab onto the
 * Live Rates body centre would put a 360px lock into a stretching group —
 * dockview must show no drop target and the drop must not happen. The
 * group count staying at `groupsBefore` and Live Rates still standing
 * alone are the two witnesses. */
export async function dragLockedAnalyticsOntoRatesIsRefused(
  ctx: TestContext,
  groupsBefore: number,
): Promise<void> {
  await ctx.po.layout.dragDockTabOnto(
    ANALYTICS_PANEL_ID,
    RATES_PANEL_DROP_TARGET,
  );
  await expectDockGroups(ctx, groupsBefore, 5);
  assertEquals(
    await ctx.po.layout.dockGroupMates(RATES_PANEL_ID),
    [RATES_PANEL_ID],
    "Live Rates must still be alone in its group after a refused drop",
  );
}
```

  Match `assertEquals`' argument order and deep-equality support to its definition in `./assert`. If it only compares primitives, compare `.join(",")`.

- [ ] **Step 3: Update the spec file.** In `layout.spec.ts`:
  - Rename the test `"dockview: dragging the rail's sash resizes the rail on a fresh boot"` to `"dockview: the width-locked rail keeps its width through a sash drag on a fresh boot"`, and have it call `expectRailSashDragKeepsRailWidth`.
  - Rename the test `"dockview: after a pinned rail panel floats out, its partner's sash still resizes"` to `"dockview: after a locked rail panel floats out, its partner stays locked"`, and have it call the renamed scenario.
  - Add this test:

```ts
  test("dockview: a width-locked panel cannot be dropped into a stretching group", async ({
    ctx,
  }) => {
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);
    await layout.dragLockedAnalyticsOntoRatesIsRefused(ctx, 4);
  });
```

- [ ] **Step 4: Build, then run the layout e2e against both clients.** Don't run two builds at once.

Run: `pnpm build && pnpm --filter @rtc/tests exec playwright test -c browser/playwright/playwright.config.ts layout.spec.ts`

Before piping or filtering this command, read `reference_piped_playwright_summary_false_green`: run it unfiltered and read the whole summary line. If the package's e2e script selects the client differently, use `pnpm test:e2e -- layout.spec.ts`, as `tests/package.json` defines it.

Expected: every layout test passes on react and solid.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/scenarios/layout.ts tests/browser/playwright/layout.spec.ts
git commit -m "test(e2e): locked rail keeps its width; lock-breaking drop is refused"
```

---

### Task 9: Docs, STATUS, goldens, and the full gauntlet

**Files:**
- Modify: `docs/adr/ADR-002-layout-management-port.md`: add a short "Width locks" section (the spec field, R1–R10 in one paragraph each at most, and a link to this plan)
- Modify: `docs/STATUS.md`: delete the 🔴 "Fixed-width rails (width-locked panels)" entry, bumping `Last updated`
- Goldens: the committed x86 `react/` set for the `app/` scenarios

- [ ] **Step 1: ADR-002.** Append a `## Width locks (2026-09-28)` section. It states that `PanelSpec.fixedWidthPx` locks a panel's width in both engines. It covers what the lock yields to (strips, and a dock with no absorbers), the Dockview drop rules, the floating behaviour, the pop-out exception (R7), and the dividers beside a locked rail (R8). It links `../superpowers/plans/2026-09-28-fixed-width-rails.md`. Run `pnpm check:doc-links`.

- [ ] **Step 2: STATUS.md.** Follow the `tracking-workstream-status` skill. Remove the 🔴 "Fixed-width rails (width-locked panels)" entry this plan added, because this branch ships it. Bump `**Last updated:**` to the day of the merge. Run `pnpm check:doc-links`.

- [ ] **Step 3: Run the full local gauntlet** (`/rtc:gauntlet full`) on the final tree, then `pnpm exec biome ci .` and `pnpm lint:eslint` once more after the last edit (see `feedback_gate_the_final_tree`).
Expected: all green. `pnpm check:dist` is clean.

- [ ] **Step 4: Push, open the PR, and regenerate the affected goldens.** Once the PR's first CI run exists:

```bash
gh workflow run update-visual-goldens.yml --ref worktree-fixed-width-rails -f scenario_pattern='app/'
```

  The in-house `app/fx*`, `app/credit`, and `app/equities` scenarios lose the rail handle. The Dockview twins may change where the sash beside the rail now renders as disabled. Once the run's commit lands, `git pull` the branch and confirm that `git show --name-only --format= <sha> | grep -v "__screenshots__/react/"` is empty. Eyeball at least `app/fx`, `app/credit`, and `app/equities` against their previous versions. The auto-commit carries `[skip ci]`, so push a **non-empty** follow-up commit to get a CI run on the head (see `reference_golden_regen_dispatch_traps`). The STATUS date bump works if nothing else is pending.

- [ ] **Step 5: Commit the docs**

```bash
git add docs/adr/ADR-002-layout-management-port.md docs/STATUS.md
git commit -m "docs: width locks in ADR-002; close the fixed-width-rails backlog entry"
```

---

## Self-review

- **Spec coverage.** The user's asks were: non-resizable in both engines (Tasks 2 and 3+6), "everywhere" (Task 4 drops, Task 5 floats, R7 names the one exception), all three tabs (Task 1 widths), and discarding stored layouts (Task 7). Each ask maps to a task.
- **Placeholder scan.** Some steps say "use the name the file already uses" for page-object method names (collapse/expand, the float-head helper, the group accessor). Those are pointers to existing code, not unspecified behaviour. Each one says what to assert, and the rest of each step's code is written out.
- **Type consistency.** The same names are used across tasks: `fixedWidthPx` (the spec field), `fixedWidth` (the hook), `lockedWidthPx` (the in-house helper), `lockOfPanel` / `lockOfGroup` / `settleWidthLocks` (the engine), `refusesDockDrop` / `DockDropTarget` / `DockDropPosition` (the rule), and `rtc-float-fixed-width` (the CSS class).
- **Review Focus.** Each of the five items has its test named in its owning task: 1 is in Tasks 2 and 3, 2 in Tasks 2 and 3, 3 in Tasks 4 and 8, 4 in Tasks 4 (step 7) and 5, and 5 in Task 7.
