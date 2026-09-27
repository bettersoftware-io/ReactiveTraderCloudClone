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
- Full gauntlet: 33 gates, green after two fixes (7 auto-fixable ESLint
  padding/newspaper-order errors; knip: `DriveBatch` made module-local).

### PR A review (one read-only opus reviewer)

No behaviour regression in the move out of `composition.ts` (checked line
by line against 6499636af); the rxjs-free claim holds. All ten findings
taken:
1. Contract gap — a write keeps the stored entry of a tab the session never
   opened: new case in `layout.ts` (its mutant — drop `...stored?.tabs` —
   survived every suite before).
2. "Bumps LAST" only half-checked: the reset's at-bump read now includes the
   stored preference; a new `layoutPresets` case pins load/resetTab's
   blob-then-bump order.
3. The suites silently required a SYNCHRONOUS state fold. Ruling: that is a
   contract point, now stated in `workspaceKit.ts`'s module doc — the
   shared dock reads roster and layout state right after calling into them,
   so a core must commit state synchronously; only delivery may be
   scheduled (the Effect core commits via `runSync`) — cost if wrong: the
   Effect port needs a different shared-dock shape.
4. `layoutStateNow` hid a late-recording core behind the default tree: it
   now throws. The RxJS core always records synchronously, so no mutant can
   reach the throw from here — an untestable-by-RxJS guard, ledgered; the
   sibling ports' unit tests exercise it.
5. Seam branch (b) untested: new `composition.seams.test.ts` case seeds a
   docked payload — the unseamed app restores it, the seamed app's own
   panels stay empty.
6. The boot restore moved below the layout maps (no TDZ if a restore ever
   reaches `layoutFor`), still before the writer's panels subscription.
7. `storedWorkspaceLayout()` throws when the port replays nothing.
8–10. Vacuity guards: the post-reset case asserts h1's write landed; the
   resize case asserts `initialPx` was set; the repeat dock checks the
   roster too.
Runners 306/306 ×3; client-core 3059/3059; mutation on the fixes 5/5.

## Wave 1 · PR B (the async core)

- Task 4: the twelve native on the Store/Topic kernel — `machines/layout.ts`,
  `presenters/jarvisPanels.ts`, `presenters/workspace.ts`; composition wires
  the `CoreSeams.workspace` factory. Contract runner 307/307 native; unit
  tests for the paths the suites don't reach (unsupported panels, the
  priceHistory/blotter/unknown sources, a spec edit rebuilding its data,
  the lifetime's end). Mutation 16/16 after two findings:
  - `panels fold panel events only` SURVIVED — no suite had a turn of
    non-panel events. New contract case in `jarvisPanels.ts` (RxJS passes).
  - `the debounce restarts on a kick` SURVIVED, and so did its twin on the
    `pending === window` guard: each mechanism hid the other. Ruling: the
    abort is the ONE supersede mechanism, the guard is gone — cost if wrong:
    none, an aborted `sleep` rejects.
  - Ruling: `followPanelData` attaches to a panel's data through `relay`, not
    a raw `.subscribe` — the kernel's convention that subscribing to rxjs
    streams lives in `bridge/` — and `emptyStream` (the unsupported panel's
    data) joins `bridge/out.ts`.
  - Ruling: `composition.machineFactories.test.ts`'s "a delegated member is
    still reference-identical" assertion flipped — `machines.layout` was the
    last delegated machine; every machine factory is now native.
- Gauntlet (33 gates) green but knip (the exported-but-local
  `NativeWorkspacePresenters`, fixed); `VITE_CORE_IMPL=async pnpm test:e2e`
  exit 0 (91 Playwright + 2×47 Gherkin scenarios), run BEFORE the review
  fixes below (composition holder + debounce guard — both covered by the
  contract and unit tiers).

### PR B review (one read-only opus reviewer)

No Critical: semantics match the RxJS core on persistence, membership
timing, panel-data lifecycle (one port subscription per live panel), warm
preset lists, teardown, and the composition's factory ordering. Taken:
- Real-time waits in `composition.seams.test.ts` → `vi.waitFor` on the
  positive condition, then one debounce window for a would-be second writer.
- The hand-ported `combineLatest`+`scan` had no multi-symbol test: new unit
  case (two symbols, points accumulate, nothing before every symbol ticks).
- Overclaiming/vacuous unit tests: the analytics half added; the dismiss
  case asserts live data before the `null`; the layout lifetime case split
  from the explicit-dispose case. Mutation on these 4/4.
- Debounce: a kick or the lifetime's end landing between the timer and its
  callback no longer orphans the newer window or writes after the end
  (`pending === window` guard is back, as a guard on the NULLING only —
  equivalent under mutation, kept for that race).
- One constant empty data stream for unsupported panels (the RxJS `EMPTY`).
- Stale `commands.ts` doc; dead `layouts` map; the `never`-narrowed `let`
  holder became an array.
- Ruling (finding 5): dispose aborts a pending write where the RxJS writer
  never unsubscribes — `app.dispose()` does not run in production; a write
  after teardown would be the bug — cost if wrong: one lost debounce window
  at a teardown nobody performs.
- Ruling (finding 6): a data topic whose port FAILED stays attached until
  the roster changes (RxJS propagates the error) — documented in
  `followPanelData`; ports here do not error — cost if wrong: a frozen desk
  panel after a port failure.

## Wave 1 · PR C (the Effect core)

- Task 5: the twelve native — `presenters/syncRef.ts`, `machines/layout.ts`,
  `presenters/jarvisPanels.ts`, `presenters/workspace.ts`; bridge gains
  `holdWarm` and `emptyStream`. Contract runners 308/308 ×3; Effect unit
  tests 568+; mutation 20/20 after two findings (below).
  - Ruling: `SyncRef` — a `SubscriptionRef` committed with `runSync` plus
    SYNCHRONOUS in-core listeners. `ref.changes` is delivered on a fiber, so
    the shared dock's mirrors (recorded layout states, persist kicks, docked
    membership) cannot hang off it without breaking the sync-fold contract;
    subscribers still read the ref — cost if wrong: a second notification
    path to keep in step (unit-tested).
  - Ruling: the Effect workspace is built by the seam factory on a CHILD of
    the app host, outside the Layer graph (its input — the base's Jarvis
    events — exists only inside the base's `createApp`); the plan's "one Tag
    + Layer per member" does not apply to wave 1 and the Layer count is
    unchanged. Wave 2 moves it into the graph with `jarvis`.
  - FOUND BY THE SEAM WITNESS: the panels relay first subscribed the base's
    `jarvis.events$` lazily on a forked fiber; the stream is hot, so a turn
    answered in the tick it was sent was lost. Fixed with the bridge's eager
    `fromPortIn(scope)`; new contract case "a turn answered in the same tick
    it was sent, straight after composition, still spawns its panel" (every
    core passes; the lazy mutant is killed).
  - Survivors taken: `SyncRef`'s unchanged-write drop (new `syncRef.test.ts`)
    and the unknown panel's synchronous `null` seed (unit case reading it
    without a tick, as the RxJS `of(null)`).
- Docs for the wave: ADR-006 "Decided in slice 7 — wave 1", §22 counts,
  spec receipt, STATUS (70/74 both; wave 2 next, needs its own plan),
  CLAUDE.md, both READMEs.
- Gauntlet (33 gates) green; `VITE_CORE_IMPL=effect pnpm test:e2e` exit 0
  (91 Playwright + 2×47 Gherkin), run before the review fixes below.

### PR C review (one read-only opus reviewer)

No Critical. Taken:
- Important — the persist writer could write after `app.dispose()`: a fork
  into the closed child scope still runs (effect 3.22.2 hands back an
  already-closed child and runs the body). Now a `closed` flag makes `kick`
  a no-op and re-checks before writing; the roster's kick and seam-id
  listeners are released with the scope; anything created after the close
  (a late `layoutFor(tab)`) is released at once (`track`). New seam case:
  after dispose, a roster change writes nothing.
- Important — no test proved a live panel holds its port ONCE and releases
  it: new unit case counts subscriptions through two `panelData$` readers,
  a dismissal, a spec edit and the scope's close. Mutants: dismissal
  release, spec-edit release, `panelData$` reading the cached data — killed.
- `SyncRef` listeners now hear `get()` (a re-entrant write can no longer
  hand a later listener the older value); the interrupt/fork race of the
  debounce is commented (one extra write of LIVE state, never a stale one).
- CLAUDE.md's "74th, `layoutPresets`, joined delegated" clause; the ADR's
  dispose wording.
- Equivalent under mutation, kept as defence in depth: the scope-close
  release loop over the panel cache (closing the host scope already ends
  every panel's `sharedFold` period) and the kick-time `closed` check (the
  kick listener is released and the write re-checks).
- Finding 3 (rated latent by the reviewer) WAS REACHABLE — CI's Solid +
  Effect e2e ("a docked panel dragged onto Live Rates comes back in that
  group after a reload") failed on it: `SyncRef.warm()` followed
  `ref.changes`, so after a reload the restored docked panel reached the
  UI's FIRST render one fiber step late; the Dockview bridge's orphan scrub
  read the empty docked set and dropped the panel's dragged position (the
  "reconcile against unloaded input" trap). Fix: `warm()` is fed from the
  synchronous commit path (`bridge/out.ts` `listenToWarmStateStream`). New
  unit case (a subscriber joining after a commit reads it at once) and a
  new CONTRACT point in the restore case: at composition, before any
  pause, `dockedPanels$` and `dockedPanelIdsFor` already list the restored
  panel — both RED on the old wiring, GREEN now, green on all three cores.
  Local e2e had passed: the race depends on render timing. Lesson: a
  "latent, unreachable today" rating on a delivery-timing finding needs a
  test, not a ledger line. Still recorded: the native `workspaceNav`
  (slice 6) is a `refToWarmStateStream`, so `activeTab()` read in the same
  tick as a `switchTab` sees the old tab — every current path settles or
  staggers first.

## Wave 1 residuals (after #823)

- FIXED — async `panelData$` after a data-port failure: the follow now
  rejects, so its subscribers hear the error (RxJS `switchMap` semantics);
  unit case RED on the old code. The Effect core already propagated it
  (new unit case), but its keep-warm (`holdWarm`) re-reported the error as
  unhandled — the holder now absorbs it, the real subscribers still hear it.
- FIXED — the Effect `workspaceNav` (slice 6) moved onto `SyncRef`: a switch
  is visible to a subscriber joining in the same tick, so the shared dock's
  `activeTab()` can never read the old tab; unit case RED on the old code.
- RECORDED (STATUS) — the ui-contract fixtures' duplicated dock wiring in
  both web clients; deliberate, uncontracted differences as listed in ADR-006.

