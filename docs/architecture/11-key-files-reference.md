[◀ 10. Key Design Decisions](10-key-design-decisions.md) · [Architecture Document](../architecture.md) · [12. Architectural Gates ▶](12-architectural-gates.md)

## 11. Key Files Reference

| Area | Path | Description |
|------|------|-------------|
| **Domain Ports** | `packages/domain/src/ports/*.ts` | Port interfaces: the 8 classic transport ports + `ConnectionEventsPort` + equities (`MarketDataPort`, `OrderPort`, `PositionPort`) + admin/preferences/telemetry families |
| **FX Entities** | `packages/domain/src/fx/*.ts` | CurrencyPair, Price, Trade, Notional |
| **Credit Entities** | `packages/domain/src/credit/*.ts` | Instrument, Dealer, Rfq, Quote |
| **Connection** | `packages/domain/src/connection/*.ts` | ConnectionStatus state machine |
| **Use Cases** | `packages/domain/src/usecases/*.ts` | Application logic (one class per use case) |
| **Simulators** | `packages/domain/src/simulators/*.ts` | In-memory port impls (FX, credit, equities, telemetry) |
| **Shared DTOs** | `packages/shared/src/fx/*.ts`, `credit/*.ts` | Wire-format contracts |
| **Wire Protocol SoT** | `packages/shared/src/protocol/messages.ts` | `CLIENT_MSG` / `SERVER_MSG` constants for all 4 domains — single source for both ends |
| **Protocol Envelopes** | `packages/shared/src/protocol/{rpc,sow}.ts` | `RpcResponse` ack/nack; bulk + marker SoW envelopes |
| **Core Contract (types only)** | `packages/core-api/src/{app,machine,stream}.ts` | `Presenters` / `AppCommands` / `AppPorts` / `App` / `CoreFactory` (`app.ts`), `Machine<TState, TIntents>` + `MachineFactories` (`machine.ts`), `Stream` / `StateStream` (`stream.ts`); exports no runtime value (gate 42) |
| **Shared Core Rules** | `packages/core-logic/src/{presenters,layout,adapters}/` | Stream-free folds, view derivations, workspace + Jarvis controllers, `createAuthDeps` -- imported by all three cores |
| **Composition Root (core)** | `packages/client-core/src/composition.ts` | Framework-free `createApp(ports)` → `{ presenters, ports, commands }` + `createMachineFactories` (the default, RxJS core) |
| **Presenters & Machines** | `packages/client-core/src/presenters/*.ts` | The RxJS core's presenters and machine factories (the member list is `core-api`'s `Presenters` / `MachineFactories`) |
| **Async Core** | `packages/client-core-async/src/{composition,kernel/,bridge/}` | `async`/`await` + `AsyncIterable` core: `Store`/`Topic`/`spawn`/`sleep`/`createRunSlot` kernel; `bridge/` is the only place rxjs is a value import |
| **Effect Core** | `packages/client-core-effect/src/{composition,layers,bridge/}` | Effect-TS core: `Layer` graph over a `ManagedRuntime`; `bridge/` owns the rxjs ↔ `Stream`/`SubscriptionRef` translation |
| **Core Equivalence Tier** | `packages/core-contract/src/{registry,suites/,harness/}` | `CONTRACT_SUITES` (one suite per member) + `PENDING_SUITES` drift check, scripted-`AppPorts` harness; each core runs it from its own test file (e.g. `client-core/src/composition.coreContract.test.ts`) |
| **Core Selection (web)** | `packages/client-react/src/app/{coreSelection,bootApp}.ts` (+ the same pair in `client-solid`) | `?core=` → stored preference → `VITE_CORE_IMPL` → rxjs; lazy-loads the chosen `CoreFactory` before `AppRoot` mounts |
| **Port Factory + Transport** | `packages/client-core/src/adapters/{portFactory,WsAdapter,WsConnectionEventsAdapter}.ts` | `createSimulatorPorts` / `createWsRealPorts`; the WebSocket transport |
| **ViewModel Bridge** | `packages/react-bindings/src/{createViewModel,useMachine,useViewModel,ViewModelProvider}.ts(x)` | The only React↔RxJS meeting point; `ViewModel` interface = the seam contract |
| **Solid ViewModel Bridge** | `packages/solid-bindings/src/{createViewModel,useMachine,toSignal,ViewModelProvider}.ts(x)` | The same `ViewModel` member list over Solid signals; `toSignal` is the stream → signal seam |
| **Web Composition Root** | `packages/client-react/src/AppRoot.tsx` + `src/app/buildBrowserPorts.ts` | `core.createApp(buildBrowserPorts())` + `createViewModel`, once per mount; `VITE_SERVER_URL` switch |
| **Web Platform Adapters** | `packages/client-react/src/app/adapters/*.ts`, `src/app/theme/*.ts` | LocalStorage preferences, browser connection events, matchMedia color scheme |
| **Web UI Components** | `packages/client-react/src/ui/{fx,credit,equities,admin,shell}/**/*.tsx` | React components grouped by trading domain (no rxjs — gates 26–29) |
| **Solid Web Client** | `packages/client-solid/src/{main.tsx,AppRoot.tsx,app/,ui/}` | Same composition recipe as `client-react` over `solid-bindings`; UI at full parity (no rxjs in `src/ui` — gates 34–37) |
| **RN Composition Root** | `packages/client-react-native/src/app/{AppRoot.tsx,buildNativePorts.ts}` | Same recipe with `EXPO_PUBLIC_SERVER_URL` + sim/live toggle |
| **RN Platform Adapters** | `packages/client-react-native/src/app/adapters/*.ts` | AsyncStorage preferences, Appearance color scheme |
| **RN UI + Routes** | `packages/client-react-native/{app,src/ui}/**` | expo-router tabs; screens with react-native-svg charts + `src/ui/theme/tokens.ts` |
| **WS Effects Framework** | `packages/ws-effects/src/{types,stream,rpc,combineEffects,createWsListener,operators}.ts` | `WsEffect` primitive + sugar; rxjs-only |
| **Motion Core** | `packages/motion-core/src/{flip,rankGlide,reducedMotion}.ts` | `flipDeltas`, `coalesceOrder`/`computeRankDirections`/`sameOrder`, easing/duration constants; zero runtime deps |
| **Boot Splash** | `packages/boot-splash/src/{bootCanvas,bootSplashGate}.ts` + `variants/` | Canvas boot-scene engine + reduced-motion/webdriver gate; each web client adds its own `BootSequence`/`BootGate` shell |
| **Dockview Layout Engine** | `packages/layout-dockview/src/createDockEngine.ts` (+ `styles/`) | `createDockEngine` over `dockview` (the default `LayoutEngine`, ADR-002); each web client bridges it via `ui/shell/layout/dockview/DockviewLayoutEngine.tsx` |
| **Jarvis Desk Tools** | `packages/agent-tools/src/{buildJarvisTools,jarvisToolDefinition}.ts` | The seven tools as JSON Schema + `run()`; SDK-free, consumed by the server's agent loop and `/mcp` |
| **Server Entry** | `packages/server/src/index.ts` | node:http (`/health`, `/login`, `/mcp`) + `ws` + token auth (`src/auth/`); a few lines of effect composition |
| **Server Auth + Login** | `packages/server/src/auth/` (`AuthService`, `token`, `rateLimit`, `loadUsers`), `src/http/loginHandler.ts` | Token issue/verify, rate limiting, `AUTH_USERS` parsing; the `/login` handler |
| **Server Effects** | `packages/server/src/effects/*.effects.ts` + `index.ts` | FX, Credit, Admin, Equities and Jarvis effects, assembled by `buildEffects(loops)` |
| **Server Agent + MCP** | `packages/server/src/agent/`, `src/mcp/` | Scripted and Anthropic agent loops (`@anthropic-ai/sdk` confined here); the `/mcp` Streamable-HTTP endpoint over `@rtc/agent-tools` |
| **Server Services** | `packages/server/src/services/{serviceContainer,ThroughputService}.ts` | `createServices()` — the `ServiceContainer` of simulators and services |
| **Socket Adapter** | `packages/server/src/socket/toSocket.ts` | `ws.WebSocket` → transport-agnostic `Socket` |
| **Behavioural Specs** | `tests/specs/**/*.feature` | Gherkin scenarios, framework-free; SOT for behaviour |
| **Page Object Contracts** | `tests/browser/page-objects/contracts/**/*.ts` | Driver-free TS interfaces + `data-testid` constants; SOT for the UI surface |
| **Page Objects (Playwright)** | `tests/browser/page-objects/playwright/**/*.ts` | Playwright implementations of the contracts |
| **Step Definitions** | `tests/browser/steps/**/*.ts` | Cucumber-JS step defs (Cucumber+Playwright); import only contracts |
| **Native Playwright Specs** | `tests/browser/playwright/*.spec.ts` | `@playwright/test` bodies binding scenarios directly; no Gherkin |
| **Native Playwright Harness** | `tests/browser/playwright/{playwright.config,_context,_openWorkspace}.ts` | `@playwright/test` config (Chromium, serial); fixture exposing `{ ctx }`; named Background helpers |
| **Test World + Hooks (Cucumber)** | `tests/browser/playwright-cucumber/{world,hooks}.ts` | Per-runner World, dev-server lifecycle, hooks |
| **Architectural Gates** | `tests/scripts/grep-gates.ts` | CI import-boundary enforcement (grep-based; 42 active gates, numbered to 46 — gates 12–14 retired with Cypress, gate 24 retired with the quickpickle presenter peer (2026-07-20)) |
| **Visual Golden Tier** | `packages/client-react/tests/ui/visual/{playwright,vitest-browser}/` (runners/config) + `packages/ui-contract/goldens/playwright/__screenshots__/` (the goldens themselves) | Sole CI-asserted screenshot runner (`playwright`) + the `vitest-browser` coverage-only instrument (pixel assert compiled out); dual golden sets (`react/` CI-canonical + `react-local/<arch>/`), generated only from `client-react`; ADR-001 lives with the runners |
| **UI Contract Tier** | `packages/ui-contract/src/{specs,shared}/` + per-client runners `packages/client-react/tests/ui/contract/react/`, `packages/client-solid/tests/ui/contract/solid/` | Framework-neutral sociable RTL specs + shared harness; each client supplies only its thin swap layer; ≥95% coverage gate per client |
| **Dependency Rules** | `.dependency-cruiser.cjs` | About forty named rules -- `no-circular`, `domain-stays-pure`, `client-not-server`, `core-api-stays-inner`, `bridge-owns-rxjs`, ... (`pnpm check:deps`) |
| **DevTools** | `packages/devtools-core/src/{DevtoolsHub,protocol}.ts` + `instrument/`; `packages/devtools-app/src/InspectorApp.tsx`; `packages/devtools-extension/src/{background,contentBridge,ChromeRuntimeDuplex}.ts`; `packages/devtools-relay/src/relayServer.ts` | Hub + composition-root decorators; the inspector SPA (`/devtools/`); the MV3 extension transport; the RN relay ([§20](20-devtools.md)) |
| **Port Contract Describers** | `packages/domain/src/ports/__contracts__/<Port>Contract.ts` | Parameterised happy-path suites for all 8 transport ports; run against simulator + WsReal via `makeHarness()` |
| **Umbrella Scripts** | `tests/scripts/{with-server,run-all}.ts` | Dev-server lifecycle wrapper and the parallel e2e suite orchestration (seven suites) |

---

