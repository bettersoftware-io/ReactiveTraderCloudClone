# Canvas Chart Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canvas rendering substrate production-real: a persisted `chartSubstrate` preference switches the equities chart's geometry layers (candles, line/area, compare, volume, drawings, panes, crosshair lines) from retained DOM/SVG onto per-region canvases drawn by a full-scene engine in motion-core — text stays DOM, DOM stays the default.

**Architecture:** The engine moves from ui-contract (devDep-only, can't ship) into `@rtc/motion-core`, typed against a structural `Canvas2D` interface so motion-core stays zero-dep/no-DOM. Each client gains a `SceneCanvas` host (ResizeObserver + DPR + per-draw `getComputedStyle` palette read via the exported token map) and a substrate branch in `ChartPlot`/`VolumePane`/`IndicatorPane`. The preference follows the `ambientStyle` template at all 21 known sites. Pointer/gesture/hit-test code is untouched — it is already numeric against the container box.

**Tech Stack:** TypeScript (nodenext, `.js` import extensions in tsc-built libs), vitest (recorder-ctx unit tests), shared ui-contract specs (both clients), Playwright visual tier (10-combo theme matrix), native Playwright e2e.

**Spec:** [../specs/2026-08-09-canvas-substrate-design.md](../specs/2026-08-09-canvas-substrate-design.md)

## Global Constraints

- **DOM mode is byte-identical to today.** All existing goldens, contract suites, and unit tests pass untouched. Zero pixel budget on existing scenarios.
- `@rtc/motion-core` stays **zero-dependency and no-DOM**: the engine types against the structural `Canvas2D` interface defined in this plan — never `CanvasRenderingContext2D`, never a `lib.dom` addition to motion-core's tsconfig.
- Text is NEVER drawn on canvas — no `fillText`/`strokeText` member may even exist on `Canvas2D`.
- Preference: `ChartSubstrate = "dom" | "canvas"`, default `"dom"`, storage key `"rtc-chart-substrate"`, modal row label `"Chart renderer"`, options labeled `DOM` / `Canvas`, testids `pref-segment-chartSubstrate-dom` / `-canvas`.
- Canvas plot testids: `chart-canvas-plot`, `chart-canvas-volume`, `chart-canvas-pane` (shared react/solid, mirrored in ui-contract page objects).
- Handler naming (`docs/handler-naming.md`): concrete functions named for effect; function-typed props stay `onX`/noun slots. Braces on all control statements. Zero lint-disable comments anywhere (no-disables policy).
- `#/` subpath imports with `.js` extensions inside motion-core; clients import from `@rtc/motion-core`.
- No rAF loop anywhere; redraws are effect-driven only.
- Repo-wide lint net (`pnpm exec biome ci .`, `pnpm lint:eslint`, `pnpm check:lint-warnings-drift`) is owned by Task 8; earlier tasks run per-package gates + biome/eslint scoped to touched files only (parallel-window discipline).
- Solid-specific: props read via `props.x` in tracked scopes (no destructuring); `class=` not `className=`; the `const x = useHook;` alias pattern where a hook is called inside a `createMemo` (zero-disables).

## File Structure

```
packages/motion-core/src/
  drawChartScene.ts          NEW  Canvas2D iface, ChartPalette, CHART_PALETTE_TOKENS,
                                  PlotCanvasScene, drawPlotScene/drawVolumeScene/drawPaneScene
  drawChartScene.test.ts     NEW  recorder-ctx tests (moved from ui-contract + extended)
  index.ts                   MOD  export the new module
packages/ui-contract/src/visual/canvas/          DELETED (spike retired)
packages/ui-contract/src/visual/scenarios.ts     MOD  -spike entry, +equities/chart-canvas
packages/client-react/tests/ui/visual/react/EquitiesChartCanvasSpike.visual.tsx  DELETED
packages/client-solid/tests/ui/visual/solid/EquitiesChartCanvasSpike.visual.tsx  DELETED
packages/ui-contract/goldens/playwright/__screenshots__/react{,-local/darwin-arm64}/
  visual.spec.ts/*/equities-chart-canvas-spike.png                               DELETED (20)
[preference — 21 sites, template ambientStyle]   MOD  see Task 2 checklist
packages/client-react/src/ui/equities/chart/
  SceneCanvas.tsx            NEW  canvas host: RO + DPR + palette read + draw slot
  SceneCanvas.module.css     NEW  absolute-fill positioning
  readChartPalette.ts        NEW  CHART_PALETTE_TOKENS walk via getComputedStyle
  CandleChart.tsx            MOD  substrate prop, canvas scene assembly
  ChartPlot.tsx              MOD  substrate branch in the plot box
  VolumePane.tsx             MOD  substrate branch
  IndicatorPane.tsx          MOD  substrate branch
  CrosshairOverlay.tsx       MOD  linesHidden prop (readout stays)
  ChartPanel.tsx             MOD  read useChartSubstrate, thread substrate
packages/client-solid/src/ui/equities/chart/     MOD  the exact twins of all of the above
packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts  MOD  canvas accessors
packages/ui-contract/src/specs/equities/chart/CanvasSubstrate.contract.spec.ts  NEW
packages/client-react/tests/ui/visual/react/EquitiesChartCanvas.visual.tsx      NEW
packages/client-solid/tests/ui/visual/solid/EquitiesChartCanvas.visual.tsx      NEW
tests/browser/{page-objects,scenarios,playwright}/…                             MOD  e2e journey
docs/architecture/17-web-client-up-close.md      MOD  canvas-substrate subsection
docs/STATUS.md                                   MOD  entry replaced
docs/performance.md                              MOD  pointer to the receipt
docs/superpowers/specs/2026-08-02-pluggable-chart-renderer-design.md  MOD  §5 forward-pointer
docs/superpowers/specs/2026-08-09-canvas-substrate-design.md          MOD  §8 receipt appended
```

**Task order:** Task 1 ∥ Task 2 (disjoint packages) → Task 3 ∥ Task 4 (react / solid src) → Task 5 (shared contract) ∥ Task 6 (visual) ∥ Task 7 (e2e) → Task 8 (docs + receipt + lint net). During parallel windows: stage with explicit paths only, wait-and-retry on index.lock, per-package gates only.

---

### Task 1: Motion-core engine — move, structural ctx, full scene coverage, spike retirement

**Files:**
- Create: `packages/motion-core/src/drawChartScene.ts`, `packages/motion-core/src/drawChartScene.test.ts`
- Modify: `packages/motion-core/src/index.ts`
- Delete: `packages/ui-contract/src/visual/canvas/drawChartScene.ts`, `packages/ui-contract/src/visual/canvas/drawChartScene.test.ts` (whole `canvas/` dir)
- Delete: both spike hosts (`packages/client-react/tests/ui/visual/react/EquitiesChartCanvasSpike.visual.tsx`, `packages/client-solid/tests/ui/visual/solid/EquitiesChartCanvasSpike.visual.tsx`), their `registry.tsx` imports + entries (react lines ~57 + ~611-617; solid ~57 + ~601-608)
- Modify: `packages/ui-contract/src/visual/scenarios.ts` — delete the `"equities/chart-canvas-spike"` entry (lines ~427-434)
- Delete: the 20 spike goldens — `packages/ui-contract/goldens/playwright/__screenshots__/react/visual.spec.ts/*/equities-chart-canvas-spike.png` (10) and `.../react-local/darwin-arm64/visual.spec.ts/*/equities-chart-canvas-spike.png` (10)

**Interfaces (Tasks 3-6 rely on these exact names, all exported from `@rtc/motion-core`):**

```ts
export interface Canvas2D { /* structural — see below */ }
export interface ChartPalette { up, down, grid, line, sma20, ema50, compare,
  drawing, drawingLevel, grip, crosshair, paneRsi, paneMacd, paneSignal,
  paneGuide, histogram: string }   // 16 readonly string fields
export const CHART_PALETTE_TOKENS: Record<keyof ChartPalette, `--${string}`>;
export interface CanvasSize { readonly w: number; readonly h: number }
export interface OverlayLine { readonly id: string; readonly points: readonly ChartPoint[] }
export interface PlotCanvasScene {
  readonly scene: ChartScene;
  readonly overlays: readonly OverlayLine[];
  readonly drawings: readonly DrawingSceneItem[];
  readonly crosshair: CrosshairScene | null;
}
export function drawPlotScene(ctx: Canvas2D, plot: PlotCanvasScene, palette: ChartPalette, size: CanvasSize): void;
export function drawVolumeScene(ctx: Canvas2D, bars: readonly VolumeSceneBar[], palette: ChartPalette, size: CanvasSize): void;
export function drawPaneScene(ctx: Canvas2D, scene: PaneScene, palette: ChartPalette, size: CanvasSize): void;
```

- [ ] **Step 1: Write the failing recorder-ctx test** at `packages/motion-core/src/drawChartScene.test.ts`. Port the existing recorder pattern from `packages/ui-contract/src/visual/canvas/drawChartScene.test.ts` (read it first — it builds a fake ctx recording method calls + style sets), then extend. The recorder must implement every `Canvas2D` member (below) as a recording stub, `createLinearGradient` returning a recording `{ addColorStop }`. Test cases (fixtures built inline from `chartScene`/`volumeScene`/`paneScene`/`drawingScene`/`crosshairScene` over a small deterministic candle array — copy the `candleAt` formula from `EquitiesChartInteractive.visual.tsx`: open climbs 1/index, close alternates ±1, 60_000ms buckets):
  1. `drawPlotScene` on a candles-kind scene: clears once; one grid stroke per `scene.grid` entry using `palette.grid`; per candle one wick fillRect (fillStyle = `palette.up`/`palette.down` by `cd.up`) then one body fillRect; a glowing candle (`flashOn` last) sets `shadowBlur=8`/`shadowColor` before its body and resets `shadowBlur=0` after.
  2. line kind: no candle rects; one polyline pass over `scene.linePoints` stroked `palette.line`, `lineWidth 2`.
  3. area kind: the line pass PLUS one fill pass closed to the bottom edge whose fillStyle is the object returned by `createLinearGradient(0,0,0,size.h)` with `addColorStop(0, palette.line)` + `addColorStop(1, "transparent")` and `globalAlpha` 0.35 restored to 1 after.
  4. compare: `scene.compareLinePoints` non-empty → one polyline stroked `palette.compare`; empty → no compare pass.
  5. overlays: one polyline per `OverlayLine`, stroke `palette.sma20` for id `"sma20"`, `palette.ema50` for `"ema50"` (rule: id-keyed lookup `{ sma20: palette.sma20, ema50: palette.ema50 }`, unknown id falls back `palette.line`).
  6. drawings: trendline item → moveTo/lineTo/stroke with `palette.drawing`; `kind:"hline"` → full-width line with `palette.drawingLevel`; item with `id === "draft"` sets `setLineDash([4,4])` before and `setLineDash([])` after; each handle in `item.handles` → `arc` + fill `palette.grip`.
  7. crosshair non-null → one vertical + one horizontal 1px line stroked `palette.crosshair`; null → none.
  8. `drawVolumeScene`: one fillRect per bar, `palette.up`/`palette.down` by `bar.up`; bars rise from the bottom edge (`y = size.h - h`).
  9. `drawPaneScene` (macd fixture): guides stroked `palette.paneGuide`; histogram bars filled `palette.histogram` (top = `up ? y(hist) : y(0)` rule from `paneScene`'s doc — copy `IndicatorPane`'s current rect derivation); lines stroked by key: `"rsi"`→`paneRsi`, `"macd"`→`paneMacd`, `"signal"`→`paneSignal`.
  10. empty scene (no candles/grid/overlays/drawings, null crosshair) → exactly one `clearRect`, nothing else.
  11. `CHART_PALETTE_TOKENS` drift: for each of the 16 token values, assert the token string appears in BOTH `packages/client-react/src/ui/equities/chart/*.module.css` and the solid twins — read the css files with `node:fs` in the test (motion-core tests may use node APIs; the PACKAGE stays no-DOM, tests are not shipped). Token map to pin verbatim:
     `up:"--accent-positive", down:"--accent-negative", grid:"--grid", line:"--accent-primary", sma20:"--accent-2", ema50:"--accent-aware", compare:"--accent-compare", drawing:"--accent-primary", drawingLevel:"--accent-aware", grip:"--accent-primary", crosshair:"--border-strong", paneRsi:"--accent-primary", paneMacd:"--accent-2", paneSignal:"--accent-aware", paneGuide:"--grid", histogram:"--text-muted"`.
- [ ] **Step 2: Run it** — `pnpm --filter @rtc/motion-core test -- drawChartScene` → FAIL (module absent).
- [ ] **Step 3: Implement `packages/motion-core/src/drawChartScene.ts`.** Structural interface (verbatim — NO text members):

```ts
/** The structural subset of CanvasRenderingContext2D the chart engine
 * draws through. Declared here (not imported from lib.dom) so motion-core
 * stays no-DOM: a structural type is not DOM access, and the real 2D
 * context satisfies it at every client call site. Text members are
 * deliberately absent — the substrate design keeps every glyph in the DOM. */
export interface CanvasGradient2D {
  addColorStop(offset: number, color: string): void;
}

export interface Canvas2D {
  fillStyle: string | CanvasGradient2D;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  shadowBlur: number;
  shadowColor: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  stroke(): void;
  fill(): void;
  setLineDash(segments: readonly number[]): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient2D;
}
```

  Then `ChartPalette` (16 fields), `CHART_PALETTE_TOKENS` (the Step-1 map, `as const satisfies Record<keyof ChartPalette, \`--${string}\`>`), `CanvasSize`, `OverlayLine`, `PlotCanvasScene`, and the three draw functions implementing exactly the call sequences the Step-1 tests pin. Shared private helpers: `px = (pct: number, span: number) => (pct / 100) * span` and `strokePolyline(ctx, points, size)` (beginPath, moveTo first, lineTo rest, stroke). Draw order in `drawPlotScene`: clear → grid → (candles | line | area) → overlays → compare → drawings+grips → crosshair. Keep the existing candle/wick pixel math from the spike verbatim (wick `x-0.5`, width 1; body centered on `x`). Area fill: polyline path extended to `(lastX, size.h)` and `(firstX, size.h)`, closePath, gradient fill at `globalAlpha 0.35`, reset to 1.
- [ ] **Step 4: Export from `packages/motion-core/src/index.ts`** — explicit named exports matching the file's public surface (follow the file's existing explicit-exports style).
- [ ] **Step 5: Run** `pnpm --filter @rtc/motion-core test -- drawChartScene` → PASS; then `pnpm --filter @rtc/motion-core test` (full) and `pnpm --filter @rtc/motion-core typecheck`.
- [ ] **Step 6: Retire the spike.** Delete `packages/ui-contract/src/visual/canvas/` entirely; delete both `EquitiesChartCanvasSpike.visual.tsx` hosts; remove both registries' import + `EquitiesChartCanvasSpike:` entry; delete the `"equities/chart-canvas-spike"` block from `scenarios.ts`; `git rm` the 20 golden PNGs. Then `pnpm --filter @rtc/ui-contract typecheck && pnpm --filter @rtc/ui-contract test` and both clients' `registryCoverage`: `pnpm --filter @rtc/client-react test -- registryCoverage`, `pnpm --filter @rtc/client-solid test -- registryCoverage` → PASS (coverage tests are scenario→registry referential, so full retirement stays green).
- [ ] **Step 7: Commit** — `git add` the explicit paths above only; message `feat(motion-core): production canvas engine — structural Canvas2D, full-scene draw, palette token map (spike retired)`.

---

### Task 2: `chartSubstrate` preference — all 21 sites off the `ambientStyle` template

**Files** (each site's template snippet is `ambientStyle`'s plumbing at the stated location — open the file, find the ambientStyle block, add the chartSubstrate twin beside it):

1. `packages/domain/src/preferences/preferences.ts` — beside `AmbientStyle` (~79-184): `export type ChartSubstrate = "dom" | "canvas";`, `export const DEFAULT_CHART_SUBSTRATE: ChartSubstrate = "dom";`, `export const CHART_SUBSTRATES: readonly ChartSubstrate[] = ["dom", "canvas"];` (each with a one-sentence doc comment in the file's style). No domain guard (ambientStyle pattern).
2. `packages/domain/src/ports/preferencesPort.ts` (~49-53): `chartSubstrate$(): Observable<ChartSubstrate>;` + `setChartSubstrate(substrate: ChartSubstrate): void;` + import.
3. `packages/domain/src/simulators/PreferencesSimulator.ts` — 4 points: `PreferencesSeed.chartSubstrate?`, subject field, constructor init with `?? DEFAULT_CHART_SUBSTRATE`, accessor pair with `distinctUntilChanged()`.
4. `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts` — seed field + three `it()`s mirroring the ambientStyle trio at ~407-431 (default/round-trip, push-to-subscribers, seeded-read), substituting `"canvas"`.
5. `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts` — 5 points: `export const CHART_SUBSTRATE_STORAGE_KEY = "rtc-chart-substrate";`, local `isChartSubstrate` guard over `CHART_SUBSTRATES`, field, `readStored(...)` ctor line, accessor pair writing through `writeStored`.
6. `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts` — same 5 points (duplicate sibling, not shared).
7. `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts` — 7 points: key, guard, `StoredPreferences.chartSubstrate?`, `Promise.all` slot + destructure + `if (isChartSubstrate(...)) stored.chartSubstrate = ...`, field + ctor default, `hydrate()` late-apply `if (s.chartSubstrate !== undefined) this.chartSubstrate.next(...)`, accessor pair with `void AsyncStorage.setItem(...).catch(() => {})`.
8. NEW `packages/client-core/src/presenters/ChartSubstratePresenter.ts` — mirror `AmbientStylePresenter.ts` exactly: `substrate$` (shareReplay bufferSize 1 refCount) + `setSubstrate(substrate)`.
9. `packages/client-core/src/composition.ts` — import, `Presenters` record member `chartSubstrate: ChartSubstratePresenter;`, construction `chartSubstrate: new ChartSubstratePresenter(ports.preferences),`.
10. `packages/react-bindings/src/createViewModel.ts` — 4 points mirroring `useAmbientStyle` (~198/319/544/1066): `interface UseChartSubstrateResult { substrate: ChartSubstrate; setSubstrate: (substrate: ChartSubstrate) => void; }`, decl `useChartSubstrate: () => UseChartSubstrateResult;`, `bind(presenters.chartSubstrate.substrate$, DEFAULT_CHART_SUBSTRATE)` + `function setChartSubstrate(...)`, returned-surface entry.
11. `packages/solid-bindings/src/createViewModel.ts` — same 4 points, `substrate: Accessor<ChartSubstrate>` via `toSignal(state(...))`.
12. `packages/client-react/src/ui/shell/prefs/PreferencesModal.tsx` — destructure `const { substrate: chartSubstrate, setSubstrate: setChartSubstrate } = useChartSubstrate();`, a `<PrefSegment label="Chart renderer" description="Retained DOM/SVG geometry, or immediate-mode canvas (fewer live DOM nodes)." options={CHART_SUBSTRATE_OPTIONS} value={chartSubstrate} onChange={(value: string) => { setChartSubstrate(value as ChartSubstrate); }} testid="pref-segment-chartSubstrate" />` row placed directly after the Ambient style row, and `const CHART_SUBSTRATE_OPTIONS: readonly PrefSegmentOption[] = [{ value: "dom", label: "DOM" }, { value: "canvas", label: "Canvas" }];` beside `AMBIENT_STYLE_OPTIONS`.
13. `packages/client-solid/src/ui/shell/prefs/PreferencesModal.tsx` — twin, with `value={chartSubstrate()}` (accessor call).
14. `packages/ui-contract/src/shared/harness/world.ts` — `chartSubstrateSeed?: ChartSubstrate` appended as the LAST positional `createWorld` param; `const chartSubstrate = new BehaviorSubject<ChartSubstrate>(chartSubstrateSeed ?? DEFAULT_CHART_SUBSTRATE);`; `World` interface member `readonly chartSubstrate: BehaviorSubject<ChartSubstrate>;` + returned-object entry.
15. `packages/ui-contract/src/shared/mount.ts` — `MountOptions.chartSubstrate?: ChartSubstrate;` (doc comment: seeds `useChartSubstrate`; defaults to `"dom"`), passed at the matching position in the `createWorld(...)` call.
16. `packages/ui-contract/src/shared/pages/shell/prefs/PreferencesModalPage.ts` — wrappers `chartSubstrateActive(substrate: ChartSubstrate): boolean { return this.segmentActive("chartSubstrate", substrate); }` and `async selectChartSubstrate(substrate: ChartSubstrate): Promise<void> { await this.selectSegment("chartSubstrate", substrate); }`.
17. `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts` — `useChartSubstrate: () => { const substrate = useSubject(world.chartSubstrate); return { substrate, setSubstrate: (next: ChartSubstrate) => { world.chartSubstrate.next(next); } }; }` beside `useAmbientStyle` (~825-833).
18. `packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts` — same with `wrapSubject(world.chartSubstrate)` (~766-774).
19. NEW `packages/client-core/src/presenters/__tests__/ChartSubstratePresenter.test.ts` — copy `AmbientStylePresenter.test.ts` verbatim, substituting the type, `"canvas"`/`"dom"`, and expected sequence `["dom", "canvas"]`.
20. `packages/ui-contract/src/specs/shell/prefs/PreferencesModal.contract.spec.ts` — beside the Ambient-style case (~216-227):

```ts
it("shows the REAL Chart renderer segment reflecting the active option, and writes through the seam on select", async () => {
  const page = mount(PreferencesModal, {
    props: { open: true, onClose: () => {} },
    chartSubstrate: "dom",
  });

  expect(page.chartSubstrateActive("dom")).toBe(true);
  expect(page.chartSubstrateActive("canvas")).toBe(false);

  await page.selectChartSubstrate("canvas");

  expect(page.chartSubstrateActive("canvas")).toBe(true);
  expect(page.chartSubstrateActive("dom")).toBe(false);
});
```

21. Both clients' `src/app/adapters/preferences.contract.test.ts` — seed-callback branch `if (seed.chartSubstrate) { localStorage.setItem(CHART_SUBSTRATE_STORAGE_KEY, seed.chartSubstrate); }` + key import. (RN's adapter contract test: same pattern against AsyncStorage — find the ambientStyle seed branch in `packages/client-react-native/src/app/adapters/` tests and twin it.)

**Interfaces produced (Tasks 3-5 rely on):** `useChartSubstrate(): { substrate: ChartSubstrate /* Accessor<> in solid */; setSubstrate(s): void }` on both ViewModels; `MountOptions.chartSubstrate`; `world.chartSubstrate`; `PreferencesModalPage.selectChartSubstrate/chartSubstrateActive`.

- [ ] **Step 1:** Sites 1-4 (domain), then `pnpm --filter @rtc/domain test && pnpm --filter @rtc/domain typecheck` → PASS (the port contract's new cases run against the simulator).
- [ ] **Step 2:** Sites 5-7 + 21 (adapters), then `pnpm --filter @rtc/client-react test -- preferences.contract`, `pnpm --filter @rtc/client-solid test -- preferences.contract`, `pnpm --filter @rtc/client-react-native test -- Preferences` → PASS.
- [ ] **Step 3:** Sites 8-9 + 19 (client-core), `pnpm --filter @rtc/client-core test -- ChartSubstrate && pnpm --filter @rtc/client-core typecheck` → PASS.
- [ ] **Step 4:** Sites 10-11 (bindings), both packages' typecheck.
- [ ] **Step 5:** Sites 12-18 + 20 (UI rows + harness + spec), then `pnpm --filter @rtc/client-react test:ui:contract -- PreferencesModal` and the solid twin → PASS (both clients).
- [ ] **Step 6:** Per-file biome/eslint on every touched file; commit with explicit paths — `feat(prefs): chartSubstrate preference (dom | canvas) — full plumbing + Chart renderer modal row`.

---

### Task 3: React integration — SceneCanvas, palette reader, substrate branches

**Files:**
- Create: `packages/client-react/src/ui/equities/chart/readChartPalette.ts`, `SceneCanvas.tsx`, `SceneCanvas.module.css`
- Modify: `CandleChart.tsx`, `ChartPlot.tsx`, `VolumePane.tsx`, `IndicatorPane.tsx`, `CrosshairOverlay.tsx`, `ChartPanel.tsx` (same dir)
- Test: existing suites must stay green; new behavior is pinned by Task 5's shared specs — this task adds only a colocated `readChartPalette.test.ts` unit.

**Interfaces:**
- Consumes: Task 1's `drawPlotScene`/`drawVolumeScene`/`drawPaneScene`/`PlotCanvasScene`/`OverlayLine`/`ChartPalette`/`CHART_PALETTE_TOKENS`/`Canvas2D`/`CanvasSize`; Task 2's `useChartSubstrate`.
- Produces (Task 4 mirrors; Tasks 5-6 mount): `CandleChartProps.substrate?: ChartSubstrate` (default `"dom"`); `ChartPlotProps.substrate?`, `canvasPlot?: PlotCanvasScene`, `canvasVolume?: readonly VolumeSceneBar[]`; `IndicatorPaneProps.substrate?`; `VolumePaneProps.canvasBars?`; `CrosshairOverlayProps.linesHidden?: boolean`; testids `chart-canvas-plot` / `chart-canvas-volume` / `chart-canvas-pane`; canvas data attributes `data-candles`, `data-drawings`, `data-compare` on `chart-canvas-plot`.

- [ ] **Step 1: `readChartPalette.ts` + colocated test.**

```ts
import { CHART_PALETTE_TOKENS, type ChartPalette } from "@rtc/motion-core";

/** Reads the chart's canvas palette off the live CSS custom-property
 * cascade at `el` — the one DOM-touching half of the palette port (the
 * token map itself lives in motion-core). Called per draw: ~16 reads on
 * one element at event rate, negligible next to the raster itself, and it
 * makes theme switches self-correcting without a theme subscription. */
export function readChartPalette(el: HTMLElement): ChartPalette {
  const cs = getComputedStyle(el);
  const out = {} as Record<keyof ChartPalette, string>;
  for (const key of Object.keys(CHART_PALETTE_TOKENS) as (keyof ChartPalette)[]) {
    out[key] = cs.getPropertyValue(CHART_PALETTE_TOKENS[key]).trim();
  }
  return out;
}
```

  Test: jsdom `document.createElement("div")` with inline `style.setProperty("--accent-positive", "#0f0")` etc. for two tokens; assert those keys read back and unset tokens read `""`.
- [ ] **Step 2: `SceneCanvas.tsx`.** One host for all three regions:

```tsx
import { type ReactElement, useLayoutEffect, useRef, useState } from "react";

import type { Canvas2D, ChartPalette, CanvasSize } from "@rtc/motion-core";

import { readChartPalette } from "./readChartPalette";

import styles from "./SceneCanvas.module.css";

/** An absolutely-filling canvas that repaints via the `draw` slot whenever
 * the slot identity, the observed box size, or the device pixel ratio
 * changes — never on a rAF loop, so a quiet stream (and power-saver
 * Freeze) costs zero. The palette is re-read from the CSS cascade on every
 * repaint, so theme switches correct themselves on the next draw. */
export function SceneCanvas({ draw, testid, summary }: SceneCanvasProps): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [box, setBox] = useState<CanvasSize | null>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setBox({ w: rect.width, h: rect.height });
      }
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !box || box.w === 0 || box.h === 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.w * dpr);
    canvas.height = Math.round(box.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, readChartPalette(canvas), box);
  });

  return <canvas ref={ref} className={styles.canvas} data-testid={testid} {...summary} />;
}

export interface SceneCanvasProps {
  /** Paints one frame — the region binds its scene into this slot, so a
   * new scene object is a new slot identity and the effect repaints. */
  readonly draw: (ctx: Canvas2D, palette: ChartPalette, size: CanvasSize) => void;
  readonly testid: string;
  /** Substrate-neutral witness attributes (`data-candles` etc.) for the
   * contract tier — jsdom has no 2D context, so counts on the element are
   * the only cross-substrate geometry signal. */
  readonly summary?: Readonly<Record<`data-${string}`, string>>;
}
```

  Notes: `ctx` (a real `CanvasRenderingContext2D`) is passed where `Canvas2D` is expected — structural, no cast. The draw effect is deliberately dependency-less (`useLayoutEffect` with no array): React Compiler memoizes the parents, so `draw` identity changes exactly when the bound scene changes; a paint is cheap and correctness beats spurious-repaint elimination here. `setTransform` needs adding to nothing — it's already in `Canvas2D`. `SceneCanvas.module.css`: `.canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }` (pointer events stay on the plot container, exactly like the SVG layers' `pointer-events: none` today).
- [ ] **Step 3: `CandleChart.tsx`** — add `substrate?: ChartSubstrate` to props (doc: `"dom"` default; `"canvas"` swaps the geometry layers for per-region canvases — text, chips, pills stay DOM). In the body, when `substrate === "canvas"` assemble the canvas scenes with the SAME motion-core calls the DOM path uses:

```ts
const scene = substrate === "canvas"
  ? chartScene(candles, liveRate, flashOn, { viewport, kind, yScale, compare })
  : null;
const canvasPlot: PlotCanvasScene | null = scene
  ? {
      scene,
      overlays: indicators.map((id) => {
        return { id, points: indicatorPoints(indicatorValues(closes, id), viewport, vm.scale) };
      }),
      drawings: drawItems,
      crosshair: cursor
        ? crosshairScene(cursor.xFrac, cursor.yFrac, candles, viewport, vm.scale)
        : null,
    }
  : null;
```

  Pass `substrate={substrate}`, `canvasPlot={canvasPlot ?? undefined}`, `canvasVolume={substrate === "canvas" ? volumeScene(candles, viewport) : undefined}` to `ChartPlot` (imports: `chartScene`, `crosshairScene`, `volumeScene`, `type PlotCanvasScene` from motion-core). `vm`/`cross` stay computed unconditionally — canvas mode still renders their text (price labels, time labels, crosshair readout).
- [ ] **Step 4: `ChartPlot.tsx`** — new optional props (`substrate`, `canvasPlot`, `canvasVolume`); inside the plot box replace the four geometry children when canvas:

```tsx
{substrate === "canvas" && canvasPlot ? (
  <SceneCanvas
    testid="chart-canvas-plot"
    summary={{
      "data-candles": String(canvasPlot.scene.candles.length),
      "data-drawings": String(canvasPlot.drawings.filter((d) => { return d.id !== "draft"; }).length),
      "data-compare": String(canvasPlot.scene.compareLinePoints.length > 0),
    }}
    draw={(ctx, palette, size) => {
      drawPlotScene(ctx, canvasPlot, palette, size);
    }}
  />
) : (
  <>
    {vm.grid.map(/* unchanged */)}
    {kind === "candles" && <CandleBars candles={vm.candles} />}
    <SvgPathLayer …unchanged… />
    <DrawingsLayer items={drawItems} />
  </>
)}
{/* price labels, BackfillChips, BackToLiveButton stay OUTSIDE the branch */}
<CrosshairOverlay vm={cross} showHorizontal={showHorizontal} linesHidden={substrate === "canvas"} />
```

  Grid divs move INSIDE the DOM arm (canvas draws its own grid); price-label divs stay outside (text). `VolumePane` gains `canvasBars` (renders `<SceneCanvas testid="chart-canvas-volume" draw={(ctx,p,s) => { drawVolumeScene(ctx, canvasBars, p, s); }} />` instead of its bar divs when set — pane frame/border stays). `IndicatorPane` gains `substrate` (canvas arm: `<SceneCanvas testid="chart-canvas-pane" draw={(ctx,p,s) => { drawPaneScene(ctx, scene, p, s); }} />` replacing its SVG geometry; readout + label text stay DOM; the pane's own crosshair echo div stays DOM — it is one div and positioning it via canvas would force pane repaints on every pointer move for zero node savings). `CrosshairOverlay` gains `linesHidden?: boolean` — when true skips the two hairline divs, keeps the readout chip.
- [ ] **Step 5: `ChartPanel.tsx`** — `const { substrate } = useChartSubstrate();` threaded as `substrate={substrate}` to `CandleChart`. (Solid twin will read the accessor in JSX.)
- [ ] **Step 6: Verify green** — `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-react test:ui:contract` (all existing DOM-mode suites unchanged — the branch defaults to DOM). Per-file biome/eslint on touched files.
- [ ] **Step 7: Eyeball it live** — `pnpm dev`, sign in (`demo`/`mcdc2026`), equities workspace, Preferences → Chart renderer → Canvas: candles render, wheel-zoom/pan works, crosshair tracks with readout, draw a trendline + drag its endpoint, add MSFT compare, enable RSI+MACD panes, switch themes (palette follows), toggle back to DOM. Note anything off in the report.
- [ ] **Step 8: Commit** — explicit paths; `feat(client-react): canvas substrate — SceneCanvas host, palette reader, geometry-layer branch`.

---

### Task 4: Solid twin

**Files:** Create `packages/client-solid/src/ui/equities/chart/readChartPalette.ts` (identical body — no framework code), `SceneCanvas.tsx`, `SceneCanvas.module.css` (copy); Modify the solid `CandleChart.tsx`, `ChartPlot.tsx`, `VolumePane.tsx`, `IndicatorPane.tsx`, `CrosshairOverlay.tsx`, `ChartPanel.tsx`.

**Interfaces:** Consumes Task 1 + Task 2 (`useChartSubstrate` → `{ substrate: Accessor<ChartSubstrate>, setSubstrate }`). Produces the same prop names/testids/data-attributes as Task 3 — byte-equivalent SEMANTICS, Solid idiom.

- [ ] **Step 1: `SceneCanvas.tsx` (solid).** Same contract, Solid mechanics:

```tsx
import { createEffect, createSignal, type JSX, onCleanup, onMount } from "solid-js";

import type { Canvas2D, CanvasSize, ChartPalette } from "@rtc/motion-core";

import { readChartPalette } from "./readChartPalette";

import styles from "./SceneCanvas.module.css";

export function SceneCanvas(props: SceneCanvasProps): JSX.Element {
  let canvas: HTMLCanvasElement | undefined;
  const [box, setBox] = createSignal<CanvasSize | null>(null);

  onMount(() => {
    if (!canvas) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setBox({ w: rect.width, h: rect.height });
      }
    });
    observer.observe(canvas);
    onCleanup(() => {
      observer.disconnect();
    });
  });

  createEffect(() => {
    const size = box();
    const ctx = canvas?.getContext("2d");
    const paint = props.draw;
    if (!canvas || !ctx || !size || size.w === 0 || size.h === 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(ctx, readChartPalette(canvas), size);
  });

  return (
    <canvas ref={canvas} class={styles.canvas} data-testid={props.testid} {...(props.summary ?? {})} />
  );
}
```

  (`props.draw` read inside the effect = tracked; the parent passes a closure over its reactive scene reads so scene changes re-run the effect — mirror how the solid `ChartPlot` builds it in Step 2.)
- [ ] **Step 2: Solid `ChartPlot`/`CandleChart`/`VolumePane`/`IndicatorPane`/`CrosshairOverlay`/`ChartPanel`** — port Task 3's Steps 3-5 per Solid idiom: `<Show when={...} fallback={...}>` for the substrate branch; the `draw` slot closes over the reactive getters (e.g. `draw={(ctx, palette, size) => { drawPlotScene(ctx, plotSceneFor(), palette, size); }}` where `plotSceneFor` is a `createMemo` assembling `PlotCanvasScene` from `props`/local memos — reads inside the memo/effect keep tracking). `ChartPanel`: `substrate={substrateOf().substrate()}`-style accessor reads in JSX. Keep every testid/data-attribute string identical to react's.
- [ ] **Step 3: Verify** — `pnpm --filter @rtc/client-solid typecheck && pnpm --filter @rtc/client-solid test && pnpm --filter @rtc/client-solid test:ui:contract`; per-file biome/eslint. Live eyeball via `pnpm dev:solid` (same walkthrough as Task 3 Step 7).
- [ ] **Step 4: Commit** — `feat(client-solid): canvas substrate — Solid twin (SceneCanvas, branch, palette reader)`.

---

### Task 5: Shared contract cases — switch, node budget, canvas-mode smoke

**Files:**
- Create: `packages/ui-contract/src/specs/equities/chart/CanvasSubstrate.contract.spec.ts`
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts` (canvas accessors)

**Interfaces:** Consumes `MountOptions.chartSubstrate` (T2), testids + data attributes (T3/T4), `PreferencesModalPage` wrappers (T2). Page-object additions: `canvasPlot(): HTMLElement | null` (queryByTestId `chart-canvas-plot`), `canvasAttr(name: "data-candles" | "data-drawings" | "data-compare"): string | null`, reusing existing `visibleTestids`, `wrapNodeCount`, pointer helpers.

The spec mounts through the SAME workspace/panel harness `ChartCompare.contract.spec.ts` uses (copy its `mountPillWorkspace`/`mountChart` idioms — read that file first). Cases (write them ALL first, watch them fail, then they pass with zero production edits — Tasks 3/4 already shipped the behavior; this task is the shared pin):

```ts
describe("Canvas substrate — preference-driven geometry swap (shared harness)", () => {
  it("substrate=canvas swaps plot geometry DOM for one canvas and back", async () => {
    // mount with chartSubstrate: "dom" → candles present, no canvas
    // flip world.chartSubstrate.next("canvas") (or drive the modal PO)
    // → chart-canvas-plot present; [data-candle], chart-path-line,
    //   chart-drawing, chart-crosshair-v/h, chart-volume-bar all ABSENT;
    //   price labels + time axis still present (text stays DOM)
    // flip back → geometry testids return, canvas gone
  });

  it("node-count pin: canvas mode collapses the plot's per-datum DOM", () => {
    // mount DOM mode with panes ["rsi","macd"] + a compare + 2 drawings;
    // domNodes = chart.wrapNodeCount()
    // remount (or flip) canvas mode, same props;
    // canvasNodes = chart.wrapNodeCount()
    // expect(canvasNodes).toBeLessThan(domNodes - 800)  // ≥300 candles × 3 nodes gone
    // expect(chart.visibleTestids("chart-canvas-plot")).toBe(1)
  });

  it("canvas-mode crosshair: readout text works without hairline DOM", () => {
    // canvas mode; chart.setPointer(0.5, 0.5)
    // expect(chart.crosshairReadout()).toBe(<same literal ChartInteraction pins>)
    // expect(chart.visibleTestids("chart-crosshair-v")).toBe(0)
  });

  it("canvas-mode drawing commit: intents + data-drawings witness + DOM-mode survival", async () => {
    // canvas mode; head.setDrawTool("trendline"); plotPointerDown/Move/Up
    // expect(canvasAttr("data-drawings")).toBe("1")   // scene-level witness
    // flip substrate to "dom"
    // expect(panel.drawingKinds()).toEqual(["trendline"])  // machine survived the swap
  });

  it("canvas-mode compare: pills + percent axis + data-compare witness", async () => {
    // canvas mode; head.toggleCompare("MSFT"); waitUntilYScaleAttr("percent")
    // expect(head.yScalePillLabel()).toBe("PCT")
    // expect(canvasAttr("data-compare")).toBe("true")
    // expect(chart.visibleTestids("chart-compare-line")).toBe(0)
  });
});
```

Fill each case with real code following the exact mount/PO idioms found in `ChartCompare.contract.spec.ts` and `ChartInteraction.contract.spec.ts` (the crosshair readout literal comes from `ChartInteraction`'s existing pin — reuse its exact expected string for the same fixture + pointer position; if the fixture differs, compute and pin the literal, never a regex). jsdom has no 2D context — every assertion above is DOM-presence/text/attribute-based, none touches pixels.

- [ ] **Step 1:** Page-object additions; **Step 2:** write all five cases; **Step 3:** run against BOTH clients — `pnpm --filter @rtc/client-react test:ui:contract -- CanvasSubstrate` and solid twin → PASS both (if a case fails, the defect is in T3/T4 parity — fix THERE, not by weakening the case); **Step 4:** full contract suites both clients; **Step 5:** commit — `test(ui-contract): canvas substrate — switch, node-count pin, canvas-mode smoke (both clients)`.

---

### Task 6: Composite visual scenario through the theme matrix + arm64 goldens

**Files:**
- Create: `packages/client-react/tests/ui/visual/react/EquitiesChartCanvas.visual.tsx`, `packages/client-solid/tests/ui/visual/solid/EquitiesChartCanvas.visual.tsx`
- Modify: `packages/ui-contract/src/visual/scenarios.ts` (+1 base entry → 10 matrix combos), both registries (+import +entry)
- Goldens: +10 PNGs under `react-local/darwin-arm64` (canonical x86 +10 arrives via the post-merge dispatch + sync PR — NOT this task)

**Host:** the forced-state family (`EquitiesChartInteractive.visual.tsx` precedent) — mount the real `ChartPlot` with `substrate="canvas"` and a rich literal state: the file's existing 300-candle `candleAt` series, panned viewport, pinned crosshair (via literal `canvasPlot.crosshair` from `crosshairScene`), the existing `DRAWINGS` pair with `t1` selected, a literal compare series (copy `EquitiesChartCompare`'s `COMPARE_SERIES`), `indicators: ["sma20","ema50"]` overlays, `canvasVolume` from `volumeScene`, and one `macd` pane (`substrate="canvas"` on the pane). Build `canvasPlot` with the same motion-core calls Task 3 Step 3 shows. Deterministic: no gestures, no timers; the SceneCanvas draw runs in `useLayoutEffect` (react) / `createEffect` pre-paint (solid) — the spike proved this capture-safe. Scenario entry:

```ts
// Canvas substrate (production engine, spec 2026-08-09): the full-scene
// drawPlotScene/drawVolumeScene/drawPaneScene composite — candles + volume
// + compare + drawings + macd pane + crosshair — with the palette read
// from each theme's live token cascade, so the 10-combo matrix is the
// palette port's pixel witness. Text stays DOM (labels/readout/chips).
"equities/chart-canvas": {
  componentKey: "EquitiesChartCanvas",
  fixtureKey: "equities-loaded",
},
```

- [ ] **Step 1:** Scenario entry first; run both clients' `registryCoverage` → FAIL on unknown componentKey (the recipe's TDD signal).
- [ ] **Step 2:** Both hosts + registry entries; `registryCoverage` → PASS.
- [ ] **Step 3:** Capture arm64: `SCENARIO_PATTERN=equities-chart-canvas pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update` (env var — NEVER `-- -g`, it silently full-runs) → exactly 10 new PNGs in `react-local/darwin-arm64/.../equities-chart-canvas__*.png`; `git status` to confirm ONLY those 10 appeared.
- [ ] **Step 4:** Eyeball all 10 (distinct palettes per skin; candles/compare/drawings/pane/crosshair all visibly present); assert-run solid against them: `SCENARIO_PATTERN=equities-chart-canvas pnpm --filter @rtc/client-solid test:ui:visual:playwright` → PASS.
- [ ] **Step 5:** Commit hosts + scenario + 10 PNGs (explicit paths) — `feat(visual): equities/chart-canvas composite scenario ×10 themes (palette-port pixel witness)`.

---

### Task 7: E2E journey — switch to canvas, interact, switch back (native Playwright)

**Files:**
- Modify: `tests/browser/page-objects/contracts/testids.ts` (add `prefs` group: `prefs-modal`, `pref-segment-chartSubstrate-dom`, `pref-segment-chartSubstrate-canvas`, plus the existing modal-open control's testid — find how the app opens Preferences: grep `prefs-modal` usage in `client-react/src/ui/shell` for the trigger button's testid), `tests/browser/page-objects/contracts/EquitiesChart.ts` + `tests/browser/page-objects/playwright/EquitiesChart.ts` (canvas accessors: `expectCanvasPlotVisibleWithin`, `readCanvasSummary`), NEW or extended scenario fns in `tests/browser/scenarios/equitiesChart.ts` (`openPreferencesAndSelectSubstrate(ctx, "canvas" | "dom")`, `expectCanvasMode`, `expectDomMode`)
- Modify: `tests/browser/playwright/equitiesChart.spec.ts` — one new test

```ts
test("switching the chart renderer to canvas keeps the chart interactive, and back", async ({ ctx }) => {
  await equitiesChart.openEquitiesWorkspace(ctx);
  await equitiesChart.expectPlotVisibleWithin(ctx, 5);

  await equitiesChart.openPreferencesAndSelectSubstrate(ctx, "canvas");
  await equitiesChart.expectCanvasMode(ctx, 5);          // chart-canvas-plot visible, [data-candle] gone

  await equitiesChart.moveCrosshairOnPlot(ctx, 0.5, 0.5); // reuse/extend existing pointer scenario fn
  await equitiesChart.expectCrosshairReadoutVisibleWithin(ctx, 3);

  await equitiesChart.clickDrawPill(ctx, "trendline");
  await equitiesChart.dragOnPlot(ctx, { x: 0.25, y: 0.7 }, { x: 0.7, y: 0.35 });
  await equitiesChart.expectCanvasDrawingsCount(ctx, 1, 3);   // data-drawings attribute

  await equitiesChart.openPreferencesAndSelectSubstrate(ctx, "dom");
  await equitiesChart.expectDomMode(ctx, 5);              // geometry testids back
  await equitiesChart.expectDrawingVisibleWithin(ctx, 3); // the canvas-drawn drawing survived
});
```

  Follow the strict layering (spec file → scenario fns → PO contract → playwright PO; no raw handles in the spec file — the file's own header comment states the gate). Where a helper already exists (`dragOnPlot`, `clickDrawPill`, `expectDrawingVisibleWithin`), reuse it; author the rest in the PO layers. The Preferences scenario fn is NEW surface (no modal e2e exists today): click the prefs trigger, wait `prefs-modal`, click `pref-segment-chartSubstrate-<value>`, close the modal (find the close/done testid in `PreferencesModal.tsx` — `prefs-close`/`prefs-done` exist per the modal's own component).
- [ ] **Step 1:** testids + PO contract + playwright PO + scenario fns; **Step 2:** the spec test; **Step 3:** run the react suite alone first — `pnpm --filter @rtc/tests test:browser:playwright -- -g "chart renderer"` (this tier's own runner accepts direct playwright args; if the script rejects `-g`, run the underlying playwright binary from `tests/` with `-g`) → PASS; then the solid variant script the same way; **Step 4:** commit — `test(e2e): canvas-substrate journey — prefs modal PO surface + interactive canvas round-trip`.

---

### Task 8: Docs, perf receipt, repo-wide lint net

**Files:**
- Modify: `docs/architecture/17-web-client-up-close.md` (new §17.8 "The canvas substrate" — or the next free § number; check the file), `docs/STATUS.md` (replace the escape-hatch text inside the "Canvas chart renderer productionization" entry: productionization SHIPPED, pointer to the new spec; keep only genuinely-deferred residue), `docs/performance.md` (one paragraph pointing at the receipt), `docs/superpowers/specs/2026-08-02-pluggable-chart-renderer-design.md` (§5 note: engine since moved to motion-core — pointer to the new spec), `docs/superpowers/specs/2026-08-09-canvas-substrate-design.md` (append "## 8. Receipt (measured)")

- [ ] **Step 1: §17.x subsection** (~40 lines): the preference switch, geometry-on-canvas/text-in-DOM split, per-region canvases + `SceneCanvas`, per-draw palette read over `CHART_PALETTE_TOKENS`, the structural-`Canvas2D` engine-home rationale, no-rAF doctrine, and the witness strategy (data-attribute summaries + the 10-combo composite scenario). Run `pnpm check:doc-links`.
- [ ] **Step 2: The receipt.** (a) Node counts: quote the Task 5 pin's actual measured numbers — run the spec with a temporary `console.log` of both `wrapNodeCount()` values (do not commit the log), record DOM-mode vs canvas-mode totals. (b) Trace: `pnpm dev`, canvas OFF, equities + RSI+MACD panes + compare, hold left-pan until several backfill pages load (deep history), record a 10s Performance trace while panning with crosshair active; repeat with canvas ON; record in §8: node totals, trace duration %, main-thread rendering (style/layout/paint) ms from the Performance panel summary for each. Numbers are whatever they measure — record them honestly even if unflattering, plus one sentence of interpretation.
- [ ] **Step 3: Repo-wide lint net** (owns what Tasks 1-7 deferred): `pnpm exec biome ci .` → `pnpm lint:eslint` → `pnpm check:lint-warnings-drift` → `pnpm lint:eslint:types` → fix any drift from this branch's files (targeted `--write`/`--fix`, fold into this commit). Ignore sibling-worktree paths.
- [ ] **Step 4:** `pnpm check:doc-links`; commit — `docs: canvas substrate — §17 subsection, STATUS close-out, measured receipt`.

---

## Self-review notes (already applied)

- Spec §3.1→T1 (incl. spike retirement), §3.2→T3/T4 Step 1, §3.3→T2, §3.4→T3/T4, §4→T1 tests + T5 + T6 + T7, §5→T8, §6 delivery→the PR after T8; §3.5/§7 exclusions repeated in Global Constraints.
- The one intentional deviation from spec §4's "twin subset" phrasing: the canvas drawing-drag case asserts via `data-drawings` + DOM-mode survival rather than `drawingAttr` (which cannot exist on canvas) — this IS the substitute the spec's "asserting machine/text outcomes, never pixels" sentence calls for.
- Type consistency checked: `Canvas2D`/`ChartPalette`/`PlotCanvasScene`/`OverlayLine`/`CanvasSize` names identical across T1 interface block, T3/T4 imports, T5/T6 usage; `useChartSubstrate` shape matches T2's bindings surface in both frameworks; testid strings appear identically in T3, T4, T5, T6, T7.
- Known judgment points left to implementers, flagged inline: §17 section number (T8), the prefs trigger + close testids (T7), the exact crosshair-readout literal if T5's fixture differs from ChartInteraction's, ±the node-budget delta constant (T5 — measure, then pin below the measured gap with margin).
