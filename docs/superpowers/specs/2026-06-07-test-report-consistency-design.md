# Test-Report Consistency & Client Test-Folder Restructure — Design

**Date:** 2026-06-07
**Status:** Approved (user, 2026-06-07; amended same day with Part A after user review)
**Follows:** the suite-first naming restructure (`docs/superpowers/plans/2026-06-07-test-suite-naming-restructure.md`) — this applies the same script⇒path consistency to client test *code* (Part A) and to test *outputs* everywhere (Part B).

## Problem

Only 4 of 13 test scripts produce an HTML report today, their filenames don't
follow the suite naming (`reports/cucumber-presenter.html` for the suite
`presenter/cucumber` — inverted), failure artifacts land in scattered,
confusing locations (`test-results/` dirs containing only `.last-run.json`,
loose `cypress/screenshots/`), and `tests/reports/` contains stale files from
pre-rename eras that nothing cleans up. Mapping a script to its report
requires archaeology.

Additionally (user review of v1 of this spec): `packages/client/visual/` does
not read as test-related at package root, and the standalone
`packages/client/playwright/` folder (the Playwright CT host template —
`index.html` + `index.tsx` that Tier 1 mounts components into, location being
the `ctTemplateDir` default) is a mystery folder. Both get restructured.

## Decisions (user-approved)

1. **Report scope: everything that can.** Every test script produces an HTML
   report except `test:fullstack:node` (a bare tsx script with no test
   framework — documented exception). This includes the vitest-based suites
   (new `@vitest/ui` dep) and native Cypress (new `cypress-mochawesome-reporter`
   dep).
2. **Report path scheme: mirror the script path as directories.** Strip
   `test:`; each remaining segment is a directory under the package's
   `reports/`.
3. **Artifacts: under each suite's report dir** — everything a run generates
   lives under `reports/`.
4. **Dir shape: `report/` + `artifacts/` siblings.** An empirical spike
   showed Playwright's HTML reporter owns and **wipes** its output folder at
   report-write time (a nested `artifacts/` lost both the raw failure PNG and
   the report's own attachment data). Each reporter therefore owns only the
   `report/` subdir; `artifacts/` is never touched by a reporter. Uniform
   across all runners (mochawesome also cleans its dir).
5. **Client visual tier renamed `visual` → `visual-diff`** (folder, scripts,
   turbo task, reports) — full information, matches the ADR's own
   terminology; `vdiff` was rejected as abbreviating away information
   (per the restructure's naming rule). Tier code moves under
   `packages/client/tests/`.
6. **Tier configs move into their suite folders** (the root tests/ package
   convention); the CT host template moves to
   `tests/visual-diff/playwright-ct/host/`, symmetric with Tier 2's existing
   `playwright/host/`.

---

# Part A — client test-folder restructure

Done FIRST (Part B wires report paths against the final layout).

## Layout

```
packages/client/
  vite.config.ts               (app — unchanged)
  vitest.config.ts             (unit tests — stays at root; unit tests stay
                                colocated in src/**/*.test.ts(x))
  tsconfig.visual-diff.json    (renamed from tsconfig.visual.json)
  tests/
    visual-diff/               (moved from visual/, renamed)
      playwright-ct/
        playwright-ct.config.ts   (moved from package root)
        host/                     (moved from packages/client/playwright/ —
                                   the CT template; ctTemplateDir points here)
        *.spec.tsx  __screenshots__/
      playwright/
        playwright.config.ts      (moved from package root)
        host/                     (already in-suite)
        *.spec.ts   __screenshots__/
      vitest-browser/
        vitest-browser.config.ts  (moved from package root)
        *.spec.tsx  __screenshots__/
      react/  shared/  run-all.ts  scenarioActions.ts
      README.md  ADR-001-visual-diff-tooling.md
```

Goldens (both committed sets, `react/` + `react-local/<platform>-<arch>/`
inside each `__screenshots__/`) move by `git mv` — paths are suite-relative,
**no regeneration**.

## Script renames

`test:visual*` → `test:visual-diff*` throughout `packages/client/package.json`
(the aggregate, `:react`, and all `:<runner>:react[:update|:ui]` variants),
with `-c`/`--config` paths updated to the in-suite config locations. Ripples,
all updated by meaning:

- `turbo.json`: task `test:visual` → `test:visual-diff` (keeps `cache: false`
  + `passThroughEnv`).
- Root `package.json`: script `test:visual` → `test:visual-diff`.
- `.github/workflows/ci.yml`: visual job runs `pnpm test:visual-diff`.
- `.github/workflows/update-visual-goldens.yml`: script names + golden paths.
- `packages/client/tests/visual-diff/run-all.ts`: runner-discovery prefix.
- Client `typecheck` script: `tsconfig.visual.json` → `tsconfig.visual-diff.json`.

## Path updates inside moved files

- `@ui-harness` alias → `tests/visual-diff/react/` in: the three tier
  configs, Tier 2's host vite config, and `tsconfig.visual-diff.json`
  `paths` (kept config-dir-relative per the TS6 `baseUrl` removal).
- CT config gains explicit `ctTemplateDir: "./host"`; its cache dir
  (`playwright/.cache` today) regenerates wherever CT puts it relative to the
  new template (gitignore updated accordingly).
- Tier 2's `webServer.command` vite-config path updated.
- Config-relative paths (`testDir`, `snapshotDir`) mostly SHORTEN
  (`./visual/playwright` → `.`), since configs now sit inside their suites.
- `packages/client/.gitignore`: `visual/__screenshots__/**/*-{actual,diff}.png`
  → `tests/visual-diff/**/__screenshots__/**/*-{actual,diff}.png`;
  `playwright/.cache/` → the new CT cache location.

## Docs & memory (Part A)

- `packages/client/README.md` scripts table + portfolio section; the moved
  `visual-diff/README.md` + ADR get their internal paths updated (the ADR's
  *historical narrative* stays as written).
- Root `README.md` visual-diff section; `docs/architecture.md` references by
  meaning. Historical `docs/superpowers/` plans/specs keep old names.
- Memories `project_visual_goldens_dual_set` and `project_ui_framework_switch`
  updated post-merge.

---

# Part B — consistent test reports

## The mapping rule

```
test:<a>:<b>…  ⇒  <package>/reports/<a>/<b>/…/report/index.html   ← open this
                                           …/artifacts/           ← raw failure output (browser suites only)
```

Two documented wrinkles:

- The bare unit script `test` (no segments) maps to `reports/unit/` in all
  five packages.
- Script segments map to report dirs even where the *code* folder doesn't go
  that deep (client's `:react` axis selects harness + golden set, not a
  suite folder — its report still lands at `reports/visual-diff/<runner>/react/`).

## Resulting layout

```
tests/reports/
  browser/
    playwright/{report/index.html, artifacts/}
    playwright-cucumber/{report/index.html, artifacts/}
    cypress/{report/index.html, artifacts/}
    cypress-cucumber/{report/index.html, artifacts/}
  presenter/
    cucumber/report/index.html
    cucumber-fake-timers/report/index.html
    vitest-fake-timers/report/index.html
    vitest-quickpickle-fake-timers/report/index.html
  fullstack/
    browser/{report/index.html, artifacts/}

packages/client/reports/
  unit/report/index.html
  visual-diff/
    playwright-ct/react/{report/index.html, artifacts/}
    playwright/react/{report/index.html, artifacts/}
    vitest-browser/react/report/index.html

packages/{domain,shared,server}/reports/
  unit/report/index.html
```

## Per-suite wiring

| script | report wiring | failure images |
|---|---|---|
| `test:browser:playwright` | add Playwright `html` reporter (keep `list`) → `reports/browser/playwright/report/`; `outputDir` → `…/artifacts/` | add `use.screenshot: "only-on-failure"` → embedded in report |
| `test:browser:playwright-cucumber` | existing cucumber `html:` format, re-pathed → `reports/browser/playwright-cucumber/report/index.html` | **new** `After` hook in `hooks.ts`: on failure, `this.attach(await page.screenshot(), "image/png")` → embedded |
| `test:browser:cypress` | **new dep** `cypress-mochawesome-reporter` → `reports/browser/cypress/report/` (reporter + support-file import + `setupNodeEvents` plugin) | embeds failure screenshots automatically (`embeddedScreenshots: true`); `screenshotsFolder` → `…/artifacts/` |
| `test:browser:cypress-cucumber` | existing badeball html, re-pathed in `.cypress-cucumber-preprocessorrc.json` → `reports/browser/cypress-cucumber/report/index.html` | badeball auto-attaches failure screenshots (**verify**; fallback: explicit attach hook); `screenshotsFolder` → `…/artifacts/` |
| `test:presenter:cucumber` | existing `html:` format re-pathed → `reports/presenter/cucumber/report/index.html` (fixes inverted name) | n/a (headless) |
| `test:presenter:cucumber-fake-timers` | same → `reports/presenter/cucumber-fake-timers/report/index.html` | n/a |
| `test:presenter:vitest-fake-timers` | vitest `reporters: ["default", "html"]` + `outputFile` → `reports/presenter/vitest-fake-timers/report/index.html` (**new dep** `@vitest/ui`) | n/a |
| `test:presenter:vitest-quickpickle-fake-timers` | same → `reports/presenter/vitest-quickpickle-fake-timers/report/index.html` | n/a |
| `test:fullstack:node` | **none — documented exception** (bare tsx script) | terminal output |
| `test:fullstack:browser` | Playwright `html` reporter → `reports/fullstack/browser/report/`; `outputDir` → `…/artifacts/` | `screenshot: "only-on-failure"` → embedded |
| `test` (client, domain, shared, server) | vitest `reporters: ["default", "html"]` + `outputFile` → `reports/unit/report/index.html` (each package gets `@vitest/ui`) | n/a |
| `test:visual-diff:playwright-ct:react` | Playwright `html` reporter → `reports/visual-diff/playwright-ct/react/report/`; `outputDir` → `…/artifacts/` (paths config-relative: `../../../reports/…` from inside the suite) | golden actual/diff/expected embedded as attachments |
| `test:visual-diff:playwright:react` | same → `reports/visual-diff/playwright/react/{report,artifacts}` | same |
| `test:visual-diff:vitest-browser:react` | vitest `html` reporter → `reports/visual-diff/vitest-browser/react/report/index.html` (**verify** html reporter works in browser mode) | diff PNGs stay next to goldens (`*-actual`/`*-diff`, tied to golden routing — unchanged) |

Terminal reporters (`list`/`default`/`progress-bar`/`summary`) all stay — HTML
is additive, terminal UX unchanged.

Path-resolution reminders (from the restructure): cucumber `format:` paths are
CWD-relative (`tests/`); Cypress paths are projectRoot-relative (`tests/`);
Playwright `outputDir`/`outputFolder` are config-file-relative; vitest
`outputFile` is root-relative (the configs pin `root`).

## New dev-dependencies

- `@vitest/ui` — in all five packages that run vitest (`domain`, `shared`,
  `server`, `client`, `tests`); required by vitest's `html` reporter.
- `cypress-mochawesome-reporter` — in `tests` only; HTML for native Cypress
  with automatic embedded failure screenshots.

(pnpm 11 cooldown applies: a <24h-old release may be rejected — pick the
newest cooldown-compliant version.)

## Cleanup & integration

- **Stale files deleted**: `tests/reports/*` legacy flat files
  (`cucumber.html`, `cucumber-presenter-real.html`,
  `cucumber-presenter-fake.html`, plus the four current ones — the whole dir
  is regenerated), stray `test-results/` dirs (`tests/`, `packages/client/`),
  `packages/client/playwright-report/` if present. All are gitignored local
  junk; nothing tracked.
- **gitignore**: per package, just `reports/`. `tests/.gitignore` drops
  `cypress/screenshots/`, `cypress/videos/`, and the four html filename
  lines; `packages/client/.gitignore` drops `playwright-report/` and
  `test-results/` (keeps the CT cache line and golden-diff PNG lines, both
  re-pathed by Part A).
- **clean scripts**:
  - `tests`: `rm -rf .turbo reports test-results cypress/screenshots cypress/videos` → `rm -rf .turbo reports`
  - `client`: `rm -rf dist .turbo *.tsbuildinfo playwright-report test-results` → `rm -rf dist .turbo *.tsbuildinfo reports`
  - `domain`/`shared`/`server`: `rm -rf dist .turbo *.tsbuildinfo` → `rm -rf dist .turbo *.tsbuildinfo reports`
  - Root `clean` fans out via `turbo run clean` — no change.
- **turbo.json**: `test` task gains `outputs: ["reports/**"]` — a cached
  replay restores the unit reports (same semantics as `build` ⇒ `dist/`).
  `test:e2e`/`test:visual-diff` are `cache: false`, no outputs needed.
- **CI** (`.github/workflows/ci.yml`): the two failure-upload blocks collapse
  to one path each — `packages/client/reports/` (visual-diff job) and
  `tests/reports/` (e2e job).

## Documentation (Part B)

- `tests/README.md` — scripts table gains a *report* column; layout section
  notes the `reports/<group>/<suite>/{report,artifacts}` shape; the
  `fullstack:node` exception documented.
- `packages/client/README.md` — same for its scripts table.
- Root `README.md` — two-line pointer in "Checks & tests" (where reports
  land, what the mapping rule is).
- `docs/architecture.md` — report-name references updated **by meaning**
  (the old `cucumber-presenter*.html` names map to
  `presenter/{cucumber,cucumber-fake-timers}/report/index.html`).

## Behavioral notes (deliberate)

1. **Cache restore after clean**: with `outputs: ["reports/**"]`, a cached
   `pnpm test` after `pnpm clean` *restores* unit reports from cache. Fresh
   reports require `--force` (documented in the READMEs).
2. **Visual golden diff PNGs stay out of `clean`** — they live next to
   committed goldens; a glob-free `rm -rf` can't target them safely. Status
   quo.

## Risks / verify-during-implementation

| risk | verification | fallback |
|---|---|---|
| `ctTemplateDir` relocation of the CT host | run Tier 1 against existing goldens (pixel-identical = proof) | keep template at a `tests/`-level `playwright/` dir |
| badeball auto-attach of failure screenshots | force a failing scenario, inspect report | explicit attach in an `After` hook |
| vitest 4 `html` reporter in browser mode (Tier 3) | run the tier, open report | `default` reporter only + documented gap |
| parent-dir creation by each reporter (cucumber/vitest/mochawesome write into not-yet-existing dirs) | run each suite from a cleaned `reports/` | pre-create via the runner script |
| mochawesome dir-cleaning semantics | confirm it only touches its `report/` subdir | point it deeper and copy out |

Each verification is a step in the implementing task, not an afterthought —
same method as the Playwright wipe spike that shaped decision 4.

## Implementation sequencing

Two plans, executed in order:

1. **Plan 1 (Part A)** — client test-folder restructure. Pure moves/renames;
   every commit green; goldens prove pixel-identity (no regen).
2. **Plan 2 (Part B)** — report wiring against the final layout.

## Out of scope

- `test:fullstack:node` HTML (no framework; wrap-in-reporter machinery
  rejected as not worth it).
- Report aggregation/merging across suites (each suite stands alone; CI
  uploads the whole `reports/` tree).
- Cleaning golden-diff PNGs.
- Moving client unit tests out of `src/` (colocation is deliberate).
