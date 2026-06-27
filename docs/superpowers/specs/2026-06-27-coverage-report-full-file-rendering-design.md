# Coverage Report — Full-File Rendering + Per-Tier Sections — Design

**Date:** 2026-06-27
**Status:** Proposed (awaiting review)
**Branch:** `worktree-coverage-report-full-file-rendering`
**Builds on:** the on-demand coverage report (`docs/superpowers/specs/2026-06-26-on-demand-coverage-report-design.md`)

## Problem

The current job-summary coverage report lists only the **uncovered lines** of each
file, with no surrounding source — hard to read, you can't see the code around a
gap. It also **conflates the two UI test tiers** (`test:ui:contract:coverage` and
`test:ui:visual:…`) into a single unioned `client/ui` section, so for a `src/ui`
file you can't tell which script measured (or missed) it.

Wanted:

1. Render the **whole file** (most are small) with **uncovered lines, partial
   branches, and portions highlighted** — as close as a GitHub job summary allows
   to the istanbul HTML report saved on disk.
2. Report each test tier **separately**, so a file's coverage is attributable to a
   specific script.

## Constraints

- **Job summaries are sanitized GitHub markdown — no HTML/CSS.** GitHub strips
  `style`/`class`/`script`, so istanbul's colored HTML view cannot be embedded.
  The only per-line color mechanism is a **```diff fenced block**: lines starting
  with `-` render red, `+` green. → use a `diff` block; trade syntax highlighting
  for coverage coloring.
- Job-summary hard cap **1 MiB per step**, measured in **UTF-8 bytes**. The existing
  byte-accurate guard + degradation (full block → line-numbers-only → omit) stays.
- No new third-party services. New npm devDeps allowed.
- Existing `ci.yml`, the `≥95%` contract gate, and all coverage scripts are
  untouched. The report is read-only.
- `istanbul-lib-coverage` (already a devDep) exposes both `getLineCoverage()` and
  `getBranchCoverageByLine()` per file — both work on v8-provider and
  istanbul-provider `coverage-final.json` (both are istanbul-shaped).

## Goals

- **Five standalone tier sections** (no cross-tier union):
  `domain`, `server`, `client/app`, `client/ui (contract)`, `client/ui (visual)`.
  A `.tsx` instrumented by both UI tiers appears once per tier, each showing that
  tier's own view (this is signal: the visual tier is a golden-gap finder).
- Each file with gaps → a collapsible `<details>` containing a **```diff block**:
  - **Whole file** when ≤ 200 source lines; larger files → **context windows**
    (±5 lines around each gap, overlapping windows merged, `⋮` between them).
  - Uncovered statement lines and partial-branch lines → red `-`; all other lines
    → plain context (space prefix). Inline line numbers throughout.
  - Partial branches get an inline note: `// ⚠ branch C/T not taken`.
  - `<summary>` title: `client/ui (visual) · src/ui/App.tsx — 88.0% (4 uncovered, 1 partial branch)`.
- Files sorted **worst line-coverage first** across all tiers.
- Coverage table: **5 rows**, line-based % (unchanged metric).

## Non-Goals

- No literal istanbul HTML in the summary (impossible — sanitized markdown).
- No syntax highlighting in snippets (the `diff` language is required for coloring).
- No change to which coverage runs (the workflow already produces all 5
  `coverage-final.json` files; only the CLI's grouping changes).
- No `shared`/e2e coverage; no gating changes.

## Design

### Data model (`tests/scripts/lib/coverage.ts`)

Replace the line-only model with a branch-aware, per-tier one. **Drop `unionLines`**
(no cross-tier merge anymore).

```ts
interface LineCov {
  hits: number;                                 // statement hits (0 ⇒ uncovered line)
  branch?: { covered: number; total: number };  // present only when the line has branches
}
type FileCov = Map<number, LineCov>;            // line number → coverage
type FileMap = Map<string, FileCov>;            // absolute file path → per-line coverage

interface FileStat {
  file: string;
  total: number;                // instrumented lines
  covered: number;              // lines with hits > 0
  pct: number;                  // line coverage %, total === 0 ⇒ 100
  uncoveredLines: number[];     // hits === 0, ascending
  partialBranchLines: number[]; // hits > 0 but branch.covered < branch.total, ascending
  lines: FileCov;               // full per-line coverage, for the renderer
}

interface PackageStat { name: string; total: number; covered: number; pct: number; files: FileStat[] }
```

- `coverageOf(json): FileMap` — for each file in the coverage map, read
  `getLineCoverage()` (→ hits per line) and `getBranchCoverageByLine()` (→
  `{covered,total}` per line), and combine into `FileCov`. Lines appear from the
  line-coverage set; branch data is attached where present.
- `fileStat(file, FileCov): FileStat` — line-based totals/pct (as today), plus
  `uncoveredLines` and `partialBranchLines`, retaining `lines` for rendering.
- `packageStat(name, FileMap): PackageStat` — aggregate; include a file when it has
  **any** uncovered line **or** partial branch; sort files worst-pct first.

> Per-line branch counts (not branch identities) make the model provider-agnostic;
> since tiers are no longer merged, even that concern is moot.

### Rendering (`tests/scripts/lib/render.ts`)

Replace `snippet`/`fileBlock` with diff-block rendering. Keep `SUMMARY_CAP`,
`NOTE_RESERVE`, the byte-accurate accounting, `testSection`, and `coverageTable`
unchanged (the table just receives 5 packages).

- `FULL_FILE_MAX = 200`. `CONTEXT = 5`.
- `fileDiff(stat: FileStat, source: string[]): string` returns the diff-block body:
  - **interesting lines** = `uncoveredLines ∪ partialBranchLines`.
  - If `source.length <= FULL_FILE_MAX`: render every line `1..source.length`.
  - Else: build ranges by expanding each interesting line ±`CONTEXT`, merge
    overlapping/adjacent ranges, render each range; insert a `  ⋮` line between
    non-contiguous ranges.
  - Per rendered line `n`:
    - prefix = `-` if `n` is uncovered or partial-branch, else ` ` (space).
    - text = `{prefix}{String(n).padStart(4)}  {source[n-1] ?? ""}`.
    - if `n` is a partial branch: append `    // ⚠ branch {covered}/{total} not taken`.
- `fileBlock(stat, rel, tier, source)`:
  ```
  <details><summary>{tier} · {rel} — {pct}% ({U} uncovered[, {B} partial branch(es)])</summary>

  ```diff
  {fileDiff}
  ```
  </details>
  ```
  `{B}` segment omitted when there are no partial branches. When `source` is null
  (unreadable), fall back to `linesOnlyBlock`.
- `linesOnlyBlock` (degraded / cap fallback): one `<details>` listing
  `uncovered lines: …` and, if any, `partial-branch lines: …`. No source.
- `render(input)`: unchanged control flow — flatten all tiers' files worst-first,
  emit `fileBlock` until the byte budget (`SUMMARY_CAP − NOTE_RESERVE`) is hit,
  then `linesOnlyBlock`, then count omissions and append the cap note.

### CLI (`tests/scripts/coverage-report.ts`)

`TIERS.coverage` becomes **five single-path tiers** (no `paths[]` union):

```ts
coverage: [
  { name: "domain",                path: "packages/domain/reports/unit/coverage/coverage-final.json" },
  { name: "server",                path: "packages/server/reports/unit/coverage/coverage-final.json" },
  { name: "client/app",            path: "packages/client-react/reports/app/coverage/coverage-final.json" },
  { name: "client/ui (contract)",  path: "packages/client-react/reports/ui/contract/coverage/coverage-final.json" },
  { name: "client/ui (visual)",    path: "packages/client-react/reports/ui/visual/coverage/coverage-final.json" },
]
```

`main()` maps each tier: read its JSON (skip if missing), `coverageOf` →
`packageStat`. The `coverageOverride` option shape changes from `{name, files[]}`
to `{name, file}`. `TIERS.results` is unchanged.

### Workflow

**Unchanged.** It already runs all five coverage tiers and invokes
`coverage:report`; only the CLI's grouping of the produced JSON changes.

## Approaches considered

1. **diff-block full file (chosen)** — only markdown mechanism for per-line color;
   full context; branch notes inline. Loses TS syntax highlighting (acceptable —
   coverage color is the point).
2. **Embed istanbul HTML** — impossible; job summaries strip HTML/CSS.
3. **Keep unioned UI tier** — rejected: hides which script covers a `src/ui` file,
   the explicit ask. Splitting also removes the union code.

## Files

**Modified**
- `tests/scripts/lib/coverage.ts` — branch-aware model; `coverageOf`; extend
  `fileStat`/`packageStat`; remove `unionLines`.
- `tests/scripts/lib/coverage.test.ts` — new model + branch tests; drop union tests.
- `tests/scripts/lib/render.ts` — `fileDiff` + diff-block `fileBlock`; updated
  `linesOnlyBlock`; title with partial-branch count.
- `tests/scripts/lib/render.test.ts` — diff-block assertions (full file, windows,
  branch note, byte cap).
- `tests/scripts/coverage-report.ts` — 5 single-path tiers; `coverageOverride`
  shape; drop `unionLines` import.
- `tests/scripts/coverage-report.smoke.test.ts` — override shape; fixture may gain
  branch data.
- `tests/scripts/lib/__fixtures__/domain.coverage.json` — add `branchMap`/`b` to
  exercise branch rendering (optional second fixture if cleaner).

**Unchanged**
- `.github/workflows/coverage-report.yml`, `ci.yml`, all coverage scripts.

## Testing strategy

- **coverage.ts**: `coverageOf` maps hits + branch per line; `fileStat` computes
  line pct, `uncoveredLines`, and `partialBranchLines` (a line with
  `branch.covered < branch.total` and `hits > 0` is partial, not uncovered; a fully
  branch-covered line is neither). `packageStat` includes partial-branch-only files
  and sorts worst-first.
- **render.ts**: small file → diff block contains **every** line number with `-` on
  uncovered/partial lines and space on covered; a partial-branch line carries the
  `// ⚠ branch C/T` note; a >200-line file renders windows with `⋮` and ±5 context;
  `Buffer.byteLength(md,"utf8") <= SUMMARY_CAP` holds for a large pathological input
  (existing regression tests retained, adapted to diff output).
- **CLI smoke**: renders from fixtures with the 5-tier manifest and the new
  override shape without throwing; output contains a `diff` block and the tier label.
- **Local end-to-end**: run the node tiers' coverage, run the generator to `--out`,
  eyeball the diff blocks render and tier labels are correct (incl. a `.tsx` shown
  under both `client/ui (contract)` and `client/ui (visual)`).

## Risks / open questions

- **`diff` block + very long lines**: GitHub wraps; acceptable. Tabs in source
  render as-is.
- **`getBranchCoverageByLine` shape**: assumed `{covered,total}` per line; verify
  against istanbul-lib-coverage at implementation time (TDD fixture).
- **Full-file size**: bounded by the 200-line threshold + the byte cap degradation;
  a repo with many large low-coverage files would degrade to windows/line-numbers,
  logged by the cap note.
