# Phase 5A.2 — Cucumber + Cypress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cypress as a second e2e runner alongside Playwright; both runners exercise the identical 8 `.feature` files / 40 scenarios, sharing one step tree via a bundler-aliased import. Refactor along the way: extract a driver-free `scenarios/` layer, hoist all module-level test state onto a typed `Scratchpad`, replace `this.page.waitForTimeout` with a `WorkspacePO.wait` primitive, introduce a `STRINGS` SOT for human-visible selector text.

**Architecture:** Three layers shared (specs, scenarios, contracts). Two layers split per-runner (PO impls = "drivers", per-runner support files). Cypress's esbuild bundler aliases `@cucumber/cucumber` → `@badeball/cypress-cucumber-preprocessor` at bundle time so step files compile under either runner unchanged. Both runners orchestrate through a shared dev server via an idempotent port-reuse handle.

**Tech Stack:** `@cucumber/cucumber` 11 (Node-side runner) · `cypress` ^14 (browser-side runner) · `@badeball/cypress-cucumber-preprocessor` ^22 (Gherkin → Cypress glue) · `@bahmutov/cypress-esbuild-preprocessor` ^2 + `esbuild` ^0.24 (bundler) · `@playwright/test` 1.50 (existing driver) · `tsx` (TS loader) · TypeScript 5.8 · ESM throughout.

**Spec:** `docs/superpowers/specs/2026-05-10-phase-5a-2-cypress-cucumber-design.md` (committed `a1cb673`).

---

## Plan-wide notes (read once before starting)

- **Working tree:** clean except `.claude/settings.local.json` and `.claude/settings.json`. Do not stage either.
- **Branch:** `main` (HEAD `a1cb673`). Work commits directly here (this is the convention used in Phases 1–5A.1).
- **Cypress runs in the browser, Cucumber-JS runs in Node.** This is the central asymmetry. Every step file becomes runtime-portable to both contexts because the only API surface it uses (`Given/When/Then/And/But/defineParameterType`) is API-compatible between `@cucumber/cucumber` and `@badeball/cypress-cucumber-preprocessor`. Hooks (`Before/After/BeforeAll/AfterAll`) and `World/setWorldConstructor` are NOT portable; they live in the per-runner `tests/support/{playwright,cypress}/` directories.
- **The bundler-alias mechanism.** Step files unconditionally `import { Given, When, Then } from "@cucumber/cucumber"`. Cucumber-JS resolves natively. Cypress's esbuild bundler runs a 5-line plugin that intercepts the specifier and remaps it to `@badeball/cypress-cucumber-preprocessor`. The trick lives in `tests/cypress.config.ts` and is documented in `architecture.md` §11.
- **Playwright stays green throughout.** Every task ends with `pnpm typecheck && pnpm test:e2e` (Playwright) green at minimum. Cypress-related tasks (10+) additionally require `pnpm --filter @rtc/tests test:e2e:cypress` green.
- **Total scenario count must remain at 40 in Playwright.** Cypress aims for 40, with a documented fallback to 38 + 2 `@playwright-only` if CDP setOffline plumbing is deferred.
- **Migration strategy for step files.** Tasks 3-7 keep BOTH the old `this.po.x` direct access AND the new `this.ctx.po.x` access live on `PlaywrightWorld` simultaneously. Each step-file migration replaces one file's bodies; Playwright stays green until the last file migrates and Task 8 retires the legacy `po` field.
- **No new `data-testid` strings are added in 5A.2.** The credit-form copy-as-selector is dealt with by introducing the `STRINGS` SOT, not by editing `packages/client/`.
- **Verification command between tasks (until Task 9):** `pnpm install --filter @rtc/tests --frozen-lockfile && pnpm typecheck && pnpm --filter @rtc/tests test:e2e`. After Task 9, also: `pnpm --filter @rtc/tests test:e2e:cypress`. After Task 14 (umbrella): `pnpm test:e2e` (which now runs both).
- **Pin exact versions during Task 9.** Re-check the npm registry at plan-execution time and pin the resolved minor.patch for `cypress`, `@badeball/cypress-cucumber-preprocessor`, `@bahmutov/cypress-esbuild-preprocessor`, `esbuild` in `tests/package.json`.
- **Existing `tests/support/devServer.ts` is already idempotent.** Lines 33-35 short-circuit and return a no-op handle when port 3000 is already serving. Do not modify it.

---

## File structure created/modified by this plan

**New top-level structure under `tests/`** (additions/renames vs 5A.1):

```
tests/
  cucumber.js                                          MODIFIED (paths)
  cypress.config.ts                                    NEW
  .cypress-cucumber-preprocessorrc.json                NEW
  package.json                                         MODIFIED (scripts + deps)
  tsconfig.json                                        MODIFIED (incl Cypress types)
  scenarios/                                           NEW (driver-free pure fns)
    assert.ts
    common.ts
    theme.ts
    connection.ts
    analytics.ts
    fxLiveRates.ts
    fxTrading.ts
    fxRfq.ts
    creditRfq.ts
    blotter.ts
  scripts/                                             NEW
    with-server.ts
    run-all.ts
    grep-gates.ts
  page-objects/
    contracts/
      strings.ts                                       NEW
      Workspace.ts                                     MODIFIED (wait method)
      index.ts                                         MODIFIED (re-export STRINGS)
      ... (other 9 contracts unchanged)
    playwright/
      Workspace.ts                                     MODIFIED (impl wait)
      CreditRfqForm.ts                                 MODIFIED (use STRINGS)
      ... (other 8 impls unchanged + factory.ts)
    cypress/                                           NEW (10 PO impls + factory)
      Workspace.ts
      ThemeToggle.ts
      Footer.ts
      ConnectionOverlay.ts
      LiveRatesTile.ts
      FxRfqForm.ts
      AnalyticsDashboard.ts
      CreditRfqForm.ts
      CreditRfqPanel.ts
      BlotterTable.ts
      factory.ts
  steps/                                               RENAMED from steps/browser/
    common.steps.ts                                    MIGRATED (uses ctx + scenarios)
    theme.steps.ts                                     MIGRATED
    connection.steps.ts                                MIGRATED
    analytics.steps.ts                                 MIGRATED
    fxLiveRates.steps.ts                               MIGRATED
    fxTrading.steps.ts                                 MIGRATED
    fxRfq.steps.ts                                     MIGRATED
    creditRfq.steps.ts                                 MIGRATED
    blotter.steps.ts                                   MIGRATED
  support/
    devServer.ts                                       UNCHANGED
    testContext.ts                                     NEW
    playwright/                                        RENAMED from support/{world,hooks}.ts
      world.ts                                         MIGRATED (PlaywrightWorld with ctx)
      hooks.ts                                         MOVED here
    cypress/                                           NEW
      world.ts                                         (Mocha.Context augmentation + factory)
      e2e.ts                                           (Cypress support file)
  raw/                                                 UNCHANGED (5A.3/5A.4 placeholders)
```

**New devDependencies in `tests/package.json`** (Task 9): `cypress`, `@badeball/cypress-cucumber-preprocessor`, `@bahmutov/cypress-esbuild-preprocessor`, `esbuild`.

**Files modified outside `tests/`:**
- `docs/architecture.md` — §11 (test stack table) + new sub-section documenting the bundler alias.
- `docs/superpowers/STATUS.md` — Phase 5A.2 row marked DONE with SHA range.
- `.gitignore` (root) — none needed; `tests/reports/` already covered.

**Files deleted:** none. (The `tests/steps/browser/` directory is renamed to `tests/steps/`, not deleted.)

---

## Task 1: Driver-free shared types (`testContext.ts`, `Scratchpad`, `StepContext`, assert helpers, `STRINGS`)

**Files:**
- Create: `tests/support/testContext.ts`
- Create: `tests/scenarios/assert.ts`
- Create: `tests/page-objects/contracts/strings.ts`
- Modify: `tests/page-objects/contracts/index.ts` (re-export `STRINGS`)

This task introduces the foundational types and helpers consumed by every later task. No `PlaywrightWorld`, `PageObjects`, or step file is modified yet.

- [ ] **Step 1: Create `tests/support/testContext.ts`**

```ts
import type { PageObjects } from "../page-objects/contracts";

/**
 * Per-scenario typed scratchpad. A fresh instance is constructed for every
 * scenario by both PlaywrightWorld and the Cypress beforeEach hook. Holds all
 * cross-step state that used to live as module-level closures in step files.
 */
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

/** What scenario functions accept. Driver-agnostic. */
export interface TestContext {
  po: PageObjects;
  scratch: Scratchpad;
}

/**
 * What step bodies bind `this` to. PlaywrightWorld satisfies it because it has
 * a `ctx: TestContext` field; the Cypress Mocha.Context satisfies it because
 * `support/cypress/e2e.ts` attaches `this.ctx` in beforeEach.
 */
export interface StepContext {
  ctx: TestContext;
}
```

- [ ] **Step 2: Create `tests/scenarios/assert.ts`**

The seven helpers are derived mechanically from the Playwright `expect` calls in the existing 9 step files: `.toBe(true/false)`, `.toBe(value)`, `.not.toBe(value)`, `.toContain(...)`, `.toBeLessThanOrEqual(...)`, `.toBeGreaterThanOrEqual(...)`, `.toBeGreaterThan(0)`. Throws `Error` on failure with diagnostic message; both runners surface thrown errors as scenario failures.

```ts
function fail(msg: string): never {
  throw new Error(msg);
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (!Object.is(actual, expected)) {
    fail(msg ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertNotEqual<T>(actual: T, expected: T, msg?: string): void {
  if (Object.is(actual, expected)) {
    fail(msg ?? `expected value to differ from ${JSON.stringify(expected)}`);
  }
}

export function assertContains(actual: string, expected: string, msg?: string): void {
  if (!actual.includes(expected)) {
    fail(msg ?? `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
  }
}

export function assertGte(actual: number, expected: number, msg?: string): void {
  if (!(actual >= expected)) {
    fail(msg ?? `expected ${actual} to be >= ${expected}`);
  }
}

export function assertLte(actual: number, expected: number, msg?: string): void {
  if (!(actual <= expected)) {
    fail(msg ?? `expected ${actual} to be <= ${expected}`);
  }
}

export function assertTrue(actual: boolean, msg?: string): void {
  if (actual !== true) {
    fail(msg ?? `expected true, got ${actual}`);
  }
}

export function assertGreaterThanZero(actual: number, msg?: string): void {
  if (!(actual > 0)) {
    fail(msg ?? `expected ${actual} to be > 0`);
  }
}
```

- [ ] **Step 3: Create `tests/page-objects/contracts/strings.ts`**

```ts
/**
 * Single source of truth for human-visible text strings used as selectors.
 * Both Playwright and Cypress PO implementations import from here so a
 * UI copy change requires only a single update.
 */
export const STRINGS = {
  creditRfq: {
    submitButton: "Submit RFQ",
  },
} as const;
```

- [ ] **Step 4: Modify `tests/page-objects/contracts/index.ts` to re-export `STRINGS`**

Add line to existing barrel:

```ts
export { TESTIDS } from "./testids";
export { STRINGS } from "./strings";       // NEW
```

(Preserve all existing PO type re-exports.)

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @rtc/tests typecheck`
Expected: PASS (zero errors). The new files compile in isolation; nothing references them yet.

- [ ] **Step 6: Run e2e to confirm zero regression**

Run: `pnpm --filter @rtc/tests test:e2e`
Expected: 40 scenarios passing (191 steps, ~35s).

- [ ] **Step 7: Commit**

```bash
git add tests/support/testContext.ts tests/scenarios/assert.ts \
        tests/page-objects/contracts/strings.ts \
        tests/page-objects/contracts/index.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.2): driver-free types, assert helpers, STRINGS SOT

Foundation for the cross-runner scenarios layer. TestContext and StepContext
are the types step files and scenarios consume; Scratchpad replaces the
module-level closures in step files; STRINGS holds human-visible selector
text shared by both PO implementations.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `WorkspacePO.wait(ms)` primitive

**Files:**
- Modify: `tests/page-objects/contracts/Workspace.ts`
- Modify: `tests/page-objects/playwright/Workspace.ts`

This task adds the `wait(ms)` method to `WorkspacePO` and the Playwright impl. It does not yet remove any `this.page.waitForTimeout` from step files (those move out during Tasks 3-7's migration).

- [ ] **Step 1: Modify `tests/page-objects/contracts/Workspace.ts`**

Add `wait` method declaration:

```ts
export interface WorkspacePO {
  open(): Promise<void>;
  openFx(): Promise<void>;
  openCredit(): Promise<void>;
  openAdmin(): Promise<void>;
  clickTab(tab: "fx" | "credit" | "admin"): Promise<void>;
  reload(): Promise<void>;
  setOffline(offline: boolean): Promise<void>;
  rootBackgroundColor(): Promise<string>;
  /** Driver-agnostic time-based wait. Used in scenarios that genuinely need
   *  a wall-clock pause (e.g. "wait N seconds for the system to react"). */
  wait(ms: number): Promise<void>;
}
```

- [ ] **Step 2: Modify `tests/page-objects/playwright/Workspace.ts` to implement `wait`**

Append to `PlaywrightWorkspace` class:

```ts
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @rtc/tests typecheck`
Expected: PASS.

- [ ] **Step 4: Run e2e**

Run: `pnpm --filter @rtc/tests test:e2e`
Expected: 40 scenarios passing.

- [ ] **Step 5: Commit**

```bash
git add tests/page-objects/contracts/Workspace.ts \
        tests/page-objects/playwright/Workspace.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.2): add WorkspacePO.wait(ms) primitive

Driver-agnostic wait. Playwright impl wraps page.waitForTimeout. Cypress impl
will wrap cy.wait(ms).then(() => undefined) when added in Task 10. Step bodies
move from this.page.waitForTimeout to ctx.po.workspace.wait during Tasks 3-7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `PlaywrightWorld.ctx` field + migrate `theme.steps.ts` (proof-of-pattern)

**Files:**
- Modify: `tests/support/world.ts`
- Create: `tests/scenarios/theme.ts`
- Modify: `tests/steps/browser/theme.steps.ts`

This is the proof-of-pattern task. It augments `PlaywrightWorld` with a `ctx: TestContext` field (alongside the existing `po: PageObjects` field — both are kept live until Task 8) and migrates the smallest step file end-to-end. Once green, the same recipe applies to the remaining 8 step files in Tasks 4-7.

- [ ] **Step 1: Modify `tests/support/world.ts` to construct `ctx`**

Replace contents:

```ts
import { setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { PageObjects } from "../page-objects/contracts";
import type { TestContext } from "./testContext";
import { Scratchpad } from "./testContext";
import { buildPlaywrightPageObjects } from "../page-objects/playwright/factory";

export class PlaywrightWorld extends World {
  context!: BrowserContext;
  page!: Page;
  /** @deprecated Use `this.ctx.po`. Kept for migrating step files; removed in Task 8. */
  po!: PageObjects;
  ctx!: TestContext;

  constructor(options: IWorldOptions) {
    super(options);
  }

  async open(browser: Browser): Promise<void> {
    this.context = await browser.newContext({ baseURL: "http://localhost:3000" });
    this.page = await this.context.newPage();
    this.po = buildPlaywrightPageObjects(this.page);
    this.ctx = { po: this.po, scratch: new Scratchpad() };
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

setWorldConstructor(PlaywrightWorld);
```

The `po` field stays so unmigrated step files keep compiling; `ctx.po` references the same `PageObjects` instance.

- [ ] **Step 2: Create `tests/scenarios/theme.ts`**

```ts
import type { TestContext } from "../support/testContext";
import { assertContains, assertNotEqual, assertTrue } from "./assert";

export async function toggleAndCaptureBackgrounds(ctx: TestContext): Promise<void> {
  ctx.scratch.theme.backgroundBefore = await ctx.po.workspace.rootBackgroundColor();
  await ctx.po.themeToggle.click();
  ctx.scratch.theme.backgroundAfter = await ctx.po.workspace.rootBackgroundColor();
}

export async function expectThemeToggleVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.themeToggle.isVisible(), "theme toggle not visible");
}

export async function expectBackgroundChanged(ctx: TestContext): Promise<void> {
  assertNotEqual(
    ctx.scratch.theme.backgroundAfter,
    ctx.scratch.theme.backgroundBefore,
    "expected background colour to change after theme toggle",
  );
}

export async function expectBackgroundMatchesToggled(ctx: TestContext): Promise<void> {
  const current = await ctx.po.workspace.rootBackgroundColor();
  if (current !== ctx.scratch.theme.backgroundAfter) {
    throw new Error(
      `expected current bg ${current} to equal recorded post-toggle ${ctx.scratch.theme.backgroundAfter}`,
    );
  }
}

export async function expectThemeToggleAriaLabelMentions(
  ctx: TestContext,
  term: string,
): Promise<void> {
  const label = await ctx.po.themeToggle.ariaLabel();
  assertContains(label, term);
}

export async function expectFirstPriceTileVisible(ctx: TestContext, timeoutMs: number): Promise<void> {
  await ctx.po.liveRatesTile.waitForFirstTile(timeoutMs);
}

export async function expectCreditNavVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.creditRfqPanel.navIsVisible(), "credit nav not visible");
}
```

- [ ] **Step 3: Replace `tests/steps/browser/theme.steps.ts` body**

```ts
import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../../support/testContext";
import * as theme from "../../scenarios/theme";

When("the trader toggles the theme",
  function(this: StepContext) { return theme.toggleAndCaptureBackgrounds(this.ctx); });

Then("the theme toggle button is visible",
  function(this: StepContext) { return theme.expectThemeToggleVisible(this.ctx); });

Then("the workspace background color has changed",
  function(this: StepContext) { return theme.expectBackgroundChanged(this.ctx); });

Then("the workspace background color matches the toggled theme",
  function(this: StepContext) { return theme.expectBackgroundMatchesToggled(this.ctx); });

Then("the theme toggle aria-label mentions {string}",
  function(this: StepContext, term: string) {
    return theme.expectThemeToggleAriaLabelMentions(this.ctx, term);
  });

Then("a price tile is visible",
  function(this: StepContext) { return theme.expectFirstPriceTileVisible(this.ctx, 5_000); });

Then("the credit navigation is visible",
  function(this: StepContext) { return theme.expectCreditNavVisible(this.ctx); });
```

No `expect`, no `@playwright/test` import, no module-level state, no `this.page` — all gone.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @rtc/tests typecheck`
Expected: PASS.

- [ ] **Step 5: Run e2e**

Run: `pnpm --filter @rtc/tests test:e2e`
Expected: 40 scenarios passing. Theme scenarios (5) exercise the new pattern; the other 35 use the legacy `this.po` field (preserved on PlaywrightWorld).

- [ ] **Step 6: Commit**

```bash
git add tests/support/world.ts tests/scenarios/theme.ts \
        tests/steps/browser/theme.steps.ts
git commit -m "$(cat <<'EOF'
refactor(phase-5a.2): migrate theme.steps.ts to scenarios + ctx (proof-of-pattern)

PlaywrightWorld grows a `ctx: TestContext` field alongside the legacy `po`
field; theme step file shrinks to pure dispatch into tests/scenarios/theme.ts.
Module-level backgroundBeforeToggle/backgroundAfterToggle vars retire onto
ctx.scratch.theme. Pattern proven; remaining 8 step files migrate in
Tasks 4-7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migrate `connection.steps.ts` + `common.steps.ts`

**Files:**
- Create: `tests/scenarios/connection.ts`
- Create: `tests/scenarios/common.ts`
- Modify: `tests/steps/browser/connection.steps.ts`
- Modify: `tests/steps/browser/common.steps.ts`

These two step files have no module-level state and use only Playwright's `expect.poll` for one assertion. Conversion is mechanical.

- [ ] **Step 1: Create `tests/scenarios/connection.ts`**

```ts
import type { TestContext } from "../support/testContext";
import { assertTrue } from "./assert";

export async function setBrowserOffline(ctx: TestContext, offline: boolean): Promise<void> {
  await ctx.po.workspace.setOffline(offline);
}

export async function expectConnectionStatusFooterVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.footer.isStatusVisible(), "connection status footer not visible");
}

export async function expectConnectionStatusFooterShows(
  ctx: TestContext,
  expected: string,
): Promise<void> {
  // Poll up to 5s for the footer to reflect the expected label. expect.poll's
  // role is filled by a hand-rolled loop here so scenarios stay driver-free.
  const deadline = Date.now() + 5_000;
  let last = "";
  while (Date.now() < deadline) {
    last = await ctx.po.footer.connectionLabel();
    if (last.includes(expected)) return;
    await ctx.po.workspace.wait(100);
  }
  throw new Error(`expected footer to contain ${JSON.stringify(expected)} within 5s; last seen: ${JSON.stringify(last)}`);
}

export async function expectConnectionOverlayHidden(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.connectionOverlay.isHidden(), "connection overlay not hidden");
}

export async function expectConnectionOverlayVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.connectionOverlay.waitVisible(seconds * 1_000);
}

export async function expectConnectionOverlayHiddenWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.connectionOverlay.waitHidden(seconds * 1_000);
}

export async function expectConnectionOverlayTextMatches(
  ctx: TestContext,
  rawRegex: string,
): Promise<void> {
  const match = rawRegex.match(/^\/(.+)\/([gimsuy]*)$/);
  if (!match) throw new Error(`bad regex literal: ${rawRegex}`);
  const re = new RegExp(match[1], match[2]);
  const text = await ctx.po.connectionOverlay.text();
  if (!re.test(text)) {
    throw new Error(`expected ${JSON.stringify(text)} to match ${rawRegex}`);
  }
}
```

- [ ] **Step 2: Replace `tests/steps/browser/connection.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../../support/testContext";
import * as connection from "../../scenarios/connection";

When("the browser goes offline",
  function(this: StepContext) { return connection.setBrowserOffline(this.ctx, true); });

When("the browser comes back online",
  function(this: StepContext) { return connection.setBrowserOffline(this.ctx, false); });

Then("the connection status footer is visible",
  function(this: StepContext) { return connection.expectConnectionStatusFooterVisible(this.ctx); });

Then("the connection status footer shows {string}",
  function(this: StepContext, expected: string) {
    return connection.expectConnectionStatusFooterShows(this.ctx, expected);
  });

Then("the connection overlay is hidden",
  function(this: StepContext) { return connection.expectConnectionOverlayHidden(this.ctx); });

Then("the connection overlay becomes visible within {int} seconds",
  function(this: StepContext, seconds: number) {
    return connection.expectConnectionOverlayVisibleWithin(this.ctx, seconds);
  });

Then("the connection overlay is hidden within {int} seconds",
  function(this: StepContext, seconds: number) {
    return connection.expectConnectionOverlayHiddenWithin(this.ctx, seconds);
  });

Then("the connection overlay text matches {}",
  function(this: StepContext, raw: string) {
    return connection.expectConnectionOverlayTextMatches(this.ctx, raw);
  });
```

- [ ] **Step 3: Create `tests/scenarios/common.ts`**

```ts
import type { TestContext } from "../support/testContext";

export async function openWorkspace(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.open();
}

export async function openFxWorkspace(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.openFx();
}

export async function openCreditWorkspace(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.openCredit();
}

export async function clickTab(
  ctx: TestContext,
  tab: string,
): Promise<void> {
  if (tab !== "fx" && tab !== "credit" && tab !== "admin") {
    throw new Error(`unsupported tab: ${tab}`);
  }
  await ctx.po.workspace.clickTab(tab);
}

export async function reloadPage(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.reload();
}
```

- [ ] **Step 4: Replace `tests/steps/browser/common.steps.ts`**

```ts
import { Given, When } from "@cucumber/cucumber";
import type { StepContext } from "../../support/testContext";
import * as common from "../../scenarios/common";

Given("the trader has the workspace open",
  function(this: StepContext) { return common.openWorkspace(this.ctx); });

Given("the trader has the FX workspace open",
  function(this: StepContext) { return common.openFxWorkspace(this.ctx); });

Given("the credit workspace is open",
  function(this: StepContext) { return common.openCreditWorkspace(this.ctx); });

When("the trader switches to the {string} tab",
  function(this: StepContext, tab: string) { return common.clickTab(this.ctx, tab); });

When("the trader reloads the page",
  function(this: StepContext) { return common.reloadPage(this.ctx); });
```

- [ ] **Step 5: Typecheck + e2e**

Run: `pnpm --filter @rtc/tests typecheck && pnpm --filter @rtc/tests test:e2e`
Expected: 40 scenarios passing.

- [ ] **Step 6: Commit**

```bash
git add tests/scenarios/connection.ts tests/scenarios/common.ts \
        tests/steps/browser/connection.steps.ts tests/steps/browser/common.steps.ts
git commit -m "$(cat <<'EOF'
refactor(phase-5a.2): migrate connection + common step files to scenarios

connection.steps.ts loses its dependency on Playwright's expect.poll by
hand-rolling a polling loop driven by ctx.po.workspace.wait. common.steps.ts
becomes pure dispatch.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Migrate `analytics.steps.ts` + `fxLiveRates.steps.ts`

**Files:**
- Create: `tests/scenarios/analytics.ts`
- Create: `tests/scenarios/fxLiveRates.ts`
- Modify: `tests/steps/browser/analytics.steps.ts`
- Modify: `tests/steps/browser/fxLiveRates.steps.ts`

`fxLiveRates` is the heaviest migration: 13 step decorators, two module-level state vars, one `this.page.waitForTimeout` site.

- [ ] **Step 1: Create `tests/scenarios/analytics.ts`**

```ts
import type { TestContext } from "../support/testContext";
import { assertTrue } from "./assert";

export async function expectAnalyticsPanelVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.analyticsDashboard.waitVisible(seconds * 1_000);
}

export async function expectAnalyticsHasSection(
  ctx: TestContext,
  name: string,
): Promise<void> {
  assertTrue(await ctx.po.analyticsDashboard.hasSection(name), `analytics section not found: ${name}`);
}
```

- [ ] **Step 2: Replace `tests/steps/browser/analytics.steps.ts`**

```ts
import { Then } from "@cucumber/cucumber";
import type { StepContext } from "../../support/testContext";
import * as analytics from "../../scenarios/analytics";

Then("the analytics panel is visible within {int} seconds",
  function(this: StepContext, seconds: number) {
    return analytics.expectAnalyticsPanelVisibleWithin(this.ctx, seconds);
  });

Then("the analytics panel shows the section {string}",
  function(this: StepContext, name: string) {
    return analytics.expectAnalyticsHasSection(this.ctx, name);
  });
```

- [ ] **Step 3: Create `tests/scenarios/fxLiveRates.ts`**

```ts
import type { TestContext } from "../support/testContext";
import { assertContains, assertEquals, assertGte, assertLte, assertTrue, assertGreaterThanZero } from "./assert";

export async function expectFirstPriceTileVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.liveRatesTile.waitForFirstTile(seconds * 1_000);
}

export async function expectAtLeastNTilesVisible(
  ctx: TestContext,
  n: number,
): Promise<void> {
  assertGte(await ctx.po.liveRatesTile.count(), n);
}

export async function expectFirstTileHasBuyAndSellButtons(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.liveRatesTile.firstTileSellVisible(), "first tile sell button not visible");
  assertTrue(await ctx.po.liveRatesTile.firstTileBuyVisible(), "first tile buy button not visible");
}

export async function recordVisibleTileCount(ctx: TestContext, key: string): Promise<void> {
  ctx.scratch.fxLiveRates.recordedCounts.set(key, await ctx.po.liveRatesTile.count());
}

export async function clickCurrencyFilter(ctx: TestContext, category: string): Promise<void> {
  await ctx.po.liveRatesTile.clickFilter(category);
}

export async function expectVisibleTileCountAtMost(
  ctx: TestContext,
  key: string,
): Promise<void> {
  const baseline = ctx.scratch.fxLiveRates.recordedCounts.get(key);
  if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
  assertLte(await ctx.po.liveRatesTile.count(), baseline);
}

export async function expectVisibleTileCountEquals(
  ctx: TestContext,
  key: string,
): Promise<void> {
  const baseline = ctx.scratch.fxLiveRates.recordedCounts.get(key);
  if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
  assertEquals(await ctx.po.liveRatesTile.count(), baseline);
}

export async function expectViewToggleVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.liveRatesTile.viewToggleVisible(), "view toggle not visible");
}

export async function expectViewToggleShows(ctx: TestContext, expected: string): Promise<void> {
  assertContains(await ctx.po.liveRatesTile.viewToggleLabel(), expected);
}

export async function clickViewToggle(ctx: TestContext): Promise<void> {
  await ctx.po.liveRatesTile.clickViewToggle();
}

export async function recordFirstTileText(ctx: TestContext): Promise<void> {
  ctx.scratch.fxLiveRates.firstTileTextSnapshot = await ctx.po.liveRatesTile.firstTileText();
}

export async function waitSeconds(ctx: TestContext, seconds: number): Promise<void> {
  await ctx.po.workspace.wait(seconds * 1_000);
}

export async function expectFirstTileTextNonEmpty(ctx: TestContext): Promise<void> {
  const current = await ctx.po.liveRatesTile.firstTileText();
  assertGreaterThanZero(ctx.scratch.fxLiveRates.firstTileTextSnapshot?.length ?? 0,
    "snapshot length should be > 0");
  assertGreaterThanZero(current.length, "current first tile text should be non-empty");
}
```

- [ ] **Step 4: Replace `tests/steps/browser/fxLiveRates.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../../support/testContext";
import * as fxLiveRates from "../../scenarios/fxLiveRates";

Then("a price tile is visible within {int} seconds",
  function(this: StepContext, seconds: number) {
    return fxLiveRates.expectFirstPriceTileVisibleWithin(this.ctx, seconds);
  });

Then("there is at least {int} visible tile",
  function(this: StepContext, n: number) {
    return fxLiveRates.expectAtLeastNTilesVisible(this.ctx, n);
  });

Then("the first tile has visible sell and buy buttons",
  function(this: StepContext) { return fxLiveRates.expectFirstTileHasBuyAndSellButtons(this.ctx); });

When("the trader records the visible tile count as {string}",
  function(this: StepContext, key: string) {
    return fxLiveRates.recordVisibleTileCount(this.ctx, key);
  });

When("the trader clicks the {string} currency filter",
  function(this: StepContext, category: string) {
    return fxLiveRates.clickCurrencyFilter(this.ctx, category);
  });

Then("the visible tile count is at most {string}",
  function(this: StepContext, key: string) {
    return fxLiveRates.expectVisibleTileCountAtMost(this.ctx, key);
  });

Then("the visible tile count equals {string}",
  function(this: StepContext, key: string) {
    return fxLiveRates.expectVisibleTileCountEquals(this.ctx, key);
  });

Then("the view toggle button is visible",
  function(this: StepContext) { return fxLiveRates.expectViewToggleVisible(this.ctx); });

Then("the view toggle button shows {string}",
  function(this: StepContext, expected: string) {
    return fxLiveRates.expectViewToggleShows(this.ctx, expected);
  });

When("the trader clicks the view toggle",
  function(this: StepContext) { return fxLiveRates.clickViewToggle(this.ctx); });

When("the trader records the first tile text",
  function(this: StepContext) { return fxLiveRates.recordFirstTileText(this.ctx); });

When("the trader waits {int} seconds",
  function(this: StepContext, n: number) { return fxLiveRates.waitSeconds(this.ctx, n); });

Then("the first tile text is non-empty",
  function(this: StepContext) { return fxLiveRates.expectFirstTileTextNonEmpty(this.ctx); });
```

- [ ] **Step 5: Typecheck + e2e**

Run: `pnpm --filter @rtc/tests typecheck && pnpm --filter @rtc/tests test:e2e`
Expected: 40 scenarios passing. The fxLiveRates feature exercises both the snapshot scratchpad and the new `wait` primitive — confirming the pattern carries the heaviest case.

- [ ] **Step 6: Commit**

```bash
git add tests/scenarios/analytics.ts tests/scenarios/fxLiveRates.ts \
        tests/steps/browser/analytics.steps.ts tests/steps/browser/fxLiveRates.steps.ts
git commit -m "$(cat <<'EOF'
refactor(phase-5a.2): migrate analytics + fxLiveRates step files to scenarios

fxLiveRates retires its 2 module-level Maps onto ctx.scratch.fxLiveRates and
replaces this.page.waitForTimeout with ctx.po.workspace.wait. analytics is a
pure mechanical dispatch.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migrate `fxTrading.steps.ts` + `fxRfq.steps.ts`

**Files:**
- Create: `tests/scenarios/fxTrading.ts`
- Create: `tests/scenarios/fxRfq.ts`
- Modify: `tests/steps/browser/fxTrading.steps.ts`
- Modify: `tests/steps/browser/fxRfq.steps.ts`

`fxTrading` has the regex-list parser; `fxRfq` is small.

- [ ] **Step 1: Create `tests/scenarios/fxTrading.ts`**

```ts
import type { TestContext } from "../support/testContext";
import { assertGte, assertTrue } from "./assert";

function parseRegexList(raw: string): RegExp[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .map((literal) => {
      const m = literal.match(/^\/(.+)\/([gimsuy]*)$/);
      if (!m) throw new Error(`bad regex literal: ${literal}`);
      return new RegExp(m[1], m[2]);
    });
}

export async function clickBuyOnFirstTile(ctx: TestContext): Promise<void> {
  await ctx.po.liveRatesTile.clickBuyOnFirst();
}

export async function clickSellOnFirstTile(ctx: TestContext): Promise<void> {
  await ctx.po.liveRatesTile.clickSellOnFirst();
}

export async function expectTradeConfirmationWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.liveRatesTile.waitForConfirmation(seconds * 1_000);
}

export async function expectTradeConfirmationMatchesOneOf(
  ctx: TestContext,
  raw: string,
  timeoutMs = 5_000,
): Promise<void> {
  const patterns = parseRegexList(raw);
  await ctx.po.liveRatesTile.confirmationContainsAny(patterns, timeoutMs);
}

export async function dismissTradeConfirmation(ctx: TestContext): Promise<void> {
  await ctx.po.liveRatesTile.dismissConfirmation();
}

export async function expectTradeConfirmationHidesWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.liveRatesTile.confirmationHidden(seconds * 1_000);
}

export async function expectBlotterVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.blotterTable.isVisible(), "blotter table not visible");
}

export async function expectBlotterHasAtLeastNRows(ctx: TestContext, n: number): Promise<void> {
  assertGte(await ctx.po.blotterTable.rowCount(), n);
}

export async function expectFirstTileNotionalInputVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.liveRatesTile.isNotionalInputVisible(), "first-tile notional input not visible");
}

export async function setFirstTileNotional(ctx: TestContext, value: string): Promise<void> {
  await ctx.po.liveRatesTile.fillFirstTileNotional(value);
}
```

- [ ] **Step 2: Replace `tests/steps/browser/fxTrading.steps.ts`**

The non-timed regex variant uses an anchored regex pattern (per the 5A.1 ambiguity workaround) so Cucumber's ambiguity resolver picks the right step.

```ts
import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../../support/testContext";
import * as fxTrading from "../../scenarios/fxTrading";

When("the trader clicks buy on the first tile",
  function(this: StepContext) { return fxTrading.clickBuyOnFirstTile(this.ctx); });

When("the trader clicks sell on the first tile",
  function(this: StepContext) { return fxTrading.clickSellOnFirstTile(this.ctx); });

Then("the trade confirmation appears within {int} seconds",
  function(this: StepContext, seconds: number) {
    return fxTrading.expectTradeConfirmationWithin(this.ctx, seconds);
  });

Then(
  /^the trade confirmation matches one of (\/.*\/[gimsuy]?(?:,\s*\/.*\/[gimsuy]?)*)$/,
  function(this: StepContext, raw: string) {
    return fxTrading.expectTradeConfirmationMatchesOneOf(this.ctx, raw);
  },
);

Then("the trade confirmation matches one of {} within {int} seconds",
  function(this: StepContext, raw: string, seconds: number) {
    return fxTrading.expectTradeConfirmationMatchesOneOf(this.ctx, raw, seconds * 1_000);
  });

When("the trader dismisses the trade confirmation",
  function(this: StepContext) { return fxTrading.dismissTradeConfirmation(this.ctx); });

Then("the trade confirmation hides within {int} seconds",
  function(this: StepContext, seconds: number) {
    return fxTrading.expectTradeConfirmationHidesWithin(this.ctx, seconds);
  });

Then("the blotter table is visible",
  function(this: StepContext) { return fxTrading.expectBlotterVisible(this.ctx); });

Then("the blotter has at least {int} row",
  function(this: StepContext, n: number) {
    return fxTrading.expectBlotterHasAtLeastNRows(this.ctx, n);
  });

Then("the notional input on the first tile is visible",
  function(this: StepContext) { return fxTrading.expectFirstTileNotionalInputVisible(this.ctx); });

When("the trader sets the first tile notional to {string}",
  function(this: StepContext, value: string) {
    return fxTrading.setFirstTileNotional(this.ctx, value);
  });
```

- [ ] **Step 3: Create `tests/scenarios/fxRfq.ts`**

```ts
import type { TestContext } from "../support/testContext";

export async function expectRfqInitiationButtonWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.fxRfqForm.waitForRfqButton(seconds * 1_000);
}

export async function clickRfqInitiationButton(ctx: TestContext): Promise<void> {
  await ctx.po.fxRfqForm.clickInitiateRfq();
}

export async function expectCountdownOrQuoteWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.fxRfqForm.waitForCountdownOrQuote(seconds * 1_000);
}
```

- [ ] **Step 4: Replace `tests/steps/browser/fxRfq.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../../support/testContext";
import * as fxRfq from "../../scenarios/fxRfq";

Then("the RFQ initiation button appears within {int} seconds",
  function(this: StepContext, seconds: number) {
    return fxRfq.expectRfqInitiationButtonWithin(this.ctx, seconds);
  });

When("the trader clicks the RFQ initiation button",
  function(this: StepContext) { return fxRfq.clickRfqInitiationButton(this.ctx); });

Then("a countdown or quote indicator appears within {int} seconds",
  function(this: StepContext, seconds: number) {
    return fxRfq.expectCountdownOrQuoteWithin(this.ctx, seconds);
  });
```

- [ ] **Step 5: Typecheck + e2e**

Run: `pnpm --filter @rtc/tests typecheck && pnpm --filter @rtc/tests test:e2e`
Expected: 40 scenarios passing.

- [ ] **Step 6: Commit**

```bash
git add tests/scenarios/fxTrading.ts tests/scenarios/fxRfq.ts \
        tests/steps/browser/fxTrading.steps.ts tests/steps/browser/fxRfq.steps.ts
git commit -m "$(cat <<'EOF'
refactor(phase-5a.2): migrate fxTrading + fxRfq step files to scenarios

fxTrading retains its anchored regex pattern for the non-timed confirmation
match variant (preserving the Cucumber ambiguity resolution from 5A.1).
fxRfq is pure mechanical dispatch.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Migrate `creditRfq.steps.ts` + `blotter.steps.ts`

**Files:**
- Create: `tests/scenarios/creditRfq.ts`
- Create: `tests/scenarios/blotter.ts`
- Modify: `tests/steps/browser/creditRfq.steps.ts`
- Modify: `tests/steps/browser/blotter.steps.ts`

`blotter` is the second-heaviest migration: 11 step decorators, one module-level `Map`, two `this.page.waitForTimeout` sites.

- [ ] **Step 1: Create `tests/scenarios/creditRfq.ts`**

```ts
import type { TestContext } from "../support/testContext";
import { assertTrue } from "./assert";

const VALID_CREDIT_TABS = new Set(["tiles", "new-rfq", "sell-side"]);

function ensureCreditTab(tab: string): asserts tab is "tiles" | "new-rfq" | "sell-side" {
  if (!VALID_CREDIT_TABS.has(tab)) throw new Error(`unsupported credit tab: ${tab}`);
}

export async function clickCreditTab(ctx: TestContext, tab: string): Promise<void> {
  ensureCreditTab(tab);
  await ctx.po.creditRfqPanel.clickTab(tab);
}

export async function expectCreditTabVisible(ctx: TestContext, tab: string): Promise<void> {
  ensureCreditTab(tab);
  assertTrue(await ctx.po.creditRfqPanel.tabIsVisible(tab), `credit tab not visible: ${tab}`);
}

export async function expectMessageWithin(
  ctx: TestContext,
  message: string,
  seconds: number,
): Promise<void> {
  if (message === "No RFQs to display") {
    await ctx.po.creditRfqPanel.waitForNoRfqsMessage(seconds * 1_000);
    return;
  }
  throw new Error(`message "${message}" has no PO method; add one if needed`);
}

export async function expectCreditRfqSubmitButtonWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.creditRfqForm.waitForSubmitButton(seconds * 1_000);
}

export async function expectCreditRfqHasBuySellButtons(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.creditRfqForm.hasBuyAndSellButtons(), "credit RFQ form missing Buy/Sell buttons");
}

export async function expectCreditRfqHasDirectionLabel(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.creditRfqForm.hasDirectionLabel(), "credit RFQ form missing Direction label");
}

export async function expectSellSideHeadingWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.creditRfqPanel.waitForSellSideHeading(seconds * 1_000);
}

export async function expectCreditTradesHeadingWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.creditRfqPanel.waitForCreditTradesHeading(seconds * 1_000);
}
```

- [ ] **Step 2: Replace `tests/steps/browser/creditRfq.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../../support/testContext";
import * as creditRfq from "../../scenarios/creditRfq";

When("the trader switches to the credit {string} tab",
  function(this: StepContext, tab: string) { return creditRfq.clickCreditTab(this.ctx, tab); });

Then("the credit {string} tab is visible",
  function(this: StepContext, tab: string) { return creditRfq.expectCreditTabVisible(this.ctx, tab); });

Then("the message {string} appears within {int} seconds",
  function(this: StepContext, message: string, seconds: number) {
    return creditRfq.expectMessageWithin(this.ctx, message, seconds);
  });

Then("the credit RFQ submit button appears within {int} seconds",
  function(this: StepContext, seconds: number) {
    return creditRfq.expectCreditRfqSubmitButtonWithin(this.ctx, seconds);
  });

Then("the credit RFQ form has Buy and Sell direction buttons",
  function(this: StepContext) { return creditRfq.expectCreditRfqHasBuySellButtons(this.ctx); });

Then("the credit RFQ form has a Direction label",
  function(this: StepContext) { return creditRfq.expectCreditRfqHasDirectionLabel(this.ctx); });

Then("the sell-side heading {string} appears within {int} seconds",
  function(this: StepContext, _heading: string, seconds: number) {
    return creditRfq.expectSellSideHeadingWithin(this.ctx, seconds);
  });

Then("the credit trades heading {string} appears within {int} seconds",
  function(this: StepContext, _heading: string, seconds: number) {
    return creditRfq.expectCreditTradesHeadingWithin(this.ctx, seconds);
  });
```

- [ ] **Step 3: Create `tests/scenarios/blotter.ts`**

```ts
import type { TestContext } from "../support/testContext";
import { assertContains, assertEquals, assertGreaterThanZero, assertLte, assertTrue } from "./assert";

export async function clickFirstBlotterHeader(ctx: TestContext): Promise<void> {
  await ctx.po.blotterTable.clickFirstHeader();
}

export async function recordBlotterRowCount(ctx: TestContext, key: string): Promise<void> {
  ctx.scratch.blotter.recordedRowCounts.set(key, await ctx.po.blotterTable.rowCount());
}

export async function setBlotterQuickFilter(ctx: TestContext, text: string): Promise<void> {
  await ctx.po.blotterTable.fillQuickFilter(text);
}

export async function clearBlotterQuickFilter(ctx: TestContext): Promise<void> {
  await ctx.po.blotterTable.clearQuickFilter();
}

export async function expectBlotterRowCountAtMost(ctx: TestContext, key: string): Promise<void> {
  const baseline = ctx.scratch.blotter.recordedRowCounts.get(key);
  if (baseline === undefined) throw new Error(`no recorded row count for ${key}`);
  assertLte(await ctx.po.blotterTable.rowCount(), baseline);
}

export async function expectBlotterRowCountEquals(ctx: TestContext, key: string): Promise<void> {
  const baseline = ctx.scratch.blotter.recordedRowCounts.get(key);
  if (baseline === undefined) throw new Error(`no recorded row count for ${key}`);
  assertEquals(await ctx.po.blotterTable.rowCount(), baseline);
}

export async function expectExportCsvVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.blotterTable.isExportCsvVisible(), "export CSV button not visible");
}

export async function expectExportCsvTextContains(ctx: TestContext, expected: string): Promise<void> {
  assertContains(await ctx.po.blotterTable.exportCsvText(), expected);
}

export async function expectFirstBlotterRowVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.blotterTable.isFirstRowVisible(), "first blotter row not visible");
}

export async function expectFirstBlotterRowBackgroundNonEmpty(ctx: TestContext): Promise<void> {
  const color = await ctx.po.blotterTable.firstRowBackgroundColor();
  assertGreaterThanZero(color.length, "first blotter row background color is empty");
}

export async function hoverFirstBlotterRow(ctx: TestContext): Promise<void> {
  await ctx.po.blotterTable.hoverFirstRow();
}

export async function buyNTimesWithDismissals(ctx: TestContext, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await ctx.po.liveRatesTile.clickBuyOnFirst();
    await ctx.po.workspace.wait(1_500);
    if (await ctx.po.liveRatesTile.isConfirmationVisible()) {
      await ctx.po.liveRatesTile.dismissConfirmation();
      await ctx.po.workspace.wait(500);
    }
  }
}
```

- [ ] **Step 4: Replace `tests/steps/browser/blotter.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../../support/testContext";
import * as blotter from "../../scenarios/blotter";

When("the trader clicks the first blotter header",
  function(this: StepContext) { return blotter.clickFirstBlotterHeader(this.ctx); });

When("the trader records the blotter row count as {string}",
  function(this: StepContext, key: string) { return blotter.recordBlotterRowCount(this.ctx, key); });

When("the trader sets the blotter quick filter to {string}",
  function(this: StepContext, text: string) { return blotter.setBlotterQuickFilter(this.ctx, text); });

When("the trader clears the blotter quick filter",
  function(this: StepContext) { return blotter.clearBlotterQuickFilter(this.ctx); });

Then("the blotter row count is at most {string}",
  function(this: StepContext, key: string) { return blotter.expectBlotterRowCountAtMost(this.ctx, key); });

Then("the blotter row count equals {string}",
  function(this: StepContext, key: string) { return blotter.expectBlotterRowCountEquals(this.ctx, key); });

Then("the export CSV button is visible",
  function(this: StepContext) { return blotter.expectExportCsvVisible(this.ctx); });

Then("the export CSV button text contains {string}",
  function(this: StepContext, expected: string) { return blotter.expectExportCsvTextContains(this.ctx, expected); });

Then("the first blotter row is visible",
  function(this: StepContext) { return blotter.expectFirstBlotterRowVisible(this.ctx); });

Then("the first blotter row background color is non-empty",
  function(this: StepContext) { return blotter.expectFirstBlotterRowBackgroundNonEmpty(this.ctx); });

When("the trader hovers the first blotter row",
  function(this: StepContext) { return blotter.hoverFirstBlotterRow(this.ctx); });

When(
  "the trader buys {int} times with confirmation dismissals",
  { timeout: 30_000 },
  function(this: StepContext, n: number) { return blotter.buyNTimesWithDismissals(this.ctx, n); },
);
```

- [ ] **Step 5: Typecheck + e2e**

Run: `pnpm --filter @rtc/tests typecheck && pnpm --filter @rtc/tests test:e2e`
Expected: 40 scenarios passing. All 9 step files now drive scenarios + ctx; `this.po.x` legacy access is unused.

- [ ] **Step 6: Verify zero remaining `this.page.*` and `expect` imports in step files**

Run: `grep -rE 'this\.page\.|from "@playwright/test"' tests/steps/browser/`
Expected: no matches.

Run: `grep -rE '^let |^const .* = new Map' tests/steps/browser/`
Expected: no matches (zero module-level state).

- [ ] **Step 7: Commit**

```bash
git add tests/scenarios/creditRfq.ts tests/scenarios/blotter.ts \
        tests/steps/browser/creditRfq.steps.ts tests/steps/browser/blotter.steps.ts
git commit -m "$(cat <<'EOF'
refactor(phase-5a.2): migrate creditRfq + blotter step files to scenarios

blotter retires its 1 module-level Map onto ctx.scratch.blotter and replaces
both this.page.waitForTimeout sites with ctx.po.workspace.wait. All 9 step
files now use only scenarios + ctx; module-level state and direct
this.page.* / @playwright/test imports are gone.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Restructure `support/`, rename `steps/browser/` → `steps/`, retire legacy `po` field

**Files:**
- Move: `tests/support/world.ts` → `tests/support/playwright/world.ts`
- Move: `tests/support/hooks.ts` → `tests/support/playwright/hooks.ts`
- Modify (during move): `tests/support/playwright/world.ts` (drop `po` field)
- Move: `tests/steps/browser/*.steps.ts` → `tests/steps/*.steps.ts` (9 files)
- Modify: `tests/steps/*.steps.ts` (update import paths)
- Modify: `tests/cucumber.js` (update `import` paths)

This is the structural refactor that turns the post-migration codebase into the layout the Cypress side will mirror.

- [ ] **Step 1: Create `tests/support/playwright/` directory by moving `world.ts` and `hooks.ts` into it**

```bash
mkdir -p tests/support/playwright
git mv tests/support/world.ts tests/support/playwright/world.ts
git mv tests/support/hooks.ts tests/support/playwright/hooks.ts
```

- [ ] **Step 2: Modify `tests/support/playwright/world.ts` — drop legacy `po` field, fix relative import paths**

```ts
import { setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { TestContext } from "../testContext";
import { Scratchpad } from "../testContext";
import { buildPlaywrightPageObjects } from "../../page-objects/playwright/factory";

export class PlaywrightWorld extends World {
  context!: BrowserContext;
  page!: Page;
  ctx!: TestContext;

  constructor(options: IWorldOptions) {
    super(options);
  }

  async open(browser: Browser): Promise<void> {
    this.context = await browser.newContext({ baseURL: "http://localhost:3000" });
    this.page = await this.context.newPage();
    this.ctx = {
      po: buildPlaywrightPageObjects(this.page),
      scratch: new Scratchpad(),
    };
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

setWorldConstructor(PlaywrightWorld);
```

- [ ] **Step 3: Modify `tests/support/playwright/hooks.ts` — fix relative import paths**

```ts
import { After, AfterAll, Before, BeforeAll } from "@cucumber/cucumber";
import { chromium, type Browser } from "@playwright/test";
import { startDevServer, type DevServerHandle } from "../devServer";
import { PlaywrightWorld } from "./world";

let browser: Browser | undefined;
let dev: DevServerHandle | undefined;

BeforeAll({ timeout: 60_000 }, async () => {
  dev = await startDevServer();
  browser = await chromium.launch();
});

AfterAll(async () => {
  await browser?.close();
  await dev?.stop();
});

Before(async function (this: PlaywrightWorld) {
  if (!browser) throw new Error("browser not initialised in BeforeAll");
  await this.open(browser);
});

After(async function (this: PlaywrightWorld) {
  await this.close();
});
```

- [ ] **Step 4: Move all 9 step files from `steps/browser/` to `steps/`**

```bash
git mv tests/steps/browser/common.steps.ts        tests/steps/common.steps.ts
git mv tests/steps/browser/theme.steps.ts         tests/steps/theme.steps.ts
git mv tests/steps/browser/connection.steps.ts    tests/steps/connection.steps.ts
git mv tests/steps/browser/analytics.steps.ts     tests/steps/analytics.steps.ts
git mv tests/steps/browser/fxLiveRates.steps.ts   tests/steps/fxLiveRates.steps.ts
git mv tests/steps/browser/fxTrading.steps.ts     tests/steps/fxTrading.steps.ts
git mv tests/steps/browser/fxRfq.steps.ts         tests/steps/fxRfq.steps.ts
git mv tests/steps/browser/creditRfq.steps.ts     tests/steps/creditRfq.steps.ts
git mv tests/steps/browser/blotter.steps.ts       tests/steps/blotter.steps.ts
rmdir tests/steps/browser
```

- [ ] **Step 5: Update import paths in all 9 moved step files**

The step files now sit one level shallower, so `../../support/testContext` becomes `../support/testContext` and `../../scenarios/foo` becomes `../scenarios/foo`. Apply this renaming with sed:

```bash
find tests/steps -name '*.steps.ts' -exec sed -i '' \
  -e 's|"../../support/testContext"|"../support/testContext"|g' \
  -e 's|"../../scenarios/|"../scenarios/|g' \
  {} +
```

(macOS sed; GNU sed users drop the `''` after `-i`.)

- [ ] **Step 6: Modify `tests/cucumber.js` — update `import` paths**

```ts
// Cucumber 11 ESM config notes:
//
// - Flat shape (no `default:` wrapper). Cucumber loads this file as
//   `await import(url)` and treats `module.default` as the config directly,
//   so `export default { default: {...} }` fails schema validation. Trade-off:
//   only one profile is possible until this is reorganised into named exports.
//
// - No `loader: ["tsx/esm"]` here. tsx 4.21+'s initialize hook throws when
//   Cucumber invokes it via `node:module.register(specifier)` (Cucumber omits
//   the `data` arg). Instead, tsx is loaded via NODE_OPTIONS in
//   tests/package.json `test:e2e:playwright` script: `NODE_OPTIONS='--import tsx/esm'`.

export default {
  paths: ["specs/**/*.feature"],
  import: ["support/testContext.ts", "support/playwright/**/*.ts", "steps/**/*.ts"],
  format: ["progress-bar", "html:reports/cucumber.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: process.env.CI ? 2 : 0,
};
```

- [ ] **Step 7: Run typecheck + e2e**

Run: `pnpm --filter @rtc/tests typecheck && pnpm --filter @rtc/tests test:e2e`
Expected: 40 scenarios passing.

- [ ] **Step 8: Verify the new layout**

Run:
```bash
ls tests/support/playwright/
ls tests/steps/
test ! -d tests/steps/browser && echo "steps/browser removed"
```

Expected:
```
hooks.ts world.ts
analytics.steps.ts blotter.steps.ts common.steps.ts connection.steps.ts
creditRfq.steps.ts fxLiveRates.steps.ts fxRfq.steps.ts fxTrading.steps.ts theme.steps.ts
steps/browser removed
```

- [ ] **Step 9: Commit**

```bash
git add tests/
git commit -m "$(cat <<'EOF'
refactor(phase-5a.2): restructure support/ + rename steps/browser → steps

support/world.ts and support/hooks.ts move into support/playwright/. The 9
step files move up to steps/ (no more "browser" subdir; Cypress will share
the same tree, not a sibling). Legacy PlaywrightWorld.po field retires —
ctx.po is the sole access path.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Cypress runtime scaffolding (deps, config, support files)

**Files:**
- Create: `tests/cypress.config.ts`
- Create: `tests/.cypress-cucumber-preprocessorrc.json`
- Create: `tests/support/cypress/world.ts`
- Create: `tests/support/cypress/e2e.ts`
- Modify: `tests/package.json` (deps + new scripts)
- Modify: `tests/tsconfig.json` (Cypress types)

This task installs the Cypress dependency stack and lays out the support files. It does NOT yet implement Cypress PO impls — the next task validates one PO end-to-end before scaling.

- [ ] **Step 1: Re-check pinned versions on the npm registry**

Run:
```bash
npm view cypress version
npm view @badeball/cypress-cucumber-preprocessor version
npm view @bahmutov/cypress-esbuild-preprocessor version
npm view esbuild version
```

Record the four resolved versions; you'll paste them into `package.json` exactly.

- [ ] **Step 2: Add devDependencies and scripts to `tests/package.json`**

Replace the file with the following (substitute `<exact>` with versions from Step 1):

```json
{
  "name": "@rtc/tests",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test:e2e": "tsx scripts/run-all.ts",
    "test:e2e:playwright": "NODE_OPTIONS='--import tsx/esm' cucumber-js",
    "test:e2e:cypress": "tsx scripts/with-server.ts cypress run --headless",
    "test:e2e:cypress:open": "tsx scripts/with-server.ts cypress open --e2e",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@badeball/cypress-cucumber-preprocessor": "<exact>",
    "@bahmutov/cypress-esbuild-preprocessor": "<exact>",
    "@cucumber/cucumber": "^11.0.0",
    "@playwright/test": "^1.50",
    "@types/node": "^25.5.0",
    "cypress": "<exact>",
    "esbuild": "<exact>",
    "tsx": "^4.19.0",
    "typescript": "^5.8"
  }
}
```

- [ ] **Step 3: Run `pnpm install`**

Run: `pnpm install`
Expected: lockfile updates with the four new packages and their transitive deps. `pnpm-workspace.yaml` already includes `tests/*`; no root changes needed.

- [ ] **Step 4: Modify `tests/tsconfig.json` — add Cypress types**

Read existing `tests/tsconfig.json` first to confirm the shape, then add `"types": ["node", "cypress", "@badeball/cypress-cucumber-preprocessor/methods"]` (or merge into existing `types` array). Example final shape (assuming current tsconfig extends `../tsconfig.base.json` with `noEmit: true` + `module: "esnext"`):

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["node", "cypress", "@badeball/cypress-cucumber-preprocessor/methods"]
  },
  "include": ["**/*.ts", "cucumber.js", "cypress.config.ts"]
}
```

(Adjust to match the actual current tsconfig — the key change is adding Cypress + preprocessor types so step bodies binding `this: { ctx: TestContext }` typecheck correctly under both runners.)

- [ ] **Step 5: Create `tests/cypress.config.ts`**

```ts
import { defineConfig } from "cypress";
import { createRequire } from "node:module";
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import createEsbuildPlugin from "@badeball/cypress-cucumber-preprocessor/esbuild";

const require = createRequire(import.meta.url);

/**
 * Aliases @cucumber/cucumber → @badeball/cypress-cucumber-preprocessor at
 * bundle time so step files can share one tree across both runners. See
 * docs/architecture.md §11 for the full seam description.
 */
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

- [ ] **Step 6: Create `tests/.cypress-cucumber-preprocessorrc.json`**

```json
{
  "stepDefinitions": ["steps/*.steps.ts"],
  "json": { "enabled": false },
  "html": { "enabled": true, "output": "reports/cypress-cucumber.html" }
}
```

- [ ] **Step 7: Create `tests/support/cypress/world.ts`**

```ts
import type { TestContext } from "../testContext";
import { Scratchpad } from "../testContext";
import { buildCypressPageObjects } from "../../page-objects/cypress/factory";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Mocha {
    interface Context { ctx: TestContext; }
  }
}

export function buildCypressContext(): TestContext {
  return {
    po: buildCypressPageObjects(),
    scratch: new Scratchpad(),
  };
}
```

The factory `buildCypressPageObjects()` doesn't exist yet (Task 10); the import will fail at runtime until Task 10 lands. Typecheck will also fail until then; that's expected.

- [ ] **Step 8: Create `tests/support/cypress/e2e.ts`**

```ts
import { buildCypressContext } from "./world";

beforeEach(function() {
  this.ctx = buildCypressContext();
  cy.visit("/");
});
```

- [ ] **Step 9: Verify Cypress launches (without running specs successfully)**

Run: `pnpm --filter @rtc/tests exec cypress info`
Expected: cypress prints version info. This proves the install worked and config files are at least syntactically valid.

- [ ] **Step 10: Verify Playwright still green**

Run: `pnpm --filter @rtc/tests test:e2e:playwright`
Expected: 40 scenarios passing. Cypress changes haven't disturbed Cucumber-JS.

(Note: typecheck will FAIL at this point because `tests/page-objects/cypress/factory.ts` doesn't exist yet. That's intentional and gets fixed in Task 10. Skip typecheck until then.)

- [ ] **Step 11: Commit**

```bash
git add tests/cypress.config.ts \
        tests/.cypress-cucumber-preprocessorrc.json \
        tests/support/cypress/world.ts \
        tests/support/cypress/e2e.ts \
        tests/package.json tests/tsconfig.json \
        pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(phase-5a.2): scaffold Cypress runtime stack

Adds cypress, @badeball/cypress-cucumber-preprocessor, and the esbuild
bundler with the alias plugin that maps @cucumber/cucumber to the
preprocessor at bundle time. Cypress support/cypress/{world,e2e}.ts file
attaches a fresh TestContext to Mocha.Context per scenario. Typecheck
intentionally fails until Task 10 supplies the buildCypressPageObjects
factory.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: First Cypress PO impl (Workspace) + factory + validate one scenario

**Files:**
- Create: `tests/page-objects/cypress/Workspace.ts`
- Create: `tests/page-objects/cypress/factory.ts`
- Create: 9 stub PO files in `tests/page-objects/cypress/`

This task gets typecheck back to green by stubbing the 9 not-yet-implemented PO classes and implementing only `CypressWorkspace` fully. It validates the seam end-to-end against one scenario.

- [ ] **Step 1: Implement `tests/page-objects/cypress/Workspace.ts`**

```ts
import type { WorkspacePO } from "../contracts/Workspace";
import { TESTIDS } from "../contracts/testids";

/**
 * Cypress impl of WorkspacePO. Methods return Promise<T> by chaining `.then`
 * on the underlying Cypress chainable so step bodies awaiting these calls
 * resolve in the same way they do under Playwright.
 */
export class CypressWorkspace implements WorkspacePO {
  open(): Promise<void> {
    return new Promise((resolve) => {
      cy.visit("/").then(() => resolve());
    });
  }
  openFx(): Promise<void> {
    return new Promise((resolve) => {
      cy.visit("/")
        .then(() => cy.get(`[data-testid="${TESTIDS.shell.tab("fx")}"]`).click())
        .then(() => resolve());
    });
  }
  openCredit(): Promise<void> {
    return new Promise((resolve) => {
      cy.visit("/")
        .then(() => cy.get(`[data-testid="${TESTIDS.shell.tab("credit")}"]`).click())
        .then(() => resolve());
    });
  }
  openAdmin(): Promise<void> {
    return new Promise((resolve) => {
      cy.visit("/")
        .then(() => cy.get(`[data-testid="${TESTIDS.shell.tab("admin")}"]`).click())
        .then(() => resolve());
    });
  }
  clickTab(tab: "fx" | "credit" | "admin"): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.shell.tab(tab)}"]`).click().then(() => resolve());
    });
  }
  reload(): Promise<void> {
    return new Promise((resolve) => {
      cy.reload().then(() => resolve());
    });
  }
  setOffline(_offline: boolean): Promise<void> {
    // Implemented in Task 14 via CDP. Throw a clear marker for now so any
    // scenario that hits this path before Task 14 fails loudly.
    throw new Error("CypressWorkspace.setOffline pending Task 14 (CDP); tag affected scenarios @playwright-only if blocking");
  }
  rootBackgroundColor(): Promise<string> {
    return new Promise((resolve) => {
      cy.get("#root > div")
        .then(($el) => resolve(getComputedStyle($el[0]).backgroundColor));
    });
  }
  wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      cy.wait(ms).then(() => resolve());
    });
  }
}
```

- [ ] **Step 2: Create stub PO file `tests/page-objects/cypress/ThemeToggle.ts`**

```ts
import type { ThemeTogglePO } from "../contracts/ThemeToggle";

function notYet(name: string): never {
  throw new Error(`CypressThemeToggle.${name}() not yet implemented (Phase 5A.2 task >10)`);
}

export class CypressThemeToggle implements ThemeTogglePO {
  click(): Promise<void> { notYet("click"); }
  isVisible(): Promise<boolean> { notYet("isVisible"); }
  ariaLabel(): Promise<string> { notYet("ariaLabel"); }
}
```

(Method signatures must match the contract exactly. If the contract differs, copy the contract file's interface lines verbatim into the stub.)

- [ ] **Step 3: Create remaining 8 stub PO files**

Repeat the pattern from Step 2 for: `Footer.ts`, `ConnectionOverlay.ts`, `LiveRatesTile.ts`, `FxRfqForm.ts`, `AnalyticsDashboard.ts`, `CreditRfqForm.ts`, `CreditRfqPanel.ts`, `BlotterTable.ts`. Each stub must implement the contract's full method set; each method body is `notYet("methodName")`.

For each, define `notYet` locally in the file (1 line at top). Method signatures copy verbatim from the corresponding `tests/page-objects/contracts/<File>.ts`.

- [ ] **Step 4: Create `tests/page-objects/cypress/factory.ts`**

```ts
import type { PageObjects } from "../contracts";
import { CypressWorkspace } from "./Workspace";
import { CypressThemeToggle } from "./ThemeToggle";
import { CypressFooter } from "./Footer";
import { CypressConnectionOverlay } from "./ConnectionOverlay";
import { CypressLiveRatesTile } from "./LiveRatesTile";
import { CypressFxRfqForm } from "./FxRfqForm";
import { CypressAnalyticsDashboard } from "./AnalyticsDashboard";
import { CypressCreditRfqForm } from "./CreditRfqForm";
import { CypressCreditRfqPanel } from "./CreditRfqPanel";
import { CypressBlotterTable } from "./BlotterTable";

export function buildCypressPageObjects(): PageObjects {
  return {
    workspace: new CypressWorkspace(),
    themeToggle: new CypressThemeToggle(),
    footer: new CypressFooter(),
    connectionOverlay: new CypressConnectionOverlay(),
    liveRatesTile: new CypressLiveRatesTile(),
    fxRfqForm: new CypressFxRfqForm(),
    analyticsDashboard: new CypressAnalyticsDashboard(),
    creditRfqForm: new CypressCreditRfqForm(),
    creditRfqPanel: new CypressCreditRfqPanel(),
    blotterTable: new CypressBlotterTable(),
  };
}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @rtc/tests typecheck`
Expected: PASS. All 10 stubs satisfy their contracts; the factory wires them up; `support/cypress/world.ts` no longer references a missing module.

- [ ] **Step 6: Manually start the dev server and validate one Cypress scenario**

Open one terminal:
```bash
pnpm --filter @rtc/client dev
# wait for "Local: http://localhost:3000/"
```

Add a temporary scenario at the top of `tests/specs/theme.feature` that exercises only the Workspace impl (Background-only — every other PO is still a stub):

```gherkin
@cypress-smoke
Scenario: workspace opens (Cypress smoke)
  Given the trader has the workspace open
```

- [ ] **Step 7: Run the smoke scenario in Cypress**

```bash
pnpm --filter @rtc/tests exec cypress run --headless --spec specs/theme.feature --env tags="@cypress-smoke"
```

Expected: 1 scenario passes. The bundler alias works; `Given(...)` from `@cucumber/cucumber` resolved to the preprocessor; the smoke scenario hit `CypressWorkspace.open()` and succeeded.

If this fails: investigate the alias plugin (esbuild log), the preprocessor config, or the support file before continuing.

- [ ] **Step 8: Remove the temporary `@cypress-smoke` scenario**

```bash
git checkout tests/specs/theme.feature
```

- [ ] **Step 9: Run Playwright e2e to confirm zero regression**

Run: `pnpm --filter @rtc/tests test:e2e:playwright`
Expected: 40 scenarios passing.

- [ ] **Step 10: Commit**

```bash
git add tests/page-objects/cypress/
git commit -m "$(cat <<'EOF'
feat(phase-5a.2): implement CypressWorkspace + factory + 9 stub POs

CypressWorkspace fully implemented; remaining 9 PO classes stubbed with
notYet() throwers matching the contract interfaces so typecheck passes
and the factory wires up. setOffline throws a marker pointing at Task 14.
Smoke scenario verified the @cucumber/cucumber bundler alias resolves
correctly under Cypress + esbuild.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Cypress PO impls — batch A (ThemeToggle, Footer, ConnectionOverlay, AnalyticsDashboard)

**Files:**
- Modify: `tests/page-objects/cypress/ThemeToggle.ts`
- Modify: `tests/page-objects/cypress/Footer.ts`
- Modify: `tests/page-objects/cypress/ConnectionOverlay.ts`
- Modify: `tests/page-objects/cypress/AnalyticsDashboard.ts`

These four POs are the simplest — visibility, text, and click checks only. After this task, Cypress runs the theme + connection (excluding offline) + analytics features.

For reference: contracts for each are in `tests/page-objects/contracts/<File>.ts`. Read them before implementing.

- [ ] **Step 1: Read the relevant contracts**

```bash
cat tests/page-objects/contracts/ThemeToggle.ts \
    tests/page-objects/contracts/Footer.ts \
    tests/page-objects/contracts/ConnectionOverlay.ts \
    tests/page-objects/contracts/AnalyticsDashboard.ts
```

Each PO method signature must match the contract exactly.

- [ ] **Step 2: Implement `tests/page-objects/cypress/ThemeToggle.ts`**

```ts
import type { ThemeTogglePO } from "../contracts/ThemeToggle";
import { TESTIDS } from "../contracts/testids";

export class CypressThemeToggle implements ThemeTogglePO {
  click(): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.shell.themeToggle}"]`).click().then(() => resolve());
    });
  }
  isVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.shell.themeToggle}"]`)
        .then(($el) => resolve($el.is(":visible")));
    });
  }
  ariaLabel(): Promise<string> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.shell.themeToggle}"]`)
        .then(($el) => resolve($el.attr("aria-label") ?? ""));
    });
  }
}
```

- [ ] **Step 3: Implement `tests/page-objects/cypress/Footer.ts`**

(Read `tests/page-objects/contracts/Footer.ts` to confirm method signatures. Likely shape:)

```ts
import type { FooterPO } from "../contracts/Footer";
import { TESTIDS } from "../contracts/testids";

export class CypressFooter implements FooterPO {
  isStatusVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.connection.status}"]`)
        .then(($el) => resolve($el.is(":visible")));
    });
  }
  connectionLabel(): Promise<string> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.connection.status}"]`)
        .then(($el) => resolve($el.text()));
    });
  }
}
```

(Adjust method bodies and signatures to match the actual `FooterPO` contract.)

- [ ] **Step 4: Implement `tests/page-objects/cypress/ConnectionOverlay.ts`**

```ts
import type { ConnectionOverlayPO } from "../contracts/ConnectionOverlay";
import { TESTIDS } from "../contracts/testids";

export class CypressConnectionOverlay implements ConnectionOverlayPO {
  isHidden(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        const found = $body.find(`[data-testid="${TESTIDS.connection.overlay}"]`);
        resolve(found.length === 0 || !found.is(":visible"));
      });
    });
  }
  waitVisible(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.connection.overlay}"]`, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
  waitHidden(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.connection.overlay}"]`, { timeout: timeoutMs })
        .should("not.exist")
        .then(() => resolve());
    });
  }
  text(): Promise<string> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.connection.overlay}"]`)
        .then(($el) => resolve($el.text()));
    });
  }
}
```

(Adjust to actual contract — `isHidden` semantics: confirm against the Playwright impl's behavior. The Playwright impl likely uses `locator.isHidden()` which returns true if not visible OR not attached. The Cypress port above mirrors that.)

- [ ] **Step 5: Implement `tests/page-objects/cypress/AnalyticsDashboard.ts`**

```ts
import type { AnalyticsDashboardPO } from "../contracts/AnalyticsDashboard";
import { TESTIDS } from "../contracts/testids";

export class CypressAnalyticsDashboard implements AnalyticsDashboardPO {
  waitVisible(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.analytics.panel}"]`, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
  hasSection(name: string): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.analytics.panel}"]`)
        .then(($panel) => resolve($panel.text().includes(name)));
    });
  }
}
```

(Adjust signatures to the actual contract.)

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @rtc/tests typecheck`
Expected: PASS.

- [ ] **Step 7: Run Cypress against affected features**

Manually start dev server (`pnpm --filter @rtc/client dev`), then in a second terminal:

```bash
pnpm --filter @rtc/tests exec cypress run --headless \
  --spec "specs/theme.feature,specs/analytics.feature,specs/connection.feature"
```

Expected: theme (5) + analytics (4) all pass. Connection passes 2 of 4 (the 2 non-offline scenarios); the 2 offline scenarios fail at `setOffline` with the clear marker error from Task 10. That's expected — Task 14 fixes them.

- [ ] **Step 8: Run Playwright e2e to confirm zero regression**

Run: `pnpm --filter @rtc/tests test:e2e:playwright`
Expected: 40 scenarios passing.

- [ ] **Step 9: Commit**

```bash
git add tests/page-objects/cypress/{ThemeToggle,Footer,ConnectionOverlay,AnalyticsDashboard}.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.2): Cypress PO impls — ThemeToggle, Footer, ConnectionOverlay, AnalyticsDashboard

Cypress now passes theme (5) + analytics (4) + 2 of 4 connection scenarios.
The 2 offline-flow scenarios fail at setOffline with a Task 14 marker.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Cypress PO impls — batch B (LiveRatesTile, FxRfqForm)

**Files:**
- Modify: `tests/page-objects/cypress/LiveRatesTile.ts`
- Modify: `tests/page-objects/cypress/FxRfqForm.ts`

`LiveRatesTile` is the heaviest PO (17 methods). After this task, Cypress runs fxLiveRates (6) + fxRfq (2) + fxTrading (5) — most of the active-trading suite.

- [ ] **Step 1: Read the LiveRatesTile contract**

```bash
cat tests/page-objects/contracts/LiveRatesTile.ts
```

The contract defines 17 methods. Each Cypress impl method calls the equivalent `cy` chain.

- [ ] **Step 2: Implement `tests/page-objects/cypress/LiveRatesTile.ts`**

```ts
import type { LiveRatesTilePO } from "../contracts/LiveRatesTile";
import { TESTIDS } from "../contracts/testids";

const TILE_PREFIX_SELECTOR = `[data-testid^="${TESTIDS.liveRates.tilePrefix}"]`;

export class CypressLiveRatesTile implements LiveRatesTilePO {
  waitForFirstTile(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR, { timeout: timeoutMs })
        .first()
        .should("be.visible")
        .then(() => resolve());
    });
  }
  count(): Promise<number> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        resolve($body.find(TILE_PREFIX_SELECTOR).length);
      });
    });
  }
  firstTileText(): Promise<string> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first().then(($el) => resolve($el.text()));
    });
  }
  clickFilter(category: string): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.liveRates.filter(category)}"]`).click().then(() => resolve());
    });
  }
  clickViewToggle(): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.liveRates.viewToggle}"]`).click().then(() => resolve());
    });
  }
  viewToggleLabel(): Promise<string> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.liveRates.viewToggle}"]`).then(($el) => resolve($el.text()));
    });
  }
  firstTileBuyVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first().then(($tile) => {
        resolve($tile.find(`[data-testid="${TESTIDS.liveRates.buyBtn}"]`).is(":visible"));
      });
    });
  }
  firstTileSellVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first().then(($tile) => {
        resolve($tile.find(`[data-testid="${TESTIDS.liveRates.sellBtn}"]`).is(":visible"));
      });
    });
  }
  viewToggleVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        resolve($body.find(`[data-testid="${TESTIDS.liveRates.viewToggle}"]`).is(":visible"));
      });
    });
  }
  clickBuyOnFirst(): Promise<void> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first()
        .find(`[data-testid="${TESTIDS.liveRates.buyBtn}"]`).click()
        .then(() => resolve());
    });
  }
  clickSellOnFirst(): Promise<void> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first()
        .find(`[data-testid="${TESTIDS.liveRates.sellBtn}"]`).click()
        .then(() => resolve());
    });
  }
  waitForConfirmation(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first()
        .find(`[data-testid="${TESTIDS.liveRates.tradeConfirmation}"]`, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
  confirmationContainsAny(patterns: readonly RegExp[], timeoutMs: number): Promise<void> {
    const combined = new RegExp(patterns.map((p) => p.source).join("|"), "i");
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first()
        .find(`[data-testid="${TESTIDS.liveRates.tradeConfirmation}"]`, { timeout: timeoutMs })
        .should(($el) => {
          if (!combined.test($el.text())) {
            throw new Error(`expected confirmation text to match ${combined}; got ${JSON.stringify($el.text())}`);
          }
        })
        .then(() => resolve());
    });
  }
  dismissConfirmation(): Promise<void> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first()
        .find(`[data-testid="${TESTIDS.liveRates.tradeConfirmation}"]`).click()
        .then(() => resolve());
    });
  }
  confirmationHidden(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first()
        .find(`[data-testid="${TESTIDS.liveRates.tradeConfirmation}"]`, { timeout: timeoutMs })
        .should("not.be.visible")
        .then(() => resolve());
    });
  }
  isConfirmationVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first().then(($tile) => {
        resolve($tile.find(`[data-testid="${TESTIDS.liveRates.tradeConfirmation}"]`).is(":visible"));
      });
    });
  }
  fillFirstTileNotional(value: string): Promise<void> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first()
        .find("input")
        .click()
        .clear()
        .type(`${value}{enter}`)
        .then(() => resolve());
    });
  }
  isNotionalInputVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get(TILE_PREFIX_SELECTOR).first().then(($tile) => {
        resolve($tile.find("input").is(":visible"));
      });
    });
  }
}
```

**Note on `TILE_PREFIX_SELECTOR`:** the selector uses `TESTIDS.liveRates.tilePrefix` (the constant `"tile-"`) and is constructed once at module level. The literal value `tile-` lives in `testids.ts`; the full selector string is constructed via interpolation. This is compliant with gate #1's pattern `data-testid="[a-z]` (which targets literal `data-testid="exact-id"` strings — the constructed `[data-testid^="${...}"]` doesn't match because the substring after the `=` is a `^=` operator + interpolation, not a literal lowercase letter).

- [ ] **Step 3: Read the FxRfqForm contract and Playwright impl**

```bash
cat tests/page-objects/contracts/FxRfqForm.ts \
    tests/page-objects/playwright/FxRfqForm.ts
```

The Playwright impl is the source of truth for the precise selector logic of `waitForCountdownOrQuote` (the contract is descriptive but doesn't specify selectors).

- [ ] **Step 4: Implement `tests/page-objects/cypress/FxRfqForm.ts`**

(Mirror the Playwright impl's exact selector logic. Adjust to the actual contract:)

```ts
import type { FxRfqFormPO } from "../contracts/FxRfqForm";

export class CypressFxRfqForm implements FxRfqFormPO {
  waitForRfqButton(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.contains("button", "RFQ", { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
  clickInitiateRfq(): Promise<void> {
    return new Promise((resolve) => {
      cy.contains("button", "RFQ").click().then(() => resolve());
    });
  }
  waitForCountdownOrQuote(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      // Mirror Playwright impl's exact selector. Verify by running the
      // existing Playwright impl through and copying its locator.
      cy.get("body", { timeout: timeoutMs }).should(($body) => {
        if (!$body.text().match(/Initiating|\d+:\d+/)) {
          throw new Error("countdown or quote indicator not yet visible");
        }
      }).then(() => resolve());
    });
  }
}
```

Strings like "Initiating" or quote-pattern matchers are part of UI copy and may need entries in `STRINGS` if reused — check the Playwright impl. If a literal copy is used, add an entry to `tests/page-objects/contracts/strings.ts` (e.g. `STRINGS.fxRfq.initiating = "Initiating"`) and reference it in BOTH impls.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @rtc/tests typecheck`
Expected: PASS.

- [ ] **Step 6: Run Cypress against affected features**

Manually start dev server, then:
```bash
pnpm --filter @rtc/tests exec cypress run --headless \
  --spec "specs/fxLiveRates.feature,specs/fxRfq.feature,specs/fxTrading.feature"
```

Expected: fxLiveRates (6) + fxRfq (2) + fxTrading (5) all pass = 13 scenarios.

- [ ] **Step 7: Run Playwright e2e to confirm zero regression**

Run: `pnpm --filter @rtc/tests test:e2e:playwright`
Expected: 40 scenarios passing.

- [ ] **Step 8: Commit**

```bash
git add tests/page-objects/cypress/{LiveRatesTile,FxRfqForm}.ts
# also stage strings.ts and any STRINGS-using PO file if Step 4 needed it
git commit -m "$(cat <<'EOF'
feat(phase-5a.2): Cypress PO impls — LiveRatesTile, FxRfqForm

Cypress now passes fxLiveRates + fxRfq + fxTrading (13 more scenarios).
LiveRatesTile uses TESTIDS.liveRates.tilePrefix to construct the prefix
selector once at module level.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Cypress PO impls — batch C (CreditRfqForm, CreditRfqPanel, BlotterTable) + STRINGS migration

**Files:**
- Modify: `tests/page-objects/cypress/CreditRfqForm.ts`
- Modify: `tests/page-objects/cypress/CreditRfqPanel.ts`
- Modify: `tests/page-objects/cypress/BlotterTable.ts`
- Modify: `tests/page-objects/playwright/CreditRfqForm.ts` (use STRINGS)

After this task, Cypress runs all features except the 2 offline scenarios.

- [ ] **Step 1: Read the contracts**

```bash
cat tests/page-objects/contracts/CreditRfqForm.ts \
    tests/page-objects/contracts/CreditRfqPanel.ts \
    tests/page-objects/contracts/BlotterTable.ts
```

- [ ] **Step 2: Implement `tests/page-objects/cypress/CreditRfqForm.ts` — uses STRINGS**

```ts
import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";
import { STRINGS } from "../contracts/strings";

export class CypressCreditRfqForm implements CreditRfqFormPO {
  waitForSubmitButton(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.contains(STRINGS.creditRfq.submitButton, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
  hasBuyAndSellButtons(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        const buy = $body.find('button:contains("Buy"), button[aria-label="Buy"]').first().is(":visible");
        const sell = $body.find('button:contains("Sell"), button[aria-label="Sell"]').first().is(":visible");
        resolve(buy && sell);
      });
    });
  }
  hasDirectionLabel(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        const labels = $body.find("label").filter((_, el) => /Direction/.test(el.textContent ?? ""));
        resolve(labels.is(":visible"));
      });
    });
  }
}
```

- [ ] **Step 3: Modify `tests/page-objects/playwright/CreditRfqForm.ts` — use STRINGS**

```ts
import { expect, type Page } from "@playwright/test";
import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";
import { STRINGS } from "../contracts/strings";

export class PlaywrightCreditRfqForm implements CreditRfqFormPO {
  constructor(private readonly page: Page) {}

  async waitForSubmitButton(timeoutMs: number): Promise<void> {
    await expect(this.page.getByText(STRINGS.creditRfq.submitButton)).toBeVisible({ timeout: timeoutMs });
  }
  async hasBuyAndSellButtons(): Promise<boolean> {
    const buyVisible = await this.page
      .getByRole("button", { name: "Buy", exact: true })
      .isVisible();
    const sellVisible = await this.page
      .getByRole("button", { name: "Sell", exact: true })
      .isVisible();
    return buyVisible && sellVisible;
  }
  async hasDirectionLabel(): Promise<boolean> {
    return await this.page
      .locator("label")
      .filter({ hasText: "Direction" })
      .isVisible();
  }
}
```

- [ ] **Step 4: Implement `tests/page-objects/cypress/CreditRfqPanel.ts`**

(Adjust to actual contract; example shape:)

```ts
import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";
import { TESTIDS } from "../contracts/testids";

export class CypressCreditRfqPanel implements CreditRfqPanelPO {
  navIsVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        resolve($body.find(`[data-testid="${TESTIDS.credit.nav}"]`).is(":visible"));
      });
    });
  }
  clickTab(tab: "tiles" | "new-rfq" | "sell-side"): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.credit.tab(tab)}"]`).click().then(() => resolve());
    });
  }
  tabIsVisible(tab: "tiles" | "new-rfq" | "sell-side"): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        resolve($body.find(`[data-testid="${TESTIDS.credit.tab(tab)}"]`).is(":visible"));
      });
    });
  }
  waitForNoRfqsMessage(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.contains("No RFQs to display", { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
  waitForSellSideHeading(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.contains(/Sell.?Side/i, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
  waitForCreditTradesHeading(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.contains(/Credit Trades/i, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
}
```

(Mirror the Playwright impl's exact selectors; if the Playwright impl uses copy-as-selector strings beyond "No RFQs to display", "Sell-Side", "Credit Trades", add them to `STRINGS` and reference here.)

- [ ] **Step 5: Implement `tests/page-objects/cypress/BlotterTable.ts`**

```ts
import type { BlotterTablePO } from "../contracts/BlotterTable";
import { TESTIDS } from "../contracts/testids";

export class CypressBlotterTable implements BlotterTablePO {
  waitVisible(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.table}"]`, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
  isVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        resolve($body.find(`[data-testid="${TESTIDS.blotter.table}"]`).is(":visible"));
      });
    });
  }
  rowCount(): Promise<number> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        resolve($body.find(`[data-testid="${TESTIDS.blotter.table}"] tbody tr`).length);
      });
    });
  }
  clickFirstHeader(): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.table}"] th`).first().click().then(() => resolve());
    });
  }
  fillQuickFilter(text: string): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.quickFilter}"]`).clear().type(text).then(() => resolve());
    });
  }
  clearQuickFilter(): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.quickFilter}"]`).clear().then(() => resolve());
    });
  }
  isExportCsvVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        resolve($body.find(`[data-testid="${TESTIDS.blotter.exportCsv}"]`).is(":visible"));
      });
    });
  }
  exportCsvText(): Promise<string> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.exportCsv}"]`).then(($el) => resolve($el.text()));
    });
  }
  hoverFirstRow(): Promise<void> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.table}"] tbody tr`).first().trigger("mouseover").then(() => resolve());
    });
  }
  firstRowBackgroundColor(): Promise<string> {
    return new Promise((resolve) => {
      cy.get(`[data-testid="${TESTIDS.blotter.table}"] tbody tr`).first()
        .then(($el) => resolve(getComputedStyle($el[0]).backgroundColor));
    });
  }
  isFirstRowVisible(): Promise<boolean> {
    return new Promise((resolve) => {
      cy.get("body").then(($body) => {
        resolve($body.find(`[data-testid="${TESTIDS.blotter.table}"] tbody tr`).first().is(":visible"));
      });
    });
  }
}
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @rtc/tests typecheck`
Expected: PASS.

- [ ] **Step 7: Run Cypress against all features except connection**

Manually start dev server, then:

```bash
pnpm --filter @rtc/tests exec cypress run --headless \
  --spec "specs/theme.feature,specs/analytics.feature,specs/fxLiveRates.feature,specs/fxRfq.feature,specs/fxTrading.feature,specs/creditRfq.feature,specs/blotter.feature"
```

Expected: 36 scenarios pass (40 minus 4 connection scenarios). Run connection separately:

```bash
pnpm --filter @rtc/tests exec cypress run --headless --spec "specs/connection.feature"
```

Expected: 2 scenarios pass (the 2 non-offline), 2 fail at `setOffline` marker.

Total Cypress: 38 of 40 passing.

- [ ] **Step 8: Run Playwright e2e to confirm zero regression**

Run: `pnpm --filter @rtc/tests test:e2e:playwright`
Expected: 40 scenarios passing.

- [ ] **Step 9: Commit**

```bash
git add tests/page-objects/cypress/{CreditRfqForm,CreditRfqPanel,BlotterTable}.ts \
        tests/page-objects/playwright/CreditRfqForm.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.2): Cypress PO impls — CreditRfqForm, CreditRfqPanel, BlotterTable

Cypress now passes 38 of 40 scenarios. Playwright CreditRfqForm migrated to
use STRINGS.creditRfq.submitButton — both impls now reference the SOT.
Remaining 2 Cypress failures are the offline-flow scenarios pending Task 14.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `setOffline` via CDP (or fallback `@playwright-only` tag)

**Files:**
- Modify: `tests/page-objects/cypress/Workspace.ts` (replace `setOffline` body)
- Optional (fallback): `tests/specs/connection.feature` + `tests/.cypress-cucumber-preprocessorrc.json`

This task implements `CypressWorkspace.setOffline` using Chrome DevTools Protocol. Time-boxed: if the CDP plumbing exceeds the task budget, fall back to the tag strategy and skip those 2 scenarios in Cypress.

- [ ] **Step 1: Implement `setOffline` via CDP — primary path**

Replace the throwing stub in `tests/page-objects/cypress/Workspace.ts:setOffline`:

```ts
  setOffline(offline: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      Cypress.automation("remote:debugger:protocol", {
        command: "Network.emulateNetworkConditions",
        params: {
          offline,
          latency: 0,
          downloadThroughput: 0,
          uploadThroughput: 0,
        },
      })
        .then(() => {
          // The browser fires online/offline DOM events automatically when
          // CDP network conditions flip. No additional dispatch needed.
          resolve();
        })
        .catch((err) => reject(err));
    });
  }
```

- [ ] **Step 2: Run Cypress against connection feature**

Manually start dev server, then:

```bash
pnpm --filter @rtc/tests exec cypress run --headless --spec "specs/connection.feature"
```

Expected: 4 of 4 connection scenarios pass.

- [ ] **Step 3: If CDP works — confirm full Cypress run**

Run all features:

```bash
pnpm --filter @rtc/tests exec cypress run --headless
```

Expected: 40 of 40 scenarios pass.

If you got here, commit the CDP impl and **skip Steps 4-7**.

- [ ] **Step 4: If CDP plumbing fails — fallback to `@playwright-only` tag**

Diagnostic checklist before falling back:
1. Did `Cypress.automation` reject with a clear error?
2. Did the network conditions flip but `online`/`offline` events not fire? (Some Chrome versions need an extra `Page.reload` or manual `dispatchEvent`.)
3. Did the app's `useBrowserOnline` hook actually re-evaluate? Add `cy.then(() => cy.window().then(w => console.log("online?", w.navigator.onLine)))` to confirm.

If after diagnostic effort the path is non-trivial, proceed with the fallback below (~ 30 minutes total budget for this task).

- [ ] **Step 5: Tag the 2 affected scenarios `@playwright-only` in `tests/specs/connection.feature`**

```gherkin
Feature: Connection status

  Background:
    Given the trader has the workspace open

  Scenario: connected status is shown in the footer
    Then the connection status footer is visible
    And the connection status footer shows "Connected"

  Scenario: connection overlay is hidden when connected
    Then the connection overlay is hidden

  @playwright-only
  Scenario: going offline shows the overlay with an offline message
    When the browser goes offline
    Then the connection overlay becomes visible within 3 seconds
    And the connection overlay text matches /offline/i
    And the connection status footer shows "Offline"

  @playwright-only
  Scenario: coming back online dismisses the overlay
    When the browser goes offline
    And the connection overlay becomes visible within 3 seconds
    And the browser comes back online
    Then the connection overlay is hidden within 5 seconds
    And the connection status footer shows "Connected"
```

- [ ] **Step 6: Configure preprocessor to skip `@playwright-only` tagged scenarios**

Modify `tests/.cypress-cucumber-preprocessorrc.json`:

```json
{
  "stepDefinitions": ["steps/*.steps.ts"],
  "filterSpecs": true,
  "omitFiltered": true,
  "tagsFilter": "not @playwright-only",
  "json": { "enabled": false },
  "html": { "enabled": true, "output": "reports/cypress-cucumber.html" }
}
```

Cucumber-JS does NOT need to filter `@playwright-only` (the tag is purely instructive). All 40 scenarios still run under Playwright.

- [ ] **Step 7: Replace the `setOffline` body with a Cypress-only error message**

Since the 2 offline scenarios are tagged out, `setOffline` should never be called under Cypress. Keep a clear marker so an accidental untagged invocation surfaces the constraint:

```ts
  setOffline(_offline: boolean): Promise<void> {
    return Promise.reject(new Error(
      "setOffline is not implemented under Cypress; affected scenarios are tagged @playwright-only. " +
      "If you reach here, the scenario is untagged or filterSpecs is misconfigured."
    ));
  }
```

- [ ] **Step 8: Verify the appropriate combination passes**

If CDP path took: `pnpm --filter @rtc/tests exec cypress run --headless` → 40/40 passing.
If fallback took: `pnpm --filter @rtc/tests exec cypress run --headless` → 38/38 passing (2 filtered out by tag).

In both cases: `pnpm --filter @rtc/tests test:e2e:playwright` → 40/40 passing.

- [ ] **Step 9: Commit**

```bash
git add tests/page-objects/cypress/Workspace.ts \
        tests/.cypress-cucumber-preprocessorrc.json \
        tests/specs/connection.feature
git commit -m "$(cat <<'EOF'
feat(phase-5a.2): setOffline via CDP (or fallback @playwright-only tag)

If CDP path taken: Cypress runs all 40 of 40 scenarios. Browser network
conditions flip via Cypress.automation('remote:debugger:protocol') and
fire native online/offline events.

If fallback taken: 2 offline scenarios tagged @playwright-only and excluded
by the preprocessor's tagsFilter. Cypress runs 38 of 38; Playwright runs
40 of 40.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

(In the actual commit, edit the message to reflect which path was taken.)

---

## Task 15: Umbrella scripts (`with-server.ts`, `run-all.ts`)

**Files:**
- Create: `tests/scripts/with-server.ts`
- Create: `tests/scripts/run-all.ts`

The two scripts that orchestrate dev-server lifecycle and the dual-runner umbrella. Single cold start under `pnpm test:e2e`.

- [ ] **Step 1: Create `tests/scripts/with-server.ts`**

```ts
#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import { startDevServer } from "../support/devServer";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: with-server <cmd> [args...]");
  process.exit(2);
}

const dev = await startDevServer();
const code = await new Promise<number>((resolve) => {
  const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
  child.on("exit", (c) => resolve(c ?? 1));
});
await dev.stop();
process.exit(code);
```

- [ ] **Step 2: Create `tests/scripts/run-all.ts`**

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
  const playwrightExit = await run("pnpm", ["test:e2e:playwright"]);
  combinedExit = combinedExit | playwrightExit;
  const cypressExit = await run("pnpm", ["test:e2e:cypress"]);
  combinedExit = combinedExit | cypressExit;
} finally {
  await dev.stop();
}
process.exit(combinedExit);
```

- [ ] **Step 3: Verify `pnpm --filter @rtc/tests test:e2e:cypress` works in solo mode**

(No dev server pre-running.) Run:
```bash
pnpm --filter @rtc/tests test:e2e:cypress
```
Expected: dev server starts (cold), Cypress runs all (38 or 40 depending on Task 14 outcome) scenarios, dev server stops. Single solo invocation works end-to-end.

- [ ] **Step 4: Verify `pnpm --filter @rtc/tests test:e2e` runs both runners with single cold start**

(No dev server pre-running.) Run:
```bash
pnpm --filter @rtc/tests test:e2e
```
Expected: dev server starts once, Playwright runs (40 scenarios), Cypress runs (38 or 40), dev server stops once. The intermediate `cucumber-js`'s own `BeforeAll` hook calls `startDevServer()` and detects port 3000 is already in use → returns no-op handle. Same for `with-server.ts` wrapping Cypress. Net: 1 cold start.

To prove single cold start: tail Vite's stdout (or run with `DEBUG=vite:*`) — only one Vite process should spawn. Or simpler: verify wallclock is closer to one runner's time + the second runner's time, NOT 2× the start-up tax.

- [ ] **Step 5: Verify `pnpm test:e2e` from the monorepo root**

```bash
pnpm test:e2e
```
Expected: same as Step 4, but invoked through Turborepo. The existing `turbo.json` task definition for `test:e2e` already maps to `@rtc/tests:test:e2e`.

- [ ] **Step 6: Commit**

```bash
git add tests/scripts/with-server.ts tests/scripts/run-all.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.2): umbrella scripts for dual-runner orchestration

with-server.ts wraps any command with managed dev-server lifecycle. run-all.ts
pre-starts the shared server and runs both runners sequentially. Idempotent
port-reuse in support/devServer.ts means each sub-invocation's own
startDevServer() returns a no-op handle, so pnpm test:e2e produces one cold
start regardless of which sub-command starts the server first.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Architectural grep gates

**Files:**
- Create: `tests/scripts/grep-gates.ts`
- Modify: `tests/package.json` (add `gates` script + wire into `test:e2e`)

Implement the 8 grep gates as a single tsx script that exits non-zero on any hit. Wire it into the test:e2e flow.

- [ ] **Step 1: Create `tests/scripts/grep-gates.ts`**

Uses `spawnSync` with array args (no shell, no injection vector — keeps the security hooks happy):

```ts
#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";

interface Gate {
  name: string;
  pattern: string;
  paths: string[];
  excludes?: string[];   // exact path substrings to filter post-grep
}

const GATES: Gate[] = [
  {
    name: "1. No raw data-testid literals outside testids.ts",
    pattern: 'data-testid="[a-z]',
    paths: ["tests/"],
    excludes: ["tests/page-objects/contracts/testids.ts", "/node_modules/"],
  },
  {
    name: "2. No driver imports in contracts",
    pattern: '@playwright/test|cypress|@badeball',
    paths: ["tests/page-objects/contracts/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "3. No driver names in features",
    pattern: 'data-testid|playwright|cy\\.',
    paths: ["tests/specs/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "4. No raw getByTestId(\"...\") in PO impls",
    pattern: 'getByTestId\\("',
    paths: ["tests/page-objects/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "5. No driver imports in scenarios layer",
    pattern: '@playwright/test|"cypress"|@badeball',
    paths: ["tests/scenarios/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "6. No @playwright/test expect in step files",
    pattern: 'from "@playwright/test"',
    paths: ["tests/steps/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "7. No copy-as-selector strings in PO impls (must use STRINGS)",
    pattern: 'getByText\\("[A-Z]|cy\\.contains\\("[A-Z]',
    paths: ["tests/page-objects/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "8. No this.page.* in step files",
    pattern: 'this\\.page\\.',
    paths: ["tests/steps/"],
    excludes: ["/node_modules/"],
  },
];

let failed = 0;

for (const gate of GATES) {
  const args = ["-rE", gate.pattern, ...gate.paths];
  const result = spawnSync("grep", args, { encoding: "utf8" });
  // grep exit codes: 0 = match found, 1 = no match, 2+ = error.
  if (result.status === 2) {
    console.error(`ERROR running gate "${gate.name}":`, result.stderr);
    failed++;
    continue;
  }
  const out = result.stdout ?? "";
  const lines = out
    .split("\n")
    .filter(Boolean)
    .filter((line) => !(gate.excludes ?? []).some((e) => line.includes(e)));

  if (lines.length > 0) {
    console.error(`FAIL ${gate.name}`);
    for (const line of lines) console.error(`   ${line}`);
    failed++;
  } else {
    console.log(`PASS ${gate.name}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} gate(s) failed.`);
  process.exit(1);
}
console.log("\nall gates passed.");
```

- [ ] **Step 2: Add `gates` script to `tests/package.json` and wire into `test:e2e`**

```json
{
  "scripts": {
    "test:e2e": "pnpm gates && tsx scripts/run-all.ts",
    "test:e2e:playwright": "NODE_OPTIONS='--import tsx/esm' cucumber-js",
    "test:e2e:cypress": "tsx scripts/with-server.ts cypress run --headless",
    "test:e2e:cypress:open": "tsx scripts/with-server.ts cypress open --e2e",
    "gates": "tsx scripts/grep-gates.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Run the gates locally**

Run: `pnpm --filter @rtc/tests gates`
Expected: all 8 gates pass.

If gate #1 fails on `tests/page-objects/cypress/LiveRatesTile.ts`'s `TILE_PREFIX_SELECTOR` — that's the documented construction site. Verify the failing line: it should look like `[data-testid^="${TESTIDS.liveRates.tilePrefix}"]`. The `^=` operator means the substring after `data-testid="` is `${...}` (a `$` sign), not `[a-z]` — so the regex pattern `data-testid="[a-z]` should NOT match. If it DOES match, the literal interpolation got resolved at write-time (e.g., someone wrote `[data-testid="tile-eurusd"]` directly). Track that down.

- [ ] **Step 4: Run the umbrella to confirm wiring works**

Run: `pnpm --filter @rtc/tests test:e2e`
Expected: gates pass first, then both runners pass.

- [ ] **Step 5: Commit**

```bash
git add tests/scripts/grep-gates.ts tests/package.json
git commit -m "$(cat <<'EOF'
feat(phase-5a.2): grep gates for architectural invariants

8 gates: 4 carried from 5A.1 (testid SOT, driver-free contracts, driver-free
features, no raw getByTestId) plus 4 new for 5A.2 (driver-free scenarios,
no @playwright/test in steps, STRINGS SOT for copy-as-selectors, no
this.page.* in steps). pnpm --filter @rtc/tests gates runs all eight; the
umbrella runs gates before launching the runners.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Update `docs/architecture.md` and `docs/superpowers/STATUS.md`

**Files:**
- Modify: `docs/architecture.md` (§11 test stack)
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 1: Read the current `docs/architecture.md` §11 test stack section**

```bash
grep -n "^## 11\|^## 12" docs/architecture.md
```

Then read the §11 line range; this is what you'll modify.

- [ ] **Step 2: Modify `docs/architecture.md` §11 — replace stack table and add bundler-alias note**

The §11 table should show the dual-runner stack. Replace the existing table with:

```markdown
| Layer                          | Stack                                                   |
|--------------------------------|---------------------------------------------------------|
| Behaviour specs (`.feature`)   | Gherkin · Cucumber-JS 11 (Playwright) + cypress-cucumber-preprocessor 22 (Cypress) |
| Step definitions               | One shared tree — bundler alias maps `@cucumber/cucumber` → preprocessor for Cypress |
| Scenarios layer                | Pure functions taking `(ctx: TestContext, args)`; driver-free |
| Page-object contracts          | TypeScript interfaces; `TESTIDS` and `STRINGS` SOTs    |
| Page-object impls (drivers)    | `tests/page-objects/playwright/` (Playwright) + `tests/page-objects/cypress/` (Cypress) |
| Per-runner support             | `tests/support/playwright/{world,hooks}.ts` and `tests/support/cypress/{world,e2e}.ts` |
```

Add a sub-section "The bundler-alias seam" right after the table:

```markdown
### The bundler-alias seam

`tests/steps/*.steps.ts` files unconditionally `import { Given, When, Then } from "@cucumber/cucumber"`. Cucumber-JS resolves this natively in Node. Cypress's esbuild bundler (configured in `tests/cypress.config.ts`) installs a 5-line plugin that intercepts the specifier and remaps it to `@badeball/cypress-cucumber-preprocessor`. Both packages expose API-compatible `Given/When/Then/And/But/defineParameterType` decorators, so the same call sites compile cleanly under either resolution.

The trick is invisible at the step-file level. Hooks and `World/setWorldConstructor` are NOT shared — they live in the per-runner `tests/support/{playwright,cypress}/` directories.
```

- [ ] **Step 3: Spot-check no stale "(planned)" tags**

```bash
grep -n "Cypress.*(planned)\|cypress.*(planned)" docs/architecture.md
```
Expected: no matches. (Any leftover from 5A.1 era should already have been cleaned in the 5A.1 final tidy commit `745ea9d`, but verify.)

- [ ] **Step 4: Update `docs/superpowers/STATUS.md`**

Mark Phase 5A.2 row as DONE (SHA range placeholder; filled in Task 18). Update the table row from:

```markdown
| Phase 5A.2 — Cucumber + Cypress sharing the same `.feature` files | ⏳ NOT STARTED | (to be written) | — |
```

to:

```markdown
| Phase 5A.2 — Cucumber + Cypress sharing the same `.feature` files | ✅ DONE | `plans/2026-05-10-phase-5a-2-cypress-cucumber.md` | placeholder — filled in final commit |
```

Also update the "Last updated" line at the top to today's date and refresh the test counts under "Current state" to reflect the new totals (Playwright: 40, Cypress: 38 or 40 depending on Task 14 outcome).

- [ ] **Step 5: Run typecheck + e2e + gates**

```bash
pnpm --filter @rtc/tests gates && pnpm --filter @rtc/tests typecheck && pnpm --filter @rtc/tests test:e2e
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture.md docs/superpowers/STATUS.md
git commit -m "$(cat <<'EOF'
docs(phase-5a.2): update architecture.md §11 + STATUS.md

§11 reflects dual-runner stack: Cucumber-JS (Playwright, Node) +
cypress-cucumber-preprocessor (Cypress, browser) sharing one step tree via
bundler alias. STATUS.md Phase 5A.2 row marked DONE. SHA range placeholder
gets filled in the next commit once the range is final.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Phase-level review and SHA-range commit

**Files:**
- Modify: `docs/superpowers/STATUS.md` (replace SHA placeholder with real range)

- [ ] **Step 1: Determine the SHA range**

```bash
git log --oneline a1cb673..HEAD
git log --format="%h" a1cb673..HEAD | tail -1   # first SHA after spec
git log --format="%h" -1                         # current HEAD
```

Note the first task commit SHA and the HEAD SHA. Format the range as `<first>..<head> (N commits)`.

- [ ] **Step 2: Replace the placeholder in `docs/superpowers/STATUS.md`**

Update the Phase 5A.2 row's commits cell from `placeholder — filled in final commit` to the actual range, e.g. `b2c3d4e..f5a6b7c (18 commits)`.

- [ ] **Step 3: Dispatch phase-level code review subagent**

Per `superpowers:subagent-driven-development`, dispatch a final code-reviewer subagent that reads the full diff `git diff a1cb673..HEAD` and reports against:
- Spec compliance (every requirement in the spec landed in code)
- Architectural invariants (8 gates green, no driver leakage)
- Test coverage (40 Playwright, 38 or 40 Cypress)
- Code quality (idiomatic Cypress chains, no copy-paste between PO impls beyond the unavoidable)

Address any HIGH-priority items the reviewer flags. MEDIUM/LOW items get tracked as 5A.3+ punch-list.

- [ ] **Step 4: Apply review fixes (if any) and re-commit**

After fixing, re-run the SHA range determination from Step 1 and update STATUS.md again.

- [ ] **Step 5: Final integration verification**

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @rtc/tests gates
pnpm test:e2e
```

Expected, in order:
- typecheck: green across all 5 workspaces
- test (unit): 141 unit passing (114 domain + 22 client + 5 server)
- gates: 8/8 green
- test:e2e: Playwright 40, Cypress 38 or 40, single cold start

- [ ] **Step 6: Commit the SHA-range update**

```bash
git add docs/superpowers/STATUS.md
git commit -m "$(cat <<'EOF'
docs(status): record Phase 5A.2 SHA range

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Branch state**

Confirm: `git log origin/main..HEAD --oneline | wc -l` matches `(N commits)` from the SHA range. Branch is ready to push when user invokes `superpowers:finishing-a-development-branch`.

---

## Self-review (run after writing all tasks)

This section is a one-time check the plan author runs before handing off to implementation; it is NOT a task an implementer executes.

### Spec coverage

Walking the spec section by section:

- §1 Goal & scope — Tasks 1-18 collectively. Cypress alongside Playwright: T9-T15. Identical 8 features / 40 scenarios: T7 (proof) and T15 (final). All 3 punch-list items: T2 (wait), T7 (last module-state), T13 (STRINGS).
- §2 Architecture & seam — T9 introduces config + alias; T10 validates seam; T16 enforces it.
- §3 Directory layout — T1, T8, T9, T10, T15.
- §4 Component shapes — T1 (types/assert/STRINGS), T3 (PlaywrightWorld), T9 (Cypress support), T10 (factory).
- §5 Step transformation pattern — T3 (proof) + T4-T7 (one task per pair of files).
- §6 Punch-list folding — T2 + T7 (state) + T13 (STRINGS).
- §7 Runtime config — T9 (Cypress) + T15 (orchestration scripts).
- §8 Grep gates — T16.
- §9 Risks — Task 14's CDP-or-fallback structure handles the only mid-impl branch.
- §10 Acceptance criteria — T18 step 5 verifies all 10 criteria.
- §11 Sequencing — directly mapped to T1-T18 (one row per task family).
- §12 Open questions — exact dep versions resolved in T9 step 1; gate runner location resolved in T16; CI timeout — observed during T15 step 4.

No gaps.

### Placeholder scan

Quick grep for forbidden patterns:

- "TBD", "TODO", "implement later", "fill in details" — none.
- "Add appropriate error handling", "handle edge cases" — none.
- "Write tests for the above" without code — every step shows code.
- "Similar to Task N" — Task 11 / 12 / 13 show full code per file rather than referring back to a template.
- Steps without code where code is needed — Tasks 11-13 have explicit "Read the contract" steps before implementation steps because PO contract method signatures vary between specs and the plan-time read of the contract files.

### Type consistency

- `TestContext { po: PageObjects; scratch: Scratchpad }` — used consistently in T1, T3, all scenarios files (T3-T7), CypressWorld (T9).
- `StepContext { ctx: TestContext }` — consistent across all step file refactors (T3-T7).
- `Scratchpad` field shape (`blotter`, `fxLiveRates`, `theme`) — defined T1, used T3 (theme), T5 (fxLiveRates), T7 (blotter). All accesses use the matching field name.
- `WorkspacePO.wait(ms): Promise<void>` — declared T2 contract, implemented T2 Playwright + T10 Cypress. Both have signature `wait(ms: number): Promise<void>`.
- `STRINGS.creditRfq.submitButton` — defined T1, used T13 (Cypress impl + Playwright impl migration).
- `buildCypressPageObjects(): PageObjects` (no args) — declared in spec T9, implemented T10. Signature consistent.
- `PageObjects` interface from `tests/page-objects/contracts/index.ts` — referenced consistently across factory T10, world T3 + T9.

No drift.

---

End of plan.
