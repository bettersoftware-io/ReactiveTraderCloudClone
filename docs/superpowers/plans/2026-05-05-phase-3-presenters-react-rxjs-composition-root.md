# Phase 3 — Presenters, react-rxjs, Composition Root: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the Application Layer's presenter tier and the react-rxjs hook bridge that turns presenter Observables into React hooks. Retire the `ServiceProvider` + `ConnectionProvider` Contexts in favour of a Composition Root (`createApp(ports?)`) wired through a single `<HooksProvider>`.

**Architecture:** New `packages/client/src/app/` subtree containing presenter classes (one per UI feature, all framework-free), a `composition.ts` factory, a `HooksProvider`/`useHooks` Context, and relocated port adapters. Each presenter wraps a domain use case and exposes one or more `Observable<T>` streams (or one-shot command Observables). `bind()` from `@react-rxjs/core` produces React hooks from those streams. UI components consume only `useHooks()` — they never import use cases, ports, or `useServices`.

**Tech Stack:** TypeScript 5, React 19, RxJS ^7.8, `@react-rxjs/core` (new dep), Vite 6, Vitest 3, Playwright 1.50, pnpm + Turborepo workspaces.

**Spec:** `docs/superpowers/specs/2026-05-01-phase-3-presenters-react-rxjs-design.md` (amended 2026-05-04 for the post-2.6 Observable boundary; further amended 2026-05-05 to reflect that `PricingPort.getRfqQuote(symbol, pipsPosition): Observable<RfqQuoteResult>` is already in place — Phase 3 only moves the artificial delay from the hook into the simulator).

---

## File Structure

### NEW files

**Domain (`packages/domain/src/`)**
- `ports/connectionEventsPort.ts` — `ConnectionEventsPort` interface (`events(): Observable<ConnectionEvent>`).
- `usecases/CurrencyPairsUseCase.ts` (+ `.test.ts`) — pass-through over `ReferenceDataPort`.
- `usecases/TradeBlotterUseCase.ts` (+ `.test.ts`) — pass-through over `BlotterPort`.
- `usecases/InstrumentsUseCase.ts` (+ `.test.ts`) — pass-through over `InstrumentPort`.
- `usecases/DealersUseCase.ts` (+ `.test.ts`) — pass-through over `DealerPort`.
- `usecases/RfqQuoteUseCase.ts` (+ `.test.ts`) — pass-through over `PricingPort.getRfqQuote`.
- `usecases/ConnectionStatusUseCase.ts` (+ `.test.ts`) — `events.pipe(scan(nextConnectionStatus, initial), startWith(initial))`.

**Client (`packages/client/src/app/`)**
- `composition.ts` — `createApp(ports?: AppPorts): AppHooks` factory + `AppPorts`/`AppHooks` types.
- `HooksProvider.tsx` — Context + provider component + `useHooks()` consumer.
- `adapters/WsAdapter.ts` — relocated verbatim from `services/WsAdapter.ts`.
- `adapters/portFactory.ts` — exports `createSimulatorPorts()` and `createWsRealPorts(ws)`. Absorbs both `mockServiceFactory.ts` and `realServiceFactory.ts` (renamed `Services` → `AppPorts`).
- `adapters/BrowserConnectionEventsAdapter.ts` — implements `ConnectionEventsPort` via DOM event listeners + idle timer.
- `presenters/PriceStreamPresenter.ts` (+ `__tests__/PriceStreamPresenter.test.ts`)
- `presenters/PriceHistoryPresenter.ts` (+ test)
- `presenters/BlotterPresenter.ts` (+ test)
- `presenters/AnalyticsPresenter.ts` (+ test)
- `presenters/CurrencyPairsPresenter.ts` (+ test)
- `presenters/InstrumentsPresenter.ts` (+ test)
- `presenters/DealersPresenter.ts` (+ test)
- `presenters/ConnectionStatusPresenter.ts` (+ test)
- `presenters/RfqsPresenter.ts` (+ test) — hybrid (state$ + derived streams).
- `presenters/TradeExecutionPresenter.ts` (+ test) — command-only.
- `presenters/RfqQuotePresenter.ts` (+ test) — command-only.

### MODIFIED files

**Domain**
- `simulators/PricingSimulator.ts` — `getRfqQuote` adds `timer + map` for the artificial delay.
- `simulators/PricingSimulator.test.ts` — assert delayed emission via fake timers.
- `usecases/index.ts` — re-export the 6 new use cases.
- `index.ts` — re-export `ConnectionEventsPort`.

**Client**
- `package.json` — add `@react-rxjs/core` to `dependencies`.
- `main.tsx` — replace `<ServiceProvider><ConnectionProvider>` with `<HooksProvider hooks={hooks}>`.
- `fx/hooks/useExecuteTrade.ts` — rebase on `useHooks()`; drop `useServices`.
- `fx/hooks/useRfqQuote.ts` — rebase on `useHooks()`; drop the imperative `setTimeout` (now in simulator).
- `stale/useStaleDetection.ts` — change input from `dataVersion: number` to `value: unknown`; use `useHooks().useConnectionStatus()` instead of `useConnection()`.
- `fx/liveRates/LiveRatesPanel.tsx` — `useCurrencyPairs` → `useHooks().useCurrencyPairs()`.
- `fx/liveRates/tile/Tile.tsx` — 5 hooks all moved through `useHooks()`; no longer reads `version` from price stream.
- `analytics/AnalyticsPanel.tsx` — `useAnalytics` → `useHooks()`; drops `version`; passes `data` reference to `useStaleDetection`.
- `blotter/FxBlotter.tsx` — `useTradeStream` → `useHooks().useTrades()`.
- `credit/rfqTiles/RfqTilesPanel.tsx` — replaces `useRfqStream` + `useInstruments` + `useDealers`.
- `credit/newRfq/NewRfqForm.tsx` — replaces `useInstruments` + `useDealers` + `useCreateRfq`.
- `credit/blotter/CreditBlotter.tsx` — replaces `useRfqStream` + `useInstruments` + `useDealers`.
- `credit/sellSide/SellSidePanel.tsx` — replaces `useRfqStream` + `useInstruments` + `useDealers`.
- `connection/ConnectionOverlay.tsx` — `useConnection()` → `useHooks().useConnectionStatus()`.
- `connection/ConnectionStatusBar.tsx` — `useConnection()` → `useHooks().useConnectionStatus()`.
- `docs/superpowers/STATUS.md` — Phase 3 marked DONE with new test counts.

### DELETED files (after migrations)

- `packages/client/src/services/ServiceProvider.tsx`
- `packages/client/src/services/mockServiceFactory.ts`
- `packages/client/src/services/realServiceFactory.ts`
- `packages/client/src/services/WsAdapter.ts` (relocated)
- `packages/client/src/services/` (the directory itself, once empty)
- `packages/client/src/connection/ConnectionProvider.tsx`
- `packages/client/src/connection/useConnection.ts`
- `packages/client/src/fx/hooks/usePriceStream.ts`
- `packages/client/src/fx/hooks/usePriceHistory.ts`
- `packages/client/src/fx/hooks/useCurrencyPairs.ts`
- `packages/client/src/blotter/hooks/useTradeStream.ts`
- `packages/client/src/analytics/hooks/useAnalytics.ts`
- `packages/client/src/credit/hooks/useInstruments.ts`
- `packages/client/src/credit/hooks/useDealers.ts`
- `packages/client/src/credit/hooks/useRfqStream.ts`
- `packages/client/src/credit/hooks/useCreateRfq.ts`

### UNTOUCHED hooks (UI-only state machines, no port access)

`fx/hooks/useNotional.ts`, `fx/hooks/useTileState.ts`, `fx/hooks/useRfqState.ts`, `admin/hooks/useThroughput.ts`. These have no `useServices` call and stay where they are.

---

## Pre-Phase Snapshot

- Branch: `main`
- Tests: 109 unit (104 domain + 5 server) + 40 e2e — all green.
- Working tree: clean except `.claude/settings.local.json` (auto-grants).

The pre-flight step in Task 1 must reconfirm this before any change.

---

## Task 1: Pre-flight + add `@react-rxjs/core`

**Files:**
- Modify: `packages/client/package.json`

- [x] **Step 1: Confirm baseline is green**

Run: `cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: typecheck clean; 109 unit tests pass; 40 e2e tests pass.

If any of those fail, STOP — investigate and report. Do not continue.

- [x] **Step 2: Add `@react-rxjs/core` to client dependencies**

Edit `packages/client/package.json`. In the `dependencies` block, add `"@react-rxjs/core": "^0.10.7"` (latest stable at time of writing) so the section reads:

```json
  "dependencies": {
    "@react-rxjs/core": "^0.10.7",
    "@rtc/domain": "workspace:*",
    "@rtc/shared": "workspace:*",
    "react": "^19",
    "react-dom": "^19",
    "rxjs": "^7.8"
  },
```

- [x] **Step 3: Install**

Run: `pnpm install`
Expected: `@react-rxjs/core` installed in `packages/client/node_modules`. Watch for React 19 peer-dep warnings — `@react-rxjs/core` declares `react@>=16` peer, so React 19 satisfies; if pnpm errors, add a peer-deps override in the root `package.json` `pnpm.peerDependencyRules.allowedVersions` block. Do not run `--no-strict-peer-deps`.

- [x] **Step 4: Sanity import**

Run: `cd packages/client && node -e "import('@react-rxjs/core').then(m => console.log(typeof m.bind))"`
Expected: `function`.

- [x] **Step 5: Confirm typecheck still clean**

Run: `pnpm typecheck`
Expected: pass.

- [x] **Step 6: Commit**

```bash
git add packages/client/package.json pnpm-lock.yaml
git commit -m "chore(client): add @react-rxjs/core dependency for Phase 3 presenter bridge"
```

---

## Task 2: `PricingSimulator.getRfqQuote` — internalise the artificial delay

The 500–2000 ms delay currently lives in `useRfqQuote.ts` (an imperative `setTimeout` before calling `firstValueFrom`). Phase 3's port-evolution principle says the hook just awaits the simulator's emission. Move the delay into the simulator.

**Files:**
- Modify: `packages/domain/src/simulators/PricingSimulator.ts`
- Modify: `packages/domain/src/simulators/PricingSimulator.test.ts`

- [x] **Step 1: Write failing test**

Open `packages/domain/src/simulators/PricingSimulator.test.ts`. Find the existing `getRfqQuote` describe block (or add one if absent). Add this test inside it:

```ts
import { Subscription } from "rxjs";
// ... existing imports ...
import { vi } from "vitest";

it("emits the RFQ quote after a 500–2000 ms delay", async () => {
  vi.useFakeTimers();
  try {
    const sim = new PricingSimulator();
    const symbol = "EURUSD";
    let received: RfqQuoteResult | undefined;
    const sub: Subscription = sim.getRfqQuote(symbol, 4).subscribe((q) => {
      received = q;
    });
    // Below the 500ms floor — must not have emitted yet.
    await vi.advanceTimersByTimeAsync(499);
    expect(received).toBeUndefined();
    // Past the 2000ms ceiling — must have emitted exactly once by now.
    await vi.advanceTimersByTimeAsync(1501);
    expect(received).toBeDefined();
    expect(received!.bid).toBeLessThan(received!.ask);
    sub.unsubscribe();
  } finally {
    vi.useRealTimers();
  }
});
```

If the file doesn't already import `RfqQuoteResult`, add to the existing `@rtc/domain`-style import for the simulator file's relative path:

```ts
import { PricingSimulator } from "./PricingSimulator.js";
import type { RfqQuoteResult } from "../ports/pricingPort.js";
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone && pnpm --filter @rtc/domain test -- --run --reporter=verbose simulators/PricingSimulator.test.ts`
Expected: FAIL — the new test reports `received` is defined within the first tick (currently the simulator emits synchronously via `defer + of`).

- [x] **Step 3: Update `getRfqQuote` to wrap with `timer + map`**

Open `packages/domain/src/simulators/PricingSimulator.ts`. Replace the `getRfqQuote` method body (currently uses `of(...)`) with this `defer + timer + map` form. The full method body:

```ts
import { defer, map, of, throwError, timer, type Observable } from "rxjs";
// ... rest of imports unchanged ...

getRfqQuote(symbol: string, pipsPosition: number): Observable<RfqQuoteResult> {
  return defer(() => {
    const state = this.pairs.get(symbol);
    if (!state) return throwError(() => new Error(`Unknown symbol: ${symbol}`));
    const priceChange = 0.3 / Math.pow(10, pipsPosition);
    const delayMs = 500 + Math.floor(Math.random() * 1500);
    const result: RfqQuoteResult = {
      ask: state.mid + HALF_SPREAD + priceChange,
      bid: state.mid - HALF_SPREAD - priceChange,
      mid: state.mid,
    };
    return timer(delayMs).pipe(map(() => result));
  });
}
```

Keep the existing `import { Observable, of, defer, throwError, concat, from } from "rxjs";` line. Add `map` and `timer` to that import (alphabetically: keep `of` since `getRfqQuote` no longer uses it directly, but other methods may still — leave existing imports alone, just add `map` and `timer`):

```ts
import { Observable, of, defer, throwError, concat, from, map, timer } from "rxjs";
```

(`of` may now be unused inside `getRfqQuote` but is still used by `getPriceHistory`. Confirm by re-reading the file; do not remove an import another method needs.)

- [x] **Step 4: Run the test — should now pass**

Run: `pnpm --filter @rtc/domain test -- --run --reporter=verbose simulators/PricingSimulator.test.ts`
Expected: PASS — the new test plus all pre-existing PricingSimulator tests.

If a pre-existing test that called `firstValueFrom(sim.getRfqQuote(...))` now hangs because it relied on synchronous emission, switch it to use `vi.useFakeTimers()` + advance + `firstValueFrom`, or use `take(1) + toArray()` with a timer.

- [x] **Step 5: Run the full domain suite to confirm nothing else broke**

Run: `pnpm --filter @rtc/domain test`
Expected: 105 unit tests pass (was 104; one new test added).

- [x] **Step 6: Commit**

```bash
git add packages/domain/src/simulators/PricingSimulator.ts packages/domain/src/simulators/PricingSimulator.test.ts
git commit -m "refactor(domain): move RFQ quote artificial delay into PricingSimulator

The 500-2000ms randomised delay used to live in the useRfqQuote hook
(imperative setTimeout before firstValueFrom). Move it into the simulator
so the port boundary is the single source of truth for that timing.
The hook simplification follows in Task 11."
```

---

## Task 3: Domain — five trivial use cases

Five tiny use cases that each delegate to a port. Each adds an architectural slot in the domain layer for "this is what the application does with that port" — even when the body is one line. Keeping them small and grouped: one task creates all five files at once.

**Files:**
- Create: `packages/domain/src/usecases/CurrencyPairsUseCase.ts`
- Create: `packages/domain/src/usecases/CurrencyPairsUseCase.test.ts`
- Create: `packages/domain/src/usecases/TradeBlotterUseCase.ts`
- Create: `packages/domain/src/usecases/TradeBlotterUseCase.test.ts`
- Create: `packages/domain/src/usecases/InstrumentsUseCase.ts`
- Create: `packages/domain/src/usecases/InstrumentsUseCase.test.ts`
- Create: `packages/domain/src/usecases/DealersUseCase.ts`
- Create: `packages/domain/src/usecases/DealersUseCase.test.ts`
- Create: `packages/domain/src/usecases/RfqQuoteUseCase.ts`
- Create: `packages/domain/src/usecases/RfqQuoteUseCase.test.ts`
- Modify: `packages/domain/src/usecases/index.ts`

- [x] **Step 1: Write the five test files**

Create `packages/domain/src/usecases/CurrencyPairsUseCase.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { ReferenceDataPort } from "../ports/referenceDataPort.js";
import { CurrencyPairsUseCase } from "./CurrencyPairsUseCase.js";

describe("CurrencyPairsUseCase", () => {
  it("delegates to ReferenceDataPort.getCurrencyPairs", async () => {
    const pairs: readonly CurrencyPair[] = [
      { symbol: "EURUSD", base: "EUR", terms: "USD", ratePrecision: 5, pipsPosition: 4, defaultNotional: 1_000_000 },
    ];
    const port: ReferenceDataPort = {
      getCurrencyPairs: () => of(pairs),
    };
    const useCase = new CurrencyPairsUseCase(port);
    expect(await firstValueFrom(useCase.execute())).toBe(pairs);
  });
});
```

Create `packages/domain/src/usecases/TradeBlotterUseCase.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { BlotterPort } from "../ports/blotterPort.js";
import type { Trade } from "../fx/trade.js";
import { TradeBlotterUseCase } from "./TradeBlotterUseCase.js";

describe("TradeBlotterUseCase", () => {
  it("delegates to BlotterPort.getTradeStream", async () => {
    const trades: readonly Trade[] = [];
    const port: BlotterPort = { getTradeStream: () => of(trades) };
    const useCase = new TradeBlotterUseCase(port);
    expect(await firstValueFrom(useCase.execute())).toBe(trades);
  });
});
```

Create `packages/domain/src/usecases/InstrumentsUseCase.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { Instrument } from "../credit/instrument.js";
import type { InstrumentPort } from "../ports/instrumentPort.js";
import { InstrumentsUseCase } from "./InstrumentsUseCase.js";

describe("InstrumentsUseCase", () => {
  it("delegates to InstrumentPort.getInstruments", async () => {
    const instruments: readonly Instrument[] = [];
    const port: InstrumentPort = { getInstruments: () => of(instruments) };
    const useCase = new InstrumentsUseCase(port);
    expect(await firstValueFrom(useCase.execute())).toBe(instruments);
  });
});
```

Create `packages/domain/src/usecases/DealersUseCase.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { Dealer } from "../credit/dealer.js";
import type { DealerPort } from "../ports/dealerPort.js";
import { DealersUseCase } from "./DealersUseCase.js";

describe("DealersUseCase", () => {
  it("delegates to DealerPort.getDealers", async () => {
    const dealers: readonly Dealer[] = [];
    const port: DealerPort = { getDealers: () => of(dealers) };
    const useCase = new DealersUseCase(port);
    expect(await firstValueFrom(useCase.execute())).toBe(dealers);
  });
});
```

Create `packages/domain/src/usecases/RfqQuoteUseCase.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { PricingPort, RfqQuoteResult } from "../ports/pricingPort.js";
import { RfqQuoteUseCase } from "./RfqQuoteUseCase.js";

describe("RfqQuoteUseCase", () => {
  it("delegates to PricingPort.getRfqQuote with symbol + pipsPosition", async () => {
    const expected: RfqQuoteResult = { bid: 1.099, ask: 1.101, mid: 1.1 };
    let calledWith: { symbol: string; pipsPosition: number } | null = null;
    const port: PricingPort = {
      getPriceUpdates: () => of(),
      getPriceHistory: () => of([]),
      getRfqQuote: (symbol, pipsPosition) => {
        calledWith = { symbol, pipsPosition };
        return of(expected);
      },
    };
    const useCase = new RfqQuoteUseCase(port);
    const result = await firstValueFrom(useCase.execute("EURUSD", 4));
    expect(calledWith).toEqual({ symbol: "EURUSD", pipsPosition: 4 });
    expect(result).toBe(expected);
  });
});
```

- [x] **Step 2: Run the tests to verify they all fail**

Run: `pnpm --filter @rtc/domain test -- --run --reporter=verbose usecases/CurrencyPairsUseCase usecases/TradeBlotterUseCase usecases/InstrumentsUseCase usecases/DealersUseCase usecases/RfqQuoteUseCase`
Expected: FAIL — five files report "Cannot find module" for the use-case implementations.

- [x] **Step 3: Write the five implementation files**

Create `packages/domain/src/usecases/CurrencyPairsUseCase.ts`:

```ts
import type { Observable } from "rxjs";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { ReferenceDataPort } from "../ports/referenceDataPort.js";

export class CurrencyPairsUseCase {
  constructor(private readonly referenceData: ReferenceDataPort) {}
  execute(): Observable<readonly CurrencyPair[]> {
    return this.referenceData.getCurrencyPairs();
  }
}
```

Create `packages/domain/src/usecases/TradeBlotterUseCase.ts`:

```ts
import type { Observable } from "rxjs";
import type { Trade } from "../fx/trade.js";
import type { BlotterPort } from "../ports/blotterPort.js";

export class TradeBlotterUseCase {
  constructor(private readonly blotter: BlotterPort) {}
  execute(): Observable<readonly Trade[]> {
    return this.blotter.getTradeStream();
  }
}
```

Create `packages/domain/src/usecases/InstrumentsUseCase.ts`:

```ts
import type { Observable } from "rxjs";
import type { Instrument } from "../credit/instrument.js";
import type { InstrumentPort } from "../ports/instrumentPort.js";

export class InstrumentsUseCase {
  constructor(private readonly instruments: InstrumentPort) {}
  execute(): Observable<readonly Instrument[]> {
    return this.instruments.getInstruments();
  }
}
```

Create `packages/domain/src/usecases/DealersUseCase.ts`:

```ts
import type { Observable } from "rxjs";
import type { Dealer } from "../credit/dealer.js";
import type { DealerPort } from "../ports/dealerPort.js";

export class DealersUseCase {
  constructor(private readonly dealers: DealerPort) {}
  execute(): Observable<readonly Dealer[]> {
    return this.dealers.getDealers();
  }
}
```

Create `packages/domain/src/usecases/RfqQuoteUseCase.ts`:

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

- [x] **Step 4: Update the use-cases barrel**

Open `packages/domain/src/usecases/index.ts`. Append:

```ts
export { CurrencyPairsUseCase } from "./CurrencyPairsUseCase.js";
export { TradeBlotterUseCase } from "./TradeBlotterUseCase.js";
export { InstrumentsUseCase } from "./InstrumentsUseCase.js";
export { DealersUseCase } from "./DealersUseCase.js";
export { RfqQuoteUseCase } from "./RfqQuoteUseCase.js";
```

- [x] **Step 5: Run the tests — should now pass**

Run: `pnpm --filter @rtc/domain test`
Expected: all five new tests pass; total domain test count 105 → 110.

- [x] **Step 6: Commit**

```bash
git add packages/domain/src/usecases/CurrencyPairsUseCase.ts packages/domain/src/usecases/CurrencyPairsUseCase.test.ts packages/domain/src/usecases/TradeBlotterUseCase.ts packages/domain/src/usecases/TradeBlotterUseCase.test.ts packages/domain/src/usecases/InstrumentsUseCase.ts packages/domain/src/usecases/InstrumentsUseCase.test.ts packages/domain/src/usecases/DealersUseCase.ts packages/domain/src/usecases/DealersUseCase.test.ts packages/domain/src/usecases/RfqQuoteUseCase.ts packages/domain/src/usecases/RfqQuoteUseCase.test.ts packages/domain/src/usecases/index.ts
git commit -m "feat(domain): add 5 use cases for Phase 3 presenter wiring

CurrencyPairs, TradeBlotter, Instruments, Dealers, RfqQuote — each is
a one-line delegate to a port. They occupy the application-layer slot
their corresponding presenter will sit above."
```

---

## Task 4: Domain — `ConnectionEventsPort` + `ConnectionStatusUseCase`

The connection state machine `nextConnectionStatus` already lives in `packages/domain/src/connection/connectionStatus.ts`. It's currently driven imperatively from `ConnectionProvider.tsx` (browser event handlers calling `setStatus(prev => nextConnectionStatus(prev, event))`). Phase 3 introduces:

- A `ConnectionEventsPort` boundary so the source of `ConnectionEvent`s is pluggable (browser today, anything else later).
- A `ConnectionStatusUseCase` that folds events through `nextConnectionStatus` into a `ConnectionStatus` stream.

**Files:**
- Create: `packages/domain/src/ports/connectionEventsPort.ts`
- Create: `packages/domain/src/usecases/ConnectionStatusUseCase.ts`
- Create: `packages/domain/src/usecases/ConnectionStatusUseCase.test.ts`
- Modify: `packages/domain/src/usecases/index.ts`
- Modify: `packages/domain/src/index.ts`

- [x] **Step 1: Inspect what's exported today from the domain index for ports**

Open `packages/domain/src/index.ts` and confirm it re-exports the existing 8 port interface modules. The new `ConnectionEventsPort` must follow the same export pattern. (If the index file structures this differently than expected, adapt the new exports to match — don't restructure the index.)

- [x] **Step 2: Write the failing use-case test**

Create `packages/domain/src/usecases/ConnectionStatusUseCase.test.ts`:

```ts
import { firstValueFrom, of, Subject, toArray } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  ConnectionStatus,
  type ConnectionEvent,
} from "../connection/connectionStatus.js";
import type { ConnectionEventsPort } from "../ports/connectionEventsPort.js";
import { ConnectionStatusUseCase } from "./ConnectionStatusUseCase.js";

function portFrom(events: readonly ConnectionEvent[]): ConnectionEventsPort {
  return { events: () => of(...events) };
}

describe("ConnectionStatusUseCase", () => {
  it("emits the initial status synchronously when there are no events", async () => {
    const port: ConnectionEventsPort = { events: () => of() };
    const useCase = new ConnectionStatusUseCase(port);
    const emissions = await firstValueFrom(useCase.execute().pipe(toArray()));
    expect(emissions).toEqual([ConnectionStatus.CONNECTING]);
  });

  it("folds events through nextConnectionStatus", async () => {
    const port = portFrom([
      { type: "gatewayConnected" },
      { type: "idleTimeout" },
      { type: "userActivity" },
    ]);
    const useCase = new ConnectionStatusUseCase(port);
    const emissions = await firstValueFrom(useCase.execute().pipe(toArray()));
    expect(emissions).toEqual([
      ConnectionStatus.CONNECTING,
      ConnectionStatus.CONNECTED,
      ConnectionStatus.IDLE_DISCONNECTED,
      ConnectionStatus.CONNECTING,
    ]);
  });

  it("uses the explicit initial status when provided", async () => {
    const port: ConnectionEventsPort = { events: () => of() };
    const useCase = new ConnectionStatusUseCase(port, ConnectionStatus.CONNECTED);
    const first = await firstValueFrom(useCase.execute());
    expect(first).toBe(ConnectionStatus.CONNECTED);
  });

  it("emits live updates from a hot event stream", () => {
    const subject = new Subject<ConnectionEvent>();
    const port: ConnectionEventsPort = { events: () => subject.asObservable() };
    const useCase = new ConnectionStatusUseCase(port, ConnectionStatus.CONNECTED);
    const seen: ConnectionStatus[] = [];
    const sub = useCase.execute().subscribe((s) => seen.push(s));
    subject.next({ type: "gatewayDisconnected" });
    subject.next({ type: "browserOffline" });
    sub.unsubscribe();
    expect(seen).toEqual([
      ConnectionStatus.CONNECTED,
      ConnectionStatus.DISCONNECTED,
      ConnectionStatus.OFFLINE_DISCONNECTED,
    ]);
  });
});
```

- [x] **Step 3: Run the test — confirm it fails**

Run: `pnpm --filter @rtc/domain test -- --run --reporter=verbose usecases/ConnectionStatusUseCase`
Expected: FAIL — module not found.

- [x] **Step 4: Create the port interface**

Create `packages/domain/src/ports/connectionEventsPort.ts`:

```ts
import type { Observable } from "rxjs";
import type { ConnectionEvent } from "../connection/connectionStatus.js";

export interface ConnectionEventsPort {
  events(): Observable<ConnectionEvent>;
}
```

- [x] **Step 5: Create the use case**

Create `packages/domain/src/usecases/ConnectionStatusUseCase.ts`:

```ts
import { type Observable, scan, startWith } from "rxjs";
import {
  ConnectionStatus,
  nextConnectionStatus,
  type ConnectionEvent,
} from "../connection/connectionStatus.js";
import type { ConnectionEventsPort } from "../ports/connectionEventsPort.js";

export class ConnectionStatusUseCase {
  constructor(
    private readonly events: ConnectionEventsPort,
    private readonly initial: ConnectionStatus = ConnectionStatus.CONNECTING,
  ) {}

  execute(): Observable<ConnectionStatus> {
    return this.events.events().pipe(
      scan(
        (state: ConnectionStatus, event: ConnectionEvent) => nextConnectionStatus(state, event),
        this.initial,
      ),
      startWith(this.initial),
    );
  }
}
```

- [x] **Step 6: Re-export from the use-cases barrel**

Open `packages/domain/src/usecases/index.ts`. Append:

```ts
export { ConnectionStatusUseCase } from "./ConnectionStatusUseCase.js";
```

- [x] **Step 7: Re-export the port from the domain root**

Open `packages/domain/src/index.ts`. Find the existing port re-exports and add (placing near the other port exports):

```ts
export type { ConnectionEventsPort } from "./ports/connectionEventsPort.js";
```

- [x] **Step 8: Run the test — should pass**

Run: `pnpm --filter @rtc/domain test`
Expected: 4 new tests pass; total domain test count 110 → 114.

- [x] **Step 9: Typecheck — confirm no broken imports**

Run: `pnpm --filter @rtc/domain typecheck`
Expected: pass.

- [x] **Step 10: Commit**

```bash
git add packages/domain/src/ports/connectionEventsPort.ts packages/domain/src/usecases/ConnectionStatusUseCase.ts packages/domain/src/usecases/ConnectionStatusUseCase.test.ts packages/domain/src/usecases/index.ts packages/domain/src/index.ts
git commit -m "feat(domain): add ConnectionEventsPort + ConnectionStatusUseCase

Use case folds ConnectionEvents through the existing nextConnectionStatus
state machine, emitting ConnectionStatus updates. Port abstracts the
event source (browser today, server-driven later)."
```

---

## Task 5: Client — relocate `WsAdapter`, define `AppPorts`, build `portFactory`

This task creates the `app/adapters/` subdir with three files. The old `services/ws-adapter.ts` is moved verbatim (only the file location changes). `mockServiceFactory` and `realServiceFactory` are merged into a single `portFactory.ts` that exports `createSimulatorPorts()` and `createWsRealPorts(ws)`. The `Services` interface is renamed `AppPorts` and gains a `connectionEvents: ConnectionEventsPort` field (populated later by the composition root, not by either factory — both factories return all eight transport ports only).

The originals are NOT deleted yet; existing `useServices()` consumers still need them until Task 14. Coexistence is intentional.

**Files:**
- Create: `packages/client/src/app/adapters/WsAdapter.ts` (copy + tweak imports)
- Create: `packages/client/src/app/adapters/portFactory.ts`

- [x] **Step 1: Create the directory + relocate `WsAdapter`**

Run:

```bash
mkdir -p /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/app/adapters
```

Then copy `packages/client/src/services/WsAdapter.ts` to `packages/client/src/app/adapters/WsAdapter.ts` byte-for-byte (no internal imports change since the file is self-contained):

```bash
cp /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/services/WsAdapter.ts /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/app/adapters/WsAdapter.ts
```

The original `services/WsAdapter.ts` is NOT deleted yet — `services/realServiceFactory.ts` (still used by `ServiceProvider`) imports it. Both copies coexist until Task 14.

- [x] **Step 2: Create `portFactory.ts`**

Create `packages/client/src/app/adapters/portFactory.ts`:

```ts
import {
  ReferenceDataSimulator,
  PricingSimulator,
  ExecutionSimulator,
  TradeStoreSimulator,
  AnalyticsSimulator,
  InstrumentSimulator,
  DealerSimulator,
  CreditRfqSimulator,
  DEALERS_CATALOG,
  type ReferenceDataPort,
  type PricingPort,
  type ExecutionPort,
  type BlotterPort,
  type AnalyticsPort,
  type InstrumentPort,
  type DealerPort,
  type WorkflowPort,
  type ConnectionEventsPort,
} from "@rtc/domain";

export interface AppPorts {
  referenceData: ReferenceDataPort;
  pricing: PricingPort;
  execution: ExecutionPort;
  blotter: BlotterPort;
  analytics: AnalyticsPort;
  instruments: InstrumentPort;
  dealers: DealerPort;
  workflow: WorkflowPort;
  connectionEvents: ConnectionEventsPort;
}

export type TransportPorts = Omit<AppPorts, "connectionEvents">;

export function createSimulatorPorts(): TransportPorts {
  const execution = new ExecutionSimulator();
  return {
    referenceData: new ReferenceDataSimulator(),
    pricing: new PricingSimulator(),
    execution,
    blotter: new TradeStoreSimulator(execution),
    analytics: new AnalyticsSimulator(),
    instruments: new InstrumentSimulator(),
    dealers: new DealerSimulator(),
    workflow: new CreditRfqSimulator(DEALERS_CATALOG),
  };
}

// `createWsRealPorts` re-exports the existing real-services factory, retyped
// as TransportPorts. The body of that factory is kept verbatim in
// services/realServiceFactory.ts during the Phase 3 transition; in Task 14
// we delete the legacy file and inline the implementation here. Until then,
// re-export to avoid duplicating ~470 lines of port wiring.
import { createRealServices } from "../../services/realServiceFactory";
import { WsAdapter } from "./WsAdapter";

export function createWsRealPorts(ws: WsAdapter): TransportPorts {
  return createRealServices(ws);
}

export { WsAdapter };
```

Note the imports: `createRealServices` and the legacy `WsAdapter` are pulled from the old locations on purpose. We deliberately accept a temporary indirection during the migration phase. The legacy `realServiceFactory.ts` already returns the `Services` shape that is structurally identical to `TransportPorts` — TypeScript will accept the assignment because both have the same eight port fields. If TypeScript complains, the fix is a single `as TransportPorts` cast at the return site — but try without it first.

- [x] **Step 3: Typecheck**

Run: `pnpm --filter @rtc/client typecheck`
Expected: pass. The `Services` and `TransportPorts` types must be structurally compatible.

If the typecheck fails on the `createRealServices(ws)` return type, add the cast:

```ts
export function createWsRealPorts(ws: WsAdapter): TransportPorts {
  return createRealServices(ws) as TransportPorts;
}
```

- [x] **Step 4: Build the client to confirm Vite is happy**

Run: `pnpm --filter @rtc/client build`
Expected: build succeeds.

- [x] **Step 5: Commit**

```bash
git add packages/client/src/app/adapters/WsAdapter.ts packages/client/src/app/adapters/portFactory.ts
git commit -m "feat(client): scaffold app/adapters — WsAdapter + portFactory + AppPorts type

Relocates WsAdapter to app/adapters/ verbatim and introduces portFactory
exporting createSimulatorPorts() and createWsRealPorts(). AppPorts adds the
connectionEvents slot the composition root will populate. Legacy services/
files remain in place until Task 14."
```

---

## Task 6: Client — `BrowserConnectionEventsAdapter`

Implements `ConnectionEventsPort` by listening to DOM events: mouse / keydown / touchstart for `userActivity`, online/offline for `browserOffline`/`browserOnline`, and an idle timer for `idleTimeout`. The `gatewayConnected`/`gatewayDisconnected` events are NOT produced by this adapter — those would come from a future `WsAdapter`-driven adapter when the backend is real. For mock mode, the composition root emits a synthetic `gatewayConnected` immediately so the state machine reaches `CONNECTED`. (See Task 10 for the synthetic emission.)

**Files:**
- Create: `packages/client/src/app/adapters/BrowserConnectionEventsAdapter.ts`
- Create: `packages/client/src/app/adapters/BrowserConnectionEventsAdapter.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/client/src/app/adapters/BrowserConnectionEventsAdapter.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Subscription } from "rxjs";
import { IDLE_TIMEOUT_MS, type ConnectionEvent } from "@rtc/domain";
import { BrowserConnectionEventsAdapter } from "./BrowserConnectionEventsAdapter";

describe("BrowserConnectionEventsAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits userActivity on mousemove and resets the idle timer", () => {
    const adapter = new BrowserConnectionEventsAdapter();
    const events: ConnectionEvent[] = [];
    const sub: Subscription = adapter.events().subscribe((e) => events.push(e));

    window.dispatchEvent(new Event("mousemove"));
    expect(events.at(-1)).toEqual({ type: "userActivity" });

    // Almost-idle, then activity, then full idle window — should NOT see idleTimeout
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    window.dispatchEvent(new Event("mousemove"));
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(events.some((e) => e.type === "idleTimeout")).toBe(false);

    sub.unsubscribe();
  });

  it("emits idleTimeout when there is no activity for IDLE_TIMEOUT_MS", () => {
    const adapter = new BrowserConnectionEventsAdapter();
    const events: ConnectionEvent[] = [];
    const sub = adapter.events().subscribe((e) => events.push(e));
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    expect(events.some((e) => e.type === "idleTimeout")).toBe(true);
    sub.unsubscribe();
  });

  it("emits browserOffline / browserOnline on window events", () => {
    const adapter = new BrowserConnectionEventsAdapter();
    const events: ConnectionEvent[] = [];
    const sub = adapter.events().subscribe((e) => events.push(e));
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["browserOffline", "browserOnline"]),
    );
    sub.unsubscribe();
  });

  it("removes listeners on unsubscribe", () => {
    const adapter = new BrowserConnectionEventsAdapter();
    const eventsA: ConnectionEvent[] = [];
    const eventsB: ConnectionEvent[] = [];
    const subA = adapter.events().subscribe((e) => eventsA.push(e));
    const subB = adapter.events().subscribe((e) => eventsB.push(e));
    subA.unsubscribe();
    window.dispatchEvent(new Event("mousemove"));
    expect(eventsA.length).toBe(0); // unsubscribed before event fired
    expect(eventsB.length).toBe(1); // still subscribed
    subB.unsubscribe();
    window.dispatchEvent(new Event("mousemove"));
    expect(eventsB.length).toBe(1); // no further updates after unsubscribe
  });
});
```

This test runs under jsdom — confirm `packages/client/vitest.config.ts` sets `environment: 'jsdom'`. If not, configure that first (a small one-line config change is acceptable inside this task; commit it together).

- [x] **Step 2: Confirm the vitest environment**

Run: `cat /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/vitest.config.ts`

If `environment: 'jsdom'` is missing, add it:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
```

(Install `jsdom` if not already a devDependency: check `packages/client/package.json` — if missing, add `"jsdom": "^25"` to devDependencies and run `pnpm install`.)

- [x] **Step 3: Run the test — should fail**

Run: `pnpm --filter @rtc/client test -- --run --reporter=verbose adapters/BrowserConnectionEventsAdapter`
Expected: FAIL — module not found.

- [x] **Step 4: Implement the adapter**

Create `packages/client/src/app/adapters/BrowserConnectionEventsAdapter.ts`:

```ts
import { Observable } from "rxjs";
import {
  IDLE_TIMEOUT_MS,
  type ConnectionEvent,
  type ConnectionEventsPort,
} from "@rtc/domain";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart"] as const;

export class BrowserConnectionEventsAdapter implements ConnectionEventsPort {
  events(): Observable<ConnectionEvent> {
    return new Observable<ConnectionEvent>((subscriber) => {
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const armIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          subscriber.next({ type: "idleTimeout" });
        }, IDLE_TIMEOUT_MS);
      };

      const onActivity = () => {
        subscriber.next({ type: "userActivity" });
        armIdleTimer();
      };
      const onOnline = () => subscriber.next({ type: "browserOnline" });
      const onOffline = () => subscriber.next({ type: "browserOffline" });

      for (const eventName of ACTIVITY_EVENTS) {
        window.addEventListener(eventName, onActivity, { passive: true });
      }
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      armIdleTimer();

      return () => {
        for (const eventName of ACTIVITY_EVENTS) {
          window.removeEventListener(eventName, onActivity);
        }
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        if (idleTimer) clearTimeout(idleTimer);
      };
    });
  }
}
```

- [x] **Step 5: Run the tests — should pass**

Run: `pnpm --filter @rtc/client test`
Expected: 4 new tests pass.

- [x] **Step 6: Commit**

```bash
git add packages/client/src/app/adapters/BrowserConnectionEventsAdapter.ts packages/client/src/app/adapters/BrowserConnectionEventsAdapter.test.ts packages/client/vitest.config.ts packages/client/package.json pnpm-lock.yaml
git commit -m "feat(client): add BrowserConnectionEventsAdapter

Implements ConnectionEventsPort over DOM activity events, online/offline,
and an idle timer. Each subscription installs its own listeners with
explicit teardown. Configures jsdom for vitest if not already set."
```

(If `vitest.config.ts` and `package.json` were not modified in step 2, omit them from `git add`.)

---

## Task 7: Client — four simple stream presenters (Price, History, Blotter, Analytics)

Each presenter wraps a use case and exposes one or two `Observable<T>` streams (replayed via `shareReplay`). Per-key caching is used for parameterised streams (`PriceStreamPresenter` and `PriceHistoryPresenter` cache by symbol).

**Files:**
- Create: `packages/client/src/app/presenters/PriceStreamPresenter.ts` (+ `__tests__/PriceStreamPresenter.test.ts`)
- Create: `packages/client/src/app/presenters/PriceHistoryPresenter.ts` (+ `__tests__/PriceHistoryPresenter.test.ts`)
- Create: `packages/client/src/app/presenters/BlotterPresenter.ts` (+ `__tests__/BlotterPresenter.test.ts`)
- Create: `packages/client/src/app/presenters/AnalyticsPresenter.ts` (+ `__tests__/AnalyticsPresenter.test.ts`)

- [x] **Step 1: Write all four failing tests**

Create `packages/client/src/app/presenters/__tests__/PriceStreamPresenter.test.ts`:

```ts
import { firstValueFrom, of, take } from "rxjs";
import { describe, expect, it } from "vitest";
import type { CurrencyPair, PricingPort, PriceTick } from "@rtc/domain";
import { PriceStreamPresenter } from "../PriceStreamPresenter";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD", base: "EUR", terms: "USD",
  ratePrecision: 5, pipsPosition: 4, defaultNotional: 1_000_000,
};
const tick = (mid: number): PriceTick => ({
  symbol: "EURUSD", mid, ask: mid + 0.0001, bid: mid - 0.0001,
  valueDate: "2026-05-05", creationTimestamp: 1,
});

describe("PriceStreamPresenter", () => {
  it("emits a Price (enriched tick) for the given pair", async () => {
    const port: PricingPort = {
      getPriceUpdates: () => of(tick(1.1), tick(1.1001)),
      getPriceHistory: () => of([]),
      getRfqQuote: () => of({ bid: 0, ask: 0, mid: 0 }),
    };
    const presenter = new PriceStreamPresenter(port);
    const first = await firstValueFrom(presenter.price$(EURUSD).pipe(take(1)));
    expect(first.mid).toBe(1.1);
    expect(typeof first.spread).toBe("string");
  });

  it("returns the same Observable instance for the same symbol (cached)", () => {
    const port: PricingPort = {
      getPriceUpdates: () => of(tick(1.1)),
      getPriceHistory: () => of([]),
      getRfqQuote: () => of({ bid: 0, ask: 0, mid: 0 }),
    };
    const presenter = new PriceStreamPresenter(port);
    expect(presenter.price$(EURUSD)).toBe(presenter.price$(EURUSD));
  });
});
```

Create `packages/client/src/app/presenters/__tests__/PriceHistoryPresenter.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { PricingPort, PriceTick } from "@rtc/domain";
import { PriceHistoryPresenter } from "../PriceHistoryPresenter";

const tick = (mid: number): PriceTick => ({
  symbol: "EURUSD", mid, ask: mid + 0.0001, bid: mid - 0.0001,
  valueDate: "2026-05-05", creationTimestamp: 1,
});

describe("PriceHistoryPresenter", () => {
  it("delegates to PricingPort.getPriceHistory", async () => {
    const history: readonly PriceTick[] = [tick(1.1), tick(1.1001)];
    const port: PricingPort = {
      getPriceUpdates: () => of(),
      getPriceHistory: () => of(history),
      getRfqQuote: () => of({ bid: 0, ask: 0, mid: 0 }),
    };
    const presenter = new PriceHistoryPresenter(port);
    const result = await firstValueFrom(presenter.history$("EURUSD"));
    expect(result).toBe(history);
  });

  it("caches by symbol", () => {
    const port: PricingPort = {
      getPriceUpdates: () => of(),
      getPriceHistory: () => of([]),
      getRfqQuote: () => of({ bid: 0, ask: 0, mid: 0 }),
    };
    const presenter = new PriceHistoryPresenter(port);
    expect(presenter.history$("EURUSD")).toBe(presenter.history$("EURUSD"));
    expect(presenter.history$("EURUSD")).not.toBe(presenter.history$("GBPUSD"));
  });
});
```

Create `packages/client/src/app/presenters/__tests__/BlotterPresenter.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { BlotterPort, Trade } from "@rtc/domain";
import { BlotterPresenter } from "../BlotterPresenter";

describe("BlotterPresenter", () => {
  it("exposes the trade stream", async () => {
    const trades: readonly Trade[] = [];
    const port: BlotterPort = { getTradeStream: () => of(trades) };
    const presenter = new BlotterPresenter(port);
    expect(await firstValueFrom(presenter.trades$)).toBe(trades);
  });
});
```

Create `packages/client/src/app/presenters/__tests__/AnalyticsPresenter.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { AnalyticsPort, PositionUpdates } from "@rtc/domain";
import { AnalyticsPresenter } from "../AnalyticsPresenter";

describe("AnalyticsPresenter", () => {
  it("exposes analytics for the configured base currency", async () => {
    const updates: PositionUpdates = { currentPositions: [], history: [] };
    const port: AnalyticsPort = { getAnalytics: () => of(updates) };
    const presenter = new AnalyticsPresenter(port);
    expect(await firstValueFrom(presenter.position$)).toBe(updates);
  });
});
```

- [x] **Step 2: Run — should fail**

Run: `pnpm --filter @rtc/client test -- --run --reporter=verbose presenters/`
Expected: FAIL on all four with "Cannot find module".

- [x] **Step 3: Implement the four presenters**

Create `packages/client/src/app/presenters/PriceStreamPresenter.ts`:

```ts
import { type Observable, shareReplay } from "rxjs";
import {
  type CurrencyPair, type Price,
  PriceStreamUseCase, type PricingPort,
} from "@rtc/domain";

export class PriceStreamPresenter {
  private readonly cache = new Map<string, Observable<Price>>();
  constructor(private readonly pricing: PricingPort) {}

  price$(pair: CurrencyPair): Observable<Price> {
    const cached = this.cache.get(pair.symbol);
    if (cached) return cached;
    const stream = new PriceStreamUseCase(this.pricing).execute(pair).pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.cache.set(pair.symbol, stream);
    return stream;
  }
}
```

Create `packages/client/src/app/presenters/PriceHistoryPresenter.ts`:

```ts
import { type Observable, shareReplay } from "rxjs";
import {
  type PriceTick, PriceHistoryUseCase, type PricingPort,
} from "@rtc/domain";

export class PriceHistoryPresenter {
  private readonly cache = new Map<string, Observable<readonly PriceTick[]>>();
  constructor(private readonly pricing: PricingPort) {}

  history$(symbol: string): Observable<readonly PriceTick[]> {
    const cached = this.cache.get(symbol);
    if (cached) return cached;
    const stream = new PriceHistoryUseCase(this.pricing).execute(symbol).pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.cache.set(symbol, stream);
    return stream;
  }
}
```

Create `packages/client/src/app/presenters/BlotterPresenter.ts`:

```ts
import { type Observable, shareReplay } from "rxjs";
import { type Trade, TradeBlotterUseCase, type BlotterPort } from "@rtc/domain";

export class BlotterPresenter {
  readonly trades$: Observable<readonly Trade[]>;
  constructor(blotter: BlotterPort) {
    this.trades$ = new TradeBlotterUseCase(blotter).execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
```

Create `packages/client/src/app/presenters/AnalyticsPresenter.ts`:

```ts
import { type Observable, shareReplay } from "rxjs";
import {
  type PositionUpdates, AnalyticsUseCase, type AnalyticsPort,
} from "@rtc/domain";

export class AnalyticsPresenter {
  readonly position$: Observable<PositionUpdates>;
  constructor(analytics: AnalyticsPort) {
    this.position$ = new AnalyticsUseCase(analytics).execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
```

(`AnalyticsUseCase.execute()` already takes its base currency internally — verify by reading `packages/domain/src/usecases/AnalyticsUseCase.ts`. If it requires a `currency` argument, pass `"USD"` here.)

- [x] **Step 4: Run the tests — should pass**

Run: `pnpm --filter @rtc/client test`
Expected: 6 new client tests pass (2 per Price/History, 1 each for Blotter/Analytics).

- [x] **Step 5: Commit**

```bash
git add packages/client/src/app/presenters/PriceStreamPresenter.ts packages/client/src/app/presenters/PriceHistoryPresenter.ts packages/client/src/app/presenters/BlotterPresenter.ts packages/client/src/app/presenters/AnalyticsPresenter.ts packages/client/src/app/presenters/__tests__/PriceStreamPresenter.test.ts packages/client/src/app/presenters/__tests__/PriceHistoryPresenter.test.ts packages/client/src/app/presenters/__tests__/BlotterPresenter.test.ts packages/client/src/app/presenters/__tests__/AnalyticsPresenter.test.ts
git commit -m "feat(client): add 4 stream presenters (Price, PriceHistory, Blotter, Analytics)

Each presenter wraps its use case and exposes shareReplay'd Observables.
PriceStreamPresenter and PriceHistoryPresenter cache per-symbol so multi-tile
subscribers share the underlying stream."
```

---

## Task 8: Client — four simple stream presenters (CurrencyPairs, Instruments, Dealers, ConnectionStatus)

Same shape as Task 7 but for the remaining four streams. `ConnectionStatusPresenter` wraps `ConnectionStatusUseCase`.

**Files:**
- Create: `packages/client/src/app/presenters/CurrencyPairsPresenter.ts` (+ test)
- Create: `packages/client/src/app/presenters/InstrumentsPresenter.ts` (+ test)
- Create: `packages/client/src/app/presenters/DealersPresenter.ts` (+ test)
- Create: `packages/client/src/app/presenters/ConnectionStatusPresenter.ts` (+ test)

- [x] **Step 1: Write all four failing tests**

Create `packages/client/src/app/presenters/__tests__/CurrencyPairsPresenter.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { CurrencyPair, ReferenceDataPort } from "@rtc/domain";
import { CurrencyPairsPresenter } from "../CurrencyPairsPresenter";

describe("CurrencyPairsPresenter", () => {
  it("exposes currency pairs", async () => {
    const pairs: readonly CurrencyPair[] = [];
    const port: ReferenceDataPort = { getCurrencyPairs: () => of(pairs) };
    expect(await firstValueFrom(new CurrencyPairsPresenter(port).pairs$)).toBe(pairs);
  });
});
```

Create `packages/client/src/app/presenters/__tests__/InstrumentsPresenter.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { Instrument, InstrumentPort } from "@rtc/domain";
import { InstrumentsPresenter } from "../InstrumentsPresenter";

describe("InstrumentsPresenter", () => {
  it("exposes instruments", async () => {
    const instruments: readonly Instrument[] = [];
    const port: InstrumentPort = { getInstruments: () => of(instruments) };
    expect(await firstValueFrom(new InstrumentsPresenter(port).list$)).toBe(instruments);
  });
});
```

Create `packages/client/src/app/presenters/__tests__/DealersPresenter.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { Dealer, DealerPort } from "@rtc/domain";
import { DealersPresenter } from "../DealersPresenter";

describe("DealersPresenter", () => {
  it("exposes dealers", async () => {
    const dealers: readonly Dealer[] = [];
    const port: DealerPort = { getDealers: () => of(dealers) };
    expect(await firstValueFrom(new DealersPresenter(port).list$)).toBe(dealers);
  });
});
```

Create `packages/client/src/app/presenters/__tests__/ConnectionStatusPresenter.test.ts`:

```ts
import { firstValueFrom, of, toArray, Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  ConnectionStatus,
  type ConnectionEvent,
  type ConnectionEventsPort,
} from "@rtc/domain";
import { ConnectionStatusPresenter } from "../ConnectionStatusPresenter";

describe("ConnectionStatusPresenter", () => {
  it("exposes the connection status stream", async () => {
    const port: ConnectionEventsPort = {
      events: () => of<ConnectionEvent>({ type: "gatewayConnected" }),
    };
    const all = await firstValueFrom(
      new ConnectionStatusPresenter(port).status$.pipe(toArray()),
    );
    expect(all).toEqual([ConnectionStatus.CONNECTING, ConnectionStatus.CONNECTED]);
  });

  it("multicasts the same value to multiple subscribers", () => {
    const subject = new Subject<ConnectionEvent>();
    const presenter = new ConnectionStatusPresenter(
      { events: () => subject.asObservable() },
      ConnectionStatus.CONNECTED,
    );
    const a: ConnectionStatus[] = [];
    const b: ConnectionStatus[] = [];
    const subA = presenter.status$.subscribe((s) => a.push(s));
    const subB = presenter.status$.subscribe((s) => b.push(s));
    subject.next({ type: "gatewayDisconnected" });
    subA.unsubscribe();
    subB.unsubscribe();
    expect(a).toEqual(b);
    expect(a).toEqual([ConnectionStatus.CONNECTED, ConnectionStatus.DISCONNECTED]);
  });
});
```

- [x] **Step 2: Run — should fail on all four**

Run: `pnpm --filter @rtc/client test -- --run --reporter=verbose presenters/`
Expected: FAIL.

- [x] **Step 3: Implement the four presenters**

Create `packages/client/src/app/presenters/CurrencyPairsPresenter.ts`:

```ts
import { type Observable, shareReplay } from "rxjs";
import {
  type CurrencyPair, CurrencyPairsUseCase, type ReferenceDataPort,
} from "@rtc/domain";

export class CurrencyPairsPresenter {
  readonly pairs$: Observable<readonly CurrencyPair[]>;
  constructor(referenceData: ReferenceDataPort) {
    this.pairs$ = new CurrencyPairsUseCase(referenceData).execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
```

Create `packages/client/src/app/presenters/InstrumentsPresenter.ts`:

```ts
import { type Observable, shareReplay } from "rxjs";
import { type Instrument, InstrumentsUseCase, type InstrumentPort } from "@rtc/domain";

export class InstrumentsPresenter {
  readonly list$: Observable<readonly Instrument[]>;
  constructor(instruments: InstrumentPort) {
    this.list$ = new InstrumentsUseCase(instruments).execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
```

Create `packages/client/src/app/presenters/DealersPresenter.ts`:

```ts
import { type Observable, shareReplay } from "rxjs";
import { type Dealer, DealersUseCase, type DealerPort } from "@rtc/domain";

export class DealersPresenter {
  readonly list$: Observable<readonly Dealer[]>;
  constructor(dealers: DealerPort) {
    this.list$ = new DealersUseCase(dealers).execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
```

Create `packages/client/src/app/presenters/ConnectionStatusPresenter.ts`:

```ts
import { type Observable, shareReplay } from "rxjs";
import {
  ConnectionStatus,
  ConnectionStatusUseCase,
  type ConnectionEventsPort,
} from "@rtc/domain";

export class ConnectionStatusPresenter {
  readonly status$: Observable<ConnectionStatus>;
  constructor(
    events: ConnectionEventsPort,
    initial: ConnectionStatus = ConnectionStatus.CONNECTING,
  ) {
    this.status$ = new ConnectionStatusUseCase(events, initial).execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
```

- [x] **Step 4: Run — should pass**

Run: `pnpm --filter @rtc/client test`
Expected: 5 new tests pass (1 each for CurrencyPairs/Instruments/Dealers; 2 for ConnectionStatus).

- [x] **Step 5: Commit**

```bash
git add packages/client/src/app/presenters/CurrencyPairsPresenter.ts packages/client/src/app/presenters/InstrumentsPresenter.ts packages/client/src/app/presenters/DealersPresenter.ts packages/client/src/app/presenters/ConnectionStatusPresenter.ts packages/client/src/app/presenters/__tests__/CurrencyPairsPresenter.test.ts packages/client/src/app/presenters/__tests__/InstrumentsPresenter.test.ts packages/client/src/app/presenters/__tests__/DealersPresenter.test.ts packages/client/src/app/presenters/__tests__/ConnectionStatusPresenter.test.ts
git commit -m "feat(client): add 4 stream presenters (CurrencyPairs, Instruments, Dealers, ConnectionStatus)

ConnectionStatusPresenter is the first non-trivial multicast — multiple
consumers (overlay + status bar) share the single state machine."
```

---

## Task 9: Client — three hybrid / command presenters (Rfqs, TradeExecution, RfqQuote)

`RfqsPresenter` is the hybrid — one private `state$` source + multiple derived narrow streams. `TradeExecutionPresenter` and `RfqQuotePresenter` are command-only — they expose methods that return one-shot Observables.

**Files:**
- Create: `packages/client/src/app/presenters/RfqsPresenter.ts` (+ test)
- Create: `packages/client/src/app/presenters/TradeExecutionPresenter.ts` (+ test)
- Create: `packages/client/src/app/presenters/RfqQuotePresenter.ts` (+ test)

- [x] **Step 1: Write the failing tests**

Create `packages/client/src/app/presenters/__tests__/RfqsPresenter.test.ts`:

```ts
import { firstValueFrom, of, Subject, toArray } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  Direction, RfqState,
  type RfqEvent, type WorkflowPort, type Quote, type Rfq,
} from "@rtc/domain";
import { RfqsPresenter } from "../RfqsPresenter";

const rfq = (id: number): Rfq => ({
  id, instrumentId: 1, quantity: 1_000_000,
  direction: Direction.Buy, state: RfqState.Open, expirySecs: 120,
  creationTimestamp: Date.now(),
});
const quote = (id: number, rfqId: number): Quote => ({
  id, rfqId, dealerId: 1, state: { type: "pendingWithoutPrice" },
});

function port(events: readonly RfqEvent[]): WorkflowPort {
  return {
    events: () => of(...events),
    createRfq: () => of(0),
    cancelRfq: () => of(undefined),
    quote: () => of(undefined),
    pass: () => of(undefined),
    accept: () => of(undefined),
  };
}

describe("RfqsPresenter", () => {
  it("emits arrays of rfqs", async () => {
    const events: RfqEvent[] = [
      { type: "startOfStateOfTheWorld" },
      { type: "rfqCreated", payload: rfq(1) },
      { type: "rfqCreated", payload: rfq(2) },
      { type: "endOfStateOfTheWorld" },
    ];
    const presenter = new RfqsPresenter(port(events));
    const last = await firstValueFrom(presenter.rfqs$.pipe(toArray()));
    expect(last.at(-1)?.map((r) => r.id)).toEqual([1, 2]);
  });

  it("filters quotes per rfqId via quotesForRfq$", async () => {
    const events: RfqEvent[] = [
      { type: "startOfStateOfTheWorld" },
      { type: "quoteCreated", payload: quote(10, 1) },
      { type: "quoteCreated", payload: quote(11, 2) },
      { type: "quoteCreated", payload: quote(12, 1) },
    ];
    const presenter = new RfqsPresenter(port(events));
    const last = await firstValueFrom(presenter.quotesForRfq$(1).pipe(toArray()));
    expect(last.at(-1)?.map((q) => q.id).sort()).toEqual([10, 12]);
  });

  it("createRfq delegates to WorkflowPort.createRfq", async () => {
    let received: unknown;
    const wp: WorkflowPort = {
      ...port([]),
      createRfq: (req) => {
        received = req;
        return of(42);
      },
    };
    const presenter = new RfqsPresenter(wp);
    expect(
      await firstValueFrom(
        presenter.createRfq({
          instrumentId: 1, dealerIds: [1], quantity: 1, direction: Direction.Buy, expirySecs: 120,
        }),
      ),
    ).toBe(42);
    expect(received).toMatchObject({ instrumentId: 1, expirySecs: 120 });
  });

  it("acceptQuote / cancelRfq / passQuote return Observable<void>", async () => {
    const presenter = new RfqsPresenter(port([]));
    expect(await firstValueFrom(presenter.acceptQuote(1))).toBeUndefined();
    expect(await firstValueFrom(presenter.cancelRfq(1))).toBeUndefined();
    expect(await firstValueFrom(presenter.passQuote(1))).toBeUndefined();
  });
});
```

Create `packages/client/src/app/presenters/__tests__/TradeExecutionPresenter.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  type CurrencyPair, Direction, ExecutionStatus, TradeStatus,
  PriceMovementType,
  type ExecutionPort, type Price, type Trade,
} from "@rtc/domain";
import { TradeExecutionPresenter } from "../TradeExecutionPresenter";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD", base: "EUR", terms: "USD",
  ratePrecision: 5, pipsPosition: 4, defaultNotional: 1_000_000,
};

describe("TradeExecutionPresenter", () => {
  it("delegates to ExecuteTradeUseCase", async () => {
    const trade: Trade = {
      tradeId: 1, tradeName: "T1", currencyPair: "EURUSD",
      notional: 1_000_000, dealtCurrency: "EUR", direction: Direction.Buy,
      spotRate: 1.1, status: TradeStatus.Done,
      tradeDate: "2026-05-05", valueDate: "2026-05-07",
    };
    const price: Price = {
      symbol: "EURUSD", mid: 1.1, ask: 1.10010, bid: 1.09990,
      valueDate: "2026-05-07", creationTimestamp: 1,
      movementType: PriceMovementType.NONE, spread: "1.0",
    };
    const port: ExecutionPort = { executeTrade: () => of(trade) };
    const presenter = new TradeExecutionPresenter(port);
    const result = await firstValueFrom(
      presenter.execute({ pair: EURUSD, direction: Direction.Buy, price, notional: 1_000_000 }),
    );
    expect(result.trade.tradeId).toBe(1);
    expect(result.status).toBe(ExecutionStatus.Done);
  });
});
```


Create `packages/client/src/app/presenters/__tests__/RfqQuotePresenter.test.ts`:

```ts
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { PricingPort, RfqQuoteResult } from "@rtc/domain";
import { RfqQuotePresenter } from "../RfqQuotePresenter";

describe("RfqQuotePresenter", () => {
  it("delegates to PricingPort.getRfqQuote", async () => {
    const result: RfqQuoteResult = { bid: 1.099, ask: 1.101, mid: 1.1 };
    let calledWith: { symbol: string; pipsPosition: number } | null = null;
    const port: PricingPort = {
      getPriceUpdates: () => of(),
      getPriceHistory: () => of([]),
      getRfqQuote: (symbol, pipsPosition) => {
        calledWith = { symbol, pipsPosition };
        return of(result);
      },
    };
    const presenter = new RfqQuotePresenter(port);
    expect(await firstValueFrom(presenter.requestQuote("EURUSD", 4))).toBe(result);
    expect(calledWith).toEqual({ symbol: "EURUSD", pipsPosition: 4 });
  });
});
```

- [x] **Step 2: Run — should fail**

Run: `pnpm --filter @rtc/client test -- --run --reporter=verbose presenters/`
Expected: FAIL on three new files.

- [x] **Step 3: Implement the three presenters**

Create `packages/client/src/app/presenters/RfqsPresenter.ts`:

```ts
import {
  distinctUntilChanged, map, type Observable, shareReplay,
} from "rxjs";
import {
  type Quote, type Rfq, type RfqStreamState,
  WorkflowEventStreamUseCase,
  CreateRfqUseCase, type CreateRfqInput,
  type WorkflowPort,
} from "@rtc/domain";

function shallowArrayEquals<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class RfqsPresenter {
  private readonly state$: Observable<RfqStreamState>;
  readonly rfqs$: Observable<readonly Rfq[]>;
  readonly allQuotes$: Observable<ReadonlyMap<number, Quote>>;
  private readonly quotesByRfqCache = new Map<number, Observable<readonly Quote[]>>();

  constructor(private readonly workflow: WorkflowPort) {
    this.state$ = new WorkflowEventStreamUseCase(workflow).execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.rfqs$ = this.state$.pipe(
      map((s) => Array.from(s.rfqs.values())),
      distinctUntilChanged(shallowArrayEquals),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.allQuotes$ = this.state$.pipe(
      map((s) => s.quotes),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  quotesForRfq$(rfqId: number): Observable<readonly Quote[]> {
    const cached = this.quotesByRfqCache.get(rfqId);
    if (cached) return cached;
    const stream = this.state$.pipe(
      map((s) => Array.from(s.quotes.values()).filter((q) => q.rfqId === rfqId)),
      distinctUntilChanged(shallowArrayEquals),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.quotesByRfqCache.set(rfqId, stream);
    return stream;
  }

  createRfq(input: CreateRfqInput): Observable<number> {
    return new CreateRfqUseCase(this.workflow).execute(input);
  }
  acceptQuote(quoteId: number): Observable<void> {
    return this.workflow.accept(quoteId);
  }
  cancelRfq(rfqId: number): Observable<void> {
    return this.workflow.cancelRfq(rfqId);
  }
  passQuote(quoteId: number): Observable<void> {
    return this.workflow.pass(quoteId);
  }
}
```

Create `packages/client/src/app/presenters/TradeExecutionPresenter.ts`:

```ts
import type { Observable } from "rxjs";
import {
  ExecuteTradeUseCase,
  type ExecuteTradeInput, type ExecuteTradeResult,
  type ExecutionPort,
} from "@rtc/domain";

export class TradeExecutionPresenter {
  constructor(private readonly execution: ExecutionPort) {}
  execute(input: ExecuteTradeInput): Observable<ExecuteTradeResult> {
    return new ExecuteTradeUseCase(this.execution).execute(input);
  }
}
```

Create `packages/client/src/app/presenters/RfqQuotePresenter.ts`:

```ts
import type { Observable } from "rxjs";
import {
  RfqQuoteUseCase, type PricingPort, type RfqQuoteResult,
} from "@rtc/domain";

export class RfqQuotePresenter {
  private readonly useCase: RfqQuoteUseCase;
  constructor(pricing: PricingPort) {
    this.useCase = new RfqQuoteUseCase(pricing);
  }
  requestQuote(symbol: string, pipsPosition: number): Observable<RfqQuoteResult> {
    return this.useCase.execute(symbol, pipsPosition);
  }
}
```

- [x] **Step 4: Run — should pass**

Run: `pnpm --filter @rtc/client test`
Expected: tests pass. Note: the `TradeExecutionPresenter` test fixture uses a `Price`-shaped object — the test cast (`as never`) avoids brittle field listing; if that test fails for a missing required `Price` field, fill it in by reading `packages/domain/src/fx/price.ts`. The test target is correct delegation, not exact shape.

- [x] **Step 5: Commit**

```bash
git add packages/client/src/app/presenters/RfqsPresenter.ts packages/client/src/app/presenters/TradeExecutionPresenter.ts packages/client/src/app/presenters/RfqQuotePresenter.ts packages/client/src/app/presenters/__tests__/RfqsPresenter.test.ts packages/client/src/app/presenters/__tests__/TradeExecutionPresenter.test.ts packages/client/src/app/presenters/__tests__/RfqQuotePresenter.test.ts
git commit -m "feat(client): add Rfqs (hybrid) + TradeExecution + RfqQuote presenters

RfqsPresenter has private state\$ + derived rfqs\$, allQuotes\$, quotesForRfq\$
streams. TradeExecution and RfqQuote are command-only — they expose methods
returning one-shot Observables; consumer hooks use firstValueFrom."
```

---

## Task 10: Client — `composition.ts` + `HooksProvider` + wire into `main.tsx` (alongside legacy)

This task brings the new wiring online while leaving `<ServiceProvider>` and `<ConnectionProvider>` in place. After this task, the app has BOTH worlds — components still consume `useServices()` and `useConnection()` for now, while the new `<HooksProvider>` makes `useHooks()` available for the migrations in Tasks 11–14.

The `createApp()` factory needs to populate the `connectionEvents` field of `AppPorts`. In simulator mode it composes a `BrowserConnectionEventsAdapter` with a synthetic `gatewayConnected` startup emission so the state machine reaches `CONNECTED` on first paint (matching today's behaviour, where `ConnectionProvider` initialises with `CONNECTED`). In real-WS mode the same browser adapter is used (no real gateway-event source yet — that's Phase 4+ work).

**Files:**
- Create: `packages/client/src/app/composition.ts`
- Create: `packages/client/src/app/HooksProvider.tsx`
- Modify: `packages/client/src/main.tsx`

- [x] **Step 1: Implement `HooksProvider.tsx`**

Create `packages/client/src/app/HooksProvider.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { AppHooks } from "./composition";

const HooksContext = createContext<AppHooks | null>(null);

export function HooksProvider({
  hooks,
  children,
}: {
  hooks: AppHooks;
  children: ReactNode;
}) {
  return <HooksContext.Provider value={hooks}>{children}</HooksContext.Provider>;
}

export function useHooks(): AppHooks {
  const ctx = useContext(HooksContext);
  if (!ctx) throw new Error("useHooks must be used within HooksProvider");
  return ctx;
}
```

- [x] **Step 2: Implement `composition.ts`**

Create `packages/client/src/app/composition.ts`:

```ts
import { useCallback } from "react";
import { bind } from "@react-rxjs/core";
import { merge, of, type Observable } from "rxjs";
import {
  ConnectionStatus,
  type ConnectionEvent,
  type ConnectionEventsPort,
  type CurrencyPair, type Price, type PriceTick, type Trade,
  type Rfq, type Quote, type PositionUpdates,
  type Instrument, type Dealer,
  type ExecuteTradeInput, type ExecuteTradeResult, type CreateRfqInput,
  type RfqQuoteResult,
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
import { BrowserConnectionEventsAdapter } from "./adapters/BrowserConnectionEventsAdapter";
import {
  createSimulatorPorts,
  createWsRealPorts,
  type AppPorts,
} from "./adapters/portFactory";

export type { AppPorts };

export interface AppHooks {
  // Streams
  usePrice: (pair: CurrencyPair) => Price | null;
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
  // Commands (one-shot Observables; callers use firstValueFrom)
  useExecuteTrade: () => (input: ExecuteTradeInput) => Observable<ExecuteTradeResult>;
  useCreateRfq: () => (input: CreateRfqInput) => Observable<number>;
  useAcceptQuote: () => (quoteId: number) => Observable<void>;
  useCancelRfq: () => (rfqId: number) => Observable<void>;
  usePassQuote: () => (quoteId: number) => Observable<void>;
  useRequestRfqQuote: () => (symbol: string, pipsPosition: number) => Observable<RfqQuoteResult>;
}

/**
 * Wraps the BrowserConnectionEventsAdapter with a synthetic startup
 * `gatewayConnected` event so the state machine reaches CONNECTED
 * during application boot. In future phases a real gateway adapter
 * will replace this synthetic emission.
 */
function withSyntheticGatewayConnected(
  inner: ConnectionEventsPort,
): ConnectionEventsPort {
  return {
    events(): Observable<ConnectionEvent> {
      return merge(of<ConnectionEvent>({ type: "gatewayConnected" }), inner.events());
    },
  };
}

export function buildDefaultPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const transport = url ? createWsRealPorts(new WsAdapter(url)) : createSimulatorPorts();
  return {
    ...transport,
    connectionEvents: withSyntheticGatewayConnected(new BrowserConnectionEventsAdapter()),
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

  const [usePrice] = bind(
    (pair: CurrencyPair) => presenters.priceStream.price$(pair),
    null,
  );
  const [usePriceHistory] = bind(
    (symbol: string) => presenters.priceHistory.history$(symbol),
    [] as readonly PriceTick[],
  );
  const [useTrades] = bind(presenters.blotter.trades$, [] as readonly Trade[]);
  const [useAnalytics] = bind(presenters.analytics.position$, null as PositionUpdates | null);
  const [useRfqs] = bind(presenters.rfqs.rfqs$, [] as readonly Rfq[]);
  const [useQuotesForRfq] = bind(
    (rfqId: number) => presenters.rfqs.quotesForRfq$(rfqId),
    [] as readonly Quote[],
  );
  const [useAllQuotes] = bind(
    presenters.rfqs.allQuotes$,
    new Map() as ReadonlyMap<number, Quote>,
  );
  const [useCurrencyPairs] = bind(
    presenters.currencyPairs.pairs$,
    [] as readonly CurrencyPair[],
  );
  const [useInstruments] = bind(
    presenters.instruments.list$,
    [] as readonly Instrument[],
  );
  const [useDealers] = bind(presenters.dealers.list$, [] as readonly Dealer[]);
  const [useConnectionStatus] = bind(
    presenters.connection.status$,
    ConnectionStatus.CONNECTING,
  );

  return {
    usePrice,
    usePriceHistory,
    useTrades,
    useAnalytics,
    useRfqs,
    useQuotesForRfq,
    useAllQuotes,
    useCurrencyPairs,
    useInstruments,
    useDealers,
    useConnectionStatus,
    useExecuteTrade: () => useCallback((input) => presenters.execution.execute(input), []),
    useCreateRfq: () => useCallback((input) => presenters.rfqs.createRfq(input), []),
    useAcceptQuote: () => useCallback((quoteId) => presenters.rfqs.acceptQuote(quoteId), []),
    useCancelRfq: () => useCallback((rfqId) => presenters.rfqs.cancelRfq(rfqId), []),
    usePassQuote: () => useCallback((quoteId) => presenters.rfqs.passQuote(quoteId), []),
    useRequestRfqQuote: () =>
      useCallback((symbol, pipsPosition) => presenters.rfqQuote.requestQuote(symbol, pipsPosition), []),
  };
}
```

- [x] **Step 3: Wire into `main.tsx`**

Open `packages/client/src/main.tsx`. After the existing imports add:

```tsx
import { createApp } from "./app/composition";
import { HooksProvider } from "./app/HooksProvider";
```

Then add (above the `createRoot` call):

```tsx
const hooks = createApp();
```

And wrap the existing tree so `<HooksProvider>` is OUTSIDE both legacy providers (so during the migration window, both worlds work — legacy reads from `ServiceProvider`, new reads from `HooksProvider`):

```tsx
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <HooksProvider hooks={hooks}>
        <ServiceProvider>
          <ConnectionProvider>
            <App />
          </ConnectionProvider>
        </ServiceProvider>
      </HooksProvider>
    </ThemeProvider>
  </StrictMode>,
);
```

- [x] **Step 4: Typecheck the client**

Run: `pnpm --filter @rtc/client typecheck`
Expected: pass.

- [x] **Step 5: Build the client**

Run: `pnpm --filter @rtc/client build`
Expected: build succeeds.

- [x] **Step 6: Smoke test in dev mode**

Run: `pnpm --filter @rtc/client dev` (background, then visit http://localhost:5173 in a browser; or skip the browser visit if pure subagent execution).

If running with a real browser: confirm the app loads, FX tiles render, trade flows still work. Both providers are coexisting; nothing should regress.

Stop the dev server.

- [x] **Step 7: Run the full unit suite + e2e**

Run: `pnpm test && pnpm test:e2e`
Expected: 109 unit tests + 40 e2e all pass (the new presenters/use cases bring unit count to ~125 — verify roughly).

- [x] **Step 8: Commit**

```bash
git add packages/client/src/app/composition.ts packages/client/src/app/HooksProvider.tsx packages/client/src/main.tsx
git commit -m "feat(client): wire HooksProvider into main.tsx alongside legacy providers

createApp() builds the full presenter tree and binds each stream via
react-rxjs. HooksProvider is rendered outside ServiceProvider so consumers
can migrate hook-by-hook in subsequent tasks. Both worlds coexist."
```

---

## Task 11: Migration — FX area

Three pass-through hooks deleted (`usePriceStream`, `usePriceHistory`, `useCurrencyPairs`); two adapter hooks rebased (`useExecuteTrade`, `useRfqQuote`); one stale-detection hook updated to take a reference + use `useConnectionStatus`. Two consumer files updated (`Tile.tsx`, `LiveRatesPanel.tsx`).

The kept hooks (`useExecuteTrade`, `useRfqQuote`) keep the same exported shape so consumer call-sites in `Tile.tsx` don't change.

**Files:**
- Modify: `packages/client/src/fx/hooks/useExecuteTrade.ts`
- Modify: `packages/client/src/fx/hooks/useRfqQuote.ts`
- Modify: `packages/client/src/stale/useStaleDetection.ts`
- Modify: `packages/client/src/fx/liveRates/LiveRatesPanel.tsx`
- Modify: `packages/client/src/fx/liveRates/tile/Tile.tsx`
- Delete: `packages/client/src/fx/hooks/usePriceStream.ts`
- Delete: `packages/client/src/fx/hooks/usePriceHistory.ts`
- Delete: `packages/client/src/fx/hooks/useCurrencyPairs.ts`

- [x] **Step 1: Rebase `useExecuteTrade` on `useHooks`**

Replace the body of `packages/client/src/fx/hooks/useExecuteTrade.ts` with:

```ts
import { useCallback } from "react";
import { firstValueFrom } from "rxjs";
import {
  type CurrencyPair, type Price, Direction, ExecutionStatus,
} from "@rtc/domain";
import { useHooks } from "../../app/HooksProvider";
import type { UseTileStateResult } from "./useTileState";

export function useExecuteTrade(
  pair: CurrencyPair,
  tileState: UseTileStateResult,
) {
  const execute = useHooks().useExecuteTrade();

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

- [x] **Step 2: Rebase `useRfqQuote` on `useHooks` (drop the imperative delay)**

Replace the body of `packages/client/src/fx/hooks/useRfqQuote.ts` with:

```ts
import { useCallback } from "react";
import { firstValueFrom } from "rxjs";
import type { CurrencyPair } from "@rtc/domain";
import { useHooks } from "../../app/HooksProvider";
import type { UseRfqStateResult, RfqQuote } from "./useRfqState";

const RFQ_TIMEOUT_MS = 10_000;

export function useRfqQuote(
  pair: CurrencyPair,
  rfqState: UseRfqStateResult,
) {
  const requestQuote = useHooks().useRequestRfqQuote();

  return useCallback(async () => {
    rfqState.initiate();
    try {
      const result = await firstValueFrom(requestQuote(pair.symbol, pair.pipsPosition));
      const quote: RfqQuote = {
        bid: result.bid,
        ask: result.ask,
        timeoutMs: RFQ_TIMEOUT_MS,
      };
      rfqState.receiveQuote(quote);
    } catch {
      rfqState.reject();
    }
  }, [pair, requestQuote, rfqState]);
}
```

Note: `useRfqState` exposes `initiate()` / `receiveQuote(quote)` / `reject()` — those are the actual method names in `useRfqState.ts`. (Spec section 5 used `requested()/received()/rejected()` — that's wrong; we use the real names.)

The hook no longer does a `setTimeout` — the simulator emits after its own delay (Task 2).

- [x] **Step 3: Update `useStaleDetection` to take a value reference**

Replace `packages/client/src/stale/useStaleDetection.ts` with:

```ts
import { useEffect, useRef, useState } from "react";
import { ConnectionStatus } from "@rtc/domain";
import { useHooks } from "../app/HooksProvider";

/**
 * Returns true when a data stream should be considered stale.
 *
 * A stream is stale when the connection was lost and reconnected
 * but the stream has not yet emitted a new reference. The caller
 * passes the latest value (any reference); a change indicates new
 * data, which clears the stale flag.
 */
export function useStaleDetection(value: unknown): boolean {
  const { useConnectionStatus } = useHooks();
  const status = useConnectionStatus();
  const [stale, setStale] = useState(false);
  const wasDisconnectedRef = useRef(false);
  const valueAtReconnectRef = useRef(value);

  useEffect(() => {
    if (status !== ConnectionStatus.CONNECTED) {
      wasDisconnectedRef.current = true;
    } else if (wasDisconnectedRef.current) {
      valueAtReconnectRef.current = value;
      setStale(true);
      wasDisconnectedRef.current = false;
    }
  }, [status, value]);

  useEffect(() => {
    if (stale && value !== valueAtReconnectRef.current) {
      setStale(false);
    }
  }, [stale, value]);

  return stale;
}
```

- [x] **Step 4: Update `LiveRatesPanel.tsx`**

Open `packages/client/src/fx/liveRates/LiveRatesPanel.tsx`. Find the `useCurrencyPairs` import line and replace with:

```tsx
import { useHooks } from "../../app/HooksProvider";
```

Then change the call site:

```tsx
const { useCurrencyPairs } = useHooks();
const pairs = useCurrencyPairs();
```

(Replaces `const pairs = useCurrencyPairs();` from the deleted hook import.)

- [x] **Step 5: Update `Tile.tsx`**

Open `packages/client/src/fx/liveRates/tile/Tile.tsx`. Replace the imports for `usePriceStream` and `usePriceHistory` with the consolidated `useHooks` import, and update the call sites. Specifically:

Remove these two lines:
```tsx
import { usePriceStream } from "../../hooks/usePriceStream";
import { usePriceHistory } from "../../hooks/usePriceHistory";
```

Add:
```tsx
import { useHooks } from "../../../app/HooksProvider";
```

Replace the body lines:
```tsx
const { price, version: priceVersion } = usePriceStream(pair);
const stale = useStaleDetection(priceVersion);
const history = usePriceHistory(pair.symbol);
```
with:
```tsx
const { usePrice, usePriceHistory } = useHooks();
const price = usePrice(pair);
const stale = useStaleDetection(price);
const history = usePriceHistory(pair.symbol);
```

(`useExecuteTrade` and `useRfqQuote` imports stay where they are — they're now thin adapters over `useHooks` internally; consumer signature unchanged.)

The spec's drop-the-`version` decision is now realised: `usePrice` returns `Price | null`. `Tile.tsx` consumers that reference `price.bid` etc. need a null check; it likely already exists (component skeleton renders nothing while price is null). Confirm by reading Tile.tsx — if it currently does `price?.bid`, no change needed; if it does `price.bid` unconditionally and was relying on `usePriceStream` returning `{price: null, version: 0}` to gate render with `if (!price) return null;`, ensure the same gate is in place after the change.

- [x] **Step 6: Delete the three pass-through hooks**

Run:

```bash
rm /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/fx/hooks/usePriceStream.ts \
   /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/fx/hooks/usePriceHistory.ts \
   /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/fx/hooks/useCurrencyPairs.ts
```

- [x] **Step 7: Typecheck — verify no stale references**

Run: `pnpm --filter @rtc/client typecheck`
Expected: pass. If there are unresolved imports in `Tile.tsx` or other FX files, fix them now.

- [x] **Step 8: E2E for the FX area**

Run: `pnpm --filter @rtc/client test:e2e -- fx-trading.spec.ts` (or whatever the actual FX e2e file name is — `ls packages/client/tests/` to confirm).

Expected: all FX-related e2e tests pass. (If your e2e files cover full-app smoke without per-area filtering, `pnpm test:e2e` is fine — but it'll re-test other areas not yet migrated, which may take longer.)

- [x] **Step 9: Run unit tests**

Run: `pnpm test`
Expected: 109 + ~16 new = ~125 unit tests pass.

- [x] **Step 10: Commit**

```bash
git add packages/client/src/fx/hooks/useExecuteTrade.ts packages/client/src/fx/hooks/useRfqQuote.ts packages/client/src/stale/useStaleDetection.ts packages/client/src/fx/liveRates/LiveRatesPanel.tsx packages/client/src/fx/liveRates/tile/Tile.tsx
git rm packages/client/src/fx/hooks/usePriceStream.ts packages/client/src/fx/hooks/usePriceHistory.ts packages/client/src/fx/hooks/useCurrencyPairs.ts
git commit -m "refactor(client): migrate FX area to useHooks (delete 3 pass-through hooks)

usePriceStream, usePriceHistory, useCurrencyPairs deleted; consumers in
Tile and LiveRatesPanel rebased on useHooks(). useExecuteTrade and
useRfqQuote remain as thin adapters fusing the bound hook with their
state machines. useStaleDetection now takes a value reference (not a
version counter) and uses useHooks().useConnectionStatus()."
```

---

## Task 12: Migration — Credit area

Four hooks deleted; four components updated (`RfqTilesPanel`, `NewRfqForm`, `CreditBlotter`, `SellSidePanel`). The `useRfqStream` consumers split their single destructure into the new narrower hooks (`useRfqs`, `useQuotesForRfq`, `useAllQuotes`).

**Files:**
- Modify: `packages/client/src/credit/rfqTiles/RfqTilesPanel.tsx`
- Modify: `packages/client/src/credit/newRfq/NewRfqForm.tsx`
- Modify: `packages/client/src/credit/blotter/CreditBlotter.tsx`
- Modify: `packages/client/src/credit/sellSide/SellSidePanel.tsx`
- Delete: `packages/client/src/credit/hooks/useInstruments.ts`
- Delete: `packages/client/src/credit/hooks/useDealers.ts`
- Delete: `packages/client/src/credit/hooks/useRfqStream.ts`
- Delete: `packages/client/src/credit/hooks/useCreateRfq.ts`

- [x] **Step 1: Update `RfqTilesPanel.tsx`**

Open `packages/client/src/credit/rfqTiles/RfqTilesPanel.tsx`. Replace the four hook imports with one:

```tsx
import { useHooks } from "../../app/HooksProvider";
```

Replace the destructure block:
```tsx
const { rfqs, getQuotesForRfq } = useRfqStream();
const instruments = useInstruments();
const dealers = useDealers();
```
with:
```tsx
const { useRfqs, useQuotesForRfq, useInstruments, useDealers } = useHooks();
const rfqs = useRfqs();
const instruments = useInstruments();
const dealers = useDealers();
```

Then in the row that uses `getQuotesForRfq(rfq.id)`, replace with `useQuotesForRfq(rfq.id)`. NOTE: hooks must be at the top level of a component, not inside a `.map(rfq => ...)`. If that callback is in a render scope, extract a small `<RfqTileRow rfq={rfq} />` subcomponent so each row calls `useQuotesForRfq(rfq.id)` at its own top level. Pattern:

```tsx
function RfqTileRow({ rfq }: { rfq: Rfq }) {
  const { useQuotesForRfq } = useHooks();
  const quotes = useQuotesForRfq(rfq.id);
  // ... existing per-row JSX ...
}
```

If `RfqTilesPanel` previously had inline render logic for each rfq, lift that JSX into the new `RfqTileRow` component within the same file.

- [x] **Step 2: Update `NewRfqForm.tsx`**

Open `packages/client/src/credit/newRfq/NewRfqForm.tsx`. Replace the three hook imports with `useHooks`:

```tsx
import { useHooks } from "../../app/HooksProvider";
import { firstValueFrom } from "rxjs";
```

Replace destructure:
```tsx
const instruments = useInstruments();
const dealers = useDealers();
const createRfq = useCreateRfq();
```
with:
```tsx
const { useInstruments, useDealers, useCreateRfq } = useHooks();
const instruments = useInstruments();
const dealers = useDealers();
const createRfqStream = useCreateRfq();
```

Find the call site that previously did `await createRfq(params)` (or treated it as a Promise). Replace with `await firstValueFrom(createRfqStream(params))`.

If the old `useCreateRfq` returned `Promise<number>` and consumers stored the result, the new path returns the same `number`. The `params` shape was `CreateRfqParams = { instrumentId, dealerIds, quantity, direction }` — without `expirySecs`. The new domain `CreateRfqInput` requires `expirySecs` (look at `CreateRfqUseCase.ts` to confirm). If the old hook injected `RFQ_DEFAULT_EXPIRY_SECS`, do the same here:

```ts
const id = await firstValueFrom(
  createRfqStream({ ...params, expirySecs: RFQ_DEFAULT_EXPIRY_SECS }),
);
```

(Import `RFQ_DEFAULT_EXPIRY_SECS` from `@rtc/domain`.)

- [x] **Step 3: Update `CreditBlotter.tsx`**

Open `packages/client/src/credit/blotter/CreditBlotter.tsx`. Replace the three hook imports with `useHooks`:

```tsx
import { useHooks } from "../../app/HooksProvider";
```

Replace:
```tsx
const { rfqs, allQuotes } = useRfqStream();
const instruments = useInstruments();
const dealers = useDealers();
```
with:
```tsx
const { useRfqs, useAllQuotes, useInstruments, useDealers } = useHooks();
const rfqs = useRfqs();
const allQuotes = useAllQuotes();
const instruments = useInstruments();
const dealers = useDealers();
```

- [x] **Step 4: Update `SellSidePanel.tsx`**

Open `packages/client/src/credit/sellSide/SellSidePanel.tsx`. Same pattern as `RfqTilesPanel`:

```tsx
import { useHooks } from "../../app/HooksProvider";
// ...
const { useRfqs, useQuotesForRfq, useInstruments, useDealers } = useHooks();
const rfqs = useRfqs();
const instruments = useInstruments();
const dealers = useDealers();
```

If per-rfq quote rendering happens inside `.map(rfq => ...)`, lift to a `SellSideRfqRow` subcomponent that calls `useQuotesForRfq(rfq.id)`.

The SellSidePanel also uses `WorkflowPort` commands directly (likely `quote`, `pass` via `useServices().workflow`). Find those calls. Replace via `useHooks()`:

```tsx
const { useQuoteRfq, usePassQuote } = useHooks();
```

But wait — there's no `useQuoteRfq` in `AppHooks`. The `quote` command on `WorkflowPort` lets a sell-side dealer respond to an RFQ with a price. This is a missing presenter method.

If `SellSidePanel` calls `workflow.quote(...)` or similar, add to `RfqsPresenter`:

```ts
quoteRfq(request: QuoteRequest): Observable<void> {
  return this.workflow.quote(request);
}
```

And to `AppHooks`:

```ts
useQuoteRfq: () => (request: QuoteRequest) => Observable<void>;
```

And to the `createApp` callback:

```ts
useQuoteRfq: () => useCallback((req) => presenters.rfqs.quoteRfq(req), []),
```

Plus `import type { QuoteRequest } from "@rtc/domain";` at the top of `composition.ts`.

(If `SellSidePanel` doesn't actually use `quote` and you just need `pass`, skip the `useQuoteRfq` addition. Read the file first to know which workflow commands it issues.)

- [x] **Step 5: Delete the four pass-through hooks**

Run:

```bash
rm /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/credit/hooks/useInstruments.ts \
   /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/credit/hooks/useDealers.ts \
   /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/credit/hooks/useRfqStream.ts \
   /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/credit/hooks/useCreateRfq.ts
```

- [x] **Step 6: Typecheck**

Run: `pnpm --filter @rtc/client typecheck`
Expected: pass. Fix any unresolved imports.

- [x] **Step 7: E2E for credit**

Run: `pnpm --filter @rtc/client test:e2e -- credit-rfq.spec.ts` (or the actual e2e filename — the credit RFQ flow is the most invasive component change in Phase 3, so this is the highest-risk step).

Expected: all credit e2e tests pass. If any fail, the most likely cause is the per-row `useQuotesForRfq(rfq.id)` extraction not being applied where it needed to be.

- [x] **Step 8: Unit tests**

Run: `pnpm test`
Expected: count unchanged from Task 11 (no new tests; only deletions and rewires).

- [x] **Step 9: Commit**

```bash
git add packages/client/src/credit/rfqTiles/RfqTilesPanel.tsx packages/client/src/credit/newRfq/NewRfqForm.tsx packages/client/src/credit/blotter/CreditBlotter.tsx packages/client/src/credit/sellSide/SellSidePanel.tsx
git rm packages/client/src/credit/hooks/useInstruments.ts packages/client/src/credit/hooks/useDealers.ts packages/client/src/credit/hooks/useRfqStream.ts packages/client/src/credit/hooks/useCreateRfq.ts
# If composition.ts gained useQuoteRfq:
git add packages/client/src/app/composition.ts packages/client/src/app/presenters/RfqsPresenter.ts
git commit -m "refactor(client): migrate credit area to useHooks (delete 4 pass-through hooks)

useInstruments, useDealers, useRfqStream, useCreateRfq deleted; consumers
in RfqTilesPanel, NewRfqForm, CreditBlotter, SellSidePanel rebased on
useHooks(). Per-rfq quote streams use useQuotesForRfq inside extracted
row subcomponents so each row only re-renders on its own quote changes."
```

---

## Task 13: Migration — Blotter + Analytics

Two pass-through hooks deleted; two consumer components updated. `AnalyticsPanel` drops its `version` counter and passes the `data` reference into `useStaleDetection`.

**Files:**
- Modify: `packages/client/src/blotter/FxBlotter.tsx`
- Modify: `packages/client/src/analytics/AnalyticsPanel.tsx`
- Delete: `packages/client/src/blotter/hooks/useTradeStream.ts`
- Delete: `packages/client/src/analytics/hooks/useAnalytics.ts`

- [x] **Step 1: Update `FxBlotter.tsx`**

Open `packages/client/src/blotter/FxBlotter.tsx`. Replace the `useTradeStream` import with `useHooks`:

```tsx
import { useHooks } from "../app/HooksProvider";
```

Replace the call:
```tsx
const trades = useTradeStream();
```
with:
```tsx
const { useTrades } = useHooks();
const trades = useTrades();
```

- [x] **Step 2: Update `AnalyticsPanel.tsx`**

Open `packages/client/src/analytics/AnalyticsPanel.tsx`. Replace the `useAnalytics` import:

```tsx
import { useHooks } from "../app/HooksProvider";
```

Replace:
```tsx
const { data, version } = useAnalytics();
const stale = useStaleDetection(version);
```
with:
```tsx
const { useAnalytics } = useHooks();
const data = useAnalytics();
const stale = useStaleDetection(data);
```

(`data` is `PositionUpdates | null`. Each emission produces a new reference, so `useStaleDetection` will see a change and clear stale.)

- [x] **Step 3: Delete the two pass-through hooks**

Run:

```bash
rm /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/blotter/hooks/useTradeStream.ts \
   /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/analytics/hooks/useAnalytics.ts
```

- [x] **Step 4: Typecheck + tests**

Run: `pnpm --filter @rtc/client typecheck && pnpm test`
Expected: both green.

- [x] **Step 5: E2E**

Run: `pnpm test:e2e`
Expected: all 40 e2e tests pass.

- [x] **Step 6: Commit**

```bash
git add packages/client/src/blotter/FxBlotter.tsx packages/client/src/analytics/AnalyticsPanel.tsx
git rm packages/client/src/blotter/hooks/useTradeStream.ts packages/client/src/analytics/hooks/useAnalytics.ts
git commit -m "refactor(client): migrate Blotter + Analytics to useHooks

AnalyticsPanel drops its version counter; useStaleDetection now compares
the data reference itself (each emit produces a new reference)."
```

---

## Task 14: Migration — Connection + final cleanup + docs

The last migration retires `<ServiceProvider>` and `<ConnectionProvider>`, the `services/` and `connection/{ConnectionProvider,useConnection}` files, then runs a final verification and updates `STATUS.md`.

**Files:**
- Modify: `packages/client/src/connection/ConnectionOverlay.tsx`
- Modify: `packages/client/src/connection/ConnectionStatusBar.tsx`
- Modify: `packages/client/src/main.tsx`
- Modify: `packages/client/src/app/adapters/portFactory.ts` (inline `createRealServices`)
- Delete: `packages/client/src/services/ServiceProvider.tsx`
- Delete: `packages/client/src/services/mockServiceFactory.ts`
- Delete: `packages/client/src/services/realServiceFactory.ts`
- Delete: `packages/client/src/services/WsAdapter.ts`
- Delete: `packages/client/src/services/` (the empty directory)
- Delete: `packages/client/src/connection/ConnectionProvider.tsx`
- Delete: `packages/client/src/connection/useConnection.ts`
- Modify: `docs/superpowers/STATUS.md`

- [x] **Step 1: Update `ConnectionOverlay.tsx`**

Open `packages/client/src/connection/ConnectionOverlay.tsx`. Replace the `useConnection` import with `useHooks`:

```tsx
import { useHooks } from "../app/HooksProvider";
```

Replace:
```tsx
const status = useConnection();
```
with:
```tsx
const { useConnectionStatus } = useHooks();
const status = useConnectionStatus();
```

- [x] **Step 2: Update `ConnectionStatusBar.tsx`**

Same pattern:

```tsx
import { useHooks } from "../app/HooksProvider";
// ...
const { useConnectionStatus } = useHooks();
const status = useConnectionStatus();
```

- [x] **Step 3: Inline `createRealServices` into `portFactory.ts`**

The temporary indirection from Task 5 — `createWsRealPorts` calling `createRealServices` from the legacy file — needs to go before we can delete `services/`.

Mechanical procedure (no semantic change to the runtime behaviour — bodies are copied verbatim):

1. Read `packages/client/src/services/realServiceFactory.ts` start to finish. The relevant block is everything from the `CLIENT_MSG` constant declaration (around line 41) through the end of `function createWorkflowPort` (around line 470). Note that the file's existing `import type { Services }` and `export function createRealServices` are NOT copied — they're replaced by the existing `portFactory.ts`'s `TransportPorts` type and a new `createWsRealPorts` factory.

2. Open `packages/client/src/app/adapters/portFactory.ts`. Locate the existing trailing block:

   ```ts
   import { createRealServices } from "../../services/realServiceFactory";
   import { WsAdapter } from "./WsAdapter";

   export function createWsRealPorts(ws: WsAdapter): TransportPorts {
     return createRealServices(ws);
   }

   export { WsAdapter };
   ```

   Delete the `import { createRealServices } from "../../services/realServiceFactory";` line and the body of `createWsRealPorts`. Keep `import { WsAdapter } from "./WsAdapter";` and `export { WsAdapter };`.

3. At the spot where the deleted shim was, paste the verbatim block from `realServiceFactory.ts` (the two `*_MSG` constants, the eight private `createXxxPort` factories, all unchanged). Above those, add (or merge into existing imports) these `@rtc/shared` and `@rtc/domain` symbols that the copied bodies reference: `ReferenceDataMessage, PriceTickDto, BlotterMessage, AnalyticsDto, ExecutionRequestDto, ExecutionResponseDto, InstrumentEvent, DealerEvent, WorkflowEvent, RpcResponse, PriceHistoryDto` from `@rtc/shared`; `Observable` from `rxjs`; `deriveBaseTerm` from `@rtc/domain`; and these type-only imports from `@rtc/domain`: `PriceTick, Trade, PositionUpdates, Instrument, Dealer, RfqEvent, CreateRfqRequest, QuoteRequest`. (`CurrencyPair`, `RfqQuoteResult`, and the eight port interface names are already imported by `portFactory.ts`'s top-of-file block.)

4. Replace the deleted shim's body with a new `createWsRealPorts` returning the eight ports:

   ```ts
   export function createWsRealPorts(ws: WsAdapter): TransportPorts {
     return {
       referenceData: createReferenceDataPort(ws),
       pricing: createPricingPort(ws),
       execution: createExecutionPort(ws),
       blotter: createBlotterPort(ws),
       analytics: createAnalyticsPort(ws),
       instruments: createInstrumentPort(ws),
       dealers: createDealerPort(ws),
       workflow: createWorkflowPort(ws),
     };
   }
   ```

5. Run `pnpm --filter @rtc/client typecheck` — it must pass before proceeding to Step 4. If a type-only import is missing, the error message names the missing identifier; add it to the `@rtc/domain` or `@rtc/shared` import block.

The "verbatim" rule is strict: do not refactor the eight `createXxxPort` bodies even if they look repetitive. Drift between the inlined version and the legacy version (which is about to be deleted) introduces wire-format risk.

- [x] **Step 4: Strip the legacy providers from `main.tsx`**

Open `packages/client/src/main.tsx`. Remove these imports:

```tsx
import { ServiceProvider } from "./services/ServiceProvider";
import { ConnectionProvider } from "./connection/ConnectionProvider";
```

Update the render tree to drop the two legacy providers:

```tsx
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <HooksProvider hooks={hooks}>
        <App />
      </HooksProvider>
    </ThemeProvider>
  </StrictMode>,
);
```

- [x] **Step 5: Delete the legacy files + directory**

Run:

```bash
rm /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/services/ServiceProvider.tsx \
   /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/services/mockServiceFactory.ts \
   /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/services/realServiceFactory.ts \
   /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/services/WsAdapter.ts && \
rmdir /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/services && \
rm /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/connection/ConnectionProvider.tsx \
   /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/client/src/connection/useConnection.ts
```

- [x] **Step 6: Verify zero references remain**

Run all four:

```bash
grep -rn "useServices\|ServiceProvider" packages/client/src
grep -rn "ConnectionContext\|ConnectionProvider" packages/client/src
grep -rn "from \"\\.\\./services" packages/client/src
grep -rn "from \"\\.\\./\\.\\./services" packages/client/src
```

Expected: no output for any of the four (or only matches in `app/HooksProvider.tsx` for the literal substring `Provider` — that's fine, it's not the legacy `ServiceProvider`).

- [x] **Step 7: Full unit + e2e + typecheck + build**

Run: `pnpm clean && pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: all green. Domain ~119 tests, client ~28 new presenter tests, server 5 = ~152 unit total. E2E: 40.

- [x] **Step 8: Smoke test in dev mode**

Run: `pnpm --filter @rtc/client dev` (background).

Visit the app in a browser if available. Confirm:
- FX tiles render and stream prices.
- A trade execution completes and shows a confirmation.
- An RFQ quote-request returns a quote after ~1 second.
- The credit blotter shows RFQ events.
- Disconnecting Wi-Fi (or `window.dispatchEvent(new Event('offline'))` in the console) shows the offline overlay; reconnecting restores the app.
- After 15 minutes idle (or trigger via dev tools), the idle overlay appears.

Stop the dev server.

- [x] **Step 9: Update `docs/superpowers/STATUS.md`**

Open `docs/superpowers/STATUS.md`. In the Phases table, change Phase 3's status from `⏳ NOT STARTED` to `✅ DONE`. Set the Plan column to `plans/2026-05-05-phase-3-presenters-react-rxjs-composition-root.md`. Set the Commits column to the SHA range produced by this work (run `git log --oneline | head -20` and pick the first and last Phase-3 SHAs).

Update the **Last updated** line to today's date.

Update the **Current state / Test counts** line to the actual final numbers (from Step 7).

Add a brief "Phase 3 lessons" subsection if any non-trivial corrections came up during execution (modelled on the existing "Phase 2 lessons" section).

- [x] **Step 10: Final commit**

```bash
git add packages/client/src/connection/ConnectionOverlay.tsx packages/client/src/connection/ConnectionStatusBar.tsx packages/client/src/app/adapters/portFactory.ts packages/client/src/main.tsx docs/superpowers/STATUS.md
git rm packages/client/src/services/ServiceProvider.tsx packages/client/src/services/mockServiceFactory.ts packages/client/src/services/realServiceFactory.ts packages/client/src/services/WsAdapter.ts packages/client/src/connection/ConnectionProvider.tsx packages/client/src/connection/useConnection.ts
git commit -m "refactor(client): retire ServiceProvider + ConnectionProvider — Phase 3 done

Connection overlay and status bar consume useHooks().useConnectionStatus().
The legacy services/ directory and connection providers are deleted; the
real-WS factory body is inlined into app/adapters/portFactory.ts.

Phase 3 complete. Single source of dependency wiring is now createApp() at
the application root; UI components consume only useHooks()."
```

---

## Verification Checklist (after Task 14)

- [x] `git status` clean (apart from `.claude/settings.local.json`).
- [x] `pnpm clean && pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e` all pass.
- [x] `grep -rn "useServices\|ServiceProvider" packages/client/src` returns nothing.
- [x] `grep -rn "ConnectionContext\|ConnectionProvider" packages/client/src` returns nothing.
- [x] `grep -rn "from \"\\.\\./services" packages/client/src` returns nothing.
- [x] `packages/client/src/services/` directory does not exist.
- [x] `STATUS.md` Phase 3 row marked `✅ DONE`.
- [x] All 14 task checkboxes ticked.

---

## Risks + Mitigations

- **react-rxjs ↔ React 19 peer-dep mismatch (Task 1):** `@react-rxjs/core` declares `react@>=16` peer, so React 19 satisfies. If pnpm errors, add an `pnpm.peerDependencyRules.allowedVersions` entry rather than `--no-strict-peer-deps`.
- **Hook lifting under per-row rendering (Tasks 12 + step 1 of Task 12):** `useQuotesForRfq(rfq.id)` cannot be called inside a `.map(...)` callback. The plan extracts a `RfqTileRow` / `SellSideRfqRow` subcomponent. If a reviewer sees inline calls, that's a regression.
- **`ConnectionStatus` initial value mismatch (Task 10):** The legacy `ConnectionProvider` initialised with `CONNECTED`. The new `ConnectionStatusUseCase` initialises with `CONNECTING` and the synthetic `gatewayConnected` event flips it to `CONNECTED`. Should be invisible to users (the transition happens before paint), but if the overlay flickers, switch the `bind` default in `composition.ts` from `CONNECTING` to `CONNECTED`.
- **`createRealServices` body verbatim copy (Task 14 step 3):** Don't paraphrase — copy verbatim from `services/realServiceFactory.ts` lines 39–469 to avoid wire-format drift. The five RPC adapter blocks are repetitive; fight the urge to refactor them in this task.
- **Test-count drift:** The plan states approximate counts. Actual counts after each task may differ by ±2 — that's fine. The hard requirement is "no test failures", not "exact count".

