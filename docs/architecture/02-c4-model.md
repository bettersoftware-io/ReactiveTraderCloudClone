[◀ 1. Overview](01-overview.md) · [Architecture Document](../architecture.md) · [3. UML Class Diagrams ▶](03-uml-class-diagrams.md)

## 2. C4 Model

### 2.1 System Context Diagram

Shows the system boundary and external actors interacting with Reactive Trader Cloud.

```mermaid
C4Context
    title System Context Diagram - Reactive Trader Cloud

    Person(trader, "Trader", "FX and Credit trader executing trades and monitoring positions")
    Person(admin, "Admin", "Operations staff managing throughput and system health")

    System(rtc, "Reactive Trader Cloud", "Real-time FX trading and Credit RFQ platform with live pricing, trade execution, and analytics")

    System_Ext(market, "Market Data Feed", "External price feed providing FX spot rates")
    System_Ext(oms, "Order Management System", "Downstream trade booking and settlement")

    Rel(trader, rtc, "Views live prices, executes trades, manages RFQs", "WebSocket / Browser")
    Rel(admin, rtc, "Monitors health, adjusts throughput", "HTTP / Browser")
    Rel(market, rtc, "Publishes FX spot rates", "Streaming")
    Rel(rtc, oms, "Sends executed trades", "Async")

    UpdateElementStyle(trader, $bgColor="#30363d", $fontColor="#ffffff", $borderColor="#8b949e")
    UpdateElementStyle(admin, $bgColor="#30363d", $fontColor="#ffffff", $borderColor="#8b949e")
    UpdateElementStyle(rtc, $bgColor="#238636", $fontColor="#ffffff", $borderColor="#56d364")
    UpdateElementStyle(market, $bgColor="#1f2d3d", $fontColor="#e6edf3", $borderColor="#4493f8")
    UpdateElementStyle(oms, $bgColor="#1f2d3d", $fontColor="#e6edf3", $borderColor="#4493f8")
    UpdateRelStyle(trader, rtc, $textColor="#6e7fa3", $lineColor="#6e7fa3")
    UpdateRelStyle(admin, rtc, $textColor="#6e7fa3", $lineColor="#6e7fa3")
    UpdateRelStyle(market, rtc, $textColor="#6e7fa3", $lineColor="#6e7fa3")
    UpdateRelStyle(rtc, oms, $textColor="#6e7fa3", $lineColor="#6e7fa3")
```

> **Diagram theming note.** GitHub serves one SVG to readers on both light and dark themes, and Mermaid's default C4 palette (pale fills, faint gray arrows) is nearly invisible on the dark one. All §2 diagrams therefore use self-contained colors that contrast on both backgrounds, with one consistent scheme: **blue = UI**, **purple = bindings bridge**, **green = application core / the system**, **amber = server & effects framework**, **slate = domain & shared contracts**, **gray = actors/external**, **slate-gray = standalone leaves** (`@rtc/motion-core`, `@rtc/boot-splash`, `@rtc/layout-dockview`).

### 2.2 Container Diagram

Containers are described by **role first, current technology second**. The roles are the contract; the technology is replaceable.

```mermaid
flowchart TB
    trader(["Trader — FX / Credit / Equities"]):::actor

    subgraph rtc["Reactive Trader Cloud"]
        webClient["<b>Web Client</b><br/>@rtc/client-react · React 19 + Vite + CSS Modules<br/>dumb UI + browser adapters · deployed to Vercel"]:::ui
        rnClient["<b>Mobile Client</b><br/>@rtc/client-react-native · Expo SDK 57 / RN 0.86<br/>dumb UI + native adapters · EAS internal"]:::ui
        solidClient["<b>Solid Web Client</b><br/>@rtc/client-solid · SolidJS + Vite + CSS Modules<br/>dumb UI + browser adapters · full parity w/ Web Client"]:::ui
        bindings["<b>React Bindings</b><br/>@rtc/react-bindings · react-rxjs<br/>createViewModel / useMachine / ViewModelProvider"]:::bridge
        solidBindings["<b>Solid Bindings</b><br/>@rtc/solid-bindings · @rx-state/core → signal<br/>createViewModel / useMachine / ViewModelProvider"]:::bridge
        core["<b>Application Cores ×3</b><br/>@rtc/client-core-rxjs (RxJS, default) ·<br/>@rtc/client-core-async · @rtc/client-core-effect<br/>(each a lazy chunk)<br/>composition root · presenters · machines<br/>ports built by @rtc/client-adapters"]:::core
        coreApi["<b>Core Contract</b><br/>@rtc/core-api · types only<br/>Presenters · MachineFactories · AppCommands · CoreFactory"]:::domain
        coreLogic["<b>Shared Core Rules</b><br/>@rtc/core-logic · no stream library<br/>pure folds · view derivations · workspace + Jarvis controllers"]:::core
        server["<b>WebSocket Server</b><br/>@rtc/server · Node.js + ws<br/>effects assembled by buildEffects(loops) · /login · /mcp<br/>Anthropic agent loop · deployed to Fly.io"]:::server
        wsEffects["<b>WS Effects Framework</b><br/>@rtc/ws-effects · rxjs only<br/>WsEffect · stream()/rpc() · combineEffects"]:::server
        agentTools["<b>Jarvis Desk Tools</b><br/>@rtc/agent-tools · domain + rxjs only<br/>seven tools as JSON Schema + run()"]:::server
        domain["<b>Domain Library</b><br/>@rtc/domain · pure TS + rxjs<br/>entities · use cases · ports · simulators"]:::domain
        shared["<b>Shared Contracts</b><br/>@rtc/shared<br/>DTOs · CLIENT_MSG / SERVER_MSG"]:::domain
        motionCore["<b>Motion Core</b><br/>@rtc/motion-core · pure TS, zero deps<br/>FLIP deltas · rank-glide coalescing · easing"]:::leaf
        viewLeaves["<b>Web View Leaves</b><br/>@rtc/boot-splash (canvas boot scenes) ·<br/>@rtc/layout-dockview (Dockview wrapper, default layout engine)"]:::leaf
    end

    trader -->|"HTTPS / Browser"| webClient
    trader -->|"iOS / Android"| rnClient
    trader -->|"HTTPS / Browser"| solidClient
    webClient -->|"renders through ViewModel"| bindings
    rnClient -->|"renders through ViewModel"| bindings
    solidClient -->|"renders through ViewModel"| solidBindings
    webClient -->|"view-layer motion math"| motionCore
    solidClient -->|"view-layer motion math"| motionCore
    webClient -->|"boot scenes · dock engine"| viewLeaves
    solidClient -->|"boot scenes · dock engine"| viewLeaves
    webClient -->|"loads one CoreFactory"| core
    solidClient -->|"loads one CoreFactory"| core
    bindings -->|"binds presenters & machines"| core
    solidBindings -->|"binds presenters & machines"| core
    core -->|"implements"| coreApi
    core --> coreLogic
    coreLogic --> coreApi
    core --> domain
    core -->|"through the adapters"| shared
    core -. WebSocket JSON .-> server
    server -->|"composes effects"| wsEffects
    server -->|"Jarvis tools · /mcp"| agentTools
    server -->|"hosts simulators"| domain
    server --> shared
    agentTools --> domain
    shared --> domain

    classDef actor  fill:#30363d,stroke:#8b949e,color:#ffffff
    classDef ui     fill:#1f6feb,stroke:#79c0ff,color:#ffffff
    classDef bridge fill:#8957e5,stroke:#d2a8ff,color:#ffffff
    classDef core   fill:#238636,stroke:#56d364,color:#ffffff
    classDef server fill:#9e6a03,stroke:#e3b341,color:#ffffff
    classDef domain fill:#1f2d3d,stroke:#4493f8,color:#e6edf3
    classDef leaf   fill:#607d8b,stroke:#8b949e,color:#ffffff
    style rtc fill:transparent,stroke:#6e7681
    linkStyle default stroke:#6e7fa3,stroke-width:1.5px
```

#### 2.2.1 Test and tooling containers

Six more packages test or inspect the containers above. Five of them ship no production code into a client bundle; `@rtc/devtools-core` ships only its composition-root decorators and hub, which stay dormant until an inspector attaches. They are drawn apart so the main diagram stays readable.

```mermaid
flowchart TB
    dev(["Developer"]):::actor

    subgraph tooling["Test and tooling containers"]
        uiContract["<b>UI Contract</b><br/>@rtc/ui-contract · devDependency of both web clients<br/>shared contract specs · visual scenario matrix · goldens"]:::leaf
        coreContract["<b>Core Contract Tier</b><br/>@rtc/core-contract · devDependency of all three cores<br/>one suite per member · scripted AppPorts harness"]:::leaf
        devtoolsCore["<b>Devtools Core</b><br/>@rtc/devtools-core · rxjs only<br/>protocol · DevtoolsHub · instrument* decorators"]:::leaf
        devtoolsApp["<b>Devtools Inspector</b><br/>@rtc/devtools-app · React SPA<br/>served same-origin at /devtools/"]:::leaf
        devtoolsExt["<b>Devtools Extension</b><br/>@rtc/devtools-extension · MV3 Chrome panel<br/>mounts the same InspectorApp"]:::leaf
        devtoolsRelay["<b>Devtools Relay</b><br/>@rtc/devtools-relay · ws only<br/>browser inspector ↔ React Native app"]:::leaf
    end

    clients["<b>Clients</b> (§2.2)"]:::ui
    cores["<b>Application Cores ×3</b> (§2.2)"]:::core

    dev --> devtoolsApp
    dev --> devtoolsExt
    uiContract -->|"specs mount against"| clients
    coreContract -->|"witnesses"| cores
    clients -->|"instrumented by"| devtoolsCore
    devtoolsApp --> devtoolsCore
    devtoolsExt --> devtoolsApp
    devtoolsRelay -. "relays frames (RN)" .-> devtoolsApp

    classDef actor  fill:#30363d,stroke:#8b949e,color:#ffffff
    classDef ui     fill:#1f6feb,stroke:#79c0ff,color:#ffffff
    classDef core   fill:#238636,stroke:#56d364,color:#ffffff
    classDef leaf   fill:#607d8b,stroke:#8b949e,color:#ffffff
    style tooling fill:transparent,stroke:#6e7681
    linkStyle default stroke:#6e7fa3,stroke-width:1.5px
```

Full detail: [§21](21-cross-framework-testing.md) (UI contract), [§22](22-pluggable-application-core.md#the-contract-tier) (core contract), [§20](20-devtools.md#20-rtc-devtools) (devtools).

Two further packages exist **outside** the production dependency graph, as design-comprehension artifacts (see [§8.1](08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port) for how they relate to the fidelity workstream):

| Package | What it is | Runtime deps |
|---|---|---|
| `@rtc/client-prototype` | A readable React 19 re-implementation of the `docs/design/web/v2` standalone design prototype. Mock data via seeded random walks; no domain, no rxjs. `pnpm dev:proto` → port 5273. | `react`, `react-dom` only |
| `docs/design/web/v5/standalone/` | Not a package -- a single self-contained ~14 MB HTML file (the canonical web design artifact, superseding `docs/design/web/v4/standalone/`; v5 base64-embeds boot audio + intro video, hence the size, and is Git LFS-tracked). Served by `scripts/serve-design.mts` (`pnpm dev:design:web` → port 8899). | none |
| `docs/design/mobile/v1/standalone/` | Not a package -- the self-contained mobile design prototype (the React Native UI/UX overhaul mockup). Served by `pnpm dev:design:mobile` → port 8899. | none |

### 2.3 Component Diagram -- Web Client

The web client is now three packages deep. The **Application Core** (`@rtc/client-core-rxjs`, the default of the three interchangeable cores -- [§22](22-pluggable-application-core.md#22-pluggable-application-core)) is plain TypeScript + RxJS -- no React imports anywhere. The **Bindings** (`@rtc/react-bindings`) turn core streams into hooks. What remains in `@rtc/client-react` is only the dumb UI plus the browser-specific leaves. Replacing React means rewriting the last package; core and bindings-contract are untouched.

```mermaid
flowchart TB
    subgraph uiLayer["@rtc/client-react — React, dumb"]
        app["<b>App Shell</b><br/>workspace layout engine · header ·<br/>boot gate · lock screen · ambient background"]:::ui
        fxTiles["<b>FX</b><br/>tiles · blotter ·<br/>analytics · positions"]:::ui
        creditRfq["<b>Credit RFQ</b><br/>form · RFQ tiles ·<br/>sell-side panel"]:::ui
        equities["<b>Equities Dock</b><br/>watchlist · candles · depth ·<br/>ticket · blotters"]:::ui
        admin["<b>Admin / Telemetry</b><br/>KPIs · throughput · latency ·<br/>topology · event log"]:::ui
        coreHost["<b>main.tsx + core host</b><br/>buildBrowserPorts() once per page ·<br/>core.createApp(ports) per composition (swaps in place)"]:::ui
        appRoot["<b>AppRoot</b><br/>createViewModel(composition)<br/>once per mount (StrictMode-safe)"]:::ui
        browserAdapters["<b>Browser Platform Adapters</b><br/>buildBrowserPorts (VITE_SERVER_URL switch) ·<br/>LocalStorage prefs · matchMedia color scheme"]:::ui
        app --> fxTiles
        app --> creditRfq
        app --> equities
        app --> admin
    end

    subgraph bindingsLayer["@rtc/react-bindings — the bridge"]
        viewModel["<b>ViewModel</b><br/>~60 use* hooks — bind() for shared streams ·<br/>useMachine per mount · firstValueFrom for commands<br/>ViewModelProvider + useViewModel()"]:::bridge
    end

    subgraph coreLayer["@rtc/client-core-rxjs + @rtc/client-adapters — vanilla TS + RxJS"]
        composition["<b>createApp / createMachineFactories</b><br/>wires ports → presenters → commands"]:::core
        presenters["<b>Presenters & State Machines</b><br/>every core-api member (Presenters · MachineFactories · AppCommands):<br/>price$ · trades$ · rfqs$ · watchlist ·<br/>order ticket · boot · layout · theme · telemetry"]:::core
        portFactory["<b>portFactory</b><br/>createSimulatorPorts / createWsRealPorts"]:::core
        wsAdapter["<b>WsAdapter</b><br/>send · rpc w/ correlation IDs · reconnect"]:::core
        composition --> presenters
        composition --> portFactory
        portFactory -->|"WS mode"| wsAdapter
    end

    server["<b>WebSocket Server</b><br/>Node.js + @rtc/ws-effects"]:::server

    fxTiles & creditRfq & equities & admin -->|"useViewModel()"| viewModel
    coreHost --> browserAdapters
    coreHost -->|"createApp(ports)"| composition
    coreHost -->|"mounts with the composition"| appRoot
    appRoot -->|"ViewModelProvider"| viewModel
    viewModel -->|"subscribes streams / machines"| presenters
    wsAdapter -. WebSocket JSON .-> server

    classDef ui     fill:#1f6feb,stroke:#79c0ff,color:#ffffff
    classDef bridge fill:#8957e5,stroke:#d2a8ff,color:#ffffff
    classDef core   fill:#238636,stroke:#56d364,color:#ffffff
    classDef server fill:#9e6a03,stroke:#e3b341,color:#ffffff
    style uiLayer fill:transparent,stroke:#6e7681
    style bindingsLayer fill:transparent,stroke:#6e7681
    style coreLayer fill:transparent,stroke:#6e7681
    linkStyle default stroke:#6e7fa3,stroke-width:1.5px
```

**Key boundary**: anything inside `@rtc/client-core-rxjs` may use RxJS freely. Anything in `src/ui` must not import `rxjs`, `@react-rxjs`, or `@rx-state` and must not see `Observable<T>` -- machine-enforced by grep gate 26 (plus gates 27--29 banning `localStorage`, `fetch`/`import.meta.env`, and timers in the UI). The bindings package is the only place that bridges the two worlds, and it is small (see `wc -l` over its non-test `src/` files) precisely so a `@rtc/solid-bindings` sibling can be written in about a day.

#### 2.3.1 The shape of the simplicity

The web client is three moving parts, and only one of them contains logic.

**All business logic lives in presenters, which are pure RxJS -- no React at all.** A presenter is a plain class exposing `Observable<T>` streams (`price$`, `status$`, `trades$`, ...). It has never heard of a component, a render, or a hook. Because the stream is the source of truth, **the presenter decides *when* and *at what granularity* React re-renders** -- a tick pushed into `price$(EURUSD)` re-renders exactly the tiles subscribed to that symbol and nothing else. React is not the thing orchestrating updates; it is downstream of the streams, repainting on demand. There is no `useMemo`, no `useCallback`, no dependency-array bookkeeping (manual memoization is additionally banned by [ADR-003](../adr/ADR-003-react-compiler-and-manual-memoization.md) -- React Compiler covers what little remains), because React's re-render model isn't driving anything -- the RxJS graph is.

**The components are dumb on purpose: declarative TSX, almost no imperative code, and -- below the one `useViewModel()` call -- no further abstraction.** A leaf like `SpreadDisplay` is props-in / TSX-out with zero hooks. A container like `Tile` calls `useViewModel()` once, reads the granular hooks it needs, and renders. There is nothing to memoize because there is no derived state to cache -- the presenter already did the work upstream.

**The UI is fully decoupled from the wiring by a deliberate provider/context split.** Components depend only on `useViewModel()` and the `ViewModel` *type*. They never import `createViewModel` (the concrete factory) or `ViewModelProvider` (the injector) -- those are imported by exactly one file, `AppRoot`. So the entire concrete graph (which presenters, simulator vs. live transport, the react-rxjs `bind` calls) is invisible at every call site.

```mermaid
flowchart TB
    subgraph core["@rtc/client-core-rxjs — pure RxJS, zero React"]
        direction TB
        port["PricingPort<br/>simulator or WebSocket"]:::domain
        uc["PriceStreamUseCase<br/>enrich · detectMovement · spread"]:::domain
        pres["PriceStreamPresenter<br/>price$(pair) — one multicast stream per symbol"]:::coreN
        port --> uc --> pres
    end

    subgraph seam["@rtc/react-bindings — the only React ↔ RxJS meeting point"]
        vm["createViewModel(…)<br/>usePrice = bind(pair → price$(pair))"]:::bridge
    end

    subgraph ui["@rtc/client-react — dumb UI (no rxjs, gate 26)"]
        direction TB
        tile["Tile(pair)<br/>const price = usePrice(pair)"]:::uiN
        leaf["TilePrice · SpreadDisplay<br/>props in → TSX out · no hooks"]:::uiN
        tile --> leaf
    end

    root["AppRoot — createViewModel(…) once"]:::rootN
    provider["ViewModelProvider<br/>imported ONLY by AppRoot"]:::split
    ctx["ViewModelContext<br/>useViewModel() reads it"]:::split

    pres -- "price$ emits a tick" --> vm
    vm -- "re-renders ONLY tiles that<br/>called usePrice(pair)" --> tile
    root --> provider --> ctx -. "the seam the UI depends on" .- tile

    classDef domain fill:#1f2d3d,stroke:#4493f8,color:#e6edf3
    classDef coreN  fill:#238636,stroke:#56d364,color:#ffffff
    classDef bridge fill:#8957e5,stroke:#d2a8ff,color:#ffffff
    classDef uiN    fill:#1f6feb,stroke:#79c0ff,color:#ffffff
    classDef rootN  fill:#9e6a03,stroke:#e3b341,color:#ffffff
    classDef split  fill:#30363d,stroke:#8b949e,color:#ffffff
    style core fill:transparent,stroke:#6e7681
    style seam fill:transparent,stroke:#6e7681
    style ui fill:transparent,stroke:#6e7681
    linkStyle default stroke:#6e7fa3,stroke-width:1.5px
```

The same story in motion (animated SVG, renders live on GitHub) -- one tick, one re-render, idle tiles untouched:

![Animated diagram: a tick travels from PriceStreamPresenter through usePrice into only the EUR/USD tile, which flashes; the GBP/USD and USD/JPY tiles stay idle](render-granularity.svg)

And in code -- these are the real files, trimmed:

```typescript
// 1 — BUSINESS LOGIC. packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts
//     A plain class of RxJS streams. No React, no hooks, no components.
export class PriceStreamPresenter {
  private readonly cache = new Map<string, Observable<Price>>();
  constructor(private readonly pricing: PricingPort) {}

  price$(pair: CurrencyPair): Observable<Price> {
    const cached = this.cache.get(pair.symbol);
    if (cached) return cached;                                   // one stream per symbol...
    const stream = new PriceStreamUseCase(this.pricing)
      .execute(pair)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));     // ...multicast, latest cached
    this.cache.set(pair.symbol, stream);
    return stream;
  }
}
```

```typescript
// 2 — THE SEAM. packages/react-bindings/src/createViewModel.ts
//     bind (react-rxjs) turns the per-symbol Observable into a hook. Subscription
//     granularity == the argument: usePrice(EURUSD) only ever re-renders
//     components that called usePrice(EURUSD).
const [usePrice] = bind((pair: CurrencyPair) => {
  return presenters.priceStream.price$(pair);
}, null);
```

```tsx
// 3 — THE UI. packages/client-react/src/ui/fx/liveRates/tile/Tile.tsx (trimmed)
//     One useViewModel() call, granular hooks, declarative return. No memo.
export function Tile({ pair, showChart }: TileProps): ReactElement {
  const { usePrice, usePriceHistory, useNotional, useTileExecution, useRfqTile } = useViewModel();
  const price = usePrice(pair);                 // this tile subscribes to THIS symbol
  const tileExecution = useTileExecution(pair); // a per-mount machine, auto-disposed
  // ... purely declarative TSX from here down
}

// ...and the leaf is dumber still — not even a hook (SpreadDisplay.tsx, verbatim):
export function SpreadDisplay({ spread }: SpreadDisplayProps): ReactElement {
  return <div className={styles.spread}>{spread}</div>;
}
```

The provider/context split is three tiny files in `@rtc/react-bindings`:

```typescript
// ViewModelContext.ts — the seam the UI reads. Just a context + the type. Nothing concrete.
export const ViewModelContext = createContext<ViewModel | null>(null);

// useViewModel.ts — what components import. Pulls in ONLY the context + type.
export function useViewModel(): ViewModel {
  const ctx = useContext(ViewModelContext);
  if (!ctx) throw new Error("useViewModel must be used within ViewModelProvider");
  return ctx;
}

// ViewModelProvider.tsx — imported by AppRoot ALONE. Supplies the concrete graph.
export function ViewModelProvider({ viewModel, children }: ViewModelProviderProps) {
  return <ViewModelContext.Provider value={viewModel}>{children}</ViewModelContext.Provider>;
}
```

Because `useViewModel`/`ViewModelContext` live in different modules than `ViewModelProvider`/`createViewModel`, a component that imports the accessor **cannot** transitively reach the concrete factory, the presenters, or react-rxjs. The dependency arrow only ever points *out* of the UI toward the `ViewModel` type. That is the entire coupling surface between `src/ui` and the rest of the app -- one type and one hook. Swapping simulator↔live transport, or even React↔Solid bindings, changes `AppRoot` and nothing in `src/ui`.

### 2.4 Component Diagram -- React Native Client

The mobile client (`@rtc/client-react-native`, Expo SDK 57 / RN 0.86) is deliberately boring: it is the **same architecture with different leaves**. Core and bindings are imported verbatim -- React is React on both platforms, so even the bindings package is shared. Only the UI components and two platform adapters are native-specific.

```mermaid
C4Component
    title Component Diagram - React Native Client

    Container_Boundary(rnUi, "@rtc/client-react-native (RN, dumb)") {
        Component(tabs, "expo-router Tabs", "React Native", "5 tabs: Rates, Blotter, Analytics, Credit, Equities (+ Appearance overlay)")
        Component(screens, "Screens", "React Native + react-native-svg", "SpotTile grid, blotter, PnL chart / exposure bubbles, RFQ workflow, equities markets/trade/blotters")
        Component(rnAppRoot, "AppRoot", "React Native", "createApp(buildNativePorts()) + createViewModel, once per mount; sim/live toggle re-mounts with a React key")
        Component(nativeAdapters, "Native Platform Adapters", "TypeScript", "buildNativePorts (EXPO_PUBLIC_SERVER_URL switch), AsyncStorage preferences, Appearance color scheme")
        Component(rnTheme, "RN Theme Tokens", "TypeScript", "rnThemeTokens: camelCased plain-color subset of the web CSS tokens, delivered via React context")
    }

    Container(bindings2, "@rtc/react-bindings", "SAME package as the web client")
    Container(core2, "@rtc/client-core-rxjs + @rtc/client-adapters", "SAME packages as the web client")
    Container(server2, "WebSocket Server", "wss://rtc-clone-server.fly.dev")

    Rel(tabs, screens, "Routes")
    Rel(screens, bindings2, "useViewModel() -- same ~60 hooks")
    Rel(rnAppRoot, nativeAdapters, "buildNativePorts()")
    Rel(rnAppRoot, core2, "createApp(ports)")
    Rel(rnAppRoot, bindings2, "createViewModel → ViewModelProvider")
    Rel(screens, rnTheme, "useThemedStyles")
    Rel(bindings2, core2, "Binds presenters & machines")
    Rel(core2, server2, "WebSocket JSON (live mode)")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
    UpdateElementStyle(tabs, $bgColor="#1f6feb", $fontColor="#ffffff", $borderColor="#79c0ff")
    UpdateElementStyle(screens, $bgColor="#1f6feb", $fontColor="#ffffff", $borderColor="#79c0ff")
    UpdateElementStyle(rnAppRoot, $bgColor="#1f6feb", $fontColor="#ffffff", $borderColor="#79c0ff")
    UpdateElementStyle(nativeAdapters, $bgColor="#1f6feb", $fontColor="#ffffff", $borderColor="#79c0ff")
    UpdateElementStyle(rnTheme, $bgColor="#1f6feb", $fontColor="#ffffff", $borderColor="#79c0ff")
    UpdateElementStyle(bindings2, $bgColor="#8957e5", $fontColor="#ffffff", $borderColor="#d2a8ff")
    UpdateElementStyle(core2, $bgColor="#238636", $fontColor="#ffffff", $borderColor="#56d364")
    UpdateElementStyle(server2, $bgColor="#9e6a03", $fontColor="#ffffff", $borderColor="#e3b341")
    UpdateRelStyle(tabs, screens, $textColor="#6e7fa3", $lineColor="#6e7fa3")
    UpdateRelStyle(screens, bindings2, $textColor="#6e7fa3", $lineColor="#6e7fa3")
    UpdateRelStyle(rnAppRoot, nativeAdapters, $textColor="#6e7fa3", $lineColor="#6e7fa3")
    UpdateRelStyle(rnAppRoot, core2, $textColor="#6e7fa3", $lineColor="#6e7fa3")
    UpdateRelStyle(rnAppRoot, bindings2, $textColor="#6e7fa3", $lineColor="#6e7fa3")
    UpdateRelStyle(screens, rnTheme, $textColor="#6e7fa3", $lineColor="#6e7fa3")
    UpdateRelStyle(bindings2, core2, $textColor="#6e7fa3", $lineColor="#6e7fa3")
    UpdateRelStyle(core2, server2, $textColor="#d29922", $lineColor="#d29922")
```

What is native-specific, exhaustively:

| Concern | Web (`client-react`) | Mobile (`client-react-native`) |
|---|---|---|
| Port selection switch | `src/app/buildBrowserPorts.ts` reads `VITE_SERVER_URL` | `src/app/buildNativePorts.ts` reads `EXPO_PUBLIC_SERVER_URL` via `expo-constants` (empty string forces simulator mode) |
| Preferences persistence | `LocalStoragePreferencesAdapter` (sync) | `AsyncStoragePreferencesAdapter` (seeds defaults synchronously, then `hydrate()` -- no-flash contract) |
| OS color scheme | `MediaQueryColorSchemeAdapter` (matchMedia) | `AppearanceColorSchemeAdapter` (RN `Appearance`) |
| Charts | SVG/canvas in React DOM | `react-native-svg`, geometry precomputed in pure vitest-tested helpers (`buildChart`, `buildCandles`, `bubbleLayout`, ...) |
| Theming | CSS custom properties (5 skins × dark/light) | `rnThemeTokens` context (same skins, CSS-only effects dropped) |
| Navigation | In-house workspace/layout engine | `expo-router` native tabs |
| Everything else | shared `@rtc/client-core-rxjs` + `@rtc/client-adapters` + `@rtc/react-bindings` | **identical imports** |

The Admin/telemetry workspace is web-only today; the RN app exposes five trading tabs. Distribution is the free path: EAS `development`/`preview` internal profiles, Android APK, no OTA updates (`updates.enabled: false`); the native `ios/`/`android/` folders are gitignored and regenerated by `expo prebuild` (`pnpm dev:ios` from the repo root).

**`@rtc/client-solid` is the same story again, one layer down.** Where the RN client is "same architecture, different leaves" at the *platform* layer (native adapters, RN components), the Solid client is "same architecture, different leaves" at the *framework* layer: it keeps `@rtc/client-core-rxjs` + `@rtc/client-adapters` and the *same* browser platform adapters as `client-react` (`buildBrowserPorts`, `LocalStoragePreferencesAdapter`, `MediaQueryColorSchemeAdapter`) and swaps only the bindings package (`@rtc/solid-bindings` instead of `@rtc/react-bindings`) and the UI components themselves -- CSS Modules ported byte-for-byte. Full detail, including the `ViewModel` seam it implements identically to React: [§8.1 The Multi-Client Proof & the SolidJS Port](08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port) and [`packages/client-solid/README.md`](../../packages/client-solid/README.md).

### 2.5 Component Diagram -- WebSocket Server

The imperative `wsHandler.ts` switch is **gone**. The server is now a thin app of declarative effects on top of `@rtc/ws-effects`, assembled by `buildEffects(loops)` (`packages/server/src/effects/index.ts`: `allEffects` -- FX, Credit, Admin, Equities and the admin Jarvis-usage effect -- plus the `JARVIS_*` effects). The entire connection wiring, trimmed from `packages/server/src/index.ts`:

```typescript
const services = createServices();
const jarvisLoops = createJarvisLoops(process.env, services, buildAnthropicLoop);
const listen = createWsListener(combineEffects(...buildEffects(jarvisLoops)), services);
wss.on("connection", (ws) => listen(toSocket(ws)));
```

Around that wiring the same `node:http` server answers `GET /health`, `POST /login` (`src/http/`, issuing tokens from `AuthService` in `src/auth/`), and `/mcp` (`src/mcp/`, the agent-tools registry over MCP Streamable HTTP); the WS upgrade is admitted only with a valid token.

```mermaid
flowchart TB
    client["<b>Clients</b><br/>Web + React Native"]:::actor

    subgraph srv["@rtc/server — thin app"]
        http["<b>HTTP Server</b> · node:http<br/>GET /health · POST /login · /mcp ·<br/>WS upgrade with token auth (src/auth)"]:::server
        toSocket["<b>toSocket</b><br/>ws.WebSocket → Socket (messages$, send, closed$)"]:::server
        fxFx["<b>FX effects</b><br/>referenceData$ · pricing$ · blotter$ ·<br/>analytics$ · executeTrade$ · getPriceHistory$"]:::server
        fxCredit["<b>Credit effects</b><br/>instruments$ · dealers$ · workflow$ · createRfq$ ·<br/>cancelRfq$ · quote$ · pass$ · accept$"]:::server
        fxAdmin["<b>Admin effects</b><br/>getThroughput$ · setThroughput$ · jarvisUsage$"]:::server
        fxEq["<b>Equities effects</b><br/>watchlist$ · eqQuotes$ · depth$ · orders$ · positions$ ·<br/>getCandles$ · getCandleHistory$ · placeOrder$ (+ ORDER_LIFECYCLE) · cancelOrder$"]:::server
        fxJarvis["<b>Jarvis effects</b><br/>JARVIS_* · availability + up to two lazy sessions per connection<br/>(scripted and Anthropic; each turn routed by JarvisBrain preference)"]:::server
        agent["<b>Agent loops</b> · src/agent<br/>ScriptedAgentLoop · AnthropicAgentLoop<br/>(@anthropic-ai/sdk confined here)"]:::server
        svcContainer["<b>createServices</b><br/>ServiceContainer: FX + credit + equities simulators<br/>+ ThroughputService · UsageMeter · JarvisGateService"]:::server
        http --> toSocket
        fxFx ~~~ fxCredit ~~~ fxAdmin ~~~ fxEq
        fxEq ~~~ fxJarvis
        fxJarvis --> agent
    end

    subgraph fw["@rtc/ws-effects — framework, rxjs-only"]
        combine["<b>combineEffects + createWsListener</b><br/>merge all effects over one shared inbound stream ·<br/>catchError → EMPTY per effect · teardown on closed$"]:::server
        sugar["<b>stream() / rpc()</b><br/>subscription fan-out · correlated ack/nack ·<br/>per-message error isolation"]:::server
        effectType["<b>WsEffect primitive</b><br/>(in$, ctx) => out$ — pure stream transform, marble-tested"]:::server
        combine --> sugar --> effectType
    end

    subgraph simulators["Domain Simulators — @rtc/domain, in-memory port impls"]
        pricingSim["<b>Pricing / RefData / Execution / TradeStore / Analytics</b><br/>random-walk pricing · execution with delays/rejections · blotter · PnL"]:::domain
        rfqSim["<b>Credit RFQ + Instrument + Dealer</b><br/>RFQ lifecycle · dealer simulation · quote state machine"]:::domain
        eqSim["<b>EquityMarketData / EquityOrder / EquityPosition</b><br/>watchlist · quotes · candles · depth · order lifecycle → fills"]:::domain
        pricingSim ~~~ rfqSim ~~~ eqSim
    end

    client -->|"WS upgrade (?access= token)"| http
    toSocket -->|"Socket per connection"| combine
    combine -->|"merges"| fxFx
    fxFx & fxCredit & fxAdmin & fxEq & fxJarvis -.->|"built with"| sugar
    fxFx & fxEq -->|"ctx"| svcContainer
    svcContainer -->|"creates"| pricingSim
    svcContainer -->|"creates"| rfqSim
    svcContainer -->|"creates"| eqSim

    classDef actor  fill:#30363d,stroke:#8b949e,color:#ffffff
    classDef server fill:#9e6a03,stroke:#e3b341,color:#ffffff
    classDef domain fill:#1f2d3d,stroke:#4493f8,color:#e6edf3
    style srv fill:transparent,stroke:#6e7681
    style fw fill:transparent,stroke:#6e7681
    style simulators fill:transparent,stroke:#6e7681
    linkStyle default stroke:#6e7fa3,stroke-width:1.5px
```

> **Naming**: these are **simulators**, not "mocks". They are production code that stands in for an external pricing or execution venue. *Test* mocks are a separate concept and live alongside tests.

> **One thing this diagram does not show** (detailed in [§7 Runtime Topology](07-communication-patterns.md#runtime-topology-what-runs-when)): these same simulators also run **in the browser / on the device** in simulator mode -- the server is only in the loop when a server URL is configured. Since the ws-effects rewrite shipped, the server serves **all four domains** (FX, Credit, Admin, Equities); the old equities gap is closed ([§7](07-communication-patterns.md#equities-over-the-wire-gap-closed)).

---

