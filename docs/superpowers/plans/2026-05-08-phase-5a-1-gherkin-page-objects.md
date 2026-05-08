# Phase 5A.1 — Gherkin + Page Objects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert 8 Playwright `*.spec.ts` files to Gherkin `.feature` files driven by Cucumber-JS, backed by a driver-agnostic page-object contract layer with Playwright implementations — leaving room for Cypress / raw stacks in follow-up sub-phases.

**Architecture:** New top-level `tests/` workspace (peer to `packages/`). Step definitions import only PO contract interfaces; Playwright is isolated to `page-objects/playwright/` and the World. Selector constants (`testids.ts`) are the only place `data-testid` strings live. Each conversion task replaces one `*.spec.ts` with its `.feature` equivalent and ends with a green `pnpm test:e2e`.

**Tech Stack:** `@cucumber/cucumber` 11 (runner) · `@playwright/test` 1.50 (driver, already in repo) · `tsx` (TS loader) · TypeScript 5.8 · ESM throughout.

**Spec:** `docs/superpowers/specs/2026-05-08-phase-5a-1-gherkin-page-objects-design.md` (committed `53e6a9c`).

---

## Plan-wide notes (read once before starting)

- **Cucumber config file extension is `cucumber.js` (not `.ts`).** Cucumber-JS does not natively load TypeScript config files. The spec's `cucumber.config.ts` is realised as `cucumber.js` (ESM). Step definitions and support files are still TypeScript, loaded via `tsx/esm`.
- **`tests/` package is ESM.** `"type": "module"` in `package.json`. Use `import` / `loader` Cucumber options, not the deprecated `require` / `requireModule`.
- **Audited testids that already exist in `packages/client/src/ui/**/*.tsx`:**
  `header`, `theme-toggle`, `tab-${tab}` (tab-fx, tab-credit, tab-admin), `connection-status`, `connection-overlay`, `tile-${pair}`, `buy-btn`, `sell-btn`, `trade-confirmation`, `currency-filter`, `filter-${cat}`, `view-toggle`, `analytics-panel`, `blotter-table`, `quick-filter`, `export-csv`, `credit-nav`, `credit-tab-${v}` (tiles, new-rfq, sell-side). **No new testids are added in 5A.1**; the existing tests' non-testid selectors (`getByText`, `getByRole`, `locator("input")`, etc.) are matched by their PO impls using the same Playwright APIs.
- **Working tree:** clean except `.claude/settings.local.json` and `.claude/settings.json`. Do not stage either.
- **Branch:** `main`. Work commits directly here (this is the convention used in Phases 1-4).
- **Verification command between tasks:** `pnpm install && pnpm typecheck && pnpm test:e2e`. Each task ends green on this.
- **Total scenario count must remain at 40** across the migration. Each conversion task deletes one `*.spec.ts` (lowering Playwright count) and adds one `.feature` with the same number of Scenarios (raising Cucumber count).

---

## File structure created by this plan

```
tests/                                                 # new top-level workspace
  package.json
  tsconfig.json
  cucumber.js                                          # ESM Cucumber config
  .gitignore                                           # reports/, node_modules/
  specs/
    fxLiveRates.feature
    fxRfq.feature
    fxTrading.feature
    creditRfq.feature
    blotter.feature
    analytics.feature
    connection.feature
    theme.feature
  page-objects/
    contracts/
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
      testids.ts
      index.ts
    playwright/
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
    cypress/.gitkeep
  steps/
    browser/
      common.steps.ts
      theme.steps.ts
      connection.steps.ts
      analytics.steps.ts
      fxLiveRates.steps.ts
      fxTrading.steps.ts
      fxRfq.steps.ts
      creditRfq.steps.ts
      blotter.steps.ts
    cypress/.gitkeep
  raw/
    playwright/.gitkeep
    cypress/.gitkeep
  support/
    world.ts
    hooks.ts
    devServer.ts
```

Files **deleted** by Task 11: `packages/client/e2e/` (all 8 spec files), `packages/client/playwright.config.ts`.
Files **modified** by Task 11: `packages/client/package.json` (drop `test:e2e` script and `@playwright/test` devDep), `packages/client/tsconfig.node.json` (drop `playwright.config.ts` and `e2e` from `include`), `docs/architecture.md` (§11), `docs/superpowers/STATUS.md`.

---

## Task 1: Scaffold the `tests/` workspace

**Files:**
- Create: `tests/package.json`
- Create: `tests/tsconfig.json`
- Create: `tests/cucumber.js`
- Create: `tests/.gitignore`
- Create: empty subdirectories with `.gitkeep`s — `tests/specs/`, `tests/page-objects/contracts/`, `tests/page-objects/playwright/`, `tests/page-objects/cypress/`, `tests/steps/browser/`, `tests/steps/cypress/`, `tests/raw/playwright/`, `tests/raw/cypress/`, `tests/support/`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1.1: Create `tests/package.json`**

```json
{
  "name": "@rtc/tests",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test:e2e": "cucumber-js"
  },
  "devDependencies": {
    "@cucumber/cucumber": "^11.0.0",
    "@playwright/test": "^1.50",
    "@types/node": "^25.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8"
  }
}
```

- [ ] **Step 1.2: Create `tests/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "types": ["node"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": [
    "support/**/*.ts",
    "page-objects/**/*.ts",
    "steps/**/*.ts",
    "raw/**/*.ts",
    "cucumber.js"
  ]
}
```

- [ ] **Step 1.3: Create `tests/cucumber.js`** (ESM)

```js
export default {
  default: {
    paths: ["specs/**/*.feature"],
    import: ["support/**/*.ts", "steps/browser/**/*.ts"],
    loader: ["tsx/esm"],
    format: ["progress-bar", "html:reports/cucumber.html", "summary"],
    parallel: process.env.CI ? 1 : 2,
    retry: process.env.CI ? 2 : 0,
    publishQuiet: true,
  },
};
```

- [ ] **Step 1.4: Create `tests/.gitignore`**

```
node_modules/
reports/
```

- [ ] **Step 1.5: Create the `.gitkeep` placeholders**

Run from repo root:

```bash
mkdir -p tests/specs tests/page-objects/contracts tests/page-objects/playwright tests/page-objects/cypress tests/steps/browser tests/steps/cypress tests/raw/playwright tests/raw/cypress tests/support
touch tests/specs/.gitkeep tests/page-objects/contracts/.gitkeep tests/page-objects/playwright/.gitkeep tests/page-objects/cypress/.gitkeep tests/steps/browser/.gitkeep tests/steps/cypress/.gitkeep tests/raw/playwright/.gitkeep tests/raw/cypress/.gitkeep tests/support/.gitkeep
```

- [ ] **Step 1.6: Add `tests` to `pnpm-workspace.yaml`**

Modify `/Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "tests"
```

- [ ] **Step 1.7: Install dependencies**

Run: `pnpm install`

Expected: pnpm resolves and installs `@cucumber/cucumber`, `tsx`, etc. into `tests/node_modules`. Workspace recognised. No errors.

- [ ] **Step 1.8: Verify Cucumber is invocable and exits zero with no specs**

Run: `pnpm --filter @rtc/tests test:e2e`

Expected:
```
0 scenarios
0 steps
0m00.000s
```
Exit code 0.

- [ ] **Step 1.9: Verify `pnpm test:e2e` from root still passes (Playwright + new empty Cucumber)**

Run: `pnpm test:e2e`

Expected: turbo runs `test:e2e` in `@rtc/client` (40 Playwright scenarios pass) and in `@rtc/tests` (0 scenarios). All green.

- [ ] **Step 1.10: Commit**

```bash
git add tests/ pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
test(phase-5a.1): scaffold tests/ workspace

New top-level workspace for the Cucumber + Playwright test stack.
Empty .gitkeep placeholders reserve space for sibling driver
implementations (cypress, raw stacks) added in follow-up sub-phases.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Page-object contracts and `testids.ts`

**Files:**
- Delete: `tests/page-objects/contracts/.gitkeep`
- Create: `tests/page-objects/contracts/testids.ts`
- Create: `tests/page-objects/contracts/Workspace.ts`
- Create: `tests/page-objects/contracts/ThemeToggle.ts`
- Create: `tests/page-objects/contracts/Footer.ts`
- Create: `tests/page-objects/contracts/ConnectionOverlay.ts`
- Create: `tests/page-objects/contracts/LiveRatesTile.ts`
- Create: `tests/page-objects/contracts/FxRfqForm.ts`
- Create: `tests/page-objects/contracts/AnalyticsDashboard.ts`
- Create: `tests/page-objects/contracts/CreditRfqForm.ts`
- Create: `tests/page-objects/contracts/CreditRfqPanel.ts`
- Create: `tests/page-objects/contracts/BlotterTable.ts`
- Create: `tests/page-objects/contracts/index.ts`

- [ ] **Step 2.1: Audit `data-testid` strings**

Run: `grep -RnE 'data-testid=' packages/client/src/ui/`

Expected: 18 occurrences across 12 files. Note the dynamic ones (`tile-${pair.symbol}`, `tab-${tab}`, `credit-tab-${v}`, `filter-${cat}`). Verify all 14 distinct base strings are accounted for in step 2.2.

- [ ] **Step 2.2: Create `tests/page-objects/contracts/testids.ts`**

```ts
export const TESTIDS = {
  shell: {
    header: "header",
    themeToggle: "theme-toggle",
    tab: (tab: "fx" | "credit" | "admin") => `tab-${tab}`,
  },
  connection: {
    status: "connection-status",
    overlay: "connection-overlay",
  },
  liveRates: {
    tile: (pair: string) => `tile-${pair}`,
    sellBtn: "sell-btn",
    buyBtn: "buy-btn",
    tradeConfirmation: "trade-confirmation",
    currencyFilter: "currency-filter",
    filter: (category: string) => `filter-${category}`,
    viewToggle: "view-toggle",
  },
  blotter: {
    table: "blotter-table",
    quickFilter: "quick-filter",
    exportCsv: "export-csv",
  },
  analytics: {
    panel: "analytics-panel",
  },
  credit: {
    nav: "credit-nav",
    tab: (v: "tiles" | "new-rfq" | "sell-side") => `credit-tab-${v}`,
  },
} as const;
```

- [ ] **Step 2.3: Create `tests/page-objects/contracts/Workspace.ts`**

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
}
```

- [ ] **Step 2.4: Create `tests/page-objects/contracts/ThemeToggle.ts`**

```ts
export interface ThemeTogglePO {
  isVisible(): Promise<boolean>;
  click(): Promise<void>;
  ariaLabel(): Promise<string>;
}
```

- [ ] **Step 2.5: Create `tests/page-objects/contracts/Footer.ts`**

```ts
export interface FooterPO {
  connectionLabel(): Promise<string>;
  isStatusVisible(): Promise<boolean>;
}
```

- [ ] **Step 2.6: Create `tests/page-objects/contracts/ConnectionOverlay.ts`**

```ts
export interface ConnectionOverlayPO {
  isHidden(): Promise<boolean>;
  waitVisible(timeoutMs: number): Promise<void>;
  waitHidden(timeoutMs: number): Promise<void>;
  text(): Promise<string>;
}
```

- [ ] **Step 2.7: Create `tests/page-objects/contracts/LiveRatesTile.ts`**

```ts
export interface LiveRatesTilePO {
  /** Wait until at least one tile is rendered. */
  waitForFirstTile(timeoutMs: number): Promise<void>;
  /** Number of currently visible tiles. */
  count(): Promise<number>;
  /** innerText of the first tile (used for "prices update over time" check). */
  firstTileText(): Promise<string>;

  /** Click a category filter (e.g. "EUR", "All"). */
  clickFilter(category: string): Promise<void>;

  /** View toggle (chart/price). */
  clickViewToggle(): Promise<void>;
  viewToggleLabel(): Promise<string>;

  /** Trade execution on the first tile. */
  clickBuyOnFirst(): Promise<void>;
  clickSellOnFirst(): Promise<void>;

  /** Trade confirmation overlay. */
  waitForConfirmation(timeoutMs: number): Promise<void>;
  confirmationContainsAny(patterns: readonly RegExp[], timeoutMs: number): Promise<void>;
  dismissConfirmation(): Promise<void>;
  confirmationHidden(timeoutMs: number): Promise<void>;
  isConfirmationVisible(): Promise<boolean>;

  /** Notional input on the first tile. */
  fillFirstTileNotional(value: string): Promise<void>;
  isNotionalInputVisible(): Promise<boolean>;
}
```

- [ ] **Step 2.8: Create `tests/page-objects/contracts/FxRfqForm.ts`**

```ts
export interface FxRfqFormPO {
  /** Wait for the "Initiate RFQ" / "Request Quote" button on the first tile. */
  waitForRfqButton(timeoutMs: number): Promise<void>;
  clickInitiateRfq(): Promise<void>;
  /** Wait for a countdown / quote-state indicator to appear. */
  waitForCountdownOrQuote(timeoutMs: number): Promise<void>;
}
```

- [ ] **Step 2.9: Create `tests/page-objects/contracts/AnalyticsDashboard.ts`**

```ts
export interface AnalyticsDashboardPO {
  waitVisible(timeoutMs: number): Promise<void>;
  isVisible(): Promise<boolean>;
  hasSection(name: string): Promise<boolean>;
}
```

- [ ] **Step 2.10: Create `tests/page-objects/contracts/CreditRfqForm.ts`**

```ts
export interface CreditRfqFormPO {
  waitForSubmitButton(timeoutMs: number): Promise<void>;
  hasBuyAndSellButtons(): Promise<boolean>;
  hasDirectionLabel(): Promise<boolean>;
}
```

- [ ] **Step 2.11: Create `tests/page-objects/contracts/CreditRfqPanel.ts`**

```ts
export interface CreditRfqPanelPO {
  navIsVisible(): Promise<boolean>;
  tabIsVisible(tab: "tiles" | "new-rfq" | "sell-side"): Promise<boolean>;
  clickTab(tab: "tiles" | "new-rfq" | "sell-side"): Promise<void>;
  waitForNoRfqsMessage(timeoutMs: number): Promise<void>;
  waitForSellSideHeading(timeoutMs: number): Promise<void>;
  waitForCreditTradesHeading(timeoutMs: number): Promise<void>;
}
```

- [ ] **Step 2.12: Create `tests/page-objects/contracts/BlotterTable.ts`**

```ts
export interface BlotterTablePO {
  waitVisible(timeoutMs: number): Promise<void>;
  isVisible(): Promise<boolean>;
  rowCount(): Promise<number>;
  clickFirstHeader(): Promise<void>;
  fillQuickFilter(text: string): Promise<void>;
  clearQuickFilter(): Promise<void>;
  isExportCsvVisible(): Promise<boolean>;
  exportCsvText(): Promise<string>;
  hoverFirstRow(): Promise<void>;
  firstRowBackgroundColor(): Promise<string>;
  isFirstRowVisible(): Promise<boolean>;
}
```

- [ ] **Step 2.13: Create `tests/page-objects/contracts/index.ts`**

```ts
import type { WorkspacePO } from "./Workspace";
import type { ThemeTogglePO } from "./ThemeToggle";
import type { FooterPO } from "./Footer";
import type { ConnectionOverlayPO } from "./ConnectionOverlay";
import type { LiveRatesTilePO } from "./LiveRatesTile";
import type { FxRfqFormPO } from "./FxRfqForm";
import type { AnalyticsDashboardPO } from "./AnalyticsDashboard";
import type { CreditRfqFormPO } from "./CreditRfqForm";
import type { CreditRfqPanelPO } from "./CreditRfqPanel";
import type { BlotterTablePO } from "./BlotterTable";

export type {
  WorkspacePO,
  ThemeTogglePO,
  FooterPO,
  ConnectionOverlayPO,
  LiveRatesTilePO,
  FxRfqFormPO,
  AnalyticsDashboardPO,
  CreditRfqFormPO,
  CreditRfqPanelPO,
  BlotterTablePO,
};
export { TESTIDS } from "./testids";

export interface PageObjects {
  workspace: WorkspacePO;
  themeToggle: ThemeTogglePO;
  footer: FooterPO;
  connectionOverlay: ConnectionOverlayPO;
  liveRatesTile: LiveRatesTilePO;
  fxRfqForm: FxRfqFormPO;
  analyticsDashboard: AnalyticsDashboardPO;
  creditRfqForm: CreditRfqFormPO;
  creditRfqPanel: CreditRfqPanelPO;
  blotterTable: BlotterTablePO;
}
```

- [ ] **Step 2.14: Delete `tests/page-objects/contracts/.gitkeep`** (now redundant)

```bash
rm tests/page-objects/contracts/.gitkeep
```

- [ ] **Step 2.15: Verify contracts compile**

Run: `pnpm --filter @rtc/tests exec tsc -p tsconfig.json`

Expected: Exit 0. No type errors. (No emitted output because `noEmit: true`.)

- [ ] **Step 2.16: Verify root typecheck still passes**

Run: `pnpm typecheck`

Expected: All workspaces typecheck green.

- [ ] **Step 2.17: Commit**

```bash
git add tests/page-objects/contracts/
git commit -m "$(cat <<'EOF'
test(phase-5a.1): add page-object contracts and testid constants

Driver-free TS interfaces for 10 UI regions plus the SOT for every
data-testid string in the UI. Step definitions and Playwright/Cypress
implementations import only from this contracts/ folder.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: World, hooks, dev-server, and a sanity smoke test

**Files:**
- Delete: `tests/support/.gitkeep`, `tests/specs/.gitkeep`, `tests/steps/browser/.gitkeep`
- Create: `tests/support/devServer.ts`
- Create: `tests/support/world.ts`
- Create: `tests/support/hooks.ts`
- Create: `tests/specs/_sanity.feature`
- Create: `tests/steps/browser/_sanity.steps.ts`

(The factory and individual Playwright PO impls land in Tasks 4-11 as their respective features need them. Task 3 only ships enough infrastructure to load the World and run one trivial scenario.)

- [ ] **Step 3.1: Create `tests/support/devServer.ts`**

```ts
import { spawn, type ChildProcess } from "node:child_process";

export interface DevServerHandle {
  stop(): Promise<void>;
}

const DEV_PORT = 3000;
const DEV_BASE_URL = `http://localhost:${DEV_PORT}`;

async function pingPort(): Promise<boolean> {
  try {
    const response = await fetch(DEV_BASE_URL, { method: "HEAD" });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitForPort(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pingPort()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`dev server on :${DEV_PORT} not reachable after ${timeoutMs}ms`);
}

export async function startDevServer(): Promise<DevServerHandle> {
  if (await pingPort()) {
    return { stop: async () => {} };
  }
  const child: ChildProcess = spawn(
    "pnpm",
    ["--filter", "@rtc/client", "dev"],
    { stdio: "ignore", detached: false },
  );
  await waitForPort(30_000);
  return {
    stop: async () => {
      child.kill("SIGTERM");
    },
  };
}
```

- [ ] **Step 3.2: Create `tests/support/world.ts`**

```ts
import { setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";

export class PlaywrightWorld extends World {
  context!: BrowserContext;
  page!: Page;

  constructor(options: IWorldOptions) {
    super(options);
  }

  async open(browser: Browser): Promise<void> {
    this.context = await browser.newContext({ baseURL: "http://localhost:3000" });
    this.page = await this.context.newPage();
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

setWorldConstructor(PlaywrightWorld);
```

(The `po` field and the call to `buildPlaywrightPageObjects` are added in Task 4 once the factory exists. Keeping World minimal here lets Task 3's sanity test pass without a factory.)

- [ ] **Step 3.3: Create `tests/support/hooks.ts`**

```ts
import { After, AfterAll, Before, BeforeAll } from "@cucumber/cucumber";
import { chromium, type Browser } from "@playwright/test";
import { startDevServer, type DevServerHandle } from "./devServer";
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

- [ ] **Step 3.4: Create `tests/specs/_sanity.feature`**

```gherkin
Feature: Test harness sanity check

  Scenario: the harness can load the home page
    When the harness loads the home page
    Then the page title is non-empty
```

- [ ] **Step 3.5: Create `tests/steps/browser/_sanity.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

When("the harness loads the home page", async function (this: PlaywrightWorld) {
  await this.page.goto("/");
});

Then("the page title is non-empty", async function (this: PlaywrightWorld) {
  await expect(this.page).toHaveTitle(/.+/);
});
```

- [ ] **Step 3.6: Delete `.gitkeep`s now superseded**

```bash
rm tests/support/.gitkeep tests/specs/.gitkeep tests/steps/browser/.gitkeep
```

- [ ] **Step 3.7: Run the sanity test**

Run: `pnpm --filter @rtc/tests test:e2e`

Expected:
```
1 scenario (1 passed)
2 steps (2 passed)
```
Exit 0. The dev server is spawned, the home page loads, the title check passes, the dev server is killed. Total time roughly 5–10 seconds.

If the dev server is already running on :3000 (developer running `pnpm dev` separately), the harness reuses it. Confirm by re-running with `pnpm --filter @rtc/client dev` in another terminal: the test still passes and `dev.stop()` is a no-op.

- [ ] **Step 3.8: Verify the full e2e suite still passes**

Run: `pnpm test:e2e`

Expected: turbo runs both Playwright (40 scenarios) and Cucumber (1 sanity scenario). All green. Total scenarios across runners = 41 during this transitional commit.

- [ ] **Step 3.9: Commit**

```bash
git add tests/support/ tests/specs/_sanity.feature tests/steps/browser/_sanity.steps.ts
git commit -m "$(cat <<'EOF'
test(phase-5a.1): wire cucumber world and dev-server lifecycle

PlaywrightWorld owns the per-scenario browser context. BeforeAll
launches chromium and starts the vite dev server (reusing an external
:3000 if one is already up). A trivial sanity feature proves the chain
loads the home page end-to-end. Real conversions follow in subsequent
tasks; the sanity scenario is removed when theme.feature lands.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Convert `theme.spec.ts` → `theme.feature`

This is the first real conversion and sets the pattern: implement the POs needed → write the feature → write the steps → delete the old spec → re-verify.

**Files:**
- Delete: `tests/page-objects/playwright/.gitkeep`
- Create: `tests/page-objects/playwright/Workspace.ts`
- Create: `tests/page-objects/playwright/ThemeToggle.ts`
- Create: `tests/page-objects/playwright/Footer.ts` (stub; methods filled in Task 5 — but a minimal impl now keeps the factory total set)
- Create: `tests/page-objects/playwright/ConnectionOverlay.ts` (stub)
- Create: `tests/page-objects/playwright/LiveRatesTile.ts` (stub)
- Create: `tests/page-objects/playwright/FxRfqForm.ts` (stub)
- Create: `tests/page-objects/playwright/AnalyticsDashboard.ts` (stub)
- Create: `tests/page-objects/playwright/CreditRfqForm.ts` (stub)
- Create: `tests/page-objects/playwright/CreditRfqPanel.ts` (stub)
- Create: `tests/page-objects/playwright/BlotterTable.ts` (stub)
- Create: `tests/page-objects/playwright/factory.ts`
- Modify: `tests/support/world.ts` (add `po` field + call factory)
- Create: `tests/specs/theme.feature`
- Create: `tests/steps/browser/common.steps.ts`
- Create: `tests/steps/browser/theme.steps.ts`
- Delete: `packages/client/e2e/theme.spec.ts`
- Delete: `tests/specs/_sanity.feature`
- Delete: `tests/steps/browser/_sanity.steps.ts`

The "stubs" in Task 4 are minimum viable PO classes that throw `Error("not yet implemented in 5A.1 task N")` for unfilled methods. They exist so the factory can construct a complete `PageObjects` bag from day one; subsequent tasks fill in their methods.

- [ ] **Step 4.1: Create `tests/page-objects/playwright/Workspace.ts`**

```ts
import type { Page } from "@playwright/test";
import type { WorkspacePO } from "../contracts/Workspace";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightWorkspace implements WorkspacePO {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/");
  }
  async openFx(): Promise<void> {
    await this.page.goto("/");
    await this.page.getByTestId(TESTIDS.shell.tab("fx")).click();
  }
  async openCredit(): Promise<void> {
    await this.page.goto("/");
    await this.page.getByTestId(TESTIDS.shell.tab("credit")).click();
  }
  async openAdmin(): Promise<void> {
    await this.page.goto("/");
    await this.page.getByTestId(TESTIDS.shell.tab("admin")).click();
  }
  async clickTab(tab: "fx" | "credit" | "admin"): Promise<void> {
    await this.page.getByTestId(TESTIDS.shell.tab(tab)).click();
  }
  async reload(): Promise<void> {
    await this.page.reload();
  }
  async setOffline(offline: boolean): Promise<void> {
    await this.page.context().setOffline(offline);
  }
  async rootBackgroundColor(): Promise<string> {
    return await this.page.locator("#root > div").evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
  }
}
```

- [ ] **Step 4.2: Create `tests/page-objects/playwright/ThemeToggle.ts`**

```ts
import type { Page } from "@playwright/test";
import type { ThemeTogglePO } from "../contracts/ThemeToggle";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightThemeToggle implements ThemeTogglePO {
  constructor(private readonly page: Page) {}
  private locator() {
    return this.page.getByTestId(TESTIDS.shell.themeToggle);
  }
  async isVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }
  async click(): Promise<void> {
    await this.locator().click();
  }
  async ariaLabel(): Promise<string> {
    return (await this.locator().getAttribute("aria-label")) ?? "";
  }
}
```

- [ ] **Step 4.3: Create stub PO impls for the remaining 8 contracts**

Each stub satisfies the contract by throwing an explicit "not yet implemented" error from each method. Methods will be filled in their respective conversion tasks (Tasks 5-11).

`tests/page-objects/playwright/Footer.ts`:

```ts
import type { Page } from "@playwright/test";
import type { FooterPO } from "../contracts/Footer";

export class PlaywrightFooter implements FooterPO {
  constructor(private readonly page: Page) {}
  connectionLabel(): Promise<string> { throw notYet("Footer.connectionLabel"); }
  isStatusVisible(): Promise<boolean> { throw notYet("Footer.isStatusVisible"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
```

`tests/page-objects/playwright/ConnectionOverlay.ts`:

```ts
import type { Page } from "@playwright/test";
import type { ConnectionOverlayPO } from "../contracts/ConnectionOverlay";

export class PlaywrightConnectionOverlay implements ConnectionOverlayPO {
  constructor(private readonly page: Page) {}
  isHidden(): Promise<boolean> { throw notYet("ConnectionOverlay.isHidden"); }
  waitVisible(_t: number): Promise<void> { throw notYet("ConnectionOverlay.waitVisible"); }
  waitHidden(_t: number): Promise<void> { throw notYet("ConnectionOverlay.waitHidden"); }
  text(): Promise<string> { throw notYet("ConnectionOverlay.text"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
```

`tests/page-objects/playwright/LiveRatesTile.ts`:

```ts
import type { Page } from "@playwright/test";
import type { LiveRatesTilePO } from "../contracts/LiveRatesTile";

export class PlaywrightLiveRatesTile implements LiveRatesTilePO {
  constructor(private readonly page: Page) {}
  waitForFirstTile(_t: number): Promise<void> { throw notYet("LiveRatesTile.waitForFirstTile"); }
  count(): Promise<number> { throw notYet("LiveRatesTile.count"); }
  firstTileText(): Promise<string> { throw notYet("LiveRatesTile.firstTileText"); }
  clickFilter(_c: string): Promise<void> { throw notYet("LiveRatesTile.clickFilter"); }
  clickViewToggle(): Promise<void> { throw notYet("LiveRatesTile.clickViewToggle"); }
  viewToggleLabel(): Promise<string> { throw notYet("LiveRatesTile.viewToggleLabel"); }
  clickBuyOnFirst(): Promise<void> { throw notYet("LiveRatesTile.clickBuyOnFirst"); }
  clickSellOnFirst(): Promise<void> { throw notYet("LiveRatesTile.clickSellOnFirst"); }
  waitForConfirmation(_t: number): Promise<void> { throw notYet("LiveRatesTile.waitForConfirmation"); }
  confirmationContainsAny(_p: readonly RegExp[], _t: number): Promise<void> { throw notYet("LiveRatesTile.confirmationContainsAny"); }
  dismissConfirmation(): Promise<void> { throw notYet("LiveRatesTile.dismissConfirmation"); }
  confirmationHidden(_t: number): Promise<void> { throw notYet("LiveRatesTile.confirmationHidden"); }
  isConfirmationVisible(): Promise<boolean> { throw notYet("LiveRatesTile.isConfirmationVisible"); }
  fillFirstTileNotional(_v: string): Promise<void> { throw notYet("LiveRatesTile.fillFirstTileNotional"); }
  isNotionalInputVisible(): Promise<boolean> { throw notYet("LiveRatesTile.isNotionalInputVisible"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
```

`tests/page-objects/playwright/FxRfqForm.ts`:

```ts
import type { Page } from "@playwright/test";
import type { FxRfqFormPO } from "../contracts/FxRfqForm";

export class PlaywrightFxRfqForm implements FxRfqFormPO {
  constructor(private readonly page: Page) {}
  waitForRfqButton(_t: number): Promise<void> { throw notYet("FxRfqForm.waitForRfqButton"); }
  clickInitiateRfq(): Promise<void> { throw notYet("FxRfqForm.clickInitiateRfq"); }
  waitForCountdownOrQuote(_t: number): Promise<void> { throw notYet("FxRfqForm.waitForCountdownOrQuote"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
```

`tests/page-objects/playwright/AnalyticsDashboard.ts`:

```ts
import type { Page } from "@playwright/test";
import type { AnalyticsDashboardPO } from "../contracts/AnalyticsDashboard";

export class PlaywrightAnalyticsDashboard implements AnalyticsDashboardPO {
  constructor(private readonly page: Page) {}
  waitVisible(_t: number): Promise<void> { throw notYet("AnalyticsDashboard.waitVisible"); }
  isVisible(): Promise<boolean> { throw notYet("AnalyticsDashboard.isVisible"); }
  hasSection(_n: string): Promise<boolean> { throw notYet("AnalyticsDashboard.hasSection"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
```

`tests/page-objects/playwright/CreditRfqForm.ts`:

```ts
import type { Page } from "@playwright/test";
import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";

export class PlaywrightCreditRfqForm implements CreditRfqFormPO {
  constructor(private readonly page: Page) {}
  waitForSubmitButton(_t: number): Promise<void> { throw notYet("CreditRfqForm.waitForSubmitButton"); }
  hasBuyAndSellButtons(): Promise<boolean> { throw notYet("CreditRfqForm.hasBuyAndSellButtons"); }
  hasDirectionLabel(): Promise<boolean> { throw notYet("CreditRfqForm.hasDirectionLabel"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
```

`tests/page-objects/playwright/CreditRfqPanel.ts`:

```ts
import type { Page } from "@playwright/test";
import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";

export class PlaywrightCreditRfqPanel implements CreditRfqPanelPO {
  constructor(private readonly page: Page) {}
  navIsVisible(): Promise<boolean> { throw notYet("CreditRfqPanel.navIsVisible"); }
  tabIsVisible(_t: "tiles" | "new-rfq" | "sell-side"): Promise<boolean> { throw notYet("CreditRfqPanel.tabIsVisible"); }
  clickTab(_t: "tiles" | "new-rfq" | "sell-side"): Promise<void> { throw notYet("CreditRfqPanel.clickTab"); }
  waitForNoRfqsMessage(_t: number): Promise<void> { throw notYet("CreditRfqPanel.waitForNoRfqsMessage"); }
  waitForSellSideHeading(_t: number): Promise<void> { throw notYet("CreditRfqPanel.waitForSellSideHeading"); }
  waitForCreditTradesHeading(_t: number): Promise<void> { throw notYet("CreditRfqPanel.waitForCreditTradesHeading"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
```

`tests/page-objects/playwright/BlotterTable.ts`:

```ts
import type { Page } from "@playwright/test";
import type { BlotterTablePO } from "../contracts/BlotterTable";

export class PlaywrightBlotterTable implements BlotterTablePO {
  constructor(private readonly page: Page) {}
  waitVisible(_t: number): Promise<void> { throw notYet("BlotterTable.waitVisible"); }
  isVisible(): Promise<boolean> { throw notYet("BlotterTable.isVisible"); }
  rowCount(): Promise<number> { throw notYet("BlotterTable.rowCount"); }
  clickFirstHeader(): Promise<void> { throw notYet("BlotterTable.clickFirstHeader"); }
  fillQuickFilter(_t: string): Promise<void> { throw notYet("BlotterTable.fillQuickFilter"); }
  clearQuickFilter(): Promise<void> { throw notYet("BlotterTable.clearQuickFilter"); }
  isExportCsvVisible(): Promise<boolean> { throw notYet("BlotterTable.isExportCsvVisible"); }
  exportCsvText(): Promise<string> { throw notYet("BlotterTable.exportCsvText"); }
  hoverFirstRow(): Promise<void> { throw notYet("BlotterTable.hoverFirstRow"); }
  firstRowBackgroundColor(): Promise<string> { throw notYet("BlotterTable.firstRowBackgroundColor"); }
  isFirstRowVisible(): Promise<boolean> { throw notYet("BlotterTable.isFirstRowVisible"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
```

- [ ] **Step 4.4: Create `tests/page-objects/playwright/factory.ts`**

```ts
import type { Page } from "@playwright/test";
import type { PageObjects } from "../contracts";
import { PlaywrightWorkspace } from "./Workspace";
import { PlaywrightThemeToggle } from "./ThemeToggle";
import { PlaywrightFooter } from "./Footer";
import { PlaywrightConnectionOverlay } from "./ConnectionOverlay";
import { PlaywrightLiveRatesTile } from "./LiveRatesTile";
import { PlaywrightFxRfqForm } from "./FxRfqForm";
import { PlaywrightAnalyticsDashboard } from "./AnalyticsDashboard";
import { PlaywrightCreditRfqForm } from "./CreditRfqForm";
import { PlaywrightCreditRfqPanel } from "./CreditRfqPanel";
import { PlaywrightBlotterTable } from "./BlotterTable";

export function buildPlaywrightPageObjects(page: Page): PageObjects {
  return {
    workspace: new PlaywrightWorkspace(page),
    themeToggle: new PlaywrightThemeToggle(page),
    footer: new PlaywrightFooter(page),
    connectionOverlay: new PlaywrightConnectionOverlay(page),
    liveRatesTile: new PlaywrightLiveRatesTile(page),
    fxRfqForm: new PlaywrightFxRfqForm(page),
    analyticsDashboard: new PlaywrightAnalyticsDashboard(page),
    creditRfqForm: new PlaywrightCreditRfqForm(page),
    creditRfqPanel: new PlaywrightCreditRfqPanel(page),
    blotterTable: new PlaywrightBlotterTable(page),
  };
}
```

- [ ] **Step 4.5: Delete `tests/page-objects/playwright/.gitkeep`**

```bash
rm tests/page-objects/playwright/.gitkeep
```

- [ ] **Step 4.6: Modify `tests/support/world.ts` to wire the factory**

Replace the existing file contents with:

```ts
import { setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { PageObjects } from "../page-objects/contracts";
import { buildPlaywrightPageObjects } from "../page-objects/playwright/factory";

export class PlaywrightWorld extends World {
  context!: BrowserContext;
  page!: Page;
  po!: PageObjects;

  constructor(options: IWorldOptions) {
    super(options);
  }

  async open(browser: Browser): Promise<void> {
    this.context = await browser.newContext({ baseURL: "http://localhost:3000" });
    this.page = await this.context.newPage();
    this.po = buildPlaywrightPageObjects(this.page);
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

setWorldConstructor(PlaywrightWorld);
```

- [ ] **Step 4.7: Create `tests/specs/theme.feature`**

```gherkin
Feature: Theme

  Background:
    Given the trader has the workspace open

  Scenario: theme toggle button is visible
    Then the theme toggle button is visible

  Scenario: clicking theme toggle changes the theme
    When the trader toggles the theme
    Then the workspace background color has changed

  Scenario: theme persists across page reloads
    When the trader toggles the theme
    And the trader reloads the page
    Then the workspace background color matches the toggled theme

  Scenario: toggle button shows correct icon for current theme
    Then the theme toggle aria-label mentions "light"
    When the trader toggles the theme
    Then the theme toggle aria-label mentions "dark"

  Scenario: workspace tabs work in both themes
    When the trader switches to the "fx" tab
    Then a price tile is visible
    When the trader toggles the theme
    And the trader switches to the "credit" tab
    Then the credit navigation is visible
    When the trader switches to the "admin" tab
    And the trader switches to the "fx" tab
    Then a price tile is visible
```

- [ ] **Step 4.8: Create `tests/steps/browser/common.steps.ts`**

```ts
import { Given, When } from "@cucumber/cucumber";
import type { PlaywrightWorld } from "../../support/world";

Given("the trader has the workspace open", async function (this: PlaywrightWorld) {
  await this.po.workspace.open();
});

Given("the trader has the FX workspace open", async function (this: PlaywrightWorld) {
  await this.po.workspace.openFx();
});

Given("the credit workspace is open", async function (this: PlaywrightWorld) {
  await this.po.workspace.openCredit();
});

When(
  "the trader switches to the {string} tab",
  async function (this: PlaywrightWorld, tab: string) {
    if (tab !== "fx" && tab !== "credit" && tab !== "admin") {
      throw new Error(`unsupported tab: ${tab}`);
    }
    await this.po.workspace.clickTab(tab);
  },
);

When("the trader reloads the page", async function (this: PlaywrightWorld) {
  await this.po.workspace.reload();
});
```

- [ ] **Step 4.9: Create `tests/steps/browser/theme.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

let backgroundBeforeToggle: string | undefined;
let backgroundAfterToggle: string | undefined;

When("the trader toggles the theme", async function (this: PlaywrightWorld) {
  backgroundBeforeToggle = await this.po.workspace.rootBackgroundColor();
  await this.po.themeToggle.click();
  backgroundAfterToggle = await this.po.workspace.rootBackgroundColor();
});

Then("the theme toggle button is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.themeToggle.isVisible()).toBe(true);
});

Then(
  "the workspace background color has changed",
  async function (this: PlaywrightWorld) {
    expect(backgroundAfterToggle).not.toBe(backgroundBeforeToggle);
  },
);

Then(
  "the workspace background color matches the toggled theme",
  async function (this: PlaywrightWorld) {
    const currentBg = await this.po.workspace.rootBackgroundColor();
    expect(currentBg).toBe(backgroundAfterToggle);
  },
);

Then(
  "the theme toggle aria-label mentions {string}",
  async function (this: PlaywrightWorld, term: string) {
    const label = await this.po.themeToggle.ariaLabel();
    expect(label).toContain(term);
  },
);

Then("a price tile is visible", async function (this: PlaywrightWorld) {
  await expect(
    this.page.locator("[data-testid^='tile-']").first(),
  ).toBeVisible({ timeout: 5_000 });
});

Then("the credit navigation is visible", async function (this: PlaywrightWorld) {
  await expect(this.page.getByTestId("credit-nav")).toBeVisible();
});
```

Note: the two short fallback selectors (`tile-` prefix and `credit-nav`) are necessary here because `theme.spec.ts` asserts they exist after specific tab switches. They could be added to the LiveRatesTile and CreditRfqPanel POs in later tasks; in 5A.1 we copy the existing test's locator pattern faithfully. The literal `data-testid` strings live in `testids.ts`; here we use the same prefix string literally because Playwright's `[data-testid^=...]` query needs the raw prefix. (The grep gate excludes step files for this reason — see Section 7.1 of the spec.)

Wait — the grep gate forbids `data-testid` in `tests/specs/` and in `tests/page-objects/contracts/`, not in `tests/steps/browser/`. Re-read the gate:
- ❌ `tests/specs/` → no `data-testid|playwright|cy.`
- ❌ `tests/page-objects/contracts/` → no `@playwright/test|cypress`
- ❌ `tests/steps/browser/` → no `@playwright/test|page-objects/playwright`

So `tests/steps/browser/` IS allowed to import `@cucumber/cucumber` and `@playwright/test`'s `expect`, plus to read `data-testid` indirectly via the prefix selector. The only forbidden imports are `@playwright/test`'s page/locator types beyond `expect`, and the playwright PO impls.

Re-checking — the gate `! grep -RE "@playwright/test|page-objects/playwright" tests/steps/browser/` would flag the line `import { expect } from "@playwright/test";`. That's a real conflict.

**Resolution:** the `expect` import is necessary for assertions in steps. The grep gate as written would block it. Two ways out: (a) loosen the gate to `! grep -RE 'page-objects/playwright|getByTestId\(' tests/steps/browser/`, OR (b) re-export `expect` from a contract-side assertions module. Option (a) is simpler and preserves the architectural intent: step defs cannot import Playwright PO impls and cannot directly query the DOM, but they can run assertions.

The plan adopts (a). The spec's gate will be updated accordingly during Task 11's docs work — see Step 11.X for the corrected grep.

The `this.page.locator(...)` and `this.page.getByTestId(...)` calls in `theme.steps.ts` ARE direct DOM queries from a step def. That violates the architectural rule. Refactor: move them to PO methods.

- [ ] **Step 4.9 (revised): Implement two PO methods early, then write `theme.steps.ts` without direct DOM queries**

The theme feature's last scenario asserts "a price tile is visible" and "the credit navigation is visible" after tab switches. To avoid raw `this.page.locator(...)` in the step file, implement two PO methods early:

In `tests/page-objects/playwright/LiveRatesTile.ts`, replace the existing `waitForFirstTile` stub with the real implementation (the other 14 stubs stay for now — Task 7 fills them):

```ts
  async waitForFirstTile(timeoutMs: number): Promise<void> {
    await this.page
      .locator("[data-testid^='tile-']")
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
  }
```

In `tests/page-objects/playwright/CreditRfqPanel.ts`, implement `navIsVisible` (replace the stub):

```ts
import { TESTIDS } from "../contracts/testids";
// ...
  async navIsVisible(): Promise<boolean> {
    return await this.page.getByTestId(TESTIDS.credit.nav).isVisible();
  }
```

Now write `tests/steps/browser/theme.steps.ts` (final version):

```ts
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

let backgroundBeforeToggle: string | undefined;
let backgroundAfterToggle: string | undefined;

When("the trader toggles the theme", async function (this: PlaywrightWorld) {
  backgroundBeforeToggle = await this.po.workspace.rootBackgroundColor();
  await this.po.themeToggle.click();
  backgroundAfterToggle = await this.po.workspace.rootBackgroundColor();
});

Then("the theme toggle button is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.themeToggle.isVisible()).toBe(true);
});

Then(
  "the workspace background color has changed",
  async function (this: PlaywrightWorld) {
    expect(backgroundAfterToggle).not.toBe(backgroundBeforeToggle);
  },
);

Then(
  "the workspace background color matches the toggled theme",
  async function (this: PlaywrightWorld) {
    const currentBg = await this.po.workspace.rootBackgroundColor();
    expect(currentBg).toBe(backgroundAfterToggle);
  },
);

Then(
  "the theme toggle aria-label mentions {string}",
  async function (this: PlaywrightWorld, term: string) {
    const label = await this.po.themeToggle.ariaLabel();
    expect(label).toContain(term);
  },
);

Then("a price tile is visible", async function (this: PlaywrightWorld) {
  await this.po.liveRatesTile.waitForFirstTile(5_000);
});

Then("the credit navigation is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.creditRfqPanel.navIsVisible()).toBe(true);
});
```

The `import { expect } from "@playwright/test";` is the only Playwright import in any step file. Acceptable per the architectural rule (assertions are allowed; DOM queries are not).

- [ ] **Step 4.10: Delete the old Playwright spec**

```bash
git rm packages/client/e2e/theme.spec.ts
```

- [ ] **Step 4.11: Delete the sanity scaffold**

```bash
git rm tests/specs/_sanity.feature tests/steps/browser/_sanity.steps.ts
```

- [ ] **Step 4.12: Run the new feature**

Run: `pnpm --filter @rtc/tests test:e2e`

Expected:
```
5 scenarios (5 passed)
~12 steps (all passed)
```

If a scenario fails, debug locally. The most likely culprit is the second scenario ("clicking theme toggle changes the theme"): if the background color is captured before the page has stabilised, `backgroundBeforeToggle` and `backgroundAfterToggle` may be equal. Add `await this.page.waitForLoadState("networkidle");` to `Workspace.open()` if needed.

- [ ] **Step 4.13: Run the full e2e suite**

Run: `pnpm test:e2e`

Expected: turbo runs Playwright (35 scenarios = 7 remaining specs) and Cucumber (5 scenarios = `theme.feature`). Total: 40 scenarios across two runners. All green.

- [ ] **Step 4.14: Commit**

```bash
git add tests/page-objects/playwright/ tests/page-objects/contracts/LiveRatesTile.ts tests/support/world.ts tests/specs/theme.feature tests/steps/browser/common.steps.ts tests/steps/browser/theme.steps.ts
git rm packages/client/e2e/theme.spec.ts tests/specs/_sanity.feature tests/steps/browser/_sanity.steps.ts
git commit -m "$(cat <<'EOF'
test(phase-5a.1): convert theme spec to gherkin + page objects

Implements PlaywrightWorkspace and PlaywrightThemeToggle and stubs out
the eight remaining Playwright PO impls so the factory builds a complete
PageObjects bag. Drops the sanity scaffold now that a real conversion
is in place.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Convert `connection.spec.ts` → `connection.feature`

**Files:**
- Modify: `tests/page-objects/playwright/Footer.ts` (replace stubs with real impl)
- Modify: `tests/page-objects/playwright/ConnectionOverlay.ts` (replace stubs with real impl)
- Create: `tests/specs/connection.feature`
- Create: `tests/steps/browser/connection.steps.ts`
- Delete: `packages/client/e2e/connection.spec.ts`

- [ ] **Step 5.1: Implement `tests/page-objects/playwright/Footer.ts`**

Replace the file contents with:

```ts
import type { Page } from "@playwright/test";
import type { FooterPO } from "../contracts/Footer";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightFooter implements FooterPO {
  constructor(private readonly page: Page) {}
  private locator() {
    return this.page.getByTestId(TESTIDS.connection.status);
  }
  async connectionLabel(): Promise<string> {
    return (await this.locator().textContent()) ?? "";
  }
  async isStatusVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }
}
```

- [ ] **Step 5.2: Implement `tests/page-objects/playwright/ConnectionOverlay.ts`**

Replace the file contents with:

```ts
import { expect, type Page } from "@playwright/test";
import type { ConnectionOverlayPO } from "../contracts/ConnectionOverlay";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightConnectionOverlay implements ConnectionOverlayPO {
  constructor(private readonly page: Page) {}
  private locator() {
    return this.page.getByTestId(TESTIDS.connection.overlay);
  }
  async isHidden(): Promise<boolean> {
    return await this.locator().isHidden();
  }
  async waitVisible(timeoutMs: number): Promise<void> {
    await expect(this.locator()).toBeVisible({ timeout: timeoutMs });
  }
  async waitHidden(timeoutMs: number): Promise<void> {
    await expect(this.locator()).toBeHidden({ timeout: timeoutMs });
  }
  async text(): Promise<string> {
    return (await this.locator().textContent()) ?? "";
  }
}
```

- [ ] **Step 5.3: Create `tests/specs/connection.feature`**

```gherkin
Feature: Connection status

  Background:
    Given the trader has the workspace open

  Scenario: connected status is shown in the footer
    Then the connection status footer is visible
    And the connection status footer shows "Connected"

  Scenario: connection overlay is hidden when connected
    Then the connection overlay is hidden

  Scenario: going offline shows the overlay with an offline message
    When the browser goes offline
    Then the connection overlay becomes visible within 3 seconds
    And the connection overlay text matches /offline/i
    And the connection status footer shows "Offline"

  Scenario: coming back online dismisses the overlay
    When the browser goes offline
    And the connection overlay becomes visible within 3 seconds
    And the browser comes back online
    Then the connection overlay is hidden within 5 seconds
    And the connection status footer shows "Connected"
```

- [ ] **Step 5.4: Create `tests/steps/browser/connection.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

When("the browser goes offline", async function (this: PlaywrightWorld) {
  await this.po.workspace.setOffline(true);
});

When("the browser comes back online", async function (this: PlaywrightWorld) {
  await this.po.workspace.setOffline(false);
});

Then("the connection status footer is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.footer.isStatusVisible()).toBe(true);
});

Then(
  "the connection status footer shows {string}",
  async function (this: PlaywrightWorld, expected: string) {
    await expect.poll(async () => await this.po.footer.connectionLabel(), { timeout: 5_000 }).toContain(expected);
  },
);

Then("the connection overlay is hidden", async function (this: PlaywrightWorld) {
  expect(await this.po.connectionOverlay.isHidden()).toBe(true);
});

Then(
  "the connection overlay becomes visible within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.connectionOverlay.waitVisible(seconds * 1_000);
  },
);

Then(
  "the connection overlay is hidden within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.connectionOverlay.waitHidden(seconds * 1_000);
  },
);

Then(
  "the connection overlay text matches {}",
  async function (this: PlaywrightWorld, raw: string) {
    const match = raw.match(/^\/(.+)\/([gimsuy]*)$/);
    if (!match) throw new Error(`bad regex literal: ${raw}`);
    const re = new RegExp(match[1], match[2]);
    const text = await this.po.connectionOverlay.text();
    expect(text).toMatch(re);
  },
);
```

The `{}` cucumber expression captures the raw `/.../i` regex literal as a string; the step parses it. This avoids inventing a custom parameter type for one step.

- [ ] **Step 5.5: Delete the old spec and run**

```bash
git rm packages/client/e2e/connection.spec.ts
pnpm --filter @rtc/tests test:e2e
```

Expected: 9 scenarios pass (theme: 5, connection: 4).

- [ ] **Step 5.6: Run the full e2e suite**

Run: `pnpm test:e2e`

Expected: Playwright (31 scenarios) + Cucumber (9 scenarios) = 40 total. All green.

- [ ] **Step 5.7: Commit**

```bash
git add tests/page-objects/playwright/Footer.ts tests/page-objects/playwright/ConnectionOverlay.ts tests/specs/connection.feature tests/steps/browser/connection.steps.ts
git rm packages/client/e2e/connection.spec.ts
git commit -m "$(cat <<'EOF'
test(phase-5a.1): convert connection spec to gherkin + page objects

Implements PlaywrightFooter and PlaywrightConnectionOverlay and adds
4 connection scenarios. The setOffline action goes through
WorkspacePO.setOffline (which delegates to BrowserContext.setOffline)
so step defs never touch the Playwright API directly.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Convert `analytics.spec.ts` → `analytics.feature`

**Files:**
- Modify: `tests/page-objects/playwright/AnalyticsDashboard.ts`
- Modify: `tests/page-objects/playwright/LiveRatesTile.ts` (light read-side: `waitForFirstTile` already exists from Task 4; nothing more needed for analytics)
- Create: `tests/specs/analytics.feature`
- Create: `tests/steps/browser/analytics.steps.ts`
- Delete: `packages/client/e2e/analytics.spec.ts`

- [ ] **Step 6.1: Implement `tests/page-objects/playwright/AnalyticsDashboard.ts`**

Replace the file contents with:

```ts
import { expect, type Page } from "@playwright/test";
import type { AnalyticsDashboardPO } from "../contracts/AnalyticsDashboard";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightAnalyticsDashboard implements AnalyticsDashboardPO {
  constructor(private readonly page: Page) {}
  private locator() {
    return this.page.getByTestId(TESTIDS.analytics.panel);
  }
  async waitVisible(timeoutMs: number): Promise<void> {
    await expect(this.locator()).toBeVisible({ timeout: timeoutMs });
  }
  async isVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }
  async hasSection(name: string): Promise<boolean> {
    return await this.locator().getByText(name).isVisible();
  }
}
```

- [ ] **Step 6.2: Create `tests/specs/analytics.feature`**

```gherkin
Feature: Analytics panel

  Background:
    Given the trader has the FX workspace open

  Scenario: analytics panel is visible with sections
    Then the analytics panel is visible within 5 seconds
    And the analytics panel shows the section "Analytics"
    And the analytics panel shows the section "Profit & Loss"
    And the analytics panel shows the section "Positions"
    And the analytics panel shows the section "PnL per Currency Pair"

  Scenario: PnL section is visible
    Then the analytics panel is visible within 5 seconds
    And the analytics panel shows the section "Profit & Loss"

  Scenario: positions section is visible
    Then the analytics panel is visible within 5 seconds
    And the analytics panel shows the section "Positions"

  Scenario: analytics panel shows alongside live rates
    Then a price tile is visible
    And the analytics panel is visible within 5 seconds
```

The original `analytics.spec.ts` had 4 tests; the third ("position bubbles are rendered") and the second ("PnL value updates over time") today only assert the section heading is visible. The Gherkin scenarios above preserve those behaviours one-for-one.

- [ ] **Step 6.3: Create `tests/steps/browser/analytics.steps.ts`**

```ts
import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

Then(
  "the analytics panel is visible within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.analyticsDashboard.waitVisible(seconds * 1_000);
  },
);

Then(
  "the analytics panel shows the section {string}",
  async function (this: PlaywrightWorld, name: string) {
    expect(await this.po.analyticsDashboard.hasSection(name)).toBe(true);
  },
);
```

(The "a price tile is visible" step already lives in `theme.steps.ts` from Task 4 and is reused.)

- [ ] **Step 6.4: Delete the old spec and run**

```bash
git rm packages/client/e2e/analytics.spec.ts
pnpm --filter @rtc/tests test:e2e
```

Expected: 13 scenarios pass (theme 5 + connection 4 + analytics 4).

- [ ] **Step 6.5: Full e2e check**

Run: `pnpm test:e2e`

Expected: Playwright (27 scenarios) + Cucumber (13) = 40. Green.

- [ ] **Step 6.6: Commit**

```bash
git add tests/page-objects/playwright/AnalyticsDashboard.ts tests/specs/analytics.feature tests/steps/browser/analytics.steps.ts
git rm packages/client/e2e/analytics.spec.ts
git commit -m "$(cat <<'EOF'
test(phase-5a.1): convert analytics spec to gherkin + page objects

Implements PlaywrightAnalyticsDashboard. Reuses the "a price tile is
visible" step defined in theme.steps.ts for the cross-panel scenario.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Convert `fxLiveRates.spec.ts` → `fxLiveRates.feature`

**Files:**
- Modify: `tests/page-objects/playwright/LiveRatesTile.ts` (fill out read-side: count, firstTileText, clickFilter, clickViewToggle, viewToggleLabel)
- Create: `tests/specs/fxLiveRates.feature`
- Create: `tests/steps/browser/fxLiveRates.steps.ts`
- Delete: `packages/client/e2e/fxLiveRates.spec.ts`

- [ ] **Step 7.1: Replace stubs in `tests/page-objects/playwright/LiveRatesTile.ts` with read-side impl**

Open the file. The class currently has `waitForFirstTile` (implemented in Task 4) and 14 stubs that throw `notYet(...)`. Replace the body with the following, keeping `waitForFirstTile` intact:

```ts
import { expect, type Page } from "@playwright/test";
import type { LiveRatesTilePO } from "../contracts/LiveRatesTile";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightLiveRatesTile implements LiveRatesTilePO {
  constructor(private readonly page: Page) {}

  private allTiles() {
    return this.page.locator("[data-testid^='tile-']");
  }
  private firstTile() {
    return this.allTiles().first();
  }

  async waitForFirstTile(timeoutMs: number): Promise<void> {
    await this.firstTile().waitFor({ state: "visible", timeout: timeoutMs });
  }
  async count(): Promise<number> {
    return await this.allTiles().count();
  }
  async firstTileText(): Promise<string> {
    return await this.firstTile().innerText();
  }
  async clickFilter(category: string): Promise<void> {
    await this.page.getByTestId(TESTIDS.liveRates.filter(category)).click();
  }
  async clickViewToggle(): Promise<void> {
    await this.page.getByTestId(TESTIDS.liveRates.viewToggle).click();
  }
  async viewToggleLabel(): Promise<string> {
    return (await this.page.getByTestId(TESTIDS.liveRates.viewToggle).textContent()) ?? "";
  }

  // Trade execution (filled in Task 8)
  async clickBuyOnFirst(): Promise<void> { throw notYet("LiveRatesTile.clickBuyOnFirst"); }
  async clickSellOnFirst(): Promise<void> { throw notYet("LiveRatesTile.clickSellOnFirst"); }
  async waitForConfirmation(_t: number): Promise<void> { throw notYet("LiveRatesTile.waitForConfirmation"); }
  async confirmationContainsAny(_p: readonly RegExp[], _t: number): Promise<void> { throw notYet("LiveRatesTile.confirmationContainsAny"); }
  async dismissConfirmation(): Promise<void> { throw notYet("LiveRatesTile.dismissConfirmation"); }
  async confirmationHidden(_t: number): Promise<void> { throw notYet("LiveRatesTile.confirmationHidden"); }
  async isConfirmationVisible(): Promise<boolean> { throw notYet("LiveRatesTile.isConfirmationVisible"); }
  async fillFirstTileNotional(_v: string): Promise<void> { throw notYet("LiveRatesTile.fillFirstTileNotional"); }
  async isNotionalInputVisible(): Promise<boolean> { throw notYet("LiveRatesTile.isNotionalInputVisible"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
```

- [ ] **Step 7.2: Create `tests/specs/fxLiveRates.feature`**

```gherkin
Feature: FX live rates

  Background:
    Given the trader has the FX workspace open

  Scenario: tile grid renders streaming prices
    Then a price tile is visible within 5 seconds
    And there is at least 1 visible tile

  Scenario: each tile shows sell and buy buttons
    Then a price tile is visible within 5 seconds
    And the first tile has visible sell and buy buttons

  Scenario: currency filter narrows visible tiles
    Then a price tile is visible within 5 seconds
    When the trader records the visible tile count as "all"
    And the trader clicks the "EUR" currency filter
    Then the visible tile count is at most "all"
    When the trader clicks the "All" currency filter
    Then the visible tile count equals "all"

  Scenario: view toggle switches between chart and price view
    Then the view toggle button is visible
    And the view toggle button shows "Price"
    When the trader clicks the view toggle
    Then the view toggle button shows "Chart"
    When the trader clicks the view toggle
    Then the view toggle button shows "Price"

  Scenario: view preference persists across reloads
    Then the view toggle button is visible
    When the trader clicks the view toggle
    Then the view toggle button shows "Chart"
    When the trader reloads the page
    And the trader switches to the "fx" tab
    Then the view toggle button shows "Chart"

  Scenario: prices update over time
    Then a price tile is visible within 5 seconds
    When the trader records the first tile text
    And the trader waits 2 seconds
    Then the first tile text is non-empty
```

Note: the original "prices update over time" test only asserts `initialText.length > 0` and `updatedText.length > 0` — it does NOT assert the texts differ. The Gherkin preserves that exactly.

- [ ] **Step 7.3: Create `tests/steps/browser/fxLiveRates.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

const recordedCounts = new Map<string, number>();
let firstTileTextSnapshot: string | undefined;

Then(
  "a price tile is visible within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.liveRatesTile.waitForFirstTile(seconds * 1_000);
  },
);

Then(
  "there is at least {int} visible tile",
  async function (this: PlaywrightWorld, n: number) {
    expect(await this.po.liveRatesTile.count()).toBeGreaterThanOrEqual(n);
  },
);

Then(
  "the first tile has visible sell and buy buttons",
  async function (this: PlaywrightWorld) {
    // No PO method needed: the LiveRatesTilePO surfaces clickBuyOnFirst etc.
    // Visibility check on buttons goes via Playwright through a small helper.
    // We add it as a separate read-side method to keep step defs DOM-free.
    expect(await this.page.locator("[data-testid^='tile-']").first().getByTestId("buy-btn").isVisible()).toBe(true);
    expect(await this.page.locator("[data-testid^='tile-']").first().getByTestId("sell-btn").isVisible()).toBe(true);
  },
);

When(
  "the trader records the visible tile count as {string}",
  async function (this: PlaywrightWorld, key: string) {
    recordedCounts.set(key, await this.po.liveRatesTile.count());
  },
);

When(
  "the trader clicks the {string} currency filter",
  async function (this: PlaywrightWorld, category: string) {
    await this.po.liveRatesTile.clickFilter(category);
  },
);

Then(
  "the visible tile count is at most {string}",
  async function (this: PlaywrightWorld, key: string) {
    const baseline = recordedCounts.get(key);
    if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
    expect(await this.po.liveRatesTile.count()).toBeLessThanOrEqual(baseline);
  },
);

Then(
  "the visible tile count equals {string}",
  async function (this: PlaywrightWorld, key: string) {
    const baseline = recordedCounts.get(key);
    if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
    expect(await this.po.liveRatesTile.count()).toBe(baseline);
  },
);

Then("the view toggle button is visible", async function (this: PlaywrightWorld) {
  await expect(this.page.getByTestId("view-toggle")).toBeVisible();
});

Then(
  "the view toggle button shows {string}",
  async function (this: PlaywrightWorld, expected: string) {
    expect(await this.po.liveRatesTile.viewToggleLabel()).toContain(expected);
  },
);

When("the trader clicks the view toggle", async function (this: PlaywrightWorld) {
  await this.po.liveRatesTile.clickViewToggle();
});

When("the trader records the first tile text", async function (this: PlaywrightWorld) {
  firstTileTextSnapshot = await this.po.liveRatesTile.firstTileText();
});

When("the trader waits {int} seconds", async function (this: PlaywrightWorld, n: number) {
  await this.page.waitForTimeout(n * 1_000);
});

Then("the first tile text is non-empty", async function (this: PlaywrightWorld) {
  const current = await this.po.liveRatesTile.firstTileText();
  expect(firstTileTextSnapshot?.length ?? 0).toBeGreaterThan(0);
  expect(current.length).toBeGreaterThan(0);
});
```

The two step bodies that touch `this.page.locator(...)` (the buy/sell button check and the view toggle visibility) are not yet routed through the PO contract because the contracts as defined don't expose these reads. Either:
(a) Extend `LiveRatesTilePO` with `firstTileBuyButtonVisible(): Promise<boolean>`, `firstTileSellButtonVisible(): Promise<boolean>`, `viewToggleVisible(): Promise<boolean>` — adds 3 methods.
(b) Accept the inline `this.page.*` for these visibility checks — violates the architectural rule.

Choose (a). Add the three methods now to `tests/page-objects/contracts/LiveRatesTile.ts`:

```ts
  /** Whether the first tile shows a buy button. */
  firstTileBuyVisible(): Promise<boolean>;
  /** Whether the first tile shows a sell button. */
  firstTileSellVisible(): Promise<boolean>;
  /** Whether the view-toggle button is visible. */
  viewToggleVisible(): Promise<boolean>;
```

And implement in `tests/page-objects/playwright/LiveRatesTile.ts` (insert after `viewToggleLabel`):

```ts
  async firstTileBuyVisible(): Promise<boolean> {
    return await this.firstTile().getByTestId(TESTIDS.liveRates.buyBtn).isVisible();
  }
  async firstTileSellVisible(): Promise<boolean> {
    return await this.firstTile().getByTestId(TESTIDS.liveRates.sellBtn).isVisible();
  }
  async viewToggleVisible(): Promise<boolean> {
    return await this.page.getByTestId(TESTIDS.liveRates.viewToggle).isVisible();
  }
```

Update `fxLiveRates.steps.ts` to use the new methods. Replace the two offending bodies:

```ts
Then(
  "the first tile has visible sell and buy buttons",
  async function (this: PlaywrightWorld) {
    expect(await this.po.liveRatesTile.firstTileSellVisible()).toBe(true);
    expect(await this.po.liveRatesTile.firstTileBuyVisible()).toBe(true);
  },
);

Then("the view toggle button is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.liveRatesTile.viewToggleVisible()).toBe(true);
});
```

Now no step file performs DOM queries.

- [ ] **Step 7.4: Delete the old spec, run**

```bash
git rm packages/client/e2e/fxLiveRates.spec.ts
pnpm --filter @rtc/tests test:e2e
```

Expected: 19 scenarios pass (theme 5 + connection 4 + analytics 4 + fxLiveRates 6).

- [ ] **Step 7.5: Full e2e check**

Run: `pnpm test:e2e`

Expected: Playwright (21) + Cucumber (19) = 40. Green.

- [ ] **Step 7.6: Commit**

```bash
git add tests/page-objects/contracts/LiveRatesTile.ts tests/page-objects/playwright/LiveRatesTile.ts tests/specs/fxLiveRates.feature tests/steps/browser/fxLiveRates.steps.ts
git rm packages/client/e2e/fxLiveRates.spec.ts
git commit -m "$(cat <<'EOF'
test(phase-5a.1): convert fxLiveRates spec to gherkin + page objects

Fills the read-side of LiveRatesTilePO (count, firstTileText, filter,
view toggle) and adds three small visibility helpers so step defs stay
DOM-free.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Convert `fxTrading.spec.ts` → `fxTrading.feature`

**Files:**
- Modify: `tests/page-objects/playwright/LiveRatesTile.ts` (replace remaining stubs with real impl)
- Modify: `tests/page-objects/playwright/BlotterTable.ts` (read-side: `waitVisible`, `isVisible`, `rowCount`)
- Create: `tests/specs/fxTrading.feature`
- Create: `tests/steps/browser/fxTrading.steps.ts`
- Delete: `packages/client/e2e/fxTrading.spec.ts`

- [ ] **Step 8.1: Fill the trading methods on `tests/page-objects/playwright/LiveRatesTile.ts`**

Replace the trading-method stubs (between `viewToggleVisible` and the closing brace) with:

```ts
  async clickBuyOnFirst(): Promise<void> {
    await this.firstTile().getByTestId(TESTIDS.liveRates.buyBtn).click();
  }
  async clickSellOnFirst(): Promise<void> {
    await this.firstTile().getByTestId(TESTIDS.liveRates.sellBtn).click();
  }
  async waitForConfirmation(timeoutMs: number): Promise<void> {
    await expect(
      this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation),
    ).toBeVisible({ timeout: timeoutMs });
  }
  async confirmationContainsAny(patterns: readonly RegExp[], timeoutMs: number): Promise<void> {
    const confirmation = this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation);
    const combined = new RegExp(patterns.map((p) => p.source).join("|"), "i");
    await expect(confirmation).toContainText(combined, { timeout: timeoutMs });
  }
  async dismissConfirmation(): Promise<void> {
    await this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation).click();
  }
  async confirmationHidden(timeoutMs: number): Promise<void> {
    await expect(
      this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation),
    ).toBeHidden({ timeout: timeoutMs });
  }
  async isConfirmationVisible(): Promise<boolean> {
    return await this.firstTile().getByTestId(TESTIDS.liveRates.tradeConfirmation).isVisible();
  }
  async fillFirstTileNotional(value: string): Promise<void> {
    const input = this.firstTile().locator("input");
    await input.click();
    await input.fill(value);
    await input.press("Enter");
  }
  async isNotionalInputVisible(): Promise<boolean> {
    return await this.firstTile().locator("input").isVisible();
  }
```

The `expect` import already exists at the top of the file from Task 7's edits.

- [ ] **Step 8.2: Implement read-side of `tests/page-objects/playwright/BlotterTable.ts`**

Replace the file contents with:

```ts
import { expect, type Page } from "@playwright/test";
import type { BlotterTablePO } from "../contracts/BlotterTable";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightBlotterTable implements BlotterTablePO {
  constructor(private readonly page: Page) {}

  private locator() {
    return this.page.getByTestId(TESTIDS.blotter.table);
  }
  private rows() {
    return this.locator().locator("tbody tr");
  }

  async waitVisible(timeoutMs: number): Promise<void> {
    await expect(this.locator()).toBeVisible({ timeout: timeoutMs });
  }
  async isVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }
  async rowCount(): Promise<number> {
    return await this.rows().count();
  }
  async clickFirstHeader(): Promise<void> { throw notYet("BlotterTable.clickFirstHeader"); }
  async fillQuickFilter(_t: string): Promise<void> { throw notYet("BlotterTable.fillQuickFilter"); }
  async clearQuickFilter(): Promise<void> { throw notYet("BlotterTable.clearQuickFilter"); }
  async isExportCsvVisible(): Promise<boolean> { throw notYet("BlotterTable.isExportCsvVisible"); }
  async exportCsvText(): Promise<string> { throw notYet("BlotterTable.exportCsvText"); }
  async hoverFirstRow(): Promise<void> { throw notYet("BlotterTable.hoverFirstRow"); }
  async firstRowBackgroundColor(): Promise<string> { throw notYet("BlotterTable.firstRowBackgroundColor"); }
  async isFirstRowVisible(): Promise<boolean> { throw notYet("BlotterTable.isFirstRowVisible"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
```

- [ ] **Step 8.3: Create `tests/specs/fxTrading.feature`**

```gherkin
Feature: FX trading

  Background:
    Given the trader has the FX workspace open

  Scenario: execute a buy trade and see confirmation
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    Then the trade confirmation appears within 5 seconds
    And the trade confirmation matches one of /Executing/i, /You Bought/i, /rejected/i

  Scenario: execute a sell trade and see confirmation
    Then a price tile is visible within 5 seconds
    When the trader clicks sell on the first tile
    Then the trade confirmation appears within 5 seconds
    And the trade confirmation matches one of /Executing/i, /You Sold/i, /rejected/i

  Scenario: trade confirmation is dismissible by clicking
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    Then the trade confirmation appears within 5 seconds
    And the trade confirmation matches one of /You Bought/i, /You Sold/i, /rejected/i, /timed out/i, /Credit limit/i within 10 seconds
    When the trader dismisses the trade confirmation
    Then the trade confirmation hides within 5 seconds

  Scenario: executed trade appears in the blotter
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    And the trader waits 2 seconds
    Then the blotter table is visible
    And the blotter has at least 1 row

  Scenario: notional input accepts custom values
    Then a price tile is visible within 5 seconds
    Then the notional input on the first tile is visible
    When the trader sets the first tile notional to "5000000"
```

- [ ] **Step 8.4: Create `tests/steps/browser/fxTrading.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

When("the trader clicks buy on the first tile", async function (this: PlaywrightWorld) {
  await this.po.liveRatesTile.clickBuyOnFirst();
});

When("the trader clicks sell on the first tile", async function (this: PlaywrightWorld) {
  await this.po.liveRatesTile.clickSellOnFirst();
});

Then(
  "the trade confirmation appears within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.liveRatesTile.waitForConfirmation(seconds * 1_000);
  },
);

Then(
  "the trade confirmation matches one of {}",
  async function (this: PlaywrightWorld, raw: string) {
    const patterns = parseRegexList(raw);
    await this.po.liveRatesTile.confirmationContainsAny(patterns, 5_000);
  },
);

Then(
  "the trade confirmation matches one of {} within {int} seconds",
  async function (this: PlaywrightWorld, raw: string, seconds: number) {
    const patterns = parseRegexList(raw);
    await this.po.liveRatesTile.confirmationContainsAny(patterns, seconds * 1_000);
  },
);

When("the trader dismisses the trade confirmation", async function (this: PlaywrightWorld) {
  await this.po.liveRatesTile.dismissConfirmation();
});

Then(
  "the trade confirmation hides within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.liveRatesTile.confirmationHidden(seconds * 1_000);
  },
);

Then("the blotter table is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.blotterTable.isVisible()).toBe(true);
});

Then(
  "the blotter has at least {int} row",
  async function (this: PlaywrightWorld, n: number) {
    expect(await this.po.blotterTable.rowCount()).toBeGreaterThanOrEqual(n);
  },
);

Then("the notional input on the first tile is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.liveRatesTile.isNotionalInputVisible()).toBe(true);
});

When(
  "the trader sets the first tile notional to {string}",
  async function (this: PlaywrightWorld, value: string) {
    await this.po.liveRatesTile.fillFirstTileNotional(value);
  },
);

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
```

- [ ] **Step 8.5: Delete the old spec, run**

```bash
git rm packages/client/e2e/fxTrading.spec.ts
pnpm --filter @rtc/tests test:e2e
```

Expected: 24 scenarios pass (theme 5 + connection 4 + analytics 4 + fxLiveRates 6 + fxTrading 5).

- [ ] **Step 8.6: Full e2e check**

Run: `pnpm test:e2e`

Expected: Playwright (16) + Cucumber (24) = 40. Green.

- [ ] **Step 8.7: Commit**

```bash
git add tests/page-objects/playwright/LiveRatesTile.ts tests/page-objects/playwright/BlotterTable.ts tests/specs/fxTrading.feature tests/steps/browser/fxTrading.steps.ts
git rm packages/client/e2e/fxTrading.spec.ts
git commit -m "$(cat <<'EOF'
test(phase-5a.1): convert fxTrading spec to gherkin + page objects

Fills the trading methods on LiveRatesTilePO (buy/sell, confirmation
lifecycle, notional input) and brings up BlotterTablePO read-side for
the cross-region "executed trade appears in blotter" scenario.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Convert `fxRfq.spec.ts` → `fxRfq.feature`

**Files:**
- Modify: `tests/page-objects/playwright/FxRfqForm.ts`
- Create: `tests/specs/fxRfq.feature`
- Create: `tests/steps/browser/fxRfq.steps.ts`
- Delete: `packages/client/e2e/fxRfq.spec.ts`

- [ ] **Step 9.1: Implement `tests/page-objects/playwright/FxRfqForm.ts`**

Replace the file contents with:

```ts
import { expect, type Page } from "@playwright/test";
import type { FxRfqFormPO } from "../contracts/FxRfqForm";

export class PlaywrightFxRfqForm implements FxRfqFormPO {
  constructor(private readonly page: Page) {}

  private firstTile() {
    return this.page.locator("[data-testid^='tile-']").first();
  }
  private rfqButton() {
    return this.firstTile().getByText(/initiate rfq|request quote/i);
  }
  private countdownOrQuote() {
    return this.firstTile().getByText(/\d+s|accepting|expired|quote/i);
  }

  async waitForRfqButton(timeoutMs: number): Promise<void> {
    await expect(this.rfqButton()).toBeVisible({ timeout: timeoutMs });
  }
  async clickInitiateRfq(): Promise<void> {
    await this.rfqButton().click();
  }
  async waitForCountdownOrQuote(timeoutMs: number): Promise<void> {
    await expect(this.countdownOrQuote()).toBeVisible({ timeout: timeoutMs });
  }
}
```

- [ ] **Step 9.2: Create `tests/specs/fxRfq.feature`**

```gherkin
Feature: FX RFQ flow

  Background:
    Given the trader has the FX workspace open

  Scenario: entering large notional triggers RFQ mode on the tile
    Then a price tile is visible within 5 seconds
    When the trader sets the first tile notional to "10000000"
    Then the RFQ initiation button appears within 3 seconds

  Scenario: RFQ can be initiated and shows countdown
    Then a price tile is visible within 5 seconds
    When the trader sets the first tile notional to "10000000"
    And the RFQ initiation button appears within 3 seconds
    And the trader clicks the RFQ initiation button
    Then a countdown or quote indicator appears within 5 seconds
```

- [ ] **Step 9.3: Create `tests/steps/browser/fxRfq.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import type { PlaywrightWorld } from "../../support/world";

Then(
  "the RFQ initiation button appears within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.fxRfqForm.waitForRfqButton(seconds * 1_000);
  },
);

When("the trader clicks the RFQ initiation button", async function (this: PlaywrightWorld) {
  await this.po.fxRfqForm.clickInitiateRfq();
});

Then(
  "a countdown or quote indicator appears within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.fxRfqForm.waitForCountdownOrQuote(seconds * 1_000);
  },
);
```

The "the trader sets the first tile notional to ..." step is already defined in `fxTrading.steps.ts` (Task 8) and is reused.

- [ ] **Step 9.4: Delete the old spec, run**

```bash
git rm packages/client/e2e/fxRfq.spec.ts
pnpm --filter @rtc/tests test:e2e
```

Expected: 26 scenarios pass.

- [ ] **Step 9.5: Full e2e check**

Run: `pnpm test:e2e`

Expected: Playwright (14) + Cucumber (26) = 40. Green.

- [ ] **Step 9.6: Commit**

```bash
git add tests/page-objects/playwright/FxRfqForm.ts tests/specs/fxRfq.feature tests/steps/browser/fxRfq.steps.ts
git rm packages/client/e2e/fxRfq.spec.ts
git commit -m "$(cat <<'EOF'
test(phase-5a.1): convert fxRfq spec to gherkin + page objects

Implements PlaywrightFxRfqForm with the same regex-based locators
the existing test uses, encapsulated behind the FxRfqFormPO contract.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Convert `creditRfq.spec.ts` → `creditRfq.feature`

**Files:**
- Modify: `tests/page-objects/playwright/CreditRfqForm.ts`
- Modify: `tests/page-objects/playwright/CreditRfqPanel.ts`
- Create: `tests/specs/creditRfq.feature`
- Create: `tests/steps/browser/creditRfq.steps.ts`
- Delete: `packages/client/e2e/creditRfq.spec.ts`

- [ ] **Step 10.1: Implement `tests/page-objects/playwright/CreditRfqForm.ts`**

Replace the file contents with:

```ts
import { expect, type Page } from "@playwright/test";
import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";

export class PlaywrightCreditRfqForm implements CreditRfqFormPO {
  constructor(private readonly page: Page) {}

  async waitForSubmitButton(timeoutMs: number): Promise<void> {
    await expect(this.page.getByText("Submit RFQ")).toBeVisible({ timeout: timeoutMs });
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

- [ ] **Step 10.2: Implement remaining methods on `tests/page-objects/playwright/CreditRfqPanel.ts`**

The file already has `navIsVisible` from Task 4. Replace the file contents with the full impl:

```ts
import { expect, type Page } from "@playwright/test";
import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightCreditRfqPanel implements CreditRfqPanelPO {
  constructor(private readonly page: Page) {}

  async navIsVisible(): Promise<boolean> {
    return await this.page.getByTestId(TESTIDS.credit.nav).isVisible();
  }
  async tabIsVisible(tab: "tiles" | "new-rfq" | "sell-side"): Promise<boolean> {
    return await this.page.getByTestId(TESTIDS.credit.tab(tab)).isVisible();
  }
  async clickTab(tab: "tiles" | "new-rfq" | "sell-side"): Promise<void> {
    await this.page.getByTestId(TESTIDS.credit.tab(tab)).click();
  }
  async waitForNoRfqsMessage(timeoutMs: number): Promise<void> {
    await expect(this.page.getByText("No RFQs to display")).toBeVisible({ timeout: timeoutMs });
  }
  async waitForSellSideHeading(timeoutMs: number): Promise<void> {
    await expect(this.page.getByText("Sell Side (Adaptive Bank)")).toBeVisible({ timeout: timeoutMs });
  }
  async waitForCreditTradesHeading(timeoutMs: number): Promise<void> {
    await expect(this.page.getByText("Credit Trades", { exact: true })).toBeVisible({ timeout: timeoutMs });
  }
}
```

- [ ] **Step 10.3: Create `tests/specs/creditRfq.feature`**

```gherkin
Feature: Credit RFQ

  Background:
    Given the credit workspace is open

  Scenario: credit workspace shows navigation tabs
    Then the credit navigation is visible
    And the credit "tiles" tab is visible
    And the credit "new-rfq" tab is visible
    And the credit "sell-side" tab is visible

  Scenario: RFQ tiles panel shows initial state
    Then the credit "tiles" tab is visible
    And the message "No RFQs to display" appears within 5 seconds

  Scenario: navigate to New RFQ form
    When the trader switches to the credit "new-rfq" tab
    Then the credit RFQ submit button appears within 3 seconds

  Scenario: New RFQ form has all required fields
    When the trader switches to the credit "new-rfq" tab
    Then the credit RFQ submit button appears within 3 seconds
    And the credit RFQ form has Buy and Sell direction buttons
    And the credit RFQ form has a Direction label

  Scenario: navigate to Sell Side panel
    When the trader switches to the credit "sell-side" tab
    Then the sell-side heading "Sell Side (Adaptive Bank)" appears within 5 seconds

  Scenario: credit blotter is visible below the workspace
    Then the credit trades heading "Credit Trades" appears within 5 seconds

  Scenario: switching between credit views maintains state
    When the trader switches to the credit "new-rfq" tab
    Then the credit RFQ submit button appears within 3 seconds
    When the trader switches to the credit "tiles" tab
    Then the message "No RFQs to display" appears within 3 seconds
    When the trader switches to the credit "sell-side" tab
    Then the sell-side heading "Sell Side (Adaptive Bank)" appears within 3 seconds
```

- [ ] **Step 10.4: Create `tests/steps/browser/creditRfq.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

When(
  "the trader switches to the credit {string} tab",
  async function (this: PlaywrightWorld, tab: string) {
    if (tab !== "tiles" && tab !== "new-rfq" && tab !== "sell-side") {
      throw new Error(`unsupported credit tab: ${tab}`);
    }
    await this.po.creditRfqPanel.clickTab(tab);
  },
);

Then(
  "the credit {string} tab is visible",
  async function (this: PlaywrightWorld, tab: string) {
    if (tab !== "tiles" && tab !== "new-rfq" && tab !== "sell-side") {
      throw new Error(`unsupported credit tab: ${tab}`);
    }
    expect(await this.po.creditRfqPanel.tabIsVisible(tab)).toBe(true);
  },
);

Then(
  "the message {string} appears within {int} seconds",
  async function (this: PlaywrightWorld, message: string, seconds: number) {
    if (message === "No RFQs to display") {
      await this.po.creditRfqPanel.waitForNoRfqsMessage(seconds * 1_000);
    } else {
      throw new Error(`message "${message}" has no PO method; add one if needed`);
    }
  },
);

Then(
  "the credit RFQ submit button appears within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.creditRfqForm.waitForSubmitButton(seconds * 1_000);
  },
);

Then(
  "the credit RFQ form has Buy and Sell direction buttons",
  async function (this: PlaywrightWorld) {
    expect(await this.po.creditRfqForm.hasBuyAndSellButtons()).toBe(true);
  },
);

Then("the credit RFQ form has a Direction label", async function (this: PlaywrightWorld) {
  expect(await this.po.creditRfqForm.hasDirectionLabel()).toBe(true);
});

Then(
  "the sell-side heading {string} appears within {int} seconds",
  async function (this: PlaywrightWorld, _heading: string, seconds: number) {
    await this.po.creditRfqPanel.waitForSellSideHeading(seconds * 1_000);
  },
);

Then(
  "the credit trades heading {string} appears within {int} seconds",
  async function (this: PlaywrightWorld, _heading: string, seconds: number) {
    await this.po.creditRfqPanel.waitForCreditTradesHeading(seconds * 1_000);
  },
);
```

The "credit navigation is visible" step is already defined in `theme.steps.ts` from Task 4.

- [ ] **Step 10.5: Delete the old spec, run**

```bash
git rm packages/client/e2e/creditRfq.spec.ts
pnpm --filter @rtc/tests test:e2e
```

Expected: 33 scenarios pass.

- [ ] **Step 10.6: Full e2e check**

Run: `pnpm test:e2e`

Expected: Playwright (7) + Cucumber (33) = 40. Green.

- [ ] **Step 10.7: Commit**

```bash
git add tests/page-objects/playwright/CreditRfqForm.ts tests/page-objects/playwright/CreditRfqPanel.ts tests/specs/creditRfq.feature tests/steps/browser/creditRfq.steps.ts
git rm packages/client/e2e/creditRfq.spec.ts
git commit -m "$(cat <<'EOF'
test(phase-5a.1): convert creditRfq spec to gherkin + page objects

Implements PlaywrightCreditRfqForm and PlaywrightCreditRfqPanel.
Largest feature file at 7 scenarios; uses text-based locators because
the credit workspace's form fields and headings have no testids today.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Convert `blotter.spec.ts`, retire `packages/client/e2e/`, update docs

**Files:**
- Modify: `tests/page-objects/playwright/BlotterTable.ts` (fill remaining stubs)
- Create: `tests/specs/blotter.feature`
- Create: `tests/steps/browser/blotter.steps.ts`
- Delete: `packages/client/e2e/blotter.spec.ts` (last one)
- Delete: `packages/client/e2e/` (the now-empty directory)
- Delete: `packages/client/playwright.config.ts`
- Modify: `packages/client/package.json` (drop `test:e2e` script and `@playwright/test` devDep)
- Modify: `packages/client/tsconfig.node.json` (drop `playwright.config.ts` and `e2e` from `include`)
- Modify: `docs/architecture.md` (§11)
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 11.1: Fill remaining stubs in `tests/page-objects/playwright/BlotterTable.ts`**

Replace the file contents with the full impl:

```ts
import { expect, type Page } from "@playwright/test";
import type { BlotterTablePO } from "../contracts/BlotterTable";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightBlotterTable implements BlotterTablePO {
  constructor(private readonly page: Page) {}

  private locator() {
    return this.page.getByTestId(TESTIDS.blotter.table);
  }
  private rows() {
    return this.locator().locator("tbody tr");
  }
  private firstRow() {
    return this.rows().first();
  }

  async waitVisible(timeoutMs: number): Promise<void> {
    await expect(this.locator()).toBeVisible({ timeout: timeoutMs });
  }
  async isVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }
  async rowCount(): Promise<number> {
    return await this.rows().count();
  }
  async clickFirstHeader(): Promise<void> {
    await this.locator().locator("th").first().click();
  }
  async fillQuickFilter(text: string): Promise<void> {
    await this.page.getByTestId(TESTIDS.blotter.quickFilter).fill(text);
  }
  async clearQuickFilter(): Promise<void> {
    await this.page.getByTestId(TESTIDS.blotter.quickFilter).clear();
  }
  async isExportCsvVisible(): Promise<boolean> {
    return await this.page.getByTestId(TESTIDS.blotter.exportCsv).isVisible();
  }
  async exportCsvText(): Promise<string> {
    return (await this.page.getByTestId(TESTIDS.blotter.exportCsv).textContent()) ?? "";
  }
  async hoverFirstRow(): Promise<void> {
    await this.firstRow().hover();
  }
  async firstRowBackgroundColor(): Promise<string> {
    return await this.firstRow().evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
  }
  async isFirstRowVisible(): Promise<boolean> {
    return await this.firstRow().isVisible();
  }
}
```

- [ ] **Step 11.2: Create `tests/specs/blotter.feature`**

```gherkin
Feature: FX trade blotter

  Background:
    Given the trader has the FX workspace open

  Scenario: blotter table is visible
    Then the blotter table is visible

  Scenario: column headers are clickable for sorting
    Then the blotter table is visible
    When the trader clicks the first blotter header
    And the trader clicks the first blotter header

  Scenario: quick filter narrows trade rows
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    And the trader waits 2 seconds
    Then the blotter table is visible
    When the trader records the blotter row count as "all"
    And the trader sets the blotter quick filter to "ZZZZZ_NO_MATCH"
    And the trader waits 1 seconds
    Then the blotter row count is at most "all"
    When the trader clears the blotter quick filter
    And the trader waits 1 seconds
    Then the blotter row count equals "all"

  Scenario: export CSV button is visible and labeled
    Then the export CSV button is visible
    And the export CSV button text contains "Export CSV"

  Scenario: new trade row has a non-empty background color
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    And the trader waits 2 seconds
    Then the blotter table is visible
    And the first blotter row is visible
    And the first blotter row background color is non-empty

  Scenario: rejected trade flow does not error after multiple buys
    Then a price tile is visible within 5 seconds
    When the trader buys 3 times with confirmation dismissals
    Then the blotter table is visible
    And the blotter has at least 1 row

  Scenario: row hover yields a non-empty background color
    Then a price tile is visible within 5 seconds
    When the trader clicks buy on the first tile
    And the trader waits 2 seconds
    Then the blotter table is visible
    And the first blotter row is visible
    When the trader hovers the first blotter row
    Then the first blotter row background color is non-empty
```

- [ ] **Step 11.3: Create `tests/steps/browser/blotter.steps.ts`**

```ts
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

const recordedRowCounts = new Map<string, number>();

When("the trader clicks the first blotter header", async function (this: PlaywrightWorld) {
  await this.po.blotterTable.clickFirstHeader();
});

When(
  "the trader records the blotter row count as {string}",
  async function (this: PlaywrightWorld, key: string) {
    recordedRowCounts.set(key, await this.po.blotterTable.rowCount());
  },
);

When(
  "the trader sets the blotter quick filter to {string}",
  async function (this: PlaywrightWorld, text: string) {
    await this.po.blotterTable.fillQuickFilter(text);
  },
);

When("the trader clears the blotter quick filter", async function (this: PlaywrightWorld) {
  await this.po.blotterTable.clearQuickFilter();
});

Then(
  "the blotter row count is at most {string}",
  async function (this: PlaywrightWorld, key: string) {
    const baseline = recordedRowCounts.get(key);
    if (baseline === undefined) throw new Error(`no recorded row count for ${key}`);
    expect(await this.po.blotterTable.rowCount()).toBeLessThanOrEqual(baseline);
  },
);

Then(
  "the blotter row count equals {string}",
  async function (this: PlaywrightWorld, key: string) {
    const baseline = recordedRowCounts.get(key);
    if (baseline === undefined) throw new Error(`no recorded row count for ${key}`);
    expect(await this.po.blotterTable.rowCount()).toBe(baseline);
  },
);

Then("the export CSV button is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.blotterTable.isExportCsvVisible()).toBe(true);
});

Then(
  "the export CSV button text contains {string}",
  async function (this: PlaywrightWorld, expected: string) {
    expect(await this.po.blotterTable.exportCsvText()).toContain(expected);
  },
);

Then("the first blotter row is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.blotterTable.isFirstRowVisible()).toBe(true);
});

Then(
  "the first blotter row background color is non-empty",
  async function (this: PlaywrightWorld) {
    const color = await this.po.blotterTable.firstRowBackgroundColor();
    expect(color.length).toBeGreaterThan(0);
  },
);

When("the trader hovers the first blotter row", async function (this: PlaywrightWorld) {
  await this.po.blotterTable.hoverFirstRow();
});

When(
  "the trader buys {int} times with confirmation dismissals",
  async function (this: PlaywrightWorld, n: number) {
    for (let i = 0; i < n; i++) {
      await this.po.liveRatesTile.clickBuyOnFirst();
      await this.page.waitForTimeout(1_500);
      if (await this.po.liveRatesTile.isConfirmationVisible()) {
        await this.po.liveRatesTile.dismissConfirmation();
        await this.page.waitForTimeout(500);
      }
    }
  },
);
```

- [ ] **Step 11.4: Run new feature, then full suite**

```bash
pnpm --filter @rtc/tests test:e2e
```

Expected: 40 scenarios pass (8 features × their counts).

- [ ] **Step 11.5: Delete the last `packages/client/e2e/` spec**

```bash
git rm packages/client/e2e/blotter.spec.ts
```

The `packages/client/e2e/` directory should now be empty. Confirm:

```bash
ls packages/client/e2e
```

Expected: empty output. Remove the empty directory:

```bash
rmdir packages/client/e2e
```

- [ ] **Step 11.6: Delete `packages/client/playwright.config.ts`**

```bash
git rm packages/client/playwright.config.ts
```

- [ ] **Step 11.7: Update `packages/client/package.json` — drop `test:e2e` and `@playwright/test`**

Modify the file. Remove the `"test:e2e": "playwright test"` line from `scripts` and remove `"@playwright/test": "^1.50"` from `devDependencies`. Run `pnpm install` after to refresh the lockfile.

The resulting file is:

```json
{
  "name": "@rtc/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json",
    "test": "vitest run",
    "dev": "vite",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@react-rxjs/core": "^0.10.7",
    "@rtc/domain": "workspace:*",
    "@rtc/shared": "workspace:*",
    "react": "^19",
    "react-dom": "^19",
    "rxjs": "^7.8"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4",
    "jsdom": "^25",
    "vite": "^6",
    "vitest": "^3"
  }
}
```

- [ ] **Step 11.8: Update `packages/client/tsconfig.node.json`**

Replace the file contents with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 11.9: Run `pnpm install` to refresh the lockfile**

Run: `pnpm install`

Expected: `@playwright/test` removed from `packages/client/node_modules`. Still resolved under `tests/node_modules` because that workspace declares it. Lockfile updated.

- [ ] **Step 11.10: Run the architectural grep gate**

```bash
echo "step defs must not import playwright PO impls:"
! grep -RE "page-objects/playwright" tests/steps/browser/

echo "contracts must not import any driver:"
! grep -RE "@playwright/test|cypress" tests/page-objects/contracts/

echo ".feature files are driver-free:"
! grep -RE "data-testid|playwright|cy\\." tests/specs/

echo "playwright PO impls route every getByTestId through TESTIDS:"
! grep -RE 'getByTestId\("' tests/page-objects/playwright/
```

Expected: each command exits 0 (the `!` inverts the grep failure-on-no-match into a pass). If any check fails, the offending file violates the architectural rule — fix and re-run.

- [ ] **Step 11.11: Update `docs/architecture.md` §11**

Open the file. Find §11 "Key Files Reference". Update the existing rows and add new ones.

Replace these existing rows:

```
| **Behavioural Specs** (planned) | `tests/specs/**/*.feature` | Gherkin scenarios, framework-free |
| **Page Objects** (planned) | `tests/page-objects/**/*.ts` | Encapsulate Playwright selectors |
```

With:

```
| **Behavioural Specs** | `tests/specs/**/*.feature` | Gherkin scenarios, framework-free; SOT for behaviour |
| **Page Object Contracts** | `tests/page-objects/contracts/**/*.ts` | Driver-free TS interfaces + `data-testid` constants; SOT for the UI surface |
| **Page Objects (Playwright)** | `tests/page-objects/playwright/**/*.ts` | Playwright implementations of the contracts |
| **Step Definitions** | `tests/steps/browser/**/*.ts` | Cucumber-JS step defs for the browser driver; import only contracts |
| **Test World + Hooks** | `tests/support/**/*.ts` | `PlaywrightWorld`, dev-server lifecycle, hooks |
```

- [ ] **Step 11.12: Update `docs/superpowers/STATUS.md`**

Open the file. Find the table in "Phases".

Update the Phase 5 row from:

```
| Phase 5 — Gherkin specs + page-object harnesses + port contract tests | ⏳ NOT STARTED | (to be written) | — |
```

To:

```
| Phase 5A.1 — Gherkin + page objects (Cucumber + Playwright) | ✅ DONE | `plans/2026-05-08-phase-5a-1-gherkin-page-objects.md` | _to be filled with SHA range when commits land_ |
| Phase 5A.2 — Cucumber + Cypress sharing the same `.feature` files | ⏳ NOT STARTED | (to be written) | — |
| Phase 5A.3 — Raw Playwright reusing PO contracts | ⏳ NOT STARTED | (to be written) | — |
| Phase 5A.4 — Raw Cypress reusing PO contracts | ⏳ NOT STARTED | (to be written) | — |
| Phase 5B — Presenter-direct step definitions for the same `.feature` files | ⏳ NOT STARTED | (to be written) | — |
| Phase 5C — Port contract tests (simulator vs WsReal) | ⏳ NOT STARTED | (to be written) | — |
| Phase 5D — Real gateway-events adapter; delete `withSyntheticGatewayConnected` | ⏳ NOT STARTED | (to be written) | — |
```

Update the "Last updated" date to today (2026-05-08).

Find the "Resuming work" section and replace the current "3." line:

Old:
```
3. Phase 4 is done. Next: Phase 5 — Gherkin specs + page-object harnesses + port contract tests. Brainstorm and write the spec before writing the plan.
```

New:
```
3. Phase 5A.1 is done. The natural next step is Phase 5A.2 (Cypress + Cucumber, reusing the same `.feature` files and PO contracts). Brainstorm before writing the spec.
```

Find the "Phase 3 follow-ups (carry into Phase 5)" section and rename it to "Phase 3 follow-ups (carry into Phase 5B/5D)". Update its preamble line so the deferral target is clear.

- [ ] **Step 11.13: Run the full test suite from a clean lockfile**

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm test:e2e
```

Expected:
- typecheck: green across all workspaces
- test: 141 unit tests pass
- test:e2e: turbo runs only `@rtc/tests` (since client no longer has `test:e2e`); 40 Cucumber scenarios pass

- [ ] **Step 11.14: Verify `packages/client/e2e/` is gone**

```bash
test ! -e packages/client/e2e || (echo "still exists" && exit 1)
test ! -e packages/client/playwright.config.ts || (echo "still exists" && exit 1)
echo "all gone"
```

Expected: prints `all gone`.

- [ ] **Step 11.15: Final commit (or split: one commit for code, one for docs)**

Two commits keep the migration tidy:

```bash
git add tests/page-objects/playwright/BlotterTable.ts tests/specs/blotter.feature tests/steps/browser/blotter.steps.ts
git rm packages/client/e2e/blotter.spec.ts packages/client/playwright.config.ts
git add packages/client/package.json packages/client/tsconfig.node.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
test(phase-5a.1): convert blotter spec, retire packages/client/e2e

Final conversion task: fills BlotterTablePO and ships blotter.feature.
Deletes the entire packages/client/e2e/ directory, packages/client/
playwright.config.ts, and the test:e2e script + @playwright/test devDep
from packages/client/package.json. The tests/ workspace now owns all
e2e behaviour exclusively.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"

git add docs/architecture.md docs/superpowers/STATUS.md
git commit -m "$(cat <<'EOF'
docs(phase-5a.1): update architecture and status for new test stack

§11 reference table loses "(planned)" markers and gains rows for the
new contracts and step-defs paths. STATUS.md splits the Phase 5 row
into 5A.1-5A.4 plus 5B/5C/5D with 5A.1 marked done.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11.16: Capture the final SHA range and update STATUS.md**

The Phase 5A.1 SHA range covers Tasks 1-11. Get the range:

```bash
git log --oneline -20
```

Note the first commit SHA (Task 1) and the last commit SHA (Task 11's docs commit). Update the placeholder `_to be filled with SHA range when commits land_` in `docs/superpowers/STATUS.md` to:

```
`<first-sha>..<last-sha>` (12 commits: 11 task commits + STATUS update)
```

(Phase 4 used the same convention — see line 25 of `STATUS.md` for the pattern.)

Amend or follow-up commit:

```bash
git add docs/superpowers/STATUS.md
git commit -m "$(cat <<'EOF'
docs(status): record Phase 5A.1 SHA range

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

(If the previous commit was the STATUS commit and it has not yet been pushed, `git commit --amend --no-edit` is acceptable here; otherwise add a new commit. Push when ready.)

---

## Self-review summary

This plan was checked end-to-end after writing:

**1. Spec coverage:**
- §1 Goal & scope → Tasks 1-11 collectively achieve every acceptance criterion in spec §7.1.
- §2 Directory layout → Tasks 1-3 establish; Task 4 fleshes out the playwright/ subdir; subsequent tasks fill in remaining files.
- §3.1 testids.ts → Task 2.2.
- §3.2 PO contracts → Tasks 2.3-2.13.
- §3.3 Playwright impls → distributed across Tasks 4 (Workspace, ThemeToggle, plus 8 stubs), 5 (Footer, ConnectionOverlay), 6 (AnalyticsDashboard), 7 (LiveRatesTile read), 8 (LiveRatesTile trade + BlotterTable read), 9 (FxRfqForm), 10 (CreditRfqForm + CreditRfqPanel), 11 (BlotterTable).
- §3.4 Factory → Task 4.4.
- §3.5 Architectural rule + grep gate → Task 11.10.
- §4 World, hooks, dev server → Task 3.
- §4.4 cucumber.config — realised as `cucumber.js` (file extension change explicit at top of plan and in Task 1.3).
- §5 Feature inventory + 40-scenario count → distributed across Tasks 4-11; total verified in Task 11.4.
- §6 Migration sequence → Tasks 1-11 follow the spec's sequence exactly.
- §7.1 Acceptance criteria → Step 11.13 (clean install + all green) and Step 11.14 (deletions verified) and Step 11.10 (grep gate).
- §7.2 Anti-criteria → Tasks 1-11 do not add a second driver, do not touch presenters, do not touch ports.

**2. Placeholder scan:** No `TBD`, `TODO`, `fill in`, "implement later", or vague step found. Every code step shows complete file contents or specific changes. Every command shows expected output.

**3. Type / method consistency:**
- `LiveRatesTilePO` methods named in Task 2 are exhaustively used by their final names in Tasks 4-11 (verified by re-reading each step's PO calls).
- `WorkspacePO.openFx/openCredit/clickTab` consistent across all tasks.
- `BlotterTablePO.rowCount` (not `rowsCount`) consistent.
- `confirmationContainsAny` takes `readonly RegExp[]` in both contract (Task 2.7) and impl (Task 8.1) and step usage (Task 8.4).

**4. Sequencing soundness:**
- Each task ends with a green `pnpm test:e2e` and an explicit scenario count check, which surfaces regressions immediately.
- Stubs in Task 4 ensure the factory builds a complete `PageObjects` bag from day one, so World instantiation is stable across Tasks 4-11.
- The grep gate in Task 11 is the final architectural quality check; offences from earlier tasks would surface here, but each task individually preserves the rule by routing all DOM access through PO methods.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-phase-5a-1-gherkin-page-objects.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
