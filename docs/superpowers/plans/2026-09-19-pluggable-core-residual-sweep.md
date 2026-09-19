# Pluggable Application Core — Residual Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every open residual in `docs/STATUS.md`'s pluggable-core entry — the nineteen items slices 0, 1a and 1b accepted and deferred — so slice 2 starts from primitives whose semantics match across the three cores and a backlog that is empty.

**Architecture:** Nine residuals change behaviour and all nine converge the alternative cores on the RxJS reference (or on one explicit rule for all three): the async `Topic` resets on error as `shareReplay({ refCount: true })` does and isolates a throwing subscriber as rxjs does; the Effect `sharedFold` gains seedless warm periods (an `Option`-typed ref), a watcher latch in place of `yieldNow`, per-period subscriber sets in place of the generation counter, and a period-scoped `fromPort` that owns every port subscription a producer opens; `peek` rethrows a synchronous port error; every port method is called once, at construction, in all three cores, witnessed by a new cross-core contract suite. Nine residuals are mechanical (types, tooling, a dep-cruiser rule, a Playwright fail-fast). One is a prose sweep over `client-core`'s presenter docs. Two decisions are recorded rather than coded: an interrupt-only Effect cause stays silent because the RxJS core's `dispose()` is a knowing no-op, and `AbortSignal` cancellation is cooperative by definition.

**Tech Stack:** TypeScript 7 `tsc` (6.x API shim for tooling), pnpm 12 + Turborepo, vitest 4.1, RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2, dependency-cruiser, Playwright.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md) — the async-core, Effect-core and core-contract sections, which Task 7 amends with the rulings below. Prior plans: slice 0 [`2026-09-12-pluggable-core-slice-0.md`](2026-09-12-pluggable-core-slice-0.md), slice 1a [`2026-09-18-pluggable-core-slice-1a.md`](2026-09-18-pluggable-core-slice-1a.md), slice 1b [`2026-09-19-pluggable-core-slice-1b.md`](2026-09-19-pluggable-core-slice-1b.md).

## Global Constraints

- **Bridge rule:** outside `packages/client-core-{async,effect}/src/bridge/`, `rxjs` and `@rx-state/core` are type-only imports (dependency-cruiser `bridge-owns-rxjs` + grep gate 43; `.test.ts` exempt). `effect` only inside `packages/client-core-effect/`. Every rxjs operator this plan adds (`filter`, `map`, `take`) lives in a `bridge/` file.
- **Types-only rule:** `packages/core-api/src` exports no runtime value (grep gate 42). Task 3 moves and exports TYPES only.
- **Equivalence is the goal.** Where a residual names a divergence, the fix makes all three cores behave the same; where RxJS is the reference, the alternative cores follow it; where the rule is new (port methods called once), the RxJS core changes too and the contract tier witnesses it.
- **No behaviour change without a discriminating test**, and no dead guard kept: a guard whose removal no test can observe is removed, not tested around.
- **Workspace packages resolve through `dist`.** After Task 3 changes `core-api` or `core-contract`, `pnpm --filter @rtc/core-api build && pnpm --filter @rtc/core-contract build` before running any core's tests. Parallel implementers (Tasks 1, 2, 4, 5) start only after Task 3's dist is built.
- **Coverage gates:** alternative cores ≥95/95/95/85; `client-core` has no per-package gate but the ui-contract ≥95% gates run its code; `core-contract` has `passWithNoTests` off.
- **Biome/ESLint conventions:** braces everywhere; block-bodied arrows with explicit `return`; `nursery/useExplicitType` (object-property arrows need explicit parameter types); no `biome-ignore`; `rtc/name-functions-by-effect`; `rtc/newspaper-order` (type declarations below the code that uses them in test files); `rtc/name-fixture-factories` (`create*`); `func-style`; `#/` imports.
- **Commit by pathspec** when tasks run in parallel on one worktree. Trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH
  ```

## Rulings recorded up front (approved by the user 2026-09-19)

1. **`Topic` resets on error.** `shareReplay({ bufferSize: 1, refCount: true })` compiles to `share({ resetOnError: true, resetOnRefCountZero: true })`: after a source error, the replay cell is dropped and the next subscriber re-subscribes the source. The Effect `sharedFold` already does this (a fresh warm period). The async kernel now does too. Cost if wrong: a consumer that relied on the latch (none exists) would see a fresh producer instead of the old error.
2. **A throwing subscriber is isolated**, as rxjs's `SafeSubscriber` isolates it: the other subscribers still receive the value, the thrown error is rethrown on a macrotask (rxjs's `reportUnhandledError` shape). "Producer abort is cooperative" is struck as by design.
3. **An interrupt-only Effect cause stays silent — documented, not changed.** The RxJS core's `createApp().dispose()` is a knowing no-op (its comment says so; the follow-up is a `Subscription` bag), so after `dispose()` a still-attached RxJS subscriber also receives nothing. Completing on interrupt would make the Effect core the odd one out. Recorded in §22; revisited when the RxJS dispose bag lands.
4. **Seedless warm periods.** `SharedFold.seed` returns `Option<S>`; the period ref holds `Option<S>`; nothing is delivered until the first `Some`. `mirrorPort` seeds from `peekCurrent` (an `Option`), so a port that does not emit synchronously produces silence in all three cores. Slice 2's `priceStream` needs exactly this.
5. **The watcher latch replaces `yieldNow`.** A `Deferred` succeeded by the period's watcher on its first emission; `update` awaits it before its first `set`. The same-tick-burst test is the discriminator (it read `[0, 6]` without `yieldNow` in slice 1a and must read `[0, 1, 3, 6]` with the latch and no `yieldNow`).
6. **Generation counter removed; subscribers per period.** The `update` guard was dead by construction once refs became per period (a stale write lands in a ref nobody observes — no test can see it), so it goes. The failure fan-out guard was load-bearing (one shared subscriber set) — replaced by a per-period `Set`, with the discriminating test the residual asked for.
7. **Every port method is called once, at construction, in all three cores.** The alternative cores' `connection` captures `events.events()`; the RxJS `cycle()`/`current()` capture their Observable in the constructor. A new contract suite (`portDiscipline`) witnesses it with a counting Proxy, in every runner.
8. **`peek` rethrows a synchronous source error** in both alternative cores and the RxJS reads do the same, so `cycle()`/`current()` throw a located error. `sharedFold` routes a throwing `seed()` to the subscriber's `error`.
9. **`fromObservable` is reachable only through a period-scoped `fromPort`.** `run` receives it; every subscription it opens is a finalizer of the period scope, so a never-run stream is still released; `fromObservable` leaves the package index, and a dependency-cruiser rule confines `bridge/in.ts` to `bridge/` and tests. The double-run split remains a documented property of any hot queue.
10. **`auth.state$` becomes a `StateStream`** if the change is contained (core-api + `AuthPresenter` + fakes ≤ 3 sites); otherwise it stays a slice-6 item with a note (Task 3/4 carry the stop rule).
11. **The doc sweep runs now** (Task 6): the `core-api` interface doc is canonical; a `client-core` class comment keeps implementation notes only.

## Parallelism (accelerated SDD)

Task 3 first (core-api + core-contract + dep-cruiser: everything else builds on its `dist`). Then **{Task 1, Task 2, Task 4, Task 5} as four parallel implementers**, each committing by pathspec (`-- packages/client-core-async`, `-- packages/client-core-effect`, `-- packages/client-core`, `-- scripts packages/client-react packages/client-solid tests`). Then Task 6 (prose, `client-core`), then Task 7 (docs + gate). Task 3's new contract suite is RED on every runner until Tasks 1, 2 and 4 land — expected, stated in each brief.

---

## File structure

```
packages/core-api/                               Task 3
  src/panelStream.ts                             MOVED from src/presenters/panelStream.ts
  src/presenters/index.ts                        drop the panelStream export
  src/index.ts                                   + export type * from "#/panelStream"
  src/presenters/jarvisPanels.ts                 import path
  src/presenters/throughput.ts                   export interface ThroughputMessage
  src/presenters/auth.ts                         state$: StateStream<AuthViewState>
  src/__tests__/app.test.ts                      a real "plain object satisfies it" assertion
packages/core-contract/                          Task 3
  src/harness/scriptedPorts.ts                   counting Proxy over preferences + connectionEvents; driver.portCalls(name)
  src/harness/scriptedPorts.test.ts              NEW
  src/suites/portDiscipline.ts                   NEW  cross-member suite: each port method called once
  src/index.ts                                   describeCoreContract also runs portDiscipline
.dependency-cruiser.cjs                          Task 3: client-core src → core-contract only from tests; effect bridge/in.ts only from bridge/ + tests

packages/client-core-async/                      Task 1
  src/kernel/topic.ts                            reset on error; per-run publish/fail; subscriber isolation
  src/kernel/topic.test.ts                       flipped + new cases
  src/kernel/reportAsync.ts                      NEW  rethrow on a macrotask
  src/bridge/in.ts                               peekCurrent (Option-free: {value}|null), peek rethrows
  src/bridge/in.test.ts                          flipped latch case; rethrow case
  src/presenters/connection.ts                   events.events() captured once
  src/presenters/connection.test.ts              NEW/extended: called once across two warm periods

packages/client-core-effect/                     Task 2
  src/bridge/in.ts                               fromObservable(source, scope?), peekCurrent: Option, peek rethrows
  src/bridge/out.ts                              sharedFold: Option seed, latch, per-period subscribers, fromPort, throwing seed → error
  src/bridge/{in,out}.test.ts                    amended + new cases
  src/presenters/mirrorPort.ts                   seed via peekCurrent; run(update, fromPort)
  src/presenters/connection.ts                   events captured once; fromPort
  src/presenters/themePreference.ts              fromPort
  src/index.ts                                   fromObservable no longer exported; FoldRun exported
  README.md                                      bridge paragraph

packages/client-core/                            Task 4 (code), Task 6 (prose)
  src/presenters/{ThemePreference,BootPreference,EqWatchlistSortPreference}Presenter.ts   capture the Observable; rethrow
  src/presenters/AuthPresenter.ts                state$ = state(subject, initial)
  src/presenters/ThroughputPresenter.ts          import ThroughputMessage from core-api
  src/presenters/*Presenter.ts, *Machine.ts      Task 6: doc comments deduplicated

scripts/check-core-bundle.mjs                    Task 5: try/finally
packages/client-{react,solid}/vite.config.ts     Task 5: closeBundle honours outDir
packages/client-{react,solid}/src/app/selectCore.ts (+ .test.ts)   Task 5: publish the validated value
tests/browser/playwright/_context.ts, tests/browser/playwright-cucumber/world.ts, tests/browser/testContext.ts, tests/browser/scenarios/login.ts   Task 5: pageerror capture + fail-fast; RTC_CORE_IMPL "" collapses

docs/                                            Task 7
  STATUS.md                                      residual block removed (or reduced to the auth item if the stop rule fired)
  superpowers/specs/2026-09-11-...-design.md     async/Effect/contract bullets amended
  architecture/22-pluggable-application-core.md  new section "Failure, teardown and port discipline"
  adr/ADR-006-pluggable-application-core.md      "Decided in the residual sweep" block
```

---

### Task 3: Foundations — core-api types, the port-discipline contract suite, dep-cruiser rules

**Files:**
- Move: `packages/core-api/src/presenters/panelStream.ts` → `packages/core-api/src/panelStream.ts`
- Modify: `packages/core-api/src/presenters/index.ts`, `packages/core-api/src/index.ts`, `packages/core-api/src/presenters/jarvisPanels.ts`, `packages/core-api/src/presenters/throughput.ts`, `packages/core-api/src/presenters/auth.ts`, `packages/core-api/src/__tests__/app.test.ts`
- Modify: `packages/core-contract/src/harness/scriptedPorts.ts`, `packages/core-contract/src/index.ts`
- Create: `packages/core-contract/src/harness/scriptedPorts.test.ts`, `packages/core-contract/src/suites/portDiscipline.ts`
- Modify: `.dependency-cruiser.cjs`

**Interfaces:**
- Produces: `ThroughputMessage` exported from `@rtc/core-api`; `PanelData`/`PanelPoint`/`PanelTone`/`composePanelStream`-related types now under `#/panelStream` (same names, re-exported from the package root as before); `AuthPresenter.state$: StateStream<AuthViewState>`; `ScriptedDriver.portCalls(method: PortMethodName): number`; `describePortDisciplineContract(label, makeHarness)` run by `describeCoreContract`.
- Consumed by: Tasks 1, 2, 4 (the contract suite is RED on every runner until they land).

- [ ] **Step 1: Move `panelStream.ts` out of `presenters/`**

```bash
git mv packages/core-api/src/presenters/panelStream.ts packages/core-api/src/panelStream.ts
```

In `packages/core-api/src/presenters/index.ts` delete the line `export type * from "#/presenters/panelStream";`. In `packages/core-api/src/index.ts` add `export type * from "#/panelStream";` (Biome sorts the block). In `packages/core-api/src/presenters/jarvisPanels.ts` change `import type { PanelData } from "#/presenters/panelStream";` to `import type { PanelData } from "#/panelStream";`. `grep -rn "presenters/panelStream" packages/` must be empty afterwards (only `core-api` referenced the path; every other package imports the names from the root).

- [ ] **Step 2: One `ThroughputMessage`** — in `packages/core-api/src/presenters/throughput.ts` change `interface ThroughputMessage {` to `export interface ThroughputMessage {` and extend its doc: `/** The status banner the AdminPanel renders. The single definition — \`@rtc/client-core\`'s presenter imports it. */`.

- [ ] **Step 3: `auth.state$` as a `StateStream`** — in `packages/core-api/src/presenters/auth.ts` change the import to `import type { StateStream } from "#/stream";` and the member to:

```ts
  /** Replay-current — composition connects the transport synchronously from
   * a resumed session's state, so a subscriber must see the current state
   * in its own tick. */
  readonly state$: StateStream<AuthViewState>;
```

(If `Stream` is still used elsewhere in that file, keep both imports.) Run `pnpm --filter @rtc/core-api typecheck` — green (types only). The `client-core` side lands in Task 4; until then `client-core` typecheck is RED on `AuthPresenter.state$` — expected. **Stop rule (Task 4 executes it):** if making `AuthPresenter` and any fakes satisfy the new type takes more than `AuthPresenter.ts` plus at most three fake sites, revert this step's edit and leave the residual with a note.

- [ ] **Step 4: A real "never a class" assertion** — replace the last test in `packages/core-api/src/__tests__/app.test.ts` with:

```ts
  it("Presenters names interfaces a plain object satisfies, never a class", () => {
    // A class type with a private member, or a nominal brand, would reject
    // a structurally identical object literal; an interface accepts it.
    expectTypeOf<{
      readonly status$: Presenters["connection"]["status$"];
    }>().toMatchTypeOf<Presenters["connection"]>();
    expectTypeOf<{
      readonly enabled$: Presenters["animatedBackground"]["enabled$"];
      set(on: boolean): void;
      toggle(current: boolean): void;
    }>().toMatchTypeOf<Presenters["animatedBackground"]>();
  });
```

Run `pnpm --filter @rtc/core-api test` — green.

- [ ] **Step 5: Counting Proxy in `scriptedPorts.ts`** — the harness wraps `base.preferences` and its own `connectionEvents` so a suite can ask how many times a port METHOD was invoked. Add to `packages/core-contract/src/harness/scriptedPorts.ts`:

```ts
/** A port method name the discipline suite can count — the `$`-suffixed
 * stream methods of `PreferencesPort`, plus `connectionEvents.events`. */
export type PortMethodName =
  | Extract<keyof PreferencesPort, `${string}$`>
  | "connectionEvents.events";

/** Wrap a port so every method call is counted by name. A Proxy rather than
 * a spread: a class port's methods live on its prototype, which a spread
 * drops. Counting happens on `get` of a function-valued property, which is
 * where a call begins; property reads that are not calls (none, on a port)
 * would over-count — acceptable for a discipline witness. */
function countCalls<P extends object>(
  port: P,
  counts: Map<string, number>,
  prefix = "",
): P {
  return new Proxy(port, {
    get: (target: P, property: string | symbol, receiver: unknown) => {
      const value = Reflect.get(target, property, receiver);

      if (typeof value === "function" && typeof property === "string") {
        return (...args: unknown[]) => {
          const key = `${prefix}${property}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return Reflect.apply(value, target, args);
        };
      }

      return value;
    },
  });
}
```

(import `type PreferencesPort` from `@rtc/domain`). In `scriptPorts`, create `const calls = new Map<string, number>();`, wrap the preferences port — `const preferences = countCalls(base.preferences, calls);` — and count the connection port's `events` explicitly in the existing `connectionEvents` object:

```ts
  const connectionEvents: ConnectionEventsPort = {
    events: (): Observable<ConnectionEvent> => {
      calls.set(
        "connectionEvents.events",
        (calls.get("connectionEvents.events") ?? 0) + 1,
      );
      return events$;
    },
  };
```

Return `ports: { ...base, preferences, connectionEvents, colorScheme }` and add to the driver:

```ts
      portCalls: (method: PortMethodName) => {
        return calls.get(method) ?? 0;
      },
```

with the `ScriptedDriver` interface gaining `/** How many times the core has invoked this port method since the harness was built — the "called once, at construction" discipline's witness. */ portCalls(method: PortMethodName): number;`. Export `PortMethodName` from `src/index.ts`.

- [ ] **Step 6: Harness test** — `packages/core-contract/src/harness/scriptedPorts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSimulatorPorts, InMemorySessionStore, reconnect$ } from "@rtc/client-core";
```

STOP — `core-contract` must never import `client-core` (dep-cruiser `core-contract-stays-neutral`). Build the base from domain simulators only:

```ts
import { describe, expect, it } from "vitest";

import type { AppPorts } from "@rtc/core-api";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { scriptPorts } from "#/harness/scriptedPorts";

describe("scriptPorts port-call counting", () => {
  it("counts each preferences stream method by name, and connectionEvents.events", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    expect(driver.portCalls("themeMode$")).toBe(0);
    ports.preferences.themeMode$();
    ports.preferences.themeMode$();
    ports.preferences.viewMode$();
    ports.connectionEvents.events();
    expect(driver.portCalls("themeMode$")).toBe(2);
    expect(driver.portCalls("viewMode$")).toBe(1);
    expect(driver.portCalls("connectionEvents.events")).toBe(1);
    teardown();
  });

  it("forwards the call to the real port with its own `this`", () => {
    const { ports, teardown } = scriptPorts(createBasePorts());
    ports.preferences.setThemeMode("light");
    const seen: string[] = [];
    ports.preferences.themeMode$().subscribe((mode) => {
      seen.push(mode);
    });
    expect(seen).toEqual(["light"]);
    teardown();
  });
});

/** The narrowest `AppPorts` the harness accepts: only the members it reads
 * are real; the rest are typed through a cast the test owns. */
function createBasePorts(): AppPorts {
  return {
    preferences: new PreferencesSimulator(),
    auth: new AuthSimulator({ demo: "pw" }),
    connectionEvents: {
      events: () => {
        return new (class {
          subscribe(): { unsubscribe(): void } {
            return { unsubscribe: () => {} };
          }
        })() as never;
      },
    },
  } as AppPorts;
}
```

If `AppPorts` has required members that make the cast noisy, look at how `packages/core-contract/src/suites/connection.ts`'s runner-side base is built and mirror the minimal shape; the point of this test is the counting, not the ports.

- [ ] **Step 7: The discipline suite** — `packages/core-contract/src/suites/portDiscipline.ts`:

```ts
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

/** Every port method is called once, at construction, in every core — the
 * RxJS presenters' shape, adopted as the rule for all three (residual sweep,
 * 2026-09-19). A synchronous read (`cycle()`, `current()`) reads through a
 * fresh SUBSCRIPTION of the Observable captured at construction, never
 * through a fresh CALL of the port method; a stream re-subscribes the same
 * Observable on every warm period. This suite is not keyed by member: it
 * witnesses a property of the whole composition. */
export function describePortDisciplineContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(`${label} :: portDiscipline`, () => {
    it("themePreference: cycle() twice and two warm periods of mode$ call themeMode$() once", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.themePreference;
        const first = collect(p.mode$);
        first.unsubscribe();
        await settle();
        const second = collect(p.mode$);
        p.cycle();
        p.cycle();
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("themeMode$")).toBe(1);
      } finally {
        await h.teardown();
      }
    });

    it("eqWatchlistSortPreference: cycle() twice calls eqWatchlistSort$() once", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.eqWatchlistSortPreference;
        p.cycle();
        p.cycle();
        await settle();
        expect(h.driver.portCalls("eqWatchlistSort$")).toBe(1);
      } finally {
        await h.teardown();
      }
    });

    it("bootPreference: current() twice calls bootVariant$() once", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.bootPreference;
        p.current();
        p.current();
        expect(h.driver.portCalls("bootVariant$")).toBe(1);
      } finally {
        await h.teardown();
      }
    });

    it("connection: two warm periods of status$ call connectionEvents.events() once", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.connection;
        const first = collect(p.status$);
        first.unsubscribe();
        await settle();
        const second = collect(p.status$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("connectionEvents.events")).toBe(1);
      } finally {
        await h.teardown();
      }
    });
  });
}
```

Note on the RxJS runner's base: `scriptPorts` itself calls `base.connectionEvents.events()` once (to build the merge) — that call is on the BASE port, not the counted wrapper, so it does not count. The RxJS `ConnectionStatusUseCase` calls `events.events()` — check whether it calls it once (constructor) or per subscribe; if per subscribe, the RxJS core fails this case until Task 4 makes it call once (Task 4 Step 5 covers it).

- [ ] **Step 8: Run it from `describeCoreContract`** — in `packages/core-contract/src/index.ts` import `describePortDisciplineContract` from `#/suites/portDiscipline` and append `describePortDisciplineContract(label, makeHarness);` after the member loop. Export it too. (`CONTRACT_SUITES` stays member-keyed; the registry drift test is untouched.)

- [ ] **Step 9: dep-cruiser rules** — in `.dependency-cruiser.cjs`:
  - After the `client-core-stays-inner` rule add:
    ```js
    {
      name: "client-core-src-uses-core-contract-only-in-tests",
      severity: "error",
      comment:
        "@rtc/client-core may import @rtc/core-contract ONLY from its runner test — the contract is a dev-only tier, never a source dependency of a core.",
      from: { path: "^packages/client-core/src", pathNot: "\\.test\\.ts$" },
      to: { path: "^packages/core-contract/" },
    },
    ```
    and remove `core-contract` from `client-core-stays-inner`'s `pathNot` alternation ONLY if that rule's `from` already excludes tests; it does not, so leave that rule as is — the new rule is the tightening.
  - Add the same shape for both alternative cores (they list `core-contract` in `alt-cores-stay-inner`):
    ```js
    {
      name: "alt-cores-use-core-contract-only-in-tests",
      severity: "error",
      comment:
        "The alternative cores import @rtc/core-contract only from their runner tests.",
      from: { path: "^packages/client-core-(async|effect)/src", pathNot: "\\.test\\.ts$" },
      to: { path: "^packages/core-contract/" },
    },
    ```
  - Add the Effect port-subscription rule (Task 2 relies on it):
    ```js
    {
      name: "effect-port-subscription-owned-by-the-bridge",
      severity: "error",
      comment:
        "`fromObservable` subscribes a port eagerly at call time and must only be reached through a sharedFold's period-scoped `fromPort` (packages/client-core-effect/src/bridge/out.ts). Presenters never import bridge/in.ts directly; `peek`/`peekCurrent` live in bridge/peek.ts for that reason.",
      from: { path: "^packages/client-core-effect/src", pathNot: "^packages/client-core-effect/src/bridge/|\\.test\\.ts$" },
      to: { path: "^packages/client-core-effect/src/bridge/in\\.ts$" },
    },
    ```
    (Task 2 moves `peek`/`peekCurrent` into `bridge/peek.ts`; until then this rule reports `readPreferences.ts`/`themePreference.ts` importing `peek` from `bridge/in.ts` — expected RED for `pnpm check:deps` between Task 3 and Task 2.)

- [ ] **Step 10: Build, test, verify**

```bash
pnpm --filter @rtc/core-api build && pnpm --filter @rtc/core-api test && pnpm --filter @rtc/core-api typecheck
pnpm --filter @rtc/core-contract build && pnpm --filter @rtc/core-contract test
pnpm exec biome ci packages/core-api packages/core-contract .dependency-cruiser.cjs
pnpm exec eslint packages/core-api/src packages/core-contract/src
```

Expected: all green for these two packages. `pnpm --filter @rtc/client-core typecheck` is RED on `AuthPresenter.state$` (Task 4 fixes it); `pnpm check:deps` is RED on the Effect `peek` imports (Task 2 fixes it); every core's contract runner is RED on the four `portDiscipline` cases (Tasks 1, 2, 4). State all three in the report.

- [ ] **Step 11: Commit**

```bash
git add packages/core-api packages/core-contract .dependency-cruiser.cjs
git commit -m "feat(core-api,core-contract): port-discipline contract suite; auth.state\$ as StateStream; ThroughputMessage exported; panelStream out of presenters/; dep-cruiser confines core-contract to tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

---

### Task 1: Async kernel — `Topic` resets on error, isolates a throwing subscriber; `peek` rethrows; `connection` calls the port once

**Files:**
- Modify: `packages/client-core-async/src/kernel/topic.ts`, `src/kernel/topic.test.ts`
- Create: `packages/client-core-async/src/kernel/reportAsync.ts`
- Modify: `packages/client-core-async/src/bridge/in.ts`, `src/bridge/in.test.ts`
- Modify: `packages/client-core-async/src/presenters/connection.ts`; Create/extend `src/presenters/connection.test.ts`
- Modify: `packages/client-core-async/README.md` (kernel table row for `Topic`)

**Interfaces:**
- Consumes: Task 3's `dist` (contract suite `portDiscipline`).
- Produces: `Topic<T>` with reset-on-error semantics (same interface); `reportAsync(error: unknown): void`; `peekCurrent<T>(source): Peeked<T> | null` (`{ value }` box); `peek(source, fallback)` rethrows a synchronous error.

- [ ] **Step 1: `reportAsync`** — `packages/client-core-async/src/kernel/reportAsync.ts`:

```ts
/** Rethrow an error on a macrotask, outside every caller's stack — rxjs's
 * `reportUnhandledError` shape. Used where an error must surface (a
 * subscriber callback threw) without taking the caller down with it. */
export function reportAsync(error: unknown): void {
  setTimeout(() => {
    throw error;
  }, 0);
}
```

- [ ] **Step 2: Rewrite `createTopic`** — replace the body of `packages/client-core-async/src/kernel/topic.ts` from the `Topic` doc comment through the end of `createTopic` (keep `TopicOptions`, `Replayed`, `Subscriber`, and `mapTopic` unchanged; delete `Failed`):

```ts
/** A hot multicast channel with refCount semantics: the producer starts on
 * the first subscriber and is aborted on the last unsubscribe. This is
 * `shareReplay({ bufferSize: 1, refCount: true })` written once, explicitly,
 * instead of implied by an operator.
 *
 * Failure RESETS the topic, as that operator does (`share({ resetOnError:
 * true })`): every subscriber is handed the error and dropped, the producer
 * is aborted, the replayed value is forgotten, and the NEXT subscriber starts
 * a fresh producer — never the old error. A late publish or failure from a
 * producer run that has already ended reaches nobody. A subscriber that
 * throws does not stop delivery to the others: its error is rethrown on a
 * macrotask (`reportAsync`), as rxjs's `SafeSubscriber` does. */
export interface Topic<T> {
  subscribe(
    next: (value: T) => void,
    error?: (error: unknown) => void,
  ): () => void;
  publish(value: T): void;
  fail(error: unknown): void;
}

/** One producer run: the controller that ends it. A run's `publish`/`fail`
 * are bound to it, so a run that has been superseded cannot reach the
 * subscribers of a later one. */
interface ProducerRun {
  readonly controller: AbortController;
}

export function createTopic<T>(
  producer: (signal: AbortSignal, publish: (value: T) => void) => Promise<void>,
  options: TopicOptions = {},
): Topic<T> {
  const subscribers = new Set<Subscriber<T>>();
  let run: ProducerRun | null = null;
  let last: Replayed<T> | null = null;

  function deliver(value: T): void {
    if (options.replay === true) {
      last = { value };
    }

    for (const s of [...subscribers]) {
      try {
        s.next(value);
      } catch (error) {
        reportAsync(error);
      }
    }
  }

  function endRun(current: ProducerRun): void {
    if (run === current) {
      run = null;
    }

    current.controller.abort();
    last = null;
  }

  function failFrom(current: ProducerRun, error: unknown): void {
    if (run !== current) {
      return;
    }

    endRun(current);
    const failing = [...subscribers];
    subscribers.clear();

    for (const s of failing) {
      try {
        s.error(error);
      } catch (thrown) {
        reportAsync(thrown);
      }
    }
  }

  function startRun(): void {
    const current: ProducerRun = { controller: new AbortController() };
    run = current;
    void spawn(
      () => {
        return producer(current.controller.signal, (value) => {
          if (run === current) {
            deliver(value);
          }
        });
      },
      (error) => {
        failFrom(current, error);
      },
    );
  }

  return {
    publish: deliver,
    fail: (error: unknown) => {
      if (run !== null) {
        failFrom(run, error);
      }
    },
    subscribe: (
      next: (value: T) => void,
      error: (error: unknown) => void = () => {},
    ) => {
      const subscriber: Subscriber<T> = { next, error };
      subscribers.add(subscriber);

      if (last !== null) {
        next(last.value);
      }

      if (run === null) {
        startRun();
      }

      return () => {
        subscribers.delete(subscriber);

        if (subscribers.size === 0 && run !== null) {
          endRun(run);
        }
      };
    },
  };
}
```

Add `import { reportAsync } from "#/kernel/reportAsync";`. `mapTopic` is unchanged: its producer's `sourceFailed` rejection now resets the map topic the same way.

- [ ] **Step 3: Flip and extend the `Topic` tests** — in `packages/client-core-async/src/kernel/topic.test.ts` replace the two `fail() is terminal …` cases with:

```ts
  it("fail() resets: the failed subscribers are dropped and the NEXT subscriber starts a fresh producer with no replay", () => {
    let starts = 0;
    const topic = createTopic<number>(
      async (_signal, publish) => {
        starts += 1;
        publish(starts);
      },
      { replay: true },
    );
    const errors: unknown[] = [];
    const stop = topic.subscribe(
      () => {},
      (e) => {
        errors.push(e);
      },
    );
    expect(starts).toBe(1);
    topic.fail(new Error("boom"));
    expect(errors).toHaveLength(1);

    const values: number[] = [];
    const lateErrors: unknown[] = [];
    const stopLate = topic.subscribe(
      (v) => {
        values.push(v);
      },
      (e) => {
        lateErrors.push(e);
      },
    );
    // No latched error, no replay of the pre-failure value: a fresh run.
    expect(lateErrors).toEqual([]);
    expect(starts).toBe(2);
    expect(values).toEqual([2]);
    stopLate();
    expect(() => {
      stop();
    }).not.toThrow();
  });

  it("a superseded run's late publish and late failure reach nobody", async () => {
    let release: ((value: number) => void) | undefined;
    let failLate: ((error: unknown) => void) | undefined;
    let runs = 0;
    const topic = createTopic<number>(
      (signal, publish) => {
        runs += 1;
        const mine = runs;
        return new Promise<void>((resolve, reject) => {
          if (mine === 1) {
            release = publish;
            failLate = reject;
          }

          signal.addEventListener("abort", () => {
            resolve();
          });
        });
      },
      { replay: true },
    );
    const stopFirst = topic.subscribe(() => {});
    stopFirst();
    const values: number[] = [];
    const errors: unknown[] = [];
    const stopSecond = topic.subscribe(
      (v) => {
        values.push(v);
      },
      (e) => {
        errors.push(e);
      },
    );
    expect(runs).toBe(2);
    release?.(99);
    failLate?.(new Error("stale"));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(values).toEqual([]);
    expect(errors).toEqual([]);
    stopSecond();
  });

  it("a throwing subscriber does not stop delivery to the others; its error is rethrown on a macrotask", () => {
    vi.useFakeTimers();

    try {
      const topic = createTopic<number>(async () => {});
      const seen: number[] = [];
      topic.subscribe(() => {
        throw new Error("subscriber");
      });
      topic.subscribe((v) => {
        seen.push(v);
      });
      expect(() => {
        topic.publish(1);
      }).not.toThrow();
      expect(seen).toEqual([1]);
      expect(() => {
        vi.runAllTimers();
      }).toThrow("subscriber");
    } finally {
      vi.useRealTimers();
    }
  });
```

(import `vi` from vitest.) Keep `fail() is silent for a subscriber that supplied no error handler` and `fail() delivers the error to every subscriber and ends the topic` as they are — both still hold.

- [ ] **Step 4: Run** `pnpm --filter @rtc/client-core-async exec vitest run src/kernel` — green.

- [ ] **Step 5: `peek` rethrows** — in `packages/client-core-async/src/bridge/in.ts` replace `peek` with:

```ts
/** The value box `peekCurrent` returns, so `null` means "did not emit" and
 * cannot collide with an emitted `null`. */
export interface Peeked<T> {
  readonly value: T;
}

/** The current value of a replay-current Observable, read synchronously:
 * `{ value }` if the source emitted during `subscribe`, `null` if it did
 * not. The subscription is released before this returns, so nothing is
 * left warm. A source that ERRORS during `subscribe` throws that error
 * here — a located failure at the read site, not a stray global error
 * reported out of band. */
export function peekCurrent<T>(source: Observable<T>): Peeked<T> | null {
  let peeked: Peeked<T> | null = null;
  let failure: { error: unknown } | null = null;
  source
    .pipe(take(1))
    .subscribe({
      next: (current) => {
        peeked = { value: current };
      },
      error: (error: unknown) => {
        failure = { error };
      },
    })
    .unsubscribe();

  if (failure !== null) {
    throw (failure as { error: unknown }).error;
  }

  return peeked;
}

/** `peekCurrent` with a fallback for a source that does not emit on
 * subscribe — what `cycle()` advances from. Throws what `peekCurrent` throws. */
export function peek<T>(source: Observable<T>, fallback: T): T {
  const peeked = peekCurrent(source);
  return peeked === null ? fallback : peeked.value;
}
```

(The `as` cast is TypeScript's control-flow blind spot for assignments inside a callback — the same reason `iterate` boxes its inbox; if `nursery`/Biome objects to the cast, hold `failure` on a one-field object like `iterate` does.)

- [ ] **Step 6: Bridge tests** — in `packages/client-core-async/src/bridge/in.test.ts`:
  - Rename/flip the case `fails the topic when the source errors, and latches the error for a later subscriber` to `fails the topic when the source errors, and a later subscriber re-subscribes the source`: after the first error, subscribe again and assert `source.observed` is `true` again and `late` (errors) is `[]` — use a fresh `Subject` per run: a `Subject` that errored cannot be re-subscribed usefully (it replays the error), so build the topic over `defer(() => sources[index++])` with two subjects, or over a `BehaviorSubject` created inside a factory the test controls. Simplest: `const sources = [new Subject<string>(), new Subject<string>()]; let i = 0; const topic = topicFromObservable(defer(() => sources[i++] as Subject<string>));` then error `sources[0]`, re-subscribe, assert `sources[1].observed === true` and no late error.
  - Add: `peek() throws a source's synchronous error at the read site` — `expect(() => peek(throwError(() => new Error("storage")), "x")).toThrow("storage")`; `peekCurrent() returns null for a source that does not emit on subscribe and {value} for one that does`.

Run `pnpm --filter @rtc/client-core-async exec vitest run src/bridge` — green.

- [ ] **Step 7: `connection` calls the port once** — in `packages/client-core-async/src/presenters/connection.ts` capture the Observable at construction:

```ts
export function createConnectionPresenter(
  events: ConnectionEventsPort,
  initial: ConnectionStatus = ConnectionStatus.CONNECTING,
): ConnectionStatusPresenter {
  // Called ONCE, here — every warm period re-subscribes this Observable
  // (the RxJS core's shape, contracted by the portDiscipline suite).
  const source = events.events();
  const status = createTopic<ConnectionStatus>(
    (signal, publish) => {
      let current = initial;
      publish(current);
      return relay(source, signal, (event) => {
        current = nextConnectionStatus(current, event);
        publish(current);
      });
    },
    { replay: true },
  );

  return { status$: topicToStream(status) };
}
```

Extend `src/presenters/connection.test.ts` (create if absent, same `describe` style as `preferences.test.ts`): `calls events.events() once, across two warm periods` — a port whose `events` increments a counter and returns a `Subject`; subscribe, unsubscribe, subscribe again; expect the counter to be 1 and the subject observed again.

- [ ] **Step 8: README** — in `packages/client-core-async/README.md`'s kernel table, the `Topic<T>` row: `\`shareReplay({ bufferSize: 1, refCount: true })\` written out explicitly — including its reset on error and rxjs's isolation of a throwing subscriber`.

- [ ] **Step 9: Package gate**

```bash
pnpm --filter @rtc/client-core-async test        # includes the contract runner: portDiscipline's themePreference/eqWatchlistSort/bootPreference cases pass (the async reads already peek a fresh subscription of a captured… — CHECK: readPreferences.ts calls preferences.eqWatchlistSort$() per cycle(); Step 10 fixes it)
```

- [ ] **Step 10: The async reads capture their Observable** — in `src/presenters/readPreferences.ts`, capture `const bootVariant = preferences.bootVariant$();` / `const sort = preferences.eqWatchlistSort$();` at construction and `peek(bootVariant, …)` / `peek(sort, …)` in `current()`/`cycle()`; in `src/presenters/themePreference.ts`, `cycle` peeks a `const themeMode = preferences.themeMode$();` captured next to `modePreference` (which already wraps that same call — capture once, pass the same Observable to both `topicFromObservable` and `peek`). Then:

```bash
pnpm --filter @rtc/client-core-async test
pnpm --filter @rtc/client-core-async typecheck
pnpm --filter @rtc/client-core-async test:coverage
pnpm exec biome ci packages/client-core-async
pnpm exec eslint packages/client-core-async/src
```

Expected: all green, including all four `portDiscipline` cases under the `async` label; coverage ≥95/95/95/85.

- [ ] **Step 11: Commit (pathspec)**

```bash
git add packages/client-core-async
git commit -m "feat(client-core-async): Topic resets on error and isolates a throwing subscriber; peek rethrows; port methods called once

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH" -- packages/client-core-async
```

---

### Task 2: Effect bridge — seedless periods, the watcher latch, per-period subscribers, `fromPort`, `peek` rethrows, port called once

**Files:**
- Modify: `packages/client-core-effect/src/bridge/in.ts`, `src/bridge/in.test.ts`
- Create: `packages/client-core-effect/src/bridge/peek.ts` (+ `peek.test.ts`, moving the two existing `peek` cases from `in.test.ts`)
- Modify: `packages/client-core-effect/src/bridge/out.ts`, `src/bridge/out.test.ts`
- Modify: `packages/client-core-effect/src/presenters/mirrorPort.ts`, `src/presenters/connection.ts`, `src/presenters/themePreference.ts`, `src/presenters/readPreferences.ts` (import path only), `src/index.ts`, `README.md`

**Interfaces:**
- Consumes: Task 3's `dist` and its dep-cruiser rule `effect-port-subscription-owned-by-the-bridge`.
- Produces: `fromObservable<T>(source, scope?: Scope.Scope): Stream<T, unknown>`; `peekCurrent<T>(source): Option<T>` and `peek(source, fallback)` in `bridge/peek.ts`; `FoldRun<S> = (update: FoldUpdate<S>, fromPort: <T>(source: CoreStream<T>) => Stream.Stream<T, unknown>) => Effect.Effect<void, unknown>`; `SharedFold<S>.seed: () => Option.Option<S>`; `FoldUpdate<S> = (next: (current: Option.Option<S>) => S) => Effect.Effect<void>`.

- [ ] **Step 1: `bridge/peek.ts`** — move `peek` out of `in.ts` and make it Option-shaped:

```ts
import { Option } from "effect";
import { type Observable, take } from "rxjs";

/** The current value of a replay-current Observable, read synchronously:
 * `Some` if the source emitted during `subscribe`, `None` if it did not —
 * the seed a `sharedFold` starts a warm period from. The subscription is
 * released before this returns, so nothing is left warm. A source that
 * ERRORS during `subscribe` throws that error here — a located failure at
 * the read site, not a stray global error reported out of band. */
export function peekCurrent<T>(source: Observable<T>): Option.Option<T> {
  let current: Option.Option<T> = Option.none();
  let failure: { error: unknown } | null = null;
  source
    .pipe(take(1))
    .subscribe({
      next: (value) => {
        current = Option.some(value);
      },
      error: (error: unknown) => {
        failure = { error };
      },
    })
    .unsubscribe();

  if (failure !== null) {
    throw (failure as { error: unknown }).error;
  }

  return current;
}

/** `peekCurrent` with a fallback for a source that does not emit on
 * subscribe — what `cycle()` advances from. Throws what `peekCurrent` throws. */
export function peek<T>(source: Observable<T>, fallback: T): T {
  return Option.getOrElse(peekCurrent(source), () => {
    return fallback;
  });
}
```

Delete `peek` from `in.ts`; move its two tests into `bridge/peek.test.ts` and add `peek() throws a source's synchronous error at the read site` and `peekCurrent() is None for a source that does not emit on subscribe`. Update the `peek` import in `src/presenters/readPreferences.ts` and `src/presenters/themePreference.ts` to `#/bridge/peek`.

- [ ] **Step 2: `fromObservable(source, scope?)`** — in `bridge/in.ts` give `fromObservable` an optional scope whose closing also releases the subscription:

```ts
export function fromObservable<T>(
  source: Observable<T>,
  scope?: Scope.Scope,
): Stream.Stream<T, unknown> {
  const queue = Effect.runSync(Queue.unbounded<Take.Take<T, unknown>>());
  const subscription = source.subscribe({ /* unchanged */ });

  // A stream that is never run never reaches its `ensuring` — so the period
  // that opened this subscription also owns it: closing the scope releases
  // it whether or not the stream ran. `unsubscribe` is idempotent.
  if (scope !== undefined) {
    Effect.runSync(
      Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          subscription.unsubscribe();
        }),
      ),
    );
  }

  return Stream.fromQueue(queue).pipe(
    Stream.flattenTake,
    Stream.ensuring(
      Effect.sync(() => {
        subscription.unsubscribe();
      }),
    ),
  );
}
```

Extend the doc comment's last paragraph: `The calling rule is now structural: presenters reach this only through a sharedFold's period-scoped fromPort (bridge/out.ts), which passes the period's scope; the dependency-cruiser rule effect-port-subscription-owned-by-the-bridge keeps it that way.` Test in `in.test.ts`: `fromObservable(source, scope) releases the source when the scope closes even if the stream was never run`.

- [ ] **Step 3: `sharedFold` rewritten** — in `bridge/out.ts` replace the section from `FoldUpdate` through the end of `sharedFold` with:

```ts
/** How a `sharedFold` producer writes its state: apply `next` to the
 * current value (`None` until the period's first write, for a seedless
 * period) and publish the result only if it is not `Object.is`-equal to the
 * current one — a `SubscriptionRef` re-publishes an equal `set` (measured on
 * 3.22.2), which would hand every subscriber the seed twice. The first write
 * of a period waits for the period's watcher to have subscribed the ref's
 * PubSub (`WarmPeriod.watching`) — the structural close of the race a
 * `yieldNow` used to win. A consequence a caller must know: an Effect-core
 * fold CONFLATES equal consecutive states (the RxJS core's `scan`/`map` do
 * not). */
export type FoldUpdate<S> = (
  next: (current: Option.Option<S>) => S,
) => Effect.Effect<void>;

/** The producer of one warm period. `fromPort` is how it subscribes a port:
 * the subscription belongs to the period, released when the period ends
 * whether or not the stream ran (`fromObservable`'s scope argument). */
export type FoldRun<S> = (
  update: FoldUpdate<S>,
  fromPort: <T>(source: CoreStream<T>) => Stream.Stream<T, unknown>,
) => Effect.Effect<void, unknown>;

export interface SharedFold<S> {
  /** The value a warm period starts from — read on EVERY first subscribe:
   * `Some` for a port mirror whose port emitted synchronously (`peekCurrent`)
   * or a pure fold's constant, `None` for a port that has not emitted yet,
   * in which case subscribers hear nothing until the first write. A throwing
   * `seed` fails the subscriber that triggered it. */
  readonly seed: () => Option.Option<S>;
  readonly run: FoldRun<S>;
}

interface WarmPeriod<S> {
  scope: Scope.CloseableScope;
  /** THIS period's subscribers — failure fans out to these and no others, so
   * a stale period's producer failing in the unsubscribe → close window
   * cannot error a later period's subscribers. */
  subscribers: Set<Subscriber<S>>;
  changes: CoreStream<S>;
}

/** Two `Option`s hold the same state: both `None`, or both `Some` of
 * `Object.is`-equal values. */
function sameState<S>(a: Option.Option<S>, b: Option.Option<S>): boolean {
  if (Option.isNone(a) || Option.isNone(b)) {
    return Option.isNone(a) && Option.isNone(b);
  }

  return Object.is(a.value, b.value);
}

/** A period's ref as a replay-current Observable of its `Some` values: the
 * current value (if any) synchronously, then every later `Some`. The head
 * `ref.changes` replays is dropped only when it equals what was just
 * delivered — a `set` between the read and the watcher's subscribe carries a
 * NEW value and must arrive. The first emission the watcher sees succeeds
 * `watching`, which is what `update` awaits. */
function periodStream<S>(
  host: EffectHost,
  ref: SubscriptionRef.SubscriptionRef<Option.Option<S>>,
  watching: Deferred.Deferred<void>,
): CoreStream<S> {
  return new Observable<S>((subscriber) => {
    const seed = host.runtime.runSync(SubscriptionRef.get(ref));

    if (Option.isSome(seed)) {
      subscriber.next(seed.value);
    }

    return streamToStream(
      host,
      ref.changes.pipe(
        Stream.tap(() => {
          return Deferred.succeed(watching, undefined);
        }),
      ),
    )
      .pipe(
        filter((value, index) => {
          return index > 0 || !sameState(value, seed);
        }),
        filter(Option.isSome),
        map((value) => {
          return value.value;
        }),
      )
      .subscribe(subscriber);
  });
}

/** `shareReplay({ bufferSize: 1, refCount: true })` restated over a
 * `SubscriptionRef` and a `Scope`. The FIRST subscriber seeds the ref and
 * forks `run` into a scope of its own — a child of the app's, so
 * `dispose()` still ends it; every subscriber reads the ref's current value
 * synchronously and then follows `ref.changes` on the scheduler; the LAST
 * unsubscribe closes the scope, interrupting the producer and releasing every
 * port subscription the producer opened through `fromPort`. `Stream.share`
 * cannot be this envelope: it replays to a new subscriber on a fiber, never
 * in the caller's tick. */
export function sharedFold<S>(
  host: EffectHost,
  fold: SharedFold<S>,
): CoreStream<S> {
  let warm: WarmPeriod<S> | null = null;

  function startWarmPeriod(first: Subscriber<S>): WarmPeriod<S> {
    // `seed()` may throw (a port that errors on subscribe, via
    // `peekCurrent`): nothing is warm yet, so the thrower is the only
    // subscriber to tell.
    const seed = fold.seed();
    const scope = host.runtime.runSync(
      Scope.fork(host.scope, ExecutionStrategy.sequential),
    );
    const ref = host.runtime.runSync(SubscriptionRef.make(seed));
    const watching = host.runtime.runSync(Deferred.make<void>());
    const period: WarmPeriod<S> = {
      scope,
      subscribers: new Set([first]),
      changes: periodStream(host, ref, watching),
    };
    // Assigned BEFORE `runFork`: a producer that fails at once can drive a
    // subscriber's `error()` to resubscribe synchronously, and that nested
    // subscribe must join THIS period, never start a second one.
    warm = period;

    function update(next: (current: Option.Option<S>) => S): Effect.Effect<void> {
      return Deferred.await(watching).pipe(
        Effect.andThen(SubscriptionRef.get(ref)),
        Effect.flatMap((current) => {
          const value = Option.some(next(current));
          return sameState(value, current)
            ? Effect.void
            : SubscriptionRef.set(ref, value);
        }),
      );
    }

    function fromPort<T>(source: CoreStream<T>): Stream.Stream<T, unknown> {
      return fromObservable(source, scope);
    }

    host.runtime.runFork(
      fold.run(update, fromPort).pipe(
        Effect.catchAllCause((cause) => {
          return Effect.sync(() => {
            if (Cause.isInterruptedOnly(cause)) {
              return;
            }

            for (const subscriber of [...period.subscribers]) {
              subscriber.error(Cause.squash(cause));
            }
          });
        }),
      ),
      { scope },
    );

    return period;
  }

  return new Observable<S>((subscriber) => {
    if (warm === null) {
      try {
        warm = startWarmPeriod(subscriber);
      } catch (error) {
        subscriber.error(error);
        return () => {};
      }
    } else {
      warm.subscribers.add(subscriber);
    }

    const period = warm;
    const inner = period.changes.subscribe(subscriber);

    return () => {
      inner.unsubscribe();
      period.subscribers.delete(subscriber);

      if (period.subscribers.size === 0 && warm === period) {
        warm = null;
        // The global runtime, as in `streamToStream`: this must still work
        // after `host.runtime` has been disposed.
        Effect.runFork(Scope.close(period.scope, Exit.void));
      }
    };
  });
}
```

Imports: add `Deferred`, `Option` to the `effect` import; `map` to the rxjs import (`filter`, `Observable`, `type Subscriber`, `map`); `import { fromObservable } from "#/bridge/in";`. `refToStateStream` stays for `storeToStateStream`-style consumers (unchanged). Keep the MEASURED paragraph from the old `startWarmPeriod` comment, trimmed to the facts (PubSub delivery is in order once subscribed; publishes before the watcher's subscription are conflated into its `Ref.get` head) and ending with "the latch `update` awaits is the structural close".

Update the `streamToStream` doc comment's interrupt sentence: `An interrupt-only cause (the app's scope closing on dispose(), or this subscriber's own unsubscribe) leaves the subscriber neither errored nor completed — deliberately: the RxJS core's dispose() is a knowing no-op today, so a still-attached RxJS subscriber hears nothing after dispose either; completion-on-dispose becomes the contract when the RxJS Subscription bag lands (§22).`

- [ ] **Step 4: Amend the `out.test.ts` sharedFold cases** — every `seed: () => { return N; }` becomes `seed: () => { return Option.some(N); }`; every `run: (update) => …` gains the second parameter and calls `fromPort(subject)` instead of `fromObservable(subject)` (the tests that used `fromObservable` directly: "folds an event emitted synchronously…", "delivers every state of a same-tick burst…"); `update((s) => s + e)` becomes `update((s) => Option.getOrElse(s, () => 0) + e)`; the "re-seeds … ignores a stale producer's writes" case is rewritten to what the generation removal makes observable: rename to `re-seeds on every cold → warm cycle` and drop the stale-write half (a stale write lands in an unobservable ref — nothing to assert). Add:

```ts
  it("sharedFold() with a None seed delivers nothing until the first write, then replays it", async () => {
    const writes: FoldUpdate<number>[] = [];
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        return Option.none();
      },
      run: (update: FoldUpdate<number>) => {
        writes.push(update);
        return Effect.never;
      },
    });
    const seen: number[] = [];
    const sub = stream.subscribe((v: number) => {
      seen.push(v);
    });
    expect(seen).toEqual([]);
    await tick();
    await host.runtime.runPromise(
      (writes[0] as FoldUpdate<number>)(() => {
        return 7;
      }),
    );
    await tick();
    expect(seen).toEqual([7]);
    const late: number[] = [];
    const lateSub = stream.subscribe((v: number) => {
      late.push(v);
    });
    expect(late).toEqual([7]);
    lateSub.unsubscribe();
    sub.unsubscribe();
  });

  it("sharedFold() fails only the triggering subscriber when seed() throws, and starts no period", () => {
    const stream = sharedFold(useHost(), {
      seed: () => {
        throw new Error("storage");
      },
      run: () => {
        return Effect.never;
      },
    });
    let failure: unknown;
    stream.subscribe({
      error: (e: unknown) => {
        failure = e;
      },
    });
    expect((failure as Error).message).toBe("storage");
    // A second subscribe tries again (no period was left half-open).
    let second: unknown;
    stream.subscribe({
      error: (e: unknown) => {
        second = e;
      },
    });
    expect((second as Error).message).toBe("storage");
  });

  it("sharedFold() a stale period's producer failing after a re-warm does not error the new period's subscribers", async () => {
    let failFirst: (() => void) | undefined;
    let runs = 0;
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        return Option.some(0);
      },
      run: () => {
        runs += 1;

        if (runs === 1) {
          return Effect.async<void, Error>((resume) => {
            failFirst = () => {
              resume(Effect.fail(new Error("stale")));
            };
          });
        }

        return Effect.never;
      },
    });
    const first = stream.subscribe(() => {});
    await tick();
    first.unsubscribe();
    // Before the close reaches the first producer, a new period starts …
    const errors: unknown[] = [];
    const second = stream.subscribe({
      next: () => {},
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    // … and the first producer fails late.
    failFirst?.();
    await tick();
    await tick();
    expect(runs).toBe(2);
    expect(errors).toEqual([]);
    second.unsubscribe();
  });

  it("sharedFold() releases a port subscription its producer opened through fromPort but never ran", async () => {
    const subject = new Subject<number>();
    const stream = sharedFold(useHost(), {
      seed: () => {
        return Option.some(0);
      },
      run: (_update: FoldUpdate<number>, fromPort) => {
        fromPort(subject);
        return Effect.never;
      },
    });
    const sub = stream.subscribe(() => {});
    expect(subject.observed).toBe(true);
    sub.unsubscribe();
    await tick();
    await tick();
    expect(subject.observed).toBe(false);
  });
```

The same-tick-burst case is unchanged in its assertion (`[0, 1, 3, 6]`) and is the latch's discriminator: with the latch removed it must read `[0, 6]` (verify once by temporarily replacing `Deferred.await(watching)` with `Effect.void`, watch it fail, restore — report the observed value).

- [ ] **Step 5: Presenters** — `mirrorPort.ts`:

```ts
export function mirrorPort<T, U>(
  host: EffectHost,
  source: CoreStream<T>,
  project: (value: T) => U,
): CoreStream<U> {
  return sharedFold(host, {
    seed: () => {
      return Option.map(peekCurrent(source), project);
    },
    run: (update: FoldUpdate<U>, fromPort) => {
      return fromPort(source).pipe(
        Stream.runForEach((value) => {
          return update(() => {
            return project(value);
          });
        }),
      );
    },
  });
}

export function mirrorPortAsIs<T>(host: EffectHost, source: CoreStream<T>): CoreStream<T> {
  return mirrorPort(host, source, (value) => {
    return value;
  });
}
```

The `fallback` parameter is GONE from both (a port that does not emit synchronously now yields silence, the RxJS/async behaviour): update every call site in `preferences.ts`, `groupedPreferences.ts`, `readPreferences.ts`, `themePreference.ts` by deleting the `DEFAULT_*` argument (and the now-unused `DEFAULT_*` imports — `readPreferences.ts` and `themePreference.ts` still use theirs for `peek`). `connection.ts`:

```ts
export function createConnectionPresenter(host, events, initial = ConnectionStatus.CONNECTING) {
  // Called ONCE, here — every warm period re-subscribes this Observable.
  const source = events.events();

  return {
    status$: sharedFold(host, {
      seed: () => {
        return Option.some(initial);
      },
      run: (update: FoldUpdate<ConnectionStatus>, fromPort) => {
        return fromPort(source).pipe(
          Stream.runForEach((event) => {
            return update((current) => {
              return nextConnectionStatus(
                Option.getOrElse(current, () => {
                  return initial;
                }),
                event,
              );
            });
          }),
        );
      },
    }),
  };
}
```

`themePreference.ts`: `mode$`'s `seed` returns `Option.some(resolveThemeMode(...))`; `run: (update, fromPort) => Stream.zipLatest(fromPort(modePreference), prefersDark === undefined ? Stream.make(false) : fromPort(prefersDark))` — `buildPrefersDarkStream` takes `fromPort` as an argument; the doc comment about "built INSIDE run" is simplified to "through `fromPort`, so the period owns the subscription". `cycle` unchanged (peeks the captured `modePreference`).

- [ ] **Step 6: Index and README** — `src/index.ts`: remove `fromObservable` from the `#/bridge/in` export (keep `rpc`), export `peek, peekCurrent` from `#/bridge/peek`, add `type FoldRun` to the `#/bridge/out` export. README "Bridge" paragraph: `fromObservable` is reachable only through `sharedFold`'s `fromPort`; `peek`/`peekCurrent` live in `bridge/peek.ts`; a `None` seed means silence until the first value; the watcher latch.

- [ ] **Step 7: Package gate**

```bash
pnpm --filter @rtc/client-core-effect test        # unit + contract runner incl. portDiscipline (effect label)
pnpm --filter @rtc/client-core-effect typecheck
pnpm --filter @rtc/client-core-effect test:coverage
pnpm exec biome ci packages/client-core-effect
pnpm exec eslint packages/client-core-effect/src
pnpm check:deps                                     # the new bridge rule is green once peek moved
```

Expected: all green. If the same-tick-burst case reads `[0, 6]` WITH the latch, the watcher's first emission is not reaching `Deferred.succeed` before the producer's first `set` — check that `Stream.tap` sits on `ref.changes` inside `periodStream` (per subscription) and that `update` awaits `watching` on EVERY call (cheap after the first). Report BLOCKED with the measurement rather than reintroducing `yieldNow`.

- [ ] **Step 8: Commit (pathspec)**

```bash
git add packages/client-core-effect
git commit -m "feat(client-core-effect): seedless sharedFold periods, watcher latch replaces yieldNow, per-period subscribers, period-scoped fromPort; peek rethrows; port methods called once

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH" -- packages/client-core-effect
```

---

### Task 4: RxJS core — reads capture their Observable and rethrow; `auth.state$` as a `StateObservable`; `ThroughputMessage` imported

**Files:**
- Modify: `packages/client-core/src/presenters/ThemePreferencePresenter.ts`, `BootPreferencePresenter.ts`, `EqWatchlistSortPreferencePresenter.ts`, `ConnectionStatusPresenter.ts` (only if `ConnectionStatusUseCase` calls `events.events()` per subscribe — check `packages/domain/src/**/ConnectionStatusUseCase.ts`), `AuthPresenter.ts`, `ThroughputPresenter.ts`
- Test: `packages/client-core/src/presenters/__tests__/` (the existing tests for these presenters; add cases)

**Interfaces:**
- Consumes: Task 3's `dist` (`StateStream` on `auth.state$`, exported `ThroughputMessage`, `portDiscipline`).
- Produces: nothing new; `AuthPresenter.state$: StateObservable<AuthViewState>`.

- [ ] **Step 1: Reads** — in each of the three presenters, capture the Observable in the constructor and read through a fresh subscription of it, rethrowing a synchronous error. `ThemePreferencePresenter`:

```ts
  private readonly themeMode$: Observable<ThemeModePreference>;

  constructor(private readonly preferences: PreferencesPort, /* colorScheme as before */) {
    this.themeMode$ = preferences.themeMode$();
    this.modePreference$ = this.themeMode$.pipe(shareReplay({ bufferSize: 1, refCount: true }));
    // … mode$ built from this.modePreference$ as before …
  }

  cycle(): void {
    this.setMode(nextThemeModePreference(readNow(this.themeMode$, DEFAULT_THEME_MODE_PREFERENCE)));
  }
```

with one shared helper `packages/client-core/src/presenters/readNow.ts`:

```ts
import { type Observable, take } from "rxjs";

/** The current value of a replay-current Observable, read through a fresh
 * subscription that is released before this returns; `fallback` if it did
 * not emit on subscribe. A source that errors on subscribe throws here — a
 * located failure at the read site (the alternative cores' `peek`). */
export function readNow<T>(source: Observable<T>, fallback: T): T {
  let value = fallback;
  let failure: { error: unknown } | null = null;
  source
    .pipe(take(1))
    .subscribe({
      next: (current) => {
        value = current;
      },
      error: (error: unknown) => {
        failure = { error };
      },
    })
    .unsubscribe();

  if (failure !== null) {
    throw (failure as { error: unknown }).error;
  }

  return value;
}
```

`BootPreferencePresenter.current()` → `readNow(this.bootVariant$, DEFAULT_BOOT_VARIANT)` over a constructor-captured `this.bootVariant$ = preferences.bootVariant$()`; `EqWatchlistSortPreferencePresenter.cycle()` → `readNow(this.eqWatchlistSort$, DEFAULT_EQ_WATCHLIST_SORT)` over the same Observable `sort$` wraps. Tests (in each presenter's existing test file, or a new `readNow.test.ts`): `readNow throws a synchronous source error`; per presenter: `cycle()/current() twice calls the port method once` (a counting fake port).

- [ ] **Step 2: `ConnectionStatusUseCase`** — read `packages/domain/src` for the use case's `execute()`: if it calls `events.events()` inside a `defer`/per subscribe, change `ConnectionStatusPresenter` to pass a port that returns a captured Observable: `const source = events.events(); new ConnectionStatusUseCase({ events: () => source }, initial)`. If the use case already calls it once in `execute()` and `execute()` is called once in the constructor, no change.

- [ ] **Step 3: `AuthPresenter.state$`** — replace the `shareReplay` construction with `@rx-state/core`'s `state`:

```ts
import { type StateObservable, state } from "@rx-state/core";
// …
  readonly state$: StateObservable<AuthViewState>;
// …
    const initial = this.resume();
    this.subject = new BehaviorSubject<AuthViewState>(initial);
    this.state$ = state(this.subject, initial);
```

(remove the `rxjs/operators` `shareReplay` import if unused). Run `pnpm typecheck` REPO-WIDE: every fake `AuthPresenter` in tests/harnesses that provides a plain `Observable` for `state$` now fails to type-check. **Stop rule:** if the failing sites number more than three, revert this step AND Task 3 Step 3 (core-api `auth.ts`) in this task's commit, and write in the report: "auth StateStream: N sites would change; left for slice 6". Otherwise fix them (wrap with `state(observable, initial)` from `@rx-state/core`, which those packages already depend on, or use a `BehaviorSubject`-backed `state`).

- [ ] **Step 4: `ThroughputMessage`** — in `ThroughputPresenter.ts` delete the local `interface ThroughputMessage` and import `type ThroughputMessage` from `@rtc/core-api` next to `ThroughputView`.

- [ ] **Step 5: Package gate**

```bash
pnpm --filter @rtc/client-core build && pnpm --filter @rtc/client-core test && pnpm --filter @rtc/client-core typecheck
pnpm exec biome ci packages/client-core && pnpm exec eslint packages/client-core/src
pnpm typecheck                                      # repo-wide, for the auth retype's blast radius
```

Expected: green; the RxJS contract runner (`packages/client-core/src/composition.coreContract.test.ts`) passes all four `portDiscipline` cases under the `rxjs` label.

- [ ] **Step 6: Commit (pathspec)**

```bash
git add packages/client-core
git commit -m "feat(client-core): reads capture their Observable and rethrow a synchronous port error; auth.state\$ is a StateObservable; ThroughputMessage from core-api

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH" -- packages/client-core
```

(If the stop rule fired, also `git add packages/core-api/src/presenters/auth.ts` after reverting it, and say so in the commit body.)

---

### Task 5: Tooling and clients — bundle check `try/finally`, `closeBundle` honours `outDir`, `selectCore` publishes the validated value, Playwright fails fast on a page error

**Files:**
- Modify: `scripts/check-core-bundle.mjs`
- Modify: `packages/client-react/vite.config.ts`, `packages/client-solid/vite.config.ts`
- Modify: `packages/client-react/src/app/selectCore.ts` (+ `.test.ts`), `packages/client-solid/src/app/selectCore.ts` (+ `.test.ts`) — the two files are byte-identical today; keep them so
- Modify: `tests/browser/testContext.ts`, `tests/browser/playwright/_context.ts`, `tests/browser/playwright-cucumber/world.ts`, `tests/browser/scenarios/login.ts`

- [ ] **Step 1: `try/finally`** — in `scripts/check-core-bundle.mjs` wrap the body of the inner loop:

```js
    const outDir = mkdtempSync(join(tmpdir(), "rtc-core-bundle-"));
    try {
      execSync(/* unchanged */);
      /* …listJs, gz, rows.push, marker checks — unchanged… */
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
```

- [ ] **Step 2: `closeBundle` honours `outDir`** — in BOTH clients' `devtoolsPanel()`: hold the resolved output directory from `configResolved`:

```ts
  let outDir = "dist";

  return {
    name: "rtc-devtools-panel",
    configResolved(config): void {
      outDir = config.build.outDir;
    },
    configureServer(server: ViteDevServer): void { /* unchanged */ },
    closeBundle(): void {
      if (existsSync(appDist)) {
        cpSync(appDist, join(outDir, "devtools"), { recursive: true });
      }
    },
  };
```

(`config` is typed by Vite's `Plugin["configResolved"]`; add `type ResolvedConfig` to the `vite` import if the explicit-type rule wants it.) Verify: `pnpm --filter @rtc/client-react exec vite build --outDir /tmp/rtc-outdir-probe --emptyOutDir && ls /tmp/rtc-outdir-probe/devtools/index.html && ls packages/client-react/dist/devtools 2>&1 | head -1` — the copy lands under the probe dir, not under `dist/` (clean up the probe dir). Same for solid.

- [ ] **Step 3: `selectCore` publishes the validated value** — in both `selectCore.ts`, replace the validation-only call and the publish with:

```ts
/** The validated selection — what `data-core-impl` publishes, so a test or a
 * human reads "rxjs" under vitest/jsdom (no `define`) rather than the raw
 * `import.meta.env` string `"undefined"`. Fails closed on an unknown value
 * at module init. */
export const selectedCoreImpl: CoreImpl = resolveCoreImpl(
  import.meta.env.VITE_CORE_IMPL,
);
// …activeCore unchanged (the literal comparison is what rolldown folds)…
if (typeof document !== "undefined") {
  document.documentElement.dataset.coreImpl = selectedCoreImpl;
}
```

Add to both `selectCore.test.ts`: `publishes the VALIDATED selection on <html data-core-impl>` — under vitest's jsdom environment (check the package's vitest config for the environment; if the `src/app` tests run under `node`, use `// @vitest-environment jsdom` at the top of the test file) `import "#/app/selectCore"` then `expect(document.documentElement.dataset.coreImpl).toBe("rxjs")` — not `"undefined"`.

- [ ] **Step 4: Playwright page errors** — extend `tests/browser/testContext.ts`'s `TestContext` with `/** Uncaught page errors since the page opened — read by expectSelectedCoreImpl so a boot failure surfaces as ITS message, not as a locator timeout. */ pageErrors: string[];`. In `_context.ts`'s `ctx` fixture and in `world.ts`'s `open()`, after the page exists:

```ts
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    // … ctx = { po, scratch, pageErrors }
```

In `tests/browser/scenarios/login.ts`:

```ts
/** Assert the app booted on the core this run selected — `RTC_CORE_IMPL`
 *  (default `rxjs`; an explicitly EMPTY value collapses to `rxjs`, as
 *  `devServer.ts` → vite's `|| "rxjs"` does), forwarded to the dev server as
 *  `VITE_CORE_IMPL` and published by `selectCore.ts` as `<html
 *  data-core-impl>`. A page error that mentions VITE_CORE_IMPL is the
 *  fail-closed message from `selectCore.ts` — surfaced verbatim instead of
 *  being waited out as a locator timeout. */
export async function expectSelectedCoreImpl(ctx: TestContext): Promise<void> {
  const expected = process.env.RTC_CORE_IMPL || "rxjs";

  try {
    await login(ctx).waitCoreImpl(expected, 5_000);
  } catch (error) {
    const boot = ctx.pageErrors.find((message) => {
      return message.includes("VITE_CORE_IMPL");
    });

    if (boot !== undefined) {
      throw new Error(`the app failed to boot: ${boot}`, { cause: error });
    }

    throw error;
  }
}
```

Every other constructor of a `TestContext` (grep `scratch: new Scratchpad()` under `tests/`) gains `pageErrors: []` or the real listener. Prove it once: `RTC_CORE_IMPL=bogus pnpm --filter @rtc/tests exec playwright test tests/browser/playwright/login.spec.ts` (or the repo's equivalent single-spec command — read `tests/package.json`) must fail with `the app failed to boot: VITE_CORE_IMPL="bogus" is not one of rxjs, async, effect` within seconds; paste the line in the report.

- [ ] **Step 5: Gate**

```bash
pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-solid test
pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-solid typecheck && pnpm --filter @rtc/tests typecheck
pnpm exec biome ci scripts packages/client-react packages/client-solid tests
pnpm exec eslint packages/client-react/src packages/client-solid/src tests
pnpm --filter @rtc/tests exec playwright test tests/browser/playwright/login.spec.ts      # rxjs, must pass
```

- [ ] **Step 6: Commit (pathspec)**

```bash
git add scripts/check-core-bundle.mjs packages/client-react packages/client-solid tests
git commit -m "chore(tooling,clients,e2e): bundle check try/finally; closeBundle honours outDir; selectCore publishes the validated core; Playwright surfaces a boot error instead of timing out

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH" -- scripts/check-core-bundle.mjs packages/client-react packages/client-solid tests
```

---

### Task 6: `client-core` doc sweep — the interface is the doc

**Files:** every `packages/client-core/src/presenters/*Presenter.ts` and `*Machine.ts` whose leading class doc restates its `@rtc/core-api` interface's doc (the 46 interfaces under `packages/core-api/src/presenters/` and `src/machines/`).

**Rule:** the `core-api` interface doc is canonical for WHAT a member does. A `client-core` class comment keeps only HOW this implementation does it — RxJS-specific mechanics (`shareReplay`, `BehaviorSubject` machine, timing constants), migration notes, and cross-references. Where the class comment is a restatement, replace it with one line: `/** Implements \`X\` (\`@rtc/core-api\`) — see the interface for the contract. <one implementation note if any> */`. Where the class comment already carries implementation notes, keep those and drop only the restated sentences. Do not touch member (method/field) doc comments.

- [ ] **Step 1: Worked example** — `AmbientStylePresenter.ts` today:

```ts
/**
 * App-layer presenter for the ambient-style preference. Exposes the
 * replay-current style stream and the write operation, keeping persistence out
 * of the UI. Orthogonal to AnimatedBackgroundPresenter (the motion gate).
 */
```

becomes:

```ts
/** Implements `AmbientStylePresenter` (`@rtc/core-api`) — see the interface
 * for the contract. `style$` is the port stream under
 * `shareReplay({ bufferSize: 1, refCount: true })`. */
```

- [ ] **Step 2: Sweep** all files, one commit per ten files or so is fine; run `pnpm exec biome ci packages/client-core` and `pnpm --filter @rtc/client-core test` at the end (prose only — tests cannot change). Produce, in the report, a table: file → what was removed (restatement / nothing) → what was kept.

- [ ] **Step 3: Commit**

```bash
git add packages/client-core/src/presenters
git commit -m "docs(client-core): presenter and machine class docs keep implementation notes only — the core-api interface is the contract

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH" -- packages/client-core/src/presenters
```

---

### Task 7: Docs, STATUS, the gate and the e2e matrix

**Files:** `docs/STATUS.md`, `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md`, `docs/architecture/22-pluggable-application-core.md`, `docs/adr/ADR-006-pluggable-application-core.md`, `packages/client-core-async/README.md` (if Task 1 did not), `CLAUDE.md` (no change expected).

- [ ] **Step 1: STATUS** — in the pluggable-core entry, DELETE the whole residual block (title line `**Slice-0, slice-1a and slice-1b residuals still open (deferred to slice 2).**`, its intro line, and every bullet). If Task 4's stop rule fired, keep a one-bullet block titled `**Residual still open.**` with the `auth.ts` item reworded to the measured site count. Append to the entry's main sentence: `Residual sweep shipped 2026-09-19 (plan: [superpowers/plans/2026-09-19-pluggable-core-residual-sweep.md](superpowers/plans/2026-09-19-pluggable-core-residual-sweep.md)): every slice-0/1a/1b residual closed.` Bump `Last updated` if the date moved.

- [ ] **Step 2: Spec** —
  - Async core, the `Topic<T>` bullet: append ` **Amended in the residual sweep:** failure RESETS the topic (the operator's \`resetOnError: true\`); a throwing subscriber is isolated and its error rethrown on a macrotask, as rxjs does.`
  - Async core, the `spawn` bullet: append ` Cancellation is cooperative (an \`AbortSignal\`) by design.`
  - Effect core, the Streams bullet's slice-1a amendment: append ` **Residual sweep:** a warm period may start seedless (\`seed()\` returns \`None\`; subscribers hear nothing until the first write); the producer's first write awaits a watcher latch; every port subscription a producer opens goes through the period-scoped \`fromPort\`, which the period releases.`
  - Effect core, the Bridge bullet: replace `\`fromObservable(obs): Stream<T>\` via \`Stream.asyncPush\` (subscribe in register, unsubscribe in the scope finaliser)` with `\`fromObservable(obs, scope?): Stream<T>\` — subscribes EAGERLY at call time into a Queue (slice 1a), reachable only through \`sharedFold\`'s \`fromPort\`; \`peek\`/\`peekCurrent\` (\`bridge/peek.ts\`) read a replay-current port synchronously and throw its synchronous error`.
  - Core-contract tier, the Suites bullet: append ` **Residual sweep:** one cross-member suite, \`portDiscipline\`, runs in every runner and witnesses that each port method is called once, at construction (the harness counts calls through a Proxy).`
  - Delivery: under the slice-1b shipped line add `Residual sweep shipped 2026-09-19 (plan: [\`../plans/2026-09-19-pluggable-core-residual-sweep.md\`](../plans/2026-09-19-pluggable-core-residual-sweep.md)).`

- [ ] **Step 3: §22** — after "Three timing guarantees" add a section:

```
## Failure, teardown and port discipline

Four more producer behaviours the contract fixes or the cores agree on
explicitly (residual sweep, 2026-09-19):

1. **Error resets.** A source error reaches every subscriber and drops them;
   the next subscriber re-subscribes the source — `shareReplay({ refCount:
   true })`'s `resetOnError`, the async `Topic`'s reset, the Effect
   `sharedFold`'s fresh warm period. No core latches an error.
2. **A throwing subscriber is isolated.** The other subscribers still receive
   the value; the thrown error is rethrown on a macrotask (rxjs's
   `SafeSubscriber`, the async `reportAsync`, an Effect fiber's own defect
   path).
3. **After `dispose()`, a still-attached subscriber hears nothing.** The RxJS
   core's `dispose()` is a knowing no-op today (its follow-up is a
   `Subscription` bag), so an interrupt-only Effect cause is deliberately
   silent too; completion-on-dispose becomes the contract when that bag
   lands.
4. **Every port method is called once, at construction.** A stream
   re-subscribes the captured Observable on every warm period; a synchronous
   read (`cycle()`, `current()`) reads through a fresh subscription of it and
   throws the port's synchronous error at the read site. The `portDiscipline`
   contract suite counts the calls through a Proxy in every runner.
```

And in guarantee 1's text, after `the Effect core's \`refToStateStream\` re-reads the \`SubscriptionRef\` per subscription`, add: `; a \`sharedFold\` whose port has not emitted yet starts a SEEDLESS period and delivers nothing until the first value, as \`shareReplay\` does`.

- [ ] **Step 4: ADR-006** — after the "Decided in slice 1b" block add:

```
**Decided in the residual sweep** (2026-09-19):

- **Error resets, in every core.** The async `Topic` latched a source error
  (slice 0) where `shareReplay({ refCount: true })` resets; it now resets.
  A throwing subscriber is isolated as rxjs isolates it.
- **Silence after `dispose()` is the shared behaviour, not a gap.** The RxJS
  `dispose()` is a knowing no-op; an interrupt-only Effect cause is silent
  for the same reason. Revisit with the RxJS `Subscription` bag.
- **`sharedFold` periods may be seedless, and the producer's first write
  awaits a watcher latch.** `Option`-typed ref; `yieldNow` gone; the
  generation counter gone (per-period subscriber sets do its one real job).
- **Port subscriptions belong to the period.** `fromObservable` is reached
  only through `fromPort`; a dependency-cruiser rule confines `bridge/in.ts`.
- **Every port method is called once, at construction** — a rule for all
  three cores, contracted by `portDiscipline`.
- **`peek` throws.** A port that errors on subscribe fails the read at its
  site.
- **`client-core` class docs carry implementation notes only**; the
  `core-api` interface is the contract's prose.
```

- [ ] **Step 5: Doc links, formatting, the CI mirror, the e2e matrix**

```bash
pnpm check:doc-links && pnpm exec biome ci .
pnpm build && pnpm typecheck && pnpm test
pnpm --filter @rtc/client-core-async test:coverage && pnpm --filter @rtc/client-core-effect test:coverage
pnpm check:deps && pnpm --filter @rtc/tests gates && pnpm check:core-bundle && pnpm core:parity
pnpm test:e2e            # rxjs — this sweep changed client-core, the clients and the e2e harness, so all three legs run locally
pnpm test:e2e:async
pnpm test:e2e:effect
```

Each e2e run unpiped, summary block read directly. Expected: all green; `core:parity` still 17/71 each.

- [ ] **Step 6: Commit**

```bash
git add docs CLAUDE.md packages/client-core-async/README.md
git commit -m "docs(pluggable-core): residual sweep receipts — §22 failure/teardown/port-discipline section, spec + ADR amendments, STATUS residual block closed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

Then ship per the repo's shipping rules: push, PR (body: the residual → closure table, `core:parity`, gzip sizes, the three e2e counts), CI green on the head SHA, CodeQL, `--merge`, ancestor check, worktree cleanup.

---

## Self-review

**Residual coverage (19):** `Topic` throwing subscriber / cooperative abort — Task 1 + ruling 2; interrupt-only cause — ruling 3 (Task 2 doc + §22); `fromObservable` calling rule — Task 2 `fromPort` + Task 3 dep-cruiser rule; `client-core-stays-inner` — Task 3 Step 9; doc duplication — Task 6; `ThroughputMessage` — Tasks 3 + 4; `composePanelStream` location — Task 3 Step 1; invalid `RTC_CORE_IMPL` timeout — Task 5 Step 4; `execSync` try/finally — Task 5 Step 1; `closeBundle` outDir — Task 5 Step 2; `not.toBeAny()` — Task 3 Step 4; `auth.ts` StateStream — Tasks 3 + 4 (stop rule); `selectCore` raw value + empty `RTC_CORE_IMPL` — Task 5 Steps 3–4; generation guards — Task 2 (removed + per-period sets + test); `yieldNow` latch — Task 2; `events.events()` per period + Effect `cycle()` capture — Tasks 1, 2, 4 + Task 3's suite; `peek` swallows — Tasks 1, 2, 4; `Topic` terminal failure — Task 1; `sharedFold` mandatory seed — Task 2.

**Placeholder scan:** no TBD/TODO. Task 6 is rule + worked example by design (43 prose edits). Task 3 Step 6's first import block is deliberately shown then retracted so an implementer does not repeat the mistake. Task 4 Step 2 and Task 5 Step 3 name a file to read and the two possible outcomes.

**Type consistency:** `FoldUpdate<S>`'s `next: (current: Option<S>) => S` — used by `connection` with `Option.getOrElse` ✓, by `mirrorPort` ignoring `current` ✓, by tests with `Option.getOrElse(s, () => 0)` ✓. `FoldRun<S>`'s second parameter `fromPort` — used in `mirrorPort`, `connection`, `themePreference`, and tests ✓. `SharedFold.seed: () => Option<S>` — `mirrorPort` returns `Option.map(peekCurrent(source), project)` ✓, `connection` `Option.some(initial)` ✓, `themePreference` `Option.some(resolveThemeMode(...))` ✓. `mirrorPort(host, source, project)` / `mirrorPortAsIs(host, source)` — every call site drops the fallback argument ✓. Async `peekCurrent` returns `Peeked<T> | null`, Effect `peekCurrent` returns `Option<T>` — different packages, each internally consistent ✓. `ScriptedDriver.portCalls(method: PortMethodName)` — the four suite cases pass `"themeMode$"`, `"eqWatchlistSort$"`, `"bootVariant$"`, `"connectionEvents.events"`, all members of `PortMethodName` ✓. `readNow(source, fallback)` (client-core) — the three presenters call it with the matching `DEFAULT_*` ✓. `TestContext.pageErrors: string[]` — set in `_context.ts`, `world.ts`, read in `login.ts` ✓.
