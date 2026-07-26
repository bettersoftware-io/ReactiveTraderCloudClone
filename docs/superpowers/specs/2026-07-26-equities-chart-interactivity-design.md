# Equities Chart Interactivity — Design

**Date:** 2026-07-26
**Status:** Approved (brainstormed + section-by-section user approval)
**Scope decision trail:** feature tier = Alpaca parity + TradingView staples; clients = React + Solid together (RN deferred); data = widen history now, on-demand backfill later; architecture = Approach A (extend the DOM/CSS-var pipeline, hybrid SVG for path marks).

## 1. Problem

The equities candle chart is a faithful port of the static design prototype: it
renders the full 60-candle series, auto-fit, with zero interactivity. The
reference implementations it is measured against are richer:

- [mock-alpaca demo](https://mock-alpaca-demo.adaptivecluster.com/desktop/trade/instrument/AAPL):
  wheel zoom, drag pan, auto-follow of live bars, mouse-over crosshair with an
  OHLC/time readout, a time axis.
- [TradingView](https://www.tradingview.com/chart/): the above plus chart-type
  switching, volume pane, overlay indicators, drawing tools, indicator panes.

This workstream backfills the first set and a curated slice of the second:

**In scope**

1. Wheel zoom (anchored under the cursor), drag pan, keyboard pan/zoom.
2. Live-edge semantics: auto-follow new bars at the right edge; panned away,
   the viewport holds and a "back to live" affordance appears.
3. Crosshair with snapped OHLC + volume + time readout, plus a time axis.
4. Chart types: candles | line | area (area with gradient fill).
5. Volume pane.
6. Overlay indicators: SMA(20), EMA(50), independently toggleable.
7. History deepened from 60 to 300 candles per timeframe, `Candle` gains
   `volume`.

**Out of scope (logged in `docs/STATUS.md` as follow-ups)**

- **On-demand backfill paging** — exchange-realistic older-candle fetch when
  panning near the left edge (port method + wire protocol + server effect +
  seam-stitching in `CandleSeriesPresenter`, and a lazily-backwards
  deterministic simulator). Designed to be a data-layer-only upgrade: the
  interaction core in this spec is unaffected by it.
- **Pluggable chart renderer exploration** (the
  [ECharts canvas-vs-SVG model](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg)):
  motion-core already emits a renderer-neutral scene description; explore
  formalising that seam so a canvas renderer (boot-splash-style engine) could
  replace the DOM/SVG shells without touching any chart logic.
- **React Native chart interactivity** — touch gestures (pinch/pan/long-press
  crosshair) on the RN equities screen; deferred to the mobile workstream.
- **Full TradingView tier** — drawing tools, log scale, comparison series,
  indicator panes (RSI/MACD). If this tier is ever pursued, the canvas
  renderer exploration above is its prerequisite substrate.

**Excluded permanently:** adopting a charting library (e.g.
`lightweight-charts`). This project exists to test clean architecture against
complexity/simplicity/performance by building, not integrating.

## 2. Guiding principles (user-stated)

- **Simple code**: no complex React hooks; interaction complexity lives in
  pure, unit-tested functions. Each framework shell is a thin event→pure-op
  translator.
- **Flexible**: renderer-neutral vm outputs (numbers, never markup) so new
  chart types and future renderer swaps are shell-local edits.
- **Zero performance compromises** within that simplicity: no steady-state
  main-thread animation added; gesture-transient recomputes only; nothing in
  the SVG layer animates per-frame (the `docs/performance.md` SVG traps never
  fire).

## 3. Architecture

### 3.1 Substrate: hybrid by mark shape

The existing chart renders axis-aligned rects as absolutely-positioned divs
styled by CSS custom properties precomputed in `@rtc/motion-core`. That
pipeline stays, and gains one sibling:

- **Rect marks** (candle bodies, wicks, volume bars) → divs, as today. Keeps
  the golden-locked renderer, DOM queryability for contract specs, and the
  div-based glow/flash animations (SVG filters are a documented
  never-composites trap).
- **Path marks** (line/area body, gradient fill, SMA/EMA polylines) → one
  absolutely-positioned `<svg viewBox="0 0 100 100" preserveAspectRatio="none">`
  overlay sharing the divs' percentage coordinate space. motion-core emits
  point arrays; the shell joins them into `points`/`d` strings. Gradients are
  static `<linearGradient>` defs themed via CSS vars.
- **Crosshair** → two hairline divs + a readout chip, transform-positioned,
  `pointer-events: none`.

The discipline that makes the future renderer swap possible: **motion-core
emits numbers, never markup.**

### 3.2 Data layer

- `@rtc/domain` — `Candle` gains `readonly volume: number`. The simulator's
  per-timeframe history deepens to 300 **by prepending older candles from an
  independently-seeded backwards walk** — the existing forward walk (and thus
  the newest pre-deepening candles, the whole old series) stays byte-identical.
  Volume likewise comes from its own PRNG stream, never interleaved with the
  OHLC draws. A regression pin asserts both.
- `@rtc/shared` — candle DTO gains `volume`.
- `@rtc/server` — the equities candle effect serves the widened series (it
  reuses the domain simulator). Sim and server ship together; no wire
  versioning needed.
- `client-core` — `CandleSeriesPresenter` unchanged. `EqWorkspaceMachine`
  gains two workspace-preference fields alongside `timeframe`: `chartType`
  (`"candles" | "line" | "area"`) and `indicators` (set of `"sma20" | "ema50"`),
  following the existing machine/persistence pattern.
- The **default viewport** (newest ~60 of 300) is view state, not data state.

### 3.3 Interaction core (`@rtc/motion-core`, all pure, zero-dep)

- **`chartViewport.ts`** — viewport value `{start, end}` (fractional candle
  indices) + pure ops:
  - `zoomAt(vp, anchorFrac, factor)` — cursor-anchored zoom; the candle under
    the cursor stays put.
  - `panBy(vp, dCandles)`; `clamp(vp, seriesLen, minSpan)`;
  - `isAtLiveEdge(vp, seriesLen)`; `followLive(vp, newLen)` — slide the
    window with incoming bars only when at the live edge.
  - Not an RxJS machine: per ADR-005 this is view-adjacent gesture state; each
    shell holds the value in one `useState`/`createSignal`.
- **`chartVm(series, viewport, liveRate, flashOn, kind)`** — extended, not
  forked. Slices the visible range (edge candles render clipped for smooth
  panning), auto-fits Y to the visible slice, emits per `kind` either rect vms
  (as today) or point arrays. The same call yields time-axis label vms ("nice"
  tick intervals over the visible span). A `volumeVm` sibling emits volume-bar
  rect vms scaled to the visible max. Backward compatibility: existing
  callers' behaviour (full series, candles kind) is the parameter default.
- **`crosshairVm(pointerFrac, series, viewport)`** — snapped candle index,
  line positions, y-axis price under the cursor, preformatted
  OHLC/volume/time readout strings.
- **`indicatorSeries.ts`** — SMA(n)/EMA(n) over the **full** series (correct
  at the viewport's left edge), sliced by the viewport, emitted as point
  arrays.

### 3.4 UI shells (React + Solid, mirrored)

**Gesture shell** — `useChartGestures` / `createChartGestures`, the only
stateful code (~30 lines): `viewport` + `cursor` in two state cells; every
handler is one line of event → pure op → set.

- Wheel = `zoomAt` (listener `passive: false`, scoped to the plot element).
- Pointer drag = `panBy` via `setPointerCapture`.
- Pointer move/leave = crosshair on/off.
- Double-click = reset to default live-edge view.
- Keyboard (plot focusable): `←/→` pan, `+/-` zoom, `Home`/`End` oldest/live.
- New candles → `followLive`.

**Dumb components** (CSS modules, no logic): `SvgPathLayer`,
`CrosshairOverlay`, `TimeAxis`, `VolumePane`, `BackToLiveButton`.

**Controls** — `EqChartHead` gains two pill groups styled like the timeframe
pills: chart type (`CANDLES | LINE | AREA`) and indicator toggles (`SMA 20`,
`EMA 50`), both backed by `EqWorkspaceMachine`.

**Power-saver/Freeze**: no new steady-state animation is introduced; existing
gating carries over untouched.

## 4. Error handling / edge cases

- Empty series → existing empty vm path; gestures no-op.
- Viewport clamp: `minSpan` ≥ ~5 candles (zoom-in floor); pan/zoom never
  escapes `[0, seriesLen]`.
- Series length changes under a held viewport (timeframe switch): viewport
  resets to the default live-edge window (timeframe switch is a context
  change, not a pan).
- Crosshair over a clipped edge candle: snaps to the nearest fully-indexed
  candle; readout is always for a real candle.
- Indicator warm-up: SMA(20)/EMA(50) have no value for the first n−1 candles;
  point arrays simply start at the first defined value.

## 5. Testing

- **Unit (motion-core)**: zoom anchoring math, clamp/min-span, pan bounds,
  live-follow at-edge vs panned-away, chartVm slicing + Y-fit + all kinds,
  crosshair snapping/readout, SMA/EMA warm-up, nice-tick selection.
- **Unit (domain)**: 300-deep history; volume determinism; **byte-identity
  pin on the newest 60 1D candles' OHLC** (the whole pre-deepening series —
  proves deepening prepends only).
- **Contract (`ui-contract`, both clients via swap-trio)**: keyboard-driven
  viewport specs (pan → back-to-live lifecycle, zoom changes rendered candle
  count, Home/End), crosshair readout for a pinned position, chart-type
  toggle swaps candles↔path, indicator toggles, volume bars + colouring.
  ≥95% aggregate gates **plus a per-file `pnpm coverage:gaps` pass**.
- **Visual (react renders, solid asserts; 5-edit recipe per scenario)**:
  panned viewport, zoomed viewport, crosshair pinned, line+gradient, area,
  volume pane, indicators on. Every new component appears in ≥1 scenario
  (visual-reach must not regress). Both golden sets regenerate.
- **e2e (Playwright, per client)**: pan away → "back to live" appears →
  click → follows live again.

## 6. Rollout — three PRs, each independently green

1. **Data**: domain volume + 300 history (prepend) + byte-identity pin;
   fixture sweep across all packages (RN included — compile-error-guided,
   behaviour-neutral). The wire and server effects pass domain objects
   through and need no code change.
2. **Interaction core**: motion-core modules + unit suites (pure library PR).
3. **Web UI, both clients**: gesture shells, five components each,
   EqChartHead controls, EqWorkspaceMachine fields, shared contract specs,
   visual scenarios + goldens, e2e smoke, and the architecture-doc note on
   the hybrid div/SVG mark-shape rule.

*(Amended from four PRs at planning time: `@rtc/ui-contract` specs run
against **both** clients in CI and visual goldens are react-rendered /
solid-asserted, so a React-only UI PR carrying shared specs or scenarios
would red the Solid gates — React and Solid must land together.)*

The spec/STATUS PR (this document + the two follow-up backlog entries) precedes
them. No new packages → no dep-cruiser or `tsconfig.depcruise.json` wiring.

Implementation plan:
[../plans/2026-07-26-equities-chart-interactivity.md](../plans/2026-07-26-equities-chart-interactivity.md)

## 7. Non-goals restated

No charting library. No RN gestures here. No drawing tools/log scale/indicator
panes. No canvas renderer yet — but nothing in this design blocks it: the
interaction core is renderer-agnostic by construction, and swapping the shells
is the exact seam the follow-up exploration will formalise.
