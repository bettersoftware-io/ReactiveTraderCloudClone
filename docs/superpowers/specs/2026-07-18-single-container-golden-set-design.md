# Single container-canonical visual golden set — Design

**Date:** 2026-07-18
**Status:** Approved (investigation + proof-of-concept), pending spec review

## Problem

Visual-golden regeneration is the repo's sharpest CI/dev bottleneck, and the
root cause is the **two committed golden sets**:

- `react/` — the canonical x86 baseline, rendered in the pinned Playwright
  container, enforced by CI.
- `react-local/<platform>-<arch>/` — a per-developer-architecture set, because
  native pixels never match the x86 set.

This split imposes real, recurring costs, all of which surfaced concretely while
shipping PR #260 (`chrome/account-menu-open`):

1. **Full-matrix regen for a one-scenario change.** `update-visual-goldens.yml`
   has no scenario filter — it `rm -rf`s the entire `react/` set and re-renders
   ~1,200 scenarios × 3 tiers (~3,600 images), then uploads an artifact. A
   single new scenario costs a ~30-minute workflow.
2. **Manual artifact → cherry-pick → commit.** A human downloads the artifact,
   extracts *only* the touched images, and commits them. Error-prone, and only
   safe because the author knows exactly which files are theirs.
3. **Collision with concurrent golden work.** The full wipe-and-regen drags in
   any other in-flight golden work; on #260 it surfaced a sibling worktree's
   `prefs-modal` / `credit-new-rfq` goldens that had to be manually discarded.
4. **Double maintenance.** Every intentional UI change must regenerate *both*
   sets — the x86 set via the workflow, the local set via the runner's `:update`
   scripts — or `pnpm test:ui:visual` stays red locally even once CI is green.
5. **arm64 devs cannot produce CI-matching pixels at all.** They render natively
   and get a *different* set; they cannot locally reproduce or verify the
   canonical baseline that actually gates the project.

`ADR-001-visual-diff-tooling.md` frames the two-set split as unavoidable:
"Screenshot pixels depend on OS/arch font rasterization (FreeType/HarfBuzz), so
a single golden filename is *not* portable across machines." It records that the
emulated-container alternative was **rejected without measurement** — "an
emulated container (which on Apple Silicon would be slow qemu amd64)."

## Evidence — the premise was never tested, and it's wrong

This spec is backed by a proof-of-concept run on 2026-07-18 (arm64 Mac, Docker
29.6.1, the `chrome/account-menu-open` scenario, all three tiers):

| Comparison | Result | Conclusion |
| --- | --- | --- |
| Native **arm64** vs native **x86** (fonts already self-hosted via `@fontsource/*`) | **29.6 %** of pixels differ (RMSE 5.4 %) | Native cross-arch drift is real and large. It is font **rasterization** (per-CPU sub-pixel rounding), **not** availability — bundling fonts did *not* converge it. A single *native* cross-arch set is impossible. |
| **Emulated `--platform linux/amd64`** container on arm64 vs the committed native-x86 `react/` set | **30/30 byte-identical** across all three tiers (playwright, playwright-ct, vitest-browser); `strictAE=0`, `cmp` byte-identical; playwright + playwright-ct assert passed 10/10 at the enforced `maxDiffPixelRatio: 0.06` | The emulated container reproduces CI's x86 output **exactly**. A single container-canonical set is viable. |
| Emulated `pnpm install` cost | **21 s warm** (Docker layer + pnpm-store cache), ~4 min cold; render in seconds | The ADR's "slow qemu" objection is overstated for the common warm case. |

The ADR's assumption ("not portable across machines") is true for *native*
rendering and false for the *emulated container* — which nobody had measured.
qemu faithfully emulates the x86 instructions the container's Skia/FreeType use,
so the output is deterministic regardless of host architecture.

**Reproduction recipe** (for the spec reviewer to re-run):

```
docker run --rm --platform linux/amd64 \
  -v "$PWD":/src:ro -v "$OUT":/out \
  -e CI=1 -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 -e RTC_VISUAL_MAX_PARALLEL=1 \
  mcr.microsoft.com/playwright:v1.61.0-noble \
  bash -lc 'set -e; mkdir -p /build && cd /build;
    tar -C /src --exclude=node_modules --exclude=.git --exclude=.claude \
        --exclude=dist --exclude="*.tsbuildinfo" -cf - . | tar -xf -;
    corepack enable; pnpm install --frozen-lockfile; pnpm build;
    cd packages/client-react;
    npx playwright test -c tests/ui/visual/playwright/playwright.config.ts -g account-menu'
```

`CI=1` forces the `react/` baseline (all three configs route
`process.env.CI ? "react" : "react-local/<plat>-<arch>"`). vitest-browser must
run the **full** `--update` (not `-t`-filtered) to dodge its first-mount race
(the first test in a fresh page renders empty).

## Approach

Collapse to **one canonical `react/` golden set**, generated and verified
everywhere through the pinned x86 container:

- **CI** renders in the container natively (unchanged — it already does).
- **Developers on any architecture** render through the *same* container via
  `docker run --platform linux/amd64`, getting byte-identical pixels.
- `react-local/<platform>-<arch>/` is **deleted** — the whole tree, across all
  three tiers, plus the `react-local` branch in every config.

This dissolves problems 4 and 5 outright, and — composed with a scenario filter
and auto-commit (below) — problems 1–3 as well.

## Components

### 1. Delete `react-local/<arch>` and simplify the configs

- Remove the `react-local/<platform>-<arch>/` screenshot trees under all three
  tiers in `packages/client-react/tests/ui/visual/{playwright,playwright-ct,vitest-browser}/__screenshots__/`.
- In each of the three configs, replace
  `const baseline = process.env.CI ? "react" : \`react-local/${os.platform()}-${os.arch()}\``
  with a constant `"react"`. Drop the now-unused `os` import.
- The Solid client's visual configs already point at react's `react/` tree
  (assert-only, cross-package `snapshotDir`); they need only the same
  `react-local` → `react` constant simplification, no path re-anchoring.

### 2. Container wrapper script — `scripts/goldens-in-container.mjs`

A single entry point that runs any visual command inside the pinned container:

- `pnpm goldens:regen [-- -g <pattern>]` → runs the three `:update` scripts in
  the container, writing to `react/`. Optional scenario filter forwarded as
  `-g`/`-t`.
- `pnpm goldens:verify [-- -g <pattern>]` → runs the three assert scripts in the
  container (the local equivalent of the CI visual job — CI-exact, no arch
  caveat).

Mechanics: mount the repo, copy source into a container-internal `/build`
(excluding `node_modules`/`.git`/`.claude`/`dist`), `pnpm install --frozen-lockfile`,
`pnpm build`, run the tier command(s) with `CI=1`, copy the produced `react/`
PNGs back. Pins the same image tag as `ci.yml` / `update-visual-goldens.yml`
(single source of truth for the tag — see Open decision B). Requires Docker; the
script fails with a clear message if the daemon is unreachable.

### 3. `update-visual-goldens.yml` — scenario filter + auto-commit

Now that there is one reproducible set, the workflow can stop being a
full-regen-and-artifact chore:

- **`scenario_pattern` dispatch input** — when set, pass `-g`/`-t` and **skip the
  `rm -rf`**, regenerating only matching goldens (a one-scenario change: ~1 min,
  not ~30).
- **Auto-commit to the PR branch** — replace the artifact upload with
  `git commit && git push` of the regenerated goldens using the workflow token
  (`permissions: contents: write`). With the filter, it commits *only* the
  touched images — no cherry-pick, no cross-worktree collision. (Confirm the
  built-in `GITHUB_TOKEN` can push to branches; the repo's fine-grained PAT
  403s on some ops, but `GITHUB_TOKEN` + `contents: write` should suffice.)
- **Comment trigger (optional, stretch)** — `/regen-goldens <pattern>` on a PR
  dispatches the above, so regeneration never leaves the PR.

### 4. Fix the vitest-browser first-mount race

The first test in a fresh vitest-browser page renders empty (`<body><div/></body>`),
so any `-t`-filtered or isolated single-scenario run fails its first test with
`Cannot find element … getByTestId`. This currently forces a full-suite `--update`
for that tier. Fix by awaiting element visibility before the first interaction in
`vitest-browser/visual.spec.tsx` (e.g. `await expect.element(screen.getByTestId(action.click)).toBeVisible()`
before clicking) so filtered/targeted runs are reliable — a prerequisite for a
clean, filtered container regen of that tier.

### 5. Rewrite `ADR-001-visual-diff-tooling.md`

Replace the "Cross-platform pixel drift → two committed baselines" section with
the measured finding: one container-canonical set; native rendering drifts
(~30 %) and is never used for goldens; the emulated container is byte-exact.
Record the 2026-07-18 measurement as the basis. Update the workflow header
comments and `tests/ui/visual/README.md` accordingly (they currently instruct
regenerating both sets).

## Migration / rollout plan

1. **Land the harness fix (#4) first** — independent, unblocks filtered tier runs.
2. **Add the wrapper script (#2)** and prove `pnpm goldens:verify` passes against
   the *current* committed `react/` set on an arm64 machine (byte-identical, per
   the PoC).
3. **Delete `react-local/` + simplify configs (#1)** in one PR. `pnpm test:ui:visual`
   then targets `react/` only; on a dev machine it is run via the wrapper.
   Net diff is large (deletes a whole tree) but purely subtractive.
4. **Update the workflow (#3)** — filter + auto-commit — and the docs/ADR (#5).
5. Each step is independently shippable and CI-gated; do them as a short
   sequence of small PRs, not one mega-PR.

## Open decisions (need the reviewer's call)

- **A. Fast native inner loop?** Rendering through the container is CI-exact but
  slower than a native `pnpm test:ui:visual` (cold ~4 min). Options: (i) container
  only — simplest, one path, always correct; (ii) keep a *non-committed* native
  render mode for quick "did my pixels move?" iteration, with the container as
  the commit/verify gate. Recommendation: **(i)** to start (simplicity, no second
  code path); revisit if the inner loop feels slow in practice.
- **B. Container tag single-sourcing.** The image tag now appears in `ci.yml`,
  `update-visual-goldens.yml`, and the wrapper script. Pin it once (a shared env
  / a `.github` variable / a committed constant the wrapper reads) so the three
  never drift. Recommendation: yes, as part of #2.
- **C. Cross-machine determinism guarantee.** The PoC proved byte-identity on
  one arm64 host. The 0.06 threshold already absorbs the pre-existing ~1-4 %
  jitter *across GitHub's x86 runner fleet*, so even a future micro-jitter under
  a different host/Docker version passes the gate. We rely on the 0.06 gate, not
  on universal byte-identity. Documented as an explicit assumption.

## Risks / caveats

- **Docker dependency for local visual work.** Devs without Docker can no longer
  regenerate/verify goldens locally — but they already couldn't produce the
  canonical set (only CI could). Net access to the *canonical* set improves.
- **Emulation cold-start.** ~4 min cold vs 21 s warm. Acceptable for a
  regenerate/verify step (not a per-code-change loop); mitigated by Docker layer
  + pnpm-store caching.
- **The ~1-4 % CI-fleet jitter is unchanged** — a separate, pre-existing
  phenomenon that the 0.06 threshold handles; out of scope here.

## Verification plan

- After #1, `pnpm goldens:verify` passes on arm64 and CI's visual job passes on
  x86 against the *same* `react/` set.
- After #3, a filtered dispatch regenerates only the targeted scenario's goldens
  and commits them to the PR branch; `git status` on `main` shows no unrelated
  golden churn.
- ADR-001 and the workflow/README no longer reference `react-local` or "both
  sets."
