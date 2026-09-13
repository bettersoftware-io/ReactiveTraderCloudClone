# Pluggable Application Core (RxJS / async-await / Effect) — Design

**Date:** 2026-09-11
**Status:** Approved (design dialogue 2026-09-08 → 2026-09-11; user review 2026-09-12 split slice 1 into 1a/1b)
**Plan:** slice 0 — [`../plans/2026-09-12-pluggable-core-slice-0.md`](../plans/2026-09-12-pluggable-core-slice-0.md); later slices get their own plan each

## Purpose

The React ↔ SolidJS experiment proved the *UI* layer is replaceable: two
clients share `@rtc/client-core` and pass the same `@rtc/ui-contract`
behavioural specs. This workstream runs the same experiment one ring inward:
make the **application layer** (presenters, machines, composition root)
pluggable, and ship two alternative implementations of it — one on standard
`async`/`await` + `AsyncIterable`, one on Effect-TS — proven equivalent to the
RxJS original by a behavioural contract tier that runs against all three.

It is a capability showcase. The deliverable is credibility: three cores, one
contract, both web clients booting on any of them, with the equivalence claim
machine-checked rather than eyeballed.

## Decisions taken with the user

| # | Decision | Chosen |
|---|---|---|
| 1 | Swap depth | **Application layer only.** Domain ports, use cases and simulators stay RxJS; each core wraps the `Observable` ports at its edge. |
| 2 | Equivalence witness | **A new core-contract tier at the `Presenters` / `MachineFactories` boundary, plus the Gherkin e2e suites run per core.** The 103 UI contract specs are left as they are — they seed a fake `World`, never `createApp`, so they cannot witness a swapped core. |
| 3 | Selection and layout | **Sibling packages, build-time env** (`VITE_CORE_IMPL`), shared interface types extracted to `@rtc/core-api`. |
| 4 | Clients | **Both web clients.** React Native stays on the RxJS core (named follow-up). |
| 5 | Delivery | **Strangler:** vertical slice by slice; unported members delegate to the RxJS core; a committed parity manifest tracks provenance. |
| 6 | Envelope | **Keep RxJS `Observable` at the edge**, behind two aliases (`Stream<T>`, `StateStream<S>`) so the web-standard `Observable` can replace it later as an alias flip (named follow-up). |
| 7 | Bridge rule | Outside a core's `bridge/` directory, RxJS is **type-only**. Operators in an alternative core are a lint error — otherwise it is RxJS with extra steps. |
| 8 | Effect version | `effect` **3.22.x** (latest stable at design time; 4.0 is a release candidate and a named follow-up). |

## Findings that shaped the design

- **The seam already exists.** The bindings consume exactly three client-core
  types — `Presenters`, `MachineFactories`, `AppCommands` — plus `Machine<S,I>`.
  Bridging at that boundary is 3 interfaces; bridging at the `ViewModel`
  boundary would be 2 × 71 members.
- **`Presenters` members are typed as concrete classes** (`priceStream:
  PriceStreamPresenter`), so the contract extraction must introduce one public
  interface per presenter, which the RxJS class then `implements`.
- **Three timing guarantees are load-bearing** and are producer behaviours,
  not properties of the `Observable` type: (a) `PreferencesPort` streams and
  machine `state$` emit **synchronously on subscribe** (`toSignal` throws
  otherwise; `readPreferenceNow` and `ThemePreferencePresenter.cycle()` read
  synchronously); (b) `shareReplay({bufferSize:1, refCount:true})` multicast
  with **teardown on last unsubscribe**; (c) memoised per-key identity
  (`price$(EURUSD) === price$(EURUSD)`), which a contract test asserts.
- **The repo already ran on `AsyncIterable`/`Promise`** through Phase 2 and
  moved to `Observable` in Phase 2.6 because every port crossing needed an
  interop seam (`docs/architecture/10-key-design-decisions.md` §10.1). The
  async core therefore needs a small hot primitive of its own; a pull-based
  iterable cannot express (a) or (b).
- **No ADR records the RxJS choice itself.** ADR-006 fills that gap.
- **`Observable` at the edge loses nothing that matters at a UI edge:** only
  pull-based backpressure and Effect's typed error channel, both irrelevant
  to a view.
- **Web-standard `Observable`** (WICG, heading for WHATWG DOM): shipped in
  Chromium/Edge 135, not in Firefox or Safari as of 2026-09. `subscribe()`
  returns `undefined` (cancellation via `AbortSignal`), no multicast
  primitives, no `Symbol.observable` interop with RxJS. Adoptable later via
  the aliases plus a polyfill; not the default yet.

## Architecture

### Packages

```
@rtc/core-api            NEW  types only, no runtime code
@rtc/client-core         EXISTS  becomes the RxJS implementation of core-api; keeps the adapters
@rtc/client-core-async   NEW  async/await + AsyncIterable core
@rtc/client-core-effect  NEW  Effect-TS core
@rtc/core-contract       NEW  dev-only behavioural suites over Presenters / MachineFactories
@rtc/core-logic          LATER (slice 8)  shared pure reducers, runtime package
```

**`@rtc/core-api`** holds everything a client or binding needs to name a core
without naming an implementation:

- `Stream<T> = Observable<T>` and `StateStream<S> = StateObservable<S>` —
  defined once, in one file.
- One interface per presenter (43), declared over `Stream<T>` and plain
  methods; every machine's `*State` / `*Intents` / `*View` type (18 machines);
  `Machine<S,I>`, `ReadOnlyMachine<S>`, `MachineFactories`, `Presenters`,
  `AppCommands`, `App`, `AppPorts`.
- `CoreFactory = { createApp(ports: AppPorts): App; createMachineFactories(p:
  Presenters): MachineFactories }` — the whole plug.
- `App` gains `dispose(): Promise<void>` (no-op in RxJS, abort in async,
  `ManagedRuntime.dispose()` in Effect).

**`@rtc/client-core`** keeps its name, its adapters (`WsAdapter`, port
factories, session/dock stores) and the module-level `reconnect$` /
`incident$` seams that `buildBrowserPorts` merges. Presenters gain
`implements` clauses; behaviour is unchanged and the existing 114 tests plus
both golden sets are the safety net for the type move.

**The two alternative cores** export the same `CoreFactory` pair. Both depend
on `core-api`, `domain`, `shared` and — strangler phase only — `client-core`
(delegation of unported members; import of shared pure reducers). Each has a
`bridge/` directory, the only place allowed to call `new Observable` and
`state()`.

### Dependency rules (`.dependency-cruiser.cjs` + `tsconfig.depcruise.json`)

| rule | constraint |
|---|---|
| `core-api-is-types-only` | `packages/core-api/src` may import only `type` from any package |
| `alt-cores-stay-inner` | the two new cores import only `core-api`, `client-core`, `domain`, `shared`; framework-free like client-core |
| `bridge-owns-rxjs` | outside `bridge/`, an alternative core imports `rxjs` / `@rx-state/core` as **types only**; a grep gate mirrors it |
| `react-bindings-no-apps` / `solid-bindings-no-apps` | widen from `client-core\|domain` to `core-api\|client-core\|domain` |

Each new package joins every global gate (typecheck, knip, syncpack, eslint
tsconfig paths, coverage) on the PR that creates it.

### The async/await core

Three primitives in `src/kernel/` (~200 lines, zero dependencies):

- `Store<S>` — `get()`, `set(next | fn)`, `subscribe(listener) → unsubscribe`.
  Synchronous, replay-current. Every machine is a `Store` plus async intent
  functions. This is the warmth guarantee.
- `Topic<T>` — hot multicast with optional replay-1 and refCount; producer is
  `async (signal) => void`, started on first subscriber, aborted on last.
  `shareReplay({bufferSize:1, refCount:true})` written once, explicitly.
- `spawn(fn, signal)` — fire-and-forget loop; swallows `AbortError`, routes
  any other error to the owning Topic/Store so it surfaces as a stream error
  exactly as an RxJS source error would.

Cold streams are `AsyncIterable<T>`; per-consumer state is a generator-local
`let` (what Phase 2 did). Cancellation is `AbortController` throughout:
`switchMap` ≡ abort previous run + start new; `takeUntil(dismiss$)` ≡ abort.

Bridge: `bridge/in.ts` — `iterate(observable, signal): AsyncIterable<T>`
(queued) and `once(observable): Promise<T>` for RPC-shaped ports;
`bridge/out.ts` — `topicToStream(topic): Stream<T>`,
`storeToStateStream(store): StateStream<S>`.

Tile execution, the most operator-dense machine today, becomes:

```ts
async function run(cmd: ExecuteCommand, signal: AbortSignal): Promise<void> {
  store.set({ status: "started" });
  void sleep(TOO_LONG_THRESHOLD_MS, signal).then(() =>
    store.set((s) => (isTerminal(s) ? s : { status: "tooLong" })));
  const outcome = await Promise.race([
    once(deps.execute(input(cmd))).then(finished, () => finished(timedOut)),
    sleep(EXECUTION_TIMEOUT_MS, signal).then(() => TIMEOUT),
  ]);
  store.set(outcome);
  await sleep(CONFIRMATION_DISMISS_MS, signal);
  store.set(READY);
}
// intents.execute aborts the previous controller and spawns run(); dismiss aborts and resets.
```

Pure reducers (the stale-flag fold, `reduceRfqEvent`, …) are
paradigm-neutral and are **imported from `@rtc/client-core`**, not
duplicated — the fold under test is the same function driven by a different
runtime. Composition is constructor injection in today's `createApp` order.
Tests use vitest fake timers + `advanceTimersByTimeAsync`.

### The Effect core

Pinned to `effect` 3.22.x.

- **Streams.** `Stream<A, E>` built in `Effect.gen`, multicast with
  `Stream.share({ capacity: "unbounded", replay: 1 })` (since 3.8; upstream
  runs only while ≥1 consumer — the refCount semantics). Per-key memoisation
  is `Effect.cachedFunction` inside the presenter's Layer scope, so same-key
  identity holds by construction. Conflation / rolling windows are `Stream`
  combinators, not a hand-rolled kernel — that is the point of the comparison.
- **Machines.** State is a `SubscriptionRef<S>` (`changes` is documented as
  "the current value as well as all changes" — replay-current). Intents are
  Effects forked into the machine's own `Scope`; `dispose` closes the scope.
  Tile execution is `Effect.race` of the RPC against `Effect.sleep`, the
  too-long marker a forked sleep, switch-map semantics `Fiber.interrupt` of
  the previous run. `TestClock.adjust` drives every timing test.
- **Composition root.** Each presenter is a `Context.Tag` service with a
  `Layer`; `AppPorts` enters as `Layer.succeed(AppPortsTag, ports)`;
  `createApp(ports)` is `ManagedRuntime.make(AppLive)` + one `runSync` that
  resolves the tags into the `Presenters` record; `App.dispose` calls
  `runtime.dispose()`.
- **Bridge.** `bridge/in.ts` — `fromObservable(obs): Stream<T>` via
  `Stream.asyncPush` (subscribe in register, unsubscribe in the scope
  finaliser), `rpc(obs): Effect<T, E>` via `Effect.async`. `bridge/out.ts` —
  `streamToStream(runtime, stream)` runs `Stream.runForEach` as a forked
  fiber per `Observable` subscribe and interrupts on unsubscribe;
  `refToStateStream(runtime, ref)` seeds `state()` with
  `runtime.runSync(SubscriptionRef.get(ref))` (the synchronous warmth).
  Typed errors are `Cause.squash`ed at the boundary only.
- Same shared pure reducers, same strangler spread-and-override, same parity
  manifest. Timing tests use `effect`'s own `TestContext` / `TestClock` under
  plain vitest — `@effect/vitest` 0.30 peers on `vitest ^3.2` and the repo is
  on 4.1.

### The core-contract tier (`@rtc/core-contract`)

Dev-only, consumed by each core as a devDependency, never from `src`.

- **Suites.** One per `Presenters` member and per `MachineFactories` member,
  in the port-contract idiom: `describeXContract(label, makeHarness)`. Each
  `it` subscribes to the member's `Stream` / `StateStream`, drives the
  scripted ports, advances the clock, asserts on collected values.
  Assertions are envelope-level only: values, ordering, completion, teardown
  on last unsubscribe, synchronous first value, same-key identity. Never
  `shareReplay`, Subjects or operators. **Shipped mechanism for "every member
  has a suite":** `CONTRACT_SUITES` is an exhaustive
  `Record<ContractMember, Suite | null>` keyed off `keyof Presenters` /
  `keyof MachineFactories` / `keyof AppCommands`, so an unlisted member is a
  COMPILE error rather than a test failure; a `null` entry must also appear in
  the hand-maintained `PENDING_SUITES` array, and `registry.test.ts` fails on
  any drift between the two lists.
- **Harness.** `makeHarness()` → `{ app, machines, driver, teardown }`.
  **Shipped shape:** `scriptPorts(base)` WRAPS an `AppPorts` the runner
  supplies — each core's runner builds the base itself from
  `createSimulatorPorts` plus its own `connectionEvents` — and overrides
  exactly two members: `connectionEvents` (merged once with a harness-owned
  Subject, so the `driver` can emit connection events) and `colorScheme`. It
  does not build a full `AppPorts` of its own, because `@rtc/core-contract`
  must not depend on `@rtc/client-core` (that edge would close a turbo
  task-graph cycle: the RxJS core's own contract runner lives inside
  `client-core`). The `driver` stays intent-named, and at slice 0 carries only
  what slice 1a's members need — `emitConnection`, `connectionEvents$`,
  `setPrefersDark`; the price/execution verbs (`tickPrice`,
  `resolveExecution`, `failExecution`, …) arrive with the slices that assert
  on them. Preferences use the domain's
  `PreferencesSimulator` (production code, already replay-current). Time is
  vitest fake timers for all three cores — Effect's live `Clock` sits on
  `setTimeout`, so `advanceTimersByTimeAsync` drives it; `TestClock` stays in
  the Effect core's own unit tests.
- **Runners.** One `tests/core-contract.test.ts` per core, importing every
  suite and supplying `makeHarness` from that core's own factory pair — the
  swap-trio equivalent. Each alternative core carries a `test:coverage` gate
  at ≥95% over its native code (matching the devtools gates).
- **Case provenance and gap fill.** client-core's 62 presenter/machine tests
  are triaged once: envelope-level cases **move** into the suites; RxJS-
  specific cases (marble timing, operator identity) stay. The index test then
  lists members with no behavioural coverage; those get suites written
  against the RxJS core first. **Ordering rule for the whole workstream: a
  member's suite exists and is green on RxJS before either alternative core
  ports it.**
- **Strangler interaction.** A delegated member passes trivially (it is the
  RxJS instance). The parity manifest says which passes are meaningful; its
  drift test keeps that honest. Contract = behaviour; manifest = provenance.

### Selection, scripts, CI

- **`VITE_CORE_IMPL`** ∈ `rxjs` (default when unset) | `async` | `effect`.
  Each web client gets `src/app/selectCore.ts` beside `buildBrowserPorts.ts`:
  a static `if` chain over `import.meta.env.VITE_CORE_IMPL` returning a
  `CoreFactory`; Vite inlines the literal and Rollup drops dead branches, so a
  production build carries exactly one core. Any other value throws at boot.
  `AppRoot` imports the factory pair from `selectCore`. That is the whole
  client-side change.
- **Turbo / deploy guards.** `VITE_CORE_IMPL` joins the `dev` and `build`
  env lists in `turbo.json` (strict env mode would otherwise strip it and
  silently boot RxJS); the `deploy.yml` grep-guard extends to it. Production
  keeps it unset until a core reaches full parity.
- **Scripts.** `dev:react:async`, `dev:react:effect`, `dev:solid:async`,
  `dev:solid:effect` (sim mode; default stays bare). Transport composes by
  env: `VITE_CORE_IMPL=effect pnpm dev:react:ws:local`.
- **e2e per core.** `tests/scripts/run-all.ts` reads `RTC_CORE_IMPL` and
  passes it to the Vite server it launches as `VITE_CORE_IMPL`, composing with
  `RTC_CLIENT_PKG`. Scripts `test:e2e:async`, `test:e2e:effect`.
- **`check:core-bundle`.** Builds each client once per core, asserts the
  `rxjs` build contains no Effect code (hard gate), prints gzipped size per
  core (informational).
- **CI.**

| gate | where | cost |
|---|---|---|
| core-contract suites, per core | each core's `test` in the `checks` job | seconds |
| alt-core coverage ≥95% | `checks` job, beside the devtools gates | seconds |
| dep-cruiser + grep gates for the bridge rule | `checks` job | seconds |
| `check:core-bundle` | `checks` job, after build | ~1 min |
| e2e matrix `{react, solid} × {rxjs, async, effect}` | `e2e` job becomes a 6-way parallel matrix | same wall time, 3× minutes (public repo, free) |

`/rtc:gauntlet full` gains the core-contract and bundle steps; the e2e matrix
stays out of it, as e2e is today. The devtools decorators need no change —
they wrap plain Observables.

## Delivery

### Slice 0 — foundation (no business logic ported)

`@rtc/core-api` extraction with `implements` clauses; `@rtc/core-contract`
with harness, index test and suites for slice 1a's members; both alternative
cores scaffolded at 100% delegation with `parity.json` and the drift test;
`selectCore`, scripts, turbo env, bundle check, e2e matrix; ADR-006.
**Exit:** both web clients boot on all three cores, every gate green,
production build carries the RxJS core only — `check:core-bundle` asserts no
foreign-core marker per build and the deploy guard re-checks the Vercel
output. (An earlier draft said "production bundle byte-identical"; that is
unmeetable by construction, since `selectCore.ts` itself is new code in every
build.)

### Slices 1a–7 — one vertical slice each

Done when: suites for the slice's members exist and are green on RxJS; both
alternative cores have them native; e2e matrix green; `parity.json` updated.

| slice | members | why here |
|---|---|---|
| 1a connection + theme | `connection`; `themePreference`, `themeSkinPreference`, `viewModePreference`, `powerSaver`; `AppCommands.reconnect` | proves synchronous replay-current early (`cycle()`, theme flash); `powerSaver` feeds slice 2's conflation |
| 1b remaining preferences | `creditRfqFilterPreference`, `eqWatchlistSortPreference`, `eqBlotterViewPreference`, `bootPreference`, `loginWaitPreferences`, `jarvisPreferences`, `animatedBackground`, `ambientStyle`, `chartSubstrate`, `layoutEngine`, `forceBootAnimation` | mechanical once 1a's preference idiom exists; split out so 1a stays reviewable |
| 2 FX pricing + blotter | `priceStream`, `priceHistory`, `currencyPairs`, `blotter`, `analytics`, `execution`; machines `staleFlag`, `analyticsStaleFlag`, `rowHighlight`, `notional`, `tileExecution` | conflation, memoised identity, the racing machine |
| 3 credit | `rfqs`, `dealers`, `instruments`, `rfqQuote`; machines `rfqTile`, `rfqSubmission`, `ticketSubmission`, `RfqCountdownMachine` | the `@rx-state` submissions and the RFQ reducer |
| 4 equities | `watchlist`, `candleSeries`, `depth`, `ordersBlotter`, `positions`; machines `eqWorkspace`, `eqDrawings`, `orderTicket` | the two singletons the World harness instantiates |
| 5 admin | `throughput`, `throughputMetric`, `latencyMetric`, `errorRateMetric`, `topology`, `eventLog`, `sessions`, `sessionsKpi`; machine `incident` | rolling windows |
| 6 shell | `layoutFor` + `dockPanel` / `undockPanel` / `dismissPanel` / `resetWorkspaceLayout`, `workspaceNav`, `boot`, `bootGate`, `auth`, `animationDirector` | the per-tab singleton with the structural no-op dispose |
| 7 jarvis | `jarvis`, `jarvisPanels`, `jarvisDriver`, `jarvisDemo`, `jarvisUsage`, `NarratorMachine` | largest choreography; depends on everything above |

### Slice 8 — closing

Delegation removed; `client-core` runtime dependency dropped from both
alternative cores; shared pure reducers moved to `@rtc/core-logic`;
dep-cruiser rules tightened.

### Regime

Per slice the two cores are disjoint packages → parallel implementers with
covering tests only, one gauntlet per slice, mid and final reviews
(accelerated SDD).

## Parity manifest

`parity.json` per alternative core: `{ presenters: { member: "native" |
"delegated" }, machines: { … } }`. A test asserts the manifest matches reality
by reference inequality against the RxJS core's instances. `pnpm core:parity`
prints both manifests as one table for PR descriptions and STATUS.md.

## Documentation

- **ADR-006** — pluggable application core: the envelope aliases, the
  bridge-owns-RxJS rule, the strangler + manifest, the standard-`Observable`
  follow-up; retroactively records the RxJS choice (§10.1) as its context.
- `docs/architecture/`: new **§22 pluggable cores**; §8 replaceability row
  for "state streams" updated; §14's stale `composition.ts` line references
  fixed in passing.
- `CLAUDE.md`: three new packages in the table, the four scripts in the dev
  matrix.
- `docs/STATUS.md`: workstream entry via the tracking skill.

## Named follow-ups (out of scope)

1. Web-standard `Observable` envelope: alias flip, bridge edits, polyfill
   until Firefox/Safari ship; `subscribe()` returning `undefined` means the
   bindings own an `AbortController` per subscription.
2. Effect 4.0 once stable.
3. React Native on the alternative cores (`EXPO_PUBLIC_CORE_IMPL`, Hermes
   bundle-size check for Effect).
4. The ui-contract "integration mode" (real `createViewModel` + simulators).
5. Splitting the shared adapters out of `client-core` into their own package
   once slice 8 removes the delegation dependency.

## Risks

| risk | mitigation |
|---|---|
| A core satisfies the types but breaks a timing guarantee | the contract asserts synchronous first value and teardown-on-last-unsubscribe explicitly, per member |
| Alternative core quietly reuses RxJS operators | `bridge-owns-rxjs` dep-cruiser rule + grep gate |
| Parity manifest drifts from reality | reference-inequality drift test |
| Contract under-covers a member | index test: every member has a suite |
| Tree-shaking fails and all three cores ship | `check:core-bundle` hard gate |
| Turbo strict env strips `VITE_CORE_IMPL` | declared on `dev`/`build`; deploy grep-guard |
| Effect 4.0 lands mid-workstream | pinned 3.22.x; bump is a follow-up |
