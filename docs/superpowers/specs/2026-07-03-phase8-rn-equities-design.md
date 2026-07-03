# Phase 8 — React Native Equities — Design Spec

**Date:** 2026-07-03
**Package:** `@rtc/client-react-native`
**Status:** Approved (design)

## Goal

Port the web equities workspace (`packages/client-react/src/ui/equities/`) to the
React Native / Expo client as a new **Equities** screen — the roadmap's final
feature phase. Full parity: instrument overview, market data, order entry, and
blotters.

## Invariants — Pure View + one contained shell change

This is a **Pure View** phase (plus one contained shell change), continuing the
run of state-reuse phases. All seven equities ViewModel hooks are already bound
in `@rtc/react-bindings`, and `buildNativePorts` already wires the equities ports
into the native composition.

- **No changes** to `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`, or
  the web `@rtc/client-react`.
- **No new runtime dependencies.** `react-native-svg` (already used by PnlChart,
  ExposureBubbles, LockScreen) is the vector-drawing primitive — every web
  `<canvas>` / SVG becomes `react-native-svg`, exactly as Phase 4 did.
- The **only** non-view change is relocating the Appearance screen off the bottom
  tab bar (below), a small, contained shell change.

## Reused ViewModel hooks (already bound)

Accessed via `const { ... } = useViewModel()` from `@rtc/react-bindings`:

| Hook | Signature | Feeds |
| --- | --- | --- |
| `useWatchlist()` | `() => readonly EquityInstrument[]` | Watchlist, SectorHeatmap, InstrumentTabs |
| `useEquityQuote(symbol)` | `(string) => EquityQuote \| null` | WatchlistRow, HeatCell |
| `useCandles(symbol)` | `(string) => readonly Candle[]` | PriceChart |
| `useDepth(symbol)` | `(string) => DepthBook \| null` | DepthLadder |
| `useEquityOrders()` | `() => readonly EquityOrder[]` | OrdersBlotter |
| `useEquityPositions()` | `() => readonly EquityPosition[]` | PositionsBlotter, DeskPnlGauge, PnlSparkline |
| `useOrderTicket(defaultSymbol)` | `(string) => UseOrderTicketResult` | OrderTicket |

Nothing in the native composition (`AppRoot` / `buildNativePorts`) changes.

## Layout — three segmented sub-views

The web equities panel is a desktop multi-panel workspace; a phone cannot show it
all at once. `EquitiesScreen` owns two pieces of state — `selectedSymbol`
(shared) and the active sub-view — and switches between three views via an
`EquitiesNav` segmented control, mirroring Phase 7's `CreditNav`
(testID `equities-tab-${view}`, where `view ∈ "markets" | "trade" | "blotters"`).

```
EquitiesScreen  (useWatchlist; owns selectedSymbol + view; testID equities-screen)
├─ EquitiesNav                       Markets │ Trade │ Blotters
├─ MarketsView
│   ├─ Watchlist → WatchlistRow      (useEquityQuote per row; heat colour)
│   └─ SectorHeatmap → HeatCell      (useEquityQuote per cell; heat colour)
│        tapping a row/cell sets selectedSymbol and switches to Trade
├─ TradeView   (empty-prompt when selectedSymbol is null)
│   ├─ InstrumentTabs                horizontal quick-switch strip
│   ├─ PriceChart      (useCandles)  SVG candlesticks
│   ├─ DepthLadder → DepthRow (useDepth)  bid/ask book with depth bars
│   └─ OrderTicket     (useOrderTicket)   6-phase lifecycle form
└─ BlottersView
    ├─ Orders │ Positions inner toggle
    ├─ OrdersBlotter     (useEquityOrders)
    └─ PositionsBlotter  (useEquityPositions)
        ├─ DeskPnlGauge   SVG semicircle gauge
        └─ PnlSparkline   SVG per-row bar
```

### View behaviours (ported from web)

- **Markets.** Watchlist rows and heatmap cells each mount their own
  `useEquityQuote(symbol)` (hooks live at component top level — the web
  parent/child split is preserved). Heat is `min(1, abs(changePct) / 10)` and
  drives a background-colour intensity + up/down direction. Sector grouping uses
  a static `SECTOR_MAP`. Tapping a row/cell sets `selectedSymbol` and switches to
  the Trade view.
- **Trade.** Requires a `selectedSymbol`; when null, shows an empty prompt
  ("Select an instrument from Markets"). `InstrumentTabs` is a compact horizontal
  strip to switch symbol without leaving the view. `PriceChart` renders
  candlesticks via SVG. `DepthLadder` reverses asks (lowest ask at the bottom),
  slices to 8 levels per side, normalises bar width by `maxSize`. `OrderTicket`
  renders the 6-phase lifecycle (editing → submitting → working → partiallyFilled
  → filled → rejected) and dispatches through `useOrderTicket`.
- **Blotters.** An inner Orders/Positions toggle. `OrdersBlotter` is a read-only
  table (SYMBOL/SIDE/TYPE/QTY/PRICE/STATUS). `PositionsBlotter` shows
  SYMBOL/QTY/AVG/MARK/UPNL/SPARK, a per-row `PnlSparkline`, and a `DeskPnlGauge`
  summarising total desk PnL. Sparkline + gauge normalise by `maxAbsPnl`.

## Charting — canvas/SVG ported to `react-native-svg`

The web `PriceChart` uses `<canvas>` + `drawCandles`; RN has no canvas, so the
**math** is ported to a pure geometry util and the **draw** is declarative SVG
(the Phase 4 pattern, and how PnlChart already works).

Pure utils (react-native-free, unit-tested with vitest `.test.ts`):

- `buildCandles.ts` — `(candles, w, h) => readonly CandleGeom[]`, where
  `CandleGeom = { x, bodyY, bodyH, wickTop, wickBottom, up }`. Ports the
  min/max scaling, slot width, and 0.6 body-width ratio from web `drawCandles`.
- `buildGauge.ts` — ports web `buildGaugePaths`: lower-semicircle track/fill arc
  paths + needle position from `(totalPnl, maxAbsPnl)`.
- `buildSparkline.ts` — ports web `buildSparkPath`: centred zero-line bar path
  from `(pnl, maxAbsPnl)`.
- `equityHeat.ts` — `heat(changePct) => number` in `[0,1]`, plus `SECTOR_MAP`
  and `groupBySector(instruments)`.

Each util carries geometry that jsdom cannot see rendered, so it is unit-tested
directly; the SVG leaves consume the util output.

## Appearance relocation — gear button + overlay

Adding Equities would make six bottom tabs. Instead, Appearance moves **off** the
bottom bar so the tab bar stays trading-focused (Rates / Blotter / Analytics /
Credit / Equities), and Appearance is reached from a toolbar control — mirroring
the existing `LockButton` → `LockScreen` overlay pattern.

- Add an **Appearance/gear button** to the shell toolbar (`Chrome` in
  `app/_layout.tsx`) next to `LockButton`.
- Render `AppearanceScreen` inside an **absolute-fill overlay** component
  (`AppearanceOverlay`), following `LockScreen`: a plain `<View>` overlay (never
  an RN `Modal` — Modal-via-press segfaults under x86 jest), with a `zIndex`
  below `LockScreen`'s 200 and a **close affordance**. Visibility is shell-local
  `useState` in `Chrome` (Appearance has no session-machine seam, unlike Lock).
- Remove `app/appearance.tsx` and its `<Tabs.Screen name="appearance" ...>` line.
  `AppearanceScreen` itself (testID `appearance-panel`) is unchanged; its existing
  tests render it directly and continue to pass.

Resulting tab bar registration order in `_layout.tsx`:
`index` (Rates) · `blotter` · `analytics` · `credit` · `equities`.

## File structure (new, under `packages/client-react-native/`)

```
src/ui/equities/
  EquitiesScreen.tsx           EquitiesNav.tsx
  equityHeat.ts                equityHeat.test.ts
  markets/
    MarketsView.tsx
    Watchlist.tsx              (+ WatchlistRow)
    SectorHeatmap.tsx          (+ HeatCell)
  trade/
    TradeView.tsx
    InstrumentTabs.tsx
    PriceChart.tsx             buildCandles.ts   buildCandles.test.ts
    DepthLadder.tsx            (+ DepthRow)
    OrderTicket.tsx
  blotters/
    BlottersView.tsx
    OrdersBlotter.tsx
    PositionsBlotter.tsx
    DeskPnlGauge.tsx           buildGauge.ts     buildGauge.test.ts
    PnlSparkline.tsx           buildSparkline.ts buildSparkline.test.ts
  shell overlay:
    src/ui/shell/appearance/AppearanceOverlay.tsx
    src/ui/shell/appearance/AppearanceButton.tsx
app/equities.tsx               (route → EquitiesScreen)
app/_layout.tsx                (register equities tab; add gear button + overlay;
                                remove appearance tab)
```

(Private sub-components — WatchlistRow, HeatCell, DepthRow — stay unexported in
their parent file, following the Phase 7 `RfqTileRow` / `SellSideRfqRow` pattern.)

## Testing plan

- **Leaves** → jest-expo `.test.tsx` (RNTL 14). `renderWithTheme` + a partial
  fake `ViewModel`. `await` `fireEvent` when asserting on state-driven re-renders;
  `void` when asserting on a synchronously-invoked mock. `toHaveTextContent` needs
  `{ exact: false }` for substring matches.
- **Pure utils** → vitest `.test.ts` (node), react-native-free, importing from
  `vitest`. `buildCandles`, `buildGauge`, `buildSparkline`, `equityHeat`.
- **Gauntlet (controller re-runs first-hand, real exit codes):** `biome ci`,
  `eslint .`, `eslint . --config eslint.config.typed.mjs` (incl. typed
  `no-floating-promises`), `knip`, syncpack, jest, vitest, and `expo export`
  (bundle smoke; module count should grow by the equities tree).
- **Opus whole-branch review** is the net for skin-legibility and
  jsdom-invisible paint bugs (the Phase 7 lesson: colour-token legibility must
  hold across all 8 skins — a control that renders `textOnAccent` on a
  non-accent fill is invisible in most skins). It also verifies the SVG chart /
  gauge / sparkline paint, which render tests cannot see.

## Non-goals

- No new runtime dependencies.
- No `@rtc/domain` / `@rtc/client-core` / `@rtc/react-bindings` / web edits.
- No live-data or simulator changes.
- No tab reordering beyond the Appearance relocation.
- No new theme tokens (the existing 35-key `RnTheme` covers every colour).
