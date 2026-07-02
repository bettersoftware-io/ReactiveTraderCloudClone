# P5 — Admin / Observability Screen (`@rtc/client-prototype`) — Design

> Design artifact for the P5 phase of the `@rtc/client-prototype` workstream.
> Ports the **Admin / Observability** screen from the `docs/design/v2` prototype
> (`dev-handoff/prototype/source/Reactive Trader.dc.html`, markup ll. 680–800,
> data/logic ll. 809, 825, 1136, 1370–1438). Follows the P2/P2.5/P3/P4 patterns:
> self-contained readable React 19 + Vite port, full CSS Modules, `#/` subpath
> imports, smoke-only Vitest, no `@rtc/domain`/`@rtc/shared`, no RxJS/machines,
> no ViewModel seam, no React Compiler.

## 1. Purpose

Replace the `admin` → `PlaceholderPanel` fallback in the shell with a live
**Observability dashboard**: rolling KPI cards, an animated message-throughput
chart, a latency-distribution histogram, a service-health list, and a live
event feed. This is the fifth screen module and the last feature screen before
P6 (parity pass).

The screen exists to showcase "observability coming alive": four metric series
tick on a timer and every derived view (KPI value, delta, threshold colour,
sparkline, throughput area chart) re-renders, while a synthetic telemetry feed
streams new events.

## 2. Scope

### In scope

- New self-contained `packages/client-prototype/src/admin/` module.
- A single full-width `Panel` (`#/layout/Panel`, `maximizable={false}`) titled
  `◈ Observability` with an `● ALL SYSTEMS NOMINAL` status marker.
- Three stacked content rows (exact prototype layout):
  1. **KPI row** — 4 cards in `repeat(4, 1fr)`: Throughput (k msg/s), P99 Latency
     (ms), Error Rate (%), Active Sessions. Each card: uppercase label, large
     value + unit, ▲/▼ delta vs 9 ticks ago, threshold-based colour, and a
     bottom SVG sparkline.
  2. **Charts row** (`1.6fr 1fr`) — Message Throughput SVG area+line chart
     (gradient fill, glow line) + Latency Distribution histogram (6 div bars).
  3. **Bottom row** (`1fr 1fr`) — Service Health (6 rows: status dot, name,
     div bar, latency, uptime; `REFERENCE DATA` is `DEGRADED`) + Live Events
     feed (severity-tagged scrollable log).
- A live `useAdminMetrics` engine hook: 850 ms tick advancing four rolling
  48-point series + emitting synthetic telemetry events into a capped feed.
- Pure view-model derivations (`adminVm.ts`) for KPIs, throughput paths, and
  services.
- Wiring into `shell/AppShell.tsx` (`admin` branch) + `shell.test.tsx` update.
- Smoke-only Vitest coverage.

### Out of scope

- Driving the shell `StatusBar` footer (`LAT/TPUT/FPS/MEM/SES`) from these
  metrics — it currently reads static `#/mock/shellData`; cross-wiring it is a
  **P6 parity** concern.
- `client-react` HUD Admin extras that are **not** in the v2 prototype: service
  topology graph, incident/break-glass controls, throughput-control card.
- Real telemetry / metrics endpoints — mock data only.
- Any change to other screens, the shared layout primitives, or the theme.

## 3. Fidelity notes — deliberate deviations

Three faithful-but-scoped deviations, each in the spirit of P4's stable `vol`:

1. **Latency histogram seeded once.** The prototype recomputes each bar height
   with `Math.random()` on every render (`latBars`, l. 1382) — visible jitter
   driven by the global tick. We seed the jitter **once** from the frozen module
   RNG (render purity; `useState`/`useMemo` initializers are StrictMode
   double-invoked, so the seed lives in the engine hook, computed once). The
   histogram reads as a settled distribution.

2. **Live Events fed by a synthetic telemetry pool.** The prototype's
   `adminEvents` (l. 1389) concatenates cross-screen FX trading `activity` with a
   static `seedEvents` list. The client-prototype modules are self-contained and
   share no cross-screen activity bus, so the feed instead seeds from
   `SEED_EVENTS` and emits new events from a fixed `EVENT_POOL` on the tick
   (prepended, capped). This preserves the "live events" intent without
   reintroducing cross-module coupling.

3. **Service health is static.** Matches the prototype — its `services` array
   (l. 1384) is a static literal with derived colours/bar widths; only the KPI
   series and event feed animate.

## 4. Architecture

### 4.1 Directory layout

```
packages/client-prototype/src/admin/
  types.ts                     # Severity, AdminMetrics, AdminKpi, Service, AdminEvent, LatBar
  adminData.ts                 # seed constants + helpers (gs, stepSeries, seedMetrics, SERVICES, ...)
  useAdminMetrics.ts           # live engine: 850ms tick + event emitter → { metrics, events, latBars }
  adminVm.ts                   # pure derivations: kpisVm, throughputVm, servicesVm
  AdminScreen.tsx / .module.css
  Kpis/
    KpiRow.tsx / .module.css
    KpiCard.tsx
    KpiSparkline.tsx           # SVG polyline
  Throughput/
    ThroughputChart.tsx / .module.css   # SVG area + line
  Latency/
    LatencyHistogram.tsx / .module.css  # div bars
  Services/
    ServiceHealth.tsx / .module.css
    ServiceRow.tsx
  Events/
    LiveEvents.tsx / .module.css
    EventRow.tsx
```

Chart-rendering split follows the **existing client-prototype precedent**, not a
new choice: SVG for line/area (`fx/Analytics/PnlSparkline.tsx` already does
`<svg><path/><polyline/>` + gradient via `useId`); divs for bars
(`fx/Analytics/PairPnlBars`). The prototype's Admin markup uses exactly this
split.

### 4.2 Data & types (`types.ts`, `adminData.ts`)

```ts
// types.ts
export type Severity = "INFO" | "WARN" | "ERROR";
export type MetricKey = "tput" | "lat" | "err" | "sess";
export type AdminMetrics = Record<MetricKey, number[]>; // each length SERIES_LEN
export interface AdminKpi { key: MetricKey; label: string; value: string; unit: string;
  delta: string; deltaColor: string; color: string; spark: string; }
export interface Service { name: string; status: "ONLINE" | "DEGRADED"; up: string;
  lat: string; color: string; barPct: number; }
export interface AdminEvent { id: number; t: string; sev: Severity; svc: string; msg: string; }
export interface LatBar { label: string; heightPct: number; accent: boolean; }
```

`adminData.ts`:

- `SERIES_LEN = 48`.
- `METRIC_CFG: Record<MetricKey, { center; spread; step; min; max }>` with the
  prototype constants:
  - `tput`: seed `gs(48, 1200, 160)`, step `stp(·, 150, 600, 2200)`
  - `lat`:  seed `gs(48, 42, 9)`,    step `stp(·, 7, 8, 90)`
  - `err`:  seed `gs(48, 0.4, 0.18)`, step `stp(·, 0.16, 0, 2.2)`
  - `sess`: seed `gs(48, 1280, 36)`,  step `stp(·, 28, 900, 1800)`
- `gs(n, center, spread, rng)` → `number[]` (proto l. 809, using injected `rng`).
- `stepSeries(arr, step, min, max, rng)` → `number[]` (proto `stp`, l. 1136:
  window-shift + clamped random walk, `toFixed(3)`).
- `seedMetrics(rng)` → `AdminMetrics`.
- `SERVICES` — 6 static literals (proto l. 1384): PRICING ENGINE 99.99%/8,
  EXECUTION 99.98%/14, BLOTTER STREAM 100%/6, EQUITIES FEED 99.96%/10,
  REFERENCE DATA `DEGRADED` 99.40%/48, CREDIT RFQ 99.97%/12.
- `LAT_BUCKETS` — `[label, base][]`: `<10`/14, `10-25`/40, `25-50`/76 (accent
  bucket), `50-80`/46, `80-150`/20, `150+`/6 (proto l. 1381).
- `seedLatBars(rng)` → `LatBar[]` — base + `Math.random()*8-4` jitter, computed
  **once** (deviation §3.1); bucket index 2 is the accent bar.
- `SEED_EVENTS` — the prototype `seedEvents` literal (INFO/WARN/ERROR across
  analytics/refdata/pricing/…).
- `EVENT_POOL` — fixed synthetic telemetry templates for the live feed
  (`{ sev, svc, msg }`), e.g. `INFO pricing "Subscribed N instruments"`,
  `WARN refdata "Latency Nms exceeds SLO"`, `INFO analytics "Snapshot
  recomputed in Nms"`.
- `EVENT_CAP = 30`, `TICK_MS = 850`, `EVENT_EVERY_TICKS = 4` (a synthetic event
  every 4th tick, ~3.4 s).
- Formatters (`fmtInt`, `fmt2`, etc.) as needed.

### 4.3 Engine (`useAdminMetrics.ts`)

- Frozen `rngRef` (seeded PRNG, created once — `useRef`, never re-seeded).
- **Render-body ref-lazy-init** seed (StrictMode-safe): `seedRef.current` holds
  `{ metrics, latBars }` produced once from `rngRef`; `useState` is initialized
  from the ref, so the RNG is not advanced twice by StrictMode's double render.
- `events` state initialized from `SEED_EVENTS` (with ids).
- `useEffect` sets a `setInterval(TICK_MS)`:
  - steps every series via `stepSeries` (RNG in the interval callback, not in
    render);
  - every `EVENT_EVERY_TICKS`, prepends one `EVENT_POOL` event (timestamp from
    `new Date().toTimeString().slice(0,8)`, monotonic id from a ref counter),
    capped at `EVENT_CAP`.
  - cleared on unmount.
- Returns `{ metrics, events, latBars }`. All RNG lives in this one hook.

### 4.4 View-models (`adminVm.ts`) — pure

- `sparkPoints(arr)` → SVG polyline points string over a `0..100 × 0..28` box
  (proto `spark100`, l. 1373).
- `kpisVm(metrics)` → `AdminKpi[]` (proto `kpi`, l. 1374): current value +
  formatted delta vs `arr[len-9]`, delta colour buy/sell, threshold colour
  (lat > 60 → sell; err > 0.8 → sell; tput/sess fixed), sparkline points.
- `throughputVm(tput)` → `{ line, area }` SVG path strings over `300 × 96`
  (proto l. 1380).
- `servicesVm()` → `Service[]` with derived colour (ONLINE→buy, DEGRADED→accent)
  and `barPct = min(100, lat/60*100)` (proto l. 1384).

### 4.5 Components

- `AdminScreen.tsx` — calls `useAdminMetrics`, derives via the vms, renders the
  `Panel` (`head` = `◈ Observability` + status marker) and the three rows.
- `Kpis/KpiRow` + `KpiCard` + `KpiSparkline` (SVG polyline, `stroke=k.color`).
- `Throughput/ThroughputChart` — SVG `<path>` area (gradient via `useId`) +
  `<polyline>` line with glow.
- `Latency/LatencyHistogram` — div bars from `latBars`; height + accent flag via
  named-const `--custom-property` style objects typed `CSSProperties`.
- `Services/ServiceHealth` + `ServiceRow` — div bars; colour via `data-*`/custom
  property.
- `Events/LiveEvents` + `EventRow` — severity tag colour by `data-sev`
  (INFO=buy, WARN=accent, ERROR=sell), scrollable body.

CSS-Modules taxonomy (workstream rule): static → class; semantic state → `data-*`
(`String(bool)`, never inline colour strings); runtime geometry → named-const
`style={x}` typed `as CSSProperties` setting only `--custom-property`s.

## 5. Testing (smoke-only Vitest)

- `admin-data` — `seedMetrics` shapes/lengths; `stepSeries` shifts window,
  appends in-bounds; `seedLatBars` deterministic under a seeded RNG.
- `admin-engine` — `useAdminMetrics` under **fake timers**: series advance on
  tick; events prepend + cap at 30; StrictMode double-mount does not
  double-advance the seed.
- `admin-vm` — `kpisVm` delta sign/colour + threshold colour (lat > 60,
  err > 0.8); `throughputVm` returns non-empty `line`/`area`; `servicesVm`
  colour + `barPct` (DEGRADED → accent).
- `admin-screen` — renders panel head, all four KPI labels, throughput svg,
  6 latency labels, 6 service names (incl. DEGRADED), event rows.
- `shell` — `admin` tab renders `AdminScreen` (repoint the placeholder-nav test;
  Admin is no longer a placeholder).

House test pattern: `renderHook(() => useX())` + `render(<Comp .../>)` +
`rerender` to avoid the `useComponentExportOnlyModules` ↔ `noExportsInTest`
conflict without disables.

## 6. Global constraints

- Package boundary: no `@rtc/domain`/`@rtc/shared`, no RxJS/machines, no
  ViewModel seam, no React Compiler. Runtime deps: React 19 only.
- `#/` subpath imports (`"#/*": "./src/*"`); never `../../`.
- **Render purity (StrictMode):** all RNG/persistence in the engine hook; seed
  via render-body **ref-lazy-init** (never in `useState`/`useMemo` initializers
  or setState updaters — all double-invoked). Freeze the RNG in a `useRef`.
- Lint (no `eslint-disable`): `arrow-body-style: always`; module-level `function`
  declarations; `func-style` (inner closures are `function` decls);
  `rtc/component-newspaper` (exported component is file lede, filename matches,
  private sub-components below); `rtc/newspaper-order` (types/helpers/`vi.mock`
  below `describe`); `useExplicitType` (annotate non-inferrable consts);
  `useUniqueElementIds` (logical panel ids via bottom-declared `const`).
- Per-task gate (all green before commit): `pnpm --filter @rtc/client-prototype
  typecheck` · `test` · `pnpm exec eslint packages/client-prototype` ·
  `pnpm exec stylelint "packages/client-prototype/src/**/*.css"` ·
  `pnpm exec biome ci packages/client-prototype`.
- Repo-wide CI-only gates (run before shipping): `pnpm lint:dead` (knip — no
  dead exports), `pnpm check:deps`, `pnpm check:versions`, `pnpm test:rules`.
- Never `git add .` — stage only named files.

## 7. Task decomposition (preview — finalized in the plan)

1. `types.ts` + `adminData.ts` (constants, `gs`, `stepSeries`, `seedMetrics`,
   `seedLatBars`, `SERVICES`, `LAT_BUCKETS`, `SEED_EVENTS`, `EVENT_POOL`) + data
   tests.
2. `useAdminMetrics` engine (tick + event emitter, ref-lazy-init seed) + engine
   tests.
3. `adminVm` (`kpisVm`, `throughputVm`, `servicesVm`, `sparkPoints`) + vm tests.
4. `Kpis/` (KpiRow, KpiCard, KpiSparkline) + css + test.
5. `Throughput/ThroughputChart` (SVG area+line) + css + test.
6. `Latency/LatencyHistogram` (div bars) + css + test.
7. `Services/ServiceHealth` + `ServiceRow` (div bars) + css + test.
8. `Events/LiveEvents` + `EventRow` + css + test.
9. `AdminScreen` composition + css + screen test.
10. Wire `AppShell` `admin` branch + update `shell.test.tsx`.
