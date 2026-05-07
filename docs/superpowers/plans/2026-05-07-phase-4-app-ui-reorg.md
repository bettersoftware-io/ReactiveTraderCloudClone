# Phase 4 — `app/` + `ui/` Reorganisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `packages/client/src/` into a React-free `app/` layer (composition root, presenters, adapters) and a React `ui/` layer grouped by trading domain (fx, credit, shell, admin), per spec `2026-05-07-phase-4-app-ui-reorg-design.md`.

**Architecture:** The reorg ships in two phases. Phase 4a splits the react-rxjs bridge out of `app/` into a new `ui/hooks/` directory so `app/` becomes strictly React-free. Phase 4b moves UI feature directories under `ui/` grouped by trading domain. Each task is a single commit that compiles, typechecks, and passes the existing 141 unit + 40 e2e suite.

**Tech Stack:** TypeScript, React 19, RxJS 7.8, `@react-rxjs/core`, Vite, Vitest, Playwright. No new dependencies.

**Reference state at start of phase:**
- Branch: `main` (clean, all Phase 3 commits pushed)
- HEAD includes commit `3aaf3cd` (Phase 4 spec)
- Test counts: 141 unit (114 domain + 22 client + 5 server) + 40 e2e

**Verification commands** (run after each task, before commit):
```
pnpm typecheck   # tsc --noEmit in all packages — must be clean
pnpm test        # vitest run in all packages — must pass 141 tests
pnpm test:e2e    # playwright (client only) — must pass 40 scenarios
```

`pnpm test:e2e` is slow (~60s). For tasks that only move files (no behavioural change), `pnpm typecheck && pnpm test` is sufficient on the per-task gate; run `pnpm test:e2e` once before pushing.

---

## Phase 4a — Bridge split

### Task 1: Move `HooksProvider` from `app/` to `ui/hooks/`

Pure path change. The file content stays bit-identical except for one import path. The composition root still owns `bind()` and the `AppHooks` type at this stage; Task 2 splits those out.

**Files:**
- Move: `packages/client/src/app/HooksProvider.tsx` → `packages/client/src/ui/hooks/HooksProvider.tsx`
- Modify (15 import-path updates):
  - `packages/client/src/main.tsx`
  - `packages/client/src/connection/ConnectionOverlay.tsx`
  - `packages/client/src/connection/ConnectionStatusBar.tsx`
  - `packages/client/src/stale/useStaleDetection.ts`
  - `packages/client/src/analytics/AnalyticsPanel.tsx`
  - `packages/client/src/blotter/FxBlotter.tsx`
  - `packages/client/src/credit/blotter/CreditBlotter.tsx`
  - `packages/client/src/credit/newRfq/NewRfqForm.tsx`
  - `packages/client/src/credit/rfqTiles/RfqTilesPanel.tsx`
  - `packages/client/src/credit/sellSide/SellSidePanel.tsx`
  - `packages/client/src/credit/sellSide/TradeTicket.tsx`
  - `packages/client/src/fx/hooks/useExecuteTrade.ts`
  - `packages/client/src/fx/hooks/useRfqQuote.ts`
  - `packages/client/src/fx/liveRates/LiveRatesPanel.tsx`
  - `packages/client/src/fx/liveRates/tile/Tile.tsx`

- [ ] **Step 1: Create `ui/hooks/` directory**

```bash
mkdir -p packages/client/src/ui/hooks
```

- [ ] **Step 2: Move `HooksProvider.tsx`**

```bash
git mv packages/client/src/app/HooksProvider.tsx packages/client/src/ui/hooks/HooksProvider.tsx
```

- [ ] **Step 3: Update HooksProvider's own AppHooks import**

Edit `packages/client/src/ui/hooks/HooksProvider.tsx`:

Old (line 2):
```ts
import type { AppHooks } from "./composition";
```

New (line 2):
```ts
import type { AppHooks } from "../../app/composition";
```

This is temporary — Task 2 retargets it to `./createAppHooks`.

- [ ] **Step 4: Update each consumer's `useHooks` import path**

The new import path depends on each file's depth relative to `src/`. Compute by counting `../` jumps from the consumer to `src/ui/hooks/HooksProvider`. The substitution table:

| Consumer | Old path | New path |
|---|---|---|
| `src/main.tsx` | `./app/HooksProvider` | `./ui/hooks/HooksProvider` |
| `src/connection/ConnectionOverlay.tsx` | `../app/HooksProvider` | `../ui/hooks/HooksProvider` |
| `src/connection/ConnectionStatusBar.tsx` | `../app/HooksProvider` | `../ui/hooks/HooksProvider` |
| `src/stale/useStaleDetection.ts` | `../app/HooksProvider` | `../ui/hooks/HooksProvider` |
| `src/analytics/AnalyticsPanel.tsx` | `../app/HooksProvider` | `../ui/hooks/HooksProvider` |
| `src/blotter/FxBlotter.tsx` | `../app/HooksProvider` | `../ui/hooks/HooksProvider` |
| `src/credit/blotter/CreditBlotter.tsx` | `../../app/HooksProvider` | `../../ui/hooks/HooksProvider` |
| `src/credit/newRfq/NewRfqForm.tsx` | `../../app/HooksProvider` | `../../ui/hooks/HooksProvider` |
| `src/credit/rfqTiles/RfqTilesPanel.tsx` | `../../app/HooksProvider` | `../../ui/hooks/HooksProvider` |
| `src/credit/sellSide/SellSidePanel.tsx` | `../../app/HooksProvider` | `../../ui/hooks/HooksProvider` |
| `src/credit/sellSide/TradeTicket.tsx` | `../../app/HooksProvider` | `../../ui/hooks/HooksProvider` |
| `src/fx/hooks/useExecuteTrade.ts` | `../../app/HooksProvider` | `../../ui/hooks/HooksProvider` |
| `src/fx/hooks/useRfqQuote.ts` | `../../app/HooksProvider` | `../../ui/hooks/HooksProvider` |
| `src/fx/liveRates/LiveRatesPanel.tsx` | `../../app/HooksProvider` | `../../ui/hooks/HooksProvider` |
| `src/fx/liveRates/tile/Tile.tsx` | `../../../app/HooksProvider` | `../../../ui/hooks/HooksProvider` |

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean (no errors). If errors mention "Cannot find module … HooksProvider", revisit step 4.

- [ ] **Step 6: Run unit tests**

```bash
pnpm test
```

Expected: 141 tests pass.

- [ ] **Step 7: Run e2e tests**

```bash
pnpm test:e2e
```

Expected: 40 scenarios pass.

- [ ] **Step 8: Commit**

```bash
git add -A packages/client/src/ui/hooks/HooksProvider.tsx
git add -A packages/client/src/main.tsx packages/client/src/connection packages/client/src/stale packages/client/src/analytics packages/client/src/blotter packages/client/src/credit packages/client/src/fx
git status      # verify nothing unexpected; HooksProvider.tsx should appear as a rename
git commit -m "refactor(client): move HooksProvider to ui/hooks/ (path change only)

Pure path move. AppHooks import temporarily points back to app/composition;
Task 2 splits the bind() bridge out properly.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Split the bridge — extract `createAppHooks` and trim `composition.ts`

Move `bind()` calls + `AppHooks` type out of `app/composition.ts` into a new `ui/hooks/createAppHooks.ts`. After this task, `app/` has zero React or `@react-rxjs/core` imports.

**Files:**
- Create: `packages/client/src/ui/hooks/createAppHooks.ts`
- Modify: `packages/client/src/app/composition.ts`
- Modify: `packages/client/src/ui/hooks/HooksProvider.tsx`
- Modify: `packages/client/src/main.tsx`

- [ ] **Step 1: Create `ui/hooks/createAppHooks.ts`**

```ts
import { bind } from "@react-rxjs/core";
import type { Observable } from "rxjs";
import {
  ConnectionStatus,
  type CurrencyPair, type Price, type PriceTick, type Trade,
  type Rfq, type Quote, type PositionUpdates,
  type Instrument, type Dealer,
  type ExecuteTradeInput, type ExecuteTradeResult, type CreateRfqInput,
  type RfqQuoteResult, type QuoteRequest,
} from "@rtc/domain";
import type { Presenters } from "../../app/composition";

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
  useQuoteRfq: () => (request: QuoteRequest) => Observable<void>;
  useRequestRfqQuote: () => (symbol: string, pipsPosition: number) => Observable<RfqQuoteResult>;
}

export function createAppHooks(presenters: Presenters): AppHooks {
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

  // Pre-bound command callbacks. Stable references across calls so React
  // memo/effect dep arrays remain stable.
  const executeTrade = (input: ExecuteTradeInput) => presenters.execution.execute(input);
  const createRfq = (input: CreateRfqInput) => presenters.rfqs.createRfq(input);
  const acceptQuote = (quoteId: number) => presenters.rfqs.acceptQuote(quoteId);
  const cancelRfq = (rfqId: number) => presenters.rfqs.cancelRfq(rfqId);
  const passQuote = (quoteId: number) => presenters.rfqs.passQuote(quoteId);
  const quoteRfq = (req: QuoteRequest) => presenters.rfqs.quoteRfq(req);
  const requestRfqQuote = (symbol: string, pipsPosition: number) =>
    presenters.rfqQuote.requestQuote(symbol, pipsPosition);

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
    useExecuteTrade: () => executeTrade,
    useCreateRfq: () => createRfq,
    useAcceptQuote: () => acceptQuote,
    useCancelRfq: () => cancelRfq,
    usePassQuote: () => passQuote,
    useQuoteRfq: () => quoteRfq,
    useRequestRfqQuote: () => requestRfqQuote,
  };
}
```

Save to `packages/client/src/ui/hooks/createAppHooks.ts`.

- [ ] **Step 2: Trim `app/composition.ts`**

Replace the entire contents of `packages/client/src/app/composition.ts` with:

```ts
import { concatMap, from, merge, of, type Observable } from "rxjs";
import {
  type ConnectionEvent,
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
import { BrowserConnectionEventsAdapter } from "./adapters/BrowserConnectionEventsAdapter";
import {
  createSimulatorPorts,
  createWsRealPorts,
  type AppPorts,
} from "./adapters/portFactory";

export type { AppPorts };

export interface Presenters {
  priceStream: PriceStreamPresenter;
  priceHistory: PriceHistoryPresenter;
  execution: TradeExecutionPresenter;
  blotter: BlotterPresenter;
  analytics: AnalyticsPresenter;
  rfqs: RfqsPresenter;
  currencyPairs: CurrencyPairsPresenter;
  instruments: InstrumentsPresenter;
  dealers: DealersPresenter;
  connection: ConnectionStatusPresenter;
  rfqQuote: RfqQuotePresenter;
}

export interface App {
  presenters: Presenters;
  ports: AppPorts;
}

/**
 * Wraps the BrowserConnectionEventsAdapter with a synthetic startup
 * `gatewayConnected` event so the state machine reaches CONNECTED
 * during application boot. Also synthesizes a `gatewayConnected` event
 * after every `browserOnline` event so that coming back from offline
 * returns to CONNECTED (not just CONNECTING). In future phases a real
 * gateway adapter will replace these synthetic emissions.
 */
function withSyntheticGatewayConnected(
  inner: ConnectionEventsPort,
): ConnectionEventsPort {
  return {
    events(): Observable<ConnectionEvent> {
      const innerEvents$ = inner.events().pipe(
        concatMap((event) => {
          if (event.type === "browserOnline") {
            const pair: ConnectionEvent[] = [event, { type: "gatewayConnected" }];
            return from(pair);
          }
          return of(event);
        }),
      );
      return merge(of<ConnectionEvent>({ type: "gatewayConnected" }), innerEvents$);
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

export function createApp(ports: AppPorts = buildDefaultPorts()): App {
  const presenters: Presenters = {
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
  return { presenters, ports };
}
```

Note: `bind`, `@react-rxjs/core`, `AppHooks`, all hook bindings, and all command-callback returns are gone.

- [ ] **Step 3: Update HooksProvider's AppHooks import**

Edit `packages/client/src/ui/hooks/HooksProvider.tsx` line 2:

Old:
```ts
import type { AppHooks } from "../../app/composition";
```

New:
```ts
import type { AppHooks } from "./createAppHooks";
```

- [ ] **Step 4: Update `main.tsx` to call `createAppHooks`**

Replace lines 5-6 of `packages/client/src/main.tsx`:

Old:
```tsx
import { createApp } from "./app/composition";
import { HooksProvider } from "./ui/hooks/HooksProvider";
```

New:
```tsx
import { createApp } from "./app/composition";
import { createAppHooks } from "./ui/hooks/createAppHooks";
import { HooksProvider } from "./ui/hooks/HooksProvider";
```

Replace line 27 of `packages/client/src/main.tsx`:

Old:
```tsx
const hooks = createApp();
```

New:
```tsx
const { presenters } = createApp();
const hooks = createAppHooks(presenters);
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Verify `app/` has no React imports**

```bash
grep -rE 'from "react"|from "@react-rxjs/core"|from "\.\./ui|from "\.\.\/\.\.\/ui' packages/client/src/app/
```

Expected: empty output. Any match means a stray import slipped through; review and remove.

- [ ] **Step 7: Run unit + e2e tests**

```bash
pnpm test && pnpm test:e2e
```

Expected: 141 unit pass, 40 e2e pass.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/ui/hooks/createAppHooks.ts packages/client/src/ui/hooks/HooksProvider.tsx packages/client/src/app/composition.ts packages/client/src/main.tsx
git commit -m "refactor(client): split react-rxjs bridge out of app/

createAppHooks() in ui/hooks/ now owns bind() calls + AppHooks type.
app/composition.ts is React-free: createApp() returns { presenters, ports }
and main.tsx wires through createAppHooks(presenters).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4b — File moves

Each task moves one feature area under `ui/`. Each task is one commit. The order is chosen so consumers update once: `fx`, `analytics`, `blotter` move into `ui/fx/`, then `credit`, `admin`, then shell pieces, then `App.tsx`. `layout/Workspace.tsx` is the cross-area hub and gets edited multiple times along the way (fine — each edit shipped in a green commit).

### Task 3: Move `fx/` → `ui/fx/` (with `fx/hooks` → `tile/hooks` shuffle)

**Files:**
- Move: `packages/client/src/fx/` → `packages/client/src/ui/fx/`
- Move (within ui/fx/): `packages/client/src/ui/fx/hooks/` → `packages/client/src/ui/fx/liveRates/tile/hooks/`
- Modify imports inside moved files referencing outside the moved tree:
  - `packages/client/src/ui/fx/liveRates/tile/Tile.tsx` (3 imports)
  - `packages/client/src/ui/fx/liveRates/LiveRatesPanel.tsx` (1 import)
  - `packages/client/src/ui/fx/liveRates/tile/hooks/useExecuteTrade.ts` (1 import)
  - `packages/client/src/ui/fx/liveRates/tile/hooks/useRfqQuote.ts` (1 import)
- Modify imports inside moved files referencing the relocated `hooks/`:
  - `packages/client/src/ui/fx/liveRates/tile/Tile.tsx` (5 imports)
  - `packages/client/src/ui/fx/liveRates/tile/TileNotional.tsx` (1 import)
  - `packages/client/src/ui/fx/liveRates/tile/TileConfirmation.tsx` (1 import)
  - `packages/client/src/ui/fx/liveRates/tile/TileRfq.tsx` (1 import)
- Modify external consumer:
  - `packages/client/src/layout/Workspace.tsx` (1 import)

- [ ] **Step 1: Move the directory**

```bash
git mv packages/client/src/fx packages/client/src/ui/fx
```

- [ ] **Step 2: Move `hooks/` into `tile/`**

```bash
git mv packages/client/src/ui/fx/hooks packages/client/src/ui/fx/liveRates/tile/hooks
```

- [ ] **Step 3: Update tile imports of `hooks/`**

Edit `packages/client/src/ui/fx/liveRates/tile/Tile.tsx`. The five `../../hooks/...` imports become `./hooks/...`:

Old (lines 4-8):
```ts
import { useNotional } from "../../hooks/useNotional";
import { useTileState } from "../../hooks/useTileState";
import { useExecuteTrade } from "../../hooks/useExecuteTrade";
import { useRfqState } from "../../hooks/useRfqState";
import { useRfqQuote } from "../../hooks/useRfqQuote";
```

New:
```ts
import { useNotional } from "./hooks/useNotional";
import { useTileState } from "./hooks/useTileState";
import { useExecuteTrade } from "./hooks/useExecuteTrade";
import { useRfqState } from "./hooks/useRfqState";
import { useRfqQuote } from "./hooks/useRfqQuote";
```

Edit `packages/client/src/ui/fx/liveRates/tile/TileNotional.tsx` line 2:

Old: `import type { UseNotionalResult } from "../../hooks/useNotional";`
New: `import type { UseNotionalResult } from "./hooks/useNotional";`

Edit `packages/client/src/ui/fx/liveRates/tile/TileConfirmation.tsx` line 2:

Old: `import type { TileState } from "../../hooks/useTileState";`
New: `import type { TileState } from "./hooks/useTileState";`

Edit `packages/client/src/ui/fx/liveRates/tile/TileRfq.tsx` line 3:

Old: `import type { UseRfqStateResult } from "../../hooks/useRfqState";`
New: `import type { UseRfqStateResult } from "./hooks/useRfqState";`

- [ ] **Step 4: Update tile/Tile.tsx imports of `useHooks` and `stale/`**

Edit `packages/client/src/ui/fx/liveRates/tile/Tile.tsx`:

Line 3 (was: `import { useHooks } from "../../../ui/hooks/HooksProvider";`):
```ts
import { useHooks } from "../../../hooks/HooksProvider";
```

Lines 16-17 (`../../../stale/...` — stale hasn't moved yet, so we add one more `../`):
Old:
```ts
import { StaleIndicator } from "../../../stale/StaleIndicator";
import { useStaleDetection } from "../../../stale/useStaleDetection";
```

New:
```ts
import { StaleIndicator } from "../../../../stale/StaleIndicator";
import { useStaleDetection } from "../../../../stale/useStaleDetection";
```

These will be tightened again in Task 8 once `stale/` moves.

- [ ] **Step 5: Update LiveRatesPanel and the two presenter-bridge hooks**

`packages/client/src/ui/fx/liveRates/LiveRatesPanel.tsx` line referencing useHooks (was `../../ui/hooks/HooksProvider`):

Old: `import { useHooks } from "../../ui/hooks/HooksProvider";`
New: `import { useHooks } from "../../hooks/HooksProvider";`

`packages/client/src/ui/fx/liveRates/tile/hooks/useExecuteTrade.ts`:

Old: `import { useHooks } from "../../ui/hooks/HooksProvider";`
New: `import { useHooks } from "../../../../hooks/HooksProvider";`

`packages/client/src/ui/fx/liveRates/tile/hooks/useRfqQuote.ts`:

Old: `import { useHooks } from "../../ui/hooks/HooksProvider";`
New: `import { useHooks } from "../../../../hooks/HooksProvider";`

- [ ] **Step 6: Update external consumer (`Workspace.tsx`)**

Edit `packages/client/src/layout/Workspace.tsx` line 1:

Old: `import { LiveRatesPanel } from "../fx/liveRates/LiveRatesPanel";`
New: `import { LiveRatesPanel } from "../ui/fx/liveRates/LiveRatesPanel";`

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean. Any "Cannot find module" error names a path that needs adjusting; recompute the relative path from the file's new location.

- [ ] **Step 8: Run tests**

```bash
pnpm test
```

Expected: 141 pass.

- [ ] **Step 9: Commit**

```bash
git add -A packages/client/src/ui/fx packages/client/src/layout/Workspace.tsx
git status   # confirm git records moves as renames, not delete+add
git commit -m "refactor(client): move fx/ to ui/fx/ and fold hooks into tile/

fx/hooks/ relocates under ui/fx/liveRates/tile/hooks/ since all five hooks
are tile-internal. Workspace.tsx import path follows the move.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Move `analytics/` → `ui/fx/analytics/`

**Files:**
- Move: `packages/client/src/analytics/` → `packages/client/src/ui/fx/analytics/`
- Modify (inside moved files):
  - `packages/client/src/ui/fx/analytics/AnalyticsPanel.tsx` (3 imports)
- Modify external consumer:
  - `packages/client/src/layout/Workspace.tsx` (1 import)

- [ ] **Step 1: Move directory**

```bash
git mv packages/client/src/analytics packages/client/src/ui/fx/analytics
```

- [ ] **Step 2: Update internal imports of AnalyticsPanel.tsx**

Edit `packages/client/src/ui/fx/analytics/AnalyticsPanel.tsx`:

Line referencing useHooks (was `../ui/hooks/HooksProvider` after Task 1):

Old: `import { useHooks } from "../ui/hooks/HooksProvider";`
New: `import { useHooks } from "../../hooks/HooksProvider";`

Lines referencing `stale/` (stale still at `packages/client/src/stale/`; new file location is two levels deeper):

Old:
```ts
import { StaleIndicator } from "../stale/StaleIndicator";
import { useStaleDetection } from "../stale/useStaleDetection";
```

New:
```ts
import { StaleIndicator } from "../../../stale/StaleIndicator";
import { useStaleDetection } from "../../../stale/useStaleDetection";
```

(These will be tightened again in Task 8 when stale moves.)

- [ ] **Step 3: Update Workspace.tsx**

Edit `packages/client/src/layout/Workspace.tsx`:

Old: `import { AnalyticsPanel } from "../analytics/AnalyticsPanel";`
New: `import { AnalyticsPanel } from "../ui/fx/analytics/AnalyticsPanel";`

- [ ] **Step 4: Verify**

```bash
pnpm typecheck && pnpm test
```

Expected: typecheck clean, 141 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A packages/client/src/ui/fx/analytics packages/client/src/layout/Workspace.tsx
git commit -m "refactor(client): move analytics/ to ui/fx/analytics/

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Move `blotter/` (top-level FX blotter) → `ui/fx/blotter/`

**Files:**
- Move: `packages/client/src/blotter/` → `packages/client/src/ui/fx/blotter/`
- Modify (inside moved files):
  - `packages/client/src/ui/fx/blotter/FxBlotter.tsx` (1 import — useHooks)
- Modify external consumer:
  - `packages/client/src/layout/Workspace.tsx` (1 import)

Note: `packages/client/src/credit/blotter/` is a separate `CreditBlotter.tsx` and stays under `credit/` (does not move in this task).

- [ ] **Step 1: Move directory**

```bash
git mv packages/client/src/blotter packages/client/src/ui/fx/blotter
```

- [ ] **Step 2: Update FxBlotter useHooks import**

Edit `packages/client/src/ui/fx/blotter/FxBlotter.tsx`:

Old: `import { useHooks } from "../ui/hooks/HooksProvider";`
New: `import { useHooks } from "../../hooks/HooksProvider";`

- [ ] **Step 3: Update Workspace.tsx**

Edit `packages/client/src/layout/Workspace.tsx`:

Old: `import { FxBlotter } from "../blotter/FxBlotter";`
New: `import { FxBlotter } from "../ui/fx/blotter/FxBlotter";`

- [ ] **Step 4: Verify**

```bash
pnpm typecheck && pnpm test
```

Expected: clean and 141 pass.

- [ ] **Step 5: Commit**

```bash
git add -A packages/client/src/ui/fx/blotter packages/client/src/layout/Workspace.tsx
git commit -m "refactor(client): move blotter/ to ui/fx/blotter/

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Move `credit/` → `ui/credit/`

**Files:**
- Move: `packages/client/src/credit/` → `packages/client/src/ui/credit/`
- Modify imports inside moved files referencing `useHooks`:
  - `packages/client/src/ui/credit/blotter/CreditBlotter.tsx`
  - `packages/client/src/ui/credit/newRfq/NewRfqForm.tsx`
  - `packages/client/src/ui/credit/rfqTiles/RfqTilesPanel.tsx`
  - `packages/client/src/ui/credit/sellSide/SellSidePanel.tsx`
  - `packages/client/src/ui/credit/sellSide/TradeTicket.tsx`
- Modify external consumer:
  - `packages/client/src/layout/Workspace.tsx` (1 import)

- [ ] **Step 1: Move directory**

```bash
git mv packages/client/src/credit packages/client/src/ui/credit
```

- [ ] **Step 2: Update useHooks imports inside moved files**

Files at depth `src/ui/credit/<feature>/<file>` are 3 levels under `src/`. Reach to `src/ui/hooks/HooksProvider` requires `../../hooks/HooksProvider`.

Edit each of these files to change the line:

`packages/client/src/ui/credit/blotter/CreditBlotter.tsx`:
- Old: `import { useHooks } from "../../ui/hooks/HooksProvider";`
- New: `import { useHooks } from "../../hooks/HooksProvider";`

Wait — the old path was `../../ui/hooks/HooksProvider` only when the file lived at `src/credit/blotter/`. Once moved to `src/ui/credit/blotter/`, the file is one level deeper inside `ui/`. Recompute:
- File: `src/ui/credit/blotter/CreditBlotter.tsx`
- Target: `src/ui/hooks/HooksProvider`
- Path up to `ui/`: 2 levels → `../../`
- Then into `hooks/HooksProvider` → `../../hooks/HooksProvider`. Confirmed.

Apply the same path (`../../hooks/HooksProvider`) to:
- `packages/client/src/ui/credit/newRfq/NewRfqForm.tsx`
- `packages/client/src/ui/credit/rfqTiles/RfqTilesPanel.tsx`
- `packages/client/src/ui/credit/sellSide/SellSidePanel.tsx`
- `packages/client/src/ui/credit/sellSide/TradeTicket.tsx`

For each, replace the existing useHooks import line with:
```ts
import { useHooks } from "../../hooks/HooksProvider";
```

- [ ] **Step 3: Update Workspace.tsx**

Edit `packages/client/src/layout/Workspace.tsx`:

Old: `import { CreditWorkspace } from "../credit/CreditWorkspace";`
New: `import { CreditWorkspace } from "../ui/credit/CreditWorkspace";`

- [ ] **Step 4: Verify**

```bash
pnpm typecheck && pnpm test
```

Expected: clean and 141 pass.

- [ ] **Step 5: Commit**

```bash
git add -A packages/client/src/ui/credit packages/client/src/layout/Workspace.tsx
git commit -m "refactor(client): move credit/ to ui/credit/

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Move `admin/` → `ui/admin/`

**Files:**
- Move: `packages/client/src/admin/` → `packages/client/src/ui/admin/`
- Modify external consumer: `packages/client/src/layout/Workspace.tsx`

`AdminPanel.tsx` does not currently import `useHooks` (it uses `admin/hooks/useThroughput` — a self-contained hook). Verify with grep first; if it does import useHooks, follow the pattern from Task 6.

- [ ] **Step 1: Verify no useHooks import in admin**

```bash
grep -rn "useHooks" packages/client/src/admin/
```

Expected: empty. If non-empty, add an import-update step after the move.

- [ ] **Step 2: Move directory**

```bash
git mv packages/client/src/admin packages/client/src/ui/admin
```

- [ ] **Step 3: Update Workspace.tsx**

Edit `packages/client/src/layout/Workspace.tsx`:

Old: `import { AdminPanel } from "../admin/AdminPanel";`
New: `import { AdminPanel } from "../ui/admin/AdminPanel";`

- [ ] **Step 4: Verify**

```bash
pnpm typecheck && pnpm test
```

Expected: clean and 141 pass.

- [ ] **Step 5: Commit**

```bash
git add -A packages/client/src/ui/admin packages/client/src/layout/Workspace.tsx
git commit -m "refactor(client): move admin/ to ui/admin/

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Move shell pieces (`layout`, `connection`, `theme`, `stale`) → `ui/shell/`

This is the largest single task because the shell directories cross-reference each other (Header → ThemeToggle, Footer → ConnectionStatusBar) and are referenced by the App.tsx + ui/fx + main.tsx. All four move together so the import-update pass is one atomic operation.

**Files:**
- Move: `packages/client/src/layout/` → `packages/client/src/ui/shell/layout/`
- Move: `packages/client/src/connection/` → `packages/client/src/ui/shell/connection/`
- Move: `packages/client/src/theme/` → `packages/client/src/ui/shell/theme/`
- Move: `packages/client/src/stale/` → `packages/client/src/ui/shell/stale/`
- Modify imports inside moved files (cross-shell refs become tighter; references to ui/fx/ui/credit/ui/admin become slightly different):
  - `packages/client/src/ui/shell/layout/Header.tsx` (theme ref)
  - `packages/client/src/ui/shell/layout/Footer.tsx` (connection ref)
  - `packages/client/src/ui/shell/layout/Workspace.tsx` (5 ui/* refs)
  - `packages/client/src/ui/shell/connection/ConnectionOverlay.tsx` (useHooks)
  - `packages/client/src/ui/shell/connection/ConnectionStatusBar.tsx` (useHooks)
  - `packages/client/src/ui/shell/stale/useStaleDetection.ts` (useHooks)
- Modify external consumers:
  - `packages/client/src/App.tsx` (4 imports)
  - `packages/client/src/main.tsx` (1 import — ThemeProvider)
  - `packages/client/src/ui/fx/liveRates/tile/Tile.tsx` (2 stale imports tighten)
  - `packages/client/src/ui/fx/analytics/AnalyticsPanel.tsx` (2 stale imports tighten)

- [ ] **Step 1: Move all four directories**

```bash
git mv packages/client/src/layout packages/client/src/ui/shell/layout
git mv packages/client/src/connection packages/client/src/ui/shell/connection
git mv packages/client/src/theme packages/client/src/ui/shell/theme
git mv packages/client/src/stale packages/client/src/ui/shell/stale
```

- [ ] **Step 2: Update intra-shell cross-references**

`packages/client/src/ui/shell/layout/Header.tsx` line 1:

Old: `import { ThemeToggle } from "../theme/ThemeToggle";`
New: `import { ThemeToggle } from "../theme/ThemeToggle";`

(Unchanged — sibling-of-sibling within shell.)

`packages/client/src/ui/shell/layout/Footer.tsx` line 1:

Old: `import { ConnectionStatusBar } from "../connection/ConnectionStatusBar";`
New: `import { ConnectionStatusBar } from "../connection/ConnectionStatusBar";`

(Unchanged.)

- [ ] **Step 3: Update Workspace.tsx imports of ui/* features**

`packages/client/src/ui/shell/layout/Workspace.tsx` is now at depth `src/ui/shell/layout/`. To reach `src/ui/<feature>/...` it needs `../../<feature>/...`.

Old (after Tasks 3-7):
```ts
import { LiveRatesPanel } from "../ui/fx/liveRates/LiveRatesPanel";
import { FxBlotter } from "../ui/fx/blotter/FxBlotter";
import { AnalyticsPanel } from "../ui/fx/analytics/AnalyticsPanel";
import { CreditWorkspace } from "../ui/credit/CreditWorkspace";
import { AdminPanel } from "../ui/admin/AdminPanel";
```

New:
```ts
import { LiveRatesPanel } from "../../fx/liveRates/LiveRatesPanel";
import { FxBlotter } from "../../fx/blotter/FxBlotter";
import { AnalyticsPanel } from "../../fx/analytics/AnalyticsPanel";
import { CreditWorkspace } from "../../credit/CreditWorkspace";
import { AdminPanel } from "../../admin/AdminPanel";
```

- [ ] **Step 4: Update useHooks imports in moved shell files**

Files now at depth `src/ui/shell/<sub>/<file>` reach `src/ui/hooks/HooksProvider` via `../../hooks/HooksProvider` (up 2 to `src/ui/`, then into `hooks/`).

Edit `packages/client/src/ui/shell/connection/ConnectionOverlay.tsx`:

Old: `import { useHooks } from "../ui/hooks/HooksProvider";`
New: `import { useHooks } from "../../hooks/HooksProvider";`

Edit `packages/client/src/ui/shell/connection/ConnectionStatusBar.tsx`:

Old: `import { useHooks } from "../ui/hooks/HooksProvider";`
New: `import { useHooks } from "../../hooks/HooksProvider";`

Edit `packages/client/src/ui/shell/stale/useStaleDetection.ts`:

Old: `import { useHooks } from "../ui/hooks/HooksProvider";`
New: `import { useHooks } from "../../hooks/HooksProvider";`

- [ ] **Step 5: Update App.tsx imports of moved shell files**

Edit `packages/client/src/App.tsx`:

Old (lines 2-5):
```tsx
import { Header, type WorkspaceTab } from "./layout/Header";
import { Footer } from "./layout/Footer";
import { Workspace } from "./layout/Workspace";
import { ConnectionOverlay } from "./connection/ConnectionOverlay";
```

New:
```tsx
import { Header, type WorkspaceTab } from "./ui/shell/layout/Header";
import { Footer } from "./ui/shell/layout/Footer";
import { Workspace } from "./ui/shell/layout/Workspace";
import { ConnectionOverlay } from "./ui/shell/connection/ConnectionOverlay";
```

- [ ] **Step 6: Update main.tsx ThemeProvider import**

Edit `packages/client/src/main.tsx`:

Old: `import { ThemeProvider } from "./theme/ThemeProvider";`
New: `import { ThemeProvider } from "./ui/shell/theme/ThemeProvider";`

- [ ] **Step 7: Tighten ui/fx imports of stale**

`packages/client/src/ui/fx/liveRates/tile/Tile.tsx` lines for stale:

After Task 3, these were:
```ts
import { StaleIndicator } from "../../../../stale/StaleIndicator";
import { useStaleDetection } from "../../../../stale/useStaleDetection";
```

After this task, stale lives at `src/ui/shell/stale/`. From `src/ui/fx/liveRates/tile/Tile.tsx` (depth 4 under src/ui/) the path is `../../../shell/stale/...`:

```ts
import { StaleIndicator } from "../../../shell/stale/StaleIndicator";
import { useStaleDetection } from "../../../shell/stale/useStaleDetection";
```

`packages/client/src/ui/fx/analytics/AnalyticsPanel.tsx` lines for stale:

After Task 4, these were:
```ts
import { StaleIndicator } from "../../../stale/StaleIndicator";
import { useStaleDetection } from "../../../stale/useStaleDetection";
```

After this task, from `src/ui/fx/analytics/AnalyticsPanel.tsx` (depth 3 under src/) the path is `../../shell/stale/...`:

```ts
import { StaleIndicator } from "../../shell/stale/StaleIndicator";
import { useStaleDetection } from "../../shell/stale/useStaleDetection";
```

- [ ] **Step 8: Run typecheck and tests**

```bash
pnpm typecheck && pnpm test && pnpm test:e2e
```

Expected: clean, 141 unit pass, 40 e2e pass. (Run e2e here because this is the largest move.)

- [ ] **Step 9: Commit**

```bash
git add -A packages/client/src/ui/shell packages/client/src/App.tsx packages/client/src/main.tsx packages/client/src/ui/fx
git commit -m "refactor(client): move layout/connection/theme/stale to ui/shell/

Application-shell concerns shared across trading domains live under
ui/shell/. ui/fx tile and analytics tighten their stale/ imports
to point through shell/.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: Move `App.tsx` → `ui/App.tsx`

**Files:**
- Move: `packages/client/src/App.tsx` → `packages/client/src/ui/App.tsx`
- Modify (inside moved file):
  - `packages/client/src/ui/App.tsx` (4 imports — paths shorten by one `../` level since now under ui/)
- Modify external consumer:
  - `packages/client/src/main.tsx` (App import)

- [ ] **Step 1: Move file**

```bash
git mv packages/client/src/App.tsx packages/client/src/ui/App.tsx
```

- [ ] **Step 2: Update App.tsx imports**

After Task 8, App.tsx (still at `src/App.tsx`) imports the shell pieces via `./ui/shell/...`. After this move, App.tsx is at `src/ui/App.tsx` so the path is `./shell/...`:

Edit `packages/client/src/ui/App.tsx`:

Old (lines 2-5):
```tsx
import { Header, type WorkspaceTab } from "./ui/shell/layout/Header";
import { Footer } from "./ui/shell/layout/Footer";
import { Workspace } from "./ui/shell/layout/Workspace";
import { ConnectionOverlay } from "./ui/shell/connection/ConnectionOverlay";
```

New:
```tsx
import { Header, type WorkspaceTab } from "./shell/layout/Header";
import { Footer } from "./shell/layout/Footer";
import { Workspace } from "./shell/layout/Workspace";
import { ConnectionOverlay } from "./shell/connection/ConnectionOverlay";
```

- [ ] **Step 3: Update main.tsx App import**

Edit `packages/client/src/main.tsx`:

Old: `import { App } from "./App";`
New: `import { App } from "./ui/App";`

- [ ] **Step 4: Verify**

```bash
pnpm typecheck && pnpm test
```

Expected: clean and 141 pass.

- [ ] **Step 5: Smoke-test the dev server**

```bash
pnpm dev
```

Open `http://localhost:5173` (or the port Vite reports) and confirm the page renders with the FX trading UI. Press Ctrl+C to stop.

This catches any Vite-runtime asset-resolution issue that typecheck would miss.

- [ ] **Step 6: Run e2e**

```bash
pnpm test:e2e
```

Expected: 40 scenarios pass.

- [ ] **Step 7: Commit**

```bash
git add -A packages/client/src/ui/App.tsx packages/client/src/main.tsx
git commit -m "refactor(client): move App.tsx to ui/App.tsx

Final move of Phase 4. main.tsx remains at src/ as the Vite entry
stub; App.tsx joins the rest of the React layer under ui/.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 wrap-up

### Task 10: Update `architecture.md` §11 reference table

The "Key Files Reference" table in `docs/architecture.md` still names obsolete paths.

**Files:**
- Modify: `docs/architecture.md:1196-1200`

- [ ] **Step 1: Apply the table update**

Edit `docs/architecture.md`. Replace lines 1196-1200:

Old:
```markdown
| **Composition Root** (target) | `packages/client/src/app/composition.ts` | Wires ports → use cases → presenters at startup |
| **Presenters** (target) | `packages/client/src/app/presenters/*.ts` | RxJS streams, one file per area |
| **react-rxjs Hooks** (target) | `packages/client/src/ui/hooks/*.ts` | Generated bindings to presenters |
| **Client Services** (current) | `packages/client/src/services/*.ts` | WsAdapter, simulator/real factories -- to be reorganised under `app/` |
| **Client UI Components** | `packages/client/src/ui/**/*.tsx` | React components -- target location after reorg |
```

New:
```markdown
| **Composition Root** | `packages/client/src/app/composition.ts` | React-free factory; returns `{ presenters, ports }` from wired-up adapters |
| **Presenters** | `packages/client/src/app/presenters/*.ts` | RxJS streams, one file per area |
| **Port Adapters** | `packages/client/src/app/adapters/*.ts` | WsAdapter, BrowserConnectionEventsAdapter, simulator/real port factory |
| **react-rxjs Hooks Bridge** | `packages/client/src/ui/hooks/createAppHooks.ts` | `bind()` calls + `AppHooks` type; only file importing `@react-rxjs/core` |
| **Hooks Provider** | `packages/client/src/ui/hooks/HooksProvider.tsx` | React Context distributing `AppHooks` |
| **Client UI Components** | `packages/client/src/ui/{fx,credit,shell,admin}/**/*.tsx` | React components grouped by trading domain |
```

- [ ] **Step 2: Verify**

```bash
grep -n "packages/client/src/services" docs/architecture.md
```

Expected: empty (the obsolete `services/` reference is gone).

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs(architecture): update §11 reference table for Phase 4 layout

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: Update `STATUS.md` and carry follow-ups forward

**Files:**
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 1: Capture the SHA range**

```bash
git log --oneline | head -15
```

Note the first SHA of Phase 4 (commit message starting "refactor(client): move HooksProvider…") and the last (`docs(architecture): update §11…`). The range is `<first>..<last>`.

- [ ] **Step 2: Edit STATUS.md**

Open `docs/superpowers/STATUS.md`.

Update the **Last updated** line at top:

Old: `**Last updated:** 2026-05-05`
New: `**Last updated:** 2026-05-07`

Update the Phase 4 row in the Phases table (line 25). Replace:

Old:
```markdown
| Phase 4 — Reorganise `packages/client/src/` into `app/` + `ui/` subtrees | ⏳ NOT STARTED | (to be written) | — |
```

New (substitute `<sha-range>` with the actual range from Step 1):
```markdown
| Phase 4 — Reorganise `packages/client/src/` into `app/` + `ui/` subtrees | ✅ DONE | `plans/2026-05-07-phase-4-app-ui-reorg.md` | `<sha-range>` (11 tasks, 11 commits) |
```

In the **Phase 3 follow-ups** section (currently titled "Phase 3 follow-ups (carry into Phase 4)"), retitle and update to carry into Phase 5:

Old heading:
```markdown
## Phase 3 follow-ups (carry into Phase 4)
```

New heading:
```markdown
## Phase 3 follow-ups (carry into Phase 5)
```

The body of follow-ups #1 and #2 stays the same (still pending).

In the **Resuming work** section, replace the body to point at Phase 5:

Old:
```markdown
1. Confirm `git status` is clean. If `.claude/settings.local.json` is dirty, ignore.
2. Confirm `git log origin/main..HEAD` (if origin updated) — push if not yet pushed.
3. Phase 3 is done. Next: Phase 4 — Reorganise `packages/client/src/` into `app/` + `ui/` subtrees. Write the Phase 4 plan before touching code.
4. Read `docs/architecture.md` for the architectural intent before starting Phase 4.
```

New:
```markdown
1. Confirm `git status` is clean. If `.claude/settings.local.json` is dirty, ignore.
2. Confirm `git log origin/main..HEAD` (if origin updated) — push if not yet pushed.
3. Phase 4 is done. Next: Phase 5 — Gherkin specs + page-object harnesses + port contract tests. Brainstorm and write the spec before writing the plan.
4. The two Phase 3 follow-ups (real gateway adapter; presenter test depth) can fold into Phase 5 work or be carved off separately — decide during brainstorming.
```

- [ ] **Step 3: Verify**

```bash
grep -n "Phase 4 .* DONE" docs/superpowers/STATUS.md
grep -n "carry into Phase 5" docs/superpowers/STATUS.md
```

Both should match.

- [ ] **Step 4: Final acceptance gate**

Run all gates one more time end-to-end:

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
grep -rE 'from "react"|from "@react-rxjs/core"|from "\.\./ui|from "\.\.\/\.\.\/ui' packages/client/src/app/
```

Expected: typecheck clean, 141 tests pass, 40 e2e pass, grep returns empty.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/STATUS.md
git commit -m "docs(status): mark Phase 4 done, carry follow-ups to Phase 5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```

Expected: 11 new commits pushed to origin.

---

## Acceptance summary (phase-end)

After Task 11 completes, all of the following must hold:

1. `pnpm typecheck` clean.
2. `pnpm test` passes 141 unit tests.
3. `pnpm test:e2e` passes 40 e2e scenarios.
4. `grep -rE 'from "react"|from "@react-rxjs/core"|from "\.\./ui|from "\.\.\/\.\.\/ui' packages/client/src/app/` returns nothing.
5. Directory tree under `packages/client/src/` matches the spec's "Target structure" section exactly.
6. `docs/architecture.md` §11 reference table reflects new paths.
7. `docs/superpowers/STATUS.md` Phase 4 row shows ✅ DONE with SHA range; Phase 3 follow-ups retitled to "carry into Phase 5".
8. 11 commits pushed to `origin/main`.

## Risks and contingencies

- **Vite/HMR runtime issue not caught by typecheck.** Mitigated by the `pnpm dev` smoke test in Task 9. If the dev server fails, inspect the network tab for 404s on chunk paths and trace back to the offending import.
- **Git renames not detected.** If `git status` shows delete+add instead of rename, the rename-detection threshold may be off. Run `git config diff.renameLimit 999` and re-stage; or accept the diff as-is (history is preserved through the staged content even when not auto-detected).
- **Test that imports a moved file by absolute path.** Vitest config uses glob `src/**/*.test.{ts,tsx}` — no path coupling. None of the existing test files import from outside their own area, so this should not arise. If it does, follow the same path-update pattern.
