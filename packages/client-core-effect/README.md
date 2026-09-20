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
src/parity.json      which members are native vs delegated
```

**The Layer graph** (slice 2). Every native presenter is a *service*: a
`Context.GenericTag` in `layers.ts` and a `Layer` that builds it from the
`EffectHost` and `AppPorts` services in `services.ts`. `HostLive` is the
scope owner — it captures the runtime the Layer is built under
(`Effect.runtime`) and forks a **closeable child** of the Layer's own scope,
so `app.dispose()` can end it explicitly and `runtime.dispose()` ends it
anyway if nobody did. `composeWithBase` then makes exactly **one**
`runSync`, resolving the host and the whole `Presenters` overlay together;
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
so `dispose()` interrupts them. `tileExecution` is `Effect.race` of the
`rpc` against `Effect.sleep(EXECUTION_TIMEOUT_MS)`, with the too-long marker
a forked child of the run (finishing cancels the escalation) and switch-map
semantics as `Fiber.interrupt` of the previous run — guarded by a run token
read at each write, because interruption lands at the run's next suspension,
not at the `Fiber.interrupt` call. A source failure in `staleFlag` has no
channel on a ref, so the scope closes and the cause is rethrown out of band.

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

Both a dependency-cruiser rule (`bridge-owns-rxjs`) and grep gate 43 keep
every other file in `src/` free of runtime rxjs imports — otherwise this
core would be RxJS with extra steps.

## Parity

As of slice 3, thirty-six members are **native**. Slice 3 added eight: the
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
`commands.reconnect`. Everything else still **delegates** to
`@rtc/client-core` (the strangler seam): `composeWithBase` builds the RxJS
app, mints a `ManagedRuntime` over `buildAppLayer(ports)`, and overlays what
this core implements. The native idiom for a replay-current stream is `sharedFold` (a
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
`Object.is`-equal consecutive states. `src/parity.json` records the split
and `src/parity.test.ts` proves manifest and reality agree by reference —
for presenters, machines and commands alike.

`src/coreContract.test.ts` runs the full `@rtc/core-contract` suite set
against this core under the label `effect`.
