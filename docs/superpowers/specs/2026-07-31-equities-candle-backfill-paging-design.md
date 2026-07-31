# Equities Candle Backfill Paging — Design

**Date:** 2026-07-31
**Status:** Approved
**Parent:** [2026-07-26-equities-chart-interactivity-design.md](2026-07-26-equities-chart-interactivity-design.md) (deferred there as out-of-scope; the interaction core was designed so this lands as a data-layer upgrade).

## 1. Motivation & scope

The interactive chart ships with a fixed 300-candle history. Exchange-realistic
behaviour is on-demand depth: panning toward the left edge fetches older
candles, transparently and repeatedly, until history is exhausted. This spec
adds that paging through every layer — port, wire, server, presenter, both web
clients — while leaving the shipped interaction core almost untouched.

**In scope:** auto-fetch near the left edge (TradingView/Alpaca behaviour,
decided at brainstorm); a finite total depth with a visible terminal state
(decided at brainstorm); both web clients at parity; sim mode and both WS
modes (the deployed server gains the effect).

**Out of scope:** React Native (its chart rehaul is the Phase 5b workstream);
forward/right-edge paging (the live stream already appends); an explicit
"load older" button (auto-fetch only); prefetching beyond the one-page-ahead
trigger; persistence/caching across sessions.

## 2. Data contract

```ts
// @rtc/domain — MarketDataPort gains:
/** Up to `count` candles strictly BEFORE `beforeTime`, chronological, on the
 * same bucket grid as candles(). One-shot: emits once, completes. A SHORT
 * page (fewer than count, including empty) means start-of-history — page
 * length is the exhaustion signal; there is no separate hasMore field. */
candleHistory(
  symbol: string,
  timeframe: CandleTimeframe,
  beforeTime: number,
  count: number,
): Observable<readonly Candle[]>;
```

- **Determinism law:** identical arguments yield identical candles, on any
  implementation, regardless of request order or history.
- **Continuity law:** a page's newest candle chains seamlessly into the
  series it was requested against (bucket grid contiguous; the backwards
  walk's closes chain across the seam), and page N+1 chains into page N.
- **Depth cap:** total history (live 300 + backfill) is
  `CANDLE_HISTORY_DEPTH_MAX = 3000` candles per (symbol, timeframe) —
  9 full pages of `CANDLE_HISTORY_PAGE = 300` behind the live series.
  Requests beyond the cap return short/empty pages.
- **Page size:** the client always requests `CANDLE_HISTORY_PAGE = 300`
  (a domain constant next to `CANDLE_HISTORY_TOTAL`); `count` stays a wire
  parameter so the contract doesn't hard-code it.

**Simulator** (`EquityMarketDataSimulator`): the Phase-A backwards walk
generalizes into an on-demand deep-history cache per (symbol, timeframe): a
request whose `beforeTime` implies depth D extends the cached backwards
series to D (seeded, seam-rescaled exactly like the Phase-A prepend, with the
independent volume PRNG) and slices the requested window. Since `beforeTime`
fully determines depth, any request sequence produces identical candles —
the determinism law holds structurally.

**Wire + server:** `CLIENT_MSG.GET_CANDLE_HISTORY` ("rpc.getCandleHistory")
with payload `{symbol, timeframe, beforeTime, count}` and its
`SERVER_MSG`-side response id, mirroring the existing `GET_CANDLES` RPC
shape; one new ws-effects server effect delegating to the container's
simulator; the WS port factory implements `candleHistory` exactly like
`candles` (rpc → ack payload → complete, nack → error).

## 3. Presenter stitching (`CandleSeriesPresenter`)

The presenter — already the per-key cache — grows per-(symbol|timeframe)
stitching state:

- `older$`: a prepend accumulator merged AHEAD of the base stream. Each
  stitched emission changes exactly one side — a prepend (older$ grew) or a
  live append (base emitted) — never both, which §4's growth-direction fork
  relies on. A contiguity guard drops any overlap (an older candle at or
  after the base's first time is discarded, defensively).
- `loadOlder(symbol, timeframe)`: single-flight per key; a no-op while
  in-flight or exhausted. `beforeTime` = the current oldest stitched candle's
  time; `count` = `CANDLE_HISTORY_PAGE`. A short page latches
  `historyExhausted$`; an error clears the in-flight flag WITHOUT latching,
  so the next near-edge trigger retries naturally (no bespoke retry logic).
- `loadingOlder$(symbol, timeframe)` and `historyExhausted$(symbol, timeframe)`:
  per-key boolean streams.

The workspace ViewModel exposes `loadOlderCandles()` plus both flags through
BOTH bindings (the `setTimeframe` pattern). `EqWorkspaceMachine` is
untouched — this is presenter-level state, exactly like the candle cache it
extends. Timeframe switches keep their existing behaviour: each
(symbol, timeframe) key stitches independently.

## 4. The viewport prepend-shift (the one interaction-core touch)

Prepending K candles shifts every array index, and the viewport is
index-based. The gesture hooks' render-adjust block (React) /
`createComputed` (Solid) learns to distinguish growth **direction**: the
hooks gain a `firstCandleTime` parameter, and on a length change:

- first candle got OLDER → prepend of `K = newLen − prevLen` → translate the
  viewport by `+K` (`shiftForPrepend(vp, k)`, a pure motion-core helper —
  plain translation, no clamp; in-bounds by construction). One code path
  both holds a panned-away view perfectly still and keeps an at-edge view at
  the edge (`end` lands on the new length).
- otherwise → `followLive` exactly as today (append semantics unchanged;
  the `prevLen === 0` zero-width guard unchanged).

Crosshair, indicators, volume bars and the navigator window all derive from
the same shifted viewport, so they stay consistent for free; the navigator
strip naturally shows history growing leftward (its window narrows as the
total series lengthens — correct mini-map behaviour).

**The near-edge trigger** is one small `useEffect` (React) /
`createEffect` (Solid) per client in `CandleChart`:
`viewport.start < span && !loadingOlder && !historyExhausted →
loadOlderCandles()`. This deliberately deviates from the navigator brush's
zero-effects constraint and is not a violation of it: that constraint bans
effects from GESTURE TRANSLATION, where they breed sync bugs; syncing view
state to an external data request is precisely what effects are for
(ADR-005-consistent). The one-window threshold fires early enough that
normal panning never hits a wall, late enough that idle charts never fetch.

## 5. UI affordances

Both rendered by the presentational `ChartPlot` (so the forced-state visual
wrapper pattern extends unchanged), via two new props `loadingOlder: boolean`
and `historyStart: boolean` computed in `CandleChart`:

- **`LOADING OLDER…`** — a small chip pinned to the plot's LEFT edge while a
  page is in flight, styled in the BACK TO LIVE pill's family (module CSS,
  static — nothing to gate for power-saver). Testid `chart-loading-older`.
- **`START OF HISTORY`** — shown only when `historyExhausted` AND the
  viewport is hard against index 0 (announcing exhaustion mid-series is
  noise). Testid `chart-history-start`.

## 6. Edge cases

| Case | Ruling |
|---|---|
| Page arrives while the user is mid-drag | The drag origin's viewport is stale by K; the very next render-adjust shifts the live viewport, and the in-flight drag keeps computing from its origin — the same accepted behaviour as ticks arriving mid-drag. No special handling. |
| Tick appends while a page is in flight | Distinct emissions (base vs older$); each folds through its own branch of the growth-direction fork. |
| Error from candleHistory | In-flight flag clears, exhaustion does NOT latch; next trigger retries. No error UI in this increment (the chip simply disappears). |
| Symbol/timeframe switch mid-flight | Keys are independent; a late page for a background key stitches into that key's state harmlessly. |
| `Home` key jump to index 0 | Lands the viewport at the trigger threshold → fetch fires → prepend shifts the window to hold the same candles → the user sits at what is now index K; pressing Home again walks deeper. Accepted (matches reference implementations). |
| Zoom-out wider than the loaded series | `clampViewport` caps the span at seriesLen as today; the near-edge trigger fires and depth grows on the next pages. |
| Fresh mount at a timeframe whose key already stitched deep history | The stitched series (not just the base 300) flows from the presenter cache; `defaultVisible` still frames the newest window. |

## 7. Testing

- **Domain:** simulator laws — same-args identity, page-seam continuity
  (closes chain across the seam and across pages), cap/short-page semantics;
  `MarketDataPortContract` gains the candleHistory laws so every implementer
  inherits them; a pin-style test proves the newest-300 base series is
  byte-identical to today's (backfill must not disturb the Phase-A pin).
- **client-core:** presenter units — stitch order + contiguity guard,
  single-flight, short-page latching, error-then-retry, per-key
  independence, cache coherence.
- **motion-core + hooks:** `shiftForPrepend`; hook tests for the
  growth-direction fork (prepend holds a panned-away window still AND keeps
  an at-edge window at the edge; append still `followLive`s — regression
  pin; `prevLen === 0` guard unchanged).
- **Contract tier (shared specs, both clients):** the headline journey — pan
  left to the threshold → chip appears → the world's scripted fake
  `candleHistory` delivers a page → **visible time labels unchanged** (the
  prepend-shift regression guard) → page to the cap → `START OF HISTORY`
  renders only at index 0. Plus: no fetch while idle at the live edge; no
  duplicate fetch while in flight.
- **e2e (sim mode):** one journey — pan/Home to the left edge, chip
  lifecycle (appears then resolves), older time labels present after the
  page lands. One page only, for speed.
- **Visual:** two NEW forced-state scenarios (`equities/chart-loading-older`,
  `equities/chart-history-start`) — additions-only goldens; no existing
  golden changes (the chips render only in states no current scenario
  forces).
- **Wire/server:** message-shape test + a server-effect unit test.

## 8. Rollout

1. **PR 1 — spec + plan** (this document + the implementation plan +
   STATUS.md: backfill entry ⚪ → 🔴 with plan link).
2. **PR 2 — the implementation**, one reviewable unit: domain + wire +
   server + presenter + bindings + both clients + all test tiers + arm64
   golden ADDITIONS + docs (§17.6 extension; STATUS close-out).
3. **PR 3 — mechanical x86 golden sync** (additions-only) via the
   `update-visual-goldens.yml` dispatch, verified by the post-merge
   `visual.yml` run.
