# Phase 2.6 — RxJS Observable Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `AsyncIterable<T>` and `Promise<T>` with `Observable<T>` at every `@rtc/domain` boundary. Add `rxjs` as `@rtc/domain`'s only permitted runtime dependency. Rewrite all 8 simulators idiomatically.

**Architecture:** Vertical slices per port. Each task migrates one port group (port interface + simulator + use case + client hooks + server wiring + tests) end-to-end in a single commit. Build stays green at every commit.

**Tech stack:** rxjs ^7.8.x (matching the version already in `@rtc/client` / `@rtc/server`), vitest with `vi.useFakeTimers()`, tsc, pnpm.

**Reference:** the design spec at `docs/superpowers/specs/2026-05-03-phase-2-6-rxjs-observable-boundary-design.md` defines the three simulator patterns (A: continuous timer-driven, B: one-shot, C: SoW + Subject) and the test patterns this plan applies repeatedly.

**Note about renames in this phase:**

| Port method | Was | Becomes | Reason |
|---|---|---|---|
| `WorkflowPort.subscribe()` | `AsyncIterable<RfqEvent>` | `events(): Observable<RfqEvent>` | Avoid collision with `Observable.subscribe()` |
| `InstrumentPort.subscribe()` | `AsyncIterable<readonly Instrument[]>` | `getInstruments(): Observable<readonly Instrument[]>` | Same; matches `getCurrencyPairs()` style |
| `DealerPort.subscribe()` | `AsyncIterable<readonly Dealer[]>` | `getDealers(): Observable<readonly Dealer[]>` | Same |

All other port methods keep their existing names; only return types narrow from `AsyncIterable<T>` / `Promise<T>` to `Observable<T>`.

**Per-task verification command** (run before every commit):

```bash
pnpm -w typecheck && pnpm -w test
```

If either fails, the task isn't done. E2E (`pnpm test:e2e`) only runs once, in Task 6.

**Hook migration pattern** (applied identically wherever a hook consumes a port stream):

```ts
// before
useEffect(() => {
  let cancelled = false;
  (async () => {
    for await (const x of source.method()) {
      if (cancelled) break;
      setState(x);
    }
  })();
  return () => { cancelled = true; };
}, [deps]);

// after
useEffect(() => {
  const sub = source.method().subscribe(setState);
  return () => sub.unsubscribe();
}, [deps]);
```

For hooks that consume a use case, the only change is constructing the use case inside `useEffect` and subscribing instead of awaiting:

```ts
useEffect(() => {
  const useCase = new XyzUseCase(deps);
  const sub = useCase.execute(args).subscribe(setState);
  return () => sub.unsubscribe();
}, [deps, ...]);
```

For one-shot calls (e.g. `executeTrade`, `createRfq`), use `firstValueFrom`:

```ts
const result = await firstValueFrom(execution.executeTrade(req));
```

---

## Tasks

### Task 0: Foundation — add rxjs to `@rtc/domain`, update CLAUDE.md

**Files:**
- Modify: `packages/domain/package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Inspect rxjs version used by client and server**

```bash
grep -E '"rxjs"' packages/client/package.json packages/server/package.json
```

Capture the exact version string. Use the same version below.

- [ ] **Step 2: Add rxjs to domain's `dependencies`**

Edit `packages/domain/package.json` to add a `dependencies` section (currently it has none):

```json
{
  ...,
  "dependencies": {
    "rxjs": "<version-from-step-1>"
  },
  ...
}
```

- [ ] **Step 3: Install**

```bash
pnpm install
```

Expected: `+ rxjs <version>` resolves into `packages/domain/node_modules/rxjs`. No other deps added.

- [ ] **Step 4: Update CLAUDE.md zero-dep rule**

In `CLAUDE.md`, find the "Zero-dep constraint on `@rtc/domain`" paragraph and replace with:

```markdown
**Single-dep constraint on `@rtc/domain`:** Domain may depend on `rxjs` at runtime — and only on `rxjs`. RxJS is the explicit architectural exception, chosen for its declarative stream operators and the team's familiarity with it. No other runtime dependencies are permitted. pnpm strict mode enforces this at install time.
```

Also update the inline comment in the package list at the top of CLAUDE.md:

```markdown
  domain/    @rtc/domain   — Pure TS, depends only on rxjs at runtime. Entities, use cases, port interfaces, simulators.
```

- [ ] **Step 5: Verify**

```bash
pnpm -w typecheck && pnpm -w test
```

Expected: PASS unchanged (no code changes yet, just deps). 106 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/package.json pnpm-lock.yaml CLAUDE.md
git commit -m "chore(domain): add rxjs dep, update CLAUDE.md zero-dep rule"
```

---

### Task 1: Reference data — `ReferenceDataPort` + `InstrumentPort` + `DealerPort`

Migrates 3 ports, 3 simulators (in 2 files), 3 hooks, and any server wiring. All three are snapshot-emitting, fitting Pattern C with no live tail (or just `of(catalog)`).

**Files:**
- Modify: `packages/domain/src/ports/referenceDataPort.ts`
- Modify: `packages/domain/src/ports/instrumentPort.ts`
- Modify: `packages/domain/src/ports/dealerPort.ts`
- Modify: `packages/domain/src/simulators/ReferenceDataSimulator.ts`
- Modify: `packages/domain/src/simulators/creditReferenceDataSimulator.ts`
- Modify: `packages/domain/src/simulators/ReferenceDataSimulator.test.ts`
- Modify: `packages/domain/src/simulators/creditReferenceDataSimulator.test.ts`
- Modify: `packages/client/src/fx/hooks/useCurrencyPairs.ts`
- Modify: `packages/client/src/credit/hooks/useInstruments.ts`
- Modify: `packages/client/src/credit/hooks/useDealers.ts`
- Modify (if present): `packages/server/src/ws/wsHandler.ts` (any reference-data wiring)

- [ ] **Step 1: Update port interfaces**

Replace each file's body with:

```ts
// referenceDataPort.ts
import type { Observable } from "rxjs";
import type { CurrencyPair } from "../fx/currencyPair.js";

export interface ReferenceDataPort {
  getCurrencyPairs(): Observable<readonly CurrencyPair[]>;
}
```

```ts
// instrumentPort.ts
import type { Observable } from "rxjs";
import type { Instrument } from "../credit/instrument.js";

export interface InstrumentPort {
  getInstruments(): Observable<readonly Instrument[]>;
}
```

```ts
// dealerPort.ts
import type { Observable } from "rxjs";
import type { Dealer } from "../credit/dealer.js";

export interface DealerPort {
  getDealers(): Observable<readonly Dealer[]>;
}
```

- [ ] **Step 2: Rewrite `ReferenceDataSimulator`**

Replace body of `ReferenceDataSimulator.ts` with (preserving the 1s initial delay):

```ts
import { type Observable, of } from "rxjs";
import { delay } from "rxjs/operators";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { ReferenceDataPort } from "../ports/referenceDataPort.js";
import { KNOWN_CURRENCY_PAIRS } from "../fx/currencyPair.js";

const INITIAL_DELAY_MS = 1_000;

export class ReferenceDataSimulator implements ReferenceDataPort {
  getCurrencyPairs(): Observable<readonly CurrencyPair[]> {
    return of(KNOWN_CURRENCY_PAIRS).pipe(delay(INITIAL_DELAY_MS));
  }
}
```

- [ ] **Step 3: Rewrite `InstrumentSimulator` and `DealerSimulator` in `creditReferenceDataSimulator.ts`**

Keep the two `*_CATALOG` constants unchanged. Replace the two class bodies with:

```ts
import { type Observable, of } from "rxjs";
// ...existing imports...

export class InstrumentSimulator implements InstrumentPort {
  getInstruments(): Observable<readonly Instrument[]> {
    return of(INSTRUMENTS_CATALOG);
  }
}

export class DealerSimulator implements DealerPort {
  getDealers(): Observable<readonly Dealer[]> {
    return of(DEALERS_CATALOG);
  }
}
```

`of(value)` synchronously emits `value` then completes — no `defer` needed because there's no per-subscription state.

- [ ] **Step 4: Migrate `ReferenceDataSimulator.test.ts`**

Read the current file to see its existing assertions, then rewrite each `for await` test to one of the three test patterns from spec §4. Likely shape:

```ts
import { describe, it, expect, vi } from "vitest";
import { firstValueFrom } from "rxjs";
import { toArray } from "rxjs/operators";
import { ReferenceDataSimulator } from "./ReferenceDataSimulator.js";
import { KNOWN_CURRENCY_PAIRS } from "../fx/currencyPair.js";

describe("ReferenceDataSimulator", () => {
  it("emits the known currency pairs after 1s delay then completes", async () => {
    vi.useFakeTimers();
    const sim = new ReferenceDataSimulator();
    const promise = firstValueFrom(sim.getCurrencyPairs().pipe(toArray()));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await promise).toEqual([KNOWN_CURRENCY_PAIRS]);
  });
});
```

If the existing test file asserts other behaviour (e.g. that the delay occurs before the emit), preserve those assertions — the rewrite is purely mechanical: replace `for await of` blocks with `firstValueFrom + toArray()` (for finite streams) or `subscribe + collect` (for infinite streams).

- [ ] **Step 5: Migrate `creditReferenceDataSimulator.test.ts`**

Same mechanical rewrite. Both `InstrumentSimulator` and `DealerSimulator` complete synchronously now (`of(...)`), so no fake timers needed:

```ts
it("emits the instruments catalog and completes", async () => {
  const sim = new InstrumentSimulator();
  const all = await firstValueFrom(sim.getInstruments().pipe(toArray()));
  expect(all).toEqual([INSTRUMENTS_CATALOG]);
});
```

- [ ] **Step 6: Update client hooks**

Apply the standard subscribe pattern from the plan header. Three files:

```ts
// useCurrencyPairs.ts
import { useEffect, useState } from "react";
import type { CurrencyPair } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function useCurrencyPairs(): readonly CurrencyPair[] {
  const { referenceData } = useServices();
  const [pairs, setPairs] = useState<readonly CurrencyPair[]>([]);

  useEffect(() => {
    const sub = referenceData.getCurrencyPairs().subscribe(setPairs);
    return () => sub.unsubscribe();
  }, [referenceData]);

  return pairs;
}
```

```ts
// useInstruments.ts
useEffect(() => {
  const sub = instruments.getInstruments().subscribe(setData);
  return () => sub.unsubscribe();
}, [instruments]);
```

```ts
// useDealers.ts
useEffect(() => {
  const sub = dealers.getDealers().subscribe(setData);
  return () => sub.unsubscribe();
}, [dealers]);
```

- [ ] **Step 7: Update server wiring**

Read `packages/server/src/ws/wsHandler.ts` and find any code that consumes `referenceData.getCurrencyPairs()`, `instruments.subscribe()`, or `dealers.subscribe()`. Marble.js already deals in Observables, so the change is dropping any `from(asyncIterable)` or `for await` adapters and consuming the Observable directly. If the server doesn't currently wire these (mock services may live only client-side), there's no change.

- [ ] **Step 8: Verify**

```bash
pnpm -w typecheck && pnpm -w test
```

Expected: 106 tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/
git commit -m "refactor(domain): migrate reference-data ports to Observable"
```

---

### Task 2: `PricingPort` + pricing use cases + their hooks

Migrates `PricingPort` (3 methods, including the promoted `getRfqQuote`), `PricingSimulator`, both pricing use cases, and 3 hooks.

**Files:**
- Modify: `packages/domain/src/ports/pricingPort.ts`
- Modify: `packages/domain/src/simulators/PricingSimulator.ts`
- Modify: `packages/domain/src/simulators/PricingSimulator.test.ts`
- Modify: `packages/domain/src/usecases/PriceStreamUseCase.ts`
- Modify: `packages/domain/src/usecases/PriceStreamUseCase.test.ts`
- Modify: `packages/domain/src/usecases/PriceHistoryUseCase.ts`
- Modify: `packages/domain/src/usecases/PriceHistoryUseCase.test.ts`
- Modify: `packages/client/src/fx/hooks/usePriceStream.ts`
- Modify: `packages/client/src/fx/hooks/usePriceHistory.ts`
- Modify: `packages/client/src/fx/hooks/useRfqQuote.ts`
- Modify (if present): `packages/server/src/ws/wsHandler.ts` (pricing wiring)

- [ ] **Step 1: Update `PricingPort`**

```ts
import type { Observable } from "rxjs";
import type { PriceTick } from "../fx/price.js";

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

`RfqQuoteResult` was previously declared in `PricingSimulator.ts`. Move it into the port (and re-export from `index.ts` if needed).

- [ ] **Step 2: Rewrite `PricingSimulator`**

Apply Pattern A for `getPriceUpdates` (variable inter-tick spacing → `new Observable` + `setTimeout`) and Pattern B for the two one-shots:

```ts
import { type Observable, of, defer, throwError, concat, from } from "rxjs";
import type { PriceTick } from "../fx/price.js";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { PricingPort, RfqQuoteResult } from "../ports/pricingPort.js";
import { KNOWN_CURRENCY_PAIRS } from "../fx/currencyPair.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";

const HALF_SPREAD = 0.0002;
const MIN_TICK_INTERVAL_MS = 150;
const MAX_TICK_INTERVAL_MS = 1_000;

interface PairState {
  mid: number;
  history: PriceTick[];
}

// Keep these four module-level helpers verbatim from the existing PricingSimulator.ts
// (Read it first to copy them):
//   generateInitialMid(), applyRandomWalk(mid), createTick(symbol, mid, timestamp),
//   tickInterval()
// Also keep the existing PairState interface and the HALF_SPREAD / MIN_TICK_INTERVAL_MS /
// MAX_TICK_INTERVAL_MS constants verbatim.

export class PricingSimulator implements PricingPort {
  private readonly pairs = new Map<string, PairState>();

  constructor() {
    for (const pair of KNOWN_CURRENCY_PAIRS) this.initPair(pair);
  }

  // Keep the existing initPair(pair) method verbatim — it builds historical ticks
  // and seeds this.pairs.

  getPriceHistory(symbol: string): Observable<readonly PriceTick[]> {
    return defer(() => {
      const state = this.pairs.get(symbol);
      if (!state) return throwError(() => new Error(`Unknown symbol: ${symbol}`));
      return of([...state.history] as readonly PriceTick[]);
    });
  }

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

  getRfqQuote(symbol: string, pipsPosition: number): Observable<RfqQuoteResult> {
    return defer(() => {
      const state = this.pairs.get(symbol);
      if (!state) return throwError(() => new Error(`Unknown symbol: ${symbol}`));
      const priceChange = 0.3 / Math.pow(10, pipsPosition);
      return of({
        ask: state.mid + HALF_SPREAD + priceChange,
        bid: state.mid - HALF_SPREAD - priceChange,
        mid: state.mid,
      });
    });
  }
}
```

Re-use the existing helper functions verbatim (don't rewrite their bodies).

- [ ] **Step 3: Migrate `PricingSimulator.test.ts`**

Rewrite `for await of` patterns to `firstValueFrom + take + toArray` and the one-shot calls to `firstValueFrom`. Use `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync()` to drive `setTimeout` deterministically. Existing test scenarios (count of historical ticks, count of subsequent ticks, RFQ quote spread) are preserved — only the test plumbing changes. Sample test:

```ts
it("emits historical ticks then live ticks at random intervals", async () => {
  vi.useFakeTimers();
  const sim = new PricingSimulator();
  const promise = firstValueFrom(
    sim.getPriceUpdates("EURUSD").pipe(take(PRICE_HISTORY_SIZE + 3), toArray()),
  );
  await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 4);
  expect(await promise).toHaveLength(PRICE_HISTORY_SIZE + 3);
});
```

- [ ] **Step 4: Rewrite `PriceStreamUseCase`**

Apply the closure-in-`defer` pattern from spec §2:

```ts
import { type Observable, defer } from "rxjs";
import { map } from "rxjs/operators";
import type { PricingPort } from "../ports/pricingPort.js";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { Price } from "../fx/price.js";
import { calculateSpread, detectMovement } from "../fx/price.js";

export class PriceStreamUseCase {
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

- [ ] **Step 5: Rewrite `PriceHistoryUseCase`**

Same closure-in-`defer` pattern for the rolling buffer:

```ts
import { type Observable, defer } from "rxjs";
import { map } from "rxjs/operators";
import type { PricingPort } from "../ports/pricingPort.js";
import type { PriceTick } from "../fx/price.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";

export class PriceHistoryUseCase {
  constructor(private readonly pricing: PricingPort) {}

  execute(symbol: string): Observable<readonly PriceTick[]> {
    return defer(() => {
      const buffer: PriceTick[] = [];
      return this.pricing.getPriceUpdates(symbol).pipe(
        map((tick) => {
          buffer.push(tick);
          if (buffer.length > PRICE_HISTORY_SIZE) buffer.shift();
          return [...buffer];
        }),
      );
    });
  }
}
```

- [ ] **Step 6: Migrate use case tests**

`PriceStreamUseCase.test.ts` and `PriceHistoryUseCase.test.ts` use a hand-rolled `async function*` mock for `PricingPort`. Replace the mock with a `Subject` (or `from([...])`):

```ts
import { Subject, firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";

it("enriches ticks with spread and movement type", async () => {
  const ticks$ = new Subject<PriceTick>();
  const port: PricingPort = {
    getPriceUpdates: () => ticks$.asObservable(),
    getPriceHistory: () => of([]),
    getRfqQuote: () => of({ bid: 0, ask: 0, mid: 0 }),
  };
  const useCase = new PriceStreamUseCase(port);
  const promise = firstValueFrom(useCase.execute(EURUSD).pipe(take(2), toArray()));
  ticks$.next(makeTick(1.10000));
  ticks$.next(makeTick(1.10020));
  const [first, second] = await promise;
  expect(first.movementType).toBe(MovementType.None);
  expect(second.movementType).toBe(MovementType.Up);
});
```

Preserve every existing assertion. Only the plumbing changes.

- [ ] **Step 7: Update hooks**

Apply the standard subscribe pattern. `usePriceStream.ts`:

```ts
import { useEffect, useState } from "react";
import { type Price, type CurrencyPair, PriceStreamUseCase } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

interface PriceStreamResult {
  price: Price | null;
  version: number;
}

export function usePriceStream(pair: CurrencyPair): PriceStreamResult {
  const { pricing } = useServices();
  const [state, setState] = useState<PriceStreamResult>({ price: null, version: 0 });

  useEffect(() => {
    const useCase = new PriceStreamUseCase(pricing);
    const sub = useCase.execute(pair).subscribe((price) =>
      setState((prev) => ({ price, version: prev.version + 1 })),
    );
    return () => sub.unsubscribe();
  }, [pricing, pair]);

  return state;
}
```

`usePriceHistory.ts` follows the same shape with `PriceHistoryUseCase`.

`useRfqQuote.ts` previously duck-typed `getRfqQuote` on the simulator. Now it goes through the port officially:

```ts
import { useState, useCallback } from "react";
import { firstValueFrom, type Observable } from "rxjs";
import type { RfqQuoteResult } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function useRfqQuote() {
  const { pricing } = useServices();
  const [quote, setQuote] = useState<RfqQuoteResult | null>(null);

  const requestQuote = useCallback(
    async (symbol: string, pipsPosition: number) => {
      const result = await firstValueFrom(pricing.getRfqQuote(symbol, pipsPosition));
      setQuote(result);
      return result;
    },
    [pricing],
  );

  return { quote, requestQuote };
}
```

If the existing `useRfqQuote` returns a different shape, preserve its public API and only change the implementation.

- [ ] **Step 8: Update server wiring**

Read the server's pricing wiring; mirror the same Observable consumption changes. If pricing is mock-only (server-side has no real pricing yet), there may be no change.

- [ ] **Step 9: Verify**

```bash
pnpm -w typecheck && pnpm -w test
```

- [ ] **Step 10: Commit**

```bash
git add packages/
git commit -m "refactor(domain): migrate PricingPort and pricing use cases to Observable"
```

---

### Task 3: `ExecutionPort` + `BlotterPort` (coupled)

`ExecutionSimulator.executeTrade` notifies listeners; `TradeStoreSimulator` subscribes via `onTrade()`. They migrate together.

**Files:**
- Modify: `packages/domain/src/ports/executionPort.ts`
- Modify: `packages/domain/src/ports/blotterPort.ts`
- Modify: `packages/domain/src/simulators/ExecutionSimulator.ts`
- Modify: `packages/domain/src/simulators/TradeStoreSimulator.ts`
- Modify: `packages/domain/src/simulators/ExecutionSimulator.test.ts`
- Modify: `packages/domain/src/simulators/TradeStoreSimulator.test.ts`
- Modify: `packages/domain/src/usecases/ExecuteTradeUseCase.ts`
- Modify: `packages/domain/src/usecases/ExecuteTradeUseCase.test.ts`
- Modify: `packages/client/src/fx/hooks/useExecuteTrade.ts`
- Modify: `packages/client/src/blotter/hooks/useTradeStream.ts`
- Modify (if present): `packages/server/src/ws/wsHandler.ts` (execution + blotter wiring)

- [ ] **Step 1: Update ports**

```ts
// executionPort.ts
import type { Observable } from "rxjs";
import type { ExecutionRequest, Trade } from "../fx/trade.js";

export interface ExecutionPort {
  executeTrade(request: ExecutionRequest): Observable<Trade>;
}

// blotterPort.ts
import type { Observable } from "rxjs";
import type { Trade } from "../fx/trade.js";

export interface BlotterPort {
  getTradeStream(): Observable<readonly Trade[]>;
}
```

- [ ] **Step 2: Rewrite `ExecutionSimulator`**

Apply Pattern B; preserve `onTrade()` listener API (TradeStoreSimulator depends on it):

```ts
import { type Observable, defer, of, timer } from "rxjs";
import { map, tap } from "rxjs/operators";
import type { ExecutionRequest, Trade } from "../fx/trade.js";
import type { ExecutionPort } from "../ports/executionPort.js";
import { TradeStatus } from "../fx/trade.js";

const REJECTED_PAIR = "GBPJPY";
const DELAYED_PAIR = "EURJPY";
const DELAYED_PAIR_MS = 4_000;
const NORMAL_MAX_DELAY_MS = 2_000;
const DEFAULT_TRADER_NAME = "RTC";

export type TradeListener = (trade: Trade) => void;

export class ExecutionSimulator implements ExecutionPort {
  private nextId = 1;
  private readonly listeners: TradeListener[] = [];

  onTrade(listener: TradeListener): void {
    this.listeners.push(listener);
  }

  executeTrade(request: ExecutionRequest): Observable<Trade> {
    return defer(() => {
      const tradeId = this.nextId++;
      const now = new Date().toISOString().slice(0, 10);
      const status =
        request.currencyPair === REJECTED_PAIR ? TradeStatus.Rejected : TradeStatus.Done;
      const delayMs =
        request.currencyPair === DELAYED_PAIR
          ? DELAYED_PAIR_MS
          : Math.random() * NORMAL_MAX_DELAY_MS;
      return timer(delayMs).pipe(
        map<number, Trade>(() => ({
          tradeId,
          tradeName: DEFAULT_TRADER_NAME,
          currencyPair: request.currencyPair,
          notional: request.notional,
          dealtCurrency: request.dealtCurrency,
          direction: request.direction,
          spotRate: request.spotRate,
          status,
          tradeDate: now,
          valueDate: now,
        })),
        tap((trade) => {
          for (const listener of this.listeners) listener(trade);
        }),
      );
    });
  }
}
```

- [ ] **Step 3: Rewrite `TradeStoreSimulator`**

Apply Pattern C — snapshot + Subject of subsequent snapshots:

```ts
import { type Observable, Subject, defer, concat, of } from "rxjs";
import type { Trade } from "../fx/trade.js";
import type { BlotterPort } from "../ports/blotterPort.js";
import type { ExecutionSimulator } from "./ExecutionSimulator.js";

export class TradeStoreSimulator implements BlotterPort {
  private readonly trades = new Map<number, Trade>();
  private readonly snapshots$ = new Subject<readonly Trade[]>();

  constructor(executionEngine: ExecutionSimulator) {
    executionEngine.onTrade((trade) => {
      this.trades.set(trade.tradeId, trade);
      this.snapshots$.next(this.snapshot());
    });
  }

  getTradeStream(): Observable<readonly Trade[]> {
    return defer(() => concat(of(this.snapshot()), this.snapshots$.asObservable()));
  }

  private snapshot(): readonly Trade[] {
    return [...this.trades.values()].reverse();
  }
}
```

The current snapshot is replayed on subscribe via `defer + concat`; new trades push fresh snapshots through the Subject.

- [ ] **Step 4: Migrate `ExecutionSimulator.test.ts`**

Rewrite `await sim.executeTrade(req)` to `firstValueFrom(sim.executeTrade(req))`. Use fake timers to drive the random delay deterministically. Preserve every existing assertion (rejected pair, delayed pair, listener notification, ID auto-increment).

```ts
it("returns a Done trade for normal pairs", async () => {
  vi.useFakeTimers();
  const sim = new ExecutionSimulator();
  const promise = firstValueFrom(sim.executeTrade(req));
  await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
  const trade = await promise;
  expect(trade.status).toBe(TradeStatus.Done);
});
```

- [ ] **Step 5: Migrate `TradeStoreSimulator.test.ts`**

Replace `for await of` over `getTradeStream()` with `subscribe + collect`:

```ts
it("emits a snapshot on each new trade", async () => {
  vi.useFakeTimers();
  const exec = new ExecutionSimulator();
  const store = new TradeStoreSimulator(exec);
  const snapshots: (readonly Trade[])[] = [];
  const sub = store.getTradeStream().subscribe((s) => snapshots.push(s));
  // first emission is the initial empty snapshot
  expect(snapshots).toEqual([[]]);
  // execute a trade and verify a new snapshot
  firstValueFrom(exec.executeTrade(req));
  await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
  expect(snapshots).toHaveLength(2);
  expect(snapshots[1]).toHaveLength(1);
  sub.unsubscribe();
});
```

- [ ] **Step 6: Rewrite `ExecuteTradeUseCase`**

```ts
import { type Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { ExecutionPort } from "../ports/executionPort.js";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { Price } from "../fx/price.js";
import type { Trade, ExecutionRequest } from "../fx/trade.js";
import { Direction, TradeStatus, ExecutionStatus, deriveDealtCurrency } from "../fx/trade.js";

export interface ExecuteTradeInput {
  readonly pair: CurrencyPair;
  readonly direction: Direction;
  readonly price: Price;
  readonly notional: number;
}

export interface ExecuteTradeResult {
  readonly trade: Trade;
  readonly status: ExecutionStatus;
}

export class ExecuteTradeUseCase {
  constructor(private readonly execution: ExecutionPort) {}

  execute(input: ExecuteTradeInput): Observable<ExecuteTradeResult> {
    const spotRate = input.direction === Direction.Buy ? input.price.ask : input.price.bid;
    const dealtCurrency = deriveDealtCurrency(input.pair.symbol, input.direction);
    const request: ExecutionRequest = {
      currencyPair: input.pair.symbol,
      spotRate,
      direction: input.direction,
      notional: input.notional,
      dealtCurrency,
    };
    return this.execution.executeTrade(request).pipe(
      map((trade) => ({
        trade,
        status:
          trade.status === TradeStatus.Rejected
            ? ExecutionStatus.Rejected
            : ExecutionStatus.Done,
      })),
    );
  }
}
```

- [ ] **Step 7: Migrate `ExecuteTradeUseCase.test.ts`**

The fixture `port` mock changes from `async executeTrade()` to returning an Observable. Use `of(trade)` for synchronous mock returns, or a `Subject<Trade>` for tests that want to control timing. Assertions stay identical — `firstValueFrom(useCase.execute(input))` returns the same `ExecuteTradeResult`.

- [ ] **Step 8: Update `useExecuteTrade`**

```ts
import { useCallback, useState } from "react";
import { firstValueFrom } from "rxjs";
import { ExecuteTradeUseCase, type ExecuteTradeInput, type ExecuteTradeResult } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function useExecuteTrade() {
  const { execution } = useServices();
  const [result, setResult] = useState<ExecuteTradeResult | null>(null);

  const execute = useCallback(
    async (input: ExecuteTradeInput): Promise<ExecuteTradeResult> => {
      const useCase = new ExecuteTradeUseCase(execution);
      const r = await firstValueFrom(useCase.execute(input));
      setResult(r);
      return r;
    },
    [execution],
  );

  return { result, execute };
}
```

If the current hook has additional state (pending status, etc.), preserve it.

- [ ] **Step 9: Update `useTradeStream`**

```ts
useEffect(() => {
  const sub = blotter.getTradeStream().subscribe(setTrades);
  return () => sub.unsubscribe();
}, [blotter]);
```

- [ ] **Step 10: Update server wiring**

Mirror in `wsHandler.ts` if present.

- [ ] **Step 11: Verify**

```bash
pnpm -w typecheck && pnpm -w test
```

- [ ] **Step 12: Commit**

```bash
git add packages/
git commit -m "refactor(domain): migrate ExecutionPort + BlotterPort to Observable"
```

---

### Task 4: `AnalyticsPort` + `AnalyticsUseCase` + `useAnalytics`

**Files:**
- Modify: `packages/domain/src/ports/analyticsPort.ts`
- Modify: `packages/domain/src/simulators/AnalyticsSimulator.ts`
- Modify: `packages/domain/src/simulators/AnalyticsSimulator.test.ts`
- Modify: `packages/domain/src/usecases/AnalyticsUseCase.ts`
- Modify: `packages/domain/src/usecases/AnalyticsUseCase.test.ts`
- Modify: `packages/client/src/analytics/hooks/useAnalytics.ts`
- Modify (if present): `packages/server/src/ws/wsHandler.ts`

- [ ] **Step 1: Update port**

```ts
import type { Observable } from "rxjs";
import type { PositionUpdates } from "../analytics/position.js";

export interface AnalyticsPort {
  getAnalytics(currency: string): Observable<PositionUpdates>;
}
```

- [ ] **Step 2: Rewrite `AnalyticsSimulator`**

Apply Pattern C — initial snapshot then periodic updates via `interval` (fixed 10s period, simpler than Pricing's variable spacing):

```ts
import { type Observable, defer, concat, of, interval } from "rxjs";
import { map } from "rxjs/operators";
import type { CurrencyPairPosition, HistoricPosition, PositionUpdates } from "../analytics/position.js";
import type { AnalyticsPort } from "../ports/analyticsPort.js";

const HISTORY_SIZE = 90;
const UPDATE_INTERVAL_MS = 10_000;
const TIME_STEP_MS = 10_000;

// Keep the existing STATIC_POSITIONS array (9 entries) and the
// randomWalkStep(value) helper verbatim from the existing AnalyticsSimulator.ts.

export class AnalyticsSimulator implements AnalyticsPort {
  private history: HistoricPosition[] = [];
  private currentPrice: number;

  constructor() {
    this.currentPrice = (Math.random() - 0.5) * 10_000;
    const now = Date.now();
    for (let i = HISTORY_SIZE - 1; i >= 0; i--) {
      this.currentPrice = randomWalkStep(this.currentPrice);
      this.history.push({
        timestamp: new Date(now - i * TIME_STEP_MS).toISOString(),
        usdPnl: this.currentPrice,
      });
    }
  }

  getAnalytics(_currency: string): Observable<PositionUpdates> {
    return defer(() => {
      const initial: PositionUpdates = {
        currentPositions: STATIC_POSITIONS,
        history: [...this.history],
      };
      const updates$ = interval(UPDATE_INTERVAL_MS).pipe(
        map<number, PositionUpdates>(() => {
          this.currentPrice = randomWalkStep(this.currentPrice);
          this.history.push({
            timestamp: new Date().toISOString(),
            usdPnl: this.currentPrice,
          });
          if (this.history.length > HISTORY_SIZE) this.history.shift();
          return {
            currentPositions: STATIC_POSITIONS,
            history: [...this.history],
          };
        }),
      );
      return concat(of(initial), updates$);
    });
  }
}
```

- [ ] **Step 3: Migrate `AnalyticsSimulator.test.ts`**

Rewrite `for await of` to `subscribe + collect` with fake timers; preserve assertions.

- [ ] **Step 4: Rewrite `AnalyticsUseCase`**

The current implementation is a passthrough (`yield* port.getAnalytics(...)`). With Observable it's just:

```ts
import { type Observable } from "rxjs";
import type { AnalyticsPort } from "../ports/analyticsPort.js";
import type { PositionUpdates } from "../analytics/position.js";

const DEFAULT_BASE_CURRENCY = "USD";

export class AnalyticsUseCase {
  constructor(
    private readonly analytics: AnalyticsPort,
    private readonly baseCurrency: string = DEFAULT_BASE_CURRENCY,
  ) {}

  execute(): Observable<PositionUpdates> {
    return this.analytics.getAnalytics(this.baseCurrency);
  }
}
```

- [ ] **Step 5: Migrate `AnalyticsUseCase.test.ts`**

Mock fixture port returns an `Observable<PositionUpdates>` (e.g. `of(snapshot)` or `Subject`). Preserve existing assertions about default-currency wiring.

- [ ] **Step 6: Update `useAnalytics`**

```ts
useEffect(() => {
  const useCase = new AnalyticsUseCase(analytics);
  const sub = useCase.execute().subscribe(setData);
  return () => sub.unsubscribe();
}, [analytics]);
```

- [ ] **Step 7: Update server wiring**

Mirror in `wsHandler.ts` if present.

- [ ] **Step 8: Verify**

```bash
pnpm -w typecheck && pnpm -w test
```

- [ ] **Step 9: Commit**

```bash
git add packages/
git commit -m "refactor(domain): migrate AnalyticsPort to Observable"
```

---

### Task 5: `WorkflowPort` + Credit RFQ workflow

Largest slice. The 5 command methods all map to Pattern B. `events()` (renamed from `subscribe()`) maps to Pattern C. `WorkflowEventStreamUseCase` reduces over events with `scan`.

**Files:**
- Modify: `packages/domain/src/ports/workflowPort.ts`
- Modify: `packages/domain/src/simulators/CreditRfqSimulator.ts`
- Add: `packages/domain/src/simulators/CreditRfqSimulator.test.ts` (if not present — verify by listing)
- Modify: `packages/domain/src/usecases/WorkflowEventStreamUseCase.ts`
- Modify: `packages/domain/src/usecases/WorkflowEventStreamUseCase.test.ts`
- Modify: `packages/domain/src/usecases/CreateRfqUseCase.ts`
- Modify: `packages/domain/src/usecases/CreateRfqUseCase.test.ts`
- Modify: `packages/client/src/credit/hooks/useRfqStream.ts`
- Modify: `packages/client/src/credit/hooks/useCreateRfq.ts`
- Modify: every component currently calling `workflow.cancelRfq`/`quote`/`pass`/`accept` directly via `useServices()` (search the client tree)
- Modify (if present): `packages/server/src/ws/wsHandler.ts`

- [ ] **Step 1: Update `WorkflowPort` interface (with rename)**

```ts
import type { Observable } from "rxjs";
import type { Direction } from "../fx/trade.js";
import type { Rfq } from "../credit/rfq.js";
import type { Quote } from "../credit/quote.js";

export type RfqEvent =
  | { readonly type: "startOfStateOfTheWorld" }
  | { readonly type: "endOfStateOfTheWorld" }
  | { readonly type: "rfqCreated"; readonly payload: Rfq }
  | { readonly type: "quoteCreated"; readonly payload: Quote }
  | { readonly type: "quoteQuoted"; readonly payload: Quote }
  | { readonly type: "quotePassed"; readonly payload: Quote }
  | { readonly type: "quoteAccepted"; readonly payload: Quote }
  | { readonly type: "rfqClosed"; readonly payload: Rfq };

export interface CreateRfqRequest {
  readonly instrumentId: number;
  readonly dealerIds: readonly number[];
  readonly quantity: number;
  readonly direction: Direction;
  readonly expirySecs: number;
}

export interface QuoteRequest {
  readonly quoteId: number;
  readonly price: number;
}

export interface WorkflowPort {
  events(): Observable<RfqEvent>;                        // RENAMED from subscribe()
  createRfq(request: CreateRfqRequest): Observable<number>;
  cancelRfq(rfqId: number): Observable<void>;
  quote(request: QuoteRequest): Observable<void>;
  pass(quoteId: number): Observable<void>;
  accept(quoteId: number): Observable<void>;
}
```

- [ ] **Step 2: Rewrite `CreditRfqSimulator`**

Apply Pattern C for `events()`; Pattern B for the 5 command methods. Internal state mostly unchanged; emission funnel becomes a `Subject<RfqEvent>`. Preserve every existing piece of business logic (dealer participation threshold, response window timeouts, quote price computation).

```ts
import { type Observable, Subject, defer, concat, from, of } from "rxjs";
import type { Direction } from "../fx/trade.js";
import type { Rfq } from "../credit/rfq.js";
import type { Quote, QuoteState } from "../credit/quote.js";
import type {
  WorkflowPort,
  RfqEvent,
  CreateRfqRequest,
  QuoteRequest,
} from "../ports/workflowPort.js";
import { RfqState } from "../credit/rfq.js";
import { ADAPTIVE_BANK_NAME } from "../credit/dealer.js";
import type { Dealer } from "../credit/dealer.js";

const PARTICIPATION_THRESHOLD = 0.3;
const DEALER_RESPONSE_WINDOW_MS = 30_000;
const PRICE_BASELINE = 100;
const MAX_PRICE_CHANGE = 10;

export class CreditRfqSimulator implements WorkflowPort {
  private nextRfqId = 1;
  private nextQuoteId = 1;
  private readonly rfqs = new Map<number, Rfq>();
  private readonly quotes = new Map<number, Quote>();
  private readonly rfqQuotes = new Map<number, number[]>();
  private readonly dealers: readonly Dealer[];
  private readonly events$ = new Subject<RfqEvent>();
  private readonly pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  constructor(dealers: readonly Dealer[]) {
    this.dealers = dealers;
  }

  events(): Observable<RfqEvent> {
    return defer(() => {
      const snapshot: RfqEvent[] = [];
      snapshot.push({ type: "startOfStateOfTheWorld" });
      for (const rfq of this.rfqs.values()) {
        snapshot.push({ type: "rfqCreated", payload: rfq });
        const qIds = this.rfqQuotes.get(rfq.id) ?? [];
        for (const qId of qIds) {
          const q = this.quotes.get(qId);
          if (q) snapshot.push({ type: "quoteCreated", payload: q });
        }
      }
      snapshot.push({ type: "endOfStateOfTheWorld" });
      return concat(from(snapshot), this.events$.asObservable());
    });
  }

  // For each of these five command methods, READ the existing implementation in
  // CreditRfqSimulator.ts first. The migration is mechanical:
  //   1. Wrap the entire current async-method body in `return defer(() => { ... });`
  //   2. Replace every `this.emit(event)` call with `this.events$.next(event)`
  //   3. Drop the `async` keyword and replace the trailing `return value;` with
  //      `return of(value);` (or `return of(undefined);` for the void methods).
  //   4. Drop any `await` calls — there shouldn't be any in these methods, but if
  //      `randomDelay`/`delay` is used, replace with `setTimeout` inside the defer.

  createRfq(request: CreateRfqRequest): Observable<number> {
    return defer(() => {
      const rfqId = this.nextRfqId++;
      // ... wrap the rest of the existing createRfq body verbatim, with the swap above ...
      return of(rfqId);
    });
  }

  cancelRfq(rfqId: number): Observable<void> {
    return defer(() => {
      // ... wrap existing cancelRfq body verbatim, with the swap above ...
      return of(undefined);
    });
  }

  quote(request: QuoteRequest): Observable<void> {
    return defer(() => {
      // ... wrap existing quote body verbatim, with the swap above ...
      return of(undefined);
    });
  }

  pass(quoteId: number): Observable<void> {
    return defer(() => {
      // ... wrap existing pass body verbatim, with the swap above ...
      return of(undefined);
    });
  }

  accept(quoteId: number): Observable<void> {
    return defer(() => {
      // ... wrap existing accept body verbatim, with the swap above ...
      return of(undefined);
    });
  }

  // Keep these private helpers verbatim, except every `this.emit(event)` becomes
  // `this.events$.next(event)`:
  //   buildRfqFromRequest, scheduleQuoteResponses, scheduleExpiry, etc.
  // Also delete the now-unused private `emit(event)` method.
}
```

- [ ] **Step 3: Migrate `CreditRfqSimulator.test.ts` (if it exists)**

Check first:
```bash
ls packages/domain/src/simulators/CreditRfqSimulator.test.ts 2>/dev/null && echo EXISTS || echo MISSING
```

If it exists, rewrite `for await of` patterns to `subscribe + collect` and `await sim.createRfq(req)` to `firstValueFrom(sim.createRfq(req))`. Preserve every existing assertion.

If it doesn't exist (Phase 2 may not have added one), skip — `WorkflowEventStreamUseCase.test.ts` exercises the simulator transitively.

- [ ] **Step 4: Rewrite `WorkflowEventStreamUseCase`**

Use `scan` over events:

```ts
import { type Observable } from "rxjs";
import { scan } from "rxjs/operators";
import type { WorkflowPort, RfqEvent } from "../ports/workflowPort.js";
import type { Rfq } from "../credit/rfq.js";
import type { Quote } from "../credit/quote.js";

export interface RfqStreamState {
  readonly rfqs: ReadonlyMap<number, Rfq>;
  readonly quotes: ReadonlyMap<number, Quote>;
}

function emptyState(): RfqStreamState {
  return { rfqs: new Map(), quotes: new Map() };
}

export function reduceRfqEvent(state: RfqStreamState, event: RfqEvent): RfqStreamState {
  // unchanged
}

export class WorkflowEventStreamUseCase {
  constructor(private readonly workflow: WorkflowPort) {}

  execute(): Observable<RfqStreamState> {
    return this.workflow.events().pipe(scan(reduceRfqEvent, emptyState()));
  }
}
```

`reduceRfqEvent` remains exported and unchanged — it's pure and already tested independently.

- [ ] **Step 5: Migrate `WorkflowEventStreamUseCase.test.ts`**

Replace the hand-rolled `async function*` mock for `WorkflowPort.subscribe()` with a `Subject<RfqEvent>`-backed mock for `WorkflowPort.events()`:

```ts
const events$ = new Subject<RfqEvent>();
const port: WorkflowPort = {
  events: () => events$.asObservable(),
  createRfq: () => of(0),
  cancelRfq: () => of(undefined),
  quote: () => of(undefined),
  pass: () => of(undefined),
  accept: () => of(undefined),
};

it("folds events into state", () => {
  const useCase = new WorkflowEventStreamUseCase(port);
  const states: RfqStreamState[] = [];
  const sub = useCase.execute().subscribe((s) => states.push(s));
  events$.next({ type: "startOfStateOfTheWorld" });
  events$.next({ type: "rfqCreated", payload: makeRfq(1) });
  events$.next({ type: "endOfStateOfTheWorld" });
  expect(states).toHaveLength(3);
  expect(states[1].rfqs.size).toBe(1);
  sub.unsubscribe();
});
```

- [ ] **Step 6: Rewrite `CreateRfqUseCase`**

```ts
import { type Observable } from "rxjs";
import type { WorkflowPort, CreateRfqRequest } from "../ports/workflowPort.js";
import type { Direction } from "../fx/trade.js";
import { CREDIT_QUANTITY_MULTIPLIER } from "../credit/rfq.js";

export const RFQ_DEFAULT_EXPIRY_SECS = 120;

export interface CreateRfqInput {
  readonly instrumentId: number;
  readonly dealerIds: readonly number[];
  readonly quantity: number;
  readonly direction: Direction;
  readonly expirySecs?: number;
}

export class CreateRfqUseCase {
  constructor(private readonly workflow: WorkflowPort) {}

  execute(input: CreateRfqInput): Observable<number> {
    const request: CreateRfqRequest = {
      instrumentId: input.instrumentId,
      dealerIds: [...input.dealerIds],
      quantity: input.quantity * CREDIT_QUANTITY_MULTIPLIER,
      direction: input.direction,
      expirySecs: input.expirySecs ?? RFQ_DEFAULT_EXPIRY_SECS,
    };
    return this.workflow.createRfq(request);
  }
}
```

- [ ] **Step 7: Migrate `CreateRfqUseCase.test.ts`**

Mock port `createRfq` returns `of(rfqId)`. Assert via `firstValueFrom(useCase.execute(input))`. Preserve assertions about quantity multiplication and default expiry.

- [ ] **Step 8: Update `useRfqStream`**

```ts
useEffect(() => {
  const useCase = new WorkflowEventStreamUseCase(workflow);
  const sub = useCase.execute().subscribe(setSnapshot);
  return () => sub.unsubscribe();
}, [workflow]);
```

The rest of the hook (the `getQuotesForRfq` callback, the return shape) is unchanged.

- [ ] **Step 9: Update `useCreateRfq`**

```ts
import { firstValueFrom } from "rxjs";
import { CreateRfqUseCase, type CreateRfqInput } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function useCreateRfq() {
  const { workflow } = useServices();
  return useCallback(
    async (input: CreateRfqInput): Promise<number> => {
      const useCase = new CreateRfqUseCase(workflow);
      return firstValueFrom(useCase.execute(input));
    },
    [workflow],
  );
}
```

- [ ] **Step 10: Update direct `useServices().workflow.{cancel,quote,pass,accept}` callers**

Search the client tree:
```bash
rg -n "workflow\.(cancelRfq|quote|pass|accept)\(" packages/client/src
```

For each call site (likely in `sellSide/SellSidePanel.tsx`, `rfqTiles/QuoteCard.tsx`, etc.), wrap the call:

```ts
// before
await workflow.cancelRfq(rfqId);

// after
import { firstValueFrom } from "rxjs";
await firstValueFrom(workflow.cancelRfq(rfqId));
```

- [ ] **Step 11: Update server wiring**

Mirror in `wsHandler.ts` if present (`subscribe()` → `events()`, return type narrowing).

- [ ] **Step 12: Verify**

```bash
pnpm -w typecheck && pnpm -w test
```

- [ ] **Step 13: Commit**

```bash
git add packages/
git commit -m "refactor(domain): migrate WorkflowPort and credit RFQ workflow to Observable"
```

---

### Task 6: Cleanup, docs, and final verification

- [ ] **Step 1: Delete `packages/domain/src/simulators/delay.ts`**

The helper is no longer used anywhere — `timer(ms)` and `defer` cover its use cases. Confirm with:

```bash
rg -n 'from "\.\.?/.*delay' packages/domain/src
```

Expected: no matches (everything has migrated). Then:

```bash
git rm packages/domain/src/simulators/delay.ts
```

Also remove its re-export from `packages/domain/src/simulators/index.ts`:

```bash
grep -n "delay" packages/domain/src/simulators/index.ts
# remove the matching line(s)
```

And from `packages/domain/src/index.ts` if `delay`/`randomDelay` are re-exported there.

- [ ] **Step 2: Sweep for residual `AsyncIterable` / `async function*` in `@rtc/domain`**

```bash
rg -n "AsyncIterable|async function\*|async \*" packages/domain/src
```

Expected: zero matches. If any remain, migrate them with the same patterns.

- [ ] **Step 3: Sweep for residual `Promise<` returns in `@rtc/domain` source (excluding tests)**

```bash
rg -n "Promise<" packages/domain/src --glob '!*.test.ts'
```

Expected: zero matches in port interfaces, simulators, or use cases. (Promises may still appear in test setup utilities.)

- [ ] **Step 4: Update `docs/architecture.md`**

Edit four sections:

- **§1.4 Boundary type:** replace any mention of `AsyncIterable<T>` with `Observable<T>`. Update the rationale to note RxJS as the explicit dependency exception.
- **§3.4 Use Cases:** update the use-case signature examples to return `Observable<T>`. Mention the closure-in-`defer` pattern for stateful pipes.
- **§3.5 Presenters & State Streams:** update the boundary-type references. (Detailed presenter design remains Phase 3 — leave that section's structure intact.)
- **§10 Tech-stack table:** add `rxjs` as a runtime dep of `@rtc/domain`. Update the "boundary type" row.

- [ ] **Step 5: Final build + unit tests + E2E**

```bash
pnpm -w build && pnpm -w typecheck && pnpm -w test && pnpm test:e2e
```

Expected: all PASS, 106 unit tests, 40 E2E tests.

- [ ] **Step 6: Update `STATUS.md`**

Mark Phase 2.6 as ✅ DONE in the phases table; bump "Last updated" to today; record the commit range from Task 0 to Task 6.

- [ ] **Step 7: Final commit**

```bash
git add packages/domain/src/simulators/index.ts packages/domain/src/simulators/delay.ts docs/architecture.md docs/superpowers/STATUS.md
git commit -m "docs: mark Phase 2.6 complete; update architecture.md for Observable boundary"
```

- [ ] **Step 8: Hand-off note**

Report to the user:
- Phase 2.6 complete; N commits added on top of pre-2.6 HEAD.
- Phase 3 spec at `docs/superpowers/specs/2026-05-01-phase-3-presenters-react-rxjs-design.md` was written against the old boundary types and now needs revision before execution.
- Suggest brainstorming Phase 3 spec revisions as the next session.
