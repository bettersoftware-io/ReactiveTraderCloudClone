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
