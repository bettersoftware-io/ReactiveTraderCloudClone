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
supplies most of the primitives `@rtc/client-core-async` had to write by
hand — `Stream` for a sequence, `Fiber` for structured cancellation,
`Effect.sleep` for a cancellable delay, `Scope` for ownership. That contrast
is the point of running the two cores side by side. The one primitive this
core does write is the cell a piece of state lives in, `SyncRef`
(`bridge/syncRef.ts`) — Effect's own `SubscriptionRef` reaches a subscriber
a fiber step late and costs a fiber per subscriber; see "State lives in a
`SyncRef`" below.

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
- `bridge/out.ts` — `streamToStream` / `sharedFold` / the `listenTo…`
  state-stream helpers, the only places in the package that construct an
  Observable. A `streamToStream` `subscribe` forks a fiber and its
  `unsubscribe` interrupts it; an interrupt-only `Cause` is silence, not an
  error, and `Cause.squash` collapses a typed failure to the single
  `unknown` the contract's `Stream<T>` carries.
- `bridge/syncRef.ts` — `SyncRef`, the cell every machine and presenter-owned
  flag keeps its state in, and its `stateStream()` / `warm()` views.

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
- **Unsubscribe interrupts via the DEFAULT runtime**, not the managed one.
  `ManagedRuntime.dispose()` swaps its runtime effect for
  `die("ManagedRuntime disposed")`, so an interrupt forked on it after
  disposal would die with an unhandled defect and quietly leave the fiber
  running. Interrupting needs no context, so the default runtime is correct.
  Plain code reaches it only through the bridge — `interruptFiber(fiber)`,
  `closeScope(scope)`, `closeScopeAndWait(scope)` — never through the global
  `Effect.runFork` / `runPromise` (grep gate 49).
- **Every fiber runs on the turn scheduler** (`bridge/turnScheduler.ts`),
  which `runnerFor` installs for every host. Since effect 3.20 the default
  scheduler gives each fiber resume a microtask of its own, so a value
  crossing N fibers arrives N microtasks later and a UI renders in between:
  a tile heard its price a turn before the flash that price causes — three
  renders per tick against two (624 against 404 over 6 s, measured
  2026-10-04). The turn scheduler runs every ready fiber step, and the steps
  those make ready, inside ONE microtask, capped like Effect's own at 2048
  waves before it yields to a macrotask. The contract case "a tick's price
  and the flash it causes reach the tile in one turn" pins it.
- **Closing a scope releases its ports first, synchronously.** `Scope.close`
  interrupts the scope's fibers one at a time, newest first, waiting for
  each to end, and only then runs the finalizers that unsubscribe the ports
  — so for a few fiber steps after `dispose()` returns, a machine is still
  listening. Measured: a disposed stale-flag machine folded two more
  connection events. `closeScope` therefore calls `releasePorts(scope)`
  (`bridge/in.ts`) before it forks the close: nothing emitted after the call
  returns is received, which is what an RxJS `unsubscribe()` guarantees.

### State lives in a `SyncRef`

A piece of state this core owns — a machine's, a presenter's flag — is a
**`SyncRef`** (`bridge/syncRef.ts`): a plain cell with five operations.

| operation | what it does |
|---|---|
| `get()` | the current value, read synchronously |
| `set(next)` | commit `next(current)` and notify, before it returns; an `Object.is`-equal value is dropped (the `distinctUntilChanged` a state stream promises) |
| `write(next)` | the same commit as an Effect, for a fiber's own steps |
| `listen(listener)` | an in-core listener: called at once with the current value, then on every commit |
| `stateStream(onSubscribe?)` / `warm()` | the cell as a `StateStream`; `warm()` also holds it warm and returns the `release` |

It is not Effect's `SubscriptionRef`, and grep gate 50 keeps that type out
of the package. A `SubscriptionRef` reaches a subscriber through
`ref.changes`, and reading that takes a fiber per subscriber. Two things
follow, both measured:

- **A step late.** The fiber delivers after the commit. The workspace's
  state is a synchronous fold — the shared dock reads the roster right after
  writing it — and a step late meant a restored docked panel reached the
  UI's first render after the Dockview bridge's orphan scrub had read the
  empty set (slice 7). The workspace and Jarvis members have used a
  `SyncRef` since then.
- **A fiber per subscriber.** Moving the machines and the remaining
  presenters onto it (2026-10-05) took the scheduler tasks of the FX
  screen's first two seconds from about 1,000 to about 700 and the time spent in fibers
  from 57 ms to 37 ms.

So a subscriber is called from inside the write, as an RxJS
`BehaviorSubject`'s is. Three consequences worth knowing:

- `stateStream()` reads the cell **per subscription**, not once at
  construction. `@rx-state/core`'s `StateObservable` subscribes its source
  lazily and, at refCount 0, discards `currentValue` and unsubscribes — so a
  construction-time value would be re-emitted, stale, on every cold → warm
  cycle, and a write made before the first subscriber would be invisible.
- With no subscriber, `stateStream().getValue()` hands back the value the
  cell held when the stream was made. An app-lifetime singleton therefore
  uses `warm()`: a first render reads `getValue()`.
- A listener that writes the cell it is listening to commits again from
  inside the notification. That inner commit tells every listener the newer
  value, and the outer notification then stops: nobody hears an older value
  after a newer one, or the same value twice.

A `sharedFold` period is **seedless-capable**: `seed()` returns an
`Option`, so a port that has not emitted by the time it is peeked seeds
`None` and its subscribers hear nothing until the producer's first write —
the RxJS core's behaviour, rather than a fabricated default. A period keeps
its current state in a plain field and its subscribers in a set, and the
producer's `update` **hands each new state to the subscribers itself**, from
its own fiber. A subscriber is given the current state inside its
`subscribe` call and every later one after that, so one joining in the
middle of a same-tick burst misses nothing (`[0, 1, 3, 6]` for both the
first subscriber and a late one). Each period owns its own subscriber set,
so a stale producer still running in the unsubscribe → scope-close window
can neither write to nor error the next period's subscribers.

It was first written the other way round — the state in a
`SubscriptionRef`, each subscriber following `ref.changes` on a watcher
fiber of its own, and a `Deferred` latch holding the producer's first write
until the first watcher was listening. Timing every fiber step on the FX
screen (2026-10-04) showed those watchers were a quarter of the core's
fiber work: 820 of 2,900 scheduler tasks in the first two seconds, 1,750 of
7,500 per six seconds of steady state, all spent forwarding values.

A producer that folds SEVERAL ports takes them as one stream of events
through **`fromPort.merged([portEvents(a$, toEvent), portEvents(b$, toEvent)])`**
rather than `Stream.merge` over two `fromPort` streams. All the ports feed
one queue, so events keep the order the ports emitted them in — across
ports, which `Stream.merge` does not promise — and a burst costs one fiber
step, where `Stream.merge` runs each side on a fiber of its own and spends
about eleven steps per value. The price and price-history folds and the
stale-flag machines went from 4,250 scheduler tasks per six seconds to 600.
The stream ends when every port has completed and fails as soon as one does.

A source of that merged stream can also be a GROUP of ports that follows a
selector: **`switchedPortEvents(selector$, (key) => [portEvents(…), …])`**
carries the ports of the selector's latest value and releases the previous
group's when it moves on — the RxJS `switchMap((key) => merge(…))`, done as
plain subscription management so every member feeds the same queue. The
animation director and the narrator follow the roster's prices this way.
As `Stream.flatMap(…, { switch: true })` over a `Stream.mergeAll` of a
stream per pair they ran 812 of the core's 1,143 scheduler tasks per six
seconds (four and three per tick); now one each per tick. State a group
needs — the director's "previous mid" — lives in the closure `open` builds,
so it starts afresh with every group. `leavingOnFailure(member)` turns a
member's failure into its leaving the group (the narrator: one failing pair
silences only itself).

Three more sources cover what members used to reach for an Effect
combinator to do, and grep gate 51 now forbids a `Stream` combinator that
joins streams (`merge`, `flatMap`, `zipLatest`, `race`, …) anywhere outside
`bridge/`:

- **`latestOfEach([portEvents(…), …])`** — the latest of every member as one
  array, from the moment each has emitted once (the RxJS `combineLatest`,
  where `Stream.zipLatestAll` ran a fiber per port). A desk panel's
  multi-symbol series.
- **`firstPortEvent(port$, toEvent)`** — a port's first value, then its end,
  with the port released as soon as it answered: a one-shot query as a
  member of a group. The orders blotter's refresh.
- **`oneEvent(event)`** — a constant member (`of(event)`). A desk panel that
  is not live publishes `null`.

`projectedChanges(source$, project)` is the view that goes with them: a
selector that moves only when its projection changed (`map` +
`distinctUntilChanged`), so a group is not reopened by every value of the
stream it is selected from.

Two more rules about WHEN a value arrives, both measured on the FX screen
(2026-10-05):

- **A fold's producer runs before its `subscribe` returns.** `sharedFold`
  forks the producer and then calls `turnScheduler.settle()`: the turn,
  taken now instead of at the next microtask. A port that replays on
  subscribe (the pricing simulator's 50 ticks) has queued those values by
  then, and without the settle the producer folds them a microtask later —
  after a UI that was handed ANOTHER stream's current value synchronously
  has already rendered. Each tile rendered once for its price and again for
  its history: 55 tile renders in the first two seconds of a production
  build against 48 on the RxJS core, 49 with the settle. The contract case
  "a tile mounting on a price that is already warm hears that price and the
  history the port replays in one turn" pins it for all three cores.
- **A narrow view of a shared stream is a filter, not a fold.**
  `filterStream(source, keep)` has no fiber, queue or state: its subscriber
  is called from whatever delivers `source`. `animationDirector.intentsFor`
  is that over the director's one stream (the RxJS core's
  `all$.pipe(filter(…))`); as a fold per target, every intent woke a fiber
  per mounted tile to be dropped by eight of them.

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
the async twin's `lifetime` abort listener does. `SyncRef.warm()` is
`stateStream()` held warm by a subscription of its own, with a `release()`:
an app-lifetime singleton must survive a cold `getValue()` between one panel
unmounting and the next mounting, which is exactly what the RxJS singletons'
internal `state$.subscribe()` is for.

Three smaller bridge primitives carry slice 2: `fromPortIn(scope)` (a
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
window and then ended would kill it at once). The calm flag and the source
feed ONE queue (`fromPort.merged`), the flag subscribed first: a
replay-current flag emits during its subscribe, so its value is queued ahead
of every tick — including the ticks a source replays during ITS subscribe,
as the pricing simulator does. That is the order the RxJS
`flag$.pipe(switchMap(…))` gets structurally, since it subscribes the source
only once the flag has emitted. A flag with no current value queues nothing,
and ticks before it speaks are dropped.

A machine here is a `SyncRef` plus, when it forks a fiber or subscribes a
port, a **detached host**: its own scope under the default runtime, closed
by `dispose()` (`notional` does neither, so it has no host). `state$` is
`ref.stateStream()`, which re-reads the ref per subscription — so a fresh
subscription after `dispose()` still yields the current value
synchronously, which is what the contract asserts. Intents are synchronous
`ref.set` writes; timers are fibers forked into the machine's scope, writing
through `ref.write`, so `dispose()` interrupts them. The run token and the fiber behind
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
`rfqTile`'s received phase) is ONE looping fiber writing the ref once
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
`ordersBlotter` pairs a `PubSub` (`fills$`, hot with no replay) with a
RETAINED fold whose producer is a `switchedPortEvents` group of one —
`firstPortEvent(orders.orders())`, newest winning — selected by a refresh
count kept in a `SyncRef`. The count's state stream hands a period its
current value on subscribe (the initial query) and every later refresh
synchronously, so no refresh is lost. Until 2026-10-05 the refresh signal
was a second `PubSub` merged with an initial value, and a refresh published
within three microtasks of the period's first subscribe reached nobody
(measured on 3.22.2; harmless only because the initial query had not yet
completed in those cases). Its `place()` is `scopedPortStream` tapped, so its
own failure ERRORS that per-call stream: a per-call stream has an error
channel, unlike the ticket machine's ref. `candleSeries` keeps the two
backfill flags as presenter-owned `SyncRef` CELLS (replay-current
across warm periods, cleared synchronously when a period starts) while the
series itself is a seedless fold whose `run` is the SINGLE writer:
`loadOlder` never publishes, it grows `older` and offers to the period's
nudge `Queue`, which the fold merges with the base port and re-stitches
through the imported `stitchCandles`. A page landing between periods offers
to a queue nobody drains, which is inert, and the next period resets
`older` anyway. The two workspace singletons (`eqWorkspace`, `eqDrawings`)
are `createChildHost` + a warm `SyncRef` over the imported folds;
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

**All 75** members are **native** (74 as of slice 7's wave 2; `equityPriceHistory` added 2026-09-28), and since slice 8
`@rtc/client-adapters` is a devDependency for test adapters only. Wave 2 added the Jarvis family (`presenters/jarvisFamily.ts`), built
outside the Layer graph on child hosts of the app host: `jarvis` (a
`SyncRef` over core-logic's shared `createJarvisController`; an idle `send`
subscribes its `ask` in the same tick, a fiber folds the replies; a forked
countdown fiber; `events$` a synchronous bridge `createHotStream`),
`jarvisDriver` (a `Queue` + consumer fiber, `Effect.sleep` stagger),
`jarvisDemo` (a run fiber; each step an `Effect.async` settled by the shared
`createDemoStepWatch` over synchronous state/event listeners, raced by
`Effect.timeoutTo`), `jarvisUsage` (lazily opened, retained) and the
internal narrator (the latest roster's prices through one queue,
`switchedPortEvents`). Wave 1 added the workspace —
now built by the family over this core's own `jarvis.events$`: per-tab layout machines and the panels roster as `SyncRef`s
(whose in-core mirrors hear a change synchronously — the workspace's
sync-fold contract), each live
panel's data as a `sharedFold` over the shared frame steps
(`Stream.zipLatestAll` for multi-symbol sources), `panelData$` as a
`sharedFold` that switches with the roster, and the persist debounce as an
`Effect.sleep` fiber — all over `@rtc/core-logic`'s shared
`createWorkspaceDock` / `createLayoutPresetsController` /
`writeWorkspaceLayout`. Slice 5 added the nine admin
members: the three metric windows, `eventLog` and `sessionsKpi` as retained
`sharedFold`s seeded `[]`, `topology` and `sessions` as retained mirrors,
`throughput` (a `SyncRef`, a debounce fiber and `createRunSlot`), and
the `incident` singleton, whose connection events go out through
`ports.connectionIntents.injectIncident` (slice 8). Slice 6 added five shell
members: `workspaceNav`, `bootGate` and `auth` over `SyncRef`s
(since slice 8 this core also gates `ports.transport` on its `auth`, in
`bridge/transportGate.ts`, released with the host scope),
the `boot` ramp as a fiber of `Effect.sleep` steps, and `animationDirector`
— a refCounted `sharedFold` over its six sources in one queue
(`fromPort.merged`), the per-pair prices a `switchedPortEvents` group, so a
roster switch releases them; `intentsFor(target)` is a `filterStream` view
of it. Slice 4 added eight: the five
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
state seeded synchronously on every first subscribe, driven by a
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
difference from the RxJS core: a `sharedFold` conflates
`Object.is`-equal consecutive states.

`src/coreContract.test.ts` runs the full `@rtc/core-contract` suite set
against this core under the label `effect`.
