# Canvas Chart Substrate — Productionization

**Date:** 2026-08-09
**Status:** Approved (design agreed in conversation 2026-08-09)
**Follow-up to:** [pluggable chart renderer seam](2026-08-02-pluggable-chart-renderer-design.md)
— pulls the "escape hatch" that spec recorded: the seam (numeric `ChartScene` +
projection-at-the-edge) shipped and every TradingView-tier feature since was
built against it, so the canvas substrate can now be made real without
rewriting any feature.

## 1. What this builds

A production-quality **canvas rendering substrate for the equities chart**,
switchable at runtime via a persisted preference. DOM/SVG stays the default;
canvas is the perf escape hatch made real — when active, every per-datum
geometry layer (candles, wicks, line/area fills, compare line, grid, volume
bars, drawings + grips, indicator-pane series, crosshair lines) is drawn
immediate-mode into per-region canvases, collapsing the plot's retained DOM
from ~3 nodes per candle (plus per-bar, per-point, per-drawing nodes) to one
canvas element per region. **Text never moves to canvas**: price/time labels,
readouts, chips and pills stay DOM — that keeps the known font-rasterization
golden trap out of the picture and text accessible. Both web clients.

## 2. Decisions (agreed)

1. **End state: switchable substrate.** DOM remains the default and the
   canonical target for the existing golden/contract suites; canvas is a
   first-class alternative the user can select and deselect at runtime.
2. **Layer split: geometry on canvas, text in DOM.** The node-count problem
   is per-datum geometry; text is O(10) nodes and the cross-environment
   rasterization risk. Canvas never draws a glyph.
3. **Switch surface: persisted domain preference** (`ChartSubstrate`,
   `"dom" | "canvas"`, default `"dom"`), beside power-saver in
   `@rtc/domain` preferences, with a PreferencesModal row in both clients.
   The known ~10-site preference blast radius (entity, adapters, presenter,
   both bindings, ui-contract mirror, fixtures) is accepted; RN gains the
   field mechanically but nothing reads it there.
4. **Goldens: one rich composite scenario through the full 12-theme matrix**
   — the palette port makes canvas pixels theme-dependent, so the matrix
   genuinely exercises every skin×mode mapping.
5. **Perf receipt: node-count pin + documented profile.** An enforced
   contract-tier node budget in canvas mode, plus a one-off recorded
   DOM-vs-canvas trace; no new CI benchmark machinery.
6. **Engine home: `@rtc/motion-core`, typed against a structural `Canvas2D`
   interface.** The seam spec placed the spike engine in `ui-contract`
   "purely because it types against `CanvasRenderingContext2D`" — a
   structural subset dissolves that reason. `ui-contract` is
   devDependency-only and can never serve a shipping renderer.

## 3. Architecture

### 3.1 Engine (`@rtc/motion-core`)

`drawChartScene.ts` moves from `packages/ui-contract/src/visual/canvas/`
into motion-core and grows from candles-only to the full geometry set.

- **`Canvas2D` structural interface** (new, in the engine module): only the
  members the engine calls — approximately `fillRect`, `beginPath`,
  `moveTo`, `lineTo`, `stroke`, `fill`, `arc`, `rect`, `save`, `restore`,
  `setTransform`, and the style setters (`fillStyle`, `strokeStyle`,
  `lineWidth`, `globalAlpha`). The real `CanvasRenderingContext2D`
  satisfies it structurally at each client's call site. Motion-core stays
  zero-dependency and keeps no-DOM standing: structural type declarations
  are not DOM access, and the package's tsconfig still excludes the DOM lib.
- **Three region-shaped entry points**, matching the plot's layout (one
  canvas per region, not one mega-canvas — the regions are separate layout
  boxes today):
  - `drawPlotScene(ctx, scene: ChartScene, drawings, crosshair, palette, size)`
    — candles/wicks/glow, line & area kinds (area fill), compare line, grid
    lines, committed drawings + grips + in-progress preview, crosshair
    lines. `drawings` is the existing `drawingScene()` output; `crosshair`
    is `CrosshairScene | null`.
  - `drawVolumeScene(ctx, bars: readonly VolumeSceneBar[], palette, size)`.
  - `drawPaneScene(ctx, scene: PaneScene, palette, size)` — pane lines,
    histogram bars, guides.
- **`ChartPalette` grows** from the spike's 4 entries to the full geometry
  color set (candle body up/down, wick, grid, line, area fill, compare,
  drawing stroke, grip, crosshair, glow, volume up/down, pane line, pane
  signal, pane histogram up/down, …exact list fixed at planning time by
  walking the layers' current CSS). Each key maps 1:1 to an existing CSS
  custom property via an exported **`CHART_PALETTE_TOKENS`** record
  (palette key → token name) — single source, so the per-client reader is
  mechanical and a drift test can pin the map against the stylesheets.
- **Spike retirement:** the `equities/chart-canvas-spike` scenario and its
  goldens are deleted (the production composite scenario supersedes them as
  the seam's pixel witness); the recorder-ctx unit tests move to
  motion-core with the engine and extend to the new layers. `ui-contract`'s
  `src/visual/canvas/` directory empties out.

### 3.2 Palette port (per client, thin shell)

`readChartPalette(el: HTMLElement): ChartPalette` (~20 lines per client):
walks `CHART_PALETTE_TOKENS`, reading each token via
`getComputedStyle(el).getPropertyValue(...)` at the chart root element.
Re-read in an effect keyed on the ViewModel's skin+mode, so a theme switch
repaints on the next draw. This is the only DOM-touching piece and follows
the established thin-shell-duplicated-per-client pattern.

### 3.3 Substrate preference (`@rtc/domain`)

`ChartSubstrate = "dom" | "canvas"`, default `"dom"`, added to the
preferences entity beside power-saver, with the standard plumbing at every
known preference site. PreferencesModal in both clients gains a
"Chart renderer" row (DOM | Canvas). No head pill, no session-scoped state
— the preference is the single switch.

### 3.4 Canvas hosts (per client)

One **`SceneCanvas`** component per client: a `<canvas>` filling its
region's box, `ResizeObserver` for size, `devicePixelRatio` scaling, and a
redraw effect on `[scene, palette, size]`. The draw callback is a slot
(each region passes its engine entry point bound to its scene).

- **No rAF loop anywhere.** Redraw is purely event-driven: data tick,
  pointer move, resize, theme change. Power-saver Freeze is respected
  automatically; steady-state cost is zero on a quiet stream. Glow/flash
  render as static state from the scene's existing booleans.
- **Substrate branch:** in canvas mode `CandleChart` / `VolumePane` /
  `IndicatorPane` swap their geometry children (`CandleBars`,
  `SvgPathLayer`, `DrawingsLayer` strokes, `CrosshairOverlay` lines, volume
  bar divs) for their region's `SceneCanvas`. Text/axis/chip/pill children
  render identically in both modes.
- **Pointer handling untouched.** `useChartGestures`, `pointerToAnchor`,
  `hitTestDrawings`/`hitTestGrip`/`dragDrawing`, and the crosshair math are
  already numeric against the container box — no interaction code knows the
  substrate exists. This is the seam paying off, and the design's central
  simplification.
- **z-order:** each canvas sits exactly where its region's geometry layers
  sat; DOM text layers stack above as today.

### 3.5 Explicitly unchanged

`NavigatorStrip` stays SVG (one path + one window div — no node-count
problem). The DOM geometry components are retained untouched as the default
path. `chartVm`/`chartCssVars` projections, all machines, presenters, wire
protocol, server: untouched. No charting library (permanently excluded).

## 4. Testing

- **Unit (motion-core):** recorder-ctx replay tests per entry point over
  fixture scenes — call-sequence shape counts and coordinate spot-checks,
  including empty-scene and single-candle edges. A `CHART_PALETTE_TOKENS`
  drift test asserts every mapped token exists in both clients'
  stylesheets.
- **Contract (shared specs, both clients):**
  1. *Substrate switch:* flipping the preference swaps the plot's geometry
     DOM for a canvas element and back (canvas testid appears; DOM geometry
     testids disappear; and vice versa).
  2. *Node-count pin (enforced perf receipt):* in canvas mode the plot
     region's node count meets a fixed small budget — the ~3-nodes-per-
     candle retained tree becomes one canvas per region — using the same
     `wrapNodeCount` machinery as the pane +40-node budget.
  3. *Canvas-mode interaction smoke:* a small twin subset of existing
     interaction specs re-run with substrate=canvas — crosshair readout
     text, drawing create/drag intents, compare toggle — asserting
     machine/text outcomes, never pixels. The full behavioral suite stays
     DOM-mode.
- **Visual:** one composite canvas scenario (candles + volume + compare +
  drawings + one indicator pane + crosshair, deterministic seeded fixture)
  through the standard 12-theme matrix. Standard dual-set flow: react
  writes arm64 in-branch, x86 via post-merge dispatch + sync PR, solid
  asserts the same set. Spike scenario + goldens retired in the same
  stroke.
- **e2e:** one Gherkin journey — open Preferences, switch to Canvas, verify
  the chart answers a crosshair move and a drawing gesture, switch back.
  Both clients, like every journey.
- **Perf receipt (documented half):** a one-off DOM-vs-canvas trace at deep
  history × two indicator panes; numbers recorded in this spec's receipt
  section post-implementation and pointed to from `docs/performance.md`.

## 5. Documentation

- `docs/architecture/17-web-client-up-close.md` §17.7 gains a "canvas
  substrate" subsection: the switch, the palette port, the no-rAF redraw
  doctrine, and the engine-home rationale (structural-ctx argument).
- `docs/STATUS.md`: the escape-hatch entry is replaced; anything
  deliberately deferred is recorded as a residual item.
- The seam spec's §5 placement note gains a forward-pointer to this spec.

## 6. Delivery

One implementation PR (engine move + palette port + preference + hosts +
tests + arm64 goldens + docs), then the standard x86 golden sync PR after
the post-merge `update-visual-goldens` dispatch — the same two-PR shape as
the comparison series. Standard shipping rules (worktree
`canvas-substrate`, CI green on the head SHA, merge commit).

## 7. Out of scope (recorded so they are not re-derived)

- Canvas text of any kind — labels/readouts stay DOM permanently under this
  design.
- Making canvas the default; retiring any DOM geometry component.
- RN/Skia rendering; the navigator strip; FX charts (sparklines are cheap).
- A rAF-driven animation loop or any canvas-side animation machinery.
- A charting library (permanently excluded by the interactivity spec).

## 8. Receipt (measured)

### 8.1 Node counts (enforced perf receipt)

Measured by the Task 5 contract case (`CanvasSubstrate.contract.spec.ts`'s
node-count pin), fixture: `panes: ["rsi", "macd"]` + a compare series + 2
drawings, over the 300-candle fixture at the default 60-candle visible
window (the viewport only ever paints `defaultVisible` candles, never the
full fixture):

| | DOM mode | Canvas mode |
|---|---|---|
| Nodes under the plot wrap | **287** | **28** |

Identical on `client-react` and `client-solid` — no compiler-emitted
wrapper-node skew here (unlike the coverage report's statement counts).

**What the pin enforces:** `canvasNodes < domNodes - 200` (a margin, not the
literal 287→28 gap, so the test doesn't need updating on ordinary DOM-side
churn) **and** a literal ceiling `canvasNodes <= 60` — both comfortably
bracket the measured 28, and the pin fails loudly if canvas mode ever
regresses toward per-datum nodes again.

### 8.2 Trace comparison (documented, one-off)

**Method.** An automated Playwright + CDP script (scratch, not committed —
lives only for the duration of this measurement, per this section's own
brief) drove `client-react` in simulator mode (`vite` on a bare port, no
server): log in via the seeded e2e session, open Equities, toggle both the
RSI and MACD panes and an MSFT comparison, then press `Home` on the focused
plot six times (each triggering the near-left-edge backfill trigger) to pull
in several older pages of history. With that state established, a
`Performance.getMetrics()` CDP snapshot was taken, then a 10-second window
ran continuous interaction — an oscillating crosshair `mousemove` between two
plot-relative points plus an `ArrowLeft` pan step every ~120ms — after which
a second snapshot was taken and diffed. The whole sequence (fresh page load
→ setup → backfill → optional substrate switch via the real
`PreferencesModal` → trace window) ran twice per substrate, DOM and canvas,
each from a clean browser context.

**Results** (metric deltas over the 10s window; times converted from the
CDP metrics' native seconds to ms):

| metric | DOM run 1 | DOM run 2 | Canvas run 1 | Canvas run 2 |
|---|---|---|---|---|
| TaskDuration (ms) | 2459 | 2453 | 1830 | 1881 |
| ScriptDuration (ms) | 1807 | 1828 | 1330 | 1372 |
| LayoutDuration (ms) | 71 | 68 | 44 | 46 |
| RecalcStyleDuration (ms) | 143 | 129 | 83 | 88 |
| LayoutCount | 321 | 335 | 333 | 353 |
| RecalcStyleCount | 810 | 841 | 1669 | 1711 |
| JSHeapUsedSize (bytes) | 3,027,492 | 16,089,236 | 13,217,504 | 6,463,052 |

**Interpretation.** Across both runs, canvas mode used consistently *less*
main-thread time than DOM mode on every duration metric (TaskDuration,
ScriptDuration, LayoutDuration, RecalcStyleDuration all lower, by roughly
20-40%) even though `RecalcStyleCount` is *higher* in canvas mode (~2×) —
plausibly `readChartPalette`'s per-draw `getComputedStyle` reads across
three `SceneCanvas` regions firing more style recalcs than the DOM path's
per-tick reflow, but each one cheaper because far fewer nodes are involved;
`JSHeapUsedSize` swung in both directions across the two runs (16MB vs
3MB, then 13MB vs 6MB) and is too noisy from two samples to draw a
directional conclusion — a browser-GC-timing artifact, not a substrate
signal, would need many more samples to separate from noise. The headline,
reproducible number is the node-count collapse in §8.1; this trace is a
single-machine, two-run spot-check consistent with (not an additional proof
of) that same direction, not a benchmarked, CI-gated claim.
