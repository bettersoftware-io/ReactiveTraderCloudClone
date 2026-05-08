# Phase 5A.1 — Gherkin specs + page objects (Cucumber + Playwright)

**Status:** Design approved 2026-05-08.
**Authoring context:** Phase 4 (`app/` + `ui/` reorg) shipped on `main` at SHA `e3777cc` (last commit). Working tree clean except `.claude/settings.local.json`.
**Predecessor doc:** `docs/superpowers/STATUS.md` Phase 5 row.

---

## 1. Goal and scope

Convert the existing 8 Playwright `*.spec.ts` files in `packages/client/e2e/` into a layered behavioural-test stack — Gherkin `.feature` files (driver-free) → Cucumber-JS step definitions (browser-driver-aware) → page objects (Playwright selectors). After Phase 5A.1:

- `tests/specs/**/*.feature` is the **single source of truth** for behaviour.
- `tests/page-objects/contracts/**/*.ts` is the **single source of truth** for the UI surface (interfaces and `data-testid` constants).
- `tests/page-objects/playwright/**/*.ts` is the only place that imports `@playwright/test` for selector work.
- `tests/steps/browser/**/*.ts` maps Gherkin steps to PO calls and only ever imports from `tests/page-objects/contracts/`.
- `packages/client/e2e/` is **deleted**. `packages/client/playwright.config.ts` is **deleted**. The `pnpm test:e2e` script delegates to `pnpm --filter @rtc/tests test`.

The directory and contract layout is designed to host a 2×2 matrix of follow-up sub-phases without restructuring:

|              | Gherkin (`.feature`)                  | Raw (test/it blocks)               |
|--------------|---------------------------------------|------------------------------------|
| **Playwright** | **5A.1** (this spec)                | 5A.3 (deferred)                    |
| **Cypress**    | 5A.2 (deferred)                     | 5A.4 (deferred)                    |

PO contracts and `testids.ts` are shared by all four future stacks; `.feature` files are shared by 5A.1 + 5A.2; raw specs in 5A.3 + 5A.4 will live under `tests/raw/{playwright,cypress}/` and consume the same PO contracts.

**Out of scope, explicitly deferred:**

- **5A.2** — Cucumber + Cypress (same `.feature` files, Cypress PO impls).
- **5A.3** — Raw Playwright specs reusing PO contracts.
- **5A.4** — Raw Cypress specs reusing PO contracts.
- **Phase 5B** — Presenter-direct step definitions (`PresenterWorld`, `steps/presenter/**`). Naturally absorbs the deferred presenter test-depth work (5E) because the presenter-direct driver re-exercises presenter contracts end-to-end.
- **Phase 5C** — Port contract tests parameterised over simulator + WsReal adapters.
- **Phase 5D** — Real gateway-events adapter; deletion of `withSyntheticGatewayConnected`.

---

## 2. Directory layout and workspace

A new top-level `tests/` workspace, peer to `packages/`:

```
tests/
  package.json                  # @rtc/tests; private; listed in pnpm-workspace.yaml
  tsconfig.json                 # extends repo tsconfig, bundler resolution
  cucumber.config.ts            # paths, parallel, formats, requireModule
  specs/                        # Gherkin .feature files. Shared by 5A.1 + 5A.2.
    fxLiveRates.feature
    fxRfq.feature
    fxTrading.feature
    creditRfq.feature
    blotter.feature
    analytics.feature
    connection.feature
    theme.feature
  page-objects/
    contracts/                  # Driver-free TS interfaces + selector constants. Shared by all 4 stacks.
      LiveRatesTile.ts
      FxRfqForm.ts
      BlotterTable.ts
      AnalyticsDashboard.ts
      CreditRfqForm.ts
      CreditRfqPanel.ts
      ConnectionOverlay.ts
      Footer.ts
      ThemeToggle.ts
      Workspace.ts
      testids.ts                # SOT for data-testid strings
      index.ts                  # barrel export
    playwright/                 # Playwright impls of the contracts. Imports @playwright/test.
      LiveRatesTile.ts
      FxRfqForm.ts
      BlotterTable.ts
      AnalyticsDashboard.ts
      CreditRfqForm.ts
      CreditRfqPanel.ts
      ConnectionOverlay.ts
      Footer.ts
      ThemeToggle.ts
      Workspace.ts
      factory.ts                # buildPlaywrightPageObjects(page) -> PageObjects bag
    cypress/                    # 5A.2 deliverable; .gitkeep only in 5A.1.
      .gitkeep
  steps/
    browser/                    # Cucumber step defs. Import only from page-objects/contracts/.
      common.steps.ts
      fxLiveRates.steps.ts
      fxRfq.steps.ts
      fxTrading.steps.ts
      creditRfq.steps.ts
      blotter.steps.ts
      analytics.steps.ts
      connection.steps.ts
      theme.steps.ts
    cypress/                    # 5A.2 deliverable; .gitkeep only in 5A.1.
      .gitkeep
  raw/                          # 5A.3 + 5A.4 deliverables; .gitkeep only in 5A.1.
    playwright/.gitkeep
    cypress/.gitkeep
  support/
    world.ts                    # PlaywrightWorld extends World; owns context, page, PO bag.
    hooks.ts                    # BeforeAll/AfterAll lifecycle.
    devServer.ts                # Spawns/kills `pnpm --filter @rtc/client dev`.
  reports/                      # gitignored; cucumber HTML report goes here.
```

`pnpm-workspace.yaml` gains one line: `- "tests"`.

**`tests/package.json` dependencies in 5A.1:**

- `@cucumber/cucumber`
- `@playwright/test` (for `chromium`, `expect`, `Page`, `BrowserContext` types)
- `tsx` (ESM TypeScript loader for Cucumber's `requireModule`)
- dev: `typescript`, `@types/node`

`cypress` is **not** added until 5A.2. `@rtc/client` is **not** a dep — the dev server is spawned via `pnpm --filter @rtc/client dev`, not via a JS import.

**Run scripts and turbo behaviour:**

- The repo's `package.json:scripts.test:e2e` is `turbo run test:e2e`, which runs the `test:e2e` script in **every workspace that defines one**. Today only `packages/client` defines it (running `playwright test`).
- Task 1 adds `tests/package.json:scripts.test:e2e` running `cucumber-js`. Both the client (Playwright) and the new tests (Cucumber) workspaces have `test:e2e` for the duration of the migration.
- During migration (Tasks 4–10), `pnpm test:e2e` runs **both** runners. Each conversion task deletes one `*.spec.ts` and ships its `.feature` replacement, so the total scenario count stays at 40 across the two runners.
- Task 11 deletes `packages/client/e2e/`, deletes `packages/client/playwright.config.ts`, and removes the `test:e2e` script from `packages/client/package.json`. From then on, only the `tests/` workspace responds to `turbo run test:e2e`.
- The dev server is started by `BeforeAll` in `tests/support/hooks.ts` (it reuses an external dev server if `:3000` is already up). One command, no manual setup.
- `turbo.json`'s `test:e2e` task already declares `dependsOn: ["build"]`. The `tests` workspace has no `build` script; turbo skips the dependency for it. No `turbo.json` change required.

---

## 3. Page-object contracts and Playwright implementation

### 3.1 Selector constants — `page-objects/contracts/testids.ts`

Single source of truth for every `data-testid` the UI exposes. Every PO impl (Playwright today, Cypress in 5A.2) reads from this file. No string literal `data-testid` is allowed elsewhere in `tests/`.

```ts
export const TESTIDS = {
  connection: { status: "connection-status", overlay: "connection-overlay" },
  liveRates:  {
    tile: (pair: string) => `tile-${pair}`,
    bid: "tile-bid", ask: "tile-ask", spread: "tile-spread",
    buyBtn: "tile-buy", sellBtn: "tile-sell",
    notional: "tile-notional", tradeStatus: "trade-status",
    // ... extended during the audit (Task 2)
  },
  blotter:    { table: "blotter-table", row: (id: number) => `trade-row-${id}` /* ... */ },
  analytics:  { pnl: "analytics-pnl", positions: "analytics-positions" /* ... */ },
  // ... one block per UI region
} as const;
```

The actual contents are derived from a one-time audit of `data-testid`s in `packages/client/src/ui/**/*.tsx` during Task 2. Each conversion task may add a single new ID with a minimal one-line component edit if absolutely required by a translated scenario; such adds are flagged in the commit message.

### 3.2 PO contract interfaces — `page-objects/contracts/<Name>.ts`

Driver-free TypeScript interfaces, methods named by **business intent** rather than UI action. All methods return `Promise<T>` so the same shape works for Playwright (real Promises) and for the future Cypress impl (wrap `Cypress.Chainable` via `.then()`).

Example shapes:

```ts
// page-objects/contracts/LiveRatesTile.ts
export interface LiveRatesTilePO {
  waitForPrice(pair: string): Promise<void>;
  bid(pair: string): Promise<string>;
  ask(pair: string): Promise<string>;
  spread(pair: string): Promise<string>;
  setNotional(pair: string, value: string): Promise<void>;
  buy(pair: string): Promise<void>;
  sell(pair: string): Promise<void>;
  lastTradeStatus(pair: string): Promise<string>;
  isInRfqMode(pair: string): Promise<boolean>;
  initiateRfq(pair: string): Promise<void>;
  countdownVisible(pair: string): Promise<boolean>;
}

// page-objects/contracts/Workspace.ts
export interface WorkspacePO {
  openFx(): Promise<void>;
  openCredit(): Promise<void>;
  switchToTab(name: string): Promise<void>;
  visibleTabs(): Promise<readonly string[]>;
}

// page-objects/contracts/Footer.ts
export interface FooterPO {
  connectionLabel(): Promise<string>;
}

// page-objects/contracts/ConnectionOverlay.ts
export interface ConnectionOverlayPO {
  isVisible(): Promise<boolean>;
  message(): Promise<string>;
  waitUntilHidden(timeoutMs: number): Promise<void>;
}
// ... one file per PO
```

The **PO bag** (the type the World holds and step defs consume) lives in `contracts/index.ts`:

```ts
export interface PageObjects {
  workspace:        WorkspacePO;
  liveRatesTile:    LiveRatesTilePO;
  fxRfqForm:        FxRfqFormPO;
  blotter:          BlotterTablePO;
  analytics:        AnalyticsDashboardPO;
  creditRfqForm:    CreditRfqFormPO;
  creditRfqPanel:   CreditRfqPanelPO;
  connectionOverlay: ConnectionOverlayPO;
  footer:           FooterPO;
  themeToggle:      ThemeTogglePO;
}
```

### 3.3 Playwright implementation — `page-objects/playwright/<Name>.ts`

One class per contract, importing only `@playwright/test`'s browser-side types and the selector constants:

```ts
// page-objects/playwright/LiveRatesTile.ts
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { LiveRatesTilePO } from "../contracts/LiveRatesTile";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightLiveRatesTile implements LiveRatesTilePO {
  constructor(private readonly page: Page) {}

  private tile(pair: string) {
    return this.page.getByTestId(TESTIDS.liveRates.tile(pair));
  }
  async waitForPrice(pair: string) {
    await expect(this.tile(pair).getByTestId(TESTIDS.liveRates.bid)).not.toBeEmpty();
  }
  async bid(pair: string) {
    return (await this.tile(pair).getByTestId(TESTIDS.liveRates.bid).textContent()) ?? "";
  }
  // ... etc.
}
```

### 3.4 Factory — `page-objects/playwright/factory.ts`

```ts
import type { Page } from "@playwright/test";
import type { PageObjects } from "../contracts";
import { PlaywrightWorkspace } from "./Workspace";
import { PlaywrightLiveRatesTile } from "./LiveRatesTile";
// ...

export function buildPlaywrightPageObjects(page: Page): PageObjects {
  return {
    workspace:        new PlaywrightWorkspace(page),
    liveRatesTile:    new PlaywrightLiveRatesTile(page),
    fxRfqForm:        new PlaywrightFxRfqForm(page),
    blotter:          new PlaywrightBlotterTable(page),
    analytics:        new PlaywrightAnalyticsDashboard(page),
    creditRfqForm:    new PlaywrightCreditRfqForm(page),
    creditRfqPanel:   new PlaywrightCreditRfqPanel(page),
    connectionOverlay: new PlaywrightConnectionOverlay(page),
    footer:           new PlaywrightFooter(page),
    themeToggle:      new PlaywrightThemeToggle(page),
  };
}
```

### 3.5 Architectural rule (enforced by review and a grep gate in Task 11)

- `tests/specs/**/*.feature` — never references selectors, IDs, or framework names.
- `tests/steps/browser/**/*.ts` — imports only from `tests/page-objects/contracts/` and from `@cucumber/cucumber`. **Never imports `@playwright/test` and never imports `tests/page-objects/playwright/`** (except inside the World file).
- `tests/page-objects/contracts/**/*.ts` — pure TS, zero driver imports, zero `import type` from `@playwright/test`.
- `tests/page-objects/playwright/**/*.ts` — imports `@playwright/test` and the contract; nothing else.
- `tests/support/world.ts` is the single seam where the contracts and the Playwright impls meet.

A grep gate runs in Task 11 and on CI:

```bash
# Step defs must not import @playwright/test or playwright PO impls
! grep -RE "@playwright/test|page-objects/playwright" tests/steps/browser/

# Contracts must not import @playwright/test or any driver
! grep -RE "@playwright/test|cypress" tests/page-objects/contracts/

# .feature files must not contain testid or playwright references
! grep -RE "data-testid|playwright|cy\\." tests/specs/

# Playwright PO impls must route every getByTestId through the TESTIDS constants
! grep -RE 'getByTestId\("' tests/page-objects/playwright/
```

---

## 4. World, hooks, and dev-server lifecycle

### 4.1 The World — `support/world.ts`

```ts
import { setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import { type Browser, type BrowserContext, type Page } from "@playwright/test";
import { buildPlaywrightPageObjects } from "../page-objects/playwright/factory";
import type { PageObjects } from "../page-objects/contracts";

export class PlaywrightWorld extends World {
  context!: BrowserContext;
  page!: Page;
  po!: PageObjects;

  constructor(options: IWorldOptions) { super(options); }

  async open(browser: Browser) {
    this.context = await browser.newContext({ baseURL: "http://localhost:3000" });
    this.page = await this.context.newPage();
    this.po = buildPlaywrightPageObjects(this.page);
  }
  async close() { await this.context.close(); }
}

setWorldConstructor(PlaywrightWorld);
```

Step defs reach for `this.po.<region>.<intent>(...)`, never `this.page.getByTestId(...)`.

### 4.2 Hooks — `support/hooks.ts`

```ts
import { BeforeAll, AfterAll, Before, After } from "@cucumber/cucumber";
import { chromium, type Browser } from "@playwright/test";
import { startDevServer, type DevServerHandle } from "./devServer";
import type { PlaywrightWorld } from "./world";

let browser: Browser;
let dev: DevServerHandle;

BeforeAll({ timeout: 60_000 }, async () => {
  dev = await startDevServer();
  browser = await chromium.launch();
});
AfterAll(async () => {
  await browser?.close();
  await dev?.stop();
});
Before(async function (this: PlaywrightWorld) { await this.open(browser); });
After (async function (this: PlaywrightWorld) { await this.close(); });
```

### 4.3 Dev-server lifecycle — `support/devServer.ts`

Mirrors Playwright's `webServer`: reuse if already up, otherwise spawn and tear down.

```ts
import { spawn, type ChildProcess } from "node:child_process";

export interface DevServerHandle { stop(): Promise<void> }

async function pingPort(port: number): Promise<boolean> {
  try { await fetch(`http://localhost:${port}`, { method: "HEAD" }); return true; }
  catch { return false; }
}
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pingPort(port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`dev server on :${port} not reachable`);
}
export async function startDevServer(): Promise<DevServerHandle> {
  if (await pingPort(3000)) return { stop: async () => {} };
  const child: ChildProcess = spawn("pnpm", ["--filter", "@rtc/client", "dev"], {
    stdio: "ignore", detached: false,
  });
  await waitForPort(3000, 30_000);
  return { stop: async () => { child.kill("SIGTERM"); } };
}
```

### 4.4 `cucumber.config.ts`

```ts
export default {
  default: {
    paths: ["specs/**/*.feature"],
    require: ["support/**/*.ts", "steps/browser/**/*.ts"],
    requireModule: ["tsx/esm"],
    format: ["progress-bar", "html:reports/cucumber.html", "summary"],
    parallel: process.env.CI ? 1 : 2,
    retry: process.env.CI ? 2 : 0,
    publishQuiet: true,
  },
};
```

Parallelism mirrors today's Playwright config (`workers: process.env.CI ? 1 : undefined`). Each worker instantiates its own `PlaywrightWorld` and own `BrowserContext`, so cookie/storage isolation is preserved.

### 4.5 Trace and report parity

5A.1 emits Cucumber's built-in HTML formatter output at `tests/reports/cucumber.html` (the path is gitignored). No additional reporter package is added — the `html:` formatter is bundled with `@cucumber/cucumber`. Playwright traces (`trace: "on-first-retry"`) are intentionally **not** ported — gold-plating. If a flake appears, add `BrowserContext.tracing.start({ snapshots: true, screenshots: true })` in a retry-aware `Before` hook in a follow-up PR.

---

## 5. Feature file inventory

40 scenarios across 8 features (matches today's count). Each existing `test()` block maps to one Scenario; shared setup becomes a `Background`. Each `.spec.ts` becomes exactly one `.feature` file:

| Feature file              | Source `.spec.ts`         | Scenarios | Page objects used                            |
|---------------------------|---------------------------|----------:|-----------------------------------------------|
| `theme.feature`           | `theme.spec.ts`           |        5 | `Workspace`, `ThemeToggle`                    |
| `connection.feature`      | `connection.spec.ts`      |        4 | `Workspace`, `Footer`, `ConnectionOverlay`    |
| `analytics.feature`       | `analytics.spec.ts`       |        4 | `Workspace`, `AnalyticsDashboard`, `LiveRatesTile` |
| `fxRfq.feature`           | `fxRfq.spec.ts`           |        2 | `Workspace`, `LiveRatesTile`, `FxRfqForm`     |
| `fxTrading.feature`       | `fxTrading.spec.ts`       |        5 | `Workspace`, `LiveRatesTile`, `BlotterTable`  |
| `fxLiveRates.feature`     | `fxLiveRates.spec.ts`     |        6 | `Workspace`, `LiveRatesTile`                  |
| `creditRfq.feature`       | `creditRfq.spec.ts`       |        7 | `Workspace`, `CreditRfqForm`, `CreditRfqPanel` |
| `blotter.feature`         | `blotter.spec.ts`         |        7 | `Workspace`, `BlotterTable`, `LiveRatesTile`  |

Existing scenario count by file (from `grep -c '^\s*test('` on the existing specs):

- `theme.spec.ts`: 5
- `connection.spec.ts`: 4
- `analytics.spec.ts`: 4
- `fxRfq.spec.ts`: 2
- `fxTrading.spec.ts`: 5
- `fxLiveRates.spec.ts`: 6
- `creditRfq.spec.ts`: 7
- `blotter.spec.ts`: 7

Total: **40 scenarios**.

### 5.1 Authoring conventions

- `Background` for cross-scenario setup (most commonly: `Given the trader has the FX workspace open`).
- `Scenario Outline` only when the existing test literally repeats logic per parameter (e.g. checking each pair). Don't manufacture parameterisation that today's test doesn't have.
- Steps are written in **business intent**, not UI mechanics. "When the trader buys 1 million EURUSD" — not "When the trader clicks the buy button". Keeps `.feature` files survivable across UI rewrites and reusable by 5B's presenter-direct steps.
- **No selectors, IDs, or framework names appear in `.feature` files.** If a phrase forces them in, refactor the step before the file.

### 5.2 Common steps — `steps/browser/common.steps.ts`

Recurring openings live in one file:

```ts
Given("the trader has the FX workspace open", async function (this: PlaywrightWorld) {
  await this.po.workspace.openFx();
});
Given("the credit workspace is open", async function (this: PlaywrightWorld) {
  await this.po.workspace.openCredit();
});
Given("the analytics panel is visible", async function (this: PlaywrightWorld) {
  await this.po.workspace.openFx();   // analytics is shown alongside FX live rates
});
```

`po.workspace.openFx()` internally does `await this.page.goto("/")` plus any tab clicking required.

---

## 6. Migration sequence

Eleven tasks, each a small commit. Pattern: scaffold first, prove with the simplest spec, then convert in ascending complexity. Every task ends green on `pnpm typecheck && pnpm test:e2e`. No task touches more than ~6 files.

| #  | Task | What ships | Files touched |
|---:|---|---|---|
| 1  | **Scaffold `tests/` workspace.** Add `tests/package.json` (with `"type": "module"`, deps from §2, `scripts.test:e2e: "cucumber-js"`), `tests/tsconfig.json`, `tests/cucumber.config.ts`, empty subdirs. Add `- "tests"` to `pnpm-workspace.yaml`. `pnpm install` succeeds. `pnpm --filter @rtc/tests test:e2e` exits 0 with "0 scenarios". `turbo run test:e2e` still passes (client's playwright tests still run; new workspace contributes 0 scenarios). | New workspace, no tests | `tests/**`, `pnpm-workspace.yaml` |
| 2  | **PO contract skeletons + `testids.ts`.** Audit `data-testid` strings in `packages/client/src/ui/**/*.tsx` (record actuals, do not add or rename). Write all 10 contract interfaces (signatures only, no impls). Write `testids.ts` and `contracts/index.ts`. `pnpm typecheck` green. | Contracts compile | `tests/page-objects/contracts/**` |
| 3  | **World + hooks + dev-server.** `support/world.ts`, `support/hooks.ts`, `support/devServer.ts`. One smoke step `Given a sanity check runs` and a one-scenario `_sanity.feature` that asserts `page.goto("/")` returns. `pnpm test:e2e` runs cucumber, hits the dev server, exits green. | First green Cucumber run | `tests/support/**`, `tests/specs/_sanity.feature`, `tests/steps/browser/sanity.steps.ts` |
| 4  | **Convert `theme.spec.ts` → `theme.feature`.** Smallest, lowest risk. Implement `PlaywrightThemeToggle` + `PlaywrightWorkspace`. Wire factory. Write `theme.feature` (5 scenarios), `theme.steps.ts`, `common.steps.ts`. **Delete `packages/client/e2e/theme.spec.ts`** (client's `playwright test` now runs 7 specs / 35 scenarios). Delete `_sanity.feature`. The `tests/` workspace runs `theme.feature` (5 scenarios). Total e2e scenario count under `turbo run test:e2e` stays at 40, split across two runners. **Do not** modify `packages/client/package.json:scripts.test:e2e` yet — it stays for the remaining conversions. | First feature live | `tests/specs/theme.feature`, `tests/steps/browser/{theme,common}.steps.ts`, `tests/page-objects/playwright/{ThemeToggle,Workspace}.ts`, `tests/page-objects/playwright/factory.ts`, `packages/client/e2e/theme.spec.ts` (deleted), `tests/specs/_sanity.feature` (deleted), `tests/steps/browser/sanity.steps.ts` (deleted) |
| 5  | **Convert `connection.spec.ts` → `connection.feature`.** `PlaywrightFooter` + `PlaywrightConnectionOverlay`. `connection.steps.ts`. `context.setOffline(true/false)` is invoked from a step (in browser steps file, not in any PO — network state isn't UI). Delete old. | 2/8 features live | `tests/specs/connection.feature`, `tests/steps/browser/connection.steps.ts`, `tests/page-objects/playwright/{Footer,ConnectionOverlay}.ts`, `packages/client/e2e/connection.spec.ts` (deleted) |
| 6  | **Convert `analytics.spec.ts` → `analytics.feature`.** `PlaywrightAnalyticsDashboard`. Read-only methods of `LiveRatesTile` (early bring-up; trading methods land in #8). | 3/8 | `tests/specs/analytics.feature`, `analytics.steps.ts`, `playwright/AnalyticsDashboard.ts`, partial `playwright/LiveRatesTile.ts`, `packages/client/e2e/analytics.spec.ts` (deleted) |
| 7  | **Convert `fxLiveRates.spec.ts` → `fxLiveRates.feature`.** Fills out `PlaywrightLiveRatesTile` read-side (bid/ask/spread/filter/view toggle/persistence). 6 scenarios; `Scenario Outline` for the per-pair check. | 4/8 | `tests/specs/fxLiveRates.feature`, `fxLiveRates.steps.ts`, completion of `playwright/LiveRatesTile.ts` (read), `packages/client/e2e/fxLiveRates.spec.ts` (deleted) |
| 8  | **Convert `fxTrading.spec.ts` → `fxTrading.feature`.** Trading half of `LiveRatesTile` (`buy/sell/setNotional/lastTradeStatus`) and bring up `PlaywrightBlotterTable` for "executed trade appears in blotter" (read-side only). 5 scenarios. | 5/8 | `tests/specs/fxTrading.feature`, `fxTrading.steps.ts`, finish `playwright/LiveRatesTile.ts`, partial `playwright/BlotterTable.ts`, `packages/client/e2e/fxTrading.spec.ts` (deleted) |
| 9  | **Convert `fxRfq.spec.ts` → `fxRfq.feature`.** `PlaywrightFxRfqForm`. 2 scenarios. | 6/8 | `tests/specs/fxRfq.feature`, `fxRfq.steps.ts`, `playwright/FxRfqForm.ts`, `packages/client/e2e/fxRfq.spec.ts` (deleted) |
| 10 | **Convert `creditRfq.spec.ts` → `creditRfq.feature`.** `PlaywrightCreditRfqForm` + `PlaywrightCreditRfqPanel`. 7 scenarios. | 7/8 | `tests/specs/creditRfq.feature`, `creditRfq.steps.ts`, `playwright/{CreditRfqForm,CreditRfqPanel}.ts`, `packages/client/e2e/creditRfq.spec.ts` (deleted) |
| 11 | **Convert `blotter.spec.ts` → `blotter.feature`. Final cleanup.** Finishes `PlaywrightBlotterTable` (sort, filter, CSV, row styling, hover). 7 scenarios. **Delete the entire `packages/client/e2e/` directory; delete `packages/client/playwright.config.ts`; remove `e2e/**` references from `packages/client/tsconfig.node.json`; remove the `test:e2e` script from `packages/client/package.json`.** Remove `@playwright/test` from `packages/client/package.json:devDependencies` (it now lives only in `tests/`). Update `docs/architecture.md` §11: drop "(planned)" from the Behavioural Specs and Page Objects rows; add a Page Object Contracts row pointing at `tests/page-objects/contracts/`; add a Step Definitions row pointing at `tests/steps/browser/`. Update `docs/superpowers/STATUS.md`: mark Phase 5A.1 done with the SHA range; list 5A.2 / 5A.3 / 5A.4 as remaining sub-phases of the Phase 5 track and 5B / 5C / 5D as separate phases. Run the architectural grep gate locally. | 8/8, e2e/ gone, docs updated | `tests/specs/blotter.feature`, `blotter.steps.ts`, finish `playwright/BlotterTable.ts`, deletions, edits to `packages/client/tsconfig.node.json`, `packages/client/package.json`, `docs/architecture.md`, `docs/superpowers/STATUS.md` |

**Why this order:**

- Tasks 1-3 are pure scaffolding. If Cucumber + tsx/ESM + dev server has a sharp edge, it surfaces here, before any conversion.
- Tasks 4-5 are the smallest features, conversion-only. Validate the end-to-end pattern (feature → steps → POs → World → Playwright → green) on something quick to debug.
- Tasks 6-8 progressively flesh out `LiveRatesTile`, the most-reused PO.
- Tasks 9-11 clean up the long tail and the closing chores.

**Commit messages** follow the Phase 4 convention:

```
test(phase-5a.1): scaffold tests/ workspace
test(phase-5a.1): add page-object contracts and testid constants
test(phase-5a.1): wire cucumber world and dev-server lifecycle
test(phase-5a.1): convert theme spec to gherkin + page objects
test(phase-5a.1): convert connection spec to gherkin + page objects
test(phase-5a.1): convert analytics spec to gherkin + page objects
test(phase-5a.1): convert fxLiveRates spec to gherkin + page objects
test(phase-5a.1): convert fxTrading spec to gherkin + page objects
test(phase-5a.1): convert fxRfq spec to gherkin + page objects
test(phase-5a.1): convert creditRfq spec to gherkin + page objects
test(phase-5a.1): convert blotter spec, retire packages/client/e2e
docs(phase-5a.1): update architecture and status for new test stack   # if separated from #11
```

---

## 7. Acceptance criteria, risks, and out-of-scope

### 7.1 Acceptance criteria — Phase 5A.1 is done when:

1. `pnpm install && pnpm typecheck && pnpm test` passes from a clean clone (existing 141 unit tests stay green).
2. `pnpm test:e2e` runs from repo root, exits green, executes 40 scenarios.
3. `packages/client/e2e/` does not exist. `packages/client/playwright.config.ts` does not exist. `packages/client/tsconfig.node.json` no longer references `e2e/**`.
4. `tests/specs/` contains exactly 8 `.feature` files, no others.
5. The architectural grep gate passes:
   - `! grep -RE "@playwright/test|page-objects/playwright" tests/steps/browser/`
   - `! grep -RE "@playwright/test|cypress" tests/page-objects/contracts/`
   - `! grep -RE "data-testid|playwright|cy\\." tests/specs/`
   - `! grep -RE 'getByTestId\("' tests/page-objects/playwright/`
6. Every `data-testid` string used in any PO impl is declared in `tests/page-objects/contracts/testids.ts`. No string-literal `data-testid` anywhere else in `tests/`.
7. `docs/architecture.md` §11 reflects the new layout: `Behavioural Specs` row no longer says `(planned)`; `Page Objects` row no longer says `(planned)`. New rows added for `Page Object Contracts` (`tests/page-objects/contracts/`) and `Step Definitions` (`tests/steps/browser/`).
8. `docs/superpowers/STATUS.md` marks Phase 5A.1 done with the SHA range; lists 5A.2 / 5A.3 / 5A.4 as remaining sub-phases of the Phase 5 track and 5B / 5C / 5D as separate phases.

### 7.2 Anti-criteria — what 5A.1 is *not*:

- No second driver. `tests/page-objects/cypress/` stays as `.gitkeep`. `cypress` not in `tests/package.json`.
- No raw stacks. `tests/raw/` stays as `.gitkeep`s.
- No presenter-direct steps. No `support/PresenterWorld.ts`.
- No port contract tests, no real gateway-events adapter, no presenter-test-depth strengthening.
- No new product behaviour. Every `.feature` describes existing tested behaviour. If a scenario doesn't translate cleanly, the existing test stays in `packages/client/e2e/` for one more task and the discrepancy is logged in STATUS.md as a follow-up rather than papered over.

### 7.3 Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `tsx/esm` loader incompatibility with Cucumber's `requireModule` | Medium | Task 3 verifies the loader chain end-to-end before any feature is written. If `tsx` doesn't work, fall back to pre-compiling steps with `tsc` to a `tests/dist/` and pointing `requireModule` at `dist/`. |
| Cucumber parallelism flakes against the single Vite dev server | Low–Medium | Start at `parallel: 1` on CI (matches today) and `2` locally; only raise after a full CI cycle. Each scenario gets a fresh `BrowserContext`. |
| `data-testid` audit reveals missing IDs | Medium | Each conversion task is allowed a single one-line `data-testid="..."` add to the relevant component if absolutely required by a translated scenario. Flagged explicitly in the task and the commit. No re-architecting of components. |
| Cucumber HTML report differs from Playwright's | Low | Cosmetic; document in STATUS.md that the new report path is `tests/reports/cucumber.html`. |
| `coming back online dismisses overlay` is timing-sensitive (5 s today) | Medium | Step defs use the same `expect(...).toBeHidden({ timeout: 5_000 })` that today's spec uses. No tightening, no loosening. |
| `withSyntheticGatewayConnected` papers over a real bug that the new harness might surface | Low | If a flake involves connection state on reconnect, escalate immediately — that boundary is 5D's job. Don't try to fix it in 5A.1. |

### 7.4 Out of scope, explicitly deferred

- **Phase 5A.2** — Cucumber + Cypress reusing the same `.feature` files; Cypress PO impls under `page-objects/cypress/`.
- **Phase 5A.3** — Raw Playwright (no Gherkin); `tests/raw/playwright/**/*.spec.ts` consuming the same PO contracts. Playwright impls already exist after 5A.1.
- **Phase 5A.4** — Raw Cypress (no Gherkin); `tests/raw/cypress/**/*.cy.ts` consuming the same PO contracts. Cypress impls land in 5A.2.
- **Phase 5B** — Presenter-direct step definitions for the same `.feature` files; absorbs the deferred presenter test-depth strengthening (formerly 5E) because it re-exercises every presenter contract.
- **Phase 5C** — Port contract tests parameterised over simulator + WsReal adapters. Same `tests/` workspace, new top-level `tests/contracts/` directory.
- **Phase 5D** — Real gateway-events adapter; deletion of `withSyntheticGatewayConnected` from `packages/client/src/app/composition.ts`.
