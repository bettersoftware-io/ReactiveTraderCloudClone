# `@rtc/web-boot` PR 1: the package and the identical files

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `@rtc/web-boot` and move into it every `src/app` file the two web clients hold in identical form and that does not depend on `buildBrowserPorts`.

**Architecture:** A `tsc`-built, framework-free, DOM-touching package beside `@rtc/boot-splash`. Files move with `git mv` from `client-react`; the `client-solid` copies are deleted. Both clients import the moved code from `@rtc/web-boot`. No behaviour changes.

**Tech Stack:** TypeScript 7 (`tsc --build` + `tsc-alias`), Vitest 5 on jsdom, dependency-cruiser, knip, Vite 8 (rolldown).

**Spec:** `docs/superpowers/specs/2026-10-06-web-boot-package-design.md`

## Global Constraints

- No behaviour change. A moved file's content changes only in its import lines.
- The package imports no `react`, `react-dom`, `solid-js`, client, bindings, `@rtc/shared` or `@rtc/ui-contract`.
- A core is reached from the package's source only through `import()`.
- Coverage gate on the package: statements 95, lines 95, functions 95, branches 85.
- `pnpm check:core-bundle` passes for both clients on the final tree.
- Never run two builds in one checkout at once.
- A client test reads `@rtc/web-boot` through its built `dist`: rebuild the package before judging a client test.
- `pnpm-lock.yaml` is committed, since the importers change.
- Gate the final tree: `/rtc:gauntlet full` after the last edit.

## Review Focus

1. A core in the eager bundle after the move. Expected: `check:core-bundle` reports one lazy chunk per core, none eager.
2. A test that was running in both clients and now runs in neither. Expected: the count of test cases after equals the count in React's copies, plus any case only Solid had.
3. A moved test that passes against a stale `dist` of its own package. Expected: package tests import by relative path or `#/`, never `@rtc/web-boot`.
4. A debug deploy (`RTC_SOURCEMAPS=1`) that cannot map the package to source. Expected: both `vite.config.ts` alias maps carry `@rtc/web-boot`.
5. Tests compiled into `dist` and run twice. Expected: vitest `include` is `src/**` only.

## Rulings made while planning

- **Ruling: PR 1 does not move every identical file.** Five identical test files import `buildBrowserPorts`, which moves in PR 2 (`devtoolsIntegration`, `idleReconnect`, `readDemoAccounts`, `composition.incident`, `coreHost.swap`). They stay in both clients until PR 2, importing what has moved from `@rtc/web-boot`. Cost if wrong: none, they move one PR later.
- **Ruling: `envProduction.test.ts` and `popoutPage.test.ts` stay in each client for now.** Their text is identical, but each reads its own client's `.env.production`, `popout.html` and `vite.config.ts`. PR 3 replaces the pair with one test that loops over both clients. Cost if wrong: two small twins live two PRs longer.
- **Ruling: `LocalStorageSessionStore.test.ts` keeps React's copy.** React's has 6 cases, Solid's 4, and Solid's are a subset. Cost if wrong: a Solid-only case is lost; Task 3 checks the subset claim before deleting.

---

### Task 1: The package skeleton and its wiring

**Files:**
- Create: `packages/web-boot/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `tests/setup/jsdom-storage.ts`
- Modify: `knip.json`, `tsconfig.depcruise.json`, `.dependency-cruiser.mts`, `packages/client-react/package.json`, `packages/client-solid/package.json`, both `vite.config.ts`

**Interfaces:**
- Produces: the package name `@rtc/web-boot`, entry `src/index.ts`, `#/` alias to `./src/*`.

- [ ] **Step 1: Write the package files.** `package.json` copies `packages/layout-dockview/package.json` with these differences: name `@rtc/web-boot`; no `./styles/*` export; `dependencies` are `@rtc/boot-splash`, `@rtc/client-adapters`, `@rtc/client-core-async`, `@rtc/client-core-effect`, `@rtc/client-core-rxjs`, `@rtc/core-api`, `@rtc/devtools-core`, `@rtc/domain` (all `workspace:*`), plus `rxjs` and `@rx-state/core` at the versions `client-react` pins. `tsconfig.json` copies layout-dockview's and adds `"lib": ["ES2022", "DOM", "DOM.Iterable"]` and `references` to each `@rtc` dependency that is a composite project. `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./tests/setup/jsdom-storage.ts"],
    passWithNoTests: true,
    reporters: ["default", ["html", { outputDir: "reports/unit/report" }]],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**", "src/index.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
      // Same bar as the other gated packages (ci.yml).
      thresholds: { statements: 95, lines: 95, functions: 95, branches: 85 },
    },
  },
});
```

`tests/setup/jsdom-storage.ts` is a copy of `packages/client-react/tests/setup/jsdom-storage.ts` (the client keeps its own; it is test scaffolding for a Node quirk, not boot code). `src/index.ts` starts as `export {};`.

- [ ] **Step 2: Wire it.** `knip.json`: an entry like `packages/boot-splash`'s. `tsconfig.depcruise.json`: the pair `"@rtc/web-boot": ["packages/web-boot/src/index.ts"]`, `"@rtc/web-boot/*": ["packages/web-boot/src/*"]`. Both clients' `package.json`: `"@rtc/web-boot": "workspace:*"` in `dependencies`. Both `vite.config.ts` debug alias maps: `"@rtc/web-boot": pkgSrc("web-boot"),`. Both clients' `tsconfig.json` `references`: `{ "path": "../web-boot" }` if the package is composite.

- [ ] **Step 3: Add the two dependency-cruiser rules.** Extend `web-clients-load-cores-lazily`'s `from.path` to `"^packages/(client-(react|solid)|web-boot)/src"` and reword its comment to name `packages/web-boot/src/coreSelection.ts`. Add:

```ts
{
  name: "web-boot-stays-framework-free",
  severity: "error",
  comment:
    "@rtc/web-boot is the boot code both web clients share: browser adapters, the port builder, the core selection and the core host. It may touch the DOM, and it must not import a UI framework, a client, a bindings package, @rtc/shared or @rtc/ui-contract.",
  from: { path: "^packages/web-boot/src" },
  to: {
    path: "(^|node_modules/)(react|react-dom|solid-js)(/|$)|^packages/(client-react|client-solid|client-react-native|react-bindings|solid-bindings|shared|ui-contract)/",
  },
},
```

Add `web-boot` to any allowlist rule that lists the packages a web client may import (grep `.dependency-cruiser.mts` for `boot-splash` in a `pathNot`).

- [ ] **Step 4: Install, build, run the wiring gates.**

Run: `pnpm install && pnpm --filter @rtc/web-boot build && pnpm check:scripts && pnpm check:deps && pnpm lint:dead`
Expected: all exit 0. `check:scripts` names any script the package still lacks; add it.

- [ ] **Step 5: Prove both rules can fail.** Write a mutation spec that adds `import "react";` to `packages/web-boot/src/index.ts` (expects `check:deps` red on `web-boot-stays-framework-free`) and one that adds `import "@rtc/client-core-rxjs";` (expects red on `web-clients-load-cores-lazily`).

Run: `node scripts/mutation-check.mts <spec.json> --keep-going`
Expected: both rows KILLED.

- [ ] **Step 6: Commit.** `feat(web-boot): the package skeleton and its wiring`

### Task 2: Move the source files

**Files (all under `src/app/` in `client-react`, to the same relative path under `packages/web-boot/src/`):**
`bootApp.ts`, `coreHost.ts`, `coreSelection.ts`, `coreSwapCover.ts`, `coreSwapView.ts`, `coverTimings.ts`, `adapters/BrowserConnectionEventsAdapter.ts`, `adapters/LocalStorageDataSourceStore.ts`, `adapters/LocalStorageDockLayoutStore.ts`, `adapters/LocalStorageLayoutPresetStore.ts`, `adapters/LocalStoragePreferencesAdapter.ts`, `adapters/LocalStorageSessionStore.ts`, `theme/MediaQueryColorSchemeAdapter.ts`, `devtools/presenterManifest.ts`.

**Interfaces:**
- Produces: `src/index.ts` re-exports every name a client imports from these files today. The list is derived, not guessed: `grep -rhoE "from \"(#/app/|\./app/|\./|\.\./)[^\"]+\"" ` over each client's `main.tsx`, `AppRoot.tsx`, `index.ts`, `src/app/buildBrowserPorts.ts`, `src/app/devtools/devtoolsHub.ts`, the tree mounts, `src/ui`, `tests/`, and the tests that stay.

- [ ] **Step 1:** `git mv` each file from `client-react`; `git rm` its `client-solid` twin. For the three adapters that differ in comments, keep React's text and drop the "ported from client-react" sentences, which no longer describe anything.
- [ ] **Step 2:** In the moved files, rewrite `#/app/x` imports to `#/x`. Nothing else changes.
- [ ] **Step 3:** Write `src/index.ts` as explicit named re-exports (`export { a, type B } from "#/coreHost";`), one statement per module.
- [ ] **Step 4:** In both clients, rewrite every import of a moved file to `@rtc/web-boot`, merging into one statement per file (`rtc/one-import-per-module`). `scripts/check-manifest-drift.mts`: `WEB` becomes `packages/web-boot/src/devtools/presenterManifest.ts`. Update the path comments that name the old locations in `tests/browser/**`, `.github/workflows/ci.yml`, `deploy.yml`, `scripts/check-core-bundle.mts`, `tests/scripts/lib/coreBundle.ts`, `packages/ui-contract/src/shared/harness/world.ts` and the two `vite.config.ts`.
- [ ] **Step 5:**

Run: `pnpm --filter @rtc/web-boot build && pnpm typecheck && pnpm check:deps && pnpm check:manifest-drift`
Expected: all exit 0.

- [ ] **Step 6: Commit.** `refactor(web-boot): the shared boot sources move out of both clients`

### Task 3: Move the tests

**Files (React's copy moves, Solid's is deleted):** `bootApp.test.ts`, `coreHost.test.ts`, `coreSelection.test.ts`, `coreSwapCover.test.ts`, `coreSwapView.test.ts`, `coverTimings.test.ts`, `adapters/BrowserConnectionEventsAdapter.test.ts`, `adapters/LocalStorageDataSourceStore.test.ts`, `adapters/LocalStorageDockLayoutStore.test.ts`, `adapters/LocalStorageLayoutPresetStore.test.ts`, `adapters/LocalStorageSessionStore.test.ts`, `adapters/preferences.contract.test.ts`, `theme/MediaQueryColorSchemeAdapter.test.ts` (React only today).

- [ ] **Step 1: Record the baseline.** Before moving, run both clients' `vitest run src/app --reporter=json` and save, per file, the list of test names. This is the list Step 4 compares against.
- [ ] **Step 2: Check the subset ruling.** Every case name in Solid's `LocalStorageSessionStore.test.ts` appears in React's. If one does not, copy that case into the kept file.
- [ ] **Step 3: Move.** `git mv` React's copies, `git rm` Solid's. Imports become relative or `#/`. `bootApp.test.ts` imports the page object `#tests/ui/pages/BootErrorPage`: move React's copy to `packages/web-boot/src/__tests__/BootErrorPage.ts` if no client file still imports it; if one does, copy it and leave the client's in place for PR 3 to remove. Add the devDependencies the tests need (`@rtc/client-adapters` testing entry is reached through the runtime dependency; `vitest`, `jsdom`, `@vitest/coverage-v8`, `@types/node`).
- [ ] **Step 4: Run and compare.**

Run: `pnpm --filter @rtc/web-boot test`
Expected: PASS. Every test name from Step 1's React list for the moved files is present. Then `pnpm --filter @rtc/web-boot build && pnpm --filter @rtc/client-react test:app && pnpm --filter @rtc/client-solid exec vitest run src/app`; expected PASS, and the names that remain are exactly the baseline minus the moved files.

- [ ] **Step 5: The coverage gate.**

Run: `pnpm --filter @rtc/web-boot test:coverage`
Expected: thresholds met. If a file is short because its only cover was a test that stays in the clients until PR 2, add the missing case here; do not lower the bar.

- [ ] **Step 6: Mutation check.** One mutant per moved source file (14), each run against that file's own test in the package, to prove the tests still bind to the moved code and not to a stale copy.

Run: `node scripts/mutation-check.mts <spec.json> --keep-going`
Expected: 14 KILLED.

- [ ] **Step 7: Commit.** `test(web-boot): the shared boot tests move with their sources`

### Task 4: CI, the coverage report and the docs

**Files:** `.github/workflows/ci.yml`, `.github/workflows/coverage-report.yml`, `.claude/commands/rtc/gauntlet.md`, `CLAUDE.md`, `docs/architecture/06-package-dependencies.md`, `docs/architecture/22-pluggable-application-core.md`, `docs/adr/ADR-006-pluggable-application-core.md`, `docs/STATUS.md`, both `vitest.app.coverage.config.ts`.

- [ ] **Step 1:** `ci.yml`: a step `Web boot coverage gate (≥95%, branches ≥85%)` running `pnpm --filter @rtc/web-boot test:coverage`, placed after the alternative-core gates. `/rtc:gauntlet`: the same line in the full tier, and the count of coverage gates in `CLAUDE.md`'s row goes from seven to eight.
- [ ] **Step 2:** `coverage-report.yml`: a `web-boot` tier, built the way the `devtools/core` tier is; the report's tier count in `CLAUDE.md` goes from ten to eleven. Both `vitest.app.coverage.config.ts`: drop exclusions that name files which have moved.
- [ ] **Step 3:** `CLAUDE.md`: the package count (twenty-six to twenty-seven), a `web-boot/` entry in the package list, the `client-react` and `client-solid` dependency lists, and every `src/app/coreHost.ts` / `src/app/coreSelection.ts` path. §6: the package in the graph. §22 and ADR-006: the paths. `docs/STATUS.md`: an In progress entry "web boot deduplication, PR 2 and PR 3 remaining", linking the spec; bump the date.
- [ ] **Step 4:**

Run: `pnpm check:doc-links && pnpm lint:actions && pnpm lint:actions:security`
Expected: all exit 0.

- [ ] **Step 5: Commit.** `docs(web-boot): the package in CI, the coverage report and the docs`

### Task 5: The final tree

- [ ] **Step 1:** `pnpm build`, then `pnpm check:core-bundle`. Expected: one lazy chunk per core in both clients, none eager.
- [ ] **Step 2:** `/rtc:gauntlet full`. Expected: every gate green.
- [ ] **Step 3:** `pnpm test:e2e`, unfiltered. Expected: PASS for both clients.
- [ ] **Step 4:** One independent reviewer (opus) over the branch diff, with this plan, the spec and the Review Focus list. Fix every finding, Minors included, in this PR.
- [ ] **Step 5:** Ship under the standing flow: push, PR, CI green on the head commit, CodeQL zero open alerts on an analysis of that commit, merge commit, clean up.
