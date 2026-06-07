# Test Suite Naming + Layout Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename every test script and folder in `tests/` to the agreed scheme — *name the deviation, leave the default bare* — so each `test:<group>:<suite>` script maps to a `tests/<group>/<suite>/` folder, and add README docs for the test portfolios of `tests/` and `packages/client`.

**Architecture:** Suite-exclusive files (config + support + suite-only code) move into `tests/<group>/<suite>/`; assets shared within a group sit beside them at group level (`browser/steps/`, `browser/scenarios/`, `presenter/scenarios/`, …); `specs/*.feature` stays top-level (shared by all 5 gherkin suites). No behavior changes — every suite must pass identically before and after.

**Tech Stack:** pnpm scripts, cucumber-js, Cypress + @badeball preprocessor, @playwright/test, Vitest + quickpickle, tsx orchestration scripts.

---

## Agreed naming scheme

| old script | new script |
|---|---|
| `test:browser:raw-playwright` | `test:browser:playwright` |
| `test:browser:raw-cypress` | `test:browser:cypress` |
| `test:browser:playwright` | `test:browser:playwright-cucumber` |
| `test:browser:cypress` | `test:browser:cypress-cucumber` |
| `test:browser:cypress:open` | `test:browser:cypress-cucumber:open` |
| `test:presenter:cucumber-real` | `test:presenter:cucumber` |
| `test:presenter:cucumber-fake` | `test:presenter:cucumber-fake-timers` |
| `test:presenter:vitest-plain` | `test:presenter:vitest` |
| `test:presenter:vitest-fake` | `test:presenter:vitest-fake-timers` |

Unchanged: `test:e2e`, `test:fullstack:node`, `test:fullstack:browser`, `gates`, `port:free`, `clean`, `clean:deep`, `typecheck`.

**The user explicitly requires the wording `fake-timers`, never bare `fake`.**

## Target layout

```
tests/
  browser/
    playwright/             ← raw/playwright/            = test:browser:playwright
    cypress/                ← raw/cypress/               = test:browser:cypress
      scenarios/            ← scenarios/cypress/           (queue-aware forks; this suite only)
    playwright-cucumber/    ← support/playwright/ + cucumber.js
    cypress-cucumber/       ← support/cypress/ + cypress.config.ts
    steps/                  ← steps/*.steps.ts             (shared: both *-cucumber suites)
    scenarios/              ← scenarios/*.ts               (shared: playwright, both *-cucumber)
    page-objects/           ← page-objects/                (contracts/ + playwright/ + cypress/)
    testContext.ts          ← support/testContext.ts
  presenter/
    cucumber/               ← support/presenter/cucumber-real/ + cucumber-presenter-real.js
    cucumber-fake-timers/   ← support/presenter/cucumber-fake/ + cucumber-presenter-fake.js
    vitest/                 ← presenter-tests/vitest-plain/ + vitest-presenter-plain.config.ts
    vitest-fake-timers/     ← support/presenter/vitest-fake/ + vitest-presenter-fake.config.ts
      steps/                ← steps/presenter/vitest-fake/   (quickpickle-only)
    steps/                  ← steps/presenter/cucumber-real/ (shared: both cucumber presenter suites)
    scenarios/              ← scenarios/presenter/           (shared: all four presenter suites)
  specs/                    (unchanged — shared by all 5 gherkin suites)
  fullstack/                (unchanged)
  scripts/
    devServer.ts            ← support/devServer.ts
  .cypress-cucumber-preprocessorrc.json  (stays at root; stepDefinitions path updated)
```

Deleted: empty stale dir `tests/steps/cypress/` (and its glob in `cucumber.js`).

**Resolution-anchor facts the implementer must know:**

- Cypress `projectRoot` is the directory containing `tests/package.json` even when `--config-file <subdir>/cypress.config.ts` is passed (today's `raw/cypress/cypress.config.ts` proves it: its `specPattern: "raw/cypress/**"` is tests-root-relative and works). So `specPattern`/`supportFile`/`stepDefinitions` strings stay tests-root-relative.
- cucumber-js config `paths`/`import` globs are CWD-relative (CWD = `tests/`), NOT config-file-relative. They stay tests-root-relative after configs move.
- Vitest resolves `include`/`setupFiles` relative to the vite `root`, which defaults to the config file's directory. Moved vitest configs must pin `root` back to the package root via `fileURLToPath(new URL("../..", import.meta.url))`.
- Playwright resolves `testDir` relative to the config file, so `browser/playwright/playwright.config.ts` keeps `testDir: "."` untouched.
- All suite runs below assume CWD `tests/` (use `pnpm --filter @rtc/tests <script>` from repo root, or `pnpm <script>` inside `tests/`).

---

### Task 1: Branch + move devServer.ts into scripts/

**Files:**
- Move: `tests/support/devServer.ts` → `tests/scripts/devServer.ts`
- Modify: `tests/scripts/with-server.ts:3`, `tests/scripts/free-port.ts` (import paths)

- [ ] **Step 1: Create branch**

```bash
git checkout -b refactor/test-suite-naming
```

- [ ] **Step 2: Move the file**

```bash
cd tests
git mv support/devServer.ts scripts/devServer.ts
```

- [ ] **Step 3: Update the two importers**

In `tests/scripts/with-server.ts` and `tests/scripts/free-port.ts` replace:

```ts
from "../support/devServer"
```

with:

```ts
from "./devServer"
```

- [ ] **Step 4: Update the third importer, `tests/support/playwright/hooks.ts`**

Replace:

```ts
from "../devServer"
```

with:

```ts
from "../../scripts/devServer"
```

From `tests/support/playwright/` (two levels below `tests/`) this resolves to `tests/scripts/devServer` — and the depth is the same after Task 2 moves the file to `tests/browser/playwright-cucumber/` (also two levels deep), so Task 2 does not need to touch this import again.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @rtc/tests typecheck     # expect: clean
pnpm --filter @rtc/tests port:free     # expect: runs without module-resolution error
grep -rn "support/devServer" tests --include='*.ts' | grep -v node_modules   # expect: no output
```

```bash
git add -A
git commit -m "refactor(tests): move devServer.ts into scripts/"
```

Note: `scripts/**` is not in the tsconfig include yet (it never was), so typecheck alone doesn't prove the `with-server.ts`/`free-port.ts` edits — the `port:free` run above does, and Task 2's suite runs exercise `with-server.ts`.

---

### Task 2: Restructure the browser group

**Files:**
- Move: `tests/raw/playwright/` → `tests/browser/playwright/`
- Move: `tests/raw/cypress/` → `tests/browser/cypress/`
- Move: `tests/scenarios/cypress/` → `tests/browser/cypress/scenarios/`
- Move: `tests/page-objects/` → `tests/browser/page-objects/`
- Move: `tests/support/testContext.ts` → `tests/browser/testContext.ts`
- Move: `tests/steps/*.steps.ts` → `tests/browser/steps/`
- Move: `tests/scenarios/*.ts` (files only) → `tests/browser/scenarios/`
- Move: `tests/support/playwright/` → `tests/browser/playwright-cucumber/`
- Move: `tests/cucumber.js` → `tests/browser/playwright-cucumber/cucumber.js`
- Move: `tests/support/cypress/` → `tests/browser/cypress-cucumber/`
- Move: `tests/cypress.config.ts` → `tests/browser/cypress-cucumber/cypress.config.ts`
- Delete: empty `tests/steps/cypress/`, empty `tests/raw/`
- Modify: `tests/package.json` (browser scripts), `tests/.cypress-cucumber-preprocessorrc.json`, `tests/tsconfig.json`, moved files' imports/configs

- [ ] **Step 1: Execute the moves**

```bash
cd tests
mkdir -p browser/steps browser/scenarios
git mv raw/playwright browser/playwright
git mv raw/cypress browser/cypress
git mv scenarios/cypress browser/cypress/scenarios
git mv page-objects browser/page-objects
git mv support/testContext.ts browser/testContext.ts
git mv steps/*.steps.ts browser/steps/
git mv scenarios/*.ts browser/scenarios/
git mv support/playwright browser/playwright-cucumber
git mv cucumber.js browser/playwright-cucumber/cucumber.js
git mv support/cypress browser/cypress-cucumber
git mv cypress.config.ts browser/cypress-cucumber/cypress.config.ts
rmdir steps/cypress raw
```

(`scenarios/` and `steps/` still contain `presenter/` — they empty out in Task 3.)

- [ ] **Step 2: Rewrite imports in moved files (mechanical seds, run from `tests/`)**

```bash
# steps + shared scenarios: support/testContext is now a sibling of their parent
sed -i 's|"\.\./support/testContext"|"../testContext"|' browser/steps/*.steps.ts browser/scenarios/*.ts

# cypress scenario forks: ../../support/testContext → ../../testContext ; ../assert → ../../scenarios/assert
sed -i 's|"\.\./\.\./support/testContext"|"../../testContext"|; s|"\.\./assert"|"../../scenarios/assert"|' browser/cypress/scenarios/*.ts

# native playwright suite: one level shallower to package-shared dirs
sed -i 's|"\.\./\.\./page-objects/|"../page-objects/|; s|"\.\./\.\./support/testContext"|"../testContext"|; s|"\.\./\.\./scenarios/|"../scenarios/|' browser/playwright/*.ts

# native cypress suite: same, plus its scenario forks are now local
sed -i 's|"\.\./\.\./page-objects/|"../page-objects/|; s|"\.\./\.\./support/testContext"|"../testContext"|; s|"\.\./\.\./scenarios/cypress/|"./scenarios/|' browser/cypress/*.ts

# cucumber worlds: page-objects one level shallower ("../testContext" already correct at new depth)
sed -i 's|"\.\./\.\./page-objects/|"../page-objects/|' browser/playwright-cucumber/world.ts browser/cypress-cucumber/world.ts

# testContext itself: page-objects is now a sibling
sed -i 's|"\.\./page-objects/contracts"|"./page-objects/contracts"|' browser/testContext.ts
```

- [ ] **Step 3: Verify no stale relative imports remain**

```bash
grep -rn '\.\./support/\|\.\./\.\./scenarios/cypress\|"\.\./assert"' browser/ | grep -v node_modules
# expect: no output
```

- [ ] **Step 4: Update `browser/playwright-cucumber/cucumber.js`**

Replace the `import:` array and the html report name; drop the stale `steps/cypress` glob; fix the script name in the header comment:

```js
// - No `loader: ["tsx/esm"]` here. tsx 4.21+'s initialize hook throws when
//   Cucumber invokes it via `node:module.register(specifier)` (Cucumber omits
//   the `data` arg). Instead, tsx is loaded via NODE_OPTIONS in
//   tests/package.json `test:browser:playwright-cucumber` script:
//   `NODE_OPTIONS='--import tsx/esm'`.
//
// All paths below are CWD-relative (cucumber-js runs from tests/), not
// config-file-relative.

export default {
  paths: ["specs/**/*.feature"],
  import: [
    "browser/testContext.ts",
    "browser/playwright-cucumber/*.ts",
    "browser/steps/*.steps.ts",
  ],
  format: ["progress-bar", "html:reports/playwright-cucumber.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: process.env.CI ? 2 : 0,
  // Browser peers can't inject gateway lifecycle events through the DOM, so the
  // presenter-only reconnect scenario is excluded here. The presenter cucumber
  // configs override this with `tags: "@presenter"` and still run it.
  tags: "not @presenterOnly",
};
```

(Keep the existing "Cucumber 11 ESM config notes" comment block above; only the script-name line changes.)

- [ ] **Step 5: Update `browser/cypress-cucumber/cypress.config.ts`**

Two string changes (everything else stays):

```ts
      supportFile: "browser/cypress-cucumber/e2e.ts",   // was "support/cypress/e2e.ts"
```

and in the `aliasCucumber` plugin (shim is now a sibling of the config):

```ts
      path: path.resolve(
        new URL(".", import.meta.url).pathname,
        "cucumber-shim.ts"                              // was "support/cypress/cucumber-shim.ts"
      ),
```

- [ ] **Step 6: Update `browser/cypress/cypress.config.ts` (native suite)**

```ts
    specPattern: "browser/cypress/**/*.spec.ts",   // was "raw/cypress/**/*.spec.ts"
    supportFile: "browser/cypress/_context.ts",    // was "raw/cypress/_context.ts"
```

(`specPattern` only matches `*.spec.ts`, so the new `browser/cypress/scenarios/*.ts` forks are not picked up as specs.)

`browser/playwright/playwright.config.ts` needs **no** changes (`testDir: "."` is config-file-relative).

- [ ] **Step 7: Update `tests/.cypress-cucumber-preprocessorrc.json`**

```json
{
  "stepDefinitions": ["browser/steps/*.steps.ts"],
  "omitFiltered": true,
  "filterSpecs": true,
  "json": { "enabled": false },
  "html": { "enabled": true, "output": "reports/cypress-cucumber.html" }
}
```

- [ ] **Step 8: Update the five browser scripts in `tests/package.json`**

```json
    "test:browser:cypress": "tsx scripts/with-server.ts cypress run --headless --config-file browser/cypress/cypress.config.ts",
    "test:browser:cypress-cucumber": "CYPRESS_TAGS='not @presenterOnly' tsx scripts/with-server.ts cypress run --headless --config-file browser/cypress-cucumber/cypress.config.ts",
    "test:browser:cypress-cucumber:open": "CYPRESS_TAGS='not @presenterOnly' tsx scripts/with-server.ts cypress open --e2e --config-file browser/cypress-cucumber/cypress.config.ts",
    "test:browser:playwright": "tsx scripts/with-server.ts playwright test --config browser/playwright/playwright.config.ts",
    "test:browser:playwright-cucumber": "NODE_OPTIONS='--import tsx/esm' tsx scripts/with-server.ts cucumber-js --config browser/playwright-cucumber/cucumber.js",
```

Delete the old `test:browser:raw-cypress` / `test:browser:raw-playwright` entries (their commands moved onto the bare names above). Keep keys alphabetically sorted.

- [ ] **Step 9: Update `tests/tsconfig.json` include (transitional — presenter dirs move in Task 3)**

Mirrors the original include scope (raw/page-objects/cucumber.js/cypress.config.ts are now under `browser/**`; presenter steps/support stay until Task 3), plus `scripts/**` which gains `devServer.ts`:

```json
  "include": [
    "browser/**/*.ts",
    "browser/playwright-cucumber/cucumber.js",
    "steps/**/*.ts",
    "support/**/*.ts",
    "fullstack/**/*.ts",
    "scripts/**/*.ts"
  ]
```

If adding `scripts/**` surfaces pre-existing type errors in `run-all.ts`/`grep-gates.ts` (they were never tsc-included before, only run via tsx), fix them — they will be trivial.

- [ ] **Step 10: Verify all four browser suites + typecheck**

```bash
pnpm --filter @rtc/tests typecheck                          # expect: clean
pnpm --filter @rtc/tests test:browser:playwright            # expect: all specs pass
pnpm --filter @rtc/tests test:browser:playwright-cucumber   # expect: all scenarios pass
pnpm --filter @rtc/tests test:browser:cypress               # expect: all specs pass
pnpm --filter @rtc/tests test:browser:cypress-cucumber      # expect: all scenarios pass
```

Each script boots its own dev server via with-server (port 3000 default). Run them sequentially, not in parallel, to avoid port collision.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(tests): suite-first layout for browser group; bare = native, -cucumber = gherkin"
```

---

### Task 3: Restructure the presenter group

**Files:**
- Move: `tests/support/presenter/cucumber-real/` → `tests/presenter/cucumber/`
- Move: `tests/cucumber-presenter-real.js` → `tests/presenter/cucumber/cucumber.js`
- Move: `tests/support/presenter/cucumber-fake/` → `tests/presenter/cucumber-fake-timers/`
- Move: `tests/cucumber-presenter-fake.js` → `tests/presenter/cucumber-fake-timers/cucumber.js`
- Move: `tests/support/presenter/vitest-fake/` → `tests/presenter/vitest-fake-timers/`
- Move: `tests/vitest-presenter-fake.config.ts` → `tests/presenter/vitest-fake-timers/vitest.config.ts`
- Move: `tests/steps/presenter/vitest-fake/` → `tests/presenter/vitest-fake-timers/steps/`
- Move: `tests/presenter-tests/vitest-plain/` → `tests/presenter/vitest/`
- Move: `tests/vitest-presenter-plain.config.ts` → `tests/presenter/vitest/vitest.config.ts`
- Move: `tests/steps/presenter/cucumber-real/` → `tests/presenter/steps/`
- Move: `tests/scenarios/presenter/` → `tests/presenter/scenarios/`
- Delete: now-empty `tests/steps/`, `tests/support/`, `tests/scenarios/`, `tests/presenter-tests/`
- Modify: `tests/package.json` (presenter scripts), `tests/tsconfig.json` (final include), moved files' imports/configs

- [ ] **Step 1: Execute the moves**

```bash
cd tests
mkdir -p presenter
git mv support/presenter/cucumber-real presenter/cucumber
git mv cucumber-presenter-real.js presenter/cucumber/cucumber.js
git mv support/presenter/cucumber-fake presenter/cucumber-fake-timers
git mv cucumber-presenter-fake.js presenter/cucumber-fake-timers/cucumber.js
git mv support/presenter/vitest-fake presenter/vitest-fake-timers
git mv vitest-presenter-fake.config.ts presenter/vitest-fake-timers/vitest.config.ts
git mv steps/presenter/vitest-fake presenter/vitest-fake-timers/steps
git mv presenter-tests/vitest-plain presenter/vitest
git mv vitest-presenter-plain.config.ts presenter/vitest/vitest.config.ts
git mv steps/presenter/cucumber-real presenter/steps
git mv scenarios/presenter presenter/scenarios
rmdir steps/presenter steps support/presenter support scenarios presenter-tests
```

- [ ] **Step 2: Rewrite imports in moved files**

```bash
# shared cucumber steps (presenter/steps/): scenarios + world paths
sed -i 's|"\.\./\.\./\.\./scenarios/presenter/_shared/|"../scenarios/_shared/|; s|"\.\./\.\./\.\./support/presenter/cucumber-real/world"|"../cucumber/world"|' presenter/steps/*.steps.ts

# quickpickle steps (presenter/vitest-fake-timers/steps/): scenarios + world paths
sed -i 's|"\.\./\.\./\.\./scenarios/presenter/_shared/|"../../scenarios/_shared/|; s|"\.\./\.\./\.\./support/presenter/vitest-fake/world"|"../world"|' presenter/vitest-fake-timers/steps/*.steps.ts

# suite support files (hooks/world/setup): scenarios one level up now
sed -i 's|"\.\./\.\./\.\./scenarios/presenter/|"../scenarios/|' presenter/cucumber/*.ts presenter/cucumber-fake-timers/*.ts presenter/vitest-fake-timers/*.ts

# setup.ts barrel: step files are now a local subfolder
sed -i 's|"\.\./\.\./\.\./steps/presenter/vitest-fake/|"./steps/|' presenter/vitest-fake-timers/setup.ts

# vitest plain tests: scenarios path
sed -i 's|"\.\./\.\./scenarios/presenter/|"../scenarios/|' presenter/vitest/*.ts
```

- [ ] **Step 3: Verify no stale relative imports remain**

```bash
grep -rn 'scenarios/presenter\|support/presenter\|steps/presenter\|presenter-tests' presenter/ | grep -v node_modules
# expect: no output (comments mentioning old paths may appear — update any hits in comments too, then re-run)
```

- [ ] **Step 4: Rewrite `presenter/cucumber/cucumber.js` (real timers = bare default)**

```js
// tests/presenter/cucumber/cucumber.js — cucumber-js against live presenters,
// REAL timers (the default; the fake-timers variant lives in ../cucumber-fake-timers).
// All paths are CWD-relative (cucumber-js runs from tests/), not config-file-relative.
export default {
  paths: ["specs/**/*.feature"],
  import: [
    "presenter/cucumber/*.ts",
    "presenter/scenarios/_buildApp.ts",
    "presenter/scenarios/_shared/**/*.ts",
    "presenter/steps/**/*.ts",
  ],
  tags: "@presenter",
  format: ["progress-bar", "html:reports/cucumber-presenter.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: 0,
};
```

- [ ] **Step 5: Rewrite `presenter/cucumber-fake-timers/cucumber.js`**

```js
// tests/presenter/cucumber-fake-timers/cucumber.js — cucumber-js against live
// presenters with @sinonjs/fake-timers (virtual time; see hooks.ts).
// All paths are CWD-relative (cucumber-js runs from tests/), not config-file-relative.
export default {
  paths: ["specs/**/*.feature"],
  import: [
    "presenter/cucumber-fake-timers/*.ts",
    "presenter/scenarios/_buildApp.ts",
    "presenter/scenarios/_await.ts",
    "presenter/scenarios/_shared/**/*.ts",
    "presenter/steps/**/*.ts",
  ],
  tags: "@presenter",
  format: ["progress-bar", "html:reports/cucumber-presenter-fake-timers.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: 0,
};
```

- [ ] **Step 6: Rewrite `presenter/vitest-fake-timers/vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import quickpickle from "quickpickle";

export default defineConfig({
  // The config lives two levels below the package root; pin `root` back to
  // tests/ so include/setupFiles stay package-root-relative like every suite.
  root: fileURLToPath(new URL("../..", import.meta.url)),
  // qpickle-loader's internal step-timeout uses global setTimeout, which
  // vi.useFakeTimers() patches. A step calling vi.advanceTimersByTimeAsync(N)
  // also fires that timeout if N >= stepTimeout. Current worst case:
  // buyNTimesWithDismissals(n=5) advances ~30s of virtual time per call.
  // Keep stepTimeout > the largest single advancement across all @presenter
  // steps. Default (3000ms) is far too small for fake-timer scenarios.
  plugins: [quickpickle({ stepTimeout: 60_000 })],
  test: {
    include: ["specs/**/*.feature"],
    setupFiles: ["./presenter/vitest-fake-timers/setup.ts"],
    testNamePattern: "@presenter",
    reporters: ["default"],
    pool: "threads",
  },
});
```

- [ ] **Step 7: Rewrite `presenter/vitest/vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The config lives two levels below the package root; pin `root` back to
  // tests/ so `include` stays package-root-relative like every other suite.
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    include: ["presenter/vitest/**/*.test.ts"],
    reporters: ["default"],
    pool: "threads",
  },
});
```

- [ ] **Step 8: Update the four presenter scripts in `tests/package.json`**

```json
    "test:presenter:cucumber": "NODE_OPTIONS='--import tsx/esm' cucumber-js --config presenter/cucumber/cucumber.js",
    "test:presenter:cucumber-fake-timers": "NODE_OPTIONS='--import tsx/esm' cucumber-js --config presenter/cucumber-fake-timers/cucumber.js",
    "test:presenter:vitest": "vitest run --config presenter/vitest/vitest.config.ts",
    "test:presenter:vitest-fake-timers": "vitest run --config presenter/vitest-fake-timers/vitest.config.ts",
```

Delete the four old `test:presenter:*` entries. Keep keys alphabetically sorted.

- [ ] **Step 9: Final `tests/tsconfig.json` include**

```json
  "include": [
    "browser/**/*.ts",
    "browser/playwright-cucumber/cucumber.js",
    "presenter/**/*.ts",
    "presenter/cucumber/cucumber.js",
    "presenter/cucumber-fake-timers/cucumber.js",
    "fullstack/**/*.ts",
    "scripts/**/*.ts"
  ]
```

Note: `presenter/**/*.ts` newly pulls the plain vitest tests and the vitest configs into tsc (previously only checked by vitest at runtime). If that surfaces type errors, fix them — they will be trivial.

- [ ] **Step 10: Verify all four presenter suites + typecheck**

```bash
pnpm --filter @rtc/tests typecheck                              # expect: clean
pnpm --filter @rtc/tests test:presenter:cucumber                # expect: 20 scenarios pass
pnpm --filter @rtc/tests test:presenter:cucumber-fake-timers    # expect: 20 scenarios pass
pnpm --filter @rtc/tests test:presenter:vitest                  # expect: all tests pass
pnpm --filter @rtc/tests test:presenter:vitest-fake-timers      # expect: all tests pass
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(tests): suite-first layout for presenter group; fake-timers named, defaults bare"
```

---

### Task 4: Update orchestration (run-all), gates (grep-gates), .gitignore

**Files:**
- Modify: `tests/scripts/run-all.ts` (suite script names)
- Modify: `tests/scripts/grep-gates.ts` (all path references)
- Modify: `tests/.gitignore` (report-name entries)

- [ ] **Step 1: Update suite names in `tests/scripts/run-all.ts`**

Replace the `browserScripts` array (keep order — it bakes the port map: 3001..3004):

```ts
const browserScripts = [
  "test:browser:playwright-cucumber",
  "test:browser:playwright",
  "test:browser:cypress-cucumber",
  "test:browser:cypress",
];
```

Replace the presenter entries in `suites`:

```ts
  // Presenter peers — in-process, no server, mutually independent.
  { script: "test:presenter:cucumber" },
  { script: "test:presenter:cucumber-fake-timers" },
  { script: "test:presenter:vitest-fake-timers" },
  { script: "test:presenter:vitest" },
```

(`isolateDisplay: script.includes("cypress")` still works for both cypress suites.)

- [ ] **Step 2: Update `tests/scripts/grep-gates.ts` — custom checks**

In `checkPresenterScenarioCounts` (line ~35) and `checkPresenterDescribePrefix` (line ~61):

```ts
    const testPath = `presenter/vitest/${feat}.test.ts`;   // was presenter-tests/vitest-plain/
```

In `checkVitestFakeBarrelCompleteness` (line ~78):

```ts
  const stepsDir = "presenter/vitest-fake-timers/steps";
  const setupPath = "presenter/vitest-fake-timers/setup.ts";
```

and the marker (line ~85):

```ts
    const importMarker = `./steps/${stem}`;
```

- [ ] **Step 3: Update `tests/scripts/grep-gates.ts` — GATES array paths/excludes**

| gate | new `paths` | new `excludes` |
|---|---|---|
| 1 | `["."]` (unchanged) | `["browser/page-objects/contracts/testids.ts", "/node_modules/"]` |
| 2 | `["browser/page-objects/contracts/"]` | unchanged |
| 3 | unchanged (`specs/`) | unchanged |
| 4 | `["browser/page-objects/"]` | unchanged |
| 5 | `["browser/scenarios/", "browser/cypress/scenarios/", "presenter/scenarios/"]` | unchanged |
| 6 | `["browser/steps/", "presenter/steps/", "presenter/vitest-fake-timers/steps/"]` | unchanged |
| 7 | `["browser/page-objects/"]` | unchanged |
| 8 | `["browser/steps/", "presenter/steps/", "presenter/vitest-fake-timers/steps/"]` | unchanged |
| 9 | `["browser/playwright/"]` | `["/node_modules/", "browser/playwright/playwright.config.ts", "browser/playwright/_context.ts"]` |
| 10 | `["browser/playwright/"]` | `["/node_modules/", "browser/playwright/_context.ts"]` |
| 11 | `["browser/playwright/"]` | `["/node_modules/", "browser/playwright/_context.ts"]` |
| 12 | `["browser/cypress/"]` | `["/node_modules/", "browser/cypress/cypress.config.ts", "browser/cypress/_context.ts", "browser/cypress/scenarios/"]` |
| 13 | `["browser/cypress/"]` | `["/node_modules/", "browser/cypress/_context.ts", "browser/cypress/scenarios/"]` |
| 14 | `["browser/cypress/"]` | `["/node_modules/", "browser/cypress/_context.ts", "browser/cypress/scenarios/"]` |
| 15 | `["presenter/steps/", "presenter/scenarios/", "presenter/cucumber/", "presenter/cucumber-fake-timers/"]` | `["/node_modules/"]` (the `/vitest-fake/` exclude is obsolete — that dir is no longer under these paths) |
| 16 | `["presenter/steps/", "presenter/vitest-fake-timers/steps/", "presenter/scenarios/"]` | unchanged |
| 17 | `["presenter/steps/", "presenter/scenarios/", "presenter/cucumber/", "presenter/cucumber-fake-timers/", "presenter/vitest-fake-timers/"]` | `["/node_modules/", "presenter/scenarios/_buildApp.ts"]` |
| 18 | `["presenter/scenarios/_shared/"]` | unchanged |
| 19 | `["presenter/scenarios/", "presenter/cucumber/", "presenter/cucumber-fake-timers/", "presenter/steps/"]` | unchanged |
| 20 | `["presenter/vitest/"]` | unchanged |
| 23 | unchanged (`../packages/domain/...`) | unchanged |

Gates 12–14 gain the `browser/cypress/scenarios/` exclude because the queue-aware scenario forks (which legitimately use `cy.*` / `ctx.po.*`) now live inside the suite folder; the gates' intent is to keep those idioms out of *spec bodies* only. Also update gate names 9–14: replace the word "raw" with "native" (e.g. "9. No raw @playwright/test imports in native Playwright test bodies") and gate 19/20/24 names: `vitest-fake` → `vitest-fake-timers`, `vitest-plain` → `vitest` (e.g. gate 20: "No Gherkin loader imports in the plain vitest peer").

- [ ] **Step 4: Update `tests/.gitignore` report names**

```
node_modules/
reports/
cypress/screenshots/
cypress/videos/
cucumber-presenter-fake-timers.html
cucumber-presenter.html
playwright-cucumber.html
cypress-cucumber.html
```

- [ ] **Step 5: Verify gates and the full orchestrated run**

```bash
pnpm --filter @rtc/tests gates       # expect: all 25 gates PASS
pnpm --filter @rtc/tests typecheck   # expect: clean
pnpm test:e2e                        # expect: 10/10 suites pass
```

`test:e2e` is the real proof: it exercises every renamed script name through run-all, with-server, ports, and xvfb isolation.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(tests): point run-all + grep-gates + gitignore at renamed suites"
```

---

### Task 5: Write `tests/README.md`

**Files:**
- Create: `tests/README.md`

- [ ] **Step 1: Write the file**

````markdown
# @rtc/tests — cross-package test suites

Browser e2e, presenter integration, and full-stack smoke suites. Unit tests and
visual-diff tests live inside each package (see `packages/client/README.md`).

## Naming convention

**Name the deviation, leave the default bare.**

- `test:<group>:<suite>` ⇒ code lives at `tests/<group>/<suite>/`.
- Bare `cypress` / `playwright` = the runner's **native** authoring style (the
  default). The `-cucumber` suffix marks the Gherkin-driven variants.
- Bare presenter suites run **real timers** (the default). The `-fake-timers`
  suffix marks virtual-time variants (`@sinonjs/fake-timers` under cucumber,
  `vi.useFakeTimers` under vitest).

## Scripts

| script | what it runs | server |
|---|---|---|
| `test:e2e` | gates, then ALL 10 suites below in parallel via `scripts/run-all.ts` | per-suite |
| `test:browser:playwright` | native `@playwright/test` specs, `browser/playwright/` | dev server |
| `test:browser:cypress` | native Cypress Mocha specs, `browser/cypress/` | dev server |
| `test:browser:playwright-cucumber` | cucumber-js driving Playwright, `specs/*.feature` + `browser/steps/` | dev server |
| `test:browser:cypress-cucumber` | Cypress + @badeball preprocessor, same features/steps | dev server |
| `test:browser:cypress-cucumber:open` | the above in the interactive Cypress runner | dev server |
| `test:presenter:cucumber` | cucumber-js against live presenters (in-process simulators), real timers | none |
| `test:presenter:cucumber-fake-timers` | same scenarios under `@sinonjs/fake-timers` | none |
| `test:presenter:vitest` | same scenarios as plain vitest `it()` blocks (no Gherkin) | none |
| `test:presenter:vitest-fake-timers` | same `.feature` files via quickpickle + `vi.useFakeTimers` | none |
| `test:fullstack:node` / `test:fullstack:browser` | smoke against the REAL server (no simulators) | own server |
| `gates` | 25 grep/custom architecture gates (`scripts/grep-gates.ts`) | none |
| `port:free` | frees the dev-server port (`RTC_DEV_PORT`, default 3000) | — |

## Layout

```
browser/
  playwright/           native Playwright suite (config + specs + fixture)
  cypress/              native Cypress suite (config + specs + getCtx)
    scenarios/          queue-aware scenario forks — used ONLY by this suite
  playwright-cucumber/  cucumber.js config + world/hooks
  cypress-cucumber/     cypress config + world/e2e support + cucumber shim
  steps/                Gherkin step defs — shared by BOTH *-cucumber suites
  scenarios/            async scenario layer — shared by playwright, *-cucumber
  page-objects/         contracts/ (driver-free) + playwright/ + cypress/ impls
  testContext.ts        driver-agnostic ctx: { po, scratch }
presenter/
  cucumber/             cucumber.js config + world/hooks (real timers)
  cucumber-fake-timers/ cucumber.js config + world/hooks (virtual time)
  vitest/               vitest config + plain *.test.ts files
  vitest-fake-timers/   vitest config + quickpickle setup + steps/
  steps/                step defs — shared by BOTH cucumber presenter suites
  scenarios/            _buildApp seam + _shared/ — shared by all four peers
specs/                  .feature files — shared by all 5 Gherkin-driven suites
fullstack/              node + browser smokes against the real server
scripts/                run-all, with-server, devServer, free-port, grep-gates
```

Path-resolution rule: cucumber `import:` globs, cypress `specPattern`/
`supportFile`, and the preprocessorrc `stepDefinitions` are all **tests-root
relative** (CWD/projectRoot = `tests/`), even though the config files live in
suite folders. The vitest configs pin `root` back to `tests/` explicitly.

## Orchestration

`test:e2e` → `scripts/run-all.ts`: every suite runs concurrently; each browser
suite gets its own dev server on `RTC_DEV_PORT` 3001–3004 (via
`scripts/with-server.ts`); Cypress suites get private X displays via
`xvfb-run -a` on Linux. `RTC_E2E_MAX_PARALLEL=n` caps concurrency (CI uses 2).
Wall-clock ≈ the slowest single suite.

## Why so many overlapping suites?

The browser pairs and the four presenter peers intentionally implement the
same behavior specs on different stacks — they are a comparison artifact and
portability proof for the clean-architecture seams (see
`docs/architecture.md` §9). The shared layers (`specs/`, `steps/`,
`scenarios/`, `page-objects/contracts/`) are the deliverable; the per-suite
folders show how little each stack needs on top.
````

- [ ] **Step 2: Cross-check the script table against `tests/package.json`**

```bash
grep -o '"test:[a-z:-]*"' tests/package.json | sort
```

Every script listed must appear in the README table (and vice versa).

- [ ] **Step 3: Commit**

```bash
git add tests/README.md
git commit -m "docs(tests): README documenting suite naming, layout, and scripts"
```

---

### Task 6: Write `packages/client/README.md`

**Files:**
- Create: `packages/client/README.md` (verify it does not exist first — it didn't at planning time)

- [ ] **Step 1: Write the file**

````markdown
# @rtc/client — React UI

React + RxJS + Vite client. Clean-architecture seam: components read ALL data
through `useHooks()` (`AppHooks` interface); production wires presenters via
`@react-rxjs/core`, tests inject fakes through `HooksProvider`.

## Scripts

| script | purpose |
|---|---|
| `dev` | Vite dev server |
| `build` / `build-types` | Vite build + `.d.ts` emit |
| `typecheck` | app + node + visual tsconfigs |
| `test` | **unit tier** — Vitest (jsdom): presenters, adapters, hooks |
| `test:visual` | **visual tier** — every runner × every framework, in parallel |
| `test:visual:react` | all visual runners, react only |
| `test:visual:playwright-ct:react[:update\|:ui]` | Tier 1 — Playwright Component Testing |
| `test:visual:playwright:react[:update\|:ui]` | Tier 2 — plain Playwright over a Vite host page |
| `test:visual:vitest-browser:react[:update]` | Tier 3 — Vitest browser mode (`toMatchScreenshot`) |
| `clean` / `clean:deep` | remove build/test artifacts (/ + node_modules) |

## Test portfolio

**Unit (`pnpm test`)** — `src/**/*.test.ts(x)`: presenter streams
(`src/app/presenters/__tests__/`), WS adapters incl. real-gateway contract
tests (`src/app/adapters/`), UI hooks. No browser, no screenshots.

**Visual (`pnpm test:visual`)** — screenshots of components and full pages
rendered against injected fake data via the `HooksProvider` seam; no server,
no presenters. Three runners share one scenario manifest
(`visual/shared/scenarios.ts`); goldens are committed in TWO sets per runner —
`react/` (CI, x86) and `react-local/<arch>/` (fast local feedback). UI changes
require regenerating BOTH sets (`:update` scripts locally; the
`update-visual-goldens` workflow for the CI set). Full details: ADR + layout in
[`visual/README.md`](visual/README.md).

Script naming: `test:visual:<runner>:<framework>` — the framework axis exists
because the goldens + `visual/shared/` fixtures are the portability contract
for re-implementing this UI in another framework (e.g. SolidJS) with
pixel-parity; a future `:solid` runner is discovered by `visual/run-all.ts`
automatically.

**Browser e2e / presenter integration** — NOT here; they live in the
[`tests/`](../../tests/README.md) workspace package.
````

- [ ] **Step 2: Cross-check against `packages/client/package.json` scripts and `visual/README.md`**

```bash
grep -o '"[a-z:-]*":' packages/client/package.json | head -20
```

Every script must be covered. Verify the golden-set folder names (`react/`, `react-local/<arch>/`) against `packages/client/visual/README.md` ("Goldens: two committed sets" section) and adjust wording if it drifted.

- [ ] **Step 3: Commit**

```bash
git add packages/client/README.md
git commit -m "docs(client): README documenting scripts and the unit/visual test portfolio"
```

---

### Task 7: Update root README, docs/architecture.md, STATUS note

**Files:**
- Modify: `README.md:195-210` (test-suite command block)
- Modify: `docs/architecture.md` (~lines 1200–1350: §9 path/table references)
- Modify: `docs/superpowers/STATUS.md` (append a rename note; do NOT rewrite history)

- [ ] **Step 1: Root README command block (lines ~195–210)**

Replace the old commands with:

```
pnpm --filter @rtc/tests test:browser:playwright            # native Playwright
pnpm --filter @rtc/tests test:browser:playwright-cucumber   # Cucumber + Playwright
pnpm --filter @rtc/tests test:browser:cypress               # native Cypress
pnpm --filter @rtc/tests test:browser:cypress-cucumber      # Cucumber + Cypress
pnpm --filter @rtc/tests test:browser:cypress-cucumber:open # Cypress interactive runner

pnpm --filter @rtc/tests test:presenter:cucumber              # real timers (default)
pnpm --filter @rtc/tests test:presenter:cucumber-fake-timers
pnpm --filter @rtc/tests test:presenter:vitest                # plain vitest (no Gherkin)
pnpm --filter @rtc/tests test:presenter:vitest-fake-timers
```

Add directly below: `See tests/README.md for the full suite matrix and naming convention.`

- [ ] **Step 2: docs/architecture.md path mapping**

Apply this old→new string mapping throughout the file (mostly §9, lines ~1200–1350). These are **living** architecture docs, unlike the dated plans/specs under `docs/superpowers/` which stay untouched as historical records:

| old string | new string |
|---|---|
| `tests/raw/playwright/` | `tests/browser/playwright/` |
| `tests/raw/cypress/` | `tests/browser/cypress/` |
| `tests/scenarios/cypress/` | `tests/browser/cypress/scenarios/` |
| `tests/scenarios/*.ts` | `tests/browser/scenarios/*.ts` |
| `tests/scenarios/presenter/` | `tests/presenter/scenarios/` |
| `tests/steps/*.steps.ts` | `tests/browser/steps/*.steps.ts` |
| `tests/steps/**/*.ts` | `tests/browser/steps/` + `tests/presenter/steps/` (rephrase the table row) |
| `tests/steps/presenter/cucumber-real/` | `tests/presenter/steps/` |
| `tests/steps/presenter/vitest-fake/` | `tests/presenter/vitest-fake-timers/steps/` |
| `tests/support/playwright/` | `tests/browser/playwright-cucumber/` |
| `tests/support/cypress/` | `tests/browser/cypress-cucumber/` |
| `tests/support/presenter/cucumber-real/` | `tests/presenter/cucumber/` |
| `tests/support/{playwright,cypress}/` | `tests/browser/{playwright-cucumber,cypress-cucumber}/` |
| `tests/cypress.config.ts` | `tests/browser/cypress-cucumber/cypress.config.ts` |
| `tests/presenter-tests/vitest-plain/` | `tests/presenter/vitest/` |
| `presenter-tests/vitest-plain/` | `presenter/vitest/` |
| `scenarios/presenter/_buildApp.ts` | `presenter/scenarios/_buildApp.ts` |
| `vitest-fake/setup.ts` | `vitest-fake-timers/setup.ts` |
| `tests/steps/presenter/vitest-fake/` | `tests/presenter/vitest-fake-timers/steps/` |
| `vitest-presenter-plain runner` | `presenter vitest runner` (rephrase) |
| "Raw Playwright" / "Raw Cypress" prose labels | "native Playwright" / "native Cypress" (keep historical phase names like "Phase 5A.4" intact) |

Where the doc references old *script* names (`test:browser:raw-*`, `test:presenter:*-fake/-real/-plain`), update to the new names per the scheme table at the top of this plan.

- [ ] **Step 3: Verify no stale references remain in living docs**

```bash
grep -rn 'raw/playwright\|raw/cypress\|scenarios/cypress\|support/cypress\|support/playwright\|support/presenter\|presenter-tests\|steps/presenter\|test:browser:raw\|cucumber-real\|cucumber-fake\b\|vitest-fake\b\|vitest-plain' README.md docs/architecture.md tests/ packages/ --include='*.md' --include='*.ts' --include='*.js' --include='*.json' -l 2>/dev/null | grep -v node_modules | grep -v docs/superpowers
# expect: no output (docs/superpowers/* historical plans are excluded on purpose)
```

Investigate and fix any hit (comments in code count — update them).

- [ ] **Step 4: Append a note to `docs/superpowers/STATUS.md`**

Add at the appropriate "latest status" location:

```markdown
## 2026-06-07 — test suite rename + suite-first layout

Scripts and folders renamed to "name the deviation, leave the default bare":
bare = native runner / real timers; `-cucumber` and `-fake-timers` name the
variants. Each `test:<group>:<suite>` script now maps to `tests/<group>/<suite>/`.
Full mapping: `docs/superpowers/plans/2026-06-07-test-suite-naming-restructure.md`.
Historical plans/specs in this folder intentionally keep the old names.
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/architecture.md docs/superpowers/STATUS.md
git commit -m "docs: update living docs to renamed test suites + layout"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full repo checks**

```bash
pnpm typecheck     # expect: clean in all packages
pnpm test          # expect: all unit tests pass
pnpm test:e2e      # expect: gates + 10/10 suites pass
```

- [ ] **Step 2: Confirm nothing references the old names anywhere live**

```bash
git grep -nE 'test:(browser:raw-|browser:cypress:open|presenter:(cucumber-real|cucumber-fake"|vitest-plain|vitest-fake"))' -- . ':!docs/superpowers' ':!node_modules'
# expect: no output
```

- [ ] **Step 3: Hand off**

Use superpowers:finishing-a-development-branch (merge/PR decision belongs to the human).
