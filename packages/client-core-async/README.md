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

Four primitives, and nothing else:

| primitive | RxJS equivalent |
|---|---|
| `Store<S>` | `BehaviorSubject` / `state(…, seed)` — a synchronous replay-current cell |
| `Topic<T>` | `shareReplay({ bufferSize: 1, refCount: true })` written out explicitly |
| `spawn` | source subscription: abort ends it silently, any other error is routed |
| `sleep` | `timer(…)` / `delay(…)` under an `AbortSignal` |

### Bridge

`@rtc/core-api` speaks `Stream<T>` / `StateStream<S>` (rxjs `Observable` /
`@rx-state/core` `StateObservable`), so the seam between this core's kernel
and the published contract is two files:

- `bridge/in.ts` — `once` (first value of a port Observable) and `iterate`
  (an Observable pulled as an `AsyncIterable`).
- `bridge/out.ts` — `topicToStream` / `storeToStateStream`, the only places
  in the package that construct an Observable.

Both a dependency-cruiser rule (`bridge-owns-rxjs`) and grep gate 43 keep
every other file in `src/` free of runtime rxjs imports — otherwise this
core would be RxJS with extra steps.

## Parity

In this slice every member **delegates** to `@rtc/client-core` (the strangler
seam): `composeWithBase` builds the RxJS app and overlays whatever this core
implements natively — nothing, yet. `src/parity.json` is the committed record
of that fact and `src/parity.test.ts` proves manifest and reality agree by
reference identity, so a member cannot claim to be native while still being
the RxJS instance (or vice versa).

`src/coreContract.test.ts` runs the full `@rtc/core-contract` suite set
against this core under the label `async`.
