---
description: Measure the visual tier's real cross-run noise floor and judge maxDiffPixelRatio against it — catches a tolerance that is blind, flaky, or both
argument-hint: [samples] [--ref <branch>]
allowed-tools: Bash(gh:*), Bash(pnpm:*), Bash(mkdir:*), Bash(rm:*), Bash(find:*), Read
---

Run the repeatable visual-tolerance assessment. Arguments: `$ARGUMENTS`
(default: `3 --ref main`).

## What this measures, and why it exists

The playwright visual tier compares each render against a committed golden and
allows some fraction of pixels to differ before failing
(`maxDiffPixelRatio` in
`packages/client-react/tests/ui/visual/playwright/playwright.config.ts`).
That number is a **noise budget**, and it is only defensible if it is bigger
than the actual noise and smaller than a real change.

It was once neither. Set at `0.06` on the reasoning that *"real layout
regressions move >> 6% of pixels"*, it silently passed a **complete
two-column restructure of PreferencesModal** — new section, ~13 rows
relocated, two rows added — because that change moved only **0.017** of
pixels. A dark HUD is mostly background; glyphs and toggles are a small
fraction of the capture, so even a total rearrangement repaints little. The
justification (*"text-heavy goldens show ~0.04 AA jitter"*) could not be
reproduced later: a 5-sample measurement found **zero**.

So the tolerance can be wrong in two directions at once — too loose to see a
rebuild, while sized for noise that no longer exists. This audit replaces the
assumption with a number.

## The measurement trap — read before changing the script

**Do not count "pixels that differ at all".** The first pass at this analysis
did, and reported `jarvis-orb-attention` wobbling by **30%**, which looked
like a live flake and was nearly "fixed". It was an artifact: that scenario is
a soft blurred glow, so nearly every pixel differs by an average of ~2/765 —
invisible, and below the per-pixel threshold Playwright applies *before* it
counts anything. Under Playwright's own metric the wobble is exactly zero, and
the two renders are visually identical.

`tests/scripts/visual-jitter.ts` therefore compares the way the tier does:
pixelmatch with the same per-pixel `threshold`, counting only pixels above it.
Judge any future change to it against that.

## Procedure

1. **Dispatch N identical golden regenerations on the same commit.** Same code,
   same container — so any difference between two artifacts is pure
   cross-runner noise and nothing else.

   ```bash
   gh workflow run update-visual-goldens.yml --ref main     # repeat N times
   ```

   Dispatch them one command at a time (batching several plus `sleep` into one
   shell line has been refused by the permission classifier). Runs overlap —
   there is no concurrency group — but three concurrent full refreshes contend
   for runners, so allow ~15–20 min rather than the ~11 min a solo run takes.

   **Dispatch on `main` deliberately.** The workflow's commit step is guarded
   by `if: github.ref_name != 'main'`, so a main dispatch uploads an artifact
   and touches nothing. On a branch it would commit goldens to that branch.

2. **Wait for all runs, then download each artifact to its own directory.**

   ```bash
   gh run download <id> -n visual-goldens -D <dir>
   ```

3. **Compare every tree against every other.**

   ```bash
   pnpm visual:jitter <dirA> <dirB> [dirC ...]
   ```

   It reads `threshold` and `maxDiffPixelRatio` from the playwright config, so
   it judges what actually ships. `--json <path>` dumps the per-golden table.

   **Pass ABSOLUTE paths.** The root script is a `pnpm --filter` shim, so the
   working directory is the `tests` workspace and a relative path silently
   resolves against `tests/` (it fails with `ENOENT ... /tests/packages/...`).

   Comparing the COMMITTED goldens against one fresh artifact is the other
   high-value use — it answers "have the references drifted from what the app
   now renders?". That check is what caught 103 stale goldens, including a
   whole Jarvis feature (header orb + overlay re-skin) that had shipped
   unverified because each change sat under the 6% budget:

   ```bash
   pnpm visual:jitter \
     "$PWD/packages/ui-contract/goldens/playwright/__screenshots__/react" \
     /abs/path/to/fresh-artifact
   ```

4. **Record which runner instances were used** — a zero result is only
   meaningful if the runs landed on different machines:

   ```bash
   gh api repos/<owner>/<repo>/actions/runs/<id>/jobs \
     --jq '.jobs[] | "runner=\(.runner_name) labels=\(.labels|join(","))"'
   ```

## Reading the result

- **`identical` near 100%, `p100` ≈ 0** — the tier is deterministic. The
  tolerance can be tightened to whatever leaves sane headroom; it is not
  protecting against anything measurable.
- **A short tail of small non-zero ratios** — genuine glyph-edge AA. Set the
  budget above the p100 of that tail, not above the worst single scenario.
- **One scenario far above the rest** — suspect the SCENARIO, not the
  tolerance. Look at the images before concluding (see the trap above): a
  large soft gradient produces a big *ratio* of imperceptible differences. If
  the pixels really do differ, the scenario is non-deterministic and no
  threshold makes it trustworthy — fix or freeze it instead.
- **Differing dimensions** — never jitter. That is a real layout change, and
  the script reports `1.0` so it cannot hide.

## Acting on it

Prefer, in order:

1. **Fix the scenario** if a specific golden is genuinely unstable.
2. **Per-scenario tolerance** — the call site in `visual.spec.ts` already
   takes options, so a scenario needing headroom can carry its own value
   instead of everyone paying for it.
3. **Lower the global** only to a level with real headroom over the measured
   p100. Leave margin: N samples cannot prove the runner pool is homogeneous,
   and GitHub does not expose the CPU model.
4. **Structural assertions** for layout that pixels cannot see on sparse
   surfaces — e.g. `PreferencesModalPage.rowCountInColumn`, which fails when
   the columns go lopsided while the pixel tier stays green.

## Known limits — state these when reporting

- **N samples, not a proof.** Zero jitter across a handful of runs is strong
  evidence, not a guarantee; a rarer runner variant may exist.
- **Runner heterogeneity is unverifiable.** `runner_name` distinguishes VM
  instances, not microarchitectures.
- **The script approximates the tier's comparator.** It uses the same library
  and per-pixel threshold, but the visual job itself remains the authority.
- **This audits the react x86 `react/` set only** — the canonical one CI
  enforces. The `react-local/<platform>-<arch>/` sets are never rendered by CI
  and are out of scope.
