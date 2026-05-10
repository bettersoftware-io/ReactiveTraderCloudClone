# Phase 5A.3 — Raw Playwright reusing PO contracts (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@playwright/test` as a third e2e runner under `tests/raw/playwright/`, mirroring every Cucumber scenario (40 across 8 feature files) as raw Playwright `test()` calls that reuse the existing Playwright POs and the driver-free `scenarios/` layer. Wire it as a third peer in `scripts/run-all.ts` alongside Cucumber+Playwright and Cucumber+Cypress.

**Architecture:** Each `tests/specs/<area>.feature` gets a sibling `tests/raw/playwright/<area>.spec.ts`. Test bodies are scenario-call sequences (no direct PO access, no `@playwright/test` `expect`, no `page.*`); the Cucumber `World` is replaced by a Playwright **fixture** in `_context.ts` that exposes `{ ctx: TestContext }`. Three named helpers in `_openWorkspace.ts` map 1:1 to the three Background phrasings observed in the spec set.

**Tech Stack:** `@playwright/test` 1.50 (already in `tests/package.json`) · `tsx` (TS loader, existing) · `tsconfig.json` already includes `raw/**/*.ts` so no tsconfig change is needed.

**Spec:** `docs/superpowers/specs/2026-05-10-phase-5a-3-raw-playwright-po-contracts-design.md` (committed `94db167`).

---

## Plan-wide notes (read once before starting)

- **Working tree:** clean except `.claude/settings.local.json` and `.claude/settings.json`. Do not stage either.
- **Branch:** `main` (HEAD `94db167` — the spec commit). Work commits directly here, matching the convention from Phases 1–5A.2.
- **`@playwright/test` is already a devDependency** in `tests/package.json` (used today by `tests/page-objects/playwright/**` for the `Page` type). No `pnpm install` needed.
- **`tests/tsconfig.json` already includes `raw/**/*.ts`** in its `include` glob. New files under `tests/raw/playwright/` are typechecked automatically.
- **Verification command between tasks (until Task 9):** `pnpm install --filter @rtc/tests --frozen-lockfile && pnpm typecheck && pnpm --filter @rtc/tests test:e2e:raw-playwright && pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`. After Task 10 also: `pnpm test:e2e` (umbrella).
- **`workers: 1` and `fullyParallel: false`** in `playwright.config.ts` are mandatory throughout 5A.3 — the in-process simulator state is shared per dev-server instance; parallel tests would interfere.
- **Helper file naming convention.** `@playwright/test` discovers tests with `testMatch: "**/*.spec.ts"`. Helper files use leading-underscore (`_context.ts`, `_openWorkspace.ts`) so the runner skips them. Do NOT rename or change this convention; the grep gates added in Task 11 depend on it.
- **`expect` from `@playwright/test` is forbidden in test bodies.** Assertions live in `scenarios/*.ts` (via `scenarios/assert.ts`). Test bodies are pure `await scenarios.fn(ctx, ...)` sequences. This is enforced in Task 11 as Gate 9.
- **One step file lives outside the obvious area.** `When the trader waits {int} seconds` is defined in `tests/steps/fxLiveRates.steps.ts` and maps to `fxLiveRates.waitSeconds(ctx, n)`. Use that import path from any spec file that needs to wait. (Yes, it would be cleaner in `common.ts`; not in 5A.3 scope.)
- **One step is cross-feature.** `Then the credit navigation is visible` is defined in `tests/steps/theme.steps.ts` and maps to `theme.expectCreditNavVisible(ctx)`. Both `theme.spec.ts` and `creditRfq.spec.ts` (Scenario: credit workspace shows navigation tabs) need it. Import from `../../scenarios/theme`.
- **Two `trade confirmation matches one of` step variants.** Cucumber has both a regex-bound step (no timeout) and a `... within {int} seconds` step (with timeout). Both call `fxTrading.expectTradeConfirmationMatchesOneOf`; the timeout variant passes `seconds * 1_000` as the third arg. Mirror both call shapes in `fxTrading.spec.ts`.

---

## File structure created/modified by this plan

```
tests/
  package.json                                       MODIFIED (add `test:e2e:raw-playwright` script)
  .gitignore                                         MODIFIED (add `test-results/`)
  scripts/
    run-all.ts                                       MODIFIED (Task 10: 3 peers)
    grep-gates.ts                                    MODIFIED (Task 11: gates 9–11)
  raw/
    playwright/
      .gitkeep                                       DELETED (replaced by real files)
      playwright.config.ts                           NEW
      _context.ts                                    NEW
      _openWorkspace.ts                              NEW
      theme.spec.ts                                  NEW
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

## Task 1: Scaffold (config, fixture, helpers, gitignore, script — 1 skipped test as smoke)

**Files:**
- Create: `tests/raw/playwright/playwright.config.ts`
- Create: `tests/raw/playwright/_context.ts`
- Create: `tests/raw/playwright/_openWorkspace.ts`
- Create: `tests/raw/playwright/theme.spec.ts` (one `test.skip` placeholder; Task 2 replaces it with real tests)
- Modify: `tests/package.json` (add `test:e2e:raw-playwright` script)
- Modify: `tests/.gitignore` (add `test-results/`)
- Delete: `tests/raw/playwright/.gitkeep`

- [ ] **Step 1.1: Create `playwright.config.ts`**

```ts
// tests/raw/playwright/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

- [ ] **Step 1.2: Create `_context.ts`**

```ts
// tests/raw/playwright/_context.ts
import { test as base } from "@playwright/test";
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

- [ ] **Step 1.3: Create `_openWorkspace.ts`**

```ts
// tests/raw/playwright/_openWorkspace.ts
import { test } from "./_context";
import * as common from "../../scenarios/common";

export const withWorkspaceOpen = (): void => {
  test.beforeEach(({ ctx }) => common.openWorkspace(ctx));
};

export const withFxWorkspaceOpen = (): void => {
  test.beforeEach(({ ctx }) => common.openFxWorkspace(ctx));
};

export const withCreditWorkspaceOpen = (): void => {
  test.beforeEach(({ ctx }) => common.openCreditWorkspace(ctx));
};
```

- [ ] **Step 1.4: Create placeholder `theme.spec.ts`**

```ts
// tests/raw/playwright/theme.spec.ts
import { test } from "./_context";

test.describe("Theme", () => {
  test.skip("scaffold placeholder — replaced in Task 2", async () => {
    // Task 2 replaces this with the real theme.feature tests.
  });
});
```

- [ ] **Step 1.5: Add `test:e2e:raw-playwright` script to `tests/package.json`**

Edit the `scripts` block. The full updated block:

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

- [ ] **Step 1.6: Add `test-results/` to `tests/.gitignore`**

The full updated file (4 existing lines + 1 new):

```
node_modules/
reports/
cypress/screenshots/
cypress/videos/
test-results/
```

- [ ] **Step 1.7: Delete the now-redundant placeholder**

Run: `git rm tests/raw/playwright/.gitkeep`
Expected: file removed; staging area shows deletion.

- [ ] **Step 1.8: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS across all workspaces (including `@rtc/tests`).

- [ ] **Step 1.9: Verify the new runner discovers and skips the placeholder**

Run: `pnpm --filter @rtc/tests test:e2e:raw-playwright`
Expected: dev server starts, Playwright reports `1 skipped`, exit 0.

- [ ] **Step 1.10: Verify existing Cucumber+Playwright still passes**

Run: `pnpm --filter @rtc/tests test:e2e:playwright`
Expected: 40 scenarios pass.

- [ ] **Step 1.11: Verify existing Cypress still passes**

Run: `pnpm --filter @rtc/tests test:e2e:cypress`
Expected: 40 scenarios pass.

- [ ] **Step 1.12: Commit**

```bash
git add tests/raw/playwright/playwright.config.ts \
        tests/raw/playwright/_context.ts \
        tests/raw/playwright/_openWorkspace.ts \
        tests/raw/playwright/theme.spec.ts \
        tests/raw/playwright/.gitkeep \
        tests/package.json \
        tests/.gitignore
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): scaffold raw Playwright runner + fixture + Background helpers

Adds tests/raw/playwright/ with playwright.config.ts (Chromium, serial,
baseURL=http://localhost:3000), a `test` fixture exposing { ctx } built
from the existing PlaywrightPageObjects factory + Scratchpad, and three
named Background helpers (withWorkspaceOpen / withFxWorkspaceOpen /
withCreditWorkspaceOpen). One skipped placeholder spec verifies the
runner wires up. Tasks 2-9 will port each .feature in turn.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Port `theme.feature` → `theme.spec.ts`

**Files:**
- Modify (overwrite): `tests/raw/playwright/theme.spec.ts`

**Source-of-truth references (read both before writing):**
- `tests/specs/theme.feature` — 5 scenarios under `Given the trader has the workspace open`
- `tests/steps/theme.steps.ts` — step-to-scenario mappings
- `tests/steps/common.steps.ts` — defines `the trader switches to the {string} tab` (used by Scenario 5) and `the trader reloads the page` (used by Scenario 3)

- [ ] **Step 2.1: Overwrite `theme.spec.ts` with the real port**

```ts
// tests/raw/playwright/theme.spec.ts
import { test } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";
import * as theme from "../../scenarios/theme";
import * as common from "../../scenarios/common";

test.describe("Theme", () => {
  withWorkspaceOpen();

  test("theme toggle button is visible", async ({ ctx }) => {
    await theme.expectThemeToggleVisible(ctx);
  });

  test("clicking theme toggle changes the theme", async ({ ctx }) => {
    await theme.toggleAndCaptureBackgrounds(ctx);
    await theme.expectBackgroundChanged(ctx);
  });

  test("theme persists across page reloads", async ({ ctx }) => {
    await theme.toggleAndCaptureBackgrounds(ctx);
    await common.reloadPage(ctx);
    await theme.expectBackgroundMatchesToggled(ctx);
  });

  test("toggle button shows correct icon for current theme", async ({ ctx }) => {
    await theme.expectThemeToggleAriaLabelMentions(ctx, "light");
    await theme.toggleAndCaptureBackgrounds(ctx);
    await theme.expectThemeToggleAriaLabelMentions(ctx, "dark");
  });

  test("workspace tabs work in both themes", async ({ ctx }) => {
    await common.clickTab(ctx, "fx");
    await theme.expectFirstPriceTileVisible(ctx, 5_000);
    await theme.toggleAndCaptureBackgrounds(ctx);
    await common.clickTab(ctx, "credit");
    await theme.expectCreditNavVisible(ctx);
    await common.clickTab(ctx, "admin");
    await common.clickTab(ctx, "fx");
    await theme.expectFirstPriceTileVisible(ctx, 5_000);
  });
});
```

- [ ] **Step 2.2: Run the raw runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-playwright`
Expected: `5 passed`, exit 0.

- [ ] **Step 2.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`
Expected: typecheck PASS; Cucumber+Playwright 40 passed; Cypress 40 passed.

- [ ] **Step 2.4: Commit**

```bash
git add tests/raw/playwright/theme.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): port theme.feature to raw Playwright

5 scenarios, all using withWorkspaceOpen() (matches Background "the
trader has the workspace open").

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Port `connection.feature` → `connection.spec.ts`

**Files:**
- Create: `tests/raw/playwright/connection.spec.ts`

**Source-of-truth references:**
- `tests/specs/connection.feature` — 4 scenarios under `Given the trader has the workspace open`
- `tests/steps/connection.steps.ts` — step mappings

**Notes:**
- `expectConnectionOverlayTextMatches` takes a raw regex-literal-style string (e.g. `"/offline/i"`). Pass it as-is — `scenarios/connection.ts` handles parsing.

- [ ] **Step 3.1: Create `connection.spec.ts`**

```ts
// tests/raw/playwright/connection.spec.ts
import { test } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";
import * as connection from "../../scenarios/connection";

test.describe("Connection status", () => {
  withWorkspaceOpen();

  test("connected status is shown in the footer", async ({ ctx }) => {
    await connection.expectConnectionStatusFooterVisible(ctx);
    await connection.expectConnectionStatusFooterShows(ctx, "Connected");
  });

  test("connection overlay is hidden when connected", async ({ ctx }) => {
    await connection.expectConnectionOverlayHidden(ctx);
  });

  test("going offline shows the overlay with an offline message", async ({ ctx }) => {
    await connection.setBrowserOffline(ctx, true);
    await connection.expectConnectionOverlayVisibleWithin(ctx, 3);
    await connection.expectConnectionOverlayTextMatches(ctx, "/offline/i");
    await connection.expectConnectionStatusFooterShows(ctx, "Offline");
  });

  test("coming back online dismisses the overlay", async ({ ctx }) => {
    await connection.setBrowserOffline(ctx, true);
    await connection.expectConnectionOverlayVisibleWithin(ctx, 3);
    await connection.setBrowserOffline(ctx, false);
    await connection.expectConnectionOverlayHiddenWithin(ctx, 5);
    await connection.expectConnectionStatusFooterShows(ctx, "Connected");
  });
});
```

- [ ] **Step 3.2: Run the raw runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-playwright`
Expected: `9 passed` (5 from Task 2 + 4 from this task), exit 0.

- [ ] **Step 3.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`
Expected: typecheck PASS; Cucumber+Playwright 40 passed; Cypress 40 passed.

- [ ] **Step 3.4: Commit**

```bash
git add tests/raw/playwright/connection.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): port connection.feature to raw Playwright

4 scenarios using withWorkspaceOpen(). Both `the browser goes offline`
and `... comes back online` map to setBrowserOffline(ctx, true/false).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Port `analytics.feature` → `analytics.spec.ts`

**Files:**
- Create: `tests/raw/playwright/analytics.spec.ts`

**Source-of-truth references:**
- `tests/specs/analytics.feature` — 4 scenarios under `Given the trader has the FX workspace open`
- `tests/steps/analytics.steps.ts` — only 2 step defs (panel-visible-within, has-section)
- `tests/steps/theme.steps.ts` — provides `Then a price tile is visible` → `theme.expectFirstPriceTileVisible(ctx, 5_000)` (used by Scenario 4)

- [ ] **Step 4.1: Create `analytics.spec.ts`**

```ts
// tests/raw/playwright/analytics.spec.ts
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as analytics from "../../scenarios/analytics";
import * as theme from "../../scenarios/theme";

test.describe("Analytics panel", () => {
  withFxWorkspaceOpen();

  test("analytics panel is visible with sections", async ({ ctx }) => {
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    await analytics.expectAnalyticsHasSection(ctx, "Analytics");
    await analytics.expectAnalyticsHasSection(ctx, "Profit & Loss");
    await analytics.expectAnalyticsHasSection(ctx, "Positions");
    await analytics.expectAnalyticsHasSection(ctx, "PnL per Currency Pair");
  });

  test("PnL section is visible", async ({ ctx }) => {
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    await analytics.expectAnalyticsHasSection(ctx, "Profit & Loss");
  });

  test("positions section is visible", async ({ ctx }) => {
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
    await analytics.expectAnalyticsHasSection(ctx, "Positions");
  });

  test("analytics panel shows alongside live rates", async ({ ctx }) => {
    await theme.expectFirstPriceTileVisible(ctx, 5_000);
    await analytics.expectAnalyticsPanelVisibleWithin(ctx, 5);
  });
});
```

- [ ] **Step 4.2: Run the raw runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-playwright`
Expected: `13 passed`, exit 0.

- [ ] **Step 4.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`
Expected: typecheck PASS; Cucumber+Playwright 40 passed; Cypress 40 passed.

- [ ] **Step 4.4: Commit**

```bash
git add tests/raw/playwright/analytics.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): port analytics.feature to raw Playwright

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
- Create: `tests/raw/playwright/fxLiveRates.spec.ts`

**Source-of-truth references:**
- `tests/specs/fxLiveRates.feature` — 6 scenarios under `Given the trader has the FX workspace open`
- `tests/steps/fxLiveRates.steps.ts` — step mappings (note: `waitSeconds` is exported from `fxLiveRates.ts`, not `common.ts`)
- `tests/steps/common.steps.ts` — `the trader reloads the page` → `common.reloadPage`; `the trader switches to the {string} tab` → `common.clickTab`

- [ ] **Step 5.1: Create `fxLiveRates.spec.ts`**

```ts
// tests/raw/playwright/fxLiveRates.spec.ts
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as fxLiveRates from "../../scenarios/fxLiveRates";
import * as common from "../../scenarios/common";

test.describe("FX live rates", () => {
  withFxWorkspaceOpen();

  test("tile grid renders streaming prices", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.expectAtLeastNTilesVisible(ctx, 1);
  });

  test("each tile shows sell and buy buttons", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.expectFirstTileHasBuyAndSellButtons(ctx);
  });

  test("currency filter narrows visible tiles", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.recordVisibleTileCount(ctx, "all");
    await fxLiveRates.clickCurrencyFilter(ctx, "EUR");
    await fxLiveRates.expectVisibleTileCountAtMost(ctx, "all");
    await fxLiveRates.clickCurrencyFilter(ctx, "All");
    await fxLiveRates.expectVisibleTileCountEquals(ctx, "all");
  });

  test("view toggle switches between chart and price view", async ({ ctx }) => {
    await fxLiveRates.expectViewToggleVisible(ctx);
    await fxLiveRates.expectViewToggleShows(ctx, "Price");
    await fxLiveRates.clickViewToggle(ctx);
    await fxLiveRates.expectViewToggleShows(ctx, "Chart");
    await fxLiveRates.clickViewToggle(ctx);
    await fxLiveRates.expectViewToggleShows(ctx, "Price");
  });

  test("view preference persists across reloads", async ({ ctx }) => {
    await fxLiveRates.expectViewToggleVisible(ctx);
    await fxLiveRates.clickViewToggle(ctx);
    await fxLiveRates.expectViewToggleShows(ctx, "Chart");
    await common.reloadPage(ctx);
    await common.clickTab(ctx, "fx");
    await fxLiveRates.expectViewToggleShows(ctx, "Chart");
  });

  test("prices update over time", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxLiveRates.recordFirstTileText(ctx);
    await fxLiveRates.waitSeconds(ctx, 2);
    await fxLiveRates.expectFirstTileTextNonEmpty(ctx);
  });
});
```

- [ ] **Step 5.2: Run the raw runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-playwright`
Expected: `19 passed`, exit 0.

- [ ] **Step 5.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`
Expected: typecheck PASS; Cucumber+Playwright 40 passed; Cypress 40 passed.

- [ ] **Step 5.4: Commit**

```bash
git add tests/raw/playwright/fxLiveRates.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): port fxLiveRates.feature to raw Playwright

6 scenarios using withFxWorkspaceOpen(). `the trader waits N seconds`
maps to fxLiveRates.waitSeconds (it lives in the fxLiveRates scenarios
file, not common.ts). The reload+tab-click pair in scenario 5 uses
common.reloadPage + common.clickTab.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Port `fxTrading.feature` → `fxTrading.spec.ts`

**Files:**
- Create: `tests/raw/playwright/fxTrading.spec.ts`

**Source-of-truth references:**
- `tests/specs/fxTrading.feature` — 5 scenarios under `Given the trader has the FX workspace open`
- `tests/steps/fxTrading.steps.ts` — step mappings
- `tests/steps/fxLiveRates.steps.ts` — provides `a price tile is visible within {int} seconds` (→ `fxLiveRates.expectFirstPriceTileVisibleWithin`) and `the trader waits {int} seconds` (→ `fxLiveRates.waitSeconds`)

**Notes:**
- The step `the trade confirmation matches one of /regex/, /regex2/` (no timeout) maps to `fxTrading.expectTradeConfirmationMatchesOneOf(ctx, raw)`.
- The step `... within {int} seconds` variant passes a third argument: `fxTrading.expectTradeConfirmationMatchesOneOf(ctx, raw, seconds * 1_000)`.

- [ ] **Step 6.1: Create `fxTrading.spec.ts`**

```ts
// tests/raw/playwright/fxTrading.spec.ts
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as fxTrading from "../../scenarios/fxTrading";
import * as fxLiveRates from "../../scenarios/fxLiveRates";

test.describe("FX trading", () => {
  withFxWorkspaceOpen();

  test("execute a buy trade and see confirmation", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await fxTrading.expectTradeConfirmationWithin(ctx, 5);
    await fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/Executing/i, /You Bought/i, /rejected/i",
    );
  });

  test("execute a sell trade and see confirmation", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickSellOnFirstTile(ctx);
    await fxTrading.expectTradeConfirmationWithin(ctx, 5);
    await fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/Executing/i, /You Sold/i, /rejected/i",
    );
  });

  test("trade confirmation is dismissible by clicking", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await fxTrading.expectTradeConfirmationWithin(ctx, 5);
    await fxTrading.expectTradeConfirmationMatchesOneOf(
      ctx,
      "/You Bought/i, /You Sold/i, /rejected/i, /timed out/i, /Credit limit/i",
      10_000,
    );
    await fxTrading.dismissTradeConfirmation(ctx);
    await fxTrading.expectTradeConfirmationHidesWithin(ctx, 5);
  });

  test("executed trade appears in the blotter", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await fxLiveRates.waitSeconds(ctx, 2);
    await fxTrading.expectBlotterVisible(ctx);
    await fxTrading.expectBlotterHasAtLeastNRows(ctx, 1);
  });

  test("notional input accepts custom values", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.expectFirstTileNotionalInputVisible(ctx);
    await fxTrading.setFirstTileNotional(ctx, "5000000");
  });
});
```

- [ ] **Step 6.2: Run the raw runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-playwright`
Expected: `24 passed`, exit 0.

- [ ] **Step 6.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`
Expected: typecheck PASS; Cucumber+Playwright 40 passed; Cypress 40 passed.

- [ ] **Step 6.4: Commit**

```bash
git add tests/raw/playwright/fxTrading.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): port fxTrading.feature to raw Playwright

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
- Create: `tests/raw/playwright/fxRfq.spec.ts`

**Source-of-truth references:**
- `tests/specs/fxRfq.feature` — 2 scenarios under `Given the trader has the FX workspace open`
- `tests/steps/fxRfq.steps.ts` — 3 step defs
- `tests/steps/fxTrading.steps.ts` — provides `the trader sets the first tile notional to {string}` → `fxTrading.setFirstTileNotional`
- `tests/steps/fxLiveRates.steps.ts` — provides `a price tile is visible within {int} seconds`

- [ ] **Step 7.1: Create `fxRfq.spec.ts`**

```ts
// tests/raw/playwright/fxRfq.spec.ts
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as fxRfq from "../../scenarios/fxRfq";
import * as fxTrading from "../../scenarios/fxTrading";
import * as fxLiveRates from "../../scenarios/fxLiveRates";

test.describe("FX RFQ flow", () => {
  withFxWorkspaceOpen();

  test("entering large notional triggers RFQ mode on the tile", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.setFirstTileNotional(ctx, "10000000");
    await fxRfq.expectRfqInitiationButtonWithin(ctx, 3);
  });

  test("RFQ can be initiated and shows countdown", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.setFirstTileNotional(ctx, "10000000");
    await fxRfq.expectRfqInitiationButtonWithin(ctx, 3);
    await fxRfq.clickRfqInitiationButton(ctx);
    await fxRfq.expectCountdownOrQuoteWithin(ctx, 5);
  });
});
```

- [ ] **Step 7.2: Run the raw runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-playwright`
Expected: `26 passed`, exit 0.

- [ ] **Step 7.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`
Expected: typecheck PASS; Cucumber+Playwright 40 passed; Cypress 40 passed.

- [ ] **Step 7.4: Commit**

```bash
git add tests/raw/playwright/fxRfq.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): port fxRfq.feature to raw Playwright

2 scenarios using withFxWorkspaceOpen(). Notional-setting step crosses
into the fxTrading scenarios module (setFirstTileNotional).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Port `creditRfq.feature` → `creditRfq.spec.ts`

**Files:**
- Create: `tests/raw/playwright/creditRfq.spec.ts`

**Source-of-truth references:**
- `tests/specs/creditRfq.feature` — 7 scenarios under `Given the credit workspace is open`
- `tests/steps/creditRfq.steps.ts` — step mappings (note: the heading-string parameters are consumed but discarded; the scenario fns don't take a heading argument)
- `tests/steps/theme.steps.ts` — provides `the credit navigation is visible` → `theme.expectCreditNavVisible`

- [ ] **Step 8.1: Create `creditRfq.spec.ts`**

```ts
// tests/raw/playwright/creditRfq.spec.ts
import { test } from "./_context";
import { withCreditWorkspaceOpen } from "./_openWorkspace";
import * as creditRfq from "../../scenarios/creditRfq";
import * as theme from "../../scenarios/theme";

test.describe("Credit RFQ", () => {
  withCreditWorkspaceOpen();

  test("credit workspace shows navigation tabs", async ({ ctx }) => {
    await theme.expectCreditNavVisible(ctx);
    await creditRfq.expectCreditTabVisible(ctx, "tiles");
    await creditRfq.expectCreditTabVisible(ctx, "new-rfq");
    await creditRfq.expectCreditTabVisible(ctx, "sell-side");
  });

  test("RFQ tiles panel shows initial state", async ({ ctx }) => {
    await creditRfq.expectCreditTabVisible(ctx, "tiles");
    await creditRfq.expectMessageWithin(ctx, "No RFQs to display", 5);
  });

  test("navigate to New RFQ form", async ({ ctx }) => {
    await creditRfq.clickCreditTab(ctx, "new-rfq");
    await creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
  });

  test("New RFQ form has all required fields", async ({ ctx }) => {
    await creditRfq.clickCreditTab(ctx, "new-rfq");
    await creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
    await creditRfq.expectCreditRfqHasBuySellButtons(ctx);
    await creditRfq.expectCreditRfqHasDirectionLabel(ctx);
  });

  test("navigate to Sell Side panel", async ({ ctx }) => {
    await creditRfq.clickCreditTab(ctx, "sell-side");
    await creditRfq.expectSellSideHeadingWithin(ctx, 5);
  });

  test("credit blotter is visible below the workspace", async ({ ctx }) => {
    await creditRfq.expectCreditTradesHeadingWithin(ctx, 5);
  });

  test("switching between credit views maintains state", async ({ ctx }) => {
    await creditRfq.clickCreditTab(ctx, "new-rfq");
    await creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
    await creditRfq.clickCreditTab(ctx, "tiles");
    await creditRfq.expectMessageWithin(ctx, "No RFQs to display", 3);
    await creditRfq.clickCreditTab(ctx, "sell-side");
    await creditRfq.expectSellSideHeadingWithin(ctx, 3);
  });
});
```

- [ ] **Step 8.2: Run the raw runner**

Run: `pnpm --filter @rtc/tests test:e2e:raw-playwright`
Expected: `33 passed`, exit 0.

- [ ] **Step 8.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`
Expected: typecheck PASS; Cucumber+Playwright 40 passed; Cypress 40 passed.

- [ ] **Step 8.4: Commit**

```bash
git add tests/raw/playwright/creditRfq.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): port creditRfq.feature to raw Playwright

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
- Create: `tests/raw/playwright/blotter.spec.ts`

**Source-of-truth references:**
- `tests/specs/blotter.feature` — 7 scenarios under `Given the trader has the FX workspace open`
- `tests/steps/blotter.steps.ts` — step mappings
- `tests/steps/fxTrading.steps.ts` — provides `the blotter table is visible` → `fxTrading.expectBlotterVisible`, `the blotter has at least {int} row` → `fxTrading.expectBlotterHasAtLeastNRows`, `the trader clicks buy on the first tile` → `fxTrading.clickBuyOnFirstTile`
- `tests/steps/fxLiveRates.steps.ts` — provides `a price tile is visible within {int} seconds` and `the trader waits {int} seconds`

- [ ] **Step 9.1: Create `blotter.spec.ts`**

```ts
// tests/raw/playwright/blotter.spec.ts
import { test } from "./_context";
import { withFxWorkspaceOpen } from "./_openWorkspace";
import * as blotter from "../../scenarios/blotter";
import * as fxLiveRates from "../../scenarios/fxLiveRates";
import * as fxTrading from "../../scenarios/fxTrading";

test.describe("FX trade blotter", () => {
  withFxWorkspaceOpen();

  test("blotter table is visible", async ({ ctx }) => {
    await fxTrading.expectBlotterVisible(ctx);
  });

  test("column headers are clickable for sorting", async ({ ctx }) => {
    await fxTrading.expectBlotterVisible(ctx);
    await blotter.clickFirstBlotterHeader(ctx);
    await blotter.clickFirstBlotterHeader(ctx);
  });

  test("quick filter narrows trade rows", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await fxLiveRates.waitSeconds(ctx, 2);
    await fxTrading.expectBlotterVisible(ctx);
    await blotter.recordBlotterRowCount(ctx, "all");
    await blotter.setBlotterQuickFilter(ctx, "ZZZZZ_NO_MATCH");
    await fxLiveRates.waitSeconds(ctx, 1);
    await blotter.expectBlotterRowCountAtMost(ctx, "all");
    await blotter.clearBlotterQuickFilter(ctx);
    await fxLiveRates.waitSeconds(ctx, 1);
    await blotter.expectBlotterRowCountEquals(ctx, "all");
  });

  test("export CSV button is visible and labeled", async ({ ctx }) => {
    await fxTrading.expectBlotterVisible(ctx);
    await blotter.expectExportCsvVisible(ctx);
    await blotter.expectExportCsvTextContains(ctx, "Export CSV");
  });

  test("new trade row has a non-empty background color", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await fxLiveRates.waitSeconds(ctx, 2);
    await fxTrading.expectBlotterVisible(ctx);
    await blotter.expectFirstBlotterRowVisible(ctx);
    await blotter.expectFirstBlotterRowBackgroundNonEmpty(ctx);
  });

  test("rejected trade flow does not error after multiple buys", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await blotter.buyNTimesWithDismissals(ctx, 3);
    await fxTrading.expectBlotterVisible(ctx);
    await fxTrading.expectBlotterHasAtLeastNRows(ctx, 1);
  });

  test("row hover yields a non-empty background color", async ({ ctx }) => {
    await fxLiveRates.expectFirstPriceTileVisibleWithin(ctx, 5);
    await fxTrading.clickBuyOnFirstTile(ctx);
    await fxLiveRates.waitSeconds(ctx, 2);
    await fxTrading.expectBlotterVisible(ctx);
    await blotter.expectFirstBlotterRowVisible(ctx);
    await blotter.hoverFirstBlotterRow(ctx);
    await blotter.expectFirstBlotterRowBackgroundNonEmpty(ctx);
  });
});
```

- [ ] **Step 9.2: Run the raw runner — expect full 40**

Run: `pnpm --filter @rtc/tests test:e2e:raw-playwright`
Expected: `40 passed`, exit 0.

- [ ] **Step 9.3: Run the full verification matrix**

Run: `pnpm typecheck && pnpm --filter @rtc/tests test:e2e:playwright && pnpm --filter @rtc/tests test:e2e:cypress`
Expected: typecheck PASS; Cucumber+Playwright 40 passed; Cypress 40 passed.

- [ ] **Step 9.4: Commit**

```bash
git add tests/raw/playwright/blotter.spec.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): port blotter.feature to raw Playwright (40/40 total)

7 scenarios using withFxWorkspaceOpen(). With this commit, the raw
Playwright suite reaches full parity with the 40-scenario Cucumber set.
Several blotter-related steps live in fxTrading (expectBlotterVisible,
expectBlotterHasAtLeastNRows, clickBuyOnFirstTile) — call those across
the module boundary.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire raw Playwright into `run-all.ts` + bump STATUS test counts

**Files:**
- Modify (overwrite): `tests/scripts/run-all.ts`
- Modify: `docs/superpowers/STATUS.md` (test-counts line in "Current state" — bump from 40 e2e Playwright to 40 + 40 raw Playwright)

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
} finally {
  await dev.stop();
}
process.exit(combinedExit);
```

- [ ] **Step 10.2: Update STATUS test counts**

In `docs/superpowers/STATUS.md`, find the line:

```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 40 e2e (Playwright) + 40 e2e (Cypress)
```

Replace with:

```
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 40 e2e (Cucumber+Playwright) + 40 e2e (raw Playwright) + 40 e2e (Cucumber+Cypress)
```

- [ ] **Step 10.3: Run the umbrella command**

Run: `pnpm test:e2e`
Expected: dev server starts; gates pass; Cucumber+Playwright 40 passed; raw Playwright 40 passed; Cypress 40 passed; exit 0.

- [ ] **Step 10.4: Commit**

```bash
git add tests/scripts/run-all.ts docs/superpowers/STATUS.md
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): wire raw Playwright as third peer in run-all.ts

`pnpm test:e2e` now runs three e2e peers (Cucumber+Playwright, raw
Playwright, Cucumber+Cypress) against one shared dev server. Exit codes
are OR-ed so all failures surface. STATUS test counts updated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Add grep gates 9–11 for raw Playwright invariants

**Files:**
- Modify: `tests/scripts/grep-gates.ts` (append three new gate objects to `GATES`)

- [ ] **Step 11.1: Append gates 9, 10, 11 to `tests/scripts/grep-gates.ts`**

Add the following three entries to the `GATES` array, immediately after the existing gate 8:

```ts
  {
    name: "9. No raw @playwright/test imports in raw Playwright test bodies",
    pattern: 'from "@playwright/test"',
    paths: ["raw/playwright/"],
    excludes: [
      "/node_modules/",
      "raw/playwright/playwright.config.ts",
      "raw/playwright/_context.ts",
    ],
  },
  {
    name: "10. No direct ctx.po.* access in raw Playwright test bodies",
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

- [ ] **Step 11.2: Run the gates**

Run: `pnpm --filter @rtc/tests gates`
Expected: all 11 gates PASS. If gate 9, 10, or 11 fails, the test bodies are violating an invariant — read the failing line and either route through `scenarios/*` or revisit `_context.ts`.

- [ ] **Step 11.3: Run umbrella to ensure nothing else regressed**

Run: `pnpm test:e2e`
Expected: gates PASS (now 11); Cucumber+Playwright 40 passed; raw Playwright 40 passed; Cypress 40 passed; exit 0.

- [ ] **Step 11.4: Commit**

```bash
git add tests/scripts/grep-gates.ts
git commit -m "$(cat <<'EOF'
feat(phase-5a.3): grep gates 9-11 for raw Playwright invariants

Enforces the three "raw test body" invariants from the spec:
- Gate 9: @playwright/test imports only in config + fixture file
- Gate 10: ctx.po.* access only in the fixture file
- Gate 11: page.* calls only in the fixture file

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Close-out — STATUS phase row + SHA range + follow-ups

**Files:**
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 12.1: Capture the commit SHA range**

Run: `git log --oneline origin/main..HEAD | head -20`
Capture the first and last SHAs of the 11 commits from Tasks 1–11 (the spec commit `94db167` is from the brainstorming step — include it in the range).

- [ ] **Step 12.2: Flip the Phase 5A.3 row to DONE**

In `docs/superpowers/STATUS.md`, find the row:

```
| Phase 5A.3 — Raw Playwright reusing PO contracts | ⏳ NOT STARTED | (to be written) | — |
```

Replace with (substituting the captured SHA range — start SHA is the spec commit, end SHA is Task 11's commit):

```
| Phase 5A.3 — Raw Playwright reusing PO contracts | ✅ DONE | `plans/2026-05-10-phase-5a-3-raw-playwright-po-contracts.md` | `<START_SHA>..<END_SHA>` (12 task commits) |
```

- [ ] **Step 12.3: Update the "Last updated" line**

Bump the date at the top of `STATUS.md` to the current date (use `date +%Y-%m-%d`).

- [ ] **Step 12.4: Add a Phase 5A.3 follow-ups section (if any surfaced during tasks)**

If any non-blocking observations came up during execution (e.g. `waitSeconds` belongs in `common.ts`), append a new section under the Phase 5A.2 follow-ups section:

```markdown
## Phase 5A.3 follow-ups (carry into Phase 5A.4+)

1. **`waitSeconds` mis-located.** `tests/scenarios/fxLiveRates.ts:65` exports `waitSeconds`, but it has nothing to do with FX live rates — it wraps `ctx.po.workspace.wait`. Move to `tests/scenarios/common.ts` when next touching either file.

<!-- Add other items as they arose during 5A.3 execution -->
```

If no follow-ups, skip this step.

- [ ] **Step 12.5: Run the umbrella one final time as the close-out sanity check**

Run: `pnpm test:e2e && pnpm typecheck`
Expected: gates PASS (11); all three runners pass (40 each, 120 total); typecheck PASS; exit 0.

- [ ] **Step 12.6: Commit**

```bash
git add docs/superpowers/STATUS.md
git commit -m "$(cat <<'EOF'
docs(status): record Phase 5A.3 SHA range + DONE flip

Phase 5A.3 complete. Raw Playwright runner added under tests/raw/playwright/
at full parity with the 40-scenario Cucumber set, wired as a third peer
in run-all.ts. Three grep gates enforce the raw-test-body invariants.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Post-plan verification checklist

After Task 12, the following should all hold:

- [ ] `git log --oneline origin/main..HEAD` shows 13 new commits (1 spec + 12 task commits).
- [ ] `pnpm test:e2e` passes end-to-end (gates + 3 e2e runners + dev server orchestration).
- [ ] `pnpm typecheck` passes across all workspaces.
- [ ] `tests/raw/playwright/` contains: `playwright.config.ts`, `_context.ts`, `_openWorkspace.ts`, 8 `*.spec.ts` files. No `.gitkeep`.
- [ ] `pnpm --filter @rtc/tests gates` reports 11 passing gates.
- [ ] `STATUS.md`:
  - Phase 5A.3 row is ✅ DONE with a SHA range and plan path filled in.
  - "Last updated" reflects the close-out date.
  - Test-counts line includes "40 e2e (raw Playwright)".
- [ ] `tests/.gitignore` includes `test-results/`.
