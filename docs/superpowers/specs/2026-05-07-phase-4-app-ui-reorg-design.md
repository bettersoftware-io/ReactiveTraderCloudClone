# Phase 4 — `app/` + `ui/` Reorganisation

**Status:** Draft, 2026-05-07
**Predecessors:** Phase 3 (composition root, presenters, react-rxjs hook bridge) — `94d6f6e..3434bd7`
**Successors:** Phase 5 (Gherkin specs + page-object harnesses + port contract tests)
**Architecture reference:** `docs/architecture.md` §1.3, §11

## Goal

Reorganise `packages/client/src/` into two top-level subtrees:

- **`app/`** — React-free application layer. Composition root, presenters, adapters. Pure RxJS + domain.
- **`ui/`** — React layer. Components + the react-rxjs hook bridge. Consumes the application layer through hook contracts only.

This realises the layered architecture described in `docs/architecture.md` §1.3 ("Application Layer (client) … contains zero React"). Phase 3 produced the composition root + presenters + bridge but kept them mixed with React code in `app/`. Phase 4 separates them.

The phase is a structural reorganisation. **No behavioural changes**, no new features, no new tests beyond what the existing 141 unit + 40 e2e scenarios already cover.

## Non-goals

- Replacing `withSyntheticGatewayConnected` with a real gateway-events adapter (Phase 3 follow-up #1) — deferred. Carry forward in `STATUS.md`.
- Strengthening presenter test depth (Phase 3 follow-up #2) — deferred to Phase 5.
- Refactoring any UI component, hook, or behaviour beyond the moves required for the reorg.
- Renaming files (file names stay; only paths change).

## Target structure

```
packages/client/src/
  main.tsx                            ← stays (Vite entry stub)
  vite-env.d.ts                       ← stays
  index.html                          ← unchanged (still references /src/main.tsx)

  app/                                ← React-FREE; pure RxJS + domain
    composition.ts                    ← createApp(ports?) → { presenters, ports }
    presenters/
      AnalyticsPresenter.ts
      BlotterPresenter.ts
      ConnectionStatusPresenter.ts
      CurrencyPairsPresenter.ts
      DealersPresenter.ts
      InstrumentsPresenter.ts
      PriceHistoryPresenter.ts
      PriceStreamPresenter.ts
      RfqQuotePresenter.ts
      RfqsPresenter.ts
      TradeExecutionPresenter.ts
      __tests__/                      (11 sibling test files; unchanged)
    adapters/
      WsAdapter.ts
      portFactory.ts
      BrowserConnectionEventsAdapter.ts
      BrowserConnectionEventsAdapter.test.ts

  ui/                                 ← React + react-rxjs
    App.tsx                           ← was src/App.tsx
    hooks/                            ← the bridge
      createAppHooks.ts               ← bind() calls + AppHooks type
      HooksProvider.tsx               ← Context + useHooks()
    fx/
      liveRates/
        LiveRatesPanel.tsx
        CurrencyFilter.tsx
        ViewToggle.tsx
        tile/
          Tile.tsx
          TileChart.tsx, TileConfirmation.tsx, TileExecution.tsx,
          TileHeader.tsx, TileNotional.tsx, TilePrice.tsx, TileRfq.tsx
          RfqCountdown.tsx
          hooks/
            useNotional.ts
            useRfqState.ts
            useTileState.ts
            useExecuteTrade.ts
            useRfqQuote.ts
      blotter/                        ← was top-level blotter/
        FxBlotter.tsx
        BlotterHeader.tsx, BlotterRow.tsx, QuickFilter.tsx
        blotterColumns.ts, columnSort.ts, csvExport.ts
        columnFilter/
          DateFilter.tsx, NumberFilter.tsx, SetFilter.tsx, filterState.ts
      analytics/                      ← was top-level analytics/
        AnalyticsPanel.tsx
        PairPnlBars.tsx, PnlChart.tsx, PnlValue.tsx, PositionBubbles.tsx
    credit/
      CreditWorkspace.tsx
      newRfq/
        DealerSelection.tsx, InstrumentSearch.tsx, NewRfqForm.tsx, QuantityInput.tsx
      rfqTiles/
        QuoteCard.tsx, RfqCard.tsx, RfqFilterTabs.tsx, RfqTilesPanel.tsx
      sellSide/
        SellSidePanel.tsx, TradeTicket.tsx
      blotter/
        CreditBlotter.tsx
    shell/
      layout/
        Header.tsx, Footer.tsx, Workspace.tsx
      connection/
        ConnectionOverlay.tsx, ConnectionStatusBar.tsx
      theme/
        ThemeProvider.tsx, ThemeToggle.tsx, tokens.ts
      stale/
        StaleIndicator.tsx, useStaleDetection.ts
    admin/
      AdminPanel.tsx
      hooks/useThroughput.ts
```

**Counts:** 28 files in `app/` (unchanged). ~58 files reorganised under `ui/`.

## Substructure rationale

**`ui/` is grouped by domain, not by technical layer.** Trading domains (`fx/`, `credit/`) cluster the components, hooks, and styling that belong together. Cross-domain shell concerns (layout, connection, theme, stale) collect under `ui/shell/`. The `admin/` panel is its own top-level since it is neither FX nor Credit nor application shell.

**Hook placement rule.** Hooks consumed by exactly one feature live with that feature. Hooks consumed by two or more features live in `ui/shell/`.

Applied:
- `useNotional`, `useRfqState`, `useTileState`, `useExecuteTrade`, `useRfqQuote` are tile-internal — they live in `ui/fx/liveRates/tile/hooks/`.
- `useStaleDetection` is consumed by `ui/fx/analytics/AnalyticsPanel.tsx` and `ui/fx/liveRates/tile/Tile.tsx` — it lives in `ui/shell/stale/`.
- `useThroughput` is admin-internal — it lives in `ui/admin/hooks/`.

**The bridge (`ui/hooks/`) is its own first-class slot.** It does not belong inside any feature: it is the contract surface every UI feature consumes. Co-locating it with features would obscure that role.

## The bridge split (the only behavioural file change)

Phase 3 placed `bind()` calls and the React Context inside `app/`. Phase 4 moves them to `ui/hooks/` so `app/` becomes strictly React-free.

### `app/composition.ts` (becomes React-free)

```ts
import type { Observable } from "rxjs";
import { /* domain types */ } from "@rtc/domain";
import { PriceStreamPresenter } from "./presenters/PriceStreamPresenter";
// … other presenter imports
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

function withSyntheticGatewayConnected(/* unchanged from Phase 3 */) { /* ... */ }

export function buildDefaultPorts(): AppPorts { /* unchanged from Phase 3 */ }

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

No `react`, no `@react-rxjs/core`. Returns plain RxJS data.

### `ui/hooks/createAppHooks.ts` (new)

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
  const [usePrice]            = bind((pair: CurrencyPair) => presenters.priceStream.price$(pair), null);
  const [usePriceHistory]     = bind((symbol: string)      => presenters.priceHistory.history$(symbol), [] as readonly PriceTick[]);
  const [useTrades]           = bind(presenters.blotter.trades$, [] as readonly Trade[]);
  const [useAnalytics]        = bind(presenters.analytics.position$, null as PositionUpdates | null);
  const [useRfqs]             = bind(presenters.rfqs.rfqs$, [] as readonly Rfq[]);
  const [useQuotesForRfq]     = bind((rfqId: number) => presenters.rfqs.quotesForRfq$(rfqId), [] as readonly Quote[]);
  const [useAllQuotes]        = bind(presenters.rfqs.allQuotes$, new Map() as ReadonlyMap<number, Quote>);
  const [useCurrencyPairs]    = bind(presenters.currencyPairs.pairs$, [] as readonly CurrencyPair[]);
  const [useInstruments]      = bind(presenters.instruments.list$, [] as readonly Instrument[]);
  const [useDealers]          = bind(presenters.dealers.list$, [] as readonly Dealer[]);
  const [useConnectionStatus] = bind(presenters.connection.status$, ConnectionStatus.CONNECTING);

  // Pre-bound command callbacks, stable references across calls.
  const executeTrade   = (input: ExecuteTradeInput)             => presenters.execution.execute(input);
  const createRfq      = (input: CreateRfqInput)                => presenters.rfqs.createRfq(input);
  const acceptQuote    = (quoteId: number)                       => presenters.rfqs.acceptQuote(quoteId);
  const cancelRfq      = (rfqId: number)                         => presenters.rfqs.cancelRfq(rfqId);
  const passQuote      = (quoteId: number)                       => presenters.rfqs.passQuote(quoteId);
  const quoteRfq       = (req: QuoteRequest)                     => presenters.rfqs.quoteRfq(req);
  const requestRfqQuote = (symbol: string, pipsPosition: number) => presenters.rfqQuote.requestQuote(symbol, pipsPosition);

  return {
    usePrice, usePriceHistory, useTrades, useAnalytics,
    useRfqs, useQuotesForRfq, useAllQuotes,
    useCurrencyPairs, useInstruments, useDealers, useConnectionStatus,
    useExecuteTrade:    () => executeTrade,
    useCreateRfq:       () => createRfq,
    useAcceptQuote:     () => acceptQuote,
    useCancelRfq:       () => cancelRfq,
    usePassQuote:       () => passQuote,
    useQuoteRfq:        () => quoteRfq,
    useRequestRfqQuote: () => requestRfqQuote,
  };
}
```

This is the only file in the codebase that imports `@react-rxjs/core`. The `AppHooks` type definition lives here, since it is a contract defined in terms of React hook signatures.

### `ui/hooks/HooksProvider.tsx` (moved + import updated)

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { AppHooks } from "./createAppHooks";

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
  if (!ctx) throw new Error("useHooks must be used inside <HooksProvider>");
  return ctx;
}
```

Functionally identical to the Phase 3 file at `app/HooksProvider.tsx`. Only the `AppHooks` import path changes (was `./composition`, now `./createAppHooks`).

### `src/main.tsx` (the wiring stub)

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createApp } from "./app/composition";
import { createAppHooks } from "./ui/hooks/createAppHooks";
import { HooksProvider } from "./ui/hooks/HooksProvider";
import { ThemeProvider } from "./ui/shell/theme/ThemeProvider";
import { App } from "./ui/App";

// Global reset (unchanged)
const style = document.createElement("style");
style.textContent = `…`;
document.head.appendChild(style);

const { presenters } = createApp();
const hooks = createAppHooks(presenters);

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

## Dependency graph (post-reorg)

```
src/main.tsx
  → app/composition         (createApp, App type)
  → ui/hooks/createAppHooks (createAppHooks)
  → ui/hooks/HooksProvider  (HooksProvider)
  → ui/shell/theme          (ThemeProvider)
  → ui/App                  (App)

app/composition.ts
  → app/presenters/*
  → app/adapters/*
  → @rtc/domain
  Imports nothing from ui/, react, or @react-rxjs/core.

ui/hooks/createAppHooks.ts
  → @react-rxjs/core (bind)
  → app/composition (TYPE-ONLY: Presenters)

ui/hooks/HooksProvider.tsx
  → react
  → ui/hooks/createAppHooks (TYPE-ONLY: AppHooks)

ui/{fx,credit,shell,admin}/**
  → react
  → ui/hooks/HooksProvider  (useHooks)
  → ui/shell/*              (cross-feature: layout, theme, stale)
  Imports nothing from app/ directly.
```

The only direction is `ui → app`. `app → ui` has zero edges. No cycles.

## Migration plan

The reorg ships as two phases (4a bridge split, 4b file moves), each a sequence of self-contained commits. Every commit must compile, typecheck, and pass tests in isolation.

### Phase 4a — Bridge split

Independent of the file moves; can ship alone if Phase 4b stalls.

1. Create `packages/client/src/ui/hooks/createAppHooks.ts` containing the `bind()` calls + `AppHooks` type extracted from `app/composition.ts`.
2. Move `packages/client/src/app/HooksProvider.tsx` → `packages/client/src/ui/hooks/HooksProvider.tsx` (`git mv`); update its `AppHooks` import to `./createAppHooks`.
3. Trim `packages/client/src/app/composition.ts`: remove `bind` import, `bind()` calls, `useFoo` returns. Add `Presenters` and `App` types. Change `createApp` return type to `App = { presenters, ports }`. `withSyntheticGatewayConnected` and `buildDefaultPorts` stay.
4. Update `packages/client/src/main.tsx` to call `createApp()` then `createAppHooks(presenters)`.
5. Update every UI file currently importing `useHooks` from `./app/HooksProvider` (or relative equivalents) to import from the new path. Known callsites (15):
   - `src/main.tsx` — imports `HooksProvider`; path change
   - `src/credit/rfqTiles/RfqTilesPanel.tsx`
   - `src/credit/newRfq/NewRfqForm.tsx`
   - `src/credit/blotter/CreditBlotter.tsx`
   - `src/credit/sellSide/SellSidePanel.tsx`
   - `src/credit/sellSide/TradeTicket.tsx`
   - `src/connection/ConnectionStatusBar.tsx`
   - `src/connection/ConnectionOverlay.tsx`
   - `src/stale/useStaleDetection.ts`
   - `src/fx/hooks/useExecuteTrade.ts`
   - `src/fx/hooks/useRfqQuote.ts`
   - `src/fx/liveRates/LiveRatesPanel.tsx`
   - `src/fx/liveRates/tile/Tile.tsx`
   - `src/blotter/FxBlotter.tsx`
   - `src/analytics/AnalyticsPanel.tsx`
6. Verify: `pnpm typecheck && pnpm test && pnpm test:e2e`. Commit.

### Phase 4b — File moves (one feature-area per commit)

Each move uses `git mv` for history preservation, followed by import-rewrite edits.

7. **fx area.**
   - `git mv packages/client/src/fx packages/client/src/ui/fx`
   - `git mv packages/client/src/ui/fx/hooks packages/client/src/ui/fx/liveRates/tile/hooks`
   - `git mv packages/client/src/analytics packages/client/src/ui/fx/analytics`
   - `git mv packages/client/src/blotter packages/client/src/ui/fx/blotter`
   - Update relative imports inside moved files (relative paths to non-moved targets shift).
   - Update the one external consumer: `packages/client/src/layout/Workspace.tsx` (which imports `LiveRatesPanel`, `FxBlotter`, `AnalyticsPanel`).
   - Verify; commit.

8. **credit area.**
   - `git mv packages/client/src/credit packages/client/src/ui/credit`
   - Update `packages/client/src/layout/Workspace.tsx` import of `CreditWorkspace`.
   - Verify; commit.

9. **admin area.**
   - `git mv packages/client/src/admin packages/client/src/ui/admin`
   - Update `packages/client/src/layout/Workspace.tsx` import of `AdminPanel`.
   - Verify; commit.

10. **shell area.**
    - `git mv packages/client/src/layout packages/client/src/ui/shell/layout`
    - `git mv packages/client/src/connection packages/client/src/ui/shell/connection`
    - `git mv packages/client/src/theme packages/client/src/ui/shell/theme`
    - `git mv packages/client/src/stale packages/client/src/ui/shell/stale`
    - Update consumers across `ui/fx/`, `ui/credit/`, `ui/admin/`, and `src/main.tsx`.
    - Verify; commit.

11. **App.tsx.**
    - `git mv packages/client/src/App.tsx packages/client/src/ui/App.tsx`
    - Update its imports of `./layout/*`, `./connection/*` to the new `ui/shell/` paths (already updated in step 10 if those moved first, in which case App.tsx imports already point to new locations).
    - Update `packages/client/src/main.tsx` to import `App` from `./ui/App`.
    - Verify; commit.

12. **Architecture.md update.**
    - Update `docs/architecture.md` §11 "Key Files Reference" table (lines 1196-1200) to reflect new paths.
    - Verify build of doc consumers if any; commit.

13. **STATUS.md update.**
    - Mark Phase 4 row DONE with SHA range.
    - Carry forward Phase 3 follow-up #1 (`withSyntheticGatewayConnected` → real gateway adapter) under "Phase 3 follow-ups (carry into Phase 5)".
    - Note Phase 5 is next (Gherkin specs + page-object harnesses + port contract tests).
    - Commit.

### Import-rewrite strategy

For each moved file, relative imports shift by a known delta:

- File moved from `src/X/Y/Z.tsx` to `src/ui/A/B/Z.tsx`:
  - Relative imports to *moved* siblings (also under `src/ui/A/B/`) stay identical.
  - Relative imports to *non-moved* targets (still under `src/`) gain `../` prefixes by however many directory levels deeper the new location is.

`pnpm typecheck` is the source of truth: if it is green after the move, the rewrite is correct.

## Acceptance criteria

**Per commit:**
- `pnpm typecheck` clean
- `pnpm test` — 141 unit tests pass (114 domain + 22 client + 5 server)
- `pnpm test:e2e` — 40 e2e scenarios pass

**Phase-end:**
- All four gates above
- `app/` source has zero imports from `react`, `@react-rxjs/core`, or `ui/`. Verifiable:
  ```
  grep -rE 'from "react"|from "@react-rxjs/core"|from "\.\./ui|from "\.\.\/\.\.\/ui' packages/client/src/app/
  ```
  must return nothing.
- `ui/` source imports from `app/` only via `app/composition` (the `Presenters` and `AppPorts` types, plus the `createApp` factory consumed by `main.tsx`). No UI file reaches into `app/presenters/` or `app/adapters/` directly.
- `docs/architecture.md` §11 reference table updated.
- `docs/superpowers/STATUS.md` Phase 4 row marked DONE with SHA range; Phase 3 follow-up #1 still tracked.

## Risks

**Low risk.** The reorg is mechanical. The bridge split (Phase 4a) is the only behavioural change, and it preserves the exact wire-up: `bind()` calls and pre-bound command callbacks are lifted verbatim into `createAppHooks`. The e2e suite exercises every panel through `useHooks()`, so any wiring break shows up immediately.

**Failure modes to watch:**
- Import-path typos after `git mv` (caught by typecheck).
- Circular re-exports if `app/composition` accidentally imports from `ui/` (caught by typecheck and the grep gate above).
- Vite's HMR or asset paths breaking after the App.tsx move (caught by `pnpm dev` smoke test before final commit).

## Open questions

None blocking. Pre-resolved in brainstorming:

- **`ui/` substructure:** domain-grouped (fx + credit + shell + admin), not flat-mirror, not minimal-three.
- **Bridge location:** split out of `app/` into `ui/hooks/`, not tolerated in `app/`, not collapsed entirely into `ui/`.
- **`fx/hooks/` placement:** co-located with the consuming `tile/` folder.
- **Entry point:** `main.tsx` stays at `src/main.tsx` (Vite convention); `App.tsx` moves to `ui/`.
- **Scope:** Phase 4 stays pure on the synthetic-gateway question; replacement deferred.

## References

- `docs/architecture.md` §1.3 Layered Architecture & Terminology
- `docs/architecture.md` §11 Key Files Reference (to be updated by this phase)
- `docs/superpowers/STATUS.md` (Phase 4 row, follow-up tracking)
- `docs/superpowers/specs/2026-05-01-phase-3-presenters-react-rxjs-design.md` (predecessor spec)
- `docs/superpowers/plans/2026-05-05-phase-3-presenters-react-rxjs-composition-root.md` (predecessor plan, executed `94d6f6e..3434bd7`)
