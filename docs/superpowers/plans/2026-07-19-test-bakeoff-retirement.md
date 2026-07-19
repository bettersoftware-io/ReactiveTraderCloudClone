# Test Bake-off Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End the deliberate test-tooling bake-off: pick one winner per category (visual tier → Tier 2 plain Playwright; browser driver → native Playwright; presenter runner → plain vitest-fake-timers), retire or park the losers, fix the stale docs/comments the bake-off era left behind, and record each verdict where the comparison was documented.

**Architecture:** Six PR-sized tasks, each independently green and merged via the shipping-repo-changes ritual. Task 1 (doc truth sync) goes first. Tasks 2 (Solid login parity) and 3 (visual retirement) are mutually independent and may run in parallel worktrees. Tasks 4 → 5 → 6 (Cypress deletion → presenter collapse → Gherkin parking) are **sequential** — all three rewrite `tests/scripts/run-all.ts`, `tests/scripts/grep-gates.ts`, `tests/package.json`, and the same doc sections.

**Tech Stack:** pnpm workspaces + Turborepo, Vitest 4 (browser mode), Playwright 1.61, cucumber-js 11, GitHub Actions.

## Global Constraints

- **Shipping ritual per task (non-negotiable):** `git fetch origin main` → fresh worktree off `origin/main` → edit → local gauntlet → push → PR → poll `gh run list --branch <b> --workflow CI --json status,conclusion,headSha` until the run for your HEAD SHA is `completed`/`success` (NEVER `gh pr checks` — 403) → Rule-3 triage → `gh pr merge <n> --merge --subject "Merge PR #<n>: <title>"` → confirm ancestor → remove worktree. See `.claude/skills/shipping-repo-changes/SKILL.md`.
- **Local gauntlet before every push:** `pnpm typecheck && pnpm build && pnpm test && biome ci . && pnpm lint && pnpm check:doc-links`. After dep removals additionally `pnpm install` (lockfile) + `pnpm lint:dead` (knip) + `pnpm lint:deps` (dependency-cruiser). When workflow YAML changes: `pnpm lint:actions`. When e2e wiring changes: `pnpm test:e2e` (full local fan-out — Cypress runs fine on this Mac until Task 4 deletes it).
- **Grep-gate numbering is frozen:** deleted gates leave a tombstone comment (`// Gates 12–14 retired with Cypress (2026-07-19) — numbers not reused.`), never renumber survivors — docs and history address gates by number.
- **Historical artifacts are immutable:** do not edit anything under `docs/presentations/**`, `docs/superpowers/plans/**` (other than this file's checkboxes), or `docs/superpowers/specs/**`. Fix living docs only.
- **Biome policy:** zero findings, no `biome-ignore` disables; mandatory braces (`useBlockStatements`); `#/` subpath aliases; ESLint blank-line padding may need `pnpm eslint . --fix` after mechanical edits.
- **Vercel/deploy untouched:** nothing here touches deploy workflows.
- **Bake-off verdicts are part of the deliverable:** each retirement task rewrites the corresponding "why keep them all" doc section into a past-tense verdict with the 2026-07-19 evidence (numbers below), rather than deleting the comparison story.

## Measured evidence (2026-07-19) — cite these numbers in doc updates

- **CI (ubuntu 2-core):** `checks` job ≈ 10.1 min; `e2e` job ≈ 8.0 min. Visual job (post-merge `visual.yml`): **~50–54 min true job time** per push to main — react step ~25.3 min + solid step ~27.2 min, 1282 scenarios × 3 tiers × 2 clients, serial (`RTC_VISUAL_MAX_PARALLEL=1`); ~21 merges/day ⇒ ~18 runner-hours/day; goldens regen (`update-visual-goldens.yml`) ~32 min.
- **CI e2e per-suite** (parallel fan-out, `RTC_E2E_MAX_PARALLEL=2`): native Playwright 202.9s · playwright-cucumber 144.6s · native Playwright (solid) 176.4s · playwright-cucumber (solid) 132.5s · presenter cucumber (real timers) 40.7s · presenter cucumber-fake-timers 2.0s · presenter vitest-fake-timers 2.5s · presenter vitest-quickpickle 4.0s · fullstack node 4.6s · fullstack browser 12.8s. (Cypress de-gated on CI since #66.)
- **Local (Apple M2 Max, isolated, 2026-07-19):** visual tier 1 playwright-ct **241s**, tier 2 playwright **258s**, tier 3 vitest-browser **83s** (all 1282 scenarios, vs the 2026-06-21 README numbers of 4.9/11.6/11.7s at 88 scenarios — the ×10 theme matrix inverted the ranking); ui-contract plain **14s**; presenter vitest-fake-timers **1s**, cucumber-fake-timers **3s**.
- **Corrected claims:** the contract specs do **not** double-run on CI (client plain `test` configs and ui-contract's `include: ["src/**/*.test.ts"]` all exclude `*.contract.spec.ts`; only the two coverage gates run them — the "Tests (unit + ui:contract)" step label is stale). The "whole-app paint smoke in Tier 1" claim in 09 §9.7 is stale — no paint-smoke spec exists in `playwright-ct/`; the full-App scenarios in the shared matrix subsumed it in every tier.

---

### Task 1: Doc truth sync + timing refresh (PR A — docs only + one CI label)

**Files:**
- Modify: `tests/STRATEGY.md`, `tests/README.md`, `docs/architecture/09-test-strategy.md`, `docs/architecture/12-architectural-gates.md`, `packages/client-react/tests/ui/visual/README.md`, `packages/ui-contract/README.md`, `.github/workflows/ci.yml` (one step name)

**Interfaces:** Produces nothing code-level; later tasks re-edit some of the same sections (expected — they run sequentially).

- [ ] **Step 1: Fix `tests/STRATEGY.md` internal contradictions** (6-browser reality landed in §2 only):
  - L32 ladder diagram: `Browser   (4 suites)` → `Browser   (6 suites)`.
  - §3.1 (L101+): header "the 4 browser suites" → "the 6 browser suites"; recompute the shares — Behaviour specs **3 of 6** (both `-cucumber` + `playwright-cucumber:solid`), Scenario layer **5 of 6** (all but native Cypress), Step definitions **3 of 6**, Test context **all 6**, PO impls per-driver (solid reuses `playwright/`).
  - §4 mermaid: add `B5["playwright (native) :solid"]` and `B6["playwright-cucumber :solid"]` to the BROWSER subgraph with edges `PWPO --> B5`, `PWPO --> B6`, `BSCEN --> B5`, `BSCEN --> B6`, `BSTEPS --> B6` (keep ≤5 boxes per rank — stack as needed).
  - §5.4 L291 "all ten" → "all twelve"; L282 "browser ×4 matrix" → "browser matrix (4 styles × 2 clients)".
  - §5.5: L307 "all ten are measurable" → "all twelve"; keep the 2026-06-21 local table but retitle it "Measured durations (isolated, local — 2026-06-21)"; append a second table "CI durations (2026-07-19, ubuntu 2-core, parallel fan-out `RTC_E2E_MAX_PARALLEL=2` — not isolated)" with the ten CI per-suite numbers from the evidence block above.
  - §7 L480 "runs all ten" → "runs all twelve".
  - §8 L519 "the eight-runner stack" → "the twelve-suite e2e stack".
- [ ] **Step 2: Fix `tests/README.md`**: L130 "3001–3004" → "3001–3006 (react 3001–3004, solid 3005–3006)"; L84 "[shared: all 4 browser suites]" → "[shared: all 6 browser suites]"; L93 "[shared: all 5 Gherkin-driven suites]" → count check (playwright-cucumber, cypress-cucumber, playwright-cucumber:solid + 2 presenter cucumber peers = 5 — keep but spell them out); L50 "25 grep/custom architecture gates" → drop the literal count: "the grep/custom architecture gates (see `tests/scripts/grep-gates.ts` for the current list)".
- [ ] **Step 3: Fix `docs/architecture/09-test-strategy.md`**: §9.6 L110 "The 8 transport ports (…8 names…)" → "The transport ports (17 contract describers — see `packages/domain/src/ports/__contracts__/`)"; §9.7 L138 delete the parenthetical "(also hosts the whole-app **paint smoke** …)" — stale, no such spec exists; §9.10 mermaid c8 "grep gates (29)" → "grep gates"; §9.10 L164 "~20-min visual-diff job" → "~50-min visual-diff job (react + solid, 3 tiers each — see visual.yml)"; §9.5 L102 timing note: keep the ratio story but update: "Runtime: ~1–3s vs ~21–41s for the real-time peer (machine-dependent; ~1s vs ~18.6s measured 2026-06; 2.0s vs 40.7s on 2-core CI 2026-07-19)".
- [ ] **Step 4: Fix `docs/architecture/12-architectural-gates.md`**: update any total-count claims to reference the file rather than a literal, or the current count (37); leave per-gate rows intact.
- [ ] **Step 5: Refresh `packages/client-react/tests/ui/visual/README.md` measured section**: "same 88 scenarios" → "same 1282 scenarios (≈130 base × the 5-skin × dark/light theme matrix)"; replace the measured-durations table with the 2026-07-19 numbers (tier 1 **241s**, tier 2 **258s**, tier 3 **83s**) + a sentence noting the ranking inverted since 2026-06-21 (CT's per-mount overhead scales worse than vitest-browser's in-page renders); update the e2e cross-ref sentence to cite CI figures (~133–203s per browser suite).
- [ ] **Step 6: `packages/ui-contract/README.md`**: "80+" spec files → "86 spec files / 622 tests (2026-07-19)".
- [ ] **Step 7: `.github/workflows/ci.yml` L110**: step name `Tests (unit + ui:contract)` → `Tests (unit)` — contract specs run only in the two coverage-gate steps (verified 2026-07-19: no plain-`test` config includes `*.contract.spec.ts`).
- [ ] **Step 8: Verify + ship**: `pnpm check:doc-links && biome ci . && pnpm lint:actions`; commit `docs(tests): sync bake-off docs to 12-suite/6-browser reality + 2026-07-19 timings`; PR + CI loop + merge per Global Constraints.

### Task 2: Solid `VITE_DEV_AUTH` parity + de-excluded `login.spec.ts` (PR B)

**Files:**
- Modify: `packages/client-solid/src/app/buildBrowserPorts.ts`, `packages/client-solid/src/ui/App.test.tsx`, `tests/browser/playwright/playwright.config.ts`, `tests/scripts/devServer.ts`, `docs/STATUS.md`, `docs/architecture/21-cross-framework-testing.md`, `tests/STRATEGY.md` (§6 L409-416), `docs/showcase/cross-framework-testing.html` (L619 excl-note), `CLAUDE.md` ("Demo accounts & auth env"), `docs/env-files.md`, `docs/authentication.md`, `docs/DEPLOY.md`
- Create: `packages/client-solid/.env.development`

**Interfaces:**
- Consumes: `AuthSimulator(devCredentials: Record<string,string>)` from `@rtc/domain` (roster gate + password equality — see `packages/domain/src/simulators/AuthSimulator.ts:26-41`).
- Produces: `client-solid` reads `import.meta.env.VITE_DEV_AUTH` identically to `client-react`; `notYetPortedSpecs` empty.

- [ ] **Step 1: Mirror `parseDevAuth` into `packages/client-solid/src/app/buildBrowserPorts.ts`** — copy the helper verbatim from `packages/client-react/src/app/buildBrowserPorts.ts:35-56`:

```ts
function parseDevAuth(raw: string | undefined): Record<string, string> {
  if (raw === undefined) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => {
        return typeof entry[1] === "string";
      },
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}
```

Replace the hardcoded block (current lines 84-91) with:

```ts
// Dev credentials come from VITE_DEV_AUTH (committed .env.development — the
// demo roster; see packages/domain/src/auth/roster.ts), exactly as in
// client-react's buildBrowserPorts. Unset/malformed → no accepted credentials.
const auth = new AuthSimulator(
  parseDevAuth(import.meta.env.VITE_DEV_AUTH as string | undefined),
);
```

- [ ] **Step 2: Create `packages/client-solid/.env.development`** — copy `packages/client-react/.env.development` verbatim, editing the header comment's script names (`pnpm dev:solid` / `dev:solid:fs`, "client-solid"). The final line is identical:

```
VITE_DEV_AUTH={"astark":"mcdc2026","nromanoff":"mcdc2026","tchalla":"mcdc2026","demo":"mcdc2026"}
```

- [ ] **Step 3: Fix the pinned unit test** `packages/client-solid/src/ui/App.test.tsx` — its `signIn()` helper (L180-191) drives `demo`/`mcdc2026` against the real `buildBrowserPorts()`; with the env unset under vitest the login would now fail and the test hang. Add at describe-level:

```ts
beforeEach(() => {
  vi.stubEnv("VITE_DEV_AUTH", '{"demo":"mcdc2026"}');
});
afterEach(() => {
  vi.unstubAllEnvs();
});
```

(Keep `mcdc2026` in `signIn()` — minimal diff.) Run: `pnpm --filter @rtc/client-solid test` → PASS.
- [ ] **Step 4: De-exclude the spec** — `tests/browser/playwright/playwright.config.ts`: replace the stale comment block (L13-22) + `notYetPortedSpecs` with:

```ts
// Specs excluded for the Solid run. Empty since client-solid gained the same
// VITE_DEV_AUTH dev-credential path as client-react (login.spec.ts now runs
// against both clients); the mechanism stays for any future genuine port gap.
const notYetPortedSpecs: string[] = [];
```

(Drop the `isSolid ?` ternary; keep `testIgnore: notYetPortedSpecs`.)
- [ ] **Step 5: Fix `tests/scripts/devServer.ts` comment** (L90-99): rewrite to state both clients read `VITE_DEV_AUTH` via `parseDevAuth` in their `buildBrowserPorts`, the value seeds `demo`/`demo` for `login.spec.ts`, and every other spec seeds a session via `tests/browser/authSeed.ts`.
- [ ] **Step 6: Verify e2e on both clients**: `pnpm build` then `pnpm --filter @rtc/tests test:browser:playwright` and `RTC_CLIENT_PKG=@rtc/client-solid pnpm --filter @rtc/tests test:browser:playwright:solid` — login.spec passes on both.
- [ ] **Step 7: Docs sweep**: remove the `docs/STATUS.md` "Solid `login.spec` e2e" bullet (L33); update `docs/architecture/21-cross-framework-testing.md` L311-324 + L421 (exclusion gone — rewrite as "previously excluded … enabled 2026-07-19"); `tests/STRATEGY.md` §6 L409-416 (same); `docs/showcase/cross-framework-testing.html` L619 excl-note → "login.spec.ts runs on both clients since the Solid VITE_DEV_AUTH parity change"; `CLAUDE.md` "Demo accounts & auth env" → mention both committed `.env.development` files; `docs/env-files.md` / `docs/authentication.md` / `docs/DEPLOY.md` — update the "react reads it, solid hardcodes" sentences.
- [ ] **Step 8: Ship**: gauntlet + commit `feat(solid): read VITE_DEV_AUTH like react — de-exclude login.spec for Solid e2e`; PR + CI loop + merge.

### Task 3: Visual tier retirement — keep Tier 2, Tier 3 → coverage-only, delete Tier 1 (PR C)

**Files:**
- Delete: `packages/client-react/tests/ui/visual/playwright-ct/` (whole dir), `packages/client-solid/tests/ui/visual/playwright-ct/` (whole dir), `packages/client-solid/tests/ui/visual/vitest-browser/` (whole dir), `packages/ui-contract/goldens/playwright-ct/` (whole tree), `packages/ui-contract/goldens/vitest-browser/` (whole tree) — ~5,300 PNGs, ~226 MB
- Modify: `packages/client-react/package.json`, `packages/client-solid/package.json`, `packages/client-react/tests/ui/visual/vitest-browser/visual.spec.tsx`, `.../vitest-browser.config.ts`, `.../vitest-browser.coverage.config.ts`, `packages/client-react/tests/ui/visual/run-all.ts` + solid's (comments), `packages/client-react/tsconfig.ui-visual.json`, `.github/workflows/visual.yml`, `.github/workflows/update-visual-goldens.yml`, `scripts/goldens-in-container.mjs`, `scripts/pages/build-visual-report.mjs` (doc comments), `knip.json`, plus docs (Step 9)

**Interfaces:**
- Produces: `pnpm test:ui:visual` (both clients) discovers **only** the `playwright` tier (run-all's 5-part-script discovery makes this automatic once scripts are deleted); `test:ui:visual:vitest-browser:react:coverage` runs the full scenario matrix with the pixel assert compiled out via `__RTC_VISUAL_SKIP_DIFF__`.

- [ ] **Step 1: Delete tier dirs + goldens**: `git rm -r packages/client-react/tests/ui/visual/playwright-ct packages/client-solid/tests/ui/visual/playwright-ct packages/client-solid/tests/ui/visual/vitest-browser packages/ui-contract/goldens/playwright-ct packages/ui-contract/goldens/vitest-browser`
- [ ] **Step 2: Prune scripts** — `packages/client-react/package.json`: delete `test:ui:visual:playwright-ct:react`, `...:update`, `...:ui` (L31-33), `test:ui:visual:vitest-browser:react` (L37) and `...:update` (L38); **keep** `test:ui:visual:vitest-browser:react:coverage` (L39), the two aggregates, all three `playwright` scripts, and `test:ui:coverage` (L26); update `clean` (L41) to drop the `playwright-ct/host/.cache` glob. `packages/client-solid/package.json`: delete `test:ui:visual:playwright-ct:solid` (L17), `...:ui` (L18), `test:ui:visual:vitest-browser:solid` (L21). Remove devDependency `@playwright/experimental-ct-react` from client-react; run `pnpm install`.
- [ ] **Step 3: Compile-time skip-diff flag.** In `vitest-browser.config.ts` add a top-level `define` to `defineConfig({ ... })`:

```ts
define: {
  // The coverage config flips this to "true": render + interactions still run
  // (istanbul sees every branch) but the pixel assert is compiled out — its
  // goldens were retired when this tier left the CI-assert role (2026-07-19).
  __RTC_VISUAL_SKIP_DIFF__: "false",
},
```

In `vitest-browser.coverage.config.ts`'s `defineConfig({...})` second arg add `define: { __RTC_VISUAL_SKIP_DIFF__: "true" },` (mergeConfig lets the later value win). In `visual.spec.tsx` add near the imports `declare const __RTC_VISUAL_SKIP_DIFF__: boolean;` and wrap the assert (L121-123):

```ts
if (!__RTC_VISUAL_SKIP_DIFF__) {
  await expect
    .element(target)
    .toMatchScreenshot(goldenPath(name, scenario));
}
```

Run: `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:coverage` → PASS with a populated `reports/ui/visual/coverage/` and no golden reads.
- [ ] **Step 4: Workflows.** `visual.yml`: rename step L102 → `Visual diffs — react (playwright)` and L112 → `Visual diffs — solid (playwright, asserting react's goldens)`; update header comment L3-13 (3 tiers/6 tier-runs → 1 tier/2 runs, ~1282 scenarios each, expected ~17 min), the `RTC_VISUAL_MAX_PARALLEL` comment L49-56, and the solid `__diffs__` exception note L158-161 (gone with solid's vitest-browser tier). `update-visual-goldens.yml`: in the wipe step (L92-97) keep only the `playwright` tree `rm -rf`; delete the `Regenerate playwright-ct goldens` (L107-108) and `Regenerate vitest-browser goldens` (L113-114) steps; reduce the auto-commit `git add` list (L133-136) and fallback artifact `path` (L157-160) to the `playwright` tree; update the "~1222" and duration comments (1282; full regen now ~11 min).
- [ ] **Step 5: Wrapper + report tooling.** `scripts/goldens-in-container.mjs`: `TIERS` (L29) → `["playwright"]`; delete the playwright-ct and vitest-browser lines from the inner container script (L67-69) and reduce the copy-back loop (L71) to `playwright`. `scripts/pages/build-visual-report.mjs`: functional code is tier-agnostic (`tierOf()`); update the scanPackage doc comments (L96-106) only.
- [ ] **Step 6: Config hygiene.** `knip.json`: remove `tests/ui/visual/playwright-ct/host/index.tsx` from the client-react entry list (L83) and both solid playwright-ct host entries (L53-54). `packages/client-react/tsconfig.ui-visual.json`: remove the `playwright-ct.config.ts` exclude entry (L36). Both `run-all.ts` files: update "three runners / all three" comments.
- [ ] **Step 7: Local verification**: `pnpm --filter @rtc/client-react test:ui:visual` (runs tier 2 only, passes vs `react-local/darwin-arm64`), `pnpm --filter @rtc/client-solid test:ui:visual` (tier 2 asserting react's trees), coverage script (Step 3), plus full gauntlet incl. `pnpm lint:dead` (knip must be clean after the dep/entry removals) and `pnpm lint:actions`.
- [ ] **Step 8: `pnpm goldens:verify`** (Docker, ~10 min) — proves the container wrapper still verifies the surviving `playwright/react` tree byte-for-byte.
- [ ] **Step 9: Docs + verdict.** `ADR-001-visual-diff-tooling.md`: add a dated **Outcome** section — Tier 2 (plain Playwright URL host) selected as the sole CI-asserted tier (framework-agnostic spec reused verbatim by Solid; no CT-adapter version lag; production-like `page.route`/navigation); Tier 1 retired (its Solid side was already a URL-navigation fallback — the CT adapter never caught up — and local cost inverted at 1282 scenarios: 241s vs 258s vs 83s); Tier 3 retired from asserting but retained as the istanbul coverage gap-finder behind `__RTC_VISUAL_SKIP_DIFF__`. Rewrite: visual `README.md` (tier table, "why keep all three" → verdict, commands, goldens tree = `playwright/` only), `UPDATING-GOLDENS.md` (single-tier routes; regen ~32 → ~11 min), `COVERAGE-GAPS.md` (coverage instrument note), `09-test-strategy.md` §9.7 + §9.10 (visual job ~17 min), `21-cross-framework-testing.md` Mechanism 2 (incl. mermaid nodes L274-275), `packages/ui-contract/README.md` (goldens tree), `packages/client-react/README.md`, `packages/client-solid/README.md`, `docs/showcase/cross-framework-testing.html` + `docs/showcase/updating-goldens.html`, `docs/architecture/11-key-files-reference.md`, `docs/architecture/16-trailheads.md`.
- [ ] **Step 10: Ship**: commit `refactor(visual)!: retire playwright-ct + vitest-browser assert tiers — Tier 2 is the visual contract` ; PR + CI loop + merge; **watch the next post-merge `visual.yml` run lands ~17 min**.

### Task 4: Cypress deletion (PR D)

**Files:**
- Delete: `tests/browser/cypress/` (22 files incl. `scenarios/` fork), `tests/browser/cypress-cucumber/` (4 files), `tests/browser/page-objects/cypress/` (13 files), `tests/.cypress-cucumber-preprocessorrc.json`
- Modify: `tests/scripts/run-all.ts`, `tests/package.json`, root `package.json`, `tests/scripts/grep-gates.ts`, `.github/workflows/ci.yml`, `.github/workflows/visual.yml` (L47-48), `.github/workflows/coverage-report.yml` (L42), `.github/workflows/update-visual-goldens.yml` (L51), `turbo.json` (L53), `knip.json` (L121-123), `tsconfig.eslint.json` (L16, L28), `tests/tsconfig.json` (L10), `eslint.config.mjs` (L241-247), `pnpm-workspace.yaml`, `tests/browser/testContext.ts` (comments), `tests/browser/page-objects/contracts/*` (comments), plus docs (Step 6)

**Interfaces:**
- Produces: `run-all.ts` orchestrates 10 suites with no `skipCypress` / `isolateDisplay` / xvfb machinery; `pnpm test:e2e` needs no `RTC_E2E_SKIP_CYPRESS` anywhere.

- [ ] **Step 1: Delete the four paths** above (`git rm -r`).
- [ ] **Step 2: `tests/scripts/run-all.ts`** — remove the two cypress entries from `browserScripts` (L53-54); delete the `RTC_E2E_SKIP_CYPRESS` block (L88-113: `skipCypress`, `droppedCypress`, `activeSuites` filter — `activeSuites` becomes just `suites`), the `isolateDisplay` field (L83) and its `Suite` type member, the xvfb machinery (L169-173 wrapper, L210-227 log/warn blocks), and the cypress comments (L25-28, L35, L42-48, L64-68).
- [ ] **Step 3: Scripts + deps** — `tests/package.json`: delete scripts L14-17 (`test:browser:cypress`, `:headed`, `test:browser:cypress-cucumber`, `:headed`) and devDependencies `@badeball/cypress-cucumber-preprocessor`, `@bahmutov/cypress-esbuild-preprocessor`, `cypress`, `cypress-mochawesome-reporter` (keep `esbuild`, keep `@cucumber/cucumber` — still used by playwright-cucumber + presenter cucumber peers until Task 5). Root `package.json`: delete `test:e2e:no-cypress` (L13). `pnpm-workspace.yaml`: remove `cypress: true` from `allowBuilds` (L12) + fix its comment (L4-9); re-evaluate the `serialize-javascript` override (L31-37, existed for mocha-under-badeball) and the `uuid` override comment (L21-30) — remove if `pnpm why` shows no remaining path. Run `pnpm install`.
- [ ] **Step 4: Gates** — `tests/scripts/grep-gates.ts`: delete gates 12-14 (L292-322) leaving the tombstone comment (Global Constraints); trim `cypress|@badeball` alternations from gates 2 (L216-221), 5 (L234-243, also drop the `"browser/cypress/scenarios/"` path), 15 (L323+).
- [ ] **Step 5: CI/config hygiene** — `ci.yml`: drop `CYPRESS_INSTALL_BINARY` env (L42-45), the Cypress binary cache step (L200-208), the xvfb install step (L218-221), the `RTC_E2E_SKIP_CYPRESS` comment block (L228-238); step L239-240 becomes `run: pnpm test:e2e`; fix the header comment (L5) and step name (L210). Drop the `CYPRESS_INSTALL_BINARY` lines from `visual.yml`, `coverage-report.yml`, `update-visual-goldens.yml`. `turbo.json`: remove `RTC_E2E_SKIP_CYPRESS`. `knip.json`: remove the 3 cypress-cucumber entries. `tsconfig.eslint.json` + `tests/tsconfig.json`: drop `"cypress"` from `types`. `eslint.config.mjs`: remove the cypress glob from the L241-247 override (delete the whole override if it only served the cypress/playwright mirror pair). Scrub the stale comments in `tests/browser/testContext.ts` + `page-objects/contracts/*`.
- [ ] **Step 6: Docs + verdict** — root `README.md` L281-282/298-299 (remove cypress commands); `tests/README.md`: table rows 35-36/41-42, delete the whole arm64 known-issue section (L156-234), rework "Why so many overlapping suites?"; `tests/STRATEGY.md`: rewrite the Cypress narrative into a past-tense verdict ("native Playwright won: async-native scenario reuse vs the forked queue layer, no Electron/arm64 hazard, 133–203s vs 91–107s+flakes; both Cypress suites deleted 2026-07-19 — the fork's cost was the deciding evidence") across §1/§2/§3.1/§4/§5.1/§5.4/§5.5/§6-Axis-B/§7; `09-test-strategy.md` §9.5 (twelve→ten suites, drop the bundler-alias-seam + native-Cypress-binding paragraphs into a one-line historical note), mermaid L181; `21-cross-framework-testing.md` L69; `12-architectural-gates.md` gate rows 12-14 → "retired (Cypress, 2026-07-19)".
- [ ] **Step 7: Verify + ship** — `pnpm install && pnpm test:e2e` locally (10 suites green), full gauntlet incl. knip + `pnpm lint:actions`; commit `refactor(e2e)!: delete both Cypress suites — native Playwright is the browser-driver verdict`; PR + CI loop + merge.

### Task 5: Presenter collapse to `vitest-fake-timers` (PR E)

**Files:**
- Delete: `tests/presenter/cucumber/`, `tests/presenter/cucumber-fake-timers/`, `tests/presenter/vitest-quickpickle-fake-timers/`, `tests/presenter/steps/`
- Modify: `tests/scripts/run-all.ts` (L74-77), `tests/package.json`, `tests/presenter/scenarios/_await.ts`, `tests/scripts/grep-gates.ts`, `tests/tsconfig.json` (L17-18), `knip.json` (L126-128), plus docs (Step 5)

**Interfaces:**
- Consumes: gate 21/22 (`checkPresenterScenarioCounts` / describe-prefix) — both read only `tests/specs/*.feature` + `tests/presenter/vitest-fake-timers/`, verified unaffected.
- Produces: presenter family = the single `test:presenter:vitest-fake-timers` suite; `_shared/` + `_buildApp.ts` + `_await.ts` (interface only) + `_world.ts` survive.

- [ ] **Step 1: Delete the four dirs** (`git rm -r`). Coverage is mechanically preserved: all four peers ran the same 20 `@presenter` scenarios via the same `scenarios/_shared/` fns, and gate 21 pins the per-feature `it()` counts of the surviving peer to the `.feature` files.
- [ ] **Step 2: Suites + scripts + deps** — `run-all.ts`: delete suite entries L74, L75, L77 (keep L76 `test:presenter:vitest-fake-timers`), update the L73 comment + L6-11 docstring. `tests/package.json`: delete scripts `test:presenter:cucumber`, `test:presenter:cucumber-fake-timers`, `test:presenter:vitest-quickpickle-fake-timers` (L29, L30, L32); remove devDependencies `@sinonjs/fake-timers` and `quickpickle` (keep `@cucumber/cucumber` — browser playwright-cucumber still needs it). `pnpm install`.
- [ ] **Step 3: Dead code** — `tests/presenter/scenarios/_await.ts`: delete `class RealAwaitHelpers` (only consumer was the deleted `cucumber/world.ts`), keep the `AwaitHelpers` interface; knip (`pnpm lint:dead`) confirms.
- [ ] **Step 4: Gates + config** — `grep-gates.ts`: delete gate 24 + `checkQuickpickleBarrelCompleteness` (L113-139, L399-404) with tombstone; trim deleted paths from gates 6, 8, 15, 16, 17, 19 (gate 19's name "outside the two vitest peers" → "outside the vitest peer"); gates 18, 20, 21, 22 untouched. `tests/tsconfig.json`: drop the two cucumber.js include entries (L17-18). `knip.json`: drop the three presenter-cucumber entries (L126-128).
- [ ] **Step 5: Docs + verdict** — root `README.md` L285-288/313-314; `tests/README.md` L21-25/43-46/86-93/238; `tests/STRATEGY.md` §2/§3.2/§5.2/§5.4/§5.5 → verdict: "plain vitest-fake-timers won (1s local / 2.5s CI, zero Gherkin-loader deps); the real-timer ordering oracle (41s CI) and the runner-portability peers were proofs, banked 2026-07-19 — §5.2's roles column becomes the historical record"; `09-test-strategy.md` §9.5 (presenter peers 4→1; fold the 5B.1-5B.4 binding paragraphs into a short past-tense summary), harness table rows L84-92; `21-cross-framework-testing.md` L67; `12-architectural-gates.md` gate-24 row → retired.
- [ ] **Step 6: Verify + ship** — `pnpm --filter @rtc/tests test:presenter:vitest-fake-timers` (20 scenarios PASS), `pnpm --filter @rtc/tests gates`, `pnpm test:e2e` (7 suites), full gauntlet; commit `refactor(presenter)!: collapse to vitest-fake-timers — runner/time-model proofs banked`; PR + CI loop + merge.

### Task 6: Gherkin browser parking + weekly cron + SOT declaration (PR F)

**Files:**
- Create: `.github/workflows/e2e-gherkin-weekly.yml`
- Modify: `tests/scripts/run-all.ts`, `.github/workflows/ci.yml` (e2e step), `turbo.json`, plus docs (Step 4)

**Interfaces:**
- Produces: `RTC_E2E_SKIP_GHERKIN_BROWSER=1` filters both `test:browser:playwright-cucumber*` suites out of `run-all.ts`; CI's PR gate sets it; the weekly workflow runs the two parked suites.

- [ ] **Step 1: Parking filter in `run-all.ts`** (the cypress-skip pattern, rebuilt post-Task-4):

```ts
// The two Gherkin browser peers are PARKED (2026-07-19): native Playwright is
// the gating browser SOT; these run weekly (e2e-gherkin-weekly.yml) so the
// .feature/step tree can't silently rot. Set RTC_E2E_SKIP_GHERKIN_BROWSER=1
// (the CI PR gate does) to exclude them; unset/0 runs all suites.
const skipGherkinBrowser =
  process.env.RTC_E2E_SKIP_GHERKIN_BROWSER === "1" ||
  process.env.RTC_E2E_SKIP_GHERKIN_BROWSER === "true";
const isGherkinBrowser = (s: Suite): boolean => {
  return s.script.startsWith("test:browser:playwright-cucumber");
};
const activeSuites = skipGherkinBrowser
  ? suites.filter((s) => {
      return !isGherkinBrowser(s);
    })
  : suites;
```

Log the parked suites when skipped (mirror the old `droppedCypress` log shape).
- [ ] **Step 2: Gate wiring** — `ci.yml` e2e step: `run: RTC_E2E_SKIP_GHERKIN_BROWSER=1 pnpm test:e2e` (+ comment: parked, weekly workflow is the rot-detector); `turbo.json`: add `RTC_E2E_SKIP_GHERKIN_BROWSER` to the env passthrough where `RTC_E2E_SKIP_CYPRESS` used to sit.
- [ ] **Step 3: The weekly workflow** — create `.github/workflows/e2e-gherkin-weekly.yml`:

```yaml
name: e2e Gherkin (weekly)

# The two PARKED Gherkin browser peers (playwright-cucumber, react + solid).
# Native Playwright is the gating browser stack (see tests/STRATEGY.md §7
# verdict); this weekly run keeps the .feature files + shared step tree from
# silently rotting while they remain in the repo as the BDD showcase.
on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

env:
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"

jobs:
  gherkin:
    name: playwright-cucumber (react + solid)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 26
      - name: Enable Corepack
        run: npm install -g corepack@0.35.0 && corepack enable
      - name: Resolve pnpm store path
        run: echo "STORE_PATH=$(pnpm store path)" >> "$GITHUB_ENV"
      - uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ${{ env.STORE_PATH }}
          key: pnpm-store-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: pnpm-store-${{ runner.os }}-
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Install Playwright Chromium + OS deps
        run: pnpm --filter @rtc/tests exec playwright install --with-deps chromium
      - name: Build workspace libs
        run: pnpm build
      - name: playwright-cucumber (react)
        run: pnpm --filter @rtc/tests test:browser:playwright-cucumber
      - name: playwright-cucumber (solid)
        run: pnpm --filter @rtc/tests test:browser:playwright-cucumber:solid
      - name: Upload reports on failure
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: gherkin-weekly-reports
          path: tests/reports/
          retention-days: 14
```

Pin the action SHAs to whatever `ci.yml` currently uses (copy verbatim); `pnpm lint:actions` must pass.
- [ ] **Step 4: SOT declaration + docs** — `tests/STRATEGY.md` §7: record the final production set actually adopted (native Playwright react+solid gating; presenter vitest-fake-timers; both fullstack smokes; Gherkin parked-weekly) and declare **native Playwright specs the browser SOT** — new behaviour lands there first; a matching Gherkin scenario is optional while parked, so the `.feature` tree may lag native coverage (the weekly run only proves what exists still passes). `tests/README.md`: suite table gains a "parked — weekly" marker + orchestration notes; `09-test-strategy.md` §9.2/§9.5/§9.10 (gate now runs 5 suites: 2 native browser + 1 presenter + 2 fullstack; 2 parked weekly); `21-cross-framework-testing.md` suite counts.
- [ ] **Step 5: Verify + ship** — `RTC_E2E_SKIP_GHERKIN_BROWSER=1 pnpm test:e2e` (5 suites) and plain `pnpm test:e2e` (7 suites) both green locally; `pnpm lint:actions`; commit `ci(e2e): park Gherkin browser peers behind a weekly workflow — native Playwright is the gating SOT`; PR + CI loop + merge; after merge, `gh workflow run "e2e Gherkin (weekly)"` once to prove the workflow is green.

---

## Post-plan follow-ups (explicitly out of scope)

- Trimming the ×10 visual theme matrix (e.g. full cross-product on App-level scenarios only) — separate decision, big golden regen.
- A paths-filter on `visual.yml` to skip doc-only merges.
- Deleting the Gherkin layer outright if the weekly run keeps failing/rotting — revisit ~2026-09.
- `feature/*.feature` ↔ native-spec parity gate (a browser analogue of gate 21) if the SOT drift bothers anyone in practice.
