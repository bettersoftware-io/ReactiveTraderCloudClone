# Comparison Series — Design

**Date:** 2026-08-08
**Status:** Approved (design walkthrough 2026-08-08; scale model, picker UI, render scope, and architecture each user-approved)
**Sub-project:** TradingView tier 4 of 4 — the last item; shipping this closes the tier
(decision trail: [indicator panes design](2026-08-02-indicator-panes-design.md) header;
seam doctrine: [pluggable chart renderer](2026-08-02-pluggable-chart-renderer-design.md))

## 1. What this builds

Overlay a second symbol's close-price line on the equities candle chart, on a
shared **percent-change** y-axis: both series rebase to the first candle of the
visible window, so the axis reads `+1.25%` / `−0.40%` instead of prices. The
user picks the comparison symbol from a new **VS pill group** in the chart
head; picking one switches the axis to percent mode, clearing it restores the
previous linear/log choice. Both web clients (React + Solid) at full parity.

Built against `ChartScene` (motion-core numeric scene), never DOM shapes — the
standing constraint from the renderer-seam spec.

## 2. Decisions taken (with the options rejected)

| Decision | Chosen | Rejected |
|---|---|---|
| Scale model | **Coupled**: compare set ⇒ percent axis; cleared ⇒ prior linear/log returns. No standalone PCT pill. | Independent LIN→LOG→PCT cycle; percent-only-compare (set-but-invisible footgun). |
| Picker UI | **VS pill group** in `EqChartHead` (one pill per candidate, max 4, single-select, click-active-to-clear). | Dropdown (first head-row popover, new machinery); watchlist-row affordance (chart control outside the chart head). |
| Render scope | **Minimal**: compare close-line + percent axis + crosshair shows percent. | Legend chip; dual crosshair readouts. |
| Where price→percent lives | **Approach A**: percent as a first-class `ChartScale` variant (`yScale: "percent"` + `base`), third `priceToY`/`yToPrice` branch. Drawings/crosshair/grid/drag-edit keep working unchanged — they are already parameterized on the scale. | Approach B: normalize to pct arrays outside the scale — `yToPrice` would return a pct that every drawing call site mistakes for a price; conversion shims at every seam. |

## 3. Projection math (`@rtc/motion-core`)

### 3.1 `ChartScale` percent variant

```ts
// chartScene.ts — ChartScale gains:
readonly yScale?: "log" | "percent";   // absent = linear (unchanged)
/** Percent mode only: the primary series' baseline price (first visible
 * candle's close). pct(p) = (p / base − 1) × 100. */
readonly base?: number;
```

`cmin`/`cmax` **stay in price units of the primary** in every mode. In percent
mode they are the pct-range union *back-converted*:
`cmin = base × (1 + pctMin/100)`, `cmax = base × (1 + pctMax/100)`. This keeps
the scale invertible in price space — the whole reason Approach A wins.

### 3.2 `priceToY` / `yToPrice` third branch

The percent branch routes through pct space:
`y = ((pctMax − pct(p)) / (pctMax − pctMin)) × Y_SPAN + Y_TOP`. Because pct is
an affine transform of price, this is **numerically identical to the linear
branch** for any price — a property the tests pin explicitly. The branch
exists for symmetry (`yToPrice` inverts through pct space identically) and
because the scale's *meaning* differs: ticks, labels, and the compare series
all live in pct space.

**Guard:** `yScale === "percent"` with `base` absent or `base <= 0` falls back
to the linear branch — mirrors the log branch's `cmin > 0` guard.

### 3.3 `chartScene` compare input

```ts
// ChartVmOptions gains:
readonly compare?: { readonly series: readonly ChartCandle[] };
```

Percent mode is **derived from `compare`'s presence** — `"percent"` is never a
requestable `yScale` option value, so percent-without-a-base is
unrepresentable. `opts.yScale` (`"linear" | "log"`) is ignored while `compare`
is present.

When `compare` is present and the primary series is non-empty:

- **Baselines.** Primary `base` = first *visible* candle's close (the resolved
  window's `iFirst`). Compare base = the compare close at the primary
  window-start's `time`; if no exact match, the first compare candle whose
  `time >=` that window-start time; if none exists (compare series entirely
  older, or empty), the compare line is omitted this frame.
- **Range.** Visible pct-range union: primary candles contribute
  `pct(high)`/`pct(low)` over the visible window; the compare series
  contributes `pctC(close)` (through its own base) for every candle whose time
  falls within the primary's visible time span. Union → `pctMin`/`pctMax` →
  back-converted `cmin`/`cmax`. Degenerate flat range: same `|| 1` fallback
  the other branches use.
- **Alignment by time.** Build `Map<time, close>` from the compare series;
  walk the primary's visible indices; where a matching time exists, emit a
  point at that index's `xPct` with `y` = pct-projection of the compare close
  through the *compare* base. Missing times are skipped (no interpolation).
  Immune to per-symbol backfill length drift.
- **Scene output.** `ChartScene` gains
  `readonly compareLinePoints: readonly ChartPoint[]` — empty in non-percent
  modes and whenever the compare data yields no aligned points.
- **Ticks/labels/grid.** Nice ticks computed **in pct space** (the existing
  1-2-5 `priceTicks` engine fed `pctMin`/`pctMax`), grid lines at
  `pctToY(tick)`, labels formatted as signed percent: `+1.25%`, `−0.40%`,
  `0.00%` (two decimals, explicit `+`, true zero unsigned).
- **Empty compare series** (data not yet arrived): percent-project the primary
  alone — the axis is already `%`, so the line's arrival doesn't reflow the
  scale mode (no flicker).
- Time labels, volume scene, candle geometry: unchanged (candles project
  through the same `yPct`).

### 3.4 Crosshair

`crosshairScene` already emits its `price` readout as a formatted string. Under
a percent scale it formats the inverted value as signed percent (same format
as the axis labels) instead of `toFixed(2)`. OHLCV readout stays in prices
(those are the primary candle's actual values).

## 4. State (`@rtc/client-core`) + bindings

### 4.1 `EqWorkspaceMachine`

```ts
// EqWorkspaceState gains:
readonly compare: string | null;        // default null
// EqWorkspaceIntents gains:
setCompare(sym: string | null): void;
```

Rules:
- `setCompare(s.sel)` is a **no-op** (the UI excludes it, the machine still
  guards).
- `select(sym)` where `sym === s.compare` **clears compare** — the primary
  absorbs it.
- `closeTab` and `setTimeframe` leave `compare` untouched (both series
  re-fetch at the new timeframe).
- `yScale` is **never mutated** by compare — the coupled behaviour is derived
  downstream (`compare ? percent : yScale`), so clearing compare "restores"
  the prior linear/log for free.

### 4.2 Bindings (both clients)

`react-bindings` + `solid-bindings` `createViewModel`: expose `setCompare`
through `useEqWorkspace()` (compile-enforced — the result type extends the
machine's intents interface, as `updateDrawing` proved in 3b). Compare candles
need **no new binding**: `useCandles(compare ?? "", timeframe)` reuses the
existing keyed bind; `CandleSeriesPresenter` already maps `""` to a stable
empty series.

## 5. UI shells (React + Solid twins)

### 5.1 `ComparePills` (new component, both clients)

In `EqChartHead`, after `IndicatorPills`: a `VS` group label + one pill per
watchlist symbol excluding `sel` (roster of 5 ⇒ max 4 pills),
`data-testid="chart-compare-pill"`, active state on the chosen one.
Click inactive → `setCompare(sym)`; click active → `setCompare(null)`.
Candidates come from `useWatchlist()`. Follows `IndicatorPills`' markup/css
idiom exactly.

### 5.2 Scale pill while comparing

The existing `chart-yscale-pill` renders a **disabled `PCT`** state while
`compare !== null` (non-interactive, `disabled` attribute, title
"comparison uses percent scale"). The stored lin/log preference is untouched
underneath. No new machine state.

### 5.3 `ChartPanel`

Reads `compare` from workspace state; fetches
`compareCandles = useCandles(compare ?? "", timeframe)`; passes
`compare={compare !== null ? { series: compareCandles } : undefined}` to
`CandleChart` — prop **presence** is the whole signal (matching the
motion-core opts shape; no separate boolean). The `key={sel|timeframe}`
remount is **untouched**: toggling compare must not reset the viewport.

### 5.4 `CandleChart` / `ChartPlot`

`CandleChart` gains an optional `compare?: { series: readonly Candle[] }`
prop (present iff a compare symbol is set — presence is the signal, matching
the motion-core opts shape; an empty `series` while data loads is the
"percent-project primary alone" state). It threads
`{ ...opts, compare }` into `chartVm`. The compare line renders in
`SvgPathLayer`'s polyline pattern: own class, `vector-effect:
non-scaling-stroke`, `data-testid="chart-compare-line"`. Rendered only when
`compareLinePoints` is non-empty.

**Colour:** the existing accent roster is fully allocated (`--accent-primary`
line/area, `--accent-2` sma20, `--accent-aware` ema50, `--accent-positive`/
`--accent-negative` candles), so this adds a **new theme token
`--accent-compare`** to both clients' theme token modules (`tokens.ts` — the
typed contract, the required-vars roster in `tokens.test.ts`, and a value per
theme, visually distinct from `--accent-2`/`--accent-aware` in each).

Gesture surface: none. The compare line is inert (no hit-testing, no
selection) — pan/zoom/crosshair/drawings behave exactly as before.

### 5.5 Node budget

The chart contract's node-budget test gains the new elements: +1 polyline
(+ its wrapper if any) and up to 4 pills + 1 group label in the head. Update
the budget constant deliberately, with the delta named in the test.

## 6. Data flow (end to end)

```
VS pill click
  → setCompare("MSFT")                          (EqWorkspaceMachine patch)
  → ChartPanel re-renders: useCandles("MSFT", tf)  (existing keyed bind/presenter)
  → CandleChart: chartVm(candles, …, { viewport, kind, compare: { series } })
  → chartScene: percent scale (base = first visible close), pct-range union,
    time-aligned compareLinePoints, pct ticks/labels
  → ChartPlot: percent axis labels, compare polyline, PCT-disabled scale pill
```

Clearing (click active pill / selecting the compared symbol as primary)
removes the `compare` opt entirely → the scene reverts to the stored
linear/log scale in the same render.

## 7. Testing

- **motion-core units** (`chartScene.test.ts` + `priceToY` cases):
  percent branch ≡ linear equality pin (same y for the same price, both
  directions); range union widens to include the compare series; time
  alignment skips gaps (a compare series missing interior times yields
  fewer points, correct xs); baseline rebases when the viewport moves
  (same series, shifted window ⇒ different base ⇒ different pct labels);
  label formatting (`+`/`−`/unsigned zero, two decimals); empty compare
  series percent-projects the primary alone; `base <= 0` guard falls back
  linear; non-percent scenes emit empty `compareLinePoints`.
- **Machine tests** (`EqWorkspaceMachine.test.ts`): `setCompare` round-trip;
  `setCompare(sel)` no-op; `select(compare)` clears compare; `setTimeframe`
  preserves compare.
- **Contract** (new shared `ChartCompare.contract.spec.ts` in ui-contract,
  swap-trio both clients): pills render candidates excluding `sel`; clicking
  a pill sets compare (state + active pill) and the compare line testid
  appears once data flows; axis labels contain `%`; the yscale pill is
  disabled showing `PCT`; clicking the active pill clears — line gone, axis
  back to prices, yscale pill re-enabled with the prior label; node budget
  updated.
- **Visual**: one new scenario `equities/chart-compare` (fixture with a
  deterministic compare series; the known 5-edit scenario recipe; react
  writes goldens, solid asserts; x86 regen dispatched post-merge).
- **E2e** (extend the equities chart journey): click a VS pill, expect
  `chart-compare-line` visible and at least one y-axis label containing `%`;
  click it again, expect the line gone and labels price-formatted.

## 8. Out of scope

- Multiple simultaneous comparison symbols (one only).
- Legend chips / per-series crosshair readouts (minimal render scope chosen).
- Persistence of the compare choice across sessions.
- React Native (equities 5b is unplanned; this is web-only, like the rest of
  the tier).
- Server changes — candles are already per-symbol over the wire; ws-real mode
  works without touching `@rtc/server`.
- Canvas renderer — this stays DOM/SVG against `ChartScene`, per the seam
  spec; the canvas renderer remains the escape hatch when node costs bite.
- Compare-symbol backfill paging: the compare line renders whatever the
  base `candles$` window holds; `loadOlder` stays primary-only. Panning
  into history older than the compare window simply truncates the line at
  its oldest aligned point (the time-alignment rule covers this
  naturally).

## 9. Close-out

Shipping this completes the TradingView tier: STATUS.md's canvas-renderer
entry updates to "comparison series DONE — tier complete", leaving the canvas
renderer itself as the recorded escape-hatch note. `docs/architecture/
17-web-client-up-close.md` §17.7 gains the comparison-series sentence.
