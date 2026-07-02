# `@rtc/client-prototype` P4 — Equities

**Date:** 2026-07-02
**Status:** Design — approved (scope + faithful div-based chart settled with @nasantsogt)
**Author:** Claude
**Parent spec:** `docs/superpowers/specs/2026-06-30-client-prototype-design.md` (§6 build order)
**Prior phases:** P2 FX core — `2026-07-01-client-prototype-p2-fx.md` (merged, PR #72 `988d949c`);
P2.5 FX aside — `2026-07-01-client-prototype-p2_5-fx-aside.md` (merged, PR #80 `dda0863d`);
P3 Credit — `2026-07-02-client-prototype-p3-credit.md` (merged, PR #84 `2fdaed8b`)

## 1. Purpose

P4 delivers the **Equities trading surface** of the readable prototype port: a
**candlestick chart** (instrument tabs + timeframe pills + live instrument header),
an **Orders / Positions blotter**, an **Order Ticket** form (market fills instantly,
limit orders sit "Working"), and a **Watchlist** with live-flashing prices and a
FLIP rank-glide on re-sort — all inside an Equities dock that mirrors the FX and
Credit docks (drag-resize splits, per-panel maximize, collapse-to-strip).

It replaces the `equities` tab's `PlaceholderPanel` (wired in `AppShell.tsx`) with a
live `EquitiesScreen`. The other placeholder tab (admin) is untouched.

Unlike P3, P4 introduces **no shared-layout work**: the generic dock primitives
already live in `src/layout/` (`Panel`, `SplitHandle`, `useSplit`, `useMaxPanel`)
from P3, and `motion/useFlip` is already shared. P4 is purely additive — a new
self-contained `src/equities/` feature module consuming those primitives as-is.

Source of truth: the prototype `<section data-screen-label="Equities">` (markup lines
~596–685) and the `class Component` equities logic (`selectEq` / `closeEqTab` /
`setTf` / `cycleWlSort` / `ticketSet` / `ticketQtyStep` / `submitOrder`, the equities
view-model builders `watchlist` / `inst` / `chartCandles` / `chartGrid` /
`chartLabels` / `ticket` / `eqOrders` / `eqPositions`, and the `eqMeta` / `genCandles`
seed) in `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html`.

## 2. Scope

### In scope (single phase P4)

- **Equities dock**, hand-wired for Equities: a center column (**Chart** panel `/`
  H-split `/` **Orders/Positions blotter** panel) `│` V-split `│` a right aside
  (**Order Ticket** panel `/` H-split `/` **Watchlist** panel). Faithful pointer-drag
  resize on all three splits (via the shared `useSplit`), per-panel maximize on all
  four panels, and the right aside's collapse-to-strip (see §3).

- **Chart panel** — a head carrying the **open-instrument tabs** (each a symbol with a
  close ✕), a maximize glyph, and **1D / 1W / 1M / 3M** timeframe pills; a body with
  a live **instrument header** (symbol, name · exchange, last price with up/down flash,
  absolute + percent change, BID / ASK / DAY RANGE / VOL) above a **candlestick
  chart** — faithful div-based candles (wick + body per candle), horizontal grid
  lines, and right-edge price labels. The last candle tracks the live price and
  glows on a tick.

- **Order Ticket panel** — a BUY / SELL side toggle; a Market / Limit order-type
  toggle; a Quantity stepper (−/+ by 10, plus a digits-only text input); a Limit Price
  input shown only for Limit orders; a summary box (Est. Cost, a static Buying Power
  "$250,000", a static Time in Force "Day"); and a SUBMIT button labelled
  "BUY <sym>" / "SELL <sym>". A submit shows a transient "✓ …" confirmation flash.

- **Orders / Positions blotter** — a head with **Orders ▤ / Positions ◴** tabs, a
  count label, and a maximize glyph. **Orders** is a 7-column grid (Time, Symbol,
  Side, Type, Qty, Price, Status); a newly-submitted order flashes in
  (`rowIn` + `rowFlashA/B`, `--rowAcc` by side). **Positions** is a 6-column grid
  (Symbol, Qty, Avg Px, Last, Mkt Value, P/L), **derived** from filled orders. Both
  have sticky headers and empty states ("No orders — submit one from the ticket" /
  "No open positions").

- **Watchlist panel** — a head with the active-panel title, a **sort-cycle** button
  (A–Z → % CHG → PRICE, default % CHG), a decorative ⊕ add glyph, and a maximize
  glyph; a body of rows (symbol + name on the left, last + percent-change on the
  right, coloured by direction). The selected symbol is highlighted; a price tick
  briefly tints the row; rows **glide by rank-delta on re-sort** (FLIP).

- **Live price engine** (`useEquities`) — an FX-style seeded random walk over the 8
  equity symbols driving `rates` / `prev` / `flash` (see §4.2). This is the analogue
  of `useFxRates`, not new machinery.

- **Order flow** (`useEqTicket` + `submitOrder`) and **derived positions**
  (`positionsVm`) — the one piece of genuinely Equities-specific behavior (see §4.3).

- **Motion** — reuse `motion/useFlip` (native WAAPI) to glide watchlist rows on
  re-sort (`[data-watch-sym]`), matching the FX Live-Rates / Credit RFQ glide. Price
  flashes on the watchlist rows, the instrument header, and the last candle reuse the
  CSS keyframes already present in `global.css`; the order-row flash reuses
  `rowIn` / `rowFlashA/B` / `--rowAcc` (shared with the Credit / FX blotters).

### Explicitly out of scope

- **No real matching / execution engine.** Market orders fill instantly at the live
  price; Limit orders are recorded "Working" and never fill (faithful — the prototype
  has no working-order fill logic). Do not add partial fills, cancels, or a limit-book.
- **No add-to-watchlist.** The ⊕ glyph is **decorative** (the prototype's `addBtnStyle`
  span has no handler). The watchlist is the fixed set of 8 `eqMeta` symbols. Do not
  wire an add flow.
- **Event log (`logEvt`).** No Equities panel renders an activity feed; Equities
  actions do **not** push entries to FX's Activity feed. Omit `logEvt` entirely (P2/P3
  precedent).
- **No persistence of orders / ticket / chart selection.** Only the split ratios and
  `maxPanel` persist (through the shared layout). Orders, ticket, selected symbol,
  open tabs, and timeframe are in-memory and reset on reload — matching the prototype,
  which persists none of them.
- **StatusBar P&L** stays as-is; Equities does not touch it.
- **No audio** (P1 precedent — no audio in-package).
- **Display fonts** (Orbitron for the instrument-symbol lede) fall back to system
  stacks (real font loading lands in P6 parity).

## 3. Fidelity notes (do not "fix" these — they match the prototype)

- **Right aside collapses only via maximize.** Maximizing the Chart or the Orders/
  Positions blotter (the two "wide" center panels) collapses the **entire right
  aside** to a two-bar vertical strip ("⛶ ORDER TICKET" / "⛶ WATCHLIST"); clicking
  either bar restores by clearing `maxPanel`. Maximizing the Order Ticket or the
  Watchlist instead grows that panel within the aside and collapses only its aside
  **sibling** (the center column is untouched). There is no independent collapse
  toggle. So `useEqDock` is `maxPanel` + `toggleMax` + a derived `rightCollapsed`
  (`maxPanel === "chart" || maxPanel === "eblot"`) + `restore()`. All four panels are
  maximizable — this differs from the Credit dock, whose left form is not.
- **BID / ASK are `last ∓ 0.03`**; **DAY RANGE** is the min-low … max-high of the
  current candle series (including the live last price); these are deterministic.
- **VOL is a per-symbol constant** `(2.4 + rng()·0.2)` — the prototype recomputes it
  with `Math.random()` on every render (visible jitter). For a readable, render-pure
  port this is drawn **once per symbol** from the seeded RNG at seed time and held
  stable. This is the sole deliberate deviation, and it removes a render-purity smell
  rather than adding one.
- **Timeframe candle configs** (bars, volatility): `1D`→`[40, 0.004]`, `1W`→`[44,
  0.009]`, `1M`→`[48, 0.016]`, `3M`→`[52, 0.03]`. A series starts at
  `eqMeta[sym].px · (1 − vol·6)` and walks `n` bars; each bar
  `o = prevClose`, `c = o·(1 + (rng()−0.48)·vol·2)`, `h = max(o,c)·(1 + rng()·vol)`,
  `l = min(o,c)·(1 − rng()·vol)`. Regenerated on symbol-select and timeframe-change.
- **Chart geometry** (faithful): with `cmin`/`cmax` the series low/high and
  `crng = (cmax − cmin) || 1`, `yPct(p) = ((cmax − p) / crng)·86 + 6`; candle `i` sits
  at `x = (i + 0.5)·(100/n)%`, body width `= (100/n)·0.64%`, body height
  `= max(0.6, |yPct(o) − yPct(c)|)%`, wick from `yPct(h)` to `yPct(l)`, width `1px`;
  up candles use `--buy`, down `--sell`. Grid lines at `20/40/60/80%`; price labels at
  `12/37/62/87%` reading `(cmax − f·crng)`.
- **The last candle is live.** Rather than mutating the stored series each tick (the
  prototype does `last.c = nv` in place), the immutable series is generated once per
  (symbol, timeframe) and the chart VM overlays the current price onto the last bar at
  render (`c = rate`, `h = max(seriesHigh, rate)`, `l = min(seriesLow, rate)`). This
  is behavior-identical and keeps `genCandles` a pure function.
- **Price walk:** per tick, `dlt = rate·(rng()−0.5)·0.0016`; `nv = +(rate + dlt)`
  rounded to 2 dp; `prev += (nv − prev)·0.12` (a smoothing baseline for the % change);
  `flash = { dir: dlt ≥ 0 ? 1 : −1, ts }`. `prev` seeds at
  `px·(1 − (rng()−0.4)·0.02)`.
- **Orders cap at 40**, newest first; `Market` → `Filled`, `Limit` → `Working`; fill /
  limit price is the live price (or the parsed limit for a Limit order). The ticket
  flash clears after ~2.4 s. Order id sequence starts at `5001`.
- **Positions are derived, not stored:** aggregate **filled** orders by symbol
  (`Buy` = +qty, `Sell` = −qty); drop net-zero symbols; `avg = cost/qty`,
  `mv = qty·last`, `pl = mv − cost`.
- **Watchlist default sort is % CHG**; the cycle is A–Z → % CHG → PRICE. Selecting a
  row (in the watchlist or opening a tab) sets the chart symbol and adds a tab if
  absent. Closing the selected tab falls back to the last remaining tab.
- **Seed state:** 8 `eqMeta` instruments (AAPL 229.35, MSFT 467.12, NVDA 131.26,
  TSLA 251.44, AMZN 218.07, GOOGL 178.53, META 591.80 — all NASDAQ — and SPY 588.21
  NYSE ARCA). Default selected `AAPL`, one open tab `AAPL`, timeframe `1D`, **no**
  seeded orders (the blotter starts empty).

## 4. Architecture

Self-contained, matching the package's standing decisions: **no** `@rtc/domain` /
`@rtc/shared`, **no** RxJS / machines, **no** ViewModel seam, **no** React Compiler;
full CSS Modules (static class / semantic `data-*` / `--custom-property` geometry);
native WAAPI + Canvas; smoke-only Vitest. Per-feature folder = dumb components +
co-located mock hooks + seed data. Panels here have **interactive heads** (tabs,
pills, sort control), so they follow the **FX head-model** (`Panel head={<…/>}` with
rich content), not the Credit outer-label model.

### 4.1 Directory layout

**Reused shared (already on `main` from P3 — imported, not modified):**
`src/layout/{Panel,SplitHandle,useSplit,useMaxPanel}`, `src/motion/useFlip`,
`src/mock/rng` (`mulberry32`), `src/shell/Preferences/usePreferences` (reduceMotion).

**Equities (new `src/equities/`):**

```
  equities/
    EquitiesScreen.tsx  + .module.css   # composes the dock; owns the 4 hooks
    types.ts                            # EqSym, Candle, Timeframe, OrderSide, OrderType,
                                        #   EqOrder, EqPosition, EqTicket, WlSort
    equitiesData.ts                     # EQ_META(8), EQ_SYMS, genCandles, TF configs,
                                        #   constants, fmtNum, seedVols
    useEquities.ts                      # the price engine (see §4.2)
    useEqChart.ts                       # eqSel, openTabs, tf, series, wlSort + actions
    useEqTicket.ts                      # ticket state + submitOrder → orders (see §4.3)
    useEqDock.ts                        # maxPanel (via useMaxPanel) + rightCollapsed + splits
    chartVm.ts                          # pure candle→geometry (bodies/wicks/grid/labels)
    positionsVm.ts                      # pure filled-orders → EqPosition[]
    watchlistVm.ts                      # pure rows (sorted, flash, selected) for the panel
    Chart/
      ChartPanel.tsx      + .module.css # head (tabs + maximize + tf pills) + body
      InstrumentTabs.tsx  + .module.css # open-tab strip with close ✕
      InstrumentHeader.tsx + .module.css# sym/name/exch, last+chg, bid/ask/range/vol
      CandleChart.tsx     + .module.css # grid + labels + candles container
      CandleBars.tsx      + .module.css # faithful div wick+body per candle
      TimeframePills.tsx  + .module.css # 1D/1W/1M/3M
    Ticket/
      OrderTicketPanel.tsx + .module.css# side/type/qty/limit/summary/submit/flash
    Blotter/
      EqBlotterPanel.tsx  + .module.css # head (Orders/Positions tabs) + body
      OrdersTable.tsx     + .module.css # 7-col grid + empty state
      PositionsTable.tsx  + .module.css # 6-col grid + empty state
    Watchlist/
      WatchlistPanel.tsx  + .module.css # head (sort cycle, ⊕, maximize) + rows
      WatchlistRow.tsx    + .module.css # one row (sym/name + last/chg, flash)
```

`equities/` is **hand-wired for Equities** (its 4-panel dock shape differs from FX and
Credit); only the generic primitives live in `src/layout/`. Per the self-containment
rule it imports **nothing** from `fx/` or `credit/`.

### 4.2 `useEquities` — the price engine

Mirrors `useFxRates`'s discipline exactly (it is the same shape of hook, one screen
over): an injectable `rng: () => number` (default `Math.random`) held in a `useRef`;
an `intervalMs` option; a `walkTick(prev, rng)` **pure** function stamping
`ts = Date.now()` on each `flash`; a tracked timer set cleared on unmount;
**RNG never runs inside a `setState` updater** (the StrictMode lesson — the updater
consumes `rngRef.current` computed outside, or the tick reads the ref inside the
`setInterval` callback exactly as `useFxRates` does).

State: `rates: Record<EqSym, number>`, `prev: Record<EqSym, number>`,
`flash: Record<EqSym, { dir: 1 | -1; ts: number }>`, and a stable
`vol: Record<EqSym, string>` seeded once. No global `now` ticker: flashes are CSS
animations retriggered when `flash.ts` changes (the `useFxRates` / `RateTile`
pattern), so they self-expire without a per-frame clock.

Returned API (consumed by chart header, watchlist, ticket fill price):
`{ rates, prev, flash, vol }`.

### 4.3 Order flow — `useEqTicket` + derived positions

- **`useEqChart`** owns instrument-view state: `sel: EqSym`, `openTabs: EqSym[]`,
  `tf: Timeframe`, `wlSort: WlSort`, and the immutable candle **series**
  (`Record<EqSym, Candle[]>`), regenerated for a symbol on select / timeframe-change
  via `genCandles(sym, tf, rng)`. Actions: `selectEq`, `closeTab`, `setTf`,
  `cycleWlSort`. The seeded RNG lives in a `useRef` (never resynced).
- **`useEqTicket(sel, rates)`** owns the ticket form (`side`, `type`, `qty`, `limit`)
  and the **orders** list. `submitOrder()` reads the live `rates[sel]`, computes the
  fill/limit price, assigns the next id from an `eqSeqRef`, prepends the `EqOrder`
  (capped at 40), sets `newOrderId`, and shows `ticketFlash` (cleared by a **tracked**
  `setTimeout` ~2.4 s later — cleared on unmount). `Market` → `Filled`, `Limit` →
  `Working`. Qty is digits-only; the ±10 stepper clamps at 0. Validity: `qty > 0`.
- **`positionsVm(orders, rates)`** — a pure function: fold **filled** orders into a
  per-symbol `{ qty, cost }`, drop net-zero symbols, map to `EqPosition`
  (`avg`, `mv`, `pl`, `plColor`). Unit-tested directly.
- **`chartVm(series[sel], liveRate, flashOn)`** and **`watchlistVm(rates, prev, flash,
  sel, wlSort)`** are pure builders converting engine state into render-ready view
  models (geometry custom-props; sorted flashing rows), keeping the components thin.

### 4.4 The Equities dock

Faithful defaults (prototype line 824): `eqAsideW: 290` (right-aside width via the
V-split, min 240 / max 420, drag inverted), `eqCenterR: 0.66` (Chart vs blotter in
the center column), `eqRightR: 0.5` (Ticket vs Watchlist in the aside).
`maxPanel: EqPanelId | null` where `EqPanelId = "chart" | "eblot" | "ticket" |
"watch"`, via `useMaxPanel("rt_eq_maxPanel", EQ_PANEL_IDS)`.

- The three splits use the shared `useSplit` (each persisted to localStorage under its
  own key).
- Maximize sets `data-max` on the target Panel; CSS grows it and collapses its
  in-column sibling. When the maximized panel is a wide center panel (`chart` /
  `eblot`), `rightCollapsed` is true and the aside renders the two-bar restore strip
  instead of the ticket + watchlist.

### 4.5 Data & types (`types.ts` / `equitiesData.ts`)

- `EqSym = "AAPL" | "MSFT" | … | "SPY"` (the 8 keys of `EQ_META`);
  `Timeframe = "1D" | "1W" | "1M" | "3M"`;
  `OrderSide = "Buy" | "Sell"`; `OrderType = "Market" | "Limit"`;
  `WlSort = "sym" | "chg" | "price"`.
- `Candle { o: number; h: number; l: number; c: number }`.
- `EqMeta { name: string; exch: string; px: number }` — 8 seeded (exact names,
  exchanges, prices from the prototype `eqMeta`).
- `EqOrder { id; time; sym; side; type; qty; price; status: "Filled" | "Working" }`.
- `EqPosition { sym; qty; avg; last; mv; pl; plColor }` (render-ready strings).
- `EqTicket { side; type; qty; limit }`.
- `genCandles(sym, tf, rng)` and small formatters (`fmtNum` thousands) are defined
  **locally in `equitiesData.ts`** — Equities stays self-contained. Do **not** import
  from `fx/` or `credit/`, do **not** refactor their data modules, and do **not**
  introduce a shared `format` module in P4 (YAGNI; extract only if a later phase
  genuinely shares it).

## 5. Testing — smoke-only Vitest (mirrors `fx-*.test`)

`@testing-library/react`, explicit `cleanup()` in `afterEach`, injected `mulberry32`
RNG + Vitest fake timers where timing matters. House pattern for interactive
components: `renderHook(() => useX())` + `render(<Comp api={result.current}/>)` +
`rerender` (avoids the `useComponentExportOnlyModules` ↔ `noExportsInTest` conflict —
no test-file component, no lint disables).

- `equities-data.test.ts` — `EQ_META` / `EQ_SYMS` shapes; `genCandles` is
  deterministic under a seeded RNG and honours the per-timeframe bar counts.
- `equities-engine.test.ts` — the walk, with injected rng + fake timers: `rates`
  move; `flash.dir` matches the tick sign; `prev` smooths toward `rates`; `vol` is
  stable across ticks.
- `eq-chart-hook.test.ts` — `selectEq` adds a tab + sets `sel`; `closeTab` on the
  selected symbol falls back to the last tab; `setTf` regenerates the series;
  `cycleWlSort` cycles sym → chg → price.
- `eq-ticket.test.ts` — `submitOrder` on Market → a `Filled` order at the live price;
  on Limit → a `Working` order at the limit; qty stepper clamps at 0; orders cap at
  40; `submitOrder` with qty 0 is a no-op.
- `positions-vm.test.ts` — a Buy then a larger Sell nets to a short position with the
  right avg / mv / pl; net-zero symbols drop out.
- `chart-vm.test.ts` — bodies/wicks land within 0–100%; the last bar reflects the live
  rate; grid lines and price labels have the expected counts/values.
- `eq-chart.test.tsx` / `eq-ticket.test.tsx` / `eq-blotter.test.tsx` /
  `eq-watchlist.test.tsx` — each panel renders from a seeded hook; the blotter shows
  the Orders empty state then a submitted row, and the Positions view after a fill;
  the watchlist highlights the selected symbol and re-sorts on the cycle button.
- `eq-dock.test.ts` — maximizing `chart` sets `rightCollapsed` and renders the aside
  strip; maximizing `ticket` does not; the strip restore clears `maxPanel`.
- `equities-screen.test.tsx` — composes the four panels; a submit-from-ticket flow
  renders a new order row (`[data-order-id="5001"]`).

## 6. Global constraints (bind every task)

- **Package self-containment:** no `@rtc/domain` / `@rtc/shared`, no RxJS, no
  machines, no ViewModel seam, no React Compiler. Feature folders do not import across
  each other (`equities/` must not import from `fx/` or `credit/`, and vice-versa);
  shared code lives in `src/layout/`, `src/motion/`, `src/mock/`, or a small top-level
  util.
- **CSS-Modules taxonomy:** static → class; semantic state → `data-*` (stringify with
  `String(bool)` — never inline colour strings); runtime geometry → a **named-const**
  `style={x}` object typed `as CSSProperties` that sets only a `--custom-property`
  (the sanctioned escape hatch — no `eslint-disable`, since the inline-style ban
  matches object literals only). Every candle's geometry goes through this hatch.
- **Render purity (StrictMode):** the seeded RNG lives in a `useRef` and is never
  resynced; RNG and persistence never run inside a `setState` updater; all timers are
  tracked in a `useRef<Set<…>>` and cleared on unmount.
- **Lint/format rules that have bitten prior phases:** `arrow-body-style: always`
  (every arrow, including `.map`/`.find` callbacks and `rng: () => {…}`);
  `rtc/newspaper-order` (types/helpers/`vi.mock` below `describe`);
  `rtc/component-newspaper` (exported component is the lede, filename matches);
  `useUniqueElementIds` (any element/SVG `id` uses `useId()`, and logical panel ids in
  tests use a bottom `const` var); `useExplicitType` (consts with
  non-literal-inferrable initializers get an explicit annotation); module-level
  functions are `function` declarations.
- **The gate for every task is:** `pnpm --filter @rtc/client-prototype typecheck` ·
  `pnpm --filter @rtc/client-prototype test` · `pnpm exec eslint packages/client-prototype`
  · `pnpm exec stylelint "packages/client-prototype/src/**/*.css"` · **`pnpm exec
  biome ci packages/client-prototype`** (format + lint — the P2.5 lesson: eslint alone
  misses format diffs, `useUniqueElementIds`, and `useExplicitType`). CI also runs
  repo-wide `lint:dead` (knip), `check:deps`, `check:versions`, `test:rules` — keep
  exports consumed (drop `export` on structurally-only types) and paths clean.
- **Never `git add .`** — stage only exact named files (no `.superpowers/`, `.idea/`,
  `.env.local`, or scratch).

## 7. Suggested task decomposition (for the plan)

1. **Equities types + data** — `types.ts`, `equitiesData.ts` (`EQ_META`, `genCandles`,
   TF configs, constants, `fmtNum`, seeded vols) (+ `equities-data` test).
2. **`useEquities`** — the price engine (walk / prev / flash / vol) (+ `equities-engine`
   test).
3. **`useEqChart`** — selection, tabs, timeframe, series regen, sort cycle
   (+ `eq-chart-hook` test).
4. **`chartVm` + `watchlistVm`** — the pure candle-geometry and watchlist-row builders
   (+ `chart-vm` test).
5. **Chart panel** — `ChartPanel` + `InstrumentTabs` + `InstrumentHeader` +
   `CandleChart` + `CandleBars` + `TimeframePills` (+ `eq-chart` test).
6. **Watchlist panel** — `WatchlistPanel` + `WatchlistRow` + FLIP rank-glide
   (+ `eq-watchlist` test).
7. **`useEqTicket` + `OrderTicketPanel`** — ticket state, `submitOrder`, flash
   (+ `eq-ticket` hook + component tests).
8. **`positionsVm` + Blotter panel** — `EqBlotterPanel` + `OrdersTable` +
   `PositionsTable` + derived positions (+ `positions-vm`, `eq-blotter` tests).
9. **`useEqDock` + `EquitiesScreen`** composition — dock, three splits, maximize,
   right-strip; wire engine → chart/watchlist → ticket → blotter (+ `eq-dock`,
   `equities-screen` tests).
10. **Shell wiring** — `AppShell.tsx` renders `<EquitiesScreen />` for the `equities`
    tab.

(Right-sizing is the plan's job; steps 5–9 may split or merge per reviewer-gate
boundaries.)
