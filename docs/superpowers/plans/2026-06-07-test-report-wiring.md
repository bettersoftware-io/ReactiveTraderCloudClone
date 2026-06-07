# Test Report Wiring Implementation Plan (Part B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every test script produces an HTML report (with failure images where the runner supports it) under a path that mirrors the script name: `test:<a>:<b>` ⇒ `<package>/reports/<a>/<b>/{report/index.html, artifacts/}`; bare `test` ⇒ `reports/unit/`; documented exception: `test:fullstack:node`.

**Architecture:** Part B of `docs/superpowers/specs/2026-06-07-test-report-consistency-design.md` (Part A — the client `tests/visual-diff/` restructure — is merged). HTML reporters are ADDITIVE: every terminal reporter stays. Each reporter owns only its `report/` subdir (an empirical spike showed Playwright's HTML reporter wipes its `outputFolder` at write time); raw failure output goes to the `artifacts/` SIBLING, never nested inside `report/`. Two new dev-deps; clean scripts and CI failure-uploads collapse onto `reports/`.

**Tech Stack:** Playwright `html` reporter, cucumber-js `html` formatter, `cypress-mochawesome-reporter` (new), @badeball html, Vitest `html` reporter via `@vitest/ui` (new), pnpm 11 + Turborepo, GitHub Actions.

**Context for the implementer (read first):**

- **Path-resolution rules (memorize these — they differ per runner):**
  - cucumber-js `format:` paths are **CWD-relative** (cucumber runs from `tests/`).
  - Cypress `specPattern`/`supportFile`/`screenshotsFolder`/`reporterOptions.reportDir` are **projectRoot-relative** (= `tests/`, even though config files live in suite folders).
  - Playwright `outputDir` and html-reporter `outputFolder` are **config-file-relative** (configs live INSIDE suite folders, so paths climb out: `../../reports/…` in `tests/`, `../../../reports/…` in the client tiers).
  - Vitest `outputFile` is **root-relative**; every vitest config here either sits at the package root (root = package dir) or pins `root` explicitly — never change a pinned `root`.
- **The sibling shape is load-bearing.** `report/` + `artifacts/` are siblings because Playwright's HTML reporter (and mochawesome) clean their own output dir. Never point `outputDir`/`screenshotsFolder` inside a `report/` dir.
- **Goldens must not change.** The client visual-diff tiers diff against committed goldens; if any tier wants to update screenshots after your edits, a path is mis-wired — fix the path, never update goldens.
- **CI job ids and step names in `ci.yml` stay** — only the two failure-upload `path:` blocks change.
- **`docs/superpowers/` is historical** — do not edit anything there except the explicit STATUS.md append in Task 7.
- pnpm 11 enforces a 24h release cooldown (`minimumReleaseAge`). The pinned versions below (`@vitest/ui@^4` → 4.1.8, `cypress-mochawesome-reporter@^4` → 4.0.2) are months old and compliant.
- Several verifications below temporarily force a test failure. **Never commit the temporary failure**; each such step ends by reverting and re-running green.
- Run `pnpm build` at the repo root once before any suite run — direct `pnpm --filter` invocations bypass turbo's dependency graph and need workspace `dist/` prebuilt.

---

## Task 1: Foundation — deps, clean scripts, gitignore, turbo, stale-file cleanup

**Files:**
- Modify: `packages/{domain,shared,server,client}/package.json`, `tests/package.json` (devDeps + clean scripts)
- Modify: `.gitignore` (root), `tests/.gitignore`, `packages/client/.gitignore`
- Modify: `turbo.json`
- Delete (untracked local junk): `tests/reports/`, `tests/test-results/`, `packages/client/test-results/`

- [ ] **Step 1: Branch**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone
git checkout -b feat/test-report-wiring
```

- [ ] **Step 2: Install the two new dev-dependencies**

```bash
pnpm --filter @rtc/domain --filter @rtc/shared --filter @rtc/server --filter @rtc/client --filter @rtc/tests add -D '@vitest/ui@^4'
pnpm --filter @rtc/tests add -D 'cypress-mochawesome-reporter@^4'
```

Expected: lockfile updates; `@vitest/ui` resolves to 4.1.8 (matching the installed vitest 4.1.8), `cypress-mochawesome-reporter` to 4.0.2. If pnpm's cooldown rejects a version, pin one release older.

- [ ] **Step 3: Update clean scripts**

In `tests/package.json`:

```json
    "clean": "rm -rf .turbo reports",
```

In `packages/client/package.json`:

```json
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports",
```

In each of `packages/domain/package.json`, `packages/shared/package.json`, `packages/server/package.json`:

```json
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports",
```

(Root `clean` fans out via `turbo run clean` — unchanged. Visual golden `*-actual`/`*-diff` PNGs deliberately stay out of `clean`: they live next to committed goldens where a glob-free `rm -rf` can't target them safely.)

- [ ] **Step 4: gitignore updates**

Root `.gitignore` — add one line after `*.tsbuildinfo`:

```
reports/
```

(Covers `domain`/`shared`/`server`, which have no own `.gitignore`. The existing `playwright-report/` and `test-results/` lines stay as dormant safety nets — nothing produces those paths after this plan, but stray local runs from older checkouts shouldn't pollute `git status`.)

`tests/.gitignore` — full new content (drops `cypress/screenshots/`, `cypress/videos/`, and the four legacy html filename lines):

```
node_modules/
reports/
```

`packages/client/.gitignore` — full new content (drops `playwright-report/` and `test-results/`, both retired; root still ignores them globally):

```
reports/
tests/visual-diff/playwright-ct/host/.cache/
tests/visual-diff/**/__screenshots__/**/*-actual.png
tests/visual-diff/**/__screenshots__/**/*-diff.png
```

- [ ] **Step 5: turbo.json — `test` task gains outputs**

```json
    "test": {
      "dependsOn": ["build"],
      "outputs": ["reports/**"]
    },
```

(Same semantics as `build` ⇒ `dist/`: a cached replay restores the unit reports. `test:e2e`/`test:visual-diff` are `cache: false` — no outputs needed.)

- [ ] **Step 6: Delete stale local report/result dirs**

```bash
rm -rf tests/reports tests/test-results packages/client/test-results
git status --short   # all three were gitignored — status must NOT change
```

Expected: `git status` shows only the Step-2–5 file edits, no deletions (the dirs were untracked junk: pre-rename `cucumber.html`, `cucumber-presenter-real.html` etc., and `test-results/` dirs holding only `.last-run.json`).

- [ ] **Step 7: Sanity — install + unit pipeline still green**

```bash
pnpm install
pnpm build && pnpm test --force
```

Expected: install clean; 8/8 test tasks pass (reports aren't wired yet — that's the next tasks).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test(reports): report deps, clean scripts, gitignore + turbo plumbing

@vitest/ui in all five vitest packages, cypress-mochawesome-reporter in
tests; clean scripts converge on rm -rf reports; turbo test task declares
outputs [reports/**] so cached replays restore unit reports; stale
pre-rename html files and empty test-results dirs deleted (untracked)."
```

---

## Task 2: Unit-test reports (`reports/unit/`) in all four vitest packages

**Files:**
- Modify: `packages/domain/vitest.config.ts`, `packages/shared/vitest.config.ts`, `packages/server/vitest.config.ts`, `packages/client/vitest.config.ts`

- [ ] **Step 1: domain / shared / server configs**

Full new content for `packages/domain/vitest.config.ts`, `packages/shared/vitest.config.ts`, and `packages/server/vitest.config.ts` (identical):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // HTML report (additive; terminal output unchanged). Bare `test` maps to
    // reports/unit/ per the repo-wide rule: test:<a>:<b> => reports/<a>/<b>/.
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
  },
});
```

- [ ] **Step 2: client config**

Full new content for `packages/client/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    passWithNoTests: true,
    // HTML report (additive; terminal output unchanged). Bare `test` maps to
    // reports/unit/ per the repo-wide rule: test:<a>:<b> => reports/<a>/<b>/.
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
  },
});
```

- [ ] **Step 3: Run and verify**

```bash
pnpm test --force
ls packages/domain/reports/unit/report/index.html \
   packages/shared/reports/unit/report/index.html \
   packages/server/reports/unit/report/index.html \
   packages/client/reports/unit/report/index.html
git status --short   # reports/ gitignored => no new untracked entries
```

Expected: 8/8 tasks pass with terminal output unchanged; all four `index.html` files exist; `git status` shows only the config edits.

- [ ] **Step 4: Verify the cache-restore behavior (documented in Task 7)**

```bash
pnpm --filter @rtc/domain clean
pnpm test          # cached replay
ls packages/domain/reports/unit/report/index.html
```

Expected: `>>> FULL TURBO` (or partial cache) AND the report file restored from cache — turbo's `outputs: ["reports/**"]` working as designed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(reports): unit-test HTML reports in all four packages (reports/unit)"
```

---

## Task 3: Presenter suite reports (`tests/reports/presenter/<suite>/report/`)

**Files:**
- Modify: `tests/presenter/cucumber/cucumber.js:13` (format line)
- Modify: `tests/presenter/cucumber-fake-timers/cucumber.js:16` (format line)
- Modify: `tests/presenter/vitest-fake-timers/vitest.config.ts`
- Modify: `tests/presenter/vitest-quickpickle-fake-timers/vitest.config.ts`

- [ ] **Step 1: Re-path the two cucumber html formats** (CWD-relative — cucumber runs from `tests/`)

In `tests/presenter/cucumber/cucumber.js` replace:

```js
  format: ["progress-bar", "html:reports/cucumber-presenter.html", "summary"],
```

with:

```js
  format: ["progress-bar", "html:reports/presenter/cucumber/report/index.html", "summary"],
```

In `tests/presenter/cucumber-fake-timers/cucumber.js` replace:

```js
  format: ["progress-bar", "html:reports/cucumber-presenter-fake-timers.html", "summary"],
```

with:

```js
  format: ["progress-bar", "html:reports/presenter/cucumber-fake-timers/report/index.html", "summary"],
```

- [ ] **Step 2: Add vitest html reporters** (outputFile is root-relative; both configs pin `root` to `tests/` — keep that)

In `tests/presenter/vitest-fake-timers/vitest.config.ts` replace:

```ts
    reporters: ["default"],
```

with:

```ts
    // HTML report (additive): test:presenter:vitest-fake-timers =>
    // reports/presenter/vitest-fake-timers/. outputFile is root-relative (tests/).
    reporters: ["default", "html"],
    outputFile: { html: "reports/presenter/vitest-fake-timers/report/index.html" },
```

In `tests/presenter/vitest-quickpickle-fake-timers/vitest.config.ts` replace:

```ts
    reporters: ["default"],
```

with:

```ts
    // HTML report (additive): test:presenter:vitest-quickpickle-fake-timers =>
    // reports/presenter/vitest-quickpickle-fake-timers/. Root-relative (tests/).
    reporters: ["default", "html"],
    outputFile: { html: "reports/presenter/vitest-quickpickle-fake-timers/report/index.html" },
```

- [ ] **Step 3: Run all four from a cleaned reports/ (the parent-dir-creation risk)**

```bash
rm -rf tests/reports
pnpm --filter @rtc/tests test:presenter:cucumber
pnpm --filter @rtc/tests test:presenter:cucumber-fake-timers
pnpm --filter @rtc/tests test:presenter:vitest-fake-timers
pnpm --filter @rtc/tests test:presenter:vitest-quickpickle-fake-timers
ls tests/reports/presenter/cucumber/report/index.html \
   tests/reports/presenter/cucumber-fake-timers/report/index.html \
   tests/reports/presenter/vitest-fake-timers/report/index.html \
   tests/reports/presenter/vitest-quickpickle-fake-timers/report/index.html
```

Expected: all four suites pass, all four reports exist. **Fallback if a cucumber run errors on the missing parent directory** (e.g. `ENOENT … reports/presenter/cucumber/report`): prefix only the affected scripts in `tests/package.json` with a `mkdir -p`, e.g.:

```json
    "test:presenter:cucumber": "mkdir -p reports/presenter/cucumber/report && NODE_OPTIONS='--import tsx/esm' cucumber-js --config presenter/cucumber/cucumber.js",
```

(Apply the same pattern with the matching path to any other script that needs it; do NOT add it where the runner creates dirs itself.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(reports): presenter suite HTML reports under reports/presenter/<suite>/report"
```

---

## Task 4: Playwright-based browser + fullstack reports (with failure screenshots)

**Files:**
- Modify: `tests/browser/playwright/playwright.config.ts`
- Modify: `tests/browser/playwright-cucumber/cucumber.js:24` (format line)
- Modify: `tests/browser/playwright-cucumber/hooks.ts` (failure-screenshot attach)
- Modify: `tests/fullstack/browser/playwright.config.ts`

- [ ] **Step 1: `tests/browser/playwright/playwright.config.ts`** — full new content (changes: reporter gains html, NEW `outputDir`, NEW `screenshot: "only-on-failure"`; paths are config-file-relative, `../../` = `tests/`):

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Terminal reporter unchanged; HTML is additive. The html reporter owns (and
  // wipes) ONLY report/; raw failure output (traces, screenshots) goes to the
  // artifacts/ sibling — never nest one inside the other. Paths are
  // config-file-relative (../../ = tests/).
  reporter: [
    ["list"],
    ["html", { outputFolder: "../../reports/browser/playwright/report", open: "never" }],
  ],
  outputDir: "../../reports/browser/playwright/artifacts",
  timeout: 30_000,
  use: {
    // Per-suite port via RTC_DEV_PORT (parallel runners); defaults to 3000.
    baseURL: `http://localhost:${process.env.RTC_DEV_PORT ?? 3000}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

- [ ] **Step 2: Re-path the playwright-cucumber html format**

In `tests/browser/playwright-cucumber/cucumber.js` replace:

```js
  format: ["progress-bar", "html:reports/playwright-cucumber.html", "summary"],
```

with:

```js
  format: ["progress-bar", "html:reports/browser/playwright-cucumber/report/index.html", "summary"],
```

- [ ] **Step 3: Failure-screenshot attach in `tests/browser/playwright-cucumber/hooks.ts`**

Replace the import line:

```ts
import { After, AfterAll, Before, BeforeAll, setDefaultTimeout } from "@cucumber/cucumber";
```

with:

```ts
import { After, AfterAll, Before, BeforeAll, Status, setDefaultTimeout } from "@cucumber/cucumber";
```

and replace the After hook:

```ts
After(async function (this: PlaywrightWorld) {
  await this.close();
});
```

with:

```ts
After(async function (this: PlaywrightWorld, { result }) {
  // On failure, embed a screenshot into the cucumber HTML report (image/png
  // attachments render inline under the failed scenario) before the page closes.
  if (result?.status === Status.FAILED) {
    await this.attach(await this.page.screenshot({ fullPage: true }), "image/png");
  }
  await this.close();
});
```

(`PlaywrightWorld extends World`, so `this.attach` exists; `this.page` is set in `open()`.)

- [ ] **Step 4: `tests/fullstack/browser/playwright.config.ts`** — full new content (same pattern; `../../` = `tests/`):

```ts
import { defineConfig, devices } from "@playwright/test";

/**
 * Full-stack browser smoke. Unlike the eight-runner suite (which runs the
 * client against in-process simulators), this drives the real built client
 * connected to the real backend. The client + server processes are started by
 * fullstack/browser-smoke.ts; this config only points Playwright at the client.
 */
const CLIENT_PORT = Number(process.env.FULLSTACK_CLIENT_PORT ?? 3100);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Terminal reporter unchanged; HTML is additive. report/ + artifacts/ are
  // siblings (the html reporter wipes its own folder). Config-file-relative.
  reporter: [
    ["list"],
    ["html", { outputFolder: "../../reports/fullstack/browser/report", open: "never" }],
  ],
  outputDir: "../../reports/fullstack/browser/artifacts",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${CLIENT_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 5: Green runs**

```bash
pnpm --filter @rtc/tests test:browser:playwright
pnpm --filter @rtc/tests test:browser:playwright-cucumber
pnpm --filter @rtc/tests test:fullstack:browser
ls tests/reports/browser/playwright/report/index.html \
   tests/reports/browser/playwright-cucumber/report/index.html \
   tests/reports/fullstack/browser/report/index.html
```

Expected: all pass, three reports exist. (Each script boots its own dev server via `with-server`/the smoke orchestrator; run them sequentially, they share default port 3000 only for the first one.)

- [ ] **Step 6: Forced-failure verification — native Playwright**

Create `tests/browser/playwright/zz-tmp-fail.spec.ts`:

```ts
// TEMPORARY — report-wiring verification only. DELETE before commit.
import { test, expect } from "@playwright/test";

test("TEMP forced failure for report verification", async ({ page }) => {
  await page.goto("/");
  expect(1).toBe(2);
});
```

```bash
pnpm --filter @rtc/tests test:browser:playwright   # expect exit 1 (1 failed)
ls tests/reports/browser/playwright/artifacts/      # contains the failed test's dir with test-failed-*.png + trace.zip
grep -c "test-failed" tests/reports/browser/playwright/report/index.html || true
rm tests/browser/playwright/zz-tmp-fail.spec.ts
pnpm --filter @rtc/tests test:browser:playwright   # green again
```

Expected: failing run leaves a screenshot + trace under `artifacts/`, and the html report references/embeds them (open `report/index.html` and confirm the failed test entry shows the screenshot attachment). After deletion: suite green, `git status` clean of the temp file.

- [ ] **Step 7: Forced-failure verification — playwright-cucumber attach**

Pick any `Then`-step assertion in a file under `tests/browser/steps/` and temporarily invert it (e.g. change one expected string to `"WRONG_VALUE_TMP"`). Then:

```bash
pnpm --filter @rtc/tests test:browser:playwright-cucumber   # expect failing scenario(s)
```

Open `tests/reports/browser/playwright-cucumber/report/index.html` and confirm the failed scenario shows an embedded PNG screenshot (the After-hook attach). Then revert and re-run green:

```bash
git checkout -- tests/browser/steps/
pnpm --filter @rtc/tests test:browser:playwright-cucumber   # green again
```

**Fallback if the attach throws** (page already closed under cucumber retry): guard it — wrap the screenshot call in `try { … } catch { /* page gone — skip attach */ }` and note it in the commit body.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test(reports): playwright browser + fullstack HTML reports with failure screenshots

html reporter additive to list; outputDir -> artifacts/ sibling (reporter
owns and wipes only report/); screenshot only-on-failure embeds into the
report; playwright-cucumber gains an After-hook attach so its cucumber html
report embeds a failure PNG."
```

---

## Task 5: Cypress suite reports (mochawesome + badeball re-path)

**Files:**
- Modify: `tests/browser/cypress/cypress.config.ts`
- Modify: `tests/browser/cypress/_context.ts` (register import)
- Modify: `tests/browser/cypress-cucumber/cypress.config.ts` (screenshotsFolder)
- Modify: `tests/.cypress-cucumber-preprocessorrc.json`

- [ ] **Step 1: `tests/browser/cypress/cypress.config.ts`** — full new content (adds the mochawesome reporter block, `screenshotsFolder`, and a `setupNodeEvents` registering the reporter plugin; everything else preserved):

```ts
// tests/browser/cypress/cypress.config.ts
import { defineConfig } from "cypress";
import mochawesomePlugin from "cypress-mochawesome-reporter/plugin";

// On a loaded CI runner the app's connection settle (Connecting → Connected,
// driven by an rxjs timer) can take well over the local ~1s, and the
// `.should()`-retry assertions that gate on it (e.g. setBrowserOffline waiting
// for "Connected") only partially yield to the AUT. Give CI more headroom and
// retry a flaky spec; locally the fast path needs neither.
const isCI = !!process.env.CI;

export default defineConfig({
  // HTML report via cypress-mochawesome-reporter (Cypress has no built-in
  // HTML). reportDir is projectRoot-relative (tests/). The reporter owns and
  // cleans ONLY report/; raw failure screenshots land in the artifacts/
  // sibling and are ALSO embedded (base64) into the report itself.
  reporter: "cypress-mochawesome-reporter",
  reporterOptions: {
    reportDir: "reports/browser/cypress/report",
    reportFilename: "index",
    overwrite: true,
    html: true,
    json: false,
    embeddedScreenshots: true,
    inlineAssets: true,
  },
  e2e: {
    // Per-suite port via RTC_DEV_PORT (parallel runners); defaults to 3000.
    baseUrl: `http://localhost:${process.env.RTC_DEV_PORT ?? 3000}`,
    specPattern: "browser/cypress/**/*.spec.ts",
    supportFile: "browser/cypress/_context.ts",
    video: false,
    screenshotOnRunFailure: true,
    screenshotsFolder: "reports/browser/cypress/artifacts",
    defaultCommandTimeout: isCI ? 30_000 : 10_000,
    retries: { runMode: isCI ? 2 : 0, openMode: 0 },
    setupNodeEvents(on, config) {
      mochawesomePlugin(on);
      return config;
    },
  },
});
```

- [ ] **Step 2: Register the reporter's support-side hook**

In `tests/browser/cypress/_context.ts`, add directly under the header comment (before the other imports):

```ts
import "cypress-mochawesome-reporter/register";
```

- [ ] **Step 3: cypress-cucumber — artifacts + report re-path**

In `tests/browser/cypress-cucumber/cypress.config.ts`, inside the `e2e:` block, add after `screenshotOnRunFailure: true,`:

```ts
    screenshotsFolder: "reports/browser/cypress-cucumber/artifacts",
```

`tests/.cypress-cucumber-preprocessorrc.json` — full new content:

```json
{
  "stepDefinitions": ["browser/steps/*.steps.ts"],
  "omitFiltered": true,
  "filterSpecs": true,
  "json": { "enabled": false },
  "html": { "enabled": true, "output": "reports/browser/cypress-cucumber/report/index.html" }
}
```

- [ ] **Step 4: Green runs**

```bash
pnpm --filter @rtc/tests test:browser:cypress
pnpm --filter @rtc/tests test:browser:cypress-cucumber
ls tests/reports/browser/cypress/report/index.html \
   tests/reports/browser/cypress-cucumber/report/index.html
```

Expected: both suites pass, both reports exist. Note: cypress-mochawesome-reporter replaces the default `spec` terminal output with its own spec-style output — that is expected and acceptable (still per-test terminal lines).

- [ ] **Step 5: Forced-failure verification — native Cypress (mochawesome embed + dir-clean semantics)**

Create `tests/browser/cypress/zz-tmp-fail.spec.ts`:

```ts
// TEMPORARY — report-wiring verification only. DELETE before commit.
describe("TEMP forced failure for report verification", () => {
  it("fails on purpose", () => {
    cy.visit("/");
    cy.contains("THIS_TEXT_DOES_NOT_EXIST_TMP", { timeout: 1000 }).should("exist");
  });
});
```

Also drop a sentinel to prove the reporter cleans only `report/`:

```bash
mkdir -p tests/reports/browser/cypress/artifacts
touch tests/reports/browser/cypress/artifacts/SENTINEL
pnpm --filter @rtc/tests test:browser:cypress   # expect exit 1
ls tests/reports/browser/cypress/artifacts/      # SENTINEL still present + failure PNG dir
```

Open `tests/reports/browser/cypress/report/index.html`: the failed test must show the embedded screenshot. **Fallback if mochawesome wiped the artifacts sibling** (it must not — it owns only its reportDir): point `reportDir` one level deeper and copy out, per the spec's risk table — but verify first; this is not expected. Then:

```bash
rm tests/browser/cypress/zz-tmp-fail.spec.ts tests/reports/browser/cypress/artifacts/SENTINEL
pnpm --filter @rtc/tests test:browser:cypress   # green again
```

- [ ] **Step 6: Forced-failure verification — badeball auto-attach**

Temporarily invert the same `Then`-step assertion as Task 4 Step 7 (any step in `tests/browser/steps/`), then:

```bash
pnpm --filter @rtc/tests test:browser:cypress-cucumber   # expect failing scenario(s)
```

Open `tests/reports/browser/cypress-cucumber/report/index.html`: confirm the failed scenario shows the failure screenshot (badeball attaches Cypress failure screenshots automatically). **Fallback if no screenshot appears:** add an explicit attach hook in `tests/browser/cypress-cucumber/e2e.ts`:

```ts
import { After } from "@badeball/cypress-cucumber-preprocessor";

// badeball did not auto-attach in this setup — attach the Cypress failure
// screenshot explicitly so it embeds in the html report.
After(function (this: Mocha.Context) {
  // Cypress names failure shots "<spec> -- <test> (failed).png" under
  // screenshotsFolder; cy.screenshot here re-captures deterministically instead.
  if (this.currentTest?.state === "failed") {
    cy.screenshot({ capture: "runner" });
  }
});
```

Then revert the step inversion and re-run green:

```bash
git checkout -- tests/browser/steps/
pnpm --filter @rtc/tests test:browser:cypress-cucumber   # green again
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(reports): cypress HTML reports (mochawesome native, badeball re-pathed)

native cypress gains cypress-mochawesome-reporter (embedded failure
screenshots, inline assets, json off); both suites' screenshotsFolder ->
reports/browser/<suite>/artifacts; badeball html output re-pathed to
reports/browser/cypress-cucumber/report/index.html."
```

---

## Task 6: Client visual-diff tier reports (`packages/client/reports/visual-diff/…`)

**Files:**
- Modify: `packages/client/tests/visual-diff/playwright-ct/playwright-ct.config.ts`
- Modify: `packages/client/tests/visual-diff/playwright/playwright.config.ts`
- Modify: `packages/client/tests/visual-diff/vitest-browser/vitest-browser.config.ts`

All three configs sit three levels below the package root: `../../../` = `packages/client/`. The `:react` axis appears in the REPORT path (it selects harness + golden set, not a code folder) — `reports/visual-diff/<runner>/react/`.

- [ ] **Step 1: CT config** — in `playwright-ct.config.ts` replace:

```ts
  reporter: process.env.CI ? "line" : "list",
```

with:

```ts
  // Terminal reporter unchanged; HTML is additive. report/ + artifacts/ are
  // siblings (the html reporter wipes its own folder). ../../../ = packages/client.
  reporter: [
    [process.env.CI ? "line" : "list"],
    ["html", { outputFolder: "../../../reports/visual-diff/playwright-ct/react/report", open: "never" }],
  ],
  outputDir: "../../../reports/visual-diff/playwright-ct/react/artifacts",
```

- [ ] **Step 2: Plain tier config** — in `playwright/playwright.config.ts` replace:

```ts
  reporter: process.env.CI ? "line" : "list",
```

with:

```ts
  // Terminal reporter unchanged; HTML is additive. report/ + artifacts/ are
  // siblings (the html reporter wipes its own folder). ../../../ = packages/client.
  reporter: [
    [process.env.CI ? "line" : "list"],
    ["html", { outputFolder: "../../../reports/visual-diff/playwright/react/report", open: "never" }],
  ],
  outputDir: "../../../reports/visual-diff/playwright/react/artifacts",
```

(This config IS typechecked by `tsconfig.visual-diff.json`; Playwright's `ReporterDescription` is `[string] | [string, unknown]`, so the ternary-in-tuple form typechecks. If tsc objects, hoist: `const terminal: "line" | "list" = process.env.CI ? "line" : "list";` and use `[terminal]`.)

- [ ] **Step 3: vitest-browser tier config** — in `vitest-browser/vitest-browser.config.ts`, inside the `test:` block, add directly after the `include:` line:

```ts
    // HTML report (additive): test:visual-diff:vitest-browser:react =>
    // reports/visual-diff/vitest-browser/react/. outputFile is root-relative
    // (root is pinned to the package dir above). Failure diff PNGs stay next
    // to the goldens (*-actual/*-diff, tied to golden routing) — by design.
    reporters: ["default", "html"],
    outputFile: { html: "reports/visual-diff/vitest-browser/react/report/index.html" },
```

- [ ] **Step 4: Run all three tiers — green against committed goldens, reports produced**

```bash
pnpm --filter @rtc/client typecheck
pnpm --filter @rtc/client test:visual-diff
ls packages/client/reports/visual-diff/playwright-ct/react/report/index.html \
   packages/client/reports/visual-diff/playwright/react/report/index.html \
   packages/client/reports/visual-diff/vitest-browser/react/report/index.html
git status --short   # NO golden changes, no untracked dirs
```

Expected: typecheck clean; `Visual-diff summary: 3/3 runner(s) passed.`; all three reports exist; status shows only the three config edits. **If any tier wants to update screenshots, a path is mis-wired — fix the path, do NOT update goldens.** **Fallback if the vitest html reporter fails in browser mode** (spec risk): revert Step 3 to `reporters: ["default"]` (no outputFile) and document the gap in Task 7's READMEs ("Tier 3: terminal only — vitest html reporter incompatible with browser mode as of vitest 4.1").

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(reports): client visual-diff tier HTML reports under reports/visual-diff

per-runner reports at reports/visual-diff/<runner>/react/{report,artifacts}
(the :react segment selects harness+goldens, so it appears in the report
path); terminal reporters unchanged; golden routing untouched."
```

---

## Task 7: CI upload collapse + documentation

**Files:**
- Modify: `.github/workflows/ci.yml` (two upload `path:` blocks only)
- Modify: `tests/README.md`, `packages/client/README.md`, `README.md` (root)
- Verify-only: `docs/architecture.md`
- Modify: `docs/superpowers/STATUS.md` (insert dated section)

- [ ] **Step 1: ci.yml — visual job upload** (job id, step names, `if:`/`retention-days` stay; only `path:` changes)

Replace:

```yaml
          path: |
            packages/client/tests/visual-diff/*/test-results/
            packages/client/tests/visual-diff/**/__screenshots__/**/*-actual.png
            packages/client/tests/visual-diff/**/__screenshots__/**/*-diff.png
```

with:

```yaml
          path: |
            packages/client/reports/
            packages/client/tests/visual-diff/**/__screenshots__/**/*-actual.png
            packages/client/tests/visual-diff/**/__screenshots__/**/*-diff.png
```

(Deviation from the spec's "one path", deliberate: the Playwright tiers' failure output now lands under `reports/`, but Tier 3's `*-actual`/`*-diff` PNGs live next to the goldens by design — the two globs keep them in the failure artifact.)

- [ ] **Step 2: ci.yml — e2e job upload**

Replace:

```yaml
          path: |
            tests/reports/
            tests/test-results/
            tests/cypress/screenshots/
            tests/cypress/videos/
```

with:

```yaml
          path: |
            tests/reports/
```

- [ ] **Step 3: `tests/README.md`** — three edits:

(a) Scripts table gains a `report` column. New table (report paths are under `tests/reports/`; `{r,a}` below means `report/index.html` + `artifacts/`):

```markdown
| script | what it runs | server | report (under `reports/`) |
|---|---|---|---|
| `test:e2e` | gates, then ALL 10 suites below in parallel via `scripts/run-all.ts` | per-suite | — (each suite writes its own) |
| `test:browser:playwright` | native `@playwright/test` specs, `browser/playwright/` | dev server | `browser/playwright/` |
| `test:browser:cypress` | native Cypress Mocha specs, `browser/cypress/` | dev server | `browser/cypress/` |
| `test:browser:playwright-cucumber` | cucumber-js driving Playwright, `specs/*.feature` + `browser/steps/` | dev server | `browser/playwright-cucumber/` |
| `test:browser:cypress-cucumber` | Cypress + @badeball preprocessor, same features/steps | dev server | `browser/cypress-cucumber/` |
| `test:browser:cypress-cucumber:open` | the above in the interactive Cypress runner | dev server | — (interactive) |
| `test:presenter:cucumber` | cucumber-js against live presenters (in-process simulators), real timers | none | `presenter/cucumber/` |
| `test:presenter:cucumber-fake-timers` | same scenarios under `@sinonjs/fake-timers` | none | `presenter/cucumber-fake-timers/` |
| `test:presenter:vitest-fake-timers` | same scenarios as plain vitest `it()` blocks (no Gherkin), virtual time | none | `presenter/vitest-fake-timers/` |
| `test:presenter:vitest-quickpickle-fake-timers` | same `.feature` files via quickpickle + `vi.useFakeTimers` | none | `presenter/vitest-quickpickle-fake-timers/` |
| `test:fullstack:node` | smoke against the REAL server via a Node WebSocket (no browser) | own server | — (bare tsx script, no framework — the one exception) |
| `test:fullstack:browser` | smoke against the REAL server + client, Playwright drives the browser | own server + client | `fullstack/browser/` |
| `gates` | 25 grep/custom architecture gates (`scripts/grep-gates.ts`) | none | — |
| `port:free` | frees the dev-server port (`RTC_DEV_PORT`, default 3000) | — | — |
```

(b) Add a `## Reports` section after `## Layout`:

```markdown
## Reports

Every test script writes an HTML report whose path mirrors the script name:
`test:<group>:<suite>` ⇒ `reports/<group>/<suite>/report/index.html` — open
that. Browser suites also write raw failure output (screenshots, traces) to
the `artifacts/` **sibling**; the two are siblings because each HTML reporter
owns — and wipes — its own `report/` folder at write time.

Failure screenshots are embedded in the report itself for all four browser
suites. The one exception with no report: `test:fullstack:node` (a bare tsx
script with no test framework — terminal output only). `reports/` is
gitignored and removed by `pnpm clean`.
```

(c) In the Layout tree, no change needed (reports/ is generated output, not source) — but verify the section doesn't claim otherwise.

- [ ] **Step 4: `packages/client/README.md`** — two edits:

(a) Scripts table gains a `report` column:

```markdown
| script | purpose | report (under `reports/`) |
|---|---|---|
| `dev` | Vite dev server | — |
| `build` / `build-types` | Vite build + `.d.ts` emit | — |
| `typecheck` | app + node + visual-diff tsconfigs | — |
| `test` | **unit tier** — Vitest (jsdom): presenters, adapters | `unit/` |
| `test:visual-diff` | **visual tier** — every runner × every framework variant present, in parallel | per-runner, below |
| `test:visual-diff:react` | all visual runners, react only | per-runner, below |
| `test:visual-diff:playwright-ct:react[:update\|:ui]` | Tier 1 — Playwright Component Testing | `visual-diff/playwright-ct/react/` |
| `test:visual-diff:playwright:react[:update\|:ui]` | Tier 2 — plain Playwright over a Vite host page | `visual-diff/playwright/react/` |
| `test:visual-diff:vitest-browser:react[:update]` | Tier 3 — Vitest browser mode (`toMatchScreenshot`) | `visual-diff/vitest-browser/react/` |
| `clean` / `clean:deep` | remove build/test artifacts (/ + node_modules) | — |
```

(b) Append one sentence to the existing Caching paragraph (after "…re-runs for real."):

```markdown
The unit report under `reports/unit/` is a declared turbo output, so a cached
replay *restores* it — fresh reports need `--force` too.
```

(If Task 6 hit the Tier-3 html fallback, also add the documented gap here: "Tier 3 report: terminal only — vitest html reporter incompatible with browser mode as of vitest 4.1.")

- [ ] **Step 5: Root `README.md`** — in the `## Checks & tests` section, after the command block, add:

```markdown
Every test script writes an HTML report mirroring its name —
`test:<a>:<b>` ⇒ `<package>/reports/<a>/<b>/report/index.html` (failure
artifacts in the `artifacts/` sibling; bare `test` ⇒ `reports/unit/`; sole
exception: `test:fullstack:node`, terminal only).
```

And in the Caching section, append to the relevant paragraph: a cached `pnpm test` replay also restores `reports/unit/` from cache (declared turbo outputs) — `--force` regenerates them.

- [ ] **Step 6: `docs/architecture.md` — verify nothing to update**

```bash
grep -nE "cucumber-presenter|reports/|playwright-cucumber\.html|cypress-cucumber\.html" docs/architecture.md
```

Expected: no real hits (a `.html` inside an external URL is fine). The spec's "update by meaning" is vacuous here; record that in the commit body.

- [ ] **Step 7: `docs/superpowers/STATUS.md`** — insert a new `##` section after the existing 2026-06-07 dated sections (match their placement convention — dated sections sit after the Phases table, before the topical sections):

```markdown
## 2026-06-07 — consistent HTML test reports (Part B of the test-report consistency spec)

Every test script now writes an HTML report mirroring its name:
`test:<a>:<b>` ⇒ `<package>/reports/<a>/<b>/report/index.html`, with raw
failure output in the `artifacts/` sibling (the reporter owns and wipes only
`report/` — empirically spiked). Bare `test` ⇒ `reports/unit/` in all four
vitest packages (turbo `outputs: ["reports/**"]`, cache-restored). New deps:
`@vitest/ui` (×5), `cypress-mochawesome-reporter` (tests). Failure screenshots
embed in all four browser-suite reports (Playwright `only-on-failure`,
cucumber `After`-hook attach, mochawesome embedded, badeball auto-attach).
Exception: `test:fullstack:node` (bare tsx, terminal only). Clean scripts and
the two CI failure uploads collapse onto `reports/`. Spec:
`docs/superpowers/specs/2026-06-07-test-report-consistency-design.md` (Part B).
```

(Adjust the badeball clause if Task 5 Step 6 needed the explicit-attach fallback.)

- [ ] **Step 8: Stale-reference sweep**

```bash
git grep -nE "cucumber-presenter(-fake(-timers)?|-real)?\.html|playwright-cucumber\.html|cypress-cucumber\.html|cypress/screenshots|cypress/videos" -- ':(exclude)docs/superpowers'
```

Expected: empty.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "ci+docs: collapse failure uploads onto reports/, document the report mapping rule

ci.yml visual job uploads packages/client/reports/ (+ the tier-3 golden-diff
globs, which live next to goldens by design); e2e job uploads tests/reports/
only. READMEs gain report columns + the mapping rule; fullstack:node
exception documented; docs/architecture.md verified to have no report
references (grep empty); STATUS.md dated entry added."
```

---

## Task 8: Final verification

- [ ] **Step 1: Full pipeline from clean, forced fresh**

```bash
pnpm clean
pnpm build && pnpm typecheck --force && pnpm test --force && pnpm test:visual-diff && pnpm test:e2e
```

Expected: build 4/4; typecheck 9/9; unit 8/8 tasks; visual-diff `3/3 runner(s) passed`; e2e gates + 10/10 suites. (e2e takes ~2–4 min; give it a generous timeout.)

- [ ] **Step 2: Full report inventory — all 16 expected reports exist**

```bash
for f in \
  packages/domain/reports/unit/report/index.html \
  packages/shared/reports/unit/report/index.html \
  packages/server/reports/unit/report/index.html \
  packages/client/reports/unit/report/index.html \
  packages/client/reports/visual-diff/playwright-ct/react/report/index.html \
  packages/client/reports/visual-diff/playwright/react/report/index.html \
  packages/client/reports/visual-diff/vitest-browser/react/report/index.html \
  tests/reports/browser/playwright/report/index.html \
  tests/reports/browser/playwright-cucumber/report/index.html \
  tests/reports/browser/cypress/report/index.html \
  tests/reports/browser/cypress-cucumber/report/index.html \
  tests/reports/presenter/cucumber/report/index.html \
  tests/reports/presenter/cucumber-fake-timers/report/index.html \
  tests/reports/presenter/vitest-fake-timers/report/index.html \
  tests/reports/presenter/vitest-quickpickle-fake-timers/report/index.html \
  tests/reports/fullstack/browser/report/index.html \
; do [ -f "$f" ] && echo "OK   $f" || echo "MISS $f"; done
```

Expected: 16× `OK`, zero `MISS`. (If Task 6 took the Tier-3 fallback, the vitest-browser line is an expected MISS — 15/16 with the gap documented.)

- [ ] **Step 3: Clean removes everything; tree stays clean**

```bash
pnpm clean
ls packages/domain/reports packages/client/reports tests/reports 2>&1   # all "No such file or directory"
git status --short                                                       # clean
```

- [ ] **Step 4: Hand off**

Use superpowers:finishing-a-development-branch.
