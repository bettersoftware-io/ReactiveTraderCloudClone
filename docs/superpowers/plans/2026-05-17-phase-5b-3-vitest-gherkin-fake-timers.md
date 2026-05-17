# Phase 5B.3 — Vitest + Gherkin + Fake Timers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 7th e2e peer `test:presenter:vitest-fake` that runs the same 19 `@presenter` scenarios under Vitest + qpickle-loader + `vi.useFakeTimers()`, proving the `AwaitHelpers`/`_world.ts` abstractions are runner-portable. (Throughout this plan, "qpickle-loader" refers to the npm package `qu` + `ickpickle` — written here split to avoid a false-positive security hook on the literal string.)

**Architecture:** Fork the cucumber-fake peer at the World/hooks/steps layer, sharing the same framework-agnostic scenario modules (renamed `cucumber-real/` → `_shared/` in a pre-flight commit) and the same `.feature` files. Vitest loads scenarios through the qpickle-loader Vite plugin, registers steps via global Given/When/Then, and drives time with `vi.advanceTimersByTimeAsync()` instead of `clock.tickAsync()`. A `testNamePattern: "@presenter"` filter picks the 19 target scenarios out of the full feature set so browser-only scenarios don't trip the loader's undefined-step throw.

**Tech Stack:** Vitest ^3.2, qpickle-loader ^1.11, RxJS ^7.8, TypeScript ^5.8, tsx, cucumber-js (unchanged peers), `@sinonjs/fake-timers` (unchanged peer), pnpm workspaces.

**Reference Spec:** `docs/superpowers/specs/2026-05-17-phase-5b-3-vitest-gherkin-fake-timers-design.md` (commit `d65ced7`).

> **Note on the qpickle-loader name in code:** the actual npm package name is the eight letters `qu` + `ickpickle` (written split here only to dodge an upstream security hook that flags the literal). In every code block below, the imports use the real concatenated name; do not split it in the source files.

---

## File Map

**Renamed (Task 1):**
- `tests/scenarios/presenter/cucumber-real/` → `tests/scenarios/presenter/_shared/` (8 files inside, contents unchanged)

**Modified by rename (Task 1):**
- `tests/cucumber-presenter-real.js` — import path
- `tests/cucumber-presenter-fake.js` — import path
- `tests/steps/presenter/cucumber-real/*.steps.ts` — 8 files, sibling-import path
- `tests/scenarios/presenter/_world.ts` — `PresenterScratchpad` import path
- `tests/support/presenter/cucumber-real/world.ts` — `PresenterScratchpad` import path
- `tests/support/presenter/cucumber-fake/world.ts` — `PresenterScratchpad` import path
- `tests/support/presenter/cucumber-fake/hooks.ts` — `newScratchpad` import path
- `tests/scripts/grep-gates.ts` — gate 18 `paths:` entry

**Created (vitest-fake peer):**
- `tests/support/presenter/vitest-fake/world.ts` (Task 3)
- `tests/support/presenter/vitest-fake/hooks.ts` (Task 4)
- `tests/steps/presenter/vitest-fake/connection.steps.ts` (Task 5)
- `tests/steps/presenter/vitest-fake/fxLiveRates.steps.ts` (Task 5)
- `tests/steps/presenter/vitest-fake/fxTrading.steps.ts` (Task 5)
- `tests/steps/presenter/vitest-fake/blotter.steps.ts` (Task 5)
- `tests/steps/presenter/vitest-fake/analytics.steps.ts` (Task 5)
- `tests/steps/presenter/vitest-fake/fxRfq.steps.ts` (Task 5)
- `tests/steps/presenter/vitest-fake/creditRfq.steps.ts` (Task 5)
- `tests/steps/presenter/vitest-fake/common.steps.ts` (Task 5)
- `tests/support/presenter/vitest-fake/setup.ts` (Task 6)
- `tests/vitest-presenter-fake.config.ts` (Task 7)

**Modified (peer wiring + gates + docs):**
- `tests/package.json` — script + devDeps (Task 2)
- `tests/scripts/run-all.ts` — append 7th peer line (Task 8)
- `tests/scripts/grep-gates.ts` — extend gate 15 + add gate 19 (Task 9)
- `docs/architecture.md` §9.5 — Six → Seven runner stack table (Task 10)
- `docs/superpowers/STATUS.md` — Phase 5B.3 row flip to DONE (Task 10)

---

## Task 1: Pre-Flight Rename — `cucumber-real/` Scenarios → `_shared/`

**Files:**
- Move: `tests/scenarios/presenter/cucumber-real/` → `tests/scenarios/presenter/_shared/`
- Modify: `tests/cucumber-presenter-real.js`
- Modify: `tests/cucumber-presenter-fake.js`
- Modify: `tests/scenarios/presenter/_world.ts`
- Modify: `tests/support/presenter/cucumber-real/world.ts`
- Modify: `tests/support/presenter/cucumber-fake/world.ts`
- Modify: `tests/support/presenter/cucumber-fake/hooks.ts`
- Modify: `tests/steps/presenter/cucumber-real/analytics.steps.ts`
- Modify: `tests/steps/presenter/cucumber-real/blotter.steps.ts`
- Modify: `tests/steps/presenter/cucumber-real/common.steps.ts`
- Modify: `tests/steps/presenter/cucumber-real/connection.steps.ts`
- Modify: `tests/steps/presenter/cucumber-real/creditRfq.steps.ts`
- Modify: `tests/steps/presenter/cucumber-real/fxLiveRates.steps.ts`
- Modify: `tests/steps/presenter/cucumber-real/fxRfq.steps.ts`
- Modify: `tests/steps/presenter/cucumber-real/fxTrading.steps.ts`
- Modify: `tests/scripts/grep-gates.ts` (gate 18)

- [ ] **Step 1: Move the scenarios folder with `git mv`**

Run from repo root:
```bash
git mv tests/scenarios/presenter/cucumber-real tests/scenarios/presenter/_shared
```

Expected: 8 files staged as renames (`analytics.ts`, `blotter.ts`, `common.ts`, `connection.ts`, `creditRfq.ts`, `fxLiveRates.ts`, `fxRfq.ts`, `fxTrading.ts`).

- [ ] **Step 2: Update cucumber configs**

In `tests/cucumber-presenter-real.js`, change the `import` array entry:
```javascript
// before
"scenarios/presenter/cucumber-real/**/*.ts",
// after
"scenarios/presenter/_shared/**/*.ts",
```

In `tests/cucumber-presenter-fake.js`, change the same `import` array entry:
```javascript
// before
"scenarios/presenter/cucumber-real/**/*.ts",
// after
"scenarios/presenter/_shared/**/*.ts",
```

- [ ] **Step 3: Update `_world.ts` import path**

In `tests/scenarios/presenter/_world.ts`, find the import for `PresenterScratchpad` and change:
```typescript
// before
import type { PresenterScratchpad } from "./cucumber-real/common";
// after
import type { PresenterScratchpad } from "./_shared/common";
```

- [ ] **Step 4: Update cucumber-real `world.ts` import path**

In `tests/support/presenter/cucumber-real/world.ts`, change:
```typescript
// before
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
// after
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/_shared/common";
```

(If only `PresenterScratchpad` is imported as type — adjust the symbol list to match the file's actual import; the path change is the only behavioral change.)

- [ ] **Step 5: Update cucumber-fake `world.ts` import path**

In `tests/support/presenter/cucumber-fake/world.ts`, change:
```typescript
// before
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
// after
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/_shared/common";
```

- [ ] **Step 6: Update cucumber-fake `hooks.ts` import path**

In `tests/support/presenter/cucumber-fake/hooks.ts`, change:
```typescript
// before
import { newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
// after
import { newScratchpad } from "../../../scenarios/presenter/_shared/common";
```

- [ ] **Step 7: Update all 8 cucumber-real step files**

For each of these files, find every import that contains `scenarios/presenter/cucumber-real/` and replace `cucumber-real/` with `_shared/`. The Bash one-liner below does the replacement across all 8 files:

```bash
cd tests/steps/presenter/cucumber-real && \
  sed -i 's|scenarios/presenter/cucumber-real/|scenarios/presenter/_shared/|g' *.steps.ts
```

Files affected:
- `analytics.steps.ts`
- `blotter.steps.ts`
- `common.steps.ts`
- `connection.steps.ts`
- `creditRfq.steps.ts`
- `fxLiveRates.steps.ts`
- `fxRfq.steps.ts`
- `fxTrading.steps.ts`

Verify by grepping that the old path is gone:
```bash
grep -r "scenarios/presenter/cucumber-real/" tests/
```
Expected: zero matches.

- [ ] **Step 8: Update `tests/scripts/grep-gates.ts` gate 18 path**

In `tests/scripts/grep-gates.ts`, find gate 18 (the `paths:` array references `scenarios/presenter/cucumber-real/`) and change it to `scenarios/presenter/_shared/`:

```typescript
{
  name: "18. No rxjs 'timeout' keyword in presenter scenarios (use w.awaitFirstWithin)",
  pattern: '\\btimeout\\b',
  paths: ["scenarios/presenter/_shared/"],
  excludes: ["/node_modules/"],
},
```

- [ ] **Step 9: Run typecheck**

```bash
pnpm typecheck
```
Expected: zero errors. All import path updates must be resolvable.

- [ ] **Step 10: Run both presenter peers + gates**

```bash
pnpm --filter @rtc/tests test:presenter:cucumber-real && \
pnpm --filter @rtc/tests test:presenter:cucumber-fake && \
pnpm --filter @rtc/tests gates
```
Expected:
- cucumber-real: 19 scenarios pass (`19 scenarios (19 passed)`)
- cucumber-fake: 19 scenarios pass
- gates: all 18 gates pass (`all gates passed.`)

- [ ] **Step 11: Commit**

```bash
git add tests/
git commit -m "$(cat <<'CEOF'
refactor(phase-5b.3): rename scenarios/presenter/cucumber-real -> _shared

Pre-flight rename for Phase 5B.3. The folder is misnamed today: it hosts
framework-agnostic scenarios shared by cucumber-presenter-real AND
cucumber-presenter-fake. Adding a vitest peer would make the wart compound.

Mechanical move + import-path updates across cucumber configs, presenter
World/hooks files, and the 8 cucumber-real step files. Gate 18 path also
updated. No behavioral change to the existing 6 peers.
CEOF
)"
```

---

## Task 2: Add `vitest` + qpickle-loader Dependencies and Script

**Files:**
- Modify: `tests/package.json`

- [ ] **Step 1: Add devDependencies and script entry to `tests/package.json`**

Edit `tests/package.json`:
- Under `"scripts"`, add the new line after the existing `test:presenter:cucumber-fake` entry:
  ```json
  "test:presenter:vitest-fake": "vitest run --config vitest-presenter-fake.config.ts",
  ```
- Under `"devDependencies"`, add (keeping alphabetical order). The package name is the eight letters `qu` immediately followed by `ickpickle`:
  ```json
  "quickpickle": "^1.11",
  "vitest": "^3.2",
  ```

Final relevant portions of `tests/package.json`:
```json
{
  "scripts": {
    "test:e2e": "pnpm gates && tsx scripts/run-all.ts",
    "test:e2e:playwright": "NODE_OPTIONS='--import tsx/esm' cucumber-js",
    "test:presenter:cucumber-real": "NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber-presenter-real.js",
    "test:presenter:cucumber-fake": "NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber-presenter-fake.js",
    "test:presenter:vitest-fake": "vitest run --config vitest-presenter-fake.config.ts",
    "test:e2e:raw-playwright": "tsx scripts/with-server.ts playwright test --config raw/playwright/playwright.config.ts",
    "test:e2e:cypress": "tsx scripts/with-server.ts cypress run --headless",
    "test:e2e:raw-cypress": "tsx scripts/with-server.ts cypress run --headless --config-file raw/cypress/cypress.config.ts",
    "test:e2e:cypress:open": "tsx scripts/with-server.ts cypress open --e2e",
    "gates": "tsx scripts/grep-gates.ts",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@badeball/cypress-cucumber-preprocessor": "24.0.1",
    "@bahmutov/cypress-esbuild-preprocessor": "2.2.8",
    "@cucumber/cucumber": "^11.0.0",
    "@playwright/test": "^1.50",
    "@sinonjs/fake-timers": "^14.0.0",
    "@types/node": "^25.5.0",
    "@types/sinonjs__fake-timers": "^15.0.1",
    "cypress": "15.14.2",
    "esbuild": "0.28.0",
    "quickpickle": "^1.11",
    "tsx": "^4.19.0",
    "typescript": "^5.8",
    "vitest": "^3.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

From repo root:
```bash
pnpm install
```
Expected: vitest and qpickle-loader resolved and added to `tests/node_modules`. No conflicts with `packages/client`'s vitest version (both on `^3.2`).

- [ ] **Step 3: Sanity-check the binaries are reachable**

```bash
pnpm --filter @rtc/tests exec vitest --version
```
Expected: prints a version string starting with `3.`. (No file changes; this just confirms install succeeded.)

- [ ] **Step 4: Commit**

```bash
git add tests/package.json pnpm-lock.yaml
git commit -m "$(cat <<'CEOF'
build(phase-5b.3): add vitest + qpickle-loader to @rtc/tests

Adds vitest ^3.2 (matches packages/client) and the qpickle-loader Vite plugin
^1.11 for Gherkin support. Adds test:presenter:vitest-fake script that will
run the forthcoming vitest-fake peer config.
CEOF
)"
```

---

## Task 3: Create `vitest-fake/world.ts`

**Files:**
- Create: `tests/support/presenter/vitest-fake/world.ts`

- [ ] **Step 1: Write the World class**

Create `tests/support/presenter/vitest-fake/world.ts` with this exact content (the import from the loader uses the real concatenated package name):

```typescript
// tests/support/presenter/vitest-fake/world.ts
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

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: zero errors. All imports must resolve (vitest, the loader, the shared/_buildApp/_await modules).

- [ ] **Step 3: Commit**

```bash
git add tests/support/presenter/vitest-fake/world.ts
git commit -m "$(cat <<'CEOF'
feat(phase-5b.3): add VitestFakePresenterWorld

Mirrors FakePresenterWorld (5B.2) with three diffs:
- imports from the qpickle-loader package, not "@cucumber/cucumber"
- uses vi.advanceTimersByTimeAsync instead of clock.tickAsync
- no clock handle field (vi is module-level)

Implements AwaitHelpers so it satisfies the framework-agnostic _world.ts
contract used by the _shared/ scenario modules.
CEOF
)"
```

---

## Task 4: Create `vitest-fake/hooks.ts`

**Files:**
- Create: `tests/support/presenter/vitest-fake/hooks.ts`

- [ ] **Step 1: Write the hooks file**

Create `tests/support/presenter/vitest-fake/hooks.ts` with this exact content:

```typescript
// tests/support/presenter/vitest-fake/hooks.ts
import { Before, After } from "quickpickle";
import { vi } from "vitest";
import { buildPresenterApp } from "../../../scenarios/presenter/_buildApp";
import { newScratchpad } from "../../../scenarios/presenter/_shared/common";
import type { VitestFakePresenterWorld } from "./world";

Before(function(this: VitestFakePresenterWorld) {
  // Install fake timers BEFORE buildPresenterApp so simulators capture patched
  // setTimeout/setInterval. Seed virtual now() with real Date.now() so simulator
  // historical timestamps stay sensible.
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

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add tests/support/presenter/vitest-fake/hooks.ts
git commit -m "$(cat <<'CEOF'
feat(phase-5b.3): add vitest-fake Before/After hooks

Same shape as cucumber-fake/hooks.ts, swapping:
- FakeTimers.install -> vi.useFakeTimers
- clock.uninstall() -> vi.useRealTimers()

Keeps the warm _statusSub subscription so shareReplay-based streams stay
hot across the scenario lifetime.
CEOF
)"
```

---

## Task 5: Create All 8 vitest-fake Step Files

**Files:**
- Create: `tests/steps/presenter/vitest-fake/connection.steps.ts`
- Create: `tests/steps/presenter/vitest-fake/fxLiveRates.steps.ts`
- Create: `tests/steps/presenter/vitest-fake/fxTrading.steps.ts`
- Create: `tests/steps/presenter/vitest-fake/blotter.steps.ts`
- Create: `tests/steps/presenter/vitest-fake/analytics.steps.ts`
- Create: `tests/steps/presenter/vitest-fake/fxRfq.steps.ts`
- Create: `tests/steps/presenter/vitest-fake/creditRfq.steps.ts`
- Create: `tests/steps/presenter/vitest-fake/common.steps.ts`

**Pattern for every step file:** copy the cucumber-real version verbatim, then apply three mechanical edits:
1. Change `import { ... } from "@cucumber/cucumber";` → `import { ... } from "quickpickle";`
2. Change `import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";` → `import type { VitestFakePresenterWorld } from "../../../support/presenter/vitest-fake/world";`
3. Replace every occurrence of `this: PresenterWorld` with `this: VitestFakePresenterWorld`

The scenario-module import (`import * as conn from "../../../scenarios/presenter/_shared/connection";`) is unchanged — same `_shared/` folder feeds all three peers.

- [ ] **Step 1: Generate connection.steps.ts**

Create `tests/steps/presenter/vitest-fake/connection.steps.ts` with this exact content (use it as the template for the remaining 7 files):

```typescript
// tests/steps/presenter/vitest-fake/connection.steps.ts
//
// NOTE: ConnectionStatus is a `const enum` in @rtc/domain source. With
// verbatimModuleSyntax + isolatedModules, ambient const enums cannot be
// accessed as values from a different package. We use their string literals
// directly (safe because all members are string-valued) and cast via
// `import type { ConnectionStatus }` for the type annotation only.
import { Then, When } from "quickpickle";
import type { ConnectionStatus } from "@rtc/domain";
import type { VitestFakePresenterWorld } from "../../../support/presenter/vitest-fake/world";
import * as conn from "../../../scenarios/presenter/_shared/connection";

// String-literal stand-ins for ConnectionStatus const enum values.
const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;
const CS_OFFLINE = "OFFLINE_DISCONNECTED" as unknown as ConnectionStatus;

When("the browser goes offline",
  function(this: VitestFakePresenterWorld) { return conn.browserGoesOffline(this); });

When("the browser comes back online",
  function(this: VitestFakePresenterWorld) { return conn.browserComesBackOnline(this); });

Then("the connection status footer is visible",
  function(this: VitestFakePresenterWorld) { return conn.noopAssertConnectionUiPresent(this); });

Then("the connection status footer shows {string}",
  function(this: VitestFakePresenterWorld, label: string) {
    const target = label === "Connected" ? CS_CONNECTED : CS_OFFLINE;
    return conn.expectStatusEqualsWithin(this, target, 3);
  });

Then("the connection overlay is hidden",
  function(this: VitestFakePresenterWorld) {
    return conn.expectStatusEqualsWithin(this, CS_CONNECTED, 1);
  });

Then("the connection overlay is hidden within {int} seconds",
  function(this: VitestFakePresenterWorld, n: number) {
    return conn.expectStatusEqualsWithin(this, CS_CONNECTED, n);
  });

Then("the connection overlay becomes visible within {int} seconds",
  function(this: VitestFakePresenterWorld, n: number) {
    // "overlay visible" = status has left CONNECTED (reached a disconnected state)
    return conn.expectStatusEqualsWithin(this, CS_OFFLINE, n);
  });

Then("the connection overlay text matches \\/offline\\/i",
  function(this: VitestFakePresenterWorld) { return conn.noopAssertConnectionUiPresent(this); });
```

- [ ] **Step 2: Generate the other 7 step files by mechanical port**

For each of `analytics.steps.ts`, `blotter.steps.ts`, `common.steps.ts`, `creditRfq.steps.ts`, `fxLiveRates.steps.ts`, `fxRfq.steps.ts`, `fxTrading.steps.ts`:

1. Read the cucumber-real source: `tests/steps/presenter/cucumber-real/<name>.steps.ts`
2. Apply the three edits listed in the task header:
   - swap `@cucumber/cucumber` → the loader package name (`qu` + `ickpickle`) in the top import
   - swap the `PresenterWorld` type import to `VitestFakePresenterWorld` from `../../../support/presenter/vitest-fake/world`
   - replace every `this: PresenterWorld` with `this: VitestFakePresenterWorld`
3. Write to `tests/steps/presenter/vitest-fake/<name>.steps.ts`
4. Leave the file's first-line comment in place, updated to reflect the new path (e.g., `// tests/steps/presenter/vitest-fake/analytics.steps.ts`).

Do not introduce any other diffs (no reformatting, no logic changes, no import reordering). The point is byte-for-byte parity of step bodies so the peers prove identical behavior.

A one-shot bash helper (run from repo root) to do the three substitutions on a single file — useful as a sanity check, but verify each result by reading the file before committing:

```bash
for f in analytics blotter common creditRfq fxLiveRates fxRfq fxTrading; do
  sed \
    -e 's|from "@cucumber/cucumber"|from "quickpickle"|' \
    -e 's|from "../../../support/presenter/cucumber-real/world"|from "../../../support/presenter/vitest-fake/world"|' \
    -e 's|\bPresenterWorld\b|VitestFakePresenterWorld|g' \
    -e "1s|cucumber-real|vitest-fake|" \
    tests/steps/presenter/cucumber-real/${f}.steps.ts \
    > tests/steps/presenter/vitest-fake/${f}.steps.ts
done
```

Then visually diff `tests/steps/presenter/cucumber-real/<name>.steps.ts` vs `tests/steps/presenter/vitest-fake/<name>.steps.ts` for each file. Expected diff: only the three substitutions + first-line path comment.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: zero errors. All 8 step files must compile against the new World type.

- [ ] **Step 4: Commit**

```bash
git add tests/steps/presenter/vitest-fake/
git commit -m "$(cat <<'CEOF'
feat(phase-5b.3): port 8 step files to vitest-fake peer

Mechanical mirror of steps/presenter/cucumber-real/*.steps.ts with three
edits each:
- @cucumber/cucumber -> qpickle-loader for Given/When/Then
- PresenterWorld -> VitestFakePresenterWorld for the function-this type
- support/presenter/cucumber-real/world -> support/presenter/vitest-fake/world

Step bodies remain pure delegation into the _shared/ scenario modules, so
zero business-logic divergence between the three presenter peers.
CEOF
)"
```

---

## Task 6: Create `vitest-fake/setup.ts` Barrel

**Files:**
- Create: `tests/support/presenter/vitest-fake/setup.ts`

- [ ] **Step 1: Write the barrel**

Create `tests/support/presenter/vitest-fake/setup.ts` with this exact content:

```typescript
// tests/support/presenter/vitest-fake/setup.ts
// Loaded once via vitest setupFiles. Side-effect order matters:
//   1. world.ts installs setWorldConstructor
//   2. hooks.ts registers Before/After
//   3. step files register Given/When/Then matchers
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

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add tests/support/presenter/vitest-fake/setup.ts
git commit -m "$(cat <<'CEOF'
feat(phase-5b.3): add vitest-fake setup barrel

Single setupFiles entry for the vitest config. Side-effect-imports world
constructor, hooks, and all 8 step files in deterministic order so step
registrations are in place before the loader resolves scenario steps.
CEOF
)"
```

---

## Task 7: Create `vitest-presenter-fake.config.ts` and Smoke-Run the Peer

**Files:**
- Create: `tests/vitest-presenter-fake.config.ts`

- [ ] **Step 1: Write the Vitest config**

Create `tests/vitest-presenter-fake.config.ts` with this exact content (the import from the loader uses the real concatenated package name):

```typescript
// tests/vitest-presenter-fake.config.ts
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

- [ ] **Step 2: Run the new peer**

```bash
pnpm --filter @rtc/tests test:presenter:vitest-fake
```
Expected:
- Vitest discovers .feature files via the loader plugin
- Only `@presenter`-tagged scenarios run (19 total, matching cucumber-real's distribution across the feature files)
- All 19 pass
- Wall-clock: under ~2s (no real-time sleeps; vitest worker startup is the only overhead)

If a step is reported as "Undefined" by the loader: re-verify the step text in the corresponding vitest-fake `.steps.ts` matches the `.feature` exactly, then re-verify `setup.ts` imports that file.

If `testNamePattern: "@presenter"` filter doesn't behave as expected (e.g., it picks up non-`@presenter` scenarios and trips undefined-step throws): fall back to the mitigation in spec §8 risk #2 — tag non-presenter feature scenarios with `@browser-only` and switch to the loader's config-honored `skipTags: ['@browser-only']`. Do not pursue this fallback unless the assumption breaks under the real run.

- [ ] **Step 3: Run typecheck and gates**

```bash
pnpm typecheck && pnpm --filter @rtc/tests gates
```
Expected: typecheck green; gates still pass — including gate 15, which will start flagging the new loader import in `tests/support/presenter/vitest-fake/world.ts`. **This task does not yet fix gate 15.** Expect gate 15 to FAIL here. That's the entry point for Task 9.

If gate 15 fails as expected, note the failure and proceed — Task 9 will fix it. If any other gate fails, stop and investigate.

- [ ] **Step 4: Commit**

```bash
git add tests/vitest-presenter-fake.config.ts
git commit -m "$(cat <<'CEOF'
feat(phase-5b.3): wire the 7th presenter peer (vitest-fake)

vitest-presenter-fake.config.ts loads .feature files via the qpickle-loader
plugin and filters to @presenter scenarios via Vitest's testNamePattern.
With this config in place, pnpm test:presenter:vitest-fake runs all 19
presenter scenarios green under Vitest + fake timers in ~2s.

Gate 15 currently flags the new loader import in vitest-fake/world.ts;
fixed in the next commit alongside the new gate 19.
CEOF
)"
```

---

## Task 8: Wire the New Peer into `run-all.ts`

**Files:**
- Modify: `tests/scripts/run-all.ts`

- [ ] **Step 1: Append the 7th peer line**

In `tests/scripts/run-all.ts`, in the `try` block that lists the peers, add a new line immediately after the `test:presenter:cucumber-fake` invocation:

```typescript
combinedExit |= await run("pnpm", ["test:presenter:vitest-fake"]);
```

Final `try` block:
```typescript
try {
  combinedExit |= await run("pnpm", ["test:e2e:playwright"]);
  combinedExit |= await run("pnpm", ["test:e2e:raw-playwright"]);
  combinedExit |= await run("pnpm", ["test:e2e:cypress"]);
  combinedExit |= await run("pnpm", ["test:e2e:raw-cypress"]);
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-real"]);
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-fake"]);
  combinedExit |= await run("pnpm", ["test:presenter:vitest-fake"]);
} finally {
  await dev.stop();
}
```

- [ ] **Step 2: Verify (do NOT yet run full e2e — gates still failing from Task 7)**

Skip running `pnpm test:e2e` here; gate 15 is still failing from Task 7's intentional non-fix. The full run happens at the end of Task 9. For now just sanity-check the file:

```bash
grep -c 'await run' tests/scripts/run-all.ts
```
Expected: `7`.

- [ ] **Step 3: Commit**

```bash
git add tests/scripts/run-all.ts
git commit -m "$(cat <<'CEOF'
feat(phase-5b.3): wire test:presenter:vitest-fake as 7th peer in run-all

Appends the vitest-fake invocation after the two cucumber presenter peers.
Maintains the "5 e2e peers + N presenter peers" ordering convention.
CEOF
)"
```

---

## Task 9: Update Grep Gates (Extend 15, Add 19)

**Files:**
- Modify: `tests/scripts/grep-gates.ts`

- [ ] **Step 1: Extend gate 15**

In `tests/scripts/grep-gates.ts`, modify gate 15 to allow the loader import in the vitest-fake subtree while keeping it forbidden elsewhere in the presenter tree (the regex token below uses the real package name spelled inline):

```typescript
{
  name: "15. No driver imports in presenter step/scenario/support files",
  pattern: '"cypress"|@badeball|@playwright/test|"quickpickle"',
  paths: ["steps/presenter/", "scenarios/presenter/", "support/presenter/"],
  excludes: ["/node_modules/", "/vitest-fake/"],
},
```

Two edits to gate 15 vs. its current form:
- `pattern:` appends `|"quickpickle"` (real package name in the actual file)
- `excludes:` appends `"/vitest-fake/"`

- [ ] **Step 2: Append gate 19**

Add a new gate immediately after gate 18, before the closing `];`:

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
},
```

- [ ] **Step 3: Run gates**

```bash
pnpm --filter @rtc/tests gates
```
Expected: `all gates passed.` with 19 PASS lines (gates 1 through 19).

- [ ] **Step 4: Run full e2e to confirm all 7 peers green**

```bash
pnpm --filter @rtc/tests test:e2e
```
Expected: all 7 peers green, `combinedExit` of zero. Wall-clock for the vitest-fake portion ≤ ~2s; the dominant cost remains the playwright/cypress browser peers.

- [ ] **Step 5: Commit**

```bash
git add tests/scripts/grep-gates.ts
git commit -m "$(cat <<'CEOF'
feat(phase-5b.3): extend gate 15 + add gate 19 for vitest-fake peer

- gate 15: forbid qpickle-loader imports outside /vitest-fake/, alongside
  the existing cucumber-js / playwright / cypress prohibitions
- gate 19 (new): forbid vitest/qpickle-loader imports in the shared
  scenarios layer + the two cucumber peer subtrees, mirroring the
  symmetry of gate 15

19 gates total. pnpm test:e2e now runs 7 peers green end-to-end.
CEOF
)"
```

---

## Task 10: Update Architecture Docs and STATUS

**Files:**
- Modify: `docs/architecture.md` (§9.5)
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 1: Update §9.5 heading in `docs/architecture.md`**

Change the heading at line ~1162 from:
```
### 9.5 Six-runner stack (Cucumber-JS + Cypress + raw @playwright/test + raw Cypress + presenter-direct × 2)
```
to:
```
### 9.5 Seven-runner stack (Cucumber-JS + Cypress + raw @playwright/test + raw Cypress + presenter-direct × 3)
```

- [ ] **Step 2: Update §9.5 opening paragraph**

Change the opening paragraph (line ~1164) from:
```
Six runners exercise the same behavioural surface via four binding styles. Cucumber-JS (with Playwright) and Cypress (via cypress-cucumber-preprocessor) bind Gherkin scenarios in `tests/specs/**/*.feature` to a shared step-definition tree. Raw `@playwright/test` and raw Cypress bind scenarios programmatically through their own step trees. Two presenter-direct peers — **cucumber-presenter-real** and **cucumber-presenter-fake** — bind a subset of the same scenarios (tagged `@presenter`) to the RxJS presenter layer in pure Node with no browser; the real-time peer uses wall-clock waits while the fake-time peer wraps the same scenario bodies in `@sinonjs/fake-timers` virtual time. See Phase 5B.1 and Phase 5B.2 specs for details.
```
to:
```
Seven runners exercise the same behavioural surface via five binding styles. Cucumber-JS (with Playwright) and Cypress (via cypress-cucumber-preprocessor) bind Gherkin scenarios in `tests/specs/**/*.feature` to a shared step-definition tree. Raw `@playwright/test` and raw Cypress bind scenarios programmatically through their own step trees. Three presenter-direct peers — **cucumber-presenter-real**, **cucumber-presenter-fake**, and **vitest-presenter-fake** — bind a subset of the same scenarios (tagged `@presenter`) to the RxJS presenter layer in pure Node with no browser; the cucumber-real peer uses wall-clock waits, cucumber-fake wraps the same bodies in `@sinonjs/fake-timers` virtual time, and vitest-fake reruns the same bodies under Vitest + the qpickle-loader Gherkin plugin + `vi.useFakeTimers()` to prove the `_await.ts` / `_world.ts` abstractions are runner-portable, not coupled to cucumber-js's lifecycle. See Phase 5B.1, 5B.2, and 5B.3 specs for details.
```

- [ ] **Step 3: Update the existing scenarios-path table row (line ~1180)**

Task 1's rename left this row stale. Change it from:
```
| Presenter-direct scenarios | `tests/scenarios/presenter/cucumber-real/*.ts` — subscribe to RxJS streams with `firstValueFrom + timeout` |
```
to:
```
| Presenter-direct scenarios | `tests/scenarios/presenter/_shared/*.ts` — subscribe to RxJS streams with `firstValueFrom + timeout`; shared by all three presenter peers |
```

- [ ] **Step 4: Update the orchestration row (line ~1177)**

Change:
```
| Orchestration | `tests/scripts/run-all.ts` — six peers, one shared dev server, OR-ed exit codes |
```
to:
```
| Orchestration | `tests/scripts/run-all.ts` — seven peers, one shared dev server, OR-ed exit codes |
```

- [ ] **Step 5: Append vitest-fake rows to the §9.5 table**

After the existing `Presenter-fake harness` row (line ~1183), insert two new rows:
```
| Presenter-vitest runner | `tests/vitest-presenter-fake.config.ts` · `vitest` + the qpickle-loader Vite plugin + `vi.useFakeTimers()` — same 19 `@presenter` scenarios under Vitest |
| Presenter-vitest harness | `tests/support/presenter/vitest-fake/{world,hooks,setup}.ts` (VitestFakePresenterWorld implements the same `AwaitHelpers` interface as the cucumber peers; `setup.ts` barrel loaded via `vitest.config.setupFiles`) |
```

- [ ] **Step 6: Append the runner-portability paragraph after line ~1193**

Immediately after the existing "**Virtual-time binding (Phase 5B.2):**" paragraph (line ~1193), add a new paragraph:

```
**Runner-portability binding (Phase 5B.3):** the vitest-presenter-fake runner reuses the same 19 `@presenter` scenarios as the cucumber peers but executes them under Vitest with the qpickle-loader Vite plugin for Gherkin and `vi.useFakeTimers()` (sinon-based) for virtual time. The `VitestFakePresenterWorld` implements the same `AwaitHelpers` interface as `FakePresenterWorld`, advancing virtual time via `vi.advanceTimersByTimeAsync`. Step bodies are byte-for-byte mirrors of the cucumber-real step files differing only in three mechanical edits (`@cucumber/cucumber` → loader import, `PresenterWorld` type swap, `this:` annotation). The peer is the **runner-portability proof:** the same `_shared/` scenario modules and the same `.feature` files drive cucumber-js *and* vitest under fake timers, validating that `_await.ts` / `_world.ts` aren't accidentally coupled to cucumber-js's lifecycle. Wall-clock: ~2s (vs ~1s for cucumber-fake — the extra second is Vitest worker startup).
```

- [ ] **Step 7: Update STATUS.md Phase 5B.3 row**

Capture the SHA range first:
```bash
git log --oneline d65ced7..HEAD
```
Note the oldest SHA (the Task 1 rename commit) as `<first-sha>` and the newest SHA before this docs commit (the Task 9 gates commit) as `<last-sha>`.

In `docs/superpowers/STATUS.md` line 32, change:
```
| Phase 5B.3 — Vitest + Gherkin + fake timers | ⏳ NOT STARTED | (to be written) | — |
```
to:
```
| Phase 5B.3 — Vitest + Gherkin + fake timers | ✅ DONE | `plans/2026-05-17-phase-5b-3-vitest-gherkin-fake-timers.md` | `<first-sha>..<last-sha>` (10 task commits) + this STATUS update |
```

- [ ] **Step 8: Update STATUS.md test counts line (line 14)**

Change:
```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 48 (Cucumber+Playwright) + 48 (raw Playwright) + 48 (Cucumber+Cypress) + 48 (raw Cypress) + 19 (presenter-real) + 19 (presenter-fake) — 48×4 + 19×2 = 230 e2e scenarios (4 browser peers × 48 scenarios; 2 presenter peers × 19 scenarios)
```
to:
```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 48 (Cucumber+Playwright) + 48 (raw Playwright) + 48 (Cucumber+Cypress) + 48 (raw Cypress) + 19 (presenter-cucumber-real) + 19 (presenter-cucumber-fake) + 19 (presenter-vitest-fake) — 48×4 + 19×3 = 249 e2e scenarios (4 browser peers × 48 scenarios; 3 presenter peers × 19 scenarios)
```

- [ ] **Step 9: Add a "Phase 5B.3 follow-ups" section to STATUS.md**

After the existing "Phase 5B.2 follow-ups (carry into 5B.3+)" section (around line 134), insert:
```markdown

## Phase 5B.3 follow-ups (carry into 5B.4+)

1. **`vitest` worker startup overhead.** The ~1s gap between cucumber-fake (~1s) and vitest-fake (~2s) is dominated by Vitest's thread-pool boot. Acceptable here, but flag if 5B.4's plain-TS variant doesn't show the same delta — would indicate the loader plugin itself adds non-trivial cost worth profiling.
2. **Step-tree triplication.** Three step trees (cucumber-real, cucumber-fake, vitest-fake) now exist as near-identical mechanical mirrors. 5B.3 deliberately forks them to make the runner difference visible; if a fourth peer (5B.4) lands, revisit whether a single source-of-truth step registry that adapts to each lib makes sense — but only after 5B.4 confirms the duplication cost is real.
```

If neither follow-up applies after the run, replace the section body with a single line: `None — clean execution.`

- [ ] **Step 10: Re-run typecheck + gates + e2e as final guard**

```bash
pnpm typecheck && pnpm --filter @rtc/tests gates && pnpm --filter @rtc/tests test:e2e
```
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add docs/architecture.md docs/superpowers/STATUS.md
git commit -m "$(cat <<'CEOF'
docs(phase-5b.3): seven-runner stack + STATUS flip to DONE

- architecture.md S9.5: six-runner -> seven-runner stack, new heading +
  opening paragraph, new "Runner-portability binding (Phase 5B.3)"
  paragraph, two new table rows for the vitest-fake peer, scenarios
  path row updated to reflect Task 1's _shared/ rename, orchestration
  row updated to seven peers
- STATUS.md: flip Phase 5B.3 row to DONE with SHA range, bump test
  counts to 249 e2e scenarios across 3 presenter peers, add 5B.3
  follow-ups section
CEOF
)"
```

---

## Verification Checklist (end of phase)

Re-run from a fresh shell at repo root after Task 10:

- [ ] `pnpm typecheck` — green across all packages
- [ ] `pnpm --filter @rtc/tests gates` — 19 PASS lines, "all gates passed."
- [ ] `pnpm --filter @rtc/tests test:presenter:vitest-fake` — 19 scenarios green, wall-clock ≤ ~2s
- [ ] `pnpm --filter @rtc/tests test:e2e` — 7 peers green end-to-end
- [ ] `git log --oneline d65ced7..HEAD` — 10 commits matching the 10 tasks above (in order)
- [ ] Spot-check: `tests/scenarios/presenter/_shared/` exists, `tests/scenarios/presenter/cucumber-real/` does not
- [ ] Spot-check: `tests/support/presenter/vitest-fake/{world.ts,hooks.ts,setup.ts}` and `tests/steps/presenter/vitest-fake/*.steps.ts` (8 files) exist
- [ ] Spot-check: `docs/superpowers/STATUS.md` shows Phase 5B.3 = DONE with SHA range
