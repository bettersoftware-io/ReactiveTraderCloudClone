# Test-Report Consistency — Design

**Date:** 2026-06-07
**Status:** Approved (user, 2026-06-07)
**Follows:** the suite-first naming restructure (`docs/superpowers/plans/2026-06-07-test-suite-naming-restructure.md`) — this applies the same script⇒path consistency to test *outputs*.

## Problem

Only 4 of 13 test scripts produce an HTML report today, their filenames don't
follow the suite naming (`reports/cucumber-presenter.html` for the suite
`presenter/cucumber` — inverted), failure artifacts land in scattered,
confusing locations (`test-results/` dirs containing only `.last-run.json`,
loose `cypress/screenshots/`), and `tests/reports/` contains stale files from
pre-rename eras that nothing cleans up. Mapping a script to its report
requires archaeology.

## Decisions (user-approved)

1. **Scope: everything that can.** Every test script produces an HTML report
   except `test:fullstack:node` (a bare tsx script with no test framework —
   documented exception). This includes the vitest-based suites (new
   `@vitest/ui` dep) and native Cypress (new `cypress-mochawesome-reporter`
   dep).
2. **Path scheme: mirror the script path as directories.** Strip `test:`;
   each remaining segment is a directory under the package's `reports/`.
3. **Artifacts: under each suite's report dir** — everything a run generates
   lives under `reports/`.
4. **Dir shape: `report/` + `artifacts/` siblings.** An empirical spike
   showed Playwright's HTML reporter owns and **wipes** its output folder at
   report-write time (a nested `artifacts/` lost both the raw failure PNG and
   the report's own attachment data). Each reporter therefore owns only the
   `report/` subdir; `artifacts/` is never touched by a reporter. Uniform
   across all runners (mochawesome also cleans its dir).

## The mapping rule

```
test:<a>:<b>…  ⇒  <package>/reports/<a>/<b>/…/report/index.html   ← open this
                                           …/artifacts/           ← raw failure output (browser suites only)
```

One documented exception: the bare unit script `test` (no segments) maps to
`reports/unit/` in all five packages.

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
  visual/
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
| `test:visual:playwright-ct:react` | Playwright `html` reporter → `reports/visual/playwright-ct/react/report/`; `outputDir` → `…/artifacts/` | golden actual/diff/expected embedded as attachments |
| `test:visual:playwright:react` | same → `reports/visual/playwright/react/{report,artifacts}` | same |
| `test:visual:vitest-browser:react` | vitest `html` reporter → `reports/visual/vitest-browser/react/report/index.html` (**verify** html reporter works in browser mode) | diff PNGs stay next to goldens (`*-actual`/`*-diff`, tied to golden routing — unchanged) |

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
  `test-results/` (keeps `playwright/.cache/` and the golden-diff PNG lines).
- **clean scripts**:
  - `tests`: `rm -rf .turbo reports test-results cypress/screenshots cypress/videos` → `rm -rf .turbo reports`
  - `client`: `rm -rf dist .turbo *.tsbuildinfo playwright-report test-results` → `rm -rf dist .turbo *.tsbuildinfo reports`
  - `domain`/`shared`/`server`: `rm -rf dist .turbo *.tsbuildinfo` → `rm -rf dist .turbo *.tsbuildinfo reports`
  - Root `clean` fans out via `turbo run clean` — no change.
- **turbo.json**: `test` task gains `outputs: ["reports/**"]` — a cached
  replay restores the unit reports (same semantics as `build` ⇒ `dist/`).
  `test:e2e`/`test:visual` are `cache: false`, no outputs needed.
- **CI** (`.github/workflows/ci.yml`): the two failure-upload blocks collapse
  to one path each — `packages/client/reports/` (visual job) and
  `tests/reports/` (e2e job).

## Documentation

- `tests/README.md` — scripts table gains a *report* column; layout section
  notes the `reports/<group>/<suite>/{report,artifacts}` shape; the
  `fullstack:node` exception documented.
- `packages/client/README.md` — same for its scripts table.
- Root `README.md` — two-line pointer in "Checks & tests" (where reports
  land, what the mapping rule is).
- `docs/architecture.md` — report-name references updated **by meaning**
  (the old `cucumber-presenter*.html` names map to
  `presenter/{cucumber,cucumber-fake-timers}/report/index.html`).
- Historical `docs/superpowers/` plans/specs keep old names (per the
  restructure convention).

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
| badeball auto-attach of failure screenshots | force a failing scenario, inspect report | explicit attach in an `After` hook |
| vitest 4 `html` reporter in browser mode (Tier 3) | run the tier, open report | `default` reporter only + documented gap |
| parent-dir creation by each reporter (cucumber/vitest/mochawesome write into not-yet-existing dirs) | run each suite from a cleaned `reports/` | pre-create via the runner script |
| mochawesome dir-cleaning semantics | confirm it only touches its `report/` subdir | point it deeper and copy out |

Each verification is a step in the implementing task, not an afterthought —
same method as the Playwright wipe spike that shaped decision 4.

## Out of scope

- `test:fullstack:node` HTML (no framework; wrap-in-reporter machinery
  rejected as not worth it).
- Report aggregation/merging across suites (each suite stands alone; CI
  uploads the whole `reports/` tree).
- Cleaning golden-diff PNGs.
