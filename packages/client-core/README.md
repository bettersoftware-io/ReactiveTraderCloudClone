# @rtc/client-core

The framework-free application core: the composition root, presenters and
state machines, `WsAdapter` + `portFactory`. Built once by `createApp`, it is
shared verbatim by every client (web React, RN/Expo, and a future SolidJS
port).

| | |
|---|---|
| **Ring** | ③ Interface Adapters — presenters, gateways, ViewModel wiring (`docs/architecture/01-overview.md` §1.3.1) |
| **Runtime deps** | `@rtc/domain`, `@rtc/shared`, `rxjs`, `@rx-state/core` (`packages/client-core/package.json` `dependencies`) |
| **Consumed by** | `@rtc/react-bindings`, `@rtc/client-react`, `@rtc/client-react-native` |
| **Must never import** | React, DOM types, or React Native — despite being consumed by three UI-facing packages. There is no single named grep-gate for this rule (`docs/architecture/12-architectural-gates.md`'s 29 gates cover test-driver and dumb-UI boundaries, not this package by name); the boundary is enforced structurally: `package.json` lists no `react`/`react-dom`/`react-native` dependency, so pnpm's strict install would fail to resolve a stray import — the same single-dependency discipline `@rtc/domain` and `@rtc/ws-effects` use for `rxjs`. `docs/dependency-cruiser.md` (§"Scope note") confirms there is no dedicated dependency-cruiser pair rule for `client-core` yet, only the graph-wide `no-circular` check (`pnpm check:deps`). |

## Folder map

| Path | What lives here |
|---|---|
| `src/composition.ts` | The composition root — `createApp(ports)` builds every presenter/machine from an `AppPorts` object; `createMachineFactories(presenters)` builds the per-mount `MachineFactories` the ViewModel seam injects. |
| `src/presenters/` | ~40 presenters and state machines — the business logic layer. Presenters (`XPresenter.ts`) wrap a domain port/use case as an `Observable`-backed class; machines (`createXMachine.ts` factories, typed via `Machine<TState, TIntents>` in `machine.ts`) add intents + `dispose()` for per-mount UI state. |
| `src/adapters/` | The real-transport gateways: `WsAdapter`/`IWsAdapter` (WebSocket transport), `WsConnectionEventsAdapter` (connection lifecycle), and `portFactory.ts` (`createSimulatorPorts` / `createWsRealPorts`, the two `AppPorts` assembly functions every platform port-builder calls). |
| `src/layout/` | The replaceable layout seam — `LayoutPort`/`LayoutState`/`LayoutNode` types and `createDefaultLayoutPort`, the in-house split-tree engine's data shape. Deliberately app-layer, not `@rtc/domain` — layout is presentation infrastructure, not business domain. |
| `src/theme/` | `ColorSchemeSource`, the app-layer port over the OS `prefers-color-scheme` signal. |
| `src/wsUrl.ts` | `buildWsUrl` — appends the `?access=` token query param a browser WebSocket can't pass as a header. |
| `src/index.ts` | The public barrel — re-exports adapters, composition, layout, presenters, theme, and `wsUrl`. |

## Where to start reading

1. `src/composition.ts` — `createApp(ports: AppPorts): App` is the framework-free heart of both clients: a plain function, no DI container, that turns one `AppPorts` object into `{ presenters, ports, commands }` (`docs/architecture/14-composition-and-wiring.md` §14.1).
2. `src/adapters/portFactory.ts` — `AppPorts` (the interface every platform must satisfy) and its two production implementations, `createSimulatorPorts` and `createWsRealPorts`.
3. `src/adapters/WsAdapter.ts` + `src/adapters/IWsAdapter.ts` — the real-transport gateway: connection lifecycle, message routing, RPC correlation, and the pre-open `sendQueue` that prevents dropped subscriptions.
4. `src/presenters/machine.ts` — the `Machine<TState, TIntents>` / `MachineFactories` contracts every state machine and the React-bindings bridge agree on.

## How it's used

`createApp` is called once per app mount, from the composition-root component
(`packages/client-react/src/AppRoot.tsx:32-37`):

```ts
const { presenters, commands } = createApp(buildBrowserPorts());
viewModelRef.current = createViewModel(
  presenters,
  createMachineFactories(presenters),
  commands,
);
```

`buildBrowserPorts` (`packages/client-react/src/app/buildBrowserPorts.ts:1-13`)
is the platform port-builder that assembles the `AppPorts` object `createApp`
consumes, using this package's factories and adapters directly:

```ts
import {
  type AppPorts,
  buildWsUrl,
  createSimulatorPorts,
  createWsRealPorts,
  incident$,
  reconnect$,
  routeIdleLifecycle,
  WsAdapter,
  WsConnectionEventsAdapter,
} from "@rtc/client-core";
```

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§14 Composition & Wiring](../../docs/architecture/14-composition-and-wiring.md#14-composition--wiring) — the full `createApp` construction-order walkthrough and boot sequences for all three runtimes
- [§14.1 The Composition Root](../../docs/architecture/14-composition-and-wiring.md#141-the-composition-root)
