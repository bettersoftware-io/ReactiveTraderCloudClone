# Coverage Reports & Visual Gap-Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add report-only coverage to the three in-process Vitest suites (`@rtc/client` app tier, `@rtc/domain`, `@rtc/server`) and an istanbul-based **visual gap-finder** over the vitest-browser tier that surfaces UI components/branches with no golden snapshot, plus a one-time `COVERAGE-GAPS.md` inventory.

**Architecture:** Each coverage report is a direct package script (run via `pnpm --filter`), not a Turborepo task — exactly like the existing `test:app` and `test:ui:contract:coverage`. The visual gap-finder is a `mergeConfig` over the existing vitest-browser config adding an `istanbul` coverage block; the three plain reports use `v8`. No CI gates, no `turbo.json` changes.

**Tech Stack:** Vitest 4, `@vitest/coverage-v8` (plain tiers), `@vitest/coverage-istanbul` (browser-mode visual tier), pnpm workspaces.

**Reference spec:** `docs/superpowers/specs/2026-06-14-coverage-reports-and-visual-gap-finder-design.md`

**Branch:** `feat/coverage-reports-and-visual-gap-finder` (already checked out; spec already committed at `6afeec9`).

---

## File Structure

**Create:**
- `packages/client/vitest.app.coverage.config.ts` — v8 coverage config for the app tier (`mergeConfig` over `vitest.config.ts`, scopes denominator to `src/app/**`).
- `packages/client/tests/ui/visual/vitest-browser/vitest-browser.coverage.config.ts` — istanbul coverage config for the visual gap-finder (`mergeConfig` over `vitest-browser.config.ts`).
- `packages/client/tests/ui/visual/COVERAGE-GAPS.md` — one-time, dated inventory of untested visual branches.

**Modify:**
- `packages/domain/package.json` — add `@vitest/coverage-v8` devDep + `test:coverage` script.
- `packages/domain/vitest.config.ts` — add `coverage` block.
- `packages/server/package.json` — add `@vitest/coverage-v8` devDep + `test:coverage` script.
- `packages/server/vitest.config.ts` — add `coverage` block.
- `packages/client/package.json` — add `@vitest/coverage-istanbul` devDep + `test:app:coverage` and `test:ui:visual:vitest-browser:react:coverage` scripts.
- `packages/client/README.md` — add the two new client coverage scripts to the scripts table.
- `packages/client/tests/ui/visual/README.md` — document the gap-finder, the honesty caveat, regenerate steps, and the `COVERAGE-GAPS.md` pointer.
- `pnpm-lock.yaml` — updated by `pnpm install` after dep additions.

**Out of scope (do not touch):** `@rtc/shared`, `turbo.json`, `.github/workflows/ci.yml`, the Playwright/playwright-ct runners, and writing new visual scenarios.

---

### Task 1: `@rtc/domain` coverage report

**Files:**
- Modify: `packages/domain/package.json`
- Modify: `packages/domain/vitest.config.ts`

- [ ] **Step 1: Add the coverage dev dependency**

In `packages/domain/package.json`, add to `devDependencies` (keep alphabetical order; this is a DEV dep, so it does not violate the domain single-runtime-dep rule):

```json
"@vitest/coverage-v8": "^4.1.8",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: completes; `pnpm-lock.yaml` updated to include `@vitest/coverage-v8` under the domain package.

- [ ] **Step 3: Add the coverage block to the vitest config**

Edit `packages/domain/vitest.config.ts` to add a `coverage` block inside `test` (leave the existing `include`/`reporters`/`outputFile` untouched):

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
    coverage: {
      provider: "v8",
      // Count every src file (even ones no test imports) so wholly-untested
      // modules surface at 0% rather than vanishing from the denominator.
      include: ["src/**"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
    },
  },
});
```

- [ ] **Step 4: Add the script**

In `packages/domain/package.json` `scripts`, add after `"test"`:

```json
"test:coverage": "vitest run --coverage",
```

- [ ] **Step 5: Run the coverage report and verify**

Run: `pnpm --filter @rtc/domain test:coverage`
Expected:
- Vitest runs the domain test files and prints a coverage table with `% Stmts | % Branch | % Funcs | % Lines` columns.
- Files appear under `src/` (untested ones at low/0%).
- `packages/domain/reports/unit/coverage/index.html` and `packages/domain/reports/unit/coverage/lcov.info` exist:

  Run: `ls packages/domain/reports/unit/coverage/index.html packages/domain/reports/unit/coverage/lcov.info`
  Expected: both paths listed, no error.

- [ ] **Step 6: Verify the bare `test` script is unaffected**

Run: `pnpm --filter @rtc/domain test`
Expected: tests pass with no coverage table (coverage only activates with `--coverage`).

- [ ] **Step 7: Commit**

```bash
git add packages/domain/package.json packages/domain/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(coverage): add report-only v8 coverage to @rtc/domain"
```

---

### Task 2: `@rtc/server` coverage report

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/server/vitest.config.ts`

- [ ] **Step 1: Add the coverage dev dependency**

In `packages/server/package.json`, add to `devDependencies` (alphabetical):

```json
"@vitest/coverage-v8": "^4.1.8",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: completes; lockfile updated for the server package.

- [ ] **Step 3: Add the coverage block to the vitest config**

Edit `packages/server/vitest.config.ts`:

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
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
    },
  },
});
```

- [ ] **Step 4: Add the script**

In `packages/server/package.json` `scripts`, after `"test"`:

```json
"test:coverage": "vitest run --coverage",
```

- [ ] **Step 5: Run and verify**

Run: `pnpm --filter @rtc/server test:coverage`
Expected: coverage table printed; `packages/server/reports/unit/coverage/index.html` and `lcov.info` exist:

Run: `ls packages/server/reports/unit/coverage/index.html packages/server/reports/unit/coverage/lcov.info`
Expected: both listed.

- [ ] **Step 6: Commit**

```bash
git add packages/server/package.json packages/server/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(coverage): add report-only v8 coverage to @rtc/server"
```

---

### Task 3: `@rtc/client` app-tier coverage report

`@rtc/client` already has `@vitest/coverage-v8`, so no dep change. The app tier's bare `test` runs the app+ui-contract union, so app-only coverage needs a dedicated config that scopes `coverage.include` to `src/app/**`; the script keeps the `src/app` positional to scope which test files run, and redirects the test HTML report to `reports/app` so it doesn't clobber the unit report.

**Files:**
- Create: `packages/client/vitest.app.coverage.config.ts`
- Modify: `packages/client/package.json`

- [ ] **Step 1: Create the app coverage config**

Create `packages/client/vitest.app.coverage.config.ts`:

```ts
import { mergeConfig, defineConfig } from "vitest/config";
import base from "./vitest.config";

// Report-only v8 coverage for the app tier (src/app: presenters + WS adapters).
// Reuses the base jsdom/react config; the `src/app` positional in the script
// scopes which tests RUN, coverage.include scopes the DENOMINATOR. The test
// HTML report is redirected to reports/app so it doesn't clobber reports/unit.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      outputFile: { html: "reports/app/report/index.html" },
      coverage: {
        provider: "v8",
        // Count every src/app file so untested presenters/adapters surface at 0%.
        include: ["src/app/**"],
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "reports/app/coverage",
      },
    },
  }),
);
```

- [ ] **Step 2: Add the script**

In `packages/client/package.json` `scripts`, add immediately after `"test:app"`:

```json
"test:app:coverage": "vitest run src/app -c vitest.app.coverage.config.ts --coverage",
```

- [ ] **Step 3: Run and verify the denominator is app-only**

Run: `pnpm --filter @rtc/client test:app:coverage`
Expected:
- Only `src/app/**` test files run (presenters + adapters).
- The coverage table lists ONLY files under `src/app/` — no `src/ui/` rows.
- Artifacts exist:

  Run: `ls packages/client/reports/app/coverage/index.html packages/client/reports/app/coverage/lcov.info`
  Expected: both listed.

- [ ] **Step 4: Verify the unit report was not clobbered**

Run: `ls packages/client/reports/app/report/index.html`
Expected: listed (the test HTML went to reports/app, not reports/unit).

- [ ] **Step 5: Commit**

```bash
git add packages/client/vitest.app.coverage.config.ts packages/client/package.json
git commit -m "feat(coverage): add report-only v8 coverage to @rtc/client app tier"
```

---

### Task 4: Visual gap-finder (vitest-browser + istanbul)

**Files:**
- Modify: `packages/client/package.json`
- Create: `packages/client/tests/ui/visual/vitest-browser/vitest-browser.coverage.config.ts`

- [ ] **Step 1: Add the istanbul coverage dev dependency**

In `packages/client/package.json` `devDependencies` (alphabetical, next to `@vitest/coverage-v8`):

```json
"@vitest/coverage-istanbul": "^4.1.8",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: completes; lockfile updated for the client package.

- [ ] **Step 3: Create the visual coverage config**

Create `packages/client/tests/ui/visual/vitest-browser/vitest-browser.coverage.config.ts`:

```ts
import { mergeConfig, defineConfig } from "vitest/config";
import base from "./vitest-browser.config";

// Visual gap-finder: instruments src/ui while the vitest-browser tier renders
// every shared scenario, so UNCOVERED branches = visual states no golden
// captures. Report-only — read the branch/function columns; no threshold gate.
//
// Browser mode requires the istanbul provider (the default v8 provider is not
// supported in browser mode); istanbul also gives truer branch granularity,
// which is exactly what a branch-level gap-finder needs.
//
// Denominator = src/ui minus branchless glue (no conditional render path a
// scenario could miss). Charts and full-page roots (App, Workspace,
// CreditWorkspace, PnlChart, PositionBubbles, PairPnlBars, TileChart) stay IN —
// they are exactly what this tier uniquely renders.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      coverage: {
        provider: "istanbul",
        include: ["src/ui/**"],
        exclude: [
          "src/ui/hooks/HooksProvider.tsx", // pure context provider, no branches
          "src/ui/hooks/createAppHooks.ts", // real presenter wiring; never run in
                                            // the visual tier (renders via
                                            // buildFakeHooks)
          "src/ui/shell/theme/tokens.ts", // CSS-var constants, no logic
        ],
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "reports/ui/visual/coverage",
      },
    },
  }),
);
```

- [ ] **Step 4: Add the script**

In `packages/client/package.json` `scripts`, add immediately after `"test:ui:visual:vitest-browser:react:update"`:

```json
"test:ui:visual:vitest-browser:react:coverage": "vitest run -c tests/ui/visual/vitest-browser/vitest-browser.coverage.config.ts --coverage",
```

- [ ] **Step 5: Run the gap-finder**

Run: `pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage`
Expected:
- Chromium launches; every scenario in `tests/ui/visual/shared/scenarios.ts` renders.
- A coverage table prints with `src/ui/**` files; some show `% Branch` < 100 and/or `% Funcs` < 100 — those are the gaps.
- Note: screenshot assertions still run (per-environment golden routing). On a local machine the `react-local/<arch>/` goldens should pass; even if a screenshot mismatches, coverage is still emitted (istanbul writes after the run). A red screenshot result here does NOT invalidate the coverage report.
- Artifacts exist:

  Run: `ls packages/client/reports/ui/visual/coverage/index.html packages/client/reports/ui/visual/coverage/lcov.info`
  Expected: both listed.

- [ ] **Step 6: Verify test files are not in the denominator**

Open the coverage table (or `packages/client/reports/ui/visual/coverage/index.html`) and confirm no `*.test.ts`/`*.test.tsx` rows appear (Vitest's default coverage excludes drop them).

If any `*.test.*` rows DO appear, add this line to the `exclude` array in the config and re-run Step 5:

```ts
"src/ui/**/*.test.{ts,tsx}",
```

Expected after this check: the denominator contains only production `src/ui` modules minus the three glue files.

- [ ] **Step 7: Verify the plain visual run is still uninstrumented**

Run: `pnpm --filter @rtc/client test:ui:visual:vitest-browser:react`
Expected: runs without a coverage table (the everyday run is unchanged).

- [ ] **Step 8: Commit**

```bash
git add packages/client/package.json packages/client/tests/ui/visual/vitest-browser/vitest-browser.coverage.config.ts pnpm-lock.yaml
git commit -m "feat(coverage): add istanbul visual gap-finder over the vitest-browser tier"
```

---

### Task 5: One-time `COVERAGE-GAPS.md` inventory

This task is empirical: it reads the real report produced in Task 4 and records the gaps. There is no code to write — the deliverable is the populated document. Do NOT invent gaps; transcribe them from the actual report.

**Files:**
- Create: `packages/client/tests/ui/visual/COVERAGE-GAPS.md`

- [ ] **Step 1: Regenerate the report (if not already present from Task 4)**

Run: `pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage`
Expected: coverage table + `packages/client/reports/ui/visual/coverage/index.html`.

- [ ] **Step 2: Identify the gaps**

Open `packages/client/reports/ui/visual/coverage/index.html` (or read the terminal table). For every file with `% Funcs` < 100 or `% Branch` < 100, drill in to find:
- a file at 0% functions → a component no scenario mounts at all;
- an uncovered branch → a conditional render arm (e.g. an up/down/stale variant, loading vs loaded, empty vs populated, an error/overlay state) that no scenario renders.

Cross-reference each against `tests/ui/visual/shared/scenarios.ts` to name the missing scenario.

- [ ] **Step 3: Write the inventory**

Create `packages/client/tests/ui/visual/COVERAGE-GAPS.md` with this structure, filling the table from Step 2's findings (the example row shows the expected shape — replace it with real rows; delete it if `Tile` turns out fully covered):

```markdown
# Visual coverage gaps — snapshot 2026-06-14

One-time inventory of `src/ui` components and conditional branches the **visual**
tier does not render, i.e. that have **no golden snapshot**. Produced by reading
the istanbul report from
`pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage`
(report: `reports/ui/visual/coverage/index.html`).

**This is a point-in-time snapshot, not a live document.** Writing the scenarios
to close these gaps is deferred follow-up work.

**How to read it:** an uncovered branch is *definitely* unsnapshotted
(false-negative-free). A branch shown as covered was rendered into *some* captured
frame, which does NOT guarantee a dedicated scenario asserts that exact state.

**How to regenerate:** run the command above, then for every file with
`% Funcs` or `% Branch` < 100, list the missing state below.

| File | Gap (function / branch) | Visual state it represents | Suggested scenario name |
|---|---|---|---|
| `fx/liveRates/tile/Tile.tsx` | branch: down-tick arm | red / down-tick tile | `tile/eurusd-down` |
```

- [ ] **Step 4: Add a pointer from the suite README**

In `packages/client/tests/ui/visual/README.md`, add a short line (placement: wherever the README lists tier artifacts/reports; if unsure, append a new `## Coverage gaps` section at the end):

```markdown
## Coverage gaps

`test:ui:visual:vitest-browser:react:coverage` instruments `src/ui` (istanbul)
while the vitest-browser tier renders every scenario, so uncovered branches are
visual states with no golden. See [`COVERAGE-GAPS.md`](./COVERAGE-GAPS.md)
(snapshot 2026-06-14) for the current inventory. Red = definitely no snapshot;
green = rendered into some frame (not a guarantee of a dedicated scenario).
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/tests/ui/visual/COVERAGE-GAPS.md packages/client/tests/ui/visual/README.md
git commit -m "docs(coverage): inventory visual snapshot gaps + README pointer"
```

---

### Task 6: Document the new client scripts

**Files:**
- Modify: `packages/client/README.md`

- [ ] **Step 1: Add the two new client coverage scripts to the scripts table**

In `packages/client/README.md`, in the Scripts table, add a row after the `test:app` row:

```markdown
| `test:app:coverage` | **app-tier coverage** — report-only v8 coverage over `src/app` | `app/coverage/` |
```

and a row after the `test:ui:visual:vitest-browser:react[:update]` row:

```markdown
| `test:ui:visual:vitest-browser:react:coverage` | **visual gap-finder** — istanbul coverage of `src/ui`; uncovered branches = no golden snapshot | `ui/visual/coverage/` |
```

- [ ] **Step 2: Verify the table renders (sanity check the markdown)**

Run: `git diff packages/client/README.md`
Expected: the two new rows appear inside the existing table, columns aligned with `|` separators.

- [ ] **Step 3: Commit**

```bash
git add packages/client/README.md
git commit -m "docs(coverage): list app + visual coverage scripts in client README"
```

---

## Final verification

- [ ] **Run every new coverage script once more, clean:**

```bash
pnpm --filter @rtc/domain test:coverage
pnpm --filter @rtc/server test:coverage
pnpm --filter @rtc/client test:app:coverage
pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage
```
Expected: all four print coverage tables and write `index.html` + `lcov.info` to their documented report dirs.

- [ ] **Confirm no regressions to the default suites:**

```bash
pnpm --filter @rtc/client test
pnpm --filter @rtc/domain test
pnpm --filter @rtc/server test
```
Expected: all pass, no coverage tables (coverage is opt-in).

- [ ] **Confirm the lockfile is consistent (CI uses --frozen-lockfile):**

Run: `pnpm install --frozen-lockfile`
Expected: "Lockfile is up to date" / no changes required.

- [ ] **Confirm out-of-scope files are untouched:**

Run: `git diff --name-only main...HEAD`
Expected: no changes to `turbo.json`, `.github/workflows/ci.yml`, or any `packages/shared/` file.

---

## Notes for the implementer

- **DRY:** the two `mergeConfig` configs (Tasks 3 and 4) follow the exact pattern of the existing `tests/ui/contract/vitest.coverage.config.ts` — read it first if anything is unclear.
- **YAGNI:** no CI wiring, no Turborepo tasks, no thresholds, no `@rtc/shared` coverage. All deferred by design.
- **Dev deps only:** every dependency added here is a `devDependency`; `@rtc/domain`'s single-runtime-dep rule (rxjs only) is not affected.
- **Empirical task:** Task 5's table content cannot be pre-written — it is transcribed from the real report. The example row is illustrative; replace it with actual findings.
