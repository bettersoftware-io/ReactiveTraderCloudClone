# Pluggable Application Core — Slice 7 (Workspace + Jarvis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the regime slices 5 and 6 proved: in-session implementation, one independent reviewer per PR). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the last 16 delegated members native in both alternative cores, in two waves — **wave 1, the workspace** (the layout/dock eleven plus `jarvisPanels`, 12 members → 70/74); **wave 2, Jarvis** (`jarvis`, `jarvisUsage`, `jarvisDriver`, `jarvisDemo`, plus the internal `NarratorMachine` → 74/74). Slice 8 then deletes delegation.

**Architecture:** Each wave is three PRs, like slice 5: **suites** (the RxJS side — pure extraction, harness verbs, contract suites, the seam), then **async**, then **Effect**. Wave 1 extracts the workspace's synchronous control logic from `createApp`'s closure into shared, rxjs-free controllers in `@rtc/client-core` (imported by the siblings, like `createAuthDeps` in slice 6), so each core ports only thin stream shells. Its seam is a **factory**, `CoreSeams.workspace(jarvisEvents$)`, because the native workspace needs the base's (still delegated) `jarvis.events$` while the base's driver needs the native workspace. That cycle is broken inside `createApp` itself (ruling 3). This document plans wave 1 in full; wave 2 is outlined at the end and gets its own plan file once wave 1 ships.

**Tech Stack:** TypeScript 7 `tsc` (6.x API shim), pnpm 12 + Turborepo, vitest 4.1 (`withFakeClock`), RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md). It covers slice table rows "6 shell" (the layout/dock family moved here, see slice 6's ruling 1) and "7 jarvis"; "Pure reducers … are imported, not duplicated"; and "driver verbs arrive with the slices that assert on them". Previous slice: [`2026-09-23-pluggable-core-slice-6.md`](2026-09-23-pluggable-core-slice-6.md) + [rulings](2026-09-23-pluggable-core-slice-6-rulings.md).

## Global Constraints

- Every repo change ships via `./scripts/new-worktree.sh <name> --ready` → PR → CI green on the head SHA (`gh run list`, matched by `headSha`) → CodeQL alerts checked → `gh pr merge --merge` → `git merge-base --is-ancestor` → remove the worktree and branch. Wave 1 PR A lives in `.claude/worktrees/core-slice-7`. The async and Effect PRs each branch from `main` after the previous PR merges.
- `VITE_CORE_IMPL` stays unset in production; the RxJS core remains the shipped default.
- Outside each sibling's `bridge/`, `rxjs` / `@rx-state/core` are **type-only** imports (dependency-cruiser `bridge-owns-rxjs`, grep gate 43). The shared controllers extracted in Task 1 import **no** rxjs value either, because the siblings call them.
- `@rtc/core-api` exports no runtime value (grep gate 42). `@rtc/core-contract` depends on `core-api`, `domain` and `shared` types (+ `rxjs`) only, never `client-core`.
- Biome `nursery/useExplicitType`, ESLint `padding-line-between-statements`, `no-restricted-syntax` (name inline object types), `rtc/name-fixture-factories` (`create*`), `rtc/name-functions-by-effect`. knip: no unused exports, so Tags and helpers stay module-local unless imported, and every new client-core module a sibling imports is exported from `src/index.ts` (slice 6's B-2: knip does not catch a missing entry export).
- Never run two builds in one checkout at once; never run `pnpm mutation-check` while a gate or e2e run reads the same tree.
- Every new test is mutation-checked with `pnpm mutation-check <spec.json>` (commit first). A SURVIVED mutant is a finding about the test: strengthen the test, or ledger the mutant as equivalent (or as an untestable race guard) with the reason.
- Subscribe BEFORE driving; read post-teardown state from a FRESH subscriber's seed; in suites, settle before reading a stream (slice 6 B-1: the Effect core delivers on a fiber).
- Never pipe or filter a Playwright run being judged; judge by exit code.
- `pnpm-lock.yaml` drift → `git checkout -- pnpm-lock.yaml`, never commit it.
- Commit trailer and PR footer: the session's attribution lines.

## Rulings recorded up front

1. **Two waves (the user's choice, 2026-09-24).** The spec's "7 jarvis" row plus slice 6's moved eleven is ~4,000 lines of RxJS sharing one closure. Porting it in one go would give ~3–4k-line port PRs. Wave 1 = `dockLayoutStore`, `layoutFor`, `machines.layout`, `dockPanel`, `undockPanel`, `dismissPanel`, `resetWorkspaceLayout`, `dockedPanelIdsFor`, `workspaceLayoutResets$`, `layoutPresets`, `commands.reportDetachedPanels`, `jarvisPanels` (12). Wave 2 = `jarvis`, `jarvisUsage`, `jarvisDriver`, `jarvisDemo` (4) + `NarratorMachine` (internal, no parity row). Naming: there is **no "7a/7b"**. These are waves 1 and 2 of slice 7 (the user found "6a" misleading).
2. **Shared controllers, not ports, for synchronous logic.** Task 1 moves, behaviour-identically, into rxjs-free modules exported from `@rtc/client-core`:
   - `layout/layoutReducer.ts`: `LayoutEvent` (exported type), `createLayoutReducer(initial: LayoutState, staticIds: readonly PanelId[]): (s: LayoutState, e: LayoutEvent) => LayoutState` (today's `makeReduce`), `layoutStaticIds(initial: LayoutState): readonly PanelId[]`. `createLayoutMachine` becomes a shell over it.
   - `presenters/jarvisPanelsFolds.ts`: `isPanelEvent`, `applyPanelEvent`, `dockPanelInState`, `undockPanelInState`, `restoreDockedPanelInState`, `dismissPanelInState` (the inline filter). `MAX_LIVE_PANELS`, `MAX_DOCKED_PANELS` and `UNSUPPORTED_SENTINEL_SPEC` stay re-exported where they are.
   - `presenters/panelFrames.ts`: the pure half of `composePanelStream` — `applyTransform`, `renderViz`, the per-source row mappers, `capPoints`, and one pure step per accumulating source. Only the source subscriptions (`combineLatest`/`scan`/`shareReplay`) stay in `composePanelStream.ts`. The exact cut is made while reading the file in Step 3. The rule is "everything with no `Observable` in its signature moves".
   - `layout/workspacePersistenceWriter.ts`: export `writeWorkspaceLayout(deps: WorkspaceLayoutWriteDeps): void` (today's module-private function; `WorkspaceLayoutWriteDeps` = the current deps minus `kick$`/`debounceMs`/`scheduler`) and `WORKSPACE_PERSIST_DEBOUNCE_MS = 500`. `createWorkspacePersistenceWriter` stays as the RxJS debounce shell.
   - `layout/createLayoutPresets.ts`: `createLayoutPresets(deps, summaries: PresetSummaryChannel)`, where `interface PresetSummaryChannel { streamFor(tab, initial: () => readonly LayoutPresetSummary[]): Stream<readonly LayoutPresetSummary[]>; publish(tab, summaries): void }`. The RxJS core passes a `BehaviorSubject`-per-tab channel from composition. `withoutDockedLeaves` folds `removePanel` events through `createLayoutReducer` instead of spinning up a scratch machine.
   - `layout/workspaceDock.ts`: `createWorkspaceDock(deps: WorkspaceDockDeps): WorkspaceDock` — the dock/undock/dismiss/reset bridges, the `dockedPanelTabs` attribution, the boot restore, `dockedPanelIdsNow`, `layoutStateNow`, the persisted-seed lifecycle and the detached-panel registry, moved verbatim out of `createApp`.
     - `WorkspaceDockDeps`: `panels: { current(): readonly PanelInstance[]; dock(id); undock(id); dismiss(id); restore(id, spec) }`, `layoutFor(tab)`, `activeTab(): WorkspaceTab`, `readStoredLayout(): string | null`, `clearStoredLayout(): void`, `dockLayoutStore`, `onDockedMembershipChange(): void`, `onResetsBump(): void`.
     - `WorkspaceDock`: `dockPanel`, `undockPanel`, `dismissPanel`, `resetWorkspaceLayout`, `dockedPanelIdsNow(tab)`, `layoutStateNow(tab)`, `seedFor(tab): LayoutState | undefined`, `recordLayoutState(tab, s)`, `createdLayouts(): ReadonlyMap`, `dockedPlacements(): readonly DockedPanelPlacement[]`, `reportDetachedPanels(tab, ids)`, `detachedPanelIds(tab)`, `restorePersistedDocks(): void`.
     - Each core keeps only the streams: `dockedPanelIdsFor` (panels state × a membership kick, sorted, element-wise distinct), `workspaceLayoutResets$`, the writer debounce, and the layout-machine map.
   - Why this is not "RxJS with extra steps": none of these modules imports rxjs, and spec "imported, not duplicated" already governs pure reducers. Slice 8 moves them to `@rtc/core-logic` with the rest. Cost if wrong: slice 8 relocates more code; nothing ships incorrectly.
3. **The seam is a factory: `CoreSeams.workspace?: (jarvisEvents$: Stream<JarvisEvent>) => WorkspaceSeam`.**
   - `interface WorkspaceSeam { layoutFor; dockPanel; undockPanel; dismissPanel; livePanelIds$: Stream<readonly string[]>; dockedPanelIds$: Stream<readonly string[]>; detachedPanelIds(tab): readonly string[] }`.
   - `createApp` calls it once, right after building `jarvis`, with the same `catchError(() => EMPTY)`-guarded `jarvis.events$` it gives its own folds. When a seam is supplied, the base:
     - (a) points `jarvisDriverDeps.layout/dockPanel/undockPanel/dismissPanel/livePanelIds$/dockedPanelIds$/detachedPanelIds` at the seam;
     - (b) builds its own panels machine over `EMPTY` and skips the boot restore, so the base's `jarvisPanels` composes no port streams (the pricing port is not held twice);
     - (c) never creates its persistence writer, so the preference has exactly ONE writer.
   - `presenters.*` keep the base's own instances (the parity drift test needs them).
   - The sibling's factory builds the native workspace from the events it is handed and stashes it; after `createApp` returns, the sibling spreads the stashed members over `presenters`.
   - Wave 2 deletes the factory: once `jarvis` is native, the native core builds everything itself.
   - Witness (each sibling's `composition.seams.test.ts`): a Jarvis `layout` drive batch lands on the app's NATIVE `layoutFor("fx")`; a `dockPanel` drive command docks into the native workspace; the base's own `layoutFor("fx")` never moves; after a dock, the `workspaceLayout` preference is written exactly once per debounce window (one writer).
   - Cost if wrong: a second writer would clobber docks. The one-writer witness is the guard.
4. **Limits to `@rtc/domain`** (`packages/domain/src/workspace/workspaceLimits.ts`, the slice-6 `bootCadence` precedent): `MAX_PANEL_INSTANCES = 4`, `MAX_LIVE_PANELS = 4`, `MAX_DOCKED_PANELS = 4`, `MAX_LAYOUT_PRESETS = 10`, `WORKSPACE_PERSIST_DEBOUNCE_MS = 500`, `DRIVE_STAGGER_MS = 350`. `client-core` re-exports its existing names from these. The suites assert against them.
5. **`dockLayoutStore` provenance.** The member is `ports.dockLayoutStore ?? new InMemoryDockLayoutStore()`. A native core builds its OWN fallback (so the drift test, whose simulator ports carry no store, sees reference inequality), and passes it to its own workspace dock and presets controller. When the port IS supplied both cores return the port itself. That is correct (one store) and documented in the parity note.
6. **Contracts** (under `withFakeClock` where time moves). Panels are spawned through the delegated `jarvis`: `jarvis.intents.send("x")`, then the harness's `replyJarvis([...events, { type: "done" }])`.
   - **`layoutFor` / `machines.layout`** — the same instance per tab and across `machines.layout(tab)`. `dispose()` is inert (intents still move state after it). `maximize`/`restore`; `collapse` is idempotent; `expand`; `close` of a static id, but never the last visible one; `close` of a non-static id is a no-op; `reopen`; `openInstance` dedupes and caps at `MAX_PANEL_INSTANCES`; `closeInstance` clears that id's collapsed/maximized; `resize(path, sizes)` updates the split and clears `initialPx`, and an out-of-range path is a no-op; `reset` → initial; `replaceLayout(s)` → `s`.
   - **Persistence round-trip** (writer + seed) — app 1 maximizes on `fx`; nothing is written before `WORKSPACE_PERSIST_DEBOUNCE_MS`, and exactly one write lands at it (a second kick inside the window restarts it). App 2, seeded with that string, starts `layoutFor("fx")` maximized. Merely opening a tab writes nothing. A tab app 1 never opened keeps app 2's seed. A rejected dock of an unknown id writes nothing.
   - **`dockPanel`** — a spawned panel docks: `jarvisPanels.dockedPanels$` lists it, `layoutFor(active)` gains its leaf, and `dockedPanelIdsFor(active)` = `[id]`. No-ops (tree and panels unchanged): a static id (read from `layoutFor("fx")`'s initial leaves), an `eq-chart:` instance id, an unknown id, a second dock of the same id, and a fifth dock past `MAX_DOCKED_PANELS`. Attribution: dock on `fx`, switch nav to `credit`, and `dockedPanelIdsFor("fx")` still lists it while `credit` does not.
   - **`undockPanel`** — the leaf leaves the tab it was docked INTO, even when another tab is active. The panel returns to floating. When floating would exceed `MAX_LIVE_PANELS`, the OLDEST other floating panel is evicted, never the undocked one. Undocking a floating or unknown id is a no-op.
   - **`dismissPanel`** — a docked panel: leaf detached and panel gone, and no floating panel is evicted. A floating panel is simply gone.
   - **`resetWorkspaceLayout`** — right after: stored preference `null`, every created layout back to initial, every docked panel dismissed (floating ones kept), all four `dockLayoutStore` blobs cleared, `workspaceLayoutResets$` +1 exactly once and LAST. A tab first opened after the reset starts from the default tree, not the pre-reset seed (the mutable-seed rule).
   - **`workspaceLayoutResets$`** — replays `0` to a late subscriber; +1 per reset, per preset `load`, per `resetTab`.
   - **`dockedPanelIdsFor`** — sorted; no re-emission on a panels change that leaves the tab's membership unchanged (a spawn of an unrelated floating panel).
   - **`layoutPresets`** — `save` → `unavailable` with no snapshot source. `invalid` with problem `empty` / `too-long` / `reserved`. `exists` on a case-insensitive name clash, `saved` with the same id under `{ replace: true }`. `full` at `MAX_LAYOUT_PRESETS`. `storage-failed` when the store drops writes. `store-unreadable` when the stored list is garbage.
     - `presetsFor(tab)` replays the current list and updates after each write.
     - `load`: writes the preset's blob to `dockLayoutStore`, replaces the layout, re-inserts the tab's currently docked leaves, bumps resets LAST; `false` for an unknown or unreadable id.
     - `resetTab`: clears the tab's blob, resets the layout, keeps docked leaves, bumps.
     - `remove` of the unreadable-list row clears the whole list.
   - **`jarvisPanels`** — a `panel` event spawns a live floating panel with its spec's title/rationale/viz. A second event for the same id edits in place and keeps `docked`. The fifth floating spawn evicts the oldest floating panel and never a docked one. Raw `dismissPanel` removes it. `restoreDockedPanel` appends a docked panel (a known id is ignored; past `MAX_DOCKED_PANELS` it is dropped). `floatingPanels$`/`dockedPanels$` partition `panels$`. `panelData$(unknown)` emits `null`. A live `fx`-source panel's `panelData$` emits a frame after a price tick. Uncontracted: the unsupported-sentinel path (the sentinel is produced by the adapters, not reachable from ports), ledgered.
   - **`commands.reportDetachedPanels`** — observable only through the driver: after `reportDetachedPanels("fx", ["fx-rates"])`, a drive batch `layout maximize fx fx-rates` leaves `maximized` null. After `reportDetachedPanels("fx", [])`, the same batch applies (one `DRIVE_STAGGER_MS` later).
   - **`dockLayoutStore`** — `save`/`load`/`clear` round-trip per tab, tabs independent; the store `resetWorkspaceLayout` clears and `load` writes is this very object.
7. **Port discipline** gains `jarvis.ask`: zero calls at construction; one per `send`. (Wave 2 widens it.)
8. **Counts:** wave 1 → 58 + 12 = **70** native per sibling; `PENDING_SUITES` 16 − 12 = **4**. Effect layers 47 + the wave-1 Tags (counted when written; the plan does not guess).

## Review Focus

1. **Reload with a docked panel whose spec the parser now rejects** — expected: the whole payload is refused (fail-closed) and the workspace boots default, with nothing half-restored. Task 3 adds a round-trip case: a payload hand-corrupted after app 1's write seeds app 2 at the default tree with no docked panels.
2. **Dock, then reset, then dock again in the same session** — expected: the second dock works and persists (a stale attribution or cap would refuse it). Task 3's reset suite covers it.
3. **Dismissing the only docked panel while its tab is not active** — expected: the leaf leaves the right tab. Task 3's dismiss suite docks on `fx`, switches to `admin`, dismisses, and asserts on `fx`'s tree.
4. **A preset saved with docked panels present** — expected: the saved layout carries no docked leaves, and loading it on a session with different docked panels re-inserts THOSE panels. Task 3's presets suite covers it.
5. **Rapid layout churn** (ten resizes inside one debounce window) — expected: one write. Task 3's round-trip case covers it.

## File structure

```
packages/domain/src/workspace/workspaceLimits.ts                  NEW  ruling 4
packages/client-core/src/layout/layoutReducer.ts                  NEW  ruling 2
packages/client-core/src/layout/workspaceDock.ts                  NEW  ruling 2 (moved out of composition.ts)
packages/client-core/src/presenters/jarvisPanelsFolds.ts          NEW
packages/client-core/src/presenters/panelFrames.ts                NEW  (pure half of composePanelStream)
packages/client-core/src/{presenters/LayoutMachine,presenters/JarvisPanelsMachine,presenters/composePanelStream,layout/createLayoutPresets,layout/workspacePersistenceWriter,composition,index}.ts  MOD
packages/core-contract/src/harness/scriptedPorts.ts               MOD  scripted jarvis, stores, workspaceLayout seed + verbs
packages/core-contract/src/suites/{layout,workspacePersistence,dockPanel,undockPanel,dismissPanel,resetWorkspaceLayout,workspaceLayoutResets,dockedPanelIdsFor,layoutPresets,jarvisPanels,reportDetachedPanels,dockLayoutStore}.ts  NEW
packages/core-contract/src/suites/portDiscipline.ts               MOD  jarvis.ask
packages/core-contract/src/registry.ts (+ .test.ts)               MOD  PENDING_SUITES 4
packages/client-core-async/src/{machines/layout,presenters/workspace,presenters/jarvisPanels}.ts  NEW (+ tests)
packages/client-core-effect/src/{machines/layout,presenters/workspace,presenters/jarvisPanels}.ts NEW (+ tests)
packages/client-core-{async,effect}/src/{composition.ts|layers.ts,parity.json,composition.seams.test.ts}  MOD
docs: ADR-006, §22, STATUS, CLAUDE.md, both READMEs, spec receipt, the rulings file  MOD
```

(each new source file gets its co-located `*.test.ts`)

---

## Wave 1 · PR A — the RxJS side

### Task 0: Doc nits carried from slice 6

- [ ] **Step 1:** Rename "slice 6a" → "slice 6" wherever it names the shipped slice: CLAUDE.md (package table + Application core rule), both alternative cores' READMEs, §22, ADR-006's "Decided in slice 6a" heading, the spec's receipt line, STATUS. Keep the rulings file's historical text and fix only its title. Verify: `rg -n "slice 6a|Slice 6a"` over `docs/ CLAUDE.md packages/*/README.md` returns only deliberate historical mentions.
- [ ] **Step 2:** STATUS: under the pluggable-core entry, one pointer line per shipped slice's residuals ("slice 5 residuals: none open — ledger [link]", "slice 6: B-7 untested Effect boot skip guard — ledger [link]"). `pnpm check:doc-links`. Commit `docs(pluggable-core): slice 6 naming and residual pointers`.

### Task 1: Extract the shared controllers and limits; the `workspace` seam

**Produces:** the ruling-2 modules and names; ruling 4's constants; `CoreSeams.workspace`, `WorkspaceSeam` (exported from `composition.ts`). All client-core additions are exported from `src/index.ts`.

- [ ] **Step 1:** Domain constants + test (values as ruling 4). client-core's `MAX_PANEL_INSTANCES`, `MAX_LIVE_PANELS`, `MAX_DOCKED_PANELS`, `MAX_LAYOUT_PRESETS`, `DRIVE_STAGGER_MS` become re-exports.
- [ ] **Step 2:** `layoutReducer.ts`: move `makeReduce`/`resizeAt`/`LayoutEvent` verbatim, then rewrite `createLayoutMachine` over it. `jarvisPanelsFolds.ts` likewise for the panels machine. Run `pnpm --filter @rtc/client-core test`: every existing LayoutMachine/JarvisPanels test passes unchanged. Add direct reducer tests only where a folded branch had none (check `coverage:gaps` for the new files).
- [ ] **Step 3:** `panelFrames.ts`: read `composePanelStream.ts` whole, move everything whose signature has no `Observable`, and leave the source subscriptions. Existing `composePanelStream` tests pass unchanged.
- [ ] **Step 4:** Writer: export `writeWorkspaceLayout` + `WorkspaceLayoutWriteDeps`, and make the shell debounce on `WORKSPACE_PERSIST_DEBOUNCE_MS`. Presets: introduce `PresetSummaryChannel`, the RxJS channel in composition, and `withoutDockedLeaves` over the reducer. Existing tests pass.
- [ ] **Step 5:** `workspaceDock.ts`: move the composition closure (ruling 2's list) verbatim behind `createWorkspaceDock(deps)`. `createApp` now holds only the streams around it (`latestPanels` mirror → `panels.current`, `latestActiveTab` → `activeTab`, the kicks, `dockedPanelIdsFor`'s `combineLatest`). Run every `composition.*.test.ts`: all pass unchanged. This is the step most likely to regress, so diff the moved lines against the originals (`git diff --color-moved`) before running.
- [ ] **Step 6:** The seam (ruling 3): `createApp` calls `seams.workspace?.(guardedEvents$)`; branches (a)(b)(c). client-core test: `createApp(ports, { workspace: fakeFactory })` hands the fake the guarded events; a `layout maximize` drive batch reaches the fake's `layoutFor`; the base's own `layoutFor("fx")` is untouched; after spawning and docking through the fake, `ports.preferences.workspaceLayout$()` sees no base write within 2× the debounce.
- [ ] **Step 7:** Mutation-check Steps 1 and 6 (and any reducer tests added in Step 2). Commit: `refactor(client-core): the workspace's shared controllers; CoreSeams.workspace`.

### Task 2: Harness — scripted Jarvis, the two stores, the stored workspace

**File:** `packages/core-contract/src/harness/scriptedPorts.ts` (+ test).

**Produces:**
- Seed fields `workspaceLayout?: string | null`, `dockLayouts?: Partial<Record<WorkspaceTab, string>>`, `layoutPresets?: Partial<Record<WorkspaceTab, string>>`, `presetStoreDropsWrites?: boolean`.
- Driver verbs:
  - `pendingAsks(): readonly string[]`;
  - `replyJarvis(events: readonly JarvisEvent[]): void`: emits to the OLDEST pending ask, completing after a `done`/`error`;
  - `storedWorkspaceLayout(): string | null`, read on the UNCOUNTED base preferences port;
  - `dockLayout(tab): string | null`;
  - `presetList(tab): string | null`.
- `PortMethodName` + `"jarvis.ask"`.

- [ ] **Step 1:** Tests: asks queue FIFO and `replyJarvis` settles the oldest; `confirm` is accepted and ignored; both stores start at their seeds and writes show through the verbs; `presetStoreDropsWrites` makes `load` return the pre-write value; the `workspaceLayout` seed reaches `preferences.workspaceLayout$()` and `storedWorkspaceLayout()` follows `setWorkspaceLayout`. Run — fails.
- [ ] **Step 2:** Implement with `createPendingQueue` (as `pendingLogins`), closure-backed Map stores (core-contract cannot import client-core's InMemory stores), and `countCalls` on the jarvis port with prefix `"jarvis."`. Run — passes. Mutation-check. Commit.

### Task 3: Twelve suites, port discipline, registry — then ship PR A

- [ ] **Step 1:** One suite file per ruling-6 group (file list above), each case exactly as ruling 6 states it, plus Review Focus 1–5. The suite-local helper `collectLeafIds(node)` walks a `LayoutNode`. Static ids come from `layoutFor(tab)`'s initial state, never a hard-coded list.
- [ ] **Step 2:** `portDiscipline`: `jarvis.ask` — zero after construction; one per `send`.
- [ ] **Step 3:** Register the twelve; `PENDING_SUITES` = `jarvis`, `jarvisUsage`, `jarvisDriver`, `jarvisDemo` (4); `registry.test.ts` count.
- [ ] **Step 4:** The RxJS runner is green; both sibling runners are green (they delegate). Mutation-check every suite case against the RxJS core: one mutant per contract point, in the SHARED controller where the rule now lives, plus one in each RxJS stream shell (`dockedPanelIdsFor` distinct/sort, writer debounce, resets bump order).
- [ ] **Step 5:** Commit this plan + `2026-09-24-pluggable-core-slice-7-rulings.md` (the live ledger). Full gauntlet; one read-only reviewer on the diff; take its findings; push; CI; merge.

## Wave 1 · PR B — the async core

### Task 4

- [ ] **Step 1: `machines/layout.ts`** — `createLayoutMachine(initial, seed?)`: `createStore(seed ?? initial)`, each intent `store.set((s) => reduce(s, event))` (the Store's `Object.is` drop matches `state()`'s distinct); `storeToWarmStateStream`. `layoutFor` = the per-tab map of inert-dispose handles.
- [ ] **Step 2: `presenters/jarvisPanels.ts`** — the machine: `createStore({ panels: [] })`, with the jarvis events relayed via `relay(..., lifetime)` into `applyPanelEvent`, and the intents over the folds. As in RxJS, every intent writes a FRESH state object (the writer dedupes on the `panels` array, not the state). The presenter: `panels$`/`docked`/`floating` as mapped state streams; the per-panel data cache synced on each state; `panelData$(id)` a refCounted, switch-on-roster topic (replay 1); the panel data sources from `panelFrames` over `topicFromObservable` port bridges.
- [ ] **Step 3: `presenters/workspace.ts`** — `createWorkspaceDock` wired to the native panels machine, native `workspaceNav`, and native layout map. `dockedPanelIdsFor(tab)` = a derived stream over (panels state, membership store), sorted, element-wise distinct. `workspaceLayoutResets$` = `createStore(0)`. The writer = a kick that restarts a `sleep(WORKSPACE_PERSIST_DEBOUNCE_MS)` run in `createRunSlot`, then calls `writeWorkspaceLayout`. Presets via a Store-per-tab `PresetSummaryChannel`. `dockLayoutStore` per ruling 5.
- [ ] **Step 4:** Composition: the `workspace` factory (ruling 3) builds Steps 1–3 from the handed events; after `createApp`, spread the twelve; `commands.reportDetachedPanels` native; `composeMachines` gets `layout: (tab) => native.layoutFor(tab)`. `parity.json` twelve `"native"`. Ruling-3 witnesses. Unit tests per file. `pnpm --filter @rtc/client-core-async test`. Mutation-check; `VITE_CORE_IMPL=async pnpm test:e2e` (the Jarvis/dock e2e are the integration witness); full gauntlet; one reviewer; ship.

## Wave 1 · PR C — the Effect core

### Task 5

- [ ] Same twelve, as slice 6's Effect half: `SubscriptionRef` + `refToWarmStateStream` for each layout machine, the panels state and the resets counter. The jarvis events enter through `scopedPortStream` in the parent host. The writer is a debounce token plus `Effect.sleep` in a child host (the throughput-presenter precedent). `panelData$` is a `sharedFold`/`Stream.flatMap({ switch: true })` over the roster. One module-local Tag + Layer per member; `layers.test.ts` count updated. Unit tests tick before reading. Composition factory as Task 4. `parity.json`; witnesses; mutation-check; `VITE_CORE_IMPL=effect pnpm test:e2e`; gauntlet; reviewer; ship.
- [ ] Docs with the last wave-1 PR: ADR-006 "Decided in slice 7 — wave 1" (rulings 2, 3, 5 plus anything execution changed); §22 counts + the workspace shapes; spec receipt; STATUS (70/74, wave 2 next); CLAUDE.md counts; both READMEs; the rulings ledger.

## Wave 2 — outline (planned in its own file once wave 1 ships)

- Members: `jarvis` (947-line machine: entries, turn phases, confirmation countdown `JARVIS_CONFIRM_TIMEOUT_MS`, availability/brain/effort, drive-outcome records), `jarvisUsage`, `jarvisDriver` (the staggered DriveCommand interpreter), `jarvisDemo` (scripted steps, settle detection), and the internal `NarratorMachine`.
- Same shape: extract pure folds (`JarvisMachine`'s patches, the driver's command interpreter, the demo's step table and settle predicate, the narrator's anomaly detector) → suites → async → Effect.
- The `workspace` factory seam is deleted. The native core builds jarvis first and hands its own `events$` to its own workspace. `CoreSeams` shrinks toward slice 8's deletion.
- Seams still needed for the base's leftover readers: whatever `wireJarvisHistorySource` and the narrator need, re-derived when planning. `setHistorySource` is a PORT method both cores would call, so exactly one core must.

## Self-review

**Spec coverage.** Row "7 jarvis": wave 2 (outlined). Row "6 shell"'s moved layout/dock family: wave 1 Tasks 1–5. "Imported, not duplicated": ruling 2, Task 1. "Driver verbs arrive with the slices that assert on them": Task 2. The doc nits promised at slice 6's close: Task 0.

**Placeholders.** None are left in the plan text. Two cuts are decided during execution, by a stated rule and not a guess: the `panelFrames` split (Task 1 Step 3, "no `Observable` in the signature") and the Effect layer count (ruling 8, counted when written).

**Type consistency.** `createLayoutReducer`, `LayoutEvent`, `layoutStaticIds`, `createWorkspaceDock`/`WorkspaceDockDeps`/`WorkspaceDock`, `writeWorkspaceLayout`/`WorkspaceLayoutWriteDeps`, `PresetSummaryChannel`, `CoreSeams.workspace`/`WorkspaceSeam`, `pendingAsks`/`replyJarvis`/`storedWorkspaceLayout`/`dockLayout`/`presetList`. They are defined in Tasks 1–2 and consumed by name in 3–5. Counts: 58 + 12 = 70; 16 − 12 = 4.

**Review Focus.** Five lines, each with its test assigned to Task 3.
