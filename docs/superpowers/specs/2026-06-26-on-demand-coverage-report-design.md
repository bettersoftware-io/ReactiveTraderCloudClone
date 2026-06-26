# On-Demand Coverage Report — Design

**Date:** 2026-06-26
**Status:** Proposed (awaiting review)
**Branch:** `worktree-coverage-report-on-demand`

## Problem

The maintainer often works from a phone and cannot read the project's test and
coverage results through GitHub. Today those results exist only as:

- raw console output inside collapsed Actions **log steps** (`pnpm test`, the
  `≥95%` coverage gate), which is painful to scroll on mobile; and
- **failure-only zip artifacts** (`ui-visual-report`, `e2e-report`) that the
  GitHub mobile app cannot open and which contain HTML anyway.

Nothing is rendered as readable content on a GitHub page reachable from a phone.
We want a **single mobile-readable report** that gives a test pass/fail summary
plus a *detailed* coverage view — including the actual untested source lines —
generated **on demand** against any branch.

## Constraints

1. **The repository is private.** GitHub Pages is therefore unusable: on a free
   plan you cannot publish Pages from a private repo, and on paid (Pro/Team)
   plans the published site is **public**, which would leak source. Private
   (access-gated) Pages is Enterprise-only. → No Pages.
2. **GitHub Actions job summaries render behind repo auth** and are first-class
   in the GitHub mobile app. They render Markdown — tables, headings,
   collapsible `<details>`, fenced code — but **cannot display CI-generated
   images** (no fetchable URL; GitHub strips `data:` URIs). Pure text/code is
   fine, which is all this report needs.
3. **Job summary size cap: 1 MiB per step.** The untested-snippet renderer must
   guard against this rather than silently truncating.
4. **No new third-party services** (Codecov/Coveralls), per the repo's
   self-contained, "defer commitment" ethos. New *npm devDependencies* are
   acceptable (the single-runtime-dep rule binds only `@rtc/domain`).

## Goals

- One **on-demand** workflow, triggerable from the GitHub mobile app, that runs
  against **any branch** the user picks (no `main`/feature distinction).
- A **single consolidated job-summary page** containing:
  - a **test summary** of the fast suites (unit + contract); and
  - a **detailed coverage report**: per-package totals + collapsible per-file
    **snippets of the untested source lines**.
- Truthful `src/ui` coverage by **merging** the client `contract` and `visual`
  test tiers (a line covered by either tier is covered).

## Non-Goals

- No visual-diff reporting (dropped — a diff with no images is meaningless;
  job summaries cannot embed the images).
- No e2e in the test summary (heavy: Cypress + xvfb + Playwright + 10-way
  orchestration). Unit + contract only.
- No automatic triggering on push/PR. On-demand only.
- No coverage *gating* changes. The existing `≥95%` gate in `ci.yml` is
  untouched; this report is read-only.
- No `shared` coverage (the package has zero tests).

## Design

### Trigger

A new workflow `.github/workflows/coverage-report.yml` with `on:
workflow_dispatch` **only**. The maintainer runs it from the GitHub mobile app
(Actions → "Coverage Report" → **Run workflow** → choose branch). This single
mechanism satisfies "on demand" and "branch-agnostic" with no PR plumbing,
comment bot, or extra permissions.

### Single job (Playwright container)

One job runs in `mcr.microsoft.com/playwright:v1.61.0-noble` (the same image the
`visual` job uses, tag tracking `@playwright/test`). The container is required
because the client **visual** coverage tier runs in a real browser; the
Node-based coverage runs fine inside it too, so everything fits in one job.

Steps:

1. Checkout, Node 26, Corepack (pnpm 11.5.2), `pnpm install --frozen-lockfile`.
   `CYPRESS_INSTALL_BINARY: "0"` (e2e not run here).
2. `pnpm build` — the visual coverage harness and the tsc-built libs import
   `@rtc/domain` / `@rtc/shared` via their `dist/`; a fresh checkout has none.
3. **Run coverage**, each emitting istanbul-format JSON (`coverage-final.json`)
   plus a vitest **json test-results** file:
   - `@rtc/domain` — `test:coverage`
   - `@rtc/server` — `test:coverage`
   - `@rtc/client-react` — `test:app:coverage`, `test:ui:contract:coverage`,
     `test:ui:visual:vitest-browser:react:coverage`
4. **Generate the report** — a Node script reads every run's coverage JSON and
   test-results JSON, merges, renders Markdown, and appends it to
   `$GITHUB_STEP_SUMMARY`.

> All vitest coverage providers (the v8 ones for app/contract and the istanbul
> one for the visual tier) can emit a `json` reporter producing
> **istanbul-shaped** `coverage-final.json`, so the outputs are mergeable across
> providers. Merging uses istanbul's coverage-map merge
> (`istanbul-lib-coverage`, added as a devDependency to `@rtc/tests`).

### Coverage merge

For each source file the generator builds a merged coverage map:

- `client-react` `src/ui`: merge the **contract** and **visual** tiers (a
  statement/branch hit in *either* counts as covered).
- `client-react` `src/app`: from the app tier.
- `domain`, `server`: each from its single `test:coverage` run.

From the merged map it computes per-file line coverage and the set of **uncovered
line numbers**.

### Test summary

The vitest json reporter output (`numTotalTests`, `numPassedTests`,
`numFailedTests`, `numPendingTests`, per file) is aggregated into a small table:
one row per run (domain / server / app / contract / visual) with
passed/failed/skipped counts and an overall ✅/❌ status line at the top.

### Report format (written to `$GITHUB_STEP_SUMMARY`)

```
# Coverage Report — <branch> @ <short-sha>

## Tests
✅ 1234 passed · 0 failed · 2 skipped

| Suite    | Passed | Failed | Skipped |
|----------|-------:|-------:|--------:|
| domain   |    ... |      0 |       0 |
| server   |    ... |      0 |       0 |
| app      |    ... |      0 |       0 |
| contract |    ... |      0 |       0 |
| visual   |    ... |      0 |       0 |

## Coverage
| Package      | Lines | Covered | Uncovered |
|--------------|------:|--------:|----------:|
| domain       | 92.1% |     ... |       ... |
| server       | ...   |     ... |       ... |
| client (ui)  | ...   |     ... |       ... |
| client (app) | ...   |     ... |       ... |

### Untested lines
<details><summary>src/ui/foo/Bar.tsx — 87.0% (5 uncovered)</summary>

```tsx
 42  if (rare) {
 43    handleEdgeCase()
 44  }
 ...
```
</details>
<details> ... worst-coverage files first ... </details>
```

Files are listed **worst-coverage first**. Each `<details>` block holds the
uncovered source lines as a numbered fenced code block, so the maintainer reads
the real code on the phone, collapsed by default.

### Size safety (1 MiB cap)

The generator tracks cumulative byte size as it appends file blocks. When the
next block would approach the cap it stops emitting snippets and instead lists
the remaining files as **line-numbers-only**, followed by an explicit
`… N more files: snippets omitted (summary size cap)` note. It never silently
drops content.

## Approaches considered

1. **GitHub Pages HTML report** — the natural "browse untested lines" tool, but
   rejected: a private repo can't publish Pages safely (unavailable, or public →
   source leak). *Rejected.*
2. **Codecov / Coveralls** — polished mobile app + PR comments, but adds a
   third-party service + token against the repo's ethos. *Rejected.*
3. **Job summary, on demand (chosen)** — self-contained, behind repo auth,
   mobile-native, no new services. Renders untested source as Markdown code
   blocks. Only limitation (no inline images) is irrelevant now that visual diff
   is out of scope.

## Files

**Added**

- `.github/workflows/coverage-report.yml` — the `workflow_dispatch` workflow.
- `tests/scripts/coverage-report.ts` (the `@rtc/tests` package lives at `tests/`)
  — the merge + Markdown generator. Reads coverage + test-results JSON, writes to
  `$GITHUB_STEP_SUMMARY`.

**Changed**

- `tests/package.json` — add `istanbul-lib-coverage` devDependency and
  a script to run the generator; possibly add `json` to the coverage configs'
  reporter lists (or override on the CLI in the workflow) so each run emits
  `coverage-final.json` + a json test-results file.

**Unchanged**

- `ci.yml` and its `≥95%` coverage gate; all existing test/coverage scripts'
  pass/fail behavior.

## Testing strategy

- **Generator unit tests** (vitest, in `@rtc/tests`): feed fixture
  `coverage-final.json` + test-results JSON and assert the rendered Markdown —
  per-file uncovered line extraction, worst-first ordering, the contract∪visual
  merge (a line covered only by the visual fixture is *not* reported uncovered),
  and the size-cap fallback (a large fixture truncates to line-numbers + note).
- **Local dry run**: run the generator against real locally-produced coverage
  JSON, directing output to a file instead of `$GITHUB_STEP_SUMMARY`, and eyeball
  the Markdown.
- **Live validation**: trigger the workflow on the feature branch and confirm the
  summary renders (desktop + mobile app).

## Risks / open questions

- **v8↔istanbul merge fidelity**: both emit istanbul-shaped JSON, but if any
  shape mismatch appears, the fallback is to report the visual tier separately
  rather than merged (still truthful, just two `src/ui` rows). To verify during
  implementation.
- **Container/runtime parity**: coverage line numbers come from source, so the
  container only affects the visual tier's *execution*, not snippet rendering.
- **Summary cap**: coverage is already high, so snippet volume should be small;
  the size guard covers the tail case.
