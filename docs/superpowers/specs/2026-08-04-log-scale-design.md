# Log-Scale Y-Axis — Design

**Date:** 2026-08-04
**Status:** Approved
**Workstream:** TradingView tier, sub-project 2 (of the remaining three: log scale, drawing tools, comparison series)

## 1. Goal

Add a linear/log toggle for the equities candle chart's price axis, in both web
clients, built against the `ChartScene` seam in `@rtc/motion-core`. The
deliberate side effect — and the larger half of the value — is making the
price→y mapping **pluggable inside `ChartScale`**, the seam that comparison
series (a percent scale) and drawing tools (price-anchored geometry projected
through whatever scale is active) will inherit.

## 2. Scope

**In:** the plot's candle/line/area geometry, the SMA/EMA overlay points, the
crosshair price inversion, and the price-label text. A LOG pill in the chart
head. One new visual scenario. One e2e assertion.

**Out (explicitly):**

- **The navigator strip stays linear.** It is a padding-normalized full-series
  thumbnail with its own scale (TradingView keeps its overview linear too).
- **Volume and the RSI/MACD panes** — unaffected by definition (own scales).
- **The canvas spike engine (`drawChartScene`)** — consumes precomputed scene
  geometry; it renders log-mode scenes correctly with zero changes.
- **Nice-tick price axis** — a follow-up workstream (§9). This design keeps the
  chart's existing fixed-fraction grid/label policy in both modes.
- **Persistence** — `yScale` is in-memory machine state, exactly like
  `chartType`, `indicators`, and `panes` today. If chart controls ever
  persist, they persist together in their own slice.

## 3. The scale seam (`@rtc/motion-core`)

### 3.1 `ChartScale` gains the mode

```ts
export interface ChartScale {
  readonly cmin: number;
  readonly cmax: number;
  /** Y-mapping mode; absent = linear. Room for "percent" (comparison series). */
  readonly yScale?: "log";
}
```

Optional and only-ever-`"log"`, so every existing `{cmin, cmax}` literal in
tests and fixtures stays valid, and the bare default stays bare (naming rule:
name the deviation).

### 3.2 Two helpers become the only mapping

Exported from `chartScene.ts`:

```ts
/** price → % of plot box, into [Y_TOP, Y_TOP + Y_SPAN], inverted (high at top). */
export function priceToY(scale: ChartScale, price: number): number;
/** Exact inverse of priceToY. */
export function yToPrice(scale: ChartScale, y: number): number;
```

- **Linear branch:** today's arithmetic verbatim —
  `((cmax − p) / (cmax − cmin || 1)) · Y_SPAN + Y_TOP` and its inverse.
- **Log branch:** interpolate in log10 space. With
  `lmax = log10(cmax)`, `lrng = lmax − log10(cmin) || 1`:
  - `priceToY: ((lmax − log10(p)) / lrng) · Y_SPAN + Y_TOP`
  - `yToPrice: 10^(lmax − ((y − Y_TOP) / Y_SPAN) · lrng)`
- **Total-function guard:** if `cmin ≤ 0`, both helpers use the linear branch
  regardless of `yScale`. Equities prices cannot hit it; the guard keeps the
  math total instead of producing `NaN`. Documented on the helpers.

### 3.3 Three call sites collapse onto the helpers

1. `chartScene`'s internal `yPct` closure (candle bodies/wicks, line/area
   points).
2. `crosshairScene`'s y→price inversion (`price = cmax − ((y − Y_TOP)/Y_SPAN)·crng`
   today).
3. `indicatorPoints`' inline copy of the mapping (SMA/EMA overlays).

Because `vm.scale` already flows `chartScene → crosshairVm → indicatorPoints`,
the mode rides an existing pipe: the three consumers derive the mapping from
the same object and cannot disagree. In linear mode this is a **pure
refactor** — byte-identical output, pinned by equivalence tests (§7).

### 3.4 Inputs and labels

- `ChartVmOptions` gains `yScale?: "linear" | "log"` (default `"linear"`);
  `chartScene` copies `"log"` into `scene.scale.yScale` (and omits the field
  for linear).
- **Price-label text** keeps the existing fixed-fraction policy, log-adapted:
  at fraction `f` (the existing `LABEL_FRACTIONS`), linear text stays
  `cmax − f·crng`; log text is `10^(lmax − f·lrng)`, `.toFixed(2)` as today.
  The label rule remains deliberately band-agnostic (fractions of the full
  plot height, not the Y_TOP band) — preserved verbatim for golden
  continuity in linear mode.
- **Grid lines:** untouched (fixed fractions, both modes — pixel-identical).

## 4. Machine + bindings (`@rtc/client-core`, both bindings)

- `EqWorkspaceState` gains `readonly yScale: "linear" | "log"`, initial
  `"linear"`.
- `EqWorkspaceIntents` gains `toggleYScale(): void` — a patch-pair clone of
  `togglePane`: `toggleYScale$ = new Subject<void>()`, a patch flipping
  `"linear" ↔ "log"`, merged with the existing patches, completed on dispose.
- Both bindings' `createViewModel` mirror the intent. The known
  state-widening blast radius follows: the 4 test doubles, the state
  literals, and the widened `ui-contract` fixture intents.

## 5. UI (both web clients, twinned)

- **LOG pill** in `EqChartHead`, rendered after a `.divider` following the
  pane pills — same pill component/classes as the pane pills, `active` when
  `yScale === "log"`, label text `LOG`. Handler named for its effect per
  `docs/handler-naming.md` (the pill's concrete handler calls
  `toggleYScale`).
- `CandleChart` receives `yScale` and passes it into
  `chartVm(candles, liveRate, flashOn, { viewport, kind, yScale })`. Crosshair
  and overlays need **no wiring changes** — the mode rides `vm.scale`.
- The chart column element gets `data-yscale={yScale}` for test targeting
  (sibling of the existing `data-panes`).
- No new plot DOM, no new animation, no steady-state motion: the node-budget
  tripwire (chart column ≤ baseline + 40) and the freeze audit are untouched
  by construction and keep watching.

## 6. Solid parity

Every UI edit lands twinned in `client-solid` (pill, `data-yscale`, chart
wiring), driven by the same shared contract specs via the swap-trio, and the
same visual scenario asserted against react-generated goldens.

## 7. Testing

- **motion-core units** (`chartScene.test.ts` additions):
  - `priceToY`/`yToPrice` round-trip in both modes
    (`yToPrice(scale, priceToY(scale, p)) ≈ p` within 1e-9).
  - Log geometry: for a known 3-candle fixture, midpoint prices land above
    the linear midpoint (log compresses the top).
  - `cmin ≤ 0` → linear fallback in both helpers.
  - Log-mode label text: `10^` interpolation, 2dp.
  - **Linear-mode equivalence pins:** `chartScene`, `crosshairScene`, and
    `indicatorPoints` outputs deep-equal their pre-refactor values for the
    existing fixtures (same discipline as the renderer-seam workstream).
- **Contract** (shared spec, runs against both frameworks):
  - LOG pill renders, toggles `yScale` state, `active` class tracks it.
  - `data-yscale` flips `linear ↔ log`.
  - With a fixture series of known prices: a chosen candle's `--top` differs
    between modes while grid-line geometry is identical.
  - Crosshair in log mode: readout price at a known `yFrac` equals the
    log-inverted value (not the linear one).
- **Visual:** one new scenario `equities/chart-log-scale` — log active,
  crosshair off, standard 5-edit registry recipe, 10 themes; react writes,
  solid asserts. `app-equities` stems refresh (the new pill changes the head
  bar in the full-app shot) — same 10-stem expectation as the panes
  workstream.
- **e2e:** one journey assertion in the existing equities suite — click LOG →
  `data-yscale="log"` and a price label's text changes.

## 8. Perf & motion

Zero new steady-state animations; the toggle is a discrete re-render. No
`compositeFailed` surface (no new CSS animations at all). Node budget
unchanged (one pill in the head bar, outside the tripwire's chart column
subtree — and the tripwire asserts regardless).

## 9. Follow-up recorded (not in scope)

**Nice-tick price axis** — replace the fixed-fraction grid/label policy with a
1-2-5 decade tick engine in *both* modes (round-price labels, grid lines
positioned at those prices, TradingView-authentic bunching under log).
Recorded as a ⚪ STATUS.md entry by this workstream's close-out; it exists
because fixed-fraction labels under log are arbitrary values, and the
decision (2026-08-04) was to ship the scale seam first and relitigate label
policy separately.

## 10. Shipping

One PR (spec + plan + implementation + goldens for the react-local/darwin sets
on-branch), through the standard six rules; post-merge x86 golden dispatch +
scoped sync PR for the new scenario's 10 stems plus the 10 `app-equities`
refreshes. Docs: one sentence added to §17.7 (scale modes live in
`ChartScale`; features project through `priceToY`/`yToPrice`). STATUS.md:
drop "log scale" from the TradingView-tier remaining list, add the ⚪
nice-tick follow-up.
