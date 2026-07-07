# Implementation Plan

> **Historical document — the original phased build plan.** Kept as a record of how
> the system was built. Package placements predate the `@rtc/client-core` /
> `@rtc/react-bindings` extraction, the React Native client, and `@rtc/ws-effects`
> (e.g. "presenters/adapters in `client-react/src/app`" is no longer where that code
> lives). For the current structure, [architecture.md](./architecture.md) is
> authoritative.

Full phased plan for building ReactiveTraderCloudClone from behavioral specifications.

## Status

| Phase | Name | Status | Package(s) |
|-------|------|--------|------------|
| 0 | Domain Types + Ports | **Done** | domain |
| 1 | Shared DTOs | **Done** | shared |
| 2 | FX Mock Backend | **Done** | domain |
| 3 | Client Shell: Connection + Theme + Layout | **Done** | client |
| 4 | FX Live Rates: Tile Grid + Streaming Prices | **Done** | client |
| 5 | FX Trade Execution + Blotter | **Done** | client |
| 6 | FX RFQ Flow | **Done** | client |
| 7 | Analytics Panel | **Done** | client |
| 8 | Credit Reference Data + RFQ Creation | **Done** | domain, client |
| 9 | Credit RFQ Tiles + Blotter + Sell-Side | **Done** | client |
| 10 | Server + Admin | **Done** | server, client |
| 11 | E2E Tests + Polish | **Done** | client |

## Phase Dependency Graph

```
Phase 0 (Domain Types + Ports)                    ✅
    |
Phase 1 (Shared DTOs)                             ✅
    |
Phase 2 (FX Mock Backend)                         ✅
    |
Phase 3 (Client Shell)                            ✅
    |
Phase 4 (FX Live Rates)                           ✅
    |
    +-------> Phase 6 (FX RFQ Flow)               ✅
    |
Phase 5 (FX Execution + Blotter)                  ✅
    |
    +-------> Phase 7 (Analytics Panel)           ✅
    |
Phase 8 (Credit Reference Data + RFQ Creation)    ✅
    |
Phase 9 (Credit RFQ Tiles + Blotter + Sell-Side)  ✅
    |
Phase 10 (Server + Admin) —                       ✅
    |
Phase 11 (E2E + Polish) —                         ✅
```

Phases 6 and 7 can run in parallel with Phase 5 (they depend on Phase 4, not Phase 5). Phase 10 (server) can begin after Phase 1 and proceed independently of client work.

---

## Architectural Decisions

### Mock Backend Location
Mock backend engines live in `@rtc/domain` (pure TS, zero deps). They implement the same port interfaces as the real adapters. The client selects between mock adapters (from domain) and real adapters (WebSocket-based, in client) based on environment config.

### Port Interfaces
All ports use native JS abstractions (`AsyncIterable<T>`, `Promise<T>`) — never framework types like `Observable<T>`. This keeps domain framework-free.

### Dependency Rule
`domain` (zero deps) → `shared` (depends on domain) → `client`/`server` (depend on domain + shared, never on each other).

---

## Phase 0: Domain Types + Port Interfaces ✅

**Package:** `@rtc/domain`

### What was built:

**FX Entities** (`packages/domain/src/fx/`):
- `currency-pair.ts` — `CurrencyPair` type, `KNOWN_CURRENCY_PAIRS` (9 pairs), `deriveBaseTerm()`
- `price.ts` — `PriceTick`, `Price`, `PriceMovementType`, `calculateSpread()`, `detectMovement()`
- `trade.ts` — `Trade`, `Direction`, `TradeStatus`, `ExecutionStatus`, `ExecutionRequest`, `deriveDealtCurrency()`
- `notional.ts` — `parseNotional()` (k/m multipliers), `validateNotional()`, `isRfqRequired()`, constants
- `currency-filter.ts` — `CurrencyCategory`, `matchesCurrencyFilter()`

**Connection** (`packages/domain/src/connection/`):
- `connection-status.ts` — `ConnectionStatus` enum, `nextConnectionStatus()` state machine, `mapGatewayStatus()`, idle/reconnect constants

**Analytics** (`packages/domain/src/analytics/`):
- `position.ts` — `CurrencyPairPosition`, `HistoricPosition`, `PositionUpdates`

**Credit** (`packages/domain/src/credit/`):
- `instrument.ts`, `dealer.ts`, `rfq.ts`, `quote.ts` (discriminated union `QuoteState`), `credit-trade.ts`

**Ports** (`packages/domain/src/ports/`):
- 8 port interfaces: `ReferenceDataPort`, `PricingPort`, `ExecutionPort`, `BlotterPort`, `AnalyticsPort`, `InstrumentPort`, `DealerPort`, `WorkflowPort`

**Tests:** 7 test files, covering spread calc, movement detection, notional parsing, currency filters, dealt currency derivation, connection state machine, quote transitions.

---

## Phase 1: Shared DTOs ✅

**Package:** `@rtc/shared`

### What was built:

**Protocol** (`packages/shared/src/protocol/`):
- `sow.ts` — `BulkSoWMessage<T>` (Variant A), `MarkerEvent<T>` (Variant B)
- `rpc.ts` — `RpcResponse<T>` (ack/nack)

**FX DTOs** (`packages/shared/src/fx/`):
- `reference-data-dto.ts` — `CurrencyPairUpdateDto`, `ReferenceDataMessage`
- `pricing-dto.ts` — `PriceTickDto`, `PriceHistoryDto`
- `execution-dto.ts` — `ExecutionRequestDto`, `ExecutionResponseDto`
- `blotter-dto.ts` — `TradeDto`, `BlotterMessage`
- `analytics-dto.ts` — `CurrencyPairPositionDto`, `HistoricPositionDto`, `AnalyticsDto`

**Credit DTOs** (`packages/shared/src/credit/`):
- `instrument-dto.ts` — `InstrumentDto`, `InstrumentEvent`
- `dealer-dto.ts` — `DealerDto`, `DealerEvent`
- `workflow-dto.ts` — `WorkflowEvent`, `CreateRfqRequestDto`, `QuoteRequestDto`, etc.

---

## Phase 2: FX Mock Backend ✅

**Package:** `@rtc/domain` (`src/mock/`)

### What was built:

- `reference-data-mock.ts` — Emits 9 pairs after 1s delay, no incremental updates
- `pricing-engine.ts` — Random walk (±0.01%/tick), 50-tick history, 150-1000ms intervals, RFQ quote widening
- `execution-engine.ts` — GBPJPY: Rejected (0-2s). EURJPY: Done (4s). Others: Done (0-2s). Auto-increment IDs from 1. Notifies listeners.
- `trade-store.ts` — Accumulates trades from execution engine, keyed by tradeId, reverse insertion order
- `analytics-engine.ts` — 90-point P&L random walk (±0.5%, 10s intervals), static positions for 9 pairs
- `credit-reference-data-mock.ts` — 11 instruments, 10 dealers (no Adaptive Bank)
- `credit-rfq-engine.ts` — Full RFQ lifecycle: 70% dealer participation, price 91-109, 0-30s response delay

**Tests:** 5 test files covering all mock engines.

---

## Phase 3: Client Shell — Connection, Theme, Layout

**Package:** `@rtc/client-react`

**Specs:**
- `specs/features/shared/connection.feature`
- `specs/features/shared/theme.feature`
- `specs/domain/connection.md`

### Files to create:

```
packages/client-react/src/
  main.tsx                          (update: app providers)
  App.tsx                           (layout: header, workspace, footer)
  theme/
    theme-provider.tsx              (React context, dark/light tokens, persistence)
    theme-toggle.tsx                (header toggle button)
    tokens.ts                       (CSS custom property definitions)
  connection/
    connection-provider.tsx         (React context wrapping domain connection state machine)
    connection-status-bar.tsx       (footer status indicator)
    connection-overlay.tsx          (disconnection/idle overlay)
    use-connection.ts               (hook: exposes ConnectionStatus)
  services/
    service-provider.tsx            (DI container: injects mock or real port implementations)
    mock-service-factory.ts         (creates mock adapters from @rtc/domain/mock)
  layout/
    header.tsx                      (app header with logo, theme toggle, nav)
    footer.tsx                      (status bar, connection indicator)
    workspace.tsx                   (main content area with panels)
```

**Key behaviors:**
- Mock mode: connection status always CONNECTED, no gateway
- Dark theme default, toggle persists
- Footer shows connection status
- Overlay on disconnect/idle/offline

**Deliverable:** Themed app shell with header, footer showing "Connected", empty workspace. Theme toggle works.

---

## Phase 4: FX Live Rates — Tile Grid with Streaming Prices

**Package:** `@rtc/client-react`

**Specs:**
- `specs/features/fx/live-rates.feature`
- `specs/features/fx/price-chart.feature`
- `specs/features/fx/notional-input.feature`
- `specs/domain/fx-trading.md`

### Files to create:

```
packages/client-react/src/
  fx/
    live-rates/
      live-rates-panel.tsx          (grid container with filter tabs and view toggle)
      currency-filter.tsx           (filter tab bar: All, EUR, USD, GBP, etc.)
      view-toggle.tsx               (chart view / price view switch)
      tile/
        tile.tsx                    (single currency pair tile)
        tile-price.tsx              (bid/ask display with movement indicators)
        tile-chart.tsx              (sparkline using 50-tick history)
        tile-notional.tsx           (notional input with k/m parsing, reset, validation)
        tile-header.tsx             (pair label, e.g., EUR/USD)
    hooks/
      use-currency-pairs.ts         (subscribes to ReferenceDataPort)
      use-price-stream.ts           (subscribes to PricingPort, enriches with movement/spread)
      use-price-history.ts          (subscribes to PricingPort history)
      use-notional.ts               (local state: value, validation, RFQ threshold flag)
```

**Key behaviors:**
- 9 tiles in grid, real-time price updates with UP/DOWN indicators
- Spread display formatted per pair
- Currency filter tabs (All, EUR, USD, GBP, AUD, NZD, JPY, CAD)
- Chart/price view toggle (default chart, preference persists)
- Notional input with k/m shortcuts, max validation, RFQ threshold indicator
- Stale data indicators on connection loss

**Deliverable:** Full 9-tile grid with live streaming prices, sparkline charts, currency filters, notional input.

---

## Phase 5: FX Trade Execution + Blotter

**Package:** `@rtc/client-react`

**Specs:**
- `specs/features/fx/spot-trading.feature`
- `specs/features/blotter/trade-display.feature`
- `specs/features/blotter/sorting.feature`
- `specs/features/blotter/filtering.feature`
- `specs/domain/fx-execution.md`

### Files to create:

```
packages/client-react/src/
  fx/
    tile/
      tile-execution.tsx            (Buy/Sell buttons)
      tile-confirmation.tsx         (overlay: Done/Rejected/Timeout/CreditExceeded)
    hooks/
      use-tile-state.ts             (tile state machine: Ready -> Started -> TooLong/Finished/Timeout)
      use-execute-trade.ts          (calls ExecutionPort, timeout, dealt currency)
  blotter/
    fx-blotter.tsx                  (blotter container)
    blotter-grid.tsx                (10-column table)
    blotter-row.tsx                 (highlight animation, rejected strikethrough)
    blotter-header.tsx              (column headers with sort/filter)
    column-sort.ts                  (3-click cycle: none -> desc/asc -> asc/desc -> none)
    column-filter/
      set-filter.tsx                (multi-select checkboxes)
      number-filter.tsx             (comparator + input)
      date-filter.tsx               (comparator + date picker)
      filter-state.ts               (AND combinator)
    quick-filter.tsx                (free-text search)
    csv-export.ts                   (export to RT-Blotter.csv)
    hooks/
      use-trade-stream.ts           (subscribes to BlotterPort / mock trade store)
      use-blotter-state.ts          (SoW processing)
```

**Key behaviors:**
- Tile state machine: Ready → Started → (TooLong at 2s) → (Finished | Timeout at 30s) → Ready (5s auto-dismiss)
- Green overlay for Done, red for Rejected, orange for TooLong/Timeout
- Controls disabled during execution
- 10-column blotter with formatting rules (dates dd-MMM-yyyy, 6 sig digits for rate, etc.)
- 3-click sort cycle, set/number/date filters, AND logic, quick filter
- CSV export with unformatted numbers
- New trade highlight (3s flash), rejected strikethrough

**Deliverable:** Full FX trading cycle: buy/sell → confirmation overlay → blotter with sorting/filtering/export.

---

## Phase 6: FX RFQ Flow

**Package:** `@rtc/client-react`

**Specs:**
- `specs/features/fx/rfq.feature`
- `specs/domain/fx-execution.md` (RFQ state machine section)

### Files to create:

```
packages/client-react/src/
  fx/
    tile/
      tile-rfq.tsx                  (RFQ overlay: Initiate/Cancel/countdown/accept/reject)
      rfq-countdown.tsx             (progress bar countdown timer)
    hooks/
      use-rfq-state.ts              (RFQ state machine: Init -> Requested -> Received -> Rejected)
      use-rfq-quote.ts              (calls PricingPort for RFQ quote, handles timeout)
```

**Key behaviors:**
- RFQ activates when notional >= 10M (NZDUSD starts in RFQ mode by default)
- "Initiate RFQ" replaces Buy/Sell buttons
- Requested state: "Cancel RFQ" button, "Awaiting Price" loading
- Received state: quoted bid/ask with 10s countdown timer + progress bar, "Reject" button
- Quote expiry → Rejected state (shown 2s) → Init with "Requote"
- Notional input disabled during Requested/Received
- Duplicate prevention (one RFQ per tile)

**Deliverable:** Large-notional tiles show RFQ workflow with countdown timer.

---

## Phase 7: Analytics Panel

**Package:** `@rtc/client-react`

**Specs:**
- `specs/features/analytics/profit-and-loss.feature`
- `specs/domain/analytics.md`

### Files to create:

```
packages/client-react/src/
  analytics/
    analytics-panel.tsx             (container)
    pnl-chart.tsx                   (line chart: 90 points, 10s refresh)
    pnl-value.tsx                   (current P&L: formatted, colored)
    position-bubbles.tsx            (draggable bubbles per currency, 15-60px radius)
    pair-pnl-bars.tsx               (horizontal bars per pair, abbreviated notation)
    hooks/
      use-analytics.ts              (subscribes to AnalyticsPort)
      use-pnl-format.ts             (abbreviated notation: k, m)
```

**Key behaviors:**
- P&L line chart with ~90 data points, updates every 10s (rolling window)
- Latest P&L as formatted number, green positive / red negative, +/- prefix
- Position bubbles: one per currency, sized 15-60px by magnitude, draggable with drift-back
- Per-pair P&L bars with abbreviated values, right for positive / left for negative
- Stale data indicator

**Deliverable:** Full analytics panel with live P&L chart, bubble chart, per-pair breakdown.

---

## Phase 8: Credit Reference Data + RFQ Creation

**Packages:** `@rtc/domain`, `@rtc/client-react`

**Specs:**
- `specs/mock-backend/credit-reference-data.md`
- `specs/mock-backend/credit-rfq-engine.md`
- `specs/features/credit/new-rfq.feature`
- `specs/domain/credit-trading.md`

### Files to create:

```
packages/client-react/src/
  credit/
    new-rfq/
      new-rfq-form.tsx              (instrument search, direction toggle, quantity, dealer list)
      instrument-search.tsx         (search by ticker/name/CUSIP)
      dealer-selection.tsx          (multi-select checkbox list)
      quantity-input.tsx            (x1000 multiplier, max validation)
    hooks/
      use-instruments.ts            (subscribes to InstrumentPort)
      use-dealers.ts                (subscribes to DealerPort)
      use-create-rfq.ts             (calls WorkflowPort.createRfq)
```

**Key behaviors:**
- Instrument search matches by ticker, name, CUSIP
- Selecting instrument shows name, CUSIP, maturity, coupon rate
- Direction toggle (Buy/Sell, default Buy)
- Quantity input: user enters X, server receives X × 1,000 (max 100M input)
- All dealers selected by default, individual deselection
- Submit → confirmation with RFQ ID → navigate to RFQ tiles view

**Deliverable:** Credit New RFQ form. Submitting triggers mock dealer responses.

---

## Phase 9: Credit RFQ Tiles + Blotter + Sell-Side

**Package:** `@rtc/client-react`

**Specs:**
- `specs/features/credit/rfq-tiles.feature`
- `specs/features/credit/quote-acceptance.feature`
- `specs/features/credit/credit-blotter.feature`
- `specs/features/credit/sell-side.feature`

### Files to create:

```
packages/client-react/src/
  credit/
    rfq-tiles/
      rfq-tiles-panel.tsx           (card grid with filter tabs)
      rfq-card.tsx                  (single RFQ card)
      quote-card.tsx                (dealer quote with state-based text)
      rfq-countdown.tsx             (countdown timer)
      rfq-filter-tabs.tsx           (Live/All/Done/Expired/Cancelled)
    sell-side/
      sell-side-panel.tsx           (Adaptive Bank RFQs)
      trade-ticket.tsx              (price input, submit/pass)
    blotter/
      credit-blotter.tsx            (10-column grid)
    hooks/
      use-rfq-stream.ts             (subscribes to WorkflowPort, marker-based SoW)
      use-accept-quote.ts           (calls WorkflowPort.accept)
      use-sell-side.ts              (filters Adaptive Bank quotes)
      use-credit-trades.ts          (derives CreditTrade from accepted RFQs)
```

**Key behaviors:**
- RFQ cards with dealer quote cards showing state-based text
- Filter tabs: Live (Open), All, Done (Closed), Expired, Cancelled
- Accept priced quotes → auto-reject others → RFQ closes
- Credit blotter: 10 columns, Trade Date dd-MMM-yyyy, Order Type always "AON"
- Sell-side: separate panel for Adaptive Bank RFQs (not exercisable in mock mode)
- Dismiss control on non-Open RFQs

**Deliverable:** Complete credit trading workflow with RFQ tiles, quote acceptance, blotter.

---

## Phase 10: Server (Marble.js WebSocket) + Admin

**Packages:** `@rtc/server`, `@rtc/client-react`

**Specs:**
- `specs/services/protocol.md`
- All service YAML contracts
- `specs/features/admin/throughput.feature`

### Files to create:

```
packages/server/src/
  ws/
    ws-listener.ts                  (Marble.js WebSocket listener)
    ws-effects.ts                   (route messages to service handlers)
  services/
    reference-data-service.ts
    pricing-service.ts
    execution-service.ts
    blotter-service.ts
    analytics-service.ts
    instrument-service.ts
    dealer-service.ts
    workflow-service.ts
    throughput-service.ts

packages/client-react/src/
  services/
    ws-adapter.ts                   (WebSocket client)
    real-service-factory.ts         (creates real adapters using WS transport)
  admin/
    admin-panel.tsx                 (throughput slider + number input)
    hooks/
      use-throughput.ts             (get/set with 300ms debounce)
```

**Key behaviors:**
- Full WebSocket server on port 4000 implementing all service contracts
- Bulk SoW and marker-based SoW delivery patterns
- Client switches between mock and real mode via env config
- Admin throughput control: slider 0-1000, step 10, 300ms debounce, success/error messages

**Deliverable:** Full server with WebSocket streaming. Client can connect to real server. Admin panel.

---

## Phase 11: E2E Tests + Polish

**Package:** `@rtc/client-react`

**Specs:** Cross-cutting visual behaviors from all feature specs.

### Files to create:

```
packages/client-react/src/
  stale/
    stale-indicator.tsx             (generic stale overlay)
    use-stale-detection.ts          (per-stream stale flag)

packages/client-react/e2e/
  fx-live-rates.spec.ts
  fx-trading.spec.ts
  fx-rfq.spec.ts
  blotter.spec.ts
  connection.spec.ts
  analytics.spec.ts
  credit-rfq.spec.ts
  theme.spec.ts
```

**Key behaviors:**
- Stale data indicators (greyed out, loading) per data stream after reconnection
- New trade highlight animation (3s flash, 1s ease-in-out × 3)
- Rejected trade strikethrough
- View preference persistence (chart/price toggle)
- Row hover effects
- Playwright E2E tests for all major user flows

**Deliverable:** Full E2E test suite. All visual polish. Production-ready.
