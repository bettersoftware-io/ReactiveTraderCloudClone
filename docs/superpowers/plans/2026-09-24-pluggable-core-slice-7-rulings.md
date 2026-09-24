# Slice 7 — execution rulings ledger

Plan: [`2026-09-24-pluggable-core-slice-7.md`](2026-09-24-pluggable-core-slice-7.md).
Regime: in-session execution (superpowers:executing-plans), one reviewer per PR.

Pre-flight: Task 1 produces the shared controllers + `CoreSeams.workspace`
that Tasks 3–5 consume by name; Task 2's harness verbs are consumed by
Task 3. No conflict found between the plan's rulings and the tasks.

## Wave 1 · PR A (the RxJS side)

- Task 0: complete — "slice 6a" → "slice 6" in CLAUDE.md, STATUS, ADR-006,
  §22, the spec receipt, both READMEs, `layers.ts`'s comment and the two
  slice-6 plan titles; STATUS gains the slice-5/6 residual pointers.
- Task 1: complete — mutation 5/5 on the seam witnesses; client-core
  2962/2962 unchanged through the moves (behaviour-identical).
  - Ruling: the writer's pure half is its own module,
    `layout/workspaceLayoutWrite.ts`, not an export of
    `workspacePersistenceWriter.ts` — that file imports `debounceTime` as a
    value, and the plan's own rule is that shared modules import no rxjs
    value — cost if wrong: one file more.
  - Ruling: the rxjs-free presets controller is
    `createLayoutPresetsController(deps, channel)` in
    `layout/layoutPresetsController.ts`; `createLayoutPresets(deps)` stays as
    the RxJS shell supplying a `BehaviorSubject` channel — both web clients'
    ui-contract fixtures call `createLayoutPresets(deps)`, so the plan's
    signature change would have churned them for nothing — cost if wrong: a
    rename in slice 8.
  - Ruling: `WorkspaceDock` gains `dockedIdsIn(tab, panels)` (the plan listed
    only `dockedPanelIdsNow`): each core's `dockedPanelIdsFor` stream must
    compute membership from the panels state it was HANDED, not a mirror
    read, or an emission could combine with a stale roster — cost if wrong:
    none, it is `dockedPanelIdsNow`'s body.
  - Ruling: `LAYOUT_PANEL_IDS`/`STATIC_WORKSPACE_PANEL_IDS`/`WORKSPACE_TABS`
    moved into `workspaceDock.ts` (the dock's collision guard needs them);
    `composition.ts` re-exports the two public ones.
  - Ruling: no unit test for the domain constants — a test restating a
    literal kills no mutant a suite doesn't; the Task 3 suites assert them.
- Task 2: complete — mutation 7/7. Ruling: the Jarvis wire types
  (`JarvisEvent`, `PanelSpec`, `DriveBatch`) are DERIVED from `@rtc/core-api`
  in `harness/jarvisTypes.ts` — `core-contract` may not depend on
  `@rtc/shared` — cost if wrong: none, the derivations are exact.
  Ruling: the harness now REPLACES `ports.jarvis` for every suite (no earlier
  suite used it).
- Task 3: complete — twelve members' suites + `jarvis.ask` discipline;
  RxJS runner 304/304, async 304/304, Effect 304/304 (they delegate);
  mutation against the RxJS core 46/46 killed (one mutant per contract
  point, in the SHARED controllers where the rules now live and in the
  RxJS shells: membership sort/distinct, the writer debounce, both
  persist-kick filters, the inert handle dispose).
  - Ruling: the suites live in five files (`layout.ts`, `dock.ts`,
    `reset.ts`, `layoutPresets.ts`, `reportDetachedPanels.ts`, plus
    `jarvisPanels.ts`) exporting one describe function per member, not the
    plan's twelve files — the members share fixtures and the grouping
    follows the plan's own ruling-6 headings — cost if wrong: none.
  - Ruling: a contract point the plan missed — a docked panel is restored,
    docked, into the tab it was docked into, in the next session. Without
    it the "boot restores docked panels" mutant would have survived.
  - The suite-local kit (`suites/workspaceKit.ts`) reads every stream
    through a FRESH subscriber and throws when nothing arrived (absence is
    never a value).
  - Uncontracted (ledgered, per plan ruling 6): the unsupported-sentinel
    panel path — the sentinel is minted by the adapters and unreachable
    from ports.
