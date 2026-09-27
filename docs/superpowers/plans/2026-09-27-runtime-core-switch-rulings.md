# Runtime core switch — execution rulings

Decisions taken on the user's behalf while executing [the plan](2026-09-27-runtime-core-switch.md) (subagent-driven, 2026-09-27), with what each costs if wrong. Copied from the SDD ledger before the git-ignored workspace was deleted.

## Rulings

- | T3→T4 | resolveCoreChoice/readStoredChoice/clearCoreChoice/loadCore/createCoreSelection/urlWithoutCoreParam → bootApp/main | T4 uses `safeLocalStorage` not listed in T3 interfaces — Ruling A |
- | T6 | self | "put helpers in scripts/lib or follow existing root-script test convention" — implementer decides by convention; must be run by some CI step or it is a dead test — Ruling B |
- | T8 | self | golden regen = workflow dispatch (outward-ish, routine here) — controller does it, not the implementer — Ruling C |
- Ruling A: `safeLocalStorage()` is added to coreSelection.ts in Task 4 (with its one-line test) — the brief says so; no conflict — cost if wrong: none.
- Ruling B: Task 6's helper tests must be executed by an existing CI step (root `pnpm test`/`test:rules`/`check:scripts` convention or tests-workspace `test:report`); placing them where no CI step runs them is a finding — cost if wrong: a dead test.
- Ruling C: Task 8's golden regeneration (update-visual-goldens.yml dispatch) and Task 9 are controller work; the Task 8 implementer edits docs only — cost if wrong: none.
- Task 4: Ruling: plan-mandated async bootCore turns the spec's fail-closed build-default throw into a dead-end boot-error screen and kills the e2e pageerror diagnostic — spec wins: bootCore resolves synchronously (throws on a bad build default), only the chunk load is async; delete the LoginScreen TODO — cost if wrong: one small revert
- Task 4: Ruling: minors enter the fix round (user's standing regime: fix review Minors in the same PR)
- Task 5: Ruling: reviewer Minor "mount.ts positional undefined for layoutPresetsSeed" is a PRE-EXISTING positional-args pattern, not introduced here — deferred (not this PR's regression; converting createWorld to an options object is a separate refactor) — cost if wrong: one more positional slot
- Task 6: Ruling: plan-mandated brand-only markers dropped the old guard's library-level "effect/Fiber" check — add an eager-set rule forbidding effect/Fiber (library marker), with test + mutant; no async kernel marker (the async kernel has no distinctive library string; its brand + the eager static-import closure rule cover it) — cost if wrong: an async-kernel leak without its brand would pass
- Task 6: Ruling: all four minors fixed in the fix round (regime)
- Task 7: Ruling: plan-mandated fixed stored value "async" is non-discriminating in the async CI job (stored == build default) — derive start/stored from RTC_CORE_IMPL so stored ≠ build default and start ≠ stored — cost if wrong: none
- Final: Ruling: Important 2 (stored choice silently beats dev:*:async|effect) — keep the spec's precedence (URL > stored > build default); make it observable: resolveCoreChoice returns the source, main.tsx logs "[core] booted <impl> from <source>", CLAUDE.md + README note it next to the dev:*:async|effect scripts — cost if wrong: a dev may still boot a stored core, but now sees it in the console
- Final: Ruling: Minor 3 (option descriptions unused) — show the current core's description in the row (spec §3), not a PrefSegment redesign — cost if wrong: one golden re-regen
- Final: Ruling: Minor 8 (verbatim per-client copies) — keep; matches the per-client src/app convention (selectCore was copied too)
- Final: Ruling: Important 1 (goldens) — controller: pull run 36337535591's commit, then re-dispatch after the fix wave (row pixels change again)
- Task 9: Ruling: fix the harness, not the product — page-object open/reload paths wait for the app to mount; loadCore tested through an injected importer map (real import stays witnessed by e2e + check:core-bundle) — cost if wrong: none
- Task 9: Ruling: the mount wait's two predicates (data-core-impl set / #root has children) each survive alone — equivalent on the success path (either suffices); both kept as belt-and-braces — cost if wrong: none

## Deferred and resolved minors

- Task 1: minor (deferred): selectCore.ts duplicates CoreImpl — moot, Task 4 deletes selectCore.ts
- Task 2: minor (deferred): report cites a quote from the controller's dispatch as if from the brief — moot (dispatch wording)
- Task 3: minor (deferred): urlWithoutCoreParam parses the URL twice (style)
- Task 6: minor (deferred → final fix wave): coreBundle staticImportSpecifiers `from"./x.js"` branch has no dedicated test (+ mutant)
- Task 7: minor (deferred → final fix wave): tests/browser/scenarios/coreSwitch.ts duplicates CORE_IMPLS — import from tests/scripts/lib/coreImpl.ts (export it) instead

All deferred minors were fixed in the final fix wave (commits 207cd2b..931ecec) except Task 5's pre-existing positional createWorld slot (ruled out of scope).
