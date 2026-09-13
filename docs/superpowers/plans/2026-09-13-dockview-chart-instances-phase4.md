# Dockview Chart Instances (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-instance equities chart panels under the Dockview engine — "open chart in new panel" per watchlist row, one instance per symbol (`eq-chart:<symbol>`), persisted as layer-2 membership, invisible in-house (disparity doctrine).

**Architecture:** Instances are the workstream's second layer-2 lift, shaped exactly like Phase 3's `closed`: a `LayoutState.instances` list owned by the layout machine, an additive `WorkspaceLayoutV1` field, and a reconciling dockview-bridge effect — but the engine half is **consumed, not built**: instances ride the GenUI×Dockview round's `addDynamicPanel`/`removeDynamicPanel` (spec §4), whose blob-owns-arrangement / layer-2-owns-membership reconciliation is precisely what instances need. Chart DATA is already symbol-parameterised (`useCandles(sym, tf)`, `useEquityQuote(sym)`, `useCandleBackfill(sym, tf)`); an instance is `ChartPanel` with the symbol PINNED — view settings (timeframe/chartType/indicators) stay shared via the `EqWorkspaceMachine` singleton, a recorded v1 simplification.

**Tech Stack:** client-core + core-api (machine/persistence), both web clients (registry channel, watchlist affordance), layout-dockview consumed via the sibling round's API.

**Spec:** [2026-09-10-dockview-native-features-design.md](../specs/2026-09-10-dockview-native-features-design.md) §3 Phase 4; scope fixed by the user 2026-09-13 (equities charts only; order tickets and FX tiles deferred).

## Global Constraints

- **PRECONDITION (Task 0):** the GenUI×Dockview round's engine primitive (`addDynamicPanel(panelId, spec)` / `removeDynamicPanel(panelId)`, [their spec §4](../specs/2026-09-12-genui-dockview-docking-and-default-flip-design.md)) is NOT on main at plan time (grep verified, 0 hits). **Implementation does not start until it merges.** Task 0 re-verifies the landed signatures; drift adapts this plan's call sites, never re-designs.
- Both clients move together (React + Solid, contract via swap-trio).
- `LayoutState.instances` is REQUIRED → the Phase 3 fan-out repeats. Known literal sites to update in the same task that changes the type: `packages/client-core/src/layout/defaultLayoutPort.ts` initials, `packages/client-react-native/tests/visual/fake/inert.ts` (`EMPTY_LAYOUT_STATE` + `LAYOUT_RESULT` noops), `packages/client-{react,solid}/src/ui/shell/layout/engine/__tests__/InhouseLayoutEngine.smoke.test.tsx` (7 literals each), `packages/client-{react,solid}/tests/ui/contract/{react,solid}/pinnedFixtureLayoutPort.ts`, both visual hosts' `buildFakeViewModel` layout stubs. Run FULL `pnpm typecheck` (repo root) before any push — package tscs are not enough (Phase 3 lesson).
- The watchlist affordance renders **only under the dockview engine** (in-house cannot show instances), which confines golden churn to `app/equities-dockview` (×10) + the one new scenario. Every other pre-existing cell must stay byte-identical — full both-client visual asserts, UNPIPED with real exit codes, before merge.
- Caps mirror the docked precedent: `MAX_PANEL_INSTANCES = 4` per tab; duplicate symbol = no-op.
- New visible UI (the row affordance + instance panels) → acceptance strip + merge held for the user.
- TypeScript 7 dual install landed on main (#719) — build commands unchanged.

---

### Task 0: Precondition gate — the sibling primitive is on main

**Files:** none (verification only).

- [ ] **Step 1:** `git fetch origin main && git show origin/main:packages/layout-dockview/src/createDockEngine.ts | grep -n "addDynamicPanel\|removeDynamicPanel\|DockDynamicPanelSpec"` — all three present, or STOP and report to the orchestrator.
- [ ] **Step 2:** Record the landed signatures next to this plan's Task 4 call sites; if `DockDynamicPanelSpec` carries fields beyond `title`/`maximizeScope`, thread them (title = the symbol; `maximizeScope: "root"`).
- [ ] **Step 3:** Merge origin/main into this branch; re-run `pnpm --filter @rtc/layout-dockview test` green before starting Task 1.

### Task 1: `instances` in the machine — open/close intents with cap and dupe rules

**Files:**
- Modify: `packages/core-api/src/layout.ts` (LayoutState), `packages/core-api/src/machines/layout.ts` (LayoutIntents)
- Modify: `packages/client-core/src/presenters/LayoutMachine.ts`, `packages/client-core/src/layout/defaultLayoutPort.ts`
- Modify (fan-out, same commit): the six literal sites listed in Global Constraints
- Test: `packages/client-core/src/presenters/__tests__/LayoutMachine.test.ts`

**Interfaces:**
- Consumes: `LayoutState { root, maximized, collapsed, closed }` (verified), reducer factory `makeReduce(port, staticIds)`, `MAX_DOCKED_PANELS = 4` precedent in `composition.ts`.
- Produces (all later tasks rely on these exact names):

```ts
// core-api/src/layout.ts
/** One dynamically opened panel instance (Phase 4). `id` doubles as the
 * engine panelId — "eq-chart:<symbol>" — so every id-keyed subsystem
 * (registry, blob, strips, pins) needs no new key shape. Only the dockview
 * engine renders instances; in-house projects them away (disparity
 * doctrine — the tree in `root` never contains them). */
export interface PanelInstance {
  readonly id: PanelId;
  readonly kind: "eq-chart";
  readonly symbol: string;
}
// LayoutState gains:
  readonly instances: readonly PanelInstance[];

// core-api/src/machines/layout.ts — LayoutIntents gains:
  /** Open a chart instance for `symbol` ("eq-chart:<symbol>"). No-op when
   * the symbol already has an instance or MAX_PANEL_INSTANCES is reached. */
  openInstance(kind: "eq-chart", symbol: string): void;
  /** Remove an instance. Drops its `collapsed` entry and clears `maximized`
   * if it named this id (the Phase 3 close rules); unknown ids no-op. */
  closeInstance(id: PanelId): void;
```

- [ ] **Step 1: Failing tests** (existing describe, existing `port` fixtures):

```ts
it("openInstance adds eq-chart:<symbol>, dedupes, and caps at 4", () => {
  const machine = createLayoutMachine(port);
  machine.intents.openInstance("eq-chart", "AAPL");
  machine.intents.openInstance("eq-chart", "AAPL");
  expect(machine.state$.getValue().instances).toEqual([
    { id: "eq-chart:AAPL", kind: "eq-chart", symbol: "AAPL" },
  ]);
  for (const s of ["MSFT", "NVDA", "TSLA", "AMZN"]) {
    machine.intents.openInstance("eq-chart", s);
  }
  expect(machine.state$.getValue().instances).toHaveLength(4);
  machine.dispose();
});

it("closeInstance removes it and clears its collapsed/maximized traces", () => {
  const machine = createLayoutMachine(port);
  machine.intents.openInstance("eq-chart", "AAPL");
  machine.intents.collapse("eq-chart:AAPL");
  machine.intents.maximize("eq-chart:AAPL");
  machine.intents.closeInstance("eq-chart:AAPL");
  const s = machine.state$.getValue();
  expect(s.instances).toEqual([]);
  expect(s.collapsed).not.toContain("eq-chart:AAPL");
  expect(s.maximized).toBeNull();
  machine.dispose();
});

it("reset discards instances with everything else", () => {
  const machine = createLayoutMachine(port);
  machine.intents.openInstance("eq-chart", "AAPL");
  machine.intents.reset();
  expect(machine.state$.getValue().instances).toEqual([]);
  machine.dispose();
});
```

- [ ] **Step 2:** Run `pnpm --filter @rtc/client-core test -- LayoutMachine` — FAIL (`openInstance is not a function`).
- [ ] **Step 3:** Implement: two subjects/events mirroring `close`/`reopen` verbatim; reducer cases build the id via a module-level `instanceIdFor(kind, symbol)` (exported — Task 3/5 reuse it); `MAX_PANEL_INSTANCES = 4` exported beside it. `closed`'s reducer interplay lines are the template for `closeInstance`. `reset` already rebuilds from `port.initial` — its initial gains `instances: []` via `defaultLayoutPort.ts`.
- [ ] **Step 4:** Update the six fan-out literal sites (`instances: []` / intent noops). Run FULL `pnpm typecheck` → 0 errors.
- [ ] **Step 5:** Package tests green; commit `feat(client-core): layout machine owns panel instances — open/close with cap and dedupe (Phase 4)`.

### Task 2: Persistence — additive `instances` per tab

**Files:**
- Modify: `packages/client-core/src/layout/workspaceLayoutPersistence.ts` (+ the writer that composes `PersistedTabLayout`)
- Test: its existing test file

**Interfaces:**
- Consumes: `PersistedTabLayout { layout, docked, closed… }`, `DockedPanelEntry { panelId, spec }` (verified) and its cross-payload cap pattern; the Phase 3 ghost-filter precedent.
- Produces: `PersistedInstanceEntry { readonly id: string; readonly kind: "eq-chart"; readonly symbol: string }`; `PersistedTabLayout.instances?: readonly PersistedInstanceEntry[]` (absent → `[]`).

- [ ] **Step 1: Failing tests:** round-trip keeps instances; a legacy payload without the key parses with `instances: []`; malformed entries (wrong kind, empty symbol, dupe ids, > cap) are FILTERED not fatal (the `collapsed` filtered-not-rejected precedent, documented in-file).
- [ ] **Step 2:** FAIL (field dropped on round-trip).
- [ ] **Step 3:** Implement parse + write, additive, NO version bump (same justification as Phase 3's `closed` — the old parser constructs from known fields and tolerates the new key).
- [ ] **Step 4:** Green; commit `feat(client-core): persist panel instances per tab — additive, ghost-filtered, legacy-tolerant`.

### Task 3: Pinned-symbol ChartPanel + instance registry channel (both clients)

**Files:**
- Modify: `packages/client-react/src/ui/equities/chart/ChartPanel.tsx`, solid twin
- Modify: `packages/client-react/src/ui/shell/layout/engine/appPanelRegistry.tsx`, solid twin
- Test: contract spec (shared, swap-trio) + each client's registry unit test

**Interfaces:**
- Consumes: `ChartPanel()` currently reads `sel` from `useEqWorkspace()` and feeds `useEquityQuote(sel)` / `useCandles(sel, timeframe)` / `useCandleBackfill(sel, timeframe)` — all already symbol-parameterised (verified); `dockedRegistryFor(dockedPanels): PanelRegistry` + `dockedSpecsFor` (the merge pattern, verified).
- Produces: `ChartPanel({ pinnedSymbol }: { pinnedSymbol?: string })` — when set, every `sel` read is replaced by `pinnedSymbol` (selection-following OFF; the instrument-tabs coupling is skipped); `instanceRegistryFor(instances: readonly PanelInstance[]): PanelRegistry` and `instanceSpecsFor(instances): Readonly<Record<PanelId, PanelSpec>>` (title = symbol, `maximizeScope: "root"`) exported beside the docked pair in BOTH clients.

- [ ] **Step 1:** Failing contract spec: an instance panel renders the pinned symbol's chart head/quote even when the workspace selection is a different symbol (drive selection via the existing workspace page object; assert the instance's instrument header text).
- [ ] **Step 2:** FAIL. **Step 3:** Implement (prop-thread `pinnedSymbol`; registry entries close over the instance row: `() => <ChartPanel pinnedSymbol={instance.symbol} />`). Shared view settings (timeframe/chartType/indicators) intentionally follow the singleton — record the limitation in a code comment.
- [ ] **Step 4:** Both clients' contract suites green; commit per client-pair.

### Task 4: Dockview bridge reconciliation (both clients)

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` (+ `App.tsx` prop wiring), solid twins
- Test: the StrictMode/bridge test files (Phase 3's `data-closed` suite is the template)

**Interfaces:**
- Consumes: the landed `addDynamicPanel(panelId, spec)` / `removeDynamicPanel(panelId)` (Task 0), the Phase 3 reconcile-not-diff doctrine, `engineVersion` replay.
- Produces: `DockviewLayoutEngineProps.instances: readonly PanelInstance[]` (required — the shell/visual harnesses pass `[]` in the SAME commit: `DockviewEngine.visual.tsx` ×2 per client, the Phase 3 lesson); `data-instances` witness attribute.

- [ ] **Step 1:** Failing test: mount with an instance → engine holds `eq-chart:AAPL`; StrictMode rebuild keeps it; prop-drop removes it; a blob restored with the instance keeps its dragged position (their reconciliation rule 1 — assert via the sibling round's own test helpers if exported, else blob-shape assertion).
- [ ] **Step 2–4:** Reconcile effect: present-in-prop & absent-in-engine → `addDynamicPanel(id, { title: symbol, maximizeScope: "root" })`; absent-in-prop & present-and-dynamic → `removeDynamicPanel(id)` (never touches Jarvis-docked ids — guard on the `eq-chart:` prefix via `instanceIdFor`). Registry/specs merged: `{ ...appPanelRegistry, ...dockedRegistryFor(...), ...instanceRegistryFor(instances) }`. In-house branch ignores instances entirely (projection). Commit.

### Task 5: Watchlist affordance (both clients) — dockview-gated

**Files:**
- Modify: `packages/client-react/src/ui/equities/watchlist/WatchlistPanel.tsx` + module.css, solid twins
- Test: shared contract spec + testids contract

**Interfaces:**
- Consumes: `useLayout("equities").{state,openInstance,closeInstance}` (via the ViewModel), the LayoutEngine preference (the engine gate the View menu…​ does NOT use — verify how the bridges branch and reuse that source), `instanceIdFor`, `MAX_PANEL_INSTANCES`.
- Produces: per-row icon button `TESTIDS.equities.openChartInstance(symbol)`; hidden entirely under the in-house engine; disabled (aria-disabled) at cap or duplicate.

- [ ] **Step 1:** Failing contract spec: dockview mode shows the row button; clicking opens the instance (machine state asserted via the panel's appearance and `data-instances`); duplicate click disables; in-house mode renders NO button.
- [ ] **Step 2–4:** Implement, both clients, contract green, commit.

### Task 6: Visual scenario — `app/equities-instances-dockview`

**Files:**
- Modify: `packages/ui-contract/src/visual/appData.ts` (`layoutInstances`), `scenarios.ts`, `scenarioActions.ts`; both hosts' `buildFakeViewModel` (layer `instances: data.layoutInstances ?? base.instances`)
- Goldens: arm64 regen `-g "equities-instances|app/equities-dockview"` — the SAME string later passed to the x86 workflow

- [ ] Steps: 5-edit recipe; scenario seeds two instances (AAPL + MSFT) via AppData (never clicks); single-engine justification in-comment (instances are layer-2 membership only dockview renders — no in-house twin CAN exist; third single-engine scenario after `shell/layout-dockview-stacked` + `shell/view-menu-open`); dock-mounted `waitForText` gate (the Phase 3 blank-golden lesson); `app/equities-dockview` re-pins (row buttons appear); assert `app/equities` (in-house) stays byte-identical. Solid asserts all new cells. Commit.

### Task 7: Docs

- [ ] `packages/layout-dockview/README.md` gains an "Instances consume the dynamic-panel API" paragraph (pointing at the sibling round's §4 ownership); ADR-002 era section one-liner; STATUS.md Phase 4 note + Last updated bump; `pnpm check:doc-links`. Commit.

### Task 8: Measurement + acceptance gate

- [ ] FULL `pnpm typecheck` → 0. Full gauntlet fast tier (eval-loop form). Full react + solid visual asserts UNPIPED to log files, `grep -E "^  [0-9]+ (passed|failed|skipped|did not run)"`, passed == `--list` total, exit 0 — byte-identity everywhere except `app/equities-dockview` + the new scenario.
- [ ] Acceptance strip: watchlist rows with the affordance, two instances open (stacked/split), one in-house shot proving the equities tab unchanged there. Merge HELD for the user.

## Self-review

- **Spec coverage:** Phase 4 scope (user-fixed) fully tasked; the engine primitive deliberately consumed not built (precondition), per the sibling spec's §2 coordination clause.
- **Placeholder scan:** later tasks' Step 2–4 compressions name their behaviours beside real Step-1 test code (the accepted Phase 1/3 calibration); "adapt to the file's actual fixture names" applies to test fixtures only. No TBDs.
- **Type consistency:** `PanelInstance`, `instanceIdFor`, `MAX_PANEL_INSTANCES`, `instanceRegistryFor`, `instanceSpecsFor`, `openInstance`/`closeInstance` used identically across Tasks 1–6.
