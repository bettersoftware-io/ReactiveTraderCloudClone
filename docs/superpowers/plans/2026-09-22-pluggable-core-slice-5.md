# Pluggable Application Core — Slice 5 (Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the nine admin members — the presenters `throughput`, `throughputMetric`, `latencyMetric`, `errorRateMetric`, `topology`, `eventLog`, `sessions`, `sessionsKpi` and the singleton machine `presenters.incident` — a behavioural contract suite each (green on the RxJS core first), then a native implementation in both alternative cores, so `pnpm core:parity` reads 53/74 for each core.

**Architecture:** Two PRs. **PR A (Tasks 1–3, "the RxJS side")** moves the five admin cadence numbers into `@rtc/domain` (the suites must assert them, and `@rtc/core-contract` may not import `@rtc/client-core`), extracts the admin folds out of the RxJS presenters into pure exported functions in `@rtc/client-core` ("pure reducers are imported, never duplicated"), scripts the six admin ports in the `@rtc/core-contract` harness, mirrors `incident$` into each runner's connection stream beside `reconnect$`, and lands nine suites plus the port-discipline entries. **PR B (Tasks 4–6, "the ports")** makes the nine members native: the async core from `topicFromObservable`/`Topic`/`Store`/`createRunSlot`/`sleep` plus one bridge export (`pushIncidentEvent`); the Effect core from `sharedFold`/`mirrorPort`/`SubscriptionRef`/`createRunSlot` plus the same bridge export and one `GenericTag` layer per member. Task 6 records receipts and runs the gate.

**Tech Stack:** TypeScript 7 `tsc` (6.x API shim for tooling), pnpm 12 + Turborepo (strict env), vitest 4.1 (fake timers via the harness's `withFakeClock`), RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2, dependency-cruiser, knip, Playwright.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md) — slice table row "5 admin" (`throughput`, `throughputMetric`, `latencyMetric`, `errorRateMetric`, `topology`, `eventLog`, `sessions`, `sessionsKpi`; machine `incident` — "rolling windows"); "The async/await core" ("Pure reducers … are imported, not duplicated"); "The Effect core" (Tag/Layer composition); "The core-contract tier" ("driver verbs arrive with the slices that assert on them"). Slice 4 shipped from [`2026-09-21-pluggable-core-slice-4.md`](2026-09-21-pluggable-core-slice-4.md) with rulings in [`2026-09-21-pluggable-core-slice-4-rulings.md`](2026-09-21-pluggable-core-slice-4-rulings.md); #811–#813 closed its residuals. Every primitive this slice uses is as those left it. Carried rulings: **R5** burst multiplicity is not contracted (settle between counted emissions); **R8** an event stream's burst IS contracted; equal-state conflation stays uncontracted; **R-3a** a retained port's first emit follows a `settle()`.

## Global Constraints

- Every repo change ships via `./scripts/new-worktree.sh` → PR → CI green on the head SHA (`gh run list`, matched by `headSha`) → CodeQL alerts checked → `gh pr merge --merge`. Worktree for this plan: `.claude/worktrees/core-slice-5`, branch `worktree-core-slice-5` (PR A). PR B branches from `main` after PR A merges.
- Commit trailer, verbatim: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` then `Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH`.
- `VITE_CORE_IMPL` stays unset in production; the RxJS core remains the shipped default.
- Outside each sibling's `bridge/`, `rxjs` / `@rx-state/core` are **type-only** imports (dependency-cruiser `bridge-owns-rxjs`, grep gate 43).
- `@rtc/core-api` exports no runtime value (grep gate 42). `@rtc/core-contract` depends on `core-api`, `domain` (+ `rxjs`) only — never `client-core`.
- Biome `nursery/useExplicitType` (module-level consts need a type), ESLint `padding-line-between-statements`, `no-restricted-syntax` (no inline object parameter/return types — name the type), `rtc/name-fixture-factories` (`create*`), `rtc/name-functions-by-effect`.
- Never run two builds in one checkout at once. Implementers do NOT build; the controller prebuilds every dist once per wave (slice-4 P1). `pnpm-lock.yaml` drift → `git checkout -- pnpm-lock.yaml`.
- Every new test is mutation-checked: name the mutant it kills, prove RED, restore.
- Never pipe or filter a Playwright run whose result is being judged.

## Rulings recorded up front

1. **The five cadence numbers move to `@rtc/domain`** (`packages/domain/src/telemetry/adminCadence.ts`): `METRIC_WINDOW = 60`, `MAX_LOG_ROWS = 200`, `THROUGHPUT_DEBOUNCE_MS = 300`, `THROUGHPUT_MESSAGE_DISMISS_MS = 3_000`, `DEFAULT_THROUGHPUT = 100`. Same reason as slice 4's cooldown: the suites assert them and cannot import `client-core`. `client-core` keeps every name it exports today (`WINDOW`, `MAX_LOG_ROWS`, `DEBOUNCE_MS`, `MESSAGE_DISMISS_MS`) as typed aliases of the domain constants, so no importer changes.
2. **Pure folds exported from `@rtc/client-core`** and imported by both siblings: `appendMetricSample(window, sample)` (append, keep the last `METRIC_WINDOW`), `prependLogEvent(log, event)` (prepend, keep the first `MAX_LOG_ROWS`), `reduceIncident(state, event)` over `IncidentEvent = { kind: "inject"; incident: IncidentKind } | { kind: "clear" }`, `incidentConnectionEvent(event)` (the `ConnectionEvent` an event pushes, or `null`), `throughputSetMessage(value)` / `THROUGHPUT_SET_ERROR` (the banner texts). The RxJS presenters are rewritten onto them, behaviour-identically.
3. **Seven warm singletons.** `throughputMetric`, `latencyMetric`, `errorRateMetric`, `eventLog`, `sessionsKpi` are *warm folds*: a synchronous `[]` seed, then one window per port emission, retained across a full unsubscribe (the RxJS `refCount: false`). `topology` and `sessions` are *warm mirrors*: NO seed (first value only after the port emits — R-3a), latest retained across a full unsubscribe. Contracted: seed-or-silence, fold/truncation, retention for a late subscriber, and "one port subscription however many subscribers" (port discipline).
4. **`sessionsKpi` samples the clock at emission** (`t: Date.now()`, `value: sessions.length`). Contracted under `withFakeClock` with `vi.setSystemTime` — the suite asserts `t` equals the fake clock at the emission.
5. **`throughput` contract** (all under `withFakeClock`):
   - synchronous first value `{ value: DEFAULT_THROUGHPUT, loading: true, message: null }`;
   - load resolves `v` → `{ value: v, loading: false }`; load fails → `{ value: DEFAULT_THROUGHPUT, loading: false }`;
   - `setValue(v)` reflects `value: v` synchronously-after-settle (optimistic), with no write before `THROUGHPUT_DEBOUNCE_MS` of quiet;
   - rapid `setValue(a)`, `setValue(b)` inside the window → exactly ONE write, of `b`;
   - write succeeds → banner `{ text: throughputSetMessage(b), isError: false }`; write fails → `{ text: THROUGHPUT_SET_ERROR, isError: true }`; either banner clears to `null` after `THROUGHPUT_MESSAGE_DISMISS_MS` (boundary driven `advance(N−1)` → still shown → `advance(1)` → cleared);
   - **supersede happens at the debounce, not at the keystroke** (RxJS `debounceTime` → `switchMap`): a `setValue(c)` while write `b` is in flight does NOT cancel `b`; if `b` resolves before `c`'s debounce elapses, `b`'s banner shows; once `c`'s debounce fires, `b`'s pending dismiss timer and any unresolved write are dropped — a late resolution of `b` shows nothing.
   - Uncontracted: how many times `getThroughput` is called across unsubscribe/resubscribe (the RxJS `state()` re-runs the load on a cold resubscribe; siblings may keep it warm). The suite keeps one subscription open for each case.
6. **`incident` contract** (a composition singleton, like `eqWorkspace`): synchronous `{ active: [] }`; `inject(k)` calls `perturb(k)` on EVERY control, in `metricControls` order, synchronously within the call; `latencySpike`/`serviceDown` push `{ type: "gatewayDisconnected" }`, `errorBurst` pushes nothing; a repeated `inject(k)` does not duplicate `k` in `active` but DOES perturb and push again; `active` keeps first-injection order; `clear()` calls `clearPerturbation()` on every control, pushes `{ type: "gatewayConnected" }` (even when nothing is active) and resets to `{ active: [] }`. Post-dispose intents are uncontracted (as slice 2 left machines).
7. **The push lands on the RxJS core's `incident$`** in every core: each sibling gains `pushIncidentEvent(event: ConnectionEvent)` in `bridge/out.ts`, the twin of `pushReconnectIntent` — native in provenance, shared in transport until slice 8. Each runner (three files) mirrors `merge(reconnect$, incident$)` into `connectionEvents.events` so the push is observable through `driver.connectionEvents$()`.
8. **No `CoreSeams` change.** Verified 2026-09-22: no internal reader of the base app (Jarvis driver, `AnimationDirector`, `NarratorMachine`, workspace seed) consumes any of the nine. The base still constructs its own nine; every one is lazy (`warmReplay`/`shareReplay`/`state()` subscribe on first subscriber; `incident`'s eager keep-warm subscribes only its own Subjects), so an admin port a native member holds is not held twice. Task 4/5 each add a seam witness with the shared `countSubscriptions` harness proving it (one live subscription per admin port with the native members subscribed).
9. **Port discipline** gains `telemetry.throughput$`, `telemetry.latency$`, `telemetry.errorRate$`, `serviceHealth.topology$`, `eventLog.events$`, `sessions.sessions$`, `admin.getThroughput` — constancy across subscribers/periods, not an absolute count (the base and the native both CALL `sessions$()` twice, once per presenter; the rule compares within a core).
10. **Counts:** 74 members (unchanged); 44 + 9 = 53 native per sibling; `PENDING_SUITES` 30 − 9 = 21.

## Parallelism (accelerated SDD)

Task 1 (domain + client-core) and Task 2 (core-contract harness) touch disjoint packages → dispatch in parallel; Task 2 needs Task 1's domain constants only for its fixtures, so it declares them locally until the controller rebuilds `@rtc/domain` (NEEDS_CONTEXT if blocked, never inline a number into production). Task 3 needs both, plus a rebuild. Tasks 4 and 5 are disjoint packages → parallel, one worktree, no builds by implementers. Task 6 after both settle. One gauntlet per PR; a task review per task; a final whole-branch review per PR.

## File structure

```
packages/domain/src/telemetry/adminCadence.ts          NEW  five constants (ruling 1)
packages/domain/src/index.ts                            MOD  export them
packages/client-core/src/presenters/adminFolds.ts       NEW  appendMetricSample, prependLogEvent, throughputSetMessage, THROUGHPUT_SET_ERROR
packages/client-core/src/presenters/__tests__/adminFolds.test.ts  NEW
packages/client-core/src/presenters/IncidentMachine.ts  MOD  reduceIncident, incidentConnectionEvent, IncidentEvent; machine rewritten onto them
packages/client-core/src/presenters/{windowedSamples,EventLogPresenter,SessionsKpiPresenter,ThroughputPresenter}.ts  MOD  onto the folds/constants
packages/client-core/src/index.ts                       MOD  export the folds + IncidentEvent
packages/core-contract/src/harness/scriptedPorts.ts     MOD  six scripted admin ports + metricControls recorder + driver verbs
packages/core-contract/src/harness/scriptedPorts.test.ts MOD
packages/core-contract/src/suites/{throughput,metricWindows,topology,eventLog,sessions,sessionsKpi,incident}.ts  NEW
packages/core-contract/src/suites/portDiscipline.ts     MOD  ruling 9
packages/core-contract/src/registry.ts                  MOD  nine suites registered
packages/client-core/src/composition.coreContract.test.ts, client-core-{async,effect}/src/coreContract.test.ts  MOD  merge incident$
packages/client-core-async/src/bridge/out.ts            MOD  pushIncidentEvent
packages/client-core-async/src/presenters/admin.ts      NEW  seven stream presenters
packages/client-core-async/src/presenters/throughput.ts NEW
packages/client-core-async/src/machines/incident.ts     NEW
packages/client-core-effect/src/bridge/out.ts           MOD  pushIncidentEvent
packages/client-core-effect/src/presenters/admin.ts     NEW
packages/client-core-effect/src/presenters/throughput.ts NEW
packages/client-core-effect/src/machines/incident.ts    NEW
packages/client-core-{async,effect}/src/{composition.ts,parity.json,composition.seams.test.ts}  MOD
packages/client-core-effect/src/{services.ts,layers.ts}  MOD  one Tag + Layer per member
docs/adr/ADR-006-pluggable-application-core.md, docs/architecture/22-pluggable-application-core.md, docs/STATUS.md, CLAUDE.md, spec "Slice 5 shipped" line  MOD (Task 6)
```

(each new source file gets its co-located `*.test.ts`).

---

## PR A — the RxJS side

### Task 1: Cadence constants and pure admin folds (domain, client-core)

**Files:** Create `packages/domain/src/telemetry/adminCadence.ts`, `packages/client-core/src/presenters/adminFolds.ts`, `packages/client-core/src/presenters/__tests__/adminFolds.test.ts`. Modify `packages/domain/src/index.ts`, `packages/client-core/src/presenters/{windowedSamples,EventLogPresenter,SessionsKpiPresenter,ThroughputPresenter,IncidentMachine}.ts`, `packages/client-core/src/index.ts`, and extend `packages/client-core/src/presenters/__tests__/IncidentMachine.test.ts`.

**Interfaces — Produces:**
- `@rtc/domain`: `METRIC_WINDOW: number`, `MAX_LOG_ROWS: number`, `THROUGHPUT_DEBOUNCE_MS: number`, `THROUGHPUT_MESSAGE_DISMISS_MS: number`, `DEFAULT_THROUGHPUT: number`.
- `@rtc/client-core`: `appendMetricSample(window: readonly MetricSample[], sample: MetricSample): readonly MetricSample[]`; `prependLogEvent(log: readonly LogEvent[], event: LogEvent): readonly LogEvent[]`; `throughputSetMessage(value: number): string`; `THROUGHPUT_SET_ERROR: string`; `type IncidentEvent`; `reduceIncident(state: IncidentState, event: IncidentEvent): IncidentState`; `incidentConnectionEvent(event: IncidentEvent): ConnectionEvent | null`.

- [ ] **Step 1: the domain constants.**

```ts
// packages/domain/src/telemetry/adminCadence.ts
/** Admin-view cadence, shared by every application core (ADR-006 slice 5):
 * the contract suites assert these, and `@rtc/core-contract` may not import
 * `@rtc/client-core`, so they live here — the slice-4 cooldown precedent. */

/** Rolling window — MetricSamples retained per KPI chart series. */
export const METRIC_WINDOW: number = 60;
/** Rows retained in the live event log (newest first). */
export const MAX_LOG_ROWS: number = 200;
/** Quiet period before a throughput edit is written. */
export const THROUGHPUT_DEBOUNCE_MS: number = 300;
/** How long the throughput confirmation/error banner stays up. */
export const THROUGHPUT_MESSAGE_DISMISS_MS: number = 3_000;
/** Throughput shown while loading and after a failed load. */
export const DEFAULT_THROUGHPUT: number = 100;
```

Export all five from `packages/domain/src/index.ts` beside the other `./telemetry/` exports.

- [ ] **Step 2: failing tests for the folds** (`adminFolds.test.ts`), each naming its mutant:
  - `appendMetricSample` appends at the END (kills prepend): `[a]` + `b` → `[a, b]`.
  - keeps the LAST `METRIC_WINDOW` (kills `slice(0, N)` and an off-by-one): a full window of `METRIC_WINDOW` samples + one more → length `METRIC_WINDOW`, first element is the original second, last is the new one.
  - does not mutate its input (kills `push`): the input array is unchanged after the call.
  - `prependLogEvent` prepends (kills append) and keeps the FIRST `MAX_LOG_ROWS` (a full log + one → the new event at `[0]`, the oldest dropped).
  - `throughputSetMessage(250)` → `"Throughput has been set to 250"`; `THROUGHPUT_SET_ERROR` → `"Error setting throughput"` (the texts the RxJS presenter shows today — copy them from `ThroughputPresenter.ts`).

- [ ] **Step 3: failing tests for the incident folds** (extend the incident test file):
  - `reduceIncident({active: []}, inject latencySpike)` → `["latencySpike"]`; a second inject of the same kind → unchanged array (kills a missing `includes` guard); inject order is kept (`errorBurst` then `serviceDown` → that order); `clear` → `{ active: [] }` from any state.
  - `incidentConnectionEvent`: inject `latencySpike` → `{type:"gatewayDisconnected"}`; inject `serviceDown` → same; inject `errorBurst` → `null` (kills "every inject disconnects"); `clear` → `{type:"gatewayConnected"}`.

- [ ] **Step 4: implement.**

```ts
// packages/client-core/src/presenters/adminFolds.ts
import {
  type LogEvent,
  MAX_LOG_ROWS,
  METRIC_WINDOW,
  type MetricSample,
} from "@rtc/domain";

/** Append `sample`, keeping the newest `METRIC_WINDOW` — the fold behind
 * every rolling KPI series. Imported by the sibling cores, never copied. */
export function appendMetricSample(
  window: readonly MetricSample[],
  sample: MetricSample,
): readonly MetricSample[] {
  return [...window, sample].slice(-METRIC_WINDOW);
}

/** Prepend `event`, keeping the newest `MAX_LOG_ROWS` (newest first). */
export function prependLogEvent(
  log: readonly LogEvent[],
  event: LogEvent,
): readonly LogEvent[] {
  return [event, ...log].slice(0, MAX_LOG_ROWS);
}

/** The confirmation banner after a successful throughput write. */
export function throughputSetMessage(value: number): string {
  return `Throughput has been set to ${value}`;
}

/** The banner after a failed throughput write. */
export const THROUGHPUT_SET_ERROR: string = "Error setting throughput";
```

In `IncidentMachine.ts` add, above `createIncidentMachine`:

```ts
/** One incident intent, as the pure fold sees it. */
export type IncidentEvent =
  | { readonly kind: "inject"; readonly incident: IncidentKind }
  | { readonly kind: "clear" };

/** The state transition for one incident intent. */
export function reduceIncident(
  state: IncidentState,
  event: IncidentEvent,
): IncidentState {
  if (event.kind === "clear") {
    return INITIAL;
  }

  return state.active.includes(event.incident)
    ? state
    : { active: [...state.active, event.incident] };
}

/** The connection event an incident intent pushes, if any — latencySpike and
 * serviceDown break the gateway; errorBurst is degraded-but-connected; a
 * clear always reconnects. */
export function incidentConnectionEvent(
  event: IncidentEvent,
): ConnectionEvent | null {
  if (event.kind === "clear") {
    return { type: "gatewayConnected" };
  }

  return DISCONNECTING.has(event.incident)
    ? { type: "gatewayDisconnected" }
    : null;
}
```

Rewrite `createIncidentMachine`'s two patch streams to call `reduceIncident` and `incidentConnectionEvent` (keep the control loops and their order: controls are perturbed BEFORE the push, as today). Rewrite `windowedSamples` and `SessionsKpiPresenter` to `scan(appendMetricSample, [] …)`, `EventLogPresenter` to `scan(prependLogEvent, [] …)`, `ThroughputPresenter` to `THROUGHPUT_DEBOUNCE_MS`/`THROUGHPUT_MESSAGE_DISMISS_MS`/`DEFAULT_THROUGHPUT`/`throughputSetMessage`/`THROUGHPUT_SET_ERROR`. Keep the old exported names as aliases, e.g. in `windowedSamples.ts`: `export const WINDOW: number = METRIC_WINDOW;` (doc: "kept for existing importers"); same for `MAX_LOG_ROWS` (re-export from domain), `DEBOUNCE_MS`, `MESSAGE_DISMISS_MS`. Export the new folds, `IncidentEvent`, `reduceIncident`, `incidentConnectionEvent` from `packages/client-core/src/index.ts` beside the existing presenter exports.

- [ ] **Step 5:** `pnpm --filter @rtc/client-core test` — every pre-existing test green unchanged (the rewrite is behaviour-identical); the new tests green. Mutation-check each new test (report mutant → RED → restore). Commit by pathspec: `feat(pluggable-core): admin cadence constants in domain; pure admin folds in client-core`.

(Stale dist: `client-core` resolves `@rtc/domain` through its dist. If the new constants are invisible, STOP with NEEDS_CONTEXT — the controller rebuilds `@rtc/domain` alone. Never build yourself, never inline a number.)

### Task 2: Harness — the six admin ports and the controls recorder

**Files:** Modify `packages/core-contract/src/harness/scriptedPorts.ts`, `packages/core-contract/src/harness/scriptedPorts.test.ts`, `packages/core-contract/src/index.ts` (export any new type). Modify the three runners: `packages/client-core/src/composition.coreContract.test.ts`, `packages/client-core-async/src/coreContract.test.ts`, `packages/client-core-effect/src/coreContract.test.ts`.

**Interfaces — Produces** (new `ScriptedDriver` verbs; follow the existing verbs' doc style):
- `emitThroughputSample(s: MetricSample)`, `emitLatencySample(s)`, `emitErrorRateSample(s)` — push into `telemetry.throughput$()/latency$()/errorRate$()` (one `Subject` each).
- `emitTopology(t: ServiceTopology)` — `serviceHealth.topology$()`.
- `emitLogEvent(e: LogEvent)` — `eventLog.events$()`.
- `emitSessions(s: readonly SessionInfo[])` — `sessions.sessions$()`.
- `pendingThroughputLoads(): number`, `resolveThroughputLoad(value: number)`, `failThroughputLoad(error: unknown)` — `admin.getThroughput()` through a `createPendingQueue` (resolve = next + complete, like the existing one-shot RPC verbs).
- `pendingThroughputWrites(): readonly number[]` (the values asked, FIFO), `resolveThroughputWrite()`, `failThroughputWrite(error: unknown)` — `admin.setThroughput(value)` through a second pending queue; resolve emits `undefined` then completes. A write whose subscriber unsubscribed before resolution is dropped from the queue (read how `pendingQueue.ts` handles an unsubscribed entry and reuse it — do not invent a second mechanism).
- `controlCalls(): readonly ControlCall[]` where `export type ControlCall = { readonly control: number; readonly call: "perturb"; readonly kind: Perturbation } | { readonly control: number; readonly call: "clear" }` — `ports.metricControls` becomes THREE recording controls (index 0..2), every call appended in order.
- `PortMethodName` gains the seven strings of ruling 9; the counting Proxy wraps the new ports with prefixes `telemetry.`, `serviceHealth.`, `eventLog.`, `sessions.`, `admin.`.

- [ ] **Step 1: failing harness tests** in `scriptedPorts.test.ts`, one per verb family, each subscribing through the SCRIPTED port and asserting the verb's effect: a telemetry sample reaches only its own method's subscriber (kills a shared Subject); `pendingThroughputLoads` counts a subscribed `getThroughput()` and `resolveThroughputLoad(7)` delivers `7` then completes; `failThroughputLoad` errors it; `pendingThroughputWrites` lists `[5, 9]` for two subscribed writes in order, `resolveThroughputWrite` resolves the OLDEST; an unsubscribed write leaves the queue; `controlCalls` records `perturb` on controls 0,1,2 in order then `clear`; the new `PortMethodName` counters increment on call (not on property read).
- [ ] **Step 2: implement** following the existing verbs (`emitPositions`/`positionsObserved`, the candle-history pending queue). Import the port types from `@rtc/domain` (`TelemetryPort`, `ServiceHealthPort`, `EventLogPort`, `SessionsPort`, `AdminPort`, `MetricControl`, `Perturbation`, `MetricSample`, `ServiceTopology`, `LogEvent`, `SessionInfo`).
- [ ] **Step 3: runners.** In each of the three runners, change the `connectionEvents.events` mirror from `reconnect$` to `merge(reconnect$, incident$)` (both exported by `@rtc/client-core`; add `incident$` to its import if a runner lacks it) and extend the comment: "…and the incident machine's connection-event sink, which the browser port factories merge the same way". `merge` in a test file of a sibling is fine (`bridge-owns-rxjs` scopes `src/` production files — confirm with `pnpm check:deps` in Task 3's gauntlet; if it flags the runner, import `merge` the way the runner already imports rxjs values, or ask).
- [ ] **Step 4:** `pnpm --filter @rtc/core-contract test` green; mutation-check each new harness test. Commit: `test(core-contract): script the admin ports and a metric-controls recorder`.

### Task 3: The nine suites, port discipline, registry — then ship PR A

**Before starting:** the controller has rebuilt every dist (`pnpm build`) on the commit holding Tasks 1–2.

**Files:** Create `packages/core-contract/src/suites/{throughput,metricWindows,topology,eventLog,sessions,sessionsKpi,incident}.ts`. Modify `suites/portDiscipline.ts`, `registry.ts` (nine entries off `null`, nine out of `PENDING_SUITES`), `registry.test.ts` if it pins a count.

**Interfaces — Consumes:** Task 2's verbs; Task 1's domain constants; `withFakeClock`, `collect`, `settle`, `MakeHarness`.
**Produces:** `describeThroughputContract`, `describeThroughputMetricContract`, `describeLatencyMetricContract`, `describeErrorRateMetricContract` (the three from ONE parameterised builder in `metricWindows.ts`: `describeMetricWindowContract(member, select, emit)`), `describeTopologyContract`, `describeEventLogContract`, `describeSessionsContract`, `describeSessionsKpiContract`, `describeIncidentContract`.

Every case: build the harness, `try { … } finally { await h.teardown(); }`, unsubscribe collectors. Fixtures (`MetricSample`s, a `ServiceTopology`, `LogEvent`s, `SessionInfo`s) are `create*` factories declared BELOW the cases.

- [ ] **Step 1: `metricWindows.ts`** — for each of the three members:
  1. first value is `[]`, synchronously (`collect(...).values` equals `[[]]` before any settle).
  2. each port sample appends: emit `a`, settle, emit `b`, settle → last value `[a, b]` (R5: settle between).
  3. truncation: emit `METRIC_WINDOW + 1` samples (settling after each is too slow — emit them with one settle at the end is a BURST; per R5 only the LAST value is asserted) → last value has length `METRIC_WINDOW`, starts with sample #2, ends with the last.
  4. retention: collect, emit `a`, settle, unsubscribe; a NEW collector's first value is `[a]` (kills `refCount: true`).
  5. isolation: a sample on another telemetry method does not reach this member (emit latency; the throughput window stays `[]`).
- [ ] **Step 2: `topology.ts` and `sessions.ts`** (warm mirrors):
  1. silent until the port emits: collect, settle → `values` `[]`.
  2. emit `t1`, settle → `[t1]`; emit `t2`, settle → `[t1, t2]`.
  3. retention: after `t1`, unsubscribe; a new collector's first value is `t1` synchronously.
- [ ] **Step 3: `eventLog.ts`** — `[]` seed synchronously; `e1` then `e2` (settled) → last value `[e2, e1]`; `MAX_LOG_ROWS + 1` events (burst, last value only) → length `MAX_LOG_ROWS`, `[0]` is the newest; retention as above.
- [ ] **Step 4: `sessionsKpi.ts`** (`withFakeClock`, `vi.setSystemTime(1_000)`): `[]` seed; `emitSessions([s1, s2])` at t=1000, settle → last value `[{ t: 1_000, value: 2 }]`; `clock.advance(500)`, `emitSessions([s1])`, settle → `[{t:1_000,value:2},{t:1_500,value:1}]` (kills a construction-time timestamp and a stale-clock read); truncation at `METRIC_WINDOW`; retention.
- [ ] **Step 5: `throughput.ts`** — every case under `withFakeClock`, one collector held for the whole case (ruling 5's uncontracted reload). Cases, in order:
  1. first value `{ value: DEFAULT_THROUGHPUT, loading: true, message: null }` synchronously.
  2. `resolveThroughputLoad(250)`, settle → last `{ value: 250, loading: false, message: null }`.
  3. `failThroughputLoad(new Error("x"))`, settle → last `{ value: DEFAULT_THROUGHPUT, loading: false, message: null }`, and `Collected.errors` empty (kills an error escaping).
  4. optimistic: after load, `setValue(300)`, settle → last `value` 300; `pendingThroughputWrites()` `[]`; `advance(THROUGHPUT_DEBOUNCE_MS - 1)` → still `[]`; `advance(1)` → `[300]`.
  5. debounce coalesces: `setValue(1)`, `advance(100)`, `setValue(2)`, `advance(THROUGHPUT_DEBOUNCE_MS)` → writes `[2]` exactly.
  6. success banner + dismiss: write 2 pending, `resolveThroughputWrite()`, settle → `message` `{ text: throughputSetMessage(2), isError: false }` — the suite may not import `client-core`, so spell the text as the literal `"Throughput has been set to 2"` with a comment naming `throughputSetMessage` as its source; `advance(THROUGHPUT_MESSAGE_DISMISS_MS - 1)` → still shown; `advance(1)` → `null`.
  7. error banner: `failThroughputWrite(...)` → `{ text: "Error setting throughput", isError: true }`, dismissed after the same interval.
  8. keystroke does not supersede: write `b` pending; `setValue(c)`; `resolveThroughputWrite()` (resolves `b`) before `c`'s debounce, settle → banner for `b` shows.
  9. debounce does supersede: write `b` pending; `setValue(c)`; `advance(THROUGHPUT_DEBOUNCE_MS)` → writes list is `[c]` only (the `b` write was unsubscribed and left the queue) — and after `resolveThroughputWrite()` the banner names `c`, never `b`.
  10. a newer write drops the older banner's dismiss: banner for `b` up; `setValue(c)`; `advance(THROUGHPUT_DEBOUNCE_MS)`; `advance(THROUGHPUT_MESSAGE_DISMISS_MS)` without resolving `c` → the collected history contains NO `message: null` after `b`'s banner beyond what `c` produces — assert the last value's message is still `b`'s banner (the RxJS `switchMap` dropped `b`'s dismiss timer). **Verify this case against the RxJS core first; if the observed behaviour differs, the RxJS behaviour is the contract — rewrite the case to what RxJS does and ledger it.**
- [ ] **Step 6: `incident.ts`** (`h.app.presenters.incident`):
  1. synchronous first value `{ active: [] }`.
  2. `inject("latencySpike")` → `controlCalls()` is exactly perturb latencySpike on controls 0, 1, 2 in that order, checked SYNCHRONOUSLY right after the call (kills a deferred perturb); after settle, `active` `["latencySpike"]` and the connection collector has `[{type:"gatewayDisconnected"}]`.
  3. `inject("errorBurst")` → perturbs all three; NO connection event (kills "every inject disconnects").
  4. `inject("serviceDown")` → `gatewayDisconnected`.
  5. repeat inject: `inject("errorBurst")` twice → `active` `["errorBurst"]`, six perturb calls.
  6. order: `inject("serviceDown")`, `inject("errorBurst")` → `active` `["serviceDown", "errorBurst"]`.
  7. `clear()` with two active → `clear` on controls 0,1,2 in order; `gatewayConnected` pushed; `active` `[]`.
  8. `clear()` with nothing active still pushes `gatewayConnected` (kills a "nothing to clear" short-circuit).
  The connection collector is `collect(h.driver.connectionEvents$())` opened BEFORE the intent.
- [ ] **Step 7: port discipline** — add the seven names (ruling 9) with the member that opens each, following the existing entries' shape exactly.
- [ ] **Step 8: registry** — nine entries; `PENDING_SUITES` shrinks by nine (21 left); `registry.test.ts` counts updated.
- [ ] **Step 9:** `pnpm --filter @rtc/core-contract build` (the controller's go only; you are the only builder), then `pnpm --filter @rtc/client-core test composition.coreContract` → every new case GREEN on RxJS. Any case red on RxJS: RxJS is the contract — fix the suite, never `client-core`, and report it. The two sibling runners will now FAIL the nine members (delegated members pass trivially only if delegation is by reference — they are, so they should PASS; report whatever you see). Mutation-check a representative case per suite against a mutated RxJS presenter (e.g. `refCount: true`, `slice(0, N)`, dropping the `includes` guard) and restore.
- [ ] **Step 10:** Commit: `test(core-contract): the nine admin suites`. The controller runs `/rtc:gauntlet full`, pushes, opens PR A (`test(pluggable-core): slice 5 suites — admin`), and ships it per the Global Constraints.

---

## PR B — the ports

Branch `worktree-core-slice-5b` from `main` after PR A merges. Controller prebuilds.

### Task 4: The async core

**Files:** Create `packages/client-core-async/src/presenters/admin.ts` (+ test), `presenters/throughput.ts` (+ test), `machines/incident.ts` (+ test). Modify `bridge/out.ts` (+ test), `composition.ts`, `parity.json`, `composition.seams.test.ts`, `composition.machineFactories.test.ts` if it lists presenters.

**Interfaces — Consumes:** Task 1's folds and constants; `topicFromObservable`, `topicToStream`, `mapTopic`, `createStore`, `storeToStateStream`/`storeToWarmStateStream`, `createRunSlot`, `sleep`, `once`, `relay` (read each one's doc before use).
**Produces:** `createMetricWindowPresenter(source: () => Observable<MetricSample>, lifetime)`, `createTopologyPresenter`, `createEventLogPresenter`, `createSessionsPresenter`, `createSessionsKpiPresenter(sessions, lifetime, now = Date.now)`, `createThroughputPresenter(admin, lifetime)`, `createIncidentMachine({ controls, pushConnectionEvent }, lifetime)`, `pushIncidentEvent(event: ConnectionEvent): void`.

- [ ] **Step 1: `pushIncidentEvent`** in `bridge/out.ts`, beside `pushReconnectIntent`, same doc shape: `incident$.next(event)` (import `incident$` from `@rtc/client-core`). Test: a subscriber on `incident$` receives the event.
- [ ] **Step 2: warm mirrors** (`topology`, `sessions`): exactly `createPositionsPresenter`'s shape in `presenters/warmSingletons.ts` — `topicToStream(topicFromObservable(port.topology$(), lifetime))`. Port method called ONCE, at construction.
- [ ] **Step 3: warm folds** (three metrics, `eventLog`, `sessionsKpi`): a `Store` seeded `[]`, fed by ONE port subscription opened on first subscriber and held until `lifetime` aborts; each value `store.set((w) => appendMetricSample(w, s))` (`prependLogEvent` for the log; `{ t: now(), value: sessions.length }` then `appendMetricSample` for the KPI). Read how `topicFromObservable` defers its port subscription to the first subscriber and reuse that mechanism (e.g. `mapTopic` / a fold over the topic) rather than writing a new lifecycle; if no existing primitive folds a topic into a replay-current seeded stream, add `foldTopic<T, S>(topic, initial, step, lifetime): Topic<S>` to `kernel/` with its own test, and say so in the report. Unit tests per presenter: seed synchronous; fold; truncation; retention after full unsubscribe; ONE port subscription for two subscribers; `lifetime` abort releases the port.
- [ ] **Step 4: `throughput`** — a `Store<ThroughputView>` seeded `{ value: DEFAULT_THROUGHPUT, loading: true, message: null }`; the load via `once(admin.getThroughput(), lifetime)` (or the existing one-shot bridge — read `bridge/in.ts`) → `{ value, loading: false }` / on failure `{ value: DEFAULT_THROUGHPUT, loading: false }`. Two slots:
  - a **debounce timer**: `setValue(v)` → `store.set((s) => ({ ...s, value: v }))`, then clear and restart a `THROUGHPUT_DEBOUNCE_MS` timer (a plain `AbortController` + `sleep(ms, signal)`; a keystroke aborts only the TIMER, never the write);
  - a **write slot** (`createRunSlot(store)`): when the timer fires with `v`, `slot.start(async (run) => { … })` — await `once(admin.setThroughput(v), run.signal)`, `run.set` the success banner (`throughputSetMessage(v)`) or the error banner (`THROUGHPUT_SET_ERROR`), `await sleep(THROUGHPUT_MESSAGE_DISMISS_MS, run.signal)`, `run.set({ message: null })`. `start` supersedes the previous write AND its dismiss — ruling 5's "supersede at the debounce".
  - `lifetime` abort ends the timer and disposes the slot. `state$` is `storeToStateStream(store)`.
  Unit tests mirror suite cases 4–10 at the unit level plus: a failing load does not throw out-of-band; post-`lifetime` `setValue` writes nothing.
- [ ] **Step 5: `incident`** — a `Store<IncidentState>` seeded `{ active: [] }`; `inject(k)`: for each control `perturb(k)`, then `const ev = incidentConnectionEvent({kind:"inject", incident:k}); if (ev) pushConnectionEvent(ev);` then `store.set((s) => reduceIncident(s, {kind:"inject", incident:k}))`; `clear()` symmetric with `clearPerturbation`. Keep the RxJS order (controls → push → state). `dispose()` idempotent; `lifetime` abort disposes (slice-4 R-7a convergence). `state$` via `storeToWarmStateStream`. The composition passes `pushConnectionEvent: pushIncidentEvent`.
- [ ] **Step 6: composition** — replace the nine delegations with the native members (follow how slice 4's `positions`/`eqWorkspace` were swapped in; `ports.metricControls` feeds `incident`). `parity.json`: nine entries `"native"`. Seam witness in `composition.seams.test.ts`: with the native `throughputMetric`, `latencyMetric`, `errorRateMetric`, `topology`, `eventLog`, `sessions`, `sessionsKpi` each subscribed once, `countSubscriptions` reads `live === 1` for `telemetry.throughput$`, `telemetry.latency$`, `telemetry.errorRate$`, `serviceHealth.topology$`, `eventLog.events$`, and `live === 2` for `sessions.sessions$` (two presenters, one each) — the base's copies stayed cold (ruling 8). Use the `reshape = concat(src, NEVER)` form if a simulator source completes.
- [ ] **Step 7:** `pnpm --filter @rtc/client-core-async test` all green, including `coreContract.test.ts` (nine suites native) and `parity.test.ts` (reference inequality). Mutation-check each new unit test. Commit: `feat(core-async): the admin members, native`.

### Task 5: The Effect core

**Files:** as Task 4, under `packages/client-core-effect/src/`, plus `services.ts`/`layers.ts` (+ `layers.test.ts` counts).

**Interfaces — Consumes:** Task 1's folds; `fromObservable`, `sharedFold`, `mirrorPort`/`mirrorPortAsIs`/`followPort`, `refToStateStream`/`refToWarmStateStream`, `setRefIfChanged`, `rpc`, `createRunSlot` (Effect's `machines/runSlot.ts`), `runnerFor`, `createChildHost`; read each doc first.
**Produces:** the same seven presenter factories, `createThroughputPresenter`, `createIncidentMachine`, `pushIncidentEvent`, one `Context.GenericTag` + `Layer` per member.

- [ ] **Step 1: `pushIncidentEvent`** in `bridge/out.ts` beside `pushReconnectIntent`, same test.
- [ ] **Step 2: warm mirrors** — `topology`, `sessions` exactly like `createPositionsPresenter` in `presenters/warmSingletons.ts`.
- [ ] **Step 3: warm folds** — `sharedFold` (read its signature at `bridge/out.ts:388`) with seed `[]` and step `appendMetricSample` / `prependLogEvent` / KPI (`Clock` or an injected `now`; the suite drives `vi.setSystemTime`, so `Date.now` via an injected `now = Date.now` is the safe choice — measure that Effect's `Clock.currentTimeMillis` follows the fake clock before using it, and ledger the result). Same unit tests as Task 4 Step 3.
- [ ] **Step 4: `throughput`** — a `SubscriptionRef<ThroughputView>`; load via `rpc(admin.getThroughput())` forked in the presenter's host scope, `Effect.catchAll` → default; the debounce as a fiber restarted per `setValue` (`Fiber.interrupt` of the previous timer fiber, then fork `Effect.sleep(THROUGHPUT_DEBOUNCE_MS)` → `slot.start(write(v))`); the write through `createRunSlot` so a newer debounced write interrupts the older write and its dismiss; banners from the same folds. Effect's `Effect.sleep` runs on the default `Clock`, which follows vitest fake timers only if it uses `setTimeout` — MEASURE with a unit test first (slice 2 did; read `bridge/clock.test.ts`), rule, and ledger. Same unit tests as Task 4 Step 4.
- [ ] **Step 5: `incident`** — `SubscriptionRef<IncidentState>`; intents are synchronous `runSync` of `Effect.sync` blocks doing controls → push → `setRefIfChanged(ref, reduceIncident(...))`, keeping the RxJS order; the child host scope's close disposes (R-7a). Same unit tests as Task 4 Step 5.
- [ ] **Step 6: layers** — one Tag in `services.ts` and one Layer in `layers.ts` per member, following slice 4's `positions` entries; `layers.test.ts` layer count +9. Composition resolves them in the same `runSync`. `parity.json` nine `"native"`. Seam witness as Task 4 Step 6 — note `mirrorPort` peeks, so compare `live`, never the open count.
- [ ] **Step 7:** `pnpm --filter @rtc/client-core-effect test` all green; mutation-check; commit `feat(core-effect): the admin members, native`.

### Task 6: Docs, status, and the slice gate — then ship PR B

**Files:** `docs/adr/ADR-006-pluggable-application-core.md` ("Decided in slice 5": rulings 5–8 and anything execution changed), `docs/architecture/22-pluggable-application-core.md` (member count, the admin shapes), `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md` (a "Slice 5 shipped" line under slice 4's), `docs/STATUS.md` (pluggable-core entry: 53/74, slices 6/7/8 left; bump "Last updated"), `CLAUDE.md` (the "forty-four members native" prose in Current Status, the `client-core-async`/`client-core-effect` package lines, and the Application core rule → fifty-three, naming the admin nine), both packages' `README.md` if they list members, and `docs/superpowers/plans/2026-09-22-pluggable-core-slice-5-rulings.md` (the execution ledger's rulings, as slice 4's).

- [ ] **Step 1:** `pnpm core:parity` → 53/74 each; paste the output into the report.
- [ ] **Step 2:** write the docs; `pnpm check:doc-links`.
- [ ] **Step 3:** controller: `/rtc:gauntlet full`; `pnpm check:core-bundle`; the e2e matrix `pnpm test:e2e` once per core (`VITE_CORE_IMPL` unset / `async` / `effect`), never overlapping an implementer with production edits in flight, never piped. The admin e2e features (`grep -rl -i admin tests/**/features`) are the ones this slice moves.
- [ ] **Step 4:** push, PR B (`feat(pluggable-core): slice 5 — the admin members, native`), ship per the Global Constraints.

## Self-review

**Spec coverage.** Slice row "5 admin": the eight presenters (Tasks 3/4/5) and `incident` (3/4/5); "rolling windows" → the fold/truncation/retention cases (Task 3 Steps 1–4) over folds imported, not duplicated (Task 1). Exit criterion: suites green on RxJS (Task 3 Step 9), native in both (4, 5), e2e matrix (6 Step 3), `parity.json` (4, 5). Contract tier "driver verbs arrive with the slices that assert on them": Task 2. The strangler shape is unchanged: no `CoreSeams` extension, with a witness (ruling 8).

**Placeholder scan.** Folds and constants are given in full. Suite cases name arrangement and assertion. Sibling implementations are given as algorithms over named existing primitives with the file each one lives in; two primitives are flagged as MEASURE-then-rule (Effect `Clock` under fake timers; a topic fold if none exists), each with its decision rule. Case 10 of `throughput` carries an explicit "RxJS is the contract" instruction because its exact observable history is subtle.

**Type consistency.** `IncidentEvent`, `reduceIncident`, `incidentConnectionEvent`, `appendMetricSample`, `prependLogEvent`, `throughputSetMessage`, `THROUGHPUT_SET_ERROR` are defined in Task 1 and consumed by name in Tasks 4–5. Driver verbs used in Task 3 — `emitThroughputSample`, `emitLatencySample`, `emitErrorRateSample`, `emitTopology`, `emitLogEvent`, `emitSessions`, `pendingThroughputLoads`, `resolveThroughputLoad`, `failThroughputLoad`, `pendingThroughputWrites`, `resolveThroughputWrite`, `failThroughputWrite`, `controlCalls` — are declared in Task 2. `pushIncidentEvent(event: ConnectionEvent)` is the same in both siblings. Counts: 74 members; 44 + 9 = 53 native; `PENDING_SUITES` 30 − 9 = 21.
