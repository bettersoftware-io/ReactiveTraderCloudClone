# @rtc/client-adapters

The ports every application core consumes, and the factories that build them:
`WsAdapter`, `portFactory` (`createSimulatorPorts` / `createWsRealPorts`), the
auth adapters and the session and data-source stores. A client imports this
package statically, builds an `AppPorts` object from it, and hands that object
to whichever core it loaded.

No application core lives here. Until 2026-10-04 this package was named
`@rtc/client-core` and also held the RxJS core; that is now
[`@rtc/client-core-rxjs`](../client-core-rxjs/README.md), a sibling of
`@rtc/client-core-async` and `@rtc/client-core-effect` (ADR-006). See
[§22](../../docs/architecture/22-pluggable-application-core.md) and the guided
tour in [§23](../../docs/architecture/23-application-cores-explained.md).

| | |
|---|---|
| **Ring** | ③ Interface Adapters — gateways and port assembly (`docs/architecture/01-overview.md` §1.3.1) |
| **Runtime deps** | `@rtc/core-api` (types), `@rtc/core-logic`, `@rtc/domain`, `@rtc/shared`, `rxjs` (`packages/client-adapters/package.json` `dependencies`) |
| **Consumed by** | `@rtc/client-react`, `@rtc/client-solid`, `@rtc/client-react-native`, `tests`; and, as a devDependency for test adapters only, the three cores and both bindings |
| **Must never import** | An application core, a binding, a client, the server, or a framework. Two dependency-cruiser rules (`docs/dependency-cruiser.md`, `pnpm check:deps`): `client-adapters-stays-inner` allows only `core-api` / `core-logic` / `domain` / `shared`, and `client-adapters-framework-free` blocks `react` / `react-dom` / `react-native` / `solid-js`. |

## Folder map

| Path | What lives here |
|---|---|
| `src/adapters/` | The real-transport gateways: `WsAdapter` (WebSocket transport, implementing `@rtc/core-api`'s `IWsAdapter`), `WsConnectionEventsAdapter` (connection lifecycle), the Jarvis adapters, `HttpAuthAdapter` and `RoutingAuthPort`, the in-memory session and data-source stores, and `portFactory.ts` (`createSimulatorPorts` / `createWsRealPorts`, the two `AppPorts` assembly functions every platform port-builder calls). |
| `src/wsUrl.ts` | `buildWsUrl` — appends the `?access=` token query param a browser WebSocket can't pass as a header. |
| `src/index.ts` | The root barrel: everything above. It exports no name another package declares: a contract type is imported from `@rtc/core-api`, a shared rule from `@rtc/core-logic` (`tests/scripts/lib/packageSurfaces.test.ts`). |
| `src/testing.ts` | The `@rtc/client-adapters/testing` entry: test scaffolding for anything that composes a core over these adapters (`FakeWsAdapter`, `awaitPendingRpc`, `createFakeConnectionPorts`). Not part of the root barrel, because a client's source has no use for a fake. |

## Where to start reading

1. `src/adapters/portFactory.ts` — the two production implementations of `@rtc/core-api`'s `AppPorts`, `createSimulatorPorts` and `createWsRealPorts`.
2. `src/adapters/WsAdapter.ts` (its interface, `IWsAdapter`, is in `packages/core-api/src/adapters.ts`) — the real-transport gateway: connection lifecycle, message routing, RPC correlation, and the pre-open `sendQueue` that prevents dropped subscriptions.
3. `src/adapters/connectionIntents.ts` — `pairConnectionPorts`, which builds the `connectionEvents` / `connectionIntents` pair together.

## How it's used

A client's platform port-builder (`buildBrowserPorts` in
`packages/client-react/src/app/buildBrowserPorts.ts`) assembles the `AppPorts`
object, using this package's factories and adapters directly:

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
} from "@rtc/client-adapters";
```

The composition-root component (`AppRoot` in
`packages/client-react/src/AppRoot.tsx`) then hands those ports to the core the
visitor's choice resolved to. The web clients pick the core at load time
(`bootCore` in `packages/web-boot/src/bootApp.ts`: `?core=` URL
parameter, then the stored Preferences choice, then the `VITE_CORE_IMPL` build
default, then `rxjs`), so `AppRoot` receives the chosen `CoreFactory`:

```ts
const { presenters, commands } = core.createApp(buildBrowserPorts());
```

The ports are the same whichever core booted. That is the point of the split:
a core takes its ports as arguments and never imports this package from its
source (dependency-cruiser `cores-take-ports-as-arguments`).

`pairConnectionPorts(events$)` builds the `connectionEvents`/`connectionIntents`
pair together — `@rtc/core-api`'s `TransportPorts` omits both, so
`createSimulatorPorts`/`createWsRealPorts` supply neither, and a builder gets
them both from one call (`src/adapters/connectionIntents.ts`).

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [`@rtc/client-core-rxjs`](../client-core-rxjs/README.md) — the RxJS core these ports feed by default
- [§14 Composition & Wiring](../../docs/architecture/14-composition-and-wiring.md#14-composition--wiring) — the full `createApp` construction-order walkthrough and boot sequences for all three runtimes
- [§14.1 The Composition Root](../../docs/architecture/14-composition-and-wiring.md#141-the-composition-root)
