# Phase 5B.4 — Vitest + plain TS (no Gherkin) + fake timers (design)

## 1. Goal

Add an 8th e2e peer `test:presenter:vitest-plain` that runs the same 19 `@presenter` scenarios as 5B.1/5B.2/5B.3 under Vitest + `vi.useFakeTimers()` **with no Gherkin loader**. Tests are hand-written `describe`/`it` blocks that call the existing framework-agnostic scenario modules in `scenarios/presenter/_shared/`. Validates that the `AwaitHelpers` / `_world.ts` / `_buildApp.ts` abstractions introduced in 5B.1–5B.3 are useful even without a BDD step-tree.

## 2. Why this peer

Phase 5B's comparison artifact isolates one variable per peer:

| Peer | Runner | Gherkin | Timers |
|---|---|---|---|
| cucumber-presenter-real (5B.1) | cucumber-js | cucumber-js native | real |
| cucumber-presenter-fake (5B.2) | cucumber-js | cucumber-js native | `@sinonjs/fake-timers` |
| vitest-presenter-fake (5B.3) | vitest | quickpickle | `vi.useFakeTimers()` (sinon-based) |
| **vitest-presenter-plain (5B.4)** | **vitest** | **none — raw `it()`** | **`vi.useFakeTimers()`** |

5B.3 → 5B.4 changes one variable: **Gherkin vs raw TS**. Runner, timer mechanism, scenarios, await helpers, world type, and buildApp factory are all unchanged. The comparison closes the matrix: each of {runner, Gherkin, timer} has been independently varied while holding the other two constant.

The hypothesis being validated: the `_shared/*.ts` scenario modules, `AwaitHelpers` interface, and `PresenterWorld` type are abstractions strong enough to be useful even without any BDD layer. If a contributor wanted to write presenter tests in raw vitest tomorrow, the same scenario modules would Just Work — no new abstraction layer required.

## 3. Architecture

Three layers, mirroring 5B.3 but with the Gherkin loader removed:

```
tests/specs/*.feature                            (unchanged — source-of-truth for scenario text)
                  │
                  │  (hand-translated, count-guarded by gate 21)
                  ▼
tests/presenter-tests/vitest-plain/X.test.ts     NEW: one describe per feature,
                                                 one it() per @presenter scenario,
                                                 body = sequence of scenario-module calls
                  ▼
tests/scenarios/presenter/_shared/X.ts           unchanged — reused as-is by all 4 peers
                  ▼
@rtc/client createApp + simulator ports          unchanged
```

**Reused unchanged** (zero edits across the existing 7 peers): all `.feature` files, `_shared/*.ts` × 8, `_await.ts`, `_world.ts`, `_buildApp.ts`. The fork boundary is identical to 5B.3: scenarios + features are the universal artifact; the per-peer glue (test files + world + config) is fresh.

**No `steps/presenter/vitest-plain/` folder.** There are no Gherkin step definitions to register — the test bodies inline what would otherwise be step-def delegation. This is the whole point of the peer.

## 4. Library choices and rationale

- **Test runner: Vitest (`^3.2`).** Already installed in 5B.3; reused as-is. No version change.
- **Fake timers: `vi.useFakeTimers()`.** Same as 5B.3. Identical semantics (vitest wraps `@sinonjs/fake-timers` internally).
- **No Gherkin loader.** This is the defining negative-space choice. The peer must not import `quickpickle`, `@cucumber/cucumber`, or any Gherkin parser. Enforced by gate 20 (§7).
- **No new dependencies.** vitest is already a `devDependency`; everything else is already in the tree.

## 5. File structure

### 5.1 No pre-flight cleanup needed

5B.3 already did the `cucumber-real/` → `_shared/` rename. The `_shared/*.ts` modules are framework-agnostic and need no further reorganization to be consumed by vitest-plain. 5B.1 follow-up #6 (scratchpad audit) is deferred — see §10.

### 5.2 Final layout

```
tests/
  presenter-tests/                              NEW top-level folder for non-Gherkin presenter tests
    vitest-plain/                               NEW peer dir
      _world.ts                                 buildWorld() + teardownWorld() + AwaitHelpers impl
      connection.test.ts                        4 @presenter scenarios → 4 it() blocks
      fxLiveRates.test.ts                       4 @presenter scenarios → 4 it() blocks
      fxTrading.test.ts                         5 @presenter scenarios → 5 it() blocks
      blotter.test.ts                           2 @presenter scenarios → 2 it() blocks
      analytics.test.ts                         2 @presenter scenarios → 2 it() blocks
      fxRfq.test.ts                             1 @presenter scenario  → 1 it() block
      creditRfq.test.ts                         1 @presenter scenario  → 1 it() block
                                                7 files, 19 it() blocks total
                                                (theme.feature has 0 @presenter scenarios → no test file)

  vitest-presenter-plain.config.ts              NEW config (no qpickle-loader plugin)
  package.json                                  +script test:presenter:vitest-plain
  scripts/run-all.ts                            +8th peer line
  scripts/grep-gates.ts                         gates 20 and 21 NEW (gate 19 needs no edit — its paths don't cover the new folder)

  steps/presenter/                              unchanged
  support/presenter/                            unchanged
  scenarios/presenter/                          unchanged
  specs/*.feature                               unchanged (still source of truth)
```

**File-per-feature, not file-per-scenario-module.** A reader who finds `specs/connection.feature` can find its peer test in `presenter-tests/vitest-plain/connection.test.ts` by name match. This is the same convention the .feature files already use; the .test.ts files mirror it.

### 5.3 Scenario count parity

Locked by gate 21 (§7). Counts per `.feature` file:

| Feature file | @presenter scenarios | vitest-plain it() blocks |
|---|---|---|
| `connection.feature` | 4 | 4 |
| `fxLiveRates.feature` | 4 | 4 |
| `fxTrading.feature` | 5 | 5 |
| `analytics.feature` | 2 | 2 |
| `blotter.feature` | 2 | 2 |
| `fxRfq.feature` | 1 | 1 |
| `creditRfq.feature` | 1 | 1 |
| `theme.feature` | 0 | (no file) |
| **Total** | **19** | **19** |

## 6. Component contracts

### 6.1 `tests/presenter-tests/vitest-plain/_world.ts`

```typescript
import { firstValueFrom, timeout, type Observable, type Subscription } from "rxjs";
import { vi } from "vitest";
import { buildPresenterApp, type PresenterCtx } from "../../scenarios/presenter/_buildApp";
import { newScratchpad, type PresenterScratchpad } from "../../scenarios/presenter/_shared/common";
import type { AwaitHelpers } from "../../scenarios/presenter/_await";

export interface VitestPlainPresenterWorld extends AwaitHelpers {
  ctx: PresenterCtx;
  scratch: PresenterScratchpad;
  /** Held for the entire test to keep shareReplay streams warm. */
  _statusSub: Subscription;
}

export function buildWorld(): VitestPlainPresenterWorld {
  // Install fake timers BEFORE buildPresenterApp so simulators capture patched
  // setTimeout/setInterval. Seed virtual now() with real Date.now() so simulator
  // historical timestamps stay sensible. Same ordering as vitest-fake/hooks.ts.
  vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false });
  const ctx = buildPresenterApp();
  const w: VitestPlainPresenterWorld = {
    ctx,
    scratch: newScratchpad(),
    _statusSub: ctx.app.presenters.connection.status$.subscribe(),
    async awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
      const p = firstValueFrom(source$.pipe(timeout(timeoutMs)));
      await vi.advanceTimersByTimeAsync(timeoutMs);
      return p;
    },
    async waitSeconds(n: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(n * 1000);
    },
  };
  return w;
}

export function teardownWorld(w: VitestPlainPresenterWorld): void {
  w._statusSub.unsubscribe();
  vi.useRealTimers();
}
```

**Plain object literal, not a class.** No qpickle-loader base to extend; no inheritance worth introducing. The shape satisfies `PresenterWorld` structurally so it's pass-through to any `_shared/*.ts` function.

`buildWorld()` mirrors 5B.3's `Before` hook 1:1 in semantics. `teardownWorld()` mirrors 5B.3's `After`.

### 6.2 Test file shape

Representative example for `connection.test.ts`. The same shape applies to all 7 test files.

```typescript
import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as conn from "../../scenarios/presenter/_shared/connection";
import type { ConnectionStatus } from "@rtc/domain";

// String-literal stand-ins for the const enum. Same trick as
// steps/presenter/vitest-fake/connection.steps.ts — see that file
// for the verbatimModuleSyntax/isolatedModules rationale.
const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;
const CS_OFFLINE = "OFFLINE_DISCONNECTED" as unknown as ConnectionStatus;

describe("@presenter Feature: Connection status", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("connected status is shown in the footer", async () => {
    await conn.noopAssertConnectionUiPresent(w);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 3);
  });

  it("connection overlay is hidden when connected", async () => {
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 1);
  });

  it("going offline shows the overlay with an offline message", async () => {
    await conn.browserGoesOffline(w);
    await conn.expectStatusEqualsWithin(w, CS_OFFLINE, 3);
    await conn.noopAssertConnectionUiPresent(w);
    await conn.expectStatusEqualsWithin(w, CS_OFFLINE, 3);
  });

  it("coming back online dismisses the overlay", async () => {
    await conn.browserGoesOffline(w);
    await conn.expectStatusEqualsWithin(w, CS_OFFLINE, 3);
    await conn.browserComesBackOnline(w);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 5);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 3);
  });
});
```

**Conventions for all 7 files:**

- `describe()` title format: `"@presenter Feature: <feature title from .feature>"`. The `@presenter` prefix lets `grep -r '"@presenter Feature:"' presenter-tests/` enumerate suites quickly; the `Feature: <title>` half matches the .feature file's `Feature:` line verbatim.
- `it()` title is the Gherkin `Scenario:` text verbatim (no leading tag — the tag is hoisted to the `describe`).
- `beforeEach` / `afterEach` are uniform across files: `buildWorld()` / `teardownWorld()`.
- Body is the linear sequence of `_shared/*.ts` function calls that the corresponding step defs would invoke under qpickle-loader/cucumber. Each call awaits its returned promise.
- No `expect()` calls in test bodies. Assertions live inside the scenario module functions (they throw on failure), same as the cucumber/vitest-fake peers. This keeps the four peers' test bodies symmetric.

### 6.3 `tests/vitest-presenter-plain.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["presenter-tests/vitest-plain/**/*.test.ts"],
    reporters: ["default"],
    pool: "threads",
  },
});
```

No qpickle-loader plugin. No `testNamePattern` (scoped by glob — every file under the folder is a presenter test by location). No `setupFiles` (per-suite `beforeEach` does the world build).

### 6.4 `tests/package.json` changes

```json
{
  "scripts": {
    "test:presenter:vitest-plain": "vitest run --config vitest-presenter-plain.config.ts"
  }
}
```

No new dependencies. `vitest@^3.2` is already a devDependency (added in 5B.3).

### 6.5 `tests/scripts/run-all.ts` changes

Add one line after the `vitest-fake` invocation:

```typescript
combinedExit |= await run("pnpm", ["test:presenter:vitest-plain"]);
```

Order in `run-all.ts` is now: playwright, raw-playwright, cypress, raw-cypress, cucumber-real, cucumber-fake, vitest-fake, vitest-plain (8 peers).

## 7. Grep gate changes

### 7.1 Gate 19 (existing) — no edit required

Currently:

```typescript
{
  name: "19. No vitest/qpickle-loader imports outside vitest-fake peer",
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

No change needed — gate 19's `paths:` already don't cover `presenter-tests/vitest-plain/`. **Verified, no edit required.** Gate 19's name still reads accurately ("outside vitest-fake peer") because vitest-plain is geographically outside the gated scenario/support/steps tree, so the gate's intent is preserved.

### 7.2 Gate 20 (NEW) — Gherkin loader forbidden in vitest-plain

```typescript
{
  name: "20. No Gherkin loader imports in vitest-plain peer",
  pattern: '"quickpickle"|"@cucumber/cucumber"|from "quickpickle/',
  paths: ["presenter-tests/vitest-plain/"],
  excludes: ["/node_modules/"],
}
```

Structurally enforces the "no Gherkin" hypothesis. If a future contributor adds qpickle-loader to a vitest-plain file (e.g., to share a step regex), the gate fires.

### 7.3 Gate 21 (NEW) — count parity between .feature @presenter scenarios and vitest-plain it() blocks

This is a count-based check, not a pattern grep. Implementation: extend `grep-gates.ts` with an optional `customCheck?: () => string[]` field on the `Gate` interface. When present, `customCheck` runs instead of the grep pipeline; it returns an array of failure-message strings (empty array = pass).

```typescript
import { readFileSync, existsSync } from "node:fs";

// Inside grep-gates.ts, alongside GATES:
const FEATURE_NAMES = [
  "connection", "fxLiveRates", "fxTrading", "analytics",
  "blotter", "fxRfq", "creditRfq",
];

function checkPresenterScenarioCounts(): string[] {
  const failures: string[] = [];
  for (const feat of FEATURE_NAMES) {
    const featurePath = `specs/${feat}.feature`;
    if (!existsSync(featurePath)) {
      failures.push(`${feat}: feature file missing at ${featurePath}`);
      continue;
    }
    const featureSrc = readFileSync(featurePath, "utf8");
    const presenterScenarios = (featureSrc.match(/@presenter\s*\n\s*Scenario:/g) ?? []).length;

    const testPath = `presenter-tests/vitest-plain/${feat}.test.ts`;
    if (presenterScenarios === 0 && !existsSync(testPath)) continue;
    if (presenterScenarios === 0 && existsSync(testPath)) {
      failures.push(`${feat}: 0 @presenter scenarios but ${testPath} exists`);
      continue;
    }
    if (!existsSync(testPath)) {
      failures.push(`${feat}: ${presenterScenarios} @presenter scenarios but ${testPath} missing`);
      continue;
    }
    const testSrc = readFileSync(testPath, "utf8");
    // Count it("...") and it.skip("...") at line start (after indent) — NOT describe(.
    const itBlocks = (testSrc.match(/^\s*it(?:\.skip)?\(/gm) ?? []).length;
    if (itBlocks !== presenterScenarios) {
      failures.push(
        `${feat}: ${presenterScenarios} @presenter scenarios in ${featurePath} ` +
        `but ${itBlocks} it() blocks in ${testPath}`,
      );
    }
  }
  return failures;
}

// In the GATES array:
{
  name: "21. vitest-plain it() count matches @presenter scenario count per .feature",
  pattern: "",          // unused when customCheck is set
  paths: [],            // unused when customCheck is set
  customCheck: checkPresenterScenarioCounts,
}
```

The runner loop in `grep-gates.ts` checks `gate.customCheck` first; if present, runs it and treats its return value as the failure list (mirroring how the grep branch produces `lines`).

**Catches:** add/remove scenario drift (most common kind), missing test file, orphan test file.
**Does not catch:** step-body changes inside an existing scenario. Acknowledged limitation; recorded in §10.

## 8. STATUS and architecture doc updates

### 8.1 `docs/superpowers/STATUS.md`

Flip the Phase 5B.4 row from `⏳ NOT STARTED` to `✅ DONE`. Plan path: `plans/2026-05-17-phase-5b-4-vitest-plain-fake-timers.md`. SHA range filled in by the implementer when the phase closes.

Add a new `## Phase 5B.4 follow-ups (carry into 5C+)` section recording §10's items.

### 8.2 `docs/architecture.md`

The "Presenter test stack" table (added in 5B.3) gains an 8th row:

| Peer | Runner | Gherkin loader | Timers | Step-def DSL |
|---|---|---|---|---|
| ... existing 7 rows ... | | | | |
| vitest-presenter-plain | vitest | none | `vi.useFakeTimers()` | none (raw `describe`/`it` calling `_shared/*.ts` directly) |

## 9. Test plan

- All 8 peers must remain green when run individually and via `pnpm test:e2e`.
- All 21 grep gates must pass.
- New gate 20 must fire if a contributor inserts `import { Given } from "quickpickle"` into any vitest-plain file (manual smoke check during implementation).
- New gate 21 must fire if a contributor adds an `@presenter` scenario to a `.feature` file without adding a matching `it()` block to the corresponding `.test.ts` (manual smoke check during implementation).
- vitest-plain runtime must be in the same order of magnitude as vitest-fake (~1.5s expected; deviation > 3× should be investigated as a regression in either the AwaitHelpers abstraction or the per-test world construction cost).

## 10. Open follow-ups (deliberately deferred)

1. **Scratchpad audit.** 5B.1 follow-up #6 flagged write-only fields in `PresenterScratchpad` (`lastPrice`, `observedTradeCount`, `lastTradeDirection`, `recordedCount`). 5B.4 was nominally going to confirm they are unused, but 5B.4 doesn't change the scratchpad shape or its consumers — vitest-plain reuses the existing scratchpad as-is. The audit remains a pure read-only review that can land separately.

2. **Step-tree de-duplication.** 5B.3 follow-up #3 suggested revisiting "source-of-truth step registry" after 5B.4. vitest-plain has no step tree, so it doesn't add to the triplication. Re-evaluate as part of 5C, since 5C will introduce contract tests that may surface new sharing patterns.

3. **Count gate scope.** Gate 21 catches add/remove drift only. Step-body changes inside an existing @presenter scenario won't trip it (e.g., editing a Gherkin step's text or arguments will not fail the gate). Acceptable for 5B.4 because the 19 @presenter scenarios are frozen by the 5B comparison artifact; revisit if presenter scenarios start changing meaningfully.

4. **`@presenter` tag in `describe` title.** Putting `@presenter` in the `describe` title is a convention, not enforced. A future contributor could omit it. Add a gate (or extend gate 21's customCheck) to assert every vitest-plain `describe()` title starts with `"@presenter "` if this becomes a recurring oversight.

5. **Naming asymmetry.** vitest-plain lives in `tests/presenter-tests/`, while the other 3 presenter peers' glue lives under `tests/steps/presenter/` (`cucumber-real/`, `vitest-fake/`) and `tests/support/presenter/` (`cucumber-real/`, `cucumber-fake/`, `vitest-fake/`). cucumber-fake notably reuses `steps/presenter/cucumber-real/` step files. Deliberate — "steps" is a misnomer for files with no step defs — but it does mean a reader scanning the file tree won't see all 4 presenter peers at one level. Acceptable; the STATUS table and architecture.md table provide the unified view.
