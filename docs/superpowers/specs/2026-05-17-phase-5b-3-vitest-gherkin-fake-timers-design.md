# Phase 5B.3 — Vitest + Gherkin + fake timers (design)

## 1. Goal

Add a 7th e2e peer `test:presenter:vitest-fake` that runs the same 19 `@presenter` scenarios from `tests/specs/*.feature` under Vitest + `quickpickle` (Vite plugin for Gherkin) + `vi.useFakeTimers()`. Validates that the `AwaitHelpers` / `_world.ts` abstractions introduced in 5B.1/5B.2 are framework-portable across runners — not just across timer mechanisms.

## 2. Why this peer

Phase 5B's comparison artifact isolates one variable per peer:

| Peer | Runner | Gherkin | Timers |
|---|---|---|---|
| cucumber-presenter-real (5B.1) | cucumber-js | cucumber-js native | real |
| cucumber-presenter-fake (5B.2) | cucumber-js | cucumber-js native | `@sinonjs/fake-timers` |
| **vitest-presenter-fake (5B.3)** | **vitest** | **quickpickle** | **`vi.useFakeTimers()`** (sinon-based) |
| vitest-presenter-plain (5B.4, planned) | vitest | none (plain TS) | `vi.useFakeTimers()` |

5B.2 → 5B.3 changes the runner; Gherkin stays. 5B.3 → 5B.4 will then change "Gherkin vs. plain TS" cleanly.

## 3. Library choices and rationale

- **Gherkin loader: `quickpickle` (v1.11.x).** Selected over `@amiceli/vitest-cucumber` because quickpickle ships CucumberJS-style global `Given/When/Then` registration plus a `setWorldConstructor` World pattern — matching the existing cucumber-js peer structure 1:1. `@amiceli/vitest-cucumber` uses closure-scoped step bodies and lacks a World object, which would have forced rewriting all step files. Quickpickle is also ESM-native (built around Vite's plugin model).
- **Fake timers: `vi.useFakeTimers()`.** Vitest's built-in API wraps `@sinonjs/fake-timers` internally (same engine, identical semantics). More Vitest-idiomatic than importing sinon directly; one fewer top-level dep.
- **Tag filter: Vitest `testNamePattern: "@presenter"`.** Quickpickle's first-class tag filtering is partial (only `skipTags`/`todoTags`/etc. are config-honored). Quickpickle bakes tag names into test titles, so Vitest's built-in `-t` / `testNamePattern` substring match selects the 19 `@presenter` scenarios cleanly. Non-matching scenarios are filtered before bodies execute, so missing presenter step defs in browser-only scenarios don't trip quickpickle's undefined-step throw.

## 4. File structure

### 4.1 Pre-flight rename (first commit of the phase)

`tests/scenarios/presenter/cucumber-real/` → `tests/scenarios/presenter/_shared/`

The folder is misnamed today — it hosts framework-agnostic scenarios shared by `cucumber-presenter-real` *and* `cucumber-presenter-fake`. Adding the vitest peer makes the wart compound. Rename now while the area is being touched.

Files affected by the rename:

- `tests/cucumber-presenter-real.js` — `scenarios/presenter/cucumber-real/**/*.ts` → `scenarios/presenter/_shared/**/*.ts`
- `tests/cucumber-presenter-fake.js` — same change
- `tests/steps/presenter/cucumber-real/*.steps.ts` (8 files) — update `import * as <X> from "../../../scenarios/presenter/cucumber-real/<X>"` to `_shared/<X>`
- `tests/scenarios/presenter/_world.ts` — update `import type { PresenterScratchpad } from "./cucumber-real/common"` to `./_shared/common`
- `tests/scenarios/presenter/_shared/*.ts` (7 files) — internal sibling imports unchanged
- `tests/support/presenter/cucumber-real/world.ts` and `tests/support/presenter/cucumber-fake/world.ts` — update `PresenterScratchpad` import path to `_shared/common`
- `tests/support/presenter/cucumber-fake/hooks.ts` — update `newScratchpad` import path to `_shared/common`
- `tests/scripts/grep-gates.ts` — gate 18 `paths:` from `scenarios/presenter/cucumber-real/` to `scenarios/presenter/_shared/`

One commit, mechanical. No behavioral change to existing 6 peers. Run `pnpm test:e2e` after the rename to confirm parity before continuing.

### 4.2 Final layout

```
tests/
  scenarios/presenter/
    _await.ts                              ← unchanged
    _world.ts                              ← import path updated
    _buildApp.ts                           ← unchanged
    _shared/                               ← RENAMED from cucumber-real/
      common.ts
      connection.ts, fxLiveRates.ts, fxTrading.ts,
      blotter.ts, analytics.ts, fxRfq.ts, creditRfq.ts

  steps/presenter/
    cucumber-real/                         ← unchanged (import paths updated)
    vitest-fake/                           ← NEW
      connection.steps.ts
      fxLiveRates.steps.ts
      fxTrading.steps.ts
      blotter.steps.ts
      analytics.steps.ts
      fxRfq.steps.ts
      creditRfq.steps.ts
      common.steps.ts

  support/presenter/
    cucumber-real/                         ← unchanged (import paths updated)
    cucumber-fake/                         ← unchanged (import paths updated)
    vitest-fake/                           ← NEW
      world.ts
      hooks.ts
      setup.ts

  vitest-presenter-fake.config.ts          ← NEW
  package.json                             ← +vitest, +quickpickle, +script
  scripts/run-all.ts                       ← +7th peer line
  scripts/grep-gates.ts                    ← gate 18 path updated, gate 15 pattern extended, gate 19 new
```

### 4.3 Fork boundary

- **Shared across all 3 presenter peers:** `specs/*.feature`, `scenarios/presenter/_shared/*.ts`, `_await.ts`, `_world.ts`, `_buildApp.ts`
- **Forked per peer:** `steps/presenter/<peer>/` (different lib's Given/When/Then), `support/presenter/<peer>/{world,hooks}.ts`, config file

Identical fork boundary to 5B.2: scenarios + features are the universal artifact; steps + World/hooks are the runner-specific glue.

## 5. Component contracts

### 5.1 `tests/support/presenter/vitest-fake/world.ts`

```typescript
import { setWorldConstructor, World } from "quickpickle";
import { firstValueFrom, timeout, type Observable, type Subscription } from "rxjs";
import { vi } from "vitest";
import type { PresenterCtx } from "../../../scenarios/presenter/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/_shared/common";
import type { AwaitHelpers } from "../../../scenarios/presenter/_await";

export class VitestFakePresenterWorld extends World implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  /** Held for the entire scenario to keep shareReplay streams warm. */
  _statusSub?: Subscription;

  async awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
    const p = firstValueFrom(source$.pipe(timeout(timeoutMs)));
    await vi.advanceTimersByTimeAsync(timeoutMs);
    return p;
  }
  async waitSeconds(n: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(n * 1000);
  }
}
setWorldConstructor(VitestFakePresenterWorld);
```

Mirrors `FakePresenterWorld` (5B.2) 1:1. Differences: imports from `quickpickle` not `@cucumber/cucumber`; uses `vi.advanceTimersByTimeAsync()` instead of `clock.tickAsync()`; no `clock` handle field (vi is module-level).

### 5.2 `tests/support/presenter/vitest-fake/hooks.ts`

```typescript
import { Before, After } from "quickpickle";
import { vi } from "vitest";
import { buildPresenterApp } from "../../../scenarios/presenter/_buildApp";
import { newScratchpad } from "../../../scenarios/presenter/_shared/common";
import type { VitestFakePresenterWorld } from "./world";

Before(function(this: VitestFakePresenterWorld) {
  vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false });
  this.ctx = buildPresenterApp();
  this.scratch = newScratchpad();
  this._statusSub = this.ctx.app.presenters.connection.status$.subscribe();
});

After(function(this: VitestFakePresenterWorld) {
  this._statusSub?.unsubscribe();
  vi.useRealTimers();
});
```

Same shape as 5B.2's `hooks.ts`, swapping `FakeTimers.install` → `vi.useFakeTimers` and `clock.uninstall()` → `vi.useRealTimers()`.

### 5.3 `tests/support/presenter/vitest-fake/setup.ts`

```typescript
import "./world";
import "./hooks";
import "../../../steps/presenter/vitest-fake/connection.steps";
import "../../../steps/presenter/vitest-fake/fxLiveRates.steps";
import "../../../steps/presenter/vitest-fake/fxTrading.steps";
import "../../../steps/presenter/vitest-fake/blotter.steps";
import "../../../steps/presenter/vitest-fake/analytics.steps";
import "../../../steps/presenter/vitest-fake/fxRfq.steps";
import "../../../steps/presenter/vitest-fake/creditRfq.steps";
import "../../../steps/presenter/vitest-fake/common.steps";
```

Barrel imported once via vitest `setupFiles`. Guarantees step regs execute before quickpickle's test discovery resolves them.

### 5.4 Steps files

One file per scenario module, mirroring `steps/presenter/cucumber-real/`. Body identical to the cucumber-real version, with three differences:

- Imports `Given/When/Then` from `quickpickle` instead of `@cucumber/cucumber`
- `this:` typed as `VitestFakePresenterWorld` instead of `PresenterWorld` (cucumber-real)
- Scenario module import path: `../../../scenarios/presenter/_shared/<name>`

Step bodies remain pure delegation: `function(this: VitestFakePresenterWorld, ...args) { return <module>.<scenarioFn>(this, ...args); }`. Zero business-logic divergence between vitest-fake and the cucumber peers.

### 5.5 `tests/vitest-presenter-fake.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import quickpickle from "quickpickle";

export default defineConfig({
  plugins: [quickpickle()],
  test: {
    include: ["specs/**/*.feature"],
    setupFiles: ["./support/presenter/vitest-fake/setup.ts"],
    testNamePattern: "@presenter",
    reporters: ["default"],
    pool: "threads",
  },
});
```

### 5.6 `tests/package.json` changes

```json
{
  "scripts": {
    "test:presenter:vitest-fake": "vitest run --config vitest-presenter-fake.config.ts"
  },
  "devDependencies": {
    "vitest": "^3.2",
    "quickpickle": "^1.11"
  }
}
```

`vitest` version pinned to `^3.2` to match `packages/client`'s existing version (avoids dual installs in the monorepo).

### 5.7 `tests/scripts/run-all.ts` — new peer line

```typescript
combinedExit |= await run("pnpm", ["test:presenter:vitest-fake"]);
```

Appended after the cucumber-fake invocation. Maintains "5 e2e peers + 2 presenter peers" → "5 e2e peers + 3 presenter peers" ordering.

## 6. Grep gates

### 6.1 Gate 18 — path update (existing gate, follows rename)

```typescript
{
  name: "18. No rxjs 'timeout' keyword in presenter scenarios (use w.awaitFirstWithin)",
  pattern: '\\btimeout\\b',
  paths: ["scenarios/presenter/_shared/"],
  excludes: ["/node_modules/"],
}
```

### 6.2 Gate 15 — pattern + excludes extension (existing gate)

```typescript
{
  name: "15. No driver imports in presenter step/scenario/support files",
  pattern: '"cypress"|@badeball|@playwright/test|"quickpickle"',
  paths: ["steps/presenter/", "scenarios/presenter/", "support/presenter/"],
  excludes: ["/node_modules/", "/vitest-fake/"],
}
```

The `/vitest-fake/` exclude permits quickpickle imports in the vitest-fake peer while still forbidding cypress/playwright/cucumber-js leakage everywhere in the presenter tree.

### 6.3 Gate 19 — new

```typescript
{
  name: "19. No vitest/quickpickle imports outside vitest-fake peer",
  pattern: '"vitest"|"quickpickle"|from "vitest/',
  paths: [
    "scenarios/presenter/",
    "support/presenter/cucumber-real/",
    "support/presenter/cucumber-fake/",
    "steps/presenter/cucumber-real/",
  ],
  excludes: ["/node_modules/"],
}
```

Symmetric to gate 15: keeps the shared scenarios + cucumber peers vitest-free. Catches accidental cross-contamination if a future developer reaches for `vi.*` in the shared scenarios layer.

## 7. Error handling

- **Undefined steps** — quickpickle throws `Undefined. Implement with...` inside the step matcher (execution time). Loud failure, cucumber-js style.
- **Timeout-bound assertions** — `w.awaitFirstWithin` rejects with RxJS `TimeoutError` if no emission within budget. `vi.advanceTimersByTimeAsync(timeoutMs)` advances exactly the budget; same race semantics as 5B.2's `clock.tickAsync(timeoutMs)`.
- **`_statusSub` drop** — if the warm subscription is lost, `shareReplay({refCount:true,bufferSize:1})` streams tear down between steps and tests fail loudly. Same failure mode as 5B.1/5B.2.

## 8. Risks and mitigations

1. **Quickpickle `setupFiles` ordering.** Quickpickle parses .feature files at Vite plugin time and registers tests; setupFiles execute before tests. Step regs must run before scenario discovery resolves them. Mitigation: single barrel `setup.ts` imports everything for side effects in deterministic order.

2. **`testNamePattern` vs. parse-time validation.** The survey confirmed quickpickle's undefined-step throw is at execution time (inside step matcher in `packages/main/src/steps.ts:86-91`). `testNamePattern` filter applies before step bodies execute, so non-presenter scenarios get filtered out without tripping the throw. If this assumption breaks under quickpickle internals (e.g., a future version moves validation earlier), fallback is to tag non-presenter scenarios with `@browser-only` and use `quickpickle({ skipTags: ['@browser-only'] })`.

3. **`vi.useFakeTimers()` worker isolation.** Vitest creates one worker per file by default. Scenarios in a single .feature file run sequentially in that worker; `Before` installs and `After` uninstalls per scenario. Cross-file parallelism is safe (separate workers = separate global state). Same isolation property as cucumber-js's per-scenario timer install.

4. **`currencyPairs.pairs$` is delay-gated.** Already discovered in 5B.2 (`ReferenceDataSimulator.getCurrencyPairs()` returns `of(...).pipe(delay(1000))`, not sync-on-subscribe). The shared scenarios in `_shared/fxLiveRates.ts` and `_shared/fxTrading.ts` already wrap `pairs$` reads in `w.awaitFirstWithin(..., 5000)` from 5B.2's fix commits — no additional work needed in 5B.3.

## 9. Verification

End-of-phase checks (in order):

1. `pnpm test:presenter:vitest-fake` — 19/19 scenarios green
2. `pnpm test:e2e` — all 7 peers green in `run-all.ts` order
3. `pnpm gates` — all 19 gates pass
4. `pnpm typecheck` — green across all packages
5. Wall-clock target: ≤2s for the 19-scenario vitest-fake peer (cucumber-fake was ~1s; vitest has higher worker startup overhead but is still well under cucumber-real's 60–90s baseline)

## 10. Out of scope for 5B.3

- The 4th peer (vitest + plain TS, no Gherkin) — that's 5B.4
- Removing the `cucumber-real` step-file naming wart on the *steps* side (`steps/presenter/cucumber-real/`). Those files genuinely are cucumber-real-specific; the name is accurate. Only the *scenarios* dir is being renamed in 5B.3.
- Cross-runner shared step-pattern infrastructure (e.g., a registry that lets a single source bind to multiple libs). 5B.1–5B.4 deliberately fork steps per peer to make the runner difference visible. A consolidation pass — if warranted — comes after 5B.4 lands.

## 11. Docs updates

- `docs/architecture.md` §9.5 — "Six-runner stack" → "Seven-runner stack"; new table row for vitest-fake; one-paragraph "runner-portability proof" note (the same scenarios + features drive cucumber-js *and* vitest under fake timers, validating that `_await.ts`/`_world.ts` aren't accidentally coupled to cucumber-js's lifecycle).
- `docs/superpowers/STATUS.md` — Phase 5B.3 row flip to ✅ DONE with SHA range + follow-ups carried into 5B.4.
