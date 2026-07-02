# P5 — Admin / Observability Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Admin / Observability screen from the `docs/design/v2` prototype into `@rtc/client-prototype` — a single full-width panel with live KPI cards, an animated throughput chart, a latency histogram, service health, and a live event feed — replacing the `admin` → `PlaceholderPanel` fallback in the shell.

**Architecture:** New self-contained `src/admin/` module: a `useAdminMetrics` engine hook ticks four rolling 48-point metric series every 850 ms and streams synthetic telemetry events; pure view-models (`adminVm.ts`) derive KPI cards, throughput SVG paths, and service rows; presentational components render inside the shared `#/layout/Panel`. Chart rendering follows existing precedent — SVG for line/area, divs for bars.

**Tech Stack:** React 19, Vite, TypeScript, CSS Modules, Vitest + Testing Library. No `@rtc/domain`/`@rtc/shared`, no RxJS, no ViewModel seam, no React Compiler.

## Global Constraints

- Package boundary: React 19 is the only runtime dep. No `@rtc/domain`/`@rtc/shared`, no RxJS/machines, no ViewModel seam, no React Compiler.
- Imports: `#/` subpath only (`"#/*": "./src/*"`); never `../../`.
- **Render purity (StrictMode):** all RNG lives in the engine hook. Seed via render-body **ref-lazy-init** (`const ref = useRef<T|null>(null); if (ref.current === null) { ref.current = seed(rngRef.current); }`) — NEVER in `useState`/`useMemo` initializers or setState updaters (all StrictMode double-invoked). Freeze the injected RNG in a `useRef`.
- **No inline colour strings.** Semantic colour state → `data-*` attributes with `String(bool)` (e.g. `data-warn={String(warn)}`), coloured in CSS via `[data-*]` selectors. Runtime geometry → a named `const style = { "--x": … } as CSSProperties` setting only `--custom-property`s. Static styling → plain classes. (Precedents: `PnlSummary` `data-sign`, `PairPnlBars` `--bar-pct`.)
- Lint (NO `eslint-disable` anywhere): `arrow-body-style: always` (every arrow is block+`return`, including inline callbacks); module-level `function` declarations; `func-style` (named functions are declarations, not arrow consts — inline callbacks are exempt); `rtc/component-newspaper` (the exported component is the file lede, filename matches it, private sub-components below); `rtc/newspaper-order` (types/helpers/`vi.mock` below `describe` in tests); `useExplicitType` (annotate non-inferrable exported consts + return types); `useUniqueElementIds`.
- Per-task gate — ALL green before committing:
  - `pnpm --filter @rtc/client-prototype typecheck`
  - `pnpm --filter @rtc/client-prototype test`
  - `pnpm exec eslint packages/client-prototype`
  - `pnpm exec stylelint "packages/client-prototype/src/**/*.css"`
  - `pnpm exec biome ci packages/client-prototype`
  - Auto-fix formatting/lint first with `pnpm exec biome check --write packages/client-prototype`.
- Single test file: `pnpm --filter @rtc/client-prototype exec vitest run <fileNameFragment>`.
- Never `git add .` — stage only the exact files named in each task's commit step.
- Repo-wide CI-only gates (run before shipping, not per-task): `pnpm lint:dead` (knip — no dead exports/files), `pnpm check:deps`, `pnpm check:versions`, `pnpm test:rules`.

**Theme tokens available** (do not invent others): `--bg2`, `--panel`, `--border`, `--text`, `--dim`, `--faint`, `--accent`, `--accent2`, `--buy`, `--sell`, `--font-m`, `--font-d`; `"Orbitron", sans-serif` for big numerics (precedent: `InstrumentHeader`, `PnlSummary`).

---

## File Structure

```
packages/client-prototype/src/admin/
  types.ts                          # Task 1 — Severity, MetricKey, AdminMetrics, AdminKpi, Service, AdminEvent, LatBar
  adminData.ts                      # Task 1 — constants, gs, stepSeries, stepMetrics, seedMetrics, seedLatBars, SERVICES, SEED_EVENTS, EVENT_POOL
  adminVm.ts                        # Task 2 — sparkPoints, kpisVm, throughputVm, servicesVm
  useAdminMetrics.ts                # Task 3 — live engine hook
  Kpis/KpiRow.tsx  KpiCard.tsx  KpiSparkline.tsx  KpiRow.module.css      # Task 4
  Throughput/ThroughputChart.tsx  ThroughputChart.module.css            # Task 5
  Latency/LatencyHistogram.tsx  LatencyHistogram.module.css             # Task 6
  Services/ServiceHealth.tsx  ServiceRow.tsx  ServiceHealth.module.css  # Task 7
  Events/LiveEvents.tsx  EventRow.tsx  LiveEvents.module.css            # Task 8
  AdminScreen.tsx  AdminScreen.module.css                               # Task 9
packages/client-prototype/src/shell/AppShell.tsx                        # Task 10 (modify)
packages/client-prototype/tests/                                        # per-task test files
```

---

## Task 1: Data model — types & seed data

**Files:**
- Create: `packages/client-prototype/src/admin/types.ts`
- Create: `packages/client-prototype/src/admin/adminData.ts`
- Test: `packages/client-prototype/tests/admin-data.test.ts`

**Interfaces:**
- Consumes: `mulberry32` from `#/mock/rng`.
- Produces:
  - `type Severity = "INFO" | "WARN" | "ERROR"`
  - `type MetricKey = "tput" | "lat" | "err" | "sess"`
  - `type AdminMetrics = Record<MetricKey, number[]>`
  - `interface AdminKpi { key: MetricKey; label: string; value: string; unit: string; delta: string; deltaUp: boolean; warn: boolean; spark: string }`
  - `interface Service { name: string; status: "ONLINE" | "DEGRADED"; up: string; lat: string; barPct: number }`
  - `interface AdminEvent { id: number; t: string; sev: Severity; svc: string; msg: string }`
  - `interface LatBar { label: string; heightPct: number; accent: boolean }`
  - `interface ServiceSeed { name: string; status: "ONLINE" | "DEGRADED"; up: string; lv: number }`
  - `interface EventTemplate { sev: Severity; svc: string; msg: string }`
  - `const SERIES_LEN = 48`, `TICK_MS = 850`, `EVENT_CAP = 30`, `EVENT_EVERY_TICKS = 4`, `METRIC_KEYS: MetricKey[]`, `METRIC_CFG`, `SERVICES: ServiceSeed[]`, `SEED_EVENTS: Omit<AdminEvent,"id">[]`, `EVENT_POOL: EventTemplate[]`
  - `gs(n, center, spread, rng) → number[]`, `stepSeries(arr, step, min, max, rng) → number[]`, `seedMetrics(rng) → AdminMetrics`, `stepMetrics(metrics, rng) → AdminMetrics`, `seedLatBars(rng) → LatBar[]`

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/admin-data.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  gs,
  METRIC_CFG,
  METRIC_KEYS,
  seedLatBars,
  seedMetrics,
  SERIES_LEN,
  stepMetrics,
  stepSeries,
} from "#/admin/adminData";
import { mulberry32 } from "#/mock/rng";

describe("adminData", () => {
  test("gs generates a walk of length n, never below zero", () => {
    const arr = gs(48, 1200, 160, mulberry32(1));
    expect(arr).toHaveLength(48);
    expect(Math.min(...arr)).toBeGreaterThanOrEqual(0);
  });

  test("seedMetrics returns a SERIES_LEN-long series per metric key", () => {
    const m = seedMetrics(mulberry32(2));
    for (const key of METRIC_KEYS) {
      expect(m[key]).toHaveLength(SERIES_LEN);
    }
  });

  test("stepSeries drops the oldest sample and appends one in [min,max]", () => {
    const arr = gs(48, 42, 9, mulberry32(3));
    const next = stepSeries(arr, 7, 8, 90, mulberry32(4));
    expect(next).toHaveLength(48);
    expect(next.slice(0, 47)).toEqual(arr.slice(1));
    const appended = next[next.length - 1];
    expect(appended).toBeGreaterThanOrEqual(8);
    expect(appended).toBeLessThanOrEqual(90);
  });

  test("stepMetrics advances every series and clamps to its config bounds", () => {
    let m = seedMetrics(mulberry32(5));
    const rng = mulberry32(6);
    for (let i = 0; i < 200; i += 1) {
      m = stepMetrics(m, rng);
    }
    for (const key of METRIC_KEYS) {
      const cfg = METRIC_CFG[key];
      const last = m[key][m[key].length - 1];
      expect(last).toBeGreaterThanOrEqual(cfg.min);
      expect(last).toBeLessThanOrEqual(cfg.max);
    }
  });

  test("seedLatBars is deterministic under a seeded RNG and flags bucket 2 as accent", () => {
    const bars = seedLatBars(mulberry32(7));
    const again = seedLatBars(mulberry32(7));
    expect(bars).toHaveLength(6);
    expect(bars).toEqual(again);
    expect(bars[2].accent).toBe(true);
    expect(bars.every((b) => b.heightPct >= 4)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-data`
Expected: FAIL — cannot resolve `#/admin/adminData`.

- [ ] **Step 3: Write `types.ts`**

`packages/client-prototype/src/admin/types.ts`:

```ts
export type Severity = "INFO" | "WARN" | "ERROR";

export type MetricKey = "tput" | "lat" | "err" | "sess";

export type AdminMetrics = Record<MetricKey, number[]>;

export interface AdminKpi {
  key: MetricKey;
  label: string;
  value: string;
  unit: string;
  delta: string;
  deltaUp: boolean;
  warn: boolean;
  spark: string;
}

export interface Service {
  name: string;
  status: "ONLINE" | "DEGRADED";
  up: string;
  lat: string;
  barPct: number;
}

export interface AdminEvent {
  id: number;
  t: string;
  sev: Severity;
  svc: string;
  msg: string;
}

export interface LatBar {
  label: string;
  heightPct: number;
  accent: boolean;
}

export interface ServiceSeed {
  name: string;
  status: "ONLINE" | "DEGRADED";
  up: string;
  lv: number;
}

export interface EventTemplate {
  sev: Severity;
  svc: string;
  msg: string;
}
```

- [ ] **Step 4: Write `adminData.ts`**

`packages/client-prototype/src/admin/adminData.ts`:

```ts
import type {
  AdminEvent,
  AdminMetrics,
  EventTemplate,
  LatBar,
  MetricKey,
  ServiceSeed,
} from "#/admin/types";

export const SERIES_LEN = 48;
export const TICK_MS = 850;
export const EVENT_CAP = 30;
export const EVENT_EVERY_TICKS = 4;

export const METRIC_KEYS: MetricKey[] = ["tput", "lat", "err", "sess"];

interface MetricCfg {
  center: number;
  spread: number;
  step: number;
  min: number;
  max: number;
}

// PROTO L825 seeds + L1137 per-tick step/bounds, verbatim.
export const METRIC_CFG: Record<MetricKey, MetricCfg> = {
  tput: { center: 1200, spread: 160, step: 150, min: 600, max: 2200 },
  lat: { center: 42, spread: 9, step: 7, min: 8, max: 90 },
  err: { center: 0.4, spread: 0.18, step: 0.16, min: 0, max: 2.2 },
  sess: { center: 1280, spread: 36, step: 28, min: 900, max: 1800 },
};

// PROTO L1381: 6 latency buckets [label, base height %]; index 2 is the accent bar.
const LAT_BUCKETS: [string, number][] = [
  ["<10", 14],
  ["10-25", 40],
  ["25-50", 76],
  ["50-80", 46],
  ["80-150", 20],
  ["150+", 6],
];
const ACCENT_BUCKET = 2;

// PROTO L1384: static service health seeds; colour + bar width derived in adminVm.
export const SERVICES: ServiceSeed[] = [
  { name: "PRICING ENGINE", status: "ONLINE", up: "99.99%", lv: 8 },
  { name: "EXECUTION", status: "ONLINE", up: "99.98%", lv: 14 },
  { name: "BLOTTER STREAM", status: "ONLINE", up: "100%", lv: 6 },
  { name: "EQUITIES FEED", status: "ONLINE", up: "99.96%", lv: 10 },
  { name: "REFERENCE DATA", status: "DEGRADED", up: "99.40%", lv: 48 },
  { name: "CREDIT RFQ", status: "ONLINE", up: "99.97%", lv: 12 },
];

// PROTO L794-798: the initial event log (feed seed).
export const SEED_EVENTS: Omit<AdminEvent, "id">[] = [
  { t: "09:46:12", sev: "INFO", svc: "analytics", msg: "Snapshot recomputed in 38ms" },
  { t: "09:45:50", sev: "WARN", svc: "refdata", msg: "Latency 48ms exceeds 40ms SLO" },
  { t: "09:44:03", sev: "ERROR", svc: "refdata", msg: "Upstream timeout · retry 1/3 scheduled" },
  { t: "09:43:21", sev: "INFO", svc: "pricing", msg: "Subscribed 8 instruments" },
  { t: "09:42:08", sev: "INFO", svc: "execution", msg: "Fill confirmed · EURUSD 5M" },
  { t: "09:41:55", sev: "INFO", svc: "analytics", msg: "P&L snapshot persisted" },
];

// Deviation §3.2: the prototype feed is fed by cross-screen FX activity; the
// self-contained module streams from this fixed telemetry pool instead.
export const EVENT_POOL: EventTemplate[] = [
  { sev: "INFO", svc: "pricing", msg: "Subscribed 8 instruments" },
  { sev: "INFO", svc: "analytics", msg: "Snapshot recomputed in 38ms" },
  { sev: "WARN", svc: "refdata", msg: "Latency 48ms exceeds 40ms SLO" },
  { sev: "INFO", svc: "execution", msg: "Order acked in 12ms" },
  { sev: "WARN", svc: "gateway", msg: "Reconnect backoff 1 scheduled" },
  { sev: "ERROR", svc: "refdata", msg: "Upstream timeout · retry 1/3" },
  { sev: "INFO", svc: "blotter", msg: "Stream heartbeat ok" },
];

// PROTO L809: a length-n random walk around `center`, each step ±spread/2,
// floored at 0. RNG injected so smokes are deterministic.
export function gs(
  n: number,
  center: number,
  spread: number,
  rng: () => number,
): number[] {
  const out: number[] = [];
  let v = center;
  for (let i = 0; i < n; i += 1) {
    v = Math.max(0, v + (rng() - 0.5) * spread);
    out.push(v);
  }
  return out;
}

// PROTO L1136: drop the oldest sample, append a clamped ±step/2 random walk
// from the last value (3-dp rounded).
export function stepSeries(
  arr: number[],
  step: number,
  min: number,
  max: number,
  rng: () => number,
): number[] {
  const v = arr[arr.length - 1];
  let nv = v + (rng() - 0.5) * step;
  nv = Math.max(min, Math.min(max, nv));
  return [...arr.slice(1), +nv.toFixed(3)];
}

export function seedMetrics(rng: () => number): AdminMetrics {
  const out = {} as AdminMetrics;
  for (const key of METRIC_KEYS) {
    const cfg = METRIC_CFG[key];
    out[key] = gs(SERIES_LEN, cfg.center, cfg.spread, rng);
  }
  return out;
}

export function stepMetrics(
  metrics: AdminMetrics,
  rng: () => number,
): AdminMetrics {
  const out = {} as AdminMetrics;
  for (const key of METRIC_KEYS) {
    const cfg = METRIC_CFG[key];
    out[key] = stepSeries(metrics[key], cfg.step, cfg.min, cfg.max, rng);
  }
  return out;
}

// Deviation §3.1: the prototype re-jitters each render; we seed once from the
// frozen RNG for render purity. Height = base + (rng*8 - 4), floored at 4.
export function seedLatBars(rng: () => number): LatBar[] {
  return LAT_BUCKETS.map(([label, base], i) => {
    const heightPct = Math.max(4, base + (rng() * 8 - 4));
    return { label, heightPct, accent: i === ACCENT_BUCKET };
  });
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-data`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the per-task gate**

```bash
pnpm exec biome check --write packages/client-prototype
pnpm --filter @rtc/client-prototype typecheck
pnpm exec eslint packages/client-prototype
pnpm exec biome ci packages/client-prototype
```
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/admin/types.ts packages/client-prototype/src/admin/adminData.ts packages/client-prototype/tests/admin-data.test.ts
git commit -m "feat(client-prototype): P5 Task 1 — admin types + seed data"
```

---

## Task 2: View-models — `adminVm.ts`

**Files:**
- Create: `packages/client-prototype/src/admin/adminVm.ts`
- Test: `packages/client-prototype/tests/admin-vm.test.ts`

**Interfaces:**
- Consumes: `AdminMetrics`, `AdminKpi`, `Service`, `MetricKey` from `#/admin/types`; `SERVICES` from `#/admin/adminData`.
- Produces:
  - `sparkPoints(arr: number[]) → string`
  - `kpisVm(metrics: AdminMetrics) → AdminKpi[]` (order: tput, lat, err, sess)
  - `interface ThroughputPaths { line: string; area: string }`
  - `throughputVm(tput: number[]) → ThroughputPaths`
  - `servicesVm() → Service[]`

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/admin-vm.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { seedMetrics } from "#/admin/adminData";
import { kpisVm, servicesVm, sparkPoints, throughputVm } from "#/admin/adminVm";
import type { AdminMetrics } from "#/admin/types";
import { mulberry32 } from "#/mock/rng";

describe("adminVm", () => {
  test("sparkPoints emits one x,y pair per sample", () => {
    const pts = sparkPoints([1, 2, 3, 4]).split(" ");
    expect(pts).toHaveLength(4);
    expect(pts[0]).toMatch(/^\d/);
    expect(pts[0]).toContain(",");
  });

  test("kpisVm returns the four metrics in order with formatted values", () => {
    const kpis = kpisVm(seedMetrics(mulberry32(1)));
    expect(kpis.map((k) => k.key)).toEqual(["tput", "lat", "err", "sess"]);
    expect(kpis[0].unit).toBe("k msg/s");
  });

  test("kpisVm flags latency warn above 60ms and normal below", () => {
    const hot: AdminMetrics = {
      tput: [1200, 1200],
      lat: [40, 72],
      err: [0.4, 0.4],
      sess: [1280, 1280],
    };
    const cool: AdminMetrics = { ...hot, lat: [40, 40] };
    expect(kpisVm(hot)[1].warn).toBe(true);
    expect(kpisVm(cool)[1].warn).toBe(false);
  });

  test("kpisVm delta sign follows the trend vs the lookback sample", () => {
    const rising: AdminMetrics = {
      tput: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 2000],
      lat: [40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
      err: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
      sess: [1280, 1280, 1280, 1280, 1280, 1280, 1280, 1280, 1280, 1280],
    };
    expect(kpisVm(rising)[0].deltaUp).toBe(true);
    expect(kpisVm(rising)[0].delta.startsWith("▲")).toBe(true);
  });

  test("throughputVm returns a non-empty polyline and a closed area path", () => {
    const { line, area } = throughputVm(seedMetrics(mulberry32(2)).tput);
    expect(line.length).toBeGreaterThan(0);
    expect(area.startsWith("M0,96")).toBe(true);
    expect(area.endsWith("Z")).toBe(true);
  });

  test("servicesVm derives lat label and a bar % capped at 100, DEGRADED preserved", () => {
    const svc = servicesVm();
    expect(svc).toHaveLength(6);
    const degraded = svc.find((s) => s.status === "DEGRADED");
    expect(degraded?.name).toBe("REFERENCE DATA");
    expect(degraded?.lat).toBe("48ms");
    expect(svc.every((s) => s.barPct <= 100)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-vm`
Expected: FAIL — cannot resolve `#/admin/adminVm`.

- [ ] **Step 3: Write `adminVm.ts`**

`packages/client-prototype/src/admin/adminVm.ts`:

```ts
import { SERVICES } from "#/admin/adminData";
import type { AdminKpi, AdminMetrics, MetricKey, Service } from "#/admin/types";

const SPARK_W = 100;
const SPARK_H = 28;
const SPARK_SPAN = 26;
const DELTA_LOOKBACK = 9;
const LAT_WARN = 60;
const ERR_WARN = 0.8;
const TPUT_W = 300;
const TPUT_H = 96;
const TPUT_TOP = 92;
const TPUT_SPAN = 84;
const SVC_LAT_MAX = 60;
const KPI_ORDER: MetricKey[] = ["tput", "lat", "err", "sess"];

interface KpiCfg {
  label: string;
  unit: string;
  fmt(v: number): string;
  warns(v: number): boolean;
}

function fmtTput(v: number): string {
  return (v / 1000).toFixed(2);
}

function fmtRound(v: number): string {
  return String(Math.round(v));
}

function fmtErr(v: number): string {
  return v.toFixed(2);
}

function noWarn(): boolean {
  return false;
}

function warnLat(v: number): boolean {
  return v > LAT_WARN;
}

function warnErr(v: number): boolean {
  return v > ERR_WARN;
}

// PROTO L1375-1378: per-metric label, unit, formatter and warn threshold.
const KPI_CFG: Record<MetricKey, KpiCfg> = {
  tput: { label: "Throughput", unit: "k msg/s", fmt: fmtTput, warns: noWarn },
  lat: { label: "P99 Latency", unit: "ms", fmt: fmtRound, warns: warnLat },
  err: { label: "Error Rate", unit: "%", fmt: fmtErr, warns: warnErr },
  sess: { label: "Active Sessions", unit: "", fmt: fmtRound, warns: noWarn },
};

// PROTO L1373: normalise a series into "x,y x,y …" over a 100×28 box, inverted
// so peaks sit near the top.
export function sparkPoints(arr: number[]): string {
  const mn = Math.min(...arr);
  const mx = Math.max(...arr);
  const rg = mx - mn || 1;
  return arr
    .map((v, i) => {
      const x = ((i / (arr.length - 1)) * SPARK_W).toFixed(1);
      const y = (SPARK_H - ((v - mn) / rg) * SPARK_SPAN).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");
}

// PROTO L1374: current value, delta vs the lookback sample, warn state, spark.
export function kpisVm(metrics: AdminMetrics): AdminKpi[] {
  return KPI_ORDER.map((key) => {
    const arr = metrics[key];
    const cfg = KPI_CFG[key];
    const cur = arr[arr.length - 1];
    const past = arr[arr.length - DELTA_LOOKBACK] ?? arr[0];
    const dl = cur - past;
    const deltaUp = dl >= 0;
    return {
      key,
      label: cfg.label,
      value: cfg.fmt(cur),
      unit: cfg.unit,
      delta: `${deltaUp ? "▲ +" : "▼ "}${cfg.fmt(Math.abs(dl))}`,
      deltaUp,
      warn: cfg.warns(cur),
      spark: sparkPoints(arr),
    };
  });
}

export interface ThroughputPaths {
  line: string;
  area: string;
}

// PROTO L1380: the throughput series as an SVG polyline + a closed gradient area
// over a 300×96 box.
export function throughputVm(tput: number[]): ThroughputPaths {
  const mn = Math.min(...tput);
  const mx = Math.max(...tput);
  const rg = mx - mn || 1;
  const pts = tput.map((v, i) => {
    const x = ((i / (tput.length - 1)) * TPUT_W).toFixed(1);
    const y = (TPUT_TOP - ((v - mn) / rg) * TPUT_SPAN).toFixed(1);
    return `${x},${y}`;
  });
  return {
    line: pts.join(" "),
    area: `M0,${TPUT_H} ${pts.join(" ")} L${TPUT_W},${TPUT_H} Z`,
  };
}

// PROTO L1384: derive the latency label and a bar % from the static seeds.
export function servicesVm(): Service[] {
  return SERVICES.map((s) => {
    return {
      name: s.name,
      status: s.status,
      up: s.up,
      lat: `${s.lv}ms`,
      barPct: Math.min(100, (s.lv / SVC_LAT_MAX) * 100),
    };
  });
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-vm`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the per-task gate** (biome write, typecheck, eslint, biome ci — as Task 1 Step 6).

- [ ] **Step 6: Commit**

```bash
git add packages/client-prototype/src/admin/adminVm.ts packages/client-prototype/tests/admin-vm.test.ts
git commit -m "feat(client-prototype): P5 Task 2 — admin view-models"
```

---

## Task 3: Live engine — `useAdminMetrics.ts`

**Files:**
- Create: `packages/client-prototype/src/admin/useAdminMetrics.ts`
- Test: `packages/client-prototype/tests/admin-engine.test.ts`

**Interfaces:**
- Consumes: `EVENT_CAP`, `EVENT_EVERY_TICKS`, `EVENT_POOL`, `SEED_EVENTS`, `TICK_MS`, `seedLatBars`, `seedMetrics`, `stepMetrics` from `#/admin/adminData`; `AdminEvent`, `AdminMetrics`, `LatBar` from `#/admin/types`.
- Produces:
  - `interface AdminApi { metrics: AdminMetrics; events: AdminEvent[]; latBars: LatBar[] }`
  - `interface UseAdminMetricsOptions { rng?: () => number; intervalMs?: number }`
  - `useAdminMetrics(opts?: UseAdminMetricsOptions) → AdminApi`

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/admin-engine.test.ts`:

```ts
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EVENT_CAP, SEED_EVENTS } from "#/admin/adminData";
import { useAdminMetrics } from "#/admin/useAdminMetrics";
import { mulberry32 } from "#/mock/rng";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useAdminMetrics", () => {
  test("seeds 48-long metric series, 6 latency bars, and the seed events", () => {
    const { result } = renderHook(() => {
      return useAdminMetrics({ rng: mulberry32(1) });
    });
    expect(result.current.metrics.tput).toHaveLength(48);
    expect(result.current.latBars).toHaveLength(6);
    expect(result.current.events).toHaveLength(SEED_EVENTS.length);
  });

  test("a tick advances every series (window shifts by one sample)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useAdminMetrics({ rng: mulberry32(2), intervalMs: 100 });
    });
    const before = result.current.metrics.tput;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const after = result.current.metrics.tput;
    expect(after.slice(0, 47)).toEqual(before.slice(1));
    expect(after).not.toEqual(before);
  });

  test("emits a new event every 4th tick and caps the feed at EVENT_CAP", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useAdminMetrics({ rng: mulberry32(3), intervalMs: 100 });
    });
    const seedCount = result.current.events.length;
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.events.length).toBe(seedCount + 1);
    act(() => {
      vi.advanceTimersByTime(100 * 4 * 40);
    });
    expect(result.current.events.length).toBeLessThanOrEqual(EVENT_CAP);
  });

  test("StrictMode double-mount does not double-advance the seed", () => {
    const { result } = renderHook(
      () => {
        return useAdminMetrics({ rng: mulberry32(4) });
      },
      { wrapper: StrictMode },
    );
    const fresh = renderHook(() => {
      return useAdminMetrics({ rng: mulberry32(4) });
    });
    // Same seed → identical first series iff the seed was drawn exactly once.
    expect(result.current.metrics.tput).toEqual(fresh.result.current.metrics.tput);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-engine`
Expected: FAIL — cannot resolve `#/admin/useAdminMetrics`.

- [ ] **Step 3: Write `useAdminMetrics.ts`**

`packages/client-prototype/src/admin/useAdminMetrics.ts`:

```ts
import { useEffect, useRef, useState } from "react";

import {
  EVENT_CAP,
  EVENT_EVERY_TICKS,
  EVENT_POOL,
  SEED_EVENTS,
  seedLatBars,
  seedMetrics,
  stepMetrics,
  TICK_MS,
} from "#/admin/adminData";
import type { AdminEvent, AdminMetrics, LatBar } from "#/admin/types";

export interface AdminApi {
  metrics: AdminMetrics;
  events: AdminEvent[];
  latBars: LatBar[];
}

export interface UseAdminMetricsOptions {
  rng?: () => number;
  intervalMs?: number;
}

interface Seed {
  metrics: AdminMetrics;
  latBars: LatBar[];
  events: AdminEvent[];
}

function timeNow(): string {
  return new Date().toTimeString().slice(0, 8);
}

function seedEvents(): AdminEvent[] {
  return SEED_EVENTS.map((e, i) => {
    return { ...e, id: i + 1 };
  });
}

export function useAdminMetrics(opts: UseAdminMetricsOptions = {}): AdminApi {
  const { rng = Math.random, intervalMs = TICK_MS } = opts;
  const rngRef = useRef(rng);

  // Seed once via render-body ref-lazy-init, NOT a useState initializer:
  // StrictMode double-invokes those, which would draw the RNG twice before the
  // first commit. The ref persists across the double render, so each seed runs once.
  const seedRef = useRef<Seed | null>(null);
  if (seedRef.current === null) {
    seedRef.current = {
      metrics: seedMetrics(rngRef.current),
      latBars: seedLatBars(rngRef.current),
      events: seedEvents(),
    };
  }

  const [metrics, setMetrics] = useState<AdminMetrics>(seedRef.current.metrics);
  const [events, setEvents] = useState<AdminEvent[]>(seedRef.current.events);
  const [latBars] = useState<LatBar[]>(seedRef.current.latBars);

  const tickRef = useRef(0);
  const seqRef = useRef(SEED_EVENTS.length);

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics((prev) => {
        return stepMetrics(prev, rngRef.current);
      });
      tickRef.current += 1;
      if (tickRef.current % EVENT_EVERY_TICKS === 0) {
        const pick = EVENT_POOL[Math.floor(rngRef.current() * EVENT_POOL.length)];
        seqRef.current += 1;
        const ev: AdminEvent = {
          id: seqRef.current,
          t: timeNow(),
          sev: pick.sev,
          svc: pick.svc,
          msg: pick.msg,
        };
        setEvents((prev) => {
          return [ev, ...prev].slice(0, EVENT_CAP);
        });
      }
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);

  return { metrics, events, latBars };
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-engine`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the per-task gate.**

- [ ] **Step 6: Commit**

```bash
git add packages/client-prototype/src/admin/useAdminMetrics.ts packages/client-prototype/tests/admin-engine.test.ts
git commit -m "feat(client-prototype): P5 Task 3 — live metrics engine"
```

---

## Task 4: KPI row — `Kpis/`

**Files:**
- Create: `packages/client-prototype/src/admin/Kpis/KpiRow.tsx`
- Create: `packages/client-prototype/src/admin/Kpis/KpiCard.tsx`
- Create: `packages/client-prototype/src/admin/Kpis/KpiSparkline.tsx`
- Create: `packages/client-prototype/src/admin/Kpis/KpiRow.module.css`
- Test: `packages/client-prototype/tests/admin-kpis.test.tsx`

**Interfaces:**
- Consumes: `AdminKpi` from `#/admin/types`.
- Produces: `KpiRow({ kpis: AdminKpi[] })`, `KpiCard({ kpi: AdminKpi })`, `KpiSparkline({ kpi: AdminKpi })`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/admin-kpis.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { KpiRow } from "#/admin/Kpis/KpiRow";
import type { AdminKpi } from "#/admin/types";

afterEach(cleanup);

const KPIS: AdminKpi[] = [
  { key: "tput", label: "Throughput", value: "1.20", unit: "k msg/s", delta: "▲ +0.03", deltaUp: true, warn: false, spark: "0,10 100,5" },
  { key: "lat", label: "P99 Latency", value: "72", unit: "ms", delta: "▼ 3", deltaUp: false, warn: true, spark: "0,10 100,5" },
];

describe("KpiRow", () => {
  test("renders a card per kpi with label and value", () => {
    const { getByText, container } = render(<KpiRow kpis={KPIS} />);
    expect(getByText("Throughput")).toBeTruthy();
    expect(getByText("1.20")).toBeTruthy();
    expect(container.querySelectorAll("[data-kpi]").length).toBeGreaterThanOrEqual(2);
  });

  test("marks the latency value as warn and the delta as down", () => {
    const { container } = render(<KpiRow kpis={KPIS} />);
    const latValue = container.querySelector('[data-kpi="lat"]');
    expect(latValue?.getAttribute("data-warn")).toBe("true");
    const latDelta = container.querySelector('[data-delta-up="false"]');
    expect(latDelta).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-kpis`
Expected: FAIL — cannot resolve `#/admin/Kpis/KpiRow`.

- [ ] **Step 3: Write the CSS**

`packages/client-prototype/src/admin/Kpis/KpiRow.module.css`:

```css
.row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.card {
  position: relative;
  overflow: hidden;
  padding: 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.label {
  font-family: var(--font-m, monospace);
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--faint);
}

.valueRow {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin-top: 6px;
}

.value {
  font-family: "Orbitron", sans-serif;
  font-weight: 700;
  font-size: 26px;
  text-shadow: 0 0 14px currentColor;
}

.value[data-kpi="tput"] {
  color: var(--accent2);
}

.value[data-kpi="lat"],
.line[data-kpi="lat"] {
  color: var(--accent);
  stroke: var(--accent);
}

.value[data-kpi="lat"][data-warn="true"],
.line[data-kpi="lat"][data-warn="true"],
.value[data-kpi="err"][data-warn="true"],
.line[data-kpi="err"][data-warn="true"] {
  color: var(--sell);
  stroke: var(--sell);
}

.value[data-kpi="err"],
.line[data-kpi="err"],
.value[data-kpi="sess"] {
  color: var(--buy);
  stroke: var(--buy);
}

.line[data-kpi="tput"] {
  stroke: var(--accent2);
}

.unit {
  font-family: var(--font-m, monospace);
  font-size: 10px;
  color: var(--dim);
}

.delta {
  margin-top: 3px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
}

.delta[data-delta-up="true"] {
  color: var(--buy);
}

.delta[data-delta-up="false"] {
  color: var(--sell);
}

.spark {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 30px;
  opacity: 0.55;
}

.line {
  fill: none;
  stroke-width: 1.4;
}
```

- [ ] **Step 4: Write `KpiSparkline.tsx`**

`packages/client-prototype/src/admin/Kpis/KpiSparkline.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/admin/Kpis/KpiRow.module.css";
import type { AdminKpi } from "#/admin/types";

// PROTO L695: a faint sparkline pinned to the card's lower edge; the stroke
// colour matches the KPI value (set in CSS via data-kpi/data-warn).
export function KpiSparkline({ kpi }: { kpi: AdminKpi }): ReactElement {
  return (
    <svg className={styles.spark} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        className={styles.line}
        data-kpi={kpi.key}
        data-warn={String(kpi.warn)}
        points={kpi.spark}
      />
    </svg>
  );
}
```

- [ ] **Step 5: Write `KpiCard.tsx`**

`packages/client-prototype/src/admin/Kpis/KpiCard.tsx`:

```tsx
import type { ReactElement } from "react";

import { KpiSparkline } from "#/admin/Kpis/KpiSparkline";
import styles from "#/admin/Kpis/KpiRow.module.css";
import type { AdminKpi } from "#/admin/types";

// PROTO L687-696: one KPI card — label, glowing value + unit, trend delta, and a
// bottom sparkline. Colour state is carried on data-* attributes (CSS colours it).
export function KpiCard({ kpi }: { kpi: AdminKpi }): ReactElement {
  return (
    <div className={styles.card}>
      <div className={styles.label}>{kpi.label}</div>
      <div className={styles.valueRow}>
        <span className={styles.value} data-kpi={kpi.key} data-warn={String(kpi.warn)}>
          {kpi.value}
        </span>
        <span className={styles.unit}>{kpi.unit}</span>
      </div>
      <div className={styles.delta} data-delta-up={String(kpi.deltaUp)}>
        {kpi.delta}
      </div>
      <KpiSparkline kpi={kpi} />
    </div>
  );
}
```

- [ ] **Step 6: Write `KpiRow.tsx`**

`packages/client-prototype/src/admin/Kpis/KpiRow.tsx`:

```tsx
import type { ReactElement } from "react";

import { KpiCard } from "#/admin/Kpis/KpiCard";
import styles from "#/admin/Kpis/KpiRow.module.css";
import type { AdminKpi } from "#/admin/types";

// PROTO L685-697: the 4-up KPI strip.
export function KpiRow({ kpis }: { kpis: AdminKpi[] }): ReactElement {
  return (
    <div className={styles.row}>
      {kpis.map((kpi) => {
        return <KpiCard key={kpi.key} kpi={kpi} />;
      })}
    </div>
  );
}
```

- [ ] **Step 7: Run the tests and make sure they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-kpis`
Expected: PASS (2 tests).

- [ ] **Step 8: Run the per-task gate** (include `pnpm exec stylelint "packages/client-prototype/src/**/*.css"`).

- [ ] **Step 9: Commit**

```bash
git add packages/client-prototype/src/admin/Kpis/ packages/client-prototype/tests/admin-kpis.test.tsx
git commit -m "feat(client-prototype): P5 Task 4 — KPI cards + sparklines"
```

---

## Task 5: Throughput chart — `Throughput/`

**Files:**
- Create: `packages/client-prototype/src/admin/Throughput/ThroughputChart.tsx`
- Create: `packages/client-prototype/src/admin/Throughput/ThroughputChart.module.css`
- Test: `packages/client-prototype/tests/admin-throughput.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks except plain string props.
- Produces: `ThroughputChart({ line: string; area: string })`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/admin-throughput.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ThroughputChart } from "#/admin/Throughput/ThroughputChart";

afterEach(cleanup);

describe("ThroughputChart", () => {
  test("renders the heading, a filled area path and the line polyline", () => {
    const { getByText, container } = render(
      <ThroughputChart line="0,10 300,20" area="M0,96 0,10 300,20 L300,96 Z" />,
    );
    expect(getByText("MESSAGE THROUGHPUT")).toBeTruthy();
    expect(container.querySelector("path")?.getAttribute("d")).toContain("Z");
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe("0,10 300,20");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-throughput`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the CSS**

`packages/client-prototype/src/admin/Throughput/ThroughputChart.module.css`:

```css
.card {
  padding: 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.title {
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--accent);
}

.sub {
  font-family: var(--font-m, monospace);
  font-size: 10px;
  color: var(--faint);
}

.svg {
  display: block;
  width: 100%;
  height: 96px;
}

.line {
  fill: none;
  stroke: var(--accent2);
  stroke-width: 1.6;
  filter: drop-shadow(0 0 4px var(--accent2));
}
```

- [ ] **Step 4: Write `ThroughputChart.tsx`**

`packages/client-prototype/src/admin/Throughput/ThroughputChart.tsx`:

```tsx
import { type ReactElement, useId } from "react";

import styles from "#/admin/Throughput/ThroughputChart.module.css";

// PROTO L697-700: message-throughput area+line chart. The area is filled with a
// vertical accent2 gradient; the line glows. Paths come from throughputVm.
export function ThroughputChart({ line, area }: { line: string; area: string }): ReactElement {
  const gradientId = useId();

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>MESSAGE THROUGHPUT</span>
        <span className={styles.sub}>last 60s · msg/s</span>
      </div>
      <svg className={styles.svg} viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent2)" stopOpacity="0.3" />
            <stop offset="1" stopColor="var(--accent2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <polyline className={styles.line} points={line} />
      </svg>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-throughput`
Expected: PASS.

- [ ] **Step 6: Run the per-task gate.**

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/admin/Throughput/ packages/client-prototype/tests/admin-throughput.test.tsx
git commit -m "feat(client-prototype): P5 Task 5 — throughput chart"
```

---

## Task 6: Latency histogram — `Latency/`

**Files:**
- Create: `packages/client-prototype/src/admin/Latency/LatencyHistogram.tsx`
- Create: `packages/client-prototype/src/admin/Latency/LatencyHistogram.module.css`
- Test: `packages/client-prototype/tests/admin-latency.test.tsx`

**Interfaces:**
- Consumes: `LatBar` from `#/admin/types`.
- Produces: `LatencyHistogram({ bars: LatBar[] })`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/admin-latency.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { LatencyHistogram } from "#/admin/Latency/LatencyHistogram";
import type { LatBar } from "#/admin/types";

afterEach(cleanup);

const BARS: LatBar[] = [
  { label: "<10", heightPct: 14, accent: false },
  { label: "25-50", heightPct: 76, accent: true },
];

describe("LatencyHistogram", () => {
  test("renders the heading, a bar per bucket, and marks the accent bucket", () => {
    const { getByText, container } = render(<LatencyHistogram bars={BARS} />);
    expect(getByText("LATENCY DISTRIBUTION")).toBeTruthy();
    expect(getByText("<10")).toBeTruthy();
    expect(container.querySelectorAll("[data-accent]")).toHaveLength(2);
    expect(container.querySelector('[data-accent="true"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-latency`
Expected: FAIL.

- [ ] **Step 3: Write the CSS**

`packages/client-prototype/src/admin/Latency/LatencyHistogram.module.css`:

```css
.card {
  padding: 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.title {
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--accent);
}

.sub {
  font-family: var(--font-m, monospace);
  font-size: 10px;
  color: var(--faint);
}

.bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 6px;
  height: 96px;
}

.col {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
}

.bar {
  width: 70%;
  height: var(--bar-h);
  border-radius: 2px 2px 0 0;
  opacity: 0.85;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}

.bar[data-accent="true"] {
  background: var(--accent2);
  box-shadow: 0 0 8px var(--accent2);
}

.tick {
  margin-top: 5px;
  font-family: var(--font-m, monospace);
  font-size: 8px;
  color: var(--faint);
}
```

- [ ] **Step 4: Write `LatencyHistogram.tsx`**

`packages/client-prototype/src/admin/Latency/LatencyHistogram.tsx`:

```tsx
import type { CSSProperties, ReactElement } from "react";

import styles from "#/admin/Latency/LatencyHistogram.module.css";
import type { LatBar } from "#/admin/types";

// PROTO L701-706: latency-distribution histogram — one bar per bucket, height
// via a --bar-h custom property, accent bucket flagged with data-accent.
export function LatencyHistogram({ bars }: { bars: LatBar[] }): ReactElement {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>LATENCY DISTRIBUTION</span>
        <span className={styles.sub}>ms</span>
      </div>
      <div className={styles.bars}>
        {bars.map((bar) => {
          const barStyle = { "--bar-h": `${bar.heightPct}%` } as CSSProperties;
          return (
            <div className={styles.col} key={bar.label}>
              <div className={styles.bar} data-accent={String(bar.accent)} style={barStyle} />
              <span className={styles.tick}>{bar.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-latency`
Expected: PASS.

- [ ] **Step 6: Run the per-task gate.**

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/admin/Latency/ packages/client-prototype/tests/admin-latency.test.tsx
git commit -m "feat(client-prototype): P5 Task 6 — latency histogram"
```

---

## Task 7: Service health — `Services/`

**Files:**
- Create: `packages/client-prototype/src/admin/Services/ServiceHealth.tsx`
- Create: `packages/client-prototype/src/admin/Services/ServiceRow.tsx`
- Create: `packages/client-prototype/src/admin/Services/ServiceHealth.module.css`
- Test: `packages/client-prototype/tests/admin-services.test.tsx`

**Interfaces:**
- Consumes: `Service` from `#/admin/types`.
- Produces: `ServiceHealth({ services: Service[] })`, `ServiceRow({ service: Service })`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/admin-services.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ServiceHealth } from "#/admin/Services/ServiceHealth";
import type { Service } from "#/admin/types";

afterEach(cleanup);

const SERVICES: Service[] = [
  { name: "PRICING ENGINE", status: "ONLINE", up: "99.99%", lat: "8ms", barPct: 13.3 },
  { name: "REFERENCE DATA", status: "DEGRADED", up: "99.40%", lat: "48ms", barPct: 80 },
];

describe("ServiceHealth", () => {
  test("renders the heading and a row per service with status data attribute", () => {
    const { getByText, container } = render(<ServiceHealth services={SERVICES} />);
    expect(getByText("SERVICE HEALTH")).toBeTruthy();
    expect(getByText("REFERENCE DATA")).toBeTruthy();
    expect(container.querySelector('[data-status="DEGRADED"]')).toBeTruthy();
    expect(container.querySelectorAll("[data-status]")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-services`
Expected: FAIL.

- [ ] **Step 3: Write the CSS**

`packages/client-prototype/src/admin/Services/ServiceHealth.module.css`:

```css
.card {
  padding: 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.title {
  margin-bottom: 12px;
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--accent);
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.name {
  flex: none;
  width: 128px;
  font-family: var(--font-m, monospace);
  font-size: 11px;
  color: var(--text);
}

.track {
  flex: 1;
  height: 6px;
  overflow: hidden;
  background: var(--panel);
  border-radius: 3px;
}

.fill {
  width: var(--bar-pct);
  height: 100%;
}

.lat {
  width: 42px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
  text-align: right;
  color: var(--dim);
}

.up {
  width: 48px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
  text-align: right;
}

.dot[data-status="ONLINE"],
.fill[data-status="ONLINE"],
.up[data-status="ONLINE"] {
  color: var(--buy);
  background: var(--buy);
}

.dot[data-status="DEGRADED"],
.fill[data-status="DEGRADED"],
.up[data-status="DEGRADED"] {
  color: var(--accent);
  background: var(--accent);
}

.dot[data-status="ONLINE"] {
  box-shadow: 0 0 8px var(--buy);
}

.dot[data-status="DEGRADED"] {
  box-shadow: 0 0 8px var(--accent);
}

.up[data-status="ONLINE"],
.up[data-status="DEGRADED"] {
  background: none;
}
```

> Note: `.up` carries the status colour as **text** (`background: none` override); `.dot`/`.fill` carry it as background. The shared selector keeps colour state in one place.

- [ ] **Step 4: Write `ServiceRow.tsx`**

`packages/client-prototype/src/admin/Services/ServiceRow.tsx`:

```tsx
import type { CSSProperties, ReactElement } from "react";

import styles from "#/admin/Services/ServiceHealth.module.css";
import type { Service } from "#/admin/types";

// PROTO L710: one service row — status dot, name, utilisation bar (--bar-pct),
// latency, and uptime. Status colour lives on data-status (CSS colours it).
export function ServiceRow({ service }: { service: Service }): ReactElement {
  const fillStyle = { "--bar-pct": `${service.barPct}%` } as CSSProperties;

  return (
    <div className={styles.row}>
      <span className={styles.dot} data-status={service.status} />
      <span className={styles.name}>{service.name}</span>
      <span className={styles.track}>
        <span className={styles.fill} data-status={service.status} style={fillStyle} />
      </span>
      <span className={styles.lat}>{service.lat}</span>
      <span className={styles.up} data-status={service.status}>
        {service.up}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Write `ServiceHealth.tsx`**

`packages/client-prototype/src/admin/Services/ServiceHealth.tsx`:

```tsx
import type { ReactElement } from "react";

import { ServiceRow } from "#/admin/Services/ServiceRow";
import styles from "#/admin/Services/ServiceHealth.module.css";
import type { Service } from "#/admin/types";

// PROTO L708-711: the service-health list.
export function ServiceHealth({ services }: { services: Service[] }): ReactElement {
  return (
    <div className={styles.card}>
      <div className={styles.title}>SERVICE HEALTH</div>
      {services.map((service) => {
        return <ServiceRow key={service.name} service={service} />;
      })}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests and make sure they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-services`
Expected: PASS.

- [ ] **Step 7: Run the per-task gate.**

- [ ] **Step 8: Commit**

```bash
git add packages/client-prototype/src/admin/Services/ packages/client-prototype/tests/admin-services.test.tsx
git commit -m "feat(client-prototype): P5 Task 7 — service health"
```

---

## Task 8: Live events — `Events/`

**Files:**
- Create: `packages/client-prototype/src/admin/Events/LiveEvents.tsx`
- Create: `packages/client-prototype/src/admin/Events/EventRow.tsx`
- Create: `packages/client-prototype/src/admin/Events/LiveEvents.module.css`
- Test: `packages/client-prototype/tests/admin-events.test.tsx`

**Interfaces:**
- Consumes: `AdminEvent` from `#/admin/types`.
- Produces: `LiveEvents({ events: AdminEvent[] })`, `EventRow({ event: AdminEvent })`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/admin-events.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { LiveEvents } from "#/admin/Events/LiveEvents";
import type { AdminEvent } from "#/admin/types";

afterEach(cleanup);

const EVENTS: AdminEvent[] = [
  { id: 1, t: "09:46:12", sev: "INFO", svc: "analytics", msg: "Snapshot recomputed" },
  { id: 2, t: "09:44:03", sev: "ERROR", svc: "refdata", msg: "Upstream timeout" },
];

describe("LiveEvents", () => {
  test("renders the count and a row per event with severity data attribute", () => {
    const { getByText, container } = render(<LiveEvents events={EVENTS} />);
    expect(getByText("2 events")).toBeTruthy();
    expect(getByText("Upstream timeout")).toBeTruthy();
    expect(container.querySelector('[data-sev="ERROR"]')).toBeTruthy();
    expect(container.querySelectorAll("[data-sev]")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-events`
Expected: FAIL.

- [ ] **Step 3: Write the CSS**

`packages/client-prototype/src/admin/Events/LiveEvents.module.css`:

```css
.card {
  padding: 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.title {
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--accent);
}

.count {
  font-family: var(--font-m, monospace);
  font-size: 10px;
  color: var(--faint);
}

.list {
  max-height: 200px;
  overflow-y: auto;
}

.row {
  display: flex;
  gap: 9px;
  align-items: baseline;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}

.time {
  flex: none;
  width: 54px;
  font-family: var(--font-m, monospace);
  font-size: 9px;
  color: var(--faint);
}

.sev {
  flex: none;
  width: 42px;
  padding: 1px 0;
  font-family: var(--font-m, monospace);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
  border: 1px solid currentColor;
  border-radius: 2px;
}

.sev[data-sev="INFO"] {
  color: var(--buy);
}

.sev[data-sev="WARN"] {
  color: var(--accent);
}

.sev[data-sev="ERROR"] {
  color: var(--sell);
}

.svc {
  flex: none;
  width: 64px;
  font-family: var(--font-m, monospace);
  font-size: 10px;
  color: var(--accent);
}

.msg {
  font-family: var(--font-m, monospace);
  font-size: 11px;
  color: var(--dim);
}
```

- [ ] **Step 4: Write `EventRow.tsx`**

`packages/client-prototype/src/admin/Events/EventRow.tsx`:

```tsx
import type { ReactElement } from "react";

import styles from "#/admin/Events/LiveEvents.module.css";
import type { AdminEvent } from "#/admin/types";

// PROTO L716: one event row — time, severity tag (coloured via data-sev),
// service, message.
export function EventRow({ event }: { event: AdminEvent }): ReactElement {
  return (
    <div className={styles.row}>
      <span className={styles.time}>{event.t}</span>
      <span className={styles.sev} data-sev={event.sev}>
        {event.sev}
      </span>
      <span className={styles.svc}>{event.svc}</span>
      <span className={styles.msg}>{event.msg}</span>
    </div>
  );
}
```

- [ ] **Step 5: Write `LiveEvents.tsx`**

`packages/client-prototype/src/admin/Events/LiveEvents.tsx`:

```tsx
import type { ReactElement } from "react";

import { EventRow } from "#/admin/Events/EventRow";
import styles from "#/admin/Events/LiveEvents.module.css";
import type { AdminEvent } from "#/admin/types";

// PROTO L712-717: the live event feed — a count header over a scrollable log.
export function LiveEvents({ events }: { events: AdminEvent[] }): ReactElement {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>LIVE EVENTS</span>
        <span className={styles.count}>{events.length} events</span>
      </div>
      <div className={styles.list}>
        {events.map((event) => {
          return <EventRow key={event.id} event={event} />;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests and make sure they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-events`
Expected: PASS.

- [ ] **Step 7: Run the per-task gate.**

- [ ] **Step 8: Commit**

```bash
git add packages/client-prototype/src/admin/Events/ packages/client-prototype/tests/admin-events.test.tsx
git commit -m "feat(client-prototype): P5 Task 8 — live event feed"
```

---

## Task 9: Screen composition — `AdminScreen`

**Files:**
- Create: `packages/client-prototype/src/admin/AdminScreen.tsx`
- Create: `packages/client-prototype/src/admin/AdminScreen.module.css`
- Test: `packages/client-prototype/tests/admin-screen.test.tsx`

**Interfaces:**
- Consumes: `useAdminMetrics` (`#/admin/useAdminMetrics`); `kpisVm`, `servicesVm`, `throughputVm` (`#/admin/adminVm`); `KpiRow`, `ThroughputChart`, `LatencyHistogram`, `ServiceHealth`, `LiveEvents`; `Panel` (`#/layout/Panel`).
- Produces: `AdminScreen()` — root `<section data-testid="admin-screen">`.

- [ ] **Step 1: Write the failing test**

`packages/client-prototype/tests/admin-screen.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AdminScreen } from "#/admin/AdminScreen";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AdminScreen", () => {
  test("composes the observability panel with all five regions", () => {
    const { getByTestId, getByText } = render(<AdminScreen />);
    expect(getByTestId("admin-screen")).toBeTruthy();
    expect(getByText("◈ Observability")).toBeTruthy();
    expect(getByText("Throughput")).toBeTruthy();
    expect(getByText("MESSAGE THROUGHPUT")).toBeTruthy();
    expect(getByText("LATENCY DISTRIBUTION")).toBeTruthy();
    expect(getByText("SERVICE HEALTH")).toBeTruthy();
    expect(getByText("REFERENCE DATA")).toBeTruthy();
    expect(getByText("LIVE EVENTS")).toBeTruthy();
  });

  test("renders the four KPI labels and six latency buckets", () => {
    const { getByText } = render(<AdminScreen />);
    for (const label of ["Throughput", "P99 Latency", "Error Rate", "Active Sessions"]) {
      expect(getByText(label)).toBeTruthy();
    }
    for (const bucket of ["<10", "10-25", "25-50", "50-80", "80-150", "150+"]) {
      expect(getByText(bucket)).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-screen`
Expected: FAIL — cannot resolve `#/admin/AdminScreen`.

- [ ] **Step 3: Write the CSS**

`packages/client-prototype/src/admin/AdminScreen.module.css`:

```css
.screen {
  display: flex;
  min-height: 0;
  height: 100%;
}

.head {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-family: var(--font-d, sans-serif);
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.nominal {
  font-family: var(--font-m, monospace);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--buy);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.charts {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 12px;
}

.bottom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
```

- [ ] **Step 4: Write `AdminScreen.tsx`**

`packages/client-prototype/src/admin/AdminScreen.tsx`:

```tsx
import type { ReactElement } from "react";

import { kpisVm, servicesVm, throughputVm } from "#/admin/adminVm";
import styles from "#/admin/AdminScreen.module.css";
import { LiveEvents } from "#/admin/Events/LiveEvents";
import { KpiRow } from "#/admin/Kpis/KpiRow";
import { LatencyHistogram } from "#/admin/Latency/LatencyHistogram";
import { ServiceHealth } from "#/admin/Services/ServiceHealth";
import { ThroughputChart } from "#/admin/Throughput/ThroughputChart";
import { useAdminMetrics } from "#/admin/useAdminMetrics";
import { Panel } from "#/layout/Panel";

function noToggle(): void {}

// PROTO L682-720: the Admin / Observability screen — a single full-width panel
// (no dock/splits, not maximizable) over three rows: KPIs, charts, bottom.
export function AdminScreen(): ReactElement {
  const { metrics, events, latBars } = useAdminMetrics();
  const kpis = kpisVm(metrics);
  const throughput = throughputVm(metrics.tput);
  const services = servicesVm();

  return (
    <section className={styles.screen} data-testid="admin-screen">
      <Panel
        id="observability"
        maxPanel={null}
        onToggleMax={noToggle}
        maximizable={false}
        head={
          <div className={styles.head}>
            <span className={styles.title}>◈ Observability</span>
            <span className={styles.nominal}>● ALL SYSTEMS NOMINAL</span>
          </div>
        }
      >
        <div className={styles.body}>
          <KpiRow kpis={kpis} />
          <div className={styles.charts}>
            <ThroughputChart line={throughput.line} area={throughput.area} />
            <LatencyHistogram bars={latBars} />
          </div>
          <div className={styles.bottom}>
            <ServiceHealth services={services} />
            <LiveEvents events={events} />
          </div>
        </div>
      </Panel>
    </section>
  );
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `pnpm --filter @rtc/client-prototype exec vitest run admin-screen`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the per-task gate** (all five checks including stylelint).

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/admin/AdminScreen.tsx packages/client-prototype/src/admin/AdminScreen.module.css packages/client-prototype/tests/admin-screen.test.tsx
git commit -m "feat(client-prototype): P5 Task 9 — AdminScreen composition"
```

---

## Task 10: Wire the shell + retire the placeholder

`admin` is the **last** placeholder tab. After this task all four tabs (`fx`, `credit`, `equities`, `admin`) render real screens, so `PlaceholderPanel` and its CSS become dead code — knip (`pnpm lint:dead`) would fail on the unused exports/files. This task deletes both and repoints the placeholder-nav test to assert the Admin screen.

**Files:**
- Modify: `packages/client-prototype/src/shell/AppShell.tsx`
- Delete: `packages/client-prototype/src/shell/PlaceholderPanel.tsx`
- Delete: `packages/client-prototype/src/shell/PlaceholderPanel.module.css`
- Modify: `packages/client-prototype/tests/shell.test.tsx`

**Interfaces:**
- Consumes: `AdminScreen` from `#/admin/AdminScreen`.

- [ ] **Step 1: Update the shell test**

In `packages/client-prototype/tests/shell.test.tsx`, replace the first test (`"nav switches the active placeholder panel"`, which clicks `ADMIN` and asserts `getByTestId("panel-admin")`) with an Admin-screen assertion mirroring the equities test:

```tsx
test("admin tab shows AdminScreen", () => {
  boot();
  fireEvent.click(screen.getByText("ADMIN"));
  expect(screen.getByTestId("admin-screen")).toBeDefined();
  expect(screen.queryByTestId("panel-admin")).toBeNull();
});
```

Leave the other tests untouched.

- [ ] **Step 2: Run the shell test to verify it fails**

Run: `pnpm --filter @rtc/client-prototype exec vitest run shell`
Expected: FAIL — `admin-screen` testid not found (shell still renders `PlaceholderPanel`).

- [ ] **Step 3: Wire `AdminScreen` and drop the placeholder in `AppShell.tsx`**

Remove the `PlaceholderPanel` import; add the `AdminScreen` import (alphabetical — `#/admin/…` sorts first). Replace the screen-selection ternary so `admin` is the final branch (the `Tab` union is exhaustive: `fx | credit | equities | admin`).

Import block (Biome will finalise ordering; target):

```tsx
import type { ReactElement } from "react";

import { AdminScreen } from "#/admin/AdminScreen";
import { CreditScreen } from "#/credit/CreditScreen";
import { EquitiesScreen } from "#/equities/EquitiesScreen";
import { FxScreen } from "#/fx/FxScreen";
import styles from "#/shell/AppShell.module.css";
import { AmbientBackground } from "#/shell/ambient/AmbientBackground";
import { Header } from "#/shell/Header/Header";
import type { Tab } from "#/shell/Header/useMenus";
import { StatusBar } from "#/shell/StatusBar/StatusBar";
```

Screen selection (replaces the `tab === "equities" ? … : <PlaceholderPanel … />` tail):

```tsx
          {tab === "fx" ? (
            <FxScreen />
          ) : tab === "credit" ? (
            <CreditScreen />
          ) : tab === "equities" ? (
            <EquitiesScreen />
          ) : (
            <AdminScreen />
          )}
```

- [ ] **Step 4: Delete the dead placeholder files**

```bash
git rm packages/client-prototype/src/shell/PlaceholderPanel.tsx packages/client-prototype/src/shell/PlaceholderPanel.module.css
```

- [ ] **Step 5: Run the full package suite**

Run: `pnpm --filter @rtc/client-prototype test`
Expected: PASS — all suites green, including the updated `shell` test and the new admin suites.

- [ ] **Step 6: Run the per-task gate AND the repo-wide CI-only gates**

```bash
pnpm exec biome check --write packages/client-prototype
pnpm --filter @rtc/client-prototype typecheck
pnpm exec eslint packages/client-prototype
pnpm exec stylelint "packages/client-prototype/src/**/*.css"
pnpm exec biome ci packages/client-prototype
pnpm lint:dead
pnpm check:deps
pnpm check:versions
pnpm test:rules
```
Expected: all clean. In particular `pnpm lint:dead` must report no unused files/exports (confirms `PlaceholderPanel` removal is complete and nothing else was orphaned).

- [ ] **Step 7: Commit**

```bash
git add packages/client-prototype/src/shell/AppShell.tsx packages/client-prototype/tests/shell.test.tsx
git commit -m "feat(client-prototype): P5 Task 10 — wire AdminScreen, retire PlaceholderPanel"
```

---

## Final: whole-branch review

After Task 10, dispatch the opus whole-branch review (superpowers:requesting-code-review) over `git merge-base origin/main HEAD`..`HEAD`. Focus areas — render purity (RNG only in `useAdminMetrics`, ref-lazy-init seed), the CSS-Modules taxonomy (no inline colour strings; all colour via `data-*`), fidelity to the three documented deviations (§3), and any jsdom-invisible geometry/paint issues (histogram bar heights via `--bar-h`, service bar widths via `--bar-pct`, sparkline/throughput SVG stroke colours). Then ship via superpowers:shipping-repo-changes.

## Self-Review

**1. Spec coverage:**
- §2 single full-width Panel, 3 rows → Task 9 ✓; KPI row → Task 4 ✓; throughput → Task 5 ✓; latency histogram → Task 6 ✓; service health (REFERENCE DATA DEGRADED) → Task 7 ✓; live events → Task 8 ✓; live engine (850ms, capped feed) → Task 3 ✓; view-models → Task 2 ✓; data/types → Task 1 ✓; shell wiring + placeholder retirement → Task 10 ✓.
- §3 deviations: latency seeded once → `seedLatBars` (Task 1) + used once in engine (Task 3) ✓; synthetic event pool → `EVENT_POOL` (Task 1) + emitter (Task 3) ✓; static services → `SERVICES` + `servicesVm` (Tasks 1–2) ✓.
- §5 testing: data, engine (fake timers + StrictMode), vm, screen, shell → Tasks 1–3, 9, 10 ✓.

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code and exact commands. ✓

**3. Type consistency:** `AdminKpi`/`Service`/`AdminEvent`/`LatBar`/`AdminMetrics`/`MetricKey` defined in Task 1 and consumed unchanged in Tasks 2–9. `useAdminMetrics` returns `{ metrics, events, latBars }` (Task 3), destructured identically in Task 9. `throughputVm → { line, area }` (Task 2) consumed as `line`/`area` props by `ThroughputChart` (Task 5) and passed in Task 9. `servicesVm(): Service[]` no-arg (Task 2), called in Task 9. `kpisVm(metrics)` (Task 2) → `KpiRow kpis` (Task 4). ✓
