# @rtc/client-core

The framework-free application core: the composition root, presenters and
state machines, `WsAdapter` + `portFactory`. Built once by `createApp`, it is
shared verbatim by every client (web React, RN/Expo, and web Solid). It is the
RxJS core -- the default one of three implementations of the `@rtc/core-api`
contract (the others are `@rtc/client-core-async` and `@rtc/client-core-effect`);
see [§22](../../docs/architecture/22-pluggable-application-core.md) and the
guided tour in [§23](../../docs/architecture/23-application-cores-explained.md).

| | |
|---|---|
| **Ring** | ③ Interface Adapters — presenters, gateways, ViewModel wiring (`docs/architecture/01-overview.md` §1.3.1) |
| **Runtime deps** | `@rtc/core-api`, `@rtc/core-logic`, `@rtc/domain`, `@rtc/shared`, `rxjs`, `@rx-state/core` (`packages/client-core/package.json` `dependencies`) |
| **Consumed by** | `@rtc/react-bindings`, `@rtc/solid-bindings`, `@rtc/client-react`, `@rtc/client-solid`, `@rtc/client-react-native`, `@rtc/ui-contract` (and, as a test-adapter devDependency only, the two sibling cores) |
| **Must never import** | React, DOM types, or React Native — despite being consumed by three UI-facing clients. Enforced by two dependency-cruiser pair rules (`docs/dependency-cruiser.md`, `pnpm check:deps`): `client-core-stays-inner` blocks any import of `react-bindings` / `client-react` / `client-react-native` / `client-prototype` / `server`, and `client-core-framework-free` blocks a direct import of `react` / `react-dom` / `react-native` themselves. The same boundary is also enforced structurally: `package.json` lists no `react`/`react-dom`/`react-native` dependency, so pnpm's strict install would fail to resolve a stray import — the same single-dependency discipline `@rtc/domain` and `@rtc/ws-effects` use for `rxjs`. |

## Folder map

| Path | What lives here |
|---|---|
| `src/core.ts` | The `@rtc/client-core/core` subpath export — the whole RxJS core's public surface: `rxjsCore` (the `CoreFactory` the web clients lazy-load), the composition root, and every presenter class and machine factory. Web clients reach it only through `import()`; React Native, tests and harnesses import it statically. |
| `src/composition.ts` | The composition root — `createApp(ports)` builds every presenter/machine from an `AppPorts` object; `createMachineFactories(presenters)` builds the per-mount `MachineFactories` the ViewModel seam injects. |
| `src/presenters/` | The presenters and state machines — the business logic layer. Presenters (`XPresenter.ts`) wrap a domain port/use case as an `Observable`-backed class; machines (`createXMachine.ts` factories, typed via `Machine<TState, TIntents>` from `@rtc/core-api`, `packages/core-api/src/machine.ts`) add intents + `dispose()` for per-mount UI state. |
| `src/adapters/` | The real-transport gateways: `WsAdapter` (WebSocket transport, implementing `@rtc/core-api`'s `IWsAdapter`), `WsConnectionEventsAdapter` (connection lifecycle), and `portFactory.ts` (`createSimulatorPorts` / `createWsRealPorts`, the two `AppPorts` assembly functions every platform port-builder calls). |
| `src/admin/` | Pure admin view-model helpers (`kpisVm`, `latencyBuckets`, `throughputPaths`) the UI calls directly. |
| `src/blotter/` | Pure blotter column-sort and filter-state helpers. |
| `src/layout/` | The RxJS shell of the saved-layouts controller (`createLayoutPresets`), the workspace persistence writer, and three pure layout-tree helpers the UI calls directly (`lockedWidthPx`, `maximizeBoundaryPath`, `visibleRootOf`). The layout types (`LayoutPort`/`LayoutState`/`LayoutNode`) are in `@rtc/core-api`; the in-house split-tree rules (`createDefaultLayoutPort`, the reducer) are in `@rtc/core-logic`. |
| `src/wsUrl.ts` | `buildWsUrl` — appends the `?access=` token query param a browser WebSocket can't pass as a header. |
| `src/index.ts` | The root barrel — the **edge** a client imports statically: adapters, the admin and blotter helpers, layout and `wsUrl`. It exports no presenter class, machine factory or composition root (dependency-cruiser `client-core-root-is-the-edge`, `core.publicApi.test.ts`), and — like `src/core.ts` — no name another package declares: a contract type is imported from `@rtc/core-api`, a shared rule from `@rtc/core-logic` (`tests/scripts/lib/packageSurfaces.test.ts`). |

## Where to start reading

1. `src/composition.ts` — `createApp(ports: AppPorts): App` is the framework-free heart of both clients: a plain function, no DI container, that turns one `AppPorts` object into `{ presenters, ports, commands }` (`docs/architecture/14-composition-and-wiring.md` §14.1).
2. `src/adapters/portFactory.ts` — `AppPorts` (the interface every platform must satisfy) and its two production implementations, `createSimulatorPorts` and `createWsRealPorts`.
3. `src/adapters/WsAdapter.ts` (its interface, `IWsAdapter`, is in `packages/core-api/src/adapters.ts`) — the real-transport gateway: connection lifecycle, message routing, RPC correlation, and the pre-open `sendQueue` that prevents dropped subscriptions.
4. `packages/core-api/src/machine.ts` — the `Machine<TState, TIntents>` contract (with `MachineFactories` alongside it in `@rtc/core-api`) every state machine and the bindings bridges agree on.

## How it's used

`createApp` is called once per app mount, from the composition-root component
(`AppRoot` in `packages/client-react/src/AppRoot.tsx`). The web clients pick
the core at load time (`bootCore` in `packages/client-react/src/app/bootApp.ts`:
`?core=` URL parameter, then the stored Preferences choice, then the
`VITE_CORE_IMPL` build default, then `rxjs`), so `AppRoot` receives the chosen
`CoreFactory` and calls `core.createApp` -- for this package, that is
`createApp`:

```ts
const { presenters, commands } = core.createApp(buildBrowserPorts());
```

`buildBrowserPorts` (`packages/client-react/src/app/buildBrowserPorts.ts`)
is the platform port-builder that assembles the `AppPorts` object `createApp`
consumes, using this package's factories and adapters directly:

```ts
import type { AppPorts } from "@rtc/core-api";
import {
  buildWsUrl,
  createSimulatorPorts,
  createWsRealPorts,
  pairConnectionPorts,
  routeIdleLifecycle,
  WsAdapter,
  WsConnectionEventsAdapter,
} from "@rtc/client-core";
```

`pairConnectionPorts(events$)` builds the `connectionEvents`/`connectionIntents`
pair together — `@rtc/core-api`'s `TransportPorts` omits both, so
`createSimulatorPorts`/`createWsRealPorts` supply neither, and a builder gets
them both from one call (`src/adapters/connectionIntents.ts`).

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§14 Composition & Wiring](../../docs/architecture/14-composition-and-wiring.md#14-composition--wiring) — the full `createApp` construction-order walkthrough and boot sequences for all three runtimes
- [§14.1 The Composition Root](../../docs/architecture/14-composition-and-wiring.md#141-the-composition-root)
