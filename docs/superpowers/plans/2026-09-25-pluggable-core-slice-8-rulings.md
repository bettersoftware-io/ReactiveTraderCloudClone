# Pluggable core slice 8 — rulings ledger

The committed copy of the decisions taken while executing
[`2026-09-25-pluggable-core-slice-8.md`](2026-09-25-pluggable-core-slice-8.md).
The working ledger lives in the git-ignored `.superpowers/sdd/` directory. This
file is its durable record, and each PR appends its own section.

## PR A — `@rtc/core-logic` (Tasks 1–3)

**Pre-flight.** Three hand-offs checked, and all match:
- Task 2 produces `AuthDepsPrimitives` / `createAuthDeps(ports, primitives)`, and Task 3 consumes them.
- Task 4 produces `ConnectionIntentsPort`, and Tasks 5 and 6 rely on the bridge push functions being gone.
- Tasks 6 and 7 delete the base app before Task 8 deletes `CoreSeams` and makes `portDiscipline` absolute.

**Rulings.** Each has its cost if wrong.

1. **Moved tests follow their file wherever they live.** Tests sit both beside their file and in `__tests__/` dirs; both kinds move, keeping the same relative path. A test moves only when every local import it has moves too. That held for 20 tests. The rest also import non-moved `client-core` helpers, such as the RxJS machines, so they stay put and import `@rtc/core-logic`. *Cost if wrong:* test location only.
2. **The plan's `core-logic-stays-pure` pattern was blind, and has been widened.** The plan's `to.path` (`node_modules/(rxjs|@rx-state)/`) passed a probe `import { map } from "rxjs"` **green**. Under pnpm's strict install, rxjs is not a dependency of `core-logic`, so the import does not resolve, and dependency-cruiser records it under the bare name `rxjs`. The pattern is now `(^|node_modules/)(rxjs|@rx-state)(/|$)`. Proven: the value probe is red, a type-only probe is green, and a clean tree is green. *Cost if wrong:* none, because it is strictly wider. This is the recurring "absence reported as a clean reading" class: a rule that could not see its target read as a pass.
3. **knip was red for one commit.** knip flagged `core-logic`'s three dependencies as unused between Task 1 and Task 2, because the files that use them had not moved yet. CI judges the PR tip. *Cost if wrong:* none.
4. **Re-exporting the split-out names from their old homes.** `IncidentMachine.ts` and `composePanelStream.ts` DO re-export `IncidentEvent`, `reduceIncident`, `incidentConnectionEvent` and `PanelStreamDeps`, as the plan said. An interim ruling not to re-export them was withdrawn, because their own importers in `client-core` need those names. The typecheck shows no TS2308 ambiguity from the second export path. *Cost if wrong:* none.
5. **`publicApi.test.ts` was re-pinned with two additions and no drops.** The additions are `dockedLeafIds` and `insertDockedLeaf`. `client-core`'s layout tests used to reach them by relative path; they now import them across the package boundary, so `core-logic` exports them, and `client-core`'s `export *` carries them through. The pin exists to catch a dropped name, and none was dropped. *Cost if wrong:* two extra public names.
6. **`JarvisEvent` is imported at its source.** It is a `@rtc/shared` type that `client-core` merely re-exported, so the alternative cores now import it from `@rtc/shared`. Both cores gain `@rtc/shared` as a dependency, which their dep-cruiser allowlist already admitted. *Cost if wrong:* one dependency edge.
7. **`withLoginDelay` is copied into each bridge.** The copy is verbatim, as `bridge/loginDelay.ts` in each alternative core. The bridge is the one place rxjs may run, and `core-logic` may not. Sharing it is the adapters split, the spec's named follow-up 5. *Cost if wrong:* about 50 duplicated lines until the adapters split.
8. **React Native's Jest maps `@rtc/core-logic` explicitly.** Its `moduleNameMapper` points each `@rtc/*` package at its dist, and `core-logic` is the first runtime `@rtc` dependency of `client-core` that Jest must follow out of `client-core`'s dist. The mapper gains one line for it. The full gauntlet caught this: 34 RN suites failed with "Cannot find module '@rtc/core-logic'". The Expo bundle smoke, which CI runs, passes locally. Metro resolves the package through pnpm symlinks and `exports`, just as it resolves `client-core`. *Cost if wrong:* none.

**Evidence (PR A).**
- Full gauntlet: 33 gates; the Expo bundle smoke was run separately.
- e2e: 91 + 91 Playwright tests and 47 Cucumber scenarios on each of rxjs, async and effect.
- Mutation-check: 7/7 KILLED.
- RN tests: 627/627.

### PR A review (one independent reviewer) — every finding fixed in-PR

- **I1. dependency-cruiser could not see any `@rtc/core-logic` edge.** `tsconfig.depcruise.json` had no path pair for it. So `client-core-stays-inner`, `alt-cores-stay-inner` and `no-circular` never evaluated an edge into the package, and passed green on nothing. The fix has three parts:
  - The path pair is added. The cruiser now reports `@rtc/core-logic=>packages/core-logic/src/index.ts`.
  - `core-logic` joins both allowlists.
  - The purity rule splits in two. `core-logic-stays-pure` covers runtime rxjs only. The new `core-logic-stays-inner` is an ALLOWLIST (itself, `core-api`, `domain`, `shared`), which answers the reviewer's M6 as well.
  - Probes: a `@rtc/client-core` import is red on `core-logic-stays-inner`, an rxjs value import is red on `core-logic-stays-pure`, and a clean tree is green. This is the third "absence read as a clean reading" instance in this PR, after ruling 2 and the vacuous index test in M7.
- **I2. The alternative cores' `readNow` was not the RxJS core's.** Their bridges' `peek` returns `undefined` where `readPreferenceNow` falls back, and it rethrows where `readPreferenceNow` falls back and reports. Each bridge now carries a verbatim copy of `readPreferenceNow`, so the two are equivalent by construction. New tests cover an `of(undefined)` source and an erroring source. Both went RED against `peek`, then GREEN.
- **M1.** The debug-deploy vite alias maps in both clients gain `@rtc/core-logic` → src.
- **M2 and M3.** Stale comments are fixed:
  - the barrel comments moved with their statements, and the `dockColumn` note now states that two leaf helpers are public;
  - the `LAYOUT_PANEL_IDS` location;
  - `createAuthDeps(ports, authDepsPrimitives)` in both `shell.ts` docs;
  - the example paths in `scripts/mutation-check.mjs`, `tests/browser/scenarios/layout.ts`, ADR-002 and `candleSeries.test.ts`.
- **M4.** The delay test now changes the supplier between two logins, so a wrapper that read the delay once at wrap time is killed.
- **M5.** There is ONE `INCIDENT_INITIAL_STATE` again, exported from `incidentFold`. A machine-level test pins that a `clear` on pristine state re-emits the seed object itself. `publicApi.test.ts` gains that one name.
- **M7.** `core-logic`'s `length > 0` index test is replaced by an export-name snapshot.

**Also found by CI's first run on #829.** `client-core`'s vitest had no `include`, so it ran every test a second time from its compiled copy in `dist/`. `dist/publicApi.test.js` then compared itself against an untracked `dist/__snapshots__` file. Locally that file was stale; on the fresh checkout it was missing, and `--ci` failed "Tests (unit)". The fix is `exclude: [...configDefaults.exclude, "dist/**"]`. `client-core`'s own run goes from 2999 tests to 1385: the difference is the `dist/` duplicates plus stale compiled copies of the tests that moved.

**Mutation-check for the review fixes:** 6/6 KILLED. The mutants were: `readNow` returning what it saw, instead of the fallback (×2 cores); the delay read once at wrap time (×2); the machine seeded with a separate object; and `core-logic` dropping an export.
