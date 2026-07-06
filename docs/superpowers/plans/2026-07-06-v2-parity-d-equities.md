# v2 Parity D — Equities Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Equities screen to the prototype's dock — center **symbol header + candlestick chart** with instrument tabs (close ✕) and 1D/1W/1M/3M timeframe pills over an **Orders/Positions** blotter; right rail **Order Ticket** over **Watchlist** (price flash, rank glide, ⇅ sort) — replacing the flat `EquitiesPanel` grid (spec G3). Depth ladder and sector heatmap stay **registered panels outside the default layout** (spec decision).

**Architecture:** Port from `packages/client-prototype/src/equities/*` onto real seams: `useViewModel()` hooks backed by `WatchlistPresenter`/`CandleSeriesPresenter`/`OrdersBlotterPresenter`/`PositionsPresenter`/`OrderTicketMachine` and the `EquityMarketDataSimulator`/`EquityOrderSimulator`/`EquityPositionSimulator`. Cross-panel state (selected symbol, open tabs, timeframe) moves to a new client-core machine exposed via the ViewModel — panels are independent engine cells and cannot share React state. Timeframes become real data: `MarketDataPort.candles(symbol, timeframe)` in domain + wire + server.

**Tech Stack:** React 19, CSS Modules, @rtc/client-core machines, @rtc/domain simulators, @rtc/shared protocol, @rtc/ws-effects server, dual golden sets, Playwright e2e.

## Global Constraints

Same as plan C (cd-prefix every Bash command, branch assert, per-file biome + eslint×2, no lint-disables, no inline styles, pinned px line-heights, literal glyphs, coverage ≥95%, full-suite golden regens, x86 via workflow, knip, e2e in final gauntlet). Additional: domain stays rxjs-only; after widening domain types run a **workspace-wide catch-up** (wire DTOs, adapters, server effects, RN mobile compile) — the PR #105 lesson.

## Key seam facts

- ViewModel equities hooks today: `useWatchlist()`, `useEquityQuote(symbol)`, `useCandles(symbol)`, `useDepth(symbol)`, `useEquityOrders()`, `useEquityPositions()`, `useOrderTicket(defaultSymbol)`, `useAnimationIntents(target)`.
- Domain `Candle {time,open,high,low,close}` (prototype `{o,h,l,c}` — adapt in vm); order side/type lowercase (`"buy"|"sell"`, `"market"|"limit"`); `EquityOrder.status` 6-state (`new|working|partiallyFilled|filled|cancelled|rejected`) vs prototype `Filled|Working` — map for display; ids `eq-{n}` strings.
- Simulator symbols: AAPL/MSFT/TSLA/AMZN/JPM/XOM (6) — the real catalogue wins; do NOT import prototype symbol list.
- Wire: `CLIENT_MSG.GET_CANDLES "rpc.getCandles"` currently `{symbol}` payload; server effect `getCandles$` in `packages/server/src/effects/equities.effects.ts`; WS adapter path `createMarketDataPort` in `packages/client-core/src/adapters/portFactory.ts`.
- Prototype geometry vms are pure and portable: `chartVm` (price→y in [6%,92%], grid fractions [.2,.4,.6,.8], labels [.12,.37,.62,.87], CSS-var-driven `CandleBars`), `watchlistVm`, `positionsVm`; `useRankGlide` (WAAPI, jsdom-guarded try/catch, consts GLIDE_DUR_MS=560/HIGHLIGHT_DUR_MS=820).
- Head↔panel shared state: the `useViewModePreference` seam (FX pattern) for the blotter Orders/Positions toggle; the NEW equities workspace machine for symbol/tabs/timeframe.

---

### Task 1: Domain + wire — timeframe candles

**Files:**
- Modify: `packages/domain/src/ports/marketDataPort.ts` (`candles(symbol: string, timeframe?: CandleTimeframe)`), new `CandleTimeframe = "1D"|"1W"|"1M"|"3M"` in `packages/domain/src/equities/`, `EquityMarketDataSimulator.ts` (per-TF bucket count/step-vol per prototype `TF_CONFIG`: 1D {40, 0.004}, 1W {44, 0.009}, 1M {48, 0.016}, 3M {52, 0.03}; seeded, deterministic), port contract `packages/domain/src/ports/__contracts__/MarketDataPortContract*.ts`
- Modify: `packages/shared/src/protocol/messages.ts` (GET_CANDLES payload gains `timeframe`), `packages/server/src/effects/equities.effects.ts` (`getCandles$` threads timeframe), `packages/client-core/src/adapters/portFactory.ts` (both sim + WS paths), `CandleSeriesPresenter.ts` (`candles$(symbol, timeframe)`), `createViewModel.ts` (`useCandles(symbol, timeframe)`)
- Test: simulator contract + golden tests (existing `equitiesGbm.golden.test.ts` must stay green for default "1D" — default parameter preserves current behaviour), server effect test, presenter test, workspace-wide typecheck catch-up

**Interfaces:** `candles(symbol, timeframe = "1D")` — snapshot-then-complete semantics unchanged. Bucket duration scales with TF (1D=60s buckets as today; 1W/1M/3M longer buckets, same GBM, distinct seed per TF so charts differ).

- [ ] Failing port-contract + simulator tests for non-default TFs → implement → green across workspace (`pnpm typecheck && pnpm test`) → commit `feat(domain): timeframe-parameterised candle series`.

### Task 2: Equities workspace machine (cross-panel state)

**Files:**
- Create: `packages/client-core/src/presenters/EqWorkspaceMachine.ts` + test
- Modify: `packages/react-bindings/src/createViewModel.ts` (+ test) — `useEqWorkspace(): { state: EqWorkspaceState } & EqWorkspaceIntents`

**Interfaces:**
```ts
interface EqWorkspaceState { sel: string; openTabs: readonly string[]; timeframe: CandleTimeframe }
interface EqWorkspaceIntents { select(sym): void; closeTab(sym): void; setTimeframe(tf): void }
```
Follow the existing `Machine<S, I>` pattern (see `OrderTicketMachine.ts`, `IncidentMachine.ts`). `select` adds to `openTabs` if absent (prototype behaviour); `closeTab` removes and falls back selection to the last remaining tab (never empties — keep ≥1). Initial: first watchlist symbol, `"1D"`. Machine is composition-root singleton (survives panel remounts — the PR #118 refCount lesson applies to any stream it exposes).

- [ ] Failing machine tests (select/close/fallback/tf) → implement → green → commit `feat(client-core): equities workspace machine`.

### Task 3: Chart panel port (header + candles + tabs + pills)

**Files:**
- Create: `packages/client-react/src/ui/equities/chart/ChartPanel.tsx` + `.module.css`, `InstrumentHeader.tsx` + `.module.css`, `CandleChart.tsx` + `.module.css`, `CandleBars.tsx` + `.module.css`, `TimeframePills.tsx` + `.module.css`, `chartVm.ts`, `EqChartHead.tsx` (head: instrument tabs w/ ✕ + timeframe pills)
- Modify: `packages/client-react/src/ui/equities/tabs/InstrumentTabs.tsx` (close ✕, `stopPropagation`, tabs from workspace machine)
- Delete (Task 6 confirms): `chart/PriceChart.tsx`, `chart/drawCandles.ts`
- Port source: `packages/client-prototype/src/equities/Chart/*`, `chartVm.ts`
- Test: contract specs `.../specs/equities/chart/`

**Interfaces:** `InstrumentHeader` shows big last (`data-flash`/`data-dir` on tick), abs+pct change, BID/ASK (from `useEquityQuote` — real bid/ask, NOT the prototype's ±0.03 offsets), DAY RANGE (candle series min–max incl. last), VOL (derive from quote/candles; static formatted string acceptable). `CandleChart`/`CandleBars` are DOM+CSS-var (`--x/--top/--h/--w`, `data-up`/`data-last`/`data-glow`) driven by `chartVm(candles, liveLast, flashOn)` adapted to domain `Candle`. Pills `data-tf`/`data-active` → `setTimeframe`.

- [ ] Failing contract tests (vm geometry pure tests + header fields + pill/tab intents) → implement → green → commit `feat(equities): prototype chart panel`.

### Task 4: Order ticket + watchlist ports (right rail)

**Files:**
- Modify: `packages/client-react/src/ui/equities/ticket/OrderTicket.tsx` + `.module.css` (prototype visuals on existing `useOrderTicket` machine: BUY/SELL `data-side`, Market/Limit, qty stepper −/+ (±10), conditional limit input, summary rows Est. Cost `qty×price` / Buying Power `$250,000` / Time in Force `Day`, big accent CTA `data-side`, transient fill flash via existing `data-anim`)
- Create: `packages/client-react/src/ui/equities/watchlist/WatchlistPanel.tsx` + `.module.css`, `WatchlistRow.tsx` + `.module.css`, `useRankGlide.ts`, `watchlistVm.ts`, `EqWatchlistHead.tsx` (⇅ sort-cycle control: A–Z / % CHG / PRICE), `EqTicketHead.tsx`
- Delete (Task 6): old `watchlist/Watchlist.tsx`, `watchlist/SectorHeatmap.tsx` stays as component (registered panel `eq-sectors`)
- Port source: `packages/client-prototype/src/equities/{Ticket,Watchlist}/*`, `watchlistVm.ts`
- Test: contract specs; rank-glide unit test (`computeRankDirections` pure)

**Interfaces:** watchlist rows from `useWatchlist()` + `useEquityQuote(sym)` (`changePct` real), `data-flash`/`data-up` on tick, `data-selected` from workspace machine, click → `select(sym)`; rank glide keyed `[data-watch-sym]`, gated on `prefers-reduced-motion` (app has no reduceMotion pref seam — use the media query, matching FX FLIP). Sort state is head↔panel shared → `useViewModePreference`-style key `"eq-watchlist-sort"`.

- [ ] Failing contract tests (stepper ±10 floor 0; est-cost formula; sort cycle order sym→chg→price; row select intent) → implement → green → commit `feat(equities): prototype ticket + watchlist rail`.

### Task 5: Blotter port (Orders/Positions tabs)

**Files:**
- Create: `packages/client-react/src/ui/equities/blotter/EqBlotterPanel.tsx` + `.module.css`, `OrdersTable.tsx` + `.module.css`, `PositionsTable.tsx` + `.module.css`, `EqBlotterHead.tsx` (▤ Orders / ◴ Positions tabs + live counts)
- Modify/absorb: existing `OrdersBlotter.tsx`/`PositionsBlotter.tsx` content; keep `DeskPnlGauge` + `PnlSparkline` inside the positions view (restyled to prototype card tone — capability-showcase keep)
- Port source: `packages/client-prototype/src/equities/Blotter/*`, `positionsVm.ts`
- Test: contract specs (status display map: new/working→`Working`, partiallyFilled→`Partial`, filled→`Filled`, cancelled/rejected verbatim; `--row-acc` side accent; `data-new` flash on latest order)

**Interfaces:** orders from `useEquityOrders()` (headers Time/Symbol/Side/Type/Qty/Price/Status; Time from `createdAt` HH:MM:SS); positions from `useEquityPositions()` (headers Symbol/Qty/Avg Px/Last/Mkt Value/P/L; P/L color `--pl` by sign). Tab state via `useViewModePreference`-style key `"eq-blotter-view"`.

- [ ] Failing contract tests → implement → green → commit `feat(equities): prototype Orders/Positions blotter`.

### Task 6: Layout flip, registries, retirement

**Files:**
- Modify: `packages/client-core/src/layout/defaultLayoutPort.ts` (+ fixture test), `appPanelRegistry.tsx`, `appHeadRegistry.tsx`
- Delete: `EquitiesPanel.tsx` + `.module.css`, `PriceChart.tsx`, `drawCandles.ts`, old `Watchlist.tsx`, their specs/page objects/visual entries
- Test: layout fixture + full unit/contract sweep

**Interfaces:**
```ts
const EQUITIES_ROOT: LayoutNode = {
  kind: "split", dir: "row", sizes: [0.78, 0.22],
  children: [
    { kind: "split", dir: "column", sizes: [0.66, 0.34], children: [
      { kind: "panel", panelId: "eq-chart" },
      { kind: "panel", panelId: "eq-blotter" },
    ]},
    { kind: "split", dir: "column", sizes: [0.5, 0.5], children: [
      { kind: "panel", panelId: "eq-ticket" },
      { kind: "panel", panelId: "eq-watchlist" },
    ]},
  ],
};
```
`PANEL_SPECS`: add `eq-chart` ("Equities"), `eq-blotter` ("Orders & Positions"), `eq-ticket` ("Order Ticket"), `eq-watchlist` ("Watchlist"), `eq-depth` ("Depth", DepthLadder — registered, NOT in root), `eq-sectors` ("Sectors", SectorHeatmap — registered, NOT in root); remove old `equities` spec. Heads registered for the four default panels.

- [ ] Failing layout fixture → flip → sweep green → commit `feat(equities): four-panel dock layout`.

### Task 7: e2e migration + visual scenarios + gauntlet + PR

- [ ] Update `tests/browser/page-objects/contracts/testids.ts` + fullstack spec + any equities page objects (grep `instrument-tab`, `order-ticket`, `order-row`, `position-row` across `tests/` — the testids themselves are preserved where components survived; layout-level selectors change).
- [ ] Visual scenarios: replace `equities/*` + `app/equities` entries for new components (keep `equities/depth-ladder` + `equities/sector-heatmap` — components still registered); FULL-SUITE local golden regen.
- [ ] Full gauntlet + knip + `RTC_E2E_SKIP_CYPRESS=1 test:e2e`; live side-by-side vs :8899 Equities incl. drag/maximize on the new tree.
- [ ] Push, PR (base main), x86 golden workflow, sync, CI loop per shipping-repo-changes.
