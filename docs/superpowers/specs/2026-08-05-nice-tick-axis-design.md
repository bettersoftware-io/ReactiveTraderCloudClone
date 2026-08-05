# Nice-Tick Price Axis — Design

**Date:** 2026-08-05
**Status:** Approved
**Workstream:** TradingView tier follow-up (deferred by
[2026-08-04-log-scale-design.md](2026-08-04-log-scale-design.md) §9; the
STATUS.md ⚪ entry this design closes).

## 1. Goal

Replace the equities chart's fixed-fraction grid/label policy with a
price-anchored nice-tick engine: round-price labels (340.00, 360.00, …)
positioned exactly where those prices fall under the active scale mode, in
**both** linear and log — giving log mode its characteristic bunched-grid
look. All geometry stays inside the `ChartScene` seam; the shells change by
two lines of CSS.

## 2. Decisions locked during brainstorming (2026-08-05)

- **Live churn accepted:** ticks derive from the visible range, which moves
  with the live candle — the grid re-lays **discretely per render**, exactly
  like the candles (TradingView's autoscale behaves the same). No hysteresis,
  no state threaded into the pure scene function.
- **Density target ~3–6 ticks** (nearest to today's 4 fixed lines).
- **One generator, price space, both modes:** the same 1-2-5 nice steps in
  price space; only the *position* mapping differs (`priceToY`). No log-space
  decade engine — it only diverges over multi-decade ranges the chart never
  displays (YAGNI).
- **Approach A:** pure tick engine in motion-core consumed by `chartScene`;
  grid and labels derive from the same tick array. (B — labels-only — rejected
  as mismatched geometry; C — shell-side ticks — rejected as a seam
  violation.)

## 3. The tick engine (`@rtc/motion-core`)

New file `packages/motion-core/src/priceTicks.ts`, pure and zero-dep:

```ts
/** Round-price axis ticks for a visible range: the 1-2-5×10^k step nearest
 * (cmax − cmin)/4, every integer multiple inside [cmin, cmax] inclusive.
 * ~3–6 ticks by construction. */
export function priceTicks(cmin: number, cmax: number): readonly number[];
```

- `rawStep = (cmax − cmin) / 4`; round to a nice step by **threshold**, not
  snap-up: with `err = rawStep / 10^floor(log10(rawStep))`, the multiplier is
  `err ≥ √50 → 10`, `err ≥ √10 → 5`, `err ≥ √2 → 2`, else `1` (d3's
  tick-increment rule). *(Amended 2026-08-05: the originally-drafted
  "smallest nice step ≥ rawStep" under-produces — range 101→109.5 gives
  rawStep 2.125 → snap-up picks 5 → exactly ONE tick at 105. Threshold
  rounding keeps step within ~[rawStep/1.6, rawStep·1.4], which is what
  makes the 3–6 count guarantee true; the worked example below is
  unchanged.)*
- Ticks are `k · step` for integer `k` from `ceil(cmin/step)` to
  `floor(cmax/step)` — computed from the integer `k` each time (no
  floating-point accumulation drift). Endpoints inclusive.
- Worked example (the contract fixture's visible range 339→400):
  raw 15.25 → step 20 → `[340, 360, 380, 400]`.
- **Degenerate guard:** `cmax ≤ cmin` returns `[cmin]` (unreachable with real
  OHLC data; keeps the function total).
- **Count contract (amended 2026-08-05):** typically 3–6 with 4 the design
  target; the HARD bounds are **[2, 7]** — at the threshold boundaries the
  chosen step can lose one tick to endpoint alignment (e.g. 390.4→419 →
  step 10 → `[400, 410]`), exactly as d3's tick engine behaves. A [3, 6]
  guarantee would require a second adjustment pass for a case TradingView
  itself renders with 2 lines; not worth the machinery. The unit suite
  sweeps ranges to pin count ∈ [2, 7].

## 4. Scene derivation (`chartScene.ts`)

- Delete `GRID_FRACTIONS` and `LABEL_FRACTIONS`.
- For each tick `t` of `priceTicks(cmin, cmax)`:
  - `SceneGridLine { key: i, top: priceToY(scale, t) }`
  - `SceneLabel { key: i, txt: t.toFixed(2), top: <same top>, x: 0 }`
- Grid and labels are the same list viewed twice — a label always sits ON its
  line, and both move together under a mode flip.
- Log mode needs no new code here: `priceToY` already branches on
  `scale.yScale`, so the same round prices land bunched toward the top.
- Empty-series early return keeps `grid: []` / `priceLabels: []` (unchanged).
- Scene interface **shapes are unchanged** (`SceneGridLine`, `SceneLabel`,
  `ChartScene`) — only contents differ — so the CSS-var projection
  (`chartCssVars.ts`), both clients' `ChartPlot`s, and the canvas
  `drawChartScene` engine render the new grid with zero code changes.
- Candles, crosshair, indicator overlays, volume, panes, navigator, time
  axis: untouched.

## 5. Shell changes: none

*(Amended 2026-08-05 — the drafted `translateY(-50%)` CSS line is
unnecessary.)* The label projection already centers a label on its anchor:
`chartCssVars.ts` emits `--ltop: calc(<top>% - 6px)`, and −6px is half the
label's fixed 12px line-height. Under the old between-lines fractions that
calc was a nudge; under on-line ticks it is exactly the centering we want.
Zero changes in either client's shell or CSS.

## 6. Testing

- **`priceTicks` unit suite** (new `priceTicks.test.ts`): table-driven step
  selection across magnitudes (339→400 ⇒ `[340, 360, 380, 400]`; the
  snap-up regression 101→109.5 ⇒ `[102, 104, 106, 108]`; a sub-1 fractional
  step; the boundary 2-tick case 390.4→419 ⇒ `[400, 410]`), endpoints
  inclusive, every tick an exact multiple of the step, count ∈ [2, 7] over a
  sweep of ranges, degenerate `cmax ≤ cmin` ⇒ `[cmin]`.
- **`chartScene` test updates:** grid/label derivation (same `top` per tick;
  label text is the tick's `toFixed(2)`); log-mode grid tops equal
  `priceToY(logScale, t)` and differ from linear for interior ticks while
  the tick VALUES are identical in both modes. The linear equivalence pins
  for candles/crosshair/indicators stay untouched — only grid/label
  expectations change, deliberately.
- **Contract updates (the two pins, in-scope rewrites):**
  - `CandleChart.contract.spec.ts` "fixed 4 grid lines and 4 price labels" →
    grid count ∈ [3, 6], label count equals grid count, each label's `--top`
    equals its grid line's `--top`.
  - `ChartYScale.contract.spec.ts` "grid holds still" → inverted to the new
    truth: label VALUES identical between modes, interior POSITIONS differ;
    the label-text case now expects the round tick values (`priceTicks` of
    the fixture range) instead of interpolated fractions.
  - All other cases (pill, `data-yscale`, candle `--top`, crosshair
    inversion) untouched.
- **Visual:** no new scenario. Every chart-bearing stem re-renders — the
  equities chart scenarios plus `app-equities`, ×10 themes (~130–150 stems):
  darwin-arm64 regenerated on-branch with full unscoped asserts green on
  BOTH frameworks; the x86 set via the standard post-merge dispatch + scoped
  sync PR.
- **e2e (in-scope edit):** tick VALUES are mode-independent, so the LOG-pill
  journey's existing "label texts changed" assertion becomes FALSE after this
  workstream — it asserted a property of the old interpolated labels. A
  position-based probe would be tick-UNsafe in a live browser (positions also
  move with live data, so "changed" can pass vacuously). Resolution: the
  journey's witness becomes `data-yscale` + the pill's active state alone —
  remove the `recordPriceLabels`/`expectPriceLabelsChangedFrom` steps from
  the LOG-pill test (the helpers stay if other tests use them; delete them if
  orphaned). The mode's geometric effect is contract-tier territory, where
  jsdom is deterministic.

## 7. Perf & motion

Grid lines remain static positioned divs re-rendered discretely on data
changes — no animation, no transition, no rAF, no new steady-state motion.
Freeze/power-saver untouched.

## 8. Ride-along (deferred item from the log-scale final review)

`CandleChartPage.panesAttr()` reads `this.root.getAttribute(...)` (the RTL
container, not the wrap div), so its two `.toBe(0)` call sites assert only a
fallback. Fix: query the wrap div via `querySelector("[data-panes]")` (the
pattern `yScaleAttr()` already uses) and correct the stale `wrapNodeCount()`
doc comment. Same test tree this workstream already opens; two lines + a
comment.

## 9. Shipping

One PR (spec + plan + implementation + darwin-arm64 goldens), six-rules
process; post-merge x86 dispatch + scoped sync PR for the regenerated stems.
Close-out: remove the ⚪ nice-tick entry from STATUS.md (pending-only
backlog), append one sentence to the §17.7 paragraph (the axis is
price-anchored through the same `priceToY` seam in both modes).
