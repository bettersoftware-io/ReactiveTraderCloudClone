# Comparison Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay a second symbol's close-price line on the equities candle chart on a shared percent-change y-axis (both series rebased to the visible window's first candle), picked via a VS pill group — in both web clients at full parity.

**Architecture:** Percent becomes a first-class `ChartScale` variant in motion-core (`yScale: "percent"` + `base`), derived from the presence of a new `compare` option on `chartScene` — never requestable directly, so percent-without-a-base is unrepresentable. `cmin`/`cmax` stay in price units (pct-range union back-converted), keeping the scale invertible so drawings/crosshair/drag-edit work unchanged. State is one new `compare: string | null` field on `EqWorkspaceMachine`; data plumbing reuses the existing symbol-keyed `useCandles`.

**Tech Stack:** TypeScript, RxJS (`@rx-state/core` state), React 19 / SolidJS, vitest + @testing-library (contract tier), Playwright (visual + e2e).

**Spec:** `docs/superpowers/specs/2026-08-08-comparison-series-design.md`

## Global Constraints

- `@rtc/motion-core` stays zero-dependency: no DOM, no rxjs, no React/Solid imports.
- `client-core` must NOT import `@rtc/motion-core` — `EqWorkspaceMachine` keeps declaring its own structural types.
- Percent mode is derived from `compare`'s presence — `"percent"` is never a value of `ChartVmOptions.yScale` (which stays `"linear" | "log"`); it appears only on the output `ChartScale`.
- `ChartScale.cmin`/`cmax` stay in PRICE units in every mode. Percent mode adds `base` (primary baseline price); guard: `base` absent or `<= 0` falls back to the linear branch (mirrors log's `cmin > 0` guard).
- Baselines: primary = first VISIBLE candle's close; compare = its close at the first compare candle whose `time >=` the primary window-start's time; none ⇒ compare line omitted (scale stays percent).
- Alignment is by TIME (a `Map<time, close>`); missing times are skipped, no interpolation.
- Percent labels: two decimals, explicit `+` for positive, ASCII `-` for negative, `0.00%` unsigned (also for the `-0.00` rounding case).
- Machine rules: `setCompare(s.sel)` is a no-op; `select(sym)` where `sym === s.compare` clears compare; `closeTab`/`setTimeframe` leave it untouched; `yScale` is NEVER mutated by compare.
- Coupled UI: while `compare !== null` the `chart-yscale-pill` renders disabled with label `PCT` (stored lin/log pref untouched); testids: `chart-compare-pill` (with `data-sym`), `chart-compare-line`.
- Toggling compare must NOT reset the chart viewport (no remount-key change in either client).
- New theme token `--accent-compare` in BOTH clients' `tokens.ts` (type + all 12 skin×mode cells + `REQUIRED_KEYS` in both `tokens.test.ts`): dark-mode cells `#a78bfa`, light-mode cells `#7c3aed`.
- Handler naming: concrete handlers named by effect; function-typed props stay `onX` (slots). `rtc/name-functions-by-effect` enforces.
- Mandatory braces on all control statements (Biome `useBlockStatements`); no inline `style={{…}}`; `#/` subpath aliases, never `@/` or ≥2-up relative imports.
- Run the FULL repo lint surface before declaring a task done where noted — per-package biome does NOT cover repo ESLint (padding-line-between-statements, arrow-body-style, no-restricted-syntax) or knip. Don't export anything only tests use.
- Both web clients at parity: every UI change lands in react AND solid twins; the shared `@rtc/ui-contract` spec runs against both.
- Worktree: `.claude/worktrees/comparison-series` (branch `worktree-comparison-series`). All commands below run from that worktree root. Run `pnpm install && pnpm build` once before the first task (fresh worktree; the visual/e2e tiers need built libs).

---

### Task 1: motion-core — percent `ChartScale` variant + compare scene

**Files:**
- Modify: `packages/motion-core/src/chartScene.ts`
- Modify: `packages/motion-core/src/chartVm.ts` (ChartVm interface gains `compareLinePoints`)
- Modify: `packages/motion-core/src/chartCssVars.ts` (`chartVmFromScene` passthrough)
- Test: `packages/motion-core/src/chartScene.test.ts`

**Interfaces:**
- Consumes: existing `priceToY`/`yToPrice`/`chartScene`/`crosshairScene`, `priceTicks`, `Y_TOP`/`Y_SPAN`.
- Produces (later tasks rely on these exact shapes):
  - `ChartScale` gains `yScale?: "log" | "percent"` and `base?: number`.
  - `export interface ChartCompareInput { readonly series: readonly ChartCandle[] }` (exported from `chartScene.ts`, re-exported from `chartVm.ts`'s type block and `index.ts`).
  - `ChartVmOptions` gains `readonly compare?: ChartCompareInput`.
  - `ChartScene` and `ChartVm` gain `readonly compareLinePoints: readonly ChartPoint[]` (always present; `[]` when no compare).
  - Crosshair `price` string is percent-formatted under a percent scale.

- [ ] **Step 1: Write the failing tests**

Append to `packages/motion-core/src/chartScene.test.ts` (its imports already include `chartScene`, `priceToY`, `yToPrice`, `crosshairScene`, `priceTicks`; add `ChartScale` if not imported). Reuse the existing `TWELVE_MIXED` fixture where possible; add a compare fixture:

```ts
// Comparison-series fixtures: same 60s buckets/epoch as TWELVE_MIXED so the
// two series align by time exactly; closes climb twice as fast so the pct
// ranges genuinely differ (union must widen).
const COMPARE_TWELVE: readonly ChartCandle[] = Array.from(
  { length: 12 },
  (_, i) => {
    return {
      time: 1_782_864_000_000 + i * 60_000,
      open: 50 + i * 2,
      high: 53 + i * 2,
      low: 48 + i * 2,
      close: 50 + i * 2,
      volume: 1_000,
    };
  },
);

describe("percent scale (comparison series)", () => {
  const VP: ChartViewport = { start: 0, end: 12 };

  it("priceToY's percent branch is numerically identical to linear for the primary", () => {
    const linear: ChartScale = { cmin: 90, cmax: 110 };
    const percent: ChartScale = {
      cmin: 90,
      cmax: 110,
      yScale: "percent",
      base: 100,
    };

    for (const p of [90, 95, 100, 104.37, 110]) {
      expect(priceToY(percent, p)).toBeCloseTo(priceToY(linear, p), 10);
      expect(yToPrice(percent, priceToY(percent, p))).toBeCloseTo(p, 8);
    }
  });

  it("a percent scale with a non-positive base falls back to the linear branch", () => {
    const linear: ChartScale = { cmin: 90, cmax: 110 };
    const broken: ChartScale = {
      cmin: 90,
      cmax: 110,
      yScale: "percent",
      base: 0,
    };
    expect(priceToY(broken, 95)).toBe(priceToY(linear, 95));
    expect(yToPrice(broken, 40)).toBe(yToPrice(linear, 40));
  });

  it("chartScene with compare derives a percent scale based at the first visible close", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });

    expect(scene.scale.yScale).toBe("percent");
    expect(scene.scale.base).toBe(TWELVE_MIXED[0]?.close);
  });

  it("compare is aligned by time: one point per primary index with a matching compare candle", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });
    expect(scene.compareLinePoints).toHaveLength(12);

    // A gappy compare series (every other candle removed) yields exactly the
    // surviving times' points — no interpolation.
    const gappy = COMPARE_TWELVE.filter((_, i) => {
      return i % 2 === 0;
    });
    const gappyScene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: gappy },
    });
    expect(gappyScene.compareLinePoints).toHaveLength(6);
  });

  it("the pct-range union widens the scale to include the compare series", () => {
    // Compare alone spans 0% → +44% (close 50 → 72 over its base 50), far
    // beyond the primary's own pct range — so cmax back-converted must
    // exceed the primary's raw high.
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });
    const primaryOnly = chartScene(TWELVE_MIXED, 0, false, { viewport: VP });
    expect(scene.scale.cmax).toBeGreaterThan(primaryOnly.scale.cmax);
  });

  it("the baseline rebases when the viewport moves", () => {
    const late = chartScene(TWELVE_MIXED, 0, false, {
      viewport: { start: 6, end: 12 },
      compare: { series: COMPARE_TWELVE },
    });
    expect(late.scale.base).toBe(TWELVE_MIXED[6]?.close);
  });

  it("percent labels are signed, two-decimal, %-suffixed; zero is unsigned", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });

    for (const l of scene.priceLabels) {
      expect(l.txt).toMatch(/^(\+|-)?\d+\.\d{2}%$/);
    }

    const zero = scene.priceLabels.find((l) => {
      return l.txt === "0.00%";
    });
    // The compare's +44% swamps the primary range, so a 0% tick exists.
    expect(zero).toBeDefined();
    // No signed zero either way.
    expect(
      scene.priceLabels.some((l) => {
        return l.txt === "+0.00%" || l.txt === "-0.00%";
      }),
    ).toBe(false);
  });

  it("an empty compare series still percent-projects the primary alone", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: [] },
    });
    expect(scene.scale.yScale).toBe("percent");
    expect(scene.compareLinePoints).toEqual([]);
  });

  it("a compare series entirely older than the window keeps percent but omits the line", () => {
    const older = COMPARE_TWELVE.map((c) => {
      return { ...c, time: c.time - 100 * 60_000 };
    });
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: older },
    });
    expect(scene.scale.yScale).toBe("percent");
    expect(scene.compareLinePoints).toEqual([]);
  });

  it("compare overrides an explicit log yScale option", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      yScale: "log",
      compare: { series: COMPARE_TWELVE },
    });
    expect(scene.scale.yScale).toBe("percent");
  });

  it("scenes without compare emit an empty compareLinePoints and are otherwise unchanged", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, { viewport: VP });
    expect(scene.compareLinePoints).toEqual([]);
    expect(scene.scale.yScale).toBeUndefined();
  });

  it("crosshairScene formats its price readout as percent under a percent scale", () => {
    const scene = chartScene(TWELVE_MIXED, 0, false, {
      viewport: VP,
      compare: { series: COMPARE_TWELVE },
    });
    const cross = crosshairScene(0.5, 0.5, TWELVE_MIXED, VP, scene.scale);
    expect(cross?.price).toMatch(/^(\+|-)?\d+\.\d{2}%$/);
    // OHLC readout stays in prices.
    expect(cross?.readout.close).toMatch(/^\d+(\.\d{2})?$/);
  });
});
```

Note: `ChartViewport` is already imported in this test file. If `TWELVE_MIXED` is typed `readonly Candle[]` in the existing file (it is — a local structural alias), reuse it as-is; `COMPARE_TWELVE` uses `ChartCandle`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/motion-core test -- chartScene`
Expected: FAIL — `compare` not a known option, `compareLinePoints` undefined, percent branch missing.

- [ ] **Step 3: Implement in `chartScene.ts`**

3a. Extend the types (replace the existing `ChartScale`/`ChartVmOptions` declarations):

```ts
/** The visible-slice price range (post live-overlay) a ChartVm was fit to.
 * `yScale` is the y-mapping mode; absent = linear. Percent mode carries
 * `base` (the primary series' baseline price — the first visible candle's
 * close); cmin/cmax stay in PRICE units in every mode (percent's are the
 * pct-range union back-converted through `base`), which keeps the scale
 * invertible in price space — drawings/crosshair route through it
 * unchanged. */
export interface ChartScale {
  readonly cmin: number;
  readonly cmax: number;
  readonly yScale?: "log" | "percent";
  /** Percent mode only: pct(p) = (p / base − 1) × 100. */
  readonly base?: number;
}

/** A second symbol's candle series to overlay as a close-price line on a
 * shared percent axis. Presence of this option IS the percent-mode signal —
 * "percent" is never requestable via `yScale`, so percent-without-a-base is
 * unrepresentable. */
export interface ChartCompareInput {
  readonly series: readonly ChartCandle[];
}

export interface ChartVmOptions {
  /** Visible candle-index window; default: the whole series (back-compat). */
  readonly viewport?: ChartViewport;
  /** Plot style; default "candles". */
  readonly kind?: ChartKind;
  /** Price-axis mapping; default "linear". Ignored while `compare` is
   * present (compare forces percent). */
  readonly yScale?: "linear" | "log";
  /** Comparison series — switches the scene to percent mode. */
  readonly compare?: ChartCompareInput;
}
```

3b. Percent branch in `priceToY`/`yToPrice` (insert BEFORE the log branch in each, plus the `pctOf` helper near them):

```ts
function pctOf(base: number, price: number): number {
  return (price / base - 1) * 100;
}
```

In `priceToY`, first branch:

```ts
  if (
    scale.yScale === "percent" &&
    scale.base !== undefined &&
    scale.base > 0
  ) {
    const pmax = pctOf(scale.base, scale.cmax);
    const pmin = pctOf(scale.base, scale.cmin);
    const prng = pmax - pmin || 1;
    return ((pmax - pctOf(scale.base, price)) / prng) * Y_SPAN + Y_TOP;
  }
```

In `yToPrice`, first branch:

```ts
  if (
    scale.yScale === "percent" &&
    scale.base !== undefined &&
    scale.base > 0
  ) {
    const pmax = pctOf(scale.base, scale.cmax);
    const pmin = pctOf(scale.base, scale.cmin);
    const prng = pmax - pmin || 1;
    const pct = pmax - ((y - Y_TOP) / Y_SPAN) * prng;
    return scale.base * (1 + pct / 100);
  }
```

(The percent branch is affine-identical to linear for the primary — the tests pin that. It exists because `yToPrice` must return prices through `base`, and because a percent `scale.yScale` must never accidentally take the LOG branch.)

3c. Percent label formatter (module-local, near `formatTimeLabel`):

```ts
/** Signed two-decimal percent label: "+1.25%", "-0.40%", "0.00%" (zero is
 * unsigned, including the -0.00 rounding case). ASCII minus. */
function formatPctLabel(pct: number): string {
  const txt = pct.toFixed(2);

  if (txt === "0.00" || txt === "-0.00") {
    return "0.00%";
  }

  return txt.startsWith("-") ? `${txt}%` : `+${txt}%`;
}
```

3d. `ChartScene` gains the field (and the empty-series early return in `chartScene` gains `compareLinePoints: []`):

```ts
export interface ChartScene {
  readonly kind: ChartKind;
  readonly candles: readonly SceneCandle[];
  readonly grid: readonly SceneGridLine[];
  readonly priceLabels: readonly SceneLabel[];
  readonly timeLabels: readonly SceneLabel[];
  readonly linePoints: readonly ChartPoint[];
  /** The comparison overlay's projected close-line — empty when no compare
   * is active or no compare candle aligns with the visible window. */
  readonly compareLinePoints: readonly ChartPoint[];
  readonly scale: ChartScale;
}
```

3e. The compare resolver (private, above `chartScene`):

```ts
/** Everything percent mode derives from the compare option: the widened
 * price-unit scale, the pct-space tick range, the aligned line points, and
 * the pct→y projection the ticks/line share. Null when compare is absent or
 * the primary baseline is unusable (base <= 0) — callers then take the
 * existing linear/log path untouched. */
interface ResolvedCompare {
  readonly scale: ChartScale;
  readonly pctMin: number;
  readonly pctMax: number;
  readonly linePoints: readonly ChartPoint[];
  readonly pctToY: (pct: number) => number;
}

function resolveCompare(
  compare: ChartCompareInput | undefined,
  visible: readonly ChartCandle[],
  series: readonly ChartCandle[],
  win: ChartWindow,
): ResolvedCompare | null {
  const base = visible[0]?.close;

  if (!compare || base === undefined || base <= 0) {
    return null;
  }

  let pctMin = Number.POSITIVE_INFINITY;
  let pctMax = Number.NEGATIVE_INFINITY;

  for (const c of visible) {
    pctMin = Math.min(pctMin, pctOf(base, c.low));
    pctMax = Math.max(pctMax, pctOf(base, c.high));
  }

  // Compare baseline: its close at the primary window-start's time — the
  // first compare candle at/after that time (an exact match is also >=).
  // None (series empty or entirely older) ⇒ the line is omitted this frame
  // but the axis stays percent (no scale-mode flicker when data lands).
  const wStart = series[win.iFirst]?.time;
  const wEnd = series[win.iLast]?.time;
  const cBase =
    wStart === undefined
      ? undefined
      : compare.series.find((c) => {
          return c.time >= wStart;
        });
  const linePoints: ChartPoint[] = [];

  if (cBase !== undefined && cBase.close > 0 && wEnd !== undefined) {
    for (const c of compare.series) {
      if (c.time < (wStart as number) || c.time > wEnd) {
        continue;
      }

      const p = pctOf(cBase.close, c.close);
      pctMin = Math.min(pctMin, p);
      pctMax = Math.max(pctMax, p);
    }
  }

  const prng = pctMax - pctMin || 1;

  function pctToY(pct: number): number {
    return ((pctMax - pct) / prng) * Y_SPAN + Y_TOP;
  }

  if (cBase !== undefined && cBase.close > 0) {
    const closeByTime = new Map<number, number>();

    for (const c of compare.series) {
      closeByTime.set(c.time, c.close);
    }

    for (let i = win.iFirst; i <= win.iLast; i++) {
      const t = series[i]?.time;

      if (t === undefined) {
        continue;
      }

      const close = closeByTime.get(t);

      if (close === undefined) {
        continue;
      }

      linePoints.push({
        x: xPct(i, win.vp, win.span),
        y: pctToY(pctOf(cBase.close, close)),
      });
    }
  }

  return {
    scale: {
      cmin: base * (1 + pctMin / 100),
      cmax: base * (1 + pctMax / 100),
      yScale: "percent",
      base,
    },
    pctMin,
    pctMax,
    linePoints,
    pctToY,
  };
}
```

3f. Wire it into `chartScene` — after `cmin`/`cmax`/`cw` are computed, replace the existing `const scale ...` line and the ticks/grid/labels block:

```ts
  const compared = resolveCompare(opts?.compare, visible, series, win);

  const scale: ChartScale = compared
    ? compared.scale
    : opts?.yScale === "log"
      ? { cmin, cmax, yScale: "log" }
      : { cmin, cmax };
```

(`yPct` stays `priceToY(scale, p)` — the percent branch handles the primary.) Ticks fork — replace the existing `const ticks = ...` through `priceLabels` block:

```ts
  // Grid and labels are the same tick list viewed twice. Percent mode
  // computes nice ticks IN PCT SPACE (the same 1-2-5 engine, fed the pct
  // range) and formats them as signed percent; price mode is unchanged.
  const ticks = compared
    ? [...priceTicks(compared.pctMin, compared.pctMax)].reverse()
    : [...priceTicks(cmin, cmax)].reverse();

  const grid: SceneGridLine[] = ticks.map((t, i) => {
    return { key: i, top: compared ? compared.pctToY(t) : yPct(t) };
  });

  const priceLabels: SceneLabel[] = ticks.map((t, i) => {
    return {
      key: i,
      txt: compared ? formatPctLabel(t) : t.toFixed(2),
      top: compared ? compared.pctToY(t) : yPct(t),
      x: 0,
    };
  });
```

Return `compareLinePoints: compared ? compared.linePoints : []` in the scene object (and `compareLinePoints: []` in the empty-series early return).

3g. Crosshair percent formatting — in `crosshairScene`, replace `price: price.toFixed(2),` with:

```ts
    price:
      scale.yScale === "percent" && scale.base !== undefined && scale.base > 0
        ? formatPctLabel(pctOf(scale.base, price))
        : price.toFixed(2),
```

3h. `chartVm.ts`: add `compareLinePoints` to the `ChartVm` interface (after `linePoints`):

```ts
  compareLinePoints: readonly ChartPoint[];
```

and re-export the new type: add `ChartCompareInput` to the `export type { ... } from "./chartScene.js"` list.

3i. `chartCssVars.ts` — `chartVmFromScene` passthrough (after `linePoints: scene.linePoints,`):

```ts
    compareLinePoints: scene.compareLinePoints,
```

3j. `packages/motion-core/src/index.ts`: confirm `ChartCompareInput` reaches the public surface (it re-exports chartVm's type block — add it wherever `ChartVmOptions` is listed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/motion-core test`
Expected: PASS, including the pre-existing CSS-neutrality suite (the new field is numeric points — neutral by construction).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @rtc/motion-core typecheck && pnpm --filter @rtc/motion-core build`

```bash
git add packages/motion-core/src/chartScene.ts packages/motion-core/src/chartScene.test.ts packages/motion-core/src/chartVm.ts packages/motion-core/src/chartCssVars.ts packages/motion-core/src/index.ts
git commit -m "feat(motion-core): percent ChartScale variant + comparison-series scene"
```

---

### Task 2: client-core — `compare` state + `setCompare` intent; both bindings

**Files:**
- Modify: `packages/client-core/src/presenters/EqWorkspaceMachine.ts`
- Modify: `packages/react-bindings/src/createViewModel.ts`
- Modify: `packages/solid-bindings/src/createViewModel.ts`
- Test: `packages/client-core/src/presenters/__tests__/EqWorkspaceMachine.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EqWorkspaceState.compare: string | null` (initial `null`); `EqWorkspaceIntents.setCompare(sym: string | null): void`; both bindings' `useEqWorkspace()` results gain `setCompare` (compile-enforced — `UseEqWorkspaceResult = { state } & EqWorkspaceIntents`). Binding wrapper function name: `setEqCompareSymbol`.

**Heads-up:** growing `EqWorkspaceIntents` breaks the CLIENTS' test-fake typechecks (`viewModelFromWorld.ts` / `buildFakeViewModel.ts` in each client) — those one-line additions belong to Tasks 3 and 4, NOT here. Verify this task per-package only (client-core + both bindings), not `pnpm typecheck` repo-wide.

- [ ] **Step 1: Write the failing tests**

Append to `packages/client-core/src/presenters/__tests__/EqWorkspaceMachine.test.ts` (uses the file's existing `firstValueFrom` convention — NOT `state$.getValue()`, which fails `tsc --build`):

```ts
  it("starts with no comparison symbol", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    const state = await firstValueFrom(m.state$);
    expect(state.compare).toBeNull();
    m.dispose();
  });

  it("setCompare(sym) sets the comparison; setCompare(null) clears it", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setCompare("MSFT");
    expect((await firstValueFrom(m.state$)).compare).toBe("MSFT");
    m.intents.setCompare(null);
    expect((await firstValueFrom(m.state$)).compare).toBeNull();
    m.dispose();
  });

  it("setCompare(the selected symbol) is a no-op", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setCompare("AAPL");
    expect((await firstValueFrom(m.state$)).compare).toBeNull();
    m.dispose();
  });

  it("select(the compared symbol) clears the comparison — the primary absorbs it", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setCompare("MSFT");
    m.intents.select("MSFT");
    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("MSFT");
    expect(state.compare).toBeNull();
    m.dispose();
  });

  it("selecting an unrelated symbol keeps the comparison", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setCompare("MSFT");
    m.intents.select("TSLA");
    expect((await firstValueFrom(m.state$)).compare).toBe("MSFT");
    m.dispose();
  });

  it("setTimeframe keeps the comparison", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setCompare("MSFT");
    m.intents.setTimeframe("1W");
    expect((await firstValueFrom(m.state$)).compare).toBe("MSFT");
    m.dispose();
  });
```

Also update the FIRST existing test (`starts with the initial symbol selected…`) — its `toEqual` literal gains `compare: null`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/client-core test -- EqWorkspaceMachine`
Expected: FAIL — `setCompare` not a function; the initial-state `toEqual` also fails until the field exists.

- [ ] **Step 3: Implement the machine changes**

In `EqWorkspaceMachine.ts`:

State + intents interfaces:

```ts
export interface EqWorkspaceState {
  readonly sel: string;
  readonly openTabs: readonly string[];
  readonly timeframe: CandleTimeframe;
  readonly chartType: EqChartType;
  readonly indicators: readonly EqIndicatorId[];
  readonly panes: readonly EqPaneId[];
  readonly yScale: EqYScale;
  /** The comparison-series symbol, or null for none. While non-null the
   * chart renders on a percent axis (derived downstream — `yScale` above is
   * NEVER mutated by compare, so clearing restores the stored lin/log). */
  readonly compare: string | null;
}
```

`EqWorkspaceIntents` gains:

```ts
  setCompare(sym: string | null): void;
```

Subject (alongside the others): `const setCompare$ = new Subject<string | null>();`

Initial state gains `compare: null,`.

`selectPatch$` — the returned patch clears an absorbed comparison (replace its body):

```ts
  // select: adds the symbol to openTabs if it isn't already there, then
  // (re)selects it — the prototype's "click watchlist row" behaviour.
  // Selecting the currently-compared symbol clears the comparison (the
  // primary absorbs it — comparing a symbol against itself is meaningless).
  const selectPatch$ = select$.pipe(
    map((sym): Patch => {
      return (s: EqWorkspaceState): EqWorkspaceState => {
        const openTabs = s.openTabs.includes(sym)
          ? s.openTabs
          : [...s.openTabs, sym];
        const compare = s.compare === sym ? null : s.compare;
        return { ...s, sel: sym, openTabs, compare };
      };
    }),
  );
```

New patch (after `toggleYScalePatch$`):

```ts
  // setCompare: sets/clears the comparison symbol. Comparing the selected
  // symbol against itself is guarded here too (the pills already exclude
  // it) — a no-op, not a clear.
  const setComparePatch$ = setCompare$.pipe(
    map((sym): Patch => {
      return (s: EqWorkspaceState): EqWorkspaceState => {
        if (sym !== null && sym === s.sel) {
          return s;
        }

        return { ...s, compare: sym };
      };
    }),
  );
```

Add `setComparePatch$` to the `merge(...)` list; add the intent:

```ts
      setCompare: (sym: string | null): void => {
        setCompare$.next(sym);
      },
```

and `setCompare$.complete();` in `dispose`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/client-core test -- EqWorkspaceMachine && pnpm --filter @rtc/client-core typecheck`
Expected: PASS.

- [ ] **Step 5: Wire both bindings**

`packages/react-bindings/src/createViewModel.ts` — next to `toggleEqYScale` (~line 941), add:

```ts
  function setEqCompareSymbol(sym: string | null): void {
    presenters.eqWorkspace.intents.setCompare(sym);
  }
```

(Match the exact call-shape of the sibling wrappers — read `toggleEqYScale`'s body and mirror it; if the siblings go through a different accessor than `presenters.eqWorkspace.intents`, use that same route.) Then in the `useEqWorkspace: () => ({ ... })` result, add `setCompare: setEqCompareSymbol,` after `toggleYScale`.

`packages/solid-bindings/src/createViewModel.ts` — same two edits (~line 933 wrapper, ~line 1251 result).

- [ ] **Step 6: Verify bindings typecheck + commit**

Run: `pnpm --filter @rtc/react-bindings typecheck && pnpm --filter @rtc/solid-bindings typecheck && pnpm --filter @rtc/react-bindings test && pnpm --filter @rtc/solid-bindings test && pnpm --filter @rtc/client-core build`

```bash
git add packages/client-core/src/presenters/EqWorkspaceMachine.ts packages/client-core/src/presenters/__tests__/EqWorkspaceMachine.test.ts packages/react-bindings/src/createViewModel.ts packages/solid-bindings/src/createViewModel.ts
git commit -m "feat(client-core): eqWorkspace compare state + setCompare intent, wired through both bindings"
```

---

### Task 3: React client — ComparePills, PCT pill, compare plumbing, token

**Files:**
- Create: `packages/client-react/src/ui/equities/chart/ComparePills.tsx`
- Modify: `packages/client-react/src/ui/equities/chart/TimeframePills.module.css` (`.vsLabel` rule)
- Modify: `packages/client-react/src/ui/equities/chart/IndicatorPills.tsx` (PCT-disabled state)
- Modify: `packages/client-react/src/ui/equities/chart/EqChartHead.tsx`
- Modify: `packages/client-react/src/ui/equities/chart/ChartPanel.tsx`
- Modify: `packages/client-react/src/ui/equities/chart/CandleChart.tsx`
- Modify: `packages/client-react/src/ui/equities/chart/ChartPlot.tsx`
- Modify: `packages/client-react/src/ui/equities/chart/SvgPathLayer.tsx` + `SvgPathLayer.module.css`
- Modify: `packages/client-react/src/ui/shell/theme/tokens.ts` + `tokens.test.ts`
- Modify: `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts` (add `setCompare` passthrough)
- Modify: `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts` (add `setCompare` noop)

**Interfaces:**
- Consumes: Task 1's `ChartCompareInput`/`ChartVm.compareLinePoints`; Task 2's `setCompare` + `state.compare`.
- Produces: `CandleChartProps.compare?: { readonly series: readonly Candle[] }`; `SvgPathLayerProps.comparePoints?: readonly ChartPoint[]` (default `[]`); `IndicatorPillsProps.comparing?: boolean` (default false); `ComparePillsProps { candidates: readonly string[]; active: string | null; onSelect: (sym: string | null) => void }`; testids `chart-compare-pill` (`data-sym`, `data-active`) and `chart-compare-line`; token `--accent-compare`.

- [ ] **Step 1: `ComparePills.tsx`**

```tsx
import type { ReactElement } from "react";

import styles from "./TimeframePills.module.css";

/**
 * The comparison-symbol picker: a "VS" group label + one pill per watchlist
 * symbol other than the selected one (max 4 on the 5-symbol roster).
 * Single-select — clicking the active pill clears the comparison. Reuses
 * TimeframePills' module-css shape, like IndicatorPills.
 */
export function ComparePills({
  candidates,
  active,
  onSelect,
}: ComparePillsProps): ReactElement {
  return (
    <div className={styles.pills}>
      <span className={styles.vsLabel}>VS</span>
      {candidates.map((sym) => {
        return (
          <button
            key={sym}
            type="button"
            className={styles.pill}
            data-testid="chart-compare-pill"
            data-sym={sym}
            data-active={String(active === sym)}
            onClick={() => {
              onSelect(active === sym ? null : sym);
            }}
          >
            {sym}
          </button>
        );
      })}
    </div>
  );
}

export interface ComparePillsProps {
  /** Watchlist symbols eligible for comparison — the selected symbol is
   * already excluded by the caller (EqChartHead). */
  candidates: readonly string[];
  /** The currently-compared symbol, or null for none. */
  active: string | null;
  /** Sets (or clears, on null) the comparison symbol. */
  onSelect: (sym: string | null) => void;
}
```

Append to `TimeframePills.module.css`:

```css
/* ComparePills' group label — a small static marker before the symbol
   pills (matches the pill typography, non-interactive). */
.vsLabel {
  align-self: center;
  padding: 0 2px;
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
```

- [ ] **Step 2: `IndicatorPills.tsx` — PCT-disabled state**

Add to `IndicatorPillsProps`:

```ts
  /** Whether a comparison symbol is active — renders the axis-scale pill as
   * a disabled "PCT" marker (comparison forces the percent axis; the stored
   * linear/log preference underneath is untouched). Default false. */
  comparing?: boolean;
```

Destructure `comparing = false` in the component signature, and replace the LOG button with:

```tsx
      <button
        type="button"
        className={styles.pill}
        data-testid="chart-yscale-pill"
        data-active={String(!comparing && yScale === "log")}
        disabled={comparing}
        title={comparing ? "comparison uses percent scale" : undefined}
        onClick={() => {
          onToggleYScale();
        }}
      >
        {comparing ? "PCT" : "LOG"}
      </button>
```

- [ ] **Step 3: `EqChartHead.tsx` — wire ComparePills**

The head needs the watchlist. Update the component:

```tsx
export function EqChartHead(): ReactElement {
  const { useEqWorkspace, useEqDrawings, useWatchlist } = useViewModel();
  const {
    state,
    setTimeframe,
    setChartType,
    toggleIndicator,
    togglePane,
    toggleYScale,
    setCompare,
  } = useEqWorkspace();
  const { state: drawState, setTool } = useEqDrawings();
  const candidates = useWatchlist()
    .map((i) => {
      return i.symbol;
    })
    .filter((sym) => {
      return sym !== state.sel;
    });

  return (
    <div className={styles.head}>
      <div className={styles.tabsWrap}>
        <InstrumentTabs />
      </div>
      <ChartTypePills kind={state.chartType} onSet={setChartType} />
      <IndicatorPills
        active={state.indicators}
        onToggle={toggleIndicator}
        activePanes={state.panes}
        onTogglePane={togglePane}
        yScale={state.yScale}
        onToggleYScale={toggleYScale}
        comparing={state.compare !== null}
      />
      <ComparePills
        candidates={candidates}
        active={state.compare}
        onSelect={setCompare}
      />
      <TimeframePills tf={state.timeframe} onSet={setTimeframe} />
      <DrawToolPills tool={drawState.tool} onSet={setTool} />
    </div>
  );
}
```

(add `import { ComparePills } from "./ComparePills";` — Biome will order it.)

- [ ] **Step 4: `ChartPanel.tsx` — fetch + thread compare**

Destructure `compare` from state: `const { sel, timeframe, chartType, indicators, panes, yScale, compare } = state;`. Fetch after `candles`:

```ts
  // The comparison symbol's series — the presenter maps "" to a stable
  // empty series, so no compare costs nothing. Reuses the same keyed
  // useCandles bind as the primary (per-symbol streams already exist).
  const compareCandles = useCandles(compare ?? "", timeframe);
```

Pass to CandleChart (after `yScale={yScale}`):

```tsx
          compare={
            compare !== null ? { series: compareCandles } : undefined
          }
```

The `key={`${sel}|${timeframe}`}` line is UNTOUCHED — compare toggling must not remount (viewport preserved).

- [ ] **Step 5: `CandleChart.tsx` — thread into chartVm**

Props interface gains (after `yScale?`):

```ts
  /** Comparison series overlay — presence switches the whole plot to the
   * percent axis (see @rtc/motion-core chartScene). An empty `series` while
   * the compare symbol's data is still loading percent-projects the primary
   * alone (the axis is already %, so the line's arrival doesn't reflow). */
  compare?: { readonly series: readonly Candle[] };
```

Destructure `compare,` in the signature (no default). The `chartVm` call becomes:

```ts
  const vm = chartVm(candles, liveRate, flashOn, {
    viewport,
    kind,
    yScale,
    compare,
  });
```

(`{ series: readonly Candle[] }` satisfies `ChartCompareInput` structurally — domain `Candle` extends `ChartCandle`.)

- [ ] **Step 6: `ChartPlot.tsx` + `SvgPathLayer.tsx` — render the line**

`ChartPlot.tsx` — pass through to the SVG layer:

```tsx
        <SvgPathLayer
          linePoints={vm.linePoints}
          kind={kind}
          indicatorPaths={indicatorPaths}
          comparePoints={vm.compareLinePoints}
        />
```

`SvgPathLayer.tsx` — props gain:

```ts
  /** The comparison overlay's pre-projected close-line — empty/omitted
   * renders nothing. */
  readonly comparePoints?: readonly ChartPoint[];
```

Destructure `comparePoints = EMPTY_POINTS` (add `const EMPTY_POINTS: readonly ChartPoint[] = [];` at module scope). Render after the indicator polylines, inside the same `<svg>`:

```tsx
      {comparePoints.length > 1 && (
        <polyline
          data-testid="chart-compare-line"
          className={styles.compare}
          fill="none"
          points={toPointsAttr(comparePoints)}
        />
      )}
```

`SvgPathLayer.module.css` — after the `.indicator` rules:

```css
/* The comparison symbol's close-line — its own accent token so it reads
   apart from the primary line (--accent-primary) and both overlays
   (--accent-2 sma20, --accent-aware ema50). */
.compare {
  stroke: var(--accent-compare);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}
```

- [ ] **Step 7: `tokens.ts` + `tokens.test.ts` — the `--accent-compare` token**

`tokens.ts`: add `"--accent-compare": string;` to the `ThemeTokens` interface (after `"--accent-2"`), then add a `"--accent-compare"` line immediately after EVERY `"--accent-2"` line (12 cells). Values: `#a78bfa` in every dark cell (`darkTokens`, `holoDark`, `holo3dDark`, `terminalDark`, `terminal3dDark`, `neonDark`), `#7c3aed` in every light cell (`lightTokens`, `holoLight`, `holo3dLight`, `terminalLight`, `terminal3dLight`, `neonLight`).

`tokens.test.ts`: add `"--accent-compare",` to `REQUIRED_KEYS` (after `"--accent-2"`).

- [ ] **Step 8: test fakes (typecheck-forced one-liners)**

- `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts`: find the `useEqWorkspace` result object (it forwards the real machine's intents) and add `setCompare: world.eqWorkspace.intents.setCompare,` matching the file's existing `toggleYScale` line style exactly.
- `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`: find its `useEqWorkspace` fake and add a noop `setCompare: () => {},` matching the sibling noop style.

(Read each file's actual sibling lines first and copy their exact idiom — these two files' shapes differ.)

- [ ] **Step 9: Verify + commit**

Run: `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-react test:ui:contract`
Expected: all green (no behaviour asserted yet on compare — the shared spec lands in Task 5; this proves nothing regressed).

```bash
git add packages/client-react
git commit -m "feat(client-react): comparison series — VS pills, PCT-locked scale pill, compare line, --accent-compare token"
```

---

### Task 4: Solid client — twin of Task 3

**Files:**
- Create: `packages/client-solid/src/ui/equities/chart/ComparePills.tsx`
- Modify: `packages/client-solid/src/ui/equities/chart/TimeframePills.module.css` (same `.vsLabel` rule as react)
- Modify: `packages/client-solid/src/ui/equities/chart/IndicatorPills.tsx`
- Modify: `packages/client-solid/src/ui/equities/chart/EqChartHead.tsx`
- Modify: `packages/client-solid/src/ui/equities/chart/ChartPanel.tsx`
- Modify: `packages/client-solid/src/ui/equities/chart/CandleChart.tsx`
- Modify: `packages/client-solid/src/ui/equities/chart/ChartPlot.tsx`
- Modify: `packages/client-solid/src/ui/equities/chart/SvgPathLayer.tsx` + `SvgPathLayer.module.css`
- Modify: `packages/client-solid/src/ui/shell/theme/tokens.ts` + `tokens.test.ts`
- Modify: `packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts`
- Modify: `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts`

**Interfaces:**
- Consumes: Tasks 1–2, and Task 3's exact prop names/testids/CSS (`comparePoints`, `comparing`, `chart-compare-pill`, `chart-compare-line`, `.vsLabel`, `.compare`, `--accent-compare` with the same 12 values).
- Produces: full Solid parity — same testids/attributes so the shared contract spec (Task 5) passes against both.

**The one Solid-specific piece** — `ChartBody` is remount-keyed on `sel::timeframe` and calls `useCandles` once at setup, but compare must change WITHOUT a remount. `toSignal` registers `onCleanup`, so calling `useCandles` inside a `createMemo` re-creates the subscription per compare value and disposes the old one with the memo's own scope — the idiomatic keyed-resource pattern:

- [ ] **Step 1: `ComparePills.tsx` (solid)**

```tsx
import { For, type JSX } from "solid-js";

import styles from "./TimeframePills.module.css";

/**
 * The comparison-symbol picker: a "VS" group label + one pill per watchlist
 * symbol other than the selected one (max 4 on the 5-symbol roster).
 * Single-select — clicking the active pill clears the comparison. Reuses
 * TimeframePills' module-css shape, like IndicatorPills.
 */
export function ComparePills(props: ComparePillsProps): JSX.Element {
  return (
    <div class={styles.pills}>
      <span class={styles.vsLabel}>VS</span>
      <For each={props.candidates}>
        {(sym: string): JSX.Element => {
          return (
            <button
              type="button"
              class={styles.pill}
              data-testid="chart-compare-pill"
              data-sym={sym}
              data-active={String(props.active === sym)}
              onClick={() => {
                props.onSelect(props.active === sym ? null : sym);
              }}
            >
              {sym}
            </button>
          );
        }}
      </For>
    </div>
  );
}

export interface ComparePillsProps {
  /** Watchlist symbols eligible for comparison — the selected symbol is
   * already excluded by the caller (EqChartHead). */
  candidates: readonly string[];
  /** The currently-compared symbol, or null for none. */
  active: string | null;
  /** Sets (or clears, on null) the comparison symbol. */
  onSelect: (sym: string | null) => void;
}
```

Append the SAME `.vsLabel` css rule as Task 3 to solid's `TimeframePills.module.css`.

- [ ] **Step 2: `IndicatorPills.tsx` (solid) — PCT-disabled state**

Props gain the same optional `comparing?: boolean`. Replace the LOG button:

```tsx
      <button
        type="button"
        class={styles.pill}
        data-testid="chart-yscale-pill"
        data-active={String(!props.comparing && props.yScale === "log")}
        disabled={props.comparing ?? false}
        title={
          props.comparing ? "comparison uses percent scale" : undefined
        }
        onClick={() => {
          props.onToggleYScale();
        }}
      >
        {props.comparing ? "PCT" : "LOG"}
      </button>
```

- [ ] **Step 3: `EqChartHead.tsx` (solid)**

Mirror Task 3: pull `useWatchlist` from `useViewModel()`, destructure `setCompare` from `useEqWorkspace()`, compute candidates in a memo, add the two props + the component:

```tsx
  const instruments = useWatchlist();
  const candidates = createMemo((): readonly string[] => {
    return instruments()
      .map((i) => {
        return i.symbol;
      })
      .filter((sym) => {
        return sym !== state().sel;
      });
  });
```

(`import { createMemo } from "solid-js";` if not present.) In JSX, after `<IndicatorPills … comparing={state().compare !== null} />`:

```tsx
      <ComparePills
        candidates={candidates()}
        active={state().compare}
        onSelect={setCompare}
      />
```

- [ ] **Step 4: `ChartPanel.tsx` (solid) — keyed compare feed WITHOUT remount**

In `ChartBody` (NOT in the `bodyKey` — compare must never remount the body): destructure nothing new from props; add after the existing `useCandles` line:

```ts
  // The comparison symbol's series. `useCandles` subscribes at CALL time
  // with a plain symbol (see the SOLID PORT NOTE above) — but unlike
  // sel/timeframe, a compare switch must NOT remount ChartBody (that would
  // reset the viewport). Calling it inside a createMemo keyed on the
  // compare symbol gives the keyed-resource behaviour instead: toSignal
  // registers onCleanup, and a memo re-run disposes its previous
  // computation's cleanups — so each compare value gets a fresh
  // subscription and the old one is torn down, no remount involved.
  const compareCandles = createMemo(
    (): (() => readonly Candle[]) | null => {
      const sym = state().compare;
      // eslint-disable-next-line solid/reactivity -- props.timeframe is fixed for this component's lifetime (ChartBody remounts on timeframe change)
      return sym !== null ? useCandles(sym, props.timeframe) : null;
    },
  );
```

Add `import type { Candle } from "@rtc/domain";` if not present (check — `CandleTimeframe` is already imported from there). Then thread into the `<CandleChart>` JSX (after `yScale={state().yScale}` — check the actual prop lines in the file and mirror):

```tsx
          compare={
            compareCandles() !== null
              ? { series: compareCandles()?.() ?? [] }
              : undefined
          }
```

- [ ] **Step 5: `CandleChart.tsx` (solid)**

Props gain the same `compare?: { readonly series: readonly Candle[] }` (same doc comment as react). The `vm` memo becomes:

```ts
  const vm = createMemo((): ChartVm => {
    return chartVm(props.candles, props.liveRate, props.flashOn, {
      viewport: g.viewport(),
      kind: props.kind,
      yScale: props.yScale ?? "linear",
      compare: props.compare,
    });
  });
```

- [ ] **Step 6: `ChartPlot.tsx` + `SvgPathLayer.tsx` (solid)**

`ChartPlot.tsx`: add `comparePoints={props.vm.compareLinePoints}` to its `<SvgPathLayer …>` call.

`SvgPathLayer.tsx` (solid): same optional prop + module-scope `EMPTY_POINTS`; render with Solid's `<Show>` or a plain conditional matching the file's existing `kind !== "candles"` style — read the file and mirror its conditional idiom, e.g.:

```tsx
      <Show when={(props.comparePoints ?? EMPTY_POINTS).length > 1}>
        <polyline
          data-testid="chart-compare-line"
          class={styles.compare}
          fill="none"
          points={toPointsAttr(props.comparePoints ?? EMPTY_POINTS)}
        />
      </Show>
```

Same `.compare` css rule as Task 3 in solid's `SvgPathLayer.module.css`.

- [ ] **Step 7: tokens (solid) + test fakes (solid)**

Identical edits to Task 3's Steps 7–8, in the solid packages' files (`tokens.ts` type + 12 cells + `tokens.test.ts` roster; `viewModelFromWorld.ts` real-intent passthrough; `buildFakeViewModel.ts` noop).

- [ ] **Step 8: Verify + commit**

Run: `pnpm --filter @rtc/client-solid typecheck && pnpm --filter @rtc/client-solid test && pnpm --filter @rtc/client-solid test:ui:contract`

```bash
git add packages/client-solid
git commit -m "feat(client-solid): comparison series — Solid twins of the VS pills, PCT pill, compare line, token"
```

---

### Task 5: Shared contract spec — `ChartCompare.contract.spec.ts` + page objects + node budget

**Files:**
- Create: `packages/ui-contract/src/specs/equities/chart/ChartCompare.contract.spec.ts`
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/EqChartHeadPage.ts`
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts`
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/ChartPanelPage.ts` (widen `waitUntilYScaleAttr`'s mode type if it is a union)
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts` `CandleChartProps` (add `compare?`)

**Interfaces:**
- Consumes: Tasks 1–4 (testids, `data-yscale="percent"` — free, since `ChartPlot` renders `vm.scale.yScale ?? "linear"`).
- Produces: page-object methods later specs/e2e reuse: `EqChartHeadPage.compareCandidates()/activeCompare()/toggleCompare(sym)/yScalePillLabel()/yScalePillDisabled()`; `CandleChartPage.compareLineVisible()`.

- [ ] **Step 1: page-object additions**

`EqChartHeadPage.ts` (after the yScale block):

```ts
  /** Every compare pill's symbol, in DOM order. */
  compareCandidates(): string[] {
    return within(this.root)
      .queryAllByTestId("chart-compare-pill")
      .map((el) => {
        return el.getAttribute("data-sym") ?? "";
      });
  }

  /** The active compare pill's symbol, or null when no comparison is set. */
  activeCompare(): string | null {
    const active = within(this.root)
      .queryAllByTestId("chart-compare-pill")
      .find((el) => {
        return el.getAttribute("data-active") === "true";
      });
    return active?.getAttribute("data-sym") ?? null;
  }

  /** Clicks the compare pill for the given symbol — drives the real
   * eqWorkspace machine's setCompare intent (clicking the active pill
   * clears the comparison). */
  async toggleCompare(sym: string): Promise<void> {
    await this.user.click(this.pillFor("chart-compare-pill", "data-sym", sym));
  }

  /** The axis-scale pill's current label — "LOG" normally, "PCT" while a
   * comparison locks the axis to percent. */
  yScalePillLabel(): string {
    return (
      within(this.root).queryAllByTestId("chart-yscale-pill")[0]?.textContent ??
      ""
    );
  }

  /** Whether the axis-scale pill is disabled (true while comparing). */
  yScalePillDisabled(): boolean {
    return (
      within(this.root)
        .queryAllByTestId("chart-yscale-pill")[0]
        ?.hasAttribute("disabled") === true
    );
  }
```

`CandleChartPage.ts`:
- `CandleChartProps` gains `compare?: { readonly series: readonly Candle[] };` (with the same doc comment as the component).
- New method:

```ts
  /** Whether the comparison close-line polyline is rendered. */
  compareLineVisible(): boolean {
    return (
      this.root.querySelector('[data-testid="chart-compare-line"]') !== null
    );
  }
```

`ChartPanelPage.ts` — three edits:

1. Widen `waitUntilYScaleAttr(mode: "linear" | "log")` to `mode: "linear" | "log" | "percent"` (the method body is mode-agnostic — only the type changes).
2. Add the two read methods the spec's pill-workspace cases need (same descendant-query style as its `yScaleAttr`, since `this.root` is the panel body wrapping the chart column):

```ts
  /** Ordered text of every rendered y-axis price label in the chart column
   * — prices ("104.00") normally, signed percents ("+1.25%") while a
   * comparison locks the axis to percent mode. */
  priceLabels(): string[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-price-label"]'),
    ).map((el) => {
      return el.textContent ?? "";
    });
  }

  /** Whether the comparison close-line polyline is rendered in the chart
   * column — the panel-mount twin of CandleChartPage.compareLineVisible. */
  compareLineVisible(): boolean {
    return (
      this.root.querySelector('[data-testid="chart-compare-line"]') !== null
    );
  }
```

- [ ] **Step 2: Write the spec**

`packages/ui-contract/src/specs/equities/chart/ChartCompare.contract.spec.ts`:

```ts
/**
 * Comparison-series contract cases — the last TradingView-tier sub-project
 * (docs/superpowers/specs/2026-08-08-comparison-series-design.md).
 *
 * Two mounting strategies, mirroring ChartYScale.contract.spec.ts:
 *  - Pill → percent axis (cases 1-3): the VS pills render in EqChartHead
 *    and drive the real eqWorkspace machine's `compare` field, which
 *    ChartPanel's CandleChart reads — both mounted on one shared World
 *    (mountWith). The coupled-scale rule (compare ⇒ percent axis, cleared ⇒
 *    stored lin/log restored) is only observable on this route.
 *  - Rendering (cases 4-6): CandleChart takes `compare` as a plain prop, so
 *    these mount it directly, matching ChartYScale's direct-mount style.
 */

import { CandleChart, ChartPanel, EqChartHead } from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import type { CandleChartPage } from "@ui-contract/pages/equities/chart/CandleChartPage";
import type { ChartPanelPage } from "@ui-contract/pages/equities/chart/ChartPanelPage";
import type { EqChartHeadPage } from "@ui-contract/pages/equities/chart/EqChartHeadPage";
import { afterEach, describe, expect, it } from "vitest";

import type { Candle, EquityInstrument, EquityQuote } from "@rtc/domain";

import { candleAt, generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ" },
];

const CANDLES = generateCandles(300);
const DEFAULT_VISIBLE = 60;
const LAST = candleAt(299);

// A second deterministic series on the SAME time buckets as candleFixture
// (time = i × 60_000) so time-alignment matches every visible index, with a
// steeper close slope so the two series' pct paths genuinely differ.
const COMPARE_CANDLES: readonly Candle[] = Array.from(
  { length: 300 },
  (_, i) => {
    const open = 50 + i * 2;
    return {
      time: i * 60_000,
      open,
      high: open + 2,
      low: open - 2,
      close: open + 1,
      volume: 1_000,
    };
  },
);

const PCT_LABEL = /^(\+|-)?\d+\.\d{2}%$/;

describe("Comparison series — VS pills drive the real chart column (shared eqWorkspace)", () => {
  it("candidates exclude the selected symbol", () => {
    const { head } = mountPillWorkspace();
    expect(head.compareCandidates()).toEqual(["MSFT", "TSLA"]);
    expect(head.activeCompare()).toBeNull();
  });

  it("picking a comparison switches the axis to percent, draws the line, and locks the scale pill at PCT", async () => {
    const { head, panel } = mountPillWorkspace();

    expect(head.yScalePillLabel()).toBe("LOG");
    expect(head.yScalePillDisabled()).toBe(false);

    await head.toggleCompare("MSFT");

    expect(head.activeCompare()).toBe("MSFT");
    await panel.waitUntilYScaleAttr("percent");
    expect(head.yScalePillLabel()).toBe("PCT");
    expect(head.yScalePillDisabled()).toBe(true);
    // Every axis label is percent-formatted while comparing.
    for (const txt of panel.priceLabels()) {
      expect(txt).toMatch(PCT_LABEL);
    }
    expect(panel.compareLineVisible()).toBe(true);
  });

  it("clearing the comparison restores the STORED scale — log survives a compare round-trip", async () => {
    const { head, panel } = mountPillWorkspace();

    // Stored preference: log.
    await head.toggleYScale();
    await panel.waitUntilYScaleAttr("log");

    await head.toggleCompare("MSFT");
    await panel.waitUntilYScaleAttr("percent");

    // Clearing = clicking the active pill.
    await head.toggleCompare("MSFT");
    await panel.waitUntilYScaleAttr("log");
    expect(head.yScalePillLabel()).toBe("LOG");
    expect(head.yScalePillDisabled()).toBe(false);
    expect(panel.compareLineVisible()).toBe(false);
    // Labels are prices again (no % suffix).
    for (const txt of panel.priceLabels()) {
      expect(txt).not.toMatch(/%$/);
    }
  });

  it("selecting the compared symbol as primary absorbs the comparison", async () => {
    const { head, panel, world } = mountPillWorkspace();

    await head.toggleCompare("MSFT");
    await panel.waitUntilYScaleAttr("percent");

    world.eqWorkspace.intents.select("MSFT");

    await panel.waitUntilYScaleAttr("linear");
    expect(head.activeCompare()).toBeNull();
  });
});

describe("Comparison series — CandleChart direct mount", () => {
  it("the compare prop renders the overlay polyline and a percent crosshair readout", () => {
    const chart = mountChart({ compare: { series: COMPARE_CANDLES } });

    expect(chart.compareLineVisible()).toBe(true);
    expect(chart.yScaleAttr()).toBe("percent");

    chart.setPointer(0.5, 0.5);
    expect(chart.crosshairPrice()).toMatch(PCT_LABEL);
  });

  it("an empty compare series keeps the percent axis but renders no line", () => {
    const chart = mountChart({ compare: { series: [] } });

    expect(chart.yScaleAttr()).toBe("percent");
    expect(chart.compareLineVisible()).toBe(false);
    for (const txt of chart.priceLabels()) {
      expect(txt).toMatch(PCT_LABEL);
    }
  });

  it("node budget: activating a comparison adds at most 2 nodes (one polyline)", () => {
    const chart = mountChart();
    const base = chart.wrapNodeCount();

    chart.setProps({ compare: { series: COMPARE_CANDLES } });

    expect(chart.wrapNodeCount()).toBeLessThanOrEqual(base + 2);
  });
});

interface PillWorkspace {
  readonly head: EqChartHeadPage;
  readonly panel: ChartPanelPage;
  readonly world: ReturnType<typeof createWorld>;
}

/** Mounts EqChartHead + ChartPanel on one shared World (mountWith) so a VS
 * pill click on the head drives the real eqWorkspace machine's `compare`
 * field that ChartPanel's CandleChart renders from — the coupling-spec
 * pattern ChartYScale.contract.spec.ts uses for the LOG pill. */
function mountPillWorkspace(): PillWorkspace {
  const world = createWorld(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      watchlist: INSTRUMENTS,
      candles: {
        AAPL: CANDLES,
        MSFT: COMPARE_CANDLES,
        TSLA: COMPARE_CANDLES,
      },
      quotes: { AAPL: quote() },
    },
  );
  const head = mountWith(world, EqChartHead, {});
  const panel = mountWith(world, ChartPanel, {});

  return { head, panel, world };
}

function quote(): EquityQuote {
  return {
    symbol: "AAPL",
    bid: 103.9,
    ask: 104.1,
    last: 104,
    changePct: 2,
    timestamp: 0,
  };
}

interface MountChartOptions {
  compare?: { readonly series: readonly Candle[] };
}

/** Mounts CandleChart directly with the established props, plus an optional
 * `compare` — mirrors ChartYScale.contract.spec.ts's own mountChart. */
function mountChart({ compare }: MountChartOptions = {}): CandleChartPage {
  return mount(CandleChart, {
    props: {
      candles: CANDLES,
      liveRate: LAST.close,
      flashOn: false,
      kind: "candles",
      indicators: [],
      panes: [],
      compare,
      defaultVisible: DEFAULT_VISIBLE,
      loadingOlder: false,
      historyExhausted: false,
      onLoadOlder: () => {},
    },
  });
}
```

**Implementer notes (read before running):**
- Check `createWorld`'s equities options key names against an existing spec (`ChartYScale.contract.spec.ts` uses `watchlist`/`candles`/`quotes` — copy exactly). If `world.eqWorkspace` isn't the accessor for the machine, find how `ChartDrawings.contract.spec.ts` reaches `world.eqDrawings.intents` and mirror for eqWorkspace; adjust the absorb case accordingly.
- `waitUntilYScaleAttr("linear")` in the absorb case assumes clearing restores the DEFAULT (linear) — correct there because that world never toggled log.
- If the node budget fails at +2 because the react/solid render containers count differently, raise to +4 with a comment naming the counted nodes — never silently.

- [ ] **Step 3: Run against BOTH clients**

Run: `pnpm --filter @rtc/client-react test:ui:contract -- ChartCompare && pnpm --filter @rtc/client-solid test:ui:contract -- ChartCompare`
Expected: PASS ×2 (the swap-trio runs the same file against each client).

Then full tiers (regression): `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract`

- [ ] **Step 4: Commit**

```bash
git add packages/ui-contract
git commit -m "test(ui-contract): ChartCompare contract spec — VS pills, coupled percent axis, compare line, node budget"
```

---

### Task 6: Visual scenario `equities/chart-compare`

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts`
- Modify: `packages/client-react/tests/ui/visual/react/EquitiesChartInteractive.visual.tsx` (+ its registry `packages/client-react/tests/ui/visual/react/registry.tsx`)
- Modify: `packages/client-solid/tests/ui/visual/solid/EquitiesChartInteractive.visual.tsx` (+ `packages/client-solid/tests/ui/visual/solid/registry.tsx`)
- Goldens: `packages/ui-contract/goldens/` (react writes the local darwin-arm64 set; solid asserts; the x86 set regenerates via the `update-visual-goldens.yml` dispatch AFTER merge — a controller step, not this task's)

**Interfaces:**
- Consumes: Task 3/4's `compare` prop on the real `CandleChart`.
- Produces: scenario key `equities/chart-compare`, componentKey `EquitiesChartCompare`.

- [ ] **Step 1: scenario entry**

In `scenarios.ts`, after the `equities/chart-log-scale` entry:

```ts
  // Comparison series (spec 2026-08-08): the real CandleChart mounted with a
  // deterministic compare series — a real prop like yScale above, so no
  // ChartPlot bypass is needed; default gesture state keeps it
  // deterministic. Pins the percent axis labels, the compare polyline
  // (--accent-compare), and the unchanged candle geometry in one capture.
  "equities/chart-compare": {
    componentKey: "EquitiesChartCompare",
    fixtureKey: "equities-loaded",
  },
```

- [ ] **Step 2: react wrapper**

In `EquitiesChartInteractive.visual.tsx` (react), after `EquitiesChartLogScale`, following its exact shape (the file's local `CANDLES`/`LIVE_RATE`/`DEFAULT_VISIBLE`/`STAGE_STYLE` already exist):

```tsx
// Comparison series (spec 2026-08-08): the real CandleChart with a literal
// deterministic compare series on the same one-minute buckets as CANDLES
// (time-aligned at every index), steeper slope so the two pct paths
// visibly diverge across the default {240,300} window.
const COMPARE_SERIES: readonly Candle[] = Array.from(
  { length: 300 },
  (_, i) => {
    const open = 50 + i * 2;
    return {
      time: i * BUCKET_MS,
      open,
      high: open + 2,
      low: open - 2,
      close: open + 1,
      volume: 1_000,
    };
  },
);

export function EquitiesChartCompare(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <CandleChart
        candles={CANDLES}
        liveRate={LIVE_RATE}
        flashOn={false}
        kind="candles"
        indicators={[]}
        panes={[]}
        compare={{ series: COMPARE_SERIES }}
        defaultVisible={DEFAULT_VISIBLE}
        loadingOlder={false}
        historyExhausted={false}
        onLoadOlder={() => {}}
      />
    </div>
  );
}
```

(Check the file's actual candle-fixture constant names — `CANDLES` may be built by a local `generateCandles`; reuse whatever `EquitiesChartLogScale` uses verbatim. `STAGE_STYLE` likewise.) Register `EquitiesChartCompare` in `registry.tsx` exactly where `EquitiesChartLogScale` is listed.

- [ ] **Step 3: solid wrapper**

Same wrapper in solid's `EquitiesChartInteractive.visual.tsx` (JSX.Element, `class` idiom, its own local constants) + registry entry.

- [ ] **Step 4: capture the react golden locally, eyeball, assert solid**

From the worktree (install+build already done; kill any stale vite on :3200 first — a reused server serves stale code: `lsof -ti :3200 | xargs kill 2>/dev/null || true`):

```bash
pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update -- -g "chart-compare"
```

Verify NEW golden PNGs appeared under `packages/ui-contract/goldens/` for every theme bucket the tier runs, then LOOK at one PNG (open it) — confirm: percent labels on the y-axis, a violet compare line diverging from the candles. A passing run is NOT evidence; the eyeball is the gate.

Then assert-only on both clients:

```bash
pnpm --filter @rtc/client-react test:ui:visual:playwright:react -- -g "chart-compare"
pnpm --filter @rtc/client-solid test:ui:visual:playwright:solid -- -g "chart-compare"
```

Expected: PASS ×2 (solid must reproduce the react-written golden pixel-for-pixel; if solid diffs, the twins are NOT at parity — fix the solid shell, never loosen tolerance).

Also run the FULL react visual tier once (`pnpm --filter @rtc/client-react test:ui:visual`) to prove zero churn on every EXISTING golden — this feature must not move any other pixel.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-contract/src/visual/scenarios.ts packages/ui-contract/goldens packages/client-react/tests/ui/visual packages/client-solid/tests/ui/visual
git commit -m "test(visual): equities/chart-compare scenario — percent axis + compare line golden (react writes, solid asserts)"
```

---

### Task 7: e2e journey — pick, verify, clear

**Files:**
- Modify: `tests/browser/page-objects/contracts/EquitiesChart.ts`
- Modify: `tests/browser/page-objects/playwright/EquitiesChart.ts`
- Modify: `tests/browser/scenarios/equitiesChart.ts`
- Modify: `tests/browser/playwright/equitiesChart.spec.ts`

**Interfaces:**
- Consumes: testids `chart-compare-pill`/`chart-compare-line`, wrap attr `data-yscale="percent"`.
- Produces: contract methods `clickComparePill(sym)`, `waitCompareLineVisible(timeoutMs)`, `waitCompareLineHidden(timeoutMs)`; `waitYScale`'s mode union widened to `"linear" | "log" | "percent"`.

- [ ] **Step 1: contract additions** (`contracts/EquitiesChart.ts`, after the yScale pair; widen `waitYScale`'s mode type in place)

```ts
  /** Clicks the VS comparison pill for the given symbol (ComparePills.tsx). */
  clickComparePill(sym: string): Promise<void>;
  /** Waits until the comparison close-line polyline is rendered. */
  waitCompareLineVisible(timeoutMs: number): Promise<void>;
  /** Waits until the comparison close-line polyline is gone. */
  waitCompareLineHidden(timeoutMs: number): Promise<void>;
```

- [ ] **Step 2: playwright implementation** (`playwright/EquitiesChart.ts`, mirroring `clickYScalePill`/`waitYScale`'s locator style — read the file's private locator helpers and follow them):

```ts
  private comparePill(sym: string): Locator {
    return this.page.locator(
      `[data-testid="chart-compare-pill"][data-sym="${sym}"]`,
    );
  }

  private compareLine(): Locator {
    return this.page.locator('[data-testid="chart-compare-line"]');
  }

  async clickComparePill(sym: string): Promise<void> {
    await this.comparePill(sym).click();
  }

  async waitCompareLineVisible(timeoutMs: number): Promise<void> {
    await expect(this.compareLine()).toBeVisible({ timeout: timeoutMs });
  }

  async waitCompareLineHidden(timeoutMs: number): Promise<void> {
    await expect(this.compareLine()).toHaveCount(0, { timeout: timeoutMs });
  }
```

Widen the implementation's `waitYScale(mode: "linear" | "log" | "percent", …)` to match the contract.

- [ ] **Step 3: scenario functions** (`scenarios/equitiesChart.ts`, after the yScale pair; note `expectYScaleWithin`'s mode parameter widens with the contract):

```ts
export async function clickComparePill(
  ctx: TestContext,
  sym: string,
): Promise<void> {
  await ctx.po.equitiesChart.clickComparePill(sym);
}

export async function expectCompareLineVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitCompareLineVisible(seconds * 1_000);
}

export async function expectCompareLineHiddenWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.equitiesChart.waitCompareLineHidden(seconds * 1_000);
}
```

- [ ] **Step 4: the journey** (`playwright/equitiesChart.spec.ts`, after the LOG-pill test):

```ts
  test("VS pill overlays a comparison on a percent axis and clears back", async ({
    ctx,
  }) => {
    await equitiesChart.openEquitiesWorkspace(ctx);
    await equitiesChart.expectPlotVisibleWithin(ctx, 5);

    await equitiesChart.clickComparePill(ctx, "MSFT");
    await equitiesChart.expectYScaleWithin(ctx, "percent", 5);
    await equitiesChart.expectCompareLineVisibleWithin(ctx, 5);

    await equitiesChart.clickComparePill(ctx, "MSFT");
    await equitiesChart.expectYScaleWithin(ctx, "linear", 5);
    await equitiesChart.expectCompareLineHiddenWithin(ctx, 5);
  });
```

(The workspace's seeded selection is AAPL, so MSFT is always a candidate pill.)

- [ ] **Step 5: Run the suite against both clients + commit**

Run: `pnpm test:e2e` (run-all orchestrates both clients in parallel; budget ~8 min). If only iterating on this suite first: check `tests/browser/playwright/` for how a single spec is invoked in `run-all.ts` and use that filter form.

```bash
git add tests/browser
git commit -m "test(e2e): comparison-series journey — VS pill, percent axis, compare line, clear"
```

---

### Task 8: Docs close-out — §17.7 sentence + STATUS tier completion

**Files:**
- Modify: `docs/architecture/17-web-client-up-close.md` (§17.7)
- Modify: `docs/STATUS.md` (the "Canvas chart renderer productionization + TradingView tier" bullet + the Last-updated header line)

- [ ] **Step 1: §17.7** — find the drawing-tools passage in `docs/architecture/17-web-client-up-close.md` (grep `drag-edit`) and append after that sentence:

```
Comparison series completes the tier: a `compare` symbol on the shared
eqWorkspace machine overlays a second symbol's close-line on a percent axis —
`chartScene`'s `compare` option derives a percent `ChartScale` (`base` = the
first visible close, pct-range union back-converted to price units, series
aligned by time), so drawings and the crosshair invert through the same scale
unchanged, and clearing the comparison restores the stored linear/log choice.
```

(Adjust the joining prose to read naturally in context — read the surrounding paragraph first.)

- [ ] **Step 2: STATUS.md** — edit the TradingView bullet (currently ends "Remaining: comparison series — … escape hatch when node-count costs bite, not the entry ticket."): mark the tier COMPLETE. Replace the "Remaining:" clause with:

```
**Comparison series DONE (2026-08-08) — the tier is complete** (indicator panes, log scale, drawing tools 3a+3b, comparison series; spec: [superpowers/specs/2026-08-08-comparison-series-design.md](superpowers/specs/2026-08-08-comparison-series-design.md)). A production canvas renderer (palette port, text rendering, hit-testing model) remains the recorded escape hatch if node-count costs ever bite — not scheduled.
```

Bump the `**Last updated: …**` header line to 2026-08-08.

- [ ] **Step 3: Verify links + commit**

Run: `pnpm check:doc-links`

```bash
git add docs/architecture/17-web-client-up-close.md docs/STATUS.md
git commit -m "docs: comparison series shipped — TradingView tier complete (§17.7 + STATUS close-out)"
```

---

## After all tasks (controller, not a subagent)

1. Final whole-branch review (most capable model), ONE fix wave max.
2. `/rtc:gauntlet full` from the worktree — repo ESLint + knip + lint-warnings ledger are the known catches per-package runs miss.
3. Rules 2–6 of shipping-repo-changes: push, PR, CI loop, Rule-3 triage, `--merge`, cleanup.
4. Post-merge: dispatch `update-visual-goldens.yml` on main to regenerate the x86 golden set (the new scenario needs its x86 golden before the next post-merge `visual.yml` run can pass), then watch `visual.yml`.
