### Task 10: Default flip — `DEFAULT_LAYOUT_ENGINE = "dockview"` (its own PR)

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts:178–180` (constant + doc)
- Modify: `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts:502–526`
- Modify: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts:463` + `packages/client-react-native/tests/visual/fake/inert.ts:274–277` (pin the literal `"inhouse"` with a comment — RN has no dockview bridge; the web default no longer applies there)
- Modify: `packages/client-react/src/ui/App.tsx:70–77` + `packages/client-solid/src/ui/App.tsx:80–87` (lazy-load swap: Dockview eager, in-house lazy; keep both comments truthful)
- Modify: `tests/browser/playwright/layout.spec.ts` (invert `expectEngine` openers and switch targets), `tests/browser/playwright/jarvis.spec.ts` (Task 9's test drops its opening switch; the ORIGINAL dock test :38 gains none — it now runs under dockview by default, which is the point)
- Modify prose: `packages/ui-contract/src/shared/harness/world.ts:623`, `shared/mount.ts:109`, `visual/appData.ts:106` (each says `("inhouse")`)
- Modify docs: `CLAUDE.md:116`; `docs/adr/ADR-002-layout-management-port.md:6,9,32,786` + a new "As implemented (2026-09): default flipped" bullet; `docs/STATUS.md:25` + move this round's 🔴 entry per tracking-workstream-status; `docs/architecture/06-package-dependencies.md:128`; `docs/architecture/08-replaceability-matrix.md:26`; `packages/layout-dockview/README.md:185` (keyboardNavigation cost note — premise now "always-on")
- Goldens: re-pin `prefs/modal` + `prefs/content` (the active segment flips), both sets

**Interfaces:**
- Consumes: everything above green on main.
- Produces: `DEFAULT_LAYOUT_ENGINE: LayoutEngine = "dockview"`.

- [ ] **Step 1: Flip the contract test FIRST (failing):** in `PreferencesPortContract.ts` — rename :502 to `"defaults layoutEngine to dockview and round-trips a write"`; the round-trip write becomes `port.setLayoutEngine("inhouse")` with expectations `"inhouse"` (a default-valued write proves nothing); :521's `seen` expectation becomes `[DEFAULT_LAYOUT_ENGINE, "inhouse"]`; :524's seeded read seeds `{ layoutEngine: "inhouse" }`. Run `pnpm --filter @rtc/domain test` → FAIL (default still inhouse).
- [ ] **Step 2: Flip the constant** (preferences.ts:180 → `"dockview"`; doc comment: users who pick `"inhouse"` keep that choice). Run domain + both clients' adapter contract tests → PASS.
- [ ] **Step 3: RN pinning** — replace the two RN `DEFAULT_LAYOUT_ENGINE` reads with the literal `"inhouse"` + comment; run `pnpm --filter @rtc/client-react-native test`.
- [ ] **Step 4: Lazy-load swap** — React: `lazy(() => import(...InhouseLayoutEngine...))`, Dockview becomes a static import (and vice-versa comment rewrite); Solid mirror. The `Suspense fallback={null}` moves to the in-house branch. Run both clients' unit suites.
- [ ] **Step 5: e2e inversion** — layout.spec.ts openers `expectEngine(ctx, "dockview")`, switches target `"inhouse"` and back; jarvis.spec.ts Task-9 test drops its opening switch (rename it "…under the default dockview engine…"), keep the closing `openPreferencesAndSelectLayoutEngine(ctx, "inhouse")` removed too. Run `pnpm test:e2e`.
- [ ] **Step 6: prose + docs sweep** — the eleven files listed above; then `pnpm check:doc-links`.
- [ ] **Step 7: Golden re-pins** — regen `prefs/modal` + `prefs/content` both sets (`-g "prefs/"` locally arm64; workflow dispatch scenario_pattern `prefs/` for x86); assert react + solid visual locally scoped to `prefs/`.
- [ ] **Step 8: Full gauntlet** — `/rtc:gauntlet full` equivalent; fix anything red.
- [ ] **Step 9: Commit + PR** — `feat(domain)!: default layout engine flips to dockview` (single commit for the flip PR where practical; body lists the sweep). Merge only after CI green + CodeQL check; this PR is the designed one-commit revert point.

---

## Verification tail (after Task 10 merges)

- Post-merge `visual.yml` green (the twins and prefs re-pins are the risk surface).
- `pnpm visual:engine-parity` report unchanged on the shared subset.
- STATUS.md: this round's entry moves out of 🔴 (delete on completion); Dockview entry's "Still pending under Dockview: Jarvis-docked panels are in-house-only" line is deleted by Task 10's sweep.
- Concurrent-workstream note: ping the Dockview-native features session (spec 2026-09-10) — their Phase 1 DnD audit now inherits dynamic panels as drag subjects, and their Phase 4 generalises `addDynamicPanel`.
