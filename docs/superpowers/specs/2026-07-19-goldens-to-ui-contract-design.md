# Relocate the Visual Golden Trees to `@rtc/ui-contract` — Design

**Date:** 2026-07-19
**Status:** Draft for user review. User-decided direction (2026-07-19, spun off PR #282); tracked as the `docs/STATUS.md` ⚪ item "Relocate the visual golden trees to `@rtc/ui-contract`".

## Decision and rationale

Move the committed golden screenshot sets out of `packages/client-react` into
`packages/ui-contract`, so the pixel-contract *artifact* lives beside the
pixel-contract *specification* that already lives there (`scenarios.ts`,
`scenarioActions.ts`, `fixtures.ts`, `goldenPath.ts`). Both clients then
resolve into the contract package symmetrically, which matches what the
goldens have become since the SolidJS port: the cross-framework rendering
contract, not a react-internal test asset.

**The ownership rule does NOT move.** Goldens are *generated exclusively from
`client-react` renders* — react's three `:update` scripts and
`update-visual-goldens.yml` remain the only writers; `client-solid` stays
assert-only (all three guards unchanged). The relocation moves the artifact,
not the authority. Every doc that today says "react owns the goldens" will
say "the goldens live in `ui-contract` and are generated only from
`client-react`, the reference renderer; `client-solid` cannot write them."

**What this is NOT** (lesson of the reverted #272–#275 collapse): no set
collapse, no Docker in the default loop, no change to the dual/3-bucket
structure or the CI-vs-local baseline routing. Only the tree ROOT changes.

## Current state (live-verified 2026-07-19)

- Three golden trees, one per tier, ~336 MB total:
  `packages/client-react/tests/ui/visual/{vitest-browser,playwright,playwright-ct}/__screenshots__/`
  each containing `react/` (CI x86 canonical) + `react-local/{darwin-arm64,linux-arm64}/`.
- Path shape inside each tree: `<baseline>/<testFileName>/<skin>-<mode>/<name>.png`
  (vitest tier nests via `goldenPath()`, playwright tiers via `goldenPathArray()` —
  both live in `packages/ui-contract/src/visual/goldenPath.ts` and are
  **root-agnostic**: they compute name segments only, so they need NO change).
- Resolvers pointing at the trees:
  - react: 3 tier configs with `snapshotDir: "./__screenshots__"` (playwright ×2)
    and hard-coded `"__screenshots__"` path segments in the vitest-browser
    resolver (`vitest-browser.config.ts:~79–140`).
  - solid: 3 tier configs with cross-package anchors, e.g.
    `new URL("../../../../../client-react/tests/ui/visual/playwright/__screenshots__", import.meta.url)`.
- Tooling that names the paths:
  - `.github/workflows/update-visual-goldens.yml` — `rm -rf` ×3 (lines ~95–97),
    `git add` ×3 (~127–129), commit-filter `grep -v '__screenshots__/react/'`
    (~130–132), artifact upload ×3 (~151–153).
  - `.github/workflows/visual.yml` — failure-debris artifact globs ×3 (~166–168)
    plus the comment noting solid's tiers write debris into react's tree (~157).
  - `scripts/goldens-in-container.mjs` (`pnpm goldens:regen|verify`) —
    `cd packages/client-react` (~66), per-tier tree paths (~71, 111, 113).
- Docs/artifacts that state the location: visual README, UPDATING-GOLDENS.md,
  ADR-001 (real file + `docs/adr/` pointer stub), §21 chapter (quotes the
  solid `REACT_SNAPSHOT_DIR` block verbatim), `one-suite-two-frameworks.svg`
  (golden-tree label), showcase pages (`cross-framework-testing.html`,
  `updating-goldens.html`), §8.1, §9.7, both client READMEs, CLAUDE.md
  ("client-react's own goldens"), `docs/STATUS.md` (the ⚪ item itself).

## Target layout

**Option A (recommended): verbatim tree move, root-only change.**

```
packages/ui-contract/goldens/
  vitest-browser/__screenshots__/{react,react-local/{darwin-arm64,linux-arm64}}/…
  playwright/__screenshots__/{react,react-local/{darwin-arm64,linux-arm64}}/…
  playwright-ct/__screenshots__/{react,react-local/{darwin-arm64,linux-arm64}}/…
```

Everything below the tier dir is byte-identical to today (a pure `git mv`),
so every `snapshotPathTemplate`, the baseline routing
(`CI ? "react" : "react-local/<platform>-<arch>"`), the commit-filter's
`__screenshots__/react/` shape, and rename detection in review all survive.
`goldens/` sits OUTSIDE `src/` — it is not compiled, not exported, and not a
package entry; the tsconfig/knip/biome surface of `ui-contract` is untouched
(PNG-only dirs; verify no glob accidentally includes it).

**Option B (rejected): restructure while moving** (e.g. baseline-first
`goldens/react/<tier>/…`). Cleaner-looking, but churns every template, the
commit filter, the wrapper script, and all docs *at the same time as* the
7.7k-file move — and defeats byte-level rename review. Restructures, if ever
wanted, should be their own later change on a stable base.

## Implementation plan (3 commits, one PR)

1. **Commit 1 — the pure move.** A scripted `git mv` of the three trees
   (script kept in the PR description, not the repo), no content changes.
   Byte-for-byte: `git status` shows only renames (`R100`). Scriptability
   matters: if a concurrent golden-refresh lands on main mid-flight, redo the
   catch-up by re-running the script on a fresh merge rather than hand-resolving
   PNG rename conflicts.
2. **Commit 2 — resolvers + tooling.** The 6 tier configs (react's 3 lose
   `./__screenshots__` for a cross-package `../../../../../ui-contract/goldens/<tier>/__screenshots__`
   anchor — the exact pattern solid already uses; solid's 3 re-point from
   `client-react/tests/ui/visual/<tier>` to `ui-contract/goldens/<tier>`),
   the vitest-browser resolvers' path segments (both clients),
   `update-visual-goldens.yml` (rm/add/filter/artifact paths),
   `visual.yml` (debris globs — debris now lands in ui-contract's tree),
   `scripts/goldens-in-container.mjs` (tree paths; the `cd packages/client-react`
   stays — it runs react's `:update` scripts), and any `.gitignore` entries for
   `*-actual/diff/reference.png` debris (grep and mirror). Comment sweep in the
   same files: "cross-package into client-react" wording becomes "into
   ui-contract (goldens generated only from client-react renders)".
3. **Commit 3 — docs + artifacts sweep.** Every doc listed in Current State:
   re-quote the changed config fragments in §21 (they are verbatim quotes),
   update the SVG's golden-tree label + badge (badge stays truthful:
   "generated only from client-react — solid cannot write"), both showcase
   pages, ADR-001 (+ pointer stub path unchanged), READMEs, CLAUDE.md, §8.1,
   §9.7, UPDATING-GOLDENS.md, and move the STATUS ⚪ item to done/removed.
   `pnpm check:doc-links` green; changed mermaid re-verified (mermaid-cli
   v10+v11 + PNG); SVG re-rasterized.

## Verification (gates before merge)

1. **All six tier runs green locally on darwin** (react 3 + solid 3, asserting
   `react-local/darwin-arm64`) — proves resolvers, debris paths, and guards.
2. **`pnpm goldens:verify`** (container byte-compare vs the x86 `react/` set)
   — proves the container wrapper plumbing and that the moved x86 set still
   matches CI rendering, 30/30 runners.
3. **Assert-only guards still bite**: run solid's playwright tier with `-u`
   (expect the throw) and temporarily rename one golden for the vitest tier
   (expect the existsSync throw), then restore.
4. **Old-path sweep**: `grep -rn "tests/ui/visual/(vitest-browser|playwright|playwright-ct)/__screenshots__" -E`
   over source/configs/workflows/docs — zero hits outside `docs/superpowers/`
   history and `.remember/`.
5. **Full gauntlet** + `check:doc-links` + `biome ci`.
6. **CI proof**: PR CI green; after merge, (a) the post-merge `visual.yml` run
   on main must be green with the new paths, and (b) one manual
   `update-visual-goldens.yml` dispatch (artifact-only, safe) to prove the
   regen path end-to-end. Both are explicit post-merge checks, not assumed.

## Risks & mitigations

- **Concurrent golden refreshes** (visual drift auto-commits, sibling
  workstreams re-pinning goldens): PNG rename conflicts are miserable to
  hand-resolve → the move is scripted and re-runnable (Commit 1 note); do the
  final catch-up + merge in one sitting.
- **PR reviewability**: ~7.7k renamed files → the pure-move commit is isolated
  so the reviewable surface is Commits 2–3 (~15 files).
- **Debris location change** (`*-actual/diff/reference.png` now under
  ui-contract): visual.yml globs + gitignore must move in lockstep or CI
  uploads/hygiene silently degrade — explicitly verified by gate 1 (run a
  deliberately-failing scenario locally and check where debris lands) — fold
  that micro-check into gate 3.
- **Quick-loop regression** (the #275 axis): nothing about the daily loop
  changes — same commands, same native speed; only paths. Gate 1 is the
  witness.
- **Stale-path stragglers**: gate 4's sweep, plus post-merge memory update
  (`project_visual_goldens_dual_set` names the old paths).

## Non-goals

- No set collapse, no baseline-routing change, no golden regeneration (bytes
  move, pixels don't), no CT-adapter changes, no restructure beyond the root
  move (Option B rejected), no change to which client generates goldens.
