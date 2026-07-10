# @rtc/react-bindings

The React↔RxJS bridge: the one package that knows both worlds, translating `@rtc/client-core`'s presenters and machines into React hooks (`createViewModel`, `useMachine`, `useViewModel`) that the dumb UI packages consume.

| | |
|---|---|
| **Ring** | ③ Interface Adapters — ViewModel bridge (see `docs/architecture/01-overview.md` §1.3.1) |
| **Runtime deps** | `@react-rxjs/core`, `@rtc/client-core`, `@rtc/domain`, `react`, `rxjs` — the only package in the repo permitted to depend on both React and the core's RxJS streams (`docs/architecture/06-package-dependencies.md`) |
| **Consumed by** | `client-react`, `client-react-native` (both shipping clients — see "How it's used" below) |
| **Must never import** | `client-react`, `client-react-native`, `server` — the dependency direction is one-way (react-bindings sits below both clients in the build order). The flip side of this boundary is machine-enforced: gate 26 bans `rxjs` / `@react-rxjs` / `@rx-state` imports in `client-react/src/ui` outright, *except* through this bridge (`docs/architecture/12-architectural-gates.md`) |

## Folder map

react-bindings is flat — no subfolders. Every file sits directly under `src/`.

| Path | What lives here |
|---|---|
| `src/createViewModel.ts` | The `ViewModel` factory: builds the full set of `use*` hooks from `presenters`, `machines`, and `commands`, each either a `bind()`-backed shared stream or a `useMachine`-backed per-mount machine |
| `src/useMachine.ts` | The per-mount RxJS-machine → hook bridge (lifecycle glue only — see "StrictMode-safe disposal" below) |
| `src/useViewModel.ts` | The accessor hook UI components import to read the `ViewModel` from context |
| `src/ViewModelContext.ts` | The seam itself: a bare `React.Context<ViewModel \| null>`, kept in its own module so components importing `useViewModel` don't transitively pull in the provider |
| `src/ViewModelProvider.tsx` | The injector component — imported only by each client's composition root (`AppRoot.tsx`) |

## Where to start reading

1. `src/ViewModelContext.ts` — the whole seam in nine lines: a context holding a `ViewModel` or `null`.
2. `src/useViewModel.ts` — the accessor every UI component calls; throws if used outside a `ViewModelProvider`.
3. `src/useMachine.ts` — the lifecycle bridge that turns a per-mount RxJS `Machine` into `{ state, ...intents }`; read its doc comment before touching it, the StrictMode disposal timing is load-bearing.
4. `src/createViewModel.ts` — the factory that wires the ViewModel's hooks: `bind()`-backed accessors for global/shared streams (prices, theme, session), `useMachine`-backed accessors for per-component-instance machines (tile execution, RFQ tiles, order tickets).

## How it's used

Both shipping clients read the `ViewModel` through `useViewModel()` — never through `react-rxjs` or `rxjs` directly. A real consumer, `packages/client-react-native/src/ui/shell/lock/LockButton.tsx`:

```tsx
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Toolbar affordance that locks the session. RN has no header AccountMenu, so
 * the toolbar carries the lock control; it raises the LockScreen overlay via
 * the reused `useSession().lock()` seam. */
export function LockButton(): JSX.Element {
  const { useSession } = useViewModel();
  const { lock } = useSession();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID="lock-button"
      onPress={() => {
        lock();
      }}
    >
      <Text style={styles.label}>Lock</Text>
    </Pressable>
  );
}
```

The equivalent pattern repeats across both clients — `client-react/src/ui/**` (e.g. `AccountMenu.tsx`, `ConnectionStatusBar.tsx`) and `client-react-native/src/ui/**` (e.g. `SpotTile.tsx`, `Blotter.tsx`) all call `useViewModel()` and destructure the hook they need; neither client imports `@react-rxjs/core` or `rxjs` itself. The provider side is wired once, at each composition root — `client-react/src/AppRoot.tsx` and `client-react-native/src/app/AppRoot.tsx` both call `createViewModel(presenters, machineFactories, commands)` and wrap the tree in `<ViewModelProvider viewModel={...}>`.

### `useMachine`'s StrictMode-safe disposal

`useMachine` (`src/useMachine.ts:37-63`) instantiates its `Machine` factory exactly once, in a lazy `useRef` (not `useState`/`useMemo`), so React 19 StrictMode's dev-only double-invoke of the render body can't construct two machines for one mount. Disposal is where the real hazard sits: StrictMode also runs the mount effect's cleanup → setup cycle synchronously within the commit (`setup → cleanup → setup`), and a machine that disposed eagerly in that cleanup would kill the very machine the immediate re-setup keeps using — leaving the surviving component holding a disposed machine (intents pushing into completed `Subject`s, `state$` never emitting again).

The fix: cleanup doesn't dispose immediately. It flips a `keepAlive` ref to `false` and schedules the actual `machine.dispose()` in a `queueMicrotask`. The following `setup` (StrictMode's synchronous remount) flips `keepAlive` back to `true` first, so when the queued microtask runs it sees `keepAlive.current === true` and skips disposal — the machine survives. A genuine unmount has no following setup, so the microtask still sees `keepAlive.current === false` and disposes exactly once. This works because StrictMode's double-invoke is synchronous within the commit, so it always completes before the queued microtask fires.

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§14 Composition & Wiring](../../docs/architecture/14-composition-and-wiring.md#141-the-composition-root) — where `createViewModel` and `ViewModelProvider` get called
- [§15 Flows](../../docs/architecture/15-flows.md#151-control-flow-vs-imports-vs-data-flow) — the price-tick journey through `createViewModel.ts`
