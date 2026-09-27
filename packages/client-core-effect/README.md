# @rtc/client-core-effect

The **Effect-TS** application core — one of the interchangeable
implementations behind the types-only `@rtc/core-api` contract, proven
equivalent to the others by the `@rtc/core-contract` behavioural tier.

## Shape

```
src/bridge/          in.ts / out.ts / peek.ts / rpc.ts — the ONLY files that import rxjs values
src/services.ts      the AppPorts and EffectHost services (Context.GenericTag) + HostLive
src/layers.ts        one Tag/Layer pair per native presenter, and buildAppLayer
src/composition.ts   the CoreFactory (`effectCore`), owner of the runtime + scope
src/machines/        the native machines — each its own detached host
```

**The Layer graph** (slice 2). Every native presenter is a *service*: a
`Context.GenericTag` in `layers.ts` and a `Layer` that builds it from the
`EffectHost` and `AppPorts` services in `services.ts`. `HostLive` is the
scope owner — it captures the runtime the Layer is built under
(`Effect.runtime`) and forks a **closeable child** of the Layer's own scope,
so `app.dispose()` can end it explicitly and `runtime.dispose()` ends it
anyway if nobody did. `composeApp` then makes exactly **one**
`runSync`, resolving the host and every native presenter together;
an async Layer build would surface there as an `AsyncFiberException`, which
is what `composition.dispose.test.ts` pins.

The graph exists because two presenters depend on *another presenter*:
`priceStream` and `priceHistory` gate their conflation on
`powerSaver.isCalm$`. `PowerSaverLive` is merged into the app **and**
provided to those two; a Layer is memoised by reference within one build, so
it is constructed once and `presenters.powerSaver` IS the instance they gate
on (`layers.test.ts` pins that). The base is `provideMerge`d rather than
`provide`d so `HostTag` stays resolvable from the finished runtime — a
`provide` would satisfy the presenters while hiding the service the teardown
owns. Tags are `Context.GenericTag`, never `class X extends Context.Tag(…)`:
a class must name its file (`rtc/class-filename-match`), and twenty-six
files for twenty-six tags would be the wrong trade.

There is no kernel folder here, and there will not be one: `effect` already
supplies the primitives `@rtc/client-core-async` had to write by hand —
`SubscriptionRef` for a replay-current cell, `Stream` for a multicast
sequence, `Fiber` for structured cancellation, `Effect.sleep` for a
cancellable delay. That contrast is the point of running the two cores side
by side.

## Bridge

`@rtc/core-api` speaks `Stream<T>` / `StateStream<S>` (rxjs `Observable` /
`@rx-state/core` `StateObservable`), so the seam between Effect and the
published contract is two files:

- `bridge/in.ts` — `fromObservable` (an Observable pushed into a `Stream`, subscribed
  SYNCHRONOUSLY at call time, its subscription released both by the stream's
  own finaliser and by the optional `Scope` it is handed). Nothing outside
  `src/bridge/` may import it: a presenter reaches `fromObservable` only
  through the `fromPort` a `sharedFold` hands its producer, which passes the
  warm period's scope — so a stream the producer builds but never runs is
  still released when the period ends. The dependency-cruiser rule
  `effect-port-subscription-owned-by-the-bridge` keeps it that way.
- `bridge/rpc.ts` — `rpc`, the first value of a port Observable as an
  `Effect`: the one-shot command primitive (`execution.executeTrade`,
  and the tile machine's run). Its own file because it is **lazy** —
  nothing is subscribed until the Effect runs — which is exactly what
  `bridge/in.ts` is not, and presenters may not import `in.ts`.
- `bridge/peek.ts` — `peekCurrent` (the current value of a replay-current
  Observable as an `Option`, read and released synchronously) and `peek`
  (the same with a fallback). Its own file precisely because presenters DO
  call it, and `bridge/in.ts` is off limits to them. A source that errors
  during `subscribe` THROWS that error at the read site rather than letting
  rxjs report it out of band; inside a `sharedFold` that failure reaches the
  subscriber whose subscribe triggered the seed, and no period is started.
- `bridge/out.ts` — `streamToStream` / `refToStateStream` / `sharedFold`, the
  only places in the package that construct an Observable. Each `subscribe`
  forks a fiber and each `unsubscribe` interrupts it; an interrupt-only
  `Cause` is silence, not an error, and `Cause.squash` collapses a typed
  failure to the single `unknown` the contract's `Stream<T>` carries.

All of them take an `EffectHost` — `{ runtime, scope }` — rather than a bare
runtime. `runtime` is an `EffectRunner` (`runSync` + `runFork`), not a
`ManagedRuntime`: a `ManagedRuntime` satisfies it structurally, `runnerFor`
adapts the plain `Runtime` a Layer captures, and `createDetachedHost()`
builds one over `Runtime.defaultRuntime` plus a scope of its own — what a
machine owns, since `createMachineFactories(presenters)` has no app handle.
Two details of the host are load-bearing:

- **Fibers are forked into the app's scope.** `ManagedRuntime.runFork` mints
  ROOT fibers; disposing the runtime does not interrupt them, so without the
  scope they would outlive the app. Closing the scope is what ends them.
- **Unsubscribe interrupts via the GLOBAL runtime**, not the managed one.
  `ManagedRuntime.dispose()` swaps its runtime effect for
  `die("ManagedRuntime disposed")`, so an interrupt forked on it after
  disposal would die with an unhandled defect and quietly leave the fiber
  running. Interrupting needs no context, so the default runtime is correct.

`refToStateStream` reads the ref's current value **per subscription**, not
once at construction. `@rx-state/core`'s `StateObservable` subscribes its
source lazily and, at refCount 0, discards `currentValue` and unsubscribes —
so a construction-time value would be re-emitted, stale, on every cold → warm
cycle, and any `set` before the first subscriber would be invisible.
`ref.changes` replays the current value on top of that, so its head is
dropped only when it is `Object.is`-equal to the seed just emitted — never
blindly, because a `set` landing between the read and the fiber's subscribe
makes that head the NEW value.

A `sharedFold` period is **seedless-capable**: `seed()` returns an
`Option`, so a port that has not emitted by the time it is peeked seeds
`None` and its subscribers hear nothing until the producer's first write —
the RxJS core's behaviour, rather than a fabricated default. The producer's
first write of a period waits on a **latch**: a `Deferred` the period's
watcher succeeds the moment it has subscribed the ref's PubSub. That is the
structural close of a race an `Effect.yieldNow()` per write used to merely
win — without it a same-tick burst of three port events delivers `[0, 6]`
instead of `[0, 1, 3, 6]`, because the producer publishes every
intermediate state before the watcher fiber exists and only the `Ref.get`
head survives. Each period also owns its own subscriber set, so a stale
producer failing in the unsubscribe → scope-close window cannot error the
next period's subscribers.

Slice 4 adds three more bridge exports. `scopedPortStream(open)` is the
lifecycle twin of `rpc`: a per-call, MULTI-value port stream whose `open()`
runs — and whose port is subscribed — when the stream STARTS, and whose
subscription is released when that scope closes, however the run ended.
MEASURED on effect 3.22.2: `Stream.unwrapScoped` keeps the scope it provides
open for the whole consumption of the resulting stream, and re-evaluates
`Effect.scope` per run, so two runs are two port calls; the brief's
`Stream.acquireRelease` fallback was not needed. `createChildHost(parent)`
is the middle ground between a detached host and a fold period's scope: the
DEFAULT runtime as the runner (an intent arriving after `app.dispose()` must
not die on a disposed managed runtime) over a scope forked from the app
host's, so `app.dispose()` ends the machine — what the two workspace
singletons take. A `Scope.addFinalizer` on that child scope marks the
machine disposed and releases its keep-warm (`machines/eqWorkspace.ts`,
`eqDrawings.ts`), so `app.dispose()` and `machine.dispose()` converge — what
the async twin's `lifetime` abort listener does. `refToWarmStateStream(host, ref)` is `refToStateStream`
held warm by a subscription of its own, with a `release()`: an app-lifetime
singleton must survive a cold `getValue()` between one panel unmounting and
the next mounting, which is exactly what the RxJS singletons' internal
`state$.subscribe()` is for.

Four smaller bridge primitives carry slice 2: `setRefIfChanged` (a
`SubscriptionRef.set` that skips an `Object.is`-equal value — the
`distinctUntilChanged` a machine's `state$` promises, since a
`SubscriptionRef` re-publishes an equal `set`), `fromPortIn(scope)` (a
`FromPort` bound to a scope that is not a fold period's — a machine's own),
`reportOutOfBand(cause)` (rethrow on a macrotask, for a machine whose source
failed and whose ref has no error channel), and `SharedFold.retain`, which
keeps a warm period alive across zero subscribers so only the host scope
ends it — the RxJS core's `warmReplay()` for a session singleton
(`currencyPairs`, `analytics`, `blotter.trades$`, `blotter.activity$`).

## Conflation and machines

`conflatedFold` restates the RxJS core's `conflateWhen(flag$, ms)` inside a
`sharedFold`'s `run`: a leading + trailing throttle gated by the calm flag,
hand-written because Effect ships no such operator (`Stream.throttle` is a
token bucket, `aggregateWithin` trailing-only). One `Ref` holds the whole
state so every transition is an atomic `Ref.modify`; the window is ONE
forked fiber that loops in place rather than forking its successor (a
forked child dies with its parent, so a timer fiber that forked the next
window and then ended would kill it at once). The calm flag's CURRENT value
is read synchronously with `peekCurrent` before the first tick can be
folded: `Stream.merge` gives no ordering across its two sources and drains
the tick queue first, so a burst driven in the same turn as the subscribe
was otherwise dropped wholesale as "before the flag spoke" — which is also
what the RxJS `flag$.pipe(switchMap(…))` structurally avoids, since it
subscribes the source only once a (replay-current) flag has emitted.

A machine here is a `SubscriptionRef` plus a **detached host**: its own
scope under the default runtime, closed by `dispose()`. `state$` is
`refToStateStream`, which re-reads the ref per subscription — so a fresh
subscription after `dispose()` still yields the current value
synchronously, which is what the contract asserts. Intents are synchronous
`setRefIfChanged` writes; timers are fibers forked into the machine's scope,
so `dispose()` interrupts them. The run token and the fiber behind
switch-map semantics live in one place, `createRunSlot`
(`src/machines/runSlot.ts`), shared by `tileExecution`, `rfqTile`,
`rfqSubmission` and `ticketSubmission`: `start` interrupts the previous
run's fiber and forks the next, and every write is guarded by a run token
read at each write, because interruption lands at the run's next
suspension, not at the `Fiber.interrupt` call. `tileExecution` itself is
`Effect.race` of the `rpc` against `Effect.sleep(EXECUTION_TIMEOUT_MS)`,
with the too-long marker a forked child of the run (finishing cancels the
escalation). A source failure in `staleFlag` has no channel on a ref, so
the scope closes and the cause is rethrown out of band.

**Commands and countdowns** (slice 3). A one-shot command is `rpc` under
`Effect.suspend`, per call: `Stream.fromEffect(Effect.suspend(() =>
rpc(port(...))))` through `streamToStream`, so nothing is subscribed until
the returned stream is, and an unsubscribe interrupts the fiber, which
releases the port through `rpc`'s finalizer. The five `rfqs` commands and
`rfqQuote.requestQuote` are all that shape. The credit roster derivations
are `mirrorPort` over a RETAINED `sharedFold` of `workflow.events()` with
the domain reducer, each projected through a `createShallowArrayMemo` built
ONCE per derived stream: the memo returns the PREVIOUS array whenever the
new one is shallow-equal, which is exactly what the fold's `Object.is`
guard then drops — `distinctUntilChanged(shallowArrayEquals)` restated
where this core already de-duplicates. A countdown (`rfqCountdown`, and
`rfqTile`'s received phase) is ONE looping fiber writing `setRefIfChanged`
per tick, with `remainingMs` derived from the tick INDEX rather than the
clock; never a timer that forks its successor, since a forked child is
interrupted when its parent completes (the §22 fiber-ownership rule). The
two submission machines are built by `rfqs` itself, over its own commands,
so the wiring table hands out `presenters.rfqs.createSubmission()` rather
than reaching for the workflow port a second time.

**Equities** (slice 4). A keyed WIRE stream (`watchlist.quote$`,
`depth.depth$`) is `followPort` — a seedless `sharedFold` whose producer is
one `fromPort`, memoised per symbol — rather than `mirrorPort`: the seed
peek is a subscribe + unsubscribe, which on a server-refcounted per-symbol
stream would be subscribe/unsubscribe/subscribe on the wire at the start of
every warm period. The price is that its first value arrives a fiber hop
after subscribe, which is why the contract leaves a keyed wire stream's
first value uncontracted while a presenter-owned CELL's is synchronous.
`ordersBlotter` pairs two `PubSub`s (`fills$` and an internal refresh
signal, both hot with no replay) with a RETAINED fold whose producer is
`Stream.merge(Stream.make(undefined), Stream.fromPubSub(refreshes))`,
flat-mapped with `switch` into one `rpc(orders.orders())` per trigger,
newest winning. MEASURED on 3.22.2, sweeping the microtask distance between
the period's first subscribe and a publish: `merge` loses a refresh
published 0–2 microtasks after the subscribe and hears one from 3 on;
`concat` loses through 3. So there IS a window and `merge` only narrows it —
what makes it harmless is that in every lost case the initial `orders()`
query had not completed (with `merge`, not even started), so the update a
lost refresh carried is one that query goes on to observe anyway. Its `place()` is `scopedPortStream` tapped, so its
own failure ERRORS that per-call stream: a per-call stream has an error
channel, unlike the ticket machine's ref. `candleSeries` keeps the two
backfill flags as presenter-owned `SubscriptionRef` CELLS (replay-current
across warm periods, cleared synchronously when a period starts) while the
series itself is a seedless fold whose `run` is the SINGLE writer:
`loadOlder` never publishes, it grows `older` and offers to the period's
nudge `Queue`, which the fold merges with the base port and re-stitches
through the imported `stitchCandles`. A page landing between periods offers
to a queue nobody drains, which is inert, and the next period resets
`older` anyway. The two workspace singletons (`eqWorkspace`, `eqDrawings`)
are `createChildHost` + `refToWarmStateStream` over the imported folds;
`eqWorkspace`'s seed is ONE forked fiber over the roster with
`Stream.take(1)` after the empty-symbol filter, so an empty roster never
seeds and a later one never re-seeds. `orderTicket` is a per-mount DETACHED
host on `createRunSlot`, with `scopedPortStream(deps.place)` inside the run
so a superseding submit's interrupt withdraws the order in flight.

**Composition (slice 8).** `composeApp` mints the runtime, resolves the
native presenters in its one `runSync`, builds the Jarvis family and its
workspace on child hosts, and gates `ports.transport` on this core's own
`auth` — nothing is composed beside an RxJS base app any more.
`dispose()` closes the host scope, then disposes the runtime, releasing
every port subscription the app holds (`composition.dispose.test.ts`); the
native presenter map is typed `Omit<Presenters, …family keys>`, so the
typecheck proves the two halves cover `Presenters`. `WatchlistLive` joins `PowerSaverLive` as a
Layer that is both merged into the app and provided to a dependent
(`EqWorkspaceLive`), memoised by reference so it is built once —
`layers.test.ts` counts `marketData.watchlist()` calls as the witness.

Both a dependency-cruiser rule (`bridge-owns-rxjs`) and grep gate 43 keep
every other file in `src/` free of runtime rxjs imports — otherwise this
core would be RxJS with extra steps.

## Members

**All 74** members are **native** (slice 7's wave 2), and since slice 8
`@rtc/client-core` is a devDependency for test adapters only. Wave 2 added the Jarvis family (`presenters/jarvisFamily.ts`), built
outside the Layer graph on child hosts of the app host: `jarvis` (a
`SyncRef` over core-logic's shared `createJarvisController`; an idle `send`
subscribes its `ask` in the same tick, a fiber folds the replies; a forked
countdown fiber; `events$` a synchronous bridge `createHotStream`),
`jarvisDriver` (a `Queue` + consumer fiber, `Effect.sleep` stagger),
`jarvisDemo` (a run fiber; each step an `Effect.async` settled by the shared
`createDemoStepWatch` over synchronous state/event listeners, raced by
`Effect.timeoutTo`), `jarvisUsage` (lazily opened, retained) and the
internal narrator (a switched `Stream.flatMap` over scoped per-pair
streams). Wave 1 added the workspace —
now built by the family over this core's own `jarvis.events$`: per-tab layout machines and the panels roster as `SyncRef`s
(`SubscriptionRef`s committed with `runSync`, whose in-core mirrors hear a
change synchronously — the workspace's sync-fold contract), each live
panel's data as a `sharedFold` over the shared frame steps
(`Stream.zipLatestAll` for multi-symbol sources), `panelData$` as a
`sharedFold` that switches with the roster, and the persist debounce as an
`Effect.sleep` fiber — all over `@rtc/core-logic`'s shared
`createWorkspaceDock` / `createLayoutPresetsController` /
`writeWorkspaceLayout`. Slice 5 added the nine admin
members: the three metric windows, `eventLog` and `sessionsKpi` as retained
`sharedFold`s seeded `[]`, `topology` and `sessions` as retained mirrors,
`throughput` (a `SubscriptionRef`, a debounce fiber and `createRunSlot`), and
the `incident` singleton, whose connection events go out through
`ports.connectionIntents.injectIncident` (slice 8). Slice 6 added five shell
members: `workspaceNav`, `bootGate` and `auth` over `SubscriptionRef`s
(since slice 8 this core also gates `ports.transport` on its `auth`, in
`bridge/transportGate.ts`, released with the host scope),
the `boot` ramp as a fiber of `Effect.sleep` steps, and `animationDirector`
— a refCounted `sharedFold` over a merged Effect `Stream` whose per-pair
prices are `scopedPortStream`s, so a roster switch releases them. Slice 4 added eight: the five
equities presenters (`watchlist`, `candleSeries`, `depth`, `ordersBlotter`,
`positions`), the two workspace singletons (`eqWorkspace`, `eqDrawings`)
and `machines.orderTicket`. Slice 3 added eight: the
four credit presenters (`rfqs`, `dealers`, `instruments`, `rfqQuote`) and
the four RFQ machines (`rfqTile`, `rfqSubmission`, `ticketSubmission`,
`rfqCountdown`). Slice 2 added eleven:
the FX pricing pair (`priceStream`, `priceHistory` — conflated folds),
the three warm singletons (`currencyPairs`, `analytics`, `blotter`),
`execution`, and five machines (`tileExecution`, `staleFlag`,
`analyticsStaleFlag`, `rowHighlight`, `notional`). The seventeen from
slice 1b are `connection`, every
preference presenter (`themePreference`, `themeSkinPreference`,
`viewModePreference`, `powerSaver`, `creditRfqFilterPreference`,
`eqWatchlistSortPreference`, `eqBlotterViewPreference`, `bootPreference`,
`loginWaitPreferences`, `jarvisPreferences`, `animatedBackground`,
`ambientStyle`, `chartSubstrate`, `layoutEngine`, `forceBootAnimation`) and
`commands.reconnect`. The native idiom for a replay-current stream is `sharedFold` (a
`SubscriptionRef` seeded synchronously on every first subscribe, driven by a
producer fiber in a per-warm-period child scope) — `Stream.share` cannot be
the envelope, since it replays to a new subscriber on a fiber rather than in
the caller's tick; `mirrorPort` / `mirrorPortAsIs` are the port-stream
special case (projected / unchanged), `Stream.zipLatest` combines two
inputs (`mode$`), and `peek` (`bridge/peek.ts`) reads the stored value
synchronously
(`cycle()`, `current()` — `src/presenters/readPreferences.ts`; a presenter
with no stream of its own, `bootPreference`, takes no host). The presenter
files group by API shape: `preferences.ts` (one stream plus setters,
including the two boolean toggles), `groupedPreferences.ts` (several
independent streams under one member), `readPreferences.ts`. One documented
difference from the RxJS core: a `SubscriptionRef` fold conflates
`Object.is`-equal consecutive states.

`src/coreContract.test.ts` runs the full `@rtc/core-contract` suite set
against this core under the label `effect`.
