# Equities Chart Navigator (Mini-Map / Range Brush) — Design

**Date:** 2026-07-27
**Status:** Approved
**Parent:** [2026-07-26-equities-chart-interactivity-design.md](2026-07-26-equities-chart-interactivity-design.md) — the interaction core this rides on.

## 1. Motivation & scope

The interactive equities chart (PRs #395/#400/#409) shipped cursor-anchored
wheel zoom, drag/keyboard pan, live-edge follow and a crosshair — but no
overview strip. Both reference implementations (the mock-alpaca demo and
TradingView) carry one, and its absence surfaced a real discoverability gap at
live-acceptance: wheel-zoom is invisible until stumbled upon, while a visible
brush advertises the affordance.

**In scope:** a full brush — a short strip under the time axis showing the
whole candle history as a mini line chart, with a shaded window that IS the
viewport: drag the body to pan, drag either edge handle to resize (zoom),
click/drag the empty track to jump, with live-edge follow derived for free.
Both web clients (React + Solid) at full parity: shared contract specs, shared
visual scenario matrix, shared e2e.

**Out of scope:** React Native (deferred with the rest of the RN chart);
wheel/keyboard handling on the strip itself (keyboard pan/zoom is already
complete on the plot; the strip is pointer-only); volume, gradients or a
crosshair inside the strip (it is a map, not a second chart); on-demand
backfill paging and the pluggable-renderer exploration (separate ⚪ STATUS
entries).

## 2. Behaviour

A strip ~32px tall, spanning the plot width, rendered under the `TimeAxis`
row. Hidden entirely while `seriesLen === 0` (the react-rxjs placeholder
before the first candle emission).

- **Mini chart** — the full-series close values as one dimmed polyline on the
  shared 0–100 substrate (`viewBox="0 0 100 100"` + `preserveAspectRatio="none"`,
  the `SvgPathLayer` pattern).
- **Window** — a shaded rect over `[viewport.start, viewport.end]` mapped to
  strip fractions, with a thin grabbable handle at each edge.
- **Body drag** → pan. Delta in strip-width fractions × `seriesLen` candles,
  applied via the existing `panBy` from the drag-origin viewport.
- **Handle drag** → resize that edge (zoom). The opposite edge stays fixed.
  Resizing floors at `MIN_VIEWPORT_SPAN` — handles can never cross or invert.
- **Track click/drag** (outside the window) → the window centres on the
  clicked index, span preserved, clamped at both ends; the same gesture then
  continues as a body drag from the new position.
- **Live-edge follow is derived, not implemented.** The window renders from
  the same `ChartViewport` value the plot renders, so `followLive` sliding the
  viewport slides the window. Dragging the right handle (or the body) back to
  the right edge re-enters live-follow via the existing `isAtLiveEdge` test;
  the BACK TO LIVE pill on the plot behaves exactly as today.
- **Accessibility:** the strip is a supplementary pointer affordance —
  `role="group"`, `aria-label="Chart navigator"`, not in the tab order. Every
  viewport state it can reach is already reachable from the plot's complete
  keyboard surface (arrows / + / − / Home / End).

## 3. Architecture (approach A — second writer to the existing viewport)

The decision this spec locks: the navigator is **another renderer of, and
writer to, the one existing `ChartViewport` value** owned by the plot-gesture
hook. No second state cell, no synchronization, no machine.

Considered and rejected: **(B)** lifting viewport state up to `CandleChart`
with both hooks prop-driven — pure symmetry churn on a shipped, e2e-proven
hook, refactorable later if a third writer ever appears; **(C)** promoting the
viewport into `EqWorkspaceMachine` — contradicts the parent spec's ADR-005
ruling that the viewport is ephemeral, per-frame, DOM-gesture-driven view
state (a pure function + thin shell, not an RxJS machine).

### 3.1 `@rtc/motion-core` additions (pure, zero-dep)

```ts
// navigatorVm.ts
export interface NavigatorVm {
  /** Full-series close polyline on the 0–100 grid (x: index→0–100, y: min/max→100–0). */
  readonly linePoints: readonly ChartPoint[];
  /** Window rect as percentages of the strip width. */
  readonly windowLeftPct: number;
  readonly windowRightPct: number;
}
export function navigatorVm(
  candles: readonly Candle[],   // structural { close: number } shape, as chartVm
  viewport: ChartViewport,
): NavigatorVm;

// chartViewport.ts additions
export type ViewportEdge = "start" | "end";
/** Move ONE edge by dCandles, the other fixed; span floors at MIN_VIEWPORT_SPAN. */
export function resizeViewportEdge(
  edge: ViewportEdge,
  vp: ChartViewport,
  dCandles: number,
  seriesLen: number,
): ChartViewport;
/** Re-centre the window on idx, span preserved, clamped at both ends. */
export function centerViewportAt(
  idx: number,
  vp: ChartViewport,
  seriesLen: number,
): ChartViewport;
```

Body-drag needs nothing new — it is `panBy` verbatim. `centerViewportAt`
funnels through the existing `clampViewport` (span-preserving is exactly what
a jump wants). `resizeViewportEdge` does NOT: `clampViewport` preserves span
by moving the *opposite* edge (`{start:-10,end:60}` clamps to `{0,70}`) —
wrong for a resize, where the non-dragged edge must stay fixed. It instead
clamps the moving edge directly into `[0, end − MIN_VIEWPORT_SPAN]` /
`[start + MIN_VIEWPORT_SPAN, seriesLen]`, which also makes a crossing or
inverted window unrepresentable. vm emits numbers only, never
markup — the shells own attribute strings (parent spec's hybrid-substrate
rule).

### 3.2 Client shells (one thin unit each, ADR-005)

- **`useChartGestures` grows exactly one command:** `applyViewport(vp)` — a
  clamped `setViewport`. Nothing else in the shipped hook changes.
- **`useNavigatorBrush(viewport, applyViewport, seriesLen)`** (React,
  `client-react/src/ui/equities/chart/`) / **`createNavigatorBrush`** (Solid)
  — translates strip pointer events into the pure ops:
  - `onPointerDown` hit-tests handle-left / handle-right / window-body / track
    (via `data-*`/`closest` on the event target), caches a drag origin
    `{ mode, pointerId, startX, rectWidth, startViewport }` in one ref, sets
    pointer capture on the strip. A track hit first applies
    `centerViewportAt`, then continues in `"move"` mode from the *recentred*
    viewport as origin.
  - `onPointerMove` (while dragging): `dCandles = (dx / rectWidth) × seriesLen`
    → `panBy` (move) or `resizeViewportEdge` (handles) from the fixed origin
    viewport → `applyViewport`. Recomputing from a fixed origin (never
    accumulating onto a moving viewport) is the plot's `DragOrigin` pattern.
  - `onPointerUp` / `onPointerCancel`: clear the origin, release capture
    (`onPointerCancel` mandatory — the phantom-drag lesson from the plot).
- **Hard constraint (a review gate, not a preference):** the brush shells add
  **zero `useEffect`/`onMount` listeners and zero new state cells** —
  synthetic pointer handlers + pointer capture + one drag-origin ref only.
  There is no wheel handling on the strip, so the plot hook's native-listener
  workaround is not inherited.
- **`NavigatorStrip`** — presentational leaf per client: one SVG polyline +
  window/handle divs + a `*.module.css` (byte-identical across clients).
  Rendered by `ChartPlot` under `TimeAxis`. Brush props are **optional**
  exactly like `plotProps`: omitted → a static, gesture-free mount, which is
  what the forced-state visual wrappers get.
- **`CandleChart`** joins `navigatorVm(candles, viewport)` + the brush hook
  and passes both to `ChartPlot`. `ChartPanel` is untouched.

Testids: `chart-navigator` (strip), `navigator-window`,
`navigator-handle-left`, `navigator-handle-right`. The track is the strip
itself — no separate testid.

### 3.3 Edge cases

| Case | Ruling |
|---|---|
| `seriesLen === 0` (placeholder) | Strip not rendered at all. |
| Handle dragged past the other handle | Impossible — `resizeViewportEdge` floors the span at `MIN_VIEWPORT_SPAN`. |
| Drag beyond the strip's left/right bounds | Pointer capture keeps events flowing; fractions may exceed [0,1]; ops clamp. |
| New candles arrive mid-drag | Drag origin viewport stays fixed (same accepted behaviour as the plot drag); `followLive` applies on the next non-drag update. |
| Track click at the far ends | `centerViewportAt` clamps — the window pins to the boundary, span preserved. |
| Right edge resized/dragged to the end | `isAtLiveEdge` true → live-follow resumes, BACK TO LIVE disappears. |
| Series shorter than the default visible count | Window spans the whole strip; body drag is a no-op (clamp), handles still resize down. |

## 4. Testing

- **motion-core units:** `navigatorVm` (window percentages from viewport,
  full-series point mapping, single-candle and empty series), 
  `resizeViewportEdge` (min-span floor both directions, clamp at 0 and
  `seriesLen`, opposite edge immobile), `centerViewportAt` (span preserved,
  clamped at both boundaries, idempotent at the centre).
- **UI contract (shared specs, both clients via the swap-trio):** a new
  `ChartNavigator.contract.spec.ts`. jsdom rects are zero-size, so the spec
  stubs `getBoundingClientRect` on the strip element (plain DOM — stays
  framework-neutral) and drives real pointer events. Assertions go through
  the same observable outputs the interaction specs use: body-drag left →
  time-axis labels shift + BACK TO LIVE appears; labels frozen across
  simulated ticks while panned away; handle-drag narrows the visible label
  range; track click jumps it; strip absent on an empty series. jsdom does
  not model pointer-capture retargeting — that risk is assigned to e2e.
- **Visual tier:** **no new scenarios.** The existing forced-state scenarios
  already exercise the navigator's distinct states (`chart-panned` → window
  mid-history, `chart-zoomed` → narrow window, defaults → window pinned
  right). But every golden containing the equities chart changes (the 7
  interactive-chart scenarios + the workspace-level equities scenarios, both
  themes, both clients): the arm64 local sets are regenerated inside the
  implementation PR (react writes, solid asserts); the canonical x86 `react/`
  set syncs via the `update-visual-goldens.yml` dispatch → artifact → a
  mechanical follow-up PR (the PR #412 dance).
- **e2e (Playwright, real browser):** extend `equitiesChart.spec.ts` — drag
  the window body left → labels shift + BACK TO LIVE appears; drag the right
  handle back to the track's right edge → live-follow resumes (labels advance
  across ~1.5s of ticks). Real-browser coverage is load-bearing here:
  pointer-capture retargeting is exactly the bug class jsdom cannot witness
  (the C6 lesson).
- **Coverage:** both `ui:contract` ≥95% gates stay green; per-file check via
  `pnpm coverage:gaps` before merge — no aggregate hiding a weak file.

## 5. React vs Solid observations (required deliverable)

After both shells exist, record the concrete deltas as an appendix in the
implementation PR description **and** as a sub-bullet appended to the parked
**"React vs Solid: which web client is actually more performant?"** STATUS
entry: primitives used (hooks/refs vs signals), line counts of the two brush
shells, and update behaviour under a continuous brush drag (whole-subtree
re-render + Compiler memoization vs fine-grained binding updates). This
increment is deliberately instrumented as one input to that parked
assessment — not an experiment at the user's expense.

## 6. Rollout

1. **PR 1 — spec + plan** (this document + the implementation plan +
   STATUS.md update: move the navigator ⚪ entry to 🔴 with plan link).
2. **PR 2 — the implementation**, one reviewable unit: motion-core ops + both
   client shells + contract/visual/e2e + docs + regenerated arm64 goldens.
   Nobody approves the vm but rejects the strip — one PR.
3. **PR 3 — mechanical x86 golden sync** from the dispatch artifact, verified
   by the post-merge `visual.yml` run.

**Docs shipped with PR 2:** extend `docs/architecture/17-web-client-up-close.md`
§17.6 (the navigator as a second writer to the same viewport; the
derived-window point); delete the navigator entry from `docs/STATUS.md`;
append the §5 observations to the perf-comparison STATUS entry.
