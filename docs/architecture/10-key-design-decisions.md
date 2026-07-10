## 10. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **RxJS `Observable<T>` at every boundary** | RxJS is the explicit dependency exception in `@rtc/domain`, chosen because (a) the team already uses RxJS in the client and server, (b) `defer` + operators give per-subscription state and UI-shaping cheaply, and (c) one stream type across ports / use cases / presenters removes the `AsyncIterable -> Observable` interop seam. The cost is binding the spine to RxJS; behavioural tests still validate behaviour after a hypothetical swap. |
| **Closure-in-`defer` for stateful pipes** | Use cases that need per-subscription state (`previousMid`, rolling buffer, ...) wrap the pipeline in `defer(() => { let state; return source$.pipe(...); })`. Each subscriber gets a fresh closure -- same isolation a function-scoped `let` gave the earlier `AsyncIterable` version. |
| **react-rxjs as the UI bridge** | Tiny library, easy to replicate for SolidJS/Svelte/etc. UI sees only hook contracts, never `Observable<T>`. |
| **No DI in the UI tree** | Composition Root constructs the graph at startup. UI imports already-bound hooks. No `ServiceProvider` Context. |
| **Use cases own enrichment, not hooks** | `detectMovement + calculateSpread` and similar live in `PriceStreamUseCase`, so a UI rewrite cannot lose them. |
| **Streaming-first data model** | Real-time financial data naturally flows as streams, not snapshots + polling. |
| **Simulators in the domain (not "mocks")** | Production code that stands in for an external venue. Same port interfaces; adapters are swapped at the Composition Root. |
| **WebSocket + RPC pattern** | Subscriptions for data, RPC with correlation IDs for commands -- clean separation, multiplexed over one connection. |
| **SoW markers** | Ensures consistent state after reconnect without full re-fetch. |
| **Pure domain with one dep (rxjs)** | Fully testable, portable; pnpm strict mode enforces that the only `dependencies` entry in `@rtc/domain/package.json` is `rxjs`. |
| **AbortController per subscription** | Graceful cleanup when WebSocket closes -- all active streams are cancelled. |
| **Behavioural specs in Gherkin** | One source of truth for expected behaviour, runnable from multiple test drivers. Survives driver and framework swaps. |
| **Don't abstract React or RxJS behind portability shims** | Wrapping them produces leaky facades; instead keep their layers thin and rely on behavioural tests to make regeneration cheap. |
| **React Compiler instead of manual memoization** | The compiler auto-memoizes at build time, so the UI carries no `useMemo`/`useCallback`. Its lint half (`eslint-plugin-react-hooks` `recommended-latest`, scoped to `src`) guards the Rules-of-React purity the compiler needs. One provisional exception: `react-hooks/refs` is scoped off for the two StrictMode build-once-ref seam files (`useMachine.ts`, `AppRoot.tsx`). Full rationale and the revisit note in [ADR-003](adr/ADR-003-react-compiler-and-manual-memoization.md). |
| **Application core extracted to `@rtc/client-core`** | The RN client forced the "could be promoted later" IOU: presenters, machines, WsAdapter, and port factories moved out of `client-react` into a framework-free package. The extraction cost nothing at the UI call sites because components only ever imported the hook bridge — the payoff of the original layering. |
| **One ViewModel seam, not per-service DI** ([ADR-004](adr/ADR-004-viewmodel-seam-and-feature-flags.md)) | A single flat `ViewModel` interface (~60 `use*` members) built once at each client's `AppRoot` and delivered through one context. Implemented by production code and two test harnesses; forbidden from carrying JSX. It is simultaneously the DI surface, the test seam, and the SolidJS-port contract. |
| **`@rx-state/core` in the core, `@react-rxjs/core` in the bindings** | react-rxjs is used *split into its two halves*: the framework-neutral `state()`/`StateObservable` primitive lives in `client-core` (machines can hold defaulted shareable state with no React), while `bind()` lives only in `react-bindings`. A Solid port pairs the same core half with new bindings. |
| **State machines as `Machine<TState, TIntents>`** | Per-component lifecycles (tile execution, order ticket, RFQ countdown, boot sequence) are framework-neutral objects `{ state$, intents, dispose }` bridged by `useMachine` — one per mount, StrictMode-safe deferred dispose. Keeps imperative choreography out of both the UI and the global stream graph. |
| **Declarative WS effects (`@rtc/ws-effects`)** | The server's dispatch is data-flow, not control-flow: 24 pure `(in$, ctx) => out$` transforms merged over one shared inbound stream, with four layers of error isolation. The framework is rxjs-only and domain-blind, so it is itself swappable — and marble-testable without a socket. |
| **Per-platform code = adapters only** | Adding a platform means a switch file (`buildNativePorts`), a preferences adapter, a color-scheme adapter, and dumb UI. Everything else is imported. This is the enforced definition of "thin client shell". |
| **RN charts precompute geometry in pure functions** | `react-native-svg` draws what vitest-tested pure helpers (`buildCandles`, `buildGauge`, ...) computed. The paint layer stays dumb and the math stays unit-testable without a device. |
| **Design prototypes are production-isolated** | `@rtc/client-prototype` (React port) and the standalone HTML artifact exist for design comprehension and fidelity comparison; neither may import `@rtc/*` runtime packages, so design iteration can never leak into the product graph. |

---

