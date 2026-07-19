# Publish the visual-diff failure report to GitHub Pages

**Date:** 2026-07-19
**Status:** Approved — ready for implementation plan

## Problem

The `visual` workflow (`.github/workflows/visual.yml`) runs the full theme-matrix
visual-diff gate post-merge (5 skins × dark/light × 3 tiers, for both `react` and
`solid`). On a mismatch it currently only does:

```yaml
- name: Upload visual diff report on failure
  if: failure()
  uses: actions/upload-artifact@...
```

Seeing *which* snapshots broke — and *how* they broke — therefore requires
downloading the zip artifact, extracting it, and opening the HTML locally.
Nobody does that in practice, so a red visual run is effectively opaque: you
know it failed, not what changed. This is the same friction the **coverage
report** already solved by publishing browsable HTML to GitHub Pages
(`coverage-report.yml` → `/coverage/`).

## Goal

On every post-merge `visual` run, publish a browsable page at

```
https://bettersoftware-io.github.io/ReactiveTraderCloudClone/visual/
```

that shows, **for failed scenarios only**, the visual mismatch — the committed
golden (**before**) next to the actual render (**after**) next to the pixel
**diff** — so a human or an agent can see at a glance what broke, and drill into
the tier's native viewer for close inspection. On a green run the same URL shows
a tiny "all tiers green" page so it is never stale.

`/visual/` is a third **disjoint** gh-pages subtree alongside `/coverage/` and
the site hub, using the same publish primitive; none clobbers the others.

## Non-goals

- Not a PR gate. The `visual` job stays post-merge-only (`push: main` +
  `workflow_dispatch`); this only changes what a run *publishes*, not when it
  runs.
- Not a replacement for golden regeneration. The report is a diagnostic; fixing
  a regression or regenerating goldens (`update-visual-goldens.yml`) is
  unchanged.
- No new runtime dependency. The generator is zero-dep Node, like the existing
  `scripts/pages/*.mjs` helpers.

## Report shape (approved)

**Wall + slider drill-through.** The published `/visual/index.html` is a
"wall of broken screens":

- Grouped **package → tier → scenario** (e.g. `react` → `playwright` →
  `fx-tile-stale`).
- Each failed scenario renders three thumbnails side by side:
  **reference (before) | actual (after) | diff**, using the real PNGs.
- Each entry links **"open in slider ↗"** to that tier's own native HTML report
  (Playwright's expected/actual/diff wipe-slider; vitest-browser's report),
  copied alongside under `/visual/reports/<pkg>/<tier>/`.
- Run metadata header: branch, short SHA, timestamp, link back to the workflow
  run.
- A **"Full tier reports"** footer links every tier's native report that exists
  on disk — so a tier that failed for a **non-visual** reason (compile error,
  timeout) with no diff images is still reachable through its own report and is
  never silently dropped, without the generator having to parse per-tier result
  JSON.

Everything published is failures-only *by construction*: passing scenarios
produce no `actual`/`diff` images at all.

**On a green run**, the generator emits an "all visual tiers green @ `<sha>`"
placeholder instead, and publishing it overwrites the previous red wall — so the
URL always tells the truth about the latest run.

## Architecture

Three decoupled pieces; only the first is genuinely new logic.

### 1. `scripts/pages/build-visual-report.mjs` (new, zero-dep Node)

Sits beside `publish-to-pages.mjs` and `build-presentations-index.mjs`. Pure,
file-driven, no dependencies. Responsibilities:

1. **Per-tier scan adapters** — normalize the six report trees (react×3,
   solid×3) into a uniform list of failure records:

   ```
   { package, tier, theme, scenario, referencePath, actualPath, diffPath, reportHref }
   ```

   This isolates the one real complication: the tiers store failure images
   differently (see "Key constraint" below). One adapter per tier shape.
2. **Copy assets** — copy each referenced PNG into `_site/visual/assets/…` and
   copy each tier's native HTML report into `_site/visual/reports/<pkg>/<tier>/`.
3. **Emit `_site/visual/index.html`** — the grouped thumbnail wall + drill-through
   links + run metadata, styled to match the coverage landing page
   (`color-scheme: light dark`, system font, mobile-friendly).
4. **Green case** — if zero failure records are found, emit the "all green"
   placeholder page instead (no assets, no reports subtree).
5. Print a summary line (failure count, or "all green").

CLI shape mirrors the sibling scripts, e.g.:

```
node scripts/pages/build-visual-report.mjs \
  --out _site/visual \
  --react packages/client-react \
  --solid packages/client-solid \
  --branch "$GITHUB_REF_NAME" --sha "$GITHUB_SHA" --run-url "$RUN_URL"
```

### 2. `.github/workflows/visual.yml` (edited)

- **Both test steps always run.** Add `continue-on-error: true` to the `react`
  and `solid` visual steps, then a final **gate step** that fails the job if
  either step's `outcome == 'failure'`. This makes the published report capture
  every failing tier across *both* packages, while the job status stays honestly
  red (the post-merge signal is unchanged).
- **New publish step, `if: always()`.** After both test steps: run
  `build-visual-report.mjs` into `_stage/visual`, then
  `publish-to-pages.mjs --source _stage`. Runs on pass (green page) and fail
  (wall) alike.
- The job gains `permissions: contents: write` (the coverage job has the same),
  and the Playwright-container `safe.directory` git config the coverage job uses
  before `publish-to-pages.mjs` (the container checkout is owned by a different
  user than git runs as).
- **Emit `::notice`** with the live `/visual/` URL, mirroring coverage.
- **Keep** the existing `upload-artifact` on failure as the raw-zip fallback /
  retention.

### 3. `scripts/pages/publish-to-pages.mjs` (unchanged, reused)

Already publishes a disjoint subtree to `gh-pages` with a fetch+rebase retry
loop, so `/visual/`, `/coverage/`, and the hub racing on the branch serialise
cleanly (they touch disjoint top-level entries). No change needed; no
concurrency-group change needed — the rebase loop *is* the cross-workflow
serialisation.

### Data flow

```
react step ─┐ (continue-on-error: true)
solid step ─┤ (continue-on-error: true)
            ▼
 build-visual-report.mjs → _stage/visual/{index.html, assets/, reports/}
            ▼
 publish-to-pages.mjs --source _stage → gh-pages /visual/ (rebase-safe)
            ▼
 gate step: fail job if either test step failed  (job status stays honest)
            ▼
 ::notice  "Visual report → https://…/visual/"
```

## Key constraint: tiers store failure images differently

Confirmed on disk (this is the one piece of real per-tier logic the generator
must absorb):

- **Playwright tiers** (`playwright`, `playwright-ct`): committed golden
  (reference) lives at
  `tests/ui/visual/<tier>/__screenshots__/react/<spec>/<theme>/<scenario>.png`;
  on failure Playwright writes `-expected` / `-actual` / `-diff` PNGs into its
  `outputDir` (`reports/ui/visual/<tier>/react/artifacts/…`) and embeds them in
  its own HTML report at `reports/ui/visual/<tier>/react/report/`.
- **vitest-browser tier**: writes `-actual` / `-diff` PNGs *into*
  `__screenshots__/` next to the committed golden; its HTML report is at
  `reports/ui/visual/vitest-browser/react/report/index.html`.
- **solid** mirrors the same structure under `packages/client-solid/…` (its
  tiers assert against react's goldens but write their own actual/diff/report).

The scan adapters encapsulate this variance so the wall-rendering code sees one
uniform record type. Preference: drive discovery off each tier's own machine
output where practical (the artifacts dir / report), falling back to globbing the
known locations, rather than hard-coding scenario lists.

## Error handling & edge cases

- Discovery is failure-driven: the generator globs for `*-diff.png` under each
  package's `reports/` and `tests/ui/visual/**/__screenshots__/` trees (a diff
  image exists **only** for a failed scenario), then resolves the sibling
  `-actual` and the reference (Playwright's `-expected` sibling, or the
  vitest-browser golden `<name>.png`). Tiers differ in where they drop these;
  the glob tolerates both.
- The generator never throws on a missing/partial tree: an unreadable directory
  yields zero rows for that tier, and it always emits a valid `index.html`. A
  tier with no diff images contributes no wall rows but still appears in the
  "Full tier reports" footer if its report dir exists.
- Publishing is idempotent: `publish-to-pages.mjs` replaces the whole `/visual/`
  entry each run, so the green page fully overwrites a prior red wall (and vice
  versa).

## Testing

- **`build-visual-report.mjs`** is pure, zero-dep, and file-driven, so it is
  unit-tested against **fixture report trees**, in the `@rtc/tests` workspace
  (where the `coverage:report` tooling already lives):
  - *Mixed failure fixture* (react + solid, ≥2 tiers, incl. a non-visual failure
    row) → assert the generated `index.html` groups entries correctly and
    references the copied asset/report paths; assert the assets were copied.
  - *All-pass / empty fixture* → assert the "all green" page is emitted and no
    assets/reports subtree is created.
- **Workflow change** is validated by a manual `workflow_dispatch` run after
  merge (the `visual` job only runs post-merge/dispatch anyway) — confirm both
  the failure-wall path (against a deliberately-broken golden or a known-red
  commit) and the green path.

## Optional (small, include if cheap)

- Add a `/visual/` link to the docs hub (`docs/pages/index.html`) next to the
  coverage link, so the report is discoverable from the Pages landing page.

## Files touched

| File | Change |
|---|---|
| `scripts/pages/build-visual-report.mjs` | **new** — scan adapters + wall/green HTML generator |
| `.github/workflows/visual.yml` | both steps always-run + gate; `if: always()` build+publish step; `contents: write`; `::notice` |
| `packages/tests/**` (or existing report-tooling workspace) | **new** unit test + fixture report trees |
| `docs/pages/index.html` | *(optional)* add `/visual/` hub link |
