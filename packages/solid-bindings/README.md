# @rtc/solid-bindings

The Solid↔RxJS bridge — the parallel sibling of `@rtc/react-bindings`, translating `@rtc/client-core-rxjs`'s presenters and machines into Solid primitives (`createViewModel`, `useMachine`, `useViewModel`) with the exact same `ViewModel` member list. This is the package that made the SolidJS port a genuine second measurement of the replaceability matrix rather than a reuse of React's bridge.

| | |
|---|---|
| **Ring** | ③ Interface Adapters — ViewModel bridge (see `docs/architecture/01-overview.md` §1.3.1) |
| **Runtime deps** | `@rtc/core-api`, `@rtc/domain`, `@rx-state/core`, `rxjs`, `solid-js` 2, `@solidjs/web` (JSX types) (`@rtc/client-core-rxjs` and `@rtc/client-adapters` are devDependencies, for tests) — the only package in the repo permitted to depend on both Solid and the core's RxJS streams (`docs/architecture/06-package-dependencies.md`) |
| **Consumed by** | `client-solid` (the only client on this bridge) |
| **Must never import** | `client-solid`, `client-react`, `client-react-native`, `server` — the dependency direction is one-way (solid-bindings sits below its client in the build order), mirroring `react-bindings`' own boundary |

## Folder map

solid-bindings is flat — no subfolders. Every file sits directly under `src/`.

| Path | What lives here |
|---|---|
| `src/createViewModel.ts` | The `ViewModel` factory: builds the full set of `use*` accessors from `presenters`, `machines`, and `commands` — shared streams via `@rx-state/core`'s `state()`, per-mount machines via `useMachine` |
| `src/toSignal.ts` | The primitive seam: `StateObservable<T>` → Solid `Accessor<T>`, requiring a warm-or-defaulted source (no undefined first frame, by construction) |
| `src/useMachine.ts` | The per-mount RxJS-machine → Solid primitive bridge (lifecycle glue only — see "Eager disposal" below) |
| `src/useViewModel.ts` | The accessor hook UI components import to read the `ViewModel` from context |
| `src/ViewModelContext.ts` | The seam itself: a default-less Solid `Context<ViewModel>` (reading it with no provider throws `ContextNotFoundError`), kept in its own module so components importing `useViewModel` don't transitively pull in the provider |
| `src/ViewModelProvider.tsx` | The injector component — imported only by `client-solid`'s UI root (`AppRoot.tsx`) |

## Where to start reading

1. `src/toSignal.ts` — the whole primitive seam in one function: subscribe eagerly, seed a Solid signal with the synchronous first emission (throws if the source is cold — a warm/defaulted `StateObservable` is a precondition, not a fallback path), then forward later emissions through the signal's setter. See "Solid 2's write timing" below for what that write does.
2. `src/useViewModel.ts` — the accessor every UI component calls; throws if used outside a `ViewModelProvider`.
3. `src/useMachine.ts` — the lifecycle bridge that turns a per-mount RxJS `Machine` into `{ state, ...intents }`. Read the doc comment before touching it: the disposal timing is the one place this package *diverges* from `react-bindings`, not mirrors it (see below).
4. `src/createViewModel.ts` — the factory that wires the ViewModel's accessors: `state()`-backed (from `@rx-state/core`) accessors for global/shared streams (prices, theme, session), `useMachine`-backed accessors for per-component-instance machines (tile execution, RFQ tiles, order tickets) — structurally the same split `react-bindings` makes, just over a different primitive.

## How it's used

`client-solid` reads the `ViewModel` through `useViewModel()` — never through `@rx-state/core` or `rxjs` directly, the same discipline `client-react`/`client-react-native` keep with `react-bindings`. The provider side is wired once per composition — `client-solid/src/AppRoot.tsx` receives the `Composition` the core host built (`src/app/coreHost.ts`), calls `createViewModel(presenters, machineFactories, commands, …)` on it and wraps the tree in `<ViewModelProvider viewModel={...}>`.

```ts
// packages/solid-bindings/src/toSignal.ts (trimmed)
export function toSignal<T>(state$: StateObservable<T>): Accessor<T> {
  let seed = null as Box<T> | null;
  const sub = state$.subscribe((v) => { /* seed first, then write */ });
  if (seed === null) {
    sub.unsubscribe();
    throw new Error("toSignal requires a warm or defaulted StateObservable");
  }
  // Boxed: Solid 2's createSignal(fn) is the writable-DERIVED form, so a
  // function-valued state could not be seeded unboxed.
  const [boxed, setBoxed] = createSignal<Box<T>>(seed, {
    equals: sameBoxedValue, // === on the value, as an unboxed signal
  });
  // ...later emissions forwarded via setBoxed({ value })
  return () => boxed().value;
}
```

### Accessor keys on the pure-subscription hooks

A Solid component's setup body runs **once**, so a hook that takes a plain key
subscribes once and never moves. Every hook here whose body is nothing but a
keyed `state()` subscription — `usePrice`, `usePriceHistory`,
`useQuotesForRfq`, `useAnimationIntents`, `useEquityQuote`, `useCandles`,
`useCandleBackfill`, `useDepth`, `useJarvisPanelData` — therefore takes each
key as `MaybeAccessor<T>` (`T | Accessor<T>`), independently per key:

```ts
const price = usePrice(() => props.pair);            // live: follows the prop
const candles = useCandles(() => sym(), "1W");        // mixed forms are fine
```

`toKeyedSignal` (in `src/toSignal.ts`) is the mechanism, and it takes the
**keys**, not an opaque source thunk. Each key is resolved through its own
`createMemo` (default `===` equality) *before* it reaches the source factory,
so the subscription follows the key's **value**, not every read of it. That
distinction is load-bearing, not pedantry: a key accessor is usually a getter
over a much coarser signal — `() => props.symbol` where `props.symbol` reads
the whole eqWorkspace `state()` object — and a thunk-shaped helper re-runs on
every unrelated field of that object, tearing the subscription down to refcount
0 and rebuilding it. For `CandleSeriesPresenter` that discards every backfilled
page. (An earlier version of this helper did exactly that; the
`factoryCalls` cases in `toSignal.keyed.test.tsx` pin the gate.) The
corollary: a `source` callback must stay signal-free and read its keys only
from the arguments it is handed.

On a real key change Solid 2 runs the memo's new compute before it cleans up
the previous run, so the new `toSignal` subscribes and seeds synchronously,
then the previous run's `onCleanup` unsubscribes the old source — no undefined
frame between keys, and a source both keys share never drops to refcount 0 in
between. (Under Solid 1, which cleaned up first, a rebuild evicted the cached
keyed instance; under Solid 2 an ungated rebuild "only" churns a subscription,
which the `sourceCalls` cases in `toSignal.keyed.test.tsx` now count.) A plain
value key reads no signal, so its memo runs exactly once: the value form is
behaviour-identical to calling `toSignal` directly.

### Solid 2's write timing — and the one-turn guarantee

Solid 2 applies a signal write at the next microtask (or an explicit
`flush()`), not when it is made, and a read before then still returns the
previous value. For this bridge that is a feature: every value a presenter
emits in one synchronous turn is one write each, and they all land in the same
flush — the UI re-renders once per turn however many values a burst carried,
which is the UI half of the core's "a burst is delivered in one turn"
guarantee (§22 guarantee 5). `toSignal.test.tsx` pins it ("delivers a burst
emitted in one turn as ONE downstream update"); a bridge that flushed per
emission fails that case. The cost is on the test side: a test that emits and
then reads must `flush()` in between (the contract driver and the client's
page objects do it for their specs).

The bridge signal keeps Solid 2's owned-scope write guard: no emission the app
produces arrives while Solid runs a component body, memo or effect compute
(measured over the unit, contract and dev-server e2e suites on all three
cores), so a dev-mode `REACTIVE_WRITE_IN_OWNED_SCOPE` throw from the bridge
would flag a subscription with side effects on other streams — worth
learning about, not opting out of.

This is deliberately **not** applied to the `useMachine`-backed hooks
(`useStaleFlag`, `useRowHighlight`, `useNotional`, `useRfqCountdown`,
`useTileExecution`, `useRfqTile`, `useOrderTicket`, `useBootSequence`) or to
`useLayout`: those BUILD something from the key, and disposing/rebuilding it on
a key change would restart a timer, drop an in-flight fold, or tear down a
composition-root singleton every other reader shares.

### `useMachine`'s eager disposal — the one place this diverges from `react-bindings`

`react-bindings`' `useMachine` defers disposal into a `queueMicrotask` specifically to survive React 19 StrictMode's dev-only double-invoke (`setup → cleanup → setup`, synchronously within one commit) — without the deferral, the first `setup`'s cleanup would kill the machine the immediate re-`setup` still needs.

Solid has no equivalent double-invoke: a Solid component's setup function runs exactly once, and `onCleanup` fires exactly once, on genuine teardown. (`onCleanup` in a component body, not Solid 2's `onSettled`: the machine is created in the body, so it must be released even if the component is torn down before it settles.) Copying the microtask-deferred pattern here would not be "playing it safe" — it would be a latent bug (a live-then-dead machine window with no compensating remount to save it). So `src/useMachine.ts` disposes **eagerly**, inside `onCleanup`, with no deferral at all. This is the one lifecycle detail a Solid port had to *think about* rather than copy — everything else in this package mirrors `react-bindings`' shape directly.

## How to run

```bash
pnpm --filter @rtc/solid-bindings build       # tsc --build && tsc-alias
pnpm --filter @rtc/solid-bindings typecheck
pnpm --filter @rtc/solid-bindings test        # vitest run
```

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [`@rtc/react-bindings`'s README](../react-bindings/README.md) — the sibling this package mirrors
- [§8.1 The Multi-Client Proof & the SolidJS Port](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)
- [§6 Package Dependencies](../../docs/architecture/06-package-dependencies.md#6-package-dependencies)
