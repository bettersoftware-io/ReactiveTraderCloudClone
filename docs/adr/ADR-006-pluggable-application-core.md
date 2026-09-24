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

**Learned in slice 1a** (2026-09-18):

- **`Stream.share` cannot be an Effect presenter's envelope.** It replays to
  a new subscriber on a fiber, so the synchronous-first-value guarantee is
  unmeetable through it. The Effect idiom is `sharedFold`: a
  `SubscriptionRef` seeded synchronously on every first subscribe (a
  `peek` of the port for a mirror, a constant for a pure fold), a producer
  fiber forked into a per-warm-period child `Scope`, the last unsubscribe
  closing that scope. Writes go through an `update` that publishes only a
  non-`Object.is`-equal result — a `SubscriptionRef.set` of an equal value
  re-publishes (measured) — and only for the current warm period, since a
  scope closes on a fiber and a producer can outlive its period by a tick.
- **The contract asserts only the first value synchronously.** Everything
  after a drive is asserted after `settle()`. Slice 0's suites pinned
  RxJS's delivery tick without meaning to; they passed on both alternative
  cores only because those cores were still delegating.
- **The async core needed a synchronous relay, not an iterator, for hot
  ports.** A `for await` over `iterate(port$)` resumes a microtask after the
  port's synchronous emission; `relay(port$, signal, publish)` hands it on
  in the same tick, which is what makes a `Topic` over a `BehaviorSubject`
  port replay-current. `iterate` remains the pull-paced tool. Release is
  synchronous for the same reason: a producer that only released its
  upstream in a `finally` after an `await` was two microtasks late, so
  `mapTopic` and the theme presenter's `mode$` also release from a
  synchronous `abort` listener.
- **Under Effect, subscribing is deferred too, not only delivery.** Measured
  on 3.22.2: under `Stream.runForEach` + `runFork`, EVERY `Stream` shape
  (`asyncPush`, `asyncScoped`, `unwrapScoped`, a synchronous `unwrap`) defers
  even a bare `Effect.sync` by ≥1 microtask, so the rxjs `subscribe` inside
  the stream ran late and a Subject event emitted synchronously right after
  a `sharedFold`'s first subscribe was lost (three contract cases red).
  `fromObservable` (`packages/client-core-effect/src/bridge/in.ts`) now
  subscribes the port EAGERLY at call time into a `Queue`, before any
  `Stream` machinery; consequently it must be called inside a
  `sharedFold`'s `run` (once per warm period), never at presenter
  construction — `themePreference.ts` had to move its colour-scheme stream
  inside `run`. Also: `sharedFold`'s `update` now yields
  (`Effect.yieldNow()`) after each `set`, because publishes made before the
  `ref.changes` watcher has subscribed its `PubSub` are dropped (a
  same-tick burst of three events delivered `[0, 6]` instead of
  `[0, 1, 3, 6]`).
- **`commands.reconnect` is native in provenance but shared in transport.**
  Both web clients merge `@rtc/client-core`'s module-level `reconnect$`
  into `connectionEvents` for every core, so each core's native command
  pushes into it — through its `bridge/out.ts`, the one place a Subject
  method is called. Slice 8 moves the seam.

**Decided in slice 1b** (2026-09-19):

- **Completion is not part of the presenter-stream envelope.** Neither
  alternative core has a completion channel (`Topic` has no `complete`;
  `sharedFold` never completes its subscribers), no port completes outside
  teardown, and no suite asserts completion — so rather than build a
  channel nobody observes, the spec's assertion list drops the word. A
  presenter stream ends with `dispose()` or with an error. A later member
  whose source legitimately ends adds the channel in its own slice, against
  a suite that asserts it.
- **The preference family needed no new primitive.** Eleven members went
  native on slice 1a's `topicFromObservable` / `mirrorPort` (+ a two-line
  identity sibling, `mirrorPortAsIs`) and `peek` — evidence that the
  1a/1b split landed the idiom in the right place. Per core the presenters
  now group by API shape (`preferences.ts`, `groupedPreferences.ts`,
  `readPreferences.ts`) rather than one file per member.

**Decided in the residual sweep** (2026-09-19):

- **Error resets, in every core.** The async `Topic` latched a source error
  (slice 0) where `shareReplay({ refCount: true })` resets; it now resets
  (an external `publish()` while no producer run is live — cold, or just
  after a reset — is dropped, never latched). A throwing subscriber is
  isolated as rxjs isolates it.
- **Silence after `dispose()` is the shared behaviour, not a gap.** The RxJS
  `dispose()` is a knowing no-op; an interrupt-only Effect cause is silent
  for the same reason. Revisit with the RxJS `Subscription` bag.
- **`sharedFold` periods may be seedless, and the producer's first write
  awaits a watcher latch.** `Option`-typed ref; `yieldNow` gone; the
  generation counter gone (per-period subscriber sets do its one real job).
  (`seed()` is evaluated before any resource is created, so a throw errors
  only the triggering subscriber and starts no period; the period's FIRST
  subscriber gets every intermediate of a same-tick burst — the latch — and
  a later joiner's intermediates before its own watcher subscription
  conflate into its head, conflation, never staleness.)
- **Port subscriptions belong to the period.** `fromObservable` is reached
  only through `fromPort`; a dependency-cruiser rule confines `bridge/in.ts`.
- **Every port method is called once, at construction** — including
  `colorScheme.prefersDark$`, which the `portDiscipline` suite also counts.
  A rule for all three cores, contracted by `portDiscipline`. Witnessed as
  CONSTANCY, not an absolute count: a strangler core's `composeWithBase`
  constructs the RxJS base app's presenter (one port call) and then the
  native overlay (one more), so an absolute "once" holds only for the RxJS
  core until slice 8 removes delegation; the suite asserts the count after
  construction never changes across warm periods or synchronous reads.
- **`peek` throws.** A port that errors on subscribe fails the read at its
  site.
- **`client-core` class docs carry implementation notes only**; the
  `core-api` interface is the contract's prose.

**Decided in slice 2** (2026-09-19):

- **Suites shipped ahead of the ports, as their own PR.** The ordering rule
  ("green on RxJS first") is a merge boundary, not a task order: the ports
  are judged against a fixed target, and a reviewer can accept the suites
  and reject a port.
- **The pure folds are exported from `@rtc/client-core` and imported by both
  siblings** (`blotterFolds`, `staleFlagFold`, `notionalView`,
  `tileExecutionState`), and the four app-layer timings/caps the suites need
  live in `@rtc/domain` (`PRICE_CONFLATION_MS`, `PRICE_HISTORY_CONFLATION_MS`,
  `BLOTTER_ROW_HIGHLIGHT_MS`, `ACTIVITY_FEED_CAP`) — the contract tier may
  not import `client-core`. The fold under test is the same function driven
  by a different runtime; slice 8 moves the folds to `@rtc/core-logic`.
- **`warmReplay` has a name in each sibling:** `TopicOptions.retainUntil`
  (an `AbortSignal` the app mints and aborts in `dispose()`, before the base
  app) and `SharedFold.retain` (the host scope ends the period). Four
  members use it: the three singletons and `blotter.activity$`.
- **Conflation is hand-written in both siblings**, as `conflateWhen` is in
  the RxJS core: neither runtime ships a leading+trailing throttle gated by
  a flag (Effect's `Stream.throttle` is a token bucket, `aggregateWithin`
  trailing-only). One producer per core, inside the one place its runtime
  allows a timer. A flip takes effect at once; a trailing value pending when
  the flag turns off is discarded (uncontracted); values before the flag has
  spoken are dropped.
- **Machines own their lifetime.** `createMachineFactories(presenters)` has
  no app handle, so an async machine is a `Store` plus an `AbortController`
  and an Effect machine is a `SubscriptionRef` under a detached host
  (`Runtime.defaultRuntime` + its own `Scope`). A machine's source failure
  has no channel on either — the RxJS `state()` would error `state$`, which
  nothing observes — so it aborts the machine and is rethrown out of band.
- **The Effect core composes as `Context.GenericTag` services in a `Layer`
  graph** (`services.ts`, `layers.ts`): `AppPorts` enters as
  `Layer.succeed`, the host is a `Layer.scoped` owning a closeable child
  scope, every native presenter is a `Layer`, `createApp` is
  `ManagedRuntime.make(buildAppLayer(ports))` and ONE synchronous `runSync`.
  `PowerSaverLive` is merged into the app AND provided to the two dependents;
  Layer memoisation makes it one instance. `GenericTag` rather than the class
  form because a class must name its file. `EffectHost.runtime` is the
  structural `EffectRunner`, so a `ManagedRuntime` (tests) and a captured
  `Runtime` (the Layer) both serve. `buildAppLayer` provides the host and
  ports with `Layer.provideMerge`, so the resolved runtime still exposes
  `HostTag` for the one `runSync`; the conflating fold seeds its calm flag
  from `peekCurrent(calm$)`, the twin of the RxJS `switchMap` subscribing
  the flag synchronously before any tick (`Stream.merge` would otherwise
  drain the tick queue first).
- **`rpc` is a bridge file of its own** (`bridge/rpc.ts`): lazy, so the
  eager-subscription rule that confines `bridge/in.ts` does not apply to it.
- **A one-shot command result completes** (`execute(input)`): the slice-1b
  ruling was about presenter STREAMS; an RPC result's source ends.
- **`executions$` is asserted only after `settle()` following subscribe**
  — the Effect `PubSub` subscription is taken on the subscriber's fiber; a
  publish in that gap reaches nobody, as on an RxJS `Subject` with no
  observer.
- **Fake timers are the suite's, not the harness's** (`withFakeClock`): the
  harness is built inside the fake clock; `clock.settle()` replaces
  `settle()` there; Effect's live `Clock` sleeps on the global `setTimeout`,
  which vitest fakes (measured, `bridge/clock.test.ts`).
- **Three envelope rulings from the suites' first contact with the RxJS
  core.** The relative order of events from different sources driven in one
  synchronous burst is uncontracted (suites `settle()` between sources —
  measured: a native fiber-scheduled `connection` fold against a
  synchronous delegated price port); what a machine does after `dispose()`
  toward a still-attached subscriber is uncontracted (the bindings
  unsubscribe first; suites assert a fresh subscription after unsubscribe +
  dispose yields the current value synchronously); for a machine, distinct
  consecutive states ARE contracted (the stale flag never re-emits `false`;
  `Store` drops `Object.is`-equal writes, Effect writes through
  `setRefIfChanged`).
- **Base-side consumers of a newly native member stay on the base instance
  until their own slice.** The RxJS `AnimationDirector` and `NarratorMachine`
  capture the base app's `execution`, `currencyPairs` and `priceStream`
  streams at construction, and `animationDirector`/`jarvis` are not overlaid
  until slices 6 and 7 — so under an alternative core the tile fill/reject
  animations do not play and two FX ports carry a second live subscription
  (a doubled simulator tick rate for mounted pairs). Accepted and recorded
  rather than coded around: feeding the base presenter's private Subject
  from the native `execute()` would make the native member RxJS with extra
  steps. Production keeps `VITE_CORE_IMPL` unset. **Closed 2026-09-22**
  without doing that — slice 4's `CoreSeams` redirects the READER instead
  (see "Decided in slice 4").
- **Four cross-core asymmetries are recorded, not coded around.** (1) When
  the tile's timeout wins, the Effect machine releases the losing execution
  call at once (`Effect.race` interrupts the loser and `rpc`'s finalizer
  unsubscribes the port) where the async and RxJS machines hold it until
  dismiss, a new execute or dispose — each core's unit test witnesses its
  own side; the contract cannot tell them apart, because the harness's
  `resolveExecution` is a no-op with nothing pending. (2) A subscriber
  arriving AFTER `app.dispose()`: the async retained topic restarts its
  producer, the Effect retained fold stays silent, the RxJS core never tore
  down — uncontracted; the bindings unsubscribe before disposing. (3) A late
  joiner of a WARM `priceHistory` period sees two equal emissions (the
  retained-window lead, then the replay) on the async and RxJS cores and one
  on Effect, whose seed is the window itself — content-identical,
  uncontracted. (4) The Effect core's `events$` is a `mirrorPortAsIs`, which
  conflates an `Object.is`-equal consecutive event, where the async `Topic`
  and the RxJS `warmReplay()` re-emit it — unreachable today because every
  shipping producer (`CreditRfqSimulator`, the WS port factory) builds a
  fresh event object per event; a hoisted constant event would be the first
  case to differ (recorded, not re-engineered).
- **Teardown order, stated once.** An alternative core releases its own
  resources first (loops, retained topics and periods), then disposes the
  base app, then (Effect) the runtime; the Effect composition's base →
  scope → runtime order is equally safe while the RxJS `dispose()` is a
  knowing no-op, and slice 8 removes the base — so it stays, and both
  composition comments point here.

**Decided in slice 3** (2026-09-20):

- **A member the seam cannot route is not portable.** Both bindings built
  the credit countdown by importing `createRfqCountdownMachine` from
  `@rtc/client-core` directly, so under `VITE_CORE_IMPL=async|effect` the
  RFQ card would have kept ticking on an RxJS `timer` whatever the
  alternative cores did. `rfqCountdown` therefore became a
  `MachineFactories` member — the seam's first *growth* rather than a port
  — taking the member count 72 → 73 and making "36/73" the slice's number
  (36/74 once Dockview Phase 6b's `layoutPresets` landed alongside it, delegated).
  The two `viewModelFromWorld.ts` UI-contract harnesses keep their direct
  import: they build their own view model and are not the seam.
- **The suites' constants and seeds keep moving to `@rtc/domain`, the
  helpers to `@rtc/client-core`.** `RFQ_COUNTDOWN_INTERVAL_MS` and
  `RFQ_REDIRECT_DELAY_MS` join the domain cadences (the RxJS files keep
  their local names as aliases), and `createEmptyRfqStreamState` is
  exported beside `reduceRfqEvent` — "pure reducers are imported, not
  duplicated" covers the seed as much as the step. `shallowArrayEquals` +
  `createShallowArrayMemo` are exported from `@rtc/client-core` so all
  three cores suppress an unchanged roster through the SAME comparison:
  `rfqs$` and `quotesForRfq$` do not re-emit after an event that leaves
  the projection element-wise equal. That is contracted behaviour, not a
  conflation courtesy — the memo returns the PREVIOUS array, so the async
  `deriveDistinct` (reference equality) and the Effect `mirrorPort`
  (`Object.is`) both drop it for free.
- **One `workflow.events()` call per sibling.** The RxJS core calls it
  twice — once for the reducer's use case, once for the raw `events$` —
  which is two port subscriptions for one fact. Both siblings call it once
  at construction and take two subscriptions of the captured Observable:
  `topicFromObservable` + a relaying state Topic (async),
  `mirrorPortAsIs` + a retained `sharedFold` whose `run` calls `fromPort`
  (Effect). `portDiscipline` witnesses constancy, which holds either way.
- **The three credit singletons are retained; their derivations are not.**
  `rfqs.state$`/`events$`, `dealers.list$` and `instruments.list$` take
  `retainUntil: lifetime` (async) / `retain: true` (Effect) — slice 2's
  `currencyPairs` shape — while `rfqs$`, `allQuotes$` and
  `quotesForRfq$(id)` are refCounted derivations over the warm state, as
  the RxJS `shareReplay({ refCount: true })` over the warm `state$` is. A
  fresh subscriber replays the current roster synchronously because the
  retained source is warm.
- **Every credit command is a one-shot, per call, lazy, and completes.**
  `createRfq`, `acceptQuote`, `cancelRfq`, `passQuote`, `quoteRfq` and
  `requestQuote` are `promiseToStream(signal => once(port(...), signal))`
  (async) and `Stream.fromEffect(Effect.suspend(() => rpc(port(...))))`
  (Effect) — slice 2's `execution.execute` shape. `Effect.suspend` is what
  keeps the Effect side lazy per subscription rather than per construction.
- **The presenter builds its own submission machines from its own
  commands.** `createSubmission()` / `createTicketSubmission()` hand
  `{ createRfq }` and `{ quoteRfq, passQuote }` to machines that are a
  `Store` + `AbortController` (async) or a `SubscriptionRef` under a
  detached host (Effect) — `createMachineFactories(presenters)` still has
  no app handle, so a machine still owns its lifetime. A superseding
  `submit()` / `requestQuote()` cancels the run in flight — an
  `AbortController` in the async core, `Fiber.interrupt` in the Effect
  core, the RxJS `switchMap` in the RxJS core. In the Effect core every
  externally visible step — the state writes and the `onRedirect`
  callback — is additionally guarded on the run token, because
  interruption lands at the run's next suspension point; the async core
  instead relies on `sleep`/`once` rejecting on abort, plus an explicit
  `signal.aborted` check before the two steps that follow the redirect
  timer.
- **The countdown is derived from the tick index, with the clock read
  once.** `remaining = initial − tick × RFQ_COUNTDOWN_INTERVAL_MS`,
  clamped at 0, inclusive 0, then the run ends — the RxJS
  `timer(0, INTERVAL)` + `map` idiom, not a `Date.now()` read per tick.
  The Effect machine runs it as ONE looping fiber. Equal-value
  re-emission of the seed on the first tick stays uncontracted (the RxJS
  timer re-emits `initial`; a `Store` drops it).
- **Four envelope rulings from the suites' contact with the three cores.**
  (1) Burst multiplicity on a *state-derived* stream is not contracted:
  suites settle between the emissions that must be observed separately and
  assert deltas across settle-separated pairs, because a fiber- or
  `Store`-backed core legitimately conflates a synchronous burst. (2)
  Burst multiplicity on `rfqs.events$` IS contracted for an attached
  subscriber — it is an event stream feeding `AnimationDirector` intents,
  so a dropped event is a lost fact, not a stale reading. (3) The
  `rfqTile` suite keeps its tick census across the bulk advance (both
  endpoints, the first two deltas, and that consecutive received states
  differ by exactly one interval). (4) `rfqCountdown` pins stillness by
  emission count and the exact post-dispose value — a knowing exception to
  "absence is not a reading", since a pure timer has no port-side witness;
  all three cores satisfy it (RxJS completes, `Store`/Effect drop equal
  states). All four held on both alternative cores on the first run.
- **A guard whose race is unreachable today still belongs to the invariant
  it protects.** The Effect `rfqSubmission`'s `onRedirect` callback is
  routed through the run token even though, measured on `effect` 3.22.2, a
  fiber resumed from `Effect.sleep` processes the forked interrupt before
  its next step. The invariant belongs to the run token the machine owns,
  not to the scheduler's delivery order.
- **Three residuals recorded, not coded around.** The "one active run"
  scaffolding is now copy-pasted five times per core — a `createRunSlot()`
  kernel/bridge helper is the consolidation, deferred to slice 4 or later
  so this slice's diff stays one shape per member. The remaining window
  is the one microtask between an awaited resolution and the next
  `store.set` in `rfqTile`/`ticketSubmission` (and slice 2's
  `tileExecution`) — the same idiom, and the class-wide `createRunSlot()`
  follow-up, not a slice-3 patch; `rfqSubmission` closes that window
  itself with an explicit `signal.aborted` check before its two
  post-sleep steps. And the
  `rfqCountdown` seed was symmetric in its two positional arguments
  (`remainingMs = creationTimestamp + totalMs − now`), so no wiring test
  could detect a swapped pair — the RxJS and Effect wiring cases shared
  the blind spot. **Closed 2026-09-22, by the signature rather than a
  test**: no fixture can witness a commutative swap, so the seam, all
  three factories AND the bindings' `useRfqCountdown` hook now take one
  `RfqCountdownSeed` object (`{ creationTimestamp, totalMs }`) — the UI
  builds it once from the `Rfq` and it is carried unchanged to the
  factory, so a swap is a type error at every site that used to pair two
  bare numbers.

**Decided in slice 4** (2026-09-21):

- **The core seam is observed, not deferred, because an e2e scenario
  watches it.** Slices 2–3 recorded their equivalent coupling
  (`AnimationDirector`'s `executions$`, `rfqs.events$`) as an unobserved
  residual — nothing in the shipped suite told the difference. Equities
  cannot: `JarvisDriverMachine` is composed inside the RxJS `createApp`
  against the base `eqWorkspace`, so the moment a sibling owns `eqWorkspace`
  natively the UI reads the native instance while a Jarvis drive batch
  (`eqSelect`, `eqTimeframe`, `eqIndicator`, `eqPane`) still mutated the
  base one — `tests/browser/scenarios/jarvis.ts` asserts the indicator
  appears, so the async and Effect e2e legs would go red on the seam
  alone. `createApp` therefore takes an optional second argument,
  `CoreSeams { eqWorkspace?, equityFills$? }`: the base still BUILDS its
  own `eqWorkspace` and exposes it as `base.presenters.eqWorkspace` (so the
  parity drift test's reference-inequality assertion stays meaningful),
  while `jarvisDriver`'s dep and `AnimationDirector`'s `equityFills$` read
  `seams.x ?? own`. Both siblings build their native presenters FIRST and
  pass the seams to the base; `CoreFactory.createApp` stays assignable (an
  optional trailing parameter). Strangler-phase scaffolding, deleted with
  delegation in slice 8. Deliberately NOT closed this slice: the same seam
  would close slice 2's `AnimationDirector` residual (`executions$`,
  `pairs$`, `priceFor`, `rfqEvents$`) — left for its own PR so this one
  stays the equities slice. **Closed 2026-09-22 by that PR:** `CoreSeams`
  is now `Partial<AnimationDirectorDeps>` plus `eqWorkspace?` and
  `watchlist$?`, and every internal reader of the base app —
  `AnimationDirector` (all six sources), `NarratorMachine` (`pairs$`,
  `priceFor`), `JarvisDriverMachine` (`eqWorkspace`, `knownSymbols$`) and
  the base `eqWorkspace`'s seed — reads `seams.x ?? own`. MEASURED before
  the change, under both siblings: an FX execution through the native
  `execution` produced no tile intent, and the currency-pairs port, a
  pair's price stream and the watchlist each carried TWO live
  subscriptions; after it, one each. `live` is the only count comparable
  across cores — the Effect core's `mirrorPort` peeks a port (subscribe,
  unsubscribe) before following it, so it OPENS one twice by design. One
  new cross-core asymmetry, recorded not coded around: the base
  `NarratorMachine`'s deliberately unused `stop()` pins `priceFor(pair)`
  warm for every roster pair, and that pin now lands on the NATIVE
  `priceStream`, whose per-symbol streams are refcounted rather than
  lifetime-retained — after `app.dispose()` the async core's price topics
  keep that never-unsubscribed base reader (as the RxJS base always did),
  while the Effect core's closing host scope interrupts them regardless.
  Not a regression — the identical pin sat on the base `priceStream`
  before — and strictly an improvement for Effect.
- **The state transitions moved to pure folds in `@rtc/client-core`.**
  `eqWorkspaceFold.ts`, `eqDrawingsFold.ts`, `orderTicketFold.ts` and
  `candleStitch.ts` join the `staleFlagFold.ts` / `tileExecutionState.ts` /
  `blotterFolds.ts` precedent — event-union reducers returning the SAME
  reference for a no-op transition — and the RxJS machines are
  re-expressed over them. The RxJS machines' existing unit tests (32
  `EqWorkspaceMachine` cases, 13 `EqDrawingsMachine`, `OrderTicketMachine`,
  19 `CandleSeriesPresenter`) pass UNCHANGED, the regression witness the
  refactor needed. One cadence moved with them:
  `CANDLE_HISTORY_RETRY_COOLDOWN_MS` now lives in `@rtc/domain` beside
  `CANDLE_HISTORY_PAGE`, because the suite drives the cooldown edge to the
  millisecond and `@rtc/core-contract` may not import `client-core`; the
  RxJS file keeps its old name as a local alias.
- **The harness gained a seed.** `makeHarness({ watchlist })` pre-loads a
  scripted watchlist (a `ReplaySubject(1)`) so `eqWorkspace`'s
  composition-time peek (`peekFirstWatchlistSymbol`) finds something — the
  simulator's `of(WATCHLIST)` path, and the deployed default. `eqWorkspace`
  reads the watchlist ONCE, synchronously, at composition, and only falls
  back to the async `seed$` when that peek finds nothing (WS-real); a
  driver verb acting after construction can therefore only ever exercise
  the fallback.
- **Singleton machines are warm from construction, contracted through
  `getValue()`.** React's `useStateObservable(presenters.eqWorkspace.state$)`
  reads `getValue()` on the first render, and a cold `StateObservable`
  would hand back its construction-time default however stale. The
  siblings hold the same internal subscription through
  `storeToWarmStateStream` / `refToWarmStateStream` (new bridge exports —
  the `.subscribe()` call stays in `bridge/`), and the suites assert
  `state$.getValue()` after a zero-subscriber mutation. Per-mount
  `orderTicket` stays cold-capable, as slices 2–3 left theirs. The two
  singletons are also app-lifetime, not detached: the async
  `createEqWorkspaceMachine(deps, lifetime)` aborts its watchlist relay and
  releases the keep-warm when `lifetime` fires; the Effect
  `createChildHost(parent)` (a new `bridge/out.ts` export) runs on the
  DEFAULT runtime with a scope forked from the app host's, so an intent
  arriving after `app.dispose()` cannot die on a disposed runtime and
  `app.dispose()` still ends the machine. A `Scope.addFinalizer` on that
  child scope marks the machine disposed and releases its keep-warm
  (`packages/client-core-effect/src/machines/eqWorkspace.ts`,
  `eqDrawings.ts`), so `app.dispose()` and `machine.dispose()` converge —
  what the async twin's `lifetime` abort listener does.
- **Keyed streams are refCounted exactly as the RxJS core memoises them,
  and the Effect core follows a keyed wire stream WITHOUT peeking it.**
  `watchlist$`, `orders$`, `positions$` are retained; `quote$(symbol)`,
  `depth$(symbol)`, `candles$(symbol, tf)` are per-key, memoised,
  refCounted, and release their port on the last unsubscribe — the async
  core's new `createKeyedPortStreams<T>(open)` (memoised by key, `open(key)`
  called once per key at first REQUEST, refCounted release). The Effect
  core's `mirrorPort` seeds a warm period by `peekCurrent(source)` — a
  subscribe + unsubscribe, then subscribe again — which on a keyed WS
  stream is subscribe/unsubscribe/subscribe on the wire at the start of
  every warm period; `quote$`/`depth$` avoid that by using a new
  `followPort(host, source)` (`presenters/mirrorPort.ts`): a seedless
  `sharedFold` whose producer is one `fromPort`. The recorded asymmetry:
  the Effect core's first value arrives a fiber hop AFTER subscribe rather
  than in the caller's tick, where the async and RxJS cores deliver it
  synchronously; the bindings bind both with a `null` default and the
  suites assert them after `settle()`. The seed that feeds `eqWorkspace`
  is one watchlist relay guarded by a flag rather than an abort from
  inside the callback (`relay` registers its abort listener after
  `subscribe` returns, so aborting during a synchronous first emission
  would strand the subscription): the async machine keeps the relay for
  its lifetime and ignores every list after the first non-empty one, the
  Effect machine uses `Stream.take(1)`, and the reducer's own guard
  (`seed` applies only while `sel === ""`) makes a user selection win in
  every core.
- **`orders()` is treated as the one-shot query its own doc already says
  it is.** The RxJS core re-subscribes `orderPort.orders()` inside a
  `switchMap` on every lifecycle update; the siblings take its FIRST value
  per refresh (async: single-flight, newest-wins; Effect: `rpc`) —
  identical for every shipping adapter. `orders$`'s first value is
  therefore NOT contracted as synchronous (it is an RPC on WS-real); the
  bindings bind it with `[]`. `orders$` stays retained AND replay-current
  regardless: a fresh subscriber after zero subscribers gets the latest
  book synchronously, because a lifecycle update refreshes it even with
  nobody watching.
- **`place()` is a per-call, multi-value, lazy stream, and it earned one
  new bridge export per core.** Async: `portCallToStream(open, onValue)`
  in `bridge/out.ts` — an `Observable` over `relay`, the twin of
  `promiseToStream`, whose `onValue` runs before the subscriber sees the
  value and whose unsubscribe aborts and releases the port. Effect:
  `scopedPortStream(open)` — `Stream.unwrapScoped` over
  `fromObservable(open(), scope)`. MEASURED on `effect` 3.22.2 (the named
  `Stream.acquireRelease` fallback was not needed): `Stream.unwrapScoped`
  keeps the scope it provides open for the WHOLE consumption of the
  stream, and `Effect.scope` is re-evaluated per run — so
  `scopedPortStream` is lazy, two runs of the same stream value are two
  independent port calls with two live subscriptions, and an interrupt
  releases the source. A failing `place()` ERRORS the returned per-call
  stream in both siblings (no out-of-band rethrow on this path) — the
  plan's ruling 12 "uncontracted" language is about the ticket MACHINE's
  `state$` only, and PR A's review made the distinction explicit in the
  suite.
- **`candleSeries` keeps the RxJS semantics to the letter, including its
  two knowing oddities.** A fresh warm period RESETS the key's backfill
  (`older`, `exhausted`, the anchor) because the base series regenerates
  from a new "now"; an in-flight history fetch is NOT cancelled by the
  period ending — it clears its own flags on completion, bound to the app
  lifetime in both siblings where the RxJS core binds it to nothing.
  `candles$("")` is an empty series that never touches the port in any
  core. The cooldown reads an injectable `now` (default `Date.now`, faked
  by vitest); `loadingOlder$`/`historyExhausted$` are the SAME per-key cell
  across warm periods, replay-current, with a synchronous first value,
  because they are presenter-owned cells and not port reads.
- **`orderTicket`'s in-flight gate is the imported reducer, not a
  re-derivation.** `reduceOrderTicket(acc, candidate)` IS the RxJS
  machine's suppression `scan` step; each sibling keeps the form as plain
  mutable state, offers candidates through the reducer, and writes
  `acc.state`. A valid `submit()` supersedes the run in flight; an
  INVALID `submit()` also ends it. A failing `place()` stays uncontracted
  at the ticket level: RxJS errors `state$`, the siblings rethrow it out
  of band and the ticket stays `submitting` — mapping it to `rejected` is
  a product fix for all three cores, not a port concern, and is carried
  forward as a residual rather than coded around this slice.
  **Closed 2026-09-21, and now contracted:** a failing `place()` lands on
  `{ phase: "rejected", reason }` in all three cores through the imported
  `placeFailureToTicketPhase` (the error's own message, else "Order
  rejected") — RxJS by a `catchError` on the INNER stream so `state$`
  survives, async by a `try`/`catch` around `relay` under `ifCurrent`,
  Effect by `Effect.catchAll` under `guarded` (failures only, so a
  supersede's interrupt still ends a run silently). The same PR made
  `reset()` REPLACE the form through the imported `reduceOrderTicketForm`
  — the three cores had each spread the default over the form, so a
  `limitPrice` entered earlier rode along on the next market order and
  onto its blotter record. One consequence was decided rather than left
  to fall out: a `place()` stream that FAILS AFTER delivering the fill (a
  socket dropping on the way out) would now have overwritten `filled` with
  `rejected`, so `reduceOrderTicket` drops a `rejected` that follows a
  `filled` — a fill is final. Contracted too.
- **`createRunSlot` paid the slice-3 residual before a sixth hand-rolled
  copy was written, and closed the window class-wide.** One kernel/bridge
  helper per sibling now owns the "one active run" scaffolding for all
  four superseding machines (`tileExecution`, `rfqTile`, `rfqSubmission`,
  `ticketSubmission`) plus `orderTicket`, its fifth consumer. Async
  `Run<S> = { signal, set(next), ifCurrent(step) }` — `set`/`ifCurrent`
  drop once `signal.aborted`, closing the one-microtask stale-write
  window (an awaited resolution landing in the same tick as a supersede)
  at once, everywhere. Effect `Run<S> = { write(next), guarded(step) }` —
  the run-token guard slice 3 already had; `dispose()` on the Effect slot
  also closes the host scope. The two shapes are named differently on
  purpose (`set`/`ifCurrent` vs. `write`/`guarded`) — plan ruling 15
  records it as a naming asymmetry, not a defect. Both are
  behaviour-preserving: the four machines' existing unit tests and the
  127→173-case contract runners pass UNCHANGED. Review found that
  neither slot's guard had ever actually been exercised by a test: the
  Effect slot's token guard and interrupt filter were never executed by
  any test until driven directly with no fiber in play, and the fix added
  a direct witness rather than trusting the supersede case to reach it
  through a live fiber.
- **The dependent Layer.** The Effect Layer graph grows by seven: six
  independents (`WatchlistLive`, `CandleSeriesLive`, `DepthLive`,
  `OrdersBlotterLive`, `PositionsLive`, `EqDrawingsLive`) and one
  dependent, `EqWorkspaceLive`, which requires `WatchlistTag` —
  `WatchlistLive` is both merged into the app and provided to it,
  memoised by reference so it is built exactly ONCE (the `PowerSaverLive`
  shape). `layers.test.ts` goes 26 → 33 and pins the memoisation with a
  Proxy counting `marketData.watchlist()` invocations at exactly 1 from
  building the native graph — the evidence that `presenters.watchlist` IS
  the instance `eqWorkspace` seeded from, not a second copy hidden behind
  `Layer.provide`.
- **Two more review catches, recorded rather than silently fixed.** The
  candle contiguity filter in `stitchCandles` was unwitnessed repo-wide:
  in every existing case — the new fold test, the new contract case, and
  the pre-existing `CandleSeriesPresenter` "contiguity guard" test — the
  dropped candle's time also existed in the base series, so dedupe-by-time
  alone produced the same array and deleting the filter would have stayed
  green; the fix added a page candle newer than the base's first and
  absent from it, proven RED with the filter removed. And the plan's
  claim that the Effect run slot's out-of-band rethrow was "new but
  unreachable" was too strong: a throwing `onRedirect` (wrapped in
  `run.guarded(Effect.sync(...))`) becomes a `Die` that reaches
  `reportOutOfBand` — which CONVERGES the Effect core onto what the async
  core has always done (spawn + `reportAsync`; slice 2 ruling 8), so it
  shipped rather than being treated as a bug.
- **Four cross-core asymmetries are recorded, not coded around.** (1)
  `quote$`/`depth$`'s first value arrives a fiber hop after subscribe
  under the Effect core (`followPort`, no seed peek), where the async and
  RxJS cores deliver it synchronously when the port emits on subscribe.
  (2) `orders()` is taken as a one-shot per refresh in both siblings,
  where the RxJS core re-subscribes on every lifecycle update; identical
  for every shipping adapter. (3) In all three cores an in-flight candle
  history page is allowed to complete after its warm period has ended
  (the RxJS core binds it to nothing, the siblings to the app lifetime);
  MEASURED: a page that lands after a NEW period has opened is stitched
  into that period in all three cores, because the prepend accumulator is
  one cell per key whose VALUE the new period resets. (4) A failing
  `place()` errors the returned per-call stream in every core; the
  ticket-machine half of this asymmetry (RxJS errored `state$`, the
  siblings stayed `submitting`) is CLOSED — all three now land on
  `rejected`, see the `orderTicket` bullet above — plus a purely
  cosmetic fifth: `Run`'s members are named differently in the two
  siblings (`set`/`ifCurrent` vs. `write`/`guarded`).
- **Nine more cross-core asymmetries, surfaced by PR B's final
  whole-branch review and pinned by no suite.** (1) A failing
  `watchlist()` kills `eqWorkspace.state$` in the RxJS core — the error
  flows through `seed$` into the `merge` — while both siblings keep the
  workspace alive and rethrow the failure out of band. (2) A failing
  `orders()` query behaves the SAME in all three cores: the current
  subscribers error, the NEXT subscriber re-queries, and a refresh alone
  does not recover — recorded because it is easy to assume otherwise. (3)
  A port that completes WITHOUT a value: the siblings treat a
  `candleHistory` page as an error plus cooldown and error `orders$`,
  where the RxJS core is a silent no-op — no shipping adapter does this.
  (4) `candleHistory` and `orders()` emitting more than once: the RxJS
  core takes every value, the siblings only the first. (5) `candles$("")`
  completes in the RxJS core (`of([])`) and never completes in the
  siblings. (6) `loadingOlder$` turns `true` synchronously in the RxJS
  and async cores, and inside the forked effect under the Effect core.
  (7) Under the Effect core, `fills$` and the refresh signal cross a
  `PubSub`, so their own subscribers hear the fill and the book refresh
  fiber hops AFTER the ticket machine sees `filled`; in the RxJS and
  async cores both fire synchronously before it. (8) `app.dispose()`: a
  no-op in the RxJS core; the async core ends the retained topics, the
  two singletons and any in-flight `candleHistory` page, while a keyed
  stream or an already-subscribed `place()` call keeps working; the
  Effect core ends everything through the closing host scope, and a
  detached `orderTicket` that submits afterward sticks at `submitting`
  (MEASURED 2026-09-22: silently — the closed scope interrupts the
  `place()` run, which is not a failure, so nothing is rethrown and the
  ticket's failure mapping never sees it). (9) A `watchlist()` that errors
  SYNCHRONOUSLY on subscribe makes both siblings' `createApp` throw (the
  composition-time `peekCurrent`), where the RxJS peek has no error
  handler and so reports the failure asynchronously instead.

**Decided in slice 5 — PR A, the suites** (2026-09-22):

The admin members' suites landed on their own (#814) ahead of the ports,
so these are contract decisions the two alternative cores must satisfy when
their natives arrive, not descriptions of shipped sibling behaviour.

- **Seven warm singletons, in two shapes.** `throughputMetric`,
  `latencyMetric`, `errorRateMetric`, `eventLog` and `sessionsKpi` are warm
  FOLDS: a synchronous `[]` seed, one window per port emission, retained
  across a full unsubscribe (the RxJS `refCount: false`). `topology` and
  `sessions` are warm MIRRORS: NO seed — silent until the port emits — with
  the latest value retained the same way. Both shapes are contracted for
  retention (a late subscriber reads the window/value synchronously) and
  for holding ONE port subscription however many subscribers attach. The
  distinction matters because "reads `[]` at once" and "reads nothing yet"
  are indistinguishable to a subscriber that only ever looks after a
  settle, which is how a seedless mirror could quietly grow a seed.
- **`throughput` supersedes at the DEBOUNCE, not at the keystroke.** A
  `setValue` while a write is in flight does not cancel that write: if it
  resolves before the newer value's debounce elapses, its banner shows. Once
  the newer debounce fires, RxJS's `switchMap` unsubscribes the whole prior
  inner Observable — the write-completion path AND its dismiss timer —
  whether or not that write had already settled, so an already-shown banner
  is orphaned rather than dismissed on schedule. MEASURED against the RxJS
  core and written to match; a sibling that cancels at the keystroke, or
  that keeps the dismiss timer alive across a supersede, fails the suite.
- **What `throughput` does NOT contract:** how many times `getThroughput`
  is SUBSCRIBED across a cold resubscribe (the RxJS `state()` re-runs the
  load; a sibling may keep it warm). The port-discipline case counts CALLS,
  which are constant — the method is obtained once, when the presenter is
  built — and says so, because the two readings differ only in a case that
  unsubscribes, which no suite case does.
- **`incident` orders its three effects.** `inject(k)` perturbs EVERY
  control, in `metricControls` order, synchronously within the call, THEN
  pushes the connection event, THEN folds the state. `latencySpike` and
  `serviceDown` push `gatewayDisconnected`; `errorBurst` stays connected. A
  repeated `inject(k)` re-perturbs and re-pushes without duplicating `k` in
  `active`; `clear()` clears every control and pushes `gatewayConnected`
  even when nothing was active. The push itself still lands on the RxJS
  core's module-level `incident$` (each sibling will reach it through a
  `pushIncidentEvent` bridge export, the twin of `pushReconnectIntent`) —
  shared transport, native provenance, removed in slice 8.
- **No `CoreSeams` extension this slice.** Verified across the base
  composition: no internal reader (Jarvis driver, `AnimationDirector`,
  `NarratorMachine`, workspace seed) consumes any of the nine, and every
  base copy is lazy — `warmReplay`/`shareReplay`/`state()` subscribe on
  their first subscriber, and `incident`'s eager keep-warm subscribes only
  its own Subjects — so a native member does not leave an admin port held
  twice. PR B carries the `countSubscriptions` witness that proves it
  rather than asserting it.
- **Pure folds, imported not duplicated:** `appendMetricSample`,
  `prependLogEvent`, `throughputSetMessage`/`THROUGHPUT_SET_ERROR` and
  `reduceIncident`/`incidentConnectionEvent` are exported from
  `@rtc/client-core`; the five cadence numbers (`METRIC_WINDOW`,
  `MAX_LOG_ROWS`, `THROUGHPUT_DEBOUNCE_MS`,
  `THROUGHPUT_MESSAGE_DISMISS_MS`, `DEFAULT_THROUGHPUT`) moved to
  `@rtc/domain`, because the suites assert them and `@rtc/core-contract`
  may not import `client-core` (the slice-4 cooldown precedent).

**Decided in slice 5 — PR B, the async half** (2026-09-23):

- **The ports ship one core at a time.** PR B was split so the async core
  could land before the Effect core, whose `throughput` timers wait on an
  unmeasured question (does Effect's `Clock` follow vitest fake timers?).
  Between the two PRs the manifests disagree — async 53/74, effect 44/74 —
  which the parity tooling reports and nothing forbids.
- **`foldTopic` is the warm-fold primitive** (`kernel/foldTopic.ts`): each
  producer run publishes the seed synchronously, then one accumulator per
  source value, replay-current and — with `retainUntil` — held across zero
  subscribers. The five warm folds are `foldTopic` over a refCounted
  `topicFromObservable` of the port, so the port is subscribed once per run.
- **A port METHOD is called at construction; only its subscription is
  lazy.** The first draft of `throughput` called `getThroughput()` on the
  first subscriber, and the port-discipline suite failed it (two calls where
  the RxJS core makes one). `storeToStateStream` gained an `onSubscribe`
  hook (runs on each zero-to-one transition) to start the load lazily.
- **Uncontracted divergences, recorded:** (1) a `setThroughput` that throws
  synchronously (the simulator's range check) shows the error banner in the
  async core, where the RxJS `switchMap` would error `state$`; (2) a
  `setValue` made while `state$` has no subscriber is applied and written by
  the async core, where the RxJS `Subject` drops it; (3) after `lifetime`
  aborts, the async `setValue` neither echoes nor writes; (4) a
  `setThroughput` that completes WITHOUT emitting shows the error banner in
  the async core (`once` rejects) where RxJS shows none — neither the WS
  port nor the simulator does that today. None of the four is observable in
  the shipped app.
- **One divergence IS user-visible, and is allowed by ruling 5:** the RxJS
  `state()` is refCounted, so when the Admin tab unmounts (every tab switch
  remounts it via `key={activeTab}`) it drops a pending debounce and any
  in-flight write, and on return resets to `{ value: 100, loading: true }`
  and loads again. The async core keeps `throughput` warm: the value
  survives, a write typed within 300 ms of a tab switch still persists, and
  the load is not repeated — so under WS-real a throughput change made by
  another user is not re-read until reload. Ruling 5 left load-count across
  resubscribe uncontracted precisely so a sibling may keep it warm; this is
  the cost, recorded rather than coded around.
- **The seam witness (ruling 8) holds:** with every native admin stream
  subscribed, each admin port stream is live once (`sessions$` twice, for
  its two native readers) — the base app's own admin presenters stay cold,
  so no `CoreSeams` change was needed.

**Decided in slice 5 — PR B, the Effect half** (2026-09-23):

- **The Clock question was already answered.** `bridge/clock.test.ts` (slice
  2) proves `Effect.sleep` advances under vitest fake timers, so
  `throughput`'s debounce and dismiss are plain `Effect.sleep`s in fibers
  forked into a child of the app host's scope; nothing had to be measured
  anew.
- **No new primitive.** The warm folds are `sharedFold({ retain: true })`
  seeded `Option.some([])`; `topology`/`sessions` are
  `mirrorPortAsIs(..., { retain: true })`. `refToStateStream` gained the same
  `onSubscribe` hook the async `storeToStateStream` did.
- **A synchronous `setThroughput` throw is a failed write** (`Effect.try`),
  matching the async core's error banner rather than becoming a defect.
- **`incident`'s state reaches subscribers a tick after its side effects**
  (the ref is followed on a fiber, as every Effect machine's is), so the
  order a subscriber can observe is controls → push → state, as RxJS; where
  the ref write falls relative to the push inside the intent is not
  observable, and the mutation pass confirms it (an equivalent mutant).
- The async half's recorded divergences (ADR above) hold for the Effect core
  too: warm across the Admin-tab remount, emit-less completion → error
  banner, post-dispose `setValue` silent.

**Decided in slice 6 — the shell** (2026-09-23):

- **Scope: the layout/dock family moved to slice 7.** Slice 6's row named
  `layoutFor` and the dock bridges; those eleven members (`layoutFor`,
  `machines.layout`, `dockLayoutStore`, `dockPanel`, `undockPanel`,
  `dismissPanel`, `resetWorkspaceLayout`, `dockedPanelIdsFor`,
  `workspaceLayoutResets$`, `layoutPresets`, `commands.reportDetachedPanels`)
  port with `jarvisPanels`, which every dock bridge writes synchronously.
  Slice 6 is `auth`, `bootGate`, `workspaceNav`, `animationDirector` and
  `machines.boot` — 58/74 native in both cores.
- **`CoreSeams.workspaceNav`**: the base's Jarvis driver (`switchTab`) and the
  dock bridges' active-tab mirror follow the native nav; the base keeps its
  own as `presenters.workspaceNav`, as `eqWorkspace` did in slice 4.
- **`animationDirector` needs no seam** — nothing inside the base reads it;
  the native one listens to the native members directly and the base's stays
  cold (the once-per-port pricing witness holds).
- **The auth wiring is shared, not copied:** `createAuthDeps(ports)` (the
  login-delay wrapper and the wait-style pin/cycle, moved out of
  `composition.ts`) and the pure `bootProgress` / `nextBootVariant` /
  `nextLoginWaitVariant` / `describeAuthFailure` are exported from
  `@rtc/client-core`; the boot cadence moved to `@rtc/domain`.
- **A stream subscriber hears an intent's new state after a settle, not
  synchronously.** The first suites asserted the RxJS core's synchronous
  delivery for `bootGate` and `auth`; the Effect core follows a ref on a
  fiber, as every Effect member already does, and the suites now settle
  before reading a stream. `bootGate`'s `visible` getter stays synchronous in
  every core.
- **Recorded, uncontracted:** boot states after `dispose()` (RxJS keeps the
  ramp live for an attached subscriber; both siblings stop it); a second
  `skip()` re-emitting the finished state; a repeated identical connection
  status flashing again (RxJS does); login outcomes landing after logout or
  overlapping; the Effect director conflating a same-tick burst of intents for
  a late joiner (it is a `sharedFold`, whose first subscriber hears every
  write).
- **Contracted after review:** a new `intentsFor` subscriber receives the
  director's latest intent while the director is live — the RxJS
  `shareReplay(1)`, which every core reproduces and a user sees as a tile
  replaying a flash it mounted after.

**Decided in slice 7 — wave 1, the workspace** (2026-09-24):

- **Two waves, no "7a/7b".** Wave 1 = the eleven layout/dock members plus
  `jarvisPanels` (70/74 native in both cores); wave 2 = `jarvis`,
  `jarvisUsage`, `jarvisDriver`, `jarvisDemo` and the internal narrator.
- **The workspace's synchronous rules are SHARED, not ported.** The dock /
  undock / dismiss / reset bridges and their tab attribution
  (`createWorkspaceDock`), the layout reducer, the panels folds, the
  desk-panel frame steps, the workspace-layout write and the saved-layouts
  controller left `createApp`'s closure for rxjs-free modules in
  `@rtc/client-core` that every core imports; each core ports only the
  streams around them (the docked membership, the reset counter, the persist
  debounce, the panel data). Slice 8 moves them to `@rtc/core-logic` with
  the other pure pieces.
- **`CoreSeams.workspace` is a FACTORY.** The native workspace needs the
  base's (still delegated) Jarvis events; the base's Jarvis driver needs the
  native workspace. `createApp` calls the factory right after building
  `jarvis`, drives the workspace it returns, and keeps its own idle: its
  panels fold nothing (no port held twice), no docked panel is restored into
  it, and it never creates the persistence writer — the `workspaceLayout`
  preference has ONE writer. Wave 2 deletes the factory.
- **Contract point: workspace STATE is a synchronous fold** — an intent has
  committed by the time it returns; only delivery to a subscriber may be
  scheduled. The shared dock reads the roster and the recorded layout
  states right after calling into them, and `layoutStateNow` throws on a core
  whose `layoutFor` records late. The Effect core commits through
  `SubscriptionRef`s with `runSync` and notifies its in-core mirrors
  synchronously (`SyncRef`); `ref.changes` still feeds subscribers.
- **The Effect workspace lives outside the Layer graph** (on a child of the
  app host), because its input only exists inside the base's `createApp`.
  The Layer count is unchanged.
- **Contract cases a port found:** a turn of non-panel events spawns
  nothing (an async mutant survived without it); a turn answered in the same
  tick it was sent still spawns (the Effect relay subscribed lazily and lost
  it — the base's `jarvis.events$` is hot).
- **Recorded, uncontracted:** the unsupported-sentinel panel path (the
  sentinel is minted by the adapters); a sibling's pending persist write is
  dropped on `app.dispose()` where the RxJS writer never unsubscribes; a
  panel whose data port FAILED stays attached in the async core until the
  roster changes (RxJS propagates the error).

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
