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

0. **Enumerate every tolerance knob before measuring anything.** There is more
   than one, and the first run of this audit (2026-07-28) tightened only the
   one it happened to be looking at:

   ```bash
   grep -rn "maxDiffPixelRatio\|pixelmatch(" --include="*.ts" packages/ tests/ \
     | grep -v node_modules | grep -v "/reports/" | grep -v "/dist/"
   ```

   | knob | gates CI? | notes |
   |---|---|---|
   | `client-react/.../playwright.config.ts` | **yes** (`visual.yml`) | the tier that WRITES the goldens |
   | `client-solid/.../playwright.config.ts` | **yes** (`visual.yml`) | assert-only; judges solid's renders against **react's** goldens |
   | `ui-contract/src/visual/scenarios.ts` per-scenario overrides | **yes** (both web tiers) | `strict: true` = zero tolerance; `maxDiffPixels: N` RAISES the absolute cap for one scenario — each use must state its measured basis in a comment (grep both fields) |
   | `client-react-native/tests/visual/shared/diff.ts` | **no** — runs in no workflow | `DEFAULT_RATIO = 0.06`, per-pixel `threshold: 0.1`; local-only |

   **Both web tiers read the same golden set, so the LOOSEST of the two is the
   real gate** — tightening react alone buys nothing while solid tolerates 12x
   more. That is not hypothetical: PR #424 lowered react to `0.005` and solid
   sat at `0.06` for three days, its comment still claiming to be a verbatim
   copy of react's. `pnpm visual:jitter` now prints both and shouts on
   divergence, so step 3 surfaces this without anyone remembering to look.

   Beware rationale stored **by reference**. "Copied verbatim from X, see X for
   the full rationale" is true when written and false the moment X changes —
   and X is exactly what an audit changes. Each knob states its own basis.

   **A ratio alone is the wrong shape, and hides its worst case.** It scales
   with area, so one number means very different sensitivity per golden. On
   this set (1,462 goldens, measured 2026-07-31 at `0.005`):

   | | absolute budget |
   |---|---|
   | smallest golden | 36 px |
   | median | 631 px |
   | 1920x1080 full-page (202 of them) | **10,368 px** — a 101x101 block |

   So the ratio is loosest precisely on the big composed screens where a
   regression hides best. Playwright takes
   `Math.min(maxDiffPixels, maxDiffPixelRatio x area)` (verified in
   playwright-core's `compareBuffers`, not from the docs), so pairing the ratio
   with an absolute `maxDiffPixels` **only ever tightens** — it caps the large
   captures while small ones stay on the ratio, and nothing needs
   re-baselining. Both web tiers now carry `maxDiffPixels: 100`.

   When judging a budget, compute the absolute px it grants on the LARGEST
   golden, not the ratio. `node` over the PNG headers is enough — the ratio
   number on its own tells you almost nothing about what can slip through.

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
- **The jitter measurement is react-rendered.** Both web tiers' budgets are now
  read and compared (step 0), but the artifacts being differenced come from
  `update-visual-goldens.yml`, which renders react. So the measured noise floor
  is react's; solid's budget is justified by the separate fact that a full
  `visual.yml` at `0.005` passes, not by a solid-side jitter sample.
- **The RN tier is unaudited and ungated.** `client-react-native`'s
  `compareToGolden` keeps `DEFAULT_RATIO = 0.06` with per-pixel `threshold: 0.1`
  (a different comparator from Playwright's). It runs in no workflow, so it
  gates nothing today — but the number is unmeasured, and would need its own
  sampling before anyone relies on it.
