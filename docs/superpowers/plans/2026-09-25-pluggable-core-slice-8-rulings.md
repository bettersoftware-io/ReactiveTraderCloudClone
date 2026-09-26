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

### PR A CI — the seams files move to fake timers

- **What CI showed.** Each alternative core's `composition.seams.test.ts` ran on real timers. On CI they took 9.9 s on `main` and 12.9–14.3 s on #829, against ~3 s locally. They failed three runs running. Two runs timed out at vitest's 5 s default: the dock case's own `waitFor` budget of 8.5 s could never fit inside it. A third run, with the timeout raised to 15 s, failed its assertion instead: `expected 'AAPL' to be 'MSFT'`. A real 50 ms `waitForDrive` had elapsed before the drive landed.
- **Why the file's own comment was wrong.** Real timers were never necessary. `Effect.sleep` follows vitest's fake timers, which `bridge/clock.test.ts` measured in slice 5. The Jarvis driver, demo and narrator suites already ran on them. The dock case's port is a synchronous `from(events)`, not the scripted brain. The user caught this by asking "are we not using fake timers?"
- **The fix.** Both files install fake timers in `beforeEach`, and every wait is an explicit `vi.advanceTimersByTimeAsync`. The 15 s timeout commit is superseded. Test time per file went from 1.6 s to 0.66 s (async) and from 2.9 s to 1.0 s (Effect), 3/3 green each.
- **Proof the conversion kept the tests' power:**
  - A mutant where the native driver never applies a command is KILLED, on fake timers and on the real-timer original alike.
  - Two further mutants SURVIVE, on real and fake timers alike, so the gap predates the conversion: the base app not standing down (`nativeJarvis: false`), and `dispose()` skipping its teardown.
  - **Ruling:** those two gaps are not fixed here. These files are strangler scaffolding that PR C deletes, and PR C's Tasks 6 and 7 add the real dispose witness, a live-subscription count of zero after `dispose()`. *Cost if wrong:* none past PR C.

## PR B — `connectionIntents` and the native transport gate (Tasks 4–5)

### Task 4 — `AppPorts.connectionIntents`

- **Both port factories supply the port.** `TransportPorts` still omits only `connectionEvents`, and `createSimulatorPorts` and `createWsRealPorts` both return `connectionIntents: connectionIntentsPort`. The plan named the simulator factory only. Making `connectionIntents` required broke about 40 builders and tests that spread a factory and replace only `connectionEvents`; every one of them now inherits the port. *Cost if wrong* (corrected after review): typecheck proves the port is PRESENT, not that the builder MERGES what it carries. A builder that spreads a factory and swaps in its own `connectionEvents` still compiles while dropping every reconnect and incident event. Every production builder merges both Subjects, so nothing is lost today. About 25 test builders do not, but none of them exercises reconnect or incident, and that behaviour predates this PR. The structural fix pairs the two: `TransportPorts` omits both, and a helper hands the builder the port with the stream it must merge. It is left to PR C, where the base app and the Subjects' last reader go.
- **The Subjects moved.** `reconnect$`, `incident$` and `connectionIntentsPort` now live in `client-core/src/adapters/connectionIntents.ts`, so `portFactory` never imports `composition`. `publicApi` gains exactly one name, `connectionIntentsPort`. *Cost if wrong:* none.
- **The harness owns the merge.** `scriptPorts` takes `Omit<AppPorts, "connectionIntents">` and supplies a recording port that feeds the stream the core observes (`driver.connectionIntentCalls()`). The three runners' base `connectionEvents` is `NEVER`, and none of them imports a module Subject. *Cost if wrong:* none; see the mutants below.
- **The presenter tier's incident scenario runs the real path.** `tests/presenter/scenarios/_buildApp.ts` used a `state$`→Subject bridge, with a hand-mirrored `DISCONNECTING_KINDS`, because the machine pushed into a module-level `incident$`. It now supplies an instance-scoped `connectionIntents`, so the scenario observes the real machine's event, and `bridgeSub` is gone from its two consumers. Presenter vitest ran 22/22 and cucumber 21/21. *Cost if wrong:* three extra test files in scope.
- **Mutation:** 7/7 KILLED. The mutants were `commands.reconnect` pushing nothing (×3 cores), the incident event never leaving (×3 cores), and the harness `reconnect()` pushing nothing.

### Task 5 — `transportGate`

- **The reference disconnects once on a signed-out start.** The RxJS gate's `distinctUntilChanged` passes the first `false`, so a composition with no session calls `disconnect()` once. The plan's case 1 expected `[]`. The contract pins the reference, `["disconnect"]`, which is idempotent on a socket that never opened. *Cost if wrong:* a spurious close call becomes contracted behaviour.
- **Measured before the fix:** both alternative cores FAILED the sign-in case, logging only `["disconnect"]`. The only gate was the stood-down base app's, and it watches the base's `auth`, which a native login never reaches. The resumed case passed only because the base resumes from the same store. RxJS passed 4/4. This is the latent bug the plan predicted.
- **The fix.** Each alternative core gates on its own `auth` from `bridge/transportGate.ts`, released with its lifetime (async `AbortSignal`, Effect host scope). It hands the base `{ ...ports, transport: undefined }`, so exactly one gate exists until PR C deletes the base. `app.ports` is restored to the real ports, because `app` spreads `base`.
- **Seeds and verbs.** The resumed case reuses `HarnessSeed.session`; no `resumedSession` flag was added. Case 5 uses lock then unlock, because the auth suite shows lock keeps `status: "authenticated"`.
- **Beyond the plan.** Two bridge unit tests per core cover the gate's release, which the contract cannot witness: the RxJS core's `dispose()` is a knowing no-op. The suite also asserts `app.ports.transport` is defined.
- **Mutation:** 10/10 KILLED, per core: no edge guard, connect turned into disconnect, the base keeping the transport (two gates), the gate never released, and `app.ports` left as the base's.

### PR B gate

- Full gauntlet: 33/33 gates exit 0. e2e on rxjs, async and effect: each passed 91+91 Playwright and 47/47 Cucumber.
- The simulator-mode e2e never supplies a transport, so it cannot see the gate. A manual WS smoke (`VITE_CORE_IMPL=… pnpm dev:react:fs`, demo account) is the witness:
  - **async:** no socket before sign-in; one server `connect` on sign-in; prices ticking.
  - **effect:** a resumed session connected once at load. After clearing storage and reloading, one `disconnect` and no socket while signed out. A fresh sign-in made one `connect` (`total=2`), and prices ticked.

### PR B review (one independent reviewer): no Critical or Important findings; all five Minors addressed in-PR

- **M1.** Both alternative cores' READMEs still named the deleted `pushIncidentEvent`. They now describe `ports.connectionIntents.injectIncident` and the native transport gate. ADR-006's dated records are left as history.
- **M2.** Nothing tested whether the composition-level gate is released. Each core's `composition.dispose.test.ts` now signs in, disposes, logs out, and expects no further transport call.
  - The async mutant (the gate on a lifetime that never aborts) is KILLED.
  - **Ruling:** the Effect twin (the gate on a scope that never closes) SURVIVES, and I accept that. A probe shows the Effect core's native `auth` is inert after `dispose()`: `logout()` emits nothing, so a gate left on the wrong scope can never reach the transport. The survivor is equivalent in behaviour, and what remains is one dormant subscription. The release mechanism itself is pinned by `bridge/transportGate.test.ts`. *Cost if wrong:* a leaked subscription per disposed Effect app. HMR and StrictMode dispose the app, so it matters only if auth ever becomes live after dispose.
- **M3.** The Task 4 ruling overstated what typecheck proves. Corrected above; the structural pairing is deferred to PR C.
- **M4.** The async gate now routes an `auth` stream error out of band, matching its Effect twin.
- **M5.** The `app.ports` check is now an identity witness. A call through `app.ports.transport` must land in the scripted log.
- **Mutation after fixes:** the 10 Task 5 mutants are 10/10 KILLED again, and the composition-release mutants are 1 KILLED, 1 equivalent (ruled above).

## PR C — delegation removed (Tasks 6–9)

### Tasks 6 and 7 — each alternative core stands alone

- **Measured first.** A new dispose case counts the live subscriptions on every port stream through a Proxy over the simulator ports. It was RED in both cores before the change: 3 subscriptions survived `app.dispose()`, all held by the base app. It is GREEN after the change.
- **Mutation:**
  - Async: a `dispose()` that never aborts its lifetime is KILLED.
  - Effect: a `dispose()` that releases neither the host scope nor the runtime is KILLED.
  - **Ruling:** removing only one of the two Effect calls SURVIVES, and those are equivalent mutants. The runtime's Layer scope is the host scope's parent, so either call alone interrupts every fiber. Both calls are kept. *Cost if wrong:* none.
- **Exact presenter maps.** `NativePresenters` is now `Omit<Presenters, …the 14 family/workspace keys>`, not `Partial & Pick`, because a `Partial` spread cannot prove completeness. The typecheck is now the witness that each core covers `Presenters`.
- **Ruling:** the Effect `composeWithBase` became `composeApp → { app, host }` rather than being deleted. The existing fiber-interruption teardown test needs the host. *Cost if wrong:* one extra export.
- **Ruling:** the machine-factory "none is the base's" cases are deleted. With no base, the `MachineFactories` return type is the witness.
- **Lockfile.** `pnpm-lock.yaml` is committed: moving `@rtc/client-core` to `devDependencies` is a genuine importer change.

### Task 8 — `CoreSeams` deleted; the gates tightened

- **`portDiscipline` is absolute.**
  - Async and effect pass at exactly 1 call per member. `sessions$` is 2, because two members read it.
  - The RxJS reference FAILED `rfqs`: `RfqsPresenter`'s state fold and its raw events each called `workflow.events()`.
  - **Ruling:** fix the reference rather than loosen the case. The presenter now calls the port once and subscribes twice. Wire traffic is identical, because a port stream subscribes on subscribe, not on call. `WorkflowEventStreamUseCase` now takes `Pick<WorkflowPort, "events">`.
  - Mutants KILLED: a member built twice (×2) and the double call restored.
- **Ruling:** `composition.seams.test.ts` in client-core is deleted whole. Its four no-seam "controls" test behaviours the contract suites already pin against the RxJS core: `jarvisDriver`, layout persistence, the narrator, and availability and history.
- **The runtime-dependency rule.** `alt-cores-no-client-core-at-runtime` fails a probe runtime import with the rule named, and passes once the probe is removed.
- **Bundle brand in every direction.** `RXJS_CORE_BRAND` lives on `rxjsCore`. `check:core-bundle` passed on its first run, because `selectCore`'s fold already drops `rxjsCore`. A mutant that keeps the RxJS core reachable in the async build is KILLED. The marker is therefore a hard gate, not report-only.
- **Found:** with the base gone, the auth suite's expired-session store-clear now kills a sibling mutant in both cores. This closes slice-6 ledger A-5, and the suite's caveat comment is removed.

### Task 9 — docs

- **Updated:** ADR-006 ("Decided in slice 8 — closing"; Decision 4 superseded; Follow-ups 5 and 6), §22, §6, `dependency-cruiser.md`, the spec's receipt, STATUS, CLAUDE.md, both alternative-core READMEs, and `architecture.md`'s TOC.
- **Stale since slice 0:** §6 and `dependency-cruiser.md` never showed the core family, and now do.
- **Four named follow-ups** stay in STATUS: the ui-contract fixtures' duplicated dock wiring (not taken up by this plan); the structural `connectionEvents`/`connectionIntents` pairing; the RxJS no-op `dispose()`; and the deferred-by-design envelope, `effect` 4.0 and React Native.

### PR C gate

- Full gauntlet: 33/33 gates exit 0. e2e on rxjs, async and effect: each passed 91+91 Playwright and 47/47 Cucumber.
- WS smoke (`dev:react:fs`, demo account, storage cleared first):
  - **async:** 0 sockets while signed out, one `connect` on sign-in, prices ticking, `data-core-impl=async`.
  - **effect:** the same, with `data-core-impl=effect`.
