# Phase 5A.4 — Raw Cypress reusing PO contracts (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cypress` (raw, no Cucumber) as a fourth e2e runner under `tests/raw/cypress/`, mirroring every Cucumber scenario (40 across 8 feature files) as raw Cypress `it()` calls that reuse the existing Cypress POs and the driver-free `scenarios/` layer. Wire it as a fourth peer in `scripts/run-all.ts` alongside Cucumber+Playwright, raw Playwright, and Cucumber+Cypress.

**Architecture:** Each `tests/specs/<area>.feature` gets a sibling `tests/raw/cypress/<area>.spec.ts`. Test bodies are scenario-call sequences (no driver imports, no `ctx.po.*` access, no `cy.*` calls); the Cucumber `World` is replaced by a module-level `getCtx()` accessor in `_context.ts` whose `beforeEach` builds a fresh `TestContext` per test. Three named helpers in `_openWorkspace.ts` register `beforeEach` hooks for the three Background phrasings observed in the spec set. A separate `cypress.config.ts` under `tests/raw/cypress/` keeps the raw runner isolated from the existing Cucumber+Cypress configuration.

**Tech Stack:** `cypress` 15.14.2 (already in `tests/package.json`; built-in TS support, no preprocessor needed) · `tsx` (TS loader, existing) · `tsconfig.json` already includes `raw/**/*.ts` so no tsconfig change is needed.

**Spec:** `docs/superpowers/specs/2026-05-11-phase-5a-4-raw-cypress-po-contracts-design.md` (committed `3356d7e`).

---

## Plan-wide notes (read once before starting)

- **Working tree:** clean except `.claude/settings.local.json` and `.claude/settings.json`. Do not stage either.
- **Branch:** `main` (HEAD `3356d7e` — the spec commit). Work commits directly here, matching the convention from Phases 1–5A.3.
- **`cypress` is already a devDependency** in `tests/package.json`. Cypress 15 has built-in TypeScript support; no preprocessor or esbuild plugin is required for the raw runner.
- **`tests/tsconfig.json` already includes `raw/**/*.ts`** in its `include` glob. New files under `tests/raw/cypress/` are typechecked automatically.
- **Verification command between tasks:**
  ```bash
  pnpm typecheck \
    && pnpm --filter @rtc/tests test:e2e:raw-cypress \
    && pnpm --filter @rtc/tests test:e2e:cypress \
    && pnpm --filter @rtc/tests test:e2e:raw-playwright \
    && pnpm --filter @rtc/tests test:e2e:playwright
  ```
  After Task 10 also: `pnpm test:e2e` (umbrella).
- **Test-body shape is decided in Task 1.** Plan author: ship Task 1 in shape 1 (sync, fire-and-forget). If Task 1's smoke fails under Cypress, retry shape 2 (async/await) per spec §3 fallback ladder. Tasks 2–9 below are written assuming shape 1; if Task 1 confirms shape 2, the bodies need a one-line rewrite per `it()` (add `async` to the arrow, `await` before each scenario call). Document the chosen shape in a one-line comment at the top of `_context.ts` so future readers see why.
- **Helper file naming convention.** Cypress's `specPattern` is set to `raw/cypress/**/*.spec.ts`. Helper files use leading-underscore (`_context.ts`, `_openWorkspace.ts`) so they're cosmetically distinct from spec files (the underscore is not strictly required since extension-based matching excludes them, but it matches the 5A.3 convention).
- **`cypress.config.ts` and `_context.ts` are the only files in `tests/raw/cypress/` allowed to import from `cypress`, `page-objects/`, or call `cy.*`.** This is enforced in Task 11 as gates 12–14.
- **One step file lives outside the obvious area.** `When the trader waits {int} seconds` is mapped to `fxLiveRates.waitSeconds(ctx, n)` (still mis-located per the 5A.3 follow-up; 5A.4 does not fix it). Use that import path from any spec file that needs to wait.
- **One step is cross-feature.** `Then the credit navigation is visible` maps to `theme.expectCreditNavVisible(ctx)`. Both `theme.spec.ts` and `creditRfq.spec.ts` (Scenario: credit workspace shows navigation tabs) need it. Import from `../../scenarios/theme`.
- **Two `trade confirmation matches one of` step variants.** A no-timeout call shape and a `... within {int} seconds` shape with a third `seconds * 1_000` argument. Both call `fxTrading.expectTradeConfirmationMatchesOneOf`. Mirror both call shapes in `fxTrading.spec.ts`.
- **Two Cypress peers, one shared dev server.** `run-all.ts` invokes `cypress run` twice sequentially (once per config). Cypress isn't reentrant within a single binary invocation, but two separate `cypress run` calls back-to-back are fine.

---

## File structure created/modified by this plan

```
tests/
  package.json                                       MODIFIED (add `test:e2e:raw-cypress` script)
  scripts/
    run-all.ts                                       MODIFIED (Task 10: 4 peers)
    grep-gates.ts                                    MODIFIED (Task 11: gates 12–14)
  raw/
    cypress/
      .gitkeep                                       DELETED (replaced by real files)
      cypress.config.ts                              NEW
      _context.ts                                    NEW
      _openWorkspace.ts                              NEW
      theme.spec.ts                                  NEW (Task 1 smoke; Task 2 full port)
      connection.spec.ts                             NEW
      analytics.spec.ts                              NEW
      fxLiveRates.spec.ts                            NEW
      fxTrading.spec.ts                              NEW
      fxRfq.spec.ts                                  NEW
      creditRfq.spec.ts                              NEW
      blotter.spec.ts                                NEW

docs/superpowers/STATUS.md                           MODIFIED (Task 10 + Task 12)
```

---

## Task 1: Scaffold (config, ctx accessor, Background helpers, smoke spec resolving body shape)

**Files:**
- Create: `tests/raw/cypress/cypress.config.ts`
- Create: `tests/raw/cypress/_context.ts`
- Create: `tests/raw/cypress/_openWorkspace.ts`
- Create: `tests/raw/cypress/theme.spec.ts` (one real `it()` as smoke; Task 2 overwrites with the full 5-scenario port)
- Modify: `tests/package.json` (add `test:e2e:raw-cypress` script)
- Delete: `tests/raw/cypress/.gitkeep`

- [ ] **Step 1.1: Create `cypress.config.ts`**

```ts
// tests/raw/cypress/cypress.config.ts
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

- [ ] **Step 1.2: Create `_context.ts`**

```ts
// tests/raw/cypress/_context.ts
// Body shape: sync fire-and-forget — see Phase 5A.4 spec §3.
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

If Task 1's smoke ends up using shape 2 (async/await), update the comment on line 2 to `// Body shape: async/await — see Phase 5A.4 spec §3.` before committing.

- [ ] **Step 1.3: Create `_openWorkspace.ts`**

```ts
// tests/raw/cypress/_openWorkspace.ts
import { getCtx } from "./_context";
import * as common from "../../scenarios/common";

export const withWorkspaceOpen       = (): void => { beforeEach(() => { common.openWorkspace(getCtx()); }); };
export const withFxWorkspaceOpen     = (): void => { beforeEach(() => { common.openFxWorkspace(getCtx()); }); };
export const withCreditWorkspaceOpen = (): void => { beforeEach(() => { common.openCreditWorkspace(getCtx()); }); };
```

- [ ] **Step 1.4: Create the smoke `theme.spec.ts` (shape 1 — sync, fire-and-forget)**

```ts
// tests/raw/cypress/theme.spec.ts
import { getCtx } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";
import * as theme from "../../scenarios/theme";

describe("Theme (smoke — Task 1)", () => {
  withWorkspaceOpen();

  it("theme toggle button is visible", () => {
    const ctx = getCtx();
    theme.expectThemeToggleVisible(ctx);
  });
});
```

- [ ] **Step 1.5: Add `test:e2e:raw-cypress` script to `tests/package.json`**

Edit the `scripts` block. The full updated block:

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

- [ ] **Step 1.6: Delete the now-redundant placeholder**

Run: `git rm tests/raw/cypress/.gitkeep`
Expected: file removed; staging area shows deletion.

- [ ] **Step 1.7: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS across all workspaces (including `@rtc/tests`).

- [ ] **Step 1.8: Run the smoke spec under shape 1**

Run: `pnpm --filter @rtc/tests test:e2e:raw-cypress`
Expected: dev server starts; Cypress reports `1 passed`, exit 0.

If this fails with a "Cypress detected that you returned a promise" warning or any related Promise/queue error, proceed to Step 1.8b (shape-2 fallback). If it fails for any other reason (selector miss, dev-server timeout, factory error), fix the underlying issue without changing the body shape — the choice of shape is only about Promise handling, not about correctness of POs.

- [ ] **Step 1.8b: Shape-2 fallback (only if Step 1.8 failed with a Promise/queue error)**

Replace the `it()` body in `theme.spec.ts` with shape 2:

```ts
it("theme toggle button is visible", async () => {
  const ctx = getCtx();
  await theme.expectThemeToggleVisible(ctx);
});
```

Update line 2 of `_context.ts` to `// Body shape: async/await — see Phase 5A.4 spec §3.`

Re-run Step 1.8. Expected: `1 passed`. If this also fails for a Promise/queue reason, **stop work**. Open a Phase 5A.4 follow-up note in `docs/superpowers/specs/2026-05-11-phase-5a-4-raw-cypress-po-contracts-design.md` describing exactly what failed (paste the Cypress error message), then ask the user how to proceed. Do not invent a third shape.

- [ ] **Step 1.9: Verify existing Cucumber+Cypress still passes**

Run: `pnpm --filter @rtc/tests test:e2e:cypress`
Expected: 40 scenarios pass.

- [ ] **Step 1.10: Verify existing raw Playwright still passes**

Run: `pnpm --filter @rtc/tests test:e2e:raw-playwright`
Expected: `40 passed`, exit 0.

- [ ] **Step 1.11: Verify existing Cucumber+Playwright still passes**

Run: `pnpm --filter @rtc/tests test:e2e:playwright`
Expected: 40 scenarios pass.

- [ ] **Step 1.12: Commit**

```bash
git add tests/raw/cypress/cypress.config.ts \
        tests/raw/cypress/_context.ts \
        tests/raw/cypress/_openWorkspace.ts \
        tests/raw/cypress/theme.spec.ts \
        tests/raw/cypress/.gitkeep \
        tests/package.json
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): scaffold raw Cypress runner + ctx accessor + Background helpers

Adds tests/raw/cypress/ with cypress.config.ts (no preprocessor, raw
specPattern), a getCtx() accessor whose beforeEach builds { ctx } per
test, and three named Background helpers (withWorkspaceOpen /
withFxWorkspaceOpen / withCreditWorkspaceOpen). One smoke spec verifies
the runner wires up under the chosen test-body shape (see comment at
top of _context.ts). Tasks 2-9 will port each .feature in turn.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Port `theme.feature` → `theme.spec.ts` (overwrite smoke)

**Files:**
- Modify (overwrite): `tests/raw/cypress/theme.spec.ts`

**Source-of-truth references (read all before writing):**
- `tests/specs/theme.feature` — 5 scenarios under `Given the trader has the workspace open`
- `tests/raw/playwright/theme.spec.ts` — the 5A.3 template to mirror 1:1
- `tests/scenarios/theme.ts` and `tests/scenarios/common.ts` — scenario fn signatures

- [ ] **Step 2.1: Overwrite `theme.spec.ts` with the real port (shape 1; rewrite to shape 2 if Task 1 confirmed it)**

```ts
// tests/raw/cypress/theme.spec.ts
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

  it("theme persists across page reloads", () => {
    const ctx = getCtx();
    theme.toggleAndCaptureBackgrounds(ctx);
    common.reloadPage(ctx);
    theme.expectBackgroundMatchesToggled(ctx);
  });

  it("toggle button shows correct icon for current theme", () => {
    const ctx = getCtx();
    theme.expectThemeToggleAriaLabelMentions(ctx, "light");
    theme.toggleAndCaptureBackgrounds(ctx);
    theme.expectThemeToggleAriaLabelMentions(ctx, "dark");
  });

  it("workspace tabs work in both themes", () => {
    const ctx = getCtx();
    common.clickTab(ctx, "fx");
    theme.expectFirstPriceTileVisible(ctx, 5_000);
    theme.toggleAndCaptureBackgrounds(ctx);
    common.clickTab(ctx, "credit");
    theme.expectCreditNavVisible(ctx);
    common.clickTab(ctx, "admin");
    common.clickTab(ctx, "fx");
    theme.expectFirstPriceTileVisible(ctx, 5_000);
  });
});
```

- [ ] **Step 2.2: Run the raw Cypress runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-cypress`
Expected: `5 passed`, exit 0.

- [ ] **Step 2.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:cypress && pnpm --filter @rtc/tests test:e2e:raw-playwright && pnpm --filter @rtc/tests test:e2e:playwright`
Expected: typecheck PASS; Cucumber+Cypress 40 passed; raw Playwright 40 passed; Cucumber+Playwright 40 passed.

- [ ] **Step 2.4: Commit**

```bash
git add tests/raw/cypress/theme.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): port theme.feature to raw Cypress

5 scenarios, all using withWorkspaceOpen() (matches Background "the
trader has the workspace open").

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Port `connection.feature` → `connection.spec.ts`

**Files:**
- Create: `tests/raw/cypress/connection.spec.ts`

**Source-of-truth references:**
- `tests/specs/connection.feature` — 4 scenarios under `Given the trader has the workspace open`
- `tests/raw/playwright/connection.spec.ts` — the 5A.3 template
- `tests/scenarios/connection.ts` — scenario fn signatures

**Notes:**
- `expectConnectionOverlayTextMatches` takes a raw regex-literal-style string (e.g. `"/offline/i"`). Pass it as-is — `scenarios/connection.ts` handles parsing.

- [ ] **Step 3.1: Create `connection.spec.ts`**

```ts
// tests/raw/cypress/connection.spec.ts
import { getCtx } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";
import * as connection from "../../scenarios/connection";

describe("Connection status", () => {
  withWorkspaceOpen();

  it("connected status is shown in the footer", () => {
    const ctx = getCtx();
    connection.expectConnectionStatusFooterVisible(ctx);
    connection.expectConnectionStatusFooterShows(ctx, "Connected");
  });

  it("connection overlay is hidden when connected", () => {
    const ctx = getCtx();
    connection.expectConnectionOverlayHidden(ctx);
  });

  it("going offline shows the overlay with an offline message", () => {
    const ctx = getCtx();
    connection.setBrowserOffline(ctx, true);
    connection.expectConnectionOverlayVisibleWithin(ctx, 3);
    connection.expectConnectionOverlayTextMatches(ctx, "/offline/i");
    connection.expectConnectionStatusFooterShows(ctx, "Offline");
  });

  it("coming back online dismisses the overlay", () => {
    const ctx = getCtx();
    connection.setBrowserOffline(ctx, true);
    connection.expectConnectionOverlayVisibleWithin(ctx, 3);
    connection.setBrowserOffline(ctx, false);
    connection.expectConnectionOverlayHiddenWithin(ctx, 5);
    connection.expectConnectionStatusFooterShows(ctx, "Connected");
  });
});
```

- [ ] **Step 3.2: Run the raw Cypress runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-cypress`
Expected: `9 passed` (5 from Task 2 + 4 from this task), exit 0.

- [ ] **Step 3.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:cypress && pnpm --filter @rtc/tests test:e2e:raw-playwright && pnpm --filter @rtc/tests test:e2e:playwright`
Expected: typecheck PASS; Cucumber+Cypress 40 passed; raw Playwright 40 passed; Cucumber+Playwright 40 passed.

- [ ] **Step 3.4: Commit**

```bash
git add tests/raw/cypress/connection.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): port connection.feature to raw Cypress

4 scenarios using withWorkspaceOpen(). Both `the browser goes offline`
and `... comes back online` map to setBrowserOffline(ctx, true/false).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Port `analytics.feature` → `analytics.spec.ts`

**Files:**
- Create: `tests/raw/cypress/analytics.spec.ts`

**Source-of-truth references:**
- `tests/specs/analytics.feature` — 4 scenarios under `Given the trader has the FX workspace open`
- `tests/raw/playwright/analytics.spec.ts` — the 5A.3 template
- `tests/scenarios/analytics.ts` and `tests/scenarios/theme.ts` — scenario fn signatures (`expectFirstPriceTileVisible` lives in `theme`)

- [ ] **Step 4.1: Create `analytics.spec.ts`**

```ts
// tests/raw/cypress/analytics.spec.ts
import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as analytics from "../../scenarios/analytics";
import * as theme from "../../scenarios/theme";

describe("Analytics panel", () => {
  withFxWorkspaceOpen();

  it("analytics panel is visible with sections", () => {
    const ctx = getCtx();
    analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    analytics.expectAnalyticsHasSection(ctx, "Analytics");
    analytics.expectAnalyticsHasSection(ctx, "Profit & Loss");
    analytics.expectAnalyticsHasSection(ctx, "Positions");
    analytics.expectAnalyticsHasSection(ctx, "PnL per Currency Pair");
  });

  it("PnL section is visible", () => {
    const ctx = getCtx();
    analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    analytics.expectAnalyticsHasSection(ctx, "Profit & Loss");
  });

  it("positions section is visible", () => {
    const ctx = getCtx();
    analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    analytics.expectAnalyticsHasSection(ctx, "Positions");
  });

  it("analytics panel shows alongside live rates", () => {
    const ctx = getCtx();
    theme.expectFirstPriceTileVisible(ctx, 5_000);
    analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
  });
});
```

- [ ] **Step 4.2: Run the raw Cypress runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-cypress`
Expected: `13 passed`, exit 0.

- [ ] **Step 4.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:cypress && pnpm --filter @rtc/tests test:e2e:raw-playwright && pnpm --filter @rtc/tests test:e2e:playwright`
Expected: typecheck PASS; Cucumber+Cypress 40 passed; raw Playwright 40 passed; Cucumber+Playwright 40 passed.

- [ ] **Step 4.4: Commit**

```bash
git add tests/raw/cypress/analytics.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): port analytics.feature to raw Cypress

4 scenarios using withFxWorkspaceOpen(). Scenario 4 reuses
theme.expectFirstPriceTileVisible (the step `a price tile is visible`
without a timeout lives in theme.steps.ts).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Port `fxLiveRates.feature` → `fxLiveRates.spec.ts`

**Files:**
- Create: `tests/raw/cypress/fxLiveRates.spec.ts`

**Source-of-truth references:**
- `tests/specs/fxLiveRates.feature` — 6 scenarios under `Given the trader has the FX workspace open`
- `tests/raw/playwright/fxLiveRates.spec.ts` — the 5A.3 template
- `tests/scenarios/fxLiveRates.ts` and `tests/scenarios/common.ts` — scenario fn signatures (`waitSeconds` is in `fxLiveRates.ts`, not `common.ts`)

- [ ] **Step 5.1: Create `fxLiveRates.spec.ts`**

```ts
// tests/raw/cypress/fxLiveRates.spec.ts
import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as fxLiveRates from "../../scenarios/fxLiveRates";
import * as common from "../../scenarios/common";

describe("FX live rates", () => {
  withFxWorkspaceOpen();

  it("tile grid renders streaming prices", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.expectAtLeastNTilesVisible(ctx, 1);
  });

  it("each tile shows sell and buy buttons", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.expectFirstTileHasBuyAndSellButtons(ctx);
  });

  it("currency filter narrows visible tiles", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.recordVisibleTileCount(ctx, "all");
    fxLiveRates.clickCurrencyFilter(ctx, "EUR");
    fxLiveRates.expectVisibleTileCountAtMost(ctx, "all");
    fxLiveRates.clickCurrencyFilter(ctx, "All");
    fxLiveRates.expectVisibleTileCountEquals(ctx, "all");
  });

  it("view toggle switches between chart and price view", () => {
    const ctx = getCtx();
    fxLiveRates.expectViewToggleVisible(ctx);
    fxLiveRates.expectViewToggleShows(ctx, "Price");
    fxLiveRates.clickViewToggle(ctx);
    fxLiveRates.expectViewToggleShows(ctx, "Chart");
    fxLiveRates.clickViewToggle(ctx);
    fxLiveRates.expectViewToggleShows(ctx, "Price");
  });

  it("view preference persists across reloads", () => {
    const ctx = getCtx();
    fxLiveRates.expectViewToggleVisible(ctx);
    fxLiveRates.clickViewToggle(ctx);
    fxLiveRates.expectViewToggleShows(ctx, "Chart");
    common.reloadPage(ctx);
    common.clickTab(ctx, "fx");
    fxLiveRates.expectViewToggleShows(ctx, "Chart");
  });

  it("prices update over time", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxLiveRates.recordFirstTileText(ctx);
    fxLiveRates.waitSeconds(ctx, 2);
    fxLiveRates.expectFirstTileTextNonEmpty(ctx);
  });
});
```

- [ ] **Step 5.2: Run the raw Cypress runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-cypress`
Expected: `19 passed`, exit 0.

- [ ] **Step 5.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:cypress && pnpm --filter @rtc/tests test:e2e:raw-playwright && pnpm --filter @rtc/tests test:e2e:playwright`
Expected: typecheck PASS; all three other suites pass at their existing counts.

- [ ] **Step 5.4: Commit**

```bash
git add tests/raw/cypress/fxLiveRates.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): port fxLiveRates.feature to raw Cypress

6 scenarios using withFxWorkspaceOpen(). `the trader waits N seconds`
maps to fxLiveRates.waitSeconds (mis-located per 5A.3 follow-up; not
fixed here). The reload+tab-click pair in scenario 5 uses
common.reloadPage + common.clickTab.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Port `fxTrading.feature` → `fxTrading.spec.ts`

**Files:**
- Create: `tests/raw/cypress/fxTrading.spec.ts`

**Source-of-truth references:**
- `tests/specs/fxTrading.feature` — 5 scenarios under `Given the trader has the FX workspace open`
- `tests/raw/playwright/fxTrading.spec.ts` — the 5A.3 template
- `tests/scenarios/fxTrading.ts`, `tests/scenarios/fxLiveRates.ts` — scenario fn signatures

**Notes:**
- `expectTradeConfirmationMatchesOneOf(ctx, raw)` — no timeout.
- `expectTradeConfirmationMatchesOneOf(ctx, raw, seconds * 1_000)` — within-N-seconds variant. Both call shapes appear below.

- [ ] **Step 6.1: Create `fxTrading.spec.ts`**

```ts
// tests/raw/cypress/fxTrading.spec.ts
import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as fxTrading from "../../scenarios/fxTrading";
import * as fxLiveRates from "../../scenarios/fxLiveRates";

describe("FX trading", () => {
  withFxWorkspaceOpen();

  it("execute a buy trade and see confirmation", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxTrading.expectTradeConfirmationWithin(ctx, 5);
    fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/Executing/i, /You Bought/i, /rejected/i",
    );
  });

  it("execute a sell trade and see confirmation", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickSellOnFirstTile(ctx);
    fxTrading.expectTradeConfirmationWithin(ctx, 5);
    fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/Executing/i, /You Sold/i, /rejected/i",
    );
  });

  it("trade confirmation is dismissible by clicking", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxTrading.expectTradeConfirmationWithin(ctx, 5);
    fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/You Bought/i, /You Sold/i, /rejected/i, /timed out/i, /Credit limit/i",
      10_000,
    );
    fxTrading.dismissTradeConfirmation(ctx);
    fxTrading.expectTradeConfirmationHidesWithin(ctx, 5);
  });

  it("executed trade appears in the blotter", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxLiveRates.waitSeconds(ctx, 2);
    fxTrading.expectBlotterVisible(ctx);
    fxTrading.expectBlotterHasAtLeastNRows(ctx, 1);
  });

  it("notional input accepts custom values", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.expectFirstTileNotionalInputVisible(ctx);
    fxTrading.setFirstTileNotional(ctx, "5000000");
  });
});
```

- [ ] **Step 6.2: Run the raw Cypress runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-cypress`
Expected: `24 passed`, exit 0.

- [ ] **Step 6.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:cypress && pnpm --filter @rtc/tests test:e2e:raw-playwright && pnpm --filter @rtc/tests test:e2e:playwright`
Expected: typecheck PASS; all three other suites pass at their existing counts.

- [ ] **Step 6.4: Commit**

```bash
git add tests/raw/cypress/fxTrading.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): port fxTrading.feature to raw Cypress

5 scenarios using withFxWorkspaceOpen(). Mirrors both call shapes of
expectTradeConfirmationMatchesOneOf — no-timeout (default) and the
within-N-seconds variant that passes a third arg in milliseconds.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Port `fxRfq.feature` → `fxRfq.spec.ts`

**Files:**
- Create: `tests/raw/cypress/fxRfq.spec.ts`

**Source-of-truth references:**
- `tests/specs/fxRfq.feature` — 2 scenarios under `Given the trader has the FX workspace open`
- `tests/raw/playwright/fxRfq.spec.ts` — the 5A.3 template
- `tests/scenarios/fxRfq.ts`, `tests/scenarios/fxTrading.ts`, `tests/scenarios/fxLiveRates.ts` — scenario fn signatures

- [ ] **Step 7.1: Create `fxRfq.spec.ts`**

```ts
// tests/raw/cypress/fxRfq.spec.ts
import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as fxRfq from "../../scenarios/fxRfq";
import * as fxTrading from "../../scenarios/fxTrading";
import * as fxLiveRates from "../../scenarios/fxLiveRates";

describe("FX RFQ flow", () => {
  withFxWorkspaceOpen();

  it("entering large notional triggers RFQ mode on the tile", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.setFirstTileNotional(ctx, "10000000");
    fxRfq.expectRfqInitiationButtonWithin(ctx, 3);
  });

  it("RFQ can be initiated and shows countdown", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.setFirstTileNotional(ctx, "10000000");
    fxRfq.expectRfqInitiationButtonWithin(ctx, 3);
    fxRfq.clickRfqInitiationButton(ctx);
    fxRfq.expectCountdownOrQuoteWithin(ctx, 5);
  });
});
```

- [ ] **Step 7.2: Run the raw Cypress runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-cypress`
Expected: `26 passed`, exit 0.

- [ ] **Step 7.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:cypress && pnpm --filter @rtc/tests test:e2e:raw-playwright && pnpm --filter @rtc/tests test:e2e:playwright`
Expected: typecheck PASS; all three other suites pass at their existing counts.

- [ ] **Step 7.4: Commit**

```bash
git add tests/raw/cypress/fxRfq.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): port fxRfq.feature to raw Cypress

2 scenarios using withFxWorkspaceOpen(). Notional-setting step crosses
into the fxTrading scenarios module (setFirstTileNotional).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Port `creditRfq.feature` → `creditRfq.spec.ts`

**Files:**
- Create: `tests/raw/cypress/creditRfq.spec.ts`

**Source-of-truth references:**
- `tests/specs/creditRfq.feature` — 7 scenarios under `Given the credit workspace is open`
- `tests/raw/playwright/creditRfq.spec.ts` — the 5A.3 template
- `tests/scenarios/creditRfq.ts`, `tests/scenarios/theme.ts` (`expectCreditNavVisible`)

- [ ] **Step 8.1: Create `creditRfq.spec.ts`**

```ts
// tests/raw/cypress/creditRfq.spec.ts
import { getCtx } from "./_context";
import { withCreditWorkspaceOpen } from "./_openWorkspace";
import * as creditRfq from "../../scenarios/creditRfq";
import * as theme from "../../scenarios/theme";

describe("Credit RFQ", () => {
  withCreditWorkspaceOpen();

  it("credit workspace shows navigation tabs", () => {
    const ctx = getCtx();
    theme.expectCreditNavVisible(ctx);
    creditRfq.expectCreditTabVisible(ctx, "tiles");
    creditRfq.expectCreditTabVisible(ctx, "new-rfq");
    creditRfq.expectCreditTabVisible(ctx, "sell-side");
  });

  it("RFQ tiles panel shows initial state", () => {
    const ctx = getCtx();
    creditRfq.expectCreditTabVisible(ctx, "tiles");
    creditRfq.expectMessageWithin(ctx, "No RFQs to display", 5);
  });

  it("navigate to New RFQ form", () => {
    const ctx = getCtx();
    creditRfq.clickCreditTab(ctx, "new-rfq");
    creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
  });

  it("New RFQ form has all required fields", () => {
    const ctx = getCtx();
    creditRfq.clickCreditTab(ctx, "new-rfq");
    creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
    creditRfq.expectCreditRfqHasBuySellButtons(ctx);
    creditRfq.expectCreditRfqHasDirectionLabel(ctx);
  });

  it("navigate to Sell Side panel", () => {
    const ctx = getCtx();
    creditRfq.clickCreditTab(ctx, "sell-side");
    creditRfq.expectSellSideHeadingWithin(ctx, 5);
  });

  it("credit blotter is visible below the workspace", () => {
    const ctx = getCtx();
    creditRfq.expectCreditTradesHeadingWithin(ctx, 5);
  });

  it("switching between credit views maintains state", () => {
    const ctx = getCtx();
    creditRfq.clickCreditTab(ctx, "new-rfq");
    creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
    creditRfq.clickCreditTab(ctx, "tiles");
    creditRfq.expectMessageWithin(ctx, "No RFQs to display", 3);
    creditRfq.clickCreditTab(ctx, "sell-side");
    creditRfq.expectSellSideHeadingWithin(ctx, 3);
  });
});
```

- [ ] **Step 8.2: Run the raw Cypress runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-cypress`
Expected: `33 passed`, exit 0.

- [ ] **Step 8.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:cypress && pnpm --filter @rtc/tests test:e2e:raw-playwright && pnpm --filter @rtc/tests test:e2e:playwright`
Expected: typecheck PASS; all three other suites pass at their existing counts.

- [ ] **Step 8.4: Commit**

```bash
git add tests/raw/cypress/creditRfq.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): port creditRfq.feature to raw Cypress

7 scenarios using withCreditWorkspaceOpen(). Heading-string parameters
from the Cucumber steps are discarded — the scenario fns assert against
the rendered heading themselves and take only (ctx, seconds).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Port `blotter.feature` → `blotter.spec.ts`

**Files:**
- Create: `tests/raw/cypress/blotter.spec.ts`

**Source-of-truth references:**
- `tests/specs/blotter.feature` — 7 scenarios under `Given the trader has the FX workspace open`
- `tests/raw/playwright/blotter.spec.ts` — the 5A.3 template
- `tests/scenarios/blotter.ts`, `tests/scenarios/fxTrading.ts`, `tests/scenarios/fxLiveRates.ts` — scenario fn signatures

- [ ] **Step 9.1: Create `blotter.spec.ts`**

```ts
// tests/raw/cypress/blotter.spec.ts
import { getCtx } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as blotter from "../../scenarios/blotter";
import * as fxLiveRates from "../../scenarios/fxLiveRates";
import * as fxTrading from "../../scenarios/fxTrading";

describe("FX trade blotter", () => {
  withFxWorkspaceOpen();

  it("blotter table is visible", () => {
    const ctx = getCtx();
    fxTrading.expectBlotterVisible(ctx);
  });

  it("column headers are clickable for sorting", () => {
    const ctx = getCtx();
    fxTrading.expectBlotterVisible(ctx);
    blotter.clickFirstBlotterHeader(ctx);
    blotter.clickFirstBlotterHeader(ctx);
  });

  it("quick filter narrows trade rows", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxLiveRates.waitSeconds(ctx, 2);
    fxTrading.expectBlotterVisible(ctx);
    blotter.recordBlotterRowCount(ctx, "all");
    blotter.setBlotterQuickFilter(ctx, "ZZZZZ_NO_MATCH");
    fxLiveRates.waitSeconds(ctx, 1);
    blotter.expectBlotterRowCountAtMost(ctx, "all");
    blotter.clearBlotterQuickFilter(ctx);
    fxLiveRates.waitSeconds(ctx, 1);
    blotter.expectBlotterRowCountEquals(ctx, "all");
  });

  it("export CSV button is visible and labeled", () => {
    const ctx = getCtx();
    fxTrading.expectBlotterVisible(ctx);
    blotter.expectExportCsvVisible(ctx);
    blotter.expectExportCsvTextContains(ctx, "Export CSV");
  });

  it("new trade row has a non-empty background color", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxLiveRates.waitSeconds(ctx, 2);
    fxTrading.expectBlotterVisible(ctx);
    blotter.expectFirstBlotterRowVisible(ctx);
    blotter.expectFirstBlotterRowBackgroundNonEmpty(ctx);
  });

  it("rejected trade flow does not error after multiple buys", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    blotter.buyNTimesWithDismissals(ctx, 3);
    fxTrading.expectBlotterVisible(ctx);
    fxTrading.expectBlotterHasAtLeastNRows(ctx, 1);
  });

  it("row hover yields a non-empty background color", () => {
    const ctx = getCtx();
    fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    fxTrading.clickBuyOnFirstTile(ctx);
    fxLiveRates.waitSeconds(ctx, 2);
    fxTrading.expectBlotterVisible(ctx);
    blotter.expectFirstBlotterRowVisible(ctx);
    blotter.hoverFirstBlotterRow(ctx);
    blotter.expectFirstBlotterRowBackgroundNonEmpty(ctx);
  });
});
```

- [ ] **Step 9.2: Run the raw Cypress runner — expect full 40**

Run: `pnpm --filter @rtc/tests test:e2e:raw-cypress`
Expected: `40 passed`, exit 0.

- [ ] **Step 9.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:cypress && pnpm --filter @rtc/tests test:e2e:raw-playwright && pnpm --filter @rtc/tests test:e2e:playwright`
Expected: typecheck PASS; all three other suites pass at their existing counts.

- [ ] **Step 9.4: Commit**

```bash
git add tests/raw/cypress/blotter.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): port blotter.feature to raw Cypress (40/40 total)

7 scenarios using withFxWorkspaceOpen(). With this commit, the raw
Cypress suite reaches full parity with the 40-scenario Cucumber set.
Several blotter-related steps live in fxTrading (expectBlotterVisible,
expectBlotterHasAtLeastNRows, clickBuyOnFirstTile) — call those across
the module boundary.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire raw Cypress into `run-all.ts` + bump STATUS test counts

**Files:**
- Modify (overwrite): `tests/scripts/run-all.ts`
- Modify: `docs/superpowers/STATUS.md` (test-counts line in "Current state" — append `+ 40 e2e (raw Cypress)`)

- [ ] **Step 10.1: Overwrite `tests/scripts/run-all.ts`**

```ts
// tests/scripts/run-all.ts
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

- [ ] **Step 10.2: Update STATUS test counts**

In `docs/superpowers/STATUS.md`, find the line:

```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 40 e2e (Cucumber+Playwright) + 40 e2e (raw Playwright) + 40 e2e (Cucumber+Cypress)
```

Replace with:

```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 40 e2e (Cucumber+Playwright) + 40 e2e (raw Playwright) + 40 e2e (Cucumber+Cypress) + 40 e2e (raw Cypress)
```

- [ ] **Step 10.3: Run the umbrella command**

Run: `pnpm test:e2e`
Expected: dev server starts; gates pass (still 11 — Task 11 adds 12–14); Cucumber+Playwright 40 passed; raw Playwright 40 passed; Cucumber+Cypress 40 passed; raw Cypress 40 passed; exit 0.

- [ ] **Step 10.4: Commit**

```bash
git add tests/scripts/run-all.ts docs/superpowers/STATUS.md
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): wire raw Cypress as fourth peer in run-all.ts

`pnpm test:e2e` now runs four e2e peers (Cucumber+Playwright, raw
Playwright, Cucumber+Cypress, raw Cypress) against one shared dev
server. Exit codes are OR-ed so all failures surface. STATUS test
counts updated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Add grep gates 12–14 for raw Cypress invariants

**Files:**
- Modify: `tests/scripts/grep-gates.ts` (append three new gate objects to `GATES`)

- [ ] **Step 11.1: Append gates 12, 13, 14 to `tests/scripts/grep-gates.ts`**

Add the following three entries to the `GATES` array, immediately after the existing gate 11:

```ts
  {
    name: "12. No driver imports in raw Cypress test bodies",
    pattern: '"cypress"|@badeball|@playwright/test',
    paths: ["raw/cypress/"],
    excludes: [
      "/node_modules/",
      "raw/cypress/cypress.config.ts",
      "raw/cypress/_context.ts",
    ],
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

- [ ] **Step 11.2: Run the gates**

Run: `pnpm --filter @rtc/tests gates`
Expected: all 14 gates PASS. If gate 12, 13, or 14 fails, the test bodies are violating an invariant — read the failing line and either route through `scenarios/*` or revisit `_context.ts`.

- [ ] **Step 11.3: Run umbrella to ensure nothing else regressed**

Run: `pnpm test:e2e`
Expected: gates PASS (now 14); Cucumber+Playwright 40 passed; raw Playwright 40 passed; Cucumber+Cypress 40 passed; raw Cypress 40 passed; exit 0.

- [ ] **Step 11.4: Commit**

```bash
git add tests/scripts/grep-gates.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.4): grep gates 12-14 for raw Cypress invariants

Enforces the three "raw test body" invariants from the spec:
- Gate 12: driver imports only in cypress.config.ts + _context.ts
- Gate 13: ctx.po.* access only in _context.ts
- Gate 14: cy.* calls only in _context.ts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Close-out — STATUS phase row + SHA range + follow-ups

**Files:**
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 12.1: Capture the commit SHA range**

Run: `git log --oneline origin/main..HEAD | head -25`
Capture the first SHA (the spec commit `3356d7e` from the brainstorming step) and the last SHA (Task 11's commit). The full range is `<spec_sha>..<task11_sha>` covering 13 commits (1 spec + 12 task commits).

- [ ] **Step 12.2: Flip the Phase 5A.4 row to DONE**

In `docs/superpowers/STATUS.md`, find the row:

```
| Phase 5A.4 — Raw Cypress reusing PO contracts | ⏳ NOT STARTED | (to be written) | — |
```

Replace with (substituting the captured SHA range):

```
| Phase 5A.4 — Raw Cypress reusing PO contracts | ✅ DONE | `plans/2026-05-11-phase-5a-4-raw-cypress-po-contracts.md` | `<START_SHA>..<END_SHA>` (12 task commits) |
```

- [ ] **Step 12.3: Update the "Last updated" line**

Bump the date at the top of `STATUS.md` to the current date (use `date +%Y-%m-%d`).

- [ ] **Step 12.4: Add a Phase 5A.4 follow-ups section (if any surfaced during tasks)**

If any non-blocking observations came up during execution (e.g. body-shape choice, Cypress 15 TS quirks), append a new section under the Phase 5A.3 follow-ups section:

```markdown
## Phase 5A.4 follow-ups (carry into Phase 5B+)

1. **<Item title>.** <Description, including file:line if applicable.>

<!-- Add other items as they arose during 5A.4 execution -->
```

If no follow-ups, skip this step.

- [ ] **Step 12.5: Run the umbrella one final time as the close-out sanity check**

Run: `pnpm test:e2e && pnpm typecheck`
Expected: gates PASS (14); all four runners pass (40 each, 160 total); typecheck PASS; exit 0.

- [ ] **Step 12.6: Commit**

```bash
git add docs/superpowers/STATUS.md
git commit -m "$(cat <<'EOF'
docs(status): record Phase 5A.4 SHA range + DONE flip

Phase 5A.4 complete. Raw Cypress runner added under tests/raw/cypress/
at full parity with the 40-scenario Cucumber set, wired as a fourth
peer in run-all.ts. Three grep gates enforce the raw-test-body
invariants.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Post-plan verification checklist

After Task 12, the following should all hold:

- [ ] `git log --oneline origin/main..HEAD` shows 13 new commits relative to the 5A.4 starting point (1 spec + 12 task commits), on top of the 13 commits already ahead from 5A.3.
- [ ] `pnpm test:e2e` passes end-to-end (gates + 4 e2e runners + dev server orchestration).
- [ ] `pnpm typecheck` passes across all workspaces.
- [ ] `tests/raw/cypress/` contains: `cypress.config.ts`, `_context.ts`, `_openWorkspace.ts`, 8 `*.spec.ts` files. No `.gitkeep`.
- [ ] `pnpm --filter @rtc/tests gates` reports 14 passing gates.
- [ ] `STATUS.md`:
  - Phase 5A.4 row is ✅ DONE with a SHA range and plan path filled in.
  - "Last updated" reflects the close-out date.
  - Test-counts line includes "40 e2e (raw Cypress)".
- [ ] `_context.ts` line 2 comment correctly identifies the chosen body shape (sync fire-and-forget OR async/await), matching what Tasks 2–9 used.
