# Phase 2.6 — RxJS `Observable<T>` boundary design

**Date:** 2026-05-03

## Goal

Replace `AsyncIterable<T>` (and `Promise<T>`) at the `@rtc/domain` boundary with RxJS `Observable<T>`. Make RxJS the single explicit exception to the "zero runtime deps in domain" rule. This is the foundation Phase 3 (presenters + react-rxjs + Composition Root) builds on.

## Brainstorm decisions

1. **Boundary type:** every port method returns `Observable<T>` — streams *and* one-shot ops. No mixed `Promise<T>` / `Observable<T>` API.
2. **Simulators:** rewrite all 8 to idiomatic rxjs. No `async function*` generators remain in `@rtc/domain`.
3. **Tests:** subscribe + collect with `vi.useFakeTimers()`. No marble testing.
4. **Sequencing:** vertical slices per port. Build green at every commit.

---

## 1. Scope & dependency model

### What changes

- All 8 port interfaces in `packages/domain/src/ports/` switch from `AsyncIterable<T>` / `Promise<T>` returns to `Observable<T>`.
- All 6 use cases in `packages/domain/src/usecases/` adapt accordingly.
- All 8 simulators in `packages/domain/src/simulators/` are rewritten using rxjs primitives.
- Domain unit tests migrate from `for await … of` patterns to `subscribe + collect` (or `firstValueFrom`).
- Hook consumers in `@rtc/client` adapt to `Observable<T>` via `subscribe` inside `useEffect`. *(These hooks get retired in Phase 3 anyway, so this is a stopgap — minimal changes.)*
- Server-side WS wiring narrows from `AsyncIterable` to `Observable`. Server already uses RxJS via Marble.js.

### Dependency change

- Add `"rxjs": "^7.8.x"` (matching the version `@rtc/client` and `@rtc/server` already use) to `packages/domain/package.json` `dependencies`. Real dependency, not peerDeps, not a shim.
- Update `CLAUDE.md`'s zero-dep rule from "ZERO runtime dependencies" to: *"`@rtc/domain` may only depend on `rxjs` at runtime. No other runtime dependencies."*
- Update `docs/architecture.md` §1.4 (boundary type), §3.4 (use cases), §3.5 (presenter contracts), §10 (tech-stack table) to reflect Observable as the boundary.

### Explicitly out of scope

- No presenter layer (Phase 3).
- No react-rxjs `bind()` wiring (Phase 3).
- No retirement of `ServiceProvider` / no Composition Root (Phase 3).
- No multicast / `shareReplay` strategy for production. Simulators stay cold; each subscriber gets its own internal pipeline. The future WebSocket adapter will multicast internally.

---

## 2. Port + use case signatures

### Port shape (signatures match the existing methods, only return types change)

```ts
import type { Observable } from "rxjs";

export interface PricingPort {
  getPriceUpdates(symbol: string): Observable<PriceTick>;
  getPriceHistory(symbol: string): Observable<readonly PriceTick[]>;       // was Promise<readonly PriceTick[]>
  getRfqQuote(symbol: string, pipsPosition: number): Observable<RfqQuoteResult>;  // promoted from duck-typed on simulator into the port
}

export interface ExecutionPort {
  executeTrade(request: ExecutionRequest): Observable<Trade>;
}

export interface BlotterPort {
  getTradeStream(): Observable<readonly Trade[]>;                          // emits whole snapshot per change (existing behaviour preserved)
}

export interface AnalyticsPort {
  getAnalytics(baseCurrency: string): Observable<PositionUpdates>;
}

export interface ReferenceDataPort {
  /* current method shape preserved; only return type swap. */
}

export interface InstrumentPort {
  /* current method shape preserved; only return type swap. */
}

export interface DealerPort {
  /* current method shape preserved; only return type swap. */
}

export interface WorkflowPort {
  events(): Observable<RfqEvent>;                                          // RENAMED from subscribe() — port.subscribe() collides with Observable.subscribe() and reads as a verb instead of a query
  createRfq(request: CreateRfqRequest): Observable<number>;                // returns the new RFQ id (existing behaviour preserved)
  cancelRfq(rfqId: number): Observable<void>;
  quote(request: QuoteRequest): Observable<void>;
  pass(quoteId: number): Observable<void>;
  accept(quoteId: number): Observable<void>;
}
```

### Use case shape — `previousMid` ref becomes a per-subscription closure

```ts
class PriceStreamUseCase {
  constructor(private readonly pricing: PricingPort) {}

  execute(pair: CurrencyPair): Observable<Price> {
    return defer(() => {
      let previousMid: number | undefined;
      return this.pricing.getPriceUpdates(pair.symbol).pipe(
        map((tick) => {
          const enriched: Price = {
            ...tick,
            movementType: detectMovement(tick.mid, previousMid),
            spread: calculateSpread(tick.bid, tick.ask, pair.pipsPosition, pair.ratePrecision),
          };
          previousMid = tick.mid;
          return enriched;
        }),
      );
    });
  }
}
```

`defer` gives each subscription a fresh `previousMid` — same isolation the AsyncIterable version got from a function-scoped `let`. `PriceHistoryUseCase` follows the same pattern with a per-subscription rolling buffer.

### Four notable contract changes (beyond the type swap)

1. **`PricingPort.getRfqQuote` is promoted from duck-typed to contract method** — closes the deferred-from-Phase-2 cleanup tracked in `STATUS.md`.
2. **`WorkflowPort.subscribe()` is renamed to `events()`** — `port.subscribe().subscribe(...)` reads terribly once both verbs are in play, and `events()` is a noun-shaped query, which fits the read-stream contract.
3. **`WorkflowPort` command methods return `Observable<T>`** — they emit once and complete on success, or error on failure. `createRfq` emits the new RFQ id; `cancelRfq`/`quote`/`pass`/`accept` emit `void`. Callers do `firstValueFrom(...)` to await imperatively.
4. **Use cases stay cold** — no `shareReplay` baked in. The presenter layer in Phase 3 owns multicast.

---

## 3. Simulator implementation patterns

Three patterns cover all 8 simulators. Each pattern matches a category of operation; they're not interchangeable.

### Pattern A — `defer` + (variable-interval recursion via `new Observable`) (continuous timer-driven streams)

Used by `PricingSimulator.getPriceUpdates`, `AnalyticsSimulator.getAnalytics`.

```ts
getPriceUpdates(symbol: string): Observable<PriceTick> {
  return defer(() => {
    const state = this.pairs.get(symbol);
    if (!state) return throwError(() => new Error(`Unknown symbol: ${symbol}`));
    const live$ = new Observable<PriceTick>((subscriber) => {
      let timeoutId: ReturnType<typeof setTimeout>;
      const scheduleNext = () => {
        timeoutId = setTimeout(() => {
          state.mid = applyRandomWalk(state.mid);
          const tick = createTick(symbol, state.mid, Date.now());
          state.history.push(tick);
          if (state.history.length > PRICE_HISTORY_SIZE) state.history.shift();
          subscriber.next(tick);
          scheduleNext();
        }, tickInterval());
      };
      scheduleNext();
      return () => clearTimeout(timeoutId);
    });
    return concat(from(state.history), live$);
  });
}
```

`defer` per-subscription so each consumer gets the historical snapshot first. `new Observable` is used (rather than `interval`) because the existing simulator's tick spacing is randomised between min/max bounds; `interval` only takes a fixed period. `setTimeout` honours `vi.useFakeTimers()` for tests. The teardown function clears the pending timeout so unsubscribing actually stops the loop. For `AnalyticsSimulator.getAnalytics` (fixed period), use `interval(periodMs).pipe(map(...))` instead — simpler.

### Pattern B — `defer` + `timer` + `of` (one-shot operations)

Used by `ExecutionSimulator.executeTrade`, `PricingSimulator.getRfqQuote`, `PricingSimulator.getPriceHistory`, every `WorkflowPort` command method.

```ts
executeTrade(request: ExecutionRequest): Observable<Trade> {
  return defer(() => {
    const tradeId = this.nextId++;
    const status = request.currencyPair === REJECTED_PAIR ? TradeStatus.Rejected : TradeStatus.Done;
    const delayMs = request.currencyPair === DELAYED_PAIR ? DELAYED_PAIR_MS : Math.random() * NORMAL_MAX_DELAY_MS;
    return timer(delayMs).pipe(
      map(() => this.makeTrade(tradeId, status, request)),
      tap((trade) => this.notifyListeners(trade)),
    );
  });
}

createRfq(request: CreateRfqRequest): Observable<number> {
  return defer(() => {
    const rfq = this.buildRfq(request);
    this.rfqs.set(rfq.id, rfq);
    this.emit({ type: "rfqCreated", payload: rfq });
    this.scheduleQuoteResponses(rfq);  // existing side effect
    return of(rfq.id);  // emit once + complete so firstValueFrom resolves with the id
  });
}
```

Pattern B for synchronous-today ops (`getRfqQuote`, `getPriceHistory`) is the simplest case: just `defer(() => of(this.compute(...)))`.

### Pattern C — `defer` + `concat(snapshot, subject$)` (state-of-the-world + live)

Used by `TradeStoreSimulator.tradeStream`, `CreditRfqSimulator.events`, `ReferenceDataSimulator.currencyPairs`, `InstrumentSimulator.instruments`, `DealerSimulator.dealers`.

```ts
private readonly events$ = new Subject<RfqEvent>();

events(): Observable<RfqEvent> {
  return defer(() =>
    concat(
      of<RfqEvent>({ type: "startOfStateOfTheWorld" }),
      from(this.buildSnapshot()),       // existing rfqs + quotes
      of<RfqEvent>({ type: "endOfStateOfTheWorld" }),
      this.events$.asObservable(),       // live updates
    ),
  );
}
```

For "snapshot only" simulators (`InstrumentSimulator`, `DealerSimulator` — current data is static), the live `Subject` is dropped and only the `from(catalog)` part remains, finishing with `complete`.

### What disappears from `@rtc/domain`

- `simulators/delay.ts` — replaced by `timer(ms)` and `defer`-wrapping.
- All `async function*` syntax across all simulators.
- All `Promise.resolve(...)` returns in port implementations.

---

## 4. Test migration

### Decision

Subscribe + collect with `vi.useFakeTimers()`. No marble testing.

### Why not marbles

RxJS `interval` and `timer` use the default `asyncScheduler`, which honours Vitest's fake timers — same control we already have over async generators today. Marbles would force scheduler injection into every simulator, add `TestScheduler` boilerplate, and impose a learning curve that doesn't earn its keep against the simple "did this emit N values?" assertions we actually have.

### Three standard patterns

```ts
import { firstValueFrom, lastValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";

// 1) Collect N from an infinite stream (price ticks, positions, trade stream)
it("emits 3 price ticks after the historical snapshot", async () => {
  vi.useFakeTimers();
  const sim = new PricingSimulator();
  const promise = firstValueFrom(
    sim.getPriceUpdates("EURUSD").pipe(skip(PRICE_HISTORY_SIZE), take(3), toArray()),
  );
  await vi.advanceTimersByTimeAsync(5_000);
  expect(await promise).toHaveLength(3);
});

// 2) Collect everything from a finite/completing stream (catalog snapshot)
it("emits the instrument catalog then completes", async () => {
  const all = await firstValueFrom(sim.getInstruments().pipe(toArray()));
  expect(all).toHaveLength(INSTRUMENTS_CATALOG.length);
});

// 3) Await a one-shot (executeTrade, getRfqQuote, getPriceHistory, command methods)
it("executes a trade", async () => {
  vi.useFakeTimers();
  const sim = new ExecutionSimulator();
  const promise = firstValueFrom(sim.executeTrade(req));
  await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
  expect(await promise).toMatchObject({ tradeId: 1 });
});
```

### No test helpers

These patterns are short enough that wrapping `subscribe + advanceTimers` in a helper just hides the timing.

### Use case fixtures

Today, use case tests pass hand-rolled `async function*` mocks for ports. Under the new boundary, fixtures become trivial:

```ts
// before
async function* mockPriceStream() {
  yield tick1; yield tick2; yield tick3;
}

// after
const priceStream$ = of(tick1, tick2, tick3);
// or for time-spaced emissions:
const priceStream$ = from([tick1, tick2, tick3]).pipe(concatMap((t) => of(t).pipe(delay(100))));
// or for full control:
const subject = new Subject<PriceTick>();
```

Net code reduction.

---

## 5. Migration sequencing

### Strategy

Vertical slices per port. Each task migrates one port (or a tightly-coupled group) end-to-end — interface, simulator, use case, hook consumers, tests, server-side wiring — in a single commit. Build stays green at every step.

### Why not horizontal

A port type swap is contagious. The moment `PricingPort` returns `Observable<T>`, `PricingSimulator` and `PriceStreamUseCase` must already be Observable-shaped or typecheck breaks. Vertical slices keep each commit self-consistent.

### Why not big-bang

One commit touching ~35 files would be unreviewable and unbisectable.

### Task list

| # | Scope | Why this order |
|---|---|---|
| 0 | Foundation: add `rxjs ^7.8.x` to `@rtc/domain/package.json`; update CLAUDE.md zero-dep rule | No code change, prepares the dep |
| 1 | `ReferenceDataPort` + `InstrumentPort` + `DealerPort` + their simulators + `useCurrencyPairs` + `useInstruments` + `useDealers` + tests | Simplest pattern (C with empty live tail) and snapshot-only catalogs; few consumers; good warm-up |
| 2 | `PricingPort` (incl. promoted `getRfqQuote`) + `PricingSimulator` + `PriceStreamUseCase` + `PriceHistoryUseCase` + `usePriceStream` + `usePriceHistory` + `useRfqQuote` + tests | Mixes Pattern A (interval) and Pattern B (one-shot) |
| 3 | `ExecutionPort` + `BlotterPort` + `ExecutionSimulator` + `TradeStoreSimulator` + `ExecuteTradeUseCase` + `useExecuteTrade` + `useTradeStream` + tests | Coupled — `ExecutionSimulator` pushes trades into `TradeStoreSimulator`, so they migrate together |
| 4 | `AnalyticsPort` + `AnalyticsSimulator` + `AnalyticsUseCase` + `useAnalytics` + tests | Independent, Pattern A |
| 5 | `WorkflowPort` + `CreditRfqSimulator` + `WorkflowEventStreamUseCase` + `CreateRfqUseCase` + `useRfqStream` + `useCreateRfq` + the 4 command companions (`cancelRfq`, `acceptQuote`, `passQuote`, `quote` — called directly via `useServices()` today) + tests | Largest slice — Pattern C events + 5 Pattern B commands |
| 6 | Update `docs/architecture.md` §1.4, §3.4, §3.5, §10; final `pnpm -w build && test && test:e2e` | Docs catch up after the code is settled |

### Per-task invariant

Every commit must end with `pnpm -w typecheck && pnpm -w test` green. E2E only runs in Task 6.

---

## Notes for the implementation plan

- The plan should TDD each simulator rewrite: write the new tests first against the new interface, watch them fail (because the simulator still returns AsyncIterable), then rewrite the simulator. Tests act as the spec.
- Hooks that consume `Observable<T>` need `useEffect` cleanup with `subscription.unsubscribe()`. Until Phase 3 swaps them for `react-rxjs` `bind()`, this is the manual stopgap.
- Server's `wsHandler.ts` will need `Observable.pipe(...)` instead of `AsyncIterable` for-await loops; Marble.js already deals in Observables so the change is mechanical.
- `pnpm install` after Task 0 to get `rxjs` resolved into `@rtc/domain`'s `node_modules`.
- After Task 6, mark Phase 2.6 as ✅ DONE in `STATUS.md` and unblock Phase 3 spec revision.
