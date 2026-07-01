# Phase 3 Design Spec — Presenters, react-rxjs, Composition Root

**Goal:** Introduce the Application Layer's presenter tier and the react-rxjs hook bridge that turns presenter streams into React hooks. Retire the `ServiceProvider` and `ConnectionProvider` Contexts in favour of a Composition Root that wires the entire dependency graph and exposes hooks through a single `<HooksProvider>`. Make the UI layer truly dumb: it imports hooks, renders state, emits intents.

**Phase scope (chosen during brainstorming):** Full Phase 3 — all 12 hooks bound via react-rxjs, both Contexts retired in this phase. Includes a port evolution (`PricingPort.getRfqQuote`) so `useRfqQuote` stops duck-typing the simulator.

**Status:** Design — not yet planned or implemented.

---

## Revisions

### 2026-05-04 — Post-Phase-2.6 amendments

Phase 2.6 replaced the `AsyncIterable<T>` / `Promise<T>` boundary with `Observable<T>` across `@rtc/domain`. The design in this spec stands intact; only the boundary type changes. Specifically:

- All port methods return `Observable<T>` — including one-shot commands. `AppHooks` command hooks return Observables, not Promises. The two kept hooks (`useExecuteTrade`, `useRfqQuote`) call `firstValueFrom(...)` internally to preserve their `async`/`await` orchestration around `tileState`/`rfqState`.
- Presenters drop the `from(...)` adapter that wrapped use-case calls — use cases already return `Observable<T>`.
- `RfqQuotePresenter.requestQuote()` returns `Observable<RfqQuoteResult>` (bid/ask/mid). Phase 2.6 already added `PricingPort.getRfqQuote(symbol, pipsPosition): Observable<RfqQuoteResult>` and a synchronous Pattern-B impl in `PricingSimulator`. Phase 3 only needs to move the artificial 500–2000 ms delay from the `useRfqQuote` hook into the simulator (extend the existing `defer` with `timer + map`).
- `ConnectionEventsPort.events()` returns `Observable<ConnectionEvent>`; `ConnectionStatusUseCase` becomes an `events.pipe(scan(...), startWith(...))` chain. `BrowserConnectionEventsAdapter` constructs its Observable via `new Observable(subscriber => { /* addEventListener */; return () => /* removeEventListener */ })`.

Affected sections: §2, §3, §4, §5, §6 baseline counts. Architectural decisions (1–10) and §7 sequencing are unchanged.

---

## Architectural Decisions

These decisions were made during brainstorming. They drive every part of the design below.

1. **Presenter shape: hybrid (Option C).** Each presenter has a private `state$: Observable<...>` source of truth, plus public narrow streams derived via `pipe(map, distinctUntilChanged, shareReplay)`. Trivial presenters with one output stream collapse into a single `Observable` exposure; complex ones (`RfqsPresenter`, `ConnectionStatusPresenter`) use the full hybrid pattern.

2. **Hook distribution: factory + `HooksProvider` Context (Option B).** `createApp(ports?): AppHooks` returns a bundle of bound hooks. A small `<HooksProvider hooks={...}>` distributes them. Components do `const { useXxx } = useHooks()`. The Context distributes hooks (already bound to streams), not services. Spirit of "no DI in UI" preserved — components never see ports or use cases.

3. **Pure pass-through hooks deleted, not replaced.** Wrapper hooks that exist only to call `useServices()` and pass through (`usePriceStream`, `usePriceHistory`, `useAnalytics`, `useCurrencyPairs`, `useTradeStream`, `useInstruments`, `useDealers`, `useConnection`, `useRfqStream`, `useCreateRfq`) are deleted in this phase. Their ~13 consumer components migrate to `const { useXxx } = useHooks()`.

4. **Two hooks kept** — `useExecuteTrade` and `useRfqQuote`. Both orchestrate per-component state machines (`tileState`, `rfqState`). They become thin React adapters fusing a bound hook with a state machine. Deleting them would push that orchestration into 5+ component files.

5. **`version` counter dropped.** `usePriceStream`'s `version` field was a workaround for not exposing `Price` reference identity. With react-rxjs, every emit produces a new `Price` reference; `useStaleDetection` updates to track the `Price` reference (or its `creationTimestamp`) instead.

6. **`PricingPort.getRfqQuote(symbol, pipsPosition): Observable<RfqQuoteResult>`** is already in place after Phase 2.6 (synchronous Pattern-B emission via `defer + of`). Phase 3 moves the artificial 500–2000 ms delay from the `useRfqQuote` hook into the simulator (extending the existing `defer` with `timer + map`). The hook awaits the single emission via `firstValueFrom`.

7. **`ConnectionEventsPort` introduced.** The browser-event listening (mouse activity, online/offline, idle timer) currently inside `ConnectionProvider.tsx` becomes a `BrowserConnectionEventsAdapter` that implements the new port. The state machine (`nextConnectionStatus`) — already in `@rtc/domain` — runs through a `ConnectionStatusUseCase` and a `ConnectionStatusPresenter`.

8. **No new module-level singletons.** Composition runs at the React root (`main.tsx`), not at module load. Tests can `createApp(stubPorts)` and render with their own `<HooksProvider>` — no `vi.mock` required.

9. **Folder reorganisation deferred to Phase 4.** Phase 3 creates `packages/client/src/app/` for new files (presenters, composition root, port adapters, hooks provider) but leaves existing `ui`-shaped code where it is. The full `app/` vs `ui/` split is Phase 4.

10. **Component-level tests deferred to Phase 5.** Phase 3 adds presenter tests in vitest but does not add `@testing-library/react` / `renderHook` tests. Hook+component coverage relies on Playwright e2e plus the architectural guarantee that hooks are pure react-rxjs bindings.

---

## 1. Architecture Overview

Phase 3 introduces two new layers in `@rtc/client` and retires two React Contexts.

**New layers**:
- `packages/client/src/app/presenters/*.ts` — RxJS presenter classes wrapping use cases. No React imports. Each exposes one or more `Observable<T>` streams.
- `packages/client/src/app/composition.ts` — `createApp(ports?): AppHooks` function that constructs the dependency graph and returns bound hooks.
- `packages/client/src/app/HooksProvider.tsx` — Tiny React Context (`HooksContext`) + `<HooksProvider>` + `useHooks()` consumer.
- `packages/client/src/app/adapters/*.ts` — Plain-TS port adapters (the WS adapter, the simulator factory, the WS-real factory, the browser connection events adapter). Absorbs today's `services/WsAdapter.ts`, `services/mockServiceFactory.ts`, `services/realServiceFactory.ts`.

**Retired**:
- `packages/client/src/services/ServiceProvider.tsx` — DELETED.
- `packages/client/src/services/mockServiceFactory.ts` and `realServiceFactory.ts` — MERGED into a single `packages/client/src/app/adapters/portFactory.ts` exporting `createSimulatorPorts()` and `createWsRealPorts(ws)`. Original two files deleted.
- `packages/client/src/services/WsAdapter.ts` — moved verbatim to `packages/client/src/app/adapters/WsAdapter.ts` (no logic change).
- `packages/client/src/services/` directory itself is removed once empty.
- `packages/client/src/connection/ConnectionProvider.tsx` — DELETED. Browser event listening moves into `BrowserConnectionEventsAdapter`.
- `packages/client/src/connection/useConnection.ts` — DELETED. Replaced by `useConnectionStatus()` from `useHooks()`.

**Domain additions (in `@rtc/domain`)**:
- `packages/domain/src/ports/connectionEventsPort.ts` — new `ConnectionEventsPort` interface.
- `packages/domain/src/ports/pricingPort.ts` — already has `getRfqQuote(symbol, pipsPosition): Observable<RfqQuoteResult>` (added in Phase 2.6). Phase 3 moves the artificial delay from the `useRfqQuote` hook into the simulator's existing `defer` block (extends with `timer + map`); no port-interface change.
- `packages/domain/src/usecases/` — 6 new use cases:
  - `CurrencyPairsUseCase`
  - `TradeBlotterUseCase`
  - `InstrumentsUseCase`
  - `DealersUseCase`
  - `ConnectionStatusUseCase`
  - `RfqQuoteUseCase`

**Dependency graph after Phase 3**:

```
React component
  └─→ const { useXxx } = useHooks()
       └─→ HooksContext (created at root by HooksProvider)
            └─→ AppHooks bundle (output of createApp())
                 └─→ react-rxjs bind(presenter.stream$)
                      └─→ presenter
                           ├─→ private state$ source
                           └─→ use case (domain)
                                └─→ port adapter (simulator or WsReal)
                                     └─→ WsAdapter or in-process simulator
```

No `useServices()`, no `useContext(ConnectionContext)`, no service-locator pattern anywhere.

---

## 2. Presenter Pattern (Hybrid)

Each presenter is a class with: ports/use-cases injected in the constructor → private `state$` source → public narrow streams.

### Trivial case — `PriceStreamPresenter`

Single output stream cached per `CurrencyPair.symbol`:

```ts
// packages/client/src/app/presenters/PriceStreamPresenter.ts
import { type Observable, shareReplay } from "rxjs";
import {
  type CurrencyPair, type Price,
  PriceStreamUseCase,
  type PricingPort,
} from "@rtc/domain";

export class PriceStreamPresenter {
  private readonly cache = new Map<string, Observable<Price>>();
  constructor(private readonly pricing: PricingPort) {}

  price$(pair: CurrencyPair): Observable<Price> {
    const key = pair.symbol;
    let stream = this.cache.get(key);
    if (!stream) {
      const useCase = new PriceStreamUseCase(this.pricing);
      stream = useCase.execute(pair).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this.cache.set(key, stream);
    }
    return stream;
  }
}
```

`shareReplay({ bufferSize: 1, refCount: true })` ensures multiple FX tiles for the same pair share one underlying subscription, and the upstream simulator's teardown (Pattern A — see Phase 2.6) fires when the last tile unmounts.

### Hybrid case — `RfqsPresenter`

One source of truth, multiple narrow streams:

```ts
// packages/client/src/app/presenters/RfqsPresenter.ts
import { map, distinctUntilChanged, shareReplay, type Observable } from "rxjs";
import {
  type Quote, type Rfq, type RfqStreamState,
  WorkflowEventStreamUseCase,
  CreateRfqUseCase, type CreateRfqInput,
  type WorkflowPort,
} from "@rtc/domain";

export class RfqsPresenter {
  private readonly state$: Observable<RfqStreamState>;
  readonly rfqs$: Observable<readonly Rfq[]>;
  readonly allQuotes$: Observable<ReadonlyMap<number, Quote>>;
  private readonly quotesByRfqCache = new Map<number, Observable<readonly Quote[]>>();

  constructor(private readonly workflow: WorkflowPort) {
    const events = new WorkflowEventStreamUseCase(this.workflow);
    this.state$ = events.execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this.rfqs$ = this.state$.pipe(
      map((s) => Array.from(s.rfqs.values())),
      distinctUntilChanged(shallowArrayEquals),
    );
    this.allQuotes$ = this.state$.pipe(map((s) => s.quotes));
  }

  quotesForRfq$(rfqId: number): Observable<readonly Quote[]> {
    let stream = this.quotesByRfqCache.get(rfqId);
    if (!stream) {
      stream = this.state$.pipe(
        map((s) => Array.from(s.quotes.values()).filter((q) => q.rfqId === rfqId)),
        distinctUntilChanged(shallowArrayEquals),
      );
      this.quotesByRfqCache.set(rfqId, stream);
    }
    return stream;
  }

  createRfq(input: CreateRfqInput): Observable<number> {
    return new CreateRfqUseCase(this.workflow).execute(input);
  }

  // acceptQuote, cancelRfq, passQuote return Observable<void> and follow the same pattern.
}

function shallowArrayEquals<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
```

Notes:
- `state$` is the single source of truth; `rfqs$` and `quotesForRfq$(id)` are derived. No state desync.
- `distinctUntilChanged(shallowArrayEquals)` prevents downstream re-renders when array content is reference-equal.
- Commands (`createRfq`, etc.) are methods that delegate to command use cases — they return one-shot `Observable<T>`, uniform with the streams. Callers that need imperative `await` semantics use `firstValueFrom(...)`.
- `allQuotes$` exposes `ReadonlyMap` cleanly. The Phase 2 `Map<>` cast workaround is gone.

### Presenter inventory (11 total)

| Presenter | Streams | Commands | Notes |
|---|---|---|---|
| `PriceStreamPresenter` | `price$(pair)` | — | Cache by symbol |
| `PriceHistoryPresenter` | `history$(symbol)` | — | Cache by symbol |
| `TradeExecutionPresenter` | — | `execute(input)` | Command-only |
| `BlotterPresenter` | `trades$` | — | One stream |
| `AnalyticsPresenter` | `position$` | — | One stream |
| `RfqsPresenter` | `rfqs$`, `allQuotes$`, `quotesForRfq$(id)` | `createRfq`, `acceptQuote`, `cancelRfq`, `passQuote` | Hybrid |
| `CurrencyPairsPresenter` | `pairs$` | — | One stream |
| `InstrumentsPresenter` | `list$` | — | One stream |
| `DealersPresenter` | `list$` | — | One stream |
| `ConnectionStatusPresenter` | `status$` | — | Wraps `ConnectionStatusUseCase` |
| `RfqQuotePresenter` | — | `requestQuote(symbol)` | Command-only |

**Tests**: each presenter gets a vitest spec in `packages/client/src/app/presenters/__tests__/`. Stub ports inline (same approach as use-case tests). For hybrid presenters, assert that derived streams emit the expected projections AND that `distinctUntilChanged` suppresses duplicate emissions.

---

## 3. Composition Root

`createApp(ports?): AppHooks` is a pure factory: takes ports (defaults to env-driven choice between simulator and WS-real), constructs presenters, calls `bind()` per stream, returns a bundle of hooks.

`<HooksProvider hooks={...}>` distributes the bundle. `useHooks()` reads it.

```ts
// packages/client/src/app/composition.ts
import { bind } from "@react-rxjs/core";
import { useCallback } from "react";
import type { Observable } from "rxjs";
import {
  // Use cases
  CurrencyPairsUseCase, TradeBlotterUseCase, InstrumentsUseCase,
  DealersUseCase, ConnectionStatusUseCase, RfqQuoteUseCase,
  // Domain types
  type CurrencyPair, type Price, type PriceTick, type Trade, type Rfq, type Quote,
  type PositionUpdates, type Instrument, type Dealer, type ConnectionStatus,
  type ExecuteTradeInput, type ExecuteTradeResult, type CreateRfqInput,
  // Ports
  type PricingPort, type ExecutionPort, type BlotterPort, type AnalyticsPort,
  type ReferenceDataPort, type InstrumentPort, type DealerPort, type WorkflowPort,
  type ConnectionEventsPort,
} from "@rtc/domain";

import { PriceStreamPresenter } from "./presenters/PriceStreamPresenter";
import { PriceHistoryPresenter } from "./presenters/PriceHistoryPresenter";
import { TradeExecutionPresenter } from "./presenters/TradeExecutionPresenter";
import { BlotterPresenter } from "./presenters/BlotterPresenter";
import { AnalyticsPresenter } from "./presenters/AnalyticsPresenter";
import { RfqsPresenter } from "./presenters/RfqsPresenter";
import { CurrencyPairsPresenter } from "./presenters/CurrencyPairsPresenter";
import { InstrumentsPresenter } from "./presenters/InstrumentsPresenter";
import { DealersPresenter } from "./presenters/DealersPresenter";
import { ConnectionStatusPresenter } from "./presenters/ConnectionStatusPresenter";
import { RfqQuotePresenter } from "./presenters/RfqQuotePresenter";

import { WsAdapter } from "./adapters/WsAdapter";
import { createWsRealPorts, createSimulatorPorts } from "./adapters/portFactory";
import { BrowserConnectionEventsAdapter } from "./adapters/BrowserConnectionEventsAdapter";

export interface AppPorts {
  pricing: PricingPort;
  execution: ExecutionPort;
  blotter: BlotterPort;
  analytics: AnalyticsPort;
  referenceData: ReferenceDataPort;
  instruments: InstrumentPort;
  dealers: DealerPort;
  workflow: WorkflowPort;
  connectionEvents: ConnectionEventsPort;
}

export interface AppHooks {
  // Streams
  usePrice: (pair: CurrencyPair) => Price;
  usePriceHistory: (symbol: string) => readonly PriceTick[];
  useTrades: () => readonly Trade[];
  useAnalytics: () => PositionUpdates | null;
  useRfqs: () => readonly Rfq[];
  useQuotesForRfq: (rfqId: number) => readonly Quote[];
  useAllQuotes: () => ReadonlyMap<number, Quote>;
  useCurrencyPairs: () => readonly CurrencyPair[];
  useInstruments: () => readonly Instrument[];
  useDealers: () => readonly Dealer[];
  useConnectionStatus: () => ConnectionStatus;
  // Commands (each returns a stable callback; one-shot Observables, callers
  // wrap with firstValueFrom when imperative await is needed)
  useExecuteTrade: () => (input: ExecuteTradeInput) => Observable<ExecuteTradeResult>;
  useCreateRfq: () => (input: CreateRfqInput) => Observable<number>;
  useAcceptQuote: () => (quoteId: number) => Observable<void>;
  useCancelRfq: () => (rfqId: number) => Observable<void>;
  usePassQuote: () => (quoteId: number) => Observable<void>;
  useRequestRfqQuote: () => (symbol: string, pipsPosition: number) => Observable<RfqQuoteResult>;
}

export function buildDefaultPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const transportPorts = url ? createWsRealPorts(new WsAdapter(url)) : createSimulatorPorts();
  return {
    ...transportPorts,
    connectionEvents: new BrowserConnectionEventsAdapter(),
  };
}

export function createApp(ports: AppPorts = buildDefaultPorts()): AppHooks {
  const presenters = {
    priceStream: new PriceStreamPresenter(ports.pricing),
    priceHistory: new PriceHistoryPresenter(ports.pricing),
    execution: new TradeExecutionPresenter(ports.execution),
    blotter: new BlotterPresenter(ports.blotter),
    analytics: new AnalyticsPresenter(ports.analytics),
    rfqs: new RfqsPresenter(ports.workflow),
    currencyPairs: new CurrencyPairsPresenter(ports.referenceData),
    instruments: new InstrumentsPresenter(ports.instruments),
    dealers: new DealersPresenter(ports.dealers),
    connection: new ConnectionStatusPresenter(ports.connectionEvents),
    rfqQuote: new RfqQuotePresenter(ports.pricing),
  };

  const [usePrice] = bind((pair: CurrencyPair) => presenters.priceStream.price$(pair));
  const [usePriceHistory] = bind((symbol: string) => presenters.priceHistory.history$(symbol), []);
  const [useTrades] = bind(presenters.blotter.trades$, []);
  const [useAnalytics] = bind(presenters.analytics.position$, null);
  const [useRfqs] = bind(presenters.rfqs.rfqs$, []);
  const [useQuotesForRfq] = bind((rfqId: number) => presenters.rfqs.quotesForRfq$(rfqId), []);
  const [useAllQuotes] = bind(presenters.rfqs.allQuotes$, new Map());
  const [useCurrencyPairs] = bind(presenters.currencyPairs.pairs$, []);
  const [useInstruments] = bind(presenters.instruments.list$, []);
  const [useDealers] = bind(presenters.dealers.list$, []);
  const [useConnectionStatus] = bind(presenters.connection.status$, "CONNECTING" as ConnectionStatus);

  return {
    usePrice, usePriceHistory, useTrades, useAnalytics,
    useRfqs, useQuotesForRfq, useAllQuotes,
    useCurrencyPairs, useInstruments, useDealers, useConnectionStatus,
    useExecuteTrade: () => useCallback(
      (input) => presenters.execution.execute(input), [],
    ),
    useCreateRfq: () => useCallback(
      (input) => presenters.rfqs.createRfq(input), [],
    ),
    useAcceptQuote: () => useCallback(
      (quoteId) => presenters.rfqs.acceptQuote(quoteId), [],
    ),
    useCancelRfq: () => useCallback(
      (rfqId) => presenters.rfqs.cancelRfq(rfqId), [],
    ),
    usePassQuote: () => useCallback(
      (quoteId) => presenters.rfqs.passQuote(quoteId), [],
    ),
    useRequestRfqQuote: () => useCallback(
      (symbol) => presenters.rfqQuote.requestQuote(symbol), [],
    ),
  };
}
```

```tsx
// packages/client/src/app/HooksProvider.tsx
import { createContext, useContext, type ReactNode } from "react";
import type { AppHooks } from "./composition";

const HooksContext = createContext<AppHooks | null>(null);

export function HooksProvider({ hooks, children }: { hooks: AppHooks; children: ReactNode }) {
  return <HooksContext.Provider value={hooks}>{children}</HooksContext.Provider>;
}

export function useHooks(): AppHooks {
  const ctx = useContext(HooksContext);
  if (!ctx) throw new Error("useHooks must be used within HooksProvider");
  return ctx;
}
```

```tsx
// packages/client/src/main.tsx (root)
import { createApp } from "./app/composition";
import { HooksProvider } from "./app/HooksProvider";

const hooks = createApp();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <HooksProvider hooks={hooks}>
    <App />
  </HooksProvider>
);
```

```tsx
// example consumer
function Tile({ pair }: { pair: CurrencyPair }) {
  const { usePrice } = useHooks();
  const price = usePrice(pair);
  return <div>{price.bid}</div>;
}
```

**Tests**: `createApp(stubPorts)` returns the same `AppHooks` interface; tests render with their own `<HooksProvider>`. No `vi.mock` required.

---

## 4. Port Evolution

### `PricingPort.getRfqQuote` — already present, simulator delay to move

Phase 2.6 added the method:

```ts
// packages/domain/src/ports/pricingPort.ts (already in place)
import type { Observable } from "rxjs";

export interface RfqQuoteResult {
  readonly bid: number;
  readonly ask: number;
  readonly mid: number;
}

export interface PricingPort {
  getPriceUpdates(symbol: string): Observable<PriceTick>;
  getPriceHistory(symbol: string): Observable<readonly PriceTick[]>;
  getRfqQuote(symbol: string, pipsPosition: number): Observable<RfqQuoteResult>;
}
```

**Simulator change in Phase 3** — extend the existing synchronous `defer + of` block with a `timer + map` to internalise the 500–2000 ms delay that today lives in the `useRfqQuote` hook:

```ts
// packages/domain/src/simulators/PricingSimulator.ts
import { defer, map, of, throwError, timer } from "rxjs";

getRfqQuote(symbol: string, pipsPosition: number): Observable<RfqQuoteResult> {
  return defer(() => {
    const state = this.pairs.get(symbol);
    if (!state) return throwError(() => new Error(`Unknown symbol: ${symbol}`));
    const priceChange = 0.3 / Math.pow(10, pipsPosition);
    const delayMs = 500 + Math.floor(Math.random() * 1500);
    return timer(delayMs).pipe(
      map(() => ({
        ask: state.mid + HALF_SPREAD + priceChange,
        bid: state.mid - HALF_SPREAD - priceChange,
        mid: state.mid,
      })),
    );
  });
}
```

**WS-real adapter** (`realServiceFactory.ts` adapter): already sends `rpc.getRfqQuote` and returns the result — no change needed beyond the simulator-side delay (server forwards from `PricingSimulator`, which now embeds the delay).

**`RfqQuoteUseCase`** in `packages/domain/src/usecases/`:

```ts
import type { Observable } from "rxjs";
import type { PricingPort, RfqQuoteResult } from "../ports/pricingPort.js";

export class RfqQuoteUseCase {
  constructor(private readonly pricing: PricingPort) {}
  execute(symbol: string, pipsPosition: number): Observable<RfqQuoteResult> {
    return this.pricing.getRfqQuote(symbol, pipsPosition);
  }
}
```

### `ConnectionEventsPort` (new)

```ts
// packages/domain/src/ports/connectionEventsPort.ts
import type { Observable } from "rxjs";
import type { ConnectionEvent } from "../connection/connectionStatus.js";

export interface ConnectionEventsPort {
  events(): Observable<ConnectionEvent>;
}
```

`ConnectionStatusUseCase` consumes events from this port and folds them through `nextConnectionStatus` into a stream of `ConnectionStatus`:

```ts
import { scan, startWith, type Observable } from "rxjs";

export class ConnectionStatusUseCase {
  constructor(
    private readonly events: ConnectionEventsPort,
    private readonly initial: ConnectionStatus = "CONNECTING",
  ) {}

  execute(): Observable<ConnectionStatus> {
    return this.events.events().pipe(
      scan((state, event) => nextConnectionStatus(state, event), this.initial),
      startWith(this.initial),
    );
  }
}
```

**`BrowserConnectionEventsAdapter`** in `packages/client/src/app/adapters/`: implements `ConnectionEventsPort` by listening to browser events (mouse/keyboard/online/offline) and the idle timer, emitting the corresponding `ConnectionEvent`s. Absorbs the event-listening logic from today's `ConnectionProvider.tsx`. The state machine is no longer in the adapter — it's in the use case. Construction pattern (DOM listeners with explicit teardown):

```ts
import { Observable } from "rxjs";

events(): Observable<ConnectionEvent> {
  return new Observable<ConnectionEvent>((subscriber) => {
    const onActivity = () => subscriber.next({ type: "activity" });
    const onOnline = () => subscriber.next({ type: "online" });
    const onOffline = () => subscriber.next({ type: "offline" });
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const idleTimer = setInterval(() => subscriber.next({ type: "idleTick" }), IDLE_INTERVAL_MS);
    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(idleTimer);
    };
  });
}
```

(Exact `ConnectionEvent` payload shape comes from the existing `@rtc/domain/connection/connectionStatus.ts`; the snippet above is illustrative.)

---

## 5. Hook Migration

The 12 hooks divide into three groups.

### Deleted (10 hooks)

These hooks are pure pass-throughs. After Phase 3 they no longer exist.

> **Amendment (2026-06-26):** the `Replacement` column below originally
> prescribed the chained `useHooks().useX()` form. That form is now banned by
> ESLint (`no-restricted-syntax`, `MemberExpression[object.callee.name='useHooks']`
> in `eslint.config.mjs`). The canonical form is **destructure first, then call**:
> `const { useX } = useHooks(); const x = useX(args);`. The column has been
> updated to the destructured form.

| Hook | Replacement (destructure first, then call) |
|---|---|
| `usePriceStream(pair)` | `const { usePrice } = useHooks();` → `usePrice(pair)` |
| `usePriceHistory(symbol)` | `const { usePriceHistory } = useHooks();` → `usePriceHistory(symbol)` |
| `useAnalytics()` | `const { useAnalytics } = useHooks();` → `useAnalytics()` |
| `useCurrencyPairs()` | `const { useCurrencyPairs } = useHooks();` → `useCurrencyPairs()` |
| `useTradeStream()` | `const { useTrades } = useHooks();` → `useTrades()` |
| `useInstruments()` | `const { useInstruments } = useHooks();` → `useInstruments()` |
| `useDealers()` | `const { useDealers } = useHooks();` → `useDealers()` |
| `useConnection()` | `const { useConnectionStatus } = useHooks();` → `useConnectionStatus()` |
| `useRfqStream()` | Three hooks: `useRfqs()`, `useQuotesForRfq(rfqId)`, `useAllQuotes()` |
| `useCreateRfq()` | `const { useCreateRfq } = useHooks();` → `useCreateRfq()` |

For the `useRfqStream` consumers (3 components), the migration is:

```tsx
// before
const { rfqs, getQuotesForRfq, allQuotes } = useRfqStream();
// ... in row: const quotes = getQuotesForRfq(rfq.id);

// after
const { useRfqs, useQuotesForRfq, useAllQuotes } = useHooks();
const rfqs = useRfqs();
const allQuotes = useAllQuotes();
// ... in row: const quotes = useQuotesForRfq(rfq.id);
```

The `useQuotesForRfq(id)` per-row pattern gives fine-grained reactivity: each row only re-renders when its own quote list changes.

### Kept (2 hooks)

These hooks fuse a bound hook with a per-component state machine. They remain as thin React adapters.

**`useExecuteTrade(pair, tileState)`** — orchestrates `tileState.start()` / `tileState.finish(status, trade)` around an `executeTrade` callback. The presenter returns `Observable<ExecuteTradeResult>`; the adapter awaits the single emission via `firstValueFrom`:

```ts
// after Phase 3
import { useCallback } from "react";
import { firstValueFrom } from "rxjs";
import { useHooks } from "../../app/HooksProvider";
import { ExecutionStatus, type CurrencyPair, type Direction, type Price } from "@rtc/domain";
import type { UseTileStateResult } from "./useTileState";

export function useExecuteTrade(pair: CurrencyPair, tileState: UseTileStateResult) {
  const { useExecuteTrade } = useHooks();
  const execute = useExecuteTrade();
  return useCallback(
    async (direction: Direction, price: Price, notional: number) => {
      tileState.start();
      try {
        const { status, trade } = await firstValueFrom(
          execute({ pair, direction, price, notional }),
        );
        tileState.finish(status, trade);
      } catch {
        tileState.finish(ExecutionStatus.Timeout);
      }
    },
    [pair, execute, tileState],
  );
}
```

**`useRfqQuote(pair, rfqState)`** — orchestrates `rfqState.requested()` / `rfqState.received(quote)` / `rfqState.rejected()` around a `requestQuote` callback. Same `firstValueFrom` adaptation:

```ts
// after Phase 3
import { useCallback } from "react";
import { firstValueFrom } from "rxjs";
import { useHooks } from "../../app/HooksProvider";
import type { CurrencyPair } from "@rtc/domain";
import type { UseRfqStateResult } from "./useRfqState";

export function useRfqQuote(pair: CurrencyPair, rfqState: UseRfqStateResult) {
  const { useRequestRfqQuote } = useHooks();
  const requestQuote = useRequestRfqQuote();
  return useCallback(async () => {
    rfqState.requested();
    try {
      const quote = await firstValueFrom(requestQuote(pair.symbol));
      rfqState.received(quote);
    } catch {
      rfqState.rejected();
    }
  }, [pair.symbol, requestQuote, rfqState]);
}
```

### Untouched (UI-only state machines)

These hooks have no port access and need no migration: `useNotional`, `useTileState`, `useRfqState`, `useStaleDetection`, `useThroughput`. They stay where they are.

**One small update**: `useStaleDetection.ts` currently watches the `version` counter from `usePriceStream`. After Phase 3 it watches the `Price` reference itself (which changes per tick). One-line change:

```ts
// before
useEffect(() => { resetStaleTimer(); }, [version]);

// after
useEffect(() => { resetStaleTimer(); }, [price]);
```

---

## 6. Test Strategy

### Use case tests (~6 new)

The 6 new domain use cases each get a vitest file with stub-port tests. Pattern matches Phase 2 exactly:
- `CurrencyPairsUseCase`, `TradeBlotterUseCase`, `InstrumentsUseCase`, `DealersUseCase`: ~1–2 tests each (port stub yields, use case pipes through).
- `ConnectionStatusUseCase`: tests for the state transition through `nextConnectionStatus` over a stream of stub events. ~3–4 tests.
- `RfqQuoteUseCase`: tests for delegation to `pricing.getRfqQuote`. ~1–2 tests.

Domain test count grows from 104 → ~118 (Phase 2.6 left domain at 104; +14 for the 6 new use cases).

### Presenter tests (~40–50 new)

New layer in `@rtc/client`. One test file per presenter in `packages/client/src/app/presenters/__tests__/`. Each file:
- Builds the presenter with stub ports (inline, copy-paste OK).
- Subscribes to streams; drives the stub; asserts emitted values.
- For hybrid presenters: asserts derived narrow streams emit correctly, that `distinctUntilChanged` suppresses duplicates, and that `state$` is the single source of truth.

**Pre-Phase-3 setup**: confirm `packages/client/vitest.config.ts` runs cleanly with no test files (today there are none). Add one trivial smoke test if needed to verify the harness works before adding presenter tests.

Client test count grows from 0 → ~40–50.

### E2E (40 unchanged)

E2E is the canary for hook migration. Run after each migration task. The fx-trading and credit-rfq specs are the highest-risk: any regression in trade execution or RFQ flow surfaces here.

### Deferred to Phase 5

- Component-level (renderHook / RTL) tests.
- Gherkin specs and page objects.
- Port contract tests (parameterised over simulator vs WS-real adapters).

### Phase 3 final test counts

- Unit: 109 (Phase 2.6 end: 104 domain + 5 server) + ~54–64 (≈14 new domain + ~40–50 new client presenter) = **~163–173**.
- E2E: 40 (unchanged).

---

## 7. Phase Scope and Ordering

### In scope

- Domain: 1 new port (`ConnectionEventsPort`), 1 port evolution (`PricingPort.getRfqQuote`), 6 new use cases.
- Client: 11 presenters, Composition Root, `HooksProvider` Context, `BrowserConnectionEventsAdapter`, `portFactory` adapters relocated under `app/adapters/`.
- 12 hooks migrated: 10 deleted, 2 thinned and rebased on `useHooks()`.
- ~13 consumer components migrated.
- `useStaleDetection.ts` updated.
- Deletion: `services/ServiceProvider.tsx`, `services/mockServiceFactory.ts`, `services/realServiceFactory.ts`, `services/WsAdapter.ts` (relocated, not strictly deleted), `connection/ConnectionProvider.tsx`, `connection/useConnection.ts`.
- New dependency: `@react-rxjs/core` in `@rtc/client`.

### Out of scope (deferred)

- Folder reorganisation (`app/` vs `ui/`) — Phase 4. Phase 3 creates `app/` for new files only.
- Gherkin specs and test infrastructure — Phase 5.
- Component-level (renderHook / RTL) tests — Phase 5.

### Ordering strategy

Safety first — keep the app running at every commit. The new world is built alongside the old; the old is deleted last.

1. **Domain additions** — `ConnectionEventsPort`, 6 new use cases, `PricingPort.getRfqQuote` evolution (port + simulator + WS-real adapter + server route). App unaffected.
2. **Presenters** — added in `app/presenters/` but no UI consumes them yet. Tested in isolation.
3. **Composition root scaffolding** — `createApp()`, `HooksProvider`, `useHooks()`. `BrowserConnectionEventsAdapter` added. Wired into `main.tsx` so `<HooksProvider>` exists at the top of the tree, but consumers still use `ServiceProvider`/`useServices`. Both Contexts coexist.
4. **Hook migration, feature area by feature area** —
   - FX (price-stream, price-history, execute-trade, rfq-quote) — highest risk for trade execution.
   - Credit (rfq-stream, create-rfq, instruments, dealers).
   - Blotter, Analytics, Reference Data.
   - Connection (the most invasive — Context retirement).
   E2E run after each area.
5. **Cleanup** — delete `ServiceProvider`, `mockServiceFactory`, `realServiceFactory`, `ConnectionProvider`, the deleted wrapper hooks, `useConnection`. Verify zero references remain.
6. **Final verification + docs** — full unit + e2e suite green; architecture.md §11 updated to mark Composition Root and presenters as implemented.

### Approximate task count

12–14 tasks. Larger than Phase 1 (11) or Phase 2 (8). Subagent-driven execution: ~30–40 dispatches.

### Highest-risk paths

- **FX trade execution** — preserving `tileState` orchestration unchanged through a hook that's now react-rxjs-bound.
- **RFQ tiles** — 3 consumers of `useRfqStream`, all migrate together; biggest single component change.
- **Connection overlay** — Context retirement; the connection state machine moves through a port + adapter + use case + presenter chain.

### Definition of done

- All 12 hooks bound via `useHooks()` (10 deleted, 2 thinned).
- `grep -rn "useServices\|ServiceProvider" packages/client/src` yields zero matches.
- `grep -rn "ConnectionContext\|ConnectionProvider" packages/client/src` yields zero matches.
- `grep -rn "from \"\.\./services" packages/client/src` yields zero matches (the services/ directory is gone).
- Unit tests: ~163–173. E2E: 40 (unchanged).
- `@rtc/domain` single-runtime-dep invariant intact (rxjs only, established in Phase 2.6).
- `architecture.md` §11 updated.
