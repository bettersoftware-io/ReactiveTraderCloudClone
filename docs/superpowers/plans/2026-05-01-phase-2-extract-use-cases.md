# Phase 2: Extract Use Cases from React Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move application logic that today lives inside React hooks (price enrichment, ring-buffer accumulation, execution-request building, RFQ event reduction, hardcoded base currency, command policies) into vanilla-TypeScript Use Case classes that live in `@rtc/domain/src/usecases/`. Hooks remain in place with their public signatures unchanged; their bodies become thin React harnesses around use case calls.

**Architecture:** Use cases are plain classes in `@rtc/domain` that accept ports in their constructor and return `AsyncIterable<T>` for streams or `Promise<T>` for commands. Each one is exhaustively tested with vitest using minimal hand-rolled stub ports — no React, no simulators, no fakes. Phase 2 adds tests; it does not remove or change any existing test or behaviour. Hooks remain consumed via the existing `ServiceProvider` React Context (Composition Root replacement is Phase 3).

**Tech Stack:** TypeScript, Vitest, no new dependencies. `@rtc/domain` retains zero runtime dependencies.

---

## Architectural Decisions

These decisions apply to every task in this phase.

1. **Use case location**: `packages/domain/src/usecases/`. Use cases live alongside entities, ports, and simulators. They participate in the domain barrel (`@rtc/domain` exports them).
2. **File-name convention**: kebab-case ending in `-use-case.ts` (e.g. `price-stream-use-case.ts`), matching the existing pattern (`pricing-port.ts`, `pricing-simulator.ts`).
3. **Class shape**: a single class with a constructor that takes the ports it depends on as readonly fields, and an `execute(...)` method. Stream use cases return `AsyncIterable<T>` via `async *` generators. Command use cases return `Promise<T>`.
4. **No state outside `execute`**: any cross-iteration state (e.g. `previousMid`, ring buffer) lives as a local variable inside the `execute` async generator, NOT as a class field. A new call to `execute` starts fresh.
5. **Boundary types**: `AsyncIterable<T>` and `Promise<T>` only. No `Observable`, no React types, no DOM types in any use case file.
6. **Hook signatures preserved**: every hook keeps its current parameter list and return type. The hook body becomes: `useServices()` to get ports → instantiate use case → iterate / await its result → set React state. Phase 3 replaces hooks wholesale with react-rxjs.
7. **Tests live next to use cases**: `packages/domain/src/usecases/<name>-use-case.test.ts`. Each test creates its own minimal stub port inline (no shared test-helpers file in Phase 2 — premature DRY).
8. **TDD order**: (1) write failing test, (2) run and confirm fails, (3) write impl, (4) run and confirm passes, (5) refactor consuming hook, (6) run full suite, (7) commit.
9. **Test count grows**: this phase ADDS tests. The new baseline at the end of Phase 2 is `84 + N` where N is the number of new use-case tests. The Phase 1 baseline (84) is a floor, not a ceiling.
10. **Staging discipline**: `git add packages/` (not `git add -A`) to keep `.claude/settings.local.json` permission updates out of rename commits. Phase 1 saw one slip — guarded against here.

---

## Out of Scope

Defer to later phases:

- **Pure pass-through hooks** — `useCurrencyPairs`, `useTradeStream`, `useInstruments`, `useDealers`, `useConnection` have no application logic worth extracting (they pipe a port stream straight into React state). They get their use cases in Phase 3 when the presenter layer needs a stream source.
- **`useRfqQuote`** — currently duck-types `getRfqQuote` on the simulator. Extracting it cleanly requires extending the `PricingPort` interface, which forces every adapter to implement the new method. That port evolution is bigger than Phase 2's scope. Defer to Phase 3.
- **`useCreateRfq` companion commands** — `cancelRfq`, `acceptQuote`, `passQuote`, `quote` are direct port pass-throughs. They become use cases in Phase 3 (or in a tiny follow-up plan if there is real policy to encode).
- **Composition Root, retiring `ServiceProvider`** — Phase 3.
- **Presenters and react-rxjs** — Phase 3.
- **Folder reorganisation** (`client/src/app/` vs `client/src/ui/`) — Phase 4.
- **Gherkin specs** — Phase 5.

---

## File Structure

New files (created during this phase):

```
packages/domain/src/usecases/
  index.ts                              barrel for use cases
  price-stream-use-case.ts              Task 2.1
  price-stream-use-case.test.ts         Task 2.1
  price-history-use-case.ts             Task 2.2
  price-history-use-case.test.ts        Task 2.2
  execute-trade-use-case.ts             Task 2.3
  execute-trade-use-case.test.ts        Task 2.3
  analytics-use-case.ts                 Task 2.4
  analytics-use-case.test.ts            Task 2.4
  workflow-event-stream-use-case.ts     Task 2.5
  workflow-event-stream-use-case.test.ts Task 2.5
  create-rfq-use-case.ts                Task 2.6
  create-rfq-use-case.test.ts           Task 2.6
```

Modified files:

```
packages/domain/src/index.ts                            +use case re-exports
packages/client/src/fx/hooks/use-price-stream.ts        body refactored
packages/client/src/fx/hooks/use-price-history.ts       body refactored
packages/client/src/fx/hooks/use-execute-trade.ts       body refactored
packages/client/src/analytics/hooks/use-analytics.ts    body refactored
packages/client/src/credit/hooks/use-rfq-stream.ts      body refactored
packages/client/src/credit/hooks/use-create-rfq.ts      body refactored
```

Each task is structured so its file changes form one self-contained commit.

---

## Verification command (used in every task)

```bash
pnpm build && pnpm typecheck && pnpm test
```

Expected: all four packages build, no type errors, all unit tests pass. The expected unit-test count grows by the number of new tests added in that task — each task states its expected total explicitly.

---

## Task 2.0: Baseline verification

**Files:** none modified.

- [ ] **Step 1: Verify clean working tree.**

  Run:
  ```bash
  git status
  ```
  Expected: `nothing to commit, working tree clean`. If not clean, stop and report.

- [ ] **Step 2: Confirm we are starting from the post-Phase-1 baseline.**

  Run:
  ```bash
  pnpm build && pnpm typecheck && pnpm test 2>&1 | tail -30
  ```
  Expected: build/typecheck pass; unit tests show **12 domain test files + 1 server test file = 13 files / 84 tests passed**. (Domain: 12 / 79; server: 1 / 5.)

- [ ] **Step 3: Verify the e2e suite passes.**

  Run:
  ```bash
  pnpm test:e2e
  ```
  Expected: **40 passed**.

- [ ] **Step 4: Confirm `packages/domain/src/usecases/` does NOT yet exist.**

  Run:
  ```bash
  ls packages/domain/src/usecases 2>&1
  ```
  Expected: `ls: packages/domain/src/usecases: No such file or directory`. Task 2.1 creates this directory.

---

## Task 2.1: Extract `PriceStreamUseCase`

Moves `enrichTick` (movement + spread) and `previousMid` tracking out of `usePriceStream` into a domain use case.

**Files:**
- Create: `packages/domain/src/usecases/price-stream-use-case.ts`
- Create: `packages/domain/src/usecases/price-stream-use-case.test.ts`
- Create: `packages/domain/src/usecases/index.ts`
- Modify: `packages/domain/src/index.ts` (add use case export block)
- Modify: `packages/client/src/fx/hooks/use-price-stream.ts` (refactor body)

- [ ] **Step 1: Create the use case barrel `packages/domain/src/usecases/index.ts`.**

  Content:
  ```typescript
  export { PriceStreamUseCase } from "./price-stream-use-case.js";
  ```

- [ ] **Step 2: Write the failing test `packages/domain/src/usecases/price-stream-use-case.test.ts`.**

  Content:
  ```typescript
  import { describe, it, expect } from "vitest";
  import { PriceStreamUseCase } from "./price-stream-use-case.js";
  import type { PricingPort } from "../ports/pricing-port.js";
  import type { PriceTick, Price } from "../fx/price.js";
  import { PriceMovementType } from "../fx/price.js";
  import type { CurrencyPair } from "../fx/currency-pair.js";

  const EURUSD: CurrencyPair = {
    symbol: "EURUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "EUR",
    terms: "USD",
    defaultNotional: 1_000_000,
  };

  function stubPricing(ticks: PriceTick[]): PricingPort {
    return {
      async *getPriceUpdates(_symbol: string) {
        for (const tick of ticks) yield tick;
      },
      async getPriceHistory(_symbol: string) {
        return [];
      },
    };
  }

  async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of iter) out.push(item);
    return out;
  }

  describe("PriceStreamUseCase", () => {
    it("enriches each tick with spread and movement, tracking previous mid across ticks", async () => {
      const ticks: PriceTick[] = [
        { symbol: "EURUSD", bid: 1.10000, ask: 1.10002, mid: 1.10001, valueDate: "2024-01-02", creationTimestamp: 1 },
        { symbol: "EURUSD", bid: 1.10010, ask: 1.10012, mid: 1.10011, valueDate: "2024-01-02", creationTimestamp: 2 },
        { symbol: "EURUSD", bid: 1.10005, ask: 1.10007, mid: 1.10006, valueDate: "2024-01-02", creationTimestamp: 3 },
      ];
      const useCase = new PriceStreamUseCase(stubPricing(ticks));

      const results: Price[] = await collect(useCase.execute(EURUSD));

      expect(results).toHaveLength(3);
      expect(results[0].movementType).toBe(PriceMovementType.NONE);
      expect(results[1].movementType).toBe(PriceMovementType.UP);
      expect(results[2].movementType).toBe(PriceMovementType.DOWN);
      expect(results[0].spread).toBeCloseTo(2.0, 1);
      expect(results[0].symbol).toBe("EURUSD");
    });

    it("starts fresh on each call to execute (no shared state across calls)", async () => {
      const ticks: PriceTick[] = [
        { symbol: "EURUSD", bid: 1.10000, ask: 1.10002, mid: 1.10001, valueDate: "2024-01-02", creationTimestamp: 1 },
      ];
      const useCase = new PriceStreamUseCase(stubPricing(ticks));

      const first = await collect(useCase.execute(EURUSD));
      const second = await collect(useCase.execute(EURUSD));

      expect(first[0].movementType).toBe(PriceMovementType.NONE);
      expect(second[0].movementType).toBe(PriceMovementType.NONE);
    });
  });
  ```

- [ ] **Step 3: Run the test and confirm it fails because the use case does not exist.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -20
  ```
  Expected: failure with `Cannot find module './price-stream-use-case.js'` or similar.

- [ ] **Step 4: Implement the use case at `packages/domain/src/usecases/price-stream-use-case.ts`.**

  Content:
  ```typescript
  import type { PricingPort } from "../ports/pricing-port.js";
  import type { CurrencyPair } from "../fx/currency-pair.js";
  import type { Price } from "../fx/price.js";
  import { calculateSpread, detectMovement } from "../fx/price.js";

  export class PriceStreamUseCase {
    constructor(private readonly pricing: PricingPort) {}

    async *execute(pair: CurrencyPair): AsyncIterable<Price> {
      let previousMid: number | undefined = undefined;
      for await (const tick of this.pricing.getPriceUpdates(pair.symbol)) {
        const enriched: Price = {
          ...tick,
          movementType: detectMovement(tick.mid, previousMid),
          spread: calculateSpread(tick.bid, tick.ask, pair.pipsPosition, pair.ratePrecision),
        };
        previousMid = tick.mid;
        yield enriched;
      }
    }
  }
  ```

- [ ] **Step 5: Run the test and confirm it passes.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -10
  ```
  Expected: `Tests 2 passed (2)` for this file. Domain total now 81 (was 79).

- [ ] **Step 6: Add the use cases re-export block to `packages/domain/src/index.ts`.**

  Append a new section after the existing simulators export block:
  ```typescript
  // Use Cases
  export { PriceStreamUseCase } from "./usecases/index.js";
  ```

- [ ] **Step 7: Refactor `packages/client/src/fx/hooks/use-price-stream.ts` to delegate to the use case.**

  Replace the current file content with:
  ```typescript
  import { useEffect, useState } from "react";
  import {
    type Price,
    type CurrencyPair,
    PriceStreamUseCase,
  } from "@rtc/domain";
  import { useServices } from "../../services/service-provider";

  interface PriceStreamResult {
    price: Price | null;
    /** Increments on each new tick — use with useStaleDetection */
    version: number;
  }

  export function usePriceStream(pair: CurrencyPair): PriceStreamResult {
    const { pricing } = useServices();
    const [state, setState] = useState<{ price: Price | null; version: number }>({
      price: null,
      version: 0,
    });

    useEffect(() => {
      const useCase = new PriceStreamUseCase(pricing);
      let cancelled = false;

      (async () => {
        for await (const enriched of useCase.execute(pair)) {
          if (cancelled) break;
          setState((prev) => ({ price: enriched, version: prev.version + 1 }));
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [pricing, pair]);

    return state;
  }
  ```

  Notes: `enrichTick`, `useRef` for `prevMidRef`, and the imports of `calculateSpread` / `detectMovement` are all gone — they live in the use case.

- [ ] **Step 8: Verify the full suite passes.**

  Run:
  ```bash
  pnpm build && pnpm typecheck && pnpm test 2>&1 | tail -20
  ```
  Expected: build + typecheck pass. Unit test totals: domain 13 files / 81 tests, server 1 / 5 = **86 total**.

- [ ] **Step 9: Verify the e2e suite still passes.**

  ```bash
  pnpm test:e2e 2>&1 | tail -10
  ```
  Expected: **40 passed**. The price tile must continue to display bid/ask/spread/movement correctly.

- [ ] **Step 10: Stage and commit.**

  Run:
  ```bash
  git add packages/
  git status
  ```
  Confirm only the 5 expected files are staged. Then:
  ```bash
  git commit -m "Extract PriceStreamUseCase from usePriceStream

Moves enrichTick (movement + spread) and previousMid tracking
out of the React hook into a domain use case. Hook signature
unchanged; body now delegates to the use case."
  ```

---

## Task 2.2: Extract `PriceHistoryUseCase`

Moves the fixed-capacity ring buffer out of `usePriceHistory` into a domain use case.

**Files:**
- Create: `packages/domain/src/usecases/price-history-use-case.ts`
- Create: `packages/domain/src/usecases/price-history-use-case.test.ts`
- Modify: `packages/domain/src/usecases/index.ts` (add export)
- Modify: `packages/domain/src/index.ts` (add re-export)
- Modify: `packages/client/src/fx/hooks/use-price-history.ts` (refactor body)

- [ ] **Step 1: Write the failing test `packages/domain/src/usecases/price-history-use-case.test.ts`.**

  Content:
  ```typescript
  import { describe, it, expect } from "vitest";
  import { PriceHistoryUseCase } from "./price-history-use-case.js";
  import type { PricingPort } from "../ports/pricing-port.js";
  import type { PriceTick } from "../fx/price.js";
  import { PRICE_HISTORY_SIZE } from "../fx/price.js";

  function stubPricing(ticks: PriceTick[]): PricingPort {
    return {
      async *getPriceUpdates(_symbol: string) {
        for (const tick of ticks) yield tick;
      },
      async getPriceHistory(_symbol: string) {
        return [];
      },
    };
  }

  function tick(timestamp: number, mid: number): PriceTick {
    return {
      symbol: "EURUSD",
      bid: mid - 0.00001,
      ask: mid + 0.00001,
      mid,
      valueDate: "2024-01-02",
      creationTimestamp: timestamp,
    };
  }

  async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of iter) out.push(item);
    return out;
  }

  describe("PriceHistoryUseCase", () => {
    it("yields a growing window for the first N ticks", async () => {
      const ticks = [tick(1, 1.10), tick(2, 1.11), tick(3, 1.12)];
      const useCase = new PriceHistoryUseCase(stubPricing(ticks));

      const windows = await collect(useCase.execute("EURUSD"));

      expect(windows).toHaveLength(3);
      expect(windows[0]).toEqual([ticks[0]]);
      expect(windows[1]).toEqual([ticks[0], ticks[1]]);
      expect(windows[2]).toEqual([ticks[0], ticks[1], ticks[2]]);
    });

    it("caps the window at PRICE_HISTORY_SIZE, dropping the oldest tick", async () => {
      const allTicks = Array.from({ length: PRICE_HISTORY_SIZE + 3 }, (_, i) => tick(i, i));
      const useCase = new PriceHistoryUseCase(stubPricing(allTicks));

      const windows = await collect(useCase.execute("EURUSD"));

      expect(windows).toHaveLength(PRICE_HISTORY_SIZE + 3);
      const last = windows[windows.length - 1];
      expect(last).toHaveLength(PRICE_HISTORY_SIZE);
      expect(last[0]?.creationTimestamp).toBe(3);
      expect(last[PRICE_HISTORY_SIZE - 1]?.creationTimestamp).toBe(PRICE_HISTORY_SIZE + 2);
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -20
  ```
  Expected: failure with `Cannot find module './price-history-use-case.js'`.

- [ ] **Step 3: Implement `packages/domain/src/usecases/price-history-use-case.ts`.**

  Content:
  ```typescript
  import type { PricingPort } from "../ports/pricing-port.js";
  import type { PriceTick } from "../fx/price.js";
  import { PRICE_HISTORY_SIZE } from "../fx/price.js";

  export class PriceHistoryUseCase {
    constructor(private readonly pricing: PricingPort) {}

    async *execute(symbol: string): AsyncIterable<readonly PriceTick[]> {
      const buffer: PriceTick[] = [];
      for await (const tick of this.pricing.getPriceUpdates(symbol)) {
        buffer.push(tick);
        if (buffer.length > PRICE_HISTORY_SIZE) buffer.shift();
        yield [...buffer];
      }
    }
  }
  ```

- [ ] **Step 4: Run the test and confirm it passes.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -10
  ```
  Expected: 2 new tests pass; domain total 83.

- [ ] **Step 5: Update the use cases barrel `packages/domain/src/usecases/index.ts`.**

  Add line:
  ```typescript
  export { PriceHistoryUseCase } from "./price-history-use-case.js";
  ```

- [ ] **Step 6: Update `packages/domain/src/index.ts` to re-export the new use case.**

  In the "Use Cases" section, replace:
  ```typescript
  export { PriceStreamUseCase } from "./usecases/index.js";
  ```
  with:
  ```typescript
  export { PriceStreamUseCase, PriceHistoryUseCase } from "./usecases/index.js";
  ```

- [ ] **Step 7: Refactor `packages/client/src/fx/hooks/use-price-history.ts`.**

  Replace the current file content with:
  ```typescript
  import { useEffect, useState } from "react";
  import { type PriceTick, PriceHistoryUseCase } from "@rtc/domain";
  import { useServices } from "../../services/service-provider";

  export function usePriceHistory(symbol: string): readonly PriceTick[] {
    const { pricing } = useServices();
    const [history, setHistory] = useState<readonly PriceTick[]>([]);

    useEffect(() => {
      const useCase = new PriceHistoryUseCase(pricing);
      let cancelled = false;

      (async () => {
        for await (const window of useCase.execute(symbol)) {
          if (cancelled) break;
          setHistory(window);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [pricing, symbol]);

    return history;
  }
  ```

  Notes: `useRef` for `bufferRef`, the import of `PRICE_HISTORY_SIZE`, and the buffer accumulation are gone.

- [ ] **Step 8: Verify the full suite passes.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test 2>&1 | tail -20
  ```
  Expected: domain 14 files / 83 tests, server 1 / 5 = **88 total**.

- [ ] **Step 9: Verify e2e.**

  ```bash
  pnpm test:e2e 2>&1 | tail -10
  ```
  Expected: **40 passed**. The tile chart still renders the rolling sparkline.

- [ ] **Step 10: Commit.**

  ```bash
  git add packages/
  git status
  git commit -m "Extract PriceHistoryUseCase from usePriceHistory

Moves the PRICE_HISTORY_SIZE ring buffer out of the hook into
a domain use case. Hook signature unchanged."
  ```

---

## Task 2.3: Extract `ExecuteTradeUseCase`

Moves request building (rate selection, dealt-currency derivation, request shape) and status mapping out of `useExecuteTrade`. The use case orchestrates the port call; the hook keeps only the React `useCallback` and the `tileState` side effects.

**Files:**
- Create: `packages/domain/src/usecases/execute-trade-use-case.ts`
- Create: `packages/domain/src/usecases/execute-trade-use-case.test.ts`
- Modify: `packages/domain/src/usecases/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/client/src/fx/hooks/use-execute-trade.ts`

- [ ] **Step 1: Read the current `use-execute-trade.ts` to see the exact `tileState` interaction.**

  ```bash
  cat packages/client/src/fx/hooks/use-execute-trade.ts
  ```
  Note the current call sequence (start, finish, error/timeout handling). The refactor in Step 7 must preserve every observable behaviour around `tileState`.

- [ ] **Step 2: Write the failing test `packages/domain/src/usecases/execute-trade-use-case.test.ts`.**

  Content:
  ```typescript
  import { describe, it, expect, vi } from "vitest";
  import { ExecuteTradeUseCase } from "./execute-trade-use-case.js";
  import type { ExecutionPort } from "../ports/execution-port.js";
  import type { CurrencyPair } from "../fx/currency-pair.js";
  import type { Price, PriceTick } from "../fx/price.js";
  import { PriceMovementType } from "../fx/price.js";
  import type { Trade, ExecutionRequest } from "../fx/trade.js";
  import { Direction, TradeStatus, ExecutionStatus } from "../fx/trade.js";

  const EURUSD: CurrencyPair = {
    symbol: "EURUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "EUR",
    terms: "USD",
    defaultNotional: 1_000_000,
  };

  const PRICE: Price = {
    symbol: "EURUSD",
    bid: 1.10000,
    ask: 1.10002,
    mid: 1.10001,
    valueDate: "2024-01-02",
    creationTimestamp: 1,
    movementType: PriceMovementType.UP,
    spread: 2.0,
    version: 1,
  };

  function stubExecution(trade: Trade): { port: ExecutionPort; lastRequest: { current: ExecutionRequest | null } } {
    const lastRequest = { current: null as ExecutionRequest | null };
    const port: ExecutionPort = {
      async executeTrade(request) {
        lastRequest.current = request;
        return trade;
      },
    };
    return { port, lastRequest };
  }

  function buildTrade(status: TradeStatus): Trade {
    return {
      tradeId: 42,
      currencyPair: "EURUSD",
      traderName: "trader1",
      notional: 1_000_000,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1.10002,
      status,
      valueDate: "2024-01-02",
      tradeDate: "2024-01-02",
    };
  }

  describe("ExecuteTradeUseCase", () => {
    it("for Direction.Buy uses ask as spot rate and base currency as dealt", async () => {
      const { port, lastRequest } = stubExecution(buildTrade(TradeStatus.Done));
      const useCase = new ExecuteTradeUseCase(port);

      const result = await useCase.execute({
        pair: EURUSD,
        direction: Direction.Buy,
        price: PRICE,
        notional: 1_000_000,
      });

      expect(lastRequest.current).toEqual({
        currencyPair: "EURUSD",
        spotRate: 1.10002,
        direction: Direction.Buy,
        notional: 1_000_000,
        dealtCurrency: "EUR",
      });
      expect(result.status).toBe(ExecutionStatus.Done);
      expect(result.trade.status).toBe(TradeStatus.Done);
    });

    it("for Direction.Sell uses bid as spot rate and terms currency as dealt", async () => {
      const { port, lastRequest } = stubExecution(buildTrade(TradeStatus.Done));
      const useCase = new ExecuteTradeUseCase(port);

      await useCase.execute({
        pair: EURUSD,
        direction: Direction.Sell,
        price: PRICE,
        notional: 1_000_000,
      });

      expect(lastRequest.current?.spotRate).toBe(1.10000);
      expect(lastRequest.current?.dealtCurrency).toBe("USD");
      expect(lastRequest.current?.direction).toBe(Direction.Sell);
    });

    it("maps TradeStatus.Rejected to ExecutionStatus.Rejected", async () => {
      const { port } = stubExecution(buildTrade(TradeStatus.Rejected));
      const useCase = new ExecuteTradeUseCase(port);

      const result = await useCase.execute({
        pair: EURUSD,
        direction: Direction.Buy,
        price: PRICE,
        notional: 1_000_000,
      });

      expect(result.status).toBe(ExecutionStatus.Rejected);
      expect(result.trade.status).toBe(TradeStatus.Rejected);
    });

    it("propagates errors from the port (timeout handling stays in the hook)", async () => {
      const port: ExecutionPort = {
        async executeTrade() {
          throw new Error("timeout");
        },
      };
      const useCase = new ExecuteTradeUseCase(port);

      await expect(
        useCase.execute({ pair: EURUSD, direction: Direction.Buy, price: PRICE, notional: 1_000_000 }),
      ).rejects.toThrow("timeout");
    });
  });
  ```

- [ ] **Step 3: Run the test and confirm it fails.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -20
  ```
  Expected: `Cannot find module './execute-trade-use-case.js'`.

- [ ] **Step 4: Implement `packages/domain/src/usecases/execute-trade-use-case.ts`.**

  Content:
  ```typescript
  import type { ExecutionPort } from "../ports/execution-port.js";
  import type { CurrencyPair } from "../fx/currency-pair.js";
  import type { Price } from "../fx/price.js";
  import type { Trade, ExecutionRequest } from "../fx/trade.js";
  import {
    Direction,
    TradeStatus,
    ExecutionStatus,
    deriveDealtCurrency,
  } from "../fx/trade.js";

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

    async execute(input: ExecuteTradeInput): Promise<ExecuteTradeResult> {
      const spotRate =
        input.direction === Direction.Buy ? input.price.ask : input.price.bid;
      const dealtCurrency = deriveDealtCurrency(input.pair.symbol, input.direction);
      const request: ExecutionRequest = {
        currencyPair: input.pair.symbol,
        spotRate,
        direction: input.direction,
        notional: input.notional,
        dealtCurrency,
      };
      const trade = await this.execution.executeTrade(request);
      const status =
        trade.status === TradeStatus.Rejected
          ? ExecutionStatus.Rejected
          : ExecutionStatus.Done;
      return { trade, status };
    }
  }
  ```

- [ ] **Step 5: Run the test and confirm it passes.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -10
  ```
  Expected: 4 new tests pass; domain total 87.

- [ ] **Step 6: Update the use cases barrel.**

  In `packages/domain/src/usecases/index.ts`, add:
  ```typescript
  export { ExecuteTradeUseCase } from "./execute-trade-use-case.js";
  export type { ExecuteTradeInput, ExecuteTradeResult } from "./execute-trade-use-case.js";
  ```

- [ ] **Step 7: Update `packages/domain/src/index.ts`.**

  In the Use Cases section, append:
  ```typescript
  export { ExecuteTradeUseCase } from "./usecases/index.js";
  export type { ExecuteTradeInput, ExecuteTradeResult } from "./usecases/index.js";
  ```

- [ ] **Step 8: Refactor `packages/client/src/fx/hooks/use-execute-trade.ts` to delegate to the use case.**

  This step is the most subtle of the phase. **Read the current file first** (Step 1) and preserve the exact `tileState` call sequence (e.g. `tileState.start()` before, `tileState.finish(status)` after success, `tileState.finish(ExecutionStatus.Timeout)` on timeout). Replace the request-building and status-mapping logic with a single `useCase.execute(...)` call, but leave every `tileState.*` invocation intact.

  The refactored file MUST:
  - Import `ExecuteTradeUseCase` from `@rtc/domain`.
  - Drop imports of `deriveDealtCurrency`, `TradeStatus`, and any helper that has moved into the use case (keep `Direction`, `ExecutionStatus`, `Price`, `CurrencyPair` as needed by the hook signature).
  - Inside the `useCallback`, replace the request-building block and the trade-status check with:
    ```typescript
    const useCase = new ExecuteTradeUseCase(execution);
    tileState.start();
    try {
      const { status } = await useCase.execute({ pair, direction, price, notional });
      tileState.finish(status);
    } catch (err) {
      tileState.finish(ExecutionStatus.Timeout);
    }
    ```
  - Preserve any timeout-promise wrapping logic that exists today (if the current hook wraps the execute call in a `Promise.race` against a timeout, keep that race; only the inner work is replaced).

  After editing, verify by inspection that no domain logic remains in the hook — only React + `tileState` orchestration.

- [ ] **Step 9: Verify the full suite passes.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test 2>&1 | tail -20
  ```
  Expected: domain 15 files / 87 tests, server 1 / 5 = **92 total**.

- [ ] **Step 10: Verify e2e — execution flow is the highest-risk path here.**

  ```bash
  pnpm test:e2e 2>&1 | tail -20
  ```
  Expected: **40 passed**. The fx-trading.spec.ts tests cover Buy/Sell/Reject/Timeout scenarios; all must remain green.

- [ ] **Step 11: Commit.**

  ```bash
  git add packages/
  git status
  git commit -m "Extract ExecuteTradeUseCase from useExecuteTrade

Moves rate selection, dealt-currency derivation, request
building, and status mapping out of the hook into a domain
use case. Hook now contains only useCallback + tileState
side effects."
  ```

---

## Task 2.4: Extract `AnalyticsUseCase`

Moves the hardcoded `"USD"` base-currency policy out of `useAnalytics`.

**Files:**
- Create: `packages/domain/src/usecases/analytics-use-case.ts`
- Create: `packages/domain/src/usecases/analytics-use-case.test.ts`
- Modify: `packages/domain/src/usecases/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/client/src/analytics/hooks/use-analytics.ts`

- [ ] **Step 1: Write the failing test `packages/domain/src/usecases/analytics-use-case.test.ts`.**

  Content:
  ```typescript
  import { describe, it, expect } from "vitest";
  import { AnalyticsUseCase } from "./analytics-use-case.js";
  import type { AnalyticsPort } from "../ports/analytics-port.js";
  import type { PositionUpdates } from "../analytics/position.js";

  function stubAnalytics(updates: PositionUpdates[]): { port: AnalyticsPort; lastCurrency: { current: string | null } } {
    const lastCurrency = { current: null as string | null };
    const port: AnalyticsPort = {
      async *getAnalytics(currency) {
        lastCurrency.current = currency;
        for (const u of updates) yield u;
      },
    };
    return { port, lastCurrency };
  }

  function buildUpdate(): PositionUpdates {
    return {
      currentPositions: [],
      history: [],
    };
  }

  async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of iter) out.push(item);
    return out;
  }

  describe("AnalyticsUseCase", () => {
    it("calls the port with the default base currency 'USD'", async () => {
      const { port, lastCurrency } = stubAnalytics([buildUpdate()]);
      const useCase = new AnalyticsUseCase(port);

      await collect(useCase.execute());

      expect(lastCurrency.current).toBe("USD");
    });

    it("uses an explicit base currency when provided", async () => {
      const { port, lastCurrency } = stubAnalytics([buildUpdate()]);
      const useCase = new AnalyticsUseCase(port, "EUR");

      await collect(useCase.execute());

      expect(lastCurrency.current).toBe("EUR");
    });

    it("yields every update from the port unchanged", async () => {
      const updates = [buildUpdate(), buildUpdate(), buildUpdate()];
      const { port } = stubAnalytics(updates);
      const useCase = new AnalyticsUseCase(port);

      const results = await collect(useCase.execute());

      expect(results).toHaveLength(3);
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -20
  ```
  Expected: `Cannot find module './analytics-use-case.js'`.

- [ ] **Step 3: Implement `packages/domain/src/usecases/analytics-use-case.ts`.**

  Content:
  ```typescript
  import type { AnalyticsPort } from "../ports/analytics-port.js";
  import type { PositionUpdates } from "../analytics/position.js";

  const DEFAULT_BASE_CURRENCY = "USD";

  export class AnalyticsUseCase {
    constructor(
      private readonly analytics: AnalyticsPort,
      private readonly baseCurrency: string = DEFAULT_BASE_CURRENCY,
    ) {}

    async *execute(): AsyncIterable<PositionUpdates> {
      yield* this.analytics.getAnalytics(this.baseCurrency);
    }
  }
  ```

- [ ] **Step 4: Run the test and confirm it passes.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -10
  ```
  Expected: 3 new tests pass; domain total 90.

- [ ] **Step 5: Update the use cases barrel.**

  In `packages/domain/src/usecases/index.ts`, add:
  ```typescript
  export { AnalyticsUseCase } from "./analytics-use-case.js";
  ```

- [ ] **Step 6: Update `packages/domain/src/index.ts`.**

  In the Use Cases section, add `AnalyticsUseCase` to the existing export from `./usecases/index.js`.

- [ ] **Step 7: Refactor `packages/client/src/analytics/hooks/use-analytics.ts`.**

  Replace the file content with:
  ```typescript
  import { useEffect, useState } from "react";
  import { type PositionUpdates, AnalyticsUseCase } from "@rtc/domain";
  import { useServices } from "../../services/service-provider";

  interface AnalyticsResult {
    data: PositionUpdates | null;
    version: number;
  }

  export function useAnalytics(): AnalyticsResult {
    const { analytics } = useServices();
    const [state, setState] = useState<AnalyticsResult>({ data: null, version: 0 });

    useEffect(() => {
      const useCase = new AnalyticsUseCase(analytics);
      let cancelled = false;

      (async () => {
        for await (const update of useCase.execute()) {
          if (cancelled) break;
          setState((prev) => ({ data: update, version: prev.version + 1 }));
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [analytics]);

    return state;
  }
  ```

- [ ] **Step 8: Verify the full suite passes.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test 2>&1 | tail -20
  ```
  Expected: domain 16 / 90, server 1 / 5 = **95 total**.

- [ ] **Step 9: Verify e2e.**

  ```bash
  pnpm test:e2e 2>&1 | tail -10
  ```
  Expected: **40 passed**. analytics.spec.ts continues to render PnL chart and position bars.

- [ ] **Step 10: Commit.**

  ```bash
  git add packages/
  git status
  git commit -m "Extract AnalyticsUseCase from useAnalytics

Moves the hardcoded 'USD' base currency out of the hook into
a domain use case with a configurable constructor parameter."
  ```

---

## Task 2.5: Extract `WorkflowEventStreamUseCase` and `reduceRfqEvent`

The most complex extraction in Phase 2. The current `useRfqStream` hook contains a `(state, event) => state` reducer over discriminated `RfqEvent`s, maintaining two `Map` collections. The reducer is pure — it moves into domain. The use case wraps the port subscription and yields fully-projected snapshots so the hook just calls `setState`.

**Files:**
- Create: `packages/domain/src/usecases/workflow-event-stream-use-case.ts`
- Create: `packages/domain/src/usecases/workflow-event-stream-use-case.test.ts`
- Modify: `packages/domain/src/usecases/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/client/src/credit/hooks/use-rfq-stream.ts`

- [ ] **Step 1: Read the current `use-rfq-stream.ts` to capture the exact reducer behaviour.**

  ```bash
  cat packages/client/src/credit/hooks/use-rfq-stream.ts
  ```
  Note: the reducer responds to `startOfStateOfTheWorld`, `rfqCreated`, `rfqClosed`, `quoteCreated`, `quoteQuoted`, `quotePassed`, `quoteAccepted` (and possibly more — check the actual `RfqEvent` discriminated union in `packages/domain/src/ports/workflow-port.ts`). Capture exactly what state-shape the reducer outputs (`{ rfqsById: Map<...>, quotesById: Map<...> }` or similar).

- [ ] **Step 2: Confirm the `RfqEvent` discriminated union shape.**

  ```bash
  cat packages/domain/src/ports/workflow-port.ts
  ```
  This file is the source of truth for the union. The reducer's `switch` must be exhaustive over its `type` discriminant.

- [ ] **Step 3: Write the failing test `packages/domain/src/usecases/workflow-event-stream-use-case.test.ts`.**

  The `RfqEvent` union has exactly 8 variants (verified in Step 2): `startOfStateOfTheWorld`, `endOfStateOfTheWorld`, `rfqCreated`, `rfqClosed`, `quoteCreated`, `quoteQuoted`, `quotePassed`, `quoteAccepted`. Each test below covers one variant. `Quote.state` is a `QuoteState` object (e.g. `{ type: "pendingWithoutPrice" }`), not a bare string.

  Content:
  ```typescript
  import { describe, it, expect } from "vitest";
  import {
    WorkflowEventStreamUseCase,
    reduceRfqEvent,
    type RfqStreamState,
  } from "./workflow-event-stream-use-case.js";
  import type { WorkflowPort, RfqEvent } from "../ports/workflow-port.js";
  import type { Rfq } from "../credit/rfq.js";
  import { RfqState } from "../credit/rfq.js";
  import { Direction } from "../fx/trade.js";
  import type { Quote } from "../credit/quote.js";

  function stubWorkflow(events: RfqEvent[]): WorkflowPort {
    return {
      async *subscribe() {
        for (const e of events) yield e;
      },
      async createRfq() { throw new Error("not used"); },
      async cancelRfq() { throw new Error("not used"); },
      async quote() { throw new Error("not used"); },
      async pass() { throw new Error("not used"); },
      async accept() { throw new Error("not used"); },
    };
  }

  function emptyState(): RfqStreamState {
    return { rfqsById: new Map(), quotesById: new Map() };
  }

  function buildRfq(id: number, state: RfqState = RfqState.Open): Rfq {
    return {
      id,
      instrumentId: 1,
      quantity: 1000,
      direction: Direction.Buy,
      state,
      expirySecs: 120,
      creationTimestamp: 1000,
    };
  }

  function buildQuote(id: number, rfqId: number, dealerId = 1): Quote {
    return { id, rfqId, dealerId, state: { type: "pendingWithoutPrice" } };
  }

  describe("reduceRfqEvent", () => {
    it("startOfStateOfTheWorld clears both maps", () => {
      const start: RfqStreamState = {
        rfqsById: new Map([[1, buildRfq(1)]]),
        quotesById: new Map([[1, buildQuote(1, 1)]]),
      };
      const next = reduceRfqEvent(start, { type: "startOfStateOfTheWorld" });
      expect(next.rfqsById.size).toBe(0);
      expect(next.quotesById.size).toBe(0);
    });

    it("endOfStateOfTheWorld is a no-op (returns state unchanged)", () => {
      const start: RfqStreamState = {
        rfqsById: new Map([[1, buildRfq(1)]]),
        quotesById: new Map([[1, buildQuote(1, 1)]]),
      };
      const next = reduceRfqEvent(start, { type: "endOfStateOfTheWorld" });
      expect(next.rfqsById.size).toBe(1);
      expect(next.quotesById.size).toBe(1);
    });

    it("rfqCreated upserts the rfq into rfqsById", () => {
      const rfq = buildRfq(7);
      const next = reduceRfqEvent(emptyState(), { type: "rfqCreated", payload: rfq });
      expect(next.rfqsById.get(7)).toEqual(rfq);
      expect(next.quotesById.size).toBe(0);
    });

    it("rfqClosed upserts the (closed) rfq, replacing the open version", () => {
      const open = buildRfq(7, RfqState.Open);
      const closed = buildRfq(7, RfqState.Closed);
      const start: RfqStreamState = {
        rfqsById: new Map([[7, open]]),
        quotesById: new Map(),
      };
      const next = reduceRfqEvent(start, { type: "rfqClosed", payload: closed });
      expect(next.rfqsById.get(7)?.state).toBe(RfqState.Closed);
    });

    it("quoteCreated upserts the quote into quotesById", () => {
      const quote = buildQuote(5, 7);
      const next = reduceRfqEvent(emptyState(), { type: "quoteCreated", payload: quote });
      expect(next.quotesById.get(5)).toEqual(quote);
      expect(next.rfqsById.size).toBe(0);
    });

    it("quoteQuoted upserts the priced quote, replacing the previous version", () => {
      const pending = buildQuote(5, 7);
      const priced: Quote = { ...pending, state: { type: "pendingWithPrice", price: 100 } };
      const start: RfqStreamState = {
        rfqsById: new Map(),
        quotesById: new Map([[5, pending]]),
      };
      const next = reduceRfqEvent(start, { type: "quoteQuoted", payload: priced });
      expect(next.quotesById.get(5)?.state).toEqual({ type: "pendingWithPrice", price: 100 });
    });

    it("quotePassed upserts the passed quote", () => {
      const passed: Quote = { id: 5, rfqId: 7, dealerId: 1, state: { type: "passed" } };
      const next = reduceRfqEvent(emptyState(), { type: "quotePassed", payload: passed });
      expect(next.quotesById.get(5)?.state).toEqual({ type: "passed" });
    });

    it("quoteAccepted upserts the accepted quote", () => {
      const accepted: Quote = { id: 5, rfqId: 7, dealerId: 1, state: { type: "accepted", price: 100 } };
      const next = reduceRfqEvent(emptyState(), { type: "quoteAccepted", payload: accepted });
      expect(next.quotesById.get(5)?.state).toEqual({ type: "accepted", price: 100 });
    });
  });

  describe("WorkflowEventStreamUseCase", () => {
    it("yields a snapshot after each event reflecting the cumulative reduction", async () => {
      const rfq1 = buildRfq(1);
      const rfq2 = buildRfq(2);
      const quote1 = buildQuote(10, 1);
      const events: RfqEvent[] = [
        { type: "startOfStateOfTheWorld" },
        { type: "rfqCreated", payload: rfq1 },
        { type: "quoteCreated", payload: quote1 },
        { type: "rfqCreated", payload: rfq2 },
        { type: "endOfStateOfTheWorld" },
      ];
      const useCase = new WorkflowEventStreamUseCase(stubWorkflow(events));

      const snapshots: RfqStreamState[] = [];
      for await (const s of useCase.execute()) snapshots.push(s);

      expect(snapshots).toHaveLength(5);
      expect(snapshots[0].rfqsById.size).toBe(0); // after startOfSoW
      expect(snapshots[1].rfqsById.get(1)).toEqual(rfq1);
      expect(snapshots[2].quotesById.get(10)).toEqual(quote1);
      expect(snapshots[3].rfqsById.size).toBe(2);
      expect(snapshots[4].rfqsById.size).toBe(2); // endOfSoW is a no-op
      expect(snapshots[4].quotesById.size).toBe(1);
    });
  });
  ```

- [ ] **Step 4: Run the test and confirm it fails.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -20
  ```
  Expected: `Cannot find module './workflow-event-stream-use-case.js'`.

- [ ] **Step 5: Implement `packages/domain/src/usecases/workflow-event-stream-use-case.ts`.**

  The skeleton is below; the `switch` body must be exhaustive over the actual `RfqEvent` union from Step 2. Use TypeScript's `never` check at the default branch to enforce exhaustiveness.

  ```typescript
  import type { WorkflowPort, RfqEvent } from "../ports/workflow-port.js";
  import type { Rfq } from "../credit/rfq.js";
  import type { Quote } from "../credit/quote.js";

  export interface RfqStreamState {
    readonly rfqsById: ReadonlyMap<number, Rfq>;
    readonly quotesById: ReadonlyMap<number, Quote>;
  }

  function emptyState(): RfqStreamState {
    return { rfqsById: new Map(), quotesById: new Map() };
  }

  export function reduceRfqEvent(state: RfqStreamState, event: RfqEvent): RfqStreamState {
    switch (event.type) {
      case "startOfStateOfTheWorld":
        return emptyState();
      case "endOfStateOfTheWorld":
        return state;
      case "rfqCreated":
      case "rfqClosed": {
        const next = new Map(state.rfqsById);
        next.set(event.payload.id, event.payload);
        return { ...state, rfqsById: next };
      }
      case "quoteCreated":
      case "quoteQuoted":
      case "quotePassed":
      case "quoteAccepted": {
        const next = new Map(state.quotesById);
        next.set(event.payload.id, event.payload);
        return { ...state, quotesById: next };
      }
    }
  }

  export class WorkflowEventStreamUseCase {
    constructor(private readonly workflow: WorkflowPort) {}

    async *execute(): AsyncIterable<RfqStreamState> {
      let state = emptyState();
      for await (const event of this.workflow.subscribe()) {
        state = reduceRfqEvent(state, event);
        yield state;
      }
    }
  }
  ```

  After implementing, verify the file typechecks. If TypeScript reports a `never` mismatch at the default branch, the union has variants not yet handled — add the missing cases.

- [ ] **Step 6: Run the test and confirm it passes.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -10
  ```
  Expected: all new tests pass; record the new domain total.

- [ ] **Step 7: Update the use cases barrel.**

  In `packages/domain/src/usecases/index.ts`, add:
  ```typescript
  export {
    WorkflowEventStreamUseCase,
    reduceRfqEvent,
  } from "./workflow-event-stream-use-case.js";
  export type { RfqStreamState } from "./workflow-event-stream-use-case.js";
  ```

- [ ] **Step 8: Update `packages/domain/src/index.ts`.**

  Add `WorkflowEventStreamUseCase`, `reduceRfqEvent`, and `RfqStreamState` to the Use Cases re-exports.

- [ ] **Step 9: Refactor `packages/client/src/credit/hooks/use-rfq-stream.ts` to delegate to the use case.**

  The new hook receives full `RfqStreamState` snapshots from the use case and stores them in React state. The two derived selectors (`rfqs` array, `getQuotesForRfq`) are computed inline from the snapshot.

  Replace the file with:
  ```typescript
  import { useCallback, useEffect, useState } from "react";
  import {
    type Quote,
    type Rfq,
    type RfqStreamState,
    WorkflowEventStreamUseCase,
  } from "@rtc/domain";
  import { useServices } from "../../services/service-provider";

  interface UseRfqStreamResult {
    rfqs: readonly Rfq[];
    getQuotesForRfq: (rfqId: number) => readonly Quote[];
    allQuotes: ReadonlyMap<number, Quote>;
  }

  function emptySnapshot(): RfqStreamState {
    return { rfqsById: new Map(), quotesById: new Map() };
  }

  export function useRfqStream(): UseRfqStreamResult {
    const { workflow } = useServices();
    const [snapshot, setSnapshot] = useState<RfqStreamState>(emptySnapshot());

    useEffect(() => {
      const useCase = new WorkflowEventStreamUseCase(workflow);
      let cancelled = false;

      (async () => {
        for await (const next of useCase.execute()) {
          if (cancelled) break;
          setSnapshot(next);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [workflow]);

    const getQuotesForRfq = useCallback(
      (rfqId: number) =>
        Array.from(snapshot.quotesById.values()).filter((q) => q.rfqId === rfqId),
      [snapshot],
    );

    return {
      rfqs: Array.from(snapshot.rfqsById.values()),
      getQuotesForRfq,
      allQuotes: snapshot.quotesById,
    };
  }
  ```

  Notes: the reducer is gone; the two `Map` setStates are replaced by a single `setSnapshot`. The `useCallback` and `Array.from` projections are React-layer derived state and stay.

- [ ] **Step 10: Verify the full suite passes.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test 2>&1 | tail -20
  ```
  Expected: domain test count grows by however many `reduceRfqEvent` cases were added in Step 3 plus 1 use-case test. Confirm new total.

- [ ] **Step 11: Verify e2e — credit-rfq.spec.ts is the canary.**

  ```bash
  pnpm test:e2e 2>&1 | tail -20
  ```
  Expected: **40 passed**. The RFQ creation, dealer quote, accept, and reject scenarios must all pass.

- [ ] **Step 12: Commit.**

  ```bash
  git add packages/
  git status
  git commit -m "Extract WorkflowEventStreamUseCase and reduceRfqEvent

Moves the RfqEvent fold (reducer over the discriminated union)
out of useRfqStream into a pure domain function plus a use case
that yields full RfqStreamState snapshots. Hook signature
unchanged."
  ```

---

## Task 2.6: Extract `CreateRfqUseCase`

Smallest extraction. Moves the `quantity * CREDIT_QUANTITY_MULTIPLIER` translation and the hardcoded `expirySecs: 120` out of `useCreateRfq`.

**Files:**
- Create: `packages/domain/src/usecases/create-rfq-use-case.ts`
- Create: `packages/domain/src/usecases/create-rfq-use-case.test.ts`
- Modify: `packages/domain/src/usecases/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/client/src/credit/hooks/use-create-rfq.ts`

- [ ] **Step 1: Confirm the current `useCreateRfq` parameter shape.**

  ```bash
  cat packages/client/src/credit/hooks/use-create-rfq.ts
  ```
  Confirm: `params: { instrumentId: number; dealerIds: number[]; quantity: number; direction: Direction; }` and `expirySecs: 120` is hardcoded inside the hook. Adjust the test in Step 2 if the actual shape differs.

- [ ] **Step 2: Write the failing test `packages/domain/src/usecases/create-rfq-use-case.test.ts`.**

  Content:
  ```typescript
  import { describe, it, expect } from "vitest";
  import { CreateRfqUseCase, RFQ_DEFAULT_EXPIRY_SECS } from "./create-rfq-use-case.js";
  import type { WorkflowPort, CreateRfqRequest } from "../ports/workflow-port.js";
  import { CREDIT_QUANTITY_MULTIPLIER } from "../credit/rfq.js";
  import { Direction } from "../fx/trade.js";

  function stubWorkflow(): { port: WorkflowPort; lastRequest: { current: CreateRfqRequest | null } } {
    const lastRequest = { current: null as CreateRfqRequest | null };
    const port: WorkflowPort = {
      async *subscribe() {},
      async createRfq(request) {
        lastRequest.current = request;
        return 42;
      },
      async cancelRfq() {},
      async quote() {},
      async pass() {},
      async accept() {},
    };
    return { port, lastRequest };
  }

  describe("CreateRfqUseCase", () => {
    it("multiplies the input quantity by CREDIT_QUANTITY_MULTIPLIER and applies default expiry", async () => {
      const { port, lastRequest } = stubWorkflow();
      const useCase = new CreateRfqUseCase(port);

      const id = await useCase.execute({
        instrumentId: 7,
        dealerIds: [1, 2, 3],
        quantity: 100,
        direction: Direction.Buy,
      });

      expect(id).toBe(42);
      expect(lastRequest.current).toEqual({
        instrumentId: 7,
        dealerIds: [1, 2, 3],
        quantity: 100 * CREDIT_QUANTITY_MULTIPLIER,
        direction: Direction.Buy,
        expirySecs: RFQ_DEFAULT_EXPIRY_SECS,
      });
    });

    it("accepts an explicit expirySecs override", async () => {
      const { port, lastRequest } = stubWorkflow();
      const useCase = new CreateRfqUseCase(port);

      await useCase.execute({
        instrumentId: 7,
        dealerIds: [1],
        quantity: 50,
        direction: Direction.Sell,
        expirySecs: 60,
      });

      expect(lastRequest.current?.expirySecs).toBe(60);
    });
  });
  ```

- [ ] **Step 3: Run the test and confirm it fails.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -20
  ```
  Expected: `Cannot find module './create-rfq-use-case.js'`.

- [ ] **Step 4: Implement `packages/domain/src/usecases/create-rfq-use-case.ts`.**

  Content:
  ```typescript
  import type { WorkflowPort, CreateRfqRequest } from "../ports/workflow-port.js";
  import type { Direction } from "../fx/trade.js";
  import { CREDIT_QUANTITY_MULTIPLIER } from "../credit/rfq.js";

  export const RFQ_DEFAULT_EXPIRY_SECS = 120;

  export interface CreateRfqInput {
    readonly instrumentId: number;
    readonly dealerIds: readonly number[];
    /** UI-scale quantity. Multiplied by CREDIT_QUANTITY_MULTIPLIER before sending to the port. */
    readonly quantity: number;
    readonly direction: Direction;
    readonly expirySecs?: number;
  }

  export class CreateRfqUseCase {
    constructor(private readonly workflow: WorkflowPort) {}

    async execute(input: CreateRfqInput): Promise<number> {
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

- [ ] **Step 5: Run the test and confirm it passes.**

  ```bash
  pnpm --filter @rtc/domain test 2>&1 | tail -10
  ```
  Expected: 2 new tests pass.

- [ ] **Step 6: Update the use cases barrel.**

  In `packages/domain/src/usecases/index.ts`, add:
  ```typescript
  export { CreateRfqUseCase, RFQ_DEFAULT_EXPIRY_SECS } from "./create-rfq-use-case.js";
  export type { CreateRfqInput } from "./create-rfq-use-case.js";
  ```

- [ ] **Step 7: Update `packages/domain/src/index.ts`.**

  Add `CreateRfqUseCase`, `RFQ_DEFAULT_EXPIRY_SECS`, `CreateRfqInput` to the Use Cases re-exports.

- [ ] **Step 8: Refactor `packages/client/src/credit/hooks/use-create-rfq.ts`.**

  Replace the file with:
  ```typescript
  import { useCallback } from "react";
  import { type Direction, CreateRfqUseCase } from "@rtc/domain";
  import { useServices } from "../../services/service-provider";

  export interface CreateRfqParams {
    instrumentId: number;
    dealerIds: number[];
    quantity: number;
    direction: Direction;
  }

  export function useCreateRfq(): (params: CreateRfqParams) => Promise<number> {
    const { workflow } = useServices();
    return useCallback(
      (params) => new CreateRfqUseCase(workflow).execute(params),
      [workflow],
    );
  }
  ```

  Notes: imports of `CREDIT_QUANTITY_MULTIPLIER` and any expiry constant are gone.

- [ ] **Step 9: Verify the full suite passes.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test 2>&1 | tail -20
  ```
  Expected: domain test count grows by 2; record the new total.

- [ ] **Step 10: Verify e2e.**

  ```bash
  pnpm test:e2e 2>&1 | tail -10
  ```
  Expected: **40 passed**. RFQ creation must still work end-to-end.

- [ ] **Step 11: Commit.**

  ```bash
  git add packages/
  git status
  git commit -m "Extract CreateRfqUseCase from useCreateRfq

Moves quantity multiplier translation and default expirySecs
out of the hook into a domain use case."
  ```

---

## Task 2.7: Final verification

**Files:** none modified, except possibly a minor doc update.

- [ ] **Step 1: Run the full suite, including e2e.**

  ```bash
  pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e
  ```
  Expected: all green. Unit-test total = 84 (Phase 1 baseline) + however many tests Phase 2 added across Tasks 2.1–2.6. E2E total = 40 (unchanged).

- [ ] **Step 2: Confirm the working tree is clean.**

  ```bash
  git status
  ```
  Expected: `nothing to commit, working tree clean`.

- [ ] **Step 3: Confirm the use cases module structure.**

  ```bash
  ls packages/domain/src/usecases/
  ```
  Expected: `index.ts`, `analytics-use-case.ts`, `analytics-use-case.test.ts`, `create-rfq-use-case.ts`, `create-rfq-use-case.test.ts`, `execute-trade-use-case.ts`, `execute-trade-use-case.test.ts`, `price-history-use-case.ts`, `price-history-use-case.test.ts`, `price-stream-use-case.ts`, `price-stream-use-case.test.ts`, `workflow-event-stream-use-case.ts`, `workflow-event-stream-use-case.test.ts`.

- [ ] **Step 4: Confirm domain still has zero runtime dependencies.**

  ```bash
  cat packages/domain/package.json
  ```
  Expected: no `dependencies` field, only `devDependencies` (vitest).

- [ ] **Step 5: Confirm no React, RxJS, or DOM types appear in any use case file.**

  ```bash
  grep -rEn "from \"react\"|from \"rxjs\"|@types/dom|window\\.|document\\." packages/domain/src/usecases 2>/dev/null
  ```
  Expected: zero matches.

- [ ] **Step 6: Inspect the Phase 2 commit log.**

  ```bash
  git log --oneline 48d8f20..HEAD
  ```
  Expected: 6 commits, one per use-case extraction, each starting with "Extract".

- [ ] **Step 7: Update `docs/architecture.md` §11 to mark the use cases as implemented.**

  Find the row:
  ```
  | **Use Cases** (target location) | `packages/domain/src/usecases/*.ts` or `packages/client/src/app/usecases/*.ts` | Application logic; today partially in client hooks |
  ```
  Replace with:
  ```
  | **Use Cases** | `packages/domain/src/usecases/*.ts` | Application logic; 6 use cases extracted in Phase 2 |
  ```

- [ ] **Step 8: Commit the doc update.**

  ```bash
  git add docs/architecture.md
  git commit -m "Mark use cases as implemented in architecture.md after Phase 2"
  ```

- [ ] **Step 9: Phase 2 complete. Report.**

  Output to user: number of commits, total test count (must be `84 + N`), confirmation that all 6 hooks delegate to use cases. Do not push without explicit user instruction.

---

## Out of Scope (deferred to Phase 3)

- Pure pass-through hooks: `useCurrencyPairs`, `useTradeStream`, `useInstruments`, `useDealers`, `useConnection` — get use cases when the presenter layer arrives.
- `useRfqQuote` — needs `PricingPort.getRfqQuote` evolution, scoped to Phase 3.
- `cancelRfq`, `acceptQuote`, `passQuote`, `quote` workflow commands — wrapped in use cases when needed by Phase 3 presenters.
- Composition Root and retiring `ServiceProvider`.
- Presenters and `react-rxjs`.

## Next steps after Phase 2

When Phase 2 is complete and merged, brainstorm Phase 3 (Presenters + `react-rxjs` + Composition Root). The Phase 3 plan will:
- add `react-rxjs` and `rxjs` interop helpers,
- create one presenter per UI feature area, wrapping use cases as RxJS streams,
- generate hooks via `react-rxjs` `bind()`,
- replace every existing hook body with a call to the generated hook,
- introduce a Composition Root that constructs the entire dependency graph at startup,
- retire `ServiceProvider` Context and rename `mock-service-factory.ts` → `composition.ts`.
