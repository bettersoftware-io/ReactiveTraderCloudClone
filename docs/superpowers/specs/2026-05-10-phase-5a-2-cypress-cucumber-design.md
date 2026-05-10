# Phase 5A.2 — Cucumber + Cypress sharing `.feature` files and PO contracts

**Status:** Design approved 2026-05-10.
**Authoring context:** Phase 5A.1 shipped on `main` at SHA `745ea9d` (last commit). Working tree clean except `.claude/settings.local.json`.
**Predecessor doc:** `docs/superpowers/specs/2026-05-08-phase-5a-1-gherkin-page-objects-design.md`.
**Status table row:** `docs/superpowers/STATUS.md` Phase 5A.2.

---

## 1. Goal and scope

Add Cypress as a second e2e runner alongside Playwright, both exercising the identical 8 `.feature` files / 40 scenarios in `tests/specs/`. **Prove the driver-agnostic page-object seam** designed in 5A.1 by showing it actually accepts a second driver — and minimise the framework-specific surface area along the way, so a future driver swap or addition is contained.

After Phase 5A.2:

- `tests/specs/**/*.feature` — unchanged. Shared by both runners.
- `tests/page-objects/contracts/**/*.ts` — extended with `STRINGS` SOT and `WorkspacePO.wait(ms)`. Still the single source of truth for the UI surface.
- `tests/page-objects/playwright/**/*.ts` — minor adjustments only (use `STRINGS.creditRfq.submitButton` instead of literal `"Submit RFQ"`; implement `wait(ms)`).
- `tests/page-objects/cypress/**/*.ts` — **NEW** — 10 PO impls + factory mirroring the Playwright tree.
- `tests/steps/**/*.steps.ts` — **single shared step tree** (renamed from `tests/steps/browser/`). Same files run under both runners; the Cypress bundler aliases `@cucumber/cucumber` to `@badeball/cypress-cucumber-preprocessor` at bundle time so step files don't know which runner is loading them.
- `tests/scenarios/**/*.ts` — **NEW** — pure functions taking `(ctx: TestContext, args)`. The actual scenario logic lives here, completely driver-free.
- `tests/support/testContext.ts` — **NEW** — `TestContext`, `Scratchpad`, `StepContext` types shared across runners.
- `tests/support/playwright/` and `tests/support/cypress/` — runner-specific Worlds and lifecycle hooks.
- `tests/cypress.config.ts` and `tests/.cypress-cucumber-preprocessorrc.json` — **NEW** — Cypress runner config.
- `tests/scripts/with-server.ts` and `tests/scripts/run-all.ts` — **NEW** — dev-server orchestration for solo Cypress runs and the umbrella combined run.
- Three `tests/package.json` test scripts: `test:e2e:playwright`, `test:e2e:cypress`, `test:e2e` (umbrella). All three punch-list items from the 5A.1 phase review folded in. CI: both runners blocking from merge.

The 2×2 matrix from 5A.1's spec evolves to:

|              | Gherkin (`.feature`)                  | Raw (test/it blocks)               |
|--------------|---------------------------------------|------------------------------------|
| **Playwright** | 5A.1 ✅                              | 5A.3 (deferred)                    |
| **Cypress**    | **5A.2** (this spec)                | 5A.4 (deferred)                    |

**Out of scope, explicitly deferred:**

- **5A.3 / 5A.4** — Raw runners reusing PO contracts. `tests/raw/{playwright,cypress}/` placeholders stay empty.
- **5B** — Presenter-direct step definitions; naturally absorbs the Phase 3 follow-up about presenter test depth.
- **5C** — Port contract tests parameterised over simulator + WsReal adapters.
- **5D** — Real gateway-events adapter; deletion of `withSyntheticGatewayConnected`.
- **Touching `packages/client/` source.** The `data-testid` cleanup for the credit-form submit button is deferred; we use a `STRINGS` SOT instead.
- **Multi-browser support.** Chromium-only stays the constraint for both runners.

---

## 2. Architecture — the driver-encapsulated seam

Three layers shared (specs, scenarios, contracts). Two layers split per-runner (PO impls = "drivers", per-runner support files). Two layers are runner-config (Cucumber-JS config + Cypress config).

```
                    8 .feature files (tests/specs/) ───────────────────────── shared
                    Shared scenarios (tests/scenarios/) — pure fns ────────── shared
                    PO contracts (tests/page-objects/contracts/) ─────────── shared
                                  ↑                ↑
                    ┌─────────────┘                └─────────────┐
            Playwright impls (driver)                      Cypress impls (driver)
            (page-objects/playwright/)                     (page-objects/cypress/)
                    ↑                                            ↑
                    └─────── tests/steps/*.steps.ts ─────────────┘ ────────── shared
                            (one tree; bundler alias swaps
                             @cucumber/cucumber → preprocessor for Cypress)
                    ↑                                            ↑
            cucumber.js (Node)                            cypress.config.ts (browser)
            support/playwright/{world,hooks}              support/cypress/{world,e2e}
```

**The bundler-alias mechanism.** Step files unconditionally `import { Given, When, Then } from "@cucumber/cucumber"`. When Cucumber-JS loads them in Node, the import resolves natively. When Cypress's esbuild bundler builds them for the browser, a 5-line esbuild plugin remaps the specifier to `@badeball/cypress-cucumber-preprocessor`. Both packages expose API-compatible `Given/When/Then/And/But/defineParameterType` decorators, so the same call sites compile cleanly under either resolution.

**Trade-off:** the alias is invisible at the step-file level — a reader sees an import from `@cucumber/cucumber` and may not realise that under Cypress it resolves elsewhere. Mitigation: a short comment in `cypress.config.ts` and a single canonical "this is the trick" note in `architecture.md` §11.

**Constraint:** step files can only use the API subset shared by both packages — `Given/When/Then/And/But`, regex patterns, Cucumber expressions, `defineParameterType`. Hooks (`Before/After/BeforeAll/AfterAll`) and `World/setWorldConstructor` are runner-specific and live in the per-runner `support/` directories where they belong anyway.

**Risk:** a future major-version bump of either package could diverge the API. Mitigation: lockfile pinning. Failure surfaces immediately on the next CI run — no silent drift.

---

## 3. Directory and workspace layout

```
tests/
  cucumber.js                       Cucumber-JS config (Node). Imports steps + support/playwright/.
  cypress.config.ts                 Cypress config (browser). esbuild + alias plugin + spec glob.
  .cypress-cucumber-preprocessorrc.json   Preprocessor config: stepDefinitions = "steps/*.steps.ts".
  package.json                      3 test scripts + 4 new devDeps (cypress, preprocessor, esbuild bundler, esbuild).
  tsconfig.json                     Unchanged.
  specs/                            8 .feature files, unchanged. Shared.
  scenarios/                        NEW. Driver-free pure functions.
    assert.ts                       Tiny driver-free assertion helpers.
    theme.ts
    blotter.ts
    fxLiveRates.ts
    ... (one per feature)
  steps/                            ONE step tree (was steps/browser/).
    *.steps.ts                      9 files, each ~40 lines of pure dispatch.
  page-objects/
    contracts/                      Shared interfaces.
      testids.ts                    UNCHANGED.
      strings.ts                    NEW. STRINGS SOT for human-visible selector text.
      Workspace.ts                  Modified: adds wait(ms): Promise<void>.
      *.ts                          Other 9 contracts unchanged.
      index.ts                      Re-exports (now also STRINGS).
    playwright/                     "Driver" — Playwright impls. 11 files.
      *.ts                          10 PO impls + factory.ts. CreditRfqForm.ts uses STRINGS.
    cypress/                        NEW. "Driver" — Cypress impls. 11 files.
      *.ts                          10 PO impls + factory.ts. Methods call cy.* and resolve to Promise<T>.
  support/
    devServer.ts                    Unchanged. Already idempotent (port-reuse).
    testContext.ts                  NEW. TestContext, Scratchpad class, StepContext interface.
    playwright/                     Renamed from tests/support/{world,hooks}.ts.
      world.ts                      PlaywrightWorld extends Cucumber World; satisfies StepContext.
      hooks.ts                      BeforeAll launches chromium + dev server (idempotent).
    cypress/                        NEW.
      world.ts                      buildCypressContext() factory + Mocha.Context type augmentation.
      e2e.ts                        Cypress support file: beforeEach builds context, attaches as this.ctx.
  scripts/                          NEW.
    with-server.ts                  Generic "run cmd under managed dev server" wrapper.
    run-all.ts                      Umbrella: pre-starts shared server, runs both runners sequentially.
  raw/                              Unchanged from 5A.1; placeholders for 5A.3/5A.4.
    cypress/.gitkeep
    playwright/.gitkeep
  reports/                          Cucumber + Cypress HTML reports. Gitignored.
```

**File-count delta vs 5A.1:** +24 created (10 Cypress PO impls + factory + ~6 scenarios + 5 support/script files + 2 config), ~9 step files modified, 1 contract added (`strings.ts`), 1 contract modified (`Workspace.ts`).

---

## 4. Component shapes

### 4.1 Driver-free shared types — `tests/support/testContext.ts`

```ts
import type { PageObjects } from "../page-objects/contracts";

export class Scratchpad {
  blotter = { recordedRowCounts: new Map<string, number>() };
  fxLiveRates = {
    recordedCounts: new Map<string, number>(),
    firstTileTextSnapshot: undefined as string | undefined,
  };
  theme = {
    backgroundBefore: undefined as string | undefined,
    backgroundAfter: undefined as string | undefined,
  };
}

export interface TestContext {
  po: PageObjects;
  scratch: Scratchpad;
}

export interface StepContext {
  ctx: TestContext;
}
```

`Scratchpad` is `new`'d per scenario. `TestContext` is the only thing scenario functions accept. `StepContext` is the structural type both Worlds satisfy — step files write `function(this: StepContext, ...)`.

### 4.2 Driver-free assertion helpers — `tests/scenarios/assert.ts`

```ts
export function assertEquals<T>(actual: T, expected: T, msg?: string): void { ... }
export function assertNotEqual<T>(actual: T, expected: T, msg?: string): void { ... }
export function assertContains(actual: string, expected: string, msg?: string): void { ... }
export function assertGte(actual: number, expected: number, msg?: string): void { ... }
export function assertLte(actual: number, expected: number, msg?: string): void { ... }
export function assertTrue(actual: boolean, msg?: string): void { ... }
export function assertGreaterThanZero(actual: number, msg?: string): void { ... }
```

The exact set is derived from the Playwright `expect` calls in the existing 9 step files: `.toBe(true/false)`, `.toBe(value)`, `.not.toBe(value)`, `.toContain(...)`, `.toBeLessThanOrEqual(...)`, `.toBeGreaterThanOrEqual(...)`, `.toBeGreaterThan(0)`. Plan task 1 derives the final list mechanically from a grep over `tests/steps/browser/`.

Throws `Error` on failure with a diagnostic message. Both runners surface thrown errors as scenario failures (Cucumber-JS via its own assertion error path, Cypress via Mocha).

**Why driver-free assertions, not "all assertions in PO methods":** value assertions (string equals, number gte, etc.) operate on JS values that are already in memory — Playwright's locator-level retry doesn't apply. Visibility/state assertions where retry-on-locator matters stay in PO methods (`expectVisible(timeoutMs)`, `waitForFirstTile(timeoutMs)`, etc.) — the existing 5A.1 contracts already follow this pattern. We don't expand the contract surface unnecessarily.

### 4.3 STRINGS SOT — `tests/page-objects/contracts/strings.ts`

```ts
export const STRINGS = {
  creditRfq: { submitButton: "Submit RFQ" },
  // future: extend per-suite as needed
} as const;
```

Re-exported from `tests/page-objects/contracts/index.ts`. Both `playwright/CreditRfqForm.ts` and `cypress/CreditRfqForm.ts` import and use `STRINGS.creditRfq.submitButton` instead of literal `"Submit RFQ"`.

### 4.4 Wait primitive on `WorkspacePO`

`tests/page-objects/contracts/Workspace.ts` adds:

```ts
wait(ms: number): Promise<void>;
```

- Playwright impl: `await this.page.waitForTimeout(ms)`.
- Cypress impl: `cy.wait(ms).then(() => undefined)`.

The 3 `this.page.waitForTimeout` sites in the existing step files (`blotter.steps.ts:80,83`, `fxLiveRates.steps.ts:82`) become `await ctx.po.workspace.wait(ms)` after migrating into scenarios.

### 4.5 Playwright World — `tests/support/playwright/world.ts`

Extends Cucumber-JS `World`. Builds `TestContext` with the Playwright PO factory + new `Scratchpad`. `setWorldConstructor(PlaywrightWorld)` registers globally. `PlaywrightWorld` satisfies `StepContext` because it has a `ctx: TestContext` field.

### 4.6 Cypress per-scenario context — `tests/support/cypress/{world,e2e}.ts`

Cypress runs scenarios as Mocha `it()` blocks. There is no Cucumber-JS World. The "world" is `Mocha.Context` augmented with `ctx: TestContext`:

```ts
// tests/support/cypress/world.ts
declare global {
  namespace Mocha {
    interface Context { ctx: import("../testContext").TestContext; }
  }
}

export function buildCypressContext(): TestContext {
  return { po: buildCypressPageObjects(), scratch: new Scratchpad() };
}
```

```ts
// tests/support/cypress/e2e.ts
import { buildCypressContext } from "./world";
beforeEach(function() {
  this.ctx = buildCypressContext();
  cy.visit("/");
});
```

Step bodies use `function(this: StepContext, ...)` — `Mocha.Context` after augmentation satisfies `StepContext` (has `ctx: TestContext`).

### 4.7 Cypress PO factory — `tests/page-objects/cypress/factory.ts`

```ts
import type { PageObjects } from "../contracts";

export function buildCypressPageObjects(): PageObjects {
  return {
    workspace: new CypressWorkspace(),
    themeToggle: new CypressThemeToggle(),
    // ... 8 more
  };
}
```

No `page` argument. Cypress impls hold no per-instance state; they call `cy.*` directly. Each method returns a `Promise<T>` via `cy.<chain>().then((value) => value)` style, which hands a real Promise back to the step body so `await` works the same way as under Playwright.

### 4.8 Sample scenario function — `tests/scenarios/theme.ts`

```ts
import type { TestContext } from "../support/testContext";
import { assertTrue, assertNotEqual } from "./assert";

export async function toggleAndCaptureBackgrounds(ctx: TestContext): Promise<void> {
  ctx.scratch.theme.backgroundBefore = await ctx.po.workspace.rootBackgroundColor();
  await ctx.po.themeToggle.click();
  ctx.scratch.theme.backgroundAfter = await ctx.po.workspace.rootBackgroundColor();
}

export async function expectThemeToggleVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.themeToggle.isVisible(), "theme toggle not visible");
}

export async function expectBackgroundChanged(ctx: TestContext): Promise<void> {
  assertNotEqual(ctx.scratch.theme.backgroundAfter, ctx.scratch.theme.backgroundBefore);
}
```

### 4.9 Step file — single shared file `tests/steps/theme.steps.ts`

```ts
import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../support/testContext";
import * as theme from "../scenarios/theme";

When("the trader toggles the theme",
  function(this: StepContext) { return theme.toggleAndCaptureBackgrounds(this.ctx); });

Then("the theme toggle button is visible",
  function(this: StepContext) { return theme.expectThemeToggleVisible(this.ctx); });

Then("the workspace background color has changed",
  function(this: StepContext) { return theme.expectBackgroundChanged(this.ctx); });
// ... etc
```

Pure dispatch — no `expect` import, no `this.page`, no module-level state, no driver knowledge. Both runners load this exact file unchanged.

---

## 5. Step file transformation pattern

Each existing 5A.1 step file undergoes the same mechanical transformation:

| 5A.1 (today) | 5A.2 (after) |
|---|---|
| `import { expect } from "@playwright/test";` | (deleted; assertions move into scenarios) |
| `import type { PlaywrightWorld } from "../../support/world";` | `import type { StepContext } from "../support/testContext";` |
| Module-level `let x: T \| undefined;` / `const map = new Map(...)` | (deleted; state moves to `Scratchpad`) |
| `function(this: PlaywrightWorld, ...)` | `function(this: StepContext, ...)` |
| `await this.po.x.foo(); expect(await this.po.x.y()).toBe(z);` | `return scenarios.fooAndCheckY(this.ctx);` |
| `await this.page.waitForTimeout(ms)` | `return ctx.po.workspace.wait(ms);` (inside scenario fn) |

Step file directory rename: `tests/steps/browser/` → `tests/steps/`.

Total step layer LOC drops roughly in half because the assertion + state-snapshot + control-flow logic moves into reusable scenario functions.

---

## 6. Punch-list folding (from 5A.1 phase review)

All three items addressed in 5A.2. Each is testable independently.

| Item | Resolution |
|---|---|
| **3× `this.page.waitForTimeout`** in `blotter.steps.ts:80,83`, `fxLiveRates.steps.ts:82` | `WorkspacePO.wait(ms)` added to contract; both impls implement it; step bodies replaced via scenario migration. |
| **4× module-level state vars** across `blotter.steps.ts`, `fxLiveRates.steps.ts`, `theme.steps.ts` | All hoisted onto `Scratchpad` per Section 4.1. Step bodies access via `ctx.scratch.<suite>.<field>`. |
| **`getByText("Submit RFQ")` copy-as-selector** in `playwright/CreditRfqForm.ts:8` | `STRINGS.creditRfq.submitButton` SOT in `contracts/strings.ts`; both impls reference it. |

Note: a comment in `tests/cucumber.js` from 5A.1 also flagged the single-profile flat-shape config as a limitation. This is **not** a punch-list item — runner selection in 5A.2 happens at the `package.json`-script level (`test:e2e:playwright` vs `test:e2e:cypress`), not the Cucumber-profile level, so the limitation never materialises.

---

## 7. Runtime config and dev-server orchestration

### 7.1 Cypress config — `tests/cypress.config.ts`

```ts
import { defineConfig } from "cypress";
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import createEsbuildPlugin from "@badeball/cypress-cucumber-preprocessor/esbuild";

// Aliases @cucumber/cucumber → @badeball/cypress-cucumber-preprocessor
// at bundle time so step files share one tree across both runners.
// See architecture.md §11 for the full seam description.
const aliasCucumber: import("esbuild").Plugin = {
  name: "alias-cucumber",
  setup(build) {
    build.onResolve({ filter: /^@cucumber\/cucumber$/ }, () => ({
      path: require.resolve("@badeball/cypress-cucumber-preprocessor"),
    }));
  },
};

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "specs/**/*.feature",
    supportFile: "support/cypress/e2e.ts",
    video: false,
    screenshotOnRunFailure: true,
    async setupNodeEvents(on, config) {
      await addCucumberPreprocessorPlugin(on, config);
      on(
        "file:preprocessor",
        createBundler({ plugins: [aliasCucumber, createEsbuildPlugin(config)] }),
      );
      return config;
    },
  },
});
```

### 7.2 Preprocessor config — `tests/.cypress-cucumber-preprocessorrc.json`

```json
{
  "stepDefinitions": ["steps/*.steps.ts"],
  "json": { "enabled": false },
  "html": { "enabled": true, "output": "reports/cypress-cucumber.html" }
}
```

### 7.3 Dev-server orchestration — single cold start

`tests/support/devServer.ts` already implements idempotent port-reuse: if port 3000 is already serving, `startDevServer()` returns a no-op handle whose `stop()` does nothing. This makes nesting safe.

**`tests/scripts/with-server.ts`** wraps any command with managed server lifecycle. Used by `test:e2e:cypress` (Cypress doesn't have a Cucumber-JS-style `BeforeAll` and needs an externally-running server).

**`tests/scripts/run-all.ts`** is the umbrella: it pre-starts the dev server, then spawns `pnpm test:e2e:playwright` and `pnpm test:e2e:cypress` in sequence. Inside each sub-invocation, the runner's own `startDevServer()` call detects the running server and returns a no-op handle. Result: **one cold start per `pnpm test:e2e`**, regardless of which runner you reach through.

### 7.4 Scripts — `tests/package.json`

```json
{
  "scripts": {
    "test:e2e": "tsx scripts/run-all.ts",
    "test:e2e:playwright": "NODE_OPTIONS='--import tsx/esm' cucumber-js",
    "test:e2e:cypress": "tsx scripts/with-server.ts cypress run --headless",
    "test:e2e:cypress:open": "tsx scripts/with-server.ts cypress open --e2e",
    "typecheck": "tsc --noEmit"
  }
}
```

`test:e2e:cypress:open` is a developer convenience — preserves dev-server lifecycle in GUI mode for local debugging.

### 7.5 New devDependencies — `tests/package.json`

| Package | Version (target) | Purpose |
|---|---|---|
| `cypress` | ^14 (exact resolved version pinned in plan) | Runner |
| `@badeball/cypress-cucumber-preprocessor` | ^22 | Cucumber→Cypress glue (actively maintained successor) |
| `@bahmutov/cypress-esbuild-preprocessor` | ^2 | Wires esbuild as Cypress's bundler |
| `esbuild` | ^0.24 | Peer dep for the bundler |

### 7.6 Cucumber config adjustments — `tests/cucumber.js`

```js
export default {
  paths: ["specs/**/*.feature"],
  import: ["support/playwright/**/*.ts", "support/testContext.ts", "steps/**/*.ts"],
  format: ["progress-bar", "html:reports/cucumber.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: process.env.CI ? 2 : 0,
};
```

Step path `steps/browser/` → `steps/`; explicit inclusion of `support/testContext.ts` since it's outside `support/playwright/`.

---

## 8. Architectural grep gates

Existing 4 gates from 5A.1 + 4 new ones for 5A.2.

| # | Pattern | Forbidden in | Status |
|---|---|---|---|
| 1 | `data-testid=` | anywhere except `testids.ts` | existing |
| 2 | `@playwright/test\|cypress` | `tests/page-objects/contracts/**` | existing |
| 3 | driver names (`playwright`, `cy.`, `data-testid`) | `tests/specs/**` | existing |
| 4 | `getByTestId\("` | `tests/page-objects/**` (must use `TESTIDS.*`) | existing |
| 5 | `@playwright/test\|^cypress$\|@badeball` | `tests/scenarios/**` | NEW |
| 6 | `from "@playwright/test"` | `tests/steps/**` | NEW |
| 7 | `getByText\("[A-Z]\|cy\.contains\("[A-Z]` | `tests/page-objects/**` (must use `STRINGS.*`) | NEW |
| 8 | `this\.page\.` | `tests/steps/**` | NEW |

Implementation: a small `tests/scripts/grep-gates.ts` (or similar) that runs all 8 patterns and exits non-zero on any hit. Wired into the `test:e2e` pipeline (or a dedicated `lint:gates` script).

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `setOffline` CDP plumbing turns rabbit-hole | Medium | High (2 of 4 connection scenarios) | Time-box CDP attempt to one task; fallback to `@playwright-only` tag for those 2 scenarios. Cypress runs 38/40, Playwright still 40/40. Tag-skipping is supported natively by `@badeball/cypress-cucumber-preprocessor`. |
| Bundler alias breaks on Cucumber-JS / preprocessor major bump | Low | High (every step file fails) | Lock both packages to current minor in `pnpm-lock.yaml`. Failure surfaces immediately on CI — no silent drift. |
| Cypress flake — different timing model than Playwright | Medium | Medium | If a scenario flakes only under Cypress, fix the underlying race in the PO impl (e.g., add an explicit wait-for-state PO method) rather than bumping retries. The flake is signal that the PO contract under-specifies the wait. |
| Cypress + tsx/esm + ESM-only deps interop | Low | Medium | esbuild handles ESM/CJS interop; the alias plugin bypasses dep resolution issues. The Node side (Cucumber-JS) keeps its `NODE_OPTIONS='--import tsx/esm'` pattern unchanged. |
| Headed Cypress (`cypress open`) vs headless behavior diverges | Low | Low | CI runs headless. Document `cypress open` is a developer-convenience tool, not the source of truth. |

### 9.1 The `setOffline` portability strategy

Playwright's `BrowserContext.setOffline(true/false)` flips real browser network-state and fires native `online`/`offline` events. Cypress has no direct equivalent. Approach:

1. **Primary path:** Use Chrome DevTools Protocol via `Cypress.automation('remote:debugger:protocol', { command: 'Network.emulateNetworkConditions', params: { offline, latency: 0, downloadThroughput: 0, uploadThroughput: 0 } })`. This fires real `online`/`offline` events. Chrome-only — fits our existing chromium-only constraint.
2. **Fallback path:** Tag the 2 affected scenarios `@playwright-only`. Configure the preprocessor's filter to skip them. Cypress runs 38/40; Playwright runs all 40. Document the tag in `architecture.md`.

Decision rule: try the CDP path during implementation; if the plumbing exceeds one task's worth of effort, fall back to the tag. The acceptance criterion accepts either outcome.

---

## 10. Acceptance criteria

5A.2 is "done" when **all** of the following hold:

1. **Both runners green.** `pnpm test:e2e` exits 0, with Playwright running 40/40 scenarios and Cypress running either 40/40 or 38/40 (with 2 `@playwright-only` for connection-offline if CDP plumbing was deferred).
2. **Solo entry points work.** `pnpm --filter @rtc/tests test:e2e:playwright` and `test:e2e:cypress` each work standalone with their own dev-server lifecycle.
3. **Single cold start under umbrella.** `pnpm test:e2e` starts the dev server exactly once.
4. **All 8 grep gates pass.** Existing 4 + 4 new ones from §8.
5. **Module-level state in step files = 0.** All migrated to `Scratchpad`.
6. **Driver imports in scenarios layer = 0.** `grep -rE '@playwright/test|^cypress$|@badeball' tests/scenarios/` returns nothing.
7. **No `expect` from `@playwright/test` in step files.** All assertions are either driver-free `assert*` helpers (in scenarios) or PO methods.
8. **`pnpm typecheck && pnpm test` green** across all 5 workspaces.
9. **CI both blocking.** Existing CI workflow's `pnpm test:e2e` invocation transparently runs both runners; the workflow doesn't need explicit changes beyond the script update.
10. **Docs updated.**
    - `docs/architecture.md` §11 reflects the dual-runner stack with the bundler-alias documented.
    - `docs/superpowers/STATUS.md` Phase 5A.2 row marked DONE with SHA range.

The single-profile cucumber.js note from §6 is closed implicitly — runner selection happens at the `package.json`-script level, not Cucumber-profile level.

---

## 11. Sequencing — implementation roadmap

To be expanded into ~13 plan tasks during plan-writing. The order is deliberate: refactor under (a) first, get Playwright clean, then add Cypress.

| # | Task | Verification |
|---|---|---|
| 1 | Create driver-free types: `TestContext`, `Scratchpad`, `StepContext`, `assert.ts`, `STRINGS` | Types compile; nothing else changes yet |
| 2 | Create scenarios layer for one feature (theme), migrate `theme.steps.ts` end-to-end as proof-of-pattern | Playwright runs theme scenarios 5/5 |
| 3 | Migrate remaining 8 step files into scenarios + single shared step tree (rename `steps/browser/` → `steps/`) | Playwright 40/40 |
| 4 | Add `WorkspacePO.wait()`, replace 3 `this.page.waitForTimeout` sites | Playwright 40/40 |
| 5 | Restructure `support/` into `support/playwright/` + driver-free shared (`testContext.ts`) | Playwright 40/40 |
| 6 | Add Cypress runtime scaffolding: `cypress.config.ts`, `support/cypress/`, `.cypress-cucumber-preprocessorrc.json`, deps, esbuild alias plugin | Cypress launches and finds 0 PO impls; build clean |
| 7 | Implement `buildCypressPageObjects` factory + first PO impl (Workspace), validate one scenario end-to-end | Cypress runs 1 trivial scenario |
| 8 | Implement remaining 9 Cypress PO impls (use `STRINGS` for credit-form selector) | Cypress runs all non-offline scenarios |
| 9 | Tackle `setOffline` via CDP (or fallback to `@playwright-only` tag) | Cypress 40/40 or 38/40 with documented tag |
| 10 | Add `with-server.ts` + `run-all.ts` umbrella + 3 scripts in `package.json` | `pnpm test:e2e` runs both, single cold start |
| 11 | Add 4 new grep gates + integrate into pipeline | All 8 gates pass |
| 12 | Update `docs/architecture.md` §11, `docs/superpowers/STATUS.md` | Spot-check links and SHA range |
| 13 | Phase-level review subagent | Reviewer concludes "DONE and worth merging" |

Each task gets its own commit (or 2-3 if naturally split). Tasks 6-9 are the highest-risk; tasks 1-5 are largely mechanical refactor under a working Playwright runner.

---

## 12. Open questions to lock during plan-writing

1. **Exact pinned versions** for `cypress`, `@badeball/cypress-cucumber-preprocessor`, `@bahmutov/cypress-esbuild-preprocessor`, `esbuild` — re-check the registry at plan-write time and pin specific resolved versions.
2. **Grep-gate runner location** — `tests/scripts/grep-gates.ts` callable as `pnpm --filter @rtc/tests gates`, or wire into an existing lint task. Decide during plan task 11.
3. **CI test:e2e timeout** — current `pnpm test:e2e` runs ~35s for Playwright 40 scenarios. Cypress is typically 1.5-2× slower; expect ~80-100s combined for the umbrella. CI step timeout may need bumping; lock during plan task 11.
