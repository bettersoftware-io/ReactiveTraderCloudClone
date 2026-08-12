# GenUI L3 — Pinned Panels + Workspace Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Jarvis-generated panel can be docked into the workspace as an ordinary tile and the whole per-tab workspace (splits + docked panels) survives reload.

**Architecture:** `JarvisPanelsMachine` gains a per-panel `docked` flag with its own cap; `LayoutMachine` gains insert/remove tree mutations; one new opaque string preference carries a versioned serialized payload, loaded synchronously into `layoutFor`'s initial and replayed into the panels machine at boot, written back by a lazy debounced writer; both clients thread dynamic registry/specs/head entries into the untouched engine; `DriveCommand` grows `dockPanel`/`undockPanel`.

**Tech Stack:** TypeScript, RxJS (`TestScheduler`), React 19 + SolidJS byte-identical CSS, `@rtc/ui-contract` swap-trio, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-11-genui-l3-pinned-panels-design.md`

## Deviations from the spec (ruled at plan time, from the fact-sheet audit)

1. **Vocabulary is `docked`/`dock`, never `pinned`/`pin`, in ALL code and testids.** `PanelSpec.pinned` already means "fixed bottom strip" (`layoutPort.ts:10`) and `data-pinned` already renders on every panel section. Spec §5's `jarvis-panel-pin`/`jarvis-panel-unpin` become **`jarvis-panel-dock` / `jarvis-panel-undock`**. Human-facing copy may say "Pin"/"📌"; code says dock.
2. **Docked panels get their own cap: `MAX_DOCKED_PANELS = 4` (global).** The presenter holds one warm `composePanelStream` subscription per live panel with no bound; uncapped docking leaks. A dock at cap → no-op (UI disables the button; drive op → `skipped`, reason `"dock full"`).
3. **The floating evict rewrite is explicit work, not "the existing rule applies".** Cap counting and eviction (`applyPanelEvent`) must filter on `!docked`; eviction drops the first *non-docked* entry; unpin-at-full-floating-cap gets a genuinely new evict call site.
4. **`specs` and `headRegistry` become threaded props.** The engine reads titles/flags from a `specs` prop that App.tsx doesn't pass today (module default). Both clients start passing merged static+dynamic `registry`, `specs`, `headRegistry`. The engine itself is untouched.
5. **The persistence writer is lazy by construction.** No `combineLatest` over all four tabs (that would force eager machine creation): `layoutFor` registers each machine's `state$` into the writer as it is created; the serialized payload read-modify-writes so never-created tabs keep their stored value.
6. **Contract-tier rehydration is witnessed on a FRESH world.** Same-world remount reuses WeakMap-cached machines and proves nothing; the spec test becomes: world A → dock → read serialized string → `createWorld` B seeded with it → panel is docked and live. New `World` field + 23rd positional `createWorld` param + `MountOptions` entry.
7. **`workspaceLayoutV1` is the repo's first optional string preference** — port members `workspaceLayout$(): Observable<string | null>` / `setWorkspaceLayout(value: string | null)`, default `null`, storage guard `typeof value === "string"`; real validation lives in the client-core parser. All three adapters + simulator + port contract follow this new pattern.
8. **The persona guard raise is planned, not conditional**: 3600 → **3800** (measured 3480 + one sentence + one worked example ≈ 3650–3700).
9. **A `PrefAction` row component is new** (both clients) — no action-row precedent exists in the Preferences modal; the column-balance doc comment (13/13) updates.
10. **Reset semantics**: clear the preference, reset every *created* layout machine to its default (new `reset()` intent), and dismiss all docked panels. Floating panels are untouched.

## Global Constraints

- No Anthropic API calls in any CI-run test.
- CSS modules byte-identical react↔solid (`diff` empty); no inline styles; mandatory braces; `#/` intra-package alias; function names state their effect; no lint disables.
- Contract coverage gates: react ≥95%, solid ≥95% (branches ≥85%).
- New testids: `jarvis-panel-dock`, `jarvis-panel-undock`, `jarvis-panel-close` (docked head), `pref-reset-workspace-layout`.
- Constants: `MAX_DOCKED_PANELS = 4`; dock column `initialPx` **360**; writer debounce **500 ms**; payload version literal `1`; preference storage key `"rtc-workspace-layout-v1"`.
- Drive ops exactly `dockPanel` / `undockPanel` with `panelId` (IDENTIFIER length bounds 1..64, same as `dismissPanel`); skip reasons verbatim: `` `unknown panelId "${cmd.panelId}"` ``, `"dock full"`, `"already docked"`, `"not docked"`.
- Persona: drive example count 3→**4**, all-examples 5→**6**, length guard ≤**3800** (lower bound unchanged); roster/derivation pins untouched.
- Verify formatting with `pnpm exec biome ci <files>` (never `biome check` alone) AND root `pnpm lint:eslint`.
- Pathspec-scoped commits; work only on branch `worktree-genui-l3-pinned-panels`; before every commit verify `git rev-parse --abbrev-ref HEAD`.
- Fact sheet with exact file:line anchors for every seam named below: `.superpowers/sdd/2026-08-11-genui-l3-pinned-panels/fact-sheet.md` (Task 0 writes it from the plan's source exploration; every brief may cite it).

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `packages/client-core/src/presenters/JarvisPanelsMachine.ts` (modify) | 1 | `docked` flag, dock/undock/restore intents, cap rewrite |
| `packages/client-core/src/presenters/JarvisPanelsPresenter.ts` (modify) | 1 | `docked` on `JarvisPanelVm`; docked/floating projections |
| `packages/client-core/src/presenters/LayoutMachine.ts` (modify) | 2 | `insertPanel`/`removePanel`/`reset` intents + reducers |
| `packages/domain/src/preferences/*, ports/*, simulators/*` (modify) | 3 | `workspaceLayoutV1` optional string pref (first of its kind) |
| `packages/client-{react,solid}/src/app/adapters/LocalStoragePreferencesAdapter.ts`, RN AsyncStorage twin (modify) | 3 | storage plumbing |
| `packages/client-core/src/layout/workspaceLayoutPersistence.ts` (create) | 4 | serialize/parse + versioned structural walk |
| `packages/client-core/src/composition.ts` (modify) | 5 | rehydration, lazy debounced writer, driver deps, reset plumbing |
| `packages/shared/src/jarvis/driveCommand.ts` (modify) | 6 | `dockPanel`/`undockPanel` kinds/validators/schema |
| `packages/client-core/src/presenters/JarvisDriverMachine.ts` (modify) | 6 | interpreter branches + live-id membership |
| `packages/server/src/agent/jarvisPersona.ts` (+test) (modify) | 6 | ops sentence + worked example; guard 3800 |
| `packages/client-react/src/ui/...` (modify) | 7 | dock button, threading, `JarvisPanelHead`, `PrefAction` + Reset |
| `packages/client-solid/src/ui/...` (modify) | 8 | byte-identical mirror |
| `packages/ui-contract/src/...` (modify) | 9 | world seed, page objects, contract specs, visual scenario |
| `tests/browser/...` (modify) | 10 | dock → reload → rehydrate ride |
| `docs/adr/ADR-002...md`, `docs/STATUS.md` (modify) | 11 | ADR rewrite, close-out, ship |

Parallel windows: **{T1 ∥ T2 ∥ T3} → T4 → {T5 ∥ T6} → T7 → T8 → {T9 ∥ T10} → T11.**

---

### Task 0: Fact-sheet handoff

**Files:** Create `.superpowers/sdd/2026-08-11-genui-l3-pinned-panels/fact-sheet.md`.

- [ ] **Step 1:** The controller (not a subagent) copies the plan-time exploration report verbatim into the workspace file above, so briefs can reference exact line anchors without re-deriving them. No commit (gitignored).

### Task 1: `JarvisPanelsMachine` — the `docked` property

**Files:**
- Modify: `packages/client-core/src/presenters/JarvisPanelsMachine.ts`
- Modify: `packages/client-core/src/presenters/JarvisPanelsPresenter.ts`
- Test: `packages/client-core/src/presenters/__tests__/JarvisPanelsMachine.test.ts` (extend), `JarvisPanelsPresenter.test.ts` (extend)

**Interfaces:**
- Consumes: existing `PanelInstance { panelId; spec; status }`, `applyPanelEvent` cap fold (`:96-97`), handle `{state$, dismissPanel}`.
- Produces (Tasks 4/5/6/7/9 rely on these exact names):

```ts
export const MAX_DOCKED_PANELS = 4;
export interface PanelInstance {
  readonly panelId: string;
  readonly spec: PanelSpecV1 | null;
  readonly status: PanelStatus;
  readonly docked: boolean;              // NEW — false for every wire spawn
}
export interface JarvisPanelsMachineHandle {
  readonly state$: StateObservable<JarvisPanelsState>;
  readonly dismissPanel: (panelId: string) => void;
  readonly dockPanel: (panelId: string) => void;      // NEW
  readonly undockPanel: (panelId: string) => void;    // NEW
  /** Boot-time rehydration ONLY: append a docked panel restored from the
   * persisted workspace payload. Ignores the floating cap; respects
   * MAX_DOCKED_PANELS (excess silently dropped). */
  readonly restoreDockedPanel: (panelId: string, spec: PanelSpecV1) => void;  // NEW
}
```

Semantics (each is a reducer case with a test):
- `dockPanel`: unknown id or already docked → no-op; at `MAX_DOCKED_PANELS` docked → no-op; else sets `docked: true` **in place** (array position unchanged — a morph, matching the edit doctrine).
- `undockPanel`: unknown or not docked → no-op; sets `docked: false`; if the floating count (entries with `!docked`) would then exceed `MAX_LIVE_PANELS`, evict the **oldest non-docked** entry first (the new evict call site — deviation 3).
- **Cap fold rewrite**: `applyPanelEvent`'s spawn branch counts and evicts over the `!docked` subset only; docked entries are invisible to the floating cap. A wire edit to a *docked* panelId still morphs in place (restyle-while-docked works).
- `restoreDockedPanel`: appends `{panelId, spec, status: "live", docked: true}`; dedupes by id; drops beyond `MAX_DOCKED_PANELS`. Never constructs a spec reference-equal to `UNSUPPORTED_SENTINEL_SPEC`.
- Presenter: `JarvisPanelVm` gains `docked: boolean`; add `dockedPanels$` / `floatingPanels$` derived projections (simple `map`+`filter` over `panels$` — the layer consumes floating, the engine's dynamic registry consumes docked) and re-export the three new intents on the presenter handle. `panelData$` is unchanged (id-keyed, host-agnostic).

- [ ] **Step 1: Write failing machine tests** — table-test the reducer cases above, plus: dock frees a floating slot (4 floating → dock one → a new wire spawn does NOT evict); wire spawn evicts oldest *floating* while an older *docked* panel survives at index 0; undock at full floating cap evicts oldest floating, not the undocked panel itself; restore respects the docked cap; dismiss works on docked panels. Follow the file's existing subject-driven harness.
- [ ] **Step 2:** Run: `pnpm --filter @rtc/client-core exec vitest run src/presenters/__tests__/JarvisPanelsMachine.test.ts` → FAIL.
- [ ] **Step 3:** Implement machine + presenter changes.
- [ ] **Step 4:** Both test files green; `pnpm typecheck` (fixtures referencing `PanelInstance` literals gain `docked: false` — find via typecheck).
- [ ] **Step 5:** Commit (pathspec: the four files + any fixture literals typecheck named).

### Task 2: `LayoutMachine` — `insertPanel` / `removePanel` / `reset`

**Files:**
- Modify: `packages/client-core/src/presenters/LayoutMachine.ts`
- Create: `packages/client-core/src/layout/dockColumn.ts` (pure tree helpers)
- Test: `packages/client-core/src/layout/__tests__/dockColumn.test.ts`, `packages/client-core/src/presenters/__tests__/LayoutMachine.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
// dockColumn.ts — pure functions, no rxjs
export const DOCK_COLUMN_INITIAL_PX = 360;
export interface DockInsertResult { readonly root: LayoutNode; }
export function insertDockedLeaf(root: LayoutNode, panelId: PanelId): LayoutNode;
export function removeDockedLeaf(root: LayoutNode, panelId: PanelId): LayoutNode;
export function dockedLeafIds(root: LayoutNode, staticIds: readonly PanelId[]): readonly PanelId[];

// LayoutMachine intents gain:
insertPanel: (panelId: PanelId) => void;
removePanel: (panelId: PanelId) => void;
reset: () => void;   // back to port.initial (Task 5's Reset row + tests)
```

Rules (each a `dockColumn.test.ts` case):
- `insertDockedLeaf`: root not a row → wrap `{kind:"split", dir:"row", children:[root, col], sizes:[0.75,0.25], initialPx:[undefined, DOCK_COLUMN_INITIAL_PX]}`. Root already a row whose **last child is the dock column** (identified structurally: a column split — or single leaf — whose every leaf id is NOT in the static tree, i.e. `dockedLeafIds` non-empty and exhaustive) → append the new leaf into that column with equal fractions. Root a row without a dock column → append the column as a new last child with `initialPx: DOCK_COLUMN_INITIAL_PX`. Duplicate id → return root unchanged.
- `removeDockedLeaf`: removes the leaf; a split left with one child collapses to that child; the dock column vanishing restores the exact pre-insert tree (assert deep-equality round-trip `remove(insert(tree,id),id) === tree` structurally); sizes renormalize to sum 1; unknown id → unchanged.
- Identification is **structural** (leaf ids ∉ static tree ids) — no magic marker in `LayoutNode` (keeps the type untouched; the serialized payload doesn't need a marker either).
- `reset` reducer returns `port.initial`; also clears `maximized`/`collapsed` implicitly (it IS `port.initial`).
- Machine reducers delegate to the pure helpers; maximize/collapse/resize need zero changes (docked leaves are ordinary leaves).

Steps: failing tests (incl. the round-trip and renormalization property over the three real default trees fx/credit/equities) → implement → green → commit.

### Task 3: The `workspaceLayoutV1` preference (first optional string pref)

**Files:** mirror the `chartSubstrate` precedent (commit `94130fbfc`, all sites enumerated in the fact sheet §4) MINUS the modal/bindings UI sites (no picker — the only UI is Task 7's Reset row):
- Modify: `packages/domain/src/preferences/preferences.ts` (no roster/default constant — document `null` = unset), `packages/domain/src/index.ts`, `packages/domain/src/ports/preferencesPort.ts` (add `workspaceLayout$(): Observable<string | null>; setWorkspaceLayout(value: string | null): void;`), `packages/domain/src/simulators/PreferencesSimulator.ts` (seed field `workspaceLayoutSeed?: string | null`, default `null`), `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts` (three cases: default null + round-trip; push-to-subscribers; set null clears).
- Modify: both `LocalStoragePreferencesAdapter.ts` (key `"rtc-workspace-layout-v1"`, guard `typeof value === "string"`, absent key → `null`, `setWorkspaceLayout(null)` → `removeItem`), RN `AsyncStoragePreferencesAdapter.ts` (all 7 insertion points incl. the batched `hydrate()` array), both web `preferences.contract.test.ts` wirings + RN adapter test.
- No presenter (composition reads the port directly via `readPreferenceNow` — Task 5); no bindings hooks; no modal segment.

Steps: extend the port contract first (failing against simulator) → domain + simulator → adapters (each client's contract test green) → commit. Run: `pnpm --filter @rtc/domain test && pnpm --filter @rtc/client-react test -- preferences && pnpm --filter @rtc/client-solid test -- preferences && pnpm --filter @rtc/client-react-native test -- Preferences`.

### Task 4: Serialization module

**Files:**
- Create: `packages/client-core/src/layout/workspaceLayoutPersistence.ts`
- Test: `packages/client-core/src/layout/__tests__/workspaceLayoutPersistence.test.ts`

**Interfaces (Tasks 5/9 rely on):**

```ts
export interface PersistedTabLayout {
  readonly layout: LayoutState;
  readonly docked: readonly { readonly panelId: string; readonly spec: PanelSpecV1 }[];
}
export interface WorkspaceLayoutV1 {
  readonly v: 1;
  readonly tabs: Partial<Record<WorkspaceTab, PersistedTabLayout>>;
}
export function serializeWorkspaceLayout(payload: WorkspaceLayoutV1): string;   // JSON.stringify
export function parseWorkspaceLayout(raw: string | null): WorkspaceLayoutV1 | null;
```

`parseWorkspaceLayout` is a hand-rolled structural walk (the `parseDriveBatch` idiom, no schema lib): `null`/non-JSON/`v !== 1` → `null`; each tab key must be a `WorkspaceTab`; `layout` walked recursively (`kind` ∈ {split,panel}; `dir` ∈ {row,column}; `sizes` finite numbers matching `children.length`, each in (0,1], sum within 1e-6 of 1; `fixedPx`/`initialPx` arrays of number|undefined matching length; `maximized` string|null; `collapsed` string array); each docked entry's `spec` re-validated through `parsePanelSpec(specRaw, [])` — **any** failure anywhere → whole-payload `null` (no partial application). Round-trip property test over the three real default trees + docked entries; corpus of ~10 corrupt cases (truncated JSON, v:2, negative size, sizes off-sum, unknown tab, spec failing parsePanelSpec, docked not array, panelId empty…) all → `null`.

### Task 5: Composition — rehydrate, lazy writer, driver deps, reset

**Files:**
- Modify: `packages/client-core/src/composition.ts`
- Test: `packages/client-core/src/__tests__/composition.workspacePersistence.test.ts` (create), `composition.layoutFor.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1–4 exports; `readPreferenceNow` (`composition.ts:292-309`).
- Produces: `Presenters.resetWorkspaceLayout: () => void`; driver deps additions (Task 6 consumes): `livePanelIds$: Observable<readonly string[]>`, `dockPanel`, `undockPanel`, `dockedPanelIds$`.

Wiring, in composition order:
1. **Load once** before `layoutFor` definition: `const persisted = parseWorkspaceLayout(readPreferenceNow(ports.preferences.workspaceLayout$(), null));`
2. **`layoutFor` seeds from it**: `createLayoutMachine({ initial: persisted?.tabs[tab]?.layout ?? createDefaultLayoutPort(tab).initial })` — validated tree only; the parser's whole-payload-null rule means no per-tab fallback mixing.
3. **Docked replay** after `jarvisPanels` creation: for each tab entry's `docked` list, `jarvisPanels.restoreDockedPanel(panelId, spec)` (machine enforces the cap), and note the docked ids per tab feed the writer's first snapshot.
4. **Lazy debounced writer**: a `Subject<void>` `persistKick$`; `layoutFor` registers each newly created machine: `machine.state$.subscribe(() => persistKick$.next())` (session-lifetime, documented non-unsubscribe like the history cache at `:475`); `jarvisPanels.state$` likewise. `persistKick$.pipe(debounceTime(500))` → build `WorkspaceLayoutV1` by **read-modify-write**: start from `parseWorkspaceLayout(readPreferenceNow(...)) ?? {v:1, tabs:{}}`, overwrite only tabs whose machine exists, set `docked` from the panels machine (docked panels persist under the tab that was **active when docked** — track via a `Map<panelId, WorkspaceTab>` updated on dock/restore; document this rule), then `ports.preferences.setWorkspaceLayout(serializeWorkspaceLayout(payload))`. Debounce scheduler injectable for tests (thread composition's existing scheduler seam or accept a small `TestScheduler`-driven unit on an extracted `createWorkspacePersistenceWriter(deps)` helper — extract the helper; test it directly).
5. **Dock/undock intents bridge**: `dockPanel(panelId)` = `jarvisPanels.dockPanel(panelId)` + `layoutFor(activeTab).intents.insertPanel(panelId)` (title from the panel's spec via a lookup on current state; workspaceNav supplies activeTab); `undockPanel` mirrors with `removePanel`. Expose both on `Presenters` for the UI (Task 7) and hand to the driver (Task 6). Guard ordering: panels-machine first (it owns the caps/no-op rules); only on a state change does the layout mutation fire — decide by comparing docked-set before/after (read the BehaviorSubject-backed `state$` synchronously, the `current()` idiom used elsewhere).
6. **Reset**: `resetWorkspaceLayout()` = `setWorkspaceLayout(null)` + every **created** layout machine's `reset()` + dismiss every docked panel (undock-then-dismiss not needed — `dismissPanel` works docked).
7. **Driver deps**: `livePanelIds$` = `jarvisPanels.state$.pipe(map(s => s.panels.map(p => p.panelId)))`, `dockedPanelIds$` analogous.

Tests (`composition.workspacePersistence.test.ts`, jsdom + fake prefs port): boot with a persisted payload → `layoutFor("fx")` initial matches; docked panel restored live; corrupt payload → defaults; dock → debounced write lands with the tab entry; reset clears pref + defaults tree + no docked panels; writer never creates machines for untouched tabs (assert `layoutHandles` map size via behavior: payload for never-accessed tab survives a write round-trip).

### Task 6: Drive vocabulary + persona

**Files:**
- Modify: `packages/shared/src/jarvis/driveCommand.ts` (+`__tests__/driveCommand.test.ts`)
- Modify: `packages/client-core/src/presenters/JarvisDriverMachine.ts` (+test)
- Modify: `packages/server/src/agent/jarvisPersona.ts` (+test)

Key edits:
- `DRIVE_COMMAND_KINDS` += `"dockPanel", "undockPanel"`; union += `{kind:"dockPanel", panelId: string} | {kind:"undockPanel", panelId: string}`; the `dismissPanel` terminal fall-through (`:381-394`) refactors into a shared `validatePanelIdCommand(kind)` used by all three panelId kinds, keeping the last kind terminal; two new `anyOf` schema entries copying the `dismissPanel` block shape with the new consts; the one-branch-per-kind schema conformance test (`driveCommand.test.ts:572-576`) updates.
- Driver deps gain (from Task 5): `dockPanel`, `undockPanel`, `livePanelIds$`, `dockedPanelIds$`; interpreter branches:

```ts
case "dockPanel": {
  if (!livePanelIds.includes(cmd.panelId)) {
    return { command: cmd, status: "skipped", reason: `unknown panelId "${cmd.panelId}"` };
  }
  if (dockedPanelIds.includes(cmd.panelId)) {
    return { command: cmd, status: "skipped", reason: "already docked" };
  }
  if (dockedPanelIds.length >= MAX_DOCKED_PANELS) {
    return { command: cmd, status: "skipped", reason: "dock full" };
  }
  deps.dockPanel(cmd.panelId);
  return { command: cmd, status: "applied" };
}
case "undockPanel": {
  if (!dockedPanelIds.includes(cmd.panelId)) {
    return { command: cmd, status: "skipped", reason: "not docked" };
  }
  deps.undockPanel(cmd.panelId);
  return { command: cmd, status: "applied" };
}
```

  (`livePanelIds`/`dockedPanelIds` read fresh per command via the existing `withLatestFrom` pattern the symbol gate uses at `:243-251`.) The `layout` command's membership gate widens: `known = [...deps.knownLayoutPanelIds(cmd.tab), ...dockedPanelIds]`.
- Persona: after the FX example line append —

```
Example — drive, pin: pin that panel to my workspace → call drive_app with {commands: [{kind: "dockPanel", panelId: "<the panel's id from its render_panel turn>"}]}. undockPanel floats it again; dismissPanel removes it.
```

  Test updates: `driveExampleLines` 3→4 (both blocks `:100`/`:108`), `allExampleLines` 5→6 (+ sum invariant), length guard ≤3800 with measured print in the report, new `toContain("dockPanel")` pin.

### Task 7: React UI

**Files:**
- Modify: `packages/client-react/src/ui/shell/jarvis/panels/JarvisPanelLayer.tsx` (+`.module.css`) — floating layer renders `floatingPanels` only; card head gains before dismiss: `<button type="button" data-testid="jarvis-panel-dock" aria-label={`Pin ${panel.title} to workspace`} className={styles.dismiss} disabled={dockFull} onClick={dockThisPanel}>📌</button>` (`dockFull` from `dockedPanels.length >= MAX_DOCKED_PANELS`).
- Create: `packages/client-react/src/ui/shell/jarvis/panels/JarvisDockedPanelBody.tsx` + `JarvisDockedPanelHead.tsx` — body reuses `JarvisPanelBody` + `useJarvisPanelData(panelId)`; head renders `<button data-testid="jarvis-panel-undock" aria-label={`Unpin ${title}`}>…</button><button data-testid="jarvis-panel-close" aria-label={`Close ${title}`}>✕</button>`.
- Modify: `packages/client-react/src/ui/App.tsx` — `WorkspaceEngine` builds and passes merged props:

```tsx
const { dockedPanels, dockPanel, undockPanel, dismissPanel } = useJarvisPanels(); // widened hook (bindings edit)
const registry = { ...appPanelRegistry, ...dockedRegistryFor(dockedPanels, dismissPanel) };
const specs = { ...PANEL_SPECS, ...dockedSpecsFor(dockedPanels) };   // {id,title} per docked panel
const headRegistry = { ...appHeadRegistry, ...dockedHeadsFor(dockedPanels, undockPanel, dismissPanel) };
<InhouseLayoutEngine state={state} registry={registry} specs={specs} headRegistry={headRegistry} … />
```

  (Helpers live beside the registries in `appPanelRegistry.tsx`; the engine file is untouched.)
- Create: `packages/client-react/src/ui/shell/prefs/PrefAction.tsx` (`{label, description, buttonLabel, testid, onPress}` → row + bordered button, new `.actionButton` class) and add the Reset row to `PreferencesModal.tsx`'s DATA & PRIVACY column (`pref-reset-workspace-layout`, button copy `RESET`), wired to `resetWorkspaceLayout` via a widened bindings hook; update the column-balance doc comment (13→14 left, note).
- Modify: `packages/react-bindings/src/createViewModel.ts` — widen `useJarvisPanels` result with `{dockedPanels, floatingPanels, dockPanel, undockPanel}`; add `useWorkspaceReset` (or fold `resetWorkspaceLayout` into an existing prefs hook — follow the file's least-new-surface option and record which).

Manual smoke (mandatory, `pnpm dev`): author a panel via Jarvis → 📌 → it docks right-column, resizes, maximizes, collapses; restyle-while-docked works ("make it a table"); unpin floats it; close removes; reload → docked panel returns live; Reset restores defaults.

### Task 8: Solid mirror

Byte-identical CSS (`cp` both changed/new modules; `diff` empty), idiomatic Solid TSX port of every Task-7 change (accessors, `<Show>`/`<For>`, `createMemo` for merged registries — memo, not inline), solid bindings widened identically, manual smoke on `pnpm dev:solid`.

### Task 9: ui-contract

**Files:** world/mount (23rd positional `workspaceLayoutSeed?: string | null` + `World.workspaceLayout: BehaviorSubject<string | null>` + fake-port bridge in both `viewModelFromWorld.ts`), `JarvisPanelLayerPage` + `LayoutEnginePage` + `PreferencesModalPage` accessors (`dockPanel(id)`, `isDocked(id)`, `undock(id)`, `closeDocked(id)`, `resetWorkspaceLayout()`), new spec blocks in `JarvisPanelLayer.contract.spec.ts` + `LayoutEngine.contract.spec.ts` + `JarvisDriver.contract.spec.ts` + `PreferencesModal.contract.spec.ts`:
- dock → panel appears as a workspace leaf (`panel-<id>` section) with undock/close controls, leaves the floating layer, floating cap freed (spawn 4 → dock 1 → spawn → no evict of the docked one);
- undock → floats again; close → gone; dock at `MAX_DOCKED_PANELS` → button disabled;
- drive `dockPanel`/`undockPanel` end-to-end incl. all four skip reasons;
- **fresh-world rehydration** (deviation 6): world A dock → read `world.workspaceLayout.getValue()` → `createWorld` B seeded → mounted `AppShell` shows the docked panel live; corrupt seed → defaults;
- reset row clears (seed a layout, reset, assert defaults).
- Visual: scenario `layout/fx-docked-panel` (componentKey `App` or the layout static engine — follow whichever fixture can carry a docked panel; likely a new fixture with a docked entry) + `scenarioActions` recipe; no goldens committed (T11 dispatch).
- Run both coverage gates; report numbers.

### Task 10: E2e ride

**Files:** `tests/browser/page-objects/contracts/Jarvis.ts` + playwright driver (`dockPanel(id)`, `isPanelDocked(id)`, `undockPanel(id)`), `tests/browser/scenarios/jarvis.ts`, `tests/browser/playwright/jarvis.spec.ts`:

```ts
export async function expectDockedPanelSurvivesReload(ctx: ScenarioContext): Promise<void> {
  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.ask("Show me GBP volatility");
  await ctx.po.jarvis.waitForPanelLive(SCRIPTED_PANEL_ID);
  await ctx.po.jarvis.dockPanel(SCRIPTED_PANEL_ID);
  await common.reloadPage(ctx);                      // powerSaver.spec.ts:22 template
  await ctx.po.jarvis.waitForPanelDockedLive(SCRIPTED_PANEL_ID);   // docked section + renderer testid
  await ctx.po.jarvis.undockPanel(SCRIPTED_PANEL_ID);
  await ctx.po.jarvis.waitForPanelLive(SCRIPTED_PANEL_ID);         // back in the floating layer
}
```

Both clients green; grep gates (`pnpm --filter @rtc/tests gates`) for the PO contract sync.

### Task 11: ADR-002 rewrite, close-out, ship

- ADR-002 → **Superseded in part (2026-08-11)** per spec §8 (in-house engine IS the system; machine+view seam is the swap boundary; persistence landed as opaque preference; Dockview honestly re-costed as alternative engine citing the exploration; free-float still future; replaceability row updated).
- Spec addendum (deviations 1–10), STATUS flip (delete 🔴 entry → GenUI follow-ups L3 line marked SHIPPED + deferred findings), `check:doc-links`.
- Full gauntlet; push + PR; goldens dispatch on branch (`layout/fx-docked-panel` + any moved `app/*`); empty-commit CI trigger; Rule-3 triage; merge `--merge`; CodeQL; cleanup.

---

## Self-review (done at write time)

- **Spec coverage:** §3→T1, §4→T2, §5→T7/T8 (+registry helpers), §6→T6, §7→T3/T4/T5 (+Reset T7), §8→T11, §9→T1-T10 test steps, §10 honored. Gap check: spec §5 "one renderer two hosts" → `JarvisDockedPanelBody` reuses `JarvisPanelBody` (T7). Spec §7 debounce → T5's extracted writer helper.
- **Placeholders:** none; every step names exact files, constants, code or a precedent with file:line via the fact sheet.
- **Type consistency:** `dockPanel/undockPanel/restoreDockedPanel` (T1) = composition bridge names (T5) = driver deps (T6) = UI hooks (T7/8); `WorkspaceLayoutV1`/`parseWorkspaceLayout` (T4) = T5/T9 usage; `MAX_DOCKED_PANELS` exported from T1, consumed T5/T6/T7/T9.
- **Known risks for reviewers:** T5's active-tab attribution rule for docked persistence (dock on fx, switch to credit, reload → panel restores under fx — assert it); T1's evict-order edge when index 0 is docked; T9's fresh-world seeding must NOT leak WeakMap state (new world object by construction).
