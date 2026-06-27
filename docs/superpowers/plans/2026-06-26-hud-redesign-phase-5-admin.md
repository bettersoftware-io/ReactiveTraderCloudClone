# Phase 5: Admin Observability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing `AdminPort` + `ThroughputSimulator` seam into a full ops dashboard: domain telemetry types, four new ports (`TelemetryPort`, `ServiceHealthPort`, `EventLogPort`, `SessionsPort`) with seedable deterministic simulators, an app-layer `IncidentMachine` that perturbs telemetry/topology AND pushes a `gatewayDisconnected` event through the **existing `connectionEvents` seam** so the FX/Credit connection banners react live, presenters/hooks, dumb CSS-modules UI (gauges, charts, histogram, topology graph, live log, incident controls), and the full test contract (domain unit+golden, port contracts, UI-contract + react trios, visual goldens, e2e for the incident flow). The `AdminPort`/`ThroughputSimulator`/`ThroughputPresenter`/throughput control are **retained unchanged** — Admin grows around them.

**Architecture:** The existing dependency-inversion grain is preserved. New domain code lives in `packages/domain/src/telemetry/*` (entities) + `packages/domain/src/ports/*` (port interfaces) + `packages/domain/src/simulators/*` (in-memory implementations), exported through `simulators/index.ts` and `domain/src/index.ts`. `@rtc/domain` stays rxjs-only. New simulators register through `createSimulatorPorts()` / `createWsRealPorts()` in `portFactory.ts` (only the simulator branch is wired live; the WS branch returns simulator instances since no new wire RPCs are added). The `IncidentMachine` (`createIncidentMachine`) is an app-layer machine returning `Machine<IncidentState, IncidentIntents>` from `#/app/presenters/machine`. It holds **control inputs** into the new simulators (so `inject()` perturbs telemetry/topology) and an injected `pushConnectionEvent(ev: ConnectionEvent)` sink wired in `composition.ts` to the existing `connectionEvents` merge — that is the concrete, tested coupling that makes `ConnectionStatusBar`/`ConnectionOverlay` react. Presenters are framework-neutral; hooks bind via `@react-rxjs/core` `bind` (read streams) and `useMachine` (the `IncidentMachine`). The Admin panel is registered in the Phase-1 `PanelRegistry` (`"admin": () => <AdminDashboard />`), exactly as Phase 4 registers the Equities panel — Phase 1 replaces `Workspace.tsx` with the `LayoutPort`-backed `InhouseLayoutEngine` + `PanelRegistry`, so admin mounting goes through the registry, not `Workspace.tsx`.

**Tech Stack:** TypeScript, RxJS (domain + presenters), `@rx-state/core` `state()` (machines), `@react-rxjs/core` `bind` (read hooks), React 19 dumb UI, CSS Modules + `var(--token)` + semantic `data-*`, Canvas 2D / SVG for charts (PnlChart precedent), Vitest (domain + app + UI-contract), Playwright (visual goldens, dual set), cucumber-js presenter tier + Playwright browser tier (`@rtc/tests`).

## Global Constraints

Verbatim from `2026-06-26-hud-redesign-interfaces.md`. **Shared interfaces: see [`2026-06-26-hud-redesign-interfaces.md`](2026-06-26-hud-redesign-interfaces.md) §7 (Admin telemetry domain) — every type/signature below is pinned there.**

- **Import alias:** `#/*` → `./src/*`, `#tests/*` → `./tests/*` (client-react). At most one `../` up; deeper uses `#/` (Biome `noRestrictedImports` bans `../../**`). Domain uses relative `*.js` ESM specifiers.
- **Domain purity:** `@rtc/domain` imports only `rxjs` at runtime; no Node built-ins in production source (dependency-cruiser `domain-no-node-builtins`, `domain-stays-pure`).
- **Ports return `Observable<T>`** (even synchronous reads use `of(value)`; mutations return `Observable<void>`).
- **Simulators** are `class X implements XPort`, BehaviorSubject- or `defer/timer/interval`-based, deterministic under `vi.useFakeTimers()`, optional constructor `seed`.
- **Machines** return `Machine<TState, TIntents>` = `{ state$: StateObservable<TState>; intents: TIntents; dispose(): void }` from `#/app/presenters/machine`; keep a warm `state$.subscribe()` released in `dispose()`; `state(stream$, default)` gives a synchronous default. Read-only = `ReadOnlyMachine<T>` = `Machine<T, Record<string, never>>`.
- **Dumb UI** consumes presenters/machines ONLY via `useHooks()` (destructured); no rxjs/localStorage/fetch/setTimeout in `src/ui` (grep-gates 26–29; only `src/ui/hooks/` exempt); styling via CSS Modules + semantic `data-*` + `var(--token)`; only inline style permitted is a computed `--custom-property` geometry value.
- **CSS:** stylelint `declaration-strict-value` forces `color/fill/stroke` to use `var(--token)`; class names camelCase, custom props kebab-case.
- **Per-task gate gauntlet (run before each commit):** `pnpm check` (Biome) · `pnpm lint:eslint` · `pnpm lint:css` · `pnpm check:versions` · `pnpm typecheck` (all packages incl. server) · `pnpm test` · `pnpm build` · `pnpm lint:dead` (knip) · `pnpm check:deps` (dependency-cruiser) · `pnpm lint:eslint:types` (after build) · `pnpm --filter @rtc/tests gates`. Biome-clean ≠ CI-clean.
- **Visual goldens (dual set):** regenerate `react-local/<arch>/` locally via the `:update` scripts; the CI `react/` (x86) set is regenerated by the GitHub Actions workflow at PR time.
- **Commit trailers:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB`.
- **Branch/merge:** all work on `worktree-hud-redesign`; implementation follows the single `git merge --no-ff` to `main` (after all 7 plans are written).

> **Determinism note (binds every simulator task):** every new simulator takes an injectable `seed?: number` and uses a seeded PRNG (the mulberry32 idiom below), never bare `Math.random()`. Streams are `defer(() => concat(of(initial), interval(STEP_MS).pipe(...)))` so `vi.useFakeTimers()` makes goldens stable. Precedent: `PricingSimulator` (`rand` param), `AnalyticsSimulator` (interval walk), `RfqCountdownMachine` (`Date.now()` freeze).
>
> ```typescript
> // Shared seeded-PRNG helper (packages/domain/src/telemetry/prng.ts)
> export function mulberry32(seed: number): () => number {
>   let a = seed >>> 0;
>   return (): number => {
>     a |= 0;
>     a = (a + 0x6d2b79f5) | 0;
>     let t = Math.imul(a ^ (a >>> 15), 1 | a);
>     t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
>     return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
>   };
> }
> ```

---

### Task 1 — Telemetry domain types + seeded PRNG

**Files:**
- `packages/domain/src/telemetry/metrics.ts` (new)
- `packages/domain/src/telemetry/topology.ts` (new)
- `packages/domain/src/telemetry/log.ts` (new)
- `packages/domain/src/telemetry/session.ts` (new)
- `packages/domain/src/telemetry/prng.ts` (new)
- `packages/domain/src/telemetry/prng.golden.test.ts` (new)
- `packages/domain/src/index.ts` (edit — export the new types)

**Interfaces** (from interfaces doc §7, exact):
```typescript
export interface MetricSample { readonly t: number; readonly value: number; }
export type ServiceName = "pricing" | "execution" | "blotter" | "analytics" | "credit" | "refdata" | "kernel";
export type ServiceStatus = "ok" | "degraded" | "down";
export interface ServiceNode { readonly name: ServiceName; readonly status: ServiceStatus; readonly throughput: number; readonly latencyMs: number; }
export interface ServiceEdge { readonly from: ServiceName; readonly to: ServiceName; readonly latencyMs: number; }
export interface ServiceTopology { readonly nodes: readonly ServiceNode[]; readonly edges: readonly ServiceEdge[]; }
export type Severity = "info" | "warn" | "error";
export interface LogEvent { readonly t: number; readonly severity: Severity; readonly service: ServiceName; readonly message: string; }
export interface SessionInfo { readonly id: string; readonly user: string; readonly region: string; readonly lat: number; readonly lon: number; }
```

- [ ] **Step 1 — Failing golden test for the PRNG.** Create `packages/domain/src/telemetry/prng.golden.test.ts`:
  ```typescript
  import { describe, expect, it } from "vitest";

  import { mulberry32 } from "./prng.js";

  describe("mulberry32", () => {
    it("is deterministic for a fixed seed (golden sequence)", () => {
      const rand = mulberry32(42);
      const seq = [rand(), rand(), rand(), rand()].map((n) => Number(n.toFixed(6)));
      expect(seq).toEqual([0.611081, 0.617492, 0.842074, 0.665692]);
    });

    it("two generators with the same seed agree; different seeds diverge", () => {
      const a = mulberry32(7);
      const b = mulberry32(7);
      const c = mulberry32(8);
      expect(a()).toBe(b());
      expect(mulberry32(7)()).not.toBe(c());
    });
  });
  ```
- [ ] **Step 2 — Run, expect FAIL.** `pnpm --filter @rtc/domain test -- prng.golden` → FAIL: `Cannot find module './prng.js'`.
- [ ] **Step 3 — Implement the PRNG + types.** Create `packages/domain/src/telemetry/prng.ts` with the `mulberry32` body from the Determinism note above. Create `metrics.ts`, `topology.ts`, `log.ts`, `session.ts` with the exact interfaces from the Interfaces block (each in its themed file: `MetricSample` → metrics; `ServiceName`/`ServiceStatus`/`ServiceNode`/`ServiceEdge`/`ServiceTopology` → topology; `Severity`/`LogEvent` → log; `SessionInfo` → session).
- [ ] **Step 4 — Run the golden, then check the goldens MATCH the real impl.** `pnpm --filter @rtc/domain test -- prng.golden`. If the asserted sequence differs from the real `mulberry32` output, the *test* is wrong — run once, copy the real first-four values into the expectation, re-run → PASS (golden = pin actual deterministic output).
- [ ] **Step 5 — Export the types.** In `packages/domain/src/index.ts` add a `// Telemetry` block:
  ```typescript
  // Telemetry
  export type { MetricSample } from "./telemetry/metrics.js";
  export type { LogEvent, Severity } from "./telemetry/log.js";
  export type { SessionInfo } from "./telemetry/session.js";
  export type {
    ServiceEdge,
    ServiceName,
    ServiceNode,
    ServiceStatus,
    ServiceTopology,
  } from "./telemetry/topology.js";
  export { mulberry32 } from "./telemetry/prng.js";
  ```
- [ ] **Step 6 — Gate + commit.** `pnpm check && pnpm typecheck && pnpm --filter @rtc/domain test && pnpm build && pnpm check:deps`. Then:
  ```bash
  git add packages/domain/src/telemetry packages/domain/src/index.ts
  git commit -m "feat(domain): telemetry types + seeded mulberry32 PRNG (Phase 5 Task 1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB"
  ```

---

### Task 2 — Ports + contract describers

**Files:**
- `packages/domain/src/ports/telemetryPort.ts` (new)
- `packages/domain/src/ports/serviceHealthPort.ts` (new)
- `packages/domain/src/ports/eventLogPort.ts` (new)
- `packages/domain/src/ports/sessionsPort.ts` (new)
- `packages/domain/src/ports/__contracts__/TelemetryPortContract.ts` (new)
- `packages/domain/src/ports/__contracts__/ServiceHealthPortContract.ts` (new)
- `packages/domain/src/ports/__contracts__/EventLogPortContract.ts` (new)
- `packages/domain/src/ports/__contracts__/SessionsPortContract.ts` (new)
- `packages/domain/src/index.ts` (edit — export the port types)

**Interfaces** (from interfaces doc §7, exact). `AdminPort` is **untouched**:
```typescript
export interface TelemetryPort {
  throughput$(): Observable<MetricSample>;
  latency$(): Observable<MetricSample>;
  errorRate$(): Observable<MetricSample>;
}
export interface ServiceHealthPort { topology$(): Observable<ServiceTopology>; }
export interface EventLogPort { events$(): Observable<LogEvent>; }
export interface SessionsPort { sessions$(): Observable<readonly SessionInfo[]>; }
```

Contract describers mirror `AdminPortContract.ts`'s `describeXPortContract(label, makeHarness)` shape (no transport assumptions — assert on emitted shape/cardinality under fake timers).

- [ ] **Step 1 — Write the port interfaces.** Create the four port files. Each imports its types via relative `*.js` and `import type { Observable } from "rxjs";`. Example `telemetryPort.ts`:
  ```typescript
  import type { Observable } from "rxjs";

  import type { MetricSample } from "../telemetry/metrics.js";

  export interface TelemetryPort {
    throughput$(): Observable<MetricSample>;
    latency$(): Observable<MetricSample>;
    errorRate$(): Observable<MetricSample>;
  }
  ```
- [ ] **Step 2 — Failing contract describer (the test is the describer's first consumer in Task 3).** Create `TelemetryPortContract.ts` modelled on `AdminPortContract.ts`:
  ```typescript
  import { firstValueFrom } from "rxjs";
  import { take, toArray } from "rxjs/operators";
  import { describe, expect, it } from "vitest";

  import type { MetricSample } from "../../telemetry/metrics.js";
  import type { TelemetryPort } from "../telemetryPort.js";

  export interface TelemetryHarness {
    port: TelemetryPort;
    /** Advance the simulator clock by `ms` (vi.advanceTimersByTimeAsync). */
    advance: (ms: number) => Promise<void>;
    teardown: () => void;
  }

  export function describeTelemetryPortContract(
    label: string,
    makeHarness: () => TelemetryHarness,
  ): void {
    describe(`${label} :: TelemetryPort contract`, () => {
      it("throughput$ emits a non-negative MetricSample on subscribe", async () => {
        const { port, teardown } = makeHarness();
        try {
          const first = await firstValueFrom(port.throughput$());
          expect(first.value).toBeGreaterThanOrEqual(0);
          expect(typeof first.t).toBe("number");
        } finally {
          teardown();
        }
      });

      it("latency$ keeps emitting on the simulator cadence", async () => {
        const { port, advance, teardown } = makeHarness();
        try {
          const collected: MetricSample[] = [];
          const sub = port.latency$().subscribe((s) => collected.push(s));
          await advance(5_000);
          sub.unsubscribe();
          expect(collected.length).toBeGreaterThan(1);
        } finally {
          teardown();
        }
      });
    });
  }
  ```
  Create the three peer describers analogously: `ServiceHealthPortContract` (`topology$` emits a `ServiceTopology` whose `nodes`/`edges` are non-empty), `EventLogPortContract` (`events$` emits `LogEvent`s with a valid `severity`), `SessionsPortContract` (`sessions$` emits a non-empty `readonly SessionInfo[]`).
- [ ] **Step 3 — Run, expect FAIL.** `pnpm --filter @rtc/domain typecheck` → PASS (interfaces compile). The describers have no concrete harness yet, so they are not invoked until Task 3; confirm `pnpm --filter @rtc/domain test` still green and the new files typecheck.
- [ ] **Step 4 — Export the port types.** In `domain/src/index.ts`, alongside the existing `// Ports` block:
  ```typescript
  export type { EventLogPort } from "./ports/eventLogPort.js";
  export type { ServiceHealthPort } from "./ports/serviceHealthPort.js";
  export type { SessionsPort } from "./ports/sessionsPort.js";
  export type { TelemetryPort } from "./ports/telemetryPort.js";
  ```
- [ ] **Step 5 — Gate + commit.** Run the gauntlet subset `pnpm check && pnpm typecheck && pnpm --filter @rtc/domain test && pnpm build && pnpm check:deps`, then:
  ```bash
  git add packages/domain/src/ports
  git commit -m "feat(domain): telemetry/health/log/sessions ports + contract describers (Phase 5 Task 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB"
  ```

---

### Task 3 — Simulators (seedable, control-input perturbable) + contract/golden tests

Each simulator implements its port, takes `seed?: number`, exposes a **control input** so the `IncidentMachine` can perturb it (`perturb(kind: IncidentKind)` / `clearPerturbation()`), and is deterministic under `vi.useFakeTimers()`. The control input is a private `BehaviorSubject` folded into the metric stream — *not* a port method (the port stays read-only; perturbation is wired app-side via a typed control handle).

**Files:**
- `packages/domain/src/simulators/perturbation.ts` (new — shared `IncidentKind`-free perturbation enum + `MetricControl` handle type)
- `packages/domain/src/simulators/LatencySimulator.ts` (new) + `LatencySimulator.contract.test.ts` + `LatencySimulator.golden.test.ts`
- `packages/domain/src/simulators/ErrorRateSimulator.ts` (new) + `ErrorRateSimulator.contract.test.ts`
- `packages/domain/src/simulators/TelemetrySimulator.ts` (new — composes throughput+latency+errorRate into one `TelemetryPort`, reusing the existing `ThroughputSimulator` for the throughput value) + `TelemetrySimulator.contract.test.ts`
- `packages/domain/src/simulators/ServiceTopologySimulator.ts` (new) + `ServiceTopologySimulator.contract.test.ts` + `ServiceTopologySimulator.golden.test.ts`
- `packages/domain/src/simulators/EventLogSimulator.ts` (new) + `EventLogSimulator.contract.test.ts`
- `packages/domain/src/simulators/SessionSimulator.ts` (new) + `SessionSimulator.contract.test.ts`
- `packages/domain/src/simulators/index.ts` (edit — export all) + `packages/domain/src/index.ts` (edit — export all)

**Interfaces:**
```typescript
// packages/domain/src/simulators/perturbation.ts
export type Perturbation = "latencySpike" | "errorBurst" | "serviceDown";
export interface MetricControl {
  perturb(kind: Perturbation): void;
  clearPerturbation(): void;
}
```
`LatencySimulator implements TelemetryPort["latency$"]`-shaped is wrong — instead `TelemetrySimulator implements TelemetryPort` composes the three. Concretely:
```typescript
// LatencySimulator.ts
export class LatencySimulator implements MetricControl {
  constructor(seed?: number);
  latency$(): Observable<MetricSample>;     // baseline ~20ms walk; perturb("latencySpike") → ~400ms
  perturb(kind: Perturbation): void;
  clearPerturbation(): void;
}
```
(`ErrorRateSimulator` analogous: baseline ~0.5%, `perturb("errorBurst")` → ~12%. `ServiceTopologySimulator implements ServiceHealthPort, MetricControl`: `perturb("serviceDown")` flips one node to `status:"down"` and reddens its edges via raised `latencyMs`.)

- [ ] **Step 1 — Failing contract test wiring for LatencySimulator.** Create `LatencySimulator.contract.test.ts`:
  ```typescript
  import { afterEach, beforeEach, vi } from "vitest";

  import { describeTelemetryPortContract } from "../ports/__contracts__/TelemetryPortContract.js";
  import { LatencySimulator } from "./LatencySimulator.js";
  import { ThroughputSimulator } from "./ThroughputSimulator.js";
  import { ErrorRateSimulator } from "./ErrorRateSimulator.js";
  import { TelemetrySimulator } from "./TelemetrySimulator.js";

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describeTelemetryPortContract("TelemetrySimulator", () => {
    const port = new TelemetrySimulator(
      new ThroughputSimulator(),
      new LatencySimulator(1),
      new ErrorRateSimulator(2),
    );
    return {
      port,
      advance: (ms: number) => vi.advanceTimersByTimeAsync(ms),
      teardown: () => {},
    };
  });
  ```
- [ ] **Step 2 — Run, expect FAIL.** `pnpm --filter @rtc/domain test -- LatencySimulator.contract` → FAIL: `Cannot find module './LatencySimulator.js'`.
- [ ] **Step 3 — Implement LatencySimulator + ErrorRateSimulator + TelemetrySimulator.** `LatencySimulator.ts` uses `mulberry32(seed ?? 1)` and a `defer(() => concat(of(sample()), interval(LATENCY_STEP_MS).pipe(map(() => sample()))))` walk; a private `perturbation$ = new BehaviorSubject<Perturbation | null>(null)` shifts the baseline mean when `"latencySpike"`. `TelemetrySimulator` composes:
  ```typescript
  export class TelemetrySimulator implements TelemetryPort {
    constructor(
      private readonly throughputSim: ThroughputSimulator,
      private readonly latencySim: LatencySimulator,
      private readonly errorRateSim: ErrorRateSimulator,
    ) {}
    throughput$(): Observable<MetricSample> {
      // derive a sampled MetricSample from the existing ThroughputSimulator value
      return defer(() => concat(of(this.sampleThroughput()), interval(THROUGHPUT_STEP_MS).pipe(map(() => this.sampleThroughput()))));
    }
    latency$(): Observable<MetricSample> { return this.latencySim.latency$(); }
    errorRate$(): Observable<MetricSample> { return this.errorRateSim.errorRate$(); }
  }
  ```
- [ ] **Step 4 — Run, expect PASS.** `pnpm --filter @rtc/domain test -- LatencySimulator.contract` → PASS (both contract `it`s green under fake timers).
- [ ] **Step 5 — Failing golden for the perturbation behaviour (the load-bearing seam).** Create `LatencySimulator.golden.test.ts` proving baseline vs. spike are deterministic AND distinct:
  ```typescript
  import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
  import { take, toArray } from "rxjs/operators";
  import { firstValueFrom } from "rxjs";

  import { LatencySimulator } from "./LatencySimulator.js";

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe("LatencySimulator perturbation", () => {
    it("seed 1 baseline is a stable low-latency walk (golden)", async () => {
      const sim = new LatencySimulator(1);
      const p = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
      await vi.advanceTimersByTimeAsync(3_000);
      const vals = (await p).map((s) => Math.round(s.value));
      expect(vals.every((v) => v < 80)).toBe(true);
    });

    it("perturb(latencySpike) raises the latency floor", async () => {
      const sim = new LatencySimulator(1);
      sim.perturb("latencySpike");
      const p = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
      await vi.advanceTimersByTimeAsync(3_000);
      const vals = (await p).map((s) => s.value);
      expect(Math.max(...vals)).toBeGreaterThan(200);
    });
  });
  ```
- [ ] **Step 6 — Run; tune golden bounds to the real walk, then PASS.** `pnpm --filter @rtc/domain test -- LatencySimulator.golden`. Adjust the `< 80` / `> 200` bounds to bracket the real seeded output → PASS.
- [ ] **Step 7 — Implement + contract-test the remaining three sims.** `ServiceTopologySimulator` (7-node graph from `ServiceName`; `topology$()` walks `throughput`/`latencyMs` per node; `perturb("serviceDown")` sets one node `status:"down"` + edges' `latencyMs` high; add `ServiceTopologySimulator.golden.test.ts` pinning the baseline node ordering + a perturbed-edge golden). `EventLogSimulator` (`events$()` emits a seeded scrolling `LogEvent` stream; `perturb("errorBurst")` raises `error` severity frequency). `SessionSimulator` (`sessions$()` emits a seeded `readonly SessionInfo[]` with stable `id`/`region`/`lat`/`lon`). Each gets a `*.contract.test.ts` invoking the matching describer under fake timers.
- [ ] **Step 8 — Wire exports.** In `simulators/index.ts` add `export { LatencySimulator } …` etc. + `export type { MetricControl, Perturbation } from "./perturbation.js";`. In `domain/src/index.ts` add them to the `// Simulators` `export { … }` block and a `export type { MetricControl, Perturbation } from "./simulators/index.js";`.
- [ ] **Step 9 — Gate + commit.** Full gauntlet subset `pnpm check && pnpm typecheck && pnpm --filter @rtc/domain test && pnpm build && pnpm check:deps && pnpm lint:dead`, then:
  ```bash
  git add packages/domain/src/simulators
  git commit -m "feat(domain): latency/errorRate/telemetry/topology/eventLog/session simulators (seedable, perturbable) (Phase 5 Task 3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB"
  ```

---

### Task 4 — IncidentMachine (perturbs sims AND pushes a connection event)

This is the load-bearing coupling. `createIncidentMachine(deps)` returns `Machine<IncidentState, IncidentIntents>`. `inject(kind)` (a) perturbs the relevant `MetricControl`s, (b) pushes a `ConnectionEvent` into the injected `pushConnectionEvent` sink so the **existing** `connectionEvents` stream emits — `latencySpike`/`serviceDown` → `{ type: "gatewayDisconnected" }` (drives `ConnectionStatus.CONNECTED → DISCONNECTED`); `clear()` reverses the perturbations and pushes `{ type: "gatewayConnected" }`.

**Files:**
- `packages/client-react/src/app/presenters/IncidentMachine.ts` (new)
- `packages/client-react/src/app/presenters/__tests__/IncidentMachine.test.ts` (new)

**Interfaces** (from interfaces doc §7, exact):
```typescript
// #/app/presenters/IncidentMachine.ts
import type { ConnectionEvent, MetricControl } from "@rtc/domain";
import type { Machine } from "./machine";

export type IncidentKind = "latencySpike" | "errorBurst" | "serviceDown";
export interface IncidentIntents { inject(kind: IncidentKind): void; clear(): void; }
export interface IncidentState { readonly active: readonly IncidentKind[]; }

export interface IncidentDeps {
  /** Control handles for the perturbable simulators (latency, errorRate, topology). */
  readonly controls: readonly MetricControl[];
  /** Sink into the existing connectionEvents merge (composition wires this). */
  readonly pushConnectionEvent: (ev: ConnectionEvent) => void;
}

export function createIncidentMachine(deps: IncidentDeps): Machine<IncidentState, IncidentIntents>;
```

- [ ] **Step 1 — Failing test: inject pushes a connection event AND records the incident.** Create `IncidentMachine.test.ts`:
  ```typescript
  import { describe, expect, it, vi } from "vitest";
  import { firstValueFrom } from "rxjs";

  import type { ConnectionEvent, MetricControl, Perturbation } from "@rtc/domain";

  import { createIncidentMachine } from "../IncidentMachine";

  function fakeControl(): MetricControl & { calls: Perturbation[]; cleared: number } {
    const calls: Perturbation[] = [];
    let cleared = 0;
    return {
      calls,
      get cleared() { return cleared; },
      perturb: (k) => { calls.push(k); },
      clearPerturbation: () => { cleared += 1; },
    };
  }

  describe("IncidentMachine", () => {
    it("inject(latencySpike) perturbs controls and pushes gatewayDisconnected", async () => {
      const control = fakeControl();
      const pushed: ConnectionEvent[] = [];
      const m = createIncidentMachine({
        controls: [control],
        pushConnectionEvent: (ev) => pushed.push(ev),
      });

      m.intents.inject("latencySpike");

      expect(control.calls).toContain("latencySpike");
      expect(pushed).toContainEqual({ type: "gatewayDisconnected" });
      const state = await firstValueFrom(m.state$);
      expect(state.active).toContain("latencySpike");
      m.dispose();
    });

    it("clear() reverses perturbations and pushes gatewayConnected", async () => {
      const control = fakeControl();
      const pushed: ConnectionEvent[] = [];
      const m = createIncidentMachine({ controls: [control], pushConnectionEvent: (ev) => pushed.push(ev) });

      m.intents.inject("serviceDown");
      m.intents.clear();

      expect(control.cleared).toBeGreaterThan(0);
      expect(pushed).toContainEqual({ type: "gatewayConnected" });
      const state = await firstValueFrom(m.state$);
      expect(state.active).toEqual([]);
      m.dispose();
    });
  });
  ```
- [ ] **Step 2 — Run, expect FAIL.** `pnpm --filter @rtc/client-react test -- IncidentMachine` → FAIL: `Cannot find module '../IncidentMachine'`.
- [ ] **Step 3 — Implement IncidentMachine.** Model on `TileExecutionMachine.ts` (Subjects + `scan` + `state(stream$, INITIAL)` + warm subscribe released in `dispose`):
  ```typescript
  import { type StateObservable, state } from "@rx-state/core";
  import { merge, Subject } from "rxjs";
  import { map, scan } from "rxjs/operators";

  import type { ConnectionEvent } from "@rtc/domain";

  import type { Machine } from "./machine";

  export type IncidentKind = "latencySpike" | "errorBurst" | "serviceDown";
  export interface IncidentIntents { inject(kind: IncidentKind): void; clear(): void; }
  export interface IncidentState { readonly active: readonly IncidentKind[]; }
  export interface IncidentDeps {
    readonly controls: readonly import("@rtc/domain").MetricControl[];
    readonly pushConnectionEvent: (ev: ConnectionEvent) => void;
  }

  const INITIAL: IncidentState = { active: [] };
  // latencySpike & serviceDown break the gateway; errorBurst is degraded-but-connected.
  const DISCONNECTING: ReadonlySet<IncidentKind> = new Set(["latencySpike", "serviceDown"]);

  type Patch = (s: IncidentState) => IncidentState;

  export function createIncidentMachine(deps: IncidentDeps): Machine<IncidentState, IncidentIntents> {
    const inject$ = new Subject<IncidentKind>();
    const clear$ = new Subject<void>();

    const injectPatch$ = inject$.pipe(
      map((kind): Patch => {
        for (const c of deps.controls) c.perturb(kind);
        if (DISCONNECTING.has(kind)) deps.pushConnectionEvent({ type: "gatewayDisconnected" });
        return (s) => ({ active: s.active.includes(kind) ? s.active : [...s.active, kind] });
      }),
    );
    const clearPatch$ = clear$.pipe(
      map((): Patch => {
        for (const c of deps.controls) c.clearPerturbation();
        deps.pushConnectionEvent({ type: "gatewayConnected" });
        return () => INITIAL;
      }),
    );

    const stream$ = merge(injectPatch$, clearPatch$).pipe(
      scan((s, patch) => patch(s), INITIAL),
    );
    const state$: StateObservable<IncidentState> = state(stream$, INITIAL);
    const warm = state$.subscribe();

    return {
      state$,
      intents: {
        inject: (kind) => inject$.next(kind),
        clear: () => clear$.next(),
      },
      dispose: () => { inject$.complete(); clear$.complete(); warm.unsubscribe(); },
    };
  }
  ```
- [ ] **Step 4 — Run, expect PASS.** `pnpm --filter @rtc/client-react test -- IncidentMachine` → PASS.
- [ ] **Step 5 — Gate + commit.** `pnpm check && pnpm typecheck && pnpm --filter @rtc/client-react test -- IncidentMachine && pnpm build`, then:
  ```bash
  git add packages/client-react/src/app/presenters/IncidentMachine.ts packages/client-react/src/app/presenters/__tests__/IncidentMachine.test.ts
  git commit -m "feat(app): IncidentMachine — perturb sims + push gatewayDisconnected through connection seam (Phase 5 Task 4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB"
  ```

---

### Task 5 — Factory + composition wiring (ports, presenters, incident control sink)

**Files:**
- `packages/client-react/src/app/adapters/portFactory.ts` (edit — add `telemetry`/`serviceHealth`/`eventLog`/`sessions` to `AppPorts` + build in `createSimulatorPorts` and `createWsRealPorts`; expose the simulator `MetricControl[]`)
- `packages/client-react/src/app/composition.ts` (edit — instantiate the metrics presenters + `createIncidentMachine`; wire `pushConnectionEvent` into the `connectionEvents` merge via a new `incident$` Subject)
- `packages/client-react/src/app/composition.incident.test.ts` (new — the cross-seam integration test)

**Interfaces:** `AppPorts` grows by four read-only ports; a new internal `incident$ = new Subject<ConnectionEvent>()` (sibling of `reconnect$`) is merged into `connectionEvents.events()` in BOTH branches so the `IncidentMachine`'s `pushConnectionEvent` drives the real `ConnectionStatusUseCase`. `createApp` adds `incident` to `Presenters`/factories.

- [ ] **Step 1 — Failing integration test: inject through the real connection presenter flips status to DISCONNECTED.** Create `composition.incident.test.ts`:
  ```typescript
  import { describe, expect, it } from "vitest";
  import { firstValueFrom } from "rxjs";
  import { filter } from "rxjs/operators";

  import { ConnectionStatus } from "@rtc/domain";

  import { buildDefaultPorts, createApp } from "./composition";

  describe("composition — incident ↔ connection seam", () => {
    it("IncidentMachine.inject(serviceDown) drives ConnectionStatusPresenter to DISCONNECTED", async () => {
      const app = createApp(buildDefaultPorts());
      // status$ starts CONNECTING → CONNECTED (simulator gatewayConnected).
      await firstValueFrom(
        app.presenters.connection.status$.pipe(
          filter((s) => s === ConnectionStatus.CONNECTED),
        ),
      );

      app.presenters.incident.intents.inject("serviceDown");

      const next = await firstValueFrom(
        app.presenters.connection.status$.pipe(
          filter((s) => s === ConnectionStatus.DISCONNECTED),
        ),
      );
      expect(next).toBe(ConnectionStatus.DISCONNECTED);
    });
  });
  ```
- [ ] **Step 2 — Run, expect FAIL.** `pnpm --filter @rtc/client-react test -- composition.incident` → FAIL: `app.presenters.incident` is undefined.
- [ ] **Step 3 — Extend portFactory.** Add to `AppPorts`: `telemetry: TelemetryPort; serviceHealth: ServiceHealthPort; eventLog: EventLogPort; sessions: SessionsPort;`. In `createSimulatorPorts()` build a `LatencySimulator`, `ErrorRateSimulator`, `ServiceTopologySimulator`, `EventLogSimulator`, `SessionSimulator` (fixed dev seeds), compose `TelemetrySimulator`, and return them. Export the perturbable controls so composition can hand them to the machine — return an augmented shape (e.g. `createSimulatorPorts(): TransportPorts & { metricControls: readonly MetricControl[] }`), or expose a sibling `createTelemetryStack()` returning `{ ports, controls }`. Keep `createWsRealPorts` returning the same simulator instances for the four new ports (no new wire RPC; mirrors how `preferences` is browser-local regardless of transport).
- [ ] **Step 4 — Wire composition.** Add `const incident$ = new Subject<ConnectionEvent>();` beside `reconnect$`. In BOTH `buildDefaultPorts` branches, add `incident$` to the `merge(...)` inside `connectionEvents.events()` (real branch: pass it through `tap(routeIdleLifecycle)` like the others; sim branch: merge raw). In `createApp`, build the metrics presenters and:
  ```typescript
  incident: createIncidentMachine({
    controls: ports.metricControls,
    pushConnectionEvent: (ev) => incident$.next(ev),
  }),
  ```
  Add `incident` (and `metrics`/`topology`/`eventLog`/`sessions` presenters from Task 6) to `Presenters`.
- [ ] **Step 5 — Run, expect PASS.** `pnpm --filter @rtc/client-react test -- composition.incident` → PASS (the real `ConnectionStatusUseCase` transitions CONNECTED→DISCONNECTED).
- [ ] **Step 6 — Gate + commit.** `pnpm check && pnpm typecheck && pnpm --filter @rtc/client-react test && pnpm build && pnpm check:deps`, then:
  ```bash
  git add packages/client-react/src/app/adapters/portFactory.ts packages/client-react/src/app/composition.ts packages/client-react/src/app/composition.incident.test.ts
  git commit -m "feat(app): wire telemetry ports + IncidentMachine into composition; incident pushes through connection seam (Phase 5 Task 5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB"
  ```

---

### Task 6 — Presenters + hooks (metrics, topology, event log, sessions, incident)

**Files:**
- `packages/client-react/src/app/presenters/MetricsPresenters.ts` (new — `ThroughputMetricPresenter`/`LatencyPresenter`/`ErrorRatePresenter`, each holding a windowed `readonly MetricSample[]` for gauges/charts)
- `packages/client-react/src/app/presenters/ServiceTopologyPresenter.ts` (new — `topology$: Observable<ServiceTopology>`)
- `packages/client-react/src/app/presenters/EventLogPresenter.ts` (new — `events$: Observable<readonly LogEvent[]>` accumulating last N with `scan`)
- `packages/client-react/src/app/presenters/SessionsPresenter.ts` (new — `sessions$: Observable<readonly SessionInfo[]>`)
- `packages/client-react/src/app/composition.ts` (edit — instantiate the presenters)
- `packages/client-react/src/ui/hooks/createAppHooks.ts` (edit — add `useMetrics`/`useTopology`/`useEventLog`/`useSessions` binds + `useIncident` machine)
- `packages/client-react/src/app/presenters/__tests__/EventLogPresenter.test.ts` (new) and peers

**Interfaces** (new `AppHooks` members):
```typescript
useMetrics: () => { throughput: readonly MetricSample[]; latency: readonly MetricSample[]; errorRate: readonly MetricSample[]; };
useTopology: () => ServiceTopology | null;
useEventLog: () => readonly LogEvent[];
useSessions: () => readonly SessionInfo[];
useIncident: () => { state: IncidentState } & IncidentIntents;
```

- [ ] **Step 1 — Failing test: EventLogPresenter windows the stream.** Create `EventLogPresenter.test.ts` asserting `events$` accumulates emissions (newest-first, capped at `MAX_LOG_ROWS`) from an injected `EventLogPort` fake under fake timers. Model the presenter shape on `ConnectionStatusPresenter` (constructor takes the port, exposes a `shareReplay(1)` stream).
- [ ] **Step 2 — Run, expect FAIL.** `pnpm --filter @rtc/client-react test -- EventLogPresenter` → FAIL (module missing).
- [ ] **Step 3 — Implement the four presenters.** `EventLogPresenter`: `events$ = port.events$().pipe(scan((acc, e) => [e, ...acc].slice(0, MAX_LOG_ROWS), [] as LogEvent[]), startWith([]), shareReplay({ bufferSize: 1, refCount: true }))`. `MetricsPresenters`: each metric stream `scan`-windows the last `WINDOW` samples for the chart/histogram. `ServiceTopologyPresenter`/`SessionsPresenter`: thin `shareReplay(1)` wrappers.
- [ ] **Step 4 — Run, expect PASS.** `pnpm --filter @rtc/client-react test -- EventLogPresenter` → PASS. Repeat steps 1–4 for `MetricsPresenters`/`SessionsPresenter` (one windowing/ordering test each).
- [ ] **Step 5 — Add the hooks.** In `createAppHooks.ts` add `bind`s for the read streams (default `[]`/`null`) and a `useIncident` returning `{ ...useMachine(() => machines.incident()).state, inject, clear }` — but since `incident` is a SINGLE shared machine (not per-mount), bind its `state$` with `bind(presenters.incident.state$, { active: [] })` and expose `inject`/`clear` as stable callbacks delegating to `presenters.incident.intents` (mirrors the `useThroughput` shared-state pattern, NOT the per-mount `useMachine` pattern). Add the matching `AppHooks` members.
- [ ] **Step 6 — Gate + commit.** `pnpm check && pnpm typecheck && pnpm --filter @rtc/client-react test && pnpm build`, then:
  ```bash
  git add packages/client-react/src/app/presenters packages/client-react/src/ui/hooks/createAppHooks.ts packages/client-react/src/app/composition.ts
  git commit -m "feat(app): metrics/topology/eventLog/sessions presenters + admin hooks (Phase 5 Task 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB"
  ```

---

### Task 7 — Admin UI (dumb, CSS-modules + tokens) + panel registration

All components live in `packages/client-react/src/ui/admin/`, are dumb (consume `useHooks()` only), use CSS Modules + `var(--token)` + semantic `data-*`, and obey grep-gates 26–29. Canvas/SVG charts follow the `PnlChart.tsx` precedent (pure derive-from-props render; geometry via computed `--custom-property` where inline values are unavoidable). The `IncidentControls` buttons are the break-glass demo. The Admin panel is composed in `AdminDashboard.tsx` and **registered in the Phase-1 `PanelRegistry`** (`"admin": () => <AdminDashboard />`), exactly as Phase 4 registers the Equities panel. The existing `AdminPanel` throughput control becomes one card inside the dashboard — retained, not deleted.

> Provenance note: the `PanelRegistry` (`Record<PanelId, () => ReactElement>`) and the `PanelId` union are Phase-1 deliverables; Phase 1 replaces `Workspace.tsx` with the `LayoutPort`-backed `InhouseLayoutEngine` + `PanelRegistry`. This task depends on them existing. If a worker reaches this task before Phase 1's registry lands, register at the canonical `PanelRegistry` location and reconcile the `PanelId` `"admin"` with interfaces doc §5.

**Files (new unless noted):**
- `ui/admin/AdminDashboard.tsx` + `.module.css` (composes the cards; mounted via the Phase-1 `PanelRegistry` `"admin"` entry)
- `ui/admin/MetricGauges.tsx` + `.module.css` (decorative-but-real radial gauges from `useMetrics()`)
- `ui/admin/ThroughputChart.tsx` + `.module.css` (canvas line chart)
- `ui/admin/LatencyHistogram.tsx` + `.module.css` (canvas/SVG bars)
- `ui/admin/ErrorRatePanel.tsx` + `.module.css`
- `ui/admin/SessionsPanel.tsx` + `.module.css`
- `ui/admin/LiveEventLog.tsx` + `.module.css` (scrolling `useEventLog()` rows; `data-severity`)
- `ui/admin/ServiceTopologyGraph.tsx` + `.module.css` (canvas/SVG; nodes pulse with `throughput`, edges redden with `latencyMs` — `data-status` per node)
- `ui/admin/IncidentControls.tsx` + `.module.css` (`inject`/`clear` buttons; `data-active` per kind)
- `ui/shell/layout/panelRegistry.tsx` (edit — register the admin panel: `"admin": () => <AdminDashboard />`; Phase-1 deliverable)
- `ui/admin/AdminPanel.tsx` (edit — keep; it is imported by `AdminDashboard` as the throughput card)

- [ ] **Step 1 — Build the leaf cards.** Implement `MetricGauges`, `ThroughputChart`, `LatencyHistogram`, `ErrorRatePanel`, `SessionsPanel`, `LiveEventLog`, each reading its hook and rendering deterministically from props/state. Charts compute their `path`/bar geometry exactly like `PnlChart.buildChart` (pure function, `toFixed`, no timers, no rxjs). Every `color/fill/stroke` uses `var(--token)` (stylelint `declaration-strict-value`). Add `data-testid` anchors: `admin-throughput-chart`, `admin-latency-histogram`, `admin-error-rate`, `admin-sessions`, `admin-event-log`.
- [ ] **Step 2 — Build ServiceTopologyGraph.** Canvas/SVG renderer of `useTopology()`: nodes positioned deterministically (fixed layout keyed by `ServiceName`), node opacity/scale a pure function of `throughput`, edge stroke a `var(--accent-negative)` blend keyed by `latencyMs`; `data-status` on each node element drives a CSS pulse keyframe (no `setTimeout`). `data-testid="admin-topology"`.
- [ ] **Step 3 — Build IncidentControls.** Buttons `Inject latency spike` / `Inject error burst` / `Inject service down` / `Clear` calling `useIncident()` intents; `data-active={state.active.includes(kind)}` per button. `data-testid="admin-incident-controls"`, per-button `data-testid="incident-<kind>"` and `data-testid="incident-clear"`.
- [ ] **Step 4 — Compose AdminDashboard + register in the Phase-1 PanelRegistry.** `AdminDashboard.tsx` lays out the cards (`AdminPanel` throughput card + the new cards + `IncidentControls`) in a CSS-grid. In the Phase-1 `PanelRegistry` (`ui/shell/layout/panelRegistry.tsx`), register `"admin": () => <AdminDashboard />` (mirroring Phase 4's `"equities": () => <EquitiesPanel />`); reconcile the `PanelId` `"admin"` with interfaces doc §5. (`AdminDashboard` imports `AdminPanel`, preserving the throughput control + its contract specs.) Provenance: if Phase 1 has not landed, register at the canonical `PanelRegistry` location.
- [ ] **Step 5 — Verify the dumb-UI gates.** `pnpm --filter @rtc/tests gates` MUST be green (no rxjs/localStorage/fetch/setTimeout in `src/ui` outside `hooks/`; no inline `style={{` except computed `--custom-property`). `pnpm lint:css` (stylelint) green.
- [ ] **Step 6 — Gate + commit.** Full gauntlet: `pnpm check && pnpm lint:eslint && pnpm lint:css && pnpm check:versions && pnpm typecheck && pnpm test && pnpm build && pnpm lint:dead && pnpm check:deps && pnpm --filter @rtc/tests gates`, then:
  ```bash
  git add packages/client-react/src/ui/admin packages/client-react/src/ui/shell/layout/panelRegistry.tsx
  git commit -m "feat(ui): admin observability dashboard — gauges, charts, topology graph, live log, incident controls (Phase 5 Task 7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB"
  ```

---

### Task 8 — UI-contract specs + react swap-trio (incident → banner reacts)

The contract tier is framework-neutral specs + a `react/` swap-trio. Extend the World harness with admin subjects, register the new components, wire the react hooks, and write specs. The headline spec proves the **incident → connection banner** coupling at the contract level: pushing an incident flips the World's connection-status subject and the `ConnectionStatusBar`/`ConnectionOverlay` re-render.

**Files:**
- `tests/ui/contract/shared/harness/world.ts` (edit — add `topology`/`eventLog`/`sessions`/`metrics` subjects + an `incident` command log + `injectIncident`/`clearIncident` that, by design, push `ConnectionStatus.DISCONNECTED`/`CONNECTED` onto `sources.useConnectionStatus`)
- `tests/ui/contract/react/hooksFromWorld.ts` (edit — add `useMetrics`/`useTopology`/`useEventLog`/`useSessions`/`useIncident` backed by World subjects; `useIncident().inject` records the kind AND pushes the connection-status change, mirroring the real machine's connection coupling)
- `tests/ui/contract/shared/components.ts` + `react/registry.tsx` (edit — register `ServiceTopologyGraph`, `LiveEventLog`, `IncidentControls`, `MetricGauges`, etc.)
- `tests/ui/contract/shared/pages/admin/IncidentControlsPage.ts` + `ServiceTopologyGraphPage.ts` + `LiveEventLogPage.ts` (new)
- `tests/ui/contract/specs/admin/IncidentControls.contract.spec.ts` (new — the coupling spec)
- `tests/ui/contract/specs/admin/{LiveEventLog,ServiceTopologyGraph,MetricGauges}.contract.spec.ts` (new)

- [ ] **Step 1 — Failing spec: inject incident → connection banner reacts.** Create `IncidentControls.contract.spec.ts` (model on `AdminPanel.contract.spec.ts`'s `mount`/page-object style):
  ```typescript
  import { ConnectionOverlay, IncidentControls } from "@ui-contract/components";
  import { cleanupMounted, mount } from "@ui-contract/mount";
  import { afterEach, describe, expect, it } from "vitest";

  afterEach(() => cleanupMounted());

  describe("IncidentControls ↔ connection banner", () => {
    it("injecting service-down disconnects, surfacing the ConnectionOverlay", async () => {
      // Both components share one World (the harness mounts against a single World).
      const controls = mount(IncidentControls, {});
      const overlay = mount(ConnectionOverlay, {}, { sharedWorldWith: controls });

      expect(overlay.isVisible()).toBe(false);
      controls.inject("serviceDown");
      await overlay.waitUntilVisible();
      expect(overlay.message()).toMatch(/re-connect to the server/i);
    });
  });
  ```
  (If the harness `mount` does not yet support a shared World across two mounts, add a `mountWorld()` helper that mounts both components under one World provider — the simplest faithful model of the real single-World app.)
- [ ] **Step 2 — Run, expect FAIL.** `pnpm --filter @rtc/client-react test:ui:contract -- IncidentControls` → FAIL (component/page-object/world wiring missing).
- [ ] **Step 3 — Implement the harness + trio additions.** Extend `world.ts` so `injectIncident(kind)` pushes `ConnectionStatus.DISCONNECTED` onto `sources.useConnectionStatus` for `latencySpike`/`serviceDown` (the contract-tier mirror of the real machine's `gatewayDisconnected` → `ConnectionStatusUseCase` transition), and records the kind. Wire `useIncident` in `hooksFromWorld.ts` to call it. Register components + add the page objects (`IncidentControlsPage.inject(kind)` clicks the button; `ConnectionOverlayPage` already exists or add `isVisible`/`waitUntilVisible`/`message`).
- [ ] **Step 4 — Run, expect PASS.** `pnpm --filter @rtc/client-react test:ui:contract -- IncidentControls` → PASS — the banner reacts to the injected incident.
- [ ] **Step 5 — Add the remaining admin contract specs.** `LiveEventLog` (newest-first rows, `data-severity`), `ServiceTopologyGraph` (renders one node per `ServiceName`; a down node carries `data-status="down"`), `MetricGauges` (reflects seeded metric values). Run `pnpm --filter @rtc/client-react test:ui:contract` → all PASS.
- [ ] **Step 6 — Gate + commit.** `pnpm check && pnpm typecheck && pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/tests gates`, then:
  ```bash
  git add packages/client-react/tests/ui/contract
  git commit -m "test(ui-contract): admin specs + react trio; incident inject drives connection overlay (Phase 5 Task 8)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB"
  ```

---

### Task 9 — Visual goldens (both sets) for the admin dashboard

Add seeded scenarios + fixtures for the admin views and regenerate the local golden set; the CI `react/` (x86) set is regenerated by the GitHub Actions workflow at PR time.

**Files:**
- `tests/ui/visual/shared/scenarios.ts` (edit — add `admin/dashboard`, `admin/topology`, `admin/event-log`, `admin/incident-active`)
- `tests/ui/visual/shared/fixtures.ts` (edit — seeded fixtures: a stable topology, a fixed metric window, a frozen event-log set, an `active:["serviceDown"]` incident state)
- `tests/ui/visual/react/registry.tsx` (edit — register the admin components/keys if not shared)
- `tests/ui/visual/scenarioActions.ts` (edit — `admin/incident-active` clicks `incident-serviceDown` before the shot)
- `__screenshots__/react-local/<arch>/…` (generated)

- [ ] **Step 1 — Add scenarios + seeded fixtures.** Mirror the existing `scenarios.ts`/`fixtures.ts` entries (e.g. `connection-status/connected`). Fixtures must be fully deterministic (fixed seeds, no live walk) so goldens are stable.
- [ ] **Step 2 — Run the suite to generate locally; expect new goldens written.** `pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update` then `…:playwright-ct:react:update` and `…:vitest-browser:react:update` → new `react-local/<arch>/*.png` created.
- [ ] **Step 3 — Verify the suite is green against its own new goldens.** `pnpm --filter @rtc/client-react test:ui:visual:react` → PASS (no diff vs. the just-written local goldens).
- [ ] **Step 4 — Gate + commit.** `pnpm check && pnpm typecheck`, then:
  ```bash
  git add packages/client-react/tests/ui/visual
  git commit -m "test(visual): admin dashboard scenarios + local goldens (incident-active) (Phase 5 Task 9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB"
  ```

---

### Task 10 — E2E suite for the incident flow

The e2e tier is feature files (`specs/features/admin/`) + step suites in `@rtc/tests` (presenter tier = in-process simulators, browser tier = Playwright on a dev server), aggregated by `tests/scripts/run-all.ts`. Add an `incident.feature` and a presenter-tier step suite (lightest, deterministic — runs against the in-process `IncidentMachine` + real `ConnectionStatusUseCase`), plus a browser-tier Playwright spec that drives the real UI.

**Files:**
- `specs/features/admin/incident.feature` (new)
- `tests/presenter/steps/adminIncident.steps.ts` (new — matches the flat `tests/presenter/steps/*.steps.ts` layout; drives `createApp(buildDefaultPorts())` directly, asserts `connection.status$` flips to DISCONNECTED after `inject("serviceDown")` and back after `clear()`)
- `tests/browser/playwright/adminIncident.spec.ts` (new — matches the flat camelCase `tests/browser/playwright/*.spec.ts` layout; navigates to the Admin tab, clicks `incident-serviceDown`, asserts `connection-overlay` becomes visible, clicks `incident-clear`, asserts it disappears)

**Interfaces:** the feature mirrors the demo moment from the spec ("watch what happens when I break this"):
```gherkin
Feature: Admin incident injection breaks the live connection

  Scenario: Injecting a service-down incident disconnects the app
    Given the app is connected
    When the operator injects a "serviceDown" incident from the admin panel
    Then the connection banner shows a disconnection
    When the operator clears the incident
    Then the connection is restored
```

- [ ] **Step 1 — Write the feature + failing presenter steps.** Create `incident.feature` and `incident.steps.ts`. The steps build the real app, subscribe to `app.presenters.connection.status$`, call `app.presenters.incident.intents.inject("serviceDown")` / `.clear()`, and assert the DISCONNECTED→…→CONNECTED transitions (using the suite's fake-timer/await idiom).
- [ ] **Step 2 — Run, expect FAIL.** `pnpm --filter @rtc/tests test:presenter:cucumber -- --name "service-down incident"` (or the suite's tag filter) → FAIL (steps undefined).
- [ ] **Step 3 — Implement the steps + the browser spec.** Make the presenter steps pass against the real composition. Add the Playwright browser spec driving the UI (`page.getByTestId("incident-serviceDown").click()` → `expect(page.getByTestId("connection-overlay")).toBeVisible()` → clear → `toBeHidden()`).
- [ ] **Step 4 — Run, expect PASS.** `pnpm --filter @rtc/tests test:presenter:cucumber` → PASS; `pnpm --filter @rtc/tests test:browser:playwright -- adminIncident` → PASS.
- [ ] **Step 5 — Register in run-all (if a new suite script is needed).** The new specs slot into the existing `test:presenter:cucumber` / `test:browser:playwright` suites already listed in `run-all.ts` — no new suite entry required. Confirm `pnpm --filter @rtc/tests test:e2e:no-cypress` (or the full `pnpm test:e2e`) includes and passes the new scenarios.
- [ ] **Step 6 — Full gate gauntlet + commit.** `pnpm check && pnpm lint:eslint && pnpm lint:css && pnpm check:versions && pnpm typecheck && pnpm test && pnpm build && pnpm lint:dead && pnpm check:deps && pnpm lint:eslint:types && pnpm --filter @rtc/tests gates`, then:
  ```bash
  git add specs/features/admin/incident.feature tests/presenter/steps/adminIncident.steps.ts tests/browser/playwright/adminIncident.spec.ts
  git commit -m "test(e2e): admin incident flow — inject breaks connection, clear restores it (Phase 5 Task 10)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB"
  ```

---

## Self-review

| Phase 5 scope item (spec §Phase 5 + interfaces §7) | Task(s) |
|---|---|
| Domain telemetry types: `MetricSample`, `ServiceName`/`Status`, `ServiceNode`/`Edge`/`Topology`, `Severity`, `LogEvent`, `SessionInfo` | Task 1 |
| Ports `telemetryPort`/`serviceHealthPort`/`eventLogPort`/`sessionsPort` + `__contracts__` describers; existing `AdminPort` kept | Task 2 (AdminPort untouched throughout) |
| Simulators `LatencySimulator`/`ErrorRateSimulator`/`ServiceTopologySimulator`/`EventLogSimulator`/`SessionSimulator` (+ existing `ThroughputSimulator` extended via `TelemetrySimulator`), seedable + deterministic under fake timers, control input for perturbation; export wiring | Task 3 |
| `createIncidentMachine(deps): Machine<IncidentState, IncidentIntents>` — `inject(kind)`/`clear()` perturb sims AND push a connection event through the EXISTING `connectionEvents` seam | Task 4 (unit) + Task 5 (real-composition coupling) |
| Factory + composition wiring for new ports + presenters + hooks | Task 5 (ports/incident/control sink) + Task 6 (presenters/hooks) |
| Presenters `MetricsPresenters`/`ServiceTopologyPresenter`/`EventLogPresenter`/`SessionsPresenter` + hooks | Task 6 |
| UI (dumb, CSS-modules + tokens): `MetricGauges`, `ThroughputChart`, `LatencyHistogram`, `ErrorRatePanel`, `SessionsPanel`, `LiveEventLog`, `ServiceTopologyGraph`, `IncidentControls`; Admin panel registered (stub replaced) | Task 7 |
| Topology nodes pulse with throughput, edges redden with latency | Task 3 (data) + Task 7 (`ServiceTopologyGraph`) |
| Simulated incidents flow through the real connection port so FX/Credit banners react live ("break-glass" demo) | Task 4 + Task 5 (composition test) + Task 8 (contract spec) + Task 10 (e2e) |
| Tests: domain unit + golden | Task 1 (prng golden), Task 3 (simulator contract + golden) |
| Tests: port contract specs | Task 2 (describers) + Task 3 (invocations) |
| Tests: UI-contract specs + react trios (trigger incident → banner reacts) | Task 8 |
| Tests: visual goldens (both sets) | Task 9 |
| Tests: one e2e suite for the incident flow | Task 10 |
| Gate gauntlet referenced per task; dumb-UI grep-gates 26–29; CSS strict-value; commit trailers | Global Constraints + every task's gate/commit step |

**Ordering check:** telemetry types (1) → ports + contracts (2) → simulators + tests (3) → IncidentMachine (4) → factory/composition (5) → presenters/hooks (6) → UI (7) → contract (8) → visual (9) → e2e (10). Matches the required order.

**Coupling proof obligation satisfied:** the incident→connection-banner behaviour is written as a failing test BEFORE implementation at three altitudes — Task 4 (machine unit: `inject` pushes `gatewayDisconnected`), Task 5 (real composition: `status$` flips to `DISCONNECTED`), Task 8 (UI-contract: `ConnectionOverlay` becomes visible) — then implemented to pass.
