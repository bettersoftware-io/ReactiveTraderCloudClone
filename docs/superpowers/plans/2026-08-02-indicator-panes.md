# Indicator Panes (RSI + MACD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RSI(14) and MACD(12,26,9) as toggleable panes below the price plot in both web clients, with crosshair continuation + readouts and a contract-enforced node budget.

**Architecture:** Symmetric extension of the existing overlay-indicator machinery: `EqWorkspaceMachine` gains `panes`/`togglePane`; motion-core gains `paneSeries.ts` (math) + `paneScene.ts` (numeric scene + readout, seam discipline); each client gains one `IndicatorPane` shell that projects the scene (MACD histogram as ONE batched SVG path). Crosshair extends by echoing the plot's `--chx` into panes; pane hover feeds the same cursor state with an `inPlot: false` flag that hides the horizontal hairline.

**Tech Stack:** TypeScript (nodenext, `.js` extensions), RxJS machine patch pattern, vitest, shared ui-contract specs, Playwright visual/e2e.

**Spec:** [../specs/2026-08-02-indicator-panes-design.md](../specs/2026-08-02-indicator-panes-design.md)

## Global Constraints

- All pane math/geometry in `@rtc/motion-core`; shells project only — no computation, no DOM hit-testing; pointer handlers forward fractions.
- MACD histogram = one batched SVG `<path>` per pane, never per-bar DOM nodes.
- Node budget: chart column with BOTH panes active ≤ baseline + **40** elements — a contract-test assertion (Task 6), not prose.
- Zero steady-state motion added (no CSS animations/transitions/rAF in pane code).
- Existing chart behavior byte-identical when no pane is active; existing goldens unchanged (2 new scenarios add files only).
- `@rtc/motion-core` stays zero-dep/no-DOM; `PaneScene` fields number/boolean/label-text only (walker + `CssVarKeys` compile check).
- Periods are fixed exported constants: `RSI_WINDOW = 14`, `MACD_FAST = 12`, `MACD_SLOW = 26`, `MACD_SIGNAL = 9`.
- Repo rules: `.js` import extensions, mandatory braces, effect-named functions, Biome clean, **`pnpm lint:eslint` clean** (newspaper-order in test files: describe/it first, function/type/interface declarations below; no inline object param/return types — named interfaces), knip clean.

## File Structure

```
packages/motion-core/src/
  paneSeries.ts + paneSeries.test.ts     NEW  rsiValues/macdValues + constants
  paneScene.ts + paneScene.test.ts       NEW  PaneScene/paneScene/paneReadout
  index.ts                               MOD  export both modules
packages/client-core/src/presenters/EqWorkspaceMachine.ts   MOD  EqPaneId/panes/togglePane
packages/{react,solid}-bindings/src/createViewModel.ts      MOD  expose panes/togglePane
packages/ui-contract/src/shared/…buildFakeViewModel…        MOD  fake exposure (mirror indicators)
packages/client-react/src/ui/equities/chart/
  IndicatorPane.tsx + IndicatorPane.module.css   NEW
  IndicatorPills.tsx, EqChartHead.tsx, CandleChart.tsx, ChartPlot.tsx,
  CrosshairOverlay.tsx, useChartGestures.ts, CandleChart.module.css   MOD
packages/client-solid/src/ui/equities/chart/    (Solid twins, same set)
packages/ui-contract/src/specs/equities/chart/ChartPanes.contract.spec.ts  NEW
packages/ui-contract/src/…pages/CandleChartPage…            MOD  pane drivers
packages/ui-contract/src/visual/scenarios.ts                MOD  +2 scenarios
packages/{client-react,client-solid}/tests/ui/visual/…/EquitiesChartPanes.visual.tsx  NEW (+registry)
tests/browser/…equities chart e2e suite…                    MOD  +1 journey
docs/architecture/17-web-client-up-close.md, docs/STATUS.md MOD
```

---

### Task 1: `paneSeries.ts` — RSI + MACD math

**Files:**
- Create: `packages/motion-core/src/paneSeries.ts`, `packages/motion-core/src/paneSeries.test.ts`
- Modify: `packages/motion-core/src/index.ts` (export block, explicit named style)

**Interfaces:**
- Consumes: nothing new (`emaValues`'s seeding convention in `indicatorSeries.ts` is the reference — read it first; reuse via export if trivially exposable, else reimplement locally with a comment naming the twin).
- Produces (Tasks 2/6 rely on): `RSI_WINDOW = 14`, `MACD_FAST = 12`, `MACD_SLOW = 26`, `MACD_SIGNAL = 9`; `rsiValues(closes: readonly number[]): readonly (number | null)[]`; `interface MacdSeries { readonly macd: readonly (number | null)[]; readonly signal: readonly (number | null)[]; readonly hist: readonly (number | null)[]; }`; `macdValues(closes: readonly number[]): MacdSeries`.

- [ ] **Step 1: Failing tests first** (`paneSeries.test.ts`; respect newspaper-order — tests first, helpers below):

```ts
import { describe, expect, it } from "vitest";

import { macdValues, rsiValues } from "./paneSeries.js";

describe("rsiValues", () => {
  it("is null through the warm-up and lands at index 14", () => {
    const values = rsiValues(rampUp(30));
    expect(values.slice(0, 14)).toEqual(Array(14).fill(null));
    expect(values[14]).not.toBeNull();
  });

  it("clamps to 100 when every delta is a gain", () => {
    const values = rsiValues(rampUp(30));
    expect(values[20]).toBe(100);
  });

  it("is 0 when every delta is a loss", () => {
    const values = rsiValues(rampDown(30));
    expect(values[20]).toBe(0);
  });

  it("settles at 50 for perfectly alternating ±1 deltas", () => {
    // gains and losses average identically → RS = 1 → RSI = 50, exactly,
    // from the first defined index onward (Wilder smoothing preserves the
    // symmetry).
    const values = rsiValues(zigzag(40));
    for (let i = 14; i < 40; i++) {
      expect(values[i]).toBeCloseTo(50, 10);
    }
  });

  it("is empty for an empty input and all-null when shorter than the window", () => {
    expect(rsiValues([])).toEqual([]);
    expect(rsiValues(rampUp(10))).toEqual(Array(10).fill(null));
  });
});

describe("macdValues", () => {
  it("respects the null boundaries: macd at 25, signal and hist at 33", () => {
    const { macd, signal, hist } = macdValues(rampUp(40));
    expect(macd[24]).toBeNull();
    expect(macd[25]).not.toBeNull();
    expect(signal[32]).toBeNull();
    expect(signal[33]).not.toBeNull();
    expect(hist[32]).toBeNull();
    expect(hist[33]).not.toBeNull();
  });

  it("is all-zero for constant closes", () => {
    const { macd, signal, hist } = macdValues(Array(40).fill(100));
    expect(macd[30]).toBeCloseTo(0, 10);
    expect(signal[35]).toBeCloseTo(0, 10);
    expect(hist[35]).toBeCloseTo(0, 10);
  });

  it("is positive on a steady uptrend (fast EMA above slow)", () => {
    const { macd } = macdValues(rampUp(40));
    expect(macd[30]).toBeGreaterThan(0);
  });

  it("keeps hist ≡ macd − signal wherever both are defined", () => {
    const closes = pseudoRandomCloses(60);
    const { macd, signal, hist } = macdValues(closes);
    for (let i = 33; i < 60; i++) {
      expect(hist[i]).toBeCloseTo((macd[i] as number) - (signal[i] as number), 10);
    }
  });

  it("is deterministic", () => {
    const closes = pseudoRandomCloses(60);
    expect(macdValues(closes)).toEqual(macdValues(closes));
  });
});

function rampUp(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    return 100 + i;
  });
}

function rampDown(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    return 100 - i;
  });
}

function zigzag(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    return 100 + (i % 2);
  });
}

/** Fixed LCG so the fixture is stable without Math.random. */
function pseudoRandomCloses(n: number): number[] {
  const out: number[] = [];
  let seed = 42;

  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    out.push(100 + (seed % 1000) / 100);
  }

  return out;
}
```

- [ ] **Step 2: Run to verify failure.** `pnpm --filter @rtc/motion-core test -- paneSeries` → module not found.
- [ ] **Step 3: Implement `paneSeries.ts`.** Doc-comment style mirrors `indicatorSeries.ts`:

```ts
export const RSI_WINDOW = 14;
export const MACD_FAST = 12;
export const MACD_SLOW = 26;
export const MACD_SIGNAL = 9;

export function rsiValues(
  closes: readonly number[],
): readonly (number | null)[] {
  const out: (number | null)[] = Array(closes.length).fill(null);

  if (closes.length <= RSI_WINDOW) {
    return out;
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= RSI_WINDOW; i++) {
    const delta = (closes[i] as number) - (closes[i - 1] as number);
    avgGain += Math.max(0, delta);
    avgLoss += Math.max(0, -delta);
  }

  avgGain /= RSI_WINDOW;
  avgLoss /= RSI_WINDOW;
  out[RSI_WINDOW] = rsiOf(avgGain, avgLoss);

  for (let i = RSI_WINDOW + 1; i < closes.length; i++) {
    const delta = (closes[i] as number) - (closes[i - 1] as number);
    avgGain = (avgGain * (RSI_WINDOW - 1) + Math.max(0, delta)) / RSI_WINDOW;
    avgLoss = (avgLoss * (RSI_WINDOW - 1) + Math.max(0, -delta)) / RSI_WINDOW;
    out[i] = rsiOf(avgGain, avgLoss);
  }

  return out;
}

function rsiOf(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) {
    return avgGain === 0 ? 50 : 100;
  }

  return 100 - 100 / (1 + avgGain / avgLoss);
}

export interface MacdSeries {
  readonly macd: readonly (number | null)[];
  readonly signal: readonly (number | null)[];
  readonly hist: readonly (number | null)[];
}

export function macdValues(closes: readonly number[]): MacdSeries {
  const fast = emaSeries(closes, MACD_FAST);
  const slow = emaSeries(closes, MACD_SLOW);

  const macd = closes.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f === null || s === null || f === undefined || s === undefined
      ? null
      : f - s;
  });

  // Signal = EMA(MACD_SIGNAL) of the macd stream, seeded per the same
  // SMA-seed convention, offset past macd's own warm-up.
  const defined = macd
    .map((v, i) => {
      return { v, i };
    })
    .filter((e): e is { v: number; i: number } => {
      return e.v !== null;
    });
  const signal: (number | null)[] = Array(closes.length).fill(null);

  if (defined.length >= MACD_SIGNAL) {
    let ema =
      defined.slice(0, MACD_SIGNAL).reduce((acc, e) => {
        return acc + e.v;
      }, 0) / MACD_SIGNAL;
    signal[(defined[MACD_SIGNAL - 1] as { i: number }).i] = ema;
    const k = 2 / (MACD_SIGNAL + 1);

    for (let d = MACD_SIGNAL; d < defined.length; d++) {
      const entry = defined[d] as { v: number; i: number };
      ema = entry.v * k + ema * (1 - k);
      signal[entry.i] = ema;
    }
  }

  const hist = macd.map((v, i) => {
    const s = signal[i];
    return v === null || s === null || s === undefined ? null : v - s;
  });

  return { macd, signal, hist };
}
```

`emaSeries(values, window)` is the same recurrence as `indicatorSeries.ts`'s `emaValues` — check whether that helper is exported; if it is private, copy it locally with a comment naming the twin (do not export it from `indicatorSeries.ts` just for this — knip/API churn for zero consumers). Verify the expected boundary arithmetic yourself once: macd defined from index `MACD_SLOW - 1 = 25`; the 9th defined macd lands at index `25 + 9 - 1 = 33`.
- [ ] **Step 4: Tests green.** Same filter command; all pass.
- [ ] **Step 5: Export from `index.ts`** (constants, `rsiValues`, `macdValues`, type `MacdSeries`), then `pnpm --filter @rtc/motion-core build && pnpm exec biome ci packages/motion-core && pnpm lint:eslint && pnpm lint:dead`.
- [ ] **Step 6: Commit.** `feat(motion-core): RSI + MACD pane math (paneSeries)`

---

### Task 2: `paneScene.ts` — numeric pane scene + readout

**Files:**
- Create: `packages/motion-core/src/paneScene.ts`, `packages/motion-core/src/paneScene.test.ts`
- Modify: `packages/motion-core/src/index.ts`; `packages/motion-core/src/chartScene.test.ts` (extend the `CssVarKeys` compile-check + walker coverage to the pane types)

**Interfaces:**
- Consumes: Task 1's `rsiValues`/`macdValues`; `ChartViewport`, `ChartPoint`, `xPct`-equivalent mapping (import the real `xPct` if exported from `chartScene.ts`, else mirror the formula `((i + 0.5 - vp.start) / span) * 100` with a comment naming the twin).
- Produces (Tasks 4/5/6 rely on):

```ts
export type EqPaneKind = "rsi" | "macd";
export interface PaneLine { readonly key: string; readonly points: readonly ChartPoint[]; }
export interface PaneBar { readonly key: number; readonly x: number; readonly w: number; readonly h: number; readonly up: boolean; }
export interface PaneGuide { readonly key: number; readonly y: number; }
export interface PaneScene {
  readonly kind: EqPaneKind;
  readonly lines: readonly PaneLine[];
  readonly histogram: readonly PaneBar[];
  readonly guides: readonly PaneGuide[];
}
export interface PaneReadoutRow { readonly label: string; readonly txt: string; }
export function paneScene(kind: EqPaneKind, closes: readonly number[], viewport: ChartViewport): PaneScene;
export function paneReadout(kind: EqPaneKind, closes: readonly number[], idx: number): readonly PaneReadoutRow[];
```

Geometry rules (exact):
- Pane box percent space, y inverted, padded band `PANE_Y_TOP = 8`, `PANE_Y_SPAN = 84`.
- RSI: one line (`key: "rsi"`), y maps value v → `((100 - v) / 100) * PANE_Y_SPAN + PANE_Y_TOP`; guides at v = 70 and v = 30 (keys 0/1); empty histogram.
- MACD: scale = `m = max(|macd|, |signal|, |hist|)` over the VISIBLE slice's defined values (fallback 1 if none/zero) → y maps v → `((m - v) / (2 * m)) * PANE_Y_SPAN + PANE_Y_TOP` (symmetric: v = 0 lands mid-band); lines `macd`/`signal` (that key order); guide = zero line (y of v = 0); histogram bars per visible index with defined hist: `x` from the shared viewport mapping, `w = (100 / span) * 0.64` (the plot's BODY_FRAC convention), `h = |y(hist) − y(0)|`, `up = hist >= 0`. Bars render FROM the zero line — the shell derives the rect top as `up ? y(hist) : y(0)`; the scene carries geometry only.
- Warm-up nulls: skipped in lines (same as `indicatorPoints`), absent from histogram.
- `paneReadout`: RSI → `[{label: "RSI", txt}]`, 1 decimal; MACD → `[{label: "MACD", txt}, {label: "SIG", txt}, {label: "HIST", txt}]`, 2 decimals; null at idx → txt `"—"` (the literal em-dash glyph — never a `\u` escape in any JSX later).

- [ ] **Step 1: Failing tests.** Cover: RSI fixed-scale mapping (v=70 → y exactly `(30/100)*84+8 = 33.2`); RSI guides at those two y values; MACD symmetric scale (constant closes → all-defined hist 0 → zero-line y = `8 + 42 = 50` mid-band); histogram bar geometry (`up` sign, `h = |y(hist) − y(0)|`, x matches the viewport formula for its index); viewport slicing (indices outside the window absent); warm-up skipping; readout formats incl. `"—"`; scene neutrality via the existing `assertSceneNeutral` walker; `CssVarKeys` compile-check extended to `PaneScene`/`PaneBar`/`PaneLine`/`PaneGuide`.
- [ ] **Step 2: Verify failure, implement, verify green.** (`pnpm --filter @rtc/motion-core test -- paneScene`)
- [ ] **Step 3: Exports + gates.** index.ts exports (types + both functions + `PANE_Y_TOP`/`PANE_Y_SPAN`); `pnpm --filter @rtc/motion-core build && pnpm typecheck && pnpm exec biome ci packages/motion-core && pnpm lint:eslint && pnpm lint:dead && pnpm check:deps`.
- [ ] **Step 4: Commit.** `feat(motion-core): numeric PaneScene + paneReadout for RSI/MACD panes`

---

### Task 3: machine + bindings + fakes

**Files:**
- Modify: `packages/client-core/src/presenters/EqWorkspaceMachine.ts` (+ its test file), `packages/react-bindings/src/createViewModel.ts`, `packages/solid-bindings/src/createViewModel.ts`, the ui-contract fake VM (grep `toggleIndicator` under `packages/ui-contract/src/shared/` and mirror every site), plus any view-model type contract file those greps surface (follow `indicators`' trail exactly — the blast radius is whatever `grep -rn "toggleIndicator" packages/` returns outside client-react/solid).

**Interfaces:**
- Produces: `EqPaneId = "rsi" | "macd"` (exported from EqWorkspaceMachine beside `EqIndicatorId`); state field `panes: readonly EqPaneId[]` (initial `[]`, activation order); intent `togglePane(id: EqPaneId)`; both bindings' view-models expose `panes` state + `togglePane(id)` command with the exact same plumbing shape as `indicators`/`toggleIndicator` (in react-bindings that means the intent forward at the `presenters.eqWorkspace.intents.*` site ~line 775 and the command map entry ~line 985 — mirror both).

- [ ] **Step 1: Failing machine tests** (in EqWorkspaceMachine's existing test file, matching its style): initial `panes: []`; `togglePane("rsi")` adds; toggling again removes; activation order preserved (`["rsi","macd"]` after rsi-then-macd; `["macd"]` after removing rsi); `panes` independent of `indicators` (toggling one never touches the other).
- [ ] **Step 2: Implement** — clone the `toggleIndicator$`/`toggleIndicatorPatch$` subject+patch pair as `togglePane$`/`togglePanePatch$`; add to the patch merge; extend the state interface + initial state + intents.
- [ ] **Step 3: Bindings + fakes.** Mirror `indicators`/`toggleIndicator` in both `createViewModel.ts` files and the ui-contract fake; run `grep -rn "toggleIndicator" packages/ --include='*.ts' -l` and confirm every non-UI file listed also handles `togglePane` when done.
- [ ] **Step 4: Gates.** `pnpm --filter @rtc/client-core test && pnpm --filter @rtc/react-bindings test && pnpm --filter @rtc/solid-bindings test && pnpm typecheck && pnpm exec biome ci . && pnpm lint:eslint`.
- [ ] **Step 5: Commit.** `feat(client-core): pane state (EqPaneId/panes/togglePane) through both bindings`

---

### Task 4: React shell — IndicatorPane, pills, layout, crosshair

**Files:**
- Create: `packages/client-react/src/ui/equities/chart/IndicatorPane.tsx`, `IndicatorPane.module.css`
- Modify: `IndicatorPills.tsx` (panes group), `EqChartHead.tsx` (thread `panes`/`togglePane`), `CandleChart.tsx` (+`panes` prop, scene/readout projection, cursor `inPlot`), `ChartPlot.tsx` (render panes between `VolumePane` and `TimeAxis`; `data-panes` attribute on the wrap), `CrosshairOverlay.tsx` (+`showHorizontal` prop hiding the `.h` element), `useChartGestures.ts` (cursor gains `inPlot: boolean`; new `paneHoverProps` — pointermove computing `xFrac` from the pane element's rect, setting `{xFrac, yFrac: 0.5, inPlot: false}`; pointerleave clears), `CandleChart.module.css` (pane row sizing)

**Interfaces:**
- Consumes: Tasks 1–3 (`paneScene`, `paneReadout`, `EqPaneId`, VM `panes`/`togglePane`).
- Produces (Task 5 mirrors, Task 6 asserts): `IndicatorPane` props `{ kind: EqPaneKind; scene: PaneScene; readout: readonly PaneReadoutRow[] | null; crosshairStyle: CSSProperties | null }`; testids `chart-pane-rsi`/`chart-pane-macd`, `chart-pane-readout`, `chart-pane-crosshair-v`; pills testid `chart-pane-pill` with `data-pane` + `data-active`; wrap attribute `data-panes="0|1|2"`.

Key content (React; Solid mirrors in Task 5):

- `IndicatorPane.tsx`: outer `<div className={styles.pane} data-testid={`chart-pane-${kind}`}>`; corner label (`RSI 14` / `MACD 12 26 9` from the exported constants — compose the string, never hardcode digits); one SVG (`viewBox="0 0 100 100"`, `preserveAspectRatio="none"`) containing guides (`<line>` per `PaneGuide`), lines (`<polyline>` per `PaneLine`, points joined shell-side like `SvgPathLayer`), histogram as ONE `<path>` whose `d` concatenates `M x-w/2 yTop h w v hgt h -w z`-style rects (write a `toHistogramPath(bars, zeroY)` helper — pure string building; zeroY comes from the scene's zero guide); crosshair echo `<div className={styles.crosshairV} style={crosshairStyle ?? undefined} data-testid="chart-pane-crosshair-v">` rendered only when `crosshairStyle` non-null; readout rows `<div data-testid="chart-pane-readout">` rendered only when `readout` non-null. `pointer-events: none` on everything EXCEPT the pane root (which carries `paneHoverProps`).
- `CandleChart.tsx`: props gain `panes: readonly EqPaneId[]`; compute per active pane `{kind, scene: paneScene(kind, closes, viewport), readout: cross ? paneReadout(kind, closes, cross.idx) : null}` (closes already derived in `toIndicatorPaths` — hoist the `closes` mapping once); pass `cross?.style ?? null` as the shared crosshair style; pass `showHorizontal={cursor?.inPlot ?? false}` to the overlay via ChartPlot.
- `CrosshairOverlay.tsx`: new `showHorizontal: boolean` prop — render the `.h` element only when true (readout chip unchanged).
- `useChartGestures.ts`: `ChartCursor` gains `readonly inPlot: boolean` (plot pointermove sets `true`); export `paneHoverProps: { onPointerMove; onPointerLeave }` where move computes `xFrac` from `e.currentTarget.getBoundingClientRect()` and sets cursor `{xFrac, yFrac: 0.5, inPlot: false}`. No other gesture (wheel/drag) binds to panes.
- Layout css: `.pane { flex: 0 0 18%; min-height: 0; position: relative; }` in `IndicatorPane.module.css`; wrap keeps `flex-direction: column` so the plot's `flex: 1` shrinks naturally; `data-panes` is a state attribute for tests only, set from `panes.length`.
- `IndicatorPills.tsx`: second option array `PANES: [{id: "rsi", label: "RSI"}, {id: "macd", label: "MACD"}]` rendered after a `.divider` span, buttons with `data-testid="chart-pane-pill"`, `data-pane={id}`, driving `onTogglePane`.

- [ ] **Step 1: Wire everything;** verify by running the react app mentally against the registry — then `pnpm --filter @rtc/client-react test:ui:contract` (existing 692 must stay green — no pane contract cases exist yet), `pnpm typecheck`, `pnpm exec biome ci packages/client-react`, `pnpm lint:eslint`.
- [ ] **Step 2: Commit.** `feat(client-react): RSI/MACD indicator panes — shell, pills, crosshair continuation`

---

### Task 5: Solid shell parity

**Files:** the Solid twins of every Task-4 file under `packages/client-solid/src/ui/equities/chart/` (IndicatorPane.tsx new + module.css copied byte-identical from react where the react one is framework-free CSS; createChartGestures.ts for the cursor/inPlot + paneHoverProps mirror; pills/head/chart/plot/crosshair edits).

**Interfaces:** identical to Task 4's Produces (same testids, same attribute names, same prop shapes in Solid idiom — `Show`/`For`, props not destructured).

- [ ] **Step 1: Port each Task-4 edit** using the existing solid twins as the pattern reference (each react chart file has a same-named solid sibling; diff the react commit from Task 4 file-by-file and mirror).
- [ ] **Step 2: Gates.** `pnpm --filter @rtc/client-solid test:ui:contract` (existing green), `pnpm typecheck`, `pnpm exec biome ci packages/client-solid`, `pnpm lint:eslint` (solid/reactivity warnings must not grow — the 11 ledgered ones are the ceiling; new pane code must not add any).
- [ ] **Step 3: Commit.** `feat(client-solid): indicator panes at parity with the react shell`

---

### Task 6: shared contract cases + node-budget tripwire

**Files:**
- Create: `packages/ui-contract/src/specs/equities/chart/ChartPanes.contract.spec.ts`
- Modify: the `CandleChartPage` page object (add pane drivers: `togglePane(id)` clicking `chart-pane-pill[data-pane=id]`, `paneVisible(kind)`, `paneReadoutText(kind)`, `wrapNodeCount()` returning `querySelectorAll("*").length` under the chart wrap root, `panesAttr()`).

**Interfaces:**
- Consumes: Task 4/5 testids + Task 3 fake VM exposure.

Cases (framework-neutral, run against both clients by the existing swap-trio):
1. pills toggle panes: click RSI pill → `chart-pane-rsi` visible; click again → gone.
2. activation order: rsi then macd → both visible, rsi first in DOM order.
3. `data-panes` tracks the count (0 → 1 → 2).
4. forced crosshair state (the ForcedChart bypass precedent from the backfill/interactive specs) → `chart-pane-readout` shows `RSI` + a number; MACD pane shows the 3 rows.
5. warm-up readout: crosshair idx inside warm-up → `—`.
6. overlays and panes independent: toggling `sma20` never mounts a pane and vice versa.
7. **Node budget (the tripwire):** mount with no panes → `base = wrapNodeCount()`; toggle both panes on → `expect(wrapNodeCount()).toBeLessThanOrEqual(base + 40)`. Comment WHY (spec §8: the pre-registered DOM→canvas signal; the batched histogram path is what keeps this holdable — a per-bar-DOM regression fails here).

- [ ] **Step 1: Write cases, watch the new spec fail against a stubbed page** (drivers not yet implemented) — then implement drivers, run `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract` (both green, both including the new cases).
- [ ] **Step 2: Coverage gates** (CI enforces ≥95%): `pnpm --filter @rtc/client-react test:ui:contract:coverage && pnpm --filter @rtc/client-solid test:ui:contract:coverage` — check the PER-FILE numbers for every new/modified chart file (IndicatorPane, pills, gestures, CandleChart) — no new file below ~95% statements; add contract cases if one is.
- [ ] **Step 3: Commit.** `test(ui-contract): pane contract cases + the +40-node budget tripwire`

---

### Task 7: visual scenarios + arm64 goldens

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts` (+2 entries: `"equities/chart-pane-rsi"` → componentKey `EquitiesChartPaneRsi`, `"equities/chart-panes-both"` → `EquitiesChartPanesBoth`, both `fixtureKey: "equities-loaded"`, comment block naming this spec)
- Create: forced-state hosts `EquitiesChartPanes.visual.tsx` in BOTH clients' visual trees (react: `tests/ui/visual/react/`, solid: `tests/ui/visual/solid/`), modeled on `EquitiesChartInteractive.visual.tsx` (static `ChartPlot` mount with literal injected state; `chart-panes-both` also injects a forced crosshair state so readouts render)
- Modify: both registries (+2 entries each)
- Goldens: 20 new files under `react-local/<arch>/` (2 stems × 10 themes)

- [ ] **Step 1: TDD signal** — add the scenario entries, run both `registryCoverage` tests, watch both fail on the unknown componentKeys; then add hosts + registry entries, both pass.
- [ ] **Step 2: Goldens.** `pnpm build` first (worktree needs fresh dists), then `pnpm --filter @rtc/client-react run test:ui:visual:playwright:react:update -g "chart-pane-rsi|chart-panes-both"` (package script only — direct playwright exec breaks webServer resolution). Expect EXACTLY 20 untracked additions, ZERO modifications (`git status --porcelain` — if any existing golden shows M, STOP and report). Then run the assert variant with the same `-g` twice — 3 consecutive greens.
- [ ] **Step 3: Commit** (code + the 20 golden stems only). `test(visual): pane scenarios — rsi solo + both-with-crosshair`

---

### Task 8: e2e journey (tamper-proven)

**Files:**
- Modify: the equities-chart e2e suite under `tests/browser/` (find the existing chart journeys — grep `chart-indicator-pill` or the backfill depth-witness for the file; add one journey alongside).

Journey: open equities workspace → click the RSI pane pill → `chart-pane-rsi` visible → hover the plot center (real pointer move) → `chart-pane-readout` inside the RSI pane shows text matching `/RSI\s+\d/` (a real number, not `—`, because the hovered center index is past warm-up in the seeded series).

- [ ] **Step 1: Write + run the journey** (`pnpm test:e2e` scoped to the equities suite per that runner's convention — check `tests/browser/run-all.ts` for the per-suite invocation).
- [ ] **Step 2: TAMPER PROOF (required, the backfill lesson):** temporarily no-op `rsiValues` (return all nulls) in the built worktree, re-run the journey, and CONFIRM IT FAILS (readout shows `—`, regex misses). Revert. Record both outputs in the task report.
- [ ] **Step 3: Commit.** `test(e2e): RSI pane journey — pill → pane → hover → live readout`

---

### Task 9: docs

**Files:**
- Modify: `docs/architecture/17-web-client-up-close.md` (the chart section: a short "indicator panes" paragraph under the existing chart material/§17.7 vicinity — pane model, PaneScene seam compliance, the node-budget tripwire's location), `docs/STATUS.md` (⚪ section: log the remaining TradingView sub-projects — drawing tools, log scale, comparison series — as one entry pointing at the spec's decision trail; bump Last-updated).

- [ ] **Step 1: Write both edits;** every identifier verified against the shipped code; relative links re-derived per editing file. `pnpm check:doc-links` green.
- [ ] **Step 2: Commit.** `docs: indicator panes — pane model note + TradingView-tier backlog entry`

---

## Self-review notes (applied)

- Spec §3→Task 3, §4→Task 1, §5→Task 2, §6→Tasks 4/5, §7→Tasks 1-2/6/7/8, §8→Task 6 (+ the zero-motion constraint as a global), §9→Tasks 7/9 + shipping flow.
- Type names consistent: `EqPaneKind` (motion-core) vs `EqPaneId` (client-core) — deliberate twin naming matching `ChartKind`/`EqChartType` precedent; Tasks 4-6 use each on the correct side.
- The one flagged judgment: `emaSeries` reuse-vs-copy in Task 1 — both endpoints specified with the deciding rule (don't export a private helper for zero external consumers).
