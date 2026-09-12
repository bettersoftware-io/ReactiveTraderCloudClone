# @rtc/client-core-effect

The **Effect-TS** application core — one of the interchangeable
implementations behind the types-only `@rtc/core-api` contract, proven
equivalent to the others by the `@rtc/core-contract` behavioural tier.

## Shape

```
src/bridge/    in.ts / out.ts — the ONLY files that import rxjs values
src/composition.ts   the CoreFactory (`effectCore`), owner of the ManagedRuntime
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
  and `fromObservable` (an Observable pushed into a `Stream`, its
  subscription released by the scope finaliser).
- `bridge/out.ts` — `streamToStream` / `refToStateStream`, the only places in
  the package that construct an Observable. Each `subscribe` forks a fiber
  and each `unsubscribe` interrupts it; an interrupt-only `Cause` is silence,
  not an error, and `Cause.squash` collapses a typed failure to the single
  `unknown` the contract's `Stream<T>` carries. `SubscriptionRef.changes`
  replays the current value, so `refToStateStream` drops one — `state(…,
  seed)` has already emitted it.

Both a dependency-cruiser rule (`bridge-owns-rxjs`) and grep gate 43 keep
every other file in `src/` free of runtime rxjs imports — otherwise this
core would be RxJS with extra steps.

## Parity

In this slice every member **delegates** to `@rtc/client-core` (the strangler
seam): `composeWithBase` builds the RxJS app, mints a `ManagedRuntime`, and
overlays whatever this core implements natively — nothing, yet. The runtime
is real from day one so `dispose()` closes an Effect-side resource before any
member goes native. `src/parity.json` is the committed record of that fact
and `src/parity.test.ts` proves manifest and reality agree by reference
identity, so a member cannot claim to be native while still being the RxJS
instance (or vice versa).

`src/coreContract.test.ts` runs the full `@rtc/core-contract` suite set
against this core under the label `effect`.
