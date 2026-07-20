[◀ 10. Key Design Decisions](10-key-design-decisions.md) · [Architecture Document](../architecture.md) · [12. Architectural Gates ▶](12-architectural-gates.md)

## 11. Key Files Reference

| Area | Path | Description |
|------|------|-------------|
| **Domain Ports** | `packages/domain/src/ports/*.ts` | Port interfaces: the 8 classic transport ports + `ConnectionEventsPort` + equities (`MarketDataPort`, `OrderPort`, `PositionPort`) + admin/preferences/telemetry families |
| **FX Entities** | `packages/domain/src/fx/*.ts` | CurrencyPair, Price, Trade, Notional |
| **Credit Entities** | `packages/domain/src/credit/*.ts` | Instrument, Dealer, Rfq, Quote |
| **Connection** | `packages/domain/src/connection/*.ts` | ConnectionStatus state machine |
| **Use Cases** | `packages/domain/src/usecases/*.ts` | Application logic (12 use cases) |
| **Simulators** | `packages/domain/src/simulators/*.ts` | In-memory port impls (FX, credit, equities, telemetry) |
| **Shared DTOs** | `packages/shared/src/fx/*.ts`, `credit/*.ts` | Wire-format contracts |
| **Wire Protocol SoT** | `packages/shared/src/protocol/messages.ts` | `CLIENT_MSG` / `SERVER_MSG` constants for all 4 domains — single source for both ends |
| **Protocol Envelopes** | `packages/shared/src/protocol/{rpc,sow}.ts` | `RpcResponse` ack/nack; bulk + marker SoW envelopes |
| **Composition Root (core)** | `packages/client-core/src/composition.ts` | Framework-free `createApp(ports)` → `{ presenters, ports, commands }` + `createMachineFactories` |
| **Presenters & Machines** | `packages/client-core/src/presenters/*.ts` | ~40 RxJS presenters/machines; `machine.ts` defines `Machine<TState, TIntents>` |
| **Port Factory + Transport** | `packages/client-core/src/adapters/{portFactory,WsAdapter,WsConnectionEventsAdapter}.ts` | `createSimulatorPorts` / `createWsRealPorts`; the WebSocket transport |
| **ViewModel Bridge** | `packages/react-bindings/src/{createViewModel,useMachine,useViewModel,ViewModelProvider}.ts(x)` | The only React↔RxJS meeting point; `ViewModel` interface = the seam contract |
| **Web Composition Root** | `packages/client-react/src/AppRoot.tsx` + `src/app/buildBrowserPorts.ts` | `createApp(buildBrowserPorts())` + `createViewModel`, once per mount; `VITE_SERVER_URL` switch |
| **Web Platform Adapters** | `packages/client-react/src/app/adapters/*.ts`, `src/app/theme/*.ts` | LocalStorage preferences, browser connection events, matchMedia color scheme |
| **Web UI Components** | `packages/client-react/src/ui/{fx,credit,equities,admin,shell}/**/*.tsx` | React components grouped by trading domain (no rxjs — gates 26–29) |
| **RN Composition Root** | `packages/client-react-native/src/app/{AppRoot.tsx,buildNativePorts.ts}` | Same recipe with `EXPO_PUBLIC_SERVER_URL` + sim/live toggle |
| **RN Platform Adapters** | `packages/client-react-native/src/app/adapters/*.ts` | AsyncStorage preferences, Appearance color scheme |
| **RN UI + Routes** | `packages/client-react-native/{app,src/ui}/**` | expo-router tabs; screens with react-native-svg charts + `src/ui/theme/tokens.ts` |
| **WS Effects Framework** | `packages/ws-effects/src/{types,stream,rpc,combineEffects,createWsListener,operators}.ts` | `WsEffect` primitive + sugar; rxjs-only |
| **Motion Core** | `packages/motion-core/src/{flip,rankGlide,reducedMotion}.ts` | `flipDeltas`, `coalesceOrder`/`computeRankDirections`/`sameOrder`, easing/duration constants; zero runtime deps |
| **Server Entry** | `packages/server/src/index.ts` | node:http + `ws` + token auth (`auth.ts`); 4-line effect composition |
| **Server Effects** | `packages/server/src/effects/{fx,credit,admin,equities}.effects.ts` | The 24 effects |
| **Server Services** | `packages/server/src/services/{serviceContainer,ThroughputService}.ts` | `createServices()` — all 12 simulators/services |
| **Socket Adapter** | `packages/server/src/socket/toSocket.ts` | `ws.WebSocket` → transport-agnostic `Socket` |
| **Behavioural Specs** | `tests/specs/**/*.feature` | Gherkin scenarios, framework-free; SOT for behaviour |
| **Page Object Contracts** | `tests/browser/page-objects/contracts/**/*.ts` | Driver-free TS interfaces + `data-testid` constants; SOT for the UI surface |
| **Page Objects (Playwright)** | `tests/browser/page-objects/playwright/**/*.ts` | Playwright implementations of the contracts |
| **Page Objects (Cypress)** | `tests/browser/page-objects/cypress/**/*.ts` | Cypress implementations of the contracts |
| **Step Definitions** | `tests/browser/steps/**/*.ts` | Cucumber-JS step defs (shared tree for Cucumber+Playwright + Cucumber+Cypress); import only contracts |
| **Native Playwright Specs** | `tests/browser/playwright/*.spec.ts` | `@playwright/test` bodies binding scenarios directly; no Gherkin |
| **Native Playwright Harness** | `tests/browser/playwright/{playwright.config,_context,_openWorkspace}.ts` | `@playwright/test` config (Chromium, serial); fixture exposing `{ ctx }`; named Background helpers |
| **Native Cypress Specs** | `tests/browser/cypress/*.spec.ts` | Sync Mocha `it()` bodies binding cypress-forked scenarios; no Gherkin; no `async`/`await`/`cy.*`/`ctx.po.*` |
| **Native Cypress Harness** | `tests/browser/cypress/{cypress.config,_context,_openWorkspace}.ts` | Cypress config (no preprocessor); `getCtx()` accessor with module-scoped beforeEach builder; named Background helpers |
| **Cypress-forked Scenarios** | `tests/browser/cypress/scenarios/*.ts` (+ `_chainable.ts`) | Sync scenario fns mirroring shared `browser/scenarios/*.ts` 1:1 by name; queue-aware (use `chainable<T>` cast helper to expose Cypress Chainable under the shared `Promise<T>` PO contract); used by native Cypress only |
| **Test World + Hooks (Cucumber)** | `tests/browser/playwright-cucumber/{world,hooks}.ts` and `tests/browser/cypress-cucumber/{world,e2e}.ts` | Per-runner World, dev-server lifecycle, hooks |
| **Architectural Gates** | `tests/scripts/grep-gates.ts` | CI import-boundary enforcement (grep-based; 29 gates) |
| **Visual Golden Tier** | `packages/client-react/tests/ui/visual/{playwright,vitest-browser}/` (runners/config) + `packages/ui-contract/goldens/playwright/__screenshots__/` (the goldens themselves) | Sole CI-asserted screenshot runner (`playwright`) + the `vitest-browser` coverage-only instrument (pixel assert compiled out); dual golden sets (`react/` CI-canonical + `react-local/<arch>/`), generated only from `client-react`; ADR-001 lives with the runners |
| **UI Contract Tier** | `packages/client-react/tests/ui/contract/{specs,shared,react}/` | Framework-neutral sociable RTL specs + the thin React swap layer; ≥95% coverage gate |
| **Dependency Rules** | `.dependency-cruiser.cjs` | `no-circular`, `domain-stays-pure`, `client-not-server`, `ws-effects-stays-pure`, `motion-core-stays-pure`, ... (`pnpm check:deps`) |
| **Port Contract Describers** | `packages/domain/src/ports/__contracts__/<Port>Contract.ts` | Parameterised happy-path suites for all 8 transport ports; run against simulator + WsReal via `makeHarness()` |
| **Umbrella Scripts** | `tests/scripts/{with-server,run-all}.ts` | Dev-server lifecycle wrapper and ten-suite orchestration |

---

