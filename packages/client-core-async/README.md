# @rtc/client-core-async

The **async/await** application core — one of the interchangeable
implementations behind the types-only `@rtc/core-api` contract, proven
equivalent to the others by the `@rtc/core-contract` behavioural tier.

## Shape

```
src/kernel/    Store, Topic, spawn, sleep, AbortError — zero deps, no rxjs
src/bridge/    in.ts / out.ts — the ONLY files that import rxjs values
src/composition.ts   the CoreFactory (`asyncCore`)
src/parity.json      which members are native vs delegated
```

### Kernel

Seven primitives, and nothing else:

| primitive | RxJS equivalent |
|---|---|
| `Store<S>` | `BehaviorSubject` / `state(…, seed)` — a synchronous replay-current cell |
| `Topic<T>` | `shareReplay({ bufferSize: 1, refCount: true })` written out explicitly — including its reset on error and rxjs's isolation of a throwing subscriber |
| `spawn` | source subscription: abort ends it silently, any other error is routed |
| `sleep` | `timer(…)` / `delay(…)` under an `AbortSignal` |
| `TopicOptions.retainUntil` | `shareReplay({ refCount: false })` — the RxJS core's `warmReplay`: the producer survives zero subscribers and is ended by that signal |
| `relayTopic` | a producer CONSUMING another topic (`map` / `scan`): released synchronously on abort, and a source failure or a throwing consumer fails the producer |
| `createRunSlot` | at most one live run for a Store-backed machine — the RxJS `switchMap` written once; the run reaches the world only through a `Run` whose `set`/`ifCurrent` are dropped once its signal has aborted |

### Bridge

`@rtc/core-api` speaks `Stream<T>` / `StateStream<S>` (rxjs `Observable` /
`@rx-state/core` `StateObservable`), so the seam between this core's kernel
and the published contract is two files:

- `bridge/in.ts` — `once(source, signal?)` (first value of a port
  Observable; with a signal, an abort releases the subscription and rejects
  with `AbortError`), `iterate` (an Observable pulled as an `AsyncIterable`),
  `relay`, and `topicFromObservable(source, retainUntil?)`.
- `bridge/out.ts` — `topicToStream` / `topicToStreamWithLead` (a synchronous
  lead value ahead of the topic's own, the RxJS `defer(() =>
  shared.pipe(startWith(seed)))`) / `promiseToStream` (a one-shot command
  result: value, then complete; an abort is silence) / `storeToStateStream`,
  the only places in the package that construct an Observable.

### Conflation, machines and commands

`createConflatedTopic(source, calm$, ms)` is the RxJS core's
`conflateWhen(flag$, ms)` as ONE producer: while calm, a leading value
publishes at once and opens a window of `ms`, later values replace a pending
slot, and the window's end publishes the pending value and opens the next —
so a steady feed yields one value per `ms`. A flag flip takes effect at once
(calm → off drops the open window and its pending value).

A machine here is a `Store` plus an `AbortController`: the Store is the
`state(…, seed)` warmth guarantee AND the `distinctUntilChanged` (an
`Object.is`-equal write is dropped), and `dispose()` aborts the controller,
ending the machine's own loops. A machine's SOURCE failure has no channel on
a Store, so it aborts the machine and is rethrown on a macrotask
(`reportAsync`) rather than reaching a subscriber.

The credit members added in slice 3 use three shapes and nothing new. A
port COMMAND is `once` over the port's Observable inside `promiseToStream`,
built per call and lazily — the port is reached on subscribe, and
unsubscribing aborts `once`'s signal, which withdraws the request
(`rfqs.createRfq`/`acceptQuote`/`cancelRfq`/`passQuote`/`quoteRfq`,
`rfqQuote.requestQuote`). A DERIVED roster stream is `deriveDistinct` (a
refCounted, replay-1 topic that publishes only when the projection's result
changes by reference) over the retained `RfqStreamState` fold; paired with
`createShallowArrayMemo` — imported from `@rtc/client-core`, not
re-implemented — that is exactly the RxJS core's
`distinctUntilChanged(shallowArrayEquals)` on `rfqs$`/`quotesForRfq$`, and
paired with a bare field read it is the reference check on `allQuotes$`.
`workflow.events()` is called ONCE per presenter: `events$` mirrors it
retained, and the reducer fold (`reduceRfqEvent` from
`createEmptyRfqStreamState`, both the domain's) is a second, likewise
retained relay of the same Observable. A COUNTDOWN (`rfqTile`'s received
tick, `rfqCountdown`) derives `remainingMs` from the tick INDEX — never
`Date.now()` — so `sleep` + fake timers land on the exact boundary; the
clock is read once, at construction.

Both a dependency-cruiser rule (`bridge-owns-rxjs`) and grep gate 43 keep
every other file in `src/` free of runtime rxjs imports — otherwise this
core would be RxJS with extra steps.

Slice 4 (equities) adds three more shapes, still nothing new in the
kernel. `createKeyedPortStreams(open)` is the per-symbol idiom shared by
`watchlist.quote$`, `depth.depth$` and (via its own hand-rolled variant)
`candleSeries.candles$`: `open(key)` runs once, at the first REQUEST for
that key (not the first subscribe), and the result is a memoised,
refCounted `Topic` that releases the port on the last unsubscribe and
starts fresh — no replay — on the next warm period. `storeToWarmStateStream`
(bridge/out.ts) is the app-lifetime-singleton idiom `eqWorkspace` and
`eqDrawings` share with the RxJS presenters' own internal
`state$.subscribe()`: a `StateStream` held warm by a subscription of its
own, so a cold `getValue()` — what a first render reads — never falls back
to the construction-time default. `ordersBlotter`'s `orders$` combines a
retained (`retainUntil: lifetime`) `Topic` with `portCallToStream` (the
lifecycle twin of `promiseToStream`: a per-call port stream, every value
tapped through `onValue` before the subscriber, releases the port on
unsubscribe) for `place()`. Composition is **native-first**:
`composeWithBase` builds this core's native presenters before the RxJS
base app, then hands their streams to `createRxjsApp` as `CoreSeams` —
`eqWorkspace`, `equityFills$`, `watchlist$`, `pairs$`, `priceFor`,
`executions$`, `rfqEvents$`, `connectionStatus$` — so the base's
`JarvisDriverMachine`, `AnimationDirector`, `NarratorMachine` and workspace
seed drive and observe what the UI actually renders, not a second,
unreachable RxJS instance of each, and no port they share with a native
member is held twice (`composition.seams.test.ts`).

## Parity

As of slice 6a, **58 of 74** members are native (the 74th, `layoutPresets`,
arrived delegated with Dockview Phase 6b). Slice 5 added the nine admin
members: the three metric windows, `eventLog` and `sessionsKpi` as warm
folds over `kernel/foldTopic.ts`, `topology` and `sessions` as warm
mirrors, `throughput`, and the `incident` singleton, whose connection
events reach the RxJS core's `incident$` seam through `pushIncidentEvent`.
Slice 6a added five shell members: `workspaceNav`, `bootGate` and `auth`
over Stores (`auth` over the shared `createAuthDeps`), the `boot` ramp, and
`animationDirector` — one refCounted topic over the native members' streams
that re-keys its per-pair tick relays on each roster. Slice 1a/1b brought
`connection`, every preference presenter (`themePreference`,
`themeSkinPreference`, `viewModePreference`, `powerSaver`,
`creditRfqFilterPreference`, `eqWatchlistSortPreference`,
`eqBlotterViewPreference`, `bootPreference`, `loginWaitPreferences`,
`jarvisPreferences`, `animatedBackground`, `ambientStyle`,
`chartSubstrate`, `layoutEngine`, `forceBootAnimation`) and
`commands.reconnect`. Slice 2 added eleven more: the presenters
`priceStream`, `priceHistory`, `execution`, `blotter`, `analytics` and
`currencyPairs`, and the machines `tileExecution`, `staleFlag`,
`analyticsStaleFlag`, `rowHighlight` and `notional`. Slice 3 added the
credit column: the presenters `rfqs`, `dealers`, `instruments` and
`rfqQuote`, and the machines `rfqTile`, `rfqSubmission`,
`ticketSubmission` and `rfqCountdown`. Slice 4 adds the equities column:
the presenters `watchlist`, `candleSeries`, `depth`, `ordersBlotter` and
`positions` (`watchlist`'s roster, `ordersBlotter`'s `orders$` and
`positions` are retained singletons), the machines `eqWorkspace` (seeded
from `watchlist$` via `firstWatchlistSymbol`), `eqDrawings` and
`orderTicket` (its `place` dep reaches `ordersBlotter.place`, wired
together in `composition.ts`'s `nativeMachines`). Everything else still
**delegates** to
`@rtc/client-core` (the strangler seam): `composeWithBase` builds the RxJS
app and overlays what this core implements. The native idiom for a
replay-current stream is `topicFromObservable` (a port as a replay-1,
refCounted `Topic` whose producer is one synchronous `relay`), `mapTopic`
for a projection of it, a hand-written `createTopic` producer where two
inputs combine (`mode$`) or a projection must de-duplicate by reference
(`deriveDistinct`, `src/presenters/rfqs.ts`), and `peek` for a synchronous
read of the stored value (`cycle()`, `current()` —
`src/presenters/readPreferences.ts`). The
presenter files group by API shape: `preferences.ts` (one stream plus
setters, including the two boolean toggles), `groupedPreferences.ts`
(several independent streams under one member), `readPreferences.ts`.
`src/parity.json` is the committed record of the split and
`src/parity.test.ts` proves manifest and reality agree by reference
identity — for presenters, machines and commands alike.

`src/coreContract.test.ts` runs the full `@rtc/core-contract` suite set
against this core under the label `async`.
