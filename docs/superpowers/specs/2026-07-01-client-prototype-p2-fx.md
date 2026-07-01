# `@rtc/client-prototype` P2 — FX (Trading Core)

**Date:** 2026-07-01
**Status:** Design — approved (scope + dock fidelity settled with @nasantsogt)
**Author:** Claude
**Parent spec:** `docs/superpowers/specs/2026-06-30-client-prototype-design.md` (§6 build order)
**Prior phase:** P1 shell chrome — `2026-06-30-client-prototype-p1-shell-chrome.md` (merged, PR #60 `7ae99d62`)

## 1. Purpose

P2 delivers the **FX trading surface** of the readable prototype port: the Live
Rates tiles (editable notional, exec overlay, RFQ-on-tile), the alternate
Watchlist view, the FX Blotter (sort / filter / CSV) with its Activity feed, the
**dock layout** (drag-resize splits + maximize + collapse-to-strip), and the
motion layer (FLIP glide on filter change + book/row/price flashes).

It replaces the `fx` tab's `PlaceholderPanel` with a live `FxScreen`. The other
tabs (credit/equities/admin) keep their placeholders.

Source of truth: the prototype `<section data-screen-label="FX">` (markup lines
~346–531) and the `class Component` FX logic (`priceClick`/`book`/`initTileRfq`/
`_checkExpiries`/`_rateTick`/`_flip`, the FX view-model builders, and seed data)
in `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html`.

## 2. Scope

### In scope (P2)
- **Dock layout**, hand-wired for FX: left column (Live Rates panel **/** H-split
  **/** FX Blotter panel) `|` V-split `|` aside column. Faithful pointer-drag
  resize on every split, per-panel maximize, and aside collapse-to-strip +
  restore.
- **Live Rates tiles** — editable notional (with reset + MAX-invalid guard),
  sell/buy price with big/pip/fraction split, spread, move arrow + pips,
  sparkline (CHARTS toggle), spot date, RFQ badge when notional > 10,000,000.
- **Tile exec overlay** — `executing → success | failure` (12% reject) with book
  pulse, blotter row insert, P&L bump, and event-log entry.
- **RFQ-on-tile** — large-notional branch: `rfqReq → rfqRecv` (15s countdown) →
  pick side → `executing → success | failure`; auto-expiry back to `idle`.
- **Watchlist view** — alternate compact table on the same panel (Live Rates ↔
  Watchlist tab toggle).
- **FX Blotter** — 10 sortable columns, filter query, CSV export; **Activity**
  feed as the alternate view on that panel.
- **Motion** — `useFlip` (native WAAPI) glides tiles on currency-filter change;
  CSS-keyframe flashes (`bookPulse`, `rowIn`, `rowFlashA/B`, price-tick flash)
  already present in `global.css` from P0.

### Deferred to P2.5 (a small follow-on phase)
- The **Analytics** aside panel (P&L-today number + area/line chart + per-pair
  PnL bars) and the **Positions** aside panel (net-exposure bubbles + list).
- In P2 the aside column is real (so the V-split and collapse/restore mechanics
  are demonstrable) but its two panels render a small placeholder body
  (`Analytics · P2.5`, `Positions · P2.5`).

### Explicitly out of scope
- StatusBar P&L stays **static** until P2.5 wires it to FX P&L state.
- No audio: `execSound` remains cosmetic (P1 precedent; no audio in-package).
- No cross-tab notification wiring beyond the FX Activity feed.

## 3. Fidelity notes (do not "fix" these — they match the prototype)

- **Exec-gating prefs are cosmetic in the prototype too.** `priceClick`/`book`
  never read `confirmExec`, `oneClick`, `execSound`, or `defaultNotional`. Faithful
  port keeps them decorative — clicking a price always books immediately (the
  spinner overlay *is* the feedback). Do not add a confirm dialog or one-click gate.
- **Tile notionals seed to the literal `"1,000,000"`**, not from the
  `defaultNotional` preference (the prototype hardcodes this).
- **RFQ threshold is `> 10,000,000` (strict)**; notional `> 1e9` is invalid (MAX).
- **Reject probability is 12%** (`Math.random() < 0.12`) on `book`.
- Aside panels are P2.5 placeholders; StatusBar P&L static; display fonts fall
  back to system stacks (loaded in P6 parity).

## 4. Architecture

Self-contained, matching the package's standing decisions: no `@rtc/domain` /
`@rtc/shared`, no RxJS / machines, no ViewModel seam, no React Compiler; full CSS
Modules (static class / semantic `data-*` / `--custom-property` geometry); native
WAAPI + Canvas; smoke-only Vitest. Per-feature folder = dumb components +
co-located mock hooks + seed data.

### 4.1 Directory layout (new)

```
packages/client-prototype/src/
  mock/
    rng.ts                         # mulberry32 seedable RNG (deterministic smokes)
  fx/
    FxScreen.tsx                   # composes the dock; owns filter + dock state
    fxData.ts                      # PAIRS meta (precision/spread/base), ORDER, seed trades, RFQ_THRESHOLD, seed rates/hist
    useFxRates.ts                  # rate walk, dirs, flash, per-tile exec/RFQ state machine
    useFxBlotter.ts                # sort/filter/query + CSV over seeded + booked trades
    layout/
      useSplit.ts                  # pointer-drag resize: capture → delta→ratio → min clamp → persist
      SplitHandle.tsx              # H/V drag handle (data-orientation, pointer events)
      Panel.tsx                    # panel chrome: head (tabs + actions + maximize glyph) + body
      useDockState.ts              # maxPanel + aside-collapsed state (+ persistence)
    LiveRates/
      LiveRatesPanel.tsx           # panel head (Live Rates ↔ Watchlist tabs, CHARTS, filter chips) + body
      FilterChips.tsx              # All/EUR/USD/GBP/JPY/AUD currency filter
      RateTile.tsx                 # one tile (grid cell)
      TilePrice.tsx                # sell/buy price block: big + pips + fraction split
      Sparkline.tsx                # SVG polyline from hist (+ mini variant for watchlist)
      TileExecOverlay.tsx          # pure render of stage (executing/rfqReq/rfqRecv/success/failure)
      WatchlistView.tsx            # alternate compact table view
    Blotter/
      FxBlotterPanel.tsx           # panel head (Blotter ↔ Activity tabs, count, filter, CSV) + body
      TradesBlotter.tsx            # sortable column header + rows
      BlotterRow.tsx               # one row (rowIn + rowFlashA/B on new, --row-acc)
      ActivityView.tsx             # event-log feed
      csvExport.ts                 # rows → CSV string + download trigger
  motion/
    useFlip.ts                     # measure → invert → WAAPI play; reduce-motion aware
```

`fx/layout/` is **hand-wired for FX** now. Per the P1 decision, shared
split/maximize mechanics extract to `shell/layout/` only when **P3 (Credit)**
first reuses them — not pre-abstracted here.

### 4.2 The dock

Prototype dock state (faithful defaults): `fxStackR: 0.66` (Live Rates vs Blotter
in the left column), `asideW: 360` (aside column width via V-split), `fxRightR:
0.5` (Analytics vs Positions in the aside), plus `maxPanel: string | null` and an
aside-collapsed boolean.

- **`useSplit(key, orientation, opts)`** owns one split. `onPointerDown` captures
  the pointer; `onPointerMove` converts the delta into a ratio (horizontal split →
  vertical drag adjusts the row heights; vertical split → horizontal drag adjusts
  `asideW`), clamped to a min size; `onPointerUp` releases capture and persists the
  value to `localStorage`. Returns the handle props + the current geometry as a
  `--custom-property` for the CSS grid/flex-basis (variable-ref `style={geom}` —
  the sanctioned escape hatch, no eslint-disable needed since it sets only custom
  properties).
- **Maximize** — `useDockState` toggles `maxPanel`; when set, that panel's Panel
  gets `data-max` and CSS makes it fill the section (siblings hidden). Glyph
  toggles (`⤢` ↔ `⤡`) via `data-max`.
- **Collapse** — the aside collapses to a vertical label strip (`stripBar`
  buttons) that restores on click.

### 4.3 Mock hooks

- **`useFxRates(seed?)`** — starts a `setInterval` random walk over `PAIRS`
  (default lively; a passed seed pins values for smokes). Tracks `rates`,
  `opens`, `dirs` (up/down for arrow + color), a transient `flash` map (price-tick
  flash), and `hist` (30-point sparkline series). Owns the per-tile exec/RFQ
  state machine: `notionals`, `tiles: Record<sym, TileState>`, and the handlers
  `onNotional` / `onReset` / `onSell` / `onBuy` / `onDismiss`. Timers: `book`
  resolves after **1200ms**; `initTileRfq` requests after **1700ms** then opens a
  **15,000ms** quote window; an expiry sweep reverts stale `rfqRecv` tiles to
  `idle`. Honors the P1 `reduceMotion` preference for FLIP.
- **`useFxBlotter(trades, ...)`** — derives sorted rows from `fxSort {field, dir}`,
  filters by `fxQuery`, exposes column click-to-sort, count, and CSV export.

### 4.4 Tile exec/RFQ state machine (faithful)

`TileState.stage`:

```
idle ──click (notional ≤ 10M)──▶ executing ──1200ms──▶ success | failure ──dismiss──▶ idle
idle ──click (notional > 10M)──▶ rfqReq ──1700ms──▶ rfqRecv (15s window)
      rfqRecv ──pick side──▶ executing ──1200ms──▶ success | failure ──dismiss──▶ idle
      rfqRecv ──15s expiry / reject──▶ idle
```

`success` books a trade: prepend to blotter (cap 40), set `newRowId` (drives
`rowIn` + `rowFlashA/B` with `--row-acc`), bump P&L, and push an Activity event.
`failure` (12%) shows the rejected done-overlay and logs a REJECT event.

## 5. Testing (smoke-only, jsdom)

- Dock renders both columns; the `fx` tab shows `FxScreen` (not the placeholder).
- A split drag (pointer events) updates its persisted ratio.
- One seeded tick sets a direction flag / updates a rate.
- Clicking a tile price walks `idle → executing → success` under fake timers and
  appends a blotter row with the new-row marker.
- The RFQ branch (notional > 10M) reaches `rfqRecv` with a countdown.
- Blotter: column click sorts; query filters; CSV export produces expected header.
- Maximize sets `data-max`; collapse → strip → restore round-trips.

Out of scope (per master spec): visual goldens, UI-contract, e2e. jsdom
localStorage shim already applies.

## 6. Tooling & compliance

Rides the existing gates unchanged (the P1 config edits already cover
`client-prototype/src/**/*.tsx`): Vite build, `tsc` strict, Biome, ESLint (flat,
inline-style ban), stylelint, `#/` imports, plus the **repo-wide CI gates the
local package gauntlet misses** — `pnpm lint:dead` (knip), `check:versions`,
`check:deps`, `test:rules`. Every SDD task gate runs these, and lints `tests/`
as well as `src/` (both P1 lessons). No new runtime dependencies.

## 7. Risks & mitigations

- **`useSplit` pointer/geometry math is the fiddliest piece.** Mitigation: isolate
  it in one small hook with a smoke test on the ratio update; keep the delta→ratio
  conversion and min-clamp readable and commented.
- **RNG nondeterminism could flake smokes.** Mitigation: `useFxRates(seed?)` takes
  a seed; tests pin it (mulberry32, the canonical helper the HUD admin phase used).
- **Timer-driven state (exec/RFQ/expiry) is flake-prone under jsdom.** Mitigation:
  fake timers + `act()`; assert on settled stages only.
- **FLIP fidelity drift.** Mitigation: port the measure→invert→play math verbatim;
  reduce-motion short-circuits to a plain measure (matches prototype).

## 8. Open questions

None blocking. Task granularity (~8–10 tasks) is finalized in the plan; a task may
be split if it proves too large for one implementation pass.
