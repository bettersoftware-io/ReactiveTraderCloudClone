# Client Visual-Diff Restructure Implementation Plan (Part A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `packages/client/visual/` → `packages/client/tests/visual-diff/` (folder + script rename `test:visual*` → `test:visual-diff*`), fold the stray CT host template `packages/client/playwright/` into the suite as `playwright-ct/host/`, and move the three tier configs into their suite folders — with goldens proving pixel-identity (no regeneration).

**Architecture:** Pure moves/renames per Part A of `docs/superpowers/specs/2026-06-07-test-report-consistency-design.md`. One atomic rewiring commit (everything is coupled: scripts ↔ configs ↔ turbo task ↔ CI), then a docs commit, then verification. The three visual tiers passing against the MOVED goldens is the proof that `ctTemplateDir`, aliases, and snapshot paths were rewired correctly.

**Tech Stack:** Playwright CT (`@playwright/experimental-ct-react`), plain Playwright, Vitest 4 browser mode, Vite, pnpm + Turborepo, GitHub Actions.

**Context for the implementer (read first):**

- This monorepo was just through an analogous restructure of the root `tests/` package (`docs/superpowers/plans/2026-06-07-test-suite-naming-restructure.md`). The naming rule: script segments map to folders (`test:visual-diff:playwright-ct:react` ⇒ `tests/visual-diff/playwright-ct/`, the `:react` axis selects harness/golden-set, not a folder).
- **Goldens must NOT be regenerated.** Two committed sets live inside each suite's `__screenshots__/` (`react/` for CI x86, `react-local/<platform>-<arch>/` for local). They move with `git mv`; the tiers passing afterwards proves the move.
- Path-resolution facts: Playwright `testDir`/`snapshotDir`/`ctTemplateDir` are config-file-relative; Playwright `webServer.command` runs with cwd = the config file's directory; vite/vitest `root` defaults to the *process* cwd (`packages/client` when run via pnpm script), which is why the vitest config must pin `root` explicitly after moving.
- `docs/superpowers/` plans/specs are historical — they keep old names. Do not edit them.
- CI job ids in `ci.yml` (`visual`) are NOT renamed (branch-protection/required-check names may reference them); only the command and prose change.

---

## Task 1: The move + rewiring (one atomic commit)

**Files:**
- Branch: `refactor/client-visual-diff-restructure`
- Move: `packages/client/visual/` → `packages/client/tests/visual-diff/`
- Move: `packages/client/playwright/` → `packages/client/tests/visual-diff/playwright-ct/host/`
- Move+modify: `packages/client/playwright-ct.config.ts` → `packages/client/tests/visual-diff/playwright-ct/playwright-ct.config.ts`
- Move+modify: `packages/client/playwright.config.ts` → `packages/client/tests/visual-diff/playwright/playwright.config.ts`
- Move+modify: `packages/client/vitest-browser.config.ts` → `packages/client/tests/visual-diff/vitest-browser/vitest-browser.config.ts`
- Move+modify: `packages/client/tsconfig.visual.json` → `packages/client/tsconfig.visual-diff.json`
- Modify: `packages/client/tests/visual-diff/run-all.ts`, `packages/client/package.json`, `packages/client/.gitignore`, `package.json` (root), `turbo.json`, `.github/workflows/ci.yml`, `.github/workflows/update-visual-goldens.yml`

- [ ] **Step 1: Branch**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone
git checkout -b refactor/client-visual-diff-restructure
```

- [ ] **Step 2: Move the trees and configs**

```bash
cd packages/client
mkdir tests
git mv visual tests/visual-diff
rm -rf playwright/.cache              # generated CT bundle cache — regenerates
git mv playwright tests/visual-diff/playwright-ct/host
git mv playwright-ct.config.ts tests/visual-diff/playwright-ct/playwright-ct.config.ts
git mv playwright.config.ts tests/visual-diff/playwright/playwright.config.ts
git mv vitest-browser.config.ts tests/visual-diff/vitest-browser/vitest-browser.config.ts
git mv tsconfig.visual.json tsconfig.visual-diff.json
cd ../..
```

Sanity: `ls packages/client/visual packages/client/playwright` → both "No such file or directory"; `ls packages/client/tests/visual-diff` → `ADR-001-visual-diff-tooling.md README.md playwright playwright-ct react run-all.ts scenarioActions.ts shared vitest-browser`.

- [ ] **Step 3: Rewrite `tests/visual-diff/playwright-ct/playwright-ct.config.ts`**

Full new content (changes: `uiHarness` → `../react`; `testDir`/`snapshotDir` shorten; NEW `ctTemplateDir`/`ctCacheDir` in `use`; comment path tweaks — the vite version-skew comment is load-bearing, keep it verbatim):

```ts
import os from "node:os";
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const uiHarness = fileURLToPath(new URL("../react", import.meta.url));

// Goldens live under a per-framework subdir (`react/`) so a future Solid run can
// write `solid/` alongside without colliding — that per-framework split is the
// cross-framework contract. Orthogonally, the leading segment is routed by
// environment: CI (x86 Linux container) owns the canonical `react/` set; a local
// dev machine writes its own committed `react-local/<platform>-<arch>/` set,
// because font rasterization differs by OS/arch and never matches the x86 set.
// See ../playwright/playwright.config.ts and ../ADR-001-visual-diff-tooling.md
// for the full rationale.
const baseline = process.env.CI ? "react" : `react-local/${os.platform()}-${os.arch()}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.tsx",
  snapshotDir: "./__screenshots__",
  snapshotPathTemplate: `{snapshotDir}/${baseline}/{testFileName}/{arg}{ext}`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    // The CT host template (index.html + index.tsx) lives in-suite as host/,
    // symmetric with the plain-Playwright tier's host/ — instead of CT's default
    // root-level `playwright/` folder. Its bundling cache sits next to it
    // (gitignored).
    ctTemplateDir: "./host",
    ctCacheDir: "./host/.cache",
    // Desktop Chrome's 1280×720 viewport (from the project's device descriptor)
    // applies; no explicit override needed.
    ctViteConfig: {
      // Version-skew note (load-bearing): `react()` here is the app's
      // @vitejs/plugin-react@6 (peers vite ^8), but Playwright CT bundles this
      // harness with its OWN privately-pinned vite@6.4.1 — not the app's vite 8.
      // The lockfile does NOT protect this coupling (it's config-injected, not a
      // declared peer edge), so it rests on empirical green: the visual suite
      // passes 2/2 today. If a future plugin-react@6.x patch starts using a
      // vite-8-only build API, or a Playwright CT bump moves its bundled vite,
      // this runner can break with no package.json/lockfile change to warn you.
      plugins: [react()],
      resolve: { alias: { "@ui-harness": uiHarness } },
    },
    ctPort: 3100,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

If `tsc` later rejects `ctTemplateDir`/`ctCacheDir` inside `use` (option placement varies by Playwright version), move those two keys to the top level of `defineConfig({...})` — one of the two placements typechecks; the Step-12 run proves whichever placement actually resolves the template.

- [ ] **Step 4: Rewrite `tests/visual-diff/playwright/playwright.config.ts`**

Full new content (changes: `testDir`/`snapshotDir` shorten; `webServer.command` becomes config-dir-relative and uses `pnpm exec` so the vite binary resolves regardless of how Playwright builds PATH for the new cwd):

```ts
import os from "node:os";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

// Two committed golden sets, routed by environment. CI renders on x86 Linux in
// the pinned Playwright container and owns the canonical `react/` baseline — the
// cross-framework portability contract. A local dev machine (e.g. Apple Silicon,
// linux-arm64) rasterizes fonts differently (FreeType/HarfBuzz + arch), so its
// pixels never match the x86 set; it gets its OWN committed baseline under
// `react-local/<platform>-<arch>/`. Both sets are versioned and reviewed at
// commit time, but only the x86 `react/` set is additionally re-rendered and
// enforced by the CI visual job (no CI runner reproduces a dev arch). So an
// intentional UI change means updating BOTH: `:update` locally for the arm64 set
// AND the update-visual-goldens workflow for the x86 set. See ../ADR-001-visual-diff-tooling.md.
const baseline = process.env.CI ? "react" : `react-local/${os.platform()}-${os.arch()}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  snapshotDir: "./__screenshots__",
  snapshotPathTemplate: `{snapshotDir}/${baseline}/{testFileName}/{arg}{ext}`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Desktop Chrome's 1280×720 viewport applies (the device descriptor below
    // sets it); kept consistent with the other runners.
    ...devices["Desktop Chrome"],
  },
  webServer: {
    // cwd for this command is the directory of THIS config file, so the host
    // vite config is addressed in-suite; `pnpm exec` resolves the vite binary
    // from the owning package regardless of cwd depth.
    command: "pnpm exec vite --config host/vite.config.ts",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

(`tests/visual-diff/playwright/host/vite.config.ts` needs NO changes — its `../../react` alias is tree-internal and the whole tree moved together.)

- [ ] **Step 5: Rewrite `tests/visual-diff/vitest-browser/vitest-browser.config.ts`**

Full new content (changes: alias → `../react`; NEW pinned `root` back to the package dir — vitest's root otherwise follows process cwd, and pinning matches the root tests/ package convention; `include` stays root-relative):

```ts
import os from "node:os";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Tier 3: Vitest browser mode (`@vitest/browser` + `vitest-browser-react`) using
// the experimental `toMatchScreenshot` matcher (Vitest 4). Mounts the React
// harness in a real Chromium via the Playwright provider and diffs against the
// SAME committed goldens as the other tiers.
//
// Goldens are routed by environment exactly like the Playwright tiers (see
// ../playwright/playwright.config.ts): CI (x86 Linux container) owns the
// canonical `react/` set; a local dev machine writes its own committed
// `react-local/<plat>-<arch>/` set, because font rasterization differs by
// OS/arch. See ../ADR-001-visual-diff-tooling.md.
const baseline = process.env.CI ? "react" : `react-local/${os.platform()}-${os.arch()}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-harness": fileURLToPath(new URL("../react", import.meta.url)),
    },
  },
  test: {
    // Pin root to the package dir (three levels up from this suite folder) so
    // `include` and screenshot paths are stable regardless of invocation cwd.
    root: fileURLToPath(new URL("../../..", import.meta.url)),
    include: ["tests/visual-diff/vitest-browser/**/*.spec.tsx"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
      viewport: { width: 1280, height: 800 },
      // `toMatchScreenshot`'s built-in `screenshotDirectory` plumbing resolves a
      // custom value to an absolute path and then mis-joins it under the spec's
      // directory (producing a mangled `…/Users/…/…` path). Bypass it with our
      // own resolver, which deterministically yields:
      //   tests/visual-diff/vitest-browser/__screenshots__/<baseline>/<spec>/<arg>-<browser>.png
      // Arch lives in <baseline>, so the filename needs no platform suffix.
      expect: {
        toMatchScreenshot: {
          resolveScreenshotPath: ({
            root,
            testFileDirectory,
            testFileName,
            arg,
            browserName,
            ext,
          }) =>
            resolve(
              root,
              testFileDirectory,
              "__screenshots__",
              baseline,
              testFileName,
              `${arg}-${browserName}${ext}`,
            ),
        },
      },
    },
  },
});
```

- [ ] **Step 6: Edit `tests/visual-diff/run-all.ts`**

Three semantic changes — package.json is now two levels up, the script prefix segment is `visual-diff`, and the doc comment paths. Exact edits:

Replace the header comment block (lines 1–7):

```ts
// Runs every implemented visual-diff runner concurrently and prints a pass/fail
// summary. `tsx tests/visual-diff/run-all.ts` runs all frameworks;
// `tsx tests/visual-diff/run-all.ts react` runs only react:* runners. Today only
// :react exists, so both are the same; when :solid lands it is discovered
// automatically (no edit here).
//
// Perf caveat: concurrent runs contend for CPU/GPU — wall-clock here is NOT a
// fair per-runner benchmark. Run a single runner in isolation to measure speed.
```

Replace:

```ts
const pkgUrl = new URL("../package.json", import.meta.url);
```

with:

```ts
const pkgUrl = new URL("../../package.json", import.meta.url);
```

Replace the filter comment + check:

```ts
// Leaf runner scripts only: test:visual:<runner>:<framework> (exactly 4 parts),
// excluding :update / :ui variants and the aggregates added below.
const runners = Object.keys(pkg.scripts).filter((name) => {
  const parts = name.split(":");
  if (parts.length !== 4) return false;
  if (parts[0] !== "test" || parts[1] !== "visual") return false;
```

with:

```ts
// Leaf runner scripts only: test:visual-diff:<runner>:<framework> (exactly 4
// parts), excluding :update / :ui variants and the aggregates added below.
const runners = Object.keys(pkg.scripts).filter((name) => {
  const parts = name.split(":");
  if (parts.length !== 4) return false;
  if (parts[0] !== "test" || parts[1] !== "visual-diff") return false;
```

Replace the two user-facing strings:

```ts
    `No visual-diff runners found${frameworkFilter ? ` for "${frameworkFilter}"` : ""}.`,
```

```ts
console.log(`Running ${runners.length} visual-diff runner(s) concurrently:`);
```

and the summary line:

```ts
  `\nVisual-diff summary: ${results.length - failed.length}/${results.length} runner(s) passed.`,
```

- [ ] **Step 7: Edit `packages/client/tsconfig.visual-diff.json`**

Full new content (paths re-target, include covers `tests/`, comment re-anchored):

```jsonc
{
  // Type-checks the visual-diff harness (tests/visual-diff/) together with the
  // src files it mounts. The main tsconfig.json restricts rootDir to src, so the
  // visual-diff tier — which lives outside src and imports both @rtc/domain and
  // ../../src — needs its own no-emit program for `pnpm typecheck` to catch
  // drift between buildFakeHooks and the AppHooks interface.
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    // baseUrl removed for TS6 (deprecated, TS5101). Without baseUrl, `paths`
    // entries resolve relative to this config file's directory — identical to
    // the previous `baseUrl: "."` since these mappings were already relative.
    "paths": {
      "@ui-harness": ["./tests/visual-diff/react"],
      "@ui-harness/*": ["./tests/visual-diff/react/*"]
    }
  },
  "include": ["src", "tests"],
  "references": [{ "path": "../domain" }, { "path": "../shared" }]
}
```

Note: `include: ["src", "tests"]` now also sweeps in the three moved tier
configs and the CT host `index.tsx` (none were typechecked before — the old
include was `["src", "visual"]` and the configs sat at package root). They are
expected to typecheck clean. If Step 11 surfaces errors **only** in those
files that are vitest/playwright type-level quirks (not real bugs), add to
this config: `"exclude": ["tests/visual-diff/**/​*.config.ts"]` — but try
without first; keeping configs typechecked is a win.

- [ ] **Step 8: Update `packages/client/package.json` scripts**

Replace the `typecheck` and all `test:visual*` script lines so the scripts block reads:

```json
  "scripts": {
    "build": "vite build && tsc -p tsconfig.types.json --noCheck",
    "build-types": "tsc -p tsconfig.types.json --noCheck",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.visual-diff.json",
    "test": "vitest run",
    "test:visual-diff": "tsx tests/visual-diff/run-all.ts",
    "test:visual-diff:react": "tsx tests/visual-diff/run-all.ts react",
    "test:visual-diff:playwright-ct:react": "playwright test -c tests/visual-diff/playwright-ct/playwright-ct.config.ts",
    "test:visual-diff:playwright-ct:react:update": "playwright test -c tests/visual-diff/playwright-ct/playwright-ct.config.ts --update-snapshots",
    "test:visual-diff:playwright-ct:react:ui": "playwright test -c tests/visual-diff/playwright-ct/playwright-ct.config.ts --ui",
    "test:visual-diff:playwright:react": "playwright test -c tests/visual-diff/playwright/playwright.config.ts",
    "test:visual-diff:playwright:react:update": "playwright test -c tests/visual-diff/playwright/playwright.config.ts --update-snapshots",
    "test:visual-diff:playwright:react:ui": "playwright test -c tests/visual-diff/playwright/playwright.config.ts --ui",
    "test:visual-diff:vitest-browser:react": "vitest run -c tests/visual-diff/vitest-browser/vitest-browser.config.ts",
    "test:visual-diff:vitest-browser:react:update": "vitest run -c tests/visual-diff/vitest-browser/vitest-browser.config.ts --update",
    "dev": "vite",
    "clean": "rm -rf dist .turbo *.tsbuildinfo playwright-report test-results",
    "clean:deep": "pnpm run clean && rm -rf node_modules"
  },
```

(`clean` is NOT touched here — Part B owns the clean-script changes.)

- [ ] **Step 9: Rename the turbo task + root script + CI invocations**

`turbo.json` — rename the task key (settings unchanged):

```json
    "test:visual-diff": {
      "dependsOn": ["^build"],
      "cache": false,
      "passThroughEnv": ["PLAYWRIGHT_BROWSERS_PATH"]
    },
```

Root `package.json` — rename the script:

```json
    "test:visual-diff": "turbo run test:visual-diff",
```

`.github/workflows/ci.yml` — in the `visual` job (job id stays `visual` —
required-check names may reference it), change ONLY the run step:

```yaml
      - name: Visual diffs (playwright-ct + playwright + vitest-browser)
        run: pnpm test:visual-diff
```

`.github/workflows/update-visual-goldens.yml` — five changes:

1. Header comment line ~16: `pnpm test:visual:playwright-ct:react:update && pnpm test:visual:playwright:react:update` → `pnpm test:visual-diff:playwright-ct:react:update && pnpm test:visual-diff:playwright:react:update`
2. Header comment line ~17: `pnpm test:visual` → `pnpm test:visual-diff`
3. Header comment line ~18: `packages/client/visual/ADR-001-visual-diff-tooling.md` → `packages/client/tests/visual-diff/ADR-001-visual-diff-tooling.md`
4. The three run steps (~62, 65, 68): `test:visual:playwright-ct:react:update` → `test:visual-diff:playwright-ct:react:update`, `test:visual:playwright:react:update` → `test:visual-diff:playwright:react:update`, `test:visual:vitest-browser:react:update` → `test:visual-diff:vitest-browser:react:update`
5. The artifact paths (~75–77):

```yaml
            packages/client/tests/visual-diff/playwright-ct/__screenshots__/
            packages/client/tests/visual-diff/playwright/__screenshots__/
            packages/client/tests/visual-diff/vitest-browser/__screenshots__/
```

- [ ] **Step 10: Update `packages/client/.gitignore`**

Full new content:

```
playwright-report/
test-results/
tests/visual-diff/playwright-ct/host/.cache/
tests/visual-diff/**/__screenshots__/**/*-actual.png
tests/visual-diff/**/__screenshots__/**/*-diff.png
```

(`playwright-report/` and `test-results/` survive until Part B retires them.)

- [ ] **Step 11: Typecheck + unit tests**

```bash
pnpm --filter @rtc/client typecheck
pnpm --filter @rtc/client test
```

Expected: both PASS. If typecheck fails in the newly-included config files
with vitest/playwright type-level quirks, apply the exclude fallback from
Step 7. If it fails on `ctTemplateDir`/`ctCacheDir` placement, apply the
fallback from Step 3.

- [ ] **Step 12: Run all three tiers against the moved goldens**

```bash
pnpm --filter @rtc/client test:visual-diff
```

Expected: `Visual-diff summary: 3/3 runner(s) passed.` — pixel-identical
against the MOVED goldens. This is the proof for the CT host relocation, the
alias rewiring, and the snapshot paths. **If any tier wants to UPDATE
screenshots, something is mis-wired — do NOT update goldens; fix the path.**

Then check nothing leaked outside the new layout:

```bash
git status --short
```

Expected: only staged moves/edits — no untracked dirs at `packages/client/`
root (no resurrected `playwright/`, no `test-results/` noise beyond the
pre-existing pattern). If the CT cache appeared somewhere other than
`tests/visual-diff/playwright-ct/host/.cache/`, find it
(`find packages/client -name .cache -newer turbo.json`), point `ctCacheDir`
at the actual supported location or update the `.gitignore` line to match
reality — gitignored, not committed.

- [ ] **Step 13: Stale-reference sweep (mechanical, code only — docs are Task 2)**

```bash
git grep -nE "test:visual($|[^-])" -- ':(exclude)docs/superpowers' ':(exclude)*.md'
git grep -n "client/visual\|tsconfig\.visual\.json" -- ':(exclude)docs/superpowers' ':(exclude)*.md'
```

Expected: both empty. Fix any hit by meaning before committing.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor(client): move visual tier to tests/visual-diff, scripts test:visual-diff*

visual/ -> tests/visual-diff/ with configs in-suite; the stray root-level
playwright/ CT host template folds in as playwright-ct/host/ (explicit
ctTemplateDir), symmetric with the plain tier's host/. Goldens moved by
git mv and verified pixel-identical (3/3 tiers) - no regeneration.
Turbo task, root script, and both workflows renamed to match."
```

---

## Task 2: Living docs

**Files:**
- Modify: `packages/client/tests/visual-diff/README.md`, `packages/client/tests/visual-diff/ADR-001-visual-diff-tooling.md`
- Modify: `packages/client/README.md`, `README.md` (root)
- Modify: `docs/superpowers/STATUS.md` (append)

- [ ] **Step 1: Update the in-tree README + ADR paths**

These two files reference old paths/script names in prose. Find every hit:

```bash
grep -nE "test:visual($|[^-])|packages/client/visual|client/visual/|\bvisual/" \
  packages/client/tests/visual-diff/README.md \
  packages/client/tests/visual-diff/ADR-001-visual-diff-tooling.md
```

Apply by meaning, hunk by hunk (NO blind sed — prose like "visual-diff
tooling" must survive):

- `packages/client/visual/…` → `packages/client/tests/visual-diff/…`
- bare path references `visual/<x>` → `tests/visual-diff/<x>` (when clearly a
  path from the package root) or `<x>` (when the text reads suite-relative)
- script names `test:visual:` → `test:visual-diff:`; `test:visual` aggregate →
  `test:visual-diff`; `tsconfig.visual.json` → `tsconfig.visual-diff.json`
- The ADR's *decision narrative* (why tiers were chosen, dates, history) stays
  as written — only live path/script references update.

Re-run the grep; remaining hits must all be deliberate narrative.

- [ ] **Step 2: Update `packages/client/README.md`**

Update the scripts table rows and prose (current names on the left):

| old | new |
|---|---|
| `test:visual` | `test:visual-diff` |
| `test:visual:react` | `test:visual-diff:react` |
| `test:visual:playwright-ct:react[:update\|:ui]` | `test:visual-diff:playwright-ct:react[:update\|:ui]` |
| `test:visual:playwright:react[:update\|:ui]` | `test:visual-diff:playwright:react[:update\|:ui]` |
| `test:visual:vitest-browser:react[:update]` | `test:visual-diff:vitest-browser:react[:update]` |

Also: the script-naming paragraph (`test:visual:<runner>:<framework>` →
`test:visual-diff:<runner>:<framework>`, and `visual/run-all.ts` →
`tests/visual-diff/run-all.ts`); the caching note (`pnpm test:visual` →
`pnpm test:visual-diff`); the portfolio section heading
**Visual (`pnpm test:visual`)** → **Visual diff (`pnpm test:visual-diff`)**
and its `visual/shared/` → `tests/visual-diff/shared/`, and the
`[visual/README.md](visual/README.md)` link →
`[tests/visual-diff/README.md](tests/visual-diff/README.md)`.

- [ ] **Step 3: Update root `README.md`**

Four spots:

1. "Checks & tests" command block: `pnpm --filter @rtc/client test:visual   # UI visual-diff screenshots (client only)` → `pnpm test:visual-diff             # UI visual-diff screenshots (all 3 tiers)`
2. Caching section: "`test:e2e` and `test:visual`" → "`test:e2e` and `test:visual-diff`"
3. The "### Visual-diff tests" section: replace its command block with the
   real script names (the old block references `test:visual:update` /
   `test:visual:ui`, which do not exist):

```bash
pnpm test:visual-diff                                              # all 3 tiers vs committed goldens
pnpm --filter @rtc/client test:visual-diff:playwright-ct:react:ui # interactive (tier 1; tier 2 has :ui too)
# Regenerate goldens per tier — inspect before committing:
pnpm --filter @rtc/client test:visual-diff:playwright-ct:react:update
pnpm --filter @rtc/client test:visual-diff:playwright:react:update
pnpm --filter @rtc/client test:visual-diff:vitest-browser:react:update
```

4. Same section's closing pointer: `packages/client/visual/README.md` →
   `packages/client/tests/visual-diff/README.md`.

- [ ] **Step 4: Append to `docs/superpowers/STATUS.md`**

```markdown
**2026-06-07 — client visual tier moved to `packages/client/tests/visual-diff/` (Part A of the test-report consistency spec).** Scripts renamed `test:visual*` → `test:visual-diff*` (folder = script segments, full-information name per the naming rule); tier configs moved in-suite; the stray root-level `playwright/` CT host template is now `tests/visual-diff/playwright-ct/host/` (explicit `ctTemplateDir`), symmetric with tier 2's `host/`. Goldens moved by `git mv`, verified pixel-identical 3/3 — no regeneration. Spec: `docs/superpowers/specs/2026-06-07-test-report-consistency-design.md`; Part B (per-suite HTML reports under `reports/<segments>/{report,artifacts}`) follows.
```

- [ ] **Step 5: Verify doc-level stale references are gone**

```bash
git grep -nE "test:visual($|[^-])|packages/client/visual|tsconfig\.visual\.json" -- '*.md' ':(exclude)docs/superpowers'
```

Expected: empty (historical `docs/superpowers/` keeps old names by convention).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: visual tier paths/scripts renamed to tests/visual-diff across living docs"
```

---

## Task 3: Final verification

- [ ] **Step 1: Full pipeline, forced fresh**

```bash
pnpm build && pnpm typecheck --force && pnpm test --force && pnpm test:visual-diff && pnpm test:e2e
```

Expected: build green; typecheck 9/9; unit 8/8; visual-diff
`3/3 runner(s) passed`; e2e gates + 10/10 suites. (e2e exercises the client
build/dev-server paths the move could plausibly have disturbed.)

- [ ] **Step 2: Repo-wide stale sweep**

```bash
git grep -nE "test:visual($|[^-])" -- ':(exclude)docs/superpowers'
git grep -n "packages/client/visual\|client/playwright\b\|tsconfig\.visual\.json" -- ':(exclude)docs/superpowers'
ls packages/client/visual packages/client/playwright 2>&1
```

Expected: greps empty; both `ls` paths "No such file or directory".

- [ ] **Step 3: Hand off**

Use superpowers:finishing-a-development-branch.
