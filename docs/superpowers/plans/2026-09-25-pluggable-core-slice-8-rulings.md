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
