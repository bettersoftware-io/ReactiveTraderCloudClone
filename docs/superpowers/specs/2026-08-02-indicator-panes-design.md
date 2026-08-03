# Indicator Panes (RSI + MACD) — TradingView Tier, Sub-project 1

**Date:** 2026-08-02
**Status:** Approved design, pending implementation plan
**Scope decision trail:** TradingView tier decomposed into four sub-projects
(indicator panes → drawing tools → log scale → comparison series); panes
first. Indicators = RSI + MACD (both, to prove the pane model generalizes).
Layout = panes squeeze the plot (~20% each). Crosshair = vertical rule
through panes + per-pane readouts. Strategy = DOM-first against the
`ChartScene` seam per §17.7's doctrine, with a pre-registered perf tripwire.

## 1. Problem

The equities chart has overlay indicators (SMA-20/EMA-50 drawn over the
price plot) but no *pane* indicators — oscillators like RSI and MACD whose
value ranges are unrelated to price and need their own boxes below the
plot, sharing its time axis. This is the first slice of the TradingView
tier, built DOM-first under the renderer-seam discipline
(`docs/architecture/17-web-client-up-close.md` §17.7): all geometry and
math in scene space, shells as dumb projections, so a future canvas port
stays a substrate swap.

## 2. Scope

**In:** RSI(14, Wilder smoothing) and MACD(12, 26, 9) as stacked panes
between the volume strip and the time axis; toggle pills beside the
existing overlay pills; crosshair vertical rule extended through the
panes with per-pane value readouts; both web clients (React + Solid) at
full parity; contract + visual + e2e coverage; the perf tripwire (§8).

**Out (recorded so they are not re-derived):** pane reordering or manual
resizing; pane settings UIs (periods are fixed constants); persistence of
pane selection (matches overlays today — session state only); Stochastic
or any third indicator; RN; drawing tools / log scale / comparison series
(later sub-projects).

## 3. State (client-core)

`EqWorkspaceMachine` gains, symmetric with the existing overlay fields:

- `EqPaneId = "rsi" | "macd"` (exported beside `EqIndicatorId`).
- State field `panes: readonly EqPaneId[]` — activation order, initial
  `[]`; both may be active at once.
- Command `togglePane(id: EqPaneId)` — same add/remove patch pattern as
  `toggleIndicator`.

ViewModel + both bindings expose `panes`/`togglePane` exactly as
`indicators`/`toggleIndicator` are exposed today (~the same touch-point
set: presenter, view-model contract, react-bindings, solid-bindings,
ui-contract fakes).

## 4. Math (`@rtc/motion-core` — `paneSeries.ts`)

Same conventions as `indicatorValues` (null through warm-up, pure
functions over closes):

- `rsiValues(closes: readonly number[]): readonly (number | null)[]` —
  RSI(14) with Wilder smoothing: first average gain/loss = simple mean of
  the first 14 deltas (value lands at index 14), then
  `avg = (prevAvg * 13 + current) / 14`; `RSI = 100 - 100/(1 + RS)`;
  all-zero-loss windows clamp to 100.
- `macdValues(closes: readonly number[]): MacdSeries` where
  `MacdSeries = { macd, signal, hist: readonly (number | null)[] }` —
  macd = EMA12 − EMA26 (null until index 25), signal = EMA9 of the macd
  series (null until index 33), hist = macd − signal. EMA seeding matches
  the existing `emaValues` convention (SMA seed at index `window - 1`).

## 5. Scene (`@rtc/motion-core` — pane scene, numeric)

The seam discipline: panes get a numeric scene in the pane's own
percent (0–100) box, sharing the plot's viewport x-mapping (`xPct`).

```ts
export type EqPaneKind = "rsi" | "macd"; // motion-core twin of EqPaneId

export interface PaneScene {
  readonly kind: EqPaneKind;
  /** Polylines in pane-box percent space (RSI: 1; MACD: macd + signal). */
  readonly lines: readonly PaneLine[]; // {key: string, points: ChartPoint[]}
  /** MACD histogram bars (empty for RSI): {key, x, w, h, up} where h is
   *  measured from the zero line and `up` = hist >= 0. */
  readonly histogram: readonly PaneBar[];
  /** Horizontal guides: RSI 30/70; MACD the zero line. {key, y}. */
  readonly guides: readonly PaneGuide[];
}

export function paneScene(
  kind: EqPaneKind,
  closes: readonly number[],
  viewport: ChartViewport,
): PaneScene;

/** Readout label/value pairs at a snapped candle index (crosshair):
 *  RSI → [{label: "RSI", txt: "62.4"}]; MACD → macd/signal/hist rows,
 *  2-decimal. Null-warm-up indices → txt "—". */
export function paneReadout(
  kind: EqPaneKind,
  closes: readonly number[],
  idx: number,
): readonly PaneReadoutRow[]; // {label, txt}
```

Y-scaling: RSI fixed 0–100 (inverted, padded with the pane's own
Y_TOP/Y_SPAN-style band); MACD data-driven min/max over the **visible
slice** of macd/signal/hist (consistent with the plot fitting
`cmin/cmax` to the viewport), symmetric around zero so the zero-line
guide sits where the histogram pivots. Warm-up nulls are skipped exactly
as `indicatorPoints` skips them.

`paneReadout` is a separate function (not a `PaneScene` method) so the
scene stays a plain data object — serializable, walker-checkable, and
consistent with `ChartScene`.

Neutrality: `PaneScene` fields are numbers/booleans/label-text only —
covered by the existing `assertSceneNeutral` walker + a `CssVarKeys`
compile-time check, same as the five `ChartScene` types.

## 6. Shells (both clients, dumb projections)

- **`IndicatorPane`** (React + Solid twins in each client's chart
  directory): renders one `PaneScene` — an SVG (`viewBox 0 0 100 100`,
  `preserveAspectRatio="none"`, the `SvgPathLayer` pattern) holding the
  guide lines, the polylines, and the MACD histogram as **one batched
  `<path>`** (all bars concatenated into a single `d` string; never
  per-bar DOM nodes — this is what keeps the node budget flat), plus a
  corner label (`RSI 14` / `MACD 12 26 9`) and the crosshair readout rows.
  Testids: `chart-pane-rsi` / `chart-pane-macd`.
- **Layout:** `ChartPlot`'s wrap gains the panes between `VolumePane` and
  `TimeAxis`, in activation order. A `data-panes="0|1|2"` attribute on
  the wrap drives the plot box's flex-basis in the existing CSS module —
  each active pane takes ~20% of the former plot height; no JS layout.
- **Pills:** the existing `IndicatorPills` row gains a panes group (RSI /
  MACD) driving `togglePane`, visually separated from the overlay pills.
- **Crosshair:** one vertical rule element spanning plot + panes,
  positioned by the same projected x custom property the plot crosshair
  uses; the plot keeps its horizontal line + price tag. Pane readouts
  render `paneReadout(kind, closes, crosshairVm.idx)` in the pane corner
  while the crosshair is active. Pointer handling stays on the existing
  gesture surface, extended over the pane area, forwarding fractions
  only — no DOM hit-testing.

## 7. Testing

Scene-level first (survives a future substrate swap):

- `paneSeries` unit tests against hand-computed fixtures: RSI warm-up
  nulls + a known 20-close sequence; all-gain clamp to 100; MACD
  null-boundaries at indices 25/33 and hist = macd − signal; determinism.
- `paneScene` geometry tests: RSI fixed-scale mapping, MACD symmetric
  data-driven scale, histogram bar geometry from the zero line, guide
  positions, viewport slicing/warm-up skipping.
- `paneReadout` formatting incl. the "—" warm-up arm.
- Machine tests: `togglePane` add/remove/order, independence from
  `indicators`.

DOM-level only for wiring:

- Contract cases: pills toggle panes; panes mount/unmount in activation
  order; forced crosshair state shows readouts; `data-panes` attribute
  tracks the count.
- **Node-budget contract test (the tripwire, §8).**
- Visual: 2 new scenarios — `equities/chart-pane-rsi` (RSI active) and
  `equities/chart-panes-both` (both active, forced crosshair) — via
  forced-state hosts; 20 goldens through the standard dual-set flow
  (arm64 `react-local` in-branch; x86 dispatch + sync PR post-merge,
  expected-red `visual.yml` window as usual).
- E2e: one journey — toggle RSI pill → pane visible → hover the plot →
  RSI readout shows a number (tamper-check: no-op'd `rsiValues` must fail
  it).

## 8. Perf tripwire (pre-registered)

Written here so the DOM→canvas decision is a measurement, not a feeling:

1. **Zero steady-state motion:** panes add no CSS animations, no rAF, no
   transitions that survive idle — verified by `/rtc:perf-audit`'s
   census (freeze already hard-asserts; the off/calm roster diff is
   eyeballed in review per current practice).
2. **Node budget:** a contract test asserts the chart column's total
   element count with BOTH panes active is at most **+40 nodes** over the
   no-panes baseline measured in the same test. The batched histogram
   path is what makes this achievable; a regression to per-bar DOM nodes
   fails this test loudly.

If a later chart feature cannot hold these bounds on DOM/SVG, that is the
pre-agreed signal to start the canvas-port workstream (§17.7's escape
hatch) — not a license to loosen the budget.

## 9. Delivery

One PR: machine + bindings + fakes, `paneSeries`/`paneScene`/`paneReadout`
(+ tests), both shells' `IndicatorPane` + pills + layout + crosshair
extension, contract/visual/e2e coverage, docs touch-ups
(`docs/architecture/17-web-client-up-close.md` chart section notes the
pane model; `docs/STATUS.md` logs the remaining TradingView sub-projects).
Standard shipping rules; goldens follow the standard post-merge x86 sync.

## 10. Global constraints

- All pane math and geometry in `@rtc/motion-core`; shells project only —
  no computation, no DOM hit-testing, fractions in/attributes out.
- MACD histogram renders as one batched SVG path per pane; the +40-node
  budget (§8) is a contract-test assertion, not prose.
- Existing goldens unchanged except where the 2 new scenarios add files;
  existing chart behavior (overlays, gestures, backfill, navigator)
  byte-identical when no pane is active.
- `@rtc/motion-core` stays zero-dependency/no-DOM; scene types
  numbers/booleans/label-text only.
- Periods are fixed exported constants (RSI 14; MACD 12/26/9) — no
  settings surface.
- Repo rules: `.js` import extensions, mandatory braces, effect-named
  functions, Biome + ESLint clean (incl. `rtc/newspaper-order` in test
  files — bitten last workstream), knip clean.
