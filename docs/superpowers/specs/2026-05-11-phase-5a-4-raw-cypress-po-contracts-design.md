# Phase 5A.4 — Raw Cypress reusing PO contracts (design)

**Date:** 2026-05-11
**Status:** Approved (design); implementation plan to follow.
**Predecessor:** [Phase 5A.3 design](./2026-05-10-phase-5a-3-raw-playwright-po-contracts-design.md) — strict mirror, adapted to Cypress.

---

## 1. Goal

Add `cypress` (raw, no Cucumber) as a fourth e2e peer under `tests/raw/cypress/`, mirroring every Cucumber scenario (40 across 8 feature files) as raw Cypress `it()` calls that reuse the existing Cypress page-objects (`page-objects/cypress/`) and the driver-free `scenarios/*` layer. Wire it as a fourth peer in `tests/scripts/run-all.ts` alongside Cucumber+Playwright, raw Playwright, and Cucumber+Cypress.

**Non-goals:** changing any PO impl, scenario fn, or .feature file; introducing new test cases beyond the 40-scenario set; modifying the existing Cucumber+Cypress runner.

---

## 2. Architecture

Each `tests/specs/<area>.feature` gets a sibling `tests/raw/cypress/<area>.spec.ts`. Test bodies are scenario-call sequences — no direct PO access, no `cy.*` calls, no driver imports. The Cucumber `World` is replaced by a module-level `getCtx()` accessor in `_context.ts` whose `beforeEach` hook builds a fresh `TestContext` per test. Three named helpers in `_openWorkspace.ts` register `beforeEach` hooks for the three Background phrasings observed in the spec set (workspace / fx-workspace / credit-workspace).

The raw Cypress runner uses a **separate** `cypress.config.ts` at `tests/raw/cypress/cypress.config.ts` (no Cucumber preprocessor, no esbuild plugin). The existing `tests/cypress.config.ts` is untouched; it continues to drive the Cucumber+Cypress peer against `specs/**/*.feature`.

Reused as-is:
- `tests/page-objects/cypress/factory.ts` and all `Cypress*` PO impls.
- `tests/scenarios/*.ts` (the driver-free layer).
- `tests/support/testContext.ts` (`TestContext`, `Scratchpad`).

---

## 3. Test-body shape — Task 1 smoke decision

The 5A.3 raw-Playwright bodies are `async ({ ctx }) => { await scenarios.foo(ctx); ... }`. For raw Cypress, two shapes are candidates and **Task 1 picks one via a smoke test**, recording the choice in a single comment on `_context.ts`:

1. **First try — sync, fire-and-forget** (recommended; safest with Cypress's "you returned a promise" runtime check):
   ```ts
   it("theme toggle button is visible", () => {
     const ctx = getCtx();
     theme.expectThemeToggleVisible(ctx);
   });
   ```
   The scenario fn returns a native Promise that resolves through Cypress's command queue (Cypress POs return `cy.wrap(...) as unknown as Promise<void>`). The body discards the Promise; ordering is preserved by the cy queue.

2. **Fallback — async/await mirror** (only if Cypress is observed not to warn about the body returning a native Promise):
   ```ts
   it("theme toggle button is visible", async () => {
     const ctx = getCtx();
     await theme.expectThemeToggleVisible(ctx);
   });
   ```

3. **Hard stop — both shapes fail under Cypress:** halt Phase 5A.4. Open a follow-up note in this spec; request user input. Do not proceed past Task 1.

The fallback ladder is run during Task 1 against ONE simple scenario (e.g. theme's "theme toggle button is visible") shipped as the only `it()` in `theme.spec.ts` in shape 1; if that smoke spec fails under `pnpm --filter @rtc/tests test:e2e:raw-cypress`, retry in shape 2; if both fail, stop. Task 2 then overwrites `theme.spec.ts` with the full 5-scenario port using whichever shape Task 1 confirmed; Tasks 3–9 use the same shape.

### 3.1 Addendum — Cypress PO rewrite, decided after Task 1 + Task 2 attempts

During execution, the §3 hard-stop was reached: shape 1 (sync fire-and-forget) silently breaks multi-call `it()` bodies because Cypress doesn't drain its command queue between synchronous calls (scratchpad side-effects from one scenario fn aren't visible to the next); shape 2 (async/await) fails because `await chainable` in a raw `it()` body does not unwrap a Cypress Chainable to its subject (the `cy.wrap(...) as unknown as Promise<T>` return type lies at runtime). Cucumber+Cypress works around both via the `cucumber-shim.ts` seam, which is unavailable in raw Cypress.

**User decision (2026-05-11):** rewrite every Cypress PO method to return a **real native Promise** that resolves only after the queued `cy.*` commands complete. Pattern:

```ts
ariaLabel(): Promise<string> {
  return new Promise<string>((resolve) => {
    cy.get(/* ... */).then(($el) => resolve($el.attr("aria-label") ?? ""));
  });
}
```

This makes the PO contract honest at runtime (`Promise<T>` no longer lies). Scenarios' `await ctx.po.x.method()` calls then yield the actual subject. Raw Cypress test bodies adopt shape 2 (async/await) cleanly; Cucumber+Cypress remains green because the `cucumber-shim.ts` already discards native Promise returns from step handlers and orders via the cy queue.

Affected files: all 10 PO impls under `tests/page-objects/cypress/`. The PO contracts in `tests/page-objects/contracts/` are unchanged. Spec §1 non-goal "changing any PO impl" is **expressly overridden** by this addendum.

Acceptance criteria for the rewrite commit:
- `pnpm --filter @rtc/tests test:e2e:cypress` continues to pass 40/40 (Cucumber+Cypress regression-free).
- `pnpm --filter @rtc/tests test:e2e:raw-cypress` passes the existing single-`it()` smoke spec.
- `pnpm --filter @rtc/tests test:e2e:raw-playwright` and `test:e2e:playwright` are unaffected.
- `_context.ts` line 2 comment updated to `// Body shape: async/await — see Phase 5A.4 spec §3.1.`

### 3.2 Addendum — §3.1 superseded; shape 3 (`cy.then` wrap) chosen

The §3.1 PO rewrite was necessary-but-insufficient: even with real native PO Promises, an async `it()` body still fails between awaits because the cy command queue drains between them, and the next PO call queues cy commands after Cypress has declared the test "done" — yielding `CypressError: Cypress test was stopped while running this command`. The single-`it()` smoke masks this because there's nothing queued after the first await.

**User decision (2026-05-11):** revert the §3.1 PO rewrite (commit `4fc1148`) and adopt **shape 3** — wrap every `it()` body in a `cy.then(async () => { ... })` call. Pattern:

```ts
it("clicking theme toggle changes the theme", () => {
  cy.then(() => (async () => {
    const ctx = getCtx();
    await theme.toggleAndCaptureBackgrounds(ctx);
    await theme.expectBackgroundChanged(ctx);
  })());
});
```

Why this works: `cy.then(cb)` is a single Cypress command. Its callback can return a Promise; Cypress's queue treats the command as in-flight until that Promise resolves. All `await`s inside the callback execute inside this single command, so new cy commands queued by later awaits land in the still-alive queue and never trigger "test was stopped." The PO impls revert to returning Cypress Chainables cast as `Promise<T>` (the original 5A.2 pattern), which is fine inside a `cy.then` async callback because Cypress's Chainable thenable contract resolves correctly under that context.

Gate 14 (no `cy.*` in raw Cypress test bodies) requires a one-line tweak: exclude the `cy.then(` wrapper opener at the top of each `it()` body. The pattern adjustment: gate the `cy.X` pattern but EXCLUDE `cy\.then\(` AS THE FIRST `cy.*` CALL — equivalently, scope the gate so `cy.then(...)` IS allowed but no other `cy.*` is. Concretely: change gate 14's pattern from `\\bcy\\.` to `\\bcy\\.(?!then\\()`, which matches any `cy.X` where X is not `then(`. The existing `_context.ts` exclude continues to apply.

Affected files when this decision is executed:
- `tests/page-objects/cypress/*.ts` (all 10 PO impls): revert via `git revert 4fc1148` to the chainable-cast pattern.
- `tests/raw/cypress/_context.ts` line 2: set to `// Body shape: cy.then-wrapped async — see Phase 5A.4 spec §3.2.`
- `tests/raw/cypress/*.spec.ts`: every `it()` body uses the shape 3 pattern.
- Task 11's gate 14 pattern: `\\bcy\\.(?!then\\()` instead of `\\bcy\\.`.

Acceptance criteria for the shape-3 adoption:
- `pnpm --filter @rtc/tests test:e2e:cypress` continues to pass 40/40 (revert restores the working chainable-cast POs).
- `pnpm --filter @rtc/tests test:e2e:raw-cypress` passes the full theme.spec.ts (5 scenarios) after the Task 2 rewrite.
- `pnpm --filter @rtc/tests test:e2e:raw-playwright` and `test:e2e:playwright` are unaffected.

### 3.3 Addendum — final approach: forked Cypress scenarios layer

§3.2's shape 3 also failed in practice:
- **Shape 3 + chainable-cast POs:** `await chainable` inside the `cy.then` async IIFE still resolves to `undefined`, not the subject — same failure mode as §3.1's diagnosis but now manifesting inside the cy.then wrap.
- **Shape 3 + §3.1's native-Promise POs:** triggers `CypressError: cy.then() timed out after waiting 10000ms — your callback function returned a promise that never resolved`. Deadlock: the async IIFE awaits a PO Promise; the PO Promise resolves only when its queued cy command runs; the queued cy command can't run because Cypress is blocked waiting for the cy.then callback's outer Promise. The native Promise wrapper broke Cypress's queue-awareness.

Four distinct combinations have now failed:

| Test body shape | PO impl | Failure mode |
|---|---|---|
| 1 (sync fire-and-forget) | Chainable-cast | Multi-call ordering broken; scratchpad reads return undefined |
| 2 (async/await) | Chainable-cast | `await chainable === undefined` |
| 3 (cy.then wrap) | Chainable-cast | `await chainable === undefined` (same) |
| 3 (cy.then wrap) | Native Promise (§3.1) | cy.then callback Promise never resolves (deadlock) |

**Diagnosis of the deeper problem.** The shared `tests/scenarios/*.ts` layer is written for **Playwright's Promise-native model** — each scenario fn is `async` and `await`s PO methods. This works in raw Playwright (Promise-native runtime) and in Cucumber+Cypress (cucumber-shim provides a per-step queue-drain bridge that converts step boundaries into cy.wrap(undefined) handoffs). It does NOT work in raw Cypress because:
- Cypress is queue-native, not Promise-native. The cy command queue serializes work, not JS `await`.
- An entire scenario in raw Cypress is one `it()` body with multiple PO calls. There's no per-PO-call queue boundary equivalent to Cucumber's per-step boundary.
- `await chainable` in a raw Cypress `it()` body does not propagate the chainable's subject through `then(cb).then(resolve)` chains — observed empirically on Cypress 15.14.2.

**User decision (2026-05-15):** abandon the "raw Cypress reuses shared scenarios" goal. Replace it with a narrower but still valuable goal: **raw Cypress and raw Playwright test files look structurally similar, so migration between them is almost mechanical**. The abstraction sharing happens at the contract layer (PO contracts + testids + strings + `.feature` files) and at the Cucumber+X stack level (full sharing); the raw Cypress runner forks scenarios.

**New architecture:**
- `tests/page-objects/cypress/*.ts` — Cypress PO impls, **chainable-cast-as-Promise** pattern (the original, pre-§3.1 form). Unchanged. Works for Cucumber+Cypress (shared by step defs) and for the new Cypress-scenarios layer (which never `await`s the result; only `.then(cb)` on the runtime chainable).
- `tests/scenarios/*.ts` — shared async scenarios. Unchanged. Used by Cucumber+Playwright, Cucumber+Cypress (via step defs), and raw Playwright.
- `tests/scenarios/cypress/*.ts` — **NEW parallel layer for raw Cypress only**. Each fn has the same name and signature as its `tests/scenarios/*.ts` sibling but synchronous (no `async`, no `await`, returns `void`). Bodies use the runtime chainable nature of POs to chain via `.then(cb)` for value reads and `.should(...)` for assertions; the cy queue handles ordering. Cross-PO-call scratchpad reads use `cy.then(() => { ... })` to ensure the read happens after the queue drains.
- Raw Cypress test bodies — **synchronous `it()` bodies that call cypress-scenario fns directly**. No `async`/`await`, no `cy.then` wrapper. Structurally similar to raw Playwright bodies: same describe/it shape, same scenario-fn names, same call order. The visual diff between a raw Playwright `.spec.ts` and the equivalent raw Cypress `.spec.ts` is exactly four mechanical substitutions: `test.describe → describe`, `test → it`, `async ({ ctx }) =>` → `() => { const ctx = getCtx();`, `await scenarios.foo(ctx)` → `scenarios.foo(ctx)`.

**Reference comparison — the proof of "migration is mechanical":**

Raw Playwright (`tests/raw/playwright/theme.spec.ts`):
```ts
import * as theme from "../../scenarios/theme";
import * as common from "../../scenarios/common";

test.describe("Theme", () => {
  withWorkspaceOpen();
  test("clicking theme toggle changes the theme", async ({ ctx }) => {
    await theme.toggleAndCaptureBackgrounds(ctx);
    await theme.expectBackgroundChanged(ctx);
  });
});
```

Raw Cypress (`tests/raw/cypress/theme.spec.ts`):
```ts
import { getCtx } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";
import * as theme from "../../scenarios/cypress/theme";
import * as common from "../../scenarios/cypress/common";

describe("Theme", () => {
  withWorkspaceOpen();
  it("clicking theme toggle changes the theme", () => {
    const ctx = getCtx();
    theme.toggleAndCaptureBackgrounds(ctx);
    theme.expectBackgroundChanged(ctx);
  });
});
```

**Sample `scenarios/cypress/theme.ts` body (one fn):**

```ts
import type { TestContext } from "../../support/testContext";
import { assertTrue, assertNotEqual } from "../assert";

const chainable = <T>(p: Promise<T>): Cypress.Chainable<T> =>
  p as unknown as Cypress.Chainable<T>;

export function toggleAndCaptureBackgrounds(ctx: TestContext): void {
  chainable(ctx.po.workspace.rootBackgroundColor())
    .then((c) => { ctx.scratch.theme.backgroundBefore = c; });
  ctx.po.themeToggle.click();
  chainable(ctx.po.workspace.rootBackgroundColor())
    .then((c) => { ctx.scratch.theme.backgroundAfter = c; });
}

export function expectBackgroundChanged(ctx: TestContext): void {
  cy.then(() => {
    assertNotEqual(
      ctx.scratch.theme.backgroundBefore,
      ctx.scratch.theme.backgroundAfter,
      "background colour to change after theme toggle",
    );
  });
}
```

The `chainable<T>(p)` cast helper localizes the type-lie to the cypress-scenarios layer. The `cy.then(() => assert(...))` wrap in `expectBackgroundChanged` ensures the scratchpad read happens after the queue drains.

**Why this proves the user's point:** the Cucumber+X stacks share `tests/scenarios/*.ts` AND `tests/steps/*.ts` AND `.feature` files (with only PO impls forking). The raw stacks must fork their test files (Playwright `test.describe`/`test` vs Cypress `describe`/`it` is a hard Mocha-vs-Playwright boundary) AND the cypress raw stack must fork scenarios. **Cucumber shares strictly more**: features, step defs, scenarios. **Raw stacks share less**: only PO contracts. The forked-scenarios approach demonstrates that even with the fork, migration is mechanical because the structure is preserved 1:1.

**Affected files when this decision is executed:**
- `tests/page-objects/cypress/*.ts`: chainable-cast pattern (revert §3.1 if currently rewritten — done via `git revert 9237a31` on 2026-05-16, commit `8047ce1`).
- `tests/raw/cypress/_context.ts` line 2: set to `// Body shape: sync, fire-and-forget; scenarios forked under tests/scenarios/cypress/ — see Phase 5A.4 spec §3.3.`
- NEW: `tests/scenarios/cypress/` directory with per-area `.ts` files (theme, common, connection, analytics, fxLiveRates, fxTrading, fxRfq, creditRfq, blotter) created task-by-task alongside their `tests/raw/cypress/*.spec.ts` siblings.
- `tests/raw/cypress/*.spec.ts`: synchronous `it()` bodies calling forked scenarios.
- Task 11's gate 14: pattern remains `\\bcy\\.` (no `cy.then(` wrapper opener exception needed since `cy.*` doesn't appear in raw test bodies under §3.3 — only in `scenarios/cypress/`). Gate 14 now also implicitly forbids any `cy.*` in `scenarios/cypress/` if scoped to `raw/cypress/` only. Scope adjustment may be needed depending on enforcement intent.

**Acceptance criteria for §3.3 (Task 2 retry):**
- `pnpm --filter @rtc/tests test:e2e:raw-cypress` passes 5/5 (theme.spec.ts in shape §3.3).
- `pnpm --filter @rtc/tests test:e2e:cypress` continues to pass 40/40 (PO chainable-cast pattern restored).
- `pnpm --filter @rtc/tests test:e2e:raw-playwright` and `test:e2e:playwright` are unaffected.

---

## 4. File layout

```
tests/
  raw/
    cypress/
      .gitkeep                            DELETED   (replaced by real files)
      cypress.config.ts                   NEW
      _context.ts                         NEW
      _openWorkspace.ts                   NEW
      theme.spec.ts                       NEW       (5 scenarios; withWorkspaceOpen)
      connection.spec.ts                  NEW       (4 scenarios; withWorkspaceOpen)
      analytics.spec.ts                   NEW       (4 scenarios; withFxWorkspaceOpen)
      fxLiveRates.spec.ts                 NEW       (6 scenarios; withFxWorkspaceOpen)
      fxTrading.spec.ts                   NEW       (5 scenarios; withFxWorkspaceOpen)
      fxRfq.spec.ts                       NEW       (2 scenarios; withFxWorkspaceOpen)
      creditRfq.spec.ts                   NEW       (7 scenarios; withCreditWorkspaceOpen)
      blotter.spec.ts                     NEW       (7 scenarios; withFxWorkspaceOpen)
  package.json                            MODIFIED  (add `test:e2e:raw-cypress`)
  scripts/
    run-all.ts                            MODIFIED  (4 peers)
    grep-gates.ts                         MODIFIED  (gates 12–14)

docs/superpowers/STATUS.md                MODIFIED  (test-counts + 5A.4 row + follow-ups)
```

Total new files: 11. Modified files: 4 (`package.json`, `run-all.ts`, `grep-gates.ts`, `STATUS.md`). One deletion: `tests/raw/cypress/.gitkeep`.

---

## 5. Components

### 5.1 `tests/raw/cypress/cypress.config.ts`

```ts
import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "raw/cypress/**/*.spec.ts",
    supportFile: "raw/cypress/_context.ts",
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10_000,
  },
});
```

- No `setupNodeEvents` — no Cucumber preprocessor, no esbuild plugin. Cypress 15's built-in TS preprocessor handles `.ts` discovery.
- `supportFile` points at `_context.ts` so its module-level `beforeEach`/`afterEach` are loaded once per spec file run.
- Working directory is `tests/` (cwd of `pnpm --filter @rtc/tests`).

If the built-in preprocessor turns out to be insufficient (e.g. cross-file path resolution issues), fall back to adding `@bahmutov/cypress-esbuild-preprocessor` *without* the cucumber plugin. This is not expected; flag as a follow-up if it occurs.

### 5.2 `tests/raw/cypress/_context.ts`

```ts
import type { TestContext } from "../../support/testContext";
import { Scratchpad } from "../../support/testContext";
import { buildCypressPageObjects } from "../../page-objects/cypress/factory";

let currentCtx: TestContext | null = null;

beforeEach(() => {
  currentCtx = {
    po: buildCypressPageObjects(),
    scratch: new Scratchpad(),
  };
});

afterEach(() => {
  currentCtx = null;
});

export function getCtx(): TestContext {
  if (!currentCtx) throw new Error("ctx not available outside it()/beforeEach");
  return currentCtx;
}
```

- The only file in `tests/raw/cypress/` allowed to import from `page-objects/`.
- Module-scoped mutable `currentCtx` is acceptable here because Cypress isolates Mocha state per spec file (each spec file runs in a fresh browser context).
- No `cy.visit("/")` — Background helpers in `_openWorkspace.ts` own that.

### 5.3 `tests/raw/cypress/_openWorkspace.ts`

```ts
import { getCtx } from "./_context";
import * as common from "../../scenarios/common";

export const withWorkspaceOpen       = (): void => { beforeEach(() => { common.openWorkspace(getCtx()); }); };
export const withFxWorkspaceOpen     = (): void => { beforeEach(() => { common.openFxWorkspace(getCtx()); }); };
export const withCreditWorkspaceOpen = (): void => { beforeEach(() => { common.openCreditWorkspace(getCtx()); }); };
```

Each helper, when called inside a `describe()`, registers a Mocha `beforeEach` that runs *after* `_context.ts`'s `beforeEach` (registration order) and *before* the test body. Async scenario fns are called without `await`; the cy queue handles ordering.

### 5.4 Test-body template (representative — `theme.spec.ts`)

```ts
import { getCtx } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";
import * as theme from "../../scenarios/theme";
import * as common from "../../scenarios/common";

describe("Theme", () => {
  withWorkspaceOpen();

  it("theme toggle button is visible", () => {
    const ctx = getCtx();
    theme.expectThemeToggleVisible(ctx);
  });

  it("clicking theme toggle changes the theme", () => {
    const ctx = getCtx();
    theme.toggleAndCaptureBackgrounds(ctx);
    theme.expectBackgroundChanged(ctx);
  });

  // ... 3 more scenarios mirroring tests/raw/playwright/theme.spec.ts
});
```

The other 7 spec files follow the same shape, scenario-by-scenario, mirroring the 5A.3 templates 1:1. Cross-area scenario re-use mirrors 5A.3 exactly:
- `theme.expectFirstPriceTileVisible` is reused by `analytics.spec.ts` (scenario 4) and the theme tab-switching scenario.
- `theme.expectCreditNavVisible` is reused by `creditRfq.spec.ts` (scenario 1).
- `fxLiveRates.waitSeconds` is reused by `blotter.spec.ts` and `fxTrading.spec.ts` (still mis-located per the 5A.3 follow-up; not fixed here).
- `fxTrading.expectBlotterVisible` / `expectBlotterHasAtLeastNRows` / `clickBuyOnFirstTile` / `setFirstTileNotional` are reused across `blotter.spec.ts`, `fxTrading.spec.ts`, and `fxRfq.spec.ts`.

The two `expectTradeConfirmationMatchesOneOf` call shapes are mirrored:
- Without timeout: `fxTrading.expectTradeConfirmationMatchesOneOf(ctx, "/Executing/i, /You Bought/i, /rejected/i")`
- With timeout: `fxTrading.expectTradeConfirmationMatchesOneOf(ctx, "/.../i", 10_000)`

### 5.5 Per-file scenario counts (must match 5A.3 totals)

| File | Background helper | Scenarios |
|---|---|---|
| theme.spec.ts | withWorkspaceOpen | 5 |
| connection.spec.ts | withWorkspaceOpen | 4 |
| analytics.spec.ts | withFxWorkspaceOpen | 4 |
| fxLiveRates.spec.ts | withFxWorkspaceOpen | 6 |
| fxTrading.spec.ts | withFxWorkspaceOpen | 5 |
| fxRfq.spec.ts | withFxWorkspaceOpen | 2 |
| creditRfq.spec.ts | withCreditWorkspaceOpen | 7 |
| blotter.spec.ts | withFxWorkspaceOpen | 7 |
| **Total** | | **40** |

---

## 6. `tests/package.json` `scripts`

Full updated block:

```jsonc
{
  "scripts": {
    "test:e2e":                "pnpm gates && tsx scripts/run-all.ts",
    "test:e2e:playwright":     "NODE_OPTIONS='--import tsx/esm' cucumber-js",
    "test:e2e:raw-playwright": "tsx scripts/with-server.ts playwright test --config raw/playwright/playwright.config.ts",
    "test:e2e:cypress":        "tsx scripts/with-server.ts cypress run --headless",
    "test:e2e:raw-cypress":    "tsx scripts/with-server.ts cypress run --headless --config-file raw/cypress/cypress.config.ts",
    "test:e2e:cypress:open":   "tsx scripts/with-server.ts cypress open --e2e",
    "gates":                   "tsx scripts/grep-gates.ts",
    "typecheck":               "tsc --noEmit"
  }
}
```

No new dependencies are needed: `cypress` is already a devDependency, and `tsx`/`tests/tsconfig.json` already cover `raw/**/*.ts`.

---

## 7. `tests/scripts/run-all.ts` — 4 peers

```ts
#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import { startDevServer } from "../support/devServer";

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
    child.on("exit", (c) => resolve(c ?? 1));
  });
}

const dev = await startDevServer();
let combinedExit = 0;
try {
  combinedExit |= await run("pnpm", ["test:e2e:playwright"]);
  combinedExit |= await run("pnpm", ["test:e2e:raw-playwright"]);
  combinedExit |= await run("pnpm", ["test:e2e:cypress"]);
  combinedExit |= await run("pnpm", ["test:e2e:raw-cypress"]);
} finally {
  await dev.stop();
}
process.exit(combinedExit);
```

Two Cypress peers run sequentially behind one shared dev server. Cypress isn't reentrant within a single binary invocation, but two separate `cypress run` calls back-to-back are fine. Exit codes are OR-ed so any failure surfaces.

---

## 8. Grep gates 12–14

Append to `tests/scripts/grep-gates.ts` after gate 11:

```ts
{
  name: "12. No driver imports in raw Cypress test bodies",
  pattern: '"cypress"|@badeball|@playwright/test',
  paths: ["raw/cypress/"],
  excludes: ["/node_modules/", "raw/cypress/cypress.config.ts", "raw/cypress/_context.ts"],
},
{
  name: "13. No direct ctx.po.* access in raw Cypress test bodies",
  pattern: 'ctx\\.po\\.',
  paths: ["raw/cypress/"],
  excludes: ["/node_modules/", "raw/cypress/_context.ts"],
},
{
  name: "14. No direct cy.* calls in raw Cypress test bodies",
  pattern: '\\bcy\\.',
  paths: ["raw/cypress/"],
  excludes: ["/node_modules/", "raw/cypress/_context.ts"],
},
```

Notes:
- Gate 12 excludes `cypress.config.ts` (imports `cypress`) and `_context.ts` (no driver import expected, but listed defensively).
- Gates 13 and 14 exclude `_context.ts` only — `_openWorkspace.ts` calls scenario fns via `getCtx()`, never `ctx.po.*` or `cy.*` directly.
- Gate 12's pattern matches `"cypress"` (with quotes) so it doesn't false-positive on filenames or comments containing the word "cypress".

---

## 9. STATUS updates (Tasks 10 and 12)

**Test-counts line** in `docs/superpowers/STATUS.md` "Current state" section:

Before:
```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 40 e2e (Cucumber+Playwright) + 40 e2e (raw Playwright) + 40 e2e (Cucumber+Cypress)
```

After:
```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 40 e2e (Cucumber+Playwright) + 40 e2e (raw Playwright) + 40 e2e (Cucumber+Cypress) + 40 e2e (raw Cypress)
```

**Phase 5A.4 row:** flip from ⏳ NOT STARTED to ✅ DONE with plan path `plans/2026-05-11-phase-5a-4-raw-cypress-po-contracts.md` and the captured SHA range. "Last updated" bumped to current date. New "Phase 5A.4 follow-ups (carry into Phase 5B+)" section appended only if observations surface.

---

## 10. Verification command (run between tasks)

```bash
pnpm install --filter @rtc/tests --frozen-lockfile \
  && pnpm typecheck \
  && pnpm --filter @rtc/tests test:e2e:raw-cypress \
  && pnpm --filter @rtc/tests test:e2e:cypress \
  && pnpm --filter @rtc/tests test:e2e:raw-playwright \
  && pnpm --filter @rtc/tests test:e2e:playwright
```

After Task 10 also: `pnpm test:e2e` (umbrella, gates + 4 runners).

---

## 11. Task breakdown (12 tasks; mirrors 5A.3)

1. **Scaffold** — `cypress.config.ts`, `_context.ts`, `_openWorkspace.ts`, smoke spec resolving body shape (§3 fallback ladder), `package.json` script, delete `.gitkeep`.
2. **Port `theme.feature` → `theme.spec.ts`** (5 scenarios; `withWorkspaceOpen`).
3. **Port `connection.feature` → `connection.spec.ts`** (4; `withWorkspaceOpen`).
4. **Port `analytics.feature` → `analytics.spec.ts`** (4; `withFxWorkspaceOpen`).
5. **Port `fxLiveRates.feature` → `fxLiveRates.spec.ts`** (6; `withFxWorkspaceOpen`).
6. **Port `fxTrading.feature` → `fxTrading.spec.ts`** (5; `withFxWorkspaceOpen`).
7. **Port `fxRfq.feature` → `fxRfq.spec.ts`** (2; `withFxWorkspaceOpen`).
8. **Port `creditRfq.feature` → `creditRfq.spec.ts`** (7; `withCreditWorkspaceOpen`).
9. **Port `blotter.feature` → `blotter.spec.ts`** (7; `withFxWorkspaceOpen`) — full 40 reached.
10. **Wire into `run-all.ts`** + STATUS test-counts line.
11. **Add grep gates 12–14**.
12. **Close-out** — STATUS phase row + SHA range + follow-ups.

---

## 12. Post-conditions (must hold after Task 12)

- `git log --oneline origin/main..HEAD` shows 13 new commits relative to the 5A.4 starting commit (1 spec + 12 task commits).
- `pnpm test:e2e` passes — 14 gates + 4 e2e runners (40 each, 160 total) + dev server orchestration.
- `pnpm typecheck` passes across all workspaces.
- `tests/raw/cypress/` contains: `cypress.config.ts`, `_context.ts`, `_openWorkspace.ts`, 8 `*.spec.ts` files. No `.gitkeep`.
- `pnpm --filter @rtc/tests gates` reports 14 passing gates.
- `STATUS.md`:
  - Phase 5A.4 row is ✅ DONE with a SHA range and plan path filled in.
  - "Last updated" reflects the close-out date.
  - Test-counts line includes "40 e2e (raw Cypress)".

---

## 13. Risks and open issues (carry into the implementation plan)

1. **§3 hard-stop is real, not theoretical.** If both body shapes fail under Cypress's runtime checks, work halts at Task 1 of the implementation plan. The plan author must run Task 1's smoke and confirm a passing shape *before* writing the concrete bodies for Tasks 2–9 — those tasks' templates in §5.4 assume shape 1, and need a one-line rewrite if shape 2 wins.
2. **Cypress 15 built-in TS preprocessor.** If it can't resolve cross-package paths (e.g. `../../scenarios/theme`), the fallback is `@bahmutov/cypress-esbuild-preprocessor` without the Cucumber plugin. Flag as an exec-time follow-up, don't pre-add it.
3. **Two Cypress peers, one dev server.** Sequential invocation behind `with-server.ts` is the chosen safe path. Parallel Cypress peers are explicitly out of scope.
4. **Carry-over follow-ups from 5A.3** (`waitSeconds` mis-located; `tests/.gitignore` redundancy) are NOT addressed in 5A.4 — they remain on the follow-up list.
