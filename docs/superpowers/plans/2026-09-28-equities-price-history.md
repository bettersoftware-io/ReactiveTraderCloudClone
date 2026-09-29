# Equities Price History (M4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give equities a rolling window of live quotes — the 75th application-core member, `presenters.equityPriceHistory` — and drive RN's movers sparkline from it instead of candle closes, while closing the five prototype ↔ data-model ledger rows that need no model change.

**Architecture:** A domain use case folds `MarketDataPort.quotes(symbol)` into a capped window, exactly as `PriceHistoryUseCase` does for FX. Each of the three application cores wraps it in a presenter that owns one window per symbol (so a remount repaints instead of blanking) while releasing the per-symbol quote subscription on the last unsubscribe. `@rtc/react-bindings` exposes it as `useEquityPriceHistory`; only the RN client consumes it.

**Tech Stack:** TypeScript 7, RxJS (domain + RxJS core), async/AsyncIterable kernel (`@rtc/client-core-async`), Effect-TS (`@rtc/client-core-effect`), Vitest, Jest + RNTL (RN), Skia (RN sparkline).

**Spec:** [`docs/superpowers/specs/2026-09-28-equities-price-history-design.md`](../specs/2026-09-28-equities-price-history-design.md)

## Global Constraints

- Work only in the worktree `.claude/worktrees/equities-price-history` (branch `worktree-equities-price-history`). Never edit the primary checkout.
- `EQUITY_PRICE_HISTORY_SIZE = 25` — the prototype's `slice(-25)`, `Reactive Trader Mobile.dc.html:2262`.
- The window is **unseeded**: no new `MarketDataPort` method, no simulator, `@rtc/shared`, wire or server change.
- Conflation while calm uses the FX interval, `PRICE_HISTORY_CONFLATION_MS`.
- The sibling cores import rxjs **values** only inside their own `bridge/` (dep-cruiser `bridge-owns-rxjs`, grep gate 43). Reuse each core's existing FX helpers (`topicToStreamWithLead` + `createConflatedTopic`; `conflatedFold`) — they already live on the right side of that line.
- No web UI component and no web golden changes. The web's only edits: one devtools manifest line in each web client, and `client-react`'s two **test** fakes.
- Braces on every control statement (Biome `useBlockStatements`); `#/` subpath imports; fixture factories named `create*`; handler names state their effect (`docs/handler-naming.md`).
- **Never run two builds in one checkout at once** (CLAUDE.md, TypeScript toolchain) — build steps below are sequential.
- Library packages are consumed through `dist/`: after editing `@rtc/domain`, `@rtc/core-api` or `@rtc/core-contract`, rebuild it before running a *downstream* package's tests, or they run against the old code.
- Tests that wait on a timer use fake timers (`withFakeClock` in contract suites; `vi.useFakeTimers` elsewhere).

## Review Focus

1. **Two rows mount the same symbol at once** (RN re-renders during a rank glide can briefly double-mount a row) → both see the same window, and the quote subscription is opened once, not twice. Pinned by the contract suite's "shared across subscribers" case (Task 2).
2. **A symbol that receives no quote at all** (unknown or halted symbol) → the sparkline renders nothing and nothing throws. Pinned by the cold-start contract case (Task 2) and `RowSparkline`'s fewer-than-two-points case (Task 6).
3. **Power-saver switched to calm while a row is mounted** → updates slow to one per conflation interval, and the window keeps accumulating underneath rather than losing ticks. Pinned by the calm-conflation contract case (Task 2).
4. **Remount after more than 25 ticks elsewhere in the session** → the replayed window is still exactly the newest 25. Pinned by the retention case, which ticks past the cap before remounting (Task 2).
5. **App disposal with rows mounted** → no quote subscription survives `dispose()`. Pinned by adding the stream to `dispose.ts`'s `everySessionStream` (Task 2).

---

### Task 1: Domain — `EquityPriceHistoryUseCase` and the window size

**Files:**
- Modify: `packages/domain/src/equities/quote.ts`
- Create: `packages/domain/src/usecases/EquityPriceHistoryUseCase.ts`
- Create: `packages/domain/src/usecases/EquityPriceHistoryUseCase.test.ts`
- Modify: `packages/domain/src/usecases/index.ts`
- Modify: `packages/domain/src/index.ts` (the `equities/quote.js` export at line 78; the use-case export block at ~line 312)

**Interfaces:**
- Produces: `EQUITY_PRICE_HISTORY_SIZE: 25`; `class EquityPriceHistoryUseCase { constructor(marketData: MarketDataPort); execute(symbol: string, window?: EquityQuote[]): Observable<readonly EquityQuote[]> }` — both exported from `@rtc/domain`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/usecases/EquityPriceHistoryUseCase.test.ts`:

```ts
import { firstValueFrom, from, NEVER, type Observable } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { EQUITY_PRICE_HISTORY_SIZE, type EquityQuote } from "../equities/quote.js";
import type { MarketDataPort } from "../ports/marketDataPort.js";
import { EquityPriceHistoryUseCase } from "./EquityPriceHistoryUseCase.js";

describe("EquityPriceHistoryUseCase", () => {
  it("yields a growing window for the first quotes", async () => {
    const quotes = [createQuote(1), createQuote(2), createQuote(3)];
    const useCase = new EquityPriceHistoryUseCase(createStubMarketData(quotes));

    const windows = await firstValueFrom(
      useCase.execute("AAPL").pipe(toArray()),
    );

    expect(windows.map(lasts)).toEqual([[1], [1, 2], [1, 2, 3]]);
  });

  it("caps the window at EQUITY_PRICE_HISTORY_SIZE, dropping the oldest quote", async () => {
    const quotes = Array.from(
      { length: EQUITY_PRICE_HISTORY_SIZE + 3 },
      (_, i) => {
        return createQuote(i + 1);
      },
    );
    const useCase = new EquityPriceHistoryUseCase(createStubMarketData(quotes));

    const windows = await firstValueFrom(
      useCase.execute("AAPL").pipe(toArray()),
    );
    const last = windows.at(-1) ?? [];

    expect(last).toHaveLength(EQUITY_PRICE_HISTORY_SIZE);
    expect(lasts(last)[0]).toBe(4);
    expect(lasts(last).at(-1)).toBe(EQUITY_PRICE_HISTORY_SIZE + 3);
  });

  it("appends to a caller-owned window across executions", async () => {
    const window: EquityQuote[] = [];
    const first = new EquityPriceHistoryUseCase(
      createStubMarketData([createQuote(1), createQuote(2)]),
    );
    const second = new EquityPriceHistoryUseCase(
      createStubMarketData([createQuote(3)]),
    );

    await firstValueFrom(first.execute("AAPL", window).pipe(toArray()));
    const windows = await firstValueFrom(
      second.execute("AAPL", window).pipe(toArray()),
    );

    expect(windows.map(lasts)).toEqual([[1, 2, 3]]);
    expect(lasts(window)).toEqual([1, 2, 3]);
  });

  it("gives each execution its own window when none is supplied", async () => {
    const useCase = new EquityPriceHistoryUseCase(
      createStubMarketData([createQuote(1)]),
    );

    await firstValueFrom(useCase.execute("AAPL").pipe(toArray()));
    const windows = await firstValueFrom(
      useCase.execute("AAPL").pipe(toArray()),
    );

    expect(windows.map(lasts)).toEqual([[1]]);
  });
});

function lasts(window: readonly EquityQuote[]): number[] {
  return window.map((quote) => {
    return quote.last;
  });
}

function createQuote(last: number): EquityQuote {
  return {
    symbol: "AAPL",
    bid: last - 0.01,
    ask: last + 0.01,
    last,
    changePct: 0,
    timestamp: last,
  };
}

function createStubMarketData(quotes: readonly EquityQuote[]): MarketDataPort {
  const never = (): Observable<never> => {
    return NEVER;
  };

  return {
    watchlist: never,
    quotes: () => {
      return from(quotes);
    },
    candles: never,
    candleHistory: never,
    depth: never,
  };
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/domain exec vitest run src/usecases/EquityPriceHistoryUseCase.test.ts`
Expected: FAIL — `EQUITY_PRICE_HISTORY_SIZE` / `./EquityPriceHistoryUseCase.js` cannot be resolved.

- [ ] **Step 3: Add the constant**

Append to `packages/domain/src/equities/quote.ts`:

```ts
/** Points in an equity's rolling price window (`presenters.equityPriceHistory`,
 * the movers sparkline). The mobile-v1 prototype keeps exactly this many —
 * `[...s.hist, px].slice(-25)`, `Reactive Trader Mobile.dc.html:2262`. At the
 * simulator's 500 ms tick a cold window fills in about 12 s. */
export const EQUITY_PRICE_HISTORY_SIZE = 25;
```

- [ ] **Step 4: Write the use case**

`packages/domain/src/usecases/EquityPriceHistoryUseCase.ts`:

```ts
import { defer, type Observable } from "rxjs";
import { map } from "rxjs/operators";

import { EQUITY_PRICE_HISTORY_SIZE, type EquityQuote } from "../equities/quote.js";
import type { MarketDataPort } from "../ports/marketDataPort.js";

/** The equities twin of `PriceHistoryUseCase`: folds live quotes for one
 * symbol into a rolling window capped at `EQUITY_PRICE_HISTORY_SIZE`.
 * Deliberately unseeded, as FX is — the window starts empty and fills from
 * the live stream. */
export class EquityPriceHistoryUseCase {
  constructor(private readonly marketData: MarketDataPort) {}

  /**
   * `window` is the mutable accumulation buffer. It defaults to a fresh
   * array (cold semantics). A caller that needs the window to SURVIVE a
   * resubscription — a movers row that unmounts and later remounts — passes
   * a persistent array it owns, and the fold keeps appending to it. The cap
   * is applied here either way, so a supplied window can never grow
   * unbounded.
   */
  execute(
    symbol: string,
    window: EquityQuote[] = [],
  ): Observable<readonly EquityQuote[]> {
    return defer(() => {
      return this.marketData.quotes(symbol).pipe(
        map((quote) => {
          window.push(quote);

          if (window.length > EQUITY_PRICE_HISTORY_SIZE) {
            window.shift();
          }

          return [...window];
        }),
      );
    });
  }
}
```

- [ ] **Step 5: Export both**

In `packages/domain/src/usecases/index.ts`, add alongside the `PriceHistoryUseCase` export (keep the list alphabetical):

```ts
export { EquityPriceHistoryUseCase } from "./EquityPriceHistoryUseCase.js";
```

In `packages/domain/src/index.ts`, change line 78 from
`export type { EquityQuote } from "./equities/quote.js";` to:

```ts
export type { EquityQuote } from "./equities/quote.js";
export { EQUITY_PRICE_HISTORY_SIZE } from "./equities/quote.js";
```

and add `EquityPriceHistoryUseCase,` to the `// Use Cases` export block (alphabetically, after `DealersUseCase,`).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/domain exec vitest run src/usecases/EquityPriceHistoryUseCase.test.ts`
Expected: PASS, 4 tests.

Run: `pnpm --filter @rtc/domain test && pnpm --filter @rtc/domain typecheck`
Expected: all green (the domain's public-API tests, if any list exports, may need the two new names added — do so).

- [ ] **Step 7: Build the domain for downstream tasks**

Run: `pnpm --filter @rtc/domain build`
Expected: exits 0 and `scripts/check-dist.mjs` reports the package OK.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src
git commit -m "feat(domain): EquityPriceHistoryUseCase — a rolling window of live equity quotes (M4)"
```

---

### Task 2: Contract — the member, its suite, and the RxJS core

Adding the member to `Presenters` makes every core fail to typecheck until it implements it. This task lands the contract and the reference (RxJS) implementation; Tasks 3 and 4 bring the other two cores up. The sibling cores' runners are expected to be red between Task 2 and Tasks 3–4.

**Files:**
- Create: `packages/core-api/src/presenters/equityPriceHistory.ts`
- Modify: `packages/core-api/src/presenters/index.ts`
- Modify: `packages/core-api/src/app.ts` (import list ~line 61–83; the `Presenters` equities block at lines 235–239)
- Create: `packages/core-contract/src/suites/equityPriceHistory.ts`
- Modify: `packages/core-contract/src/registry.ts` (imports; `CONTRACT_SUITES` next to `"presenters.candleSeries"` at line 133)
- Modify: `packages/core-contract/src/registry.test.ts` (add the member to a "have suites" list)
- Modify: `packages/core-contract/src/suites/dispose.ts` (`everySessionStream`, line ~178, and its doc comment's count)
- Create: `packages/client-core/src/presenters/EquityPriceHistoryPresenter.ts`
- Create: `packages/client-core/src/presenters/__tests__/EquityPriceHistoryPresenter.test.ts`
- Modify: `packages/client-core/src/presenters/index.ts`
- Modify: `packages/client-core/src/composition.ts` (import ~line 70; `candleSeries` wiring line 879)
- Modify: `packages/client-core/src/__snapshots__/publicApi.test.ts.snap` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `EquityPriceHistoryUseCase`, `EQUITY_PRICE_HISTORY_SIZE`, `EquityQuote` (Task 1); `PRICE_HISTORY_CONFLATION_MS` (existing).
- Produces: `interface EquityPriceHistoryPresenter { history$(symbol: string): Stream<readonly EquityQuote[]> }`; `Presenters.equityPriceHistory`; `describeEquityPriceHistoryContract(label, makeHarness)`; client-core `class EquityPriceHistoryPresenter` with `constructor(marketData: MarketDataPort, powerSaver$: Observable<boolean>)`.

- [ ] **Step 1: Declare the contract**

`packages/core-api/src/presenters/equityPriceHistory.ts`:

```ts
import type { EquityQuote } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Per-symbol rolling windows of live equity quotes backing the movers
 * sparklines — the equities twin of `PriceHistoryPresenter`. A remounted row
 * re-reads its accumulated window rather than restarting from an empty
 * buffer. Unseeded: a never-mounted symbol emits nothing until its first
 * quote. */
export interface EquityPriceHistoryPresenter {
  history$(symbol: string): Stream<readonly EquityQuote[]>;
}
```

In `packages/core-api/src/presenters/index.ts` add (alphabetical, before `#/presenters/eventLog` or wherever `e…` sorts):

```ts
export type * from "#/presenters/equityPriceHistory";
```

In `packages/core-api/src/app.ts`, add `EquityPriceHistoryPresenter,` to the presenter type import list and, in `Presenters`, directly after `candleSeries: CandleSeriesPresenter;`:

```ts
  /** Rolling window of live quotes per symbol (the RN movers sparkline). */
  equityPriceHistory: EquityPriceHistoryPresenter;
```

Run: `pnpm --filter @rtc/core-api typecheck && pnpm --filter @rtc/core-api build`
Expected: green.

- [ ] **Step 2: Write the contract suite**

`packages/core-contract/src/suites/equityPriceHistory.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  EQUITY_PRICE_HISTORY_SIZE,
  type EquityQuote,
  PRICE_HISTORY_CONFLATION_MS,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createEquityQuote } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

function lasts(window: readonly EquityQuote[]): number[] {
  return window.map((quote) => {
    return quote.last;
  });
}

export function describeEquityPriceHistoryContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("history$(symbol) is memoised per symbol", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.equityPriceHistory;
        expect(p.history$("MSFT")).toBe(p.history$("MSFT"));
        expect(p.history$("MSFT")).not.toBe(p.history$("AAPL"));
      } finally {
        await h.teardown();
      }
    });

    it("a never-mounted symbol has no value until its first quote; quotes accumulate into a window capped at EQUITY_PRICE_HISTORY_SIZE", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.equityPriceHistory.history$("MSFT"));
        await settle();
        expect(c.values).toEqual([]);
        h.driver.emitEquityQuote(createEquityQuote("MSFT", 1));
        h.driver.emitEquityQuote(createEquityQuote("MSFT", 2));
        await settle();
        expect(c.values.map(lasts)).toEqual([[1], [1, 2]]);

        for (let i = 3; i <= EQUITY_PRICE_HISTORY_SIZE + 3; i += 1) {
          h.driver.emitEquityQuote(createEquityQuote("MSFT", i));
        }

        await settle();
        const last = c.values.at(-1) ?? [];
        expect(last).toHaveLength(EQUITY_PRICE_HISTORY_SIZE);
        expect(lasts(last)[0]).toBe(4);
        expect(lasts(last).at(-1)).toBe(EQUITY_PRICE_HISTORY_SIZE + 3);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("two concurrent subscribers share one window and one quote subscription", async () => {
      const h = makeHarness();

      try {
        const stream = h.app.presenters.equityPriceHistory.history$("MSFT");
        const a = collect(stream);
        const b = collect(stream);
        h.driver.emitEquityQuote(createEquityQuote("MSFT", 1));
        await settle();
        expect(a.values.map(lasts)).toEqual([[1]]);
        expect(b.values.map(lasts)).toEqual([[1]]);
        a.unsubscribe();
        await settle();
        expect(h.driver.equityQuoteObserved("MSFT")).toBe(true);
        b.unsubscribe();
        await settle();
        expect(h.driver.equityQuoteObserved("MSFT")).toBe(false);
      } finally {
        await h.teardown();
      }
    });

    it("retains the window across a remount: the port is released on the last unsubscribe, and a resubscribe repaints the newest window synchronously", async () => {
      const h = makeHarness();

      try {
        const first = collect(
          h.app.presenters.equityPriceHistory.history$("MSFT"),
        );

        for (let i = 1; i <= EQUITY_PRICE_HISTORY_SIZE + 2; i += 1) {
          h.driver.emitEquityQuote(createEquityQuote("MSFT", i));
        }

        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.equityQuoteObserved("MSFT")).toBe(false);

        const again = collect(
          h.app.presenters.equityPriceHistory.history$("MSFT"),
        );
        expect(again.values).toHaveLength(1);
        expect(lasts(again.values[0] ?? [])[0]).toBe(3);
        expect(again.values[0]).toHaveLength(EQUITY_PRICE_HISTORY_SIZE);

        h.driver.emitEquityQuote(
          createEquityQuote("MSFT", EQUITY_PRICE_HISTORY_SIZE + 3),
        );
        await settle();
        expect(lasts(again.values.at(-1) ?? []).at(-1)).toBe(
          EQUITY_PRICE_HISTORY_SIZE + 3,
        );
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("while calm, delivers at most one window per PRICE_HISTORY_CONFLATION_MS — the last of a burst, with no quote lost from the window", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          h.app.presenters.powerSaver.setLevel("calm");
          await clock.settle();
          const c = collect(
            h.app.presenters.equityPriceHistory.history$("MSFT"),
          );
          h.driver.emitEquityQuote(createEquityQuote("MSFT", 1));
          await clock.settle();
          expect(c.values.map(lasts)).toEqual([[1]]);
          h.driver.emitEquityQuote(createEquityQuote("MSFT", 2));
          h.driver.emitEquityQuote(createEquityQuote("MSFT", 3));
          await clock.advance(PRICE_HISTORY_CONFLATION_MS - 1);
          expect(c.values.map(lasts)).toEqual([[1]]);
          await clock.advance(1);
          await clock.settle();
          expect(c.values.map(lasts)).toEqual([[1], [1, 2, 3]]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
```

- [ ] **Step 3: Register it**

In `packages/core-contract/src/registry.ts` add the import
`import { describeEquityPriceHistoryContract } from "#/suites/equityPriceHistory";`
(alphabetical among the suite imports) and, after `"presenters.candleSeries": describeCandleSeriesContract,`:

```ts
  "presenters.equityPriceHistory": describeEquityPriceHistoryContract,
```

In `packages/core-contract/src/registry.test.ts`, add `"presenters.equityPriceHistory",` to the list that already holds `"presenters.candleSeries"` (search for it; if that list does not exist, add it to the `"presenters.priceHistory"` list at line 52).

In `packages/core-contract/src/suites/dispose.ts`, add after `p.candleSeries.candles$(MSFT.symbol),`:

```ts
    p.equityPriceHistory.history$(MSFT.symbol),
```

and bump the doc comment's stream count (`39 port-backed presenter streams` → `40`).

Run: `pnpm --filter @rtc/core-contract typecheck && pnpm --filter @rtc/core-contract test && pnpm --filter @rtc/core-contract build`
Expected: green (the registry test is what fails if the member is missing).

- [ ] **Step 4: Run the RxJS core's runner to verify the suite fails**

Run: `pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts -t equityPriceHistory`
Expected: FAIL — a typecheck error or `Cannot read properties of undefined (reading 'history$')`: the core does not provide the member yet.

- [ ] **Step 5: Write the RxJS presenter's unit test**

`packages/client-core/src/presenters/__tests__/EquityPriceHistoryPresenter.test.ts`:

```ts
import { NEVER, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EquityQuote, MarketDataPort } from "@rtc/domain";

import { EquityPriceHistoryPresenter } from "../EquityPriceHistoryPresenter";

describe("EquityPriceHistoryPresenter", () => {
  it("repaints the retained window on remount before the next quote", () => {
    const quotes = new Subject<EquityQuote>();
    const presenter = new EquityPriceHistoryPresenter(
      createMarketData(quotes),
      of(false),
    );

    const seen: number[][] = [];
    const first = presenter.history$("MSFT").subscribe((w) => {
      seen.push(w.map(lastOf));
    });
    quotes.next(createQuote(1));
    quotes.next(createQuote(2));
    first.unsubscribe();

    const replay: number[][] = [];
    const again = presenter.history$("MSFT").subscribe((w) => {
      replay.push(w.map(lastOf));
    });

    expect(seen).toEqual([[1], [1, 2]]);
    expect(replay).toEqual([[1, 2]]);
    again.unsubscribe();
  });

  it("releases the quote subscription on the last unsubscribe", () => {
    const quotes = new Subject<EquityQuote>();
    const presenter = new EquityPriceHistoryPresenter(
      createMarketData(quotes),
      of(false),
    );

    const sub = presenter.history$("MSFT").subscribe();
    expect(quotes.observed).toBe(true);
    sub.unsubscribe();
    expect(quotes.observed).toBe(false);
  });
});

function lastOf(quote: EquityQuote): number {
  return quote.last;
}

function createQuote(last: number): EquityQuote {
  return { symbol: "MSFT", bid: last, ask: last, last, changePct: 0, timestamp: last };
}

function createMarketData(quotes: Subject<EquityQuote>): MarketDataPort {
  return {
    watchlist: () => {
      return NEVER;
    },
    quotes: () => {
      return quotes;
    },
    candles: () => {
      return NEVER;
    },
    candleHistory: () => {
      return NEVER;
    },
    depth: () => {
      return NEVER;
    },
  };
}
```

- [ ] **Step 6: Implement the RxJS presenter**

`packages/client-core/src/presenters/EquityPriceHistoryPresenter.ts` — a structural copy of `PriceHistoryPresenter.ts`:

```ts
import { defer, type Observable, shareReplay, startWith } from "rxjs";

import type { EquityPriceHistoryPresenter as EquityPriceHistoryPresenterApi } from "@rtc/core-api";
import {
  EquityPriceHistoryUseCase,
  type EquityQuote,
  type MarketDataPort,
  PRICE_HISTORY_CONFLATION_MS,
} from "@rtc/domain";

import { conflateWhen } from "./conflateWhen";

/** The equities twin of `PriceHistoryPresenter` — same retention design, so
 * read that class's comments for the why. In short: the per-symbol WINDOW
 * ARRAY lives here and outlives every subscription, while the per-symbol
 * `quotes` subscription is ref-counted and released when the last row
 * unmounts; a remount repaints the retained window synchronously via an
 * outermost `startWith`. A never-mounted symbol has an empty window and so
 * emits nothing until its first quote. */
export class EquityPriceHistoryPresenter
  implements EquityPriceHistoryPresenterApi
{
  private readonly cache = new Map<string, Observable<readonly EquityQuote[]>>();
  private readonly windows = new Map<string, EquityQuote[]>();

  constructor(
    private readonly marketData: MarketDataPort,
    private readonly powerSaver$: Observable<boolean>,
  ) {}

  history$(symbol: string): Observable<readonly EquityQuote[]> {
    const cached = this.cache.get(symbol);

    if (cached) {
      return cached;
    }

    let window = this.windows.get(symbol);

    if (!window) {
      window = [];
      this.windows.set(symbol, window);
    }

    const retained = window;
    const raw = new EquityPriceHistoryUseCase(this.marketData)
      .execute(symbol, retained)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const shared = raw.pipe(
      conflateWhen(this.powerSaver$, PRICE_HISTORY_CONFLATION_MS),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    const stream = defer(() => {
      if (retained.length === 0) {
        return shared;
      }

      const seed: readonly EquityQuote[] = [...retained];
      return shared.pipe(startWith(seed));
    });
    this.cache.set(symbol, stream);
    return stream;
  }
}
```

Export it from `packages/client-core/src/presenters/index.ts` (alphabetical):

```ts
export * from "#/presenters/EquityPriceHistoryPresenter";
```

In `packages/client-core/src/composition.ts`, add `EquityPriceHistoryPresenter,` to the presenter import list (~line 70) and, after `candleSeries: new CandleSeriesPresenter(ports.marketData),` (line 879):

```ts
    equityPriceHistory: new EquityPriceHistoryPresenter(
      ports.marketData,
      powerSaver.isCalm$,
    ),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-core exec vitest run src/presenters/__tests__/EquityPriceHistoryPresenter.test.ts`
Expected: PASS, 2 tests.

Run: `pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts`
Expected: PASS, including the 5 new `equityPriceHistory` cases, `dispose` and `portDiscipline`. If `portDiscipline`'s absolute construction-time counts fail, the presenter subscribed at construction — it must not (the stream is built lazily on the first `history$` call); fix the presenter, never the count.

Run: `pnpm --filter @rtc/client-core exec vitest run -u src/publicApi.test.ts` then `git diff packages/client-core/src/__snapshots__/` — expected: exactly one added line, `"EquityPriceHistoryPresenter",`.

Run: `pnpm --filter @rtc/client-core test && pnpm --filter @rtc/client-core typecheck`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add packages/core-api packages/core-contract packages/client-core
git commit -m "feat(core): presenters.equityPriceHistory — contract, suite, and the RxJS core (M4)"
```

---

### Task 3: The async core

**Files:**
- Create: `packages/client-core-async/src/presenters/equityPriceHistory.ts`
- Create: `packages/client-core-async/src/presenters/equityPriceHistory.test.ts`
- Modify: `packages/client-core-async/src/composition.ts` (import ~line 43; after `candleSeries: …` at line 193)
- Modify: `packages/client-core-async/src/index.ts` (next to the `createCandleSeriesPresenter` export, line 61)

**Interfaces:**
- Consumes: `EquityPriceHistoryUseCase`, `EquityQuote`, `MarketDataPort`, `PRICE_HISTORY_CONFLATION_MS` (`@rtc/domain`); `EquityPriceHistoryPresenter`, `Stream` (`@rtc/core-api`); existing `topicToStreamWithLead` (`#/bridge/out`) and `createConflatedTopic` (`#/presenters/conflatedTopic`).
- Produces: `createEquityPriceHistoryPresenter(marketData: MarketDataPort, isCalm$: Stream<boolean>): EquityPriceHistoryPresenter`.

- [ ] **Step 1: Run the async runner to verify it fails**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/coreContract.test.ts -t equityPriceHistory`
Expected: FAIL — the member is missing.

- [ ] **Step 2: Write the unit test**

Open `packages/client-core-async/src/presenters/priceHistory.test.ts` and copy its structure into `equityPriceHistory.test.ts`, with these substitutions: `createPriceHistoryPresenter` → `createEquityPriceHistoryPresenter`; the stub `PricingPort` → a stub `MarketDataPort` whose `quotes()` returns the test's `Subject<EquityQuote>` and whose other four methods return `NEVER`; `PriceTick` fixtures → `{ symbol: "MSFT", bid: n, ask: n, last: n, changePct: 0, timestamp: n }`; assertions on `.mid` → `.last`. It must keep that file's two cases — the remount repaint and the release on last unsubscribe.

- [ ] **Step 3: Implement**

`packages/client-core-async/src/presenters/equityPriceHistory.ts`:

```ts
import type { EquityPriceHistoryPresenter, Stream } from "@rtc/core-api";
import {
  EquityPriceHistoryUseCase,
  type EquityQuote,
  type MarketDataPort,
  PRICE_HISTORY_CONFLATION_MS,
} from "@rtc/domain";

import { topicToStreamWithLead } from "#/bridge/out";
import { createConflatedTopic } from "#/presenters/conflatedTopic";

/** The equities twin of `createPriceHistoryPresenter` — same design (see
 * that file): the window array is owned here and outlives any subscription,
 * the Topic releases the port on the last unsubscribe, and a remount
 * repaints the retained window through the stream's `lead`. A never-mounted
 * symbol has an empty window and no lead. */
export function createEquityPriceHistoryPresenter(
  marketData: MarketDataPort,
  isCalm$: Stream<boolean>,
): EquityPriceHistoryPresenter {
  const useCase = new EquityPriceHistoryUseCase(marketData);
  const cache = new Map<string, Stream<readonly EquityQuote[]>>();

  return {
    history$: (symbol: string) => {
      const cached = cache.get(symbol);

      if (cached !== undefined) {
        return cached;
      }

      const retained: EquityQuote[] = [];
      const stream = topicToStreamWithLead(
        createConflatedTopic(
          useCase.execute(symbol, retained),
          isCalm$,
          PRICE_HISTORY_CONFLATION_MS,
        ),
        () => {
          return retained.length === 0 ? null : { value: [...retained] };
        },
      );
      cache.set(symbol, stream);
      return stream;
    },
  };
}
```

Wire it in `composition.ts` after `candleSeries: createCandleSeriesPresenter(ports.marketData, lifetime),`:

```ts
    equityPriceHistory: createEquityPriceHistoryPresenter(
      ports.marketData,
      powerSaver.isCalm$,
    ),
```

(add the import next to `createCandleSeriesPresenter`'s), and export it from `src/index.ts`:

```ts
export { createEquityPriceHistoryPresenter } from "#/presenters/equityPriceHistory";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/presenters/equityPriceHistory.test.ts src/coreContract.test.ts`
Expected: PASS, including all 5 `equityPriceHistory` contract cases, `dispose` and `portDiscipline`.

Run: `pnpm --filter @rtc/client-core-async test && pnpm --filter @rtc/client-core-async typecheck && pnpm check:deps`
Expected: green; `check:deps` confirms no rxjs value import outside `bridge/`.

- [ ] **Step 5: Commit**

```bash
git add packages/client-core-async
git commit -m "feat(core-async): native equityPriceHistory (M4)"
```

---

### Task 4: The Effect core

**Files:**
- Create: `packages/client-core-effect/src/presenters/equityPriceHistory.ts`
- Create: `packages/client-core-effect/src/presenters/equityPriceHistory.test.ts`
- Modify: `packages/client-core-effect/src/layers.ts` (Tag after `PriceHistoryTag` ~line 184; the presenter union ~line 304; a `…Live` after `PriceHistoryLive` ~line 574; the `dependent` merge ~line 698; the member map ~line 769)
- Modify: `packages/client-core-effect/src/index.ts` (Tag export ~line 62; presenter export ~line 130)

**Interfaces:**
- Consumes: as Task 3, plus `EffectHost` (`#/bridge/out`) and `conflatedFold` (`#/presenters/conflatedFold`).
- Produces: `createEquityPriceHistoryPresenter(host: EffectHost, marketData: MarketDataPort, isCalm$: Stream<boolean>): EquityPriceHistoryPresenter`; `EquityPriceHistoryTag`.

- [ ] **Step 1: Run the Effect runner to verify it fails**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/coreContract.test.ts -t equityPriceHistory`
Expected: FAIL — the member is missing.

- [ ] **Step 2: Write the unit test**

Copy `packages/client-core-effect/src/presenters/priceHistory.test.ts` into `equityPriceHistory.test.ts` with the same substitutions as Task 3 Step 2 (`createEquityPriceHistoryPresenter(useHost(), marketData, calm(false))`, a `MarketDataPort` stub whose `quotes()` returns the test's subject, `EquityQuote` fixtures, `.last`). Keep every case that file has for remount repaint and port release.

- [ ] **Step 3: Implement**

`packages/client-core-effect/src/presenters/equityPriceHistory.ts`:

```ts
import { Option } from "effect";

import type { EquityPriceHistoryPresenter, Stream } from "@rtc/core-api";
import {
  EquityPriceHistoryUseCase,
  type EquityQuote,
  type MarketDataPort,
  PRICE_HISTORY_CONFLATION_MS,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { conflatedFold } from "#/presenters/conflatedFold";

/** The equities twin of `createPriceHistoryPresenter` — same design (see
 * that file): the window array outlives every warm period while the port
 * does not, and the retained window is the next period's seed, so a
 * remounted row repaints synchronously; a never-mounted symbol seeds `None`. */
export function createEquityPriceHistoryPresenter(
  host: EffectHost,
  marketData: MarketDataPort,
  isCalm$: Stream<boolean>,
): EquityPriceHistoryPresenter {
  const useCase = new EquityPriceHistoryUseCase(marketData);
  const cache = new Map<string, Stream<readonly EquityQuote[]>>();
  const windows = new Map<string, EquityQuote[]>();

  return {
    history$: (symbol: string) => {
      const cached = cache.get(symbol);

      if (cached !== undefined) {
        return cached;
      }

      const retained = windows.get(symbol) ?? [];
      windows.set(symbol, retained);
      const stream = conflatedFold(
        host,
        useCase.execute(symbol, retained),
        isCalm$,
        PRICE_HISTORY_CONFLATION_MS,
        () => {
          return retained.length === 0
            ? Option.none<readonly EquityQuote[]>()
            : Option.some<readonly EquityQuote[]>([...retained]);
        },
      );
      cache.set(symbol, stream);
      return stream;
    },
  };
}
```

In `layers.ts`:

```ts
// after PriceHistoryTag
export const EquityPriceHistoryTag =
  Context.GenericTag<EquityPriceHistoryPresenter>(
    "@rtc/client-core-effect/equityPriceHistory",
  );
```

Add `| EquityPriceHistoryPresenter` to the presenter union after `| PriceHistoryPresenter`, add `EquityPriceHistoryPresenter,` to the `@rtc/core-api` type import and `import { createEquityPriceHistoryPresenter } from "#/presenters/equityPriceHistory";` next to the `priceHistory` import. After `PriceHistoryLive`:

```ts
const EquityPriceHistoryLive: Layer.Layer<
  EquityPriceHistoryPresenter,
  never,
  EffectHost | AppPorts | PowerSaverPresenter
> = Layer.effect(
  EquityPriceHistoryTag,
  Effect.gen(function* buildEquityPriceHistory() {
    const host = yield* HostTag;
    const ports = yield* AppPortsTag;
    const powerSaver = yield* PowerSaverTag;
    return createEquityPriceHistoryPresenter(
      host,
      ports.marketData,
      powerSaver.isCalm$,
    );
  }),
);
```

Add `EquityPriceHistoryLive,` to the `dependent` `Layer.mergeAll(…)` (it depends on `PowerSaverPresenter`, like `PriceHistoryLive`), update the comment above `PriceStreamLive` that names "the two presenters that depend on another native presenter" to say three, and add `equityPriceHistory: EquityPriceHistoryTag,` to the member map after `candleSeries: CandleSeriesTag,`.

In `src/index.ts` export `EquityPriceHistoryTag` (next to `PriceHistoryTag`) and
`export { createEquityPriceHistoryPresenter } from "#/presenters/equityPriceHistory";`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/presenters/equityPriceHistory.test.ts src/coreContract.test.ts`
Expected: PASS, including all 5 `equityPriceHistory` contract cases, `dispose` and `portDiscipline`.

Run: `pnpm --filter @rtc/client-core-effect test && pnpm --filter @rtc/client-core-effect typecheck && pnpm check:deps`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/client-core-effect
git commit -m "feat(core-effect): native equityPriceHistory (M4)"
```

---

### Task 5: Bindings, devtools manifests, and the web test fakes

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts` (type near `useCandles` ~line 495; `bind` after `useCandles` ~line 897; returned object after `useCandles,` ~line 1430)
- Modify: `packages/client-react-native/src/app/devtools/presenterManifest.ts`
- Modify: `packages/client-react/src/app/devtools/presenterManifest.ts`
- Modify: `packages/client-solid/src/app/devtools/presenterManifest.ts`
- Modify: `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts` (next to `usePriceHistory` ~line 1077)
- Modify: `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts` (next to `usePriceHistory` ~line 118)

**Interfaces:**
- Consumes: `Presenters.equityPriceHistory` (Task 2).
- Produces: `ViewModel.useEquityPriceHistory: (symbol: string) => readonly EquityQuote[]` — `[]` until the first quote.

- [ ] **Step 1: Add the hook**

In the `ViewModel` interface, after `useCandles`' declaration:

```ts
  /** Rolling window of live quotes for a symbol (newest last, capped at
   * EQUITY_PRICE_HISTORY_SIZE) — empty until the first quote arrives. */
  useEquityPriceHistory: (symbol: string) => readonly EquityQuote[];
```

After the `const [useCandles] = bind(…)` block:

```ts
  const [useEquityPriceHistory] = bind(
    (symbol: string) => {
      return presenters.equityPriceHistory.history$(symbol);
    },
    [] as readonly EquityQuote[],
  );
```

and add `useEquityPriceHistory,` to the returned object after `useCandles,`.

Run: `pnpm --filter @rtc/react-bindings typecheck && pnpm --filter @rtc/react-bindings test && pnpm --filter @rtc/react-bindings build`
Expected: green.

- [ ] **Step 2: Add the manifest entries**

In all three `presenterManifest.ts` files, directly after `candleSeries: { methods: ["candles$"] },`:

```ts
  equityPriceHistory: { methods: ["history$"] },
```

(In the RN manifest, find `candleSeries` the same way; if RN's lists the equities presenters in a different order, place it after `candleSeries` there too — the drift check compares the two bodies verbatim.)

Run: `pnpm check:manifest-drift`
Expected: PASS.

- [ ] **Step 3: Add the member to client-react's two test fakes**

Both files are typed `ViewModel`, so they fail to typecheck until they list it. In each, next to `usePriceHistory`, following that file's existing style:

`viewModelFromWorld.ts` — no world state carries equity history, and no web component reads it:

```ts
    useEquityPriceHistory: () => {
      return [];
    },
```

`buildFakeViewModel.ts` — the same body (the web visual tier never renders a movers sparkline).

Run: `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react test`
Expected: green. Then confirm no web golden or web UI file changed: `git diff --stat -- packages/client-react/src/ui packages/client-solid/src/ui packages/ui-contract/goldens` → empty.

- [ ] **Step 4: Commit**

```bash
git add packages/react-bindings packages/client-react packages/client-solid packages/client-react-native/src/app/devtools
git commit -m "feat(bindings): useEquityPriceHistory; list equityPriceHistory in the devtools manifests"
```

---

### Task 6: RN — drive the movers sparkline from price history

**Files:**
- Modify: `packages/client-react-native/src/ui/equities/markets/RowSparkline.tsx`
- Modify: `packages/client-react-native/src/ui/equities/markets/MoversRow.tsx`
- Modify: `packages/client-react-native/src/ui/equities/markets/MoversBoard.tsx` (`MoversBoardRow`, lines ~130–185)
- Modify: `packages/client-react-native/src/ui/equities/markets/RowSparkline.test.tsx`
- Modify: `packages/client-react-native/tests/pages/RowSparklinePage.tsx`
- Modify: `packages/client-react-native/tests/pages/MoversRowPage.tsx`
- Modify: `packages/client-react-native/tests/pages/MoversBoardPage.tsx`, `MarketsViewPage.tsx`, `EquitiesScreenPage.tsx`
- Modify: `packages/client-react-native/src/ui/equities/markets/MoversBoard.test.tsx`
- Modify: `packages/client-react-native/tests/visual/fake/equities.ts`, `tests/visual/fake/sliceTypes.ts`
- Modify: the `equities/markets` golden under `packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/`

**Interfaces:**
- Consumes: `ViewModel.useEquityPriceHistory` (Task 5).
- Produces: `RowSparklineProps.history: readonly EquityQuote[]` and `MoversRowProps.history: readonly EquityQuote[]` (replacing `candles: readonly Candle[]` on both). The array is passed down **unchanged** from the hook — see the ruling in Step 4.

- [ ] **Step 1: Rewrite the sparkline test against prices**

Replace `RowSparkline.test.tsx`'s body:

```tsx
import { afterEach, expect, test } from "@jest/globals";

import { rowSparklinePage } from "#tests/pages/RowSparklinePage";

afterEach(() => {
  return page.unmountAll();
});

test("draws a path once there are at least two prices", async () => {
  await page.mount("TSLA", [1, 2, 3]);
  expect(page.exists("eq-sparkline-TSLA")).toBe(true);
});

test("renders nothing when there is not enough history to draw", async () => {
  await page.mount("TSLA", [1]);
  expect(page.exists("eq-sparkline-TSLA")).toBe(false);
});

test("renders nothing for a symbol that has had no quote yet", async () => {
  await page.mount("TSLA", []);
  expect(page.exists("eq-sparkline-TSLA")).toBe(false);
});

const page = rowSparklinePage();
```

and `RowSparklinePage.tsx`'s `mount` to take `prices: readonly number[]`, turn them into quotes with a `createQuotes(symbol, prices)` factory in the page object (`{ symbol, bid: p, ask: p, last: p, changePct: 0, timestamp: i }`), and render `<RowSparkline symbol={symbol} positive history={createQuotes(symbol, prices)} />` (drop the `Candle` import).

Add to `MoversBoard.test.tsx` (use the page object's existing helpers; add a `sparklineExists(symbol)` helper to `MoversBoardPage` if it lacks one, via `screen.queryByTestId(\`eq-sparkline-${symbol}\`) != null`):

```tsx
test("draws each row's sparkline from its price history, not its candles", async () => {
  await page.mountWithHistory({ AAPL: [227.0, 227.1, 227.17] });
  expect(page.sparklineExists("AAPL")).toBe(true);
  expect(page.sparklineExists("TSLA")).toBe(false);
});
```

where `MoversBoardPage.mountWithHistory(history: Record<string, readonly number[]>)` mounts the board with a view model whose `useEquityPriceHistory(symbol)` returns `(history[symbol] ?? []).map((last, i) => ({ symbol, bid: last, ask: last, last, changePct: 0, timestamp: i }))` and whose `useCandles` returns a **non-empty** series for every symbol (e.g. three candles closing at 1, 2, 3) — so the test fails if the board still reads candles.

- [ ] **Step 2: Run the RN tests to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities/markets`
Expected: FAIL — `RowSparkline` has no `history` prop; `useEquityPriceHistory` is not read by the board.

- [ ] **Step 3: Change `RowSparkline`**

Replace the `Candle` import with `EquityQuote` and project each quote's `last` — inside this component, the same place the candle closes were projected:

```tsx
export function RowSparkline({
  symbol,
  positive,
  history,
}: RowSparklineProps): JSX.Element | null {
  const theme = useTheme();

  const svgPath = buildRowSparkPath(
    history.map((quote) => {
      return quote.last;
    }),
  );
```

```tsx
export interface RowSparklineProps {
  symbol: string;
  positive: boolean;
  /** Oldest first — the symbol's rolling window of live quotes. */
  history: readonly EquityQuote[];
}
```

Rewrite the doc comment's sentences about candles: the series is now "the symbol's rolling window of live last prices (`useEquityPriceHistory`, read one level up by `MoversBoardRow`)", keyed on `history` rather than `candles` in the compiler-memoization sentence, the redraw happens "when `history` changes", and it renders nothing "below two quotes". Keep the rest of the compiler-memoization rationale.

If `buildRowSparkPath`'s parameter is typed `number[]`, widen it to `readonly number[]` — it must not mutate its input.

- [ ] **Step 4: Change `MoversRow` and `MoversBoard`**

`MoversRow`: replace the `candles` prop with `history: readonly EquityQuote[]`, pass `history={history}` to `RowSparkline`, swap the `Candle` import for `EquityQuote`, and replace the doc comment's "`candles` arrives as a prop … there being no equities tick-history stream to pull one from" with "`history` arrives as a prop (read off the ViewModel seam one level up, by `MoversBoard`'s `MoversBoardRow`) and is handed straight to `RowSparkline`".

`MoversBoard`'s `MoversBoardRow`:

```tsx
  const { useEquityQuote, useEquityPriceHistory } = useViewModel();
  const quote = useEquityQuote(row.symbol);
  const history = useEquityPriceHistory(row.symbol);
```

and pass `history={history}` in both `<MoversRow …>` sites. (`useCandles` had no other reader in this component; it is removed, not left unused.)

**Ruling (controller, 2026-09-29): do NOT map to prices here.** `MoversBoardRow` bails out of the React Compiler (it reads the ViewModel seam), so a `.map(...)` here would hand `RowSparkline` a fresh array on every render and rebuild every row's Skia path on every quote tick of any symbol. The hook's value is identity-stable between emissions; pass it down unchanged and let the compiled leaf (`RowSparkline`) do the projection, memoized on `history`.

Update `MoversRowPage.tsx`: `NO_CANDLES` → `const NO_HISTORY: readonly EquityQuote[] = [];` and `history={NO_HISTORY}`, rewording its comment accordingly. In `MoversBoardPage.tsx`, `MarketsViewPage.tsx` and `EquitiesScreenPage.tsx`, add

```ts
    useEquityPriceHistory: () => {
      return [];
    },
```

next to each `useCandles`, and delete that `useCandles` stub only if `git grep -n "useCandles" packages/client-react-native/src/ui` shows no component those pages mount still reads it (the chart in `TradeView` does — leave `TradeViewPage` alone).

- [ ] **Step 5: Update the visual fake**

In `tests/visual/fake/sliceTypes.ts`, add `| "useEquityPriceHistory"` to `EquitiesSlice` (alphabetically, after `"useEquityOrders"`).

In `tests/visual/fake/equities.ts`, after `EMPTY_CANDLES`, derive a deterministic window from the already-seeded candles, ending on the pinned quote so the line finishes at the price the row prints:

```ts
/** A full rolling window per symbol — the last 24 seeded candle closes, then
 * the pinned quote — so the movers sparkline is deterministic and ends at
 * the price its row prints. Built once at module load (identity-stable, like
 * `QUOTES`). The live app starts this window EMPTY and fills it from quotes;
 * a golden shows the steady state. */
const PRICE_HISTORY: Readonly<Record<string, readonly EquityQuote[]>> =
  Object.fromEntries(
    WATCHLIST.map((inst) => {
      const quote = QUOTES[inst.symbol] as EquityQuote;
      const closes = (CANDLES[inst.symbol] ?? EMPTY_CANDLES)
        .slice(-(EQUITY_PRICE_HISTORY_SIZE - 1))
        .map((candle, i, all) => {
          return {
            ...quote,
            last: candle.close,
            timestamp: PINNED_NOW_MS - (all.length - i) * 500,
          };
        });
      return [inst.symbol, [...closes, quote]];
    }),
  );

const EMPTY_PRICE_HISTORY: readonly EquityQuote[] = [];
```

(import `EQUITY_PRICE_HISTORY_SIZE` from `@rtc/domain`), and in `equitiesSlice` after `useEquityQuote`:

```ts
  useEquityPriceHistory: (symbol: string) => {
    return PRICE_HISTORY[symbol] ?? EMPTY_PRICE_HISTORY;
  },
```

- [ ] **Step 6: Run the RN tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/equities tests/visual`
Expected: PASS, including `buildFakeViewModel.test.tsx` (it fails if a `ViewModel` member is missing from the fake).

Run: `pnpm --filter @rtc/client-react-native test && pnpm --filter @rtc/client-react-native typecheck && pnpm check:compiler`
Expected: green; `check:compiler` confirms `RowSparkline` is still compiler-memoized.

- [ ] **Step 7: Re-capture the `equities/markets` golden**

Needs the iOS simulator (iPhone 17 / iOS 26) booted and the dev build installed (`pnpm dev:ios` once from the primary checkout if missing). Follow `packages/client-react-native/tests/visual/README.md` "Tier 1":

```bash
RTC_VISUAL_UDID=<iphone17-udid> RTC_VISUAL_METRO_PORT=8083 RTC_VISUAL_IDB=$(command -v idb) \
  pnpm --filter @rtc/client-react-native test:rn:visual:simctl:update
git status --short packages/client-react-native/tests/visual/__screenshots__
```

Expected: exactly one changed PNG, `…/simctl/equities/markets.png` (or that scenario's file name). If any other golden changed, restore it with `git checkout -- <path>` — this change cannot legitimately move another scenario. Then run the verify pass (the same command without `:update`) and require `pass` for every scenario. Open `equities/markets.png` and confirm each row's sparkline is drawn and ends at the row's price.

- [ ] **Step 8: Commit**

```bash
git add packages/client-react-native
git commit -m "feat(rn-equities): movers sparkline from live price history, not candle closes (M4)"
```

---

### Task 7: Docs — close the ledger and move the count to 75

**Files:**
- Modify: `docs/rn-open-items.md` (§1 table, lines ~208–214; the `Last updated` header)
- Modify: `docs/STATUS.md` (line 29; the `Last updated` header)
- Modify: `CLAUDE.md` (lines 11, 121, 122, 151)
- Modify: `docs/architecture/22-pluggable-application-core.md` (line 404)
- Modify: `packages/client-core-async/README.md` (line 111), `packages/client-core-effect/README.md` (line 261)
- Modify: `docs/superpowers/specs/2026-09-28-equities-price-history-design.md` (Status line)

- [ ] **Step 1: `rn-open-items.md` §1**

Replace the M1, M3, M4 and M5 rows' "Fix direction" cells (M2, M6, M7 unchanged):

- **M1:** `**RESOLVED — the premise no longer holds (verified 2026-09-28).** \`RfqsPresenter\` never evicts an RFQ, so settled RFQs stay in \`rfqs\`, and \`SellSidePanel\` already renders a \`YOUR QUOTES\` section below the live tickets with WON / LOST / PASSED taken from the real \`QuoteState\`. History does not vanish when an RFQ closes; it is session-scoped, exactly as the web credit blotter is. No model change.`
- **M3:** `**CLOSED 2026-09-28 — deliberate deviation, 120 s kept everywhere.** Decided in favour of the reference implementation. Note for anyone reopening it: the model already expresses 45 s — \`expirySecs\` is set per RFQ (\`CreateRfqInput.expirySecs?\`, defaulted only when omitted) and honoured by both the simulator and the server — so the change would be one line in RN's \`NewRfqForm\`, never a model change.`
- **M4:** `**FIXED 2026-09-28** — \`presenters.equityPriceHistory\` (the 75th core member): a rolling window of the last 25 live quotes per symbol, unseeded like FX's. RN's movers sparkline now reads it instead of candle closes. [Spec](superpowers/specs/2026-09-28-equities-price-history-design.md).`
- **M5:** `**RESOLVED — the premise no longer holds (verified 2026-09-28).** The order-ticket machine's \`working\` / \`partiallyFilled\` / \`filled\` phases each carry the full \`EquityOrder\` (\`qty\`, \`filledQty\`, \`avgPrice\`), and \`OrderCeremony\` renders the fill toast straight from it. No model change.`

Strike through the M1, M3, M4 and M5 gap cells (`~~…~~`) the way M6's already is. Bump the header to `**Last updated: 2026-09-28**`.

- [ ] **Step 2: `STATUS.md:29`**

Following the `tracking-workstream-status` skill: this workstream is now complete, so **delete** the whole line-29 bullet ("Prototype ↔ data-model mismatches …") — every row is fixed or ruled, and `rn-open-items.md` §1 is the record. **Keep R1** (draggable exposure bubbles), which that bullet also carried: if R1 has no bullet of its own elsewhere in the file, add one to the `⚪ Optional / next step` section:

```md
- **Draggable exposure bubbles (R1, a gap against the reference implementation)** — Adaptive's analytics bubbles are draggable; ours are inert in all three clients. Keep the deterministic shelf-packed layout and add drag on top; a golden never drags, so goldens are unaffected. Record: [rn-open-items.md §2](rn-open-items.md#2-gaps-against-the-reference-implementation)
```

Bump the header date.

- [ ] **Step 3: The member count**

- `CLAUDE.md:11` — `with all 74 members native in both alternative cores as of slice 7 — …` → `with all 74 members native in both alternative cores as of slice 7, and 75 since \`equityPriceHistory\` (2026-09-28) — …`; and in that sentence's equities list, `(\`watchlist\`, \`candleSeries\`, \`depth\`, \`ordersBlotter\`, \`positions\`)` → add `\`equityPriceHistory\``.
- `CLAUDE.md:121` and `:122` — `All 74 members native` → `All 75 members native`.
- `CLAUDE.md:151` — `All 74 members are native in both siblings (ported slice by slice, 1a–7)` → `All 75 members are native in both siblings (74 ported slice by slice, 1a–7; \`equityPriceHistory\` added natively 2026-09-28)`.
- `docs/architecture/22-pluggable-application-core.md:404` — `(74 members: 60 presenters, 12 machines, 2` → `(75 members: 61 presenters, 12 machines, 2`. Read the surrounding paragraph first; if it states the count as of a past date, add the new member after it instead.
- The two sibling READMEs — `**All 74** members are native (slice 7's wave 2)` → `**All 75** members are native (74 as of slice 7's wave 2; \`equityPriceHistory\` added 2026-09-28)`.
- ADR-006's counts are dated history (`36/74`, `58/74`, "All 74 … Wave 2 added") and stay as written.

Run: `git grep -n "74 members\|All 74" -- CLAUDE.md docs packages/*/README.md` and confirm every remaining hit is historical.

- [ ] **Step 4: Mark the spec shipped and check links**

Set the spec's `**Status:**` to `Approved 2026-09-28; implemented on this branch.`

Run: `pnpm check:doc-links`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs packages/client-core-async/README.md packages/client-core-effect/README.md
git commit -m "docs: close the prototype/data-model ledger (M1/M3/M5 ruled, M4 fixed); 75 core members"
```

---

### Task 8: Prove the tests can fail, then the full gauntlet

**Files:**
- Create (scratchpad, not committed): `mutants.json`

- [ ] **Step 1: Write the mutant spec**

Save to the session scratchpad as `mutants.json`:

```json
[
  {
    "name": "domain: the cap is off by one",
    "file": "packages/domain/src/usecases/EquityPriceHistoryUseCase.ts",
    "find": "if (window.length > EQUITY_PRICE_HISTORY_SIZE) {",
    "replace": "if (window.length > EQUITY_PRICE_HISTORY_SIZE + 1) {",
    "test": "pnpm --filter @rtc/domain exec vitest run src/usecases/EquityPriceHistoryUseCase.test.ts"
  },
  {
    "name": "domain: the window is not caller-owned",
    "file": "packages/domain/src/usecases/EquityPriceHistoryUseCase.ts",
    "find": "window.push(quote);",
    "replace": "window = [...window, quote];",
    "test": "pnpm --filter @rtc/domain exec vitest run src/usecases/EquityPriceHistoryUseCase.test.ts"
  },
  {
    "name": "rxjs core: remount does not replay the retained window",
    "file": "packages/client-core/src/presenters/EquityPriceHistoryPresenter.ts",
    "find": "return shared.pipe(startWith(seed));",
    "replace": "return shared;",
    "test": "pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts -t equityPriceHistory"
  },
  {
    "name": "rxjs core: the quote subscription is held for the session",
    "file": "packages/client-core/src/presenters/EquityPriceHistoryPresenter.ts",
    "find": ".pipe(shareReplay({ bufferSize: 1, refCount: true }));",
    "replace": ".pipe(shareReplay({ bufferSize: 1, refCount: false }));",
    "test": "pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts -t equityPriceHistory"
  },
  {
    "name": "async core: remount does not replay the retained window",
    "file": "packages/client-core-async/src/presenters/equityPriceHistory.ts",
    "find": "return retained.length === 0 ? null : { value: [...retained] };",
    "replace": "return null;",
    "test": "pnpm --filter @rtc/client-core-async exec vitest run src/coreContract.test.ts -t equityPriceHistory"
  },
  {
    "name": "effect core: remount does not replay the retained window",
    "file": "packages/client-core-effect/src/presenters/equityPriceHistory.ts",
    "find": ": Option.some<readonly EquityQuote[]>([...retained]);",
    "replace": ": Option.none<readonly EquityQuote[]>();",
    "test": "pnpm --filter @rtc/client-core-effect exec vitest run src/coreContract.test.ts -t equityPriceHistory"
  },
  {
    "name": "rn: each row reads the wrong symbol's history",
    "file": "packages/client-react-native/src/ui/equities/markets/MoversBoard.tsx",
    "find": "useEquityPriceHistory(row.symbol)",
    "replace": "useEquityPriceHistory(\"AAPL\")",
    "test": "pnpm --filter @rtc/client-react-native exec jest src/ui/equities/markets/MoversBoard.test.tsx"
  }
]
```

The last mutant is killed by Task 6's board test asserting TSLA (empty history) draws **no** sparkline while AAPL does. "The board still reads candles" is deliberately not a mutant: mapping a `Candle` through `q.last` yields `undefined`s, which render nothing, so it would pass for the wrong reason. That case is pinned by construction instead: the board test's view model returns non-empty candles for every symbol, and TSLA must still draw nothing. The domain mutants need no rebuild — both run the domain's own test. Before running, confirm each `find` string matches the implemented code exactly once (the script reports an ambiguous or missing match as `ERROR`, not a kill).

- [ ] **Step 2: Run it**

Run: `node scripts/mutation-check.mjs <scratchpad>/mutants.json`
Expected: every row `KILLED`, exit 0. A `SURVIVED` row is a gap in the tests: strengthen the owning task's test, commit, and re-run until all are killed. Afterwards `git status` must show a clean tree (the script restores every file).

- [ ] **Step 3: Gauntlet**

Run `/rtc:gauntlet full`. Everything must pass; failures under `/.claude/worktrees/` other than this one belong to sibling sessions and are reported, not fixed.

- [ ] **Step 4: Ship**

Follow `shipping-repo-changes`: push `worktree-equities-price-history`, open one PR ("feat: equities price history (M4) + close the prototype/data-model ledger"), loop on `gh run list` until the run for `HEAD` is green, triage catch-up (Rule 3), check code scanning, merge with `--merge`, confirm `git merge-base --is-ancestor`, then remove the worktree and branch.
