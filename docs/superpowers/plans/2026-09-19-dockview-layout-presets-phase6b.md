# Dockview Layout Presets (Phase 6b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-tab named layouts — save the tab's whole visible arrangement under a name, load it back, delete it — plus a built-in **Default** row that resets just that tab, all from a LAYOUTS section in the View menu.

**Architecture:** A raw-string `LayoutPresetStore` port (twin of `DockLayoutStore`) holds each tab's preset list; a framework-free `createLayoutPresets(deps)` controller in `@rtc/client-core` owns every rule (name validation, cap, unreadable records, load order) and is instantiated once by composition as `Presenters.layoutPresets` and once per contract World by the fakes, so the rules exist in exactly one place. Save reads a **live** engine snapshot the Dockview bridge registers (`DockEngine.snapshotLayout()`); load writes the preset blob to `DockLayoutStore`, replaces layer 2 through a new `replaceLayout` intent, then bumps the existing `workspaceLayoutResets$` counter so the bridge's already-shipped in-place rebuild (and its save-suppression guard) loads the written blob. Task 1 measures that rebuild path before anything depends on it.

**Tech Stack:** TypeScript, RxJS (`BehaviorSubject` inside `client-core` only), `dockview@8.3.1` via `@rtc/layout-dockview`, React 19 + SolidJS clients, vitest (+ jsdom / vitest-browser), `@rtc/ui-contract` swap-trio contract specs, Playwright (e2e + visual goldens).

**Spec:** [../specs/2026-09-15-dockview-floats-and-presets-design.md](../specs/2026-09-15-dockview-floats-and-presets-design.md) — §4 is this phase; §3 (floats) shipped as Phase 6a (#763, follow-ups #769–#792).

**Precedent to read first:** [2026-09-16-dockview-floating-groups-phase6a-rulings.md](2026-09-16-dockview-floating-groups-phase6a-rulings.md) — how 6a's plan met reality. Several of its rulings (the rebuild trap, jsdom's blind spots, the `api.groups` filter) bind here too.

**Execution rulings:** [2026-09-19-dockview-layout-presets-phase6b-rulings.md](2026-09-19-dockview-layout-presets-phase6b-rulings.md) — every decision taken while executing this plan (pre-execution rulings P1–P6, pre-flight rulings R1–R2, and each ledger ruling made task by task), with its rationale and what it costs if wrong.

## Global Constraints

- **Both web clients move together.** Every UI addition ships in `client-react` and `client-solid`; the shared contract specs in `@rtc/ui-contract` run against both via the swap-trio.
- **Dumb UI:** no rxjs / localStorage / fetch in `src/ui` (grep gates); no inline `style={{…}}` (ESLint AST rule); CSS Modules only; `#/` subpath-alias imports.
- **Handler naming** (`docs/handler-naming.md`, `rtc/name-functions-by-effect`): concrete handlers named for their effect (`saveCurrentLayout`, `loadLayoutPreset`, `deleteLayoutPreset`); `onX` only for slots (`onSnapshotSourceChange`).
- **React Compiler by default** in `client-react` — no hand-rolled `memo`/`useMemo`/`useCallback`. Solid: hoist any handler chosen by a ternary into a `createMemo` in the row's setup scope (the #792 leak: a ternary inside a prop getter creates an unowned computation on every read).
- **Nothing may degrade the in-house engine.** Under in-house only `Default` renders and it must work there; the in-house visual assert runs locally before merge.
- **Presets are Dockview-only; Default works under both engines** (spec §1 decided-scope table).
- **Absence must be structurally distinguishable** (repo-recurring class): an unreadable record is surfaced as `readable: false`, never dropped; a save with no live engine reports `unavailable`, never falls back to the debounced store.
- **`Presenters.resetWorkspaceLayout()` must not touch any preset store** — asserted by a test (spec §4.2).
- **Braces mandatory** (Biome `useBlockStatements`); `pnpm exec biome ci .` is the format+import-sort gate; Biome warnings fail CI (#780).
- **Test fixtures** (CLAUDE.md §Test Fixtures): a JSON payload is an object literal + `JSON.stringify`, never a pasted string (`rtc/no-minified-json-literal`); a large fixture lives in a `create*` factory declared below the cases (`rtc/json-fixtures-in-factories`, `rtc/name-fixture-factories`). A Dockview blob fixture is captured from a real engine's `onLayoutChange`, never hand-written.
- **Per-file coverage**, not the aggregate: both ≥95% contract gates pass and `pnpm coverage:gaps` shows no new weak file.
- **`/rtc:gauntlet full` before every push**; PR CI matched by `headSha`; CodeQL open-alert check before merge; merge with `gh pr merge --merge`. Never write the literal skip-CI marker in a commit message.

## Pre-execution rulings (taken while writing this plan; each deviates from or fills a gap in the spec)

- **P1 — The store port is raw strings, not typed records.** Spec §4.1 sketches `list/save/remove` over `StoredLayoutPreset`. Each web client carries its OWN `LocalStorage*Store` copy (see `LocalStorageDockLayoutStore` ×2), so a typed port would put parsing and the unreadable-record rule into three adapters (two localStorage + in-memory). Instead `LayoutPresetStore` mirrors `DockLayoutStore` (`load(tab): string | null` / `save(tab, serialized)`), and one codec in `client-core` parses and serializes. *Why:* one implementation of the only tricky part. *Cost if wrong:* a later server-side store would want typed records — a new port then, the codec moves behind it; nothing UI-facing changes.
- **P2 — Docked Jarvis panels are excluded from presets, and survive a load or a Default in place.** `PersistedTabLayout` carries `docked: DockedPanelEntry[]`, but a docked panel is *live session content* owned by `JarvisPanelsMachine` (global `MAX_DOCKED_PANELS = 4`, session-unique ids, a live roster). Restoring one from a preset can collide with a live id or break the cap. So save strips docked leaves (layer 2 `docked: []`, tree without their leaves; the bridge's `dynamicPanels` reconcile already drops them from the blob on load), and load/Default re-inserts the tab's *currently* docked panels via `insertPanel`. One rule for both: **a layout operation rearranges; it never creates or destroys content.** Chart instances ARE recorded — they are layer-2 `instances` with no outside owner. *Cost if wrong:* a user who expected Jarvis panels to come back with a preset — they are still there, just re-docked in the dock column; the reverse (resurrecting a dismissed panel) would have been worse.
- **P3 — The draft name lives in component state; the rules live in core.** Spec §4.4 says "the dumb-UI rule keeps the value in the presenter". The dumb-UI rule bans rxjs/localStorage/fetch in `src/ui`, not view state — `ViewMenu` already holds `open` in `useState`. The draft string is the same kind of ephemeral view state. Every *rule* (trim, length, reserved, duplicate, cap) is `validateLayoutPresetName` + the controller's `save` result in `client-core`. *Cost if wrong:* moving a string into the presenter later is local to two components.
- **P4 — Rebuild reuses `workspaceLayoutResets$`.** Only the active tab's engine is mounted (`App`'s `key={activeTab}`), and both bridges already rebuild in place on a bump with the save-suppression guard. A second counter would duplicate that effect in both bridges. The counter's name now understates it; its doc comment is updated, and a rename is out of scope (it would churn ~12 fake/binding files for no behaviour). *Cost if wrong:* Task 1 finds the rebuild inexact → the spec's fallback (in-place `api.fromJSON`) is taken instead; see Task 1's decision gate.
- **P5 — Visual: the new Dockview menu shot is single-engine.** Spec §4.5 asks for Dockview and in-house variants. The in-house variant is the EXISTING `shell/view-menu-open` (it now shows the `Default` row, so its golden repaints). The Dockview one is a new `shell/view-menu-layouts-dockview` with seeded presets and **no un-suffixed twin**: an engine pair whose rows differ by design would read as a whole-row divergence in `pnpm visual:engine-parity` forever. `enginePairs.ts` already skips a `-dockview` scenario with no sibling. *Cost if wrong:* one extra scenario later.
- **P6 — A wholly unreadable preset list surfaces as ONE unreadable row** (id `UNREADABLE_LIST_ID`), and `save` refuses (`store-unreadable`) until that row is deleted — deleting it clears the key. Overwriting silently would destroy the user's data; dropping it silently is the absence class. *Cost if wrong:* a user with corrupt storage must click delete once before saving.

## File Structure

| File | Responsibility |
|---|---|
| `packages/layout-dockview/src/createDockEngine.ts` | `snapshotLayout(): string` (pure read of what the next save would write) |
| `packages/core-api/src/adapters.ts` | `LayoutPresetStore` port |
| `packages/core-api/src/machines/layout.ts` | `LayoutIntents.replaceLayout(state)` |
| `packages/core-api/src/layoutPresets.ts` (new) + `index.ts` | `LayoutPresetSummary`, `SaveLayoutPresetResult`, `LayoutPresetNameProblem`, `LayoutPresetsPresenter` |
| `packages/core-api/src/app.ts` | `AppPorts.layoutPresetStore?`, `Presenters.layoutPresets` |
| `packages/client-core/src/presenters/LayoutMachine.ts` | `replaceLayout` reducer case |
| `packages/client-core/src/layout/layoutPresetCodec.ts` (new) | versioned record codec, name rules, constants |
| `packages/client-core/src/layout/createLayoutPresets.ts` (new) | the controller (save/load/remove/resetTab/snapshot registry) |
| `packages/client-core/src/adapters/InMemoryLayoutPresetStore.ts` (new) | default store |
| `packages/client-core/src/composition.ts` | wiring; `resetWorkspaceLayout` leaves presets alone |
| `packages/client-core-{async,effect}/src/parity.json`, `packages/core-contract/src/registry.ts` | delegation + PENDING bookkeeping |
| `packages/client-{react,solid}/src/app/adapters/LocalStorageLayoutPresetStore.ts` (+ test) | key `rtc-layout-presets-${tab}` |
| `packages/client-{react,solid}/src/app/buildBrowserPorts.ts` | pass the store |
| `packages/{react,solid}-bindings/src/createViewModel.ts` | `useLayoutPresets(tab)`, `useRegisterLayoutSnapshot()` |
| `packages/client-{react,solid}/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` | `onSnapshotSourceChange` slot |
| `packages/client-{react,solid}/src/ui/App.tsx` | wires the slot |
| `packages/client-{react,solid}/src/ui/shell/chrome/LayoutPresetsSection.tsx` + `.module.css` (new) | the LAYOUTS section |
| `packages/client-{react,solid}/src/ui/shell/chrome/ViewMenu.tsx` | renders the section |
| every fake: `client-{react,solid}/tests/ui/contract/*/viewModelFromWorld.ts`, `client-{react,solid}/tests/ui/visual/*/buildFakeViewModel.ts`, `client-react-native/tests/visual/fake/{inert,sliceTypes}.ts` | new hooks |
| `packages/ui-contract/src/shared/pages/shell/chrome/ViewMenuPage.ts`, `src/specs/shell/chrome/LayoutPresets.contract.spec.ts` (new) | shared contract coverage |
| `packages/ui-contract/src/visual/{appData,fixtures,scenarios,scenarioActions}.ts` + goldens | the new visual state |
| `tests/browser/page-objects/{contracts,playwright}/Layout.ts`, `tests/browser/scenarios/layout.ts`, `tests/browser/playwright/layout.spec.ts` | e2e |
| `packages/layout-dockview/README.md`, `docs/adr/ADR-002-layout-management-port.md`, `docs/STATUS.md` | docs |

---

### Task 1: Probe the rebuild-on-load path (tests only — spec §4.2 step 4)

The spec forbids assuming step 4. #738 showed layer-2 replay effects only reaching a second engine instance under specific ordering. This task measures, in **both** bridges, whether the shipped `layoutResets` rebuild does exactly what a preset load needs, and commits the measurements as permanent regression tests. No `src/` change.

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.docked.test.tsx` (or a new sibling `DockviewLayoutEngine.presetLoad.test.tsx` using the same page, `tests/ui/pages/DockviewLayoutEngineDockedPage.tsx`, which already accepts `layoutResets`)
- Create: the Solid twin under `packages/client-solid/src/ui/shell/layout/dockview/__tests__/`

**Interfaces:**
- Consumes: `DockviewLayoutEngineDockedPage` (props `layoutResets`, `collapsed`, `maximized`, `closed`, `instances`, `docked`, `store`), `InMemoryDockLayoutStore`, the engine's `serializeLayout` output shape.
- Produces: four recorded answers (in the task report AND as assertions) that Task 5's load order depends on.

The four questions, each ending as an assertion:

1. **Blob wins.** Render with blob A in the store. In ONE `act`: `store.save(tab, B)` where B differs structurally (e.g. blotter stacked onto rates — produce B by driving a real engine and capturing its `onLayoutChange` write, never hand-writing dockview JSON), change the layer-2 props, and bump `layoutResets`. After the act, the live DOM reflects B (group count / stacked tab witness).
2. **Layer 2 replays onto the NEW engine.** The same act sets `collapsed: ["fx-analytics"]`; afterwards the analytics strip is present on the new engine (the strip witness the collapse tests already use), not lost to the dispose.
3. **No stale overwrite.** Advance timers past the engine debounce (250 ms) plus the bridge's own; `store.load(tab)` still equals B, or a blob the NEW engine wrote from B (assert it carries B's distinguishing structure) — never A.
4. **Docked panels reconcile.** With a docked panel in `docked`, blob B lacking it: after the rebuild, the docked panel's group is present (the `dynamicPanels` reconcile adds it).

- [ ] **Step 1:** Write the React probe with all four assertions; run `pnpm --filter @rtc/client-react exec vitest run src/ui/shell/layout/dockview/__tests__/<file>`.
- [ ] **Step 2:** Write the Solid twin; run `pnpm --filter @rtc/client-solid exec vitest run src/ui/shell/layout/dockview/__tests__/<file>`.
- [ ] **Step 3: Decision gate.** All four green on both clients → Task 5's load order stands as written (store write → `replaceLayout` → counter bump). Any red → STOP the load-order part of Task 5 and rule: the fallback is an engine method `restoreLayout(blob: string): void` doing an in-place `api.fromJSON` on the live instance; record the measurement and the ruling in the ledger before Task 5 is dispatched.
- [ ] **Step 4:** Pop-out windows cannot be opened in jsdom (the 6a finding: only the blocked `window.open` branch is witnessable). Record that question 5 — "a live pop-out closes and its panel lands per the preset" — is deferred to Task 10's e2e.
- [ ] **Step 5: Commit** — `test(dockview): measure the layoutResets rebuild as a preset-load path (both bridges)`

---

### Task 2: Engine — `snapshotLayout()`

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (the `serializeLayout` closure near `:352`, the `DockEngine` interface near `:190-256`)
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Produces: `DockEngine.snapshotLayout(): string` — the exact string the next `onLayoutChange` write would carry, with NO side effects.

`serializeLayout()` today both builds the JSON and clears `seededStripSizes` / `seededFlipSizes` (a save expires unconsumed seeds). Split it:

```ts
/** The blob `serializeLayout` hands onLayoutChange — pure: no seed expiry,
 * no callback. `snapshotLayout()` exposes it so a preset save captures the
 * LIVE arrangement rather than the debounced store's last write. */
function buildLayoutBlob(): string {
  const stripGeometry = stripGeometrySidecar();
  const floatSizes = floatSizesSidecar();
  return JSON.stringify({ /* the existing object literal, unchanged */ });
}

function serializeLayout(): void {
  // Order matters: the existing body reads the sidecars AFTER clearing the
  // seeds — keep that order so the persisted bytes are unchanged.
  seededStripSizes.clear();
  seededFlipSizes.clear();
  opts.onLayoutChange(buildLayoutBlob());
}
```

Verify the clear-then-build order against the current body before moving it — if the sidecars read the seed maps, the snapshot must reproduce what a save *would* write, so document whichever order the existing code has and keep it.

- [ ] **Step 1: Failing tests.** (a) After a drag-free construction plus one `collapsePanel`, `engine.snapshotLayout()` equals the string the next `onLayoutChange` receives once timers flush. (b) Calling `snapshotLayout()` twice in a row with a pending seed does not change the next persisted write (no side effect). (c) While a float is open, the snapshot carries `floatingGroups` and no `popoutGroups` (it goes through the same scrubs).
- [ ] **Step 2:** Run `pnpm --filter @rtc/layout-dockview exec vitest run src/createDockEngine.test.ts -t snapshotLayout` — FAIL (`snapshotLayout is not a function`).
- [ ] **Step 3:** Implement as above; add the method to the returned object and the interface doc.
- [ ] **Step 4:** Run the whole engine suite — PASS, and no existing assertion on persisted bytes changes.
- [ ] **Step 5: Commit** — `feat(layout-dockview): snapshotLayout — the live blob without the debounce`

---

### Task 3: Layer 2 — the `replaceLayout` intent

**Files:**
- Modify: `packages/core-api/src/machines/layout.ts`, `packages/client-core/src/presenters/LayoutMachine.ts`
- Modify (compile only — add the method): every hand-built `LayoutIntents` object. Find them with `grep -rn "closeInstance:" packages --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v /dist/` (visual fakes build no-op intents).
- Test: `packages/client-core/src/presenters/__tests__/LayoutMachine.test.ts` (or wherever the reducer tests live — `grep -rln "createLayoutMachine" packages/client-core/src --include='*.test.ts'`)

**Interfaces:**
- Produces: `LayoutIntents.replaceLayout(state: LayoutState): void`.

```ts
// core-api/src/machines/layout.ts, after reset():
  /** Replace the whole layer-2 state — tree, `maximized`, `collapsed`,
   * `closed`, `instances` — with `state` (a layout preset load). The caller
   * validates `state` first (`parseLayoutPresetList` does, through
   * `parseWorkspaceLayout`'s walk); the reducer trusts it. `staticIds` keep
   * deriving from `port.initial`, so a replaced tree's dock column is still
   * recognised as one. */
  replaceLayout(state: LayoutState): void;
```

Reducer: `| { type: "replaceLayout"; state: LayoutState }` → `case "replaceLayout": return event.state;` plus a `replaceLayout$` Subject merged, exposed, and completed in `dispose` exactly like `reset$`.

- [ ] **Step 1: Failing tests.** (a) `replaceLayout(s)` emits `s` verbatim (reference-equal). (b) After a replace whose tree has no dock column, `insertPanel("jarvis-x")` builds exactly one column (staticIds unaffected). (c) `reset()` after a replace returns `port.initial`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement; add a no-op `replaceLayout` to every hand-built intents object the grep finds.
- [ ] **Step 4:** `pnpm --filter @rtc/client-core test` and `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(client-core): LayoutIntents.replaceLayout for preset loads`

---

### Task 4: Preset codec, name rules, store port

**Files:**
- Create: `packages/core-api/src/layoutPresets.ts` (types only — grep gate 42: core-api exports no runtime value), export from `packages/core-api/src/index.ts`
- Modify: `packages/core-api/src/adapters.ts` (the port)
- Create: `packages/client-core/src/layout/layoutPresetCodec.ts` + `packages/client-core/src/layout/__tests__/layoutPresetCodec.test.ts`
- Create: `packages/client-core/src/adapters/InMemoryLayoutPresetStore.ts` (+ test mirroring `InMemoryDockLayoutStore.test.ts`)
- Modify: `packages/client-core/src/layout/index.ts`, `packages/client-core/src/index.ts` (exports)

**Interfaces — produces (verbatim; later tasks import these names):**

```ts
// core-api/src/adapters.ts — beside DockLayoutStore
/** Per-tab persistence for a tab's saved layout presets, as ONE opaque
 * serialized list per tab (`serializeLayoutPresetList`'s output). A raw
 * string on purpose — the twin of `DockLayoutStore`: every rule (versions,
 * unreadable records, names) lives once in client-core's codec, not in each
 * client's adapter copy. `load` returns null when nothing is stored. */
export interface LayoutPresetStore {
  load(tab: string): string | null;
  save(tab: string, serialized: string): void;
  clear(tab: string): void;
}
```

```ts
// core-api/src/layoutPresets.ts
import type { Stream } from "#/stream";
import type { WorkspaceTab } from "#/layout";

/** One row of the View menu's LAYOUTS section. `readable: false` is a record
 * the codec could not read (unknown version, bad shape, or — with
 * `id === UNREADABLE_LIST_ID` — the whole stored list): shown greyed, delete
 * only. `savedAt` is null exactly when unreadable. */
export interface LayoutPresetSummary {
  readonly id: string;
  readonly name: string;
  readonly savedAt: string | null;
  readonly readable: boolean;
}

export type LayoutPresetNameProblem = "empty" | "too-long" | "reserved";

export type SaveLayoutPresetResult =
  | { readonly status: "saved"; readonly id: string }
  /** A preset with this name (case-insensitive) exists; call again with
   * `{ replace: true }` after the in-menu confirm. */
  | { readonly status: "exists"; readonly id: string }
  | { readonly status: "invalid"; readonly problem: LayoutPresetNameProblem }
  | { readonly status: "full" }
  /** No live Dockview engine registered a snapshot source for the tab. */
  | { readonly status: "unavailable" }
  /** The stored list is unreadable as a whole — delete that row first (P6). */
  | { readonly status: "store-unreadable" };

export interface LayoutPresetsPresenter {
  presetsFor(tab: WorkspaceTab): Stream<readonly LayoutPresetSummary[]>;
  save(tab: WorkspaceTab, name: string, options?: { readonly replace?: boolean }): SaveLayoutPresetResult;
  /** false when the id is unknown or unreadable. */
  load(tab: WorkspaceTab, id: string): boolean;
  remove(tab: WorkspaceTab, id: string): void;
  /** The built-in Default: this tab back to the shipped layout, both engines. */
  resetTab(tab: WorkspaceTab): void;
  /** The Dockview bridge registers its engine's `snapshotLayout` here on
   * construction and `null` on dispose. */
  registerSnapshotSource(tab: WorkspaceTab, source: (() => string) | null): void;
}
```

```ts
// client-core/src/layout/layoutPresetCodec.ts — exported runtime values
export const LAYOUT_PRESET_VERSION = 1;
export const MAX_LAYOUT_PRESETS = 10;
export const MAX_LAYOUT_PRESET_NAME_LENGTH = 40;
export const DEFAULT_LAYOUT_PRESET_NAME = "Default";
export const UNREADABLE_LIST_ID = "unreadable-list";

/** A readable, version-1 record. `layout` is layer 2 WITHOUT docked Jarvis
 * panels (ruling P2 — `docked` is always []); `blob` is the Dockview
 * engine's `snapshotLayout()` string. */
export interface StoredLayoutPreset {
  readonly v: typeof LAYOUT_PRESET_VERSION;
  readonly id: string;
  readonly name: string;
  readonly savedAt: string;
  readonly layout: PersistedTabLayout;
  readonly blob: string;
}

/** One list element after parsing. An unreadable element keeps its raw JSON
 * value so a rewrite of the list (another save/delete) preserves it verbatim
 * instead of silently dropping it. */
export type LayoutPresetEntry =
  | { readonly readable: true; readonly preset: StoredLayoutPreset }
  | { readonly readable: false; readonly id: string; readonly name: string; readonly raw: unknown };

export interface ParsedLayoutPresetList {
  /** true when the stored string itself was not a JSON array (P6). */
  readonly wholeListUnreadable: boolean;
  readonly entries: readonly LayoutPresetEntry[];
}

export function parseLayoutPresetList(tab: WorkspaceTab, raw: string | null): ParsedLayoutPresetList;
export function serializeLayoutPresetList(entries: readonly LayoutPresetEntry[]): string;
export function summarizeLayoutPresets(parsed: ParsedLayoutPresetList): readonly LayoutPresetSummary[];
/** Trims, then: "" → empty; > 40 chars → too-long; "default" in any case →
 * reserved. Returns the trimmed name when valid. */
export function validateLayoutPresetName(name: string):
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly problem: LayoutPresetNameProblem };
```

Parsing rules (each is a test case):
- `raw === null` → `{ wholeListUnreadable: false, entries: [] }`.
- `JSON.parse` throws, or the value is not an array → `{ wholeListUnreadable: true, entries: [{ readable: false, id: UNREADABLE_LIST_ID, name: "Unreadable saved layouts", raw: null }] }`.
- Per element: readable iff it is an object with `v === 1`, string `id`/`name`/`savedAt`/`blob`, and a `layout` that survives `parseWorkspaceLayout(serializeWorkspaceLayout({ v: 1, tabs: { [tab]: layout } }))` — reuse that validator, do not write a second tree walk — with `layout.docked.length === 0`. Use the *parsed* layout (its `initialPx` holes reconstructed), not the raw one.
- An unreadable element with a string `id` and `name` keeps them; otherwise `id: \`unreadable-${index}\``, `name: "Unreadable layout"`.
- Duplicate ids: the first wins, later duplicates become unreadable (never two rows with one React key).
- `serializeLayoutPresetList` writes readable entries as their record and unreadable ones as `raw`; the whole-list sentinel never serializes (the controller clears the key instead).

- [ ] **Step 1:** Write the codec tests (every bullet above, plus: a round trip of a real default layout — `createDefaultLayoutPort("fx").initial` — is exact, including `initialPx` holes; `validateLayoutPresetName` for `"  "`, 41 chars, `"DEFAULT"`, `"  Morning  "` → `"Morning"`).
- [ ] **Step 2:** Run `pnpm --filter @rtc/client-core exec vitest run src/layout/__tests__/layoutPresetCodec.test.ts` — FAIL.
- [ ] **Step 3:** Implement the codec, the types, the port and `InMemoryLayoutPresetStore` (a `Map<string,string>`, same shape as `InMemoryDockLayoutStore`).
- [ ] **Step 4:** Run — PASS; `pnpm --filter @rtc/tests gates` (grep gate 42: no runtime value in core-api).
- [ ] **Step 5: Commit** — `feat(core): layout preset codec, name rules and store port`

---

### Task 5: The controller and its composition wiring

**Files:**
- Create: `packages/client-core/src/layout/createLayoutPresets.ts` + `__tests__/createLayoutPresets.test.ts`
- Modify: `packages/core-api/src/app.ts` (`AppPorts.layoutPresetStore?: LayoutPresetStore`; `Presenters.layoutPresets: LayoutPresetsPresenter`; update the `workspaceLayoutResets$` doc per P4)
- Modify: `packages/client-core/src/composition.ts`
- Modify: `packages/client-core-async/src/parity.json`, `packages/client-core-effect/src/parity.json` (`"layoutPresets": "delegated"` under presenters)
- Modify: `packages/core-contract/src/registry.ts` (`"presenters.layoutPresets": null` + its `PENDING_SUITES` entry, same pattern as `presenters.dockLayoutStore`)
- Test: `packages/client-core/src/__tests__/composition*.test.ts` — the reset-leaves-presets assertion

**Interfaces:**
- Consumes: Task 3's `replaceLayout`; Task 4's codec and types.
- Produces: `createLayoutPresets(deps: LayoutPresetsDeps): LayoutPresetsPresenter`.

```ts
export interface LayoutPresetsDeps {
  readonly store: LayoutPresetStore;
  readonly dockLayoutStore: DockLayoutStore;
  readonly layoutFor: (tab: WorkspaceTab) => Machine<LayoutState, LayoutIntents>;
  /** The tab's CURRENT layer-2 state (composition: `latestLayoutStates`, else
   * the machine's replayed value). */
  readonly layoutStateNow: (tab: WorkspaceTab) => LayoutState;
  /** Jarvis panels docked into `tab` right now (ruling P2). */
  readonly dockedPanelIdsNow: (tab: WorkspaceTab) => readonly string[];
  /** Rebuild the mounted Dockview engine from the store (P4: bumps
   * `workspaceLayoutResets$`). */
  readonly rebuildLiveEngine: () => void;
  readonly now?: () => string;
}
```

Behaviour (each a controller test, using `InMemoryLayoutPresetStore`, `InMemoryDockLayoutStore` and a real `createLayoutMachine`):

- **`presetsFor(tab)`** — a per-tab `BehaviorSubject<readonly LayoutPresetSummary[]>`, created lazily from `store.load(tab)`, re-emitted after every write through this controller.
- **`save(tab, name, { replace })`**, in this order: no registered source → `unavailable`; `validateLayoutPresetName` fails → `invalid`; `wholeListUnreadable` → `store-unreadable`; a name match (case-insensitive, readable OR unreadable entries) without `replace` → `exists` with that id; `entries.length >= MAX_LAYOUT_PRESETS` and not replacing → `full`. Otherwise build the record: `layout = { layout: withoutDockedLeaves(tab, layoutStateNow(tab), dockedPanelIdsNow(tab)), docked: [] }`, `blob = source()`, `savedAt = now()`. Replace keeps the existing id and list position; a new record appends with a fresh id (`\`p${Date.now().toString(36)}${seq}\``, bumping `seq` until unique in the list — no `crypto` dependency, since this module also runs under React Native). Write, re-emit, return `saved`.
- **`withoutDockedLeaves`** — seed a SCRATCH `createLayoutMachine(createDefaultLayoutPort(tab), { seedState })`, call `removePanel(id)` for each docked id, read its state synchronously, `dispose()` it. This reuses the reducer's exact rules (the dock column collapses back to the pre-dock tree; `maximized`/`collapsed` entries naming the id drop) instead of re-deriving them.
- **`load(tab, id)`** — unknown or unreadable → `false`. Otherwise, in this order (Task 1 verified it): `dockLayoutStore.save(tab, preset.blob)`; `const docked = dockedPanelIdsNow(tab)`; `layoutFor(tab).intents.replaceLayout(preset.layout.layout)`; `insertPanel(id)` for each docked id; `rebuildLiveEngine()`; `true`.
- **`remove(tab, id)`** — `UNREADABLE_LIST_ID` → `store.clear(tab)`; otherwise drop the entry (readable or not) and write. Re-emit either way.
- **`resetTab(tab)`** — `dockLayoutStore.clear(tab)`; `const docked = …`; `reset()`; re-insert docked; `rebuildLiveEngine()`. Touches no other tab and no preset.
- **`registerSnapshotSource(tab, source)`** — a `Map`; `null` deletes.

Composition:

```ts
const layoutPresetStore = ports.layoutPresetStore ?? new InMemoryLayoutPresetStore();
const layoutPresets = createLayoutPresets({
  store: layoutPresetStore,
  dockLayoutStore,
  layoutFor,
  layoutStateNow: (tab) => latestLayoutStates.get(tab) ?? readPreferenceNow(layoutFor(tab).state$, createDefaultLayoutPort(tab).initial),
  dockedPanelIdsNow: (tab) => latestPanels.filter((p) => p.docked && dockedPanelTabs.get(p.panelId) === tab).map((p) => p.panelId),
  rebuildLiveEngine: () => { workspaceLayoutResets$.next(workspaceLayoutResets$.value + 1); },
});
```

Then add `layoutPresets` to the presenters literal. `resetWorkspaceLayout` is NOT edited.

- [ ] **Step 1:** Write the controller tests (every bullet above, including: a `load` into a tab with one docked panel leaves the panel docked and its leaf present; `resetTab("fx")` leaves `credit`'s machine and stored blob untouched; `save` never calls `dockLayoutStore.load`).
- [ ] **Step 2:** Write the composition test: `createApp(ports)` with a `layoutPresetStore` holding a list, call `presenters.resetWorkspaceLayout()`, assert `layoutPresetStore.load(tab)` is unchanged for every tab.
- [ ] **Step 3:** Run — FAIL.
- [ ] **Step 4:** Implement; update parity manifests and the registry.
- [ ] **Step 5:** `pnpm --filter @rtc/client-core test`, `pnpm --filter @rtc/client-core-async test`, `pnpm --filter @rtc/client-core-effect test`, `pnpm --filter @rtc/core-contract test` — PASS (the parity drift tests prove `layoutPresets` is literally the base instance).
- [ ] **Step 6: Commit** — `feat(core): Presenters.layoutPresets — save, load, delete, per-tab Default`

---

### Task 6: Adapters, bindings and every fake

**Files:**
- Create: `packages/client-{react,solid}/src/app/adapters/LocalStorageLayoutPresetStore.ts` + `.test.ts` — copy `LocalStorageDockLayoutStore` (+ its test), key `` `rtc-layout-presets-${tab}` ``, same try/catch tolerance
- Modify: `packages/client-{react,solid}/src/app/buildBrowserPorts.ts` — construct and pass `layoutPresetStore` next to `dockLayoutStore` (both call sites in each file)
- Modify: `packages/react-bindings/src/createViewModel.ts`, `packages/solid-bindings/src/createViewModel.ts`
- Modify: the fakes — `client-{react,solid}/tests/ui/contract/*/viewModelFromWorld.ts`, `client-{react,solid}/tests/ui/visual/*/buildFakeViewModel.ts`, `client-react-native/tests/visual/fake/inert.ts` + `sliceTypes.ts`

**Interfaces — produces (ViewModel hooks):**

```ts
export interface UseLayoutPresetsResult {
  readonly presets: readonly LayoutPresetSummary[];   // Solid: an Accessor
  save(name: string, options?: { readonly replace?: boolean }): SaveLayoutPresetResult;
  load(id: string): boolean;
  remove(id: string): void;
  resetTab(): void;
}
useLayoutPresets: (tab: WorkspaceTab) => UseLayoutPresetsResult;
/** `Presenters.layoutPresets.registerSnapshotSource` passed straight through. */
useRegisterLayoutSnapshot: () => (tab: WorkspaceTab, source: (() => string) | null) => void;
```

React binding: `bind((tab) => presenters.layoutPresets.presetsFor(tab), [])`, the same shape as `useDockedPanelIds`. Solid: follow how solid-bindings exposes `useDockedPanelIds` (an accessor) and keep the Solid field an `Accessor` if that is its convention for streams.

Contract Worlds: instantiate the REAL `createLayoutPresets` once per World (a `WeakMap<World, LayoutPresetsPresenter>`, like `layoutHandles`), with `store` an `InMemoryLayoutPresetStore` seeded from a new optional `World.layoutPresets` seed if the World type needs one (check `@ui-contract/harness`'s `createWorld` — add a seed field only if Task 8's specs need a pre-populated list; the unreadable-row spec does), `dockLayoutStore` the World's `dockStore`, `layoutFor` = `getLayoutFor(world, …)`, `dockedPanelIdsNow` from the same `dock.dockedTabs` filter `useDockedPanelIdsFor` uses, `rebuildLiveEngine` bumping `world.workspaceLayoutResets`. **Do not re-implement any rule in the fake** — that is the whole point of the controller.

Visual fakes: `useLayoutPresets` returns `data.layoutPresets ?? []` (Task 11 adds the field) with inert intents (`save` → `{ status: "unavailable" }`, `load` → `false`); `useRegisterLayoutSnapshot` → a no-op. RN: inert entries plus the two names in `sliceTypes.ts`'s union.

- [ ] **Step 1:** Adapter tests first (copy the dock-store test's cases: round trip, `load` null when absent, throwing storage tolerated on all three methods) — FAIL, then implement — PASS.
- [ ] **Step 2:** Bindings + fakes.
- [ ] **Step 3:** `pnpm typecheck`, `pnpm --filter @rtc/client-react test`, `pnpm --filter @rtc/client-solid test`, `pnpm --filter @rtc/client-react-native test` — PASS.
- [ ] **Step 4: Commit** — `feat(clients): layout preset store adapters, bindings and fakes`

---

### Task 7: Bridges register the live snapshot

**Files:**
- Modify: `packages/client-{react,solid}/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` — new optional prop `onSnapshotSourceChange?: (tab: WorkspaceTab, source: (() => string) | null) => void`
- Modify: `packages/client-{react,solid}/src/ui/App.tsx` — `onSnapshotSourceChange={registerLayoutSnapshot}` from `useRegisterLayoutSnapshot()`
- Test: `__tests__/DockviewLayoutEngine.snapshot.test.tsx` in each client

Call the slot with `() => engine.snapshotLayout()` right after `engineRef.current = engine` / `setLiveEngine(engine)` at BOTH React construction sites (the mount effect and the rebuild effect — keep the two `createDockEngine` bodies text-identical per the component's REBUILD CONTRACT doc; the registration goes after the construction call, not inside it) and in Solid's single `buildEngine()`. Call it with `null` before every dispose. The source must read the CURRENT engine (`engineRef.current?.snapshotLayout()` / Solid's current instance), never the closed-over one — the NEW-1 hazard the React file documents.

- [ ] **Step 1: Failing tests:** mount → the slot received a source whose value equals the store's next write after a collapse; bump `layoutResets` → the slot saw `null` then a new source whose output reflects the rebuilt engine; unmount → last call is `null`.
- [ ] **Step 2:** Implement in React; run its test; implement in Solid; run its test.
- [ ] **Step 3: Commit** — `feat(dockview-bridges): register the live layout snapshot for preset saves`

---

### Task 8: React — the LAYOUTS section, plus the shared contract specs

**Files:**
- Create: `packages/client-react/src/ui/shell/chrome/LayoutPresetsSection.tsx` + `LayoutPresetsSection.module.css`
- Modify: `packages/client-react/src/ui/shell/chrome/ViewMenu.tsx` — render `<LayoutPresetsSection tab={activeTab} engine={engine} onDone={closeViewMenu} />` below the panel list; `engine` from `useLayoutEngine()`
- Modify: `packages/ui-contract/src/shared/pages/shell/chrome/ViewMenuPage.ts`
- Create: `packages/ui-contract/src/specs/shell/chrome/LayoutPresets.contract.spec.ts`

**The section (spec §4.4), with the test ids the page object keys on:**

| Element | Test id | Role / behaviour |
|---|---|---|
| section | `view-menu-layouts` | `role="group"`, `aria-label="Layouts"`; head text `LAYOUTS` |
| Default row | `view-menu-layout-default` | `menuitem`; click → `resetTab()`, close menu |
| preset row | `view-menu-layout-<id>` | `menuitem`; click → `load(id)`, close menu; unreadable → `aria-disabled="true"`, greyed, no load |
| bin | `view-menu-layout-delete-<id>` | click swaps the row into a confirm |
| confirm / cancel | `view-menu-layout-delete-confirm-<id>` / `view-menu-layout-delete-cancel-<id>` | confirm → `remove(id)` |
| save opener | `view-menu-layout-save` | `menuitem` "Save current as…"; always visible under Dockview — at the cap, `save` reports `full` (one rule, one place: the UI never counts) |
| name field | `view-menu-layout-name` | text input, `maxLength` not set (the rule is core's), Enter = Save, Escape = Cancel |
| save / cancel | `view-menu-layout-save-confirm` / `view-menu-layout-save-cancel` | save → `save(draft)` |
| replace confirm | `view-menu-layout-replace-confirm` | shown on `exists`; → `save(draft, { replace: true })` |
| message | `view-menu-layout-message` | `role="status"`; text per result: `invalid/empty` "Enter a name", `too-long` "40 characters at most", `reserved` "“Default” is reserved", `full` "10 layouts at most — delete one first", `unavailable` "Layouts need the Dockview engine", `store-unreadable` "Delete the unreadable entry first" |

Under `engine === "inhouse"` only the section head and the Default row render. Keyboard: every row is a `<button>` inside the existing menu, so tab order reaches them; do not add a roving-tabindex scheme the menu does not already have.

`ViewMenuPage` gains: `layoutRowLabels(): string[]`, `hasLayoutsSection(): boolean`, `isLayoutRowDisabled(id)`, `loadDefaultLayout()`, `loadLayout(id)`, `openSaveLayout()`, `typeLayoutName(text)`, `confirmSaveLayout()`, `cancelSaveLayout()`, `confirmReplaceLayout()`, `requestDeleteLayout(id)`, `confirmDeleteLayout(id)`, `layoutMessage(): string | null`.

Contract specs (world-driven, `AppShell` mounted, both clients via the swap-trio — the file lives in `@rtc/ui-contract`, so it runs for Solid in Task 9 unchanged):

1. dockview engine: the section lists `Default` then saved presets in stored order, then "Save current as…".
2. save flow: open → type "Morning" → Save → a `Morning` row appears. (The World's Dockview host must register a snapshot source for this to be `saved`, not `unavailable` — mount the Dockview engine through the World path the existing `DockviewLayoutEngine chart instances (world-driven, App shell)` spec uses.)
3. invalid names show the message and add no row: `"   "`, 41 chars, `"default"`.
4. duplicate name → replace confirm → still one row, and `savedAt` changed (read through the World's store).
5. delete needs the second click: bin → the row is still there → confirm → gone.
6. an unreadable record (seed the World's preset store with a `v: 99` element) renders disabled; clicking it loads nothing; its delete works.
7. in-house engine: only the Default row, no save opener.
8. Default resets the tab: close `fx-analytics` from the same menu, then Default → it is visible again.

- [ ] **Step 1:** Write the page-object methods and the eight specs; run them against React: `pnpm --filter @rtc/client-react test:ui:contract -- LayoutPresets` — FAIL.
- [ ] **Step 2:** Implement the section and CSS (reuse `HeaderChrome.module.css` tokens by value; the section head matches `dropdownHead`'s look — read `docs/performance.md` before adding any transition, and prefer none).
- [ ] **Step 3:** Run — PASS; `pnpm --filter @rtc/client-react test:ui:contract:coverage` ≥95% and `pnpm coverage:gaps` shows `LayoutPresetsSection` covered.
- [ ] **Step 4: Commit** — `feat(client-react): View menu LAYOUTS section`

---

### Task 9: Solid — parity

**Files:**
- Create: `packages/client-solid/src/ui/shell/chrome/LayoutPresetsSection.tsx` + `.module.css` (CSS copied verbatim)
- Modify: `packages/client-solid/src/ui/shell/chrome/ViewMenu.tsx`

Port Task 8's component. Per the Global Constraints, any per-row handler chosen by a condition (e.g. unreadable rows get no load handler) is hoisted into a `createMemo` in the row's setup scope, never a ternary inside the prop.

- [ ] **Step 1:** Run the unchanged shared specs against Solid: `pnpm --filter @rtc/client-solid test:ui:contract -- LayoutPresets` — FAIL.
- [ ] **Step 2:** Implement — PASS; `pnpm --filter @rtc/client-solid test:ui:contract:coverage` (≥95%, branches ≥85%).
- [ ] **Step 3:** Solid dev-warning check (the #792 method): in `pnpm dev:solid`, open the View menu, save, load, delete five times; the console shows zero "computations created outside a `createRoot`" warnings. Record the count in the report.
- [ ] **Step 4: Commit** — `feat(client-solid): View menu LAYOUTS section (parity)`

---

### Task 10: e2e — save, rearrange, load, reload, delete

**Files:**
- Modify: `tests/browser/page-objects/contracts/Layout.ts` + `playwright/Layout.ts` — `openViewMenu`, `saveLayoutPreset(name)`, `loadLayoutPreset(name)`, `deleteLayoutPreset(name)`, `layoutPresetNames()`
- Modify: `tests/browser/scenarios/layout.ts` — `savedLayoutRestoresAfterRearrangeAndReload(ctx)`
- Modify: `tests/browser/playwright/layout.spec.ts`

The scenario (Dockview is the default engine since #755 — verify that on the branch; do not call `openPreferencesAndSelectLayoutEngine` unless it is not):

1. Collapse analytics and float the blotter (existing PO helpers) → save as "Desk A".
2. Rearrange: expand analytics, dock the blotter, close positions from the View menu.
3. Pop the rates panel out (the existing pop-out helper) — this is question 5 from Task 1.
4. Load "Desk A": analytics is a strip, the blotter floats, positions is visible, and the pop-out window has closed (`PopoutWindowPO` reports closed).
5. Reload, reselect FX: the same three facts hold (layer 2 and layer 3 both persisted).
6. Delete "Desk A" (bin + confirm): `layoutPresetNames()` is `[]`.

- [ ] **Step 1:** Build first (`pnpm build` in the worktree — stale dist caused 13 false timeouts last phase), then run `RTC_DEV_PORT=<free> pnpm test:browser:playwright browser/playwright/layout.spec.ts` and the `:solid` twin. Never pipe the output through `tail`/`grep` when judging it.
- [ ] **Step 2:** Mutation check: revert Task 5's `rebuildLiveEngine()` call locally → the scenario fails at step 4; restore.
- [ ] **Step 3: Commit** — `test(e2e): saved layouts survive rearrange, pop-out and reload`

---

### Task 11: Visual — the Dockview LAYOUTS menu

**Files:**
- Modify: `packages/ui-contract/src/visual/appData.ts` — `layoutPresets?: readonly LayoutPresetSummary[]` (doc: seeded, never clicked — the visual host's intents are no-ops)
- Modify: `packages/ui-contract/src/visual/fixtures.ts` — `fixtures["app-fx-layouts-dockview"]` = `app-fx-dockview` + three presets, one `readable: false`
- Modify: `packages/ui-contract/src/visual/scenarios.ts` — `"shell/view-menu-layouts-dockview": { componentKey: "App", fixtureKey: "app-fx-layouts-dockview" }`, with the single-engine comment per P5
- Modify: `packages/ui-contract/src/visual/scenarioActions.ts` — same action as `shell/view-menu-open` (click `view-menu-toggle`, `waitForText` of a preset name)
- Goldens: regenerate

The existing `shell/view-menu-open` golden repaints (it now shows the in-house `Default` row) — expected.

- [ ] **Step 1:** Read `/rtc:visual-tolerance-audit`'s notes first: a small added section is exactly what a loose ratio hides; confirm the new rows are visible in the diff, not absorbed.
- [ ] **Step 2:** Regenerate `react-local/darwin-arm64` locally for `view-menu`, and the CI `react/` set with `gh workflow run update-visual-goldens.yml --ref <branch> -f scenario_pattern=view-menu` (pattern is `-g` over the full title; no `^`). That workflow commits the goldens itself.
- [ ] **Step 3:** Open both new PNGs and look at them (Read tool) before accepting — a byte-identical regen proves nothing.
- [ ] **Step 4:** `pnpm visual:engine-parity` — no pair changed except `shell/view-menu-open`'s, which has no `-dockview` twin, so the report is unchanged.
- [ ] **Step 5: Commit** (the local set; the workflow commits the CI set) — `test(visual): Dockview View menu with saved layouts`

---

### Task 12: Docs, STATUS and rulings

**Files:**
- Modify: `packages/layout-dockview/README.md` — `snapshotLayout()`; a "Saved layouts" paragraph on what a preset records (P2) and the load order
- Modify: `docs/adr/ADR-002-layout-management-port.md` — Phase 6b shipped; the preset store port
- Modify: `docs/STATUS.md` — remove the Dockview 6b item (the Dockview-native workstream closes); bump `Last updated`
- Create: `docs/superpowers/plans/2026-09-19-dockview-layout-presets-phase6b-rulings.md` — every ledger ruling verbatim (decision — why — cost if wrong), P1–P6 included; link it from this plan's header

- [ ] **Step 1:** Write the docs; `pnpm check:doc-links`.
- [ ] **Step 2: Commit** — `docs: Phase 6b saved layouts shipped — README, ADR-002, STATUS, rulings`

---

## Before merge (controller)

- [ ] `/rtc:gauntlet full` green.
- [ ] In-house visual assert run locally (the #664 lesson) — only `shell/view-menu-open` differs, and it differs as intended.
- [ ] **Driven-by-me pass in the real app** (`pnpm dev` and `pnpm dev:solid`): the e2e flow by hand, plus Default on a tab with a Jarvis-docked panel (it stays docked — P2), plus a save while a float is open. The spec names this gate: live use found every #738 bug CI missed.
- [ ] **User-acceptance pass** before the merge.
