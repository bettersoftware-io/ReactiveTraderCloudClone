# Pluggable Application Core — Slice 1a (Connection + Theme) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the first six contract members natively into both alternative cores — `presenters.connection`, `presenters.themePreference`, `presenters.themeSkinPreference`, `presenters.viewModePreference`, `presenters.powerSaver` and `commands.reconnect` — so the `@rtc/core-contract` suites stop passing trivially and start witnessing three genuinely different implementations of the same behaviour.

**Architecture:** Slice 0 left both alternative cores as a spread of the RxJS `App` with an empty native overlay. This slice fills the overlay for the six members: the async core expresses each stream as a replay-1, refCounted `Topic` whose producer is a synchronous `relay` of the port Observable (a new `bridge/in` primitive, because a `for await` cannot deliver in the subscriber's tick); the Effect core expresses each stream as a `sharedFold` — a `SubscriptionRef` seeded synchronously on first subscribe and driven by a producer fiber forked into a per-warm-period `Scope` (a new `bridge/out` primitive, because `Stream.share` replays on a fiber, never synchronously). The six contract suites are amended once, at the front: only a subscription's FIRST value is asserted synchronously; every later value is asserted after `settle()`, which is the envelope's actual promise. `parity.json` flips the five presenters to `"native"` and gains a `commands` section.

**Tech Stack:** TypeScript 7 `tsc` (6.x API shim for tooling — see `docs/typescript-7.md`), pnpm 12 workspaces + Turborepo (strict env), vitest 4.1, RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2, dependency-cruiser, knip, Playwright.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md) — slice table row "1a connection + theme". Slice 0 shipped as PR #717 (plan: [`2026-09-12-pluggable-core-slice-0.md`](2026-09-12-pluggable-core-slice-0.md)).

## Global Constraints

- **Exit criterion (spec, "Slices 1a–7"):** suites for the six members exist and are green on RxJS; both alternative cores have them native; the e2e matrix (`test:e2e`, `test:e2e:async`, `test:e2e:effect`) is green; `parity.json` updated in both cores.
- **Bridge rule:** outside `packages/client-core-{async,effect}/src/bridge/`, `rxjs` and `@rx-state/core` are **type-only** imports (dependency-cruiser `bridge-owns-rxjs` + grep gate 43; `.test.ts` files are exempt). `effect` is importable only inside `packages/client-core-effect/` (`effect-only-in-client-core-effect`).
- **Types-only rule:** `packages/core-api/src` exports no runtime value (grep gate 42). Nothing in this slice touches `core-api`.
- **Ordering rule (spec):** a member's suite is green on RxJS before either alternative core ports it. All six suites already exist (slice 0); Task 1 amends them and re-proves RxJS green before Tasks 2–5 start.
- **Workspace packages resolve through `dist`** (`exports` → `./dist/index.js`, no vitest alias). After editing `@rtc/core-contract` or any other dependency package, run `pnpm --filter <pkg> build` before running a dependent package's tests — a stale `dist` gives a false result in either direction (this bit slice 0's bundle check once).
- **Shared dep versions must match the repo exactly** (`pnpm check:versions`): `vitest ^4.1.10`, `@vitest/coverage-v8 ^4.1.10`, `tsc-alias 1.9.5`, `rxjs ^7.8`, `@rx-state/core ^0.1.4`, `effect ^3.22.2`, `@types/node ^26.2.0`. This slice adds no dependency.
- **Coverage gates:** each alternative core's `test:coverage` must stay ≥95% statements/lines/functions and ≥85% branches (CI step "Alternative-core coverage gates"). Every new branch in `src/` needs a covering test.
- **Biome:** mandatory braces on every control statement; arrow functions use block bodies with an explicit `return`; zero findings; no `biome-ignore`. Function names state their effect (`rtc/name-functions-by-effect`); slot props/params stay `onX`/`next`.
- `#/` subpath imports only; never `@/`; ≥2-up relative imports are banned.
- **No new env vars, scripts, packages or CI jobs** in this slice — the selection, matrix and gates from slice 0 are reused as-is.
- **Measured facts this plan relies on (Effect 3.22.2, verified 2026-09-18 in this repo):** `SubscriptionRef.set` with an `Object.is`-equal value RE-PUBLISHES to `changes`; `Stream.zipLatest(live, Stream.make(x))` keeps emitting after the finite side ends; `ManagedRuntime.runFork` runs a fiber synchronously up to its first suspension, but a port's first value reaches a `Stream.asyncPush` consumer one microtask after `runFork` and later values a macrotask later. Do not "fix" code that depends on these without re-measuring.
- Commit after every task with the repo's trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH
  ```

## Rulings recorded up front

1. **Only the first value is asserted synchronously.** The spec lists the contract's envelope-level assertions as "values, ordering, completion, teardown on last unsubscribe, **synchronous first value**, same-key identity". Slice 0's suites also asserted synchronously after `setMode`/`emitConnection`, which pins RxJS's delivery tick rather than the behaviour — an Effect fiber can never satisfy it. Task 1 inserts `await settle()` between driving and asserting later values, and amends the spec with one sentence saying so. Cost if wrong: a core that delivers later values synchronously (RxJS, async) is under-asserted by exactly one tick — nothing a UI observes.
2. **The Effect core does not use `Stream.share` as its outward envelope.** The spec sketched `Stream.share({ capacity: "unbounded", replay: 1 })`; a share replays to a new subscriber on a fiber, which violates guarantee (a). The Effect idiom for a replay-current presenter stream is `sharedFold` (Task 4): a `SubscriptionRef` seeded synchronously per warm period plus a producer fiber in a per-warm-period `Scope`. §22 and ADR-006 record this (Task 6).
3. **Tag/Layer composition is deferred to slice 2.** The spec's "each presenter is a `Context.Tag` service with a `Layer`" buys nothing while no native member depends on another native member; slice 2's `priceStream` (which needs `powerSaver.isCalm$`) is the first such dependency and the natural moment. Slice 1a keeps slice 0's plain-object overlay with `host` injected. Recorded in the spec (Task 6).
4. **`commands.reconnect` stays wired to the RxJS core's `reconnect$` Subject.** `buildBrowserPorts` in both web clients merges that module-level Subject into `connectionEvents` regardless of core; a native `commands.reconnect` that published elsewhere would be unobservable in the browser. Each core's native command pushes into it through its own `bridge/out.ts` (`pushReconnectIntent`), which is the only place a Subject method is called. Slice 8 moves the seam. `parity.json` gains `"commands": { "reconnect": "native" }` and the parity test stops filtering `commands.*` out.
5. **Equal-state conflation differs per core and is NOT contracted.** RxJS's `scan` re-emits the fold result on an ignored event and `map` re-emits an unchanged boolean (`isCalm$` on calm → freeze). The async core reproduces both (a `Topic` publishes every fold result). The Effect core conflates `Object.is`-equal states by construction (a `SubscriptionRef` fold guarded against re-publishing the seed — see the measured fact above). No suite asserts either way; each core's own unit test pins its own behaviour; §22 records the difference.

## Parallelism (accelerated SDD)

Task 1 first — both cores' runners consume the amended suites. Then `{Task 2 → Task 3}` (async core) and `{Task 4 → Task 5}` (Effect core) are disjoint packages and may run as two parallel implementers. Task 6 last. Covering tests only per implementer; one gauntlet at the end (Task 6).

---

## File structure

```
packages/core-contract/                          MODIFIED (Task 1)
  src/harness/settle.ts                          NEW  settle(): two macrotask turns
  src/harness/collect.ts                         + errors slot (slice-0 residual)
  src/suites/{connection,themePreference,themeSkinPreference,viewModePreference,powerSaver,reconnect}.ts
                                                 await settle() before every post-drive assertion; cycle test seeds "light"
  src/index.ts                                   export settle
  vitest.config.ts                               passWithNoTests removed (slice-0 residual)

packages/client-core-async/                      MODIFIED (Tasks 2, 3)
  src/kernel/untilAborted.ts                     NEW  resolve on abort
  src/kernel/topic.ts                            + mapTopic(source, project)
  src/kernel/store.ts                            doc: Object.is-equal writes are dropped (slice-0 residual)
  src/bridge/in.ts                               + relay, peek, topicFromObservable
  src/bridge/out.ts                              + pushReconnectIntent
  src/bridge/out.test.ts                         + storeToStateStream cold/warm re-read cases (slice-0 residual)
  src/presenters/connection.ts                   NEW  createConnectionPresenter
  src/presenters/preferences.ts                  NEW  createThemeSkinPreferencePresenter, createViewModePreferencePresenter, createPowerSaverPresenter
  src/presenters/themePreference.ts              NEW  createThemePreferencePresenter
  src/commands.ts                                NEW  createCommands
  src/composition.ts                             native overlay filled; commands native; dispose note (slice-0 residual)
  src/parity.json                                five presenters native; commands section
  src/parity.test.ts                             commands checked; app built in beforeAll, disposed in afterAll (slice-0 residual)
  src/index.ts                                   new exports
  README.md                                      Parity section

packages/client-core-effect/                     MODIFIED (Tasks 4, 5)
  src/bridge/in.ts                               + peek
  src/bridge/out.ts                              + sharedFold, FoldUpdate, SharedFold, pushReconnectIntent
  src/presenters/mirrorPort.ts                   NEW  mirrorPort(host, source, fallback, project)
  src/presenters/connection.ts                   NEW  createConnectionPresenter
  src/presenters/preferences.ts                  NEW  the three preference presenters
  src/presenters/themePreference.ts              NEW  createThemePreferencePresenter
  src/commands.ts                                NEW  createCommands
  src/composition.ts                             native overlay filled; commands native
  src/parity.json, src/parity.test.ts            as for the async core
  src/index.ts                                   + EffectHost (slice-0 residual), new exports
  README.md                                      Parity section

docs/ (Task 6)
  superpowers/specs/2026-09-11-pluggable-application-core-design.md   settle sentence; Stream.share note; Tag/Layer deferral
  architecture/22-pluggable-application-core.md                       guarantees §, parity §
  adr/ADR-006-pluggable-application-core.md                           "Learned in slice 1a"
  STATUS.md                                                           entry + residual list
CLAUDE.md                                                             "100% delegation" sentence
```

---

### Task 1: Contract amendments — `settle()`, error slot, suite timing

**Files:**
- Create: `packages/core-contract/src/harness/settle.ts`
- Modify: `packages/core-contract/src/harness/collect.ts`
- Modify: `packages/core-contract/src/suites/connection.ts`, `themePreference.ts`, `themeSkinPreference.ts`, `viewModePreference.ts`, `powerSaver.ts`, `reconnect.ts`
- Modify: `packages/core-contract/src/index.ts`
- Modify: `packages/core-contract/vitest.config.ts`
- Modify: `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md` (one sentence)

**Interfaces:**
- Consumes: `collect`, `MakeHarness`, `ScriptedDriver` from slice 0 (unchanged signatures).
- Produces: `settle(): Promise<void>` exported from `@rtc/core-contract`; `Collected<T>` gains `readonly errors: unknown[]`. Tasks 3 and 5 rely on the amended suites passing against their native members.

- [ ] **Step 1: Write `settle.ts`**

```ts
// packages/core-contract/src/harness/settle.ts

/** Let every continuation a core may have scheduled run before the next
 * assertion: the microtask queue, then one macrotask turn, twice over.
 *
 * The contract asserts the FIRST value of a subscription synchronously —
 * that is the warmth guarantee — and every later value only after this
 * call. That split is the envelope's actual promise: an rxjs Subject
 * delivers in the caller's tick, an Effect fiber delivers on the scheduler
 * (measured on 3.22.2: a port's first value one microtask after `runFork`,
 * later ones a macrotask later), and a suite that asserted synchronously
 * after a `set` would be pinning RxJS's delivery timing, not the behaviour.
 * Two turns cover a two-hop chain (port → fold → subscriber); a suite that
 * needs more is asserting on something the envelope does not promise.
 *
 * Deliberately the REAL `setTimeout`: a suite that installs vitest fake
 * timers must drive them itself (`vi.advanceTimersByTimeAsync`) — the
 * clock under test must not be the clock this waits on. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 2; turn += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
```

- [ ] **Step 2: Add the error slot to `collect.ts`** (replace the whole file)

```ts
// packages/core-contract/src/harness/collect.ts
import type { Stream } from "@rtc/core-api";

/** What `collect` hands back: the live emission log, the live error log, and
 * its own teardown. */
export interface Collected<T> {
  readonly values: T[];
  /** Every `error` notification, in order. A stream that errors lands here as
   * a located assertion (`expect(c.errors).toEqual([])`) instead of an
   * unhandled rxjs error thrown from a timer. */
  readonly errors: unknown[];
  unsubscribe(): void;
}

/** Subscribe and keep every emission. `values` is live: read it after
 * driving the ports and awaiting `settle()`. Synchronous emissions on
 * subscribe land before `collect` returns — that is how the suites assert
 * replay-current behaviour. */
export function collect<T>(stream: Stream<T>): Collected<T> {
  const values: T[] = [];
  const errors: unknown[] = [];
  const subscription = stream.subscribe({
    next: (value) => {
      values.push(value);
    },
    error: (error: unknown) => {
      errors.push(error);
    },
  });

  return {
    values,
    errors,
    unsubscribe: () => {
      subscription.unsubscribe();
    },
  };
}
```

- [ ] **Step 3: Export `settle` from the package index**

In `packages/core-contract/src/index.ts`, add after the `collect` export line:

```ts
export { settle } from "#/harness/settle";
```

- [ ] **Step 4: Rewrite the six suites** (full replacements — the synchronous first-value assertions stay synchronous; every assertion that follows a drive waits on `settle()`)

```ts
// packages/core-contract/src/suites/connection.ts
import { describe, expect, it } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeConnectionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("status$ carries CONNECTING synchronously on subscribe", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.connection.status$);
        expect(c.values).toEqual([ConnectionStatus.CONNECTING]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("folds gateway events: connected → disconnected → reconnect attempt", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.connection.status$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        h.driver.emitConnection({ type: "gatewayDisconnected" });
        h.driver.emitConnection({ type: "reconnectAttempt" });
        await settle();
        expect(c.values).toEqual([
          ConnectionStatus.CONNECTING,
          ConnectionStatus.CONNECTED,
          ConnectionStatus.DISCONNECTED,
          ConnectionStatus.CONNECTING,
        ]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current status, not the history", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.connection.status$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        // Synchronous on purpose: the current value is the warmth guarantee.
        const late = collect(h.app.presenters.connection.status$);
        expect(late.values).toEqual([ConnectionStatus.CONNECTED]);
        first.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("tears down on the last unsubscribe: a fresh subscriber restarts from CONNECTING", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.connection.status$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        first.unsubscribe();
        // The teardown itself may be scheduled (an Effect scope closes on a
        // fiber); the restart is what is asserted, so let the teardown land.
        await settle();
        const again = collect(h.app.presenters.connection.status$);
        expect(again.values).toEqual([ConnectionStatus.CONNECTING]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

```ts
// packages/core-contract/src/suites/themePreference.ts
import { describe, expect, it } from "vitest";

import { DEFAULT_THEME_MODE_PREFERENCE } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeThemePreferenceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("modePreference$ replays the stored choice synchronously", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.themePreference.modePreference$);
        expect(c.values).toEqual([DEFAULT_THEME_MODE_PREFERENCE]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("setMode persists and emits", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.themePreference.modePreference$);
        h.app.presenters.themePreference.setMode("light");
        await settle();
        expect(c.values.at(-1)).toBe("light");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("cycle() walks the ring from the CURRENT stored value, not from the default", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.themePreference;
        // "light" is NOT the default ("dark"): a cycle that ignored the stored
        // value and advanced from the default would produce "light" first
        // instead of "system", and the assertion below would see it.
        p.setMode("light");
        await settle();
        const c = collect(p.modePreference$);
        expect(c.values).toEqual(["light"]);
        p.cycle();
        p.cycle();
        p.cycle();
        await settle();
        expect(c.values).toEqual(["light", "system", "dark", "light"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("mode$ resolves 'system' against the OS scheme and de-duplicates", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.themePreference;
        p.setMode("system");
        await settle();
        const c = collect(p.mode$);
        expect(c.values).toEqual(["light"]);
        h.driver.setPrefersDark(true);
        h.driver.setPrefersDark(true);
        await settle();
        expect(c.values).toEqual(["light", "dark"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

```ts
// packages/core-contract/src/suites/themeSkinPreference.ts
import { describe, expect, it } from "vitest";

import { DEFAULT_THEME_SKIN } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeThemeSkinPreferenceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("skin$ replays the default synchronously and follows setSkin", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.themeSkinPreference;
        const c = collect(p.skin$);
        expect(c.values).toEqual([DEFAULT_THEME_SKIN]);
        p.setSkin("classic");
        await settle();
        expect(c.values.at(-1)).toBe("classic");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

```ts
// packages/core-contract/src/suites/viewModePreference.ts
import { describe, expect, it } from "vitest";

import { DEFAULT_VIEW_MODE } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeViewModePreferenceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("viewMode$ replays the default synchronously and follows setViewMode", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.viewModePreference;
        const c = collect(p.viewMode$);
        expect(c.values).toEqual([DEFAULT_VIEW_MODE]);
        p.setViewMode("price");
        await settle();
        expect(c.values.at(-1)).toBe("price");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

```ts
// packages/core-contract/src/suites/powerSaver.ts
import { describe, expect, it } from "vitest";

import { DEFAULT_POWER_SAVER_LEVEL } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describePowerSaverContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("level$, isCalm$ and isFreeze$ replay synchronously from the default", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.powerSaver;
        const level = collect(p.level$);
        const calm = collect(p.isCalm$);
        const freeze = collect(p.isFreeze$);
        expect(level.values).toEqual([DEFAULT_POWER_SAVER_LEVEL]);
        expect(calm.values).toEqual([false]);
        expect(freeze.values).toEqual([false]);
        level.unsubscribe();
        calm.unsubscribe();
        freeze.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("calm is any non-off level; freeze is only 'freeze'", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.powerSaver;
        const calm = collect(p.isCalm$);
        const freeze = collect(p.isFreeze$);
        p.setLevel("calm");
        await settle();
        expect(calm.values.at(-1)).toBe(true);
        expect(freeze.values.at(-1)).toBe(false);
        p.setLevel("freeze");
        await settle();
        expect(calm.values.at(-1)).toBe(true);
        expect(freeze.values.at(-1)).toBe(true);
        p.setLevel("off");
        await settle();
        expect(calm.values.at(-1)).toBe(false);
        expect(freeze.values.at(-1)).toBe(false);
        calm.unsubscribe();
        freeze.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

```ts
// packages/core-contract/src/suites/reconnect.ts
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeReconnectContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("commands.reconnect() pushes a 'reconnect' event into the connection stream", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.driver.connectionEvents$());
        h.app.commands.reconnect();
        await settle();
        expect(c.values).toEqual([{ type: "reconnect" }]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

- [ ] **Step 5: Remove `passWithNoTests` from `packages/core-contract/vitest.config.ts`** — the include glob has matched `src/registry.test.ts` since slice 0, so the safety valve only masks a broken glob (slice-0 residual). Delete the `passWithNoTests: true,` line; keep the comment above `include`.

- [ ] **Step 6: Amend the spec** — in `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md`, section "The core-contract tier", the **Suites** bullet, after the sentence ending `synchronous first value, same-key identity.` insert:

```
  Only that first value is asserted synchronously; every later value is
  asserted after the harness's `settle()` (two macrotask turns), because
  an Effect fiber delivers past the seed on the scheduler, never in the
  caller's tick, and a suite that asserted in the caller's tick would be
  pinning RxJS's delivery timing rather than the behaviour (ruling
  2026-09-18, slice 1a).
```

- [ ] **Step 7: Build, then run the RxJS runner and both delegating runners**

```bash
pnpm --filter @rtc/core-contract build
pnpm --filter @rtc/core-contract test
pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts
pnpm --filter @rtc/client-core-async test
pnpm --filter @rtc/client-core-effect test
```

Expected: all green. The cycle test now reads `["light", "system", "dark", "light"]` on all three labels. (Both alternative cores still delegate at this point, so a red here is a suite defect, not a core defect.)

- [ ] **Step 8: Commit**

```bash
git add packages/core-contract docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md
git commit -m "test(core-contract): assert only the first value synchronously — settle() before later values; collect() gains an error slot

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

---

### Task 2: Async core — kernel and bridge primitives for hot ports

**Files:**
- Create: `packages/client-core-async/src/kernel/untilAborted.ts`, `src/kernel/untilAborted.test.ts`
- Modify: `packages/client-core-async/src/kernel/topic.ts` (+ `mapTopic`), `src/kernel/topic.test.ts`
- Modify: `packages/client-core-async/src/kernel/store.ts` (doc only)
- Modify: `packages/client-core-async/src/bridge/in.ts` (+ `relay`, `peek`, `topicFromObservable`), `src/bridge/in.test.ts`
- Modify: `packages/client-core-async/src/bridge/out.ts` (+ `pushReconnectIntent`), `src/bridge/out.test.ts`
- Modify: `packages/client-core-async/src/index.ts`

**Interfaces:**
- Consumes: `createTopic`, `Topic<T>`, `spawn`, `AbortError` (slice 0, unchanged); `reconnect$` from `@rtc/client-core`.
- Produces (Task 3 relies on these exact signatures):
  - `untilAborted(signal: AbortSignal): Promise<void>`
  - `mapTopic<T, U>(source: Topic<T>, project: (value: T) => U): Topic<U>`
  - `relay<T>(source: Observable<T>, signal: AbortSignal, next: (value: T) => void): Promise<void>`
  - `peek<T>(source: Observable<T>, fallback: T): T`
  - `topicFromObservable<T>(source: Observable<T>): Topic<T>`
  - `pushReconnectIntent(): void`

- [ ] **Step 1: Write the failing tests for `untilAborted`**

```ts
// packages/client-core-async/src/kernel/untilAborted.test.ts
import { describe, expect, it } from "vitest";

import { untilAborted } from "#/kernel/untilAborted";

describe("untilAborted", () => {
  it("resolves when the signal aborts", async () => {
    const controller = new AbortController();
    let resolved = false;
    const done = untilAborted(controller.signal).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    controller.abort();
    await done;
    expect(resolved).toBe(true);
  });

  it("resolves immediately for an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(untilAborted(controller.signal)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/kernel/untilAborted.test.ts`
Expected: FAIL — cannot resolve `#/kernel/untilAborted`.

- [ ] **Step 3: Write `untilAborted.ts`**

```ts
// packages/client-core-async/src/kernel/untilAborted.ts

/** Resolve when `signal` aborts — immediately if it already has. The natural
 * end of a producer whose work is entirely in callbacks (a relay of a hot
 * port, a derived topic): it has nothing to await but its own cancellation.
 * Resolves rather than rejecting because abort is that producer's success,
 * not its failure — `spawn` would swallow an `AbortError` anyway, but a
 * `finally` reads better after a resolution than after a caught rejection. */
export function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    signal.addEventListener(
      "abort",
      () => {
        resolve();
      },
      { once: true },
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/kernel/untilAborted.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing tests for `mapTopic`** — append to `packages/client-core-async/src/kernel/topic.test.ts` (inside the existing `describe("Topic", …)` block, or as a second `describe` at file end):

```ts
describe("mapTopic", () => {
  it("projects every publish and hands the current projection to a late subscriber", () => {
    const source = createTopic<number>(async () => {}, { replay: true });
    const doubled = mapTopic(source, (n) => {
      return n * 2;
    });
    const seen: number[] = [];
    const stop = doubled.subscribe((v) => {
      seen.push(v);
    });
    source.publish(1);
    source.publish(2);
    const late: number[] = [];
    const stopLate = doubled.subscribe((v) => {
      late.push(v);
    });
    expect(seen).toEqual([2, 4]);
    expect(late).toEqual([4]);
    stop();
    stopLate();
  });

  it("starts the source's producer on its first subscriber and aborts it on its last", () => {
    let starts = 0;
    let aborted = false;
    const source = createTopic<number>(
      async (signal) => {
        starts += 1;
        signal.addEventListener("abort", () => {
          aborted = true;
        });
      },
      { replay: true },
    );
    const derived = mapTopic(source, (n) => {
      return n;
    });
    const stop = derived.subscribe(() => {});
    expect(starts).toBe(1);
    expect(aborted).toBe(false);
    stop();
    expect(aborted).toBe(true);
  });

  it("fails when the source fails", async () => {
    const source = createTopic<number>(async () => {}, { replay: true });
    const derived = mapTopic(source, (n) => {
      return n;
    });
    const errors: unknown[] = [];
    derived.subscribe(
      () => {},
      (e) => {
        errors.push(e);
      },
    );
    source.fail(new Error("boom"));
    // The producer's rejection routes through `spawn` on a later microtask.
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveLength(1);
  });
});
```

Add `mapTopic` to the file's import from `#/kernel/topic`.

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/kernel/topic.test.ts`
Expected: FAIL — `mapTopic` is not exported.

- [ ] **Step 7: Add `mapTopic` to `topic.ts`** — append at the end of the file:

```ts
/** A topic derived from another by a pure projection — `map` over a hot
 * source, keeping the replay-1 + refCount shape: the first subscriber here
 * subscribes the source (starting ITS producer if this is the source's first
 * subscriber too), the last unsubscribe releases it. A source failure is the
 * producer's rejection, so it fails this topic the way `spawn` fails any
 * other. */
export function mapTopic<T, U>(
  source: Topic<T>,
  project: (value: T) => U,
): Topic<U> {
  return createTopic<U>(
    async (signal, publish) => {
      let stop = (): void => {};
      const sourceFailed = new Promise<never>((_, reject) => {
        stop = source.subscribe((value) => {
          publish(project(value));
        }, reject);
      });

      try {
        await Promise.race([sourceFailed, untilAborted(signal)]);
      } finally {
        stop();
      }
    },
    { replay: true },
  );
}
```

Add `import { untilAborted } from "#/kernel/untilAborted";` at the top of `topic.ts` (after the `spawn` import).

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/kernel/topic.test.ts`
Expected: PASS.

- [ ] **Step 9: Document `Store.set`'s equal-write drop** (slice-0 residual) — in `packages/client-core-async/src/kernel/store.ts`, replace the `set(next: …): void;` line of the interface with:

```ts
  /** Replace the value, or compute it from the previous one. A write that is
   * `Object.is`-equal to the current value is DROPPED — no listener runs —
   * so a machine can `set` unconditionally on every tick without fanning
   * out no-op renders. */
  set(next: S | ((previous: S) => S)): void;
```

- [ ] **Step 10: Write the failing tests for the bridge-in primitives** — append to `packages/client-core-async/src/bridge/in.test.ts`:

```ts
describe("relay", () => {
  it("hands a replay-current source's value on in the SAME tick as subscribe", () => {
    const source = new BehaviorSubject(1);
    const controller = new AbortController();
    const seen: number[] = [];
    void relay(source, controller.signal, (v) => {
      seen.push(v);
    });
    expect(seen).toEqual([1]);
    source.next(2);
    expect(seen).toEqual([1, 2]);
    controller.abort();
  });

  it("unsubscribes and resolves on abort", async () => {
    const source = new Subject<number>();
    const controller = new AbortController();
    const done = relay(source, controller.signal, () => {});
    expect(source.observed).toBe(true);
    controller.abort();
    await expect(done).resolves.toBeUndefined();
    expect(source.observed).toBe(false);
  });

  it("resolves on source completion and rejects on source error", async () => {
    const controller = new AbortController();
    await expect(
      relay(of(1, 2), controller.signal, () => {}),
    ).resolves.toBeUndefined();
    const boom = new Error("boom");
    await expect(
      relay(throwError(() => boom), controller.signal, () => {}),
    ).rejects.toBe(boom);
  });

  it("resolves without subscribing when the signal is already aborted", async () => {
    const source = new Subject<number>();
    const controller = new AbortController();
    controller.abort();
    await expect(
      relay(source, controller.signal, () => {}),
    ).resolves.toBeUndefined();
    expect(source.observed).toBe(false);
  });
});

describe("peek", () => {
  it("reads a replay-current source synchronously and leaves nothing warm", () => {
    const source = new BehaviorSubject("a");
    expect(peek(source, "z")).toBe("a");
    expect(source.observed).toBe(false);
  });

  it("returns the fallback for a source that does not emit on subscribe", () => {
    expect(peek(new Subject<string>(), "z")).toBe("z");
  });
});

describe("topicFromObservable", () => {
  it("subscribes the port on the first subscriber, replays synchronously, releases on the last", () => {
    const port = new BehaviorSubject("holo");
    const topic = topicFromObservable(port);
    expect(port.observed).toBe(false);
    const seen: string[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual(["holo"]);
    expect(port.observed).toBe(true);
    port.next("neon");
    const late: string[] = [];
    const stopLate = topic.subscribe((v) => {
      late.push(v);
    });
    expect(late).toEqual(["neon"]);
    stop();
    stopLate();
    expect(port.observed).toBe(false);
  });
});
```

Extend the file's rxjs import to `import { BehaviorSubject, of, Subject, throwError } from "rxjs";` (keep whatever it already imports) and the bridge import to `import { iterate, once, peek, relay, topicFromObservable } from "#/bridge/in";`.

- [ ] **Step 11: Run to verify they fail**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/bridge/in.test.ts`
Expected: FAIL — `relay`, `peek`, `topicFromObservable` not exported.

- [ ] **Step 12: Add the three primitives to `bridge/in.ts`** — change the rxjs import to `import { firstValueFrom, type Observable, take } from "rxjs";`, add `import { createTopic, type Topic } from "#/kernel/topic";`, and append:

```ts
/** Push an Observable into a callback, synchronously per emission, until
 * `signal` aborts. Resolves on abort or on source completion, rejects on a
 * source error. The synchronous twin of `iterate`: a replay-current port
 * (BehaviorSubject-backed) emits DURING `subscribe`, and `relay` hands that
 * emission on in the same tick — the warmth a `for await` cannot give, since
 * it resumes a microtask later. Use it for hot ports a Topic mirrors; keep
 * `iterate` for sources a consumer wants to pull at its own pace. */
export function relay<T>(
  source: Observable<T>,
  signal: AbortSignal,
  next: (value: T) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const subscription = source.subscribe({
      next,
      error: reject,
      complete: resolve,
    });

    signal.addEventListener(
      "abort",
      () => {
        subscription.unsubscribe();
        resolve();
      },
      { once: true },
    );
  });
}

/** The current value of a replay-current Observable, read synchronously —
 * what `cycle()` needs (advance from the TRUE stored value, never a stale
 * closure). A source that does not emit during `subscribe` yields
 * `fallback`; the subscription is released before this returns, so nothing
 * is left warm. */
export function peek<T>(source: Observable<T>, fallback: T): T {
  let value = fallback;
  source
    .pipe(take(1))
    .subscribe((current) => {
      value = current;
    })
    .unsubscribe();
  return value;
}

/** A hot port Observable as a replay-1, refCounted Topic: the port is
 * subscribed on the topic's first subscriber and released on its last — the
 * RxJS core's `port$().pipe(shareReplay({ bufferSize: 1, refCount: true }))`,
 * as a Topic whose whole producer is one `relay`. */
export function topicFromObservable<T>(source: Observable<T>): Topic<T> {
  return createTopic<T>(
    (signal, publish) => {
      return relay(source, signal, publish);
    },
    { replay: true },
  );
}
```

- [ ] **Step 13: Run to verify they pass**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/bridge/in.test.ts`
Expected: PASS.

- [ ] **Step 14: Write the failing tests for `pushReconnectIntent` and the `storeToStateStream` re-read twin** — append to `packages/client-core-async/src/bridge/out.test.ts` inside `describe("bridge/out", …)`:

```ts
  it("storeToStateStream() observes a set made while it is still cold", () => {
    const store = createStore(5);
    const stream = storeToStateStream(store);
    store.set(6);
    const seen: number[] = [];
    const sub = stream.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([6]);
    sub.unsubscribe();
  });

  it("storeToStateStream() re-reads the store on every cold → warm cycle", () => {
    const store = createStore(5);
    const stream = storeToStateStream(store);
    const first: number[] = [];
    stream
      .subscribe((v) => {
        first.push(v);
      })
      .unsubscribe();
    store.set(7);
    const second: number[] = [];
    const sub = stream.subscribe((v) => {
      second.push(v);
    });
    expect(first).toEqual([5]);
    expect(second).toEqual([7]);
    sub.unsubscribe();
  });

  it("pushReconnectIntent() lands a 'reconnect' event on the RxJS core's reconnect$ seam", () => {
    const seen: unknown[] = [];
    const sub = reconnect$.subscribe((e) => {
      seen.push(e);
    });
    pushReconnectIntent();
    expect(seen).toEqual([{ type: "reconnect" }]);
    sub.unsubscribe();
  });
```

Add `import { reconnect$ } from "@rtc/client-core";` and extend the bridge import to `import { pushReconnectIntent, storeToStateStream, topicToStream } from "#/bridge/out";`.

- [ ] **Step 15: Run to verify the new cases fail**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/bridge/out.test.ts`
Expected: FAIL on `pushReconnectIntent` (not exported). The two `storeToStateStream` cases may already pass — `state()` re-subscribes the store per warm cycle — that is fine; they are the residual's missing witness, not a bug fix.

- [ ] **Step 16: Add `pushReconnectIntent` to `bridge/out.ts`** — add `import { reconnect$ } from "@rtc/client-core";` after the rxjs import and append:

```ts
/** Push the user's reconnect intent into the RxJS core's module-level
 * `reconnect$`. Both web clients' `buildBrowserPorts` merge that Subject into
 * `connectionEvents` for EVERY core, so a native `commands.reconnect` has to
 * speak to it or be unobservable in the browser. It is a Subject, which is
 * why the call lives in the bridge; slice 8 moves the seam out of
 * `@rtc/client-core` and this becomes the core's own topic. */
export function pushReconnectIntent(): void {
  reconnect$.next({ type: "reconnect" });
}
```

- [ ] **Step 17: Run to verify they pass**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/bridge/out.test.ts`
Expected: PASS.

- [ ] **Step 18: Export the new primitives from `src/index.ts`** — the file becomes:

```ts
export { iterate, once, peek, relay, topicFromObservable } from "#/bridge/in";
export {
  pushReconnectIntent,
  storeToStateStream,
  topicToStream,
} from "#/bridge/out";
export {
  ASYNC_CORE_BRAND,
  asyncCore,
  composeMachinesWithBase,
  composeWithBase,
  createApp,
  createMachineFactories,
} from "#/composition";
export { AbortError } from "#/kernel/AbortError";
export { sleep } from "#/kernel/sleep";
export { spawn } from "#/kernel/spawn";
export { createStore, type Store } from "#/kernel/store";
export {
  createTopic,
  mapTopic,
  type Topic,
  type TopicOptions,
} from "#/kernel/topic";
export { untilAborted } from "#/kernel/untilAborted";
```

- [ ] **Step 19: Full package check**

```bash
pnpm --filter @rtc/client-core-async typecheck
pnpm --filter @rtc/client-core-async test:coverage
pnpm exec biome check packages/client-core-async
```

Expected: green; coverage ≥95% / branches ≥85%.

- [ ] **Step 20: Commit**

```bash
git add packages/client-core-async
git commit -m "feat(client-core-async): relay, peek, topicFromObservable, mapTopic, untilAborted — the hot-port primitives slice 1a's presenters are built from

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

---

### Task 3: Async core — the six native members

**Files:**
- Create: `packages/client-core-async/src/presenters/connection.ts`, `src/presenters/connection.test.ts`
- Create: `packages/client-core-async/src/presenters/preferences.ts`
- Create: `packages/client-core-async/src/presenters/themePreference.ts`, `src/presenters/themePreference.test.ts`
- Create: `packages/client-core-async/src/commands.ts`
- Modify: `packages/client-core-async/src/composition.ts`, `src/parity.json`, `src/parity.test.ts`, `src/index.ts`, `README.md`

**Interfaces:**
- Consumes (Task 2): `relay`, `peek`, `topicFromObservable`, `pushReconnectIntent`, `mapTopic`, `untilAborted`, `createTopic`, `topicToStream`.
- Consumes (`@rtc/core-api`, unchanged): `ConnectionStatusPresenter`, `ThemePreferencePresenter`, `ThemeSkinPreferencePresenter`, `ViewModePreferencePresenter`, `PowerSaverPresenter`, `AppCommands`, `AppPorts`, `ColorSchemeSource`.
- Produces: `createConnectionPresenter(events, initial?)`, `createThemeSkinPreferencePresenter(preferences)`, `createViewModePreferencePresenter(preferences)`, `createPowerSaverPresenter(preferences)`, `createThemePreferencePresenter(preferences, colorScheme?)`, `createCommands()`; `composeWithBase` overlays all five and `commands`.

- [ ] **Step 1: Write the failing connection test**

```ts
// packages/client-core-async/src/presenters/connection.test.ts
import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { type ConnectionEvent, ConnectionStatus } from "@rtc/domain";

import { createConnectionPresenter } from "#/presenters/connection";

describe("createConnectionPresenter (async)", () => {
  it("publishes every fold result, including one an ignored event leaves unchanged (scan parity with the RxJS core)", () => {
    const events = new Subject<ConnectionEvent>();
    const presenter = createConnectionPresenter({
      events: () => {
        return events;
      },
    });
    const seen: ConnectionStatus[] = [];
    const sub = presenter.status$.subscribe((s) => {
      seen.push(s);
    });
    events.next({ type: "gatewayConnected" });
    events.next({ type: "userActivity" });
    expect(seen).toEqual([
      ConnectionStatus.CONNECTING,
      ConnectionStatus.CONNECTED,
      ConnectionStatus.CONNECTED,
    ]);
    sub.unsubscribe();
    expect(events.observed).toBe(false);
  });

  it("surfaces a port error as a stream error", () => {
    const events = new Subject<ConnectionEvent>();
    const presenter = createConnectionPresenter({
      events: () => {
        return events;
      },
    });
    const errors: unknown[] = [];
    presenter.status$.subscribe({
      next: () => {},
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    events.error(new Error("socket"));
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(errors).toHaveLength(1);
        resolve();
      }, 0);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/presenters/connection.test.ts`
Expected: FAIL — cannot resolve `#/presenters/connection`.

- [ ] **Step 3: Write `presenters/connection.ts`**

```ts
// packages/client-core-async/src/presenters/connection.ts
import type { ConnectionStatusPresenter } from "@rtc/core-api";
import {
  type ConnectionEventsPort,
  ConnectionStatus,
  nextConnectionStatus,
} from "@rtc/domain";

import { relay } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { createTopic } from "#/kernel/topic";

/** `status$` is the fold of the connection-events port over
 * `nextConnectionStatus`, as a replay-1 refCounted Topic. The first
 * subscriber starts the fold, which publishes `initial` synchronously (the
 * RxJS core's `startWith`) and then one state per event — every event, as
 * `scan` does, even when the state did not change. The last unsubscribe
 * abandons the fold, so a fresh subscriber starts over from `initial`. The
 * fold state is a producer-local `let`: it can only ever belong to one warm
 * period. */
export function createConnectionPresenter(
  events: ConnectionEventsPort,
  initial: ConnectionStatus = ConnectionStatus.CONNECTING,
): ConnectionStatusPresenter {
  const status = createTopic<ConnectionStatus>(
    (signal, publish) => {
      let current = initial;
      publish(current);
      return relay(events.events(), signal, (event) => {
        current = nextConnectionStatus(current, event);
        publish(current);
      });
    },
    { replay: true },
  );

  return { status$: topicToStream(status) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/presenters/connection.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `presenters/preferences.ts`** (no dedicated unit test: every branch is exercised by the contract runner in Step 12)

```ts
// packages/client-core-async/src/presenters/preferences.ts
import type {
  PowerSaverPresenter,
  ThemeSkinPreferencePresenter,
  ViewModePreferencePresenter,
} from "@rtc/core-api";
import type { PreferencesPort } from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { mapTopic } from "#/kernel/topic";

/** Each replay-current preference stream is the port's own stream as a
 * Topic (`topicFromObservable`): subscribed on the first consumer, released
 * on the last, current value replayed synchronously — the RxJS core's
 * `shareReplay({ bufferSize: 1, refCount: true })` per member. The port is
 * called once, at construction, as the RxJS presenters do. */

export function createThemeSkinPreferencePresenter(
  preferences: PreferencesPort,
): ThemeSkinPreferencePresenter {
  return {
    skin$: topicToStream(topicFromObservable(preferences.themeSkin$())),
    setSkin: (skin) => {
      preferences.setThemeSkin(skin);
    },
  };
}

export function createViewModePreferencePresenter(
  preferences: PreferencesPort,
): ViewModePreferencePresenter {
  return {
    viewMode$: topicToStream(topicFromObservable(preferences.viewMode$())),
    setViewMode: (viewMode) => {
      preferences.setViewMode(viewMode);
    },
  };
}

/** `isCalm$` / `isFreeze$` are projections of ONE shared level topic, so
 * three warm consumers cost one port subscription, and — like the RxJS
 * `map` they replace — they re-publish an unchanged boolean when the level
 * changes underneath it (calm → freeze publishes `true` again). */
export function createPowerSaverPresenter(
  preferences: PreferencesPort,
): PowerSaverPresenter {
  const level = topicFromObservable(preferences.powerSaverLevel$());

  return {
    level$: topicToStream(level),
    isCalm$: topicToStream(
      mapTopic(level, (current) => {
        return current !== "off";
      }),
    ),
    isFreeze$: topicToStream(
      mapTopic(level, (current) => {
        return current === "freeze";
      }),
    ),
    setLevel: (next) => {
      preferences.setPowerSaverLevel(next);
    },
  };
}
```

- [ ] **Step 6: Write the failing theme-preference test**

```ts
// packages/client-core-async/src/presenters/themePreference.test.ts
import { BehaviorSubject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type PreferencesPort,
  PreferencesSimulator,
  type ThemeMode,
} from "@rtc/domain";

import { createThemePreferencePresenter } from "#/presenters/themePreference";

describe("createThemePreferencePresenter (async)", () => {
  it("without a colour-scheme source, 'system' resolves to light and mode$ still follows the preference", () => {
    const preferences = new PreferencesSimulator({ themeMode: "system" });
    const presenter = createThemePreferencePresenter(preferences);
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((m) => {
      seen.push(m);
    });
    expect(seen).toEqual(["light"]);
    presenter.setMode("dark");
    expect(seen).toEqual(["light", "dark"]);
    sub.unsubscribe();
  });

  it("re-resolves live when the OS scheme flips under 'system', and de-duplicates", () => {
    const prefersDark = new BehaviorSubject(true);
    const presenter = createThemePreferencePresenter(
      new PreferencesSimulator({ themeMode: "system" }),
      {
        prefersDark$: () => {
          return prefersDark;
        },
      },
    );
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((m) => {
      seen.push(m);
    });
    prefersDark.next(false);
    prefersDark.next(false);
    expect(seen).toEqual(["dark", "light"]);
    sub.unsubscribe();
    expect(prefersDark.observed).toBe(false);
  });

  it("fails mode$ when the preference stream fails", async () => {
    const presenter = createThemePreferencePresenter(
      createPortWithFailingThemeMode(),
    );
    const errors: unknown[] = [];
    presenter.mode$.subscribe({
      next: () => {},
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(errors).toHaveLength(1);
  });
});

/** A real simulator whose `themeMode$` errors on subscribe. A Proxy rather
 * than an object spread: TypeScript drops a class's methods from a spread
 * type, so `{ ...simulator, themeMode$ }` would not satisfy
 * `PreferencesPort`; the proxy keeps every other method — and its `this` —
 * intact. */
function createPortWithFailingThemeMode(): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (target, property, receiver) => {
      if (property === "themeMode$") {
        return () => {
          return throwError(() => {
            return new Error("storage");
          });
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/presenters/themePreference.test.ts`
Expected: FAIL — cannot resolve `#/presenters/themePreference`.

- [ ] **Step 8: Write `presenters/themePreference.ts`**

```ts
// packages/client-core-async/src/presenters/themePreference.ts
import type { ColorSchemeSource, ThemePreferencePresenter } from "@rtc/core-api";
import {
  DEFAULT_THEME_MODE_PREFERENCE,
  nextThemeModePreference,
  type PreferencesPort,
  resolveThemeMode,
  type ThemeMode,
  type ThemeModePreference,
} from "@rtc/domain";

import { peek, relay, topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { createTopic } from "#/kernel/topic";
import { untilAborted } from "#/kernel/untilAborted";

/** `modePreference$` mirrors the stored choice. `mode$` is the RxJS core's
 * `combineLatest([modePreference$, prefersDark$]) → map(resolveThemeMode) →
 * distinctUntilChanged`, written as ONE producer: the two inputs held in
 * locals, a resolve on every input, a publish only when the resolved mode
 * changed. No colour-scheme source means the OS never prefers dark — the
 * RxJS core's `of(false)` fallback, without a stream to subscribe. */
export function createThemePreferencePresenter(
  preferences: PreferencesPort,
  colorScheme?: ColorSchemeSource,
): ThemePreferencePresenter {
  const modePreference = topicFromObservable(preferences.themeMode$());

  const mode = createTopic<ThemeMode>(
    async (signal, publish) => {
      let preference: ThemeModePreference | null = null;
      let prefersDark: boolean | null = null;
      let published: ThemeMode | null = null;

      function resolve(): void {
        if (preference === null || prefersDark === null) {
          return;
        }

        const next = resolveThemeMode(preference, prefersDark);

        if (next !== published) {
          published = next;
          publish(next);
        }
      }

      let stop = (): void => {};
      const preferenceFailed = new Promise<never>((_, reject) => {
        stop = modePreference.subscribe((value) => {
          preference = value;
          resolve();
        }, reject);
      });

      try {
        if (colorScheme === undefined) {
          prefersDark = false;
          resolve();
          await Promise.race([preferenceFailed, untilAborted(signal)]);
        } else {
          await Promise.race([
            preferenceFailed,
            relay(colorScheme.prefersDark$(), signal, (value) => {
              prefersDark = value;
              resolve();
            }),
          ]);
        }
      } finally {
        stop();
      }
    },
    { replay: true },
  );

  return {
    modePreference$: topicToStream(modePreference),
    mode$: topicToStream(mode),
    setMode: (next) => {
      preferences.setThemeMode(next);
    },
    /** Advance from the TRUE stored value, read synchronously from the port
     * (`peek`), never from a caller's captured value — rapid successive
     * clicks each advance from the real state. */
    cycle: () => {
      preferences.setThemeMode(
        nextThemeModePreference(
          peek(preferences.themeMode$(), DEFAULT_THEME_MODE_PREFERENCE),
        ),
      );
    },
  };
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/presenters/themePreference.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 10: Write `commands.ts`**

```ts
// packages/client-core-async/src/commands.ts
import type { AppCommands } from "@rtc/core-api";

import { pushReconnectIntent } from "#/bridge/out";

/** The app's imperative commands, owned by this core. `reconnect` still
 * lands on the RxJS core's `reconnect$` seam (see `pushReconnectIntent`) —
 * native in provenance, shared in transport until slice 8. */
export function createCommands(): AppCommands {
  return {
    reconnect: () => {
      pushReconnectIntent();
    },
  };
}
```

- [ ] **Step 11: Fill the overlay in `composition.ts`** — replace `nativePresenters` and `composeWithBase` (everything from the `/** Members this core implements natively…` comment through the end of `composeWithBase`) with:

```ts
/** Members this core implements natively — slice 1a: the connection fold,
 * the four theme/view/power-saver preferences, and `commands` (see
 * `createCommands`). Everything else still delegates to the RxJS core.
 * `parity.json` is the committed record of the same fact and
 * `parity.test.ts` proves the two agree by reference. */
function nativePresenters(ports: AppPorts): Partial<Presenters> {
  return {
    connection: createConnectionPresenter(ports.connectionEvents),
    themePreference: createThemePreferencePresenter(
      ports.preferences,
      ports.colorScheme,
    ),
    themeSkinPreference: createThemeSkinPreferencePresenter(ports.preferences),
    viewModePreference: createViewModePreferencePresenter(ports.preferences),
    powerSaver: createPowerSaverPresenter(ports.preferences),
  };
}

export function composeWithBase(ports: AppPorts): ComposedApp {
  const base = createRxjsApp(ports);
  const app: App = {
    ...base,
    presenters: { ...base.presenters, ...nativePresenters(ports) },
    commands: createCommands(),
    // Every native member so far is a refCounted Topic: it holds nothing
    // between subscribers, so there is nothing app-scoped to abort. A member
    // that spawns an app-lifetime loop (slice 2's conflation is the first
    // candidate) must take an `AbortSignal` minted here and aborted below,
    // BEFORE the base app is disposed — its loops may still be draining
    // streams the base owns.
    dispose: async () => {
      await base.dispose();
    },
  };
  return { base, app };
}
```

Add the imports at the top of `composition.ts`:

```ts
import { createCommands } from "#/commands";
import { createConnectionPresenter } from "#/presenters/connection";
import {
  createPowerSaverPresenter,
  createThemeSkinPreferencePresenter,
  createViewModePreferencePresenter,
} from "#/presenters/preferences";
import { createThemePreferencePresenter } from "#/presenters/themePreference";
```

Note: the RxJS base app still builds its own `ConnectionStatusPresenter` etc.; the base's other members (e.g. `animationDirector`, which consumes the connection presenter) keep using the base instances. That is the strangler's accepted shape — a delegated member's internal dependencies are delegated with it — and it is why the overlay takes `ports`, not `base.presenters`.

- [ ] **Step 12: Update `parity.json`** — set these five to `"native"`: `connection`, `themePreference`, `themeSkinPreference`, `powerSaver`, `viewModePreference` (leave every other presenter and every machine `"delegated"`), and add a third section after `"machines"`:

```json
  "commands": {
    "reconnect": "native"
  }
```

- [ ] **Step 13: Rewrite `parity.test.ts`** — the manifest now covers `commands`, and the app is built in `beforeAll` and disposed in `afterAll` (slice-0 residual):

```ts
// packages/client-core-async/src/parity.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
  reconnect$,
} from "@rtc/client-core";
import { CONTRACT_SUITES, type ContractMember } from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import {
  type ComposedApp,
  type ComposedMachines,
  composeMachinesWithBase,
  composeWithBase,
} from "#/composition";
import parity from "#/parity.json" with { type: "json" };

type Provenance = "native" | "delegated";

describe("parity manifest", () => {
  let composed: ComposedApp;
  let composedMachines: ComposedMachines;

  beforeAll(() => {
    composed = composeWithBase({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({ demo: "demo" }),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: {
        events: () => {
          return reconnect$;
        },
      },
    });
    composedMachines = composeMachinesWithBase(composed.app.presenters);
  });

  afterAll(async () => {
    await composed.app.dispose();
  });

  it("lists every contract member exactly once", () => {
    const listed = [
      ...Object.keys(parity.presenters).map((k) => {
        return `presenters.${k}`;
      }),
      ...Object.keys(parity.machines).map((k) => {
        return `machines.${k}`;
      }),
      ...Object.keys(parity.commands).map((k) => {
        return `commands.${k}`;
      }),
    ].sort();

    const members = (Object.keys(CONTRACT_SUITES) as ContractMember[]).sort();
    expect(listed).toEqual(members);
  });

  it("matches reality: native members differ from the RxJS instance, delegated ones are it", () => {
    const { base, app } = composed;
    const { base: baseMachines, machines } = composedMachines;

    for (const [member, provenance] of Object.entries(parity.presenters) as [
      keyof typeof base.presenters,
      Provenance,
    ][]) {
      const same = Object.is(app.presenters[member], base.presenters[member]);
      expect(same, `presenters.${member} is marked ${provenance}`).toBe(
        provenance === "delegated",
      );
    }

    for (const [member, provenance] of Object.entries(parity.machines) as [
      keyof typeof machines,
      Provenance,
    ][]) {
      const same = Object.is(machines[member], baseMachines[member]);
      expect(same, `machines.${member} is marked ${provenance}`).toBe(
        provenance === "delegated",
      );
    }

    for (const [member, provenance] of Object.entries(parity.commands) as [
      keyof typeof base.commands,
      Provenance,
    ][]) {
      const same = Object.is(app.commands[member], base.commands[member]);
      expect(same, `commands.${member} is marked ${provenance}`).toBe(
        provenance === "delegated",
      );
    }
  });
});
```

- [ ] **Step 14: Export the presenter factories from `src/index.ts`** — add after the `#/composition` export block:

```ts
export { createCommands } from "#/commands";
export { createConnectionPresenter } from "#/presenters/connection";
export {
  createPowerSaverPresenter,
  createThemeSkinPreferencePresenter,
  createViewModePreferencePresenter,
} from "#/presenters/preferences";
export { createThemePreferencePresenter } from "#/presenters/themePreference";
```

- [ ] **Step 15: Run the whole package — the contract runner is the witness**

```bash
pnpm --filter @rtc/client-core-async typecheck
pnpm --filter @rtc/client-core-async test:coverage
pnpm exec biome check packages/client-core-async
```

Expected: `coreContract.test.ts` green under the `async` label with every slice-1a suite now exercising native code; `parity.test.ts` green; coverage ≥95% / branches ≥85%. If a contract case fails, the defect is in this core, not in the suite: Task 1 proved the suite on RxJS.

- [ ] **Step 16: Update `README.md`'s "Parity" section** — replace the paragraph beginning `In this slice every member **delegates**` with:

```
As of slice 1a, six members are **native** — `connection`, `themePreference`,
`themeSkinPreference`, `viewModePreference`, `powerSaver` and
`commands.reconnect` — and everything else still **delegates** to
`@rtc/client-core` (the strangler seam): `composeWithBase` builds the RxJS
app and overlays what this core implements. The native idiom for a
replay-current stream is `topicFromObservable` (a port as a replay-1,
refCounted `Topic` whose producer is one synchronous `relay`), `mapTopic`
for a projection of it, and a hand-written `createTopic` producer where two
inputs combine (`mode$`). `src/parity.json` is the committed record of the
split and `src/parity.test.ts` proves manifest and reality agree by
reference identity — for presenters, machines and commands alike.
```

- [ ] **Step 17: Commit**

```bash
git add packages/client-core-async
git commit -m "feat(client-core-async): connection, theme, skin, view-mode, power-saver and reconnect go native (slice 1a)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

---

### Task 4: Effect core — `peek`, `sharedFold`, `pushReconnectIntent`

**Files:**
- Modify: `packages/client-core-effect/src/bridge/in.ts` (+ `peek`), `src/bridge/in.test.ts`
- Modify: `packages/client-core-effect/src/bridge/out.ts` (+ `sharedFold`, `FoldUpdate`, `SharedFold`, `pushReconnectIntent`), `src/bridge/out.test.ts`
- Modify: `packages/client-core-effect/src/index.ts` (+ `EffectHost`, new exports)

**Interfaces:**
- Consumes: `EffectHost`, `refToStateStream`, `streamToStream`, `fromObservable` (slice 0, unchanged); `reconnect$` from `@rtc/client-core`.
- Produces (Task 5 relies on these exact signatures):
  - `peek<T>(source: Observable<T>, fallback: T): T`
  - `type FoldUpdate<S> = (next: (current: S) => S) => Effect.Effect<void>`
  - `interface SharedFold<S> { readonly seed: () => S; readonly run: (update: FoldUpdate<S>) => Effect.Effect<void, unknown> }`
  - `sharedFold<S>(host: EffectHost, fold: SharedFold<S>): Stream<S>` (core-api `Stream`)
  - `pushReconnectIntent(): void`

- [ ] **Step 1: Write the failing `peek` tests** — append to `packages/client-core-effect/src/bridge/in.test.ts`:

```ts
describe("peek", () => {
  it("reads a replay-current source synchronously and leaves nothing warm", () => {
    const source = new BehaviorSubject("a");
    expect(peek(source, "z")).toBe("a");
    expect(source.observed).toBe(false);
  });

  it("returns the fallback for a source that does not emit on subscribe", () => {
    expect(peek(new Subject<string>(), "z")).toBe("z");
  });
});
```

Extend the imports: `BehaviorSubject`, `Subject` from `rxjs` (add to whatever the file imports) and `peek` from `#/bridge/in`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/bridge/in.test.ts`
Expected: FAIL — `peek` not exported.

- [ ] **Step 3: Add `peek` to `bridge/in.ts`** — change the rxjs import to `import { type Observable, type Subscription, take } from "rxjs";` and append:

```ts
/** The current value of a replay-current Observable, read synchronously —
 * the seed a `sharedFold` starts a warm period from, and what `cycle()`
 * advances from. A source that does not emit during `subscribe` yields
 * `fallback`; the subscription is released before this returns. */
export function peek<T>(source: Observable<T>, fallback: T): T {
  let value = fallback;
  source
    .pipe(take(1))
    .subscribe((current) => {
      value = current;
    })
    .unsubscribe();
  return value;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/bridge/in.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing `sharedFold` and `pushReconnectIntent` tests** — append inside `describe("bridge/out", …)` in `packages/client-core-effect/src/bridge/out.test.ts` (the file's existing `useHost`, `tick`, `createHost` helpers are reused):

```ts
  it("sharedFold() hands the seed to the first subscriber synchronously", () => {
    const stream = sharedFold(useHost(), {
      seed: () => {
        return 1;
      },
      run: () => {
        return Effect.never;
      },
    });
    const seen: number[] = [];
    const sub = stream.subscribe((v: number) => {
      seen.push(v);
    });
    expect(seen).toEqual([1]);
    sub.unsubscribe();
  });

  it("sharedFold() starts the producer on the first subscriber and interrupts it on the last", async () => {
    let interrupted = false;
    let starts = 0;
    const stream = sharedFold(useHost(), {
      seed: () => {
        return 0;
      },
      run: () => {
        starts += 1;
        return Effect.never.pipe(
          Effect.onInterrupt(() => {
            return Effect.sync(() => {
              interrupted = true;
            });
          }),
        );
      },
    });
    const a = stream.subscribe(() => {});
    const b = stream.subscribe(() => {});
    await tick();
    expect(starts).toBe(1);
    a.unsubscribe();
    await tick();
    expect(interrupted).toBe(false);
    b.unsubscribe();
    await tick();
    expect(interrupted).toBe(true);
  });

  it("sharedFold() delivers updates and de-duplicates Object.is-equal ones", async () => {
    let write: FoldUpdate<number> | null = null;
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        return 1;
      },
      run: (update) => {
        write = update;
        return Effect.never;
      },
    });
    const seen: number[] = [];
    const sub = stream.subscribe((v: number) => {
      seen.push(v);
    });
    await tick();
    const update = write as FoldUpdate<number> | null;
    expect(update).not.toBeNull();
    await host.runtime.runPromise(
      (update as FoldUpdate<number>)(() => {
        return 1;
      }),
    );
    await host.runtime.runPromise(
      (update as FoldUpdate<number>)((current) => {
        return current + 1;
      }),
    );
    await tick();
    expect(seen).toEqual([1, 2]);
    sub.unsubscribe();
  });

  it("sharedFold() re-seeds on every cold → warm cycle and ignores a stale producer's writes", async () => {
    const writes: FoldUpdate<number>[] = [];
    let seeds = 0;
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        seeds += 1;
        return seeds * 10;
      },
      run: (update) => {
        writes.push(update);
        return Effect.never;
      },
    });
    const first: number[] = [];
    const firstSub = stream.subscribe((v: number) => {
      first.push(v);
    });
    await tick();
    firstSub.unsubscribe();
    await tick();
    const second: number[] = [];
    const secondSub = stream.subscribe((v: number) => {
      second.push(v);
    });
    await tick();
    expect(first).toEqual([10]);
    expect(second).toEqual([20]);
    expect(writes).toHaveLength(2);
    // The FIRST warm period's producer writing after its period ended.
    await host.runtime.runPromise(
      (writes[0] as FoldUpdate<number>)(() => {
        return 99;
      }),
    );
    await host.runtime.runPromise(
      (writes[1] as FoldUpdate<number>)(() => {
        return 21;
      }),
    );
    await tick();
    expect(second).toEqual([20, 21]);
    secondSub.unsubscribe();
  });

  it("sharedFold() surfaces a producer failure as an Observable error", async () => {
    const boom = new Error("boom");
    const stream = sharedFold(useHost(), {
      seed: () => {
        return 0;
      },
      run: () => {
        return Effect.fail(boom);
      },
    });
    const failure = await new Promise<unknown>((resolve) => {
      stream.subscribe({
        error: resolve,
      });
    });
    expect(failure).toBe(boom);
  });

  it("sharedFold() producers are interrupted when the host scope closes", async () => {
    const host = createHost();
    let interrupted = false;
    const stream = sharedFold(host, {
      seed: () => {
        return 0;
      },
      run: () => {
        return Effect.never.pipe(
          Effect.onInterrupt(() => {
            return Effect.sync(() => {
              interrupted = true;
            });
          }),
        );
      },
    });
    stream.subscribe(() => {});
    await tick();
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(interrupted).toBe(true);
    await host.runtime.dispose();
  });

  it("pushReconnectIntent() lands a 'reconnect' event on the RxJS core's reconnect$ seam", () => {
    const seen: unknown[] = [];
    const sub = reconnect$.subscribe((e) => {
      seen.push(e);
    });
    pushReconnectIntent();
    expect(seen).toEqual([{ type: "reconnect" }]);
    sub.unsubscribe();
  });
```

Extend the imports: `import { reconnect$ } from "@rtc/client-core";` and `import { type EffectHost, type FoldUpdate, pushReconnectIntent, refToStateStream, sharedFold, streamToStream } from "#/bridge/out";`.

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/bridge/out.test.ts`
Expected: FAIL — `sharedFold`, `FoldUpdate`, `pushReconnectIntent` not exported.

- [ ] **Step 7: Add `sharedFold` and `pushReconnectIntent` to `bridge/out.ts`** — change the effect import to `import { Cause, Effect, ExecutionStrategy, Exit, Fiber, type ManagedRuntime, Scope, Stream, SubscriptionRef } from "effect";`, the rxjs import to `import { filter, Observable, type Subscriber } from "rxjs";`, add `import { reconnect$ } from "@rtc/client-core";`, and append:

```ts
/** How a `sharedFold` producer writes its state: apply `next` to the
 * current value and publish the result only if it is not `Object.is`-equal
 * to the current one, and only while the warm period that forked this
 * producer is still the current one. Two facts make both guards necessary:
 * a `SubscriptionRef` re-publishes an equal `set` (measured on 3.22.2),
 * which would hand every subscriber the seed twice; and a scope closes on a
 * fiber, so a producer can outlive its period by a tick. A consequence a
 * caller must know: an Effect-core fold CONFLATES equal consecutive states
 * (the RxJS core's `scan`/`map` do not). */
export type FoldUpdate<S> = (next: (current: S) => S) => Effect.Effect<void>;

export interface SharedFold<S> {
  /** The value a warm period starts from — read on EVERY first subscribe, so
   * a port mirror seeds from the port's current value (`peek`) and a pure
   * fold from its constant initial. */
  readonly seed: () => S;
  /** The producer: runs for the whole warm period, writing through
   * `update`; interrupted when the last subscriber leaves. Its failure is
   * fanned out to every subscriber as an Observable error. */
  readonly run: (update: FoldUpdate<S>) => Effect.Effect<void, unknown>;
}

/** `shareReplay({ bufferSize: 1, refCount: true })` restated over a
 * `SubscriptionRef` and a `Scope`. The FIRST subscriber seeds the ref and
 * forks `run` into a scope of its own — a child of the app's, so
 * `dispose()` still ends it; every subscriber reads the ref's current value
 * synchronously (`refToStateStream`: the warmth guarantee) and then follows
 * `ref.changes` on the scheduler; the LAST unsubscribe closes the scope,
 * interrupting the producer. `Stream.share` cannot be this envelope: it
 * replays to a new subscriber on a fiber, never in the caller's tick. */
export function sharedFold<S>(
  host: EffectHost,
  fold: SharedFold<S>,
): CoreStream<S> {
  const ref = host.runtime.runSync(SubscriptionRef.make(fold.seed()));
  const changes = refToStateStream(host, ref);
  const subscribers = new Set<Subscriber<S>>();
  let warm: WarmPeriod | null = null;
  let generation = 0;

  function failEverySubscriber(cause: Cause.Cause<unknown>): void {
    if (Cause.isInterruptedOnly(cause)) {
      return;
    }

    for (const subscriber of [...subscribers]) {
      subscriber.error(Cause.squash(cause));
    }
  }

  function startWarmPeriod(): WarmPeriod {
    generation += 1;
    const mine = generation;
    const scope = host.runtime.runSync(
      Scope.fork(host.scope, ExecutionStrategy.sequential),
    );
    host.runtime.runSync(SubscriptionRef.set(ref, fold.seed()));

    const update: FoldUpdate<S> = (next) => {
      return Effect.suspend(() => {
        if (mine !== generation) {
          return Effect.void;
        }

        return SubscriptionRef.get(ref).pipe(
          Effect.flatMap((current) => {
            const value = next(current);
            return Object.is(value, current)
              ? Effect.void
              : SubscriptionRef.set(ref, value);
          }),
        );
      });
    };

    host.runtime.runFork(
      fold.run(update).pipe(
        Effect.catchAllCause((cause) => {
          return Effect.sync(() => {
            failEverySubscriber(cause);
          });
        }),
      ),
      { scope },
    );

    return { scope, subscribers: 0 };
  }

  return new Observable<S>((subscriber) => {
    if (warm === null) {
      warm = startWarmPeriod();
    }

    const period = warm;
    period.subscribers += 1;
    subscribers.add(subscriber);
    const inner = changes.subscribe(subscriber);

    return () => {
      inner.unsubscribe();
      subscribers.delete(subscriber);
      period.subscribers -= 1;

      if (period.subscribers === 0 && warm === period) {
        warm = null;
        // The global runtime, as in `streamToStream`: this must still work
        // after `host.runtime` has been disposed.
        Effect.runFork(Scope.close(period.scope, Exit.void));
      }
    };
  });
}

interface WarmPeriod {
  scope: Scope.CloseableScope;
  subscribers: number;
}

/** Push the user's reconnect intent into the RxJS core's module-level
 * `reconnect$`. Both web clients' `buildBrowserPorts` merge that Subject into
 * `connectionEvents` for EVERY core, so a native `commands.reconnect` has to
 * speak to it or be unobservable in the browser. It is a Subject, which is
 * why the call lives in the bridge; slice 8 moves the seam out of
 * `@rtc/client-core`. */
export function pushReconnectIntent(): void {
  reconnect$.next({ type: "reconnect" });
}
```

Order in the file: the repo's `rtc/newspaper-order` lint wants callers above callees and types near their first use — if it complains about `WarmPeriod` sitting below `sharedFold`, move the interface directly above the function.

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/bridge/out.test.ts`
Expected: PASS. If "re-seeds on every cold → warm cycle" sees `[20, 99, 21]` instead of `[20, 21]`, the generation guard is not closing over `mine` correctly — fix the closure, do not loosen the test.

- [ ] **Step 9: Export from `src/index.ts`** — the file becomes:

```ts
export { fromObservable, peek, rpc } from "#/bridge/in";
export {
  type EffectHost,
  type FoldUpdate,
  pushReconnectIntent,
  refToStateStream,
  type SharedFold,
  sharedFold,
  streamToStream,
} from "#/bridge/out";
export {
  composeMachinesWithBase,
  composeWithBase,
  createApp,
  createMachineFactories,
  effectCore,
} from "#/composition";
```

(`EffectHost` on the index closes a slice-0 residual.)

- [ ] **Step 10: Full package check**

```bash
pnpm --filter @rtc/client-core-effect typecheck
pnpm --filter @rtc/client-core-effect test:coverage
pnpm exec biome check packages/client-core-effect
```

Expected: green; coverage ≥95% / branches ≥85%.

- [ ] **Step 11: Commit**

```bash
git add packages/client-core-effect
git commit -m "feat(client-core-effect): sharedFold — a synchronously seeded, refCounted SubscriptionRef fold; peek; pushReconnectIntent

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

---

### Task 5: Effect core — the six native members

**Files:**
- Create: `packages/client-core-effect/src/presenters/mirrorPort.ts`
- Create: `packages/client-core-effect/src/presenters/connection.ts`, `src/presenters/connection.test.ts`
- Create: `packages/client-core-effect/src/presenters/preferences.ts`
- Create: `packages/client-core-effect/src/presenters/themePreference.ts`, `src/presenters/themePreference.test.ts`
- Create: `packages/client-core-effect/src/commands.ts`
- Modify: `packages/client-core-effect/src/composition.ts`, `src/parity.json`, `src/parity.test.ts`, `src/index.ts`, `README.md`

**Interfaces:**
- Consumes (Task 4): `peek`, `sharedFold`, `FoldUpdate`, `pushReconnectIntent`, `EffectHost`, `fromObservable`.
- Produces: `mirrorPort(host, source, fallback, project)`, `createConnectionPresenter(host, events, initial?)`, `createThemeSkinPreferencePresenter(host, preferences)`, `createViewModePreferencePresenter(host, preferences)`, `createPowerSaverPresenter(host, preferences)`, `createThemePreferencePresenter(host, preferences, colorScheme?)`, `createCommands()`.

- [ ] **Step 1: Write `presenters/mirrorPort.ts`**

```ts
// packages/client-core-effect/src/presenters/mirrorPort.ts
import { Stream } from "effect";

import type { Stream as CoreStream } from "@rtc/core-api";

import { fromObservable, peek } from "#/bridge/in";
import { type EffectHost, sharedFold } from "#/bridge/out";

/** A replay-current port stream, projected, as a `sharedFold`: each warm
 * period seeds from the port's current value (read synchronously) and then
 * follows the port on a fiber. The RxJS core's
 * `port$().pipe(map(project), shareReplay({ bufferSize: 1, refCount: true }))`
 * — with the Effect fold's one documented difference: equal consecutive
 * projections are conflated. */
export function mirrorPort<T, U>(
  host: EffectHost,
  source: CoreStream<T>,
  fallback: T,
  project: (value: T) => U,
): CoreStream<U> {
  return sharedFold(host, {
    seed: () => {
      return project(peek(source, fallback));
    },
    run: (update) => {
      return fromObservable(source).pipe(
        Stream.runForEach((value) => {
          return update(() => {
            return project(value);
          });
        }),
      );
    },
  });
}
```

- [ ] **Step 2: Write the failing connection test**

```ts
// packages/client-core-effect/src/presenters/connection.test.ts
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import { type ConnectionEvent, ConnectionStatus } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createConnectionPresenter } from "#/presenters/connection";

describe("createConnectionPresenter (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("folds events on a fiber and conflates a state an ignored event leaves unchanged", async () => {
    const events = new Subject<ConnectionEvent>();
    const presenter = createConnectionPresenter(useHost(), {
      events: () => {
        return events;
      },
    });
    const seen: ConnectionStatus[] = [];
    const sub = presenter.status$.subscribe((s) => {
      seen.push(s);
    });
    expect(seen).toEqual([ConnectionStatus.CONNECTING]);
    await tick();
    events.next({ type: "gatewayConnected" });
    events.next({ type: "userActivity" });
    await tick();
    await tick();
    // The RxJS core would re-emit CONNECTED for the ignored event; the
    // SubscriptionRef fold does not — the difference §22 records.
    expect(seen).toEqual([
      ConnectionStatus.CONNECTING,
      ConnectionStatus.CONNECTED,
    ]);
    sub.unsubscribe();
    await tick();
    expect(events.observed).toBe(false);
  });

  it("surfaces a port error as a stream error", async () => {
    const events = new Subject<ConnectionEvent>();
    const presenter = createConnectionPresenter(useHost(), {
      events: () => {
        return events;
      },
    });
    const boom = new Error("socket");
    const failure = new Promise<unknown>((resolve) => {
      presenter.status$.subscribe({ error: resolve });
    });
    await tick();
    events.error(boom);
    expect(await failure).toBe(boom);
  });

  const hosts: EffectHost[] = [];

  function useHost(): EffectHost {
    const host: EffectHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/presenters/connection.test.ts`
Expected: FAIL — cannot resolve `#/presenters/connection`.

- [ ] **Step 4: Write `presenters/connection.ts`**

```ts
// packages/client-core-effect/src/presenters/connection.ts
import { Stream } from "effect";

import type { ConnectionStatusPresenter } from "@rtc/core-api";
import {
  type ConnectionEventsPort,
  ConnectionStatus,
  nextConnectionStatus,
} from "@rtc/domain";

import { fromObservable } from "#/bridge/in";
import { type EffectHost, sharedFold } from "#/bridge/out";

/** `status$` is the fold of the connection-events port over
 * `nextConnectionStatus` as a `sharedFold`: seeded with `initial` on every
 * first subscribe (the RxJS core's `startWith`, and what makes a fresh
 * subscriber after teardown start over), driven by a fiber that runs the
 * port through `Stream.runForEach` for the whole warm period. */
export function createConnectionPresenter(
  host: EffectHost,
  events: ConnectionEventsPort,
  initial: ConnectionStatus = ConnectionStatus.CONNECTING,
): ConnectionStatusPresenter {
  return {
    status$: sharedFold(host, {
      seed: () => {
        return initial;
      },
      run: (update) => {
        return fromObservable(events.events()).pipe(
          Stream.runForEach((event) => {
            return update((current) => {
              return nextConnectionStatus(current, event);
            });
          }),
        );
      },
    }),
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/presenters/connection.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Write `presenters/preferences.ts`**

```ts
// packages/client-core-effect/src/presenters/preferences.ts
import type {
  PowerSaverPresenter,
  ThemeSkinPreferencePresenter,
  ViewModePreferencePresenter,
} from "@rtc/core-api";
import {
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type PreferencesPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { mirrorPort } from "#/presenters/mirrorPort";

/** Each replay-current preference stream is a `mirrorPort` of the port's
 * own stream (called once, at construction, as the RxJS presenters do). The
 * `fallback` is only ever read if the port fails to emit on subscribe — a
 * `PreferencesPort` promises it does. */

export function createThemeSkinPreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): ThemeSkinPreferencePresenter {
  return {
    skin$: mirrorPort(host, preferences.themeSkin$(), DEFAULT_THEME_SKIN, (s) => {
      return s;
    }),
    setSkin: (skin) => {
      preferences.setThemeSkin(skin);
    },
  };
}

export function createViewModePreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): ViewModePreferencePresenter {
  return {
    viewMode$: mirrorPort(
      host,
      preferences.viewMode$(),
      DEFAULT_VIEW_MODE,
      (v) => {
        return v;
      },
    ),
    setViewMode: (viewMode) => {
      preferences.setViewMode(viewMode);
    },
  };
}

/** Three mirrors of the same port stream, one per projection. Each warm
 * mirror is its own port subscription (the RxJS core derives `isCalm$` from
 * a shared `level$` instead) — three cheap BehaviorSubject subscriptions,
 * traded for three independent refCounts. */
export function createPowerSaverPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): PowerSaverPresenter {
  const level = preferences.powerSaverLevel$();

  return {
    level$: mirrorPort(host, level, DEFAULT_POWER_SAVER_LEVEL, (l) => {
      return l;
    }),
    isCalm$: mirrorPort(host, level, DEFAULT_POWER_SAVER_LEVEL, (l) => {
      return l !== "off";
    }),
    isFreeze$: mirrorPort(host, level, DEFAULT_POWER_SAVER_LEVEL, (l) => {
      return l === "freeze";
    }),
    setLevel: (next) => {
      preferences.setPowerSaverLevel(next);
    },
  };
}
```

- [ ] **Step 7: Write the failing theme-preference test**

```ts
// packages/client-core-effect/src/presenters/themePreference.test.ts
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import { PreferencesSimulator, type ThemeMode } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createThemePreferencePresenter } from "#/presenters/themePreference";

describe("createThemePreferencePresenter (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("without a colour-scheme source, 'system' resolves to light and mode$ still follows the preference", async () => {
    const preferences = new PreferencesSimulator({ themeMode: "system" });
    const presenter = createThemePreferencePresenter(useHost(), preferences);
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((m) => {
      seen.push(m);
    });
    expect(seen).toEqual(["light"]);
    await tick();
    presenter.setMode("dark");
    await tick();
    await tick();
    expect(seen).toEqual(["light", "dark"]);
    sub.unsubscribe();
  });

  it("re-resolves live when the OS scheme flips under 'system', and de-duplicates", async () => {
    const prefersDark = new BehaviorSubject(true);
    const presenter = createThemePreferencePresenter(
      useHost(),
      new PreferencesSimulator({ themeMode: "system" }),
      {
        prefersDark$: () => {
          return prefersDark;
        },
      },
    );
    const seen: ThemeMode[] = [];
    const sub = presenter.mode$.subscribe((m) => {
      seen.push(m);
    });
    expect(seen).toEqual(["dark"]);
    await tick();
    prefersDark.next(false);
    prefersDark.next(false);
    await tick();
    await tick();
    expect(seen).toEqual(["dark", "light"]);
    sub.unsubscribe();
    await tick();
    expect(prefersDark.observed).toBe(false);
  });

  it("cycle() advances from the stored value three times in a row", async () => {
    const preferences = new PreferencesSimulator({ themeMode: "light" });
    const presenter = createThemePreferencePresenter(useHost(), preferences);
    presenter.cycle();
    presenter.cycle();
    presenter.cycle();
    const seen: string[] = [];
    presenter.modePreference$
      .subscribe((p) => {
        seen.push(p);
      })
      .unsubscribe();
    expect(seen).toEqual(["light"]);
  });

  const hosts: EffectHost[] = [];

  function useHost(): EffectHost {
    const host: EffectHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
```

(The third case: light → system → dark → light, so the stored value is back to `"light"` — three synchronous `peek`-based advances, witnessed through a synchronous seed read.)

- [ ] **Step 8: Run to verify it fails**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/presenters/themePreference.test.ts`
Expected: FAIL — cannot resolve `#/presenters/themePreference`.

- [ ] **Step 9: Write `presenters/themePreference.ts`**

```ts
// packages/client-core-effect/src/presenters/themePreference.ts
import { Stream } from "effect";

import type { ColorSchemeSource, ThemePreferencePresenter } from "@rtc/core-api";
import {
  DEFAULT_THEME_MODE_PREFERENCE,
  nextThemeModePreference,
  type PreferencesPort,
  resolveThemeMode,
} from "@rtc/domain";

import { fromObservable, peek } from "#/bridge/in";
import { type EffectHost, sharedFold } from "#/bridge/out";
import { mirrorPort } from "#/presenters/mirrorPort";

/** `modePreference$` mirrors the stored choice. `mode$` is the RxJS core's
 * `combineLatest → map(resolveThemeMode) → distinctUntilChanged` as
 * `Stream.zipLatest` into a `sharedFold` — the fold's own `Object.is` guard
 * is the de-duplication. No colour-scheme source means the OS never prefers
 * dark: `Stream.make(false)` emits once and ends, and `zipLatest` keeps
 * following the live side after a finite side ends (measured on 3.22.2). */
export function createThemePreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
  colorScheme?: ColorSchemeSource,
): ThemePreferencePresenter {
  const modePreference = preferences.themeMode$();
  const prefersDark =
    colorScheme === undefined ? undefined : colorScheme.prefersDark$();

  function prefersDarkNow(): boolean {
    return prefersDark === undefined ? false : peek(prefersDark, false);
  }

  const prefersDarkStream: Stream.Stream<boolean, unknown> =
    prefersDark === undefined ? Stream.make(false) : fromObservable(prefersDark);

  return {
    modePreference$: mirrorPort(
      host,
      modePreference,
      DEFAULT_THEME_MODE_PREFERENCE,
      (p) => {
        return p;
      },
    ),
    mode$: sharedFold(host, {
      seed: () => {
        return resolveThemeMode(
          peek(modePreference, DEFAULT_THEME_MODE_PREFERENCE),
          prefersDarkNow(),
        );
      },
      run: (update) => {
        return Stream.zipLatest(
          fromObservable(modePreference),
          prefersDarkStream,
        ).pipe(
          Stream.runForEach(([preference, dark]) => {
            return update(() => {
              return resolveThemeMode(preference, dark);
            });
          }),
        );
      },
    }),
    setMode: (next) => {
      preferences.setThemeMode(next);
    },
    /** Advance from the TRUE stored value, read synchronously from the port
     * (`peek`), never from a caller's captured value. */
    cycle: () => {
      preferences.setThemeMode(
        nextThemeModePreference(
          peek(modePreference, DEFAULT_THEME_MODE_PREFERENCE),
        ),
      );
    },
  };
}
```

- [ ] **Step 10: Run to verify it passes**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/presenters/themePreference.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 11: Write `commands.ts`**

```ts
// packages/client-core-effect/src/commands.ts
import type { AppCommands } from "@rtc/core-api";

import { pushReconnectIntent } from "#/bridge/out";

/** The app's imperative commands, owned by this core. `reconnect` still
 * lands on the RxJS core's `reconnect$` seam (see `pushReconnectIntent`) —
 * native in provenance, shared in transport until slice 8. */
export function createCommands(): AppCommands {
  return {
    reconnect: () => {
      pushReconnectIntent();
    },
  };
}
```

- [ ] **Step 12: Fill the overlay in `composition.ts`** — replace `nativePresenters` (the doc comment and function) with:

```ts
/** Members this core implements natively — slice 1a: the connection fold,
 * the four theme/view/power-saver preferences, and `commands` (see
 * `createCommands`). Everything else still delegates to the RxJS core.
 * `parity.json` is the committed record of the same fact and
 * `parity.test.ts` proves the two agree by reference. Every native stream
 * is a `sharedFold` over `host`, so `app.dispose()` (which closes
 * `host.scope`) ends whatever is still warm. */
function nativePresenters(
  ports: AppPorts,
  host: EffectHost,
): Partial<Presenters> {
  return {
    connection: createConnectionPresenter(host, ports.connectionEvents),
    themePreference: createThemePreferencePresenter(
      host,
      ports.preferences,
      ports.colorScheme,
    ),
    themeSkinPreference: createThemeSkinPreferencePresenter(
      host,
      ports.preferences,
    ),
    viewModePreference: createViewModePreferencePresenter(
      host,
      ports.preferences,
    ),
    powerSaver: createPowerSaverPresenter(host, ports.preferences),
  };
}
```

and, inside `composeWithBase`, change the `app` literal's first lines to:

```ts
  const app: App = {
    ...base,
    presenters: {
      ...base.presenters,
      ...nativePresenters(ports, host),
    },
    commands: createCommands(),
```

(the `dispose` block is unchanged). Add the imports:

```ts
import { createCommands } from "#/commands";
import { createConnectionPresenter } from "#/presenters/connection";
import {
  createPowerSaverPresenter,
  createThemeSkinPreferencePresenter,
  createViewModePreferencePresenter,
} from "#/presenters/preferences";
import { createThemePreferencePresenter } from "#/presenters/themePreference";
```

- [ ] **Step 13: Update `parity.json`** — set `connection`, `themePreference`, `themeSkinPreference`, `powerSaver`, `viewModePreference` to `"native"` and add after `"machines"`:

```json
  "commands": {
    "reconnect": "native"
  }
```

- [ ] **Step 14: Rewrite `parity.test.ts`** exactly as Task 3 Step 13 (same file contents; this package's `composeWithBase` returns `{ base, app, host }` and the destructuring `const { base, app } = composed;` ignores `host`). Build in `beforeAll`, dispose in `afterAll`, check `commands`.

- [ ] **Step 15: Export the factories from `src/index.ts`** — add after the `#/composition` block:

```ts
export { createCommands } from "#/commands";
export { createConnectionPresenter } from "#/presenters/connection";
export { mirrorPort } from "#/presenters/mirrorPort";
export {
  createPowerSaverPresenter,
  createThemeSkinPreferencePresenter,
  createViewModePreferencePresenter,
} from "#/presenters/preferences";
export { createThemePreferencePresenter } from "#/presenters/themePreference";
```

- [ ] **Step 16: Run the whole package — the contract runner is the witness**

```bash
pnpm --filter @rtc/client-core-effect typecheck
pnpm --filter @rtc/client-core-effect test:coverage
pnpm exec biome check packages/client-core-effect
```

Expected: `coreContract.test.ts` green under the `effect` label with every slice-1a suite exercising native code; `parity.test.ts` and `composition.test.ts` green; coverage ≥95% / branches ≥85%. A contract failure here is a core defect (Task 1 proved the suites on RxJS); the likely culprits are a missing `await settle()` in a suite you did not write (report it, do not patch the suite) or a `seed` that reads the wrong port.

- [ ] **Step 17: Update `README.md`'s "Parity" section** — replace the paragraph beginning `In this slice every member **delegates**` with:

```
As of slice 1a, six members are **native** — `connection`, `themePreference`,
`themeSkinPreference`, `viewModePreference`, `powerSaver` and
`commands.reconnect` — and everything else still **delegates** to
`@rtc/client-core` (the strangler seam): `composeWithBase` builds the RxJS
app, mints a `ManagedRuntime` and a `Scope`, and overlays what this core
implements. The native idiom for a replay-current stream is `sharedFold` (a
`SubscriptionRef` seeded synchronously on every first subscribe, driven by a
producer fiber in a per-warm-period child scope) — `Stream.share` cannot be
the envelope, since it replays to a new subscriber on a fiber rather than in
the caller's tick; `mirrorPort` is the port-stream special case and
`Stream.zipLatest` combines two inputs (`mode$`). One documented difference
from the RxJS core: a `SubscriptionRef` fold conflates `Object.is`-equal
consecutive states. `src/parity.json` records the split and
`src/parity.test.ts` proves manifest and reality agree by reference — for
presenters, machines and commands alike.
```

Also delete the README sentence `— no such call ships yet, since every member still delegates to the RxJS core.` if it appears in this README (it may only be in §22; check with grep).

- [ ] **Step 18: Commit**

```bash
git add packages/client-core-effect
git commit -m "feat(client-core-effect): connection, theme, skin, view-mode, power-saver and reconnect go native (slice 1a)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

---

### Task 6: Docs, status, and the slice gate (gauntlet + e2e matrix)

**Files:**
- Modify: `docs/architecture/22-pluggable-application-core.md`
- Modify: `docs/adr/ADR-006-pluggable-application-core.md`
- Modify: `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md`
- Modify: `CLAUDE.md`
- Modify: `docs/STATUS.md`

**Interfaces:** none produced; consumes everything above.

- [ ] **Step 1: §22 — "Three timing guarantees"**, in `docs/architecture/22-pluggable-application-core.md`: replace guarantee 2's last sentence (`the Effect core would get the same shape natively from … since every member still delegates to the RxJS core.`) with:

```
   the Effect core's `sharedFold` restates it over a `SubscriptionRef` and a
   per-warm-period `Scope` — `Stream.share({ replay: 1 })` could not be the
   envelope, because it replays to a new subscriber on a fiber, never in the
   caller's tick (slice 1a, measured on 3.22.2).
```

and append a fourth item to the list:

```
4. **Only the first value is synchronous.** The contract asserts a
   subscription's first value in the caller's tick and every later value
   after `settle()` (two macrotask turns): an Effect fiber delivers past the
   seed on the scheduler, so a suite asserting later values synchronously
   would be pinning RxJS's delivery tick rather than the behaviour. One
   related, uncontracted difference: a `SubscriptionRef` fold conflates
   `Object.is`-equal consecutive states (the guard that keeps the seed from
   being delivered twice), where the RxJS core's `scan`/`map` re-emit them
   and the async core's `Topic` reproduces that re-emission.
```

- [ ] **Step 2: §22 — "The parity manifest"**: replace `At slice 0 both alternative cores list every member "delegated" — nothing has been ported yet, and the manifest says so explicitly rather than leaving it implied.` with:

```
The manifest has three sections — `presenters`, `machines`, `commands` —
and the drift test walks all three. As of slice 1a both alternative cores
list six members `"native"` (`connection`, the four theme/view/power-saver
preferences, `commands.reconnect`) and everything else `"delegated"`; the
manifest says so explicitly rather than leaving it implied.
```

- [ ] **Step 3: ADR-006 — add a "Learned in slice 1a" block** after the last bullet of "Learned in slice 0" (before the next `##` heading):

```
**Learned in slice 1a** (2026-09-18):

- **`Stream.share` cannot be an Effect presenter's envelope.** It replays to
  a new subscriber on a fiber, so the synchronous-first-value guarantee is
  unmeetable through it. The Effect idiom is `sharedFold`: a
  `SubscriptionRef` seeded synchronously on every first subscribe (a
  `peek` of the port for a mirror, a constant for a pure fold), a producer
  fiber forked into a per-warm-period child `Scope`, the last unsubscribe
  closing that scope. Writes go through an `update` that publishes only a
  non-`Object.is`-equal result — a `SubscriptionRef.set` of an equal value
  re-publishes (measured) — and only for the current warm period, since a
  scope closes on a fiber and a producer can outlive its period by a tick.
- **The contract asserts only the first value synchronously.** Everything
  after a drive is asserted after `settle()`. Slice 0's suites pinned
  RxJS's delivery tick without meaning to; they passed on both alternative
  cores only because those cores were still delegating.
- **The async core needed a synchronous relay, not an iterator, for hot
  ports.** A `for await` over `iterate(port$)` resumes a microtask after the
  port's synchronous emission; `relay(port$, signal, publish)` hands it on
  in the same tick, which is what makes a `Topic` over a `BehaviorSubject`
  port replay-current. `iterate` remains the pull-paced tool.
- **`commands.reconnect` is native in provenance but shared in transport.**
  Both web clients merge `@rtc/client-core`'s module-level `reconnect$`
  into `connectionEvents` for every core, so each core's native command
  pushes into it — through its `bridge/out.ts`, the one place a Subject
  method is called. Slice 8 moves the seam.
```

- [ ] **Step 4: Spec amendments** in `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md`:
  - In "The Effect core", the **Streams** bullet: after `(since 3.8; upstream runs only while ≥1 consumer — the refCount semantics).` append ` **Amended in slice 1a:** `Stream.share` replays on a fiber, so it cannot be the outward envelope; presenter streams are `sharedFold`s (a synchronously seeded `SubscriptionRef` + a per-warm-period `Scope`) — ADR-006, "Learned in slice 1a".`
  - In "The Effect core", the **Composition root** bullet: append ` **Deferred to slice 2:** the Tag/Layer shape buys nothing while no native member depends on another native member; `priceStream` (which consumes `powerSaver.isCalm$`) is the first such dependency. Slice 1a keeps slice 0's plain-object overlay with `host` injected.`
  - In "Delivery", the **Slices 1a–7** intro line stays; under the table add a line: `Slice 1a shipped 2026-09-18 (plan: [`../plans/2026-09-18-pluggable-core-slice-1a.md`](../plans/2026-09-18-pluggable-core-slice-1a.md)).`

- [ ] **Step 5: `CLAUDE.md`** — in the "Application core rule" paragraph, replace `Both siblings ship at 100% delegation to `@rtc/client-core` today;` with `Both siblings port members slice by slice (six native as of slice 1a: `connection`, the theme/skin/view-mode/power-saver preferences, `commands.reconnect`) and delegate the rest to `@rtc/client-core`;`. Also in the package table, the `client-core-async` and `client-core-effect` rows: replace `Slice 0: every member delegates to @rtc/client-core;` / `Same delegating-strangler shape` wording so each row reads "slice 1a: six members native, the rest delegate to @rtc/client-core".

- [ ] **Step 6: `docs/STATUS.md`** — rewrite the pluggable-core entry's headline and prune the residual list. Replace the bold headline `**slice 0 shipped (PR pending); next: slice 1a (connection + theme)**` with `**slice 0 shipped (#717, 2026-09-13); slice 1a shipped (2026-09-18); next: slice 1b (the eleven remaining preferences)**`, replace the member sentence with `— both alt cores port the eleven remaining preference presenters natively (`creditRfqFilterPreference`, `eqWatchlistSortPreference`, `eqBlotterViewPreference`, `bootPreference`, `loginWaitPreferences`, `jarvisPreferences`, `animatedBackground`, `ambientStyle`, `chartSubstrate`, `layoutEngine`, `forceBootAnimation`) using slice 1a's `topicFromObservable` / `mirrorPort` idioms; their suites do not exist yet and must be green on RxJS first.`, add `· Plan (slice 1a): [superpowers/plans/2026-09-18-pluggable-core-slice-1a.md](superpowers/plans/2026-09-18-pluggable-core-slice-1a.md)` after the slice-0 plan link, retitle the residual block `**Slice-0 residuals still open (deferred to slice 1b).**`, and DELETE these closed items: `storeToStateStream` twin; `Store.set` docs; the async `dispose` seam note; `parity.test.ts` never disposes; `collect()` error slot; `EffectHost` not re-exported; `@rtc/domain` in `dependencies` though only tests import it (now src imports it — closed by the port itself); `passWithNoTests`; the cycle test seeding the default. Keep the rest verbatim. Bump `**Last updated:**` to `2026-09-18`.

- [ ] **Step 7: Doc links and formatting**

```bash
pnpm check:doc-links
pnpm exec biome ci .
```

Expected: both clean.

- [ ] **Step 8: The local CI mirror**

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @rtc/client-core-async test:coverage
pnpm --filter @rtc/client-core-effect test:coverage
pnpm check:deps
pnpm --filter @rtc/tests gates
pnpm check:core-bundle
pnpm core:parity
```

Expected: all green. `pnpm core:parity` prints `native: async 6/71, effect 6/71` (70 presenters+machines plus the one command). `check:core-bundle` still reports no foreign-core marker in the rxjs builds; note the three gzip sizes per client in the PR description (informational — the async and effect bundles now carry real code, so they grow slightly). A build of the alternative cores' `dist` is a precondition of `check:core-bundle`; `pnpm build` above does it.

- [ ] **Step 9: The e2e matrix — the slice's exit criterion**

```bash
pnpm test:e2e:async
pnpm test:e2e:effect
```

Run each unpiped and read the summary block at the end of the log yourself — never `tail`/`grep` a Playwright run you are judging (the N-failed line sits above N-passed and pipes launder a non-zero exit). Expected: both green, on both clients; the login spec's `expectSelectedCoreImpl` assertion proves the right core booted. The `rxjs` matrix leg has no code change in this slice and runs in CI.

- [ ] **Step 10: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs(pluggable-core): slice 1a receipts — sharedFold, settle rule, parity 6/71; STATUS residuals pruned

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

Then ship per the repo's shipping rules: push, open the PR (body includes the `pnpm core:parity` table and the gzip sizes), loop until CI is green (including both `e2e (async core …)` / `e2e (effect core …)` matrix legs), check CodeQL alerts, merge with `--merge`, clean up the worktree.

---

## Self-review

**Spec coverage (slice 1a row + "done when"):** suites exist and are green on RxJS — Task 1; both alternative cores native for `connection`, `themePreference`, `themeSkinPreference`, `viewModePreference`, `powerSaver`, `AppCommands.reconnect` — Tasks 3 and 5; e2e matrix green — Task 6 Step 9; `parity.json` updated — Tasks 3/5. Contract idiom preserved (envelope-level, no operators in suites) — Task 1. Bridge rule — every new rxjs value import (`take`, `Subscriber`, `reconnect$`'s `.next`) lives in `bridge/`. Coverage gates — Steps 19/15/10/16 of Tasks 2–5. Docs per the spec's "Documentation" section — Task 6.

**Placeholder scan:** no TBD/TODO; every code step carries the code; Task 5 Step 14 refers to Task 3 Step 13 for a file that is byte-identical apart from one destructuring the text names — acceptable because the referenced step contains the full file.

**Type consistency:** `relay(source, signal, next)` (Task 2) is called as `relay(events.events(), signal, (event) => …)` and `relay(colorScheme.prefersDark$(), signal, (value) => …)` (Task 3) ✓. `topicFromObservable(source): Topic<T>` → `topicToStream(topic)` ✓. `mapTopic(source, project)` ✓. `sharedFold(host, { seed, run })` with `run: (update: FoldUpdate<S>) => Effect<void, unknown>` (Task 4) matches `mirrorPort` and the three presenters (Task 5) ✓; `update((current) => …)` / `update(() => value)` both satisfy `(next: (current: S) => S)` ✓. `createConnectionPresenter` takes `(events, initial?)` in the async core and `(host, events, initial?)` in the Effect core — deliberately different, each package's index documents its own ✓. `parity.commands` typed through the JSON import; `keyof typeof base.commands` = `"reconnect"` ✓. `Collected.errors` used in the connection suite ✓.
