# Phase 5A.3 — Raw Playwright reusing PO contracts (design)

**Date:** 2026-05-10
**Status:** approved for plan-writing
**Predecessor:** Phase 5A.2 (`docs/superpowers/specs/2026-05-10-phase-5a-2-cypress-cucumber-design.md`)
**Successor (planned):** Phase 5A.4 — Raw Cypress reusing PO contracts

---

## 1. Goal & non-goals

**Goal.** Add a third end-to-end runner — `@playwright/test` driving the existing Playwright page-object impls (`tests/page-objects/playwright/`) and the driver-free scenarios layer (`tests/scenarios/`) — at full parity with the 40 Cucumber scenarios (8 feature files). Run it as a peer alongside Cucumber+Playwright and Cucumber+Cypress under `tests/scripts/run-all.ts`, sharing one dev server.

The architectural value: proving the contract layer (`tests/page-objects/contracts/`) and scenarios layer are *runner-binding-agnostic*. Today Cucumber binds Gherkin steps to scenario calls; raw Playwright binds `test()` bodies to scenario calls. The intermediate code is unchanged.

**Non-goals.**

- No new behavioural coverage. The `.feature` files in `tests/specs/` and the functions in `tests/scenarios/` are unchanged.
- No new PO contracts. No new entries in `TESTIDS` or `STRINGS`.
- No 5A.2 follow-ups (CypressWorkspace idiom unification, cucumber-shim `isCyElement` guard, STRINGS coverage expansion). Deferred to a dedicated phase or absorbed in 5A.4.
- No cross-browser projects. Chromium only — matches the existing Cucumber+Playwright surface; keeps runtime growth bounded.
- No replacement of Cucumber+Playwright. Both runners coexist for the duration of this and subsequent phases.

---

## 2. Architecture & file layout

```
tests/
  package.json                                       MODIFIED (add `test:e2e:raw-playwright`)
  .gitignore                                         MODIFIED (add `test-results/`)
  scripts/
    run-all.ts                                       MODIFIED (3 peers, OR-ed exit codes)
    grep-gates.ts                                    MODIFIED (3 new gates: §7)
  raw/
    playwright/
      playwright.config.ts                           NEW  (Chromium project, baseURL, testDir=".")
      _context.ts                                    NEW  (Playwright fixture: { ctx: TestContext })
      _openWorkspace.ts                              NEW  (3 named Background helpers)
      theme.spec.ts                                  NEW
      connection.spec.ts                             NEW
      analytics.spec.ts                              NEW
      fxLiveRates.spec.ts                            NEW
      fxTrading.spec.ts                              NEW
      fxRfq.spec.ts                                  NEW
      creditRfq.spec.ts                              NEW
      blotter.spec.ts                                NEW
    cypress/                                         UNCHANGED (5A.4 placeholder)
```

**Sibling-of-not-under.** `tests/raw/playwright/` sits next to `tests/steps/`, `tests/scenarios/`, and `tests/page-objects/playwright/`. It imports POs (via the factory) and scenarios via relative paths. It never imports from `tests/steps/` or `tests/support/playwright/` — those exist to serve Cucumber-JS's `World`/`Hooks` model, which raw Playwright replaces with its own fixture (§3).

**Leading-underscore convention for non-test helpers.** `@playwright/test` discovers tests via `testMatch: "**/*.spec.ts"` by default. Helper files are prefixed `_` (e.g. `_context.ts`, `_openWorkspace.ts`) so the runner skips them without needing an explicit exclude glob.

**No new dependencies.** `@playwright/test` 1.50 is already in `tests/package.json` — used today by the Cucumber+Playwright suite for `Browser` and `Page` types. Raw Playwright reuses the same package's `test`/`expect` exports plus `defineConfig`/`devices` for the config.

---

## 3. TestContext factory + Playwright fixture

Cucumber+Playwright builds a `PlaywrightWorld` per scenario; that World owns `ctx: TestContext`. Raw Playwright replaces the `World` with a Playwright **fixture** that does the same job, exported as a shadowed `test`:

```ts
// tests/raw/playwright/_context.ts
import { test as base, type Page } from "@playwright/test";
import type { TestContext } from "../../support/testContext";
import { Scratchpad } from "../../support/testContext";
import { buildPlaywrightPageObjects } from "../../page-objects/playwright/factory";

export const test = base.extend<{ ctx: TestContext }>({
  ctx: async ({ page }, use) => {
    const ctx: TestContext = {
      po: buildPlaywrightPageObjects(page),
      scratch: new Scratchpad(),
    };
    await use(ctx);
  },
});

export { expect } from "@playwright/test";
```

Every spec file imports `test` from `./_context` — *not* from `@playwright/test`. The fixture rebuilds POs and a fresh `Scratchpad` per test, mirroring `PlaywrightWorld`'s per-scenario lifecycle.

### 3.1 Background helpers — three named functions, not one parameterised helper

The 8 `.feature` files declare three distinct Backgrounds (verified during design):

| Background line | Scenario fn | Used by |
|---|---|---|
| `the trader has the workspace open`     | `common.openWorkspace(ctx)`       | connection, theme |
| `the trader has the FX workspace open`  | `common.openFxWorkspace(ctx)`     | analytics, blotter, fxLiveRates, fxRfq, fxTrading |
| `the credit workspace is open`          | `common.openCreditWorkspace(ctx)` | creditRfq |

Three named helpers, one per Background, in `_openWorkspace.ts`:

```ts
// tests/raw/playwright/_openWorkspace.ts
import { test } from "./_context";
import * as common from "../../scenarios/common";

export const withWorkspaceOpen       = () => test.beforeEach(({ ctx }) => common.openWorkspace(ctx));
export const withFxWorkspaceOpen     = () => test.beforeEach(({ ctx }) => common.openFxWorkspace(ctx));
export const withCreditWorkspaceOpen = () => test.beforeEach(({ ctx }) => common.openCreditWorkspace(ctx));
```

Each spec calls the one matching its `.feature` Background. Named helpers (vs a single `withWorkspaceOpen(kind)` taking a string) keep the "raw spec mirrors feature file" invariant: the binding is visible at the call site, not hidden behind a parameter string.

### 3.2 Why a fixture, not a `beforeEach` ctx-build

Fixtures compose with `@playwright/test`'s parallel-worker model, trace-on-failure, and `expect.poll` ergonomics; they are the idiomatic way to extend the `test()` signature. A `beforeEach`-driven build would stash `ctx` on a closure variable per spec file — uglier and easy to leak across files.

### 3.3 Page navigation

`common.openWorkspace(ctx)` calls `ctx.po.workspace.open()` which performs `page.goto("/")`. The FX/credit siblings (`common.openFxWorkspace` / `common.openCreditWorkspace`) call `ctx.po.workspace.openFx()` / `openCredit()`, which each do `page.goto("/")` and then click the matching tab. All three resolve `"/"` against the configured `baseURL` (§4). Raw test bodies never call `page.goto` directly.

---

## 4. `playwright.config.ts`

Minimal config; no `webServer` block.

```ts
// tests/raw/playwright/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,        // match Cucumber serial behaviour; one shared simulator
  workers: 1,                  //   ditto
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,             // matches the de-facto Cucumber-JS baseline
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

**No `webServer` block.** Dev-server lifecycle is owned by `tests/scripts/with-server.ts` (standalone runs) and `tests/scripts/run-all.ts` (orchestrated runs). Both call the existing idempotent `startDevServer()` from `tests/support/devServer.ts`. Adding a Playwright-side `webServer` would introduce a third lifecycle owner and break symmetry with Cypress and Cucumber-JS.

**`workers: 1` and `fullyParallel: false`.** The in-process simulator state is shared per dev-server instance; parallel tests would interfere. This matches the existing Cucumber+Playwright baseline. Relaxing it is a future optimisation, not 5A.3 scope.

**`trace: "retain-on-failure"`.** Keeps Playwright trace zip artifacts for failed tests only — useful in CI without filling disk. Outputs land in `test-results/` (default) — covered by the `.gitignore` change in §2.

**Reporter choice.** `list` only — orchestrated `run-all.ts` runs spool output to stdout. The HTML reporter (`playwright-report/`) is omitted now; can be added later without touching tests.

---

## 5. Test bodies — mapping `.feature` to `.spec.ts`

The mapping rule is mechanical:

- `Feature: X`                  → `test.describe("X", () => { ... })`
- `Background: <line>`          → call the matching `with*WorkspaceOpen()` helper at the top of the describe block
- `Scenario: Y`                 → `test("Y", async ({ ctx }) => { ... })`
- `Given/When/Then <step>`      → one `await scenarios.fn(ctx, ...args)` call

### 5.1 Example: `blotter.feature` → `blotter.spec.ts`

```ts
// tests/raw/playwright/blotter.spec.ts
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as common from "../../scenarios/common";
import * as blotter from "../../scenarios/blotter";
import * as fxLiveRates from "../../scenarios/fxLiveRates";

test.describe("FX trade blotter", () => {
  withFxWorkspaceOpen();

  test("blotter table is visible", async ({ ctx }) => {
    await blotter.expectBlotterTableVisible(ctx);
  });

  test("column headers are clickable for sorting", async ({ ctx }) => {
    await blotter.expectBlotterTableVisible(ctx);
    await blotter.clickFirstBlotterHeader(ctx);
    await blotter.clickFirstBlotterHeader(ctx);
  });

  test("quick filter narrows trade rows", async ({ ctx }) => {
    await fxLiveRates.expectPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.clickBuyOnFirstTile(ctx);
    await common.wait(ctx, 2);
    await blotter.expectBlotterTableVisible(ctx);
    await blotter.recordBlotterRowCount(ctx, "all");
    await blotter.setBlotterQuickFilter(ctx, "ZZZZZ_NO_MATCH");
    await common.wait(ctx, 1);
    await blotter.expectBlotterRowCountAtMost(ctx, "all");
    await blotter.clearBlotterQuickFilter(ctx);
    await common.wait(ctx, 1);
    await blotter.expectBlotterRowCountEquals(ctx, "all");
  });

  // ...remaining 4 scenarios mirror the .feature 1:1
});
```

### 5.2 Invariants for raw test bodies

1. **No raw `expect` from `@playwright/test`.** Assertions live in `scenarios/*` (which call `assert*` helpers in `scenarios/assert.ts`). Test bodies are scenario-call sequences only.
2. **No direct `ctx.po.*` access.** Goes through scenario functions. Keeps abstraction parity with step files.
3. **No `page.*` calls.** The `page` fixture is hidden inside `_context.ts`; tests see only `ctx`.

These three rules are what makes each raw spec file an isomorph of its `.feature` file at the *content* level — only the *binding* differs (`test()` vs `Then("...")`). They are enforced as grep gates in §7.

### 5.3 One unavoidable seam

Where a Cucumber step like `When the trader buys 3 times with confirmation dismissals` is parameterised in `.feature` text, the raw test body inlines a literal:

```ts
await blotter.buyNTimesWithDismissals(ctx, 3);
```

Same scenario function call; the parameter is a literal instead of a parsed string. Acceptable — that's the bind-time difference between Gherkin and programmatic bindings.

---

## 6. Runner orchestration

### 6.1 `tests/package.json`

Add one script, modify `run-all.ts` (next subsection):

```jsonc
{
  "scripts": {
    "test:e2e":                "pnpm gates && tsx scripts/run-all.ts",
    "test:e2e:playwright":     "NODE_OPTIONS='--import tsx/esm' cucumber-js",
    "test:e2e:raw-playwright": "tsx scripts/with-server.ts playwright test --config raw/playwright/playwright.config.ts",
    "test:e2e:cypress":        "tsx scripts/with-server.ts cypress run --headless",
    "test:e2e:cypress:open":   "tsx scripts/with-server.ts cypress open --e2e",
    "gates":                   "tsx scripts/grep-gates.ts",
    "typecheck":               "tsc --noEmit"
  }
}
```

`test:e2e:raw-playwright` mirrors the Cypress script: `with-server.ts` wraps the command so a standalone run brings its own dev server. The idempotent `startDevServer()` no-ops when port 3000 is already serving, so the same wrapper is safe inside the orchestrated `run-all.ts` path.

### 6.2 `tests/scripts/run-all.ts` — three peers, one server

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
} finally {
  await dev.stop();
}
process.exit(combinedExit);
```

All three peers run regardless of earlier failures — exit codes OR-ed so CI sees every failing suite, not just the first.

### 6.3 Ordering

Cucumber+Playwright → raw Playwright → Cypress. Both Playwright-flavoured runners group together (shared browser, similar warm-up); Cypress runs last because its browser stack has heavier setup. Ordering is not semantically important; an OR of exit codes does not depend on order.

### 6.4 Total scenario count after 5A.3

40 Cucumber+Playwright + 40 raw Playwright + 40 Cucumber+Cypress = **120 scenario executions** across three bindings of one 40-scenario behavioural spec set. `STATUS.md` is updated to reflect the new total in the close-out task.

---

## 7. Grep gates additions

The existing 8 gates in `tests/scripts/grep-gates.ts` already cover most invariants (driver-free contracts, no raw `data-testid` literals, no copy-as-selector, etc.) and continue to apply to the new tree because their `paths:` are either repo-wide or include `page-objects/`/`scenarios/`.

**Three new gates** enforce the §5.2 invariants specifically for raw Playwright:

```ts
{
  name: "9. No raw expect() in raw Playwright test bodies",
  pattern: 'from "@playwright/test"',
  paths: ["raw/playwright/"],
  excludes: [
    "/node_modules/",
    "raw/playwright/playwright.config.ts",
    "raw/playwright/_context.ts",
  ],
},
{
  name: "10. No direct PO access (ctx.po.) in raw Playwright test bodies",
  pattern: 'ctx\\.po\\.',
  paths: ["raw/playwright/"],
  excludes: ["/node_modules/", "raw/playwright/_context.ts"],
},
{
  name: "11. No direct page.* calls in raw Playwright test bodies",
  pattern: '\\bpage\\.',
  paths: ["raw/playwright/"],
  excludes: ["/node_modules/", "raw/playwright/_context.ts"],
},
```

**Exclude semantics.**

- Gate 9 allows `@playwright/test` in `playwright.config.ts` (for `defineConfig` + `devices`) and in `_context.ts` (for `test as base` and `export { expect }`). Test bodies must import `test`/`expect` from `./_context` — never from `@playwright/test` directly. ESLint or a follow-up gate could further forbid `expect` in test bodies; not in 5A.3 scope.
- Gate 10 allows `ctx.po.` in `_context.ts`'s fixture builder. Test bodies route through `scenarios/*`.
- Gate 11 allows `page.` in `_context.ts` (the fixture pulls `page` from Playwright's built-in fixtures). Test bodies see only `ctx`.

**Out of scope for these gates.** Aliased imports (e.g. `import { expect as e } from "@playwright/test"`) and other clever evasions. Grep is a tripwire, not an AST analyser. The convention is documented; code review catches the rare evasion. This matches the posture of the existing 8 gates.

**Phase 5A.4 follow-on.** Equivalent gates for `raw/cypress/` (with `cy.` / `cypress`-package patterns) are *not* pre-written in 5A.3. YAGNI; they get added in 5A.4 when the patterns are concrete.

---

## 8. Migration tasks (incremental, all runners green throughout)

Tasks are sized so each ends with `pnpm typecheck && pnpm test:e2e` green (with the raw suite included from Task 10 onward).

| # | Task | What lands | Green at end |
|---|---|---|---|
| 1 | **Scaffold** | `playwright.config.ts`, `_context.ts`, `_openWorkspace.ts` (all 3 helpers), placeholder `theme.spec.ts` with one `test.skip`. Add `test:e2e:raw-playwright` script. Add `test-results/` to `tests/.gitignore`. Do **not** yet wire `run-all.ts`. | `pnpm typecheck`; `pnpm --filter @rtc/tests test:e2e:raw-playwright` reports "1 skipped". Existing Cucumber+Playwright + Cypress untouched. |
| 2 | **Port `theme.feature`** | Real tests in `theme.spec.ts`. Uses `withWorkspaceOpen()`. | raw-pw: 3 passed. |
| 3 | **Port `connection.feature`** | `connection.spec.ts`. Uses `withWorkspaceOpen()`. | raw-pw: 3+N passed. |
| 4 | **Port `analytics.feature`** | `analytics.spec.ts`. Uses `withFxWorkspaceOpen()`. | |
| 5 | **Port `fxLiveRates.feature`** | `fxLiveRates.spec.ts`. Uses `withFxWorkspaceOpen()`. | |
| 6 | **Port `fxTrading.feature`** | `fxTrading.spec.ts`. Uses `withFxWorkspaceOpen()`. | |
| 7 | **Port `fxRfq.feature`** | `fxRfq.spec.ts`. Uses `withFxWorkspaceOpen()`. | |
| 8 | **Port `creditRfq.feature`** | `creditRfq.spec.ts`. Uses `withCreditWorkspaceOpen()`. | |
| 9 | **Port `blotter.feature`** | `blotter.spec.ts`. Uses `withFxWorkspaceOpen()`. After this task, raw-pw runs 40 tests. | `pnpm --filter @rtc/tests test:e2e:raw-playwright` → 40 passed. |
| 10 | **Wire `run-all.ts`** | Add the third peer call. Update `STATUS.md` test counts (120 total). | `pnpm test:e2e` runs all three runners and exits 0. |
| 11 | **Add gates 9–11** | Update `tests/scripts/grep-gates.ts`. Each gate verified against the just-written tree. | `pnpm gates` → all 11 pass. |
| 12 | **STATUS update + close-out** | Mark Phase 5A.3 ✅ DONE in `docs/superpowers/STATUS.md`, record commit SHA range, fold any 5A.3 follow-ups into 5A.4's carry-over section. | clean working tree. |

### 8.1 Why scaffolding is its own task

Task 1 stands up the runner with one skipped test. If the config has a subtle issue (wrong `testDir`, baseURL mismatch, fixture wiring bug), it surfaces against one trivial test, not against eight feature files at once.

### 8.2 Why gates land at Task 11, not Task 1

Writing gate patterns before the test tree exists risks false-positives or false-negatives that go unnoticed. Adding them after the tree is real means each gate is verified against actual code on the same commit. Tasks 2–9 are policed by code review + author discipline (the §5.2 invariants are three short rules).

### 8.3 Per-task verification commands

- **Tasks 1–9:** `pnpm install --filter @rtc/tests --frozen-lockfile && pnpm typecheck && pnpm --filter @rtc/tests test:e2e:raw-playwright && pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`
- **Tasks 10–12:** the above plus `pnpm test:e2e` (umbrella).

---

## 9. Risks & open questions

### 9.1 Risk — total e2e runtime grows ~50%

`pnpm test:e2e` after 5A.3 runs 40 Cucumber+Playwright + 40 raw Playwright + 40 Cucumber+Cypress serially. The raw Playwright suite adds approximately one Playwright-suite's worth of wall-clock. Mitigation deferred: a future phase could relax `workers: 1` once we know which scenarios are simulator-state-isolated. Not addressed in 5A.3.

### 9.2 Risk — scenario function signature drift between bindings

Cucumber-JS regex extraction is loose enough to hide some parameter-name typos. Raw Playwright calls scenario functions by name, so any rename in `scenarios/*` breaks `pnpm typecheck` immediately. Feature, not bug — but means careless renames now break two binding sites instead of one. Mitigation: TypeScript catches it pre-test; CI runs typecheck before tests.

### 9.3 Risk — fixture vs `beforeEach` for Background

Putting `with*WorkspaceOpen()` at the top of each describe is opt-in, mirroring Gherkin's explicit `Background:` declarations. Alternative would be a global `playwright.config.ts`-level `beforeEach`, but that hides the Background and breaks the "raw spec mirrors feature file" invariant. Going with explicit opt-in.

### 9.4 Open question — CI configuration

This repo does not appear to have CI wiring yet (no `.github/workflows/`). If/when CI lands, `pnpm test:e2e` is the single entry point. Out of scope for 5A.3.

### 9.5 Open question — trace artifacts in `git status`

Playwright trace zips land in `test-results/` (default output dir). `tests/.gitignore` currently lists `node_modules/`, `reports/`, `cypress/screenshots/`, `cypress/videos/` but not `test-results/`. Task 1 (scaffold) must add `test-results/` to `tests/.gitignore`. `playwright-report/` is intentionally omitted (HTML reporter is not enabled in §4).

### 9.6 Open question — reporter choice

`list` only for now — orchestrated runs spool everything to stdout, which is the right primary view. HTML reporter can be added later without touching tests.

---

## 10. Architectural anchors

- **Phase 5A.2 spec** (predecessor): `docs/superpowers/specs/2026-05-10-phase-5a-2-cypress-cucumber-design.md`
- **Phase 5A.2 plan** (predecessor): `docs/superpowers/plans/2026-05-10-phase-5a-2-cypress-cucumber.md`
- **Architecture overview**: `docs/architecture.md` §9 (Test Strategy), §9.5 (Dual-runner stack), §11 (Key Files Reference)
- **STATUS tracker**: `docs/superpowers/STATUS.md` — Phase 5A.3 row to be flipped to ✅ DONE in Task 12

---

## 11. Summary of decisions

| Decision | Value | Rationale |
|---|---|---|
| Coverage | Full parity (40/40) | Strongest architectural proof of runner-binding-agnostic contracts |
| Reuse strategy | POs + scenarios layer | Test bodies = scenario-call sequences; same abstraction level as step files |
| Orchestration | Third peer in `run-all.ts` | One shared dev server; OR-ed exit codes; `pnpm test:e2e` runs all three |
| Browser projects | Chromium only | Matches Cucumber+Playwright; keeps runtime growth bounded |
| Background helpers | Three named (`withWorkspaceOpen` / `withFxWorkspaceOpen` / `withCreditWorkspaceOpen`) | Maps 1:1 to the three Background phrasings; call site self-documents |
| TestContext | Playwright fixture in `_context.ts` | Idiomatic Playwright; composes with parallel-worker model + tracing |
| 5A.2 follow-ups | Deferred | Keep 5A.3 focused; carry into 5A.4 or dedicated cleanup |
| Grep gates | 3 new (9, 10, 11) | Enforce the §5.2 raw-test-body invariants |
