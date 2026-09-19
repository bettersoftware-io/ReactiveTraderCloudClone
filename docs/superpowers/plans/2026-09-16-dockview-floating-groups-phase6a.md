# Dockview Floating Groups (Phase 6a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dockview's floating groups a supported, tested feature — a panel can be torn into a floating box inside the page from its head control or by shift-drag, docked back home, and restored floating after a reload.

**Architecture:** `dockview-core@8.3.1` already ships `DockviewApi.addFloatingGroup` (synchronous, no `window.open`) and already floats a group on shift-drag because `disableFloatingGroups` is never set. So this phase wires an existing primitive through `createDockEngine`, defines its interplay with the pin / strip / instance-share machinery, makes the blob survive a damaged float, and adds a head control plus witness attribute in both web clients. Floating is layer-3 arrangement: no client-core machine change, no new layer-2 state, no in-house projection.

**Tech Stack:** TypeScript, `dockview@8.3.1` (vanilla entry), vitest + jsdom (engine), vitest-browser + `@rtc/ui-contract` page objects (contract tier), Playwright (e2e + visual goldens), CSS Modules / plain CSS for `dockview-hud.css`.

**Spec:** [../specs/2026-09-15-dockview-floats-and-presets-design.md](../specs/2026-09-15-dockview-floats-and-presets-design.md) — §3 is this phase; §4 (presets) is Phase 6b and is out of scope here.

**Execution rulings:** [2026-09-16-dockview-floating-groups-phase6a-rulings.md](2026-09-16-dockview-floating-groups-phase6a-rulings.md) — the 39 decisions taken while executing this plan (where it proved wrong, silent, or contradicted by measurement), each with its rationale and what it costs if wrong. Read it before re-using this plan as a template.

## Global Constraints

- **Both web clients move together.** Every UI addition ships in `client-react` and `client-solid`, with contract specs run against both via the swap-trio.
- **Nothing may degrade the in-house engine.** Floating is layer-3 invisible under in-house; the in-house visual assert runs locally before the PR merges.
- **Handler naming** (`docs/handler-naming.md`, enforced by `rtc/name-functions-by-effect`): a concrete handler is named for its effect; `onX` only for slots (a function-typed prop). So the prop is `onFloat`, the bridge's handler is `floatPanel`.
- **Dumb UI:** no rxjs / localStorage / fetch in `src/ui`; no inline `style={{…}}` (ESLint AST rule); CSS Modules only; `#/` subpath-alias imports.
- **React Compiler by default** in `client-react` — no hand-rolled `memo`/`useMemo` for the new code. Solid uses a `createMemo` per rendered slot **only** for registry-shaped lookups; a scalar signal read needs none (precedent: `poppedHere={popped().includes(p.panelId)}`, Solid `DockviewLayoutEngine.tsx:604`).
- **Blob compatibility:** `DOCK_BLOB_VERSION` stays `2`. Floats are additive; an older blob simply carries no floats. No migration step may be added.
- **Braces mandatory** on every control statement (Biome `useBlockStatements`); `pnpm exec biome ci .` (not `pnpm lint`) is the format+import-sort gate.
- **Per-file coverage**, not the aggregate: the ≥95% contract gates pass on both clients and `pnpm coverage:gaps` shows no new weak file.
- **Absence must be structurally distinguishable** (repo-recurring failure class): a degraded restore reports *which* tier restored it; never infer success from a silent absence, and never assert a test passes because a query found nothing.

## Pre-flight (controller, before Task 1)

- [ ] Branch off a `main` that already contains the peer session's `data-maximized` re-land on both `DockviewLayoutEngine.tsx` bridges (and its `DEFAULT_LAYOUT_ENGINE` flip, if that lands). Both files are edited by Tasks 6 and 7; going second avoids a rebase. Verify with `git log --oneline -15 origin/main` and a grep for `data-maximized` in both bridges.
- [ ] If the default engine has flipped to `"dockview"`, Task 9's e2e no longer needs `openPreferencesAndSelectLayoutEngine(ctx, "dockview")`. Note which state you branched off in the ledger; do not let Task 9 guess.

## File Structure

| File | Responsibility |
|---|---|
| `packages/layout-dockview/src/createDockEngine.ts` | `floatPanel` / `dockPanel`, `publishFloatingPanels`, `onFloatsChange`, the interplay guards, the `onWillDragGroup` cancel hook, the restore-tier refactor |
| `packages/layout-dockview/src/dockBlob.ts` | new `withoutFloatingGroups` scrub (load-retry only — floats are NOT scrubbed on save) |
| `packages/layout-dockview/src/styles/dockview-hud.css` | floating-group card + head chrome, per skin |
| `packages/layout-dockview/src/createDockEngine.test.ts` | characterization suite + the interplay matrix |
| `packages/layout-dockview/src/dockBlob.test.ts` | `withoutFloatingGroups` units |
| `packages/layout-dockview/src/dockviewHud.test.ts` | text-level assertion for the new floating selectors |
| `packages/client-react/src/ui/shell/layout/engine/PanelHeadControls.tsx` + Solid twin | `onFloat` slot, `floatingHere` state |
| `packages/client-{react,solid}/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` | `onFloatsChange` wiring, `data-floating` witness, head prop |
| `packages/client-{react,solid}/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.floating.test.tsx` | per-client bridge specs |
| `packages/ui-contract/src/shared/pages/shell/layout/DockviewEnginePage.ts` + `src/specs/shell/layout/DockviewEngine.contract.spec.ts` | shared float assertions, both clients |
| `tests/browser/page-objects/playwright/Layout.ts`, `tests/browser/scenarios/layout.ts`, `tests/browser/playwright/layout.spec.ts` | e2e float → reload → dock home |
| `packages/ui-contract/goldens/**` | regenerated golden sets (the new head control repaints all 13 `-dockview` scenarios) |
| `packages/layout-dockview/README.md`, `docs/adr/ADR-002-layout-management-port.md`, `docs/STATUS.md` | docs |

---

### Task 1: Characterize dockview 8.3.1's floating primitive (tests only)

Five facts this phase depends on are **not** derivable by reading the repo. This task answers them with executable tests before any engine code exists. No `src/` file changes here.

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.test.ts` (add one `describe` block at the end of the dynamic-panel/pop-out region, near the pop-out suite at `:3609`)

**Interfaces:**
- Consumes: `base()` (`createDockEngine.test.ts:3957-3977`), `sizedContainer(width, height)` (`:4092`), `lastDockviewApi()` (`:3678-3684`), `capturedDockview` (`:4284-4295`), seeds `FX_LIKE` (`:34-50`) and `RAIL_LIKE` (`:55-79`), `RecordingResizeObserver` (`:4069+`).
- Produces: the five recorded answers below, in the task report **and** as assertions in the committed suite. Tasks 2-4 cite them.

The five questions, each of which MUST end up asserted:

1. Does `api.addFloatingGroup(panel)` on a grid-resident group detach it in place, or must the caller remove it first?
2. Is a floating group's element outside every grid-relative DOM walk — i.e. `group.element.closest(".dv-split-view-container")` is `null`, and a grid split element does not `.contains()` it?
3. Does `api.toJSON()` emit a `floatingGroups` key while a float is open, and does `api.fromJSON()` restore it?
4. Which API docks a float back: `api.moveGroupOrPanel(...)`, `api.moveGroup(...)`, or neither (see `dockviewComponent.d.ts:265-266`)?
5. Is `api.groups.length` (and therefore `groupCount()`) unchanged by floating, and does `group.api.location.type` read `"floating"`?

- [ ] **Step 1: Write the characterization suite**

```ts
describe("dockview floating groups (characterization of the 8.3.1 primitive)", () => {
  it("detaches a grid group in place, outside every grid-relative DOM walk", () => {
    const engine = createDockEngine({ ...base(), container: sizedContainer(1440, 900) });
    const api = lastDockviewApi();
    const panel = api.getPanel("fx-analytics");
    const gridBefore = api.groups.length;

    api.addFloatingGroup(panel.group, { x: 40, y: 40, width: 420, height: 320 });

    const group = api.getPanel("fx-analytics").group;
    expect(group.api.location.type).toBe("floating");
    expect(api.groups.length).toBe(gridBefore); // Q5: membership unchanged
    expect(group.element.closest(".dv-split-view-container")).toBeNull(); // Q2
    engine.dispose();
  });

  it("round-trips a floating group through toJSON/fromJSON", () => {
    const engine = createDockEngine({ ...base(), container: sizedContainer(1440, 900) });
    const api = lastDockviewApi();
    api.addFloatingGroup(api.getPanel("fx-analytics").group, { x: 40, y: 40 });

    const serialized = api.toJSON() as { floatingGroups?: readonly unknown[] };

    expect(serialized.floatingGroups).toHaveLength(1); // Q3
    engine.dispose();
  });
});
```

- [ ] **Step 2: Run it and record what actually happens**

Run: `pnpm --filter @rtc/layout-dockview test -- createDockEngine.test.ts -t "characterization"`
Expected: it may FAIL — that is a finding, not a defect. If `addFloatingGroup` needs a prior removal, or `toJSON` omits the key, **change the assertion to match reality** and write the real behaviour down. Do not change reality to match the plan.

- [ ] **Step 3: Answer Q4 with a test, not a guess**

Add one `it` per candidate (`moveGroupOrPanel`, `moveGroup`) that floats a panel, calls the candidate to return it to the grid, and asserts `location.type === "grid"`. Keep the one that works; delete the others; if none works, assert that and say so in the report — Task 2 then uses the remove-and-reopen fallback.

- [ ] **Step 4: Run the whole engine suite**

Run: `pnpm --filter @rtc/layout-dockview test`
Expected: PASS — the new suite plus the existing ~4300-line file, unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-dockview/src/createDockEngine.test.ts
git commit -m "test(layout-dockview): characterize dockview 8.3.1 floating groups"
```

**Report MUST contain:** one line per question Q1-Q5 with the observed answer and the test name that proves it.

---

### Task 2: Engine — `floatPanel`, `dockPanel`, `onFloatsChange`

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (`DockEngineOptions` ~`:94-133`, `DockEngine` ~`:184-243`, publish helpers ~`:399-420`, method bodies beside `popoutPanel` ~`:2146-2158`)
- Modify: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: Task 1's answers (esp. Q1 and Q4).
- Produces: `DockEngine.floatPanel(panelId: string): boolean`, `DockEngine.dockPanel(panelId: string): void`, `DockEngineOptions.onFloatsChange?: (floatingPanelIds: readonly string[]) => void`. Tasks 3, 6 and 7 consume these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
it("floatPanel floats the panel's group and publishes the floating set", () => {
  const floats: (readonly string[])[] = [];
  const engine = createDockEngine({
    ...base(),
    container: sizedContainer(1440, 900),
    onFloatsChange: (panelIds) => { floats.push(panelIds); },
  });

  expect(engine.floatPanel("fx-analytics")).toBe(true);

  expect(floats.at(-1)).toEqual(["fx-analytics"]);
  engine.dispose();
});

it("floatPanel returns false for an unknown panel and publishes nothing", () => {
  const floats: (readonly string[])[] = [];
  const engine = createDockEngine({ ...base(), onFloatsChange: (ids) => { floats.push(ids); } });

  expect(engine.floatPanel("nope")).toBe(false);

  expect(floats).toEqual([]);
  engine.dispose();
});

it("dockPanel returns a floating panel to its seed-home slot", () => {
  const engine = createDockEngine({ ...base(), container: sizedContainer(1440, 900) });
  engine.floatPanel("fx-analytics");

  engine.dockPanel("fx-analytics");

  const api = lastDockviewApi();
  expect(api.getPanel("fx-analytics").group.api.location.type).toBe("grid");
  expect(engine.groupCount()).toBe(4);
  engine.dispose();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/layout-dockview test -- createDockEngine.test.ts -t "floatPanel"`
Expected: FAIL — `engine.floatPanel is not a function`.

- [ ] **Step 3: Add the option and the interface methods**

In `DockEngineOptions`, directly after `onPopoutsChange` (`:115`):

```ts
  /** Every panel currently in a FLOATING group, sorted. Fires only on change.
   * Unlike the popped set, floating IS persisted — a float is layer-3
   * arrangement, like a drag or a stack (see the Phase 6 design, §3.3). */
  readonly onFloatsChange?: (floatingPanelIds: readonly string[]) => void;
```

In `DockEngine`, beside `popoutPanel` (`:240`):

```ts
  /** Floats panelId's group as a box over the grid; false when refused —
   * unknown panel, already floating, or a live maximize (see §3.2). */
  floatPanel(panelId: string): boolean;
  /** Returns a floating panel to its seed-home slot; no-op when not floating. */
  dockPanel(panelId: string): void;
```

- [ ] **Step 4: Add the publish twin**

Beside `publishPoppedPanels` (`:401-417`), with its own `lastFloating` declared next to `lastPopped` (`:399`), and call it from the same `api.onDidLayoutChange` handler body (`:419-420`):

```ts
  function publishFloatingPanels(): void {
    const floating = api.groups
      .filter((group) => {
        return group.api.location.type === "floating";
      })
      .flatMap((group) => {
        return group.panels.map((panel) => panel.id);
      })
      .sort();

    if (floating.join(" ") !== lastFloating.join(" ")) {
      lastFloating = floating;
      opts.onFloatsChange?.(floating);
    }
  }
```

- [ ] **Step 5: Implement the two methods**

`floatPanel` mirrors `popoutPanel` (`:2146`) but is **synchronous** — `addFloatingGroup` needs no `window.open`, so there is no Promise and no blocked-window branch:

```ts
    floatPanel: (panelId: string): boolean => {
      const panel = api.getPanel(panelId);

      if (panel === undefined || panel.group.api.location.type !== "grid") {
        return false;
      }

      api.addFloatingGroup(panel.group, floatingBoundsFor(panel.group));

      return true;
    },
```

`floatingBoundsFor(group)` is a new local helper: it derives `{ x, y, width, height }` from the group's current rect, clamped so the box stays inside `opts.container` (the design's "a float cannot be dragged out of reach"). Where dockview 8.3.1 exposes a component-level bounds option, pass it in the `createDockview({...})` literal (`:270-300`) as well and **name the option you found** in the code comment — verify the exact name in `node_modules/.pnpm/dockview-core@8.3.1/.../dockview/options.d.ts` rather than assuming `floatingGroupBounds`. Leave `disableFloatingGroups` unset, with a comment saying shift-drag is a kept feature (naming the deviation, per the repo's naming doctrine).

`dockPanel` uses whichever primitive Task 1 proved. If none docks a float, use the fallback: remove the floating group and re-add the panel through the same seed-home path `reopenPanel` (`:231`) already uses — cite the helper by name in the code.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @rtc/layout-dockview test -- createDockEngine.test.ts -t "float"`
Expected: PASS (all of Step 1, plus Task 1's suite still green).

- [ ] **Step 7: Commit**

```bash
git add packages/layout-dockview/src
git commit -m "feat(layout-dockview): float and dock a panel's group, with a floats publish channel"
```

---

### Task 3: Engine — the interplay matrix (§3.2 of the spec)

Each row of the spec's §3.2 table becomes one rule and at least one test. This is the phase's core deliverable.

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts`
- Modify: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: `floatPanel`/`dockPanel` (Task 2); `suspendPinsHolding` (`:1136-1154`), `releasePinMembers` (`:1067-1100`), `clampPinMembers` (`:1106-1128`), `designPins`; `maximizePanel` (`:1913-2000`) and its guard (`:1916-1918`), `collapsePanel` (`:2021-2039`), `exitMaximize` (`:2001-2020`); `instanceSplitOf` (`:1444-1462`), `shareSplitAmongInstances` (`:1520-1600`), `designPxOfInstanceChild` (`:1655+`); the listener registration/teardown pattern (`:1709`, `:1727`, `dispose()` `:2162-2202`).
- Produces: no new public API — behaviour only.

The rules to implement:

| # | Rule | Where |
|---|---|---|
| R1 | `collapsePanel` is a no-op for a floating panel | guard after `api.getPanel`, mirroring `maximizePanel`'s guard shape at `:1916-1918` |
| R2 | `maximizePanel` is a no-op for a floating panel | same |
| R3 | `floatPanel` returns `false` while `maximized !== null` | `floatPanel` (Task 2) |
| R4 | A shift-drag float attempt during a live maximize is cancelled | subscribe `api.onWillDragGroup` (`dockviewComponent.d.ts:242`) and prevent the native event; register beside the other listeners and tear down in `dispose()` |
| R5 | Floating suspends a design pin holding that panel and keeps the record; docking home re-clamps it | new `suspendPinsFor(panelId)` beside `suspendPinsHolding`, using `releasePinMembers`; `dockPanel` calls `clampPinMembers` for the records it suspended |
| R6 | A floating chart instance leaves the equal-share rule, and docking home re-enters it | assert the natural exclusion Task 1's Q2 established; add an explicit filter in `instanceSplitOf` / `designPxOfInstanceChild` **only if** Q2 showed the DOM walk still reaches it |
| R7 | Maximizing a *docked* panel leaves floats visible and untouched | test only, if Q2 holds |

- [ ] **Step 1: Write one failing test per rule**

Name them for the rule, e.g.:

```ts
it("refuses to collapse a floating panel (R1)", () => {
  const engine = createDockEngine({ ...base(), container: sizedContainer(1440, 900) });
  engine.floatPanel("fx-analytics");

  engine.collapsePanel("fx-analytics");

  const api = lastDockviewApi();
  expect(api.getPanel("fx-analytics").group.api.location.type).toBe("floating");
  expect(engine.groupCount()).toBe(4);
  engine.dispose();
});

it("refuses to float while a maximize is live (R3)", () => {
  const engine = createDockEngine({ ...base(), container: sizedContainer(1440, 900) });
  engine.maximizePanel("fx-tiles");

  expect(engine.floatPanel("fx-analytics")).toBe(false);

  engine.dispose();
});

it("re-clamps a suspended design pin when a floated rail panel docks home (R5)", () => {
  const engine = createDockEngine({ ...base(), seed: RAIL_LIKE, container: sizedContainer(1440, 900) });
  const railPanelId = /* the rail panel id RAIL_LIKE declares with initialPx — read it off the fixture at :55-79 */ "";
  const widthBefore = widthOf(railPanelId);

  engine.floatPanel(railPanelId);
  engine.dockPanel(railPanelId);

  expect(widthOf(railPanelId)).toBe(widthBefore);
  engine.dispose();
});
```

`widthOf` is **not** new: the design-pin suite in this same file already reads a
pinned group's width. Find it (`describe("design pins"`), reuse it verbatim, and
name it in the commit message. If it is a local arrow inside that `describe`,
lift it to the file scope in a separate first commit so both suites share one
accessor — do not copy it.

- [ ] **Step 2: Run to verify each fails for the right reason**

Run: `pnpm --filter @rtc/layout-dockview test -- createDockEngine.test.ts -t "(R1)"` (and per rule)
Expected: FAIL. A test that passes before the rule exists is a **vacuous test** — the repo's recurring failure class (#738 R21). Change the test until it bites, and say so in the report.

- [ ] **Step 3: Implement R1-R5 (and R6 only if needed)**

Guard shape for R1/R2, placed immediately after the panel resolution:

```ts
      // A floating group is outside the grid, so a strip has no slot to build
      // around it and no home to restore it to (Phase 6 design §3.2).
      if (panel.group.api.location.type !== "grid") {
        return;
      }
```

- [ ] **Step 4: Run the full engine suite**

Run: `pnpm --filter @rtc/layout-dockview test`
Expected: PASS, including every pre-existing pin / strip / maximize / instance test.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-dockview/src
git commit -m "feat(layout-dockview): floating-group interplay with pins, strips, maximize and the instance share"
```

**Report MUST state** for R6 and R7 whether the exclusion was natural (test-only) or needed an explicit filter, with the evidence.

---

### Task 4: Engine — persistence, with a named restore tier

Floats persist. A damaged float must cost only the floats.

**Files:**
- Modify: `packages/layout-dockview/src/dockBlob.ts` (new helper beside `withoutPopoutGroups` `:487-527`)
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (`RestoredLayout` `:2699-2708`, `loadBlobOrSeed` `:2760-2833`, the one `restored.seeded` read site `:1786`)
- Modify: `packages/layout-dockview/src/dockBlob.test.ts`, `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: `withoutDynamicNodes` (`dockBlob.ts:260-319`), `migrateDockBlob` (`:54-81`), `seedPanelIdsOf`, `convertSeed`.
- Produces: `withoutFloatingGroups(serialized: unknown): unknown`; `RestoredLayout.restoreTier: RestoreTier` replacing `seeded`, where `type RestoreTier = "blob" | "blob-without-floats" | "blob-without-dynamic" | "seed"`.

Why replace `seeded` rather than add a flag: an added boolean nobody reads is dead state, and "which tier restored this" is the honest question. `restored.seeded` has exactly one read site (`:1786`, inside `reapplyExactLayoutOnResize`), which becomes `restored.restoreTier === "seed"` — same meaning, no behaviour change.

- [ ] **Step 1: Write the failing tests**

`dockBlob.test.ts` (pure, no DOM):

```ts
it("withoutFloatingGroups drops the floatingGroups key and leaves the grid untouched", () => {
  const blob = { grid: { root: { type: "leaf", data: { views: ["a"] } } }, panels: {}, floatingGroups: [{ data: {} }] };

  const scrubbed = withoutFloatingGroups(blob) as Record<string, unknown>;

  expect(scrubbed.floatingGroups).toBeUndefined();
  expect(scrubbed.grid).toEqual(blob.grid);
});
```

`createDockEngine.test.ts`:

```ts
it("restores a saved float on reload (tier: blob)", () => {
  const container = sizedContainer(1440, 900);
  let saved = "";
  const first = createDockEngine({ ...base(), container, onLayoutChange: (blob) => { saved = blob; } });
  first.floatPanel("fx-analytics");
  container.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); // #737: dispose flushes only an arranged dock
  first.dispose();

  const second = createDockEngine({ ...base(), container, blob: saved });

  expect(lastDockviewApi().getPanel("fx-analytics").group.api.location.type).toBe("floating");
  second.dispose();
});

it("drops only the floats when a float node is unrestorable (tier: blob-without-floats)", () => {
  const container = sizedContainer(1440, 900);
  const healthy = JSON.parse(blobWithAFloat(container)) as Record<string, unknown>;
  const broken = JSON.stringify({ ...healthy, floatingGroups: [{ data: { nope: true } }] });

  const engine = createDockEngine({ ...base(), container, blob: broken });

  const api = lastDockviewApi();
  for (const panelId of seedPanelIdsOf(FX_LIKE)) {
    expect(api.getPanel(panelId)?.group.api.location.type).toBe("grid");
  }
  expect(engine.groupCount()).toBe(4);
  engine.dispose();
});
```

`blobWithAFloat(container)` is a small local helper in the test file: it builds an
engine, floats `fx-analytics`, captures the saved blob, and disposes — the first
test's body, extracted. Write the first test, then extract it; do not write the
helper speculatively.

The tier must be asserted through a **real consumer**, not a private read: expose it the way the existing test file already inspects restore behaviour (assert the resulting layout AND, for the tier itself, a unit test on a small exported helper if `loadBlobOrSeed` is not directly reachable). If neither is reachable without widening the public surface, say so in the report and assert the observable layout only — do not invent an export nobody uses.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/layout-dockview test -- -t "floatingGroups"`
Expected: FAIL — `withoutFloatingGroups` is not exported.

- [ ] **Step 3: Implement the scrub**

In `dockBlob.ts`, beside `withoutPopoutGroups`. Unlike the popout scrub, this one does **not** re-parent panels onto a hidden leaf: it is a load-time retry, so the panels it drops are re-seeded by the tier below it. Update `withoutDynamicNodes`' doc comment (`:246-252`), which currently names `floatingGroups` as an unreachable, unscrubbed key — that limit is now partly closed, and a stale comment is worse than none.

`withoutFloatingGroups` is **not** called from `serializeLayout` (`createDockEngine.ts:342-358`). Add a one-line comment there stating that floats persist deliberately, so the asymmetry with `withoutPopoutGroups` reads as a decision rather than an omission.

- [ ] **Step 4: Insert the retry tier and rename the flag**

New tier order in `loadBlobOrSeed`: `"blob"` → `"blob-without-floats"` → `"blob-without-dynamic"` → `"seed"`. Floats are stripped before dynamic nodes because a float is the cheaper thing to lose. Each tier returns its own `RestoredLayout` with its `restoreTier` set.

- [ ] **Step 5: Run the suites**

Run: `pnpm --filter @rtc/layout-dockview test && pnpm --filter @rtc/layout-dockview typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/layout-dockview/src
git commit -m "feat(layout-dockview): floats persist, and a damaged float costs only the floats"
```

---

### Task 5: Floating-group chrome in `dockview-hud.css`

**Files:**
- Modify: `packages/layout-dockview/src/styles/dockview-hud.css`
- Modify: `packages/layout-dockview/src/dockviewHud.test.ts`

**Interfaces:**
- Consumes: the group-card rules at `:141` (`.dv-groupview`) and the head bar at `:152` (`.dv-tabs-and-actions-container`).
- Produces: floating-group selectors matching the in-house card look.

- [ ] **Step 1: Find the real selectors**

Run: `grep -o '\.dv-[a-z-]*float[a-z-]*' node_modules/.pnpm/dockview-core@8.3.1/node_modules/dockview-core/dist/styles/dockview.css | sort -u`
Record the exact class names in the commit message. Do not guess `.dv-floating-group`.

- [ ] **Step 2: Write the failing text-level assertion**

`dockviewHud.test.ts` asserts on the sheet's text (jsdom cannot evaluate these custom properties). Mirror the existing `it("paints the group card with background: var(--panel …) (shorthand)")`:

```ts
it("paints a floating group's card with the panel surface and a lifted shadow", () => {
  expect(sheet).toContain("<the floating selector from Step 1>");
  expect(sheet).toMatch(/background: var\(--panel[,)]/);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @rtc/layout-dockview test -- dockviewHud.test.ts`
Expected: FAIL — the selector is absent.

- [ ] **Step 4: Add the rules**

Card, 38px head, radius and a lifted `box-shadow` (a float sits above the grid, so its shadow is stronger than `.dv-groupview`'s), plus the resize-edge affordance. Use `background:` (shorthand) — **never** `background-color:` with a gradient token; that bug shipped once and is what `dockviewHud.test.ts` exists to guard. Keep the `--dv-*` custom properties as the source of colour so all skins follow; the comment at `:24` claiming this sheet does not restyle floating chrome must be updated.

- [ ] **Step 5: Run**

Run: `pnpm --filter @rtc/layout-dockview test && pnpm lint:css`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/layout-dockview/src
git commit -m "style(layout-dockview): floating groups wear the in-house panel chrome"
```

---

### Task 6: React bridge + head control

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/engine/PanelHeadControls.tsx` (props `:87-110`, pop-out button `:29-42`)
- Modify: `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` (`popped` state `:131`, `onPopoutsChange` wiring `:343` and `:543`, `popoutPanel` `:738-744`, witness block `:769-778`, head call site `:806-824`)
- Create: `packages/client-react/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.floating.test.tsx`

**Interfaces:**
- Consumes: `DockEngine.floatPanel`/`dockPanel`, `DockEngineOptions.onFloatsChange` (Task 2).
- Produces: `PanelHeadControlsProps.onFloat?: () => void` and `floatingHere?: boolean`; the `data-floating` witness. Task 7 mirrors these names exactly; Task 8's shared page object reads `data-floating`.

- [ ] **Step 1: Write the failing bridge spec**

`DockviewLayoutEngine.floating.test.tsx` — no `stubPopoutWindow()`, no window plumbing (floating needs neither):

```tsx
it("floats a panel from its head control and records it in the witness", async () => {
  render(<Host />);

  await userEvent.click(screen.getByTestId("panel-fx-analytics-float"));

  expect(screen.getByTestId("layout-engine")).toHaveAttribute("data-floating", "fx-analytics");
});

it("hides collapse and maximize while a panel is floating", async () => { /* … */ });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rtc/client-react test -- DockviewLayoutEngine.floating`
Expected: FAIL — no `panel-fx-analytics-float` element.

- [ ] **Step 3: Add the slot to `PanelHeadControls`**

Beside `onPopout`, same optional-slot idiom, `data-testid={`panel-${panelId}-float`}`, and hide `onCollapse`/`onMaximize`/`onRestore` rendering when `floatingHere === true`. The button's accessible label reads "Float" when docked and "Dock" when floating.

- [ ] **Step 4: Wire the bridge**

`const [floating, setFloating] = useState<readonly PanelId[]>([]);` beside `popped` (`:131`); `onFloatsChange: setFloating` at **both** construction sites (`:343` and `:543` — missing the second is how a reconstruction path silently stops updating); `data-floating={floating.join(" ")}` in the witness block; `floatingHere={floating.includes(panelId)}` and `onFloat={...}` at the head call site. The handler is named for its effect:

```tsx
  function floatOrDockPanel(panelId: PanelId): void {
    if (floating.includes(panelId)) {
      engineRef.current?.dockPanel(panelId);
      return;
    }
    engineRef.current?.floatPanel(panelId);
  }
```

- [ ] **Step 5: Run**

Run: `pnpm --filter @rtc/client-react test -- DockviewLayoutEngine && pnpm --filter @rtc/client-react typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src
git commit -m "feat(client-react): a float control in the dockview panel head"
```

---

### Task 7: Solid bridge + head control (parity)

**Files:**
- Modify: `packages/client-solid/src/ui/shell/layout/engine/PanelHeadControls.tsx` (props `:104-127`, pop-out render `:46-59`, named handlers `:28-42`)
- Modify: `packages/client-solid/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` (`popoutPanel` `:141-145`, witness `:543-544`, head call site `:596-617`)
- Create: `packages/client-solid/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.floating.test.tsx`

**Interfaces:**
- Consumes: the exact prop names Task 6 produced (`onFloat`, `floatingHere`) and the `data-floating` attribute.
- Produces: the Solid twin. Any name divergence from Task 6 breaks Task 8's shared spec.

- [ ] **Step 1: Write the failing spec** — the same two assertions as Task 6, in the Solid harness.
- [ ] **Step 2: Run to verify it fails.** Run: `pnpm --filter @rtc/client-solid test -- DockviewLayoutEngine.floating` → FAIL.
- [ ] **Step 3: Implement**, following this file's existing conventions: a named handler wrapper per control (`floatOrDockPanel`, beside `popoutPanel`), `<Show when={props.onFloat !== undefined}>`, and a plain reactive read (`floating().includes(p.panelId)`) with **no** `createMemo` — the per-slot memo idiom at `:558-567` is for registry-shaped lookups only, and adding one for a scalar would be cargo-culted.
- [ ] **Step 4: Run.** `pnpm --filter @rtc/client-solid test -- DockviewLayoutEngine && pnpm --filter @rtc/client-solid typecheck` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(client-solid): a float control in the dockview panel head"`.

---

### Task 8: Shared contract coverage (both clients, one spec)

**Files:**
- Modify: `packages/ui-contract/src/shared/pages/shell/layout/DockviewEnginePage.ts`
- Modify: `packages/ui-contract/src/specs/shell/layout/DockviewEngine.contract.spec.ts`

**Interfaces:**
- Consumes: the `data-floating` witness and `panel-<id>-float` test id from Tasks 6-7; the existing `DockviewEngine` component registration (`packages/ui-contract/src/shared/components.ts:510-515`).
- Produces: page-object methods `floatPanel(panelId)`, `dockPanel(panelId)`, `floatingPanelIds()`.

- [ ] **Step 1: Write the failing contract spec** — float via the head control, assert `floatingPanelIds()`, dock back, assert empty, and assert collapse/maximize are absent while floating. The spec must not import client `src/` (page objects only).
- [ ] **Step 2: Run both clients to verify it fails.** `pnpm --filter @rtc/client-react test:ui:contract -- DockviewEngine` and the Solid twin → FAIL.
- [ ] **Step 3: Implement the page-object methods** against the witness attribute, following the file's existing driver style.
- [ ] **Step 4: Run both clients' contract tiers with coverage.** `pnpm --filter @rtc/client-react test:ui:contract:coverage && pnpm --filter @rtc/client-solid test:ui:contract:coverage` → PASS, gates ≥95% held. Also run `pnpm coverage:gaps` and report any file the new code left weak.
- [ ] **Step 5: Commit** — `git commit -m "test(ui-contract): floating groups in the shared dockview engine contract"`.

---

### Task 9: e2e — float, reload, dock home

**Files:**
- Modify: `tests/browser/page-objects/playwright/Layout.ts` (add `waitDockFloating`, mirroring `waitDockPopped`)
- Modify: `tests/browser/scenarios/layout.ts` (new scenario beside `popoutBlotterShowsLiveContentAndDocksHomeOnClose` `:173-188`)
- Modify: `tests/browser/playwright/layout.spec.ts` (new test beside the pop-out test `:72-86`)

**Interfaces:**
- Consumes: `ctx.po.layout` (`openPreferencesAndSelectLayoutEngine`, `expectDockGroups`, `waitDockGroupCount`), `TESTIDS.layout.*`.
- Produces: three `ctx.po.layout` methods — `floatPanel(panelId)` and `dockPanel(panelId)` (both click the `panel-<id>-float` control; the second asserts it was floating first, so a mis-click cannot pass as a dock) and `waitDockFloating(panelIds, timeoutMs)` (polls the `data-floating` witness, mirroring `waitDockPopped`).

- [ ] **Step 1: Write the scenario** — substantially shorter than the pop-out one: no child window, no `closeFromInside()`.

```ts
export async function floatingBlotterSurvivesReloadAndDocksHome(ctx: ScenarioCtx): Promise<void> {
  await ctx.po.layout.floatPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating([BLOTTER_PANEL_ID]);
  await ctx.page.reload();
  await ctx.po.layout.waitDockFloating([BLOTTER_PANEL_ID]);
  await ctx.po.layout.dockPanel(BLOTTER_PANEL_ID);
  await ctx.po.layout.waitDockFloating([]);
  await ctx.po.layout.waitDockGroupCount(4);
}
```

- [ ] **Step 2: Wire the test.** Unless the pre-flight recorded that the default engine has flipped, the test must first call `openPreferencesAndSelectLayoutEngine(ctx, "dockview")` — dockview-only features are unreachable otherwise.
- [ ] **Step 3: Run it for real, unpiped.** Run: `pnpm test:e2e` (or the layout suite directly). **Never** pipe a Playwright run through `tail`/`grep`/`head` when judging it — the failed-count line sits above the passed line and a pipe launders the exit code; 223 failures once read as green. Expected: PASS.
- [ ] **Step 4: Commit** — `git commit -m "test(e2e): a floated panel survives reload and docks home"`.

---

### Task 10: Regenerate both golden sets

The new head control repaints all 13 `-dockview` scenarios. No new scenario is added — a user-shaped float stays out of the matrix by the parent spec's rule.

**Files:**
- Modify: `packages/ui-contract/goldens/playwright/__screenshots__/react/**` and `…/react-local/darwin-arm64/**`

- [ ] **Step 1: Read the tolerance rules first.** Read `.claude/commands/rtc/visual-tolerance-audit.md`'s measurement-trap section. The loosest `maxDiffPixelRatio` across react and solid is the real gate, and a small new control is exactly what a loose ratio hides.
- [ ] **Step 2: Regenerate the local set.** Follow `docs`/skill recipe for `react-local/darwin-arm64`, from this worktree, installing and building first (a worktree-run visual tier needs that).
- [ ] **Step 3: Regenerate the CI set** by dispatching `update-visual-goldens.yml` on this branch, with `scenario_pattern` matching the full test title (the pattern is unanchored and uses the `__` separator; `-g` over the full title, no `^`). The workflow auto-commits with `[skip ci]`, so a non-empty commit is needed afterwards to trigger CI.
- [ ] **Step 4: Verify the diff is only the new control.** For at least three scenarios, confirm the changed region is the panel head. A diff anywhere else is a real regression, not churn — stop and report it.
- [ ] **Step 5: Run engine parity.** `pnpm visual:engine-parity` — report the table; the shared subset must not move.
- [ ] **Step 6: Commit** — `git commit -m "test(ui-contract): re-pin dockview goldens for the float head control"`.

---

### Task 11: Docs

**Files:**
- Modify: `packages/layout-dockview/README.md` (a floating-groups paragraph beside the pop-out one)
- Modify: `docs/adr/ADR-002-layout-management-port.md` (capability list + the disparity note)
- Modify: `docs/STATUS.md` (Phase 6a shipped; 6b is what remains — bump `**Last updated:**`)

- [ ] **Step 1: Write the README paragraph** — what floats are, that shift-drag also creates one, that they persist, the restore tiers, and the §3.2 rules in one table.
- [ ] **Step 2: Update ADR-002** — floating groups are now used, not merely available; the parity gate's scope is unchanged.
- [ ] **Step 3: Update STATUS.md** and run `pnpm check:doc-links`.
- [ ] **Step 4: Commit** — `git commit -m "docs: floating groups shipped (Phase 6a)"`.

---

## Verification before the PR

- [ ] `/rtc:gauntlet full` — every gate, from this worktree.
- [ ] `pnpm test:e2e` — unpiped.
- [ ] The **in-house** engine's visual assert run locally (the #664 lesson: a measurement, not a judgement).
- [ ] Real-app pass driven by the controller: float from the head, shift-drag float, dock back, reload with a float open, float a chart instance and confirm the remaining charts share width correctly, maximize with a float open, and the in-house engine showing the panel docked.
- [ ] **User acceptance** on the real app before merge. The parent spec makes this the gate that caught Phase 4's bugs; a green suite is not a substitute.
