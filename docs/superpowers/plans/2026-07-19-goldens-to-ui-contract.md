# Goldens → `@rtc/ui-contract` Relocation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the three committed golden screenshot trees from `packages/client-react/tests/ui/visual/*/__screenshots__/` to `packages/ui-contract/goldens/*/__screenshots__/` — a root-only, byte-identical relocation — and re-point every resolver, workflow, script, and doc, with the react-only write-authority rule preserved and stated everywhere.

**Architecture:** Spec `docs/superpowers/specs/2026-07-19-goldens-to-ui-contract-design.md` (Option A: verbatim move) governs. Three commits: pure `git mv` / resolvers+tooling / docs+artifacts.

**Tech Stack:** git rename-only commit; TS config edits (Playwright `snapshotDir` cross-package anchors, vitest-browser custom resolvers); GH Actions YAML; markdown/SVG/HTML sweep.

## Global Constraints

- **Byte identity:** Commit 1 must be 100% `R100` renames — zero content changes, zero adds/deletes; expected count **7,970 files** (2,659 + 2,659 + 2,652 — re-verify live).
- **Ownership rule preserved verbatim in behavior:** react's three `:update` scripts and `update-visual-goldens.yml` remain the ONLY writers; all three solid assert-only guards (existsSync throw, `updateSnapshots: "none"`, `arg.startsWith("-u")` argv guard) keep working — Task 2 proves each still bites.
- **No structural change below the tier dirs:** `react/` + `react-local/{darwin-arm64,linux-arm64}` buckets, `CI ? "react" : "react-local/<platform>-<arch>"` routing, and the `__screenshots__/react/` commit-filter shape all survive.
- **Comment/message wording rule:** where configs/docs say the goldens are *located* in client-react → update to ui-contract; where they say goldens are *owned/generated/updated* by client-react → KEEP (still true). E.g. the guard message "goldens are owned by client-react — run `pnpm --filter @rtc/client-react …:update`" stays correct as-is.
- **Quick-loop unchanged (#275):** same commands, same native speed; no Docker added to any default path.
- **Worktree:** all work in `/Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/goldens-to-ui-contract-spec` (branch `worktree-goldens-to-ui-contract-spec`). Absolute paths; NEVER `git stash`; NEVER push/PR/merge (controller-only).
- Verification renders/PNG inspections use scratchpad `/private/tmp/claude-501/-Users-csx-workarea-dev-github-com-bettersoftware-io-ReactiveTraderCloudClone/41896996-80a5-43bd-a329-009e8ea88889/scratchpad`; mermaid via mermaid-cli v10+v11 with `-p pptr.json` (`{"executablePath":"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}`).

---

### Task 1: The pure move (controller-executed — mechanical)

**Files:** `git mv` of the three trees; no content edits.

- [ ] **Step 1:**

```bash
for t in vitest-browser playwright playwright-ct; do
  mkdir -p packages/ui-contract/goldens/$t
  git mv packages/client-react/tests/ui/visual/$t/__screenshots__ packages/ui-contract/goldens/$t/__screenshots__
done
```

- [ ] **Step 2: Verify rename-only:** `git diff --cached --name-status | awk '{print $1}' | sort | uniq -c` → single `R100` line, count 7,970 (or live count); `git diff --cached --stat | tail -1` shows 0 insertions/deletions.
- [ ] **Step 3: Commit** — `refactor(goldens): move golden trees to @rtc/ui-contract (pure git mv, byte-identical)`.

### Task 2: Resolvers + tooling

**Files:**
- Modify: `packages/client-react/tests/ui/visual/playwright/playwright.config.ts`, `.../playwright-ct/playwright-ct.config.ts`, `.../vitest-browser/vitest-browser.config.ts`
- Modify: `packages/client-solid/tests/ui/visual/playwright/playwright.config.ts` (:61), `.../playwright-ct/playwright-ct.config.ts` (:99), `.../vitest-browser/vitest-browser.config.ts` (:63) + their location-comments
- Modify: `.github/workflows/update-visual-goldens.yml` (~:95–97, :127–129, :130–132 filter, :151–153), `.github/workflows/visual.yml` (~:157 comment, :166–168 globs)
- Modify: `scripts/goldens-in-container.mjs` (~:71, :111, :113 — the `cd packages/client-react` at :66 STAYS: it runs react's `:update` scripts)
- Modify: root `.gitignore` (:26–27 failure-debris-dir lines gain the ui-contract shape), `packages/client-react/.gitignore` (:4–5 debris globs move out)
- Create: `packages/ui-contract/.gitignore` (debris globs: `goldens/**/__screenshots__/**/*-actual.png`, `*-diff.png`, and the `goldens/**/__screenshots__/*.spec.ts{,x}/` debris-dir shape)

**Interfaces:** Consumes Task 1's tree location. Produces the new canonical path string `packages/ui-contract/goldens/<tier>/__screenshots__/` that Task 3 documents.

- [ ] **Step 1 — react configs.** Playwright ×2: replace `snapshotDir: "./__screenshots__"` with a cross-package anchor, exactly the pattern solid uses (`fileURLToPath(new URL("../../../../../ui-contract/goldens/<tier>/__screenshots__", import.meta.url))`; add `node:url` import). Vitest-browser: hoist a `GOLDENS_ROOT` (same `new URL` pattern) and use it in BOTH `resolveScreenshotPath` and `resolveDiffPath` in place of `resolve(root, testFileDirectory, "__screenshots__", …)`; update the header-comment path example (~:79). Depth check: config dir → `../../../../../` lands at `packages/`.
- [ ] **Step 2 — solid configs.** Swap the three `client-react/tests/ui/visual/<tier>/__screenshots__` URL strings → `ui-contract/goldens/<tier>/__screenshots__`; sweep each file's location-comments per the wording rule (ownership language stays). NOTE `playwright-ct.config.ts:28`'s `client-react/tests/ui/visual/playwright-ct/host/` is the CT HOST PAGE, not goldens — do not touch.
- [ ] **Step 3 — workflows + wrapper + gitignore** per the file list. In `visual.yml` the debris globs become `packages/ui-contract/goldens/**/__screenshots__/**/*-{actual,diff,reference}.png` (react's tiers now write debris there too; solid's vitest `__diffs__/` handling is unchanged). In the goldens wrapper, only tree paths change.
- [ ] **Step 4 — repo-wide straggler grep** (source/config/script only; docs are Task 3): `grep -rn "tests/ui/visual/\(vitest-browser\|playwright\|playwright-ct\)/__screenshots__" --include="*.{ts,tsx,mjs,yml,json}" packages .github scripts tests` → fix every hit.
- [ ] **Step 5 — verify (the load-bearing step):**
  1. `pnpm install && pnpm build` (fresh worktree).
  2. `pnpm --filter @rtc/client-react test:ui:visual` → 3/3 runners pass (darwin asserts `react-local/darwin-arm64`).
  3. `pnpm --filter @rtc/client-solid test:ui:visual` → 3/3 runners pass.
  4. Guards still bite: solid playwright tier with `-u` → expect the throw; temporarily `mv` one vitest golden away → expect the existsSync refusal naming the golden → restore.
  5. Debris landing + hygiene: temporarily overwrite ONE `react-local/darwin-arm64` golden with a different scenario's PNG, run just that scenario (react vitest tier), confirm `-actual.png`/`-diff.png` appear under `packages/ui-contract/goldens/...` AND `git status --porcelain` shows only the deliberately-modified golden (debris ignored) → `git checkout` the golden, delete debris.
- [ ] **Step 6 — commit** — `refactor(goldens): re-point resolvers, workflows, wrapper + debris hygiene at ui-contract/goldens`.

### Task 3: Docs + artifacts sweep

**Files (grep-driven; this list is the floor, not the ceiling):**
- `docs/architecture/21-cross-framework-testing.md` — Mechanism 2 quotes the OLD solid `REACT_SNAPSHOT_DIR` block verbatim: RE-QUOTE the new code from the live post-Task-2 file (fragments must stay verbatim); path mentions + the "one golden tree" wording.
- `docs/architecture/one-suite-two-frameworks.svg` — the golden-tree box label (`client-react/…/__screenshots__` → `ui-contract/goldens/…`); the "solid owns 0 goldens" badge STAYS (still true) — add/keep "generated only from client-react" phrasing where it fits.
- `docs/showcase/cross-framework-testing.html` (visual pane fragment + prose) and `docs/showcase/updating-goldens.html` (its path diagrams/prose).
- `packages/client-react/tests/ui/visual/README.md`, `UPDATING-GOLDENS.md`, `ADR-001-visual-diff-tooling.md` (+ confirm the `docs/adr/` pointer stub needs no change), `packages/client-react/tests/ui/visual/*/README*` if any.
- `docs/architecture/08-replaceability-matrix.md` §8.1, `09-test-strategy.md` §9.7, `10-key-design-decisions.md` (§10.9 golden decision), `11-key-files-reference.md`/`13-codebase-map.md`/`16-trailheads.md` (grep), `CLAUDE.md` ("client-react's own goldens" in Current Status; ui-contract/client-solid package descriptions), `packages/client-react/README.md`, `packages/client-solid/README.md`, `packages/ui-contract/README.md` (gains a short "goldens/" section: what lives there, who writes it).
- `docs/STATUS.md` — remove the ⚪ relocation item (shipped).
- [ ] **Step 1:** sweep grep over docs: `grep -rln "tests/ui/visual/\(vitest-browser\|playwright\|playwright-ct\)/__screenshots__\|owns the golden\|own goldens\|client-react's own" docs packages/*/README.md packages/client-react/tests --include="*.{md,html,svg}"` (exclude `docs/superpowers/`, `.remember/`) → fix every hit per the wording rule.
- [ ] **Step 2:** verify: `pnpm check:doc-links` exit 0; re-render every EDITED mermaid block (v10+v11+PNG); re-rasterize the SVG (3 frames) and one showcase screenshot; confirm re-quoted §21 fragments diff-match the live configs.
- [ ] **Step 3:** commit — `docs(goldens): relocation sweep — ui-contract/goldens is the pixel contract's home`.

### Closeout (controller)

- `pnpm goldens:verify` (container byte-compare vs the moved x86 `react/` set — Docker; expect all-runner pass like #265's 30/30).
- Full gauntlet (build/typecheck/test/lint×4/doc-links/scripts/biome).
- Catch-up check vs origin/main (goldens are high-traffic: if a golden-refresh landed, REDO Commit 1 by re-running the move script on a fresh merge rather than hand-resolving PNG conflicts).
- Opus final whole-branch review (configs + workflows + docs; the 7,970-rename commit reviewed as rename-only via `--name-status`).
- Push, PR (body carries the move script + rename-only proof), CI loop, **user merge gate**.
- Post-merge: watch the main `visual.yml` run to green; one manual `update-visual-goldens.yml` dispatch (artifact-only) to prove regen; update memory (`project_visual_goldens_dual_set` names old paths); GitHub spot-check of updated docs.
