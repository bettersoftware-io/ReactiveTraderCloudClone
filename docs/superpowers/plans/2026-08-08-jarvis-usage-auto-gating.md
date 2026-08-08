# Jarvis Usage Auto-Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the estimated USD spend of the current 5h `UsageMeter` window crosses a budget, the server narrows the offered Jarvis brains (80% soft: Opus+Sonnet drop; 100% hard: Scripted only) by pushing live `JARVIS_AVAILABILITY` frames, lifts itself when the window rolls, and surfaces the gate in the picker, footer chip, Admin card, and one in-chat system line.

**Architecture:** A pure `computeGateLevel` + a `JarvisGateService` (BehaviorSubject-backed, timer-armed lift) in `@rtc/server` services; the existing one-shot availability effect becomes a live stream that narrows `loops.brains` through the gate; per-turn `resolveBrain` consults the same gate so a hand-crafted frame cannot bypass it. Client side, `JarvisAvailability` gains a required `gate: … | null` field (compile-time blast-radius coverage), `JarvisMachine` folds it into state and appends the downgrade system line, and both web clients render the three UX surfaces. Spec: [../specs/2026-08-08-jarvis-usage-auto-gating-design.md](../specs/2026-08-08-jarvis-usage-auto-gating-design.md).

**Tech Stack:** TypeScript, RxJS, vitest (unit/effects), @rtc/ui-contract swap-trio contract specs, fullstack node smoke (raw `ws`).

## Global Constraints

- **NO Anthropic API calls in any CI-run test.** The node-smoke's dummy `ANTHROPIC_API_KEY=e2e-dummy` exists only to make `createJarvisLoops` offer real brains; the smoke sends **no chat turns** to real brains. Never log or echo any key.
- Budget defaults, verbatim from the spec: `RTC_JARVIS_BUDGET_USD` default `1`, `"off"` disables; `RTC_JARVIS_BUDGET_SOFT_RATIO` default `0.8`; `RTC_JARVIS_FORCE_GATE` ∈ `soft`|`hard` forces the level regardless of spend. Malformed values fall back to the default and log ONE boot line (name + value only).
- Soft gate drops exactly `claude-sonnet-5` + `claude-opus-5`; hard gate leaves `["scripted"]` with `defaultBrain: "scripted"`. A gate only ever **removes** brains env capability offered — never re-adds one.
- In-flight turns always complete; gate transitions are observed at `recordTurn`/`recordTokens` boundaries plus the lift timer.
- `gate.gated` on the wire lists brains removed **by the gate** (the intersection with env-offered brains), never ones env already removed.
- Both web clients (react + solid) ship every UX surface in the same task wave; the shared contract specs assert both via the swap-trio.
- Wire additions are optional fields (`gate?`, admin `budgetUsd?`/`softBudgetUsd?`/`spentWindowUsd?`/`gateLevel?`) — a pre-round server's frames must still parse. Client-internal `JarvisAvailability.gate` is REQUIRED (`| null`) so tsc surfaces every construction site.
- Run the ROOT `pnpm lint:eslint` (not only package-scoped biome) before declaring any task done — package-green ≠ root-AST-rules-green (P5 lesson: 77 accumulated errors).
- Handler naming per `docs/handler-naming.md` (effect names, not occasions); mandatory braces; `#/` subpath aliases; no `@/`.

---

### Task 1: `jarvisGate` service — pure gate math + shared wire types

**Files:**
- Modify: `packages/shared/src/jarvis/jarvisEvent.ts` (gate types on the availability payload; fix the stale "static per process" doc comment at lines 84–87)
- Modify: `packages/shared/src/jarvis/jarvisUsage.ts` (admin payload extension)
- Modify: `packages/shared/src/index.ts` (re-exports; follow the file's existing grouping)
- Create: `packages/server/src/services/jarvisGate.ts`
- Test: `packages/server/src/services/jarvisGate.test.ts`

**Interfaces:**
- Consumes: `JarvisUsageSnapshot`, `UsageMeter.snapshot$` (`packages/server/src/services/UsageMeter.ts:134`), `JARVIS_BRAINS`/`JarvisBrain` from `@rtc/domain`.
- Produces (later tasks rely on these exact names):
  - shared: `JarvisGateLevel = "none" | "soft" | "hard"`, `JarvisAvailabilityGate { level: Exclude<JarvisGateLevel,"none">; resetsAtMs: number; gated: readonly JarvisBrain[] }`, `JarvisAvailabilityPayload.gate?: JarvisAvailabilityGate`, `AdminJarvisUsagePayload extends JarvisUsageSnapshot { budgetUsd?: number | null; softBudgetUsd?: number | null; spentWindowUsd?: number; gateLevel?: JarvisGateLevel }`.
  - server: `JarvisGateConfig { budgetUsd: number | "off"; softRatio: number; forceLevel: "soft" | "hard" | null }`, `parseJarvisGateConfig(env)`, `spentWindowUsd(snapshot)`, `computeGateLevel(snapshot, config, nowMs)`, `applyGateToOffer(brains, defaultBrain, level)` → `{ brains; defaultBrain; gated }`, `class JarvisGateService { state$; current(); readonly config; dispose() }` with `JarvisGateState { level: JarvisGateLevel; resetsAtMs: number }`.

- [ ] **Step 1: Add the shared types.** In `jarvisEvent.ts`, next to `JarvisAvailabilityPayload`:

```ts
/** Tri-state budget-gate level; "none" never crosses the wire on the
 * availability payload — `gate` is simply absent. The admin usage payload
 * carries the full tri-state. */
export type JarvisGateLevel = "none" | "soft" | "hard";

/** Present on JARVIS_AVAILABILITY only while a budget gate is active.
 * `gated` lists the brains removed BY the gate (already intersected with
 * what env capability offered), so the picker can render them
 * disabled-with-reason rather than plainly absent. `resetsAtMs` is the
 * meter's windowEndMs (0 when a forced gate is active on a fresh meter —
 * consumers render "—"). */
export interface JarvisAvailabilityGate {
  readonly level: Exclude<JarvisGateLevel, "none">;
  readonly resetsAtMs: number;
  readonly gated: readonly JarvisBrain[];
}
```

Add `readonly gate?: JarvisAvailabilityGate;` to `JarvisAvailabilityPayload`, and rewrite the stale availability doc comment (currently "Availability is static per server process, so there is no server-side push on change") to say the server pushes a fresh frame on every gate transition and the client channel is already live-push-capable.

In `jarvisUsage.ts`:

```ts
/** ADMIN_JARVIS_USAGE payload: the meter snapshot plus the budget-gate
 * envelope. All four gate fields are absent on pre-round servers.
 * `budgetUsd: null` means gating is disabled (`RTC_JARVIS_BUDGET_USD=off`);
 * `softBudgetUsd` is server-computed (budget × soft ratio) so the client
 * never needs the ratio itself. */
export interface AdminJarvisUsagePayload extends JarvisUsageSnapshot {
  readonly budgetUsd?: number | null;
  readonly softBudgetUsd?: number | null;
  readonly spentWindowUsd?: number;
  readonly gateLevel?: JarvisGateLevel;
}
```

- [ ] **Step 2: Write the failing tests** for the pure functions in `packages/server/src/services/jarvisGate.test.ts`:

```ts
import { BehaviorSubject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JarvisUsageSnapshot } from "@rtc/shared";

import {
  DEFAULT_JARVIS_BUDGET_SOFT_RATIO,
  DEFAULT_JARVIS_BUDGET_USD,
  JarvisGateService,
  applyGateToOffer,
  computeGateLevel,
  parseJarvisGateConfig,
  spentWindowUsd,
} from "./jarvisGate.js";

function snapshotWith(spentUsd: number, windowEndMs: number): JarvisUsageSnapshot {
  return {
    windowStartMs: windowEndMs === 0 ? 0 : windowEndMs - 18_000_000,
    windowEndMs,
    currentWindow: [
      {
        brain: "claude-haiku-4-5",
        turns: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        estimatedCostUsd: spentUsd,
      },
    ],
    sinceBoot: [],
  };
}

const CONFIG = { budgetUsd: 1, softRatio: 0.8, forceLevel: null } as const;

describe("computeGateLevel", () => {
  it("reports none below the soft threshold", () => {
    expect(computeGateLevel(snapshotWith(0.79, 10_000), CONFIG, 5_000)).toBe("none");
  });

  it("trips soft at exactly budget × softRatio (>= boundary)", () => {
    expect(computeGateLevel(snapshotWith(0.8, 10_000), CONFIG, 5_000)).toBe("soft");
  });

  it("trips hard at exactly the budget (>= boundary)", () => {
    expect(computeGateLevel(snapshotWith(1, 10_000), CONFIG, 5_000)).toBe("hard");
  });

  it("reports none when the window has lazily elapsed, regardless of stale rows", () => {
    expect(computeGateLevel(snapshotWith(5, 10_000), CONFIG, 10_000)).toBe("none");
  });

  it("reports none on a fresh meter (windowEndMs 0)", () => {
    expect(computeGateLevel(snapshotWith(5, 0), CONFIG, 0)).toBe("none");
  });

  it("reports none always when the budget is off", () => {
    expect(
      computeGateLevel(snapshotWith(5, 10_000), { ...CONFIG, budgetUsd: "off" }, 5_000),
    ).toBe("none");
  });

  it("force wins over everything, including an elapsed window and off", () => {
    expect(
      computeGateLevel(snapshotWith(0, 0), { ...CONFIG, forceLevel: "soft" }, 99),
    ).toBe("soft");
    expect(
      computeGateLevel(
        snapshotWith(0, 0),
        { budgetUsd: "off", softRatio: 0.8, forceLevel: "hard" },
        99,
      ),
    ).toBe("hard");
  });
});

describe("spentWindowUsd", () => {
  it("sums estimatedCostUsd across the current window's rows", () => {
    const snap = snapshotWith(0.25, 10_000);
    expect(spentWindowUsd(snap)).toBeCloseTo(0.25);
  });
});

describe("applyGateToOffer", () => {
  const ALL = ["scripted", "claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"] as const;

  it("none: passes the offer through untouched, nothing gated", () => {
    expect(applyGateToOffer(ALL, "claude-haiku-4-5", "none")).toEqual({
      brains: ALL,
      defaultBrain: "claude-haiku-4-5",
      gated: [],
    });
  });

  it("soft: drops sonnet+opus, keeps haiku default, gates only what was offered", () => {
    expect(applyGateToOffer(ALL, "claude-haiku-4-5", "soft")).toEqual({
      brains: ["scripted", "claude-haiku-4-5"],
      defaultBrain: "claude-haiku-4-5",
      gated: ["claude-sonnet-5", "claude-opus-5"],
    });
  });

  it("soft with a gated default falls back to haiku", () => {
    expect(applyGateToOffer(ALL, "claude-opus-5", "soft").defaultBrain).toBe(
      "claude-haiku-4-5",
    );
  });

  it("hard: scripted only", () => {
    expect(applyGateToOffer(ALL, "claude-haiku-4-5", "hard")).toEqual({
      brains: ["scripted"],
      defaultBrain: "scripted",
      gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
    });
  });

  it("never re-adds an env-removed brain: scripted-only offer stays scripted-only", () => {
    expect(applyGateToOffer(["scripted"], "scripted", "soft")).toEqual({
      brains: ["scripted"],
      defaultBrain: "scripted",
      gated: [],
    });
  });
});

describe("parseJarvisGateConfig", () => {
  it("defaults with an empty env", () => {
    expect(parseJarvisGateConfig({})).toEqual({
      budgetUsd: DEFAULT_JARVIS_BUDGET_USD,
      softRatio: DEFAULT_JARVIS_BUDGET_SOFT_RATIO,
      forceLevel: null,
    });
  });

  it("reads off, numeric budget, ratio, and force", () => {
    expect(
      parseJarvisGateConfig({
        RTC_JARVIS_BUDGET_USD: "off",
        RTC_JARVIS_BUDGET_SOFT_RATIO: "0.5",
        RTC_JARVIS_FORCE_GATE: "hard",
      }),
    ).toEqual({ budgetUsd: "off", softRatio: 0.5, forceLevel: "hard" });
  });

  it("falls back per-field on malformed values and warns once per field", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      parseJarvisGateConfig({
        RTC_JARVIS_BUDGET_USD: "banana",
        RTC_JARVIS_BUDGET_SOFT_RATIO: "2",
        RTC_JARVIS_FORCE_GATE: "sideways",
      }),
    ).toEqual({
      budgetUsd: DEFAULT_JARVIS_BUDGET_USD,
      softRatio: DEFAULT_JARVIS_BUDGET_SOFT_RATIO,
      forceLevel: null,
    });
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});

describe("JarvisGateService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at none, transitions on snapshot emissions, lifts on the armed timer", () => {
    let nowMs = 0;
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(snapshotWith(0, 0));
    const service = new JarvisGateService({ snapshot$ }, CONFIG, () => nowMs);
    const levels: string[] = [];
    const sub = service.state$.subscribe((s) => {
      levels.push(s.level);
    });

    // spend crosses hard inside a live window ending at t=10_000
    nowMs = 1_000;
    snapshot$.next(snapshotWith(1.2, 10_000));
    expect(service.current().level).toBe("hard");
    expect(service.current().resetsAtMs).toBe(10_000);

    // no new turns: the armed timer lifts the gate at windowEndMs
    nowMs = 10_000;
    vi.advanceTimersByTime(9_000);
    expect(service.current().level).toBe("none");
    expect(levels).toEqual(["none", "hard", "none"]);

    sub.unsubscribe();
    service.dispose();
  });

  it("does not arm a timer while ungated (no spurious emissions)", () => {
    let nowMs = 0;
    const snapshot$ = new BehaviorSubject<JarvisUsageSnapshot>(snapshotWith(0, 0));
    const service = new JarvisGateService({ snapshot$ }, CONFIG, () => nowMs);
    const levels: string[] = [];
    const sub = service.state$.subscribe((s) => {
      levels.push(s.level);
    });

    nowMs = 1_000;
    snapshot$.next(snapshotWith(0.1, 10_000));
    vi.advanceTimersByTime(60_000);
    expect(levels).toEqual(["none"]);

    sub.unsubscribe();
    service.dispose();
  });
});
```

- [ ] **Step 2b: Run to verify failure.** `pnpm --filter @rtc/server test -- jarvisGate` — FAIL (module not found).

- [ ] **Step 3: Implement `packages/server/src/services/jarvisGate.ts`:**

```ts
import {
  BehaviorSubject,
  EMPTY,
  Subscription,
  concat,
  map,
  of,
  switchMap,
  timer,
  type Observable,
} from "rxjs";

import type { JarvisBrain } from "@rtc/domain";
import type { JarvisGateLevel, JarvisUsageSnapshot } from "@rtc/shared";

import type { UsageMeter } from "./UsageMeter.js";

export const DEFAULT_JARVIS_BUDGET_USD = 1;
export const DEFAULT_JARVIS_BUDGET_SOFT_RATIO = 0.8;

/** The expensive brains the soft stage removes; hard removes every real brain. */
const SOFT_GATED: readonly JarvisBrain[] = ["claude-sonnet-5", "claude-opus-5"];
const HARD_GATED: readonly JarvisBrain[] = [
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-5",
];

export interface JarvisGateConfig {
  readonly budgetUsd: number | "off";
  readonly softRatio: number;
  readonly forceLevel: "soft" | "hard" | null;
}

export function parseJarvisGateConfig(env: NodeJS.ProcessEnv): JarvisGateConfig {
  let budgetUsd: number | "off" = DEFAULT_JARVIS_BUDGET_USD;
  const rawBudget = env.RTC_JARVIS_BUDGET_USD;

  if (rawBudget !== undefined) {
    if (rawBudget === "off") {
      budgetUsd = "off";
    } else if (Number.isFinite(Number(rawBudget)) && Number(rawBudget) > 0) {
      budgetUsd = Number(rawBudget);
    } else {
      console.warn(`jarvis-gate: malformed RTC_JARVIS_BUDGET_USD "${rawBudget}", using default`);
    }
  }

  let softRatio = DEFAULT_JARVIS_BUDGET_SOFT_RATIO;
  const rawRatio = env.RTC_JARVIS_BUDGET_SOFT_RATIO;

  if (rawRatio !== undefined) {
    const parsed = Number(rawRatio);

    if (Number.isFinite(parsed) && parsed > 0 && parsed < 1) {
      softRatio = parsed;
    } else {
      console.warn(
        `jarvis-gate: malformed RTC_JARVIS_BUDGET_SOFT_RATIO "${rawRatio}", using default`,
      );
    }
  }

  let forceLevel: "soft" | "hard" | null = null;
  const rawForce = env.RTC_JARVIS_FORCE_GATE;

  if (rawForce !== undefined && rawForce !== "") {
    if (rawForce === "soft" || rawForce === "hard") {
      forceLevel = rawForce;
    } else {
      console.warn(`jarvis-gate: malformed RTC_JARVIS_FORCE_GATE "${rawForce}", ignoring`);
    }
  }

  return { budgetUsd, softRatio, forceLevel };
}

export function spentWindowUsd(snapshot: JarvisUsageSnapshot): number {
  return snapshot.currentWindow.reduce((sum, row) => {
    return sum + row.estimatedCostUsd;
  }, 0);
}

/**
 * The single gate decision. Owns the lazy-roll honesty rule: `UsageMeter`
 * only rolls its window when a record arrives, so an elapsed window's
 * snapshot still shows the old spend — `nowMs >= windowEndMs` is "none"
 * regardless of the rows (a fresh meter's windowEndMs of 0 falls out of the
 * same comparison). A forced level wins over everything, including "off".
 */
export function computeGateLevel(
  snapshot: JarvisUsageSnapshot,
  config: JarvisGateConfig,
  nowMs: number,
): JarvisGateLevel {
  if (config.forceLevel !== null) {
    return config.forceLevel;
  }

  if (config.budgetUsd === "off") {
    return "none";
  }

  if (nowMs >= snapshot.windowEndMs) {
    return "none";
  }

  const spent = spentWindowUsd(snapshot);

  if (spent >= config.budgetUsd) {
    return "hard";
  }

  if (spent >= config.budgetUsd * config.softRatio) {
    return "soft";
  }

  return "none";
}

export interface GatedOffer {
  readonly brains: readonly JarvisBrain[];
  readonly defaultBrain: JarvisBrain;
  readonly gated: readonly JarvisBrain[];
}

/**
 * Narrow an env-capability offer through a gate level. A gate only ever
 * removes; `gated` is the intersection with what was actually offered, so
 * the wire never claims the gate removed a brain env had already removed.
 */
export function applyGateToOffer(
  brains: readonly JarvisBrain[],
  defaultBrain: JarvisBrain,
  level: JarvisGateLevel,
): GatedOffer {
  if (level === "none") {
    return { brains, defaultBrain, gated: [] };
  }

  const removed = level === "soft" ? SOFT_GATED : HARD_GATED;
  const gated = brains.filter((brain) => {
    return removed.includes(brain);
  });
  const surviving = brains.filter((brain) => {
    return !removed.includes(brain);
  });
  const survivingDefault = surviving.includes(defaultBrain)
    ? defaultBrain
    : surviving.includes("claude-haiku-4-5")
      ? "claude-haiku-4-5"
      : "scripted";

  return { brains: surviving, defaultBrain: survivingDefault, gated };
}

export interface JarvisGateState {
  readonly level: JarvisGateLevel;
  /** The meter's windowEndMs at decision time; 0 on a fresh meter. */
  readonly resetsAtMs: number;
}

/**
 * Server-lifetime gate: one shared decision stream over the meter, with a
 * timer-armed lift. Each snapshot emission is re-judged immediately; while
 * the judged level is gated AND the window end is in the future, one timer
 * (per gate episode — switchMap cancels it on the next snapshot) re-judges
 * at windowEndMs so the lifting availability push happens even if nobody
 * talks to Jarvis again. BehaviorSubject-backed so per-turn routing can
 * read `current()` synchronously.
 */
export class JarvisGateService {
  private readonly stateSubject: BehaviorSubject<JarvisGateState>;

  private readonly subscription: Subscription;

  readonly config: JarvisGateConfig;

  constructor(
    meter: Pick<UsageMeter, "snapshot$">,
    config: JarvisGateConfig,
    now: () => number = Date.now,
  ) {
    this.config = config;
    this.stateSubject = new BehaviorSubject<JarvisGateState>({
      level: "none",
      resetsAtMs: 0,
    });
    this.subscription = meter.snapshot$
      .pipe(
        switchMap((snapshot): Observable<JarvisGateState> => {
          const judge = (): JarvisGateState => {
            return {
              level: computeGateLevel(snapshot, config, now()),
              resetsAtMs: snapshot.windowEndMs,
            };
          };
          const immediate = judge();
          const liftDelayMs = snapshot.windowEndMs - now();
          const lift$ =
            immediate.level !== "none" && liftDelayMs > 0
              ? timer(liftDelayMs).pipe(map(judge))
              : EMPTY;

          return concat(of(immediate), lift$);
        }),
      )
      .subscribe((state) => {
        const previous = this.stateSubject.getValue();

        if (
          previous.level !== state.level ||
          previous.resetsAtMs !== state.resetsAtMs
        ) {
          this.stateSubject.next(state);
        }
      });
  }

  get state$(): Observable<JarvisGateState> {
    return this.stateSubject.asObservable();
  }

  current(): JarvisGateState {
    return this.stateSubject.getValue();
  }

  dispose(): void {
    this.subscription.unsubscribe();
    this.stateSubject.complete();
  }
}
```

Note the dedup guard lives in the subscribe callback (not `distinctUntilChanged` on the pipe) so `state$` late subscribers still replay the current value; a `none → none` snapshot burst (every ungated turn) must not re-emit.

- [ ] **Step 4: Run to verify pass.** `pnpm --filter @rtc/server test -- jarvisGate` and `pnpm --filter @rtc/shared test` — PASS. Then `pnpm --filter @rtc/shared build && pnpm --filter @rtc/server typecheck`.

- [ ] **Step 5: Commit.** `git add packages/shared packages/server && git commit -m "feat(server): jarvis budget-gate math + shared gate wire types"`

---

### Task 2: Container wiring, live availability pushes, per-turn gate enforcement

**Files:**
- Modify: `packages/server/src/services/serviceContainer.ts` (interface line 39 area + construction ~55 + return ~81)
- Modify: `packages/server/src/effects/jarvis.effects.ts` (availability effect lines 186–198; `resolveBrain` lines 237–243)
- Test: `packages/server/src/effects/jarvis.effects.test.ts` (extend), `packages/server/src/services/serviceContainer.test.ts` if present (else effects tests cover it)

**Interfaces:**
- Consumes: `JarvisGateService`, `parseJarvisGateConfig`, `applyGateToOffer`, `JarvisGateState` (Task 1); `JarvisLoops` (`packages/server/src/agent/agentLoop.ts:80-85`); `stream((_payload, ctx) => Observable<Outbound>)` from `@rtc/ws-effects`.
- Produces: `ServiceContainer.jarvisGate: JarvisGateService`; availability frames that re-push on every gate transition; `resolveBrain` that consults `ctx.jarvisGate.current()`.

- [ ] **Step 1: Failing effects tests.** In `jarvis.effects.test.ts`, using the file's existing harness (fake ctx + `createWsListener`) add a describe `"budget gate"`:

```ts
it("re-pushes availability when the gate trips, narrowed and carrying gate metadata", () => {
  // ctx built with a real UsageMeter on an injected clock and a
  // JarvisGateService({ budgetUsd: 0.5, softRatio: 0.8, forceLevel: null })
  // loops: brains = JARVIS_BRAINS, defaultBrain = "claude-haiku-4-5"
  // 1. subscribe → frame 1: no gate field, all brains
  // 2. meter.recordTokens("claude-opus-5", { inputTokens: 200_000, outputTokens: 0, ... })
  //    → estimated $1.00 ≥ budget → frame 2: brains ["scripted"],
  //      defaultBrain "scripted", gate { level: "hard", gated: [haiku, sonnet, opus] }
});

it("soft gate keeps haiku and scripted and lists exactly sonnet+opus as gated", () => { /* spend $0.45 of $1 budget with softRatio 0.8 → none; then $0.85 → soft */ });

it("lifts by timer without any new record (fake timers advance past windowEndMs)", () => {});

it("a turn frame requesting a gated brain resolves to the gated offer's default", () => {
  // force soft; send a chat frame with brain: "claude-opus-5";
  // assert the scripted-vs-anthropic routing saw "claude-haiku-4-5"
  // (observable via the existing recordTurn spy / resolved-brain assertion
  // pattern already used at jarvis.effects.test.ts:147-192)
});

it("hard gate routes every turn to the scripted loop", () => {});
```

Write these as real tests against the file's existing fixtures (the file already builds `loops` fakes and asserts `resolveBrain` behaviour at lines 147/160/192 — extend those patterns; do not invent a parallel harness).

- [ ] **Step 2: Run to verify failure.** `pnpm --filter @rtc/server test -- jarvis.effects` — FAIL (`ctx.jarvisGate` undefined).

- [ ] **Step 3: Implement.**

`serviceContainer.ts`: add to the interface `readonly jarvisGate: JarvisGateService;`, construct after the meter:

```ts
const usageMeter = new UsageMeter();
const jarvisGate = new JarvisGateService(
  usageMeter,
  parseJarvisGateConfig(process.env),
);
```

and include `jarvisGate` in the returned container.

`jarvis.effects.ts` availability effect becomes:

```ts
const availability$: WsEffect<Ctx> = stream(
  CLIENT_MSG.JARVIS_SUBSCRIBE,
  (_payload, ctx): Observable<Outbound> => {
    return ctx.jarvisGate.state$.pipe(
      map((gate) => {
        return out(
          SERVER_MSG.JARVIS_AVAILABILITY,
          buildAvailabilityPayload(loops, gate),
        );
      }),
    );
  },
);
```

with, in the same file:

```ts
function buildAvailabilityPayload(
  loops: JarvisLoops | null,
  gate: JarvisGateState,
): JarvisAvailabilityPayload {
  if (loops === null) {
    return { available: false, brains: [], defaultBrain: "scripted" };
  }

  const offer = applyGateToOffer(loops.brains, loops.defaultBrain, gate.level);

  if (gate.level === "none") {
    return {
      available: true,
      brains: offer.brains,
      defaultBrain: offer.defaultBrain,
    };
  }

  return {
    available: true,
    brains: offer.brains,
    defaultBrain: offer.defaultBrain,
    gate: {
      level: gate.level,
      resetsAtMs: gate.resetsAtMs,
      gated: offer.gated,
    },
  };
}
```

`resolveBrain` (237–243) gains the gate: compute `const offer = applyGateToOffer(activeLoops.brains, activeLoops.defaultBrain, ctx.jarvisGate.current().level);` and resolve the requested brain against `offer.brains` with fallback `offer.defaultBrain`. Thread `ctx` in from the call site if the current signature lacks it — keep the function pure (pass the offer, not the ctx, if that reads cleaner; name it for its effect per the handler-naming doc).

- [ ] **Step 4: Run to verify pass.** `pnpm --filter @rtc/server test` (full package — the availability shape change may touch other effect tests) and `pnpm --filter @rtc/server typecheck`.

- [ ] **Step 5: Commit.** `git commit -m "feat(server): live gated availability pushes + per-turn gate enforcement"`

---

### Task 3: Admin usage payload enrichment

**Files:**
- Modify: `packages/server/src/effects/adminJarvisUsage.effects.ts`
- Test: `packages/server/src/effects/adminJarvisUsage.effects.test.ts` (extend the existing file beside it; create following the sibling effects-test pattern if absent)

**Interfaces:**
- Consumes: `AdminJarvisUsagePayload` (Task 1), `ctx.jarvisGate` (Task 2), `spentWindowUsd`.
- Produces: `ADMIN_JARVIS_USAGE` frames carrying `budgetUsd` / `softBudgetUsd` / `spentWindowUsd` / `gateLevel`.

- [ ] **Step 1: Failing test.** Subscribe with a ctx whose gate config is `{ budgetUsd: 2, softRatio: 0.8, forceLevel: null }`, record $0.30 of usage, assert the pushed payload has `budgetUsd: 2`, `softBudgetUsd: 1.6`, `spentWindowUsd` ≈ 0.3, `gateLevel: "none"`. Second case: config `budgetUsd: "off"` → `budgetUsd: null`, `softBudgetUsd: null`. Third: forced hard → `gateLevel: "hard"`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — replace the `map` in the existing effect:

```ts
const jarvisUsage$: WsEffect<Ctx> = stream(
  CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
  (_payload, ctx) => {
    return combineLatest([
      ctx.usageMeter.snapshot$.pipe(
        throttleTime(1_000, undefined, { leading: true, trailing: true }),
      ),
      ctx.jarvisGate.state$,
    ]).pipe(
      map(([snapshot, gate]) => {
        const { budgetUsd, softRatio } = ctx.jarvisGate.config;
        const payload: AdminJarvisUsagePayload = {
          ...snapshot,
          budgetUsd: budgetUsd === "off" ? null : budgetUsd,
          softBudgetUsd: budgetUsd === "off" ? null : budgetUsd * softRatio,
          spentWindowUsd: spentWindowUsd(snapshot),
          gateLevel: gate.level,
        };

        return out(SERVER_MSG.ADMIN_JARVIS_USAGE, payload);
      }),
    );
  },
);
```

Keep the throttle on the snapshot leg only (gate transitions are rare and should surface immediately).

- [ ] **Step 4: Run to verify pass.** `pnpm --filter @rtc/server test -- adminJarvisUsage`.

- [ ] **Step 5: Commit.** `git commit -m "feat(server): admin usage frames carry budget, spend, and gate level"`

---

### Task 4: Client-core — adapter gate parsing + `JarvisAvailability.gate`

**Files:**
- Modify: `packages/client-core/src/adapters/jarvisPort.ts` (`JarvisAvailability`, lines 37–41)
- Modify: `packages/client-core/src/adapters/WsJarvisAdapter.ts` (`parseAvailability` 332–340, `jarvisAvailabilityEquals` 348–360)
- Modify: `packages/client-core/src/presenters/JarvisMachine.ts` (`DEFAULT_AVAILABILITY` 211–215 only — the rest is Task 5)
- Test: `packages/client-core/src/adapters/wsRealJarvis.contract.test.ts` (availability block, 768–1004)

**Interfaces:**
- Consumes: `JarvisAvailabilityGate`, `isJarvisBrain`.
- Produces: `JarvisAvailability { available; brains; defaultBrain; gate: JarvisAvailabilityGate | null }` — **`gate` REQUIRED** so tsc flags every construction site (the deliberate blast-radius move; expect fallout in ui-contract `world.ts` seeds and contract specs — those compile fixes land in Tasks 6–8, so this task runs `pnpm --filter @rtc/client-core typecheck`+tests only, not the root build).

- [ ] **Step 1: Failing tests** in `wsRealJarvis.contract.test.ts`: (a) a frame with a valid `gate` object surfaces it verbatim on `availability$`; (b) each malformed variant — `level: "medium"`, `resetsAtMs: "soon"`, `gated: ["chatgpt"]`, `gate: 7` — yields `gate: null` while the rest of the frame still applies (the silent-drop rule, matching the P5 `jarvis.command` precedent); (c) two frames identical except `gate.level` are NOT deduped by `jarvisAvailabilityEquals`; identical frames including gate ARE.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**

```ts
function parseGate(gate: unknown): JarvisAvailabilityGate | null {
  if (typeof gate !== "object" || gate === null) {
    return null;
  }

  const candidate = gate as {
    level?: unknown;
    resetsAtMs?: unknown;
    gated?: unknown;
  };

  if (candidate.level !== "soft" && candidate.level !== "hard") {
    return null;
  }

  if (typeof candidate.resetsAtMs !== "number") {
    return null;
  }

  if (!Array.isArray(candidate.gated) || !candidate.gated.every(isJarvisBrain)) {
    return null;
  }

  return {
    level: candidate.level,
    resetsAtMs: candidate.resetsAtMs,
    gated: candidate.gated as readonly JarvisBrain[],
  };
}
```

`parseAvailability` adds `gate: parseGate(payload.gate)`. `jarvisAvailabilityEquals` compares `gate === null` vs both-non-null field equality (level, resetsAtMs, ordered gated). `DEFAULT_AVAILABILITY` gains `gate: null`.

- [ ] **Step 4: Run to verify pass.** `pnpm --filter @rtc/client-core test && pnpm --filter @rtc/client-core typecheck`.

- [ ] **Step 5: Commit.** `git commit -m "feat(client-core): availability gate parsing with silent-drop shape guard"`

---

### Task 5: `JarvisMachine` — gate state + the downgrade system line

**Files:**
- Modify: `packages/client-core/src/presenters/JarvisMachine.ts`
- Test: `packages/client-core/src/presenters/__tests__/JarvisMachine.test.ts`

**Interfaces:**
- Consumes: `JarvisAvailability.gate` (Task 4), `JARVIS_BRAIN_LABELS` from `@rtc/domain`.
- Produces: `JarvisState.gate: JarvisAvailabilityGate | null` (INITIAL: `null`); `JarvisEntry.origin` union widened to `"narrator" | "system"`; exported `formatGateResetTime(resetsAtMs: number): string` (locale `HH:MM` via `toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })`, `"—"` for `0`).

- [ ] **Step 1: Failing tests:**

```ts
it("appends one system line when a gate frame downgrades the active brain mid-conversation", () => {
  // open a conversation (one completed turn), preferred brain opus,
  // availability offers all brains → effectiveBrain opus.
  // Push availability { brains: [scripted, haiku], defaultBrain: haiku,
  //   gate: { level: "soft", resetsAtMs: <t>, gated: [sonnet, opus] } }.
  // Expect exactly one new entry: role "jarvis", done true, origin "system",
  // text `Usage budget reached — continuing on Haiku 4.5 until <HH:MM>.`
});

it("appends no system line when the effective brain is unaffected (haiku user, soft gate)", () => {});

it("appends no system line when the conversation is empty (entries.length === 0)", () => {});

it("hard gate wording names scripted", () => {
  // text `Usage budget reached — continuing on scripted until <HH:MM>.`
});

it("state.gate mirrors the availability gate and clears on lift", () => {});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** In `availabilityPatches$` (714–729), which already recomputes `effectiveBrain`: capture the previous effective brain before updating the mutable cache; when `availability.gate !== null && next !== previous && state.entries.length > 0`, extend the patch to also append:

```ts
{
  id: nextEntryId++,
  role: "jarvis",
  text: `Usage budget reached — continuing on ${JARVIS_BRAIN_LABELS[next]}${untilClause(availability.gate.resetsAtMs)}.`,
  done: true,
  origin: "system",
}
```

with `untilClause(ms)` returning `""` for `0` and `` ` until ${formatGateResetTime(ms)}` `` otherwise. Set `state.gate` from every availability emission (null when absent). Follow the `driveOutcomePatches$` (679–695) entry-append shape exactly — same `nextEntryId` counter, same patch-merge into `stream$`.

- [ ] **Step 4: Run to verify pass.** `pnpm --filter @rtc/client-core test`.

- [ ] **Step 5: Commit.** `git commit -m "feat(client-core): gate state + budget-downgrade system line in JarvisMachine"`

---

### Task 6: React UI — picker hint, chip gated state, admin budget line, system-line styling

**Files:**
- Modify: `packages/client-react/src/ui/shell/prefs/PrefSegment.tsx` (option `title`), `PreferencesModal.tsx` (options builder 96–104 + a hint line under the Brain row)
- Modify: `packages/client-react/src/ui/shell/status/JarvisStatusChip.tsx` + `StatusBar.module.css`
- Modify: `packages/client-react/src/ui/admin/jarvis/JarvisUsageCard.tsx`
- Modify: the overlay transcript row component (the one that already stamps `data-origin` for narrator entries — find it via `grep -rn 'data-origin' packages/client-react/src/ui/shell/jarvis/`) + its module.css
- Test: covered by the shared contract specs in Task 8; this task must keep `pnpm --filter @rtc/client-react test:ui:contract` green for the EXISTING specs

**Interfaces:**
- Consumes: `state.gate` (Task 5), `AdminJarvisUsagePayload` fields (Task 3), `formatGateResetTime` (Task 5).
- Produces (test hooks Task 8 asserts): `PrefSegmentOption.title?: string`; hint element `data-testid="pref-segment-jarvisBrain-hint"`; chip `data-gate={"soft"|"hard"}` with visible text suffix `· budget-limited` / `· budget exhausted`; admin `data-testid="admin-jarvis-budget-line"`; transcript rows carry `data-origin="system"`.

- [ ] **Step 1: Picker.** `PrefSegmentOption` gains `title?: string` (forwarded as the button's native `title`). In `PreferencesModal.tsx`, extend the existing builder — a brain in `jarvisState.gate?.gated` gets `disabled: true` and `title: gateHint`, where

```ts
const gate = jarvisState.gate;
const gateHint =
  gate === null
    ? undefined
    : `Budget window — resets ${formatGateResetTime(gate.resetsAtMs)}`;
```

Under the Brain row, when `gate !== null`, render `<div className={styles.gateHint} data-testid="pref-segment-jarvisBrain-hint">{gateHint}</div>` (muted, small — reuse the modal's existing description styling class if one exists rather than inventing one).

- [ ] **Step 2: Chip.** When `state.gate !== null`, append `· budget-limited` (soft) / `· budget exhausted` (hard) to the chip text, add `data-gate={state.gate.level}`, and a `jarvisChipGated` class (amber tint for soft, red for hard — pick tokens already used by the status bar for warn/error states; **read `docs/performance.md` before adding any transition/animation — a static color change needs none**).

- [ ] **Step 3: Admin card.** When `usage.budgetUsd !== undefined`, render above CURRENT WINDOW:

```tsx
<div data-testid="admin-jarvis-budget-line">
  {usage.budgetUsd === null
    ? "BUDGET OFF"
    : `$${(usage.spentWindowUsd ?? 0).toFixed(2)} of $${usage.budgetUsd.toFixed(2)} this window — soft gate at $${(usage.softBudgetUsd ?? 0).toFixed(2)}`}
  {usage.gateLevel === "soft" || usage.gateLevel === "hard" ? (
    <span data-testid="admin-jarvis-gate-badge">{usage.gateLevel.toUpperCase()} GATE</span>
  ) : null}
</div>
```

(match the card's existing row classes; the client renders `AdminJarvisUsagePayload` now — update the `useJarvisUsage` chain's type from `JarvisUsageSnapshot` to the payload type at the adapter cast in `WsJarvisUsageAdapter.ts`, the port, and the presenter).

- [ ] **Step 4: Transcript styling.** Confirm the overlay row stamps `data-origin` generically from `entry.origin` (it does for narrator); add a muted `[data-origin="system"]` rule beside the narrator rule in the overlay's module.css.

- [ ] **Step 5: Verify + commit.** `pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-react typecheck`, then `git commit -m "feat(client-react): budget-gate surfaces — picker hint, chip state, admin budget line"`

---

### Task 7: Solid UI — mirror of Task 6

**Files:** the `packages/client-solid` mirrors of every Task 6 file (`PrefSegment.tsx`, `PreferencesModal.tsx` 95–103, `JarvisStatusChip.tsx`, `StatusBar.module.css`, `JarvisUsageCard.tsx`, overlay row + css).

**Interfaces:** identical test hooks to Task 6 (`title`, `pref-segment-jarvisBrain-hint`, `data-gate`, `admin-jarvis-budget-line`, `admin-jarvis-gate-badge`, `data-origin="system"`). Solid reads state as accessors (`jarvisState().gate`); the two `*.module.css` diffs must be byte-identical to react's (repo convention for shared visuals).

- [ ] **Step 1: Port each Task 6 edit** file-by-file (Solid idioms: `<Show when={...}>` instead of ternary-null, accessors instead of values).
- [ ] **Step 2: Verify.** `pnpm --filter @rtc/client-solid test && pnpm --filter @rtc/client-solid typecheck`.
- [ ] **Step 3: Commit.** `git commit -m "feat(client-solid): budget-gate surfaces — picker hint, chip state, admin budget line"`

---

### Task 8: Contract specs (swap-trio) + world gate seeding

**Files:**
- Modify: `packages/ui-contract/src/shared/harness/world.ts` (the `jarvisAvailability` BehaviorSubject seed at 411 and `createWorld` params 584–587 — every `JarvisAvailability` literal gains `gate` — plus a `jarvisUsage` seed already exists at 268 for the admin card)
- Modify: `packages/ui-contract/src/shared/mount.ts` (types flow through)
- Modify: `packages/ui-contract/src/shared/pages/shell/prefs/PreferencesModalPage.ts` (add `jarvisBrainHintText(): string | null`, `jarvisBrainOptionTitle(brain): string | null`), `.../shell/status/` chip page object (`gateLevel(): string | null` reading `data-gate`, `text()`), `.../admin/JarvisUsageCardPage.ts` (`budgetLineText()`, `gateBadgeText()`)
- Modify specs: `shell/status/JarvisStatusChip.contract.spec.ts`, `shell/prefs/PreferencesModal.contract.spec.ts`, `admin/JarvisUsageCard.contract.spec.ts`, `shell/jarvis/JarvisOverlay.contract.spec.ts`

**Interfaces:** Consumes every test hook from Tasks 6–7 and the `gate` field from Task 4. This task also sweeps the compile fallout Task 4's required-`gate` created in ui-contract fixtures.

- [ ] **Step 1: New spec cases** (each written red-first against the react runner, then confirmed on solid):

```ts
// JarvisStatusChip.contract.spec.ts
it("suffixes budget-limited and stamps data-gate=soft under a soft gate", ...);
it("suffixes budget exhausted and stamps data-gate=hard under a hard gate", ...);
// seed: mount({ jarvisAvailability: { available: true,
//   brains: ["scripted", "claude-haiku-4-5"], defaultBrain: "claude-haiku-4-5",
//   gate: { level: "soft", resetsAtMs: 1_754_000_000_000, gated: ["claude-sonnet-5", "claude-opus-5"] } } })

// PreferencesModal.contract.spec.ts
it("disables gated brains and titles them with the reset time", ...);
it("shows the budget hint line under the Brain row while gated, and not when ungated", ...);

// JarvisUsageCard.contract.spec.ts
it("renders spent-of-budget with the soft-gate mark when the payload carries budget fields", ...);
it("renders BUDGET OFF when budgetUsd is null", ...);
it("renders no budget line at all for a pre-round payload without the fields", ...);

// JarvisOverlay.contract.spec.ts
it("stamps data-origin=system on the budget-downgrade line", ...);
// drive via world.jarvisAvailability.next(...) after a completed scripted turn
```

- [ ] **Step 2: Run red** (`pnpm --filter @rtc/client-react test:ui:contract -- -t "budget"`), implement the page-object accessors and any seed plumbing, run green on react, then `pnpm --filter @rtc/client-solid test:ui:contract` for the swap-trio.

- [ ] **Step 3: Coverage.** `pnpm --filter @rtc/client-react test:ui:contract:coverage` and the solid twin — both ≥95% gates must stay green; **also check the per-file numbers for every file this round touched** (the aggregate-gate trap: `pnpm coverage:gaps`).

- [ ] **Step 4: Commit.** `git commit -m "test(ui-contract): budget-gate contract specs — chip, picker, admin card, system line"`

---

### Task 9: Fullstack node-smoke witness + orchestration env

**Files:**
- Modify: `tests/fullstack/_orchestration.ts:27` — `startServer(port: number, host = "127.0.0.1", extraEnv: Record<string, string> = {})`, spread `...extraEnv` LAST in the child env.
- Modify: `tests/fullstack/node-smoke.ts` — new section after the existing cases.

**Interfaces:** Consumes the wire shape from Task 2 (`gate` on `JARVIS_AVAILABILITY`).

- [ ] **Step 1: Write the case.** Boot a second server on a free port with

```ts
startServer(gatedPort, "127.0.0.1", {
  RTC_JARVIS_FAKE: "",
  ANTHROPIC_API_KEY: "e2e-dummy", // never called: this smoke only subscribes
  RTC_JARVIS_FORCE_GATE: "soft",
});
```

then, reusing the file's existing raw-`ws` login + subscribe helpers: send `jarvis.subscribe`, await the `jarvis.availability` frame, assert `brains` is exactly `["scripted", "claude-haiku-4-5"]`, `defaultBrain === "claude-haiku-4-5"`, and `gate` is `{ level: "soft", resetsAtMs: 0, gated: ["claude-sonnet-5", "claude-opus-5"] }` (fresh meter → `resetsAtMs` 0). Kill the server in the same `finally` pattern the file already uses. **Send no chat turns on this connection.**

- [ ] **Step 2: Run.** `pnpm --filter @rtc/tests` (whichever script wraps node-smoke — check `tests/package.json`; it is part of `test:e2e`'s fullstack leg) — first red (server lacks the env passthrough until rebuilt), then green after `pnpm build`.

- [ ] **Step 3: Commit.** `git commit -m "test(fullstack): node-smoke witnesses the forced soft gate over the real wire"`

---

### Task 10: Docs — runbook budget section + dev-script note

**Files:**
- Modify: `docs/running-real-jarvis.md` (new "Budget gate" section: the three env vars with defaults, the $1/5h default-on posture, `off`, `RTC_JARVIS_FORCE_GATE` as the zero-token demo lever, and the in-memory caveat — a restart zeroes the window)
- Modify: `turbo.json` env list — add `RTC_JARVIS_BUDGET_USD`, `RTC_JARVIS_BUDGET_SOFT_RATIO`, `RTC_JARVIS_FORCE_GATE` beside `RTC_JARVIS_FAKE` (line 9); **without this, turbo's strict env mode strips them silently in `dev:*:fs`** (the trap `CLAUDE.md` documents for `VITE_SERVER_URL`).

- [ ] **Step 1: Write both edits.** Cross-link the spec and §18.15.
- [ ] **Step 2: Verify.** `pnpm check:doc-links` + `pnpm lint:actions` (turbo.json isn't actionlint's, but run the fast doc gates that apply); boot `pnpm dev:ws` with `RTC_JARVIS_FORCE_GATE=soft` once and eyeball the availability frame via the devtools wire lens or a `wscat` subscribe.
- [ ] **Step 3: Commit.** `git commit -m "docs(jarvis): budget-gate runbook + turbo env passthrough"`

---

## Execution notes

- **Task order:** 1 → 2 → 3 (server) can pipeline ahead of 4 → 5 (client-core) only in that 4 depends on 1's shared types, not on 2/3. 6 and 7 are parallel after 5. 8 needs 6+7. 9 needs 2. 10 anytime after 2. Do not parallelize two tasks that touch `JarvisMachine.ts`.
- **Spec deviation, recorded:** the spec's testing section named "one Gherkin e2e ride"; no Jarvis Gherkin exists and the sim-mode Playwright suite has no wire, so the e2e witness is the fullstack node-smoke (Task 9) + the contract tier. If a browser-level ride is later wanted, it needs its own Vite instance against a force-gated server — deliberately out of this round.
- **Spec correction, recorded:** the spec said env-removed brains "stay absent" from the picker; in reality round 1 already renders them disabled (PreferencesModal.tsx:96-104). The gate adds the reason `title` + hint line; env-removed-but-ungated brains stay disabled without the budget copy.
- At execution start, move the STATUS 🔴 entry to 🟡 per the tracking skill.
