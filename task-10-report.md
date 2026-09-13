# Task 10 report — default layout engine flip

**Status:** DONE, including fix round 1 (coordinator review). Branch `worktree-genui-dockview-flip` force-pushed to origin (amended, same single commit), green. No PR opened (per instructions).

**Commit:** `eb0b871cc8fb7337b644d060ac992163a6cc60c9` — `feat(domain)!: default layout engine flips to dockview` (single commit, the designed revert point; supersedes the original `7138ef009680732af24fae862fd6e7913bba48ec`, amended in place per the coordinator's explicit instruction).

**Gate summary (all green):**
- Domain (494 tests), client-react unit (467, +2 from fix round 1's `data-maximized` bridge cases), client-solid unit (529, same +2), client-react-native (623) — all pass.
- Both clients' `test:ui:contract` (841 tests / 103 files each) — pass.
- Both clients' `test:ui:contract:coverage` gates — react 97.99%/95.24% (stmt/branch), solid 98.66%/93.52% — both clear ≥95%/≥85%.
- `pnpm typecheck` — 45/45 tasks pass.
- Fast-gauntlet mirror (`biome ci`, `lint:eslint`, `check:doc-links`, `@rtc/tests gates` incl. `pnpm audit --prod`) — all clean, no errors (6 pre-existing unrelated CSS specificity warnings in `dockview-hud.css`, file untouched by this PR).
- `pnpm test:e2e` (full, both clients) — 100% green: fullstack node/browser, presenter fake-timers, Playwright react (77) + solid (77), Playwright-Cucumber react (47 scenarios) + solid (47 scenarios). idleReconnect flake solo-rerun clean.
- Visual: `prefs/modal` + `prefs/content`, both clients, local arm64 — reasserted byte-identical to the committed goldens (see ruling below); no golden re-pin needed, so the x86 goldens-workflow dispatch was skipped (see Concerns).

## Concerns / rulings

1. **Visual-fakes fallback ruling applied as specified.** Flipping `DEFAULT_LAYOUT_ENGINE` would have flipped every unseeded scenario in the whole app-scenario golden matrix (both clients' `buildFakeViewModel.ts`) and every contract spec relying on the harness default (`ui-contract/src/shared/harness/world.ts`). Per the brief's ruling, both fallbacks are now pinned to the literal `"inhouse"`, independent of the domain constant, with comments explaining why. Confirmed by measurement: an `app/` -scoped local visual run showed the underlying golden set (pre-existing, unrelated local-arm64 staleness aside — see item 3) unaffected by the flip.
2. **Harness-seed ruling applied as specified.** Same treatment for `world.ts`'s `layoutEngineSeed ?? DEFAULT_LAYOUT_ENGINE` — pinning it to `"inhouse"` was required: flipping it broke 3 contract-spec files (7 tests) that implicitly assume the in-house default. Fixed and reverified green (both clients, 103/103 files).
3. **prefs/modal + prefs/content goldens: verified as a genuine no-op, not skipped.** Neither fixture (`prefs-open`) seeds `layoutEngine`, so with the fallback pinned to `"inhouse"` the rendered "active" segment is unchanged from before the flip. Regenerated locally (arm64, `--update-snapshots=all -g "prefs/"`) for react and reasserted for solid: zero bytes changed (confirmed via `git status` — no golden PNGs touched). Since the cause is a pinned literal, not an architecture-dependent render, I did **not** dispatch the x86 "Update visual goldens" workflow — there is nothing to regenerate there either. If you want an extra x86 confirmation regardless, `gh workflow run "Update visual goldens" --ref worktree-genui-dockview-flip -f scenario_pattern="prefs/"` is still safe to run; I expect it to report no diff.
4. **Real regression found and fixed: App.tsx's lazy/eager swap broke two synchronous contract tests.** ~~`LayoutEngine.contract.spec.ts` had two `it()` blocks (not `async`) that mount the real `AppShell` on the (unseeded, default) in-house engine and assert on its panels immediately. Since `InhouseLayoutEngine` is now the lazy-loaded branch (behind `Suspense`), a synchronous assertion right after mount was seeing the `fallback={null}` instead of the real engine — under Solid this also needed a macrotask (not just a microtask) to settle. Fixed both call sites via a new local helper `flushLazyInhouseEngine()` (uses `app.flushAsync` with a `setTimeout(…, 0)` flush) in that spec file; reverified 32/32 tests green for both clients, and the full 103-file suites green for both.~~ **Superseded by Fix round 1 below** — the coordinator's review deleted the lazy split entirely (Ruling 1), which also deletes this workaround and both tests are synchronous again, matching their original pre-flip shape.
5. **Pre-existing, unrelated local-arm64 visual noise discovered (not caused by this PR).** Running the full `app/` scenario subset (202 tests) locally showed real pixel drift against the committed `react-local/darwin-arm64` golden bucket — but this reproduces identically on the pristine pre-flip commit too (in fact with *more* failures: 84 failed pre-flip vs. 50 failed on this branch, though on a *different* subset of scenario names each time — consistent with stale/noisy local-machine goldens, not a regression). This bucket is not the CI gate (the x86 `react`/`solid` buckets are); flagging it here since it's a real finding but explicitly out of Task 10's scope.
6. **STATUS.md:** closed the 🟡 "GenUI × Dockview — Jarvis docking + default flip" entry entirely (both halves now done); folded its deferred nearest-column-maximize-strip residual into the "Dockview-native features" entry as a Phase-4 known gap; corrected the older "Layout-management port — Dockview engine SHIPPED" entry's two "default in-house" claims and removed its stale "Jarvis-docked panels are in-house-only" clause (also fixed an equivalent stale clause in the "Jarvis generative UI round-1" entry). `check:doc-links` clean (1023 links, 219 files).
7. **Concurrent-workstream note (per the brief, not actioned by me):** the Dockview-native features session (spec `2026-09-10`) should be made aware its Phase 1 DnD audit now inherits dynamic panels as drag subjects, and Phase 4 generalises `addDynamicPanel` — I left a pointer in STATUS.md but did not otherwise contact that session.

## Fix round 1 (coordinator review)

Re-verified after every change below: both clients' full unit suites, both
clients' `test:ui:contract` (plain, 841/841 each), `pnpm typecheck` (45/45),
`biome ci` (clean), `pnpm lint:eslint` (clean), `check:doc-links` (1023
links/219 files), the targeted flagship narrator-drive e2e journey (both
clients, now running under the default dockview engine with no forced
switch) and the two "docks a panel…" e2e journeys (both clients) — all
green. Amended into the same single commit and force-pushed
(`--force-with-lease`, no PR exists).

**Ruling 1 — dropped the lazy split entirely.** `App.tsx` (both clients):
both `InhouseLayoutEngine` and `DockviewLayoutEngine` are now static
imports; deleted `lazy()`, `Suspense`, and the rewritten comment now states
the measured fact (in-house's own chunk was ~3.8KB gzip, ~1.2% of the
bundle — not worth a chunk boundary). Deleted `flushLazyInhouseEngine` and
its two call sites in `LayoutEngine.contract.spec.ts`, reverting those two
tests to fully synchronous (their original pre-flip shape) — reverified
32/32 passing for both clients without any flush. Confirmed via `pnpm
build`: no more `InhouseLayoutEngine-*.js` chunk, single bundle.

**Ruling 2 — `data-maximized` coverage for the new default.** Both clients'
`DockviewLayoutEngine.tsx` now render `data-maximized={maximized ?? ""}` on
the `[data-testid="layout-engine"]` root, mirroring
`InhouseLayoutEngine`'s own root attribute exactly. Rewrote
`tests/browser/page-objects/playwright/Layout.ts`'s `waitPanelMaximized` to
poll the engine-root attribute against the target panel id instead of a
per-panel `panel-<id>` boolean (dockview has no stable per-panel testid for
a static panel the way `InhouseLayoutEngine`'s `PanelLeaf` does), removing
the now-dead `panel()` helper; updated the `LayoutPO` contract doc comment
to match. Un-pinned `jarvis.spec.ts`'s flagship narrator-drive test — no
forced `"inhouse"` switch — it now runs under the default dockview engine
and its maximize assertion passes under either engine. Added one
bridge-level `data-maximized` unit case per client (plus a "no panel
maximized → empty attr" case) via a new `maximizedAttr()` accessor on each
client's `DockviewLayoutEngineDockedPage`; both green.

**ADR-002 self-contradictions (I4).** Added a dated "(at the time; the
default flipped to Dockview 2026-09 — see the As-implemented bullet)"
clause to the three stale in-house-default assertions at (current)
lines ~317, ~326, ~352. Softened the new As-implemented (2026-09) bullet's
"closing the ONE functional gap" to "closing the remaining Jarvis-docking
gap" (collapse emulation, the maximize strip policy, and design-width pins
had already landed in earlier rounds per that same file) and rewrote its
now-false "lazy-load split inverts" sentence to describe the actual
(static-both, no split) end state plus the `data-maximized` mirroring.

**I6 → STATUS.md additions.** (a) Appended one line to the "Layout-management
port — Dockview engine SHIPPED" entry recording the ui-contract
harness/visual-fakes' deliberate `"inhouse"`-literal pin as a test-harness
deviation from the domain default, with its revisit condition (seed the 3
dependent spec files explicitly). (b) Appended a line to the "React-local
golden housekeeping" entry marking its "RESYNCED"/"1493/1493 green again"
claim STALE, citing the 84/202 pre-existing `app/*` failures found on a
pristine pre-flip commit (see item 5 above) — needs its own local regen
sweep, separate round.

**Minors.** (7) `scenarioActions.ts`'s `app/fx-closed-dockview` action
comment rewritten — the wait gate stays (dockview's async portal mount),
only the now-wrong "lazy engine chunk" rationale changed. (9) Dropped
`jarvis.spec.ts`'s dead closing `openPreferencesAndSelectLayoutEngine(ctx,
"dockview")` switch after the in-house dock test (each test gets its own
fresh context, so there was nothing for it to restore); kept the
`dismissScriptedPanel` call as a clean-desk ending and reworded its
comment. (10) Added a line to `AsyncStoragePreferencesAdapter`'s comment
noting the deliberate contract-clause deviation survives only because this
adapter is never run through `describePreferencesPortContract` (verified:
only client-react's and client-solid's adapters are). (8)
`docs/architecture/14-composition-and-wiring.md:141` corrected to name
`DockviewLayoutEngine` as the default with `InhouseLayoutEngine` as the
"inhouse"-picked alternative; checked §17
(`docs/architecture/17-web-client-up-close.md`) for a similar default-path
claim — found none (that section is a mechanics deep-dive scoped
specifically to the in-house engine's internals, not a claim about which
engine is the app's default), so no §17 edit was needed or made, and no
line citations were touched.

## Files touched (cumulative, both rounds)

- `packages/domain/src/preferences/preferences.ts`, `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts`
- `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts`, `packages/client-react-native/tests/visual/fake/inert.ts`
- `packages/client-react/src/ui/App.tsx`, `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`
- `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx`, `packages/client-react/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.docked.test.tsx`, `packages/client-react/tests/ui/pages/DockviewLayoutEngineDockedPage.ts`
- `packages/client-solid/src/ui/App.tsx`, `packages/client-solid/src/ui/App.test.tsx`, `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts`
- `packages/client-solid/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx`, `packages/client-solid/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.docked.test.tsx`, `packages/client-solid/tests/ui/pages/DockviewLayoutEngineDockedPage.tsx`
- `packages/ui-contract/src/shared/harness/world.ts`, `packages/ui-contract/src/shared/mount.ts`, `packages/ui-contract/src/visual/appData.ts`, `packages/ui-contract/src/specs/shell/layout/LayoutEngine.contract.spec.ts`, `packages/ui-contract/src/visual/scenarioActions.ts`
- `tests/browser/playwright/layout.spec.ts`, `tests/browser/playwright/jarvis.spec.ts`, `tests/browser/page-objects/contracts/Layout.ts`, `tests/browser/page-objects/playwright/Layout.ts`
- `CLAUDE.md`, `docs/STATUS.md`, `docs/adr/ADR-002-layout-management-port.md`, `docs/architecture/06-package-dependencies.md`, `docs/architecture/08-replaceability-matrix.md`, `docs/architecture/14-composition-and-wiring.md`, `packages/layout-dockview/README.md`
