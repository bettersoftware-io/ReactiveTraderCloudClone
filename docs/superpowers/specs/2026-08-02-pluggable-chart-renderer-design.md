# Pluggable Chart Renderer — Seam Formalization + Canvas Spike

**Date:** 2026-08-02
**Status:** Approved design, pending implementation plan
**Scope decision trail:** deliverable = seam refactor + canvas spike (not
analysis-only); spike proof = candle-layer canvas scenario with its own
golden (no DOM-parity assertion); shells stay on the projected API this
round (zero shell churn); Solid untouched.

## 1. Problem

The equities chart interactivity spec
([2026-07-26-equities-chart-interactivity-design.md](2026-07-26-equities-chart-interactivity-design.md)
§1 out-of-scope) and the `docs/STATUS.md` backlog entry both claim that
`@rtc/motion-core` "already emits a renderer-neutral scene description
(numbers, never markup)". **That claim is only half-true**, and this
workstream exists to make it true, prove it, and document precisely what
the "prerequisite for the full TradingView tier" framing means.

The reality in `packages/motion-core/src/chartVm.ts` and its siblings:

| output | shape today | renderer-neutral? |
|---|---|---|
| `linePoints`, indicator point series | numeric `ChartPoint` (0–100) | ✅ yes — the shells stringify into SVG attributes themselves |
| `scale` | numeric `{cmin, cmax}` | ✅ yes |
| candles (`style`/`wickStyle`), grid, price labels, time labels | `ChartVarStyle` — CSS custom-property **strings**, including `calc()` expressions (`"--wx": "calc(50% - 0.5px)"`) | ❌ no |
| `volumeVm` bars | `ChartVarStyle` | ❌ no |
| `crosshairVm` position | `ChartVarStyle` (`--chx`/`--chy`) | ❌ no |
| `navigatorVm` window | `ChartVarStyle` (`--nav-left`/`--nav-w`) | ❌ no |

The DOM/CSS commitment therefore lives *inside* motion-core today, not at
the shell edge. A canvas renderer cannot consume `"calc(50% - 0.5px)"`
without parsing CSS. `SvgPathLayer.tsx` states the intended doctrine in its
own doc comment — "vm owns numbers, shell owns markup strings" — and is the
one consumer that already follows it; this workstream extends that doctrine
to every chart output.

### What "prerequisite for the full TradingView tier" actually means

This phrase (from the interactivity spec §1) has been read as "TradingView
features are impossible without canvas". That is **not** the claim. The
precise claim, which §7 writes into the architecture docs:

- The TradingView tier (drawing tools, indicator panes, thousands of bars)
  **is achievable on DOM/SVG at modest scale** — virtualization, path
  batching, and transform-only panning can plausibly carry a few thousand
  bars.
- What it cannot cheaply survive is the *combination* at full scale — deep
  history × several indicator panes × per-mousemove crosshair recompute ×
  the HUD's permanent ambient animation — under this repo's performance
  doctrine (`docs/performance.md`: per-frame main-thread work compounds
  forever; SVG-child transforms never composite; steady-state traces must
  show zero `compositeFailed`). Today's chart renders **three retained DOM
  nodes per candle** (`CandleBars.tsx`), and retained-mode costs scale with
  node count; canvas is immediate-mode and scales with pixels drawn.
  TradingView's own Lightweight Charts library is canvas-only for this
  reason.
- The trap is therefore **coupling, not substrate**: building the
  TradingView feature tier against DOM nodes (hit-testing via DOM events,
  styling via CSS cascade, per-node lifecycles) locks the feature set to
  the substrate with the known ceiling, and the eventual canvas migration
  becomes a rewrite of the whole tier — twice, once per web client.
- So the prerequisite is the **seam**: TradingView-tier features must be
  built against the numeric `ChartScene`, never against DOM shapes. Canvas
  then becomes the escape hatch to pull when node-count costs actually
  bite — not a precondition for starting the tier.

## 2. Goal

1. **Make the neutrality claim true:** every chart vm's geometry exists as
   a pure-numeric scene; the CSS custom-property strings become a
   *projection* applied at the edge.
2. **Prove it:** a framework-free canvas draw function renders the candle
   scene from the exact same `ChartScene` object the DOM pipeline consumes,
   pinned by its own visual golden.
3. **Document it:** correct the overstated claim, define the seam contract
   in the architecture docs, and restate the TradingView-prerequisite
   framing precisely (per §1 above).

Non-goals (YAGNI, recorded so they are not re-derived): a production
canvas renderer; a user-facing renderer toggle; any TradingView-tier
feature; touching `@rtc/client-solid`; RN/Skia work; adopting a charting
library (permanently excluded by the interactivity spec).

## 3. Architecture — approach A: scene primary, projection at the edge

Rejected alternatives: **B** — a parallel `chartScene()` extractor beside
untouched vms (two code paths computing the same geometry; the drift
disease the swap-trio/shared-brain patterns exist to kill); **C** — numeric
scene in motion-core with the CSS projection duplicated per client (doubles
the React/Solid parity surface for zero gain).

Chosen shape, all inside `@rtc/motion-core` (string math only — no DOM
types, so the package's zero-dep/no-DOM rule is untouched):

- Each vm function splits into **scene** (new, numeric, primary) +
  **projection** (the existing CSS-var strings, derived from the scene):
  - `chartScene(series, liveRate, flashOn, opts): ChartScene` — new.
  - `chartVmFromScene(scene): ChartVm` — new, in `chartCssVars.ts`; emits
    today's exact `ChartVarStyle` strings.
  - `chartVm(...)` — **kept, signature and output identical**, reimplemented
    as `chartVmFromScene(chartScene(...))`. Same split for `volumeVm`,
    `crosshairVm`, `navigatorVm`.
- **Both shells compile and behave unchanged** — they stay on the projected
  API this round. The seam is proven by the *new* consumer (the spike), not
  by rewiring the old ones. Shell migration to consume `ChartScene`
  directly is a separate, later decision.
- The one lossy spot — the wick's `calc(${x}% - 0.5px)` half-pixel nudge —
  is a rasterization detail, not geometry: the scene carries `wickX: x`
  numeric; the `- 0.5px` moves into the projection.

## 4. The `ChartScene` contract

One exported interface (plus siblings), all coordinates in **percent
(0–100) of the plot box** — unchanged from today's convention, documented
as the scene's coordinate space. Fields are `number`/`boolean` only, except
label *text* strings. No `--`-keyed fields anywhere.

```ts
export interface ChartScene {
  readonly candles: readonly SceneCandle[];
  readonly grid: readonly SceneGridLine[];      // {key, top}
  readonly priceLabels: readonly SceneLabel[];  // {key, txt, top}
  readonly timeLabels: readonly SceneLabel[];   // {key, txt, x}
  readonly linePoints: readonly ChartPoint[];   // unchanged
  readonly scale: ChartScale;                   // unchanged
}

export interface SceneCandle {
  readonly key: number;
  readonly up: boolean;
  readonly last: boolean;
  readonly glow: boolean;
  readonly x: number;      // column center
  readonly top: number;    // body top
  readonly h: number;      // body height
  readonly w: number;      // body width
  readonly wickX: number;  // == x; the -0.5px nudge is projection-side
  readonly wickTop: number;
  readonly wickH: number;
}
```

Siblings: `VolumeScene` bars `{key, up, x, w, h}`; `CrosshairScene`
`{x, y}` + the existing readout fields; `NavigatorScene` window
`{left, w}`. Exact sibling field lists are fixed at planning time from the
current vm outputs — the rule is mechanical: every `--foo: "N%"` becomes a
numeric `foo`.

## 5. Canvas spike

> **Placement refinement (discovered at planning, supersedes the draft's
> client-react placement):** the visual scenario matrix is framework-
> neutral — both clients enumerate the same shared `scenarios` object, and
> each client's `registryCoverage.test.ts` asserts every `componentKey`
> resolves in *its* registry. A react-only shared-matrix scenario is
> therefore impossible. The engine moves to `@rtc/ui-contract` (the
> established home of the shared visual harness; DOM lib already enabled;
> already references motion-core), and each client gains a ~15-line
> canvas *test host*. This strengthens the proof: the same framework-free
> engine drives two framework shells to the same golden.

- `packages/ui-contract/src/visual/canvas/drawChartScene.ts` — a
  framework-free function
  `drawChartScene(ctx: CanvasRenderingContext2D, scene: ChartScene, palette: ChartPalette, size: {w: number; h: number}): void`
  drawing candle bodies, wicks, and grid lines. It lives in `ui-contract`
  (not motion-core) purely because it types against
  `CanvasRenderingContext2D`; it imports geometry types from motion-core
  and **no chart logic**. Each client mounts it via a small canvas host in
  its visual test tree (`tests/ui/visual/react/` / `tests/ui/visual/solid/`)
  registered under one shared scenario.
- `ChartPalette` is a plain injected colors object `{bodyUp, bodyDown,
  wick, grid}`. Recorded finding: a production canvas renderer needs a
  **palette port** — canvas cannot read the CSS custom-property cascade the
  DOM shells inherit for free. That port's design belongs to the future
  productionization workstream, not this one.
- **Text is deliberately excluded** (no price/time labels on the canvas):
  font rasterization is the known cross-environment nondeterminism trap,
  and the seam learning is in geometry.
- Proof harness: one new visual scenario (`equities/chart-canvas-spike`)
  mounts a fixed-size canvas, runs `chartScene()` on the standard seeded
  candle fixture, draws with a scenario-injected palette, and asserts
  against its **own committed golden**. Because the palette is injected
  (not theme-cascade-derived), the image is theme-invariant; whether the
  scenario enters the ×10 theme matrix (10 mechanically-identical goldens)
  or a single-theme bucket is resolved at planning time against how
  `scenarios.ts` buckets work — cost is trivial either way. **No parity
  assertion against the DOM render**: canvas vs DOM pixel parity is
  meaningless (AA and rasterization differ by design).

## 6. Testing

- **Equivalence pin (the core guard):** per vm, a fixture test asserting
  `chartVmFromScene(chartScene(fixture))` deep-equals the pre-split
  `chartVm(fixture)` output across representative fixtures (empty series,
  single candle, viewport-clamped window, line/area kinds, live-overlay
  edge). While scene and projection both exist, they cannot drift.
- **Existing tests pass verbatim:** all current vm unit tests (which
  assert the string outputs), both clients' contract suites, and all
  committed goldens — **zero pixel budget**, same discipline as the
  backfill Phase-A pin.
- **Type-level neutrality:** scene types carry only `number`/`boolean`/
  label-text `string` fields; a compile-time check (a type test that a
  `` `--${string}` ``-keyed field fails to satisfy the scene types) plus
  the equivalence fixtures enforce it.
- **Spike golden:** the new scenario's PNGs through the standard dual-set
  golden flow — react writes (arm64 `react-local` in-branch, canonical x86
  via post-merge dispatch + sync PR), solid asserts, same as every
  scenario.

## 7. Documentation deliverables

1. **This spec** carries the full rationale (the half-neutral finding, the
   ceiling analysis, the corrected prerequisite framing).
2. **`docs/architecture/17-web-client-up-close.md`** (chart section) gains
   a short "renderer seam" subsection: the scene/projection split, the
   `ChartScene` contract pointer, and the precise prerequisite statement —
   *TradingView-tier features are achievable on DOM/SVG at modest scale,
   but must be built against `ChartScene`, never against DOM shapes, so the
   substrate stays swappable; canvas is the escape hatch when node-count
   costs bite, not a precondition for starting the tier.*
3. **`docs/STATUS.md`**: the "Pluggable chart renderer exploration" entry
   is replaced by the residual item — canvas renderer productionization +
   TradingView tier, with the corrected framing and a pointer to this spec
   (exploration itself: done).

## 8. Delivery

One PR: the motion-core split + equivalence tests, the spike + its
scenario/golden, and all three doc edits land together — a reviewer
accepts or rejects the seam claim, its proof, and its documentation as one
unit. Standard shipping rules (worktree `chart-renderer-seam`, CI green on
the head SHA, merge commit). The spike golden addition follows the
standard x86 regen + sync-PR flow if the scenario lands in the
CI-canonical set.

## 9. Global constraints

- Zero visual change to existing goldens; zero behavioral change to either
  client.
- `@rtc/motion-core` stays zero-dependency and no-DOM (`chartCssVars.ts`
  is string math; `drawChartScene` lives in ui-contract because it types
  against CanvasRenderingContext2D).
- `chartVm`/`volumeVm`/`crosshairVm`/`navigatorVm` keep their exact public
  signatures and outputs.
- Scene types: numbers/booleans/label-text only; percent (0–100) plot-box
  coordinates.
- Solid `src/` untouched (its visual **test tree** gains only the ~15-line
  canvas host the shared scenario matrix requires); RN untouched; no
  user-facing toggle; no charting library; no new workspace package.
