# @rtc/domain

Entities, use cases, port interfaces, and simulators — pure TypeScript, the innermost package in the clean-architecture rings.

| | |
|---|---|
| **Ring** | ①② Entities & Use Cases — the yolk (`docs/architecture/01-overview.md` §1.3.1). `src/simulators/` is the one exception: it's ring ③ (gateways) even though it lives in this package — production port implementations, not test doubles. |
| **Runtime deps** | `rxjs` only — the single permitted exception, enforced by pnpm strict mode (`packages/domain/package.json` `dependencies`) |
| **Consumed by** | `@rtc/shared`, `@rtc/client-core`, `@rtc/react-bindings`, `@rtc/client-react`, `@rtc/client-react-native`, `@rtc/server`, and the `tests` workspace — every client and server package plus the behavioural test suite; `@rtc/ws-effects` (rxjs-only) and the isolated `@rtc/client-prototype` do not |
| **Must never import** | `@rtc/shared`, `@rtc/client-react`, or `@rtc/server` (dependency-cruiser rule `domain-stays-pure`, `.dependency-cruiser.cjs`); any Node built-in outside test files (`domain-no-node-builtins` — the package must run in any JS environment, browser or RN). Gate 23 additionally bans `src/ports/__contracts__/` describers from importing `simulators/`, `@rtc/client-react`, or `@rtc/shared/__fixtures__/` (`docs/architecture/12-architectural-gates.md`). |

## Folder map

Seven entity slices, one per business/cross-cutting concern, plus the two ring-crossing folders:

| Path | What lives here |
|---|---|
| `src/fx/` | FX entities — `CurrencyPair`, `Price`/`PriceTick`, `Notional`, `Trade`, currency filtering |
| `src/credit/` | Credit/RFQ entities — `Dealer`, `Instrument`, `Quote`, `Rfq`, `CreditTrade` |
| `src/equities/` | Equities entities — `EquityInstrument`, `EquityQuote`, `Candle`, `DepthBook`, `EquityOrder`, `EquityPosition`, timeframes |
| `src/analytics/` | Position aggregation & PnL formatting — `aggregatePositionsByCurrency`, `netExposureByCurrency`, `formatPnlValue`/`formatScale` |
| `src/connection/` | Connection-status state machine — `ConnectionStatus`, `nextConnectionStatus`, `mapGatewayStatus` |
| `src/preferences/` | User preference types & defaults — theme mode/skin, view mode, boot variant, blotter/watchlist view state |
| `src/telemetry/` | Admin/ops entities — `LogEvent`, `MetricSample`, `SessionInfo`, `ServiceTopology`, the `mulberry32` PRNG |
| `src/ports/` | Port interfaces — the dependency-inverted boundaries every adapter (simulator or `WsAdapter`-backed) implements. Inventory below. |
| `src/usecases/` | Application orchestration — the 12 use cases that sit between presenters and ports. Inventory below. |
| `src/simulators/` | Production in-memory port implementations, used in both simulator mode (in-process) and live mode (hosted on `@rtc/server` behind `@rtc/ws-effects`). Inventory below. |
| `src/__testUtils__/` | Shared test helpers (golden-file loader, `defined()` assertion) — not shipped as part of the public API surface |

### `src/ports/` inventory

Every interface, its declaring file, and the shape it commits adapters to. All 18 are `.ts` files exporting one interface each (`workflowPort.ts` and `orderPort.ts` also export request-shape types alongside the port).

| File | Port interface | Shape |
|---|---|---|
| `adminPort.ts` | `AdminPort` | `getThroughput()` / `setThroughput(value)` — admin-set throughput setpoint |
| `analyticsPort.ts` | `AnalyticsPort` | `getAnalytics(currency)` → `PositionUpdates` |
| `blotterPort.ts` | `BlotterPort` | `getTradeStream()` → `readonly Trade[]` |
| `connectionEventsPort.ts` | `ConnectionEventsPort` | `events()` → `ConnectionEvent` |
| `dealerPort.ts` | `DealerPort` | `getDealers()` → `readonly Dealer[]` |
| `eventLogPort.ts` | `EventLogPort` | `events$()` → `LogEvent` |
| `executionPort.ts` | `ExecutionPort` | `executeTrade(request)` → `Trade` |
| `instrumentPort.ts` | `InstrumentPort` | `getInstruments()` → `readonly Instrument[]` |
| `marketDataPort.ts` | `MarketDataPort` | `watchlist()` / `quotes(symbol)` / `candles(symbol, timeframe?)` / `depth(symbol)` — the four equities market-data streams |
| `orderPort.ts` | `OrderPort` (+ `PlaceOrderRequest`) | `place(req)` → `EquityOrder` lifecycle stream (new→working→partiallyFilled→filled) / `cancel(orderId)` / `orders()` |
| `positionPort.ts` | `PositionPort` | `positions()` → `readonly EquityPosition[]` |
| `preferencesPort.ts` | `PreferencesPort` | Replay-current getter/setter pairs for theme mode, theme skin, view mode, animated background, boot variant, and more |
| `pricingPort.ts` | `PricingPort` (+ `RfqQuoteResult`) | `getPriceUpdates(symbol)` / `getPriceHistory(symbol)` / `getRfqQuote(symbol, pipsPosition)` |
| `referenceDataPort.ts` | `ReferenceDataPort` | `getCurrencyPairs()` → `readonly CurrencyPair[]` |
| `serviceHealthPort.ts` | `ServiceHealthPort` | `topology$()` → `ServiceTopology` |
| `sessionsPort.ts` | `SessionsPort` | `sessions$()` → `readonly SessionInfo[]` |
| `telemetryPort.ts` | `TelemetryPort` | `throughput$()` / `latency$()` / `errorRate$()` — three `MetricSample` streams |
| `workflowPort.ts` | `WorkflowPort` (+ `CreateRfqRequest`, `QuoteRequest`) | `events()` / `createRfq(request)` / `cancelRfq(rfqId)` / `quote(request)` / `pass(quoteId)` / `accept(quoteId)` — the RFQ workflow lifecycle |

`src/ports/__contracts__/` holds one parameterised contract suite per port (e.g. `MarketDataPortContract.ts`, `OrderPortContract.smoke.test.ts`) — a describer function runnable against *any* implementation (simulator or `WsAdapter`-backed), so both are proven to satisfy the same interface.

### `src/simulators/` inventory

20 classes, each a production `implements` of one port above (not a test double — these run in-process in simulator mode and are hosted behind `@rtc/ws-effects` on `@rtc/server` in live mode), plus 5 shared helper modules. Production files only: most simulators also have `.test.ts` / `.contract.test.ts` / `__golden__/` peers in the same folder, deliberately omitted here.

| File | Implements / role |
|---|---|
| `AnalyticsSimulator.ts` | `AnalyticsPort` — position/PnL updates from a hand-maintained `STATIC_POSITIONS` list |
| `ConnectionEventsSimulator.ts` | `ConnectionEventsPort` — emits one one-shot `gatewayConnected` event and completes (no real gateway to simulate) |
| `CreditRfqSimulator.ts` | `WorkflowPort` — RFQ creation/quote/accept lifecycle |
| `DealerSimulator.ts` | `DealerPort` — serves the `DEALERS_CATALOG` constant |
| `EquityMarketDataSimulator.ts` | `MarketDataPort` — watchlist/quotes/candles/depth for equities |
| `EquityOrderSimulator.ts` | `OrderPort` — advances orders `new → working → partiallyFilled → filled`/`rejected` |
| `EquityPositionSimulator.ts` | `PositionPort` — updates positions via `onFill(fill)` |
| `ErrorRateSimulator.ts` | `MetricControl` — error-rate metric walk with perturbation support |
| `EventLogSimulator.ts` | `EventLogPort`, `MetricControl` — admin event-log stream |
| `ExecutionSimulator.ts` | `ExecutionPort` — trade execution (GBPJPY always rejects, EURJPY carries an extra 4s delay, others resolve in 0–2s) |
| `InstrumentSimulator.ts` | `InstrumentPort` — serves the `INSTRUMENTS_CATALOG` constant |
| `LatencySimulator.ts` | `MetricControl` — latency metric walk with perturbation support |
| `PreferencesSimulator.ts` | `PreferencesPort` — in-memory preference store (mirrors the browser/native `PreferencesPort` adapters' shape) |
| `PricingSimulator.ts` | `PricingPort` — FX price ticks, history, and RFQ quotes; seeds from `KNOWN_CURRENCY_PAIRS` |
| `ReferenceDataSimulator.ts` | `ReferenceDataPort` — serves `KNOWN_CURRENCY_PAIRS` |
| `ServiceTopologySimulator.ts` | `ServiceHealthPort`, `MetricControl` — service-topology graph with perturbable node health |
| `SessionSimulator.ts` | `SessionsPort` — active-session list |
| `TelemetrySimulator.ts` | `TelemetryPort` — wraps `ThroughputSimulator` + `LatencySimulator` + `ErrorRateSimulator` behind one facade, `mulberry32`-seeded |
| `ThroughputSimulator.ts` | `AdminPort` — in-memory admin throughput setpoint; rejects non-finite or out-of-`[0,1000]` values by throwing |
| `TradeStoreSimulator.ts` | `BlotterPort` — FX trade blotter stream |
| `gbm.ts` | Helper — `gbmStep()` (one geometric-Brownian-motion-ish price step) and `aggregateCandle()`; re-exports `mulberry32` |
| `metricWalk.ts` | Helper — `METRIC_TICK_MS` cadence constant + pre-seeded rolling-window sample generation shared by the telemetry simulators |
| `perturbation.ts` | Helper — the `Perturbation` type (`"latencySpike" \| "errorBurst" \| "serviceDown"`) and `MetricControl` interface implemented by the perturbable simulators above |
| `seededRandom.ts` | Helper — re-exports the canonical `mulberry32` from `telemetry/prng.ts` |
| `index.ts` | Barrel — re-exports every simulator class + the catalogs/helpers above |

## Where to start reading

1. `src/index.ts` — the package's entire public surface in one file; grouped by slice (FX, Analytics, Connection, Credit, Equities, Ports, Preferences, Simulators, Telemetry, Use Cases)
2. `src/ports/connectionEventsPort.ts` and `src/usecases/ConnectionStatusUseCase.ts` — the smallest complete port→use-case pair; a good template before reading a bigger one
3. `src/usecases/ExecuteTradeUseCase.ts` — a use case that actually enriches data (derives `spotRate` and `dealtCurrency`) rather than just forwarding to a port
4. `src/simulators/index.ts` — the simulator barrel; skim it to see which port each simulator implements before opening individual files

## How it's used

A presenter in `@rtc/client-core` composing a port straight into a use case (`packages/client-core/src/presenters/ConnectionStatusPresenter.ts:1-19`):

```ts
import { type Observable, shareReplay } from "rxjs";

import {
  type ConnectionEventsPort,
  ConnectionStatus,
  ConnectionStatusUseCase,
} from "@rtc/domain";

export class ConnectionStatusPresenter {
  readonly status$: Observable<ConnectionStatus>;

  constructor(
    events: ConnectionEventsPort,
    initial: ConnectionStatus = ConnectionStatus.CONNECTING,
  ) {
    this.status$ = new ConnectionStatusUseCase(events, initial)
      .execute()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
```

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§15.3 FX Trade Execution](../../docs/architecture/15-flows.md#153-fx-trade-execution----click-to-confirmation) — traces a use case (`ExecuteTradeUseCase`) end to end through both simulator and live modes
- [§16 Trailheads, recipes 1 and 2](../../docs/architecture/16-trailheads.md#16-trailheads) — "add a new currency pair" and "add a new port + simulator" both start in this package
