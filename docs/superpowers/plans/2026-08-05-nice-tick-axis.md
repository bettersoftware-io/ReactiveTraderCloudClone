# Nice-Tick Price Axis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Price-anchored nice-tick grid/labels (round prices, positioned via `priceToY`) in both scale modes, replacing the fixed-fraction policy (spec: `docs/superpowers/specs/2026-08-05-nice-tick-axis-design.md`).

**Architecture:** A pure `priceTicks(cmin, cmax)` generator (d3-style 1-2-5 threshold rounding) in motion-core; `chartScene` derives grid AND labels from the same tick array via `priceToY`, deleting `GRID_FRACTIONS`/`LABEL_FRACTIONS`. Scene shapes are unchanged, so projections, both shells, and the canvas engine need zero code changes; the existing `--ltop: calc(% − 6px)` projection already centers labels on their lines.

**Tech Stack:** TypeScript, vitest (motion-core + contract tiers), Playwright (goldens + e2e).

## Global Constraints

- `@rtc/motion-core` stays zero-dependency; new code follows repo style (mandatory braces, `{ return … }` bodies, newspaper order per file, `#/` aliases in clients).
- **Deliberate breakage is scoped:** grid/label content changes everywhere the chart renders. The candle/crosshair/indicator linear equivalence pins in motion-core must still pass UNEDITED; only grid/label expectations may change, and only in the tasks that say so.
- Scene interface shapes (`SceneGridLine`, `SceneLabel`, `ChartScene`) do not change — contents only.
- Labels emit in **descending price order** (highest tick first), preserving the old top-down reading order.
- Label text stays `.toFixed(2)`.
- Zero shell/CSS changes (spec §5, amended); zero new animations/motion.
- Final verification runs the `/rtc:gauntlet` fast-tier commands **verbatim** plus the full-tier heavy set (typecheck, unit, both contract-coverage gates, build, devtools-dist).
- Commits end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01QjQPskCRRrWDKGMb5FhqX8`

---

### Task 1: `priceTicks` engine

**Files:**
- Create: `packages/motion-core/src/priceTicks.ts`
- Create: `packages/motion-core/src/priceTicks.test.ts`
- Modify: `packages/motion-core/src/index.ts` (export)

**Interfaces:**
- Produces: `priceTicks(cmin: number, cmax: number): readonly number[]` — ASCENDING tick values (Task 2 reverses for display order).

- [ ] **Step 1: Failing tests** (`priceTicks.test.ts`):

```ts
import { describe, expect, it } from "vitest";

import { priceTicks } from "./priceTicks.js";

describe("priceTicks", () => {
  it("picks the spec's worked example: 339→400 steps by 20", () => {
    expect(priceTicks(339, 400)).toEqual([340, 360, 380, 400]);
  });

  it("threshold-rounds instead of snapping up (the 1-tick regression case)", () => {
    // rawStep = 8.5/4 = 2.125; snap-up would pick 5 → ONE tick (105).
    // Threshold: err 2.125 ∈ [√2, √10) → multiplier 2 → step 2.
    expect(priceTicks(101, 109.5)).toEqual([102, 104, 106, 108]);
  });

  it("handles fractional steps below 1", () => {
    // rawStep = 2/4 = 0.5; err 5 ∈ [√10, √50) → 5 → step 0.5.
    expect(priceTicks(10, 12)).toEqual([10, 10.5, 11, 11.5, 12]);
  });

  it("includes endpoints when they are exact multiples", () => {
    // rawStep 25; err 2.5 → multiplier 2 → step 20:
    expect(priceTicks(100, 200)).toEqual([100, 120, 140, 160, 180, 200]);
  });

  it("boundary alignment can cost a tick — the hard floor is 2 (spec §3)", () => {
    // rawStep 7.15; err 7.15 ≥ √50 → step 10; only 400 and 410 fit.
    expect(priceTicks(390.4, 419)).toEqual([400, 410]);
  });

  it("keeps the count in the hard bounds [2, 7] across a range sweep", () => {
    for (let i = 0; i < 200; i++) {
      const cmin = 50 + i * 3.7;
      const span = 1 + (i % 40) * 2.3;
      const ticks = priceTicks(cmin, cmin + span);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(7);
    }
  });

  it("emits exact multiples of the step (no accumulation drift)", () => {
    for (const t of priceTicks(339, 400)) {
      expect(t % 20).toBe(0);
    }
  });

  it("degenerate range returns [cmin]", () => {
    expect(priceTicks(100, 100)).toEqual([100]);
    expect(priceTicks(100, 90)).toEqual([100]);
  });
});
```


- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @rtc/motion-core test -- priceTicks`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`priceTicks.ts`):

```ts
/** Round-price axis ticks for a visible range. rawStep = (cmax − cmin)/4 is
 * rounded to the nearest 1-2-5×10^k step by d3's tick-increment thresholds
 * (err ≥ √50 → 10, ≥ √10 → 5, ≥ √2 → 2, else 1) — NOT snapped up, which
 * under-produces (101→109.5 would yield one tick). Every integer multiple of
 * the step inside [cmin, cmax], ascending; ~3–6 ticks by construction.
 * Count: typically 3–6 (target 4), HARD bounds [2, 7] — boundary alignment
 * can cost a tick, matching d3 (spec §3, amended). cmax ≤ cmin (unreachable
 * with real OHLC) returns [cmin] to stay total. */
export function priceTicks(cmin: number, cmax: number): readonly number[] {
  if (cmax <= cmin) {
    return [cmin];
  }

  const rawStep = (cmax - cmin) / 4;
  const power = Math.floor(Math.log10(rawStep));
  const err = rawStep / 10 ** power;
  const multiplier = err >= Math.sqrt(50) ? 10 : err >= Math.sqrt(10) ? 5 : err >= Math.sqrt(2) ? 2 : 1;
  const step = multiplier * 10 ** power;
  const ticks: number[] = [];

  for (let k = Math.ceil(cmin / step); k <= Math.floor(cmax / step); k++) {
    ticks.push(k * step);
  }

  return ticks;
}
```

(If Biome dislikes the nested ternary, rewrite as an if/else chain — the thresholds are the requirement, not the syntax.) Export from `index.ts` beside the other chart exports: `export { priceTicks } from "./priceTicks.js";`.

- [ ] **Step 4: Run to pass**

Run: `pnpm --filter @rtc/motion-core test`
Expected: all pass (existing suite untouched).

- [ ] **Step 5: Commit**

```bash
git add packages/motion-core
git commit -m "feat(motion-core): priceTicks — 1-2-5 threshold-rounded axis ticks"
```

---

### Task 2: Scene derivation + contract pin rewrites

**Files:**
- Modify: `packages/motion-core/src/chartScene.ts` (grid/label construction)
- Modify: `packages/motion-core/src/chartScene.test.ts` (grid/label expectations ONLY)
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts` (two observers)
- Modify: `packages/ui-contract/src/specs/equities/chart/CandleChart.contract.spec.ts` (the "fixed 4" pin)
- Modify: `packages/ui-contract/src/specs/equities/chart/ChartYScale.contract.spec.ts` (two cases)

**Interfaces:**
- Consumes: `priceTicks` (Task 1), `priceToY` (existing).
- Produces: `scene.grid`/`scene.priceLabels` tick-derived, descending price order, label `top` === its grid line's `top`. New page observers `gridLineTopVars(): string[]` (each grid line's `--top`) and `priceLabelTopVars(): string[]` (each label's `--ltop`).

- [ ] **Step 1: chartScene.** Import `priceTicks`. Replace the `grid` and `priceLabels` constructions (currently `GRID_FRACTIONS.map(...)` and the `isLog`/`lmax`/`lrng` + `LABEL_FRACTIONS.map(...)` block) with:

```ts
  // Grid and labels are the same tick list viewed twice: one line and one
  // label per nice tick, both at priceToY(scale, tick), highest price first
  // (the old top-down reading order). The label projection's −6px calc
  // (chartCssVars) centers each 12px label on its line.
  const ticks = [...priceTicks(cmin, cmax)].reverse();

  const grid: SceneGridLine[] = ticks.map((t, i) => {
    return { key: i, top: yPct(t) };
  });

  const priceLabels: SceneLabel[] = ticks.map((t, i) => {
    return { key: i, txt: t.toFixed(2), top: yPct(t), x: 0 };
  });
```

Delete `GRID_FRACTIONS` and `LABEL_FRACTIONS` consts and the now-unused `isLog`/`lmax`/`lrng` block; delete `crng` ONLY if nothing else reads it (check — `crng` may still be dead after this; knip/`noUnusedLocals` will tell).

- [ ] **Step 2: chartScene.test.ts** — update ONLY grid/label expectations. The log-mode test block from the log-scale workstream ("grid geometry is identical between modes; label text is log-interpolated") inverts to the new truth. Replace that case with:

```ts
  it("grid and labels derive from the same ticks; log moves positions, not values", () => {
    const linear = chartScene(SERIES, 1000, false);
    const log = chartScene(SERIES, 1000, false, { yScale: "log" });

    // Same round tick values in both modes, highest first…
    const values = [...priceTicks(100, 1000)].reverse().map((t) => {
      return t.toFixed(2);
    });
    expect(linear.priceLabels.map((l) => l.txt)).toEqual(values);
    expect(log.priceLabels.map((l) => l.txt)).toEqual(values);
    // …every label sits ON its grid line…
    for (const scene of [linear, log]) {
      expect(scene.priceLabels.map((l) => l.top)).toEqual(
        scene.grid.map((g) => g.top),
      );
    }
    // …and log re-positions through priceToY (interior ticks differ).
    const logScale = { cmin: 100, cmax: 1000, yScale: "log" as const };
    expect(log.grid.map((g) => g.top)).toEqual(
      [...priceTicks(100, 1000)].reverse().map((t) => {
        return priceToY(logScale, t);
      }),
    );
    expect(log.grid.map((g) => g.top)).not.toEqual(
      linear.grid.map((g) => g.top),
    );
  });
```

Any other existing assertion pinning `grid` to 4 fixed fractions or labels to interpolated values updates to the tick-derived expectation computed via `priceTicks` (search the file for `GRID_FRACTIONS`-era literals: `[20, 40, 60, 80]`, `0.12`, `892.00`, `758.58`). The candle/crosshair/indicator/volume/navigator pins stay byte-untouched.

- [ ] **Step 3: Page observers** (`CandleChartPage.ts`, beside `priceLabels()`):

```ts
  /** Each grid line's projected `--top` custom property, in DOM order. */
  gridLineTopVars(): string[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-grid-line"]'),
    ).map((el) => {
      return (el as HTMLElement).style.getPropertyValue("--top");
    });
  }

  /** Each price label's projected `--ltop` custom property, in DOM order. */
  priceLabelTopVars(): string[] {
    return Array.from(
      this.root.querySelectorAll('[data-testid="chart-price-label"]'),
    ).map((el) => {
      return (el as HTMLElement).style.getPropertyValue("--ltop");
    });
  }
```

- [ ] **Step 4: CandleChart pin.** Rewrite the "renders one wrapper per candle, plus the fixed 4 grid lines and 4 price labels" case body's grid/label half:

```ts
    expect(chart.candleCount()).toBe(2);
    const gridTops = chart.gridLineTopVars();
    expect(gridTops.length).toBeGreaterThanOrEqual(2);
    expect(gridTops.length).toBeLessThanOrEqual(7);
    // One label per line, each centered ON its line: --ltop is the line's
    // --top wrapped in the projection's −6px centering calc.
    expect(chart.priceLabelTopVars()).toEqual(
      gridTops.map((t) => {
        return `calc(${t} - 6px)`;
      }),
    );
```

Rename the case: `"renders one wrapper per candle, plus one grid line + on-line label per nice tick"`.

- [ ] **Step 5: ChartYScale cases.** (a) "log mode moves candle geometry; grid and label positions hold still" becomes `"log mode moves candle geometry AND grid positions; tick values hold still"`:

```ts
    const chart = mountChart();
    const linTop = chart.candleBodyVar(30, "--top");
    const linLabels = chart.priceLabels();
    const linGridTops = chart.gridLineTopVars();

    chart.setProps({ yScale: "log" });

    expect(chart.candleBodyVar(30, "--top")).not.toBe(linTop);
    // Same round prices in both modes…
    expect(chart.priceLabels()).toEqual(linLabels);
    // …at different heights (log bunches toward the top).
    expect(chart.gridLineTopVars()).not.toEqual(linGridTops);
    expect(chart.gridLineTopVars()).toHaveLength(linGridTops.length);
```

(b) The label-text case now expects the round ticks (import `priceTicks`):

```ts
    const chart = mountChart({ yScale: "log" });
    const vm = chartVm(CANDLES, LAST.close, false, {
      viewport: { start: 240, end: 300 },
      kind: "candles",
      yScale: "log",
    });
    const expected = [...priceTicks(vm.scale.cmin, vm.scale.cmax)]
      .reverse()
      .map((t) => {
        return t.toFixed(2);
      });

    expect(chart.priceLabels()).toEqual(expected);
```

The pill, `data-yscale`, and crosshair-inversion cases stay untouched.

- [ ] **Step 6: Run the affected tiers**

Run: `pnpm --filter @rtc/motion-core test && pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract && pnpm typecheck`
Expected: all green on BOTH frameworks.

- [ ] **Step 7: Commit**

```bash
git add packages/motion-core packages/ui-contract
git commit -m "feat(motion-core): tick-derived grid/labels in chartScene + contract pin rewrites"
```

---

### Task 3: e2e LOG-pill journey — drop the label assertion

**Files:**
- Modify: `tests/browser/playwright/equitiesChart.spec.ts` (~lines 93 + 96)
- Modify: `tests/browser/scenarios/equitiesChart.ts`, `tests/browser/testContext.ts`, `tests/browser/page-objects/contracts/EquitiesChart.ts`, `tests/browser/page-objects/playwright/EquitiesChart.ts`, `tests/browser/page-objects/contracts/testids.ts` (orphan cleanup, conditional)

**Interfaces:** consumes nothing new; removes `recordPriceLabels`/`expectPriceLabelsChangedFrom` usage.

- [ ] **Step 1:** In the LOG-pill test, delete the `recordPriceLabels(ctx, "beforeLog")` and `expectPriceLabelsChangedFrom(ctx, "beforeLog")` lines (tick values are now mode-independent — spec §6). The journey's witness stays: click pill → `expectYScaleWithin(ctx, "log", 5)` → click → `expectYScaleWithin(ctx, "linear", 5)`.
- [ ] **Step 2:** Grep each of `recordPriceLabels`, `expectPriceLabelsChangedFrom`, `priceLabelTexts`, the testContext price-label scratch field, and `testids…priceLabel` across `tests/browser/`. Delete each one that now has zero remaining users (helpers, contract method, playwright implementation, scratch field, testid entry). Leave anything still referenced.
- [ ] **Step 3:** Run: the full equities e2e suite (see `tests/browser/run-all.ts` / README for the invocation; `-g` forwarding is unreliable — run the suite) plus `pnpm --filter @rtc/tests gates` (page-object grep gates), `pnpm lint:dead`, `pnpm typecheck`.
Expected: e2e green, gates green, no knip orphans.
- [ ] **Step 4: Commit**

```bash
git add tests/browser
git commit -m "test(e2e): LOG-pill journey witnesses data-yscale only — tick values are mode-independent"
```

---

### Task 4: Golden regeneration (darwin-arm64) + full asserts

**Files:**
- Regenerate: `packages/ui-contract/goldens/playwright/__screenshots__/react-local/darwin-arm64/visual.spec.ts/**` — every chart-bearing stem (~14 scenarios ×10 themes: the `equities-chart-*` family INCLUDING `equities-chart-canvas-spike` — the canvas engine strokes `scene.grid` too — plus `app-equities`)

- [ ] **Step 1:** Read `packages/client-react/tests/ui/visual/UPDATING-GOLDENS.md` + README. Worktree traps: `pnpm install` + `pnpm build` first; kill stale vite servers on the :3200 family before running (`lsof -nP -iTCP -sTCP:LISTEN | grep 32`).
- [ ] **Step 2:** Run the FULL update (no `-g`) for the darwin-arm64 bucket per the doc; only changed stems rewrite.
- [ ] **Step 3:** `git status` — verify the changed set is exactly the chart-bearing stems (no FX/credit/admin/login stems). If a non-chart stem changed, STOP and report BLOCKED with the diff.
- [ ] **Step 4:** Full unscoped asserts, BOTH frameworks — react then solid — must be 100% green. Eyeball two PNGs (one linear scenario, `equities-chart-log-scale`): round labels, label centered on its line, log bunching visible.
- [ ] **Step 5: Commit**

```bash
git add packages/ui-contract/goldens
git commit -m "test(visual): regen darwin-arm64 chart stems for the nice-tick axis"
```

---

### Task 5: `panesAttr` ride-along + docs close-out

**Files:**
- Modify: `packages/ui-contract/src/shared/pages/equities/chart/CandleChartPage.ts` (`panesAttr()` + `wrapNodeCount()` comment)
- Modify: `packages/ui-contract/src/specs/equities/chart/ChartPanes.contract.spec.ts` (one positive assertion)
- Modify: `docs/architecture/17-web-client-up-close.md`, `docs/STATUS.md`

- [ ] **Step 1: panesAttr fix** (the log-scale final review's deferred item):

```ts
  /** The chart wrap's `data-panes` count. Reads the wrap div via
   * querySelector — `this.root` is the RTL render container, a PARENT of
   * the wrap (same pattern as yScaleAttr; the old direct getAttribute
   * always returned the fallback). */
  panesAttr(): number {
    return Number(
      this.root.querySelector("[data-panes]")?.getAttribute("data-panes") ??
        "0",
    );
  }
```

Correct `wrapNodeCount()`'s stale comment ("`this.root` IS the wrap…") to say it counts the mounted tree under the render container — the budget deltas it feeds are container-relative either way.

- [ ] **Step 2: Prove the observer is live.** In `ChartPanes.contract.spec.ts`'s "overlays and panes toggle independently" case, after `chart.setProps({ panes: ["rsi"] })`, add `expect(chart.panesAttr()).toBe(1);` — a positive assertion the old dormant observer could never satisfy.
- [ ] **Step 3: Docs.** Append to the §17.7 log-scale paragraph: `The axis itself is price-anchored through the same seam (2026-08-05): priceTicks picks round 1-2-5 prices and both grid lines and labels project through priceToY, so linear and log render the same tick values at mode-correct heights.` STATUS.md: delete the ⚪ "Nice-tick price axis" entry; bump `**Last updated:**` to 2026-08-05.
- [ ] **Step 4:** Run: `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract && pnpm check:doc-links`
Expected: green.
- [ ] **Step 5: Commit**

```bash
git add packages/ui-contract docs
git commit -m "test(ui-contract): revive the dormant panesAttr observer + nice-tick docs close-out"
```

---

## Self-Review (done at authoring time)

- **Spec coverage:** §3 → Task 1; §4 → Task 2; §5 (no shell change) → no task, by design; §6 units/contract → Tasks 1-2, visual → Task 4, e2e → Task 3; §7 → no-op by construction; §8 → Task 5; §9 docs → Task 5 (x86 sync is post-merge process).
- **Placeholders:** none; Task 1 Step 1 carries an explicit instruction to repair its own flagged sloppy assertion before commit.
- **Type consistency:** `priceTicks(cmin, cmax): readonly number[]` ascending (Tasks 1→2 reverse at use); observers `gridLineTopVars`/`priceLabelTopVars` defined in Task 2 and used in Tasks 2/5 only.
