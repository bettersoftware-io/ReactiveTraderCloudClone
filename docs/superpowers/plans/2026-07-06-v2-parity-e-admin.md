# v2 Parity E — Admin Observability Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Admin screen as the prototype's observability board — 4 glowing KPI cards with sparklines, MESSAGE THROUGHPUT gradient-glow area chart, LATENCY DISTRIBUTION histogram, SERVICE HEALTH rows, LIVE EVENTS log with severity chips, `● ALL SYSTEMS NOMINAL` head pill — while **keeping** incident controls, sessions, service topology and throughput control as restyled prototype-grade cards (spec G4 decision).

**Architecture:** Port from `packages/client-prototype/src/admin/*` onto real seams: `useMetrics()`/`useEventLog()`/`useSessions()`/`useTopology()`/`useIncident()`/`useThroughput()` backed by the telemetry presenters and domain simulators. New derived view-models live in client-core (pure functions + one small presenter for the sessions KPI series). Admin stays a single `admin-dashboard` panel (prototype is a single Observability panel too); it gains a registered head with the nominal/incident pill.

**Tech Stack:** React 19, CSS Modules, @rtc/client-core presenters, SVG (no canvas), dual golden sets.

## Global Constraints

Same as plan C (cd-prefix every Bash command, branch assert, per-file biome + eslint×2, no lint-disables, no inline styles — SVG geometry via CSS custom properties or attribute values computed in vms, pinned px line-heights, literal glyphs, coverage ≥95%, full-suite golden regens, x86 via workflow, knip, e2e in final gauntlet). `useId()` for SVG gradient ids (PR #114 PnlChart precedent).

## Key seam facts

- ViewModel admin hooks: `useMetrics(): {throughput, latency, errorRate: readonly MetricSample[]}` (60-sample windows via `windowedSamples`), `useTopology(): ServiceTopology|null`, `useEventLog(): readonly LogEvent[]` (newest-first, `EventLogPresenter` `refCount:false` singleton), `useSessions(): readonly SessionInfo[]`, `useIncident(): {state: IncidentState} & IncidentIntents`, `useThroughput()`.
- Domain: `MetricSample {t, value}`; `LogEvent {t, severity: "info"|"warn"|"error", service, message}` (prototype chips are UPPERCASE — map in vm); `ServiceNode {name, status: "ok"|"degraded"|"down", throughput, latencyMs}`; sessions re-emit every 5s.
- Prototype vms are pure and portable: `sparkPoints(arr)` (100×28 inverted), `kpisVm(metrics)` (delta vs lookback 9; warn thresholds lat>60, err>0.8), `throughputVm(tput)` (300×96, `area = M0,96 …pts L300,96 Z`), `LatBar {label, heightPct, accent}` buckets `["<10","10-25","25-50","50-80","80-150","150+"]`.
- Incident state drives the head pill: `active.length === 0` → `● ALL SYSTEMS NOMINAL` (buy-green); else `● INCIDENT ACTIVE` (warn) — real wiring the prototype fakes.
- Visual/e2e surfaces: scenarios `app/admin`, `admin/*`; testids `admin-throughput-chart`, `admin-error-rate`, `admin-latency-histogram`, `admin-topology`, `admin-sessions`, `admin-event-log`, `admin-incident-controls`, `incident-*`; e2e scenario `tests/browser/scenarios/adminIncident.ts` (incident controls KEPT — scenario must stay green).

---

### Task 1: Admin KPI view-models (client-core)

**Files:**
- Create: `packages/client-core/src/presenters/adminKpisVm.ts` (pure: `sparkPoints`, `kpisVm`, `throughputPaths`, `latencyBuckets`) + test; `SessionsKpiPresenter.ts` (scan-accumulated session-count `MetricSample[]` window, `shareReplay({refCount: false})` — the PR #118 remount lesson) + test
- Modify: `packages/react-bindings/src/createViewModel.ts` (+ test) — `useSessionCountSeries(): readonly MetricSample[]`
- Port source: `packages/client-prototype/src/admin/adminVm.ts`, `adminData.ts` (vm math only — the RNG walk stays in domain simulators)

**Interfaces:**
```ts
interface AdminKpiVm { key: "tput"|"lat"|"err"|"sess"; label: string; value: string; unit: string;
  delta: string; deltaUp: boolean; warn: boolean; spark: string }
kpisVm(input: {throughput; latency; errorRate; sessions: readonly MetricSample[]}): AdminKpiVm[]
throughputPaths(samples: readonly MetricSample[]): { line: string; area: string }   // 300×96
latencyBuckets(samples: readonly MetricSample[]): readonly LatBarVm[]               // 6 fixed buckets, accent = modal bucket
```
Formatters per prototype: tput `(v/1000).toFixed(2)` unit `k msg/s`; lat rounded `ms` warn>60; err `.toFixed(2)` `%` warn>0.8; sess rounded. Delta vs 9-samples-back.

- [ ] Failing pure-vm tests (spark string geometry, delta sign, warn thresholds, bucket assignment incl. edge values 10/25/50/80/150, area path closes at y=96) + presenter test (count series survives resubscribe) → implement → green → commit `feat(client-core): admin observability view-models`.

### Task 2: KPI row + throughput chart + latency histogram (UI port)

**Files:**
- Create: `packages/client-react/src/ui/admin/kpis/KpiRow.tsx` + `.module.css`, `KpiCard.tsx`, `KpiSparkline.tsx`
- Rewrite: `ThroughputChart.tsx` + `.module.css` (canvas → SVG gradient-glow area, `useId()` gradient, head `MESSAGE THROUGHPUT` / `last 60s · msg/s`), `LatencyHistogram.tsx` + `.module.css` (6 labeled buckets, `--bar-h` height vars, `data-accent` modal bucket, head `LATENCY DISTRIBUTION` / `ms`)
- Delete: `MetricGauges.tsx` + `.module.css`, `ErrorRatePanel.tsx` + `.module.css` (both subsumed by KPI cards — error rate is a KPI)
- Port source: `packages/client-prototype/src/admin/{Kpis,Throughput,Latency}/*`
- Test: contract specs updated (`MetricGauges`/`ErrorRatePanel` specs retired; KPI specs added; keep testids `admin-throughput-chart`, `admin-latency-histogram`)

**Interfaces:** `KpiCard` colors via `data-kpi`/`data-warn`/`data-delta-up`; sparkline `<svg viewBox="0 0 100 30">` polyline. All geometry from Task 1 vms — components stay dumb.

- [ ] Failing contract tests → implement → green → commit `feat(admin): KPI row + prototype charts`.

### Task 3: Service health + live events (UI port)

**Files:**
- Create: `packages/client-react/src/ui/admin/services/ServiceHealth.tsx` + `.module.css`, `ServiceRow.tsx`
- Rewrite: `LiveEventLog.tsx` + `.module.css` (prototype `LiveEvents` chrome: head `LIVE EVENTS` + `{n} events`, rows time + severity chip `data-sev` INFO/WARN/ERROR + svc + msg; keep testid `admin-event-log`)
- Port source: `packages/client-prototype/src/admin/{Services,Events}/*`
- Test: contract specs (severity uppercase mapping; service rows derive from topology)

**Interfaces:** `ServiceHealth` rows derived from `useTopology()` nodes: name, status dot `data-status` (ok→ONLINE, degraded→DEGRADED, down→DOWN — third state is real-app extra, style it error-red), utilisation bar `--bar-pct` = clamp(throughput-based %), latency `{latencyMs}ms`, uptime % (derive: ok 99.9x stable per name hash, degraded 98.x, down 0 — deterministic pure function, no RNG in UI).

- [ ] Failing contract tests → implement → green → commit `feat(admin): service health + live events`.

### Task 4: Dashboard restructure + head pill + restyle retained cards

**Files:**
- Rewrite: `AdminDashboard.tsx` + `.module.css` — rows: (1) `KpiRow`; (2) charts grid `1.6fr 1fr` → ThroughputChart + LatencyHistogram; (3) grid `1fr 1fr` → ServiceHealth + LiveEventLog; (4) retained grid → ServiceTopologyGraph, SessionsPanel, IncidentControls, AdminPanel (throughput control) as prototype-grade cards (panel-tone backgrounds, uppercase card heads — restyle CSS only, components' internals untouched except class hooks)
- Create: `packages/client-react/src/ui/admin/AdminHead.tsx` (◈ Observability + nominal/incident pill from `useIncident()`)
- Modify: `appHeadRegistry.tsx` (`"admin-dashboard": () => <AdminHead/>`)
- Test: contract specs (dashboard region order; pill flips on inject — drive `useIncident` fake), `adminIncident` e2e scenario stays green

- [ ] Failing contract tests → implement → green → commit `feat(admin): observability board layout + head`.

### Task 5: Visual scenarios, goldens, e2e, gauntlet, PR

- [ ] Visual registry/scenarios: retire `MetricGauges`/`ErrorRatePanel` entries; add KPI/ServiceHealth scenarios; refresh `admin/*` + `app/admin`; FULL-SUITE local golden regen (admin goldens WILL all change — force-refresh regardless of AA pass status, the green-stale lesson).
- [ ] e2e: `adminIncident.ts` scenario + testids contract — verify `incident-*`, `admin-*` testids still resolve; update selectors if the dashboard re-nest moved them.
- [ ] Full gauntlet + knip + `RTC_E2E_SKIP_CYPRESS=1 test:e2e`; live side-by-side vs :8899 Admin.
- [ ] Push, PR (base main), x86 golden workflow, sync, CI loop per shipping-repo-changes.
