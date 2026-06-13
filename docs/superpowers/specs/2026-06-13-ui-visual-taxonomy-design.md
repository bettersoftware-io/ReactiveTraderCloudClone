# UI Visual Tier Refold (Phase 3) — Design

**Status:** Approved (2026-06-13). Completes the taxonomy started in
`2026-06-13-ui-test-taxonomy-and-coverage-design.md`, which deferred this change
to its own branch because it rewires CI and moves committed golden images.

## Problem

Phase 1/2 moved the contract tier to `tests/ui/contract/` and renamed its scripts
to `test:ui:contract*`, but the **visual** tier — which tests the *same* `src/ui`
layer's *appearance* — still lives at `tests/visual-diff/` with `test:visual-diff:*`
scripts. The taxonomy is half-done: `ui:contract` reads as a sibling of nothing.
The intended end-state is both aspects of the `ui` layer under `tests/ui/`:

| Aspect | Folder | Scripts |
|---|---|---|
| contract (DOM/function) | `tests/ui/contract/` ✅ done | `test:ui:contract*` ✅ done |
| visual (appearance) | `tests/ui/visual/` *(this phase)* | `test:ui:visual:*` *(this phase)* |

## Goal

Move the visual tier to `tests/ui/visual/` and rename `test:visual-diff:*` →
`test:ui:visual:*` with **full symmetry** (folder + scripts + reports path +
import alias + tsconfig name + Turbo task), landed via a **CI-validated PR**.
Pure rename/move: no new tests, no behaviour change, no golden regeneration.

## Taxonomy (target)

| Axis | Before | After |
|---|---|---|
| Folder | `packages/client/tests/visual-diff/` | `packages/client/tests/ui/visual/` |
| Leaf scripts | `test:visual-diff:<runner>:react[:update\|:ui]` | `test:ui:visual:<runner>:react[:update\|:ui]` |
| Aggregates | `test:visual-diff`, `test:visual-diff:react` | `test:ui:visual`, `test:ui:visual:react` |
| Reports | `reports/visual-diff/<runner>/react/` | `reports/ui/visual/<runner>/react/` |
| Alias | `@ui-harness` → `tests/visual-diff/react` | `@ui-visual` → `tests/ui/visual/react` |
| tsconfig | `tsconfig.visual-diff.json` | `tsconfig.ui-visual.json` |
| Turbo task | `test:visual-diff` | `test:ui:visual` |
| Goldens | 102 PNGs (`react/` + `react-local/linux-arm64/`) | same bytes, new parent (`git mv`) |

The three runners (`playwright-ct`, `playwright`, `vitest-browser`) and the
framework axis (`react`, future `solid`) are unchanged.

## Blast radius (every file that says `visual-diff`)

- **Scripts/config:** root `package.json` (1 line, the Turbo passthrough),
  client `package.json` (11 scripts + the `clean` script's host-cache path),
  `turbo.json` (`test:visual-diff` task → `test:ui:visual`),
  `tsconfig.visual-diff.json` (rename file; alias paths; the `exclude` entry),
  the 3 runner configs, `run-all.ts`, `.gitignore` (3 globs).
- **CI:** `ci.yml` (visual job: `pnpm test:visual-diff` → `pnpm test:ui:visual`;
  3 artifact-upload globs), `update-visual-goldens.yml` (3 `:update` script
  names; 3 artifact paths; the header comment's local-regen instructions).
- **Goldens:** 102 PNGs under `playwright-ct/`, `playwright/`, `vitest-browser/`,
  each in `react/` and `react-local/linux-arm64/`.
- **Living docs:** root `README.md`, `tests/README.md`, client `README.md`,
  in-suite `README.md` + `ADR-001-visual-diff-tooling.md`, `STATUS.md`.

## The fiddly bits (where a naive move breaks)

1. **Path-depth bump.** `tests/visual-diff/playwright/` → `tests/ui/visual/playwright/`
   is one directory deeper. The two Playwright configs' relative report/artifact
   paths (`../../../reports/...`) must become `../../../../reports/...`, or reports
   write to the wrong directory. (`snapshotDir: "./__screenshots__"` is
   config-relative and survives untouched — this is why the move keeps goldens
   valid.) The `vitest-browser` config uses root-relative `reports/...` strings
   and a `__screenshots__` path resolver — those change by string edit, not depth.
2. **`run-all.ts` discovery rewrite.** The filter currently hard-codes
   `parts.length === 4 && parts[1] === "visual-diff"`. Under the new naming the
   **leaf** runners are 5-part (`test:ui:visual:playwright-ct:react`) and the
   **aggregate** is 4-part (`test:ui:visual:react`) — inverting the old length
   check. Rewrite to `parts.length === 5 && parts[1] === "ui" && parts[2] === "visual"`,
   with framework = `parts[4]`. `:update`/`:ui` variants are 6-part and stay
   naturally excluded.
3. **Both workflows** must be edited together; `update-visual-goldens.yml` is the
   golden-update bot and is easy to forget.
4. **`.gitignore`** repoints its 3 `tests/visual-diff/**` globs to `tests/ui/visual/**`.
5. **Goldens move with bytes unchanged** (`git mv`) → no regeneration needed.

## Validation

- **Local pre-check (arm64):** run the renamed `test:ui:visual` against the
  committed `react-local/linux-arm64/` set → green before pushing.
  Playwright + vitest-browser are Node-driven and unaffected by the Cypress
  aarch64 message-pump spin, so this runs locally.
- **CI is the acceptance gate** (the reason for the PR route): the PR's `visual`
  job must pass — proving the move, the depth fixes, and the x86 `react/` goldens
  all line up. A manual `workflow_dispatch` of the renamed
  `update-visual-goldens.yml` must produce its `visual-goldens` artifact —
  proving the bot survived the rename.
- **Local full check:** `pnpm --filter @rtc/client typecheck` (now via
  `tsconfig.ui-visual.json`) + `pnpm build` + `pnpm --filter @rtc/client test`
  green; `grep -rl "visual-diff"` returns only the historical
  `docs/superpowers/plans|specs` records.

## Scope guards

- **Historical docs untouched** (mirrors Phase 1/2): the `2026-06-06/07-*visual-diff*`
  plans/specs in `docs/superpowers/` are point-in-time records and are left
  verbatim — they keep the old `visual-diff` name on purpose.
- **No new tests, no golden regeneration, no behaviour change.** This is purely a
  rename + move. Any test/coverage work is out of scope.
- **Phase 4+ (not now):** a future `:solid` runner is still discovered
  automatically by the rewritten `run-all.ts`; nothing here pre-builds it.

## Land route

New branch `feat/ui-visual-taxonomy` → push → PR. Merge only after the `visual`
CI job is green and the golden-update bot has been confirmed via a manual dispatch.

## Risks

- **Forgetting `update-visual-goldens.yml`** — the bot fails silently until next
  use. Mitigated by the manual-dispatch validation step being part of acceptance.
- **Depth-path regression** — reports land in the wrong directory and look
  "missing." Mitigated by an explicit `../../../` → `../../../../` audit step in
  the plan and a post-run check that `reports/ui/visual/**` is populated.
- **`run-all.ts` filter** silently matching zero runners (exits 1) or the wrong
  set — mitigated by asserting the runner list it prints before the move is
  reproduced after.
