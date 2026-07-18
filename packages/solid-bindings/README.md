# @rtc/solid-bindings

The Solid↔RxJS bridge — the parallel sibling of `@rtc/react-bindings`, translating `@rtc/client-core`'s presenters and machines into Solid primitives (`createViewModel`, `useMachine`, `useViewModel`) with the exact same `ViewModel` member list. This is the package that made the SolidJS port a genuine second measurement of the replaceability matrix rather than a reuse of React's bridge.

| | |
|---|---|
| **Ring** | ③ Interface Adapters — ViewModel bridge (see `docs/architecture/01-overview.md` §1.3.1) |
| **Runtime deps** | `@rtc/client-core`, `@rtc/domain`, `@rx-state/core`, `rxjs`, `solid-js` — the only package in the repo permitted to depend on both Solid and the core's RxJS streams (`docs/architecture/06-package-dependencies.md`) |
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
| `src/ViewModelContext.ts` | The seam itself: a bare Solid `Context<ViewModel \| undefined>`, kept in its own module so components importing `useViewModel` don't transitively pull in the provider |
| `src/ViewModelProvider.tsx` | The injector component — imported only by `client-solid`'s composition root (`AppRoot.tsx`) |

## Where to start reading

1. `src/toSignal.ts` — the whole primitive seam in one function: subscribe eagerly, seed a Solid signal with the synchronous first emission (throws if the source is cold — a warm/defaulted `StateObservable` is a precondition, not a fallback path), then forward later emissions through the signal's setter.
2. `src/useViewModel.ts` — the accessor every UI component calls; throws if used outside a `ViewModelProvider`.
3. `src/useMachine.ts` — the lifecycle bridge that turns a per-mount RxJS `Machine` into `{ state, ...intents }`. Read the doc comment before touching it: the disposal timing is the one place this package *diverges* from `react-bindings`, not mirrors it (see below).
4. `src/createViewModel.ts` — the factory that wires the ViewModel's accessors: `state()`-backed (from `@rx-state/core`) accessors for global/shared streams (prices, theme, session), `useMachine`-backed accessors for per-component-instance machines (tile execution, RFQ tiles, order tickets) — structurally the same split `react-bindings` makes, just over a different primitive.

## How it's used

`client-solid` reads the `ViewModel` through `useViewModel()` — never through `@rx-state/core` or `rxjs` directly, the same discipline `client-react`/`client-react-native` keep with `react-bindings`. The provider side is wired once, at the composition root — `client-solid/src/AppRoot.tsx` calls `createViewModel(presenters, machineFactories, commands)` and wraps the tree in `<ViewModelProvider viewModel={...}>`.

```ts
// packages/solid-bindings/src/toSignal.ts (trimmed)
export function toSignal<T>(state$: StateObservable<T>): Accessor<T> {
  let seed!: T;
  let seeded = false;
  const sub = state$.subscribe((v) => {
    if (!seeded) { seed = v; seeded = true; }
  });
  if (!seeded) {
    sub.unsubscribe();
    throw new Error("toSignal requires a warm or defaulted StateObservable");
  }
  const [value, setValue] = createSignal<T>(seed);
  // ...later emissions forwarded via setValue
  return value;
}
```

### `useMachine`'s eager disposal — the one place this diverges from `react-bindings`

`react-bindings`' `useMachine` defers disposal into a `queueMicrotask` specifically to survive React 19 StrictMode's dev-only double-invoke (`setup → cleanup → setup`, synchronously within one commit) — without the deferral, the first `setup`'s cleanup would kill the machine the immediate re-`setup` still needs.

Solid has no equivalent double-invoke: a Solid component's setup function runs exactly once, and `onCleanup` fires exactly once, on genuine teardown. Copying the microtask-deferred pattern here would not be "playing it safe" — it would be a latent bug (a live-then-dead machine window with no compensating remount to save it). So `src/useMachine.ts` disposes **eagerly**, inside `onCleanup`, with no deferral at all. This is the one lifecycle detail a Solid port had to *think about* rather than copy — everything else in this package mirrors `react-bindings`' shape directly.

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
