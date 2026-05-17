# Phase 5B.2 — Cucumber-JS + Fake Timers (Virtual Time) Design

**Status:** Approved 2026-05-17. Implementation pending.

**Builds on:** Phase 5B.1 (`docs/superpowers/specs/2026-05-16-phase-5b-1-presenter-direct-step-defs-design.md`) — DONE, SHA range `eecc786..7ff3c62`.

**Position in 5B umbrella:** 5B.2 of 4. Adds the second of four variants in the comparison artifact (5B.1 cucumber+real time → 5B.2 cucumber+fake time → 5B.3 vitest+gherkin+fake → 5B.4 vitest+plain+fake).

---

## 1. Goal

Add a **sixth e2e test peer** — `test:presenter:cucumber-fake` — that runs the same 19 `@presenter`-tagged scenarios as 5B.1 but with `@sinonjs/fake-timers` patching the global timer functions for the scenario's duration. Same `.feature` files, same step/scenario *bodies*, same `_buildApp.ts` — only the World implementation and Cucumber config differ.

**Reader takeaways (both equally weighted):**

1. **Speed proof.** The full suite runs in under 1 second (vs 60–90s for 5B.1) because no real time elapses.
2. **Migration cost proof.** Migrating an existing presenter-direct suite from real to virtual time is a small, localised change: a new World class + hooks file + Cucumber config, plus a mechanical refactor of `await firstValueFrom(stream$.pipe(timeout(...)))` call sites into `await w.awaitFirstWithin(stream$, ms)` — visible in one PR's diff.

---

## 2. Why the 5B.1 §8 outline understated the work

5B.1's §8 said: *"new `tests/scenarios/presenter/cucumber-fake/common.ts` where `waitSeconds` uses `clock.tickAsync` instead of `setTimeout`"* — implying the rest could be shared verbatim.

That outline assumed `waitSeconds` was the only real-time touchpoint. It isn't. Step bodies call `await firstValueFrom(stream$.pipe(timeout(N)))` for liveness assertions. Under fake timers, the underlying simulators (`PricingSimulator`, `ExecutionSimulator`, `AnalyticsSimulator`, `CreditRfqSimulator`) emit via patched `setTimeout` / `setInterval` / RxJS `timer` — so without explicit clock advancement, the `await` blocks forever waiting for an emission that will never arrive.

The fix is to start the firstValueFrom promise, advance virtual time, then await:

```ts
const p = firstValueFrom(stream$.pipe(timeout(timeoutMs)));
await clock.tickAsync(timeoutMs);
return p;
```

This needs to happen at every wait-and-assert call site. Rather than fork the scenario tree, we abstract this into an `AwaitHelpers` interface on the World — see §4.

---

## 3. Approach selection

Three candidates were considered:

| Approach | Where the time-awareness lives | Choice |
|----------|--------------------------------|--------|
| **A. `AwaitHelpers` on the World** | Method on `PresenterWorld`; scenarios call `w.awaitFirstWithin(source$, ms)` | **Chosen** |
| B. Module-level helper inspecting `w.clock` | Static function `awaitFirstWithin(w, source$, ms)` | Rejected — leaks time mechanism into static module; every call passes `w` explicitly |
| C. Two parallel scenario trees | Fork `cucumber-real/` → `cucumber-fake/`, no abstraction | Rejected — contradicts "migration cost proof" goal |

**A** is selected because polymorphism belongs on the World (where the runtime difference between runners genuinely lives), and scenario bodies become time-mechanism-agnostic.

**Note on 5B.1 precedent reversal.** 5B.1's spec §4 line 106 said: *"Mirror, don't share, scenarios files."* That guidance applies to **browser-vs-presenter** binding differences (different surfaces, different driver APIs). 5B.2 is a presenter-vs-presenter difference *purely in runtime timing mechanism* — sharing makes the migration delta legible. This spec formally overrides the 5B.1 §4-line-106 guidance **for the cucumber-real → cucumber-fake transition only**.

---

## 4. Architecture

### Directory shape (after 5B.2)

```
tests/
  scenarios/presenter/
    _buildApp.ts                          ← shared, unchanged
    _await.ts                             ← NEW: AwaitHelpers interface + RealAwaitHelpers impl
    _world.ts                             ← NEW: PresenterWorld structural type
    cucumber-real/                        ← name retained for git history; consumed by BOTH runners now
      common.ts                           ← scratchpad + workspace no-ops (waitSeconds dropped — moves to World)
      connection.ts, fxLiveRates.ts, fxTrading.ts, blotter.ts, analytics.ts, fxRfq.ts, creditRfq.ts
                                          ← MODIFIED: bare firstValueFrom(...pipe(timeout)) → w.awaitFirstWithin(...)
  steps/presenter/
    cucumber-real/                        ← name retained; consumed by BOTH runners
      *.steps.ts                          ← UNCHANGED (steps just delegate to scenario fns)
  support/presenter/
    cucumber-real/
      world.ts                            ← MODIFIED: PresenterWorld implements AwaitHelpers via RealAwaitHelpers
      hooks.ts                            ← unchanged
    cucumber-fake/                        ← NEW
      world.ts                            ← FakePresenterWorld implements AwaitHelpers via fake clock
      hooks.ts                            ← installs/uninstalls @sinonjs/fake-timers; otherwise mirrors real hooks
  cucumber-presenter-real.js              ← unchanged
  cucumber-presenter-fake.js              ← NEW
```

**Naming note.** The `cucumber-real/` directory under `scenarios/` and `steps/` is now consumed by both real and fake runners. Renaming to `shared/` would churn git blame across every file; the directory header comment is updated to clarify.

### `AwaitHelpers` interface (in `_await.ts`)

```ts
import { firstValueFrom, timeout, type Observable } from "rxjs";

export interface AwaitHelpers {
  /** Resolves to first emission within timeoutMs; rejects with TimeoutError otherwise. */
  awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T>;
  /** Advances time by n seconds (real or virtual). */
  waitSeconds(n: number): Promise<void>;
}

export class RealAwaitHelpers implements AwaitHelpers {
  awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
    return firstValueFrom(source$.pipe(timeout(timeoutMs)));
  }
  waitSeconds(n: number): Promise<void> {
    return new Promise((r) => setTimeout(r, n * 1000));
  }
}
```

### `PresenterWorld` structural type (in `_world.ts`)

```ts
import type { PresenterCtx } from "./_buildApp";
import type { PresenterScratchpad } from "./cucumber-real/common";
import type { AwaitHelpers } from "./_await";

export type PresenterWorld = AwaitHelpers & {
  ctx: PresenterCtx;
  scratch: PresenterScratchpad;
};
```

Both concrete World classes (real and fake) satisfy this type structurally. Scenarios and steps import `PresenterWorld` from `_world.ts` and remain runner-agnostic.

### Real-time World (modified — `support/presenter/cucumber-real/world.ts`)

```ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import type { Subscription } from "rxjs";
import type { PresenterCtx } from "../../../scenarios/presenter/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import { type AwaitHelpers, RealAwaitHelpers } from "../../../scenarios/presenter/_await";

export class PresenterWorld extends World implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  _statusSub?: Subscription;
  private readonly _await = new RealAwaitHelpers();
  awaitFirstWithin = this._await.awaitFirstWithin.bind(this._await);
  waitSeconds = this._await.waitSeconds.bind(this._await);
}
setWorldConstructor(PresenterWorld);
```

### Fake-time World (new — `support/presenter/cucumber-fake/world.ts`)

```ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import { firstValueFrom, timeout, type Observable, type Subscription } from "rxjs";
import type { InstalledClock } from "@sinonjs/fake-timers";
import type { PresenterCtx } from "../../../scenarios/presenter/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import type { AwaitHelpers } from "../../../scenarios/presenter/_await";

export class FakePresenterWorld extends World implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  clock!: InstalledClock;
  _statusSub?: Subscription;

  async awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
    const p = firstValueFrom(source$.pipe(timeout(timeoutMs)));
    await this.clock.tickAsync(timeoutMs);
    return p;
  }
  async waitSeconds(n: number): Promise<void> {
    await this.clock.tickAsync(n * 1000);
  }
}
setWorldConstructor(FakePresenterWorld);
```

### Fake-time hooks (new — `support/presenter/cucumber-fake/hooks.ts`)

```ts
import { Before, After } from "@cucumber/cucumber";
import FakeTimers from "@sinonjs/fake-timers";
import { buildPresenterApp } from "../../../scenarios/presenter/_buildApp";
import { newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import type { FakePresenterWorld } from "./world";

Before(function(this: FakePresenterWorld) {
  // Install clock BEFORE buildPresenterApp so simulators capture patched setTimeout/setInterval.
  // Seed virtual now() with real Date.now() to avoid surprising virtual-epoch math in
  // simulators that do `Date.now() - i * 500` for historical tick timestamps.
  this.clock = FakeTimers.install({ now: Date.now(), shouldAdvanceTime: false });
  this.ctx = buildPresenterApp();
  this.scratch = newScratchpad();
  this._statusSub = this.ctx.app.presenters.connection.status$.subscribe();
});

After(function(this: FakePresenterWorld) {
  this._statusSub?.unsubscribe();
  this.clock.uninstall();
});
```

---

## 5. Scenario refactor pattern

Every scenario fn in `tests/scenarios/presenter/cucumber-real/*.ts` is touched mechanically. The transformation:

**Before (5B.1):**
```ts
await firstValueFrom(
  w.ctx.app.presenters.connection.status$.pipe(
    filter((s) => s === status),
    timeout(seconds * 1000),
  ),
);
```

**After (5B.2):**
```ts
await w.awaitFirstWithin(
  w.ctx.app.presenters.connection.status$.pipe(filter((s) => s === status)),
  seconds * 1000,
);
```

Bare `firstValueFrom(...)` calls **without** `timeout(...)` (i.e. sync-on-subscribe sources like `currencyPairs.pairs$`) stay unchanged — they don't need the helper. The plan will go through each call site explicitly.

Imports also switch:
```ts
-import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
+import type { PresenterWorld } from "../_world";
```

---

## 6. Cucumber config (new — `tests/cucumber-presenter-fake.js`)

Same shape as `cucumber-presenter-real.js`, swap the support directory:

```js
export default {
  paths: ['features/**/*.feature'],
  import: [
    'scenarios/presenter/_buildApp.ts',
    'scenarios/presenter/_await.ts',
    'scenarios/presenter/cucumber-real/common.ts',
    'scenarios/presenter/cucumber-real/*.ts',
    'support/presenter/cucumber-fake/*.ts',          // ← fake-runner world + hooks
    'steps/presenter/cucumber-real/*.steps.ts',
  ],
  tags: '@presenter',
  parallel: process.env.CI ? 1 : 2,
  retry: 0,
};
```

---

## 7. Data flow examples

### Sync-on-subscribe assertion (no tick needed)

`Then the live rates workspace is visible within 3 seconds` → `expectPriceTileVisibleWithin(w, 3)`:

1. `Before` → `FakeTimers.install()`, `buildPresenterApp()`, warm status$ sub.
2. Step calls `await w.awaitFirstWithin(price$(pair), 3000)`.
3. `firstValueFrom` subscribes → `PricingSimulator.getPriceUpdates` returns `concat(from(history), live$)` → historical first element emitted synchronously → promise resolves in current microtask.
4. `tickAsync(3000)` runs anyway — harmless since the promise already resolved.
5. `After` → unsubscribe, `clock.uninstall()`.

### Timer-driven assertion (tick required)

`Then the trade confirmation shows within 8 seconds` after `When the trader buys`:

1. Step calls `await w.awaitFirstWithin(execution.execute(...), 8000)`.
2. `ExecutionSimulator` returns `timer(delayMs).pipe(map(...))` — schedules virtual setTimeout for `delayMs` (e.g. 500–2000 ms).
3. `firstValueFrom` subscribes; no sync emission.
4. `tickAsync(8000)` fires the scheduled timer at virtual `now + delayMs` → simulator emits → `firstValueFrom` resolves.
5. `tickAsync` returns (it advanced the remaining `8000 - delayMs` ms with no more pending timers in our window).

### Connection event assertion (sync via Subject)

`When the browser comes back online, Then the connection status is "Connected" within 5 seconds`:

1. `browserComesBackOnline(w)` → `w.ctx.connectionEvents$.next({ type: "browserOnline" })` — synchronous.
2. `expectStatusEqualsWithin(w, "Connected", 5)` → `w.awaitFirstWithin(status$.pipe(filter(s => s === "Connected")), 5000)`.
3. Status$ has already transitioned (the reconnect use case may schedule a `setTimeout`-backed "ScheduledReconnect" intermediate state — see risk #4 below).
4. `tickAsync(5000)` advances any reconnect-delay timers in the use case layer.

---

## 8. Scope

| Item | In scope | Out of scope |
|------|----------|--------------|
| Port all 19 `@presenter` scenarios | ✅ | — |
| New `.feature` files or tags | — | ❌ |
| Refactor scenarios in `cucumber-real/` for helper | ✅ | — |
| Refactor browser/cypress/playwright runners | — | ❌ |
| `@sinonjs/fake-timers` as new tests dep | ✅ | — |
| Per-step tick precision (over-tick loop) | — | ❌ (deferred to follow-up if needed) |
| Cleanup of dead scratchpad fields (5B.1 follow-up #6) | — | ❌ (separate housekeeping) |
| 5B.3 / 5B.4 work | — | ❌ |

---

## 9. Run-all + grep-gate updates

### `tests/scripts/run-all.ts`

Append as the 6th peer:
```ts
combinedExit |= await run("pnpm", ["test:presenter:cucumber-fake"]);
```

### `tests/scripts/grep-gates.ts`

Add **gate 18**: forbid bare `firstValueFrom(...pipe(timeout(...)))` in `tests/scenarios/presenter/cucumber-real/*.ts`. Enforces the `w.awaitFirstWithin` abstraction so future contributors don't reintroduce the deadlock pattern. Gates 15–17 (no driver/DOM/`createApp` outside `_buildApp.ts`) already cover the new fake-time world by directory pattern; no separate gates needed.

---

## 10. Dependencies

| Package | Change |
|---------|--------|
| `tests/package.json` devDeps | `+ "@sinonjs/fake-timers": "^14.0.0"` |
| `tests/package.json` scripts | `+ "test:presenter:cucumber-fake": "cucumber-js --config cucumber-presenter-fake.js"` |
| `@rtc/client`, `@rtc/domain`, `@rtc/shared`, `@rtc/server` | no changes |

---

## 11. Risks & mitigations

1. **Over-tick.** `awaitFirstWithin` advances by full `timeoutMs` even when source emits sooner. Benign for the 19 scenarios in 5B.1 (none chain two time-bounded waits where over-advance would corrupt subsequent state). Documented; if a future scenario hits this, switch impl to a `nextAsync`-probe loop. **Not pre-built.**

2. **Fake-time `Date.now()`.** `FakeTimers.install({ now: Date.now() })` seeds virtual time with real wall time, so simulators doing `Date.now() - i * 500` for historical timestamps produce sensible values. Without this, virtual epoch starts at 0, which is *technically* fine but visibly weird in logs.

3. **Refactor regression on cucumber-real.** Scenarios in `cucumber-real/` are now consumed by both runners. The plan re-runs `pnpm test:presenter:cucumber-real` after every refactor task to catch regression early.

4. **Use-case-layer `setTimeout` discoverability.** ConnectionStatusUseCase or similar may internally schedule reconnect transitions via `setTimeout`. Under fake-time, those fire only when ticked. Mitigation: every `expectStatusEqualsWithin` already calls `awaitFirstWithin` which ticks `timeoutMs` — covers it.

5. **Sinon `Date` patching interaction with simulator initialisation.** Simulator constructors that pre-compute timestamps in `constructor()` run at `buildPresenterApp()` time — which is **after** `clock.install()`. They'll see `Date.now() === <seeded value>`. The seeding mitigation (#2) keeps this sensible.

6. **`tests/cucumber.js` browser glob exclusion.** 5B.1 narrowed the browser cucumber config to exclude presenter steps. No further narrowing needed for 5B.2 since the fake-runner is on its own config.

---

## 12. Open questions resolved during brainstorming

| Question (from 5B.1 spec §9 follow-up #2) | Resolution |
|-------------------------------------------|------------|
| Whether `steps/presenter/cucumber-real/` is shared with 5B.2 or forked | **Shared.** Steps delegate to scenario fns; scenario fns use `w.awaitFirstWithin` polymorphism. No fork. |
| Whether scenario files are shared | **Shared with refactor.** Existing `cucumber-real/*.ts` modified once; both runners import them. Justified in §3. |
| Whether new `awaitHelpers` lives on the World or as a free function | **On the World.** §3 / §4. |

---

## 13. Acceptance criteria

5B.2 is DONE when:

1. `pnpm --filter @rtc/tests test:presenter:cucumber-fake` passes all 19 `@presenter` scenarios in **under 5 seconds wall-time** (target <1s, recorded).
2. `pnpm --filter @rtc/tests test:presenter:cucumber-real` still passes all 19 scenarios with no regression (the refactor is invisible to that runner).
3. `pnpm --filter @rtc/tests test:e2e:all` passes all 6 peers (4 browser + presenter-real + presenter-fake).
4. `pnpm --filter @rtc/tests grep-gates` passes including new gate 18.
5. `pnpm typecheck` passes across all packages.
6. `docs/architecture.md` §9.5 + `STATUS.md` updated.
7. No bare `firstValueFrom(...pipe(timeout(...)))` calls remain in `tests/scenarios/presenter/cucumber-real/*.ts`.

---

## 14. Follow-ups (carry forward to 5B.3+)

1. **Precision-tick mode.** If a future scenario chains time-bounded waits where over-advance matters, switch fake-world `awaitFirstWithin` to a `nextAsync` probe loop (advance to next scheduled timer, check promise state, repeat until promise resolved or deadline reached).
2. **`tests/scenarios/presenter/cucumber-real/` directory rename.** Once 5B.2 lands and the "shared between runners" reality is established, consider renaming to `shared/` (or splitting `_common/` from runner-specific bits). Defer to a dedicated naming refactor.
3. **Vitest runners (5B.3, 5B.4)** should reuse the same `_await.ts` + `_world.ts` types; their setup files install fake-timers per test rather than per scenario.
