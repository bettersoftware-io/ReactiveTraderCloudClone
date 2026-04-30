# Reactive Trader Cloud -- Architecture Document

## Table of Contents

1. [Overview](#1-overview)
2. [C4 Model](#2-c4-model)
   - [System Context](#21-system-context-diagram)
   - [Container Diagram](#22-container-diagram)
   - [Component Diagram -- Client](#23-component-diagram--web-client)
   - [Component Diagram -- Server](#24-component-diagram--websocket-server)
3. [UML Class Diagrams](#3-uml-class-diagrams)
   - [FX Domain Entities](#31-fx-domain-entities)
   - [Credit Domain Entities](#32-credit-domain-entities)
   - [Ports & Adapters](#33-ports--adapters-hexagonal-architecture)
4. [Sequence Diagrams](#4-sequence-diagrams)
   - [FX Price Streaming](#41-fx-price-streaming)
   - [FX Trade Execution](#42-fx-trade-execution-rpc)
   - [Credit RFQ Workflow](#43-credit-rfq-workflow)
5. [State Diagrams](#5-state-diagrams)
   - [Connection Status](#51-connection-status)
   - [Quote State Machine](#52-quote-state-machine-credit-rfq)
   - [RFQ Lifecycle](#53-rfq-lifecycle)
   - [FX Trade Execution Flow](#54-fx-trade-execution-flow)
6. [Package Dependencies](#6-package-dependencies)
7. [Communication Patterns](#7-communication-patterns)
8. [Key Design Decisions](#8-key-design-decisions)

---

## 1. Overview

**Reactive Trader Cloud Clone** is a real-time FX trading and Credit RFQ (Request for Quote) platform built as a monorepo with pnpm workspaces and Turborepo. It demonstrates reactive streaming, domain-driven design, and hexagonal architecture (ports & adapters).

**Key characteristics:**
- **Streaming-first**: All data flows as `AsyncIterable<T>` -- the universal abstraction from domain through server to client
- **Hexagonal architecture**: Pure domain logic with zero dependencies; adapters plug in at boundaries
- **WebSocket protocol**: Subscriptions for streaming data, RPC with correlation IDs for commands
- **State-of-the-World (SoW)**: Ensures consistent client state after (re)connection

**Technology stack:**

| Layer | Technology |
|-------|-----------|
| Domain | Pure TypeScript, zero runtime dependencies |
| Shared | TypeScript DTOs and wire-format contracts |
| Client | React 19, Vite, custom async-iterator hooks |
| Server | Node.js, native WebSocket, TypeScript |
| Build | pnpm workspaces, Turborepo |
| Test | Vitest (unit), Playwright (e2e) |

---

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
```

### 2.2 Container Diagram

Shows the four packages inside the system boundary and their relationships.

```mermaid
C4Container
    title Container Diagram - Reactive Trader Cloud

    Person(trader, "Trader", "FX and Credit trader")

    System_Boundary(rtc, "Reactive Trader Cloud") {
        Container(client, "Web Client", "React 19, Vite, TypeScript", "SPA delivering live rates, trade tiles, blotter, analytics, and credit RFQ UI")
        Container(server, "WebSocket Server", "Node.js, TypeScript", "Streams prices, executes trades, manages RFQ workflow over WebSocket")
        Container(domain, "Domain Library", "Pure TypeScript", "Entities, value objects, use-case logic, port interfaces with zero runtime dependencies")
        Container(shared, "Shared Contracts", "TypeScript", "DTOs, wire-format envelopes (RPC, SoW), protocol constants")
    }

    Rel(trader, client, "Uses", "HTTPS / Browser")
    Rel(client, server, "Subscribes to streams, sends RPC commands", "WebSocket JSON")
    Rel(client, domain, "Imports entities and port interfaces", "TypeScript import")
    Rel(client, shared, "Imports DTOs for deserialization", "TypeScript import")
    Rel(server, domain, "Imports entities, ports, and mock implementations", "TypeScript import")
    Rel(server, shared, "Imports DTOs and protocol types", "TypeScript import")
    Rel(shared, domain, "Depends on domain types", "TypeScript import")
```

### 2.3 Component Diagram -- Web Client

```mermaid
C4Component
    title Component Diagram - Web Client

    Container_Boundary(client, "Web Client") {
        Component(app, "App Shell", "React", "Tab layout FX/Credit/Admin, header, footer, connection overlay")
        Component(fxTiles, "FX Live Rates", "React", "Price tiles with bid/ask, spread, trade buttons, RFQ trigger")
        Component(blotter, "FX Blotter", "React", "Live trade stream table with filtering and sorting")
        Component(analytics, "Analytics Panel", "React", "PnL chart and currency position breakdown")
        Component(creditRfq, "Credit RFQ", "React", "New RFQ form, RFQ tiles with dealer quote cards")
        Component(connMgr, "Connection Manager", "React Context", "State machine: CONNECTING CONNECTED DISCONNECTED IDLE OFFLINE")
        Component(svcProvider, "Service Provider", "React Context", "DI container: mock services or real WebSocket adapters")
        Component(wsAdapter, "WebSocket Adapter", "TypeScript", "Transport: send, rpc with correlation IDs, event handlers, reconnect")
        Component(hooks, "Streaming Hooks", "React Hooks", "usePriceStream, useRfqStream, useExecuteTrade, etc.")
    }

    Container(server, "WebSocket Server", "Node.js")

    Rel(app, fxTiles, "Renders")
    Rel(app, blotter, "Renders")
    Rel(app, analytics, "Renders")
    Rel(app, creditRfq, "Renders")
    Rel(app, connMgr, "Reads connection status")
    Rel(fxTiles, hooks, "Calls")
    Rel(blotter, hooks, "Calls")
    Rel(creditRfq, hooks, "Calls")
    Rel(hooks, svcProvider, "Reads port implementations")
    Rel(svcProvider, wsAdapter, "Creates real adapters using")
    Rel(wsAdapter, server, "WebSocket JSON messages")
```

### 2.4 Component Diagram -- WebSocket Server

```mermaid
C4Component
    title Component Diagram - WebSocket Server

    Container_Boundary(server, "WebSocket Server") {
        Component(http, "HTTP Server", "Node.js http", "Health check, CORS, throughput API, WebSocket upgrade")
        Component(wsHandler, "WS Handler", "TypeScript", "Message routing: dispatches subscriptions and RPC calls per connection")
        Component(protocol, "Protocol Constants", "TypeScript", "CLIENT_MSG and SERVER_MSG type enums for all message types")
        Component(svcContainer, "Service Container", "TypeScript", "Singleton factory for all domain mock implementations")
        Component(throughput, "Throughput Service", "TypeScript", "Configurable message rate throttling for perf testing")
    }

    Container_Boundary(domainMocks, "Domain Mock Implementations") {
        Component(pricingEngine, "Pricing Engine", "TypeScript", "Random-walk price generation at 150-1000ms intervals")
        Component(execEngine, "Execution Engine", "TypeScript", "Trade execution with simulated delays and rejections")
        Component(tradeStore, "Trade Store", "TypeScript", "In-memory trade blotter with listener pattern")
        Component(analyticsEngine, "Analytics Engine", "TypeScript", "PnL history and position tracking")
        Component(rfqEngine, "Credit RFQ Engine", "TypeScript", "RFQ lifecycle, dealer simulation, quote state machine")
        Component(refData, "Reference Data", "TypeScript", "Currency pairs, instruments, dealers catalogs")
    }

    Container(client, "Web Client", "React SPA")

    Rel(client, http, "WebSocket upgrade", "HTTP to WS")
    Rel(http, wsHandler, "Delegates WebSocket connections")
    Rel(wsHandler, protocol, "Uses message type constants")
    Rel(wsHandler, svcContainer, "Gets service instances")
    Rel(svcContainer, pricingEngine, "Creates")
    Rel(svcContainer, execEngine, "Creates")
    Rel(svcContainer, tradeStore, "Creates")
    Rel(svcContainer, analyticsEngine, "Creates")
    Rel(svcContainer, rfqEngine, "Creates")
    Rel(svcContainer, refData, "Creates")
    Rel(tradeStore, execEngine, "Listens for new trades")
```

---

## 3. UML Class Diagrams

### 3.1 FX Domain Entities

```mermaid
classDiagram
    direction TB

    class CurrencyPair {
        +string symbol
        +int ratePrecision
        +int pipsPosition
        +string base
        +string terms
        +number defaultNotional
    }

    class PriceTick {
        +string symbol
        +number bid
        +number ask
        +number mid
        +string valueDate
        +number creationTimestamp
    }

    class Price {
        +string symbol
        +number bid
        +number ask
        +number mid
        +string valueDate
        +number creationTimestamp
        +MovementType movementType
        +number spread
        +number version
    }

    class Trade {
        +number tradeId
        +string currencyPair
        +string traderName
        +number notional
        +string dealtCurrency
        +Direction direction
        +number spotRate
        +TradeStatus status
        +string valueDate
        +string tradeDate
    }

    class ExecutionRequest {
        +string currencyPair
        +number spotRate
        +Direction direction
        +number notional
        +string dealtCurrency
    }

    class MovementType {
        <<enumeration>>
        UP
        DOWN
        NONE
    }

    class Direction {
        <<enumeration>>
        Buy
        Sell
    }

    class TradeStatus {
        <<enumeration>>
        Pending
        Done
        Rejected
    }

    class ExecutionStatus {
        <<enumeration>>
        Done
        Rejected
        Timeout
        CreditExceeded
    }

    PriceTick <|-- Price : extends
    Price --> MovementType
    Trade --> Direction
    Trade --> TradeStatus
    ExecutionRequest --> Direction
    Trade --> CurrencyPair : references symbol
    PriceTick --> CurrencyPair : references symbol
    ExecutionRequest --> CurrencyPair : references symbol
```

**Key functions:**
- `calculateSpread(bid, ask, pipsPosition)` -- converts bid-ask difference to pips
- `detectMovement(current, previous)` -- compares mid prices to determine UP/DOWN/NONE
- `parseNotional(input)` -- supports k/m suffixes ("1.5m" = 1,500,000)
- `isRfqRequired(notional)` -- true when notional >= 10M (triggers RFQ instead of direct execution)
- `deriveDealtCurrency(direction, pair)` -- Buy = base currency; Sell = terms currency

**Constants:** `DEFAULT_NOTIONAL = 1M`, `RFQ_THRESHOLD = 10M`, `MAX_NOTIONAL = 1B`, `PRICE_HISTORY_SIZE = 50`

### 3.2 Credit Domain Entities

```mermaid
classDiagram
    direction TB

    class Instrument {
        +number id
        +string name
        +string cusip
        +string ticker
        +string maturity
        +number interestRate
        +string benchmark
    }

    class Dealer {
        +number id
        +string name
    }

    class Rfq {
        +number id
        +number instrumentId
        +number quantity
        +Direction direction
        +RfqState state
        +number expirySecs
        +number creationTimestamp
    }

    class QuoteState {
        <<union>>
        pendingWithoutPrice
        pendingWithPrice
        accepted
        rejectedWithPrice
        passed
        rejectedWithoutPrice
    }

    class Quote {
        +number id
        +number rfqId
        +number dealerId
        +QuoteState state
    }

    class CreditTrade {
        +number tradeId
        +string status
        +Direction direction
        +string counterParty
        +string cusip
        +string security
        +number quantity
        +string orderType
        +number unitPrice
    }

    class RfqState {
        <<enumeration>>
        Open
        Expired
        Cancelled
        Closed
    }

    Rfq --> RfqState
    Rfq --> Instrument : instrumentId
    Quote --> Rfq : rfqId
    Quote --> Dealer : dealerId
    Quote --> QuoteState
    CreditTrade --> Instrument : cusip
    CreditTrade --> Dealer : counterParty
```

**Key functions:**
- `validQuoteTransitions(currentState)` -- returns allowed next states per current state
- **Constants:** `CREDIT_QUANTITY_MULTIPLIER = 1000`, `CREDIT_MAX_QUANTITY_INPUT = 100M`

### 3.3 Ports & Adapters (Hexagonal Architecture)

All ports use `AsyncIterable<T>` for streaming and `Promise<T>` for RPC -- no framework types leak into the domain.

```mermaid
classDiagram
    direction TB

    class PricingPort {
        <<interface>>
        +getPriceUpdates(symbol) AsyncIterable~PriceTick~
        +getPriceHistory(symbol) Promise~PriceTick[]~
    }

    class ReferenceDataPort {
        <<interface>>
        +getCurrencyPairs() AsyncIterable~CurrencyPair[]~
    }

    class ExecutionPort {
        <<interface>>
        +executeTrade(request) Promise~Trade~
    }

    class BlotterPort {
        <<interface>>
        +getTradeStream() AsyncIterable~Trade[]~
    }

    class AnalyticsPort {
        <<interface>>
        +getAnalytics(currency) AsyncIterable~PositionUpdates~
    }

    class InstrumentPort {
        <<interface>>
        +subscribe() AsyncIterable~Instrument[]~
    }

    class DealerPort {
        <<interface>>
        +subscribe() AsyncIterable~Dealer[]~
    }

    class WorkflowPort {
        <<interface>>
        +subscribe() AsyncIterable~RfqEvent~
        +createRfq(request) Promise~number~
        +cancelRfq(rfqId) Promise~void~
        +quote(request) Promise~void~
        +pass(quoteId) Promise~void~
        +accept(quoteId) Promise~void~
    }

    class MockPricingEngine {
        +getPriceUpdates(symbol) AsyncIterable~PriceTick~
        +getPriceHistory(symbol) Promise~PriceTick[]~
        +getRfqQuote(symbol) PriceTick
    }

    class MockExecutionEngine {
        +executeTrade(request) Promise~Trade~
        +onTrade(listener) void
    }

    class MockTradeStore {
        +getTradeStream() AsyncIterable~Trade[]~
    }

    class MockCreditRfqEngine {
        +subscribe() AsyncIterable~RfqEvent~
        +createRfq(request) Promise~number~
        +cancelRfq(rfqId) Promise~void~
        +quote(request) Promise~void~
        +pass(quoteId) Promise~void~
        +accept(quoteId) Promise~void~
    }

    class WsRealPricingAdapter {
        -WsAdapter ws
        +getPriceUpdates(symbol) AsyncIterable~PriceTick~
        +getPriceHistory(symbol) Promise~PriceTick[]~
    }

    class WsRealExecutionAdapter {
        -WsAdapter ws
        +executeTrade(request) Promise~Trade~
    }

    PricingPort <|.. MockPricingEngine : implements
    PricingPort <|.. WsRealPricingAdapter : implements
    ExecutionPort <|.. MockExecutionEngine : implements
    ExecutionPort <|.. WsRealExecutionAdapter : implements
    BlotterPort <|.. MockTradeStore : implements
    WorkflowPort <|.. MockCreditRfqEngine : implements
```

**Adapter selection** is controlled by `VITE_SERVER_URL`:
- **Unset** (mock mode): `createMockServices()` instantiates domain mocks directly
- **Set** (real mode): `createRealServices()` creates WebSocket-backed adapters via `WsAdapter`

---

## 4. Sequence Diagrams

### 4.1 FX Price Streaming

```mermaid
sequenceDiagram
    participant Trader
    participant Tile as FX Tile Component
    participant Hook as usePriceStream Hook
    participant SvcCtx as Service Provider
    participant WsAdapter as WebSocket Adapter
    participant Server as WS Handler
    participant Engine as MockPricingEngine

    Trader->>Tile: Opens FX workspace
    Tile->>Hook: Mount with CurrencyPair
    Hook->>SvcCtx: Get PricingPort
    SvcCtx-->>Hook: pricing adapter

    alt Mock Mode
        Hook->>Engine: getPriceUpdates(EURUSD)
        loop Every 150-1000ms
            Engine-->>Hook: PriceTick via async iterable yield
            Hook->>Hook: detectMovement + calculateSpread
            Hook->>Tile: setState(Price)
            Tile->>Trader: Render bid/ask/spread/movement
        end
    else Real Mode via WebSocket
        Hook->>WsAdapter: getPriceUpdates(EURUSD)
        WsAdapter->>Server: subscribe.pricing with symbol EURUSD
        Server->>Engine: getPriceUpdates(EURUSD)
        loop Continuous streaming
            Engine-->>Server: PriceTick via async iterable yield
            Server-->>WsAdapter: stream.priceTick with PriceTickDto
            WsAdapter-->>Hook: asyncQueue yields PriceTick
            Hook->>Hook: detectMovement + calculateSpread
            Hook->>Tile: setState(Price)
            Tile->>Trader: Render bid/ask/spread/movement
        end
    end
```

### 4.2 FX Trade Execution (RPC)

```mermaid
sequenceDiagram
    participant Trader
    participant Tile as FX Tile
    participant ExecHook as useExecuteTrade
    participant WsAdapter as WebSocket Adapter
    participant Server as WS Handler
    participant Engine as MockExecutionEngine
    participant Store as MockTradeStore
    participant Blotter as Blotter Component

    Trader->>Tile: Clicks Buy/Sell at displayed rate
    Tile->>ExecHook: execute with currencyPair, spotRate, direction, notional
    ExecHook->>ExecHook: setState pending

    ExecHook->>WsAdapter: executeTrade(ExecutionRequest)
    WsAdapter->>Server: rpc.executeTrade with correlationId 42
    Server->>Engine: executeTrade(request)

    alt Normal Execution with 0-2s delay
        Engine-->>Server: Trade with status Done
        Engine->>Store: notifyListeners(trade)
    else GBPJPY always rejected
        Engine-->>Server: Trade with status Rejected
    else EURJPY with 4s extra delay
        Note over Engine: Simulated slow execution
        Engine-->>Server: Trade with status Done
        Engine->>Store: notifyListeners(trade)
    end

    Server-->>WsAdapter: rpc.executeTrade.response with ack and correlationId 42
    WsAdapter-->>ExecHook: resolve(Trade)
    ExecHook->>Tile: setState trade result
    Tile->>Trader: Show confirmation with 5s auto-dismiss

    Store-->>Blotter: AsyncIterable yields updated trade list
    Blotter->>Trader: New trade appears in blotter
```

### 4.3 Credit RFQ Workflow

```mermaid
sequenceDiagram
    participant Trader
    participant Form as New RFQ Form
    participant RfqHook as useCreateRfq / useRfqStream
    participant WsAdapter as WebSocket Adapter
    participant Server as WS Handler
    participant Engine as MockCreditRfqEngine
    participant Tiles as RFQ Tiles Panel

    Trader->>Form: Selects instrument, dealers, quantity, direction
    Trader->>Form: Clicks Send RFQ
    Form->>RfqHook: createRfq with instrumentId, dealerIds, quantity, direction, expirySecs
    RfqHook->>WsAdapter: rpc createRfq
    WsAdapter->>Server: rpc.createRfq with correlationId N
    Server->>Engine: createRfq(request)
    Engine->>Engine: Create Rfq with state Open

    loop For each selected dealer
        Engine->>Engine: Create Quote with state pendingWithoutPrice
        Engine-->>Server: RfqEvent quoteCreated
        Server-->>WsAdapter: stream.workflowEvent
        WsAdapter-->>RfqHook: asyncQueue yields event
    end

    Engine-->>Server: RfqEvent rfqCreated
    Server-->>WsAdapter: rpc.createRfq.response with correlationId N

    RfqHook->>Tiles: Update state with new RFQ and pending quotes
    Tiles->>Trader: Shows RFQ card with dealer quote slots

    par Dealer Simulation within 0-30s and 70 percent respond
        Engine->>Engine: Dealer A quotes price
        Engine-->>Server: RfqEvent quoteQuoted
        Server-->>WsAdapter: stream.workflowEvent
        WsAdapter-->>RfqHook: event
        RfqHook->>Tiles: Quote A shows price
    and
        Engine->>Engine: Dealer B quotes price
        Engine-->>Server: RfqEvent quoteQuoted
        Server-->>WsAdapter: stream.workflowEvent
        WsAdapter-->>RfqHook: event
        RfqHook->>Tiles: Quote B shows price
    end

    Trader->>Tiles: Clicks Accept on best quote
    Tiles->>RfqHook: accept(quoteId)
    RfqHook->>WsAdapter: rpc accept with quoteId
    WsAdapter->>Server: rpc.accept
    Server->>Engine: accept(quoteId)
    Engine->>Engine: Accepted quote, others rejected, Rfq Closed
    Engine-->>Server: quoteAccepted + quoteRejected + rfqClosed events
    Server-->>WsAdapter: stream.workflowEvent multiple
    WsAdapter-->>RfqHook: events
    RfqHook->>Tiles: RFQ shows Closed state
    Tiles->>Trader: Accepted quote highlighted and RFQ closed
```

---

## 5. State Diagrams

### 5.1 Connection Status

Pure function `nextConnectionStatus(current, event)` drives all transitions.

```mermaid
stateDiagram-v2
    [*] --> CONNECTING : Application starts

    CONNECTING --> CONNECTED : gatewayConnected
    CONNECTING --> DISCONNECTED : gatewayDisconnected

    CONNECTED --> IDLE_DISCONNECTED : idleTimeout after 15 min
    CONNECTED --> DISCONNECTED : gatewayDisconnected
    CONNECTED --> OFFLINE_DISCONNECTED : browserOffline

    DISCONNECTED --> CONNECTING : reconnectAttempt every 10s
    DISCONNECTED --> OFFLINE_DISCONNECTED : browserOffline

    IDLE_DISCONNECTED --> CONNECTING : userActivity
    IDLE_DISCONNECTED --> OFFLINE_DISCONNECTED : browserOffline

    OFFLINE_DISCONNECTED --> CONNECTING : browserOnline
```

**Constants:** `IDLE_TIMEOUT_MS = 15 min`, `RECONNECT_INTERVAL_MS = 10s`

### 5.2 Quote State Machine (Credit RFQ)

Each dealer quote follows this state machine. Transitions are validated by `validQuoteTransitions()`.

```mermaid
stateDiagram-v2
    [*] --> pendingWithoutPrice : Quote created for dealer

    pendingWithoutPrice --> pendingWithPrice : Dealer submits price
    pendingWithoutPrice --> passed : Dealer passes
    pendingWithoutPrice --> rejectedWithoutPrice : Another quote accepted

    pendingWithPrice --> accepted : Trader accepts this quote
    pendingWithPrice --> rejectedWithPrice : Another quote accepted

    accepted --> [*] : Terminal
    rejectedWithPrice --> [*] : Terminal
    passed --> [*] : Terminal
    rejectedWithoutPrice --> [*] : Terminal
```

### 5.3 RFQ Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Open : createRfq

    Open --> Closed : quote accepted by any dealer
    Open --> Cancelled : cancelRfq by trader
    Open --> Expired : expirySecs elapsed

    Closed --> [*] : Terminal
    Cancelled --> [*] : Terminal
    Expired --> [*] : Terminal
```

### 5.4 FX Trade Execution Flow

```mermaid
stateDiagram-v2
    [*] --> Idle : Tile mounted

    Idle --> Executing : Trader clicks Buy or Sell

    Executing --> Done : Server returns Done
    Executing --> Rejected : Server returns Rejected
    Executing --> Timeout : No response in 30s
    Executing --> TooLong : No response after 2s

    TooLong --> Done : Server returns Done late
    TooLong --> Rejected : Server returns Rejected late
    TooLong --> Timeout : 30s total elapsed

    Done --> Idle : Confirmation dismissed after 5s
    Rejected --> Idle : Confirmation dismissed after 5s
    Timeout --> Idle : Confirmation dismissed
```

**Constants:** `EXECUTION_TIMEOUT_MS = 30s`, `TOO_LONG_THRESHOLD_MS = 2s`, `CONFIRMATION_DISMISS_MS = 5s`

---

## 6. Package Dependencies

```mermaid
graph TB
    subgraph Monorepo
        domain["@rtc/domain\nPure TypeScript\nZero dependencies"]
        shared["@rtc/shared\nDTOs and Protocol\nWire-format contracts"]
        client["@rtc/client\nReact 19 + Vite\nWeb SPA"]
        server["@rtc/server\nNode.js\nWebSocket Server"]
        mobile["@rtc/mobile\nReact Native\nPlanned"]
    end

    shared --> domain
    client --> domain
    client --> shared
    server --> domain
    server --> shared
    mobile --> domain
    mobile --> shared

    style domain fill:#4CAF50,color:#fff
    style shared fill:#2196F3,color:#fff
    style client fill:#FF9800,color:#fff
    style server fill:#9C27B0,color:#fff
    style mobile fill:#607D8B,color:#fff,stroke-dasharray: 5 5
```

**Dependency rule:** Dependencies flow inward only.
- `domain` has **zero** runtime dependencies (enforced by pnpm strict mode)
- `shared` depends only on `domain`
- `client`, `mobile`, and `server` depend on `domain` + `shared` but never on each other

**Build order** (Turborepo topological): `domain` -> `shared` -> `client` | `server`

---

## 7. Communication Patterns

### WebSocket Message Format

```typescript
interface WsMessage {
  type: string;            // Message type identifier
  payload?: unknown;       // Data payload
  correlationId?: string;  // For RPC request-response matching
}
```

### Three Communication Styles

#### 1. Subscriptions (Fire & Forget)

Client subscribes; server streams continuously until connection closes.

```
Client -> Server:  { type: "subscribe.pricing", payload: { symbol: "EURUSD" } }
Server -> Client:  { type: "stream.priceTick", payload: PriceTickDto }  (repeated)
```

#### 2. RPC (Request-Response with Correlation ID)

```
Client -> Server:  { type: "rpc.executeTrade", payload: dto, correlationId: "42" }
Server -> Client:  { type: "rpc.executeTrade.response", payload: { type: "ack", payload: TradeDto }, correlationId: "42" }
```

#### 3. State-of-the-World (SoW)

Ensures clients have a consistent view after (re)connection.

**Bulk SoW** (blotter, reference data, analytics):
```typescript
{ updates: [...], isStateOfTheWorld: true, isStale: false }   // initial snapshot
{ updates: [...newItems], isStateOfTheWorld: false, isStale: false }  // subsequent deltas
```

**Marker-based SoW** (instruments, dealers, workflow):
```typescript
{ type: "startOfStateOfTheWorld" }
{ type: "added", payload: InstrumentDto }   // repeated per item
{ type: "endOfStateOfTheWorld" }
{ type: "added", payload: NewInstrumentDto }  // live updates after marker
```

### Async Iteration Pattern

Both client and server use `AsyncIterable<T>` as the universal streaming abstraction:

```
Domain Port (interface)     ->  AsyncIterable<PriceTick>
  |
Mock Implementation         ->  async generator yielding ticks
  |
Server WS Handler           ->  for await (tick of port) { ws.send(toDto(tick)) }
  |
Client WS Adapter           ->  createAsyncQueue<T>() bridges ws.onmessage -> AsyncIterable
  |
React Hook                  ->  for await (tick of port) { setState(enrich(tick)) }
```

---

## 8. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **AsyncIterable everywhere (no RxJS on client)** | Simpler than Observables for fire-and-forget streams; same abstraction domain-to-UI |
| **Streaming-first data model** | Real-time financial data naturally flows as streams, not snapshots + polling |
| **Mock implementations in domain** | Tests run without network; prod uses same port interfaces with different adapters |
| **WebSocket + RPC pattern** | Subscriptions for data, RPC for commands -- clean separation of concerns |
| **SoW markers** | Ensures consistent state after reconnect without full re-fetch |
| **Pure domain with zero deps** | Fully testable, portable; any framework is replaceable by changing only its package |
| **Correlation IDs for RPC** | Multiplexes many concurrent RPC calls over a single WebSocket connection |
| **React Context for DI** | `ServiceProvider` swaps mock/real adapters; no prop drilling |
| **AbortController per subscription** | Graceful cleanup when WebSocket closes -- all active streams are cancelled |

---

## Key Files Reference

| Area | Path | Description |
|------|------|-------------|
| **Domain Ports** | `packages/domain/src/ports/*.ts` | 8 port interfaces |
| **FX Entities** | `packages/domain/src/fx/*.ts` | CurrencyPair, Price, Trade, Notional |
| **Credit Entities** | `packages/domain/src/credit/*.ts` | Instrument, Dealer, Rfq, Quote |
| **Connection** | `packages/domain/src/connection/*.ts` | ConnectionStatus state machine |
| **Domain Mocks** | `packages/domain/src/mock/*.ts` | 8 mock implementations |
| **Shared DTOs** | `packages/shared/src/fx/*.ts`, `credit/*.ts` | Wire-format contracts |
| **Protocol** | `packages/shared/src/protocol/*.ts` | RPC and SoW envelopes |
| **Client Services** | `packages/client/src/services/*.ts` | WsAdapter, mock/real factories |
| **Client FX Hooks** | `packages/client/src/fx/hooks/*.ts` | usePriceStream, useExecuteTrade |
| **Client Credit Hooks** | `packages/client/src/credit/hooks/*.ts` | useRfqStream, useCreateRfq |
| **Server Entry** | `packages/server/src/index.ts` | HTTP + WebSocket setup |
| **Server WS Handler** | `packages/server/src/ws/ws-handler.ts` | Subscription & RPC routing |
| **Server Protocol** | `packages/server/src/ws/protocol.ts` | Message type constants |
