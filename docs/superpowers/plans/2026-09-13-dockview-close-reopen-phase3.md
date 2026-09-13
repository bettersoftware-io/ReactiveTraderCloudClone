# Dockview-Native Features Phase 3 — Panel Close/Reopen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panels can be closed and reopened from a View menu in the app head; the closed set is layer-2 semantic state both engines honour — the first feature that GROWS the shared engine subset.

**Architecture:** `LayoutState` gains a `closed: readonly PanelId[]` field folded by two new `LayoutMachine` intents (`close`/`reopen`) and persisted additively in `WorkspaceLayoutV1` (no version bump — the parser tolerates the new field both ways). The seed `root` is NEVER mutated by close: engines project visibility — in-house renders a pruned tree via a pure `visibleRootOf` helper; the Dockview bridge diffs the `closed` prop into new engine methods `closePanel`/`reopenPanel`, where reopen re-adds at a deterministic seed-neighbour position. The View menu follows the existing HeaderChrome dropdown idiom, wired (not decorative) to `useLayout(activeTab)`.

**Tech Stack:** rxjs scan-fold machine (client-core), dockview@7.0.4, React 19 + Solid, playwright visual tier, vitest/jsdom.

**Spec:** [../specs/2026-09-10-dockview-native-features-design.md](../specs/2026-09-10-dockview-native-features-design.md) (§3 Phase 3, §4 projection table)

## Global Constraints

- Both web clients move together: every UI/bridge change lands in `client-react` AND `client-solid` in the same task, with the shared contract spec as the witness.
- `LayoutState.root` is never mutated by close/reopen — the seed identity is what makes reopen-at-home and cross-engine projection work.
- Persistence stays **v1**: `closed` is additive. An old payload (no `closed`) parses to `closed: []`; a new payload read by the OLD parser is unaffected (verified: `validateLayoutState` constructs `{root, maximized, collapsed}` from known fields only). Ghost ids in `closed` are FILTERED like `collapsed`'s, never a whole-payload reject.
- Closable policy: a static panel is closable iff closing it leaves ≥1 visible static leaf in its tab. Admin (sole `admin-dashboard`) therefore has zero closable panels; the reducer enforces the floor, the menu greys the row.
- Docked (Jarvis) panels are NOT closable via this feature — they already have dismiss/undock controls and live outside the static seed. `close`/`reopen` no-op for ids not in the tab's static leaf set.
- In-house engine must not regress; no golden moves outside the new scenarios (final task proves it by full-matrix assert on both clients).
- **Sibling-round collision defenses** (GenUI × Dockview round, spec 2026-09-12): (a) `createDockEngine.ts` — before implementing Task 5, check whether `addDynamicPanel`/`removeDynamicPanel` has landed on main; if yes, extract/reuse its group-insertion primitive for `reopenPanel` instead of duplicating; if no, keep `reopenPanel`'s insertion self-contained and do NOT pre-build their right-edge API. (b) Bridge props: they add `docked`, we add `closed` — adjacent lines in the same Props interfaces; expect a trivial textual catch-up. (c) `workspaceLayoutPersistence.ts`: their round does not change the schema; ours is additive — no semantic collision, but merge the validator carefully if both touch it.
- New/changed CSS: dropdown chrome only, reusing `HeaderChrome.module.css` classes — no new animation (performance doctrine untouched).
- Visual-host stubs must never mount running animations (#710 lesson) — the View-menu scenario renders the menu OPEN statically via AppData, no click.

---

### Task 1: `closed` in the machine — `close`/`reopen` intents with the visibility floor

**Files:**
- Modify: `packages/client-core/src/layout/layoutPort.ts` (LayoutState)
- Modify: `packages/client-core/src/presenters/LayoutMachine.ts`
- Modify: `packages/client-core/src/layout/defaultLayoutPort.ts` (initial states gain `closed: []`)
- Test: `packages/client-core/src/presenters/__tests__/LayoutMachine.test.ts` (extend the existing suite)

**Interfaces:**
- Consumes: `LayoutState { root, maximized, collapsed }`, `LayoutIntents` (verified: `maximize/restore/collapse/expand/resize/insertPanel/removePanel/reset`), `dockedLeafIds(root, staticIds): PanelId[]` (from `#/layout/dockColumn`), reducer factory `makeReduce(port, staticIds)`.
- Produces: `LayoutState.closed: readonly PanelId[]`; `LayoutIntents.close(id: PanelId): void` and `LayoutIntents.reopen(id: PanelId): void`; events `{ type: "close"; id: PanelId }` / `{ type: "reopen"; id: PanelId }`. Every later task relies on exactly these names.

- [ ] **Step 1: Write the failing tests** (in the existing LayoutMachine describe, reusing its port fixtures):

```ts
it("close adds the id to closed, drops its collapsed entry and clears maximized", () => {
  const machine = createLayoutMachine(port);
  machine.intents.collapse("fx-analytics");
  machine.intents.maximize("fx-analytics");
  machine.intents.close("fx-analytics");
  const s = machine.state$.getValue();
  expect(s.closed).toEqual(["fx-analytics"]);
  expect(s.collapsed).not.toContain("fx-analytics");
  expect(s.maximized).toBeNull();
  machine.dispose();
});

it("reopen removes the id; close is idempotent; unknown ids no-op", () => {
  const machine = createLayoutMachine(port);
  machine.intents.close("fx-analytics");
  machine.intents.close("fx-analytics");
  machine.intents.close("not-a-panel");
  expect(machine.state$.getValue().closed).toEqual(["fx-analytics"]);
  machine.intents.reopen("fx-analytics");
  expect(machine.state$.getValue().closed).toEqual([]);
  machine.dispose();
});

it("close refuses to hide the last visible static leaf", () => {
  const machine = createLayoutMachine(port); // FX: 4 static leaves
  machine.intents.close("fx-rates");
  machine.intents.close("fx-blotter");
  machine.intents.close("fx-analytics");
  // Only fx-positions left visible — this close must no-op.
  machine.intents.close("fx-positions");
  expect(machine.state$.getValue().closed).toHaveLength(3);
  machine.dispose();
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @rtc/client-core test -- LayoutMachine` → FAIL (`close` is not a function).

- [ ] **Step 3: Implement.** `layoutPort.ts`: add to `LayoutState`:

```ts
  /** Panels hidden from the workspace (View-menu close). The tree in `root`
   * keeps its leaves — engines PROJECT visibility (in-house prunes at
   * render, Dockview removes/re-adds live) — so reopen restores the seed
   * position without any tree surgery here. */
  readonly closed: readonly PanelId[];
```

`defaultLayoutPort.ts`: every `initial` gains `closed: []` (compiler drives the sites). `LayoutMachine.ts`: two subjects/events/intents mirroring `collapse`/`expand` verbatim, and in `makeReduce`:

```ts
      case "close": {
        if (
          !staticIds.includes(event.id) ||
          layoutState.closed.includes(event.id)
        ) {
          return layoutState;
        }
        const visibleAfter = staticIds.filter((id) => {
          return id !== event.id && !layoutState.closed.includes(id);
        });
        if (visibleAfter.length === 0) {
          return layoutState;
        }
        return {
          ...layoutState,
          closed: [...layoutState.closed, event.id],
          collapsed: layoutState.collapsed.filter((id) => {
            return id !== event.id;
          }),
          maximized:
            layoutState.maximized === event.id ? null : layoutState.maximized,
        };
      }
      case "reopen":
        return {
          ...layoutState,
          closed: layoutState.closed.filter((id) => {
            return id !== event.id;
          }),
        };
```

(Note: `staticIds` is already in `makeReduce`'s closure — verified. `removePanel`'s case additionally gains `closed: layoutState.closed.filter(...)` so an undocked Jarvis id can never linger in `closed`.)

- [ ] **Step 4: Run tests** → PASS; run the whole client-core suite (`pnpm --filter @rtc/client-core test`) — the `closed: []` addition will break `LayoutState` literals in existing tests; fix each by adding the field, never by loosening types.

- [ ] **Step 5: Commit** — `feat(client-core): LayoutState.closed + close/reopen intents with the last-visible floor`

### Task 2: Persistence — additive `closed`, ghost-filtered, legacy-tolerant

**Files:**
- Modify: `packages/client-core/src/layout/workspaceLayoutPersistence.ts` (`validateLayoutState`)
- Modify: `packages/client-core/src/layout/workspacePersistenceWriter.ts` (snapshot carries `closed`; its undock-scrub also filters it)
- Test: `packages/client-core/src/layout/__tests__/workspaceLayoutPersistence.test.ts`

**Interfaces:**
- Consumes: `validateLayoutState(value): LayoutState | null` (verified: builds `{root, maximized, collapsed}`, filters dangling collapsed ids via `leafIds`), the writer's scrub locals `maximized`/`collapsed` (verified lines ~110-125).
- Produces: parsed `LayoutState.closed` (absent → `[]`); serialized payloads carry `closed`.

- [ ] **Step 1: Failing tests:**

```ts
it("round-trips closed and defaults it to [] for legacy payloads", () => {
  const withClosed = serializeWorkspaceLayout(payloadWith({ closed: ["fx-analytics"] }));
  expect(parseWorkspaceLayout(withClosed)?.tabs.fx?.layout.closed).toEqual(["fx-analytics"]);

  const legacy = legacyPayloadWithoutClosedField(); // JSON built by hand, no `closed` key
  expect(parseWorkspaceLayout(legacy)?.tabs.fx?.layout.closed).toEqual([]);
});

it("filters ghost closed ids instead of rejecting the payload", () => {
  const ghost = serializeWorkspaceLayout(payloadWith({ closed: ["gone-panel"] }));
  expect(parseWorkspaceLayout(ghost)?.tabs.fx?.layout.closed).toEqual([]);
});
```

(Build `payloadWith`/`legacyPayloadWithoutClosedField` on the suite's existing fixture helpers — adapt to the file's actual fixture names.)

- [ ] **Step 2: Run → FAIL** (parser drops the field / TS error on the literal).

- [ ] **Step 3: Implement.** In `validateLayoutState`, after the `collapsed` block, the same pattern verbatim (absent tolerated):

```ts
  const closedRaw = value.closed ?? [];

  if (!Array.isArray(closedRaw)) {
    return null;
  }

  const closed: string[] = [];

  for (const entry of closedRaw) {
    if (typeof entry !== "string") {
      return null;
    }

    // Same rule as `collapsed` above: a dangling id matches no panel and is
    // harmless — filtered, not a whole-payload reject.
    if (leafIds.has(entry)) {
      closed.push(entry);
    }
  }

  return { root, maximized, collapsed, closed };
```

In the writer's undock-scrub, filter `closed` exactly as `collapsed` is filtered.

- [ ] **Step 4: Run → PASS**; whole client-core suite green.
- [ ] **Step 5: Commit** — `feat(client-core): persist LayoutState.closed additively (v1, ghost-filtered, legacy-tolerant)`

### Task 3: `visibleRootOf` — the pure projection both engines share

**Files:**
- Create: `packages/client-core/src/layout/visibleRoot.ts`
- Modify: `packages/client-core/src/layout/index.ts` (export)
- Test: `packages/client-core/src/layout/__tests__/visibleRoot.test.ts`

**Interfaces:**
- Consumes: `LayoutNode` (split: `children/sizes/fixedPx?/initialPx?`; panel: `panelId`).
- Produces: `visibleRootOf(root: LayoutNode, closed: readonly PanelId[]): LayoutNode` — prunes closed leaves, collapses single-child splits, renormalises `sizes` (and slices `fixedPx`/`initialPx` in step), returns `root` REFERENTIALLY UNCHANGED when `closed` is empty or matches nothing (render-path memo friendliness). Never returns an empty tree — callers guarantee ≥1 visible leaf (the Task 1 reducer floor).

- [ ] **Step 1: Failing tests** — prune middle child of a 3-split renormalises sizes to sum 1 and drops the matching `fixedPx`/`initialPx` slots; prune one child of a 2-split hoists the survivor (single-child collapse); nested prune collapses transitively; `closed: []` returns the same reference; admin sole panel with bogus closed id returns same reference.

```ts
it("prunes a closed leaf, renormalises sizes and slices px arrays", () => {
  const pruned = visibleRootOf(FX_LIKE_ROOT, ["fx-analytics"]);
  // rail column had [analytics, positions] — survivor hoists into the rail slot
  expect(leafIdsOf(pruned)).toEqual(["fx-rates", "fx-blotter", "fx-positions"]);
  expect(sumSizesOf(pruned)).toBeCloseTo(1, 6);
});
```

- [ ] **Step 2: Run → FAIL** (module missing).
- [ ] **Step 3: Implement** — a recursive walk: panel → `closed.includes(panelId) ? null : node`; split → prune children, drop nulls, `null` if none survive, hoist if one survives, else rebuild with renormalised `sizes = kept.map(s => s / keptSum)` and `fixedPx`/`initialPx` filtered by the same kept-index mask (preserve the field-absent case: only spread the key when the original had it — mirror `validateLayoutNode`'s construction). Return the original node when nothing changed (compare kept length).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(client-core): visibleRootOf — pure closed-leaf projection for both engines`

### Task 4: In-house engine honours `closed` (both clients)

**Files:**
- Modify: `packages/client-react/src/ui/App.tsx` (WorkspaceEngine: pass the projected state to the in-house branch)
- Modify: `packages/client-solid/src/ui/App.tsx` (mirror — verified it has the identical `maximized={state.maximized}` wiring shape)
- Test: `packages/ui-contract/src/specs/...` — extend the existing layout/workspace contract spec file (find the spec asserting collapse rendering; add the closed case beside it)

**Interfaces:**
- Consumes: `useLayout(tab)` → `{ state, ... , close, reopen }` (intents surface through the existing ViewModel passthrough — verified `useLayout` hands the machine's intents through both bindings), `visibleRootOf` (Task 3).
- Produces: in-house branch renders `state` with `root: visibleRootOf(state.root, state.closed)`; testid absence of the closed panel (`data-testid` panels — the contract asserts the panel's body testid is gone and siblings absorbed).

- [ ] **Step 1: Failing contract spec** (shared, runs against both clients via the swap-trio):

```ts
it("renders the workspace without a closed panel and restores it on reopen", async () => {
  const { view, layout } = await mountWorkspace({ tab: "fx" });
  layout.close("fx-analytics");
  await view.expectPanelAbsent("fx-analytics");
  layout.reopen("fx-analytics");
  await view.expectPanelPresent("fx-analytics");
});
```

(Adapt to the harness's actual mount/expect helper names in the neighbouring collapse spec — copy its idiom.)

- [ ] **Step 2: Run react contract → FAIL** (panel still rendered).
- [ ] **Step 3: Implement** — in each client's `WorkspaceEngine`, compute `const visibleState = { ...state, root: visibleRootOf(state.root, state.closed) };` and pass `state={visibleState}` to `InhouseLayoutEngine` only (the Dockview branch keeps raw `state` fields; its projection is Task 6). Solid mirror identically.
- [ ] **Step 4: Run contract on BOTH clients → PASS** (`pnpm --filter @rtc/client-react test:ui:contract`, same for solid).
- [ ] **Step 5: Commit** — `feat(clients): in-house engine renders the visible projection of the layout tree`

### Task 5: Dockview engine — `closePanel` / `reopenPanel` at the seed neighbour

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts`
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: the engine's existing surfaces — `opts.panels` (seed specs), the seed tree via `opts.seed` (`convertSeed`), `api.removePanel/addPanel`, `groupOf`, the strip records/pins machinery, `GROUP_GAP_PX` (model = card + 7).
- Produces: `DockEngine.closePanel(panelId: string): void` (removes the panel live; strips/pins/worlds entries for it are released first — reuse the release path `removePanel`-adjacent code already exercises for drag-out membership changes) and `DockEngine.reopenPanel(panelId: string): void` (re-adds per the deterministic rule below). Both no-op on unknown ids and on already-closed/already-open respectively.

**The reopen-position rule (deterministic, testable):** walk the SEED tree to the closed panel's position; take its seed siblings in order of proximity (same split first, then outward); the first sibling whose panel still has a live group is the anchor — `addPanel` relative to that group, direction derived from the seed split (`row` → `right` of a left-sibling anchor / `left` of a right-sibling; `column` → `below`/`above`), size = the seed entry's card px + `GROUP_GAP_PX` when the seed pinned one, else even share. No surviving seed sibling → right-edge fallback. **Sibling-round check (Global Constraints): if `addDynamicPanel` has landed on main by implementation time, reuse its insertion primitive for the add step.**

- [ ] **Step 1: Failing jsdom tests:**

```ts
it("closePanel removes the panel and reopenPanel restores it beside its seed sibling", async () => {
  const seen = trackLayout();
  const engine = createDockEngine({ ...base(), ...seen.options });
  engine.closePanel("fx-analytics");
  expect(api().getPanel("fx-analytics")).toBeUndefined();
  engine.reopenPanel("fx-analytics");
  const restored = api().getPanel("fx-analytics");
  expect(restored).toBeDefined();
  // Anchored to fx-positions (its seed rail sibling), sharing the rail column.
  expect(columnOf("fx-analytics")).toBe(columnOf("fx-positions"));
  engine.dispose();
});

it("closing a collapsed panel releases its strip; closing a maximized one exits maximize", ...);
it("reopen falls back to the right edge when every seed sibling is gone", ...);
it("the blob round-trips a closed-panel layout (panel absent) and reopen after reload still anchors correctly", ...);
```

(Fixture helpers `base()`, `trackLayout()`, `api()` exist — `lastDockviewApi()` from the Phase 1 mock passthrough; `columnOf` = a small helper over group elements' shared `.dv-vertical` ancestor.)

- [ ] **Step 2: Run → FAIL** (`closePanel` is not a function).
- [ ] **Step 3: Implement** per the rule above. Closing must first: expand its strip (via the existing release path — never leave a StripRecord/world/flip entry for a removed panel; the Phase-1 membership-keyed ledgers make the scrub a key delete), clear a pin containing it (the Task-3-of-Phase-1 `pinStillShaped` validation will drop it on the layout-change event anyway — assert that in the test rather than duplicating the release).
- [ ] **Step 4: Run the full package suite → PASS** (all Phase 1/2 tests stay green).
- [ ] **Step 5: Commit** — `feat(layout-dockview): closePanel/reopenPanel — seed-neighbour reopen with right-edge fallback`

### Task 6: Dockview bridges replay `closed` (both clients)

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx`
- Modify: `packages/client-solid/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx`
- Test: `packages/client-react/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.test.tsx` (the StrictMode/replay suite — extend)

**Interfaces:**
- Consumes: the bridges' existing `collapsed` diff/replay effect (the #649 `engineVersion` pattern), Task 5's `closePanel`/`reopenPanel`.
- Produces: `DockviewLayoutEngineProps.closed: readonly PanelId[]`; a diff effect closing/reopening on change; the StrictMode rebuild replays the closed set after blob restore (close panels the set names that the blob still contains — the blob may already lack them, which is the no-op case).

- [ ] **Step 1: Failing test** — mount with `closed={["fx-analytics"]}`: engine has no such panel; flip the prop to `[]`: panel reopens (spy on the engine methods via the existing engine-mock idiom in that suite).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — mirror the collapsed replay effect verbatim (prev-set ref diff → `closePanel` for additions, `reopenPanel` for removals; initial mount closes everything in the prop). App.tsx (both clients) passes `closed={state.closed}` to the Dockview branch.
- [ ] **Step 4: Run → PASS** both clients' relevant suites.
- [ ] **Step 5: Commit** — `feat(clients): dockview bridge replays the closed set (close/reopen live + post-restore)`

### Task 7: The View menu (both clients) + contract

**Files:**
- Create: `packages/client-react/src/ui/shell/chrome/ViewMenu.tsx` (+ styles additions in `HeaderChrome.module.css` ONLY if an existing class doesn't fit — prefer reuse)
- Modify: `packages/client-react/src/ui/shell/chrome/HeaderChrome.tsx` (render beside NotificationsMenu)
- Create/Modify: solid mirrors of both
- Test: shared contract spec (extend the Task 4 file) + testids in the e2e contracts file if the page objects need them later (not this round)

**Interfaces:**
- Consumes: `useViewModel().useLayout(activeTab)` → `{ state, close, reopen }`; `PANEL_SPECS` titles; the dropdown idiom verified in `NotificationsMenu.tsx` (`styles.menuAnchor`, `styles.iconButton`, `aria-expanded`, `styles.dropdown`, `role="menu"`, testid pattern `x-toggle`/`x-panel`).
- Produces: `data-testid="view-menu-toggle"` / `"view-menu-panel"`; one `role="menuitemcheckbox"` row per static panel of the active tab, `aria-checked` = visible, click toggles close/reopen; the row for the last visible panel gets `disabled` + `aria-disabled`.

- [ ] **Step 1: Failing contract spec** — open the menu, uncheck Analytics → panel absent; recheck → present; with all but one closed, the last row is disabled.
- [ ] **Step 2: Run → FAIL** (toggle testid missing).
- [ ] **Step 3: Implement** react then solid, copying the NotificationsMenu structure; handler names by effect (`hideFxAnalyticsPanel`-style naming is wrong — the handler is generic: `togglePanelVisibility(panelId)` names its effect).
- [ ] **Step 4: Contract on BOTH clients → PASS.**
- [ ] **Step 5: Commit** — `feat(clients): View menu — close/reopen static panels from the app head`

### Task 8: Visual scenarios — the shared subset grows

**Files:**
- Modify: `packages/ui-contract/src/visual/appData.ts` (`layoutClosed?: readonly PanelId[]` beside `layoutCollapsed`, verified lines 114-117)
- Modify: `packages/ui-contract/src/visual/scenarios.ts` (+fixtures/scenarioActions per the 5-edit recipe)
- Modify: both hosts' `buildFakeViewModel.ts` (`closed: data.layoutClosed ?? base.closed` beside the verified `collapsed` layering at ~line 700-708)
- Goldens: arm64 regen here; x86 via workflow dispatch (orchestrator)

**Scenarios (deliberate count):**
- `app/fx-closed` + `app/fx-closed-dockview` — TWINS (`layoutClosed: ["fx-analytics"]`): the shared subset grows; the engine-parity report gains a row.
- `shell/view-menu-open` — ONE scenario, no twin: the menu renders in the app head, engine-independent by construction (same DOM either engine; justify in the scenario comment — the second single-engine-adjacent exception, different reason than Phase 2's).

- [ ] Steps: failing assert (scenario listed, golden missing) → host stubs → local arm64 regen `-g "fx-closed|view-menu-open"` (pattern recorded for the x86 dispatch — MUST be identical) → solid asserts the new goldens → commit `test(visual): fx-closed twins + view-menu-open — the shared subset grows`.

### Task 9: Docs

- `packages/layout-dockview/README.md`: "Close/reopen" section (the seed-neighbour rule + right-edge fallback, the no-strip-left-behind invariant).
- `docs/adr/ADR-002-layout-management-port.md`: one paragraph in the Dockview-native era section — first layer-2 lift shipped; projection table row now live.
- `docs/STATUS.md`: Phase 3 in the workstream entry, Last updated bumped; `pnpm check:doc-links`.
- Commit — `docs: close/reopen recorded (Phase 3)`.

### Task 10: Measurement + acceptance gate

- [ ] Full react visual assert: only the 3 new scenario families differ pre-regen; after regen 100% green; full solid assert 100% green (the in-house-untouched + single-tab-invariance proof).
- [ ] `pnpm --filter @rtc/client-core test`, both contract tiers, `pnpm --filter @rtc/layout-dockview test`, gauntlet fast 19.
- [ ] Produce the acceptance strip: View menu open (2-3 skins) + fx-closed in both engines (2 skins) → session scratchpad; **orchestrator sends to the user and HOLDS THE MERGE** (repo rule for new visible UI).

## Self-review

- **Spec coverage:** machine+persistence (Tasks 1-2), in-house projection (3-4), dockview close/reopen (5-6), View menu (7), twins growing the shared subset (8), docs (9), measurement+acceptance (10) — §3 Phase 3 complete; the §4 projection row ("tree without those leaves") is Task 3/4 exactly.
- **Placeholder scan:** Tasks 5's later `it(...)` stubs name their assertions in prose beside real first-test code — the implementer writes them from the named behaviours; "adapt to the file's actual fixture names" notes are deliberate (same rationale as Phase 1's plan). No TBDs.
- **Type consistency:** `close/reopen` (intents), `closePanel/reopenPanel` (engine), `closed` (state/prop/AppData `layoutClosed`) used consistently across Tasks 1→8; `visibleRootOf(root, closed)` signature identical in Tasks 3 and 4.
