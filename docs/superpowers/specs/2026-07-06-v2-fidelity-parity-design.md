# v2 Fidelity Parity — Design (2026-07-06)

**Problem.** After the flagship slice (PR #88), follow-ups (#94), 3d skins (#100) and
fidelity iteration A+B (#105), the real app (`packages/client-react`) still reads as
clearly inferior to the Claude Design prototype (`docs/design/v2`, served by
`pnpm dev:design`; faithful React port in `packages/client-prototype`, `pnpm dev:proto`).
User verdict on the previous attempt: "quite disappointing"; ask: make the app
**faithful in styling, aspect, behaviour, dragging functionality and animation**.

**Evidence.** Live side-by-side inspection (2026-07-06, Chrome, http://localhost:8899
vs http://127.0.0.1:5173) plus code archaeology. Gap catalog, ranked:

## Gap catalog

### G1 — Dragging: split-pane resize is broken/absent (user-named)
Prototype: every screen has pointer-drag splitters — FX `splits.fxStack`
(rates↕blotter), `splits.fxAside` (center↔rail), `splits.fxRight`
(analytics↕positions); Credit `creditAside`, `creditStack`; Equities `eqCenter`,
`eqAside`, `eqRight`. Handles are 7px bars with `col-resize`/`row-resize` cursors;
ratios persist (localStorage).
Real app: `InhouseLayoutEngine` *has* drag machinery, but (a) the handle renders
**inside** `.cell`, which is `display:flex` (row) — so in a column split the bar
paints vertical with the wrong cursor and wrong position (the single visible handle,
`_handle_*` at x=1620, 6×364px, `row-resize`); (b) `fixedPx` cells (FX 360px rail)
and `pinned` panels (both blotters) suppress handles entirely; (c) Equities + Admin
layout roots are single panels — nothing to drag.

### G2 — Credit screen: structurally divergent
Prototype: left **New RFQ** form panel (You Buy/You Sell segmented control,
instrument select, qty/duration, counterparties checklist, CLEAR / SEND RFQ),
center **RFQs** panel with rich dealer-quote cards (BUY/SELL badge, state chip
ACCEPTED/CANCELLED, per-dealer price rows, "✓ You traded with Citi", remove),
LIVE/CLOSED/ALL filter chips, bottom **Credit Blotter**.
Real app: one flat "Credit" panel with text sub-tabs (RFQ Tiles / New RFQ / Sell
Side) and an empty state; blotter below. Port source:
`packages/client-prototype/src/credit/*`.

### G3 — Equities screen: wireframe-grade
Prototype: center symbol header (big last price, bid/ask/day-range/vol) +
candlestick chart + 1D/1W/1M/3M pills, instrument tabs w/ close ✕; right rail
**Order Ticket** (BUY/SELL, Market/Limit, qty stepper, est-cost box, big
accent CTA) over **Watchlist** (price flash, rank glide, ⇅ sort); bottom
Orders/◴ Positions tabbed blotter.
Real app: dash-tick pseudo-chart, sector chips, DEPTH ladder, unstyled
full-width BUY/MARKET bars. Port source: `packages/client-prototype/src/equities/*`.
Decision: **keep** the real app's extra Depth panel registered but out of the
default layout (prototype has no ladder); sectors fold into the watchlist panel.

### G4 — Admin screen: crude vs observability board
Prototype: 4 glowing KPI stat cards (throughput/p99/error-rate/sessions with
sparklines), MESSAGE THROUGHPUT gradient-glow area chart, LATENCY DISTRIBUTION
histogram, SERVICE HEALTH rows (dot + uptime bars + latency + %), LIVE EVENTS
log (INFO/WARN/ERROR chips), "ALL SYSTEMS NOMINAL" pill.
Real app: donut gauges, orange bars, browser-default slider, plain topology
graph. Port source: `packages/client-prototype/src/admin/*`.
Decision: **keep** incident controls, sessions list, service topology and
throughput control functionality, restyled as prototype-grade panels/cards
(capability showcase per project preference); the KPI row/charts/log adopt the
prototype design verbatim.

### G5 — FX Watchlist + Activity tabs are placeholders
Both render "— COMING ONLINE". Prototype: Watchlist = PAIR/MID/MOVE/SPREAD/TREND
table (red/green mid, pip move arrows, spark trend, filter chips reused);
Activity = timestamped feed ("04:22:50 TRADE Sell EURUSD 1,000,000 @ 1.09205")
that accumulates from executions; empty state "No activity yet — execute a trade
to populate the feed". Port source: prototype FX + `useFxBlotter`/`fxData`.

### G6 — FX polish deltas (tile/panel/blotter chrome)
- Trade confirmation: proto = dark in-tile overlay, ✓ glyph, "You Sold",
  "EUR 1,000,000", RATE/SPT/ID row, DISMISS chip; real = flat light-green tile
  with plain text. Executing state matches (dim + spinner) — keep.
- Blotter rows for own trades: proto trader = "You"; real = "A.Stark".
- Rejected row: proto = red status text only; real = full-row strikethrough.
- Blotter headers: proto = plain uppercase, sort glyph only on the sorted column
  ("ID ▼"); real = ▽ chrome on every column.
- Panel heads: proto = icon-tabs (⊞ Live Rates / ≡ Watchlist; ▤ FX Blotter /
  ⚡ Activity; ◉ Analytics; ◎ Positions) with accent underline on the active tab,
  plus per-head ⚙ and ⛶/maximize glyph buttons; real = plain title spans +
  −/▢ ASCII buttons (FX rates/blotter heads got tabs in #105; Analytics/
  Positions/Credit/Equities/Admin heads did not).
- Analytics PnL chart: proto = smooth glow area with gradient fill; real =
  jagged thin line (data density + smoothing + fill differ).

### Non-gaps (verified, leave alone)
Boot sequence (4200ms, log lines, SKIP), theme tokens/skins, aurora background,
tile price blocks/tick flash, currency filter chips + FLIP, positions bubbles,
status bar, header chrome, seeded demo data (all landed in #88–#105).

## Architecture

Port **from** `packages/client-prototype` (already-faithful React + CSS Modules,
same repo) **into** `client-react`'s architecture: data via `useViewModel()` seam
(never rxjs/fetch/localStorage in `src/ui`), CSS Modules only (inline-style ban),
layout via `LayoutPort`/`LayoutState` in `@rtc/client-core` + `InhouseLayoutEngine`,
domain simulators supply streams (already PROTO-scaled). Layout persistence stays in
the engine (the one sanctioned localStorage spot). Panel chrome (icon-tabs, controls)
is engine-level (`headRegistry` slot per #105) so every screen gets it uniformly.

## Delivery plan (one PR each, merged when green per shipping-repo-changes)

- **A. Dock behaviour + FX polish** — G1 + G6 (this plan:
  `2026-07-06-v2-parity-a-dock-fx.md`)
- **B. FX Watchlist + Activity views** — G5
- **C. Credit restructure** — G2
- **D. Equities restructure** — G3
- **E. Admin restructure** — G4

Each PR: SDD execution, full lint gauntlet per touched file, contract specs
updated, **both** golden sets regenerated for changed components only, final
whole-branch review, `test:e2e` in the final gauntlet.
