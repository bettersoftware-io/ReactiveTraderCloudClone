# Equities Chart Interactivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill interactive chart behaviour (cursor-anchored zoom, pan with live-edge follow, crosshair + OHLC/volume/time readout, time axis, candles|line|area chart types, volume pane, SMA/EMA overlays) into the equities module of both web clients, per the approved spec.

**Architecture:** All interaction math lands as pure, renderer-neutral functions in `@rtc/motion-core` (numbers in, numbers out — never markup); the domain simulator deepens its candle history by *prepending* an independently-seeded backwards walk (so the existing series stays byte-identical) and `Candle` gains `volume`; each web client adds one thin gesture shell (~30 lines of event → pure op → set-state) plus five dumb components, with rect marks staying divs and path marks rendered in one shared-coordinate SVG overlay.

**Tech Stack:** TypeScript, RxJS (domain/client-core only), React 19 + React Compiler, SolidJS, CSS Modules, Vitest, Playwright, the `@rtc/ui-contract` swap-trio harness.

**Spec:** [../specs/2026-07-26-equities-chart-interactivity-design.md](../specs/2026-07-26-equities-chart-interactivity-design.md)

## Global Constraints

- **Ship each PR under `shipping-repo-changes`**: fresh worktree via `./scripts/new-worktree.sh <name>`, one PR per phase below, loop CI green, merge `--merge`, clean up.
- **Imports**: match the sibling files — `@rtc/domain` uses relative paths with `.js` extensions; UI packages import siblings relatively and cross-package via `@rtc/*`. Never a `≥2-up` relative import.
- **Biome**: braces on ALL control statements; run `pnpm exec biome ci .` before every push (CI checks format + import-sort, local `pnpm lint` does not).
- **No inline `style={{…}}` object literals in JSX** (ESLint AST ban). The sanctioned pattern is precomputed CSS-custom-property records from motion-core vms (`style={cd.style}` referencing a precomputed value is allowed — see `CandleBars.tsx`).
- **No rxjs / localStorage / fetch imports anywhere under `src/ui`** (grep gates).
- **No manual `memo`/`useMemo` in client-react** — React Compiler is on (ADR-003).
- **`@rtc/motion-core` stays zero-dependency, no DOM, no framework imports.** Structural stand-in types instead of imports (see `ChartCandle` in `chartVm.ts`).
- **ESLint newspaper-order** rule is active: public/exported symbols first, helpers below.
- **Coverage**: the two `ui:contract` ≥95% gates are aggregates — additionally run `pnpm coverage:gaps` and check every NEW file per-file before calling a phase done.
- **Timezone determinism**: all time-label formatting in motion-core uses **UTC** so unit tests and pixel goldens are machine-independent.
- **Test runner**: vitest. Run a single package's tests with `pnpm --filter @rtc/<pkg> test`, a single file with `pnpm --filter @rtc/<pkg> exec vitest run <path>`.
- **Local gate mirror**: `/rtc:gauntlet` (fast) after each task, `/rtc:gauntlet full` once per phase before the PR.

## Phase structure (3 PRs)

The spec's §6 originally sketched 4 PRs (React UI and Solid parity separate). That split cannot ship green: `@rtc/ui-contract` specs execute against **both** clients in CI and the visual goldens are react-rendered/solid-asserted, so any PR adding shared specs or scenarios for components only one client has reds the other client's gates. Phases:

- **Phase A (PR 1)** — Data layer: `Candle.volume`, history 60→300 via prepend, byte-identity pin, fixture sweep.
- **Phase B (PR 2)** — Interaction core: `chartViewport`, extended `chartVm` + `volumeVm`, `crosshairVm`, `indicatorSeries` in motion-core (pure library, no UI).
- **Phase C (PR 3)** — Web UI: machine fields, React shell + components, Solid port, shared contract specs, visual scenarios + goldens, e2e smoke, architecture doc note.

Tasks within a phase that touch disjoint files may be parallelized across subagents (accelerated-SDD regime); the phase's gauntlet + review run once at the end.

---

## Phase A — Data layer (PR 1)

### Task A1: Pin the current 1D series BEFORE any change

**Files:**
- Create: `packages/domain/src/simulators/EquityMarketDataSimulator.pin.test.ts`

**Interfaces:**
- Produces: `__snapshots__/EquityMarketDataSimulator.pin.test.ts.snap` — the OHLC pin that Task A3 must keep green.

The simulator's series depends on `Date.now()` (bucket times) and the live price (anchoring scale) — pin both: fake timers at a fixed epoch, a fresh simulator (price === open ⇒ scale factor 1 for the final anchoring).

- [ ] **Step 1: Write the pin test (it must PASS immediately — it pins today's behaviour)**

```ts
import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";

// 2026-07-01T00:00:00Z — any fixed instant works; never change it, the
// snapshot is keyed to it.
const FIXED_NOW = 1_782_864_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EquityMarketDataSimulator 1D OHLC pin", () => {
  // Deepening the history (Task A3) must PREPEND older candles only: the
  // newest 60 candles' OHLC values are pinned here byte-for-byte. The
  // snapshot projects OHLC only, so adding `volume` (Task A2) doesn't
  // invalidate it.
  it("keeps the newest 60 1D candles byte-identical", async () => {
    const sim = new EquityMarketDataSimulator();
    const series = await firstValueFrom(sim.candles("AAPL", "1D"));
    const newest60 = series.slice(-60).map((c) => {
      return {
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      };
    });

    expect(newest60).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run it — expect PASS, snapshot written**

Run: `pnpm --filter @rtc/domain exec vitest run src/simulators/EquityMarketDataSimulator.pin.test.ts`
Expected: PASS, `1 snapshot written`.

- [ ] **Step 3: Commit (snapshot file included)**

```bash
git add packages/domain/src/simulators/EquityMarketDataSimulator.pin.test.ts packages/domain/src/simulators/__snapshots__/
git commit -m "test(domain): pin the newest-60 1D OHLC series ahead of history deepening"
```

### Task A2: `Candle.volume` + deterministic volume generation

**Files:**
- Modify: `packages/domain/src/equities/candle.ts`
- Modify: `packages/domain/src/simulators/gbm.ts` (aggregateCandle emits `volume: 0`)
- Modify: `packages/domain/src/simulators/EquityMarketDataSimulator.ts`
- Create: `packages/domain/src/simulators/EquityMarketDataSimulator.volume.test.ts`
- Modify (fixture sweep): every file constructing a `Candle` literal — find them all with
  `grep -rln --include="*.ts" --include="*.tsx" "close:" packages/ | xargs grep -ln "open:"`
  (known: `packages/ui-contract/src/specs/equities/chart/*.contract.spec.ts`, `packages/ui-contract/src/visual/fixtures.ts` (~line 1432, the 40 hand-crafted AAPL candles), `packages/domain/src/simulators/*.test.ts`, any RN/client fixtures the grep surfaces)

**Interfaces:**
- Produces: `Candle` gains `readonly volume: number` (shares, plausible magnitude ~10⁶). `aggregateCandle` keeps its signature, emits `volume: 0` (callers own volume). Simulator constants: `BASE_VOLUME = 1_000_000`, `VOLUME_SEED_OFFSET = 9973`.

- [ ] **Step 1: Write the failing volume test**

```ts
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";

describe("EquityMarketDataSimulator candle volume", () => {
  it("emits a positive integer volume on every candle", async () => {
    const sim = new EquityMarketDataSimulator();
    const series = await firstValueFrom(sim.candles("AAPL", "1D"));

    expect(series.length).toBeGreaterThan(0);
    for (const c of series) {
      expect(Number.isInteger(c.volume)).toBe(true);
      expect(c.volume).toBeGreaterThan(0);
    }
  });

  it("is deterministic per symbol+timeframe and differs across symbols", async () => {
    const a1 = await firstValueFrom(
      new EquityMarketDataSimulator().candles("AAPL", "1D"),
    );
    const a2 = await firstValueFrom(
      new EquityMarketDataSimulator().candles("AAPL", "1D"),
    );
    const m = await firstValueFrom(
      new EquityMarketDataSimulator().candles("MSFT", "1D"),
    );

    expect(a1.map((c) => c.volume)).toEqual(a2.map((c) => c.volume));
    expect(a1.map((c) => c.volume)).not.toEqual(m.map((c) => c.volume));
  });
});
```

- [ ] **Step 2: Run to verify it fails** (`volume` doesn't exist → type error)

Run: `pnpm --filter @rtc/domain exec vitest run src/simulators/EquityMarketDataSimulator.volume.test.ts`
Expected: FAIL (TS: Property 'volume' does not exist on type 'Candle').

- [ ] **Step 3: Implement**

`candle.ts`:

```ts
export interface Candle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** Traded shares in the bucket. Simulator-generated deterministically;
   * price-independent (survives the series' live-price anchoring rescale). */
  readonly volume: number;
}
```

`gbm.ts` — both return branches of `aggregateCandle` gain `volume: 0` plus a doc line: "volume is owned by the caller (the simulator assigns per-bucket volume after folding); 0 here is a placeholder, never rendered."

`EquityMarketDataSimulator.ts` — inside `candles()`, after the existing forward loop builds `out`, assign volumes from an rng stream **independent of the price draws** (never interleave — the pin test is the witness):

```ts
const VOLUME_SEED_OFFSET = 9973;
const BASE_VOLUME = 1_000_000;

// after the forward loop, before anchoring:
const volRng = mulberry32(seed + hashString(symbol) + VOLUME_SEED_OFFSET);
const withVolume: Candle[] = out.map((c) => {
  const range = c.close > 0 ? (c.high - c.low) / c.close : 0;
  return {
    ...c,
    volume: Math.round(BASE_VOLUME * (0.4 + volRng()) * (1 + 40 * range)),
  };
});
```

The final anchoring map (`anchored`) then carries `volume: c.volume` through unchanged (volume is share count, not price — the rescale must not touch it).

- [ ] **Step 4: Sweep every `Candle` literal in the repo** — run the grep above; add a plausible `volume` to each fixture. For hand-crafted visual fixtures use a deterministic formula so the volume pane golden is stable, e.g. `volume: 800_000 + i * 25_000` per index; for contract-spec fixtures any literal (e.g. `1_200_000`) is fine.

- [ ] **Step 5: Verify: domain tests (incl. the A1 pin — MUST still pass), then whole-repo typecheck**

Run: `pnpm --filter @rtc/domain test` then `pnpm typecheck`
Expected: all green — typecheck failures point at fixture files the sweep missed; fix each.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(domain): Candle gains deterministic volume; fixture sweep repo-wide"
```

### Task A3: Deepen history 60→300 by prepending a backwards walk

**Files:**
- Modify: `packages/domain/src/equities/timeframe.ts`
- Modify: `packages/domain/src/simulators/EquityMarketDataSimulator.ts`
- Modify: `packages/domain/src/index.ts` (export the new constants — mirror how `CANDLE_TIMEFRAMES` is exported)
- Create: `packages/domain/src/simulators/EquityMarketDataSimulator.deepHistory.test.ts`

**Interfaces:**
- Produces (consumed by Phase C's shells):
  - `CANDLE_HISTORY_TOTAL = 300` (exported from `timeframe.ts`) — total generated per timeframe.
  - `CANDLE_DEFAULT_VISIBLE: Readonly<Record<CandleTimeframe, number>> = { "1D": 60, "1W": 44, "1M": 48, "3M": 52 }` (exported from `timeframe.ts`) — the default-viewport size = each timeframe's pre-deepening count, so the default view still spans the named period.
  - Simulator: `TF_CONFIG[tf].count` stays the *named-period* count; generation emits `CANDLE_HISTORY_TOTAL` candles, newest `count` identical to today.

- [ ] **Step 1: Write the failing tests**

```ts
import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CANDLE_DEFAULT_VISIBLE,
  CANDLE_HISTORY_TOTAL,
  CANDLE_TIMEFRAMES,
} from "../equities/timeframe.js";
import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";

const FIXED_NOW = 1_782_864_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("deep candle history", () => {
  it("emits CANDLE_HISTORY_TOTAL candles for every timeframe", async () => {
    const sim = new EquityMarketDataSimulator();

    for (const tf of CANDLE_TIMEFRAMES) {
      const series = await firstValueFrom(sim.candles("AAPL", tf));
      expect(series).toHaveLength(CANDLE_HISTORY_TOTAL);
    }
  });

  it("times ascend strictly with no seam gap or duplicate at the prepend joint", async () => {
    const sim = new EquityMarketDataSimulator();
    const series = await firstValueFrom(sim.candles("AAPL", "1D"));

    for (let i = 1; i < series.length; i++) {
      expect(series[i].time).toBeGreaterThan(series[i - 1].time);
    }
  });

  it("keeps prices continuous across the prepend seam (no cliff)", async () => {
    const sim = new EquityMarketDataSimulator();
    const series = await firstValueFrom(sim.candles("AAPL", "1D"));
    const seamLeft = series[CANDLE_HISTORY_TOTAL - 60 - 1];
    const seamRight = series[CANDLE_HISTORY_TOTAL - 60];
    const jump = Math.abs(seamRight.open - seamLeft.close) / seamLeft.close;

    // One substep's max move is 2*vol; allow a few substeps of slack.
    expect(jump).toBeLessThan(0.05);
  });

  it("default-visible counts match the pre-deepening series lengths", () => {
    expect(CANDLE_DEFAULT_VISIBLE).toEqual({
      "1D": 60,
      "1W": 44,
      "1M": 48,
      "3M": 52,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure** (imports don't exist / length is 60)

Run: `pnpm --filter @rtc/domain exec vitest run src/simulators/EquityMarketDataSimulator.deepHistory.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`timeframe.ts` additions:

```ts
/** Total candles generated per timeframe — the pan/zoom history depth. The
 * newest CANDLE_DEFAULT_VISIBLE[tf] of these are byte-identical to the
 * pre-deepening series (older candles are PREPENDED from an independent
 * seeded walk; see EquityMarketDataSimulator). */
export const CANDLE_HISTORY_TOTAL = 300;

/** Default chart-viewport size per timeframe = the pre-deepening candle
 * count, so the default view still spans the named period. */
export const CANDLE_DEFAULT_VISIBLE: Readonly<Record<CandleTimeframe, number>> =
  {
    "1D": 60,
    "1W": 44,
    "1M": 48,
    "3M": 52,
  };
```

`EquityMarketDataSimulator.ts` — inside `candles()`, after `withVolume` is built (Task A2) and **before** the anchoring rescale, prepend `CANDLE_HISTORY_TOTAL - count` older candles from a *separate* rng (`BACK_SEED_OFFSET = 4241`), walking the same substep shape into the past and rescaling the back-block so its final close meets the forward walk's start (`s.open`) — the same anchoring trick the series already uses at its live end:

```ts
const BACK_SEED_OFFSET = 4241;

const backCount = CANDLE_HISTORY_TOTAL - count;
const rngBack = mulberry32(seed + hashString(symbol) + BACK_SEED_OFFSET);
const volRngBack = mulberry32(
  seed + hashString(symbol) + BACK_SEED_OFFSET + VOLUME_SEED_OFFSET,
);
let backPrice = s.open;
const back: Candle[] = [];

// i counts buckets back from "now": the forward walk owns [count-1 .. 0],
// the back walk owns [CANDLE_HISTORY_TOTAL-1 .. count] (older).
for (let i = CANDLE_HISTORY_TOTAL - 1; i >= count; i--) {
  const bucketTime = Math.floor((now - i * bucketMs) / bucketMs) * bucketMs;
  let candle: Candle | null = null;

  for (let sub = 0; sub < CANDLE_SUBSTEPS; sub++) {
    backPrice = gbmStep(backPrice, rngBack(), substepVol);
    candle = aggregateCandle(candle, backPrice, bucketTime, bucketMs);
  }

  const built = candle as Candle;
  const range = built.close > 0 ? (built.high - built.low) / built.close : 0;
  back.push({
    ...built,
    volume: Math.round(BASE_VOLUME * (0.4 + volRngBack()) * (1 + 40 * range)),
  });
}

// Seam continuity: rescale the back block so its final close === s.open,
// the price the forward walk stepped away from.
const backEndClose = back.at(-1)?.close;
const backScale = backEndClose ? s.open / backEndClose : 1;
const backAnchored = back.map((c) => {
  return {
    time: c.time,
    open: c.open * backScale,
    high: c.high * backScale,
    low: c.low * backScale,
    close: c.close * backScale,
    volume: c.volume,
  };
});

const full = [...backAnchored, ...withVolume];
```

The existing final anchoring (`scale = s.price / rawEndClose`) then maps over `full` instead of `out` — its `rawEndClose` is unchanged (the forward walk's last close), so the newest-60 slice rescales exactly as before.

- [ ] **Step 4: Run ALL domain tests — the A1 pin is the critical one**

Run: `pnpm --filter @rtc/domain test`
Expected: PASS, including `EquityMarketDataSimulator.pin.test.ts` (proves prepend-only) and the pre-existing timeframe/determinism suites (they assert shape/determinism, not length — if one hardcodes 60/44/48/52 as the FULL length, update it to slice the newest window, and say so in the commit message).

- [ ] **Step 5: Whole-repo check + phase gauntlet**

Run: `pnpm typecheck && pnpm test`, then `/rtc:gauntlet full`
Expected: green. `CandleSeriesPresenter`, the server effect and the wire need no code change (domain objects flow through); their tests prove it.

- [ ] **Step 6: Commit, PR, CI loop, merge (shipping-repo-changes)**

```bash
git add -A
git commit -m "feat(domain): deepen candle history to 300 via prepended backwards walk"
```

---

## Phase B — Interaction core in `@rtc/motion-core` (PR 2)

All files in `packages/motion-core/src/`; every new export added to `packages/motion-core/src/index.ts` (mirror the existing export lines). No DOM, no framework, no deps. Tasks B1–B4 are file-disjoint and parallelizable, except B2 consumes B1's types (run B1 first or share its interface block).

### Task B1: `chartViewport.ts` — the zoom/pan fold

**Files:**
- Create: `packages/motion-core/src/chartViewport.ts`
- Create: `packages/motion-core/src/chartViewport.test.ts`
- Modify: `packages/motion-core/src/index.ts`

**Interfaces (produced — Phase C shells and B2 consume exactly these):**

```ts
export interface ChartViewport {
  /** Fractional candle indices into the series; 0 ≤ start < end ≤ seriesLen. */
  readonly start: number;
  readonly end: number;
}
export const MIN_VIEWPORT_SPAN = 5;
export function defaultViewport(seriesLen: number, visible: number): ChartViewport;
export function clampViewport(vp: ChartViewport, seriesLen: number): ChartViewport;
export function zoomAt(vp: ChartViewport, anchorFrac: number, factor: number, seriesLen: number): ChartViewport;
export function panBy(vp: ChartViewport, dCandles: number, seriesLen: number): ChartViewport;
export function isAtLiveEdge(vp: ChartViewport, seriesLen: number): boolean;
export function followLive(vp: ChartViewport, prevLen: number, newLen: number): ChartViewport;
```

- [ ] **Step 1: Write the failing tests** — cover at minimum:

```ts
import { describe, expect, it } from "vitest";

import {
  clampViewport,
  defaultViewport,
  followLive,
  isAtLiveEdge,
  MIN_VIEWPORT_SPAN,
  panBy,
  zoomAt,
} from "./chartViewport";

describe("defaultViewport", () => {
  it("shows the newest `visible` candles", () => {
    expect(defaultViewport(300, 60)).toEqual({ start: 240, end: 300 });
  });

  it("shows everything when the series is shorter than `visible`", () => {
    expect(defaultViewport(40, 60)).toEqual({ start: 0, end: 40 });
  });
});

describe("zoomAt", () => {
  it("keeps the candle under the anchor stationary", () => {
    const vp = { start: 100, end: 200 };
    // anchor at 25% of the window = candle index 125
    const zoomed = zoomAt(vp, 0.25, 0.5, 300);
    const anchorIdx = zoomed.start + 0.25 * (zoomed.end - zoomed.start);

    expect(anchorIdx).toBeCloseTo(125, 6);
    expect(zoomed.end - zoomed.start).toBeCloseTo(50, 6);
  });

  it("never zooms below MIN_VIEWPORT_SPAN nor beyond the full series", () => {
    const tiny = zoomAt({ start: 0, end: MIN_VIEWPORT_SPAN }, 0.5, 0.01, 300);
    expect(tiny.end - tiny.start).toBeCloseTo(MIN_VIEWPORT_SPAN, 6);

    const huge = zoomAt({ start: 100, end: 200 }, 0.5, 100, 300);
    expect(huge).toEqual({ start: 0, end: 300 });
  });
});

describe("panBy", () => {
  it("shifts the window and clamps at the left wall preserving span", () => {
    expect(panBy({ start: 10, end: 70 }, -30, 300)).toEqual({
      start: 0,
      end: 60,
    });
  });

  it("clamps at the live edge preserving span", () => {
    expect(panBy({ start: 200, end: 260 }, 100, 300)).toEqual({
      start: 240,
      end: 300,
    });
  });
});

describe("live edge", () => {
  it("isAtLiveEdge is true only when end reaches the series end", () => {
    expect(isAtLiveEdge({ start: 240, end: 300 }, 300)).toBe(true);
    expect(isAtLiveEdge({ start: 100, end: 160 }, 300)).toBe(false);
  });

  it("followLive slides an at-edge window and freezes a panned-away one", () => {
    expect(followLive({ start: 240, end: 300 }, 300, 301)).toEqual({
      start: 241,
      end: 301,
    });
    expect(followLive({ start: 100, end: 160 }, 300, 301)).toEqual({
      start: 100,
      end: 160,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/motion-core exec vitest run src/chartViewport.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
export interface ChartViewport {
  readonly start: number;
  readonly end: number;
}

/** Zoom-in floor, in candles. */
export const MIN_VIEWPORT_SPAN = 5;

/** Live-edge tolerance: within half a candle of the newest bar counts as
 * "at the edge" (fractional viewports from zoom math never land exactly). */
const EDGE_EPS = 0.5;

export function defaultViewport(
  seriesLen: number,
  visible: number,
): ChartViewport {
  return { start: Math.max(0, seriesLen - visible), end: seriesLen };
}

export function clampViewport(
  vp: ChartViewport,
  seriesLen: number,
): ChartViewport {
  const span = Math.min(
    Math.max(vp.end - vp.start, MIN_VIEWPORT_SPAN),
    seriesLen,
  );
  let start = vp.start;

  if (start < 0) {
    start = 0;
  }

  if (start + span > seriesLen) {
    start = seriesLen - span;
  }

  return { start, end: start + span };
}

export function zoomAt(
  vp: ChartViewport,
  anchorFrac: number,
  factor: number,
  seriesLen: number,
): ChartViewport {
  const span = vp.end - vp.start;
  const newSpan = span * factor;
  const anchorIdx = vp.start + anchorFrac * span;
  const start = anchorIdx - anchorFrac * newSpan;
  return clampViewport({ start, end: start + newSpan }, seriesLen);
}

export function panBy(
  vp: ChartViewport,
  dCandles: number,
  seriesLen: number,
): ChartViewport {
  return clampViewport(
    { start: vp.start + dCandles, end: vp.end + dCandles },
    seriesLen,
  );
}

export function isAtLiveEdge(vp: ChartViewport, seriesLen: number): boolean {
  return vp.end >= seriesLen - EDGE_EPS;
}

/** New bars arrived (prevLen → newLen): an at-edge window slides with them;
 * a panned-away window holds still (the UI shows "back to live" instead). */
export function followLive(
  vp: ChartViewport,
  prevLen: number,
  newLen: number,
): ChartViewport {
  if (!isAtLiveEdge(vp, prevLen)) {
    return vp;
  }

  const d = newLen - prevLen;
  return { start: vp.start + d, end: vp.end + d };
}
```

- [ ] **Step 4: Run tests** → PASS. Export everything from `index.ts`.
- [ ] **Step 5: Commit** — `feat(motion-core): chartViewport pure zoom/pan fold`

### Task B2: extend `chartVm` — viewport slicing, chart kinds, time axis, volume vm

**Files:**
- Modify: `packages/motion-core/src/chartVm.ts`
- Modify/extend: `packages/motion-core/src/chartVm.test.ts` (create if absent — check first)
- Modify: `packages/motion-core/src/index.ts`

**Interfaces (produced):**

```ts
export type ChartKind = "candles" | "line" | "area";
export interface ChartPoint { readonly x: number; readonly y: number; }          // percent coords, 0–100
export interface TimeLabelVm { readonly key: number; readonly txt: string; readonly style: ChartVarStyle; } // style: {"--tx": "<x>%"}
export interface ChartScale { readonly cmin: number; readonly cmax: number; }    // visible-slice price range (post live-overlay)
export interface ChartVmOptions {
  readonly viewport?: ChartViewport;   // default: whole series (back-compat)
  readonly kind?: ChartKind;           // default "candles"
}
// extended result — existing fields unchanged:
export interface ChartVm {
  candles: readonly CandleVm[];        // EMPTY when kind !== "candles"
  grid: readonly GridLineVm[];
  labels: readonly PriceLabelVm[];
  linePoints: readonly ChartPoint[];   // close-price polyline, EMPTY when kind === "candles"
  timeLabels: readonly TimeLabelVm[];
  scale: ChartScale;
}
export function chartVm(series: readonly ChartCandle[], liveRate: number, flashOn: boolean, opts?: ChartVmOptions): ChartVm;

export interface VolumeBarVm { readonly key: number; readonly up: boolean; readonly style: ChartVarStyle; } // {"--x","--w","--h"} (h in % of the volume pane)
export function volumeVm(series: readonly ChartCandle[], viewport?: ChartViewport): readonly VolumeBarVm[];
```

Notes pinned by the spec:
- `ChartCandle` (the structural domain stand-in) gains `readonly time: number` and `readonly volume: number` — domain `Candle` still satisfies it.
- Slicing: `iFirst = Math.floor(vp.start)`, `iLast = Math.ceil(vp.end) - 1`; per-candle x maps through the viewport: `x = ((i + 0.5 - vp.start) / (vp.end - vp.start)) * 100` — edge candles land partially outside [0,100] and render clipped (the plot container gets `overflow: hidden` in Phase C).
- Y auto-fit over the **visible slice only**; the live-last overlay applies only when the last series candle is inside the slice.
- `linePoints` are the visible candles' closes (live-overlaid last close included when visible): `{ x, y: yPct(close) }`. The area fill is the same polyline — the SVG shell closes the polygon down to y=100, so no separate vm field.
- `timeLabels`: pick ticks at "nice" intervals — target ~4–6 labels: `stepCandles = ceil(span / 5)` rounded up to the nearest of {1, 2, 5, 10, 15, 30, 60, 120}; label candles whose index ≡ 0 (mod step) relative to the series (stable while panning: `i % step === 0`, NOT relative to the window). Format **UTC**: bucket spans < 24h → `"HH:MM"`; ≥ 24h → `"DD MMM"` (e.g. `"14 JUL"`, month from a const 3-letter array, upper-case). Bucket span = `series[1].time - series[0].time` (guard length < 2 → no labels).
- `volumeVm`: same slicing/x math; bar height = `(volume / maxVisibleVolume) * 100`, `up` from close ≥ open.

- [ ] **Step 1: Write failing tests** — minimum set:

```ts
// in chartVm.test.ts (extend if the file exists)
const SERIES = Array.from({ length: 300 }, (_, i) => {
  return {
    time: 1_782_864_000_000 + i * 60_000,
    open: 100 + Math.sin(i / 7) * 5,
    high: 102 + Math.sin(i / 7) * 5,
    low: 98 + Math.sin(i / 7) * 5,
    close: 101 + Math.sin(i / 7) * 5,
    volume: 800_000 + i * 1_000,
  };
});

it("renders only the viewport slice", () => {
  const vm = chartVm(SERIES, 0, false, {
    viewport: { start: 240, end: 300 },
  });
  expect(vm.candles.length).toBeGreaterThanOrEqual(60);
  expect(vm.candles.length).toBeLessThanOrEqual(62); // + clipped edges
});

it("defaults to the whole series and candles kind (back-compat)", () => {
  const vm = chartVm(SERIES, 0, false);
  expect(vm.candles).toHaveLength(300);
  expect(vm.linePoints).toHaveLength(0);
});

it("Y-fits the visible slice, not the whole series", () => {
  // craft a series with a huge spike OUTSIDE the viewport; the visible
  // candles' --top values must span most of the plot, proving the spike
  // didn't compress the scale. Assert via vm.scale.
  const spiked = SERIES.map((c, i) => {
    return i === 0 ? { ...c, high: 10_000 } : c;
  });
  const vm = chartVm(spiked, 0, false, { viewport: { start: 240, end: 300 } });
  expect(vm.scale.cmax).toBeLessThan(200);
});

it("applies the live overlay only when the last candle is visible", () => {
  const away = chartVm(SERIES, 9_999, false, {
    viewport: { start: 0, end: 60 },
  });
  expect(away.scale.cmax).toBeLessThan(200);
});

it("emits linePoints for kind line/area and no candles", () => {
  const vm = chartVm(SERIES, 0, false, {
    viewport: { start: 240, end: 300 },
    kind: "line",
  });
  expect(vm.candles).toHaveLength(0);
  expect(vm.linePoints.length).toBeGreaterThanOrEqual(60);
  for (const p of vm.linePoints) {
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(100);
  }
});

it("time labels are stable under panning (keyed to series indices)", () => {
  const a = chartVm(SERIES, 0, false, { viewport: { start: 240, end: 300 } });
  const b = chartVm(SERIES, 0, false, { viewport: { start: 239, end: 299 } });
  const aKeys = a.timeLabels.map((l) => l.key);
  const bKeys = b.timeLabels.map((l) => l.key);
  expect(aKeys.filter((k) => bKeys.includes(k)).length).toBeGreaterThan(0);
});

it("formats intraday ticks HH:MM UTC and daily ticks DD MMM", () => {
  const vm = chartVm(SERIES, 0, false, { viewport: { start: 240, end: 300 } });
  expect(vm.timeLabels[0].txt).toMatch(/^\d{2}:\d{2}$/);

  const daily = SERIES.map((c, i) => {
    return { ...c, time: 1_782_864_000_000 + i * 86_400_000 };
  });
  const dvm = chartVm(daily, 0, false, { viewport: { start: 240, end: 300 } });
  expect(dvm.timeLabels[0].txt).toMatch(/^\d{2} [A-Z]{3}$/);
});

it("volumeVm scales bars to the visible max", () => {
  const bars = volumeVm(SERIES, { start: 240, end: 300 });
  const hs = bars.map((b) => Number.parseFloat(b.style["--h"] as string));
  expect(Math.max(...hs)).toBeCloseTo(100, 1);
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @rtc/motion-core exec vitest run src/chartVm.test.ts`
- [ ] **Step 3: Implement** per the interface + notes above. Keep the existing exports and every existing behaviour when `opts` is omitted — the pre-existing chartVm tests (if any) and both clients' current call sites must not change. Structure: extract the current per-candle mapping into a helper that takes `(cd, i, vp)` and computes viewport-relative x; `yPct` becomes range-parameterised.
- [ ] **Step 4: Run the whole motion-core suite** → PASS.
- [ ] **Step 5: Commit** — `feat(motion-core): viewport-aware chartVm with kinds, time axis, volume vm`

### Task B3: `crosshairVm.ts`

**Files:**
- Create: `packages/motion-core/src/crosshairVm.ts`, `packages/motion-core/src/crosshairVm.test.ts`
- Modify: `packages/motion-core/src/index.ts`

**Interfaces (produced):**

```ts
export interface CrosshairVm {
  readonly idx: number;                       // snapped series index
  readonly style: ChartVarStyle;              // {"--chx": "<x>%", "--chy": "<y>%"}
  readonly price: string;                     // y-under-cursor, 2dp
  readonly readout: {
    readonly time: string;                    // same UTC format rules as chartVm timeLabels
    readonly open: string; readonly high: string;
    readonly low: string; readonly close: string;
    readonly volume: string;                  // compact: "1.2M" / "845K"
  };
}
export function crosshairVm(
  xFrac: number, yFrac: number,               // pointer position, 0–1 within the plot
  series: readonly ChartCandle[],
  viewport: ChartViewport,
  scale: ChartScale,                          // from chartVm's result
): CrosshairVm | null;                        // null when series empty
```

Behaviour to test and implement: snap `idx = clamp(round(vp.start + xFrac * span - 0.5), 0, len-1)`; the vertical line x snaps to the candle centre `((idx + 0.5 - vp.start)/span)*100`, horizontal y = `yFrac*100`; `price` inverts the same y mapping chartVm uses (`cmax - (yPct - Y_TOP)/Y_SPAN * (cmax - cmin)` with the shared Y_TOP=6/Y_SPAN=86 constants — export them from chartVm.ts instead of duplicating); volume compaction: ≥1e6 → `(v/1e6).toFixed(1)+"M"`, ≥1e3 → `(v/1e3).toFixed(0)+"K"`, else integer.

- [ ] **Step 1: failing tests** — snap-to-centre at xFrac dead-centre of a candle; clamp at both edges (xFrac 0 and 1 on a part-scrolled viewport never index outside the series); price inversion round-trips a known y; volume "1.2M"/"845K"/"12" formats; `null` on empty series.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(motion-core): crosshairVm snap + readout`

### Task B4: `indicatorSeries.ts` — SMA / EMA

**Files:**
- Create: `packages/motion-core/src/indicatorSeries.ts`, `packages/motion-core/src/indicatorSeries.test.ts`
- Modify: `packages/motion-core/src/index.ts`

**Interfaces (produced):**

```ts
export type IndicatorId = "sma20" | "ema50";
export const INDICATOR_DEFS: Readonly<Record<IndicatorId, { readonly kind: "sma" | "ema"; readonly window: number }>> =
  { sma20: { kind: "sma", window: 20 }, ema50: { kind: "ema", window: 50 } };
export function indicatorValues(closes: readonly number[], id: IndicatorId): readonly (number | null)[];
export function indicatorPoints(
  values: readonly (number | null)[],
  viewport: ChartViewport,
  scale: ChartScale,
): readonly ChartPoint[];   // viewport-relative, skips null warm-up, same x/y mapping as chartVm
```

SMA: null for the first `window-1` indices, then rolling mean. EMA: seeded with the SMA of the first `window` closes at index `window-1`, then `ema = close * k + prev * (1 - k)`, `k = 2/(window+1)` — null before the seed index. `indicatorPoints` maps only indices intersecting `[floor(start), ceil(end)-1]` whose value is non-null.

- [ ] **Step 1: failing tests** — SMA of a constant series is that constant from index 19; SMA window arithmetic on a known ramp (`closes = [1..25]` → sma20[19] = 10.5, sma20[24] = 15.5); EMA seed equals SMA at index `window-1`; k-weighting on a hand-computed 3-value tail; warm-up nulls produce no points; points' y uses the passed scale.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.** Then whole package: `pnpm --filter @rtc/motion-core test`, `/rtc:gauntlet full`.
- [ ] **Step 5: Commit; PR; CI loop; merge** — `feat(motion-core): SMA/EMA indicator series`

---

## Phase C — Web UI, both clients + shared tests (PR 3)

Order inside the phase: C1 → C2 → C3 in sequence (C3 mirrors C2's final shape); C4–C6 after C3; C7 last. **Do not add shared specs/scenarios before both clients render the components.**

### Task C1: `EqWorkspaceMachine` — chartType + indicators

**Files:**
- Modify: `packages/client-core/src/presenters/EqWorkspaceMachine.ts`
- Modify: `packages/client-core/src/presenters/EqWorkspaceMachine.test.ts` (extend the existing suite)
- Modify: `packages/react-bindings/src/createViewModel.ts` (the `useEqWorkspace` return: expose the new intents alongside `setTimeframe` — follow `selectEqSymbol`/`setTimeframe`'s stable-callback pattern, lines ~654–680)
- Modify: `packages/solid-bindings/src/createViewModel.ts` (same, mirroring its existing structure)
- Modify: the bindings' existing eqWorkspace tests (extend)

**Interfaces (produced):**

```ts
// client-core (do NOT import motion-core here — declare the unions locally;
// they unify structurally with motion-core's ChartKind/IndicatorId):
export type EqChartType = "candles" | "line" | "area";
export type EqIndicatorId = "sma20" | "ema50";

export interface EqWorkspaceState {
  readonly sel: string;
  readonly openTabs: readonly string[];
  readonly timeframe: CandleTimeframe;
  readonly chartType: EqChartType;                 // initial "candles"
  readonly indicators: readonly EqIndicatorId[];   // initial []
}
export interface EqWorkspaceIntents {
  // …existing…
  setChartType(kind: EqChartType): void;
  toggleIndicator(id: EqIndicatorId): void;        // add if absent, remove if present
}
```

- [ ] **Step 1: failing machine tests** — initial state carries `chartType: "candles"`, `indicators: []`; `setChartType("area")` patches; `toggleIndicator("sma20")` twice adds then removes; both survive interleaved `select`/`setTimeframe` patches.
- [ ] **Step 2: Run → FAIL.** `pnpm --filter @rtc/client-core exec vitest run src/presenters/EqWorkspaceMachine.test.ts`
- [ ] **Step 3: Implement** — two new Subjects + patch streams merged into the existing `merge(...)`, following `setTimeframePatch$` verbatim; intents + `complete()` in dispose.
- [ ] **Step 4: Extend both bindings** — expose `setChartType`/`toggleIndicator` from `useEqWorkspace()` next to `setTimeframe`; extend each binding's existing eqWorkspace test to assert the functions exist and dispatch (mirror how `setTimeframe` is asserted today).
- [ ] **Step 5: Run** client-core + both bindings' suites → PASS.
- [ ] **Step 6: Commit** — `feat(client-core): eq workspace chartType + indicator toggles`

### Task C2: React shell — gestures, components, wiring, controls

**Files:**
- Create in `packages/client-react/src/ui/equities/chart/`:
  `useChartGestures.ts`, `useChartGestures.test.ts` (renderHook-level, jsdom),
  `SvgPathLayer.tsx` + `SvgPathLayer.module.css`,
  `CrosshairOverlay.tsx` + `CrosshairOverlay.module.css`,
  `TimeAxis.tsx` + `TimeAxis.module.css`,
  `VolumePane.tsx` + `VolumePane.module.css`,
  `BackToLiveButton.tsx` + `BackToLiveButton.module.css`,
  `ChartTypePills.tsx`, `IndicatorPills.tsx` (styled like `TimeframePills` — reuse its module-css shape)
- Modify: `ChartPanel.tsx`, `CandleChart.tsx`, `CandleChart.module.css` (plot gets `overflow: hidden`, `position: relative`, focus styles), `EqChartHead.tsx`

**Interfaces:**
- Consumes: everything Phase B exported; `CANDLE_DEFAULT_VISIBLE` from `@rtc/domain`; `useEqWorkspace` extensions from C1.
- Produces — **test hooks (shared with Solid, the contract/visual/e2e tiers key on these exact strings)**:
  - plot wrapper: `data-testid="chart-plot"`, `tabIndex={0}`, `role="application"`, `aria-label="Price chart"`
  - crosshair: `chart-crosshair-v`, `chart-crosshair-h`, `chart-crosshair-readout`
  - axis label: `chart-time-label`; volume bar: `chart-volume-bar`
  - back-to-live: `chart-back-to-live`
  - SVG paths: `chart-path-line`, `chart-path-area`, `chart-indicator-path` (+ `data-ind="sma20"|"ema50"`)
  - pills: `chart-type-pill` + `data-kind`, `chart-indicator-pill` + `data-ind`, both with `data-active`

**`useChartGestures` contract** (the only stateful unit; keep it ~this size):

```ts
export interface ChartGestures {
  readonly viewport: ChartViewport;
  readonly cursor: { readonly xFrac: number; readonly yFrac: number } | null;
  readonly atLiveEdge: boolean;
  readonly plotProps: {
    readonly onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    readonly onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    readonly onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    readonly onPointerLeave: () => void;
    readonly onDoubleClick: () => void;
    readonly onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  };
  readonly plotRef: React.RefObject<HTMLDivElement | null>; // wheel attaches here, passive:false
  readonly resetToLive: () => void;
}
export function useChartGestures(seriesLen: number, defaultVisible: number): ChartGestures;
```

Implementation rules:
- `viewport` + `cursor` in two `useState` cells; **series-length changes fold in via the render-time adjust pattern** (store `prevLen` in state, compare during render, call `followLive` — copy `useTickFlash`'s documented recipe, no effect); timeframe/symbol switches arrive as a *shrink-or-jump* in `seriesLen`? No — they arrive as a NEW default: ChartPanel keys the hook by remounting (see wiring below), which is the spec's "timeframe switch resets the viewport".
- Wheel: one `useEffect` on `plotRef` — `el.addEventListener("wheel", handler, { passive: false })`, `preventDefault()`, `zoomAt(vp, e.offsetX / el.clientWidth, e.deltaY > 0 ? 1.2 : 1/1.2, seriesLen)`. (React's synthetic `onWheel` registers passively — `preventDefault` there is a console error, hence the ref. Comment this in code.)
- Drag: pointerdown captures (`e.currentTarget.setPointerCapture(e.pointerId)`), caches `getBoundingClientRect()` + start viewport in a ref; move while dragging → `panBy(startVp, -(dxPx / rect.width) * span, seriesLen)`; up releases. Move while NOT dragging → set `cursor` from offset fractions.
- Keys: `ArrowLeft/ArrowRight` → `panBy(vp, ∓span*0.1)`; `+/=` and `-` → `zoomAt(vp, 0.5, 1/1.2 | 1.2)`; `Home` → `{start:0,end:span}` clamped; `End` → `resetToLive()`; all `preventDefault()`.
- `resetToLive` = `defaultViewport(seriesLen, defaultVisible)`.

**ChartPanel wiring:**

```tsx
const defaultVisible = CANDLE_DEFAULT_VISIBLE[timeframe];
// key remounts the gesture state on symbol/timeframe change = viewport reset
<CandleChart key={`${sel}|${timeframe}`} … />
```

`CandleChart` becomes the interactive plot (it owns the hook — ChartPanel stays a data/join component): props extend to `{ candles, liveRate, flashOn, kind, indicators }`; inside:

```tsx
const g = useChartGestures(candles.length, defaultVisible);
const vm = chartVm(candles, liveRate, flashOn, { viewport: g.viewport, kind });
const cross = g.cursor
  ? crosshairVm(g.cursor.xFrac, g.cursor.yFrac, candles, g.viewport, vm.scale)
  : null;
```

Render order inside the plot div (which spreads `g.plotProps`, `ref={g.plotRef}`): grid → price labels → (`kind === "candles"` ? `<CandleBars candles={vm.candles}/>` : null) → `<SvgPathLayer linePoints={vm.linePoints} kind={kind} indicatorPaths={…}/>` → `<CrosshairOverlay vm={cross}/>` → `{!g.atLiveEdge && <BackToLiveButton onClick={g.resetToLive}/>}`. Below the plot: `<VolumePane bars={volumeVm(candles, g.viewport)}/>` then `<TimeAxis labels={vm.timeLabels}/>`.

**SvgPathLayer** (the one SVG element):

```tsx
<svg
  className={styles.layer}
  viewBox="0 0 100 100"
  preserveAspectRatio="none"
  aria-hidden="true"
>
  <defs>
    <linearGradient id="eqAreaFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" className={styles.gradTop} />
      <stop offset="100%" className={styles.gradBottom} />
    </linearGradient>
  </defs>
  {kind === "area" && linePoints.length > 1 && (
    <path data-testid="chart-path-area" className={styles.area} d={areaD} />
  )}
  {kind !== "candles" && linePoints.length > 1 && (
    <polyline
      data-testid="chart-path-line"
      className={styles.line}
      points={pointsAttr}
    />
  )}
  {indicatorPaths.map((p) => (
    <polyline
      key={p.id}
      data-testid="chart-indicator-path"
      data-ind={p.id}
      className={styles.indicator}
      points={p.pointsAttr}
    />
  ))}
</svg>
```

where `pointsAttr = linePoints.map((p) => `${p.x},${p.y}`).join(" ")` and `areaD = `M ${first.x} 100 L ${polyline points} L ${last.x} 100 Z``, both built inline in the component (shell owns markup strings; vm owns numbers). `vector-effect: non-scaling-stroke` on both stroked elements (non-uniform viewBox scaling would otherwise distort stroke width). Gradient stops via `stop-color: var(--eq-accent)`-style CSS in the module file; indicators get distinct accent custom properties themed by the skin. Nothing here animates.

**CrosshairOverlay**: two absolutely-positioned hairline divs (`left: var(--chx)` / `top: var(--chy)`) + a readout chip pinned top-left of the plot showing `O H L C V` + time strings; whole overlay `pointer-events: none`; renders `null` when `vm` is null.

**EqChartHead**: insert `<ChartTypePills kind={state.chartType} onSet={setChartType}/>` and `<IndicatorPills active={state.indicators} onToggle={toggleIndicator}/>` between `InstrumentTabs` and `TimeframePills`; both are `TimeframePills` clones over `["candles","line","area"]` (labels `CANDLES|LINE|AREA`) and `["sma20","ema50"]` (labels `SMA 20|EMA 50`, independent active states).

- [ ] **Step 1: hook tests first** (`useChartGestures.test.ts`, `renderHook` from `@testing-library/react`): initial viewport = newest `defaultVisible`; keydown ArrowLeft pans left; `+` zooms (span shrinks, still clamped); End/resetToLive restores; series growth while at edge slides the window, while panned away doesn't (rerender with bigger `seriesLen`). Run → FAIL.
- [ ] **Step 2: implement hook** → tests PASS.
- [ ] **Step 3: build the components + wiring** (no new unit tests here — the contract tier in C4 is their test home; keep them dumb).
- [ ] **Step 4: manual smoke** — `pnpm dev`, sign in (`demo`/`mcdc2026`), Equities tab: wheel-zoom anchors under cursor, drag pans, panned-away chart freezes while ticks continue, BACK TO LIVE appears/works, crosshair + readout track, LINE/AREA/gradient render, volume bars + time axis present, SMA/EMA toggle. Check the console for the React-Compiler bailout warning noise — none expected.
- [ ] **Step 5: `pnpm --filter @rtc/client-react test` + `pnpm exec biome ci .`** → green (existing chart contract specs still pass: default kind renders candles exactly as before).
- [ ] **Step 6: Commit** — `feat(client-react): interactive equities chart (zoom/pan/crosshair/kinds/volume/indicators)`

### Task C3: Solid port

**Files:** mirror C2 file-for-file under `packages/client-solid/src/ui/equities/chart/`: `createChartGestures.ts` (+ test), the five components + css modules, `ChartTypePills.tsx`, `IndicatorPills.tsx`; modify `ChartPanel.tsx`, `CandleChart.tsx`, `EqChartHead.tsx`, `CandleChart.module.css`.

**Interfaces:** identical testids/props/behaviour to C2 (the shared specs in C4 are the referee). Port notes:
- `createChartGestures(seriesLen: () => number, defaultVisible: () => number)` — accessors in, `Accessor<…>` out; two `createSignal`s; series-length follow-live via `createComputed` watching `seriesLen()` (Solid's idiom replacing React's render-adjust); wheel via `on:wheel` won't do `passive:false` either — use `onMount` + `addEventListener` on the plot ref, same comment.
- Viewport reset on symbol/timeframe: `<Show keyed when={`${sel()}|${timeframe()}`}>` around the plot (Solid's remount-on-key idiom).
- Copy every `.module.css` verbatim from C2 (the CSS-modules migration precedent: ports are byte-copies).

- [ ] **Step 1: port the primitive + its test** (mirror the React hook test cases in Solid's testing harness — follow `useTickFlash.test.ts` in client-solid for the established pattern). Run → PASS.
- [ ] **Step 2: port components/wiring.**
- [ ] **Step 3: manual smoke** — `pnpm dev:solid` (port 5473), same checklist as C2 Step 4.
- [ ] **Step 4: `pnpm --filter @rtc/client-solid test`** → green.
- [ ] **Step 5: Commit** — `feat(client-solid): interactive equities chart at parity`

### Task C4: shared contract specs (`@rtc/ui-contract`)

**Files:**
- Create: `packages/ui-contract/src/specs/equities/chart/ChartInteraction.contract.spec.ts`, `ChartTypesAndOverlays.contract.spec.ts`
- Modify: the equities chart page-object in the mount harness (find it: `grep -rn "candleCount" packages/ui-contract/src` — extend the same object) with: `pressPlotKey(key: string)` (focus `chart-plot`, dispatch keydown), `candleCount()` (exists), `visibleTestids(id): number` (count by testid), `crosshairReadout(): string | null`, `backToLive(): { visible: boolean; click(): void }`, `clickTestId(id: string)`, `setPointer(xFrac, yFrac)` (dispatch `pointermove` on `chart-plot` with computed client coords from its bounding rect).
- Modify: `packages/ui-contract/src/specs/equities/chart/ChartPanel.contract.spec.ts` — the existing `CANDLES` fixture there gained `volume` in Phase A; extend its fixture series to 300 candles via a small generator so viewport behaviour is observable (keep two hand values asserted).

**Specs to write (keyboard-driven — no synthetic wheel):**

```ts
// ChartInteraction.contract.spec.ts — fixture: 300 generated candles, AAPL
it("defaults to the newest 60 candles for 1D", …)        // candleCount() ~60–62, not 300
it("ArrowLeft pans away from the live edge and reveals BACK TO LIVE", …)
it("BACK TO LIVE returns to the live edge and hides itself", …)
it("'+' zooms in (fewer candles rendered), '-' zooms out, never below 5", …)
it("Home jumps to the oldest window, End back to live", …)
it("pointer move shows the crosshair with the snapped candle's OHLC+V readout", …)
  // setPointer(0.5, 0.5) → chart-crosshair-v/h present, readout matches the
  // fixture's known middle-candle values (assert exact formatted strings)
it("pointer leave hides the crosshair", …)

// ChartTypesAndOverlays.contract.spec.ts
it("chart-type pills switch candles → line → area (path testids swap in/out)", …)
it("area renders the gradient-filled path", …)            // chart-path-area present
it("SMA 20 / EMA 50 pills toggle indicator polylines independently", …)
it("volume pane renders one bar per visible candle, coloured by direction", …)
it("time axis renders UTC labels", …)                     // ≥3 chart-time-label nodes
```

- [ ] **Step 1: write the specs + page-object extensions; run against react** — `pnpm --filter @rtc/client-react test` → PASS.
- [ ] **Step 2: run against solid** — `pnpm --filter @rtc/client-solid test` → PASS (fix Solid-side drift, not the spec).
- [ ] **Step 3: per-file coverage** — `pnpm coverage:gaps`; every new file from B/C1–C3 ≥95% or has a named justification; add targeted specs for stragglers now.
- [ ] **Step 4: Commit** — `test(ui-contract): interaction + chart-type contract specs for the equities chart`

### Task C5: visual scenarios + goldens

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts`, `fixtures.ts`, `appData.ts` (if the fixture needs new appData keys for chartType/indicators — check how `equities-loaded` seeds the workspace; forced states go through wrapper components instead where possible)
- Modify: both clients' visual componentKey registries (find: `grep -rn "EquitiesInstrumentHeader" packages/client-react packages/client-solid --include="*.ts*" -l`) — register the new wrapper keys in BOTH.
- Create per client: `EquitiesChartInteractive.visual.tsx` wrapper components (co-located with each client's existing visual wrappers — same directory the grep surfaces): each mounts the chart plot with **fixed** injected state, no gestures: `{ viewport: {start: 120, end: 180} }` (panned), `{ viewport: {start: 228, end: 252} }` (zoomed), forced `cursor = {xFrac: 0.5, yFrac: 0.4}` (crosshair — the wrapper computes `crosshairVm` directly and renders `CrosshairOverlay`), `kind: "line"`, `kind: "area"`, `indicators: ["sma20","ema50"]`. Follow the forced-`flashOn` `EquitiesInstrumentHeader` wrapper precedent exactly.

**Scenarios to add** (follow the 5-edit recipe from the existing scenario-add flow — scenario entry, fixture, wrapper registration ×2 clients, goldens):

```
"equities/chart-panned":       { componentKey: "EquitiesChartPanned",    fixtureKey: "equities-loaded" }
"equities/chart-zoomed":       { componentKey: "EquitiesChartZoomed",    fixtureKey: "equities-loaded" }
"equities/chart-crosshair":    { componentKey: "EquitiesChartCrosshair", fixtureKey: "equities-loaded" }
"equities/chart-line":         { componentKey: "EquitiesChartLine",      fixtureKey: "equities-loaded" }
"equities/chart-area":         { componentKey: "EquitiesChartArea",      fixtureKey: "equities-loaded" }
"equities/chart-indicators":   { componentKey: "EquitiesChartIndicators",fixtureKey: "equities-loaded" }
"equities/chart-volume-axis":  { componentKey: "EquitiesChartVolumeAxis",fixtureKey: "equities-loaded" }
```

- [ ] **Step 1: add scenarios + wrappers; run the react visual tier locally** (worktree recipe: install + build first, start vite by direct binary path) with `--update-snapshots` to generate the arm64 set; **byte-identical-after-regen is NOT proof** — verify each new golden renders non-empty (open a few PNGs).
- [ ] **Step 2: regen the x86 set** via the emulated linux/amd64 container recipe (byte-identical to CI, proven) — or note in the PR that `update-visual-goldens.yml` must be dispatched post-merge, and rely on `visual.yml` post-merge (it is NOT a PR gate).
- [ ] **Step 3: run the solid visual tier** — asserts against the react-generated goldens → PASS.
- [ ] **Step 4: the `ui (visual reach)` sanity** — every new component file appears in ≥1 scenario (no new 0% rows): run the reach instrument locally if in doubt.
- [ ] **Step 5: Commit** — `test(visual): 7 interactive-chart scenarios + goldens (react renders, solid asserts)`

### Task C6: e2e smoke (Playwright)

**Files:**
- Create: `tests/browser/playwright/equitiesChart.spec.ts`
- Check first: `tests/browser/playwright/fxLiveRates.spec.ts` + `_openWorkspace.ts` for the login/navigation helpers, and `tests/browser/page-objects/` for whether a page-object contract is grep-gated for new specs (if the contracts dir pattern demands a page object, add `EquitiesChartPage` following the shallowest existing example).

**The one lifecycle jsdom can't witness:**

```ts
test("panning away freezes the window; BACK TO LIVE resumes following", async ({ page }) => {
  await openEquitiesWorkspace(page);            // via _openWorkspace helpers
  const plot = page.getByTestId("chart-plot");
  await plot.click();                           // focus
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("chart-back-to-live")).toBeVisible();
  const labelsBefore = await page.getByTestId("chart-time-label").allTextContents();
  await page.waitForTimeout(1500);              // live ticks continue
  const labelsAfter = await page.getByTestId("chart-time-label").allTextContents();
  expect(labelsAfter).toEqual(labelsBefore);    // frozen while panned away
  await page.getByTestId("chart-back-to-live").click();
  await expect(page.getByTestId("chart-back-to-live")).toBeHidden();
});
```

- [ ] **Step 1: write; run `pnpm test:e2e` locally** (parallel orchestration assigns ports; don't hardcode one) → PASS on both clients if the runner drives both; otherwise on react (check `tests/scripts/run-all.ts` to see which suites fan out per client and register the new spec the same way its siblings are).
- [ ] **Step 2: Commit** — `test(e2e): equities chart back-to-live lifecycle smoke`

### Task C7: docs + close-out (same PR)

**Files:**
- Modify: `docs/architecture/…` — add a short subsection to the architecture doc that owns the client/UI layer (find the section that documents motion-core/ADR-005 usage; `grep -rn "motion-core" docs/architecture/*.md`) stating the **hybrid mark-shape rule**: rect marks = divs + CSS custom properties; path marks = one shared-coordinate SVG overlay fed point arrays; motion-core emits numbers, never markup; crosshair = transform-positioned divs. Link the spec.
- Modify: `docs/STATUS.md` — per the tracking-workstream-status skill: the workstream entry moves out of 🔴 (delete it — the page is pending-only) once this PR merges; the two ⚪ follow-ups stay.
- Verify: `pnpm check:doc-links`.

- [ ] **Step 1: write the doc note + STATUS edit; check links.**
- [ ] **Step 2: `/rtc:gauntlet full`** → all green.
- [ ] **Step 3: whole-branch review** (accelerated-SDD: mid-phase reviews happened per task; this is the final whole-branch pass) — then PR, CI loop, **check CodeQL/code-scanning comments before merge**, merge `--merge`, clean up the worktree.

---

## Self-review notes (run against the spec)

- Spec §1 in-scope items 1–7 → tasks: zoom/pan/keyboard (B1+C2/C3), live-edge (B1+C2/C3+C6), crosshair+axis (B3+B2+C2/C3), chart types (B2+C2/C3), volume pane (B2+A2+C2/C3), indicators (B4+C1+C2/C3), history+volume (A1–A3). Out-of-scope items are STATUS entries already merged with the spec.
- Spec §4 edge cases → empty series (chartVm existing guard + crosshairVm null), min span (B1), timeframe-switch reset (C2 key-remount / C3 keyed Show), clipped-edge snap clamp (B3), warm-up nulls (B4).
- Spec §5 testing → A1 pin, B unit suites, C4 contract (keyboard-driven), C5 visual (7 scenarios), C6 e2e, per-file coverage in C4 Step 3.
- Deviation from spec §6: 4 PRs → 3 PRs (shared-spec/golden coupling); spec amended in the same commit as this plan.
