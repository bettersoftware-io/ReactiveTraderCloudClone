# @rtc/client-core-rxjs

The RxJS application core: the default one of three implementations of the
`@rtc/core-api` contract, beside `@rtc/client-core-async` and
`@rtc/client-core-effect` (ADR-006). It holds the composition root, every
presenter and every state machine, and nothing else.

| | |
|---|---|
| **Ring** | ③ Interface Adapters — the application layer, on RxJS |
| **Runtime deps** | `@rtc/core-api` (types), `@rtc/core-logic`, `@rtc/domain`, `rxjs`, `@rx-state/core` (`@rtc/shared` is a devDependency, for two tests) |
| **Consumed by** | Both web clients, as a lazy chunk loaded only when chosen; `client-react-native`, statically; the bindings, `ui-contract` and `tests`, from their tests and harnesses |
| **Must never import** | Another core, the adapters (`@rtc/client-adapters`), a framework, a client or the server — `cores-stay-inner`, `cores-take-ports-as-arguments`, `cores-framework-free` |

## What lives here

| Path | What lives here |
|---|---|
| `src/index.ts` | The package's whole surface: `rxjsCore` (the `CoreFactory` a web client lazy-loads), the composition root, and every presenter class and machine factory, for tests and harnesses that construct one directly. |
| `src/composition.ts` | The composition root — `createApp(ports)` builds every presenter and machine from an `AppPorts` object; `createMachineFactories(presenters)` builds the per-mount `MachineFactories` the ViewModel seam injects. |
| `src/presenters/` | The presenters and state machines: RxJS shells over the rules in `@rtc/core-logic`. Presenters wrap a domain port or use case as an `Observable`-backed class; machines add intents and `dispose()` for per-mount UI state. |
| `src/layout/` | Two RxJS shells the composition root wires: the saved-layouts controller (`createLayoutPresets`) and the workspace persistence writer. |
| `src/ports/` | Two small RxJS helpers over ports: `withLoginDelay` and `readPreferenceNow`. |

## The rule that shapes it

A core takes its ports as arguments. `createApp(ports)` receives an `AppPorts`
object already built by the client (from `@rtc/client-adapters`'s
`createSimulatorPorts` / `createWsRealPorts`), so this package's source imports
nothing from the adapters. `@rtc/client-adapters` is a devDependency: only the
tests compose a real core over real adapters.

## How a client reaches it

A web client never imports this package statically. Its
`@rtc/web-boot`'s `coreSelection.ts` loads it with `import("@rtc/client-core-rxjs")`,
which is what lets the bundler put the whole core in one lazy chunk, like the
two alternative cores. `pnpm check:core-bundle` proves it on a real build, and
dependency-cruiser's `web-clients-load-cores-lazily` rejects a static import on
source.

See [ADR-006](../../docs/adr/ADR-006-pluggable-application-core.md) and
[§22](../../docs/architecture/22-pluggable-application-core.md).
