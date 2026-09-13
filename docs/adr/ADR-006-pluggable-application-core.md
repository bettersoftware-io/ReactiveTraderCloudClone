# ADR-006: Pluggable application core (RxJS / async-await / Effect-TS)

## Status

Accepted 2026-09-12; slice 0 shipped in this PR.

## Context

The RxJS `Observable` boundary decision itself was never recorded as a
decision in its own right — it lives only as
[§10.1](../architecture/10-key-design-decisions.md#101-rxjs-observablet-as-the-boundary-stream-type)
of the key-design-decisions catalogue, which already rates a future swap
"very high" cost because it would touch every port, simulator, use case, and
presenter at once.

The React ↔ SolidJS experiment
([§21](../architecture/21-cross-framework-testing.md)) proved the *UI* layer
is replaceable: two clients share `@rtc/client-core` and pass the same
`@rtc/ui-contract` behavioural specs. It proved nothing about the
*application* layer underneath — `client-core` itself had no seam of its own,
and nothing forced one into existence.

Two findings made the seam newly possible to name precisely:

- **The bindings consume exactly three `client-core` types** — `Presenters`,
  `MachineFactories`, `AppCommands` — plus `Machine<S,I>`. Bridging at that
  boundary is a handful of interfaces; bridging at the `ViewModel` boundary
  would be two independent implementations of ~60 members each.
- **The 103 UI contract specs cannot witness a swapped core.** They seed a
  fake `World` and drive it directly — never `createApp` — so a core that
  satisfied the wrong contract would still pass every one of them. A new,
  narrower tier at the `Presenters`/`MachineFactories` boundary was needed
  because nothing existing could serve as the equivalence witness.

## Decision 1 — `@rtc/core-api` is the contract

A new types-only package holds everything a client or binding needs to name
an application core without naming an implementation: the `Stream<T>` /
`StateStream<S>` aliases, one interface per presenter, every machine's
state/intents/view types, `Machine<S,I>` / `ReadOnlyMachine<S>` /
`MachineFactories`, `Presenters`, `AppCommands`, `AppPorts`, `App` (now with
`dispose(): Promise<void>`), and `CoreFactory = { createApp,
createMachineFactories }` — the whole plug. `@rtc/client-core` keeps its
name and its adapters, gains `implements <X>PresenterApi` clauses on every
presenter class, and re-exports every moved type so no existing import
changes. Grep gate 42 (`@rtc/core-api` exports no runtime value) makes the
types-only half of the rule mechanical, not a convention.

## Decision 2 — `Observable` stays the envelope, behind the aliases

`Stream<T>` and `StateStream<S>` are defined once, as aliases over RxJS's
`Observable<T>` / `@rx-state/core`'s `StateObservable<T>`, rather than a new
neutral type. What `Observable` cannot carry — pull-based backpressure,
Effect's typed error channel — is irrelevant at a UI edge, so paying to
abstract it now would buy nothing a client actually needs.

The named follow-up is the **web-standard `Observable`** (WICG, heading for
WHATWG DOM): shipped in Chromium/Edge 135, not in Firefox or Safari as of
2026-09. `subscribe()` returns `undefined` (cancellation is by
`AbortSignal`, not a returned subscription), there is no multicast
primitive, and no `Symbol.observable` interop with RxJS. Adopting it later
is an alias flip plus bridge edits plus a polyfill until the other two
engines ship it — not a rewrite, because every consumer already only sees
the alias.

## Decision 3 — bridge-owns-rxjs

Outside a core's own `bridge/` directory, `rxjs` and `@rx-state/core` are
**type-only** imports in the two alternative cores — enforced by the
dependency-cruiser rule `bridge-owns-rxjs` and mirrored by grep gate 43.
Rationale: an "async core" that reaches for `shareReplay` inside its own
machines is RxJS with extra steps, not a second implementation of the
timing guarantees. The bridge directory is the one place allowed to
construct a `new Observable` or call `state()`; everything past it is native
to the core's own paradigm (a `Store`/`Topic` pair for async-await,
`Stream`/`SubscriptionRef` for Effect).

## Decision 4 — strangler with a parity manifest

Both alternative cores ship at slice 0 with **every** member delegating to
the RxJS `App` (`{ ...createRxjsApp(ports), ...nativePresenters() }`, the
latter empty today). A committed `parity.json` per core records, per
presenter and per machine, whether it is `"native"` or `"delegated"`, and a
drift test asserts that record against reality by **reference inequality**
against the RxJS core's own instances — so the manifest cannot silently lie
about what has actually been ported. The contract tier proves *behaviour*;
the manifest proves *provenance*. A delegated member passes the contract
trivially (it is the RxJS instance), which is expected and correct — the
manifest is what keeps that fact honest rather than mistaken for progress.

## Decision 5 — `@rtc/core-contract` is the equivalence witness

A new dev-only package, mirroring `@rtc/ui-contract`'s shape: one suite per
`Presenters` member and per `MachineFactories` member (`describeXContract`),
an exhaustive `CONTRACT_SUITES` registry keyed by dotted member path (a
compile error to add a member to `Presenters`/`MachineFactories` without
listing it here), a hand-maintained `PENDING_SUITES` list with its own drift
test, and one runner file per core (`composition.coreContract.test.ts` for
RxJS, `coreContract.test.ts` for each alternative). Assertions stay
envelope-level only — values, ordering, completion, teardown on last
unsubscribe, synchronous first value, same-key identity — never an operator
or a Subject.

The existing `@rtc/ui-contract` specs are deliberately left alone: they
already witness the UI-framework swap and were never wired to `createApp`,
so extending them to also witness the application-core swap would mean
rewriting their harness, not reusing it. The e2e Gherkin suites, which *do*
exercise a real `createApp`, are extended instead — run once per core
(`RTC_CORE_IMPL`), the strongest signal a delegating core is currently
capable of producing since none of its own members are native yet.

## Consequences

- Four new packages join the graph: `@rtc/core-api` (types-only, innermost
  after `domain`/`shared`), `@rtc/core-contract` (dev-only, depends on
  `core-api` + `domain` + `rxjs` only — **never** `client-core`, to avoid a
  build-order cycle with the RxJS core's own contract runner living inside
  `client-core`), `@rtc/client-core-async`, `@rtc/client-core-effect`.
- Each web client gains one `src/app/selectCore.ts`, and `AppRoot` now
  imports its `CoreFactory` pair from there instead of `@rtc/client-core`
  directly.
- Production stays pinned to the RxJS core: `VITE_CORE_IMPL` unset resolves
  to `rxjs`, and the deploy workflow's bundle guard fails the build if
  `effect/Fiber` appears in the shipped static output. `pnpm
  check:core-bundle` gives the same guarantee locally, per core, with gzip
  sizes for visibility.
- `effect` is pinned `^3.22.2` (published 2026-09-09; 4.0 was a release
  candidate, not stable, at design time — a named follow-up).
  `@effect/vitest` is **not** used: its peer range is `vitest ^3.2` and the
  repo runs `vitest ^4.1.10`. Timing tests use `effect`'s own `TestContext` /
  `TestClock` under plain vitest instead.

**Learned in slice 0** (findings that shaped the implementation but were not
predictable from the design alone):

- **Folding the core selection needs `define`, not a ternary over
  `import.meta.env`.** Vite's built-in `import.meta.env.VITE_CORE_IMPL`
  replacement leaves the value as whatever string the process ran with;
  rolldown cannot constant-fold a branch on a value it can't prove is a
  literal at that point. `activeCore` in `selectCore.ts` compares
  `import.meta.env.VITE_CORE_IMPL` directly against each core name (never
  hoisting it to a local first), and each `vite.config.ts` re-inlines the
  same expression via `define: { "import.meta.env.VITE_CORE_IMPL":
  JSON.stringify(process.env.VITE_CORE_IMPL || "rxjs") }` so rolldown sees a
  literal at every comparison site and drops both dead branches (and the
  unselected core packages, which declare `sideEffects: false`). A version
  that read the env var into a local variable first and branched on that
  local did **not** fold — found in review, before it reached `main`.
- **`Topic.fail` is terminal by design, matching the RxJS operator it stands
  in for.** After `fail`, the async core's `Topic<T>` is dead: a later
  `subscribe` receives the latched error synchronously, a later `publish`
  reaches nobody, and a later `fail` is ignored — mirroring what an RxJS
  source error does to every subscriber, including ones that arrive after
  the error already fired.
- **The Effect core's dispose order is base → scope → runtime, not runtime
  first.** `EffectHost = { runtime: ManagedRuntime, scope: Scope.CloseableScope
  }`; every bridged stream forks its fiber into `host.scope` (via
  `runtime.runFork(..., { scope: host.scope })`) because `ManagedRuntime`
  mints *root* fibers that disposing the runtime does not interrupt. So
  `dispose()` closes the delegated RxJS app first (its teardown may still be
  driving streams this core bridged), then closes the scope to interrupt
  whatever fibers remain, and only then disposes the runtime — each step in
  its own `finally`, each step idempotent.
- **The strangler seam has to cover machine factories, not just
  presenters.** `composeMachinesWithBase` exists alongside
  `composeWithBase` because `MachineFactories` members are *factory
  functions* that mint a fresh `Machine` closure on every call — parity by
  reference only holds if the overlay wraps the factory itself, not a single
  instance it once produced.

## Follow-ups

1. Slices 1a through 8 (see the [design spec](../superpowers/specs/2026-09-11-pluggable-application-core-design.md#delivery)):
   1a connection + theme, 1b remaining preferences, 2 FX pricing + blotter, 3
   credit, 4 equities, 5 admin, 6 shell, 7 jarvis, 8 closing (delegation
   removed, `client-core` runtime dependency dropped from both alternative
   cores, shared pure reducers relocated to `@rtc/core-logic`).
2. The web-standard `Observable` envelope (Decision 2): alias flip, bridge
   edits, a polyfill until Firefox/Safari ship it; the bindings would need to
   own an `AbortController` per subscription since `subscribe()` no longer
   returns a subscription object.
3. `effect` 4.0 once it leaves release-candidate status.
4. React Native on the alternative cores (`EXPO_PUBLIC_CORE_IMPL`, plus a
   Hermes bundle-size check for the Effect core — RN stays RxJS-only for now).

## See also

- [Pluggable application core design spec](../superpowers/specs/2026-09-11-pluggable-application-core-design.md)
- [Slice 0 implementation plan](../superpowers/plans/2026-09-12-pluggable-core-slice-0.md)
- [§22 Pluggable Application Core](../architecture/22-pluggable-application-core.md)
- [§10.1 RxJS `Observable<T>` as the boundary stream type](../architecture/10-key-design-decisions.md#101-rxjs-observablet-as-the-boundary-stream-type)
- [§8 Replaceability Matrix](../architecture/08-replaceability-matrix.md)
- [§21 One Test Suite, Two Frameworks](../architecture/21-cross-framework-testing.md)
