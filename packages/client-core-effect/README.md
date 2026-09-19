# @rtc/client-core-effect

The **Effect-TS** application core — one of the interchangeable
implementations behind the types-only `@rtc/core-api` contract, proven
equivalent to the others by the `@rtc/core-contract` behavioural tier.

## Shape

```
src/bridge/    in.ts / out.ts / peek.ts — the ONLY files that import rxjs values
src/composition.ts   the CoreFactory (`effectCore`), owner of the runtime + scope
src/parity.json      which members are native vs delegated
```

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

- `bridge/in.ts` — `rpc` (first value of a port Observable, as an `Effect`)
  and `fromObservable` (an Observable pushed into a `Stream`, subscribed
  SYNCHRONOUSLY at call time, its subscription released both by the stream's
  own finaliser and by the optional `Scope` it is handed). Nothing outside
  `src/bridge/` may import it: a presenter reaches `fromObservable` only
  through the `fromPort` a `sharedFold` hands its producer, which passes the
  warm period's scope — so a stream the producer builds but never runs is
  still released when the period ends. The dependency-cruiser rule
  `effect-port-subscription-owned-by-the-bridge` keeps it that way.
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

Both take an `EffectHost` — `{ runtime, scope }` — rather than a bare
runtime, and two details of that are load-bearing:

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

Both a dependency-cruiser rule (`bridge-owns-rxjs`) and grep gate 43 keep
every other file in `src/` free of runtime rxjs imports — otherwise this
core would be RxJS with extra steps.

## Parity

As of slice 1b, seventeen members are **native** — `connection`, every
preference presenter (`themePreference`, `themeSkinPreference`,
`viewModePreference`, `powerSaver`, `creditRfqFilterPreference`,
`eqWatchlistSortPreference`, `eqBlotterViewPreference`, `bootPreference`,
`loginWaitPreferences`, `jarvisPreferences`, `animatedBackground`,
`ambientStyle`, `chartSubstrate`, `layoutEngine`, `forceBootAnimation`) and
`commands.reconnect` — and everything else still **delegates** to
`@rtc/client-core` (the strangler seam): `composeWithBase` builds the RxJS
app, mints a `ManagedRuntime` and a `Scope`, and overlays what this core
implements. The native idiom for a replay-current stream is `sharedFold` (a
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
