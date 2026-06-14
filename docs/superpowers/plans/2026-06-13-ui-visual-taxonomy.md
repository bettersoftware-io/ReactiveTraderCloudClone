# UI Visual Tier Refold (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the visual test tier from `packages/client/tests/visual-diff/` to `packages/client/tests/ui/visual/` and rename `test:visual-diff:*` → `test:ui:visual:*` with full symmetry (reports path, import alias, tsconfig name, Turbo task), landing via a CI-validated PR.

**Architecture:** Pure rename + `git mv` — no new tests, no behaviour change, no golden regeneration. The 102 committed PNGs move byte-for-byte; `snapshotDir: "./__screenshots__"` is config-relative so goldens stay valid. The only real code work is fixing paths that became one directory deeper (`../../../` → `../../../../`, `../../` → `../../../`) and rewriting `run-all.ts`'s script-discovery filter (leaf runners go from 4-part to 5-part names).

**Tech Stack:** pnpm workspaces, Turborepo, Playwright + Playwright CT + Vitest browser mode, TypeScript, GitHub Actions.

**Branch:** `feat/ui-visual-taxonomy` (already created; the design spec is committed there).

**Spec:** `docs/superpowers/specs/2026-06-13-ui-visual-taxonomy-design.md`

---

## File Structure

Files created/modified (no new source files — everything is a move or edit):

- **Moved (via `git mv`):** the entire `packages/client/tests/visual-diff/` subtree → `packages/client/tests/ui/visual/` (configs, specs, `shared/`, `react/`, `host/`, `run-all.ts`, in-suite `README.md` + `ADR-001`, and all `__screenshots__/` goldens).
- **Renamed (via `git mv`) + edited:** `packages/client/tsconfig.visual-diff.json` → `packages/client/tsconfig.ui-visual.json`.
- **Edited in place (depth/alias/path fixes):** the three runner configs, `host/vite.config.ts`, `run-all.ts`, all `*.spec.ts(x)` + `react/index.ts` (alias token).
- **Edited (wiring):** `packages/client/package.json` (scripts), root `package.json` (1 line), `turbo.json` (task key), `packages/client/.gitignore` (3 globs).
- **Edited (CI):** `.github/workflows/ci.yml`, `.github/workflows/update-visual-goldens.yml`.
- **Edited (living docs):** root `README.md`, `tests/README.md`, `packages/client/README.md`, `packages/client/tests/ui/visual/README.md`, `packages/client/tests/ui/visual/ADR-001-visual-diff-tooling.md`, `docs/superpowers/STATUS.md`.
- **NOT touched:** `docs/superpowers/plans/2026-06-0{6,7}-*` and `docs/superpowers/specs/2026-06-06-visual-diff-*` (historical point-in-time records — they keep the old `visual-diff` name on purpose).

---

## Task 1: Move the tree and fix its internals

Move the folder, rename the tsconfig, repoint the alias to `@ui-visual`, and fix every path that the one-level-deeper location broke. End state: the moved tree typechecks, even though the package.json scripts still point at the old path (those are fixed in Task 2).

**Files:**
- Move: `packages/client/tests/visual-diff/` → `packages/client/tests/ui/visual/`
- Move: `packages/client/tsconfig.visual-diff.json` → `packages/client/tsconfig.ui-visual.json`
- Modify: `packages/client/tsconfig.ui-visual.json`
- Modify: `packages/client/tests/ui/visual/playwright/playwright.config.ts`
- Modify: `packages/client/tests/ui/visual/playwright-ct/playwright-ct.config.ts`
- Modify: `packages/client/tests/ui/visual/vitest-browser/vitest-browser.config.ts`
- Modify: `packages/client/tests/ui/visual/playwright/host/vite.config.ts`
- Modify: `packages/client/tests/ui/visual/run-all.ts`
- Modify (alias token only): all `*.spec.ts(x)` under the moved tree, `playwright/host/main.tsx`, `react/index.ts`

- [ ] **Step 1: Move the folder and the tsconfig with git**

Run from repo root:

```bash
mkdir -p packages/client/tests/ui
git mv packages/client/tests/visual-diff packages/client/tests/ui/visual
git mv packages/client/tsconfig.visual-diff.json packages/client/tsconfig.ui-visual.json
```

- [ ] **Step 2: Verify the move preserved the goldens**

Run:

```bash
find packages/client/tests/ui/visual -name '*.png' | wc -l
```

Expected: `102` (same count as before the move — bytes are unchanged, `git mv` is a pure rename).

- [ ] **Step 3: Rename the alias token `@ui-harness` → `@ui-visual` across moved code (not docs)**

Run from repo root (scoped to TS/TSX so the prose in README/ADR is left for Task 4):

```bash
grep -rl '@ui-harness' packages/client/tests/ui/visual --include='*.ts' --include='*.tsx' \
  | xargs sed -i 's/@ui-harness/@ui-visual/g'
```

Then verify no `@ui-harness` remains in code:

```bash
grep -rn '@ui-harness' packages/client/tests/ui/visual --include='*.ts' --include='*.tsx'
```

Expected: no output. (This rewrites the 8 `playwright-ct/*.spec.tsx` imports, `vitest-browser/visual.spec.tsx`, `playwright/host/main.tsx`, `react/index.ts`'s comment, plus the alias keys inside the three configs and `host/vite.config.ts` — those config files get further edits below.)

- [ ] **Step 4: Fix `tsconfig.ui-visual.json` (paths + exclude + comment)**

In `packages/client/tsconfig.ui-visual.json`, replace the comment block, the `paths`, and the `exclude` so every `visual-diff` becomes `ui/visual` and the alias key becomes `@ui-visual`:

Replace lines 2–6 (the comment) with:

```jsonc
  // Type-checks the visual harness (tests/ui/visual/) together with the
  // src files it mounts. The main tsconfig.json restricts rootDir to src, so the
  // visual tier — which lives outside src and imports both @rtc/domain and
  // ../../../../src — needs its own no-emit program for `pnpm typecheck` to catch
  // drift between buildFakeHooks and the AppHooks interface.
```

Replace the `paths` block (lines 19–22) with:

```jsonc
    "paths": {
      "@ui-visual": ["./tests/ui/visual/react"],
      "@ui-visual/*": ["./tests/ui/visual/react/*"]
    }
```

Replace the `exclude` (line 28) with:

```jsonc
  "exclude": ["tests/ui/visual/playwright-ct/playwright-ct.config.ts", "tests/ui/contract"],
```

- [ ] **Step 5: Fix `playwright/playwright.config.ts` (report paths went one level deeper)**

In `packages/client/tests/ui/visual/playwright/playwright.config.ts`:

Change the comment on line 27 from `../../../ = packages/client.` to `../../../../ = packages/client.`

Change line 30 from:

```ts
    ["html", { outputFolder: "../../../reports/visual-diff/playwright/react/report", open: "never" }],
```

to:

```ts
    ["html", { outputFolder: "../../../../reports/ui/visual/playwright/react/report", open: "never" }],
```

Change line 32 from:

```ts
  outputDir: "../../../reports/visual-diff/playwright/react/artifacts",
```

to:

```ts
  outputDir: "../../../../reports/ui/visual/playwright/react/artifacts",
```

- [ ] **Step 6: Fix `playwright-ct/playwright-ct.config.ts` (var name, alias, report paths)**

In `packages/client/tests/ui/visual/playwright-ct/playwright-ct.config.ts`:

Rename the harness variable for clarity. Change line 6 from:

```ts
const uiHarness = fileURLToPath(new URL("../react", import.meta.url));
```

to:

```ts
const uiVisual = fileURLToPath(new URL("../react", import.meta.url));
```

Change the comment on line 27 from `../../../ = packages/client.` to `../../../../ = packages/client.`

Change line 30 from:

```ts
    ["html", { outputFolder: "../../../reports/visual-diff/playwright-ct/react/report", open: "never" }],
```

to:

```ts
    ["html", { outputFolder: "../../../../reports/ui/visual/playwright-ct/react/report", open: "never" }],
```

Change line 32 from:

```ts
  outputDir: "../../../reports/visual-diff/playwright-ct/react/artifacts",
```

to:

```ts
  outputDir: "../../../../reports/ui/visual/playwright-ct/react/artifacts",
```

Change line 52 (Step 3's sed already turned `@ui-harness` into `@ui-visual` here; now fix the value to the renamed variable) from:

```ts
      resolve: { alias: { "@ui-visual": uiHarness } },
```

to:

```ts
      resolve: { alias: { "@ui-visual": uiVisual } },
```

- [ ] **Step 7: Fix `vitest-browser/vitest-browser.config.ts` (root depth, include, report path)**

In `packages/client/tests/ui/visual/vitest-browser/vitest-browser.config.ts`:

Change line 28–30 (the `root` pin comment + value). The suite is now FOUR levels below the package dir, so `../../..` becomes `../../../..`:

```ts
    // Pin root to the package dir (four levels up from this suite folder) so
    // `include` and screenshot paths are stable regardless of invocation cwd.
    root: fileURLToPath(new URL("../../../..", import.meta.url)),
```

Change line 31 from:

```ts
    include: ["tests/visual-diff/vitest-browser/**/*.spec.tsx"],
```

to:

```ts
    include: ["tests/ui/visual/vitest-browser/**/*.spec.tsx"],
```

Change the comment on lines 32–33 from `test:visual-diff:vitest-browser:react => reports/visual-diff/vitest-browser/react/.` to `test:ui:visual:vitest-browser:react => reports/ui/visual/vitest-browser/react/.`

Change line 39 from:

```ts
    outputFile: { html: "reports/visual-diff/vitest-browser/react/report/index.html" },
```

to:

```ts
    outputFile: { html: "reports/ui/visual/vitest-browser/react/report/index.html" },
```

Change the doc-comment path on line 50 from `tests/visual-diff/vitest-browser/__screenshots__/...` to `tests/ui/visual/vitest-browser/__screenshots__/...`. (The `@ui-harness`→`@ui-visual` on line 24 was already handled by Step 3's sed; the `new URL("../react")` is config-relative and needs no change.)

- [ ] **Step 8: Fix the `run-all.ts` package.json depth and the discovery filter**

In `packages/client/tests/ui/visual/run-all.ts`:

Change the header comment (lines 2–4) to reference the new path and naming:

```ts
// Runs every implemented visual runner concurrently and prints a pass/fail
// summary. `tsx tests/ui/visual/run-all.ts` runs all frameworks;
// `tsx tests/ui/visual/run-all.ts react` runs only react runners. Today only
```

Change line 13 (the package.json is now three levels up, not two):

```ts
const pkgUrl = new URL("../../../package.json", import.meta.url);
```

Replace the filter block (lines 20–27) with the 5-part rule:

```ts
const frameworkFilter = process.argv[2]; // e.g. "react" | undefined

// Leaf runner scripts only: test:ui:visual:<runner>:<framework> (exactly 5
// parts), excluding :update / :ui variants (6 parts) and the aggregates
// (test:ui:visual and test:ui:visual:<framework>, which are ≤4 parts).
const runners = Object.keys(pkg.scripts).filter((name) => {
  const parts = name.split(":");
  if (parts.length !== 5) return false;
  if (parts[0] !== "test" || parts[1] !== "ui" || parts[2] !== "visual") return false;
  return frameworkFilter ? parts[4] === frameworkFilter : true;
});
```

Change the no-runners error message (was `No visual-diff runners found`) to:

```ts
  console.error(
    `No visual runners found${frameworkFilter ? ` for "${frameworkFilter}"` : ""}.`,
  );
```

Change the summary line near the end (was `Visual-diff summary:`) to:

```ts
console.log(
  `\nVisual summary: ${results.length - failed.length}/${results.length} runner(s) passed.`,
);
```

- [ ] **Step 9: Fix `playwright/host/vite.config.ts` comment**

Step 3's sed already changed the alias key. In `packages/client/tests/ui/visual/playwright/host/vite.config.ts`, also update the comment on line 5 so it reads `@ui-visual resolves to the React render target two` (replace `@ui-harness` with `@ui-visual` if the sed left the comment — confirm with grep below).

Run:

```bash
grep -rn '@ui-harness\|visual-diff' packages/client/tests/ui/visual --include='*.ts' --include='*.tsx'
```

Expected: no output (all code references now say `@ui-visual` / `ui/visual`).

- [ ] **Step 10: Typecheck the moved tree directly**

The `typecheck` script still names the old tsconfig until Task 2, so invoke the renamed program directly. Run from `packages/client`:

```bash
cd packages/client && pnpm exec tsc --noEmit -p tsconfig.ui-visual.json
```

Expected: clean exit, no errors. (This proves the alias, the `../../../../src` reachability, and the spec imports all resolve under the new layout.)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(tests): move visual tier to tests/ui/visual + @ui-visual alias

Pure git-mv of the visual-diff tier into tests/ui/visual; rename
tsconfig.visual-diff.json -> tsconfig.ui-visual.json; repoint @ui-harness
-> @ui-visual; fix report/root paths that went one level deeper
(../../../ -> ../../../../, run-all package.json ../../ -> ../../../);
rewrite run-all.ts discovery for 5-part test:ui:visual:* leaf names.
Goldens moved byte-for-byte; no regeneration.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Rewire scripts, Turbo, and gitignore

Repoint everything that *invokes* the suite at the new path and name. After this task `pnpm test:ui:visual` runs green locally.

**Files:**
- Modify: `packages/client/package.json` (scripts block)
- Modify: `package.json` (root, line 10)
- Modify: `turbo.json` (task key)
- Modify: `packages/client/.gitignore`

- [ ] **Step 1: Replace the client `package.json` script block**

In `packages/client/package.json`, replace the `typecheck` line (17) so it names the renamed tsconfig:

```json
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.ui-visual.json && tsc --noEmit -p tsconfig.ui-contract.json",
```

Replace the eight visual script lines (22–31) with:

```json
    "test:ui:visual": "tsx tests/ui/visual/run-all.ts",
    "test:ui:visual:react": "tsx tests/ui/visual/run-all.ts react",
    "test:ui:visual:playwright-ct:react": "playwright test -c tests/ui/visual/playwright-ct/playwright-ct.config.ts",
    "test:ui:visual:playwright-ct:react:update": "playwright test -c tests/ui/visual/playwright-ct/playwright-ct.config.ts --update-snapshots",
    "test:ui:visual:playwright-ct:react:ui": "playwright test -c tests/ui/visual/playwright-ct/playwright-ct.config.ts --ui",
    "test:ui:visual:playwright:react": "playwright test -c tests/ui/visual/playwright/playwright.config.ts",
    "test:ui:visual:playwright:react:update": "playwright test -c tests/ui/visual/playwright/playwright.config.ts --update-snapshots",
    "test:ui:visual:playwright:react:ui": "playwright test -c tests/ui/visual/playwright/playwright.config.ts --ui",
    "test:ui:visual:vitest-browser:react": "vitest run -c tests/ui/visual/vitest-browser/vitest-browser.config.ts",
    "test:ui:visual:vitest-browser:react:update": "vitest run -c tests/ui/visual/vitest-browser/vitest-browser.config.ts --update",
```

Replace the `clean` line (33) so the host-cache path points at the new location:

```json
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports .vitest-attachments tests/ui/visual/playwright-ct/host/.cache",
```

- [ ] **Step 2: Update the root `package.json` aggregate**

In the repo-root `package.json`, change line 10 from:

```json
    "test:visual-diff": "turbo run test:visual-diff",
```

to:

```json
    "test:ui:visual": "turbo run test:ui:visual",
```

- [ ] **Step 3: Rename the Turbo task key**

In `turbo.json`, change the task key `test:visual-diff` to `test:ui:visual` (the body — `dependsOn`, `cache: false`, `passThroughEnv` — is unchanged):

```json
    "test:ui:visual": {
      "dependsOn": ["^build"],
      "cache": false,
      "passThroughEnv": ["PLAYWRIGHT_BROWSERS_PATH"]
    },
```

- [ ] **Step 4: Repoint the `.gitignore` globs**

In `packages/client/.gitignore`, change the three `tests/visual-diff/...` lines to `tests/ui/visual/...`:

```gitignore
reports/
coverage/
tests/ui/visual/playwright-ct/host/.cache/
tests/ui/visual/**/__screenshots__/**/*-actual.png
tests/ui/visual/**/__screenshots__/**/*-diff.png
.vitest-attachments/
```

- [ ] **Step 5: Verify typecheck + build pass**

Run from repo root:

```bash
pnpm --filter @rtc/client typecheck && pnpm build
```

Expected: both green. (`typecheck` now resolves `tsconfig.ui-visual.json`; `build` is unaffected but confirms nothing else regressed.)

- [ ] **Step 6: Run the renamed visual suite locally (arm64 react-local set)**

Playwright and Vitest-browser are Node-driven and run on this aarch64 container (unlike Cypress). If chromium isn't present, install it first: `pnpm --filter @rtc/client exec playwright install chromium`. Then run from repo root:

```bash
pnpm --filter @rtc/client test:ui:visual
```

Expected: `Visual summary: 3/3 runner(s) passed.` — all three runners compare against the committed `react-local/linux-arm64/` goldens and pass (the move changed no pixels).

- [ ] **Step 7: Confirm reports landed at the new path**

Run:

```bash
ls packages/client/reports/ui/visual/
```

Expected: `playwright`, `playwright-ct`, `vitest-browser` directories present (proves the `../../../../reports/ui/visual/...` depth fix from Task 1 is correct). Confirm the old path is absent:

```bash
test ! -d packages/client/reports/visual-diff && echo "old reports path gone: OK"
```

Expected: `old reports path gone: OK`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(tests): rename test:visual-diff:* -> test:ui:visual:* wiring

Update client package.json scripts (incl. typecheck tsconfig + clean
host-cache path), root package.json aggregate, turbo.json task key, and
.gitignore globs to the tests/ui/visual path and test:ui:visual:* names.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Update the CI workflows

Repoint both GitHub workflows. The `ci.yml` visual job runs the renamed script and uploads from the new golden path; `update-visual-goldens.yml` (the golden-update bot) calls the renamed `:update` scripts and uploads the new artifact paths.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/update-visual-goldens.yml`

- [ ] **Step 1: Update `ci.yml` visual job**

In `.github/workflows/ci.yml`, change the run command (line 125) from `run: pnpm test:visual-diff` to:

```yaml
        run: pnpm test:ui:visual
```

Change the three failure-upload globs (lines 136–138) from `tests/visual-diff/**/...` to:

```yaml
            packages/client/tests/ui/visual/**/__screenshots__/**/*-actual.png
            packages/client/tests/ui/visual/**/__screenshots__/**/*-diff.png
            packages/client/tests/ui/visual/**/__screenshots__/**/*-reference.png
```

Update the step name on line 124 and the comment on line 91 to say `ui/visual` / `update-visual-goldens.yml` as appropriate (replace the phrase `via .github/workflows/update-visual-goldens.yml` is unchanged; just ensure no `test:visual-diff` literal remains in the job). Confirm:

```bash
grep -n 'visual-diff' .github/workflows/ci.yml
```

Expected: no output.

- [ ] **Step 2: Update `update-visual-goldens.yml` script calls**

In `.github/workflows/update-visual-goldens.yml`, change the three regenerate steps (lines 64, 67, 70) from `test:visual-diff:...` to:

```yaml
        run: pnpm --filter @rtc/client test:ui:visual:playwright-ct:react:update
```
```yaml
        run: pnpm --filter @rtc/client test:ui:visual:playwright:react:update
```
```yaml
        run: pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:update
```

- [ ] **Step 3: Update `update-visual-goldens.yml` artifact paths + header comment**

Change the artifact upload paths (lines 77–79) from `tests/visual-diff/...` to:

```yaml
          path: |
            packages/client/tests/ui/visual/playwright-ct/__screenshots__/
            packages/client/tests/ui/visual/playwright/__screenshots__/
            packages/client/tests/ui/visual/vitest-browser/__screenshots__/
```

In the header comment block, update the three local-regen example commands (lines 16–18) to the renamed scripts and the ADR path reference (line 20) from `packages/client/tests/visual-diff/ADR-001-...` to `packages/client/tests/ui/visual/ADR-001-...`:

```yaml
#   pnpm test:ui:visual:playwright-ct:react:update &&
#   pnpm test:ui:visual:playwright:react:update &&
#   pnpm test:ui:visual:vitest-browser:react:update
```

Confirm no stale literal remains:

```bash
grep -n 'visual-diff' .github/workflows/update-visual-goldens.yml
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/update-visual-goldens.yml
git commit -m "ci(visual): point both workflows at test:ui:visual + tests/ui/visual

ci.yml visual job runs pnpm test:ui:visual and uploads from
tests/ui/visual/**/__screenshots__; update-visual-goldens.yml calls the
renamed :update scripts and uploads the new golden paths.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Update living documentation

Rewrite the path/script references in the docs that describe the *current* system. Leave the historical `docs/superpowers/plans|specs/2026-06-0{6,7}-*` records untouched.

**Files:**
- Modify: `README.md` (root)
- Modify: `tests/README.md`
- Modify: `packages/client/README.md`
- Modify: `packages/client/tests/ui/visual/README.md`
- Modify: `packages/client/tests/ui/visual/ADR-001-visual-diff-tooling.md`
- Modify: `docs/superpowers/STATUS.md`

- [ ] **Step 1: Update each living doc's references**

In each of the six files above, update prose and code blocks so they describe the new layout. Apply these substitutions (by hand, reading context — do NOT blindly sed the ADR/README, since some sentences need light rewording, not just token swaps):

- `tests/visual-diff/` → `tests/ui/visual/`
- `test:visual-diff` (and `test:visual-diff:<runner>:react[...]`) → `test:ui:visual` (`test:ui:visual:<runner>:react[...]`)
- `reports/visual-diff/` → `reports/ui/visual/`
- `@ui-harness` → `@ui-visual`
- In `packages/client/README.md`, the script table rows for `test:visual-diff*` (and the `typecheck` row mentioning `visual-diff` tsconfig) → the `test:ui:visual*` names and `tsconfig.ui-visual.json`.
- In `packages/client/README.md`, the sentence "a future `:solid` runner is discovered by `tests/visual-diff/run-all.ts`" → `tests/ui/visual/run-all.ts`.

The in-suite `ADR-001-visual-diff-tooling.md` keeps its FILENAME (it is a stable ADR id); only its body references update.

- [ ] **Step 2: Verify only historical docs still mention `visual-diff`**

Run from repo root:

```bash
grep -rl 'visual-diff' --exclude-dir=node_modules --exclude-dir=.git . | sort
```

Expected: ONLY these paths (all historical point-in-time records, intentionally frozen):

```
docs/superpowers/plans/2026-06-06-ui-visual-diff-tests.md
docs/superpowers/plans/2026-06-06-visual-diff-tooling-variants.md
docs/superpowers/plans/2026-06-07-client-visual-diff-restructure.md
docs/superpowers/plans/2026-06-07-test-report-wiring.md
docs/superpowers/plans/2026-06-07-test-suite-naming-restructure.md
docs/superpowers/plans/2026-06-11-behaviour-contract-tests.md
docs/superpowers/plans/2026-06-13-ui-test-taxonomy-and-coverage.md
docs/superpowers/specs/2026-06-06-dependency-upgrades-design.md
docs/superpowers/specs/2026-06-06-visual-diff-tooling-variants-design.md
docs/superpowers/specs/2026-06-07-test-report-consistency-design.md
docs/superpowers/specs/2026-06-11-behaviour-contract-tests-design.md
docs/superpowers/plans/2026-06-13-ui-visual-taxonomy.md
docs/superpowers/specs/2026-06-13-ui-test-taxonomy-and-coverage-design.md
docs/superpowers/specs/2026-06-13-ui-visual-taxonomy-design.md
```

If any NON-historical file (a README, a config, a workflow, the in-suite ADR/README) still appears, fix it before committing. (This Phase 3 plan and its spec `2026-06-13-ui-visual-taxonomy-design.md` legitimately contain `visual-diff` in their before/after tables — that is correct and stays.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs(visual): update living docs to tests/ui/visual + test:ui:visual

Root/tests/client READMEs, the in-suite README + ADR-001 body, and
STATUS.md now describe the tests/ui/visual layout and test:ui:visual:*
scripts. Historical plans/specs keep the old visual-diff name on purpose.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Final verification, push, and CI-validated PR

The local checks can't exercise the GitHub workflows or the x86 `react/` goldens — that is exactly what the PR validates. This task is the point where the branch goes to the remote.

**Files:** none (verification + git/gh operations only).

- [ ] **Step 1: Full local green sweep**

Run from repo root:

```bash
pnpm --filter @rtc/client typecheck \
  && pnpm build \
  && pnpm --filter @rtc/client test \
  && pnpm --filter @rtc/client test:ui:visual
```

Expected: all four green — `typecheck` clean, `build` ok, the default unit suite (72 files / 406 tests) passes, and `Visual summary: 3/3 runner(s) passed.`

- [ ] **Step 2: Final repo-wide grep gate**

```bash
grep -rl 'visual-diff' --exclude-dir=node_modules --exclude-dir=.git . | grep -v '^docs/superpowers/' \
  && echo "FAIL: non-historical visual-diff reference found" || echo "PASS: only historical docs mention visual-diff"
```

Expected: `PASS: only historical docs mention visual-diff`.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/ui-visual-taxonomy
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "Phase 3: refold visual tier to tests/ui/visual + test:ui:visual:*" --body "$(cat <<'EOF'
## Summary
- Move `packages/client/tests/visual-diff/` → `tests/ui/visual/` (102 goldens moved byte-for-byte via `git mv`; no regeneration).
- Rename `test:visual-diff:*` → `test:ui:visual:*` with full symmetry: reports path (`reports/ui/visual/`), import alias (`@ui-visual`), tsconfig (`tsconfig.ui-visual.json`), Turbo task (`test:ui:visual`).
- Fix paths that went one directory deeper (`../../../` → `../../../../`; `run-all.ts` package.json `../../` → `../../../`) and rewrite `run-all.ts` discovery for 5-part leaf script names.
- Repoint both workflows (`ci.yml` + `update-visual-goldens.yml`) and the living docs. Historical plans/specs intentionally keep the old name.

Completes the `tests/ui/` taxonomy started by the contract tier (`tests/ui/contract/`). Spec: `docs/superpowers/specs/2026-06-13-ui-visual-taxonomy-design.md`.

## Test Plan
- [ ] CI `visual` job green (proves the move, the depth-path fixes, and the x86 `react/` goldens line up).
- [ ] Manually dispatch the renamed **Update visual goldens** workflow; confirm it produces the `visual-goldens` artifact (proves the bot survived the rename).
- [ ] Local: `pnpm --filter @rtc/client typecheck && pnpm build && pnpm --filter @rtc/client test && pnpm --filter @rtc/client test:ui:visual` all green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Watch the visual CI job**

```bash
gh pr checks --watch
```

Expected: the `visual diffs` job passes. If it fails on a golden mismatch, inspect the uploaded `visual-diff-report` artifact — a real mismatch here would mean a path bug (the pixels didn't change), so re-audit the Task 1 depth fixes rather than regenerating goldens.

- [ ] **Step 6: Validate the golden-update bot (manual dispatch)**

```bash
gh workflow run "Update visual goldens"
gh run watch "$(gh run list --workflow='Update visual goldens' --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: the run succeeds and uploads a `visual-goldens` artifact. (This proves the renamed `:update` scripts and artifact paths in `update-visual-goldens.yml` are correct — the thing local checks cannot verify.)

- [ ] **Step 7: Report status to the human**

Summarize: PR URL, visual-CI result, golden-bot result. Do NOT merge — the human decides when to merge the PR. Then use superpowers:finishing-a-development-branch only if/when asked.

---

## Notes for the implementer

- **Why no golden regeneration:** the PNGs move byte-for-byte and `snapshotPathTemplate`/`snapshotDir` are config-relative, so the comparison is identical after the move. If a visual test fails post-move, suspect a *path* bug, never a pixel change.
- **The depth trap is the #1 risk.** Every `../../../` that escaped the suite to reach `packages/client/` is now one level short. The audited spots are: both Playwright configs' `outputFolder`/`outputDir` (→ `../../../../`), `vitest-browser` `root` (→ `../../../..`), and `run-all.ts` `pkgUrl` (→ `../../../`). The config-relative `new URL("../react")` / `new URL("../../react")` / `snapshotDir: "./__screenshots__"` / `ctTemplateDir: "./host"` paths do NOT change.
- **`run-all.ts` filter:** leaf runners are now 5-part (`test:ui:visual:playwright-ct:react`); the aggregate `test:ui:visual:react` is 4-part and must be excluded; `:update`/`:ui` variants are 6-part and excluded. The `length !== 5` guard handles all three.
- **Do not touch** `docs/superpowers/plans|specs/2026-06-0{6,7}-*` or the older `2026-06-11`/`2026-06-13-ui-test-taxonomy` records — they are historical.
