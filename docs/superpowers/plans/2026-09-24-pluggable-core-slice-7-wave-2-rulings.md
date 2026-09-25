# Slice 7 wave 2 — rulings ledger

The live record of every decision taken while executing
[`2026-09-24-pluggable-core-slice-7-wave-2.md`](2026-09-24-pluggable-core-slice-7-wave-2.md):
where execution departed from the plan, why, and what it costs if wrong.
Copied from the git-ignored SDD ledger so it survives the worktree.

## PR A — the RxJS side

- Pre-flight:
- - T1→T2: constants/createAnomalyDetector/optional port members consumed by T2 shells — consistent.
- - T2→T3: CoreSeams.nativeJarvis, dockPanel→boolean, controllers consumed by suites only via app — consistent.
- - T3 harness adds availability$/setHistorySource to the jarvis port → base (no nativeJarvis) will call them once each in the harness: ruling 8 counts measured on RxJS, consistent.
- Task 1: Ruling: availability$ wiring had no createApp-level test (mutant survived) — added composition.jarvis.test.ts case — cost if wrong: none (one extra test). Mutation 11/11.
- Task 2: Ruling: openPatch/closePatch/togglePatch are JarvisPatch VALUES, not factories as the plan listed — they take no argument, so a factory would only wrap them — cost if wrong: a rename.
- Task 2: Ruling: modelFacingHistory (the history filter) and historyEntriesExcludingInFlightTurn moved into jarvisController too (plan named only the patches) — each core's setHistorySource needs the same filter — cost if wrong: none.
- Task 2: Ruling: JARVIS_DEMO_INITIAL_STATE / advanceDemoPatch / lastEntryId / demoBeatMs as planned; also narratorGate exports isAdmittedGate + NarratorGateState (the shell needs them) — cost if wrong: none.
- Task 2: Ruling: added a fold-gate witness (a turn through the base's own jarvis under nativeJarvis spawns/drives nothing) and strengthened the controller in-flight test — both would otherwise leave a mutant alive. Mutation 17/17.
- Task 3: Ruling: the harness jarvis port ALWAYS offers availability$ (scripted-only default) and setHistorySource — so port discipline can pin "exactly one" per app; the no-availability$ default path stays covered by client-core unit tests — cost if wrong: one uncontracted default branch.
- Task 3: Ruling: askLog records at SUBSCRIBE (defer), matching pendingAsks — cost if wrong: none.
- Task 3: Ruling: the jarvis suite splits into jarvis.ts + jarvisConfirmation/jarvisAvailability/jarvisNarrator.ts + jarvisKit.ts, one registry entry — by length (plan allowed it).
- Task 3: Ruling: the demo suite names steps 6 (confirming) and 7 (overlay-closing) by index, per JarvisDemoStep's core-api doc; step commands are never hard-coded — cost if wrong: a reorder of the step table fails the suite (intended).
- Task 3: Ruling: driver freeze cases step the fake clock 5×1 ms (applyZeroStagger) — each zero-delay command is scheduled only after the previous lands; far below DRIVE_STAGGER_MS so a staggering batch would still fail — cost if wrong: none.
- Task 3: Ruling: a batch-serialisation mutant in the RxJS driver shell (concatMap→mergeMap) was NOT run — the shell imports no merge operator, so it needs a two-edit mutant the script can't express; the contract case "second batch waits for the first" is the pin, re-proven when each sibling is ported — cost if wrong: an unproven case on RxJS only.
- Task 3: mutation — suites 43/43 (after 2 test fixes: toggle clears unread; unknown-symbol needs a loaded watchlist), harness 6/6.

## PR A — gauntlet and review

- PR A gauntlet (1st): 4 red, all mine — knip (2 exported harness record types), typecheck + both ui-contract gates (the clients' viewModelFromWorld dock bridge returned void; the driver now reads a void as refused). Fixed: the fixture bridge returns boolean; the types are module-local. Re-run green.
- Final: fixed I1 base usage port opened under nativeJarvis — seams witness usage:0 RED→GREEN (JarvisUsagePresenter defers the port call).
- Final: fixed I2 discipline counted calls not subscriptions — harness subscription counters RED→GREEN, discipline asserts them.
- Final: fixed I3 driver per-kind vacuous — reasons asserted; applied eqSelect/eqIndicator/eqPane; watchlist-not-loaded; unknown/already-docked/dock-full cases; reader mutants killed.
- Final: fixed I4 expiry decline unguarded — jarvisController.test RED→GREEN; decline now inside the pending-guarded patch (RxJS-identical).
- Final: fixed I5 mid-turn append + demo behind a queued turn — two contract cases; mutants killed. Mutation 9/9; runners 367/367 ×3.
- Final: minor (fixed after review, at the user's request): JarvisMachine binds port.confirm at construction (spy after construction bypassed).
- Final: minor (fixed after review, at the user's request): driver shell reads powerSaverLevel$ for command 0 too (extra read per batch).
- Final: minor (fixed after review, at the user's request): JarvisPatch doc should say patches are apply-exactly-once (id allocation, port calls).
- Final: minor (fixed after review, at the user's request): stale "CommandEventTag above" comment in jarvisDriveCommands.ts.
- Final: minor (fixed after review, at the user's request): demo freeze case uses zero-length pauses only — PR B/C may need a 1 ms hop (watch when porting).
- Final: minor (fixed after review, at the user's request): no boundary check at DEMO_STEP_BEAT_MS−1 for the decline; narration copy only toContain("EURUSD").
- Final: minor (fixed after review, at the user's request): the harness always seeds availability$ synchronously, so "first send before the first frame" is uncontracted — PR B/C unit tests own it.

### The seven Minors, fixed in PR A (the user asked not to defer them)

- `port.confirm` is looked up per call — `JarvisMachine.test` RED→GREEN.
- The driver's first command reads no power-saver level — `JarvisDriverMachine.test` RED→GREEN.
- `JarvisPatch` documents apply-exactly-once; the stale tag comment is rewritten.
- The demo freeze case steps 1 ms. Ruling: no mutant can prove this on RxJS — it makes the case tolerate a core whose zero-length beat is a scheduled timer; its test is PR B/C's native demo — cost if wrong: none.
- The confirming step's decline is pinned at `DEMO_STEP_BEAT_MS − 1`; the narration copy is pinned exactly (a regex over the format).
- Harness seed `jarvisAvailabilityPending` + contract case "a send before the first availability reply runs on the preferred brain".
- Mutation 7/7; runners 368/368 ×3.

## PR B — the async core

- Ruling: the native files were written before their unit tests. The PR A contract suites, already proven on RxJS, were the spec, and native RED was proven by mutation against the native files. Unit tests were added for async-only paths, driven by coverage gaps and review. Cost if wrong: none beyond the order.
- Ruling: the Jarvis family is composed in `composeWithBase` (`presenters/jarvisFamily.ts`), not inside `nativePresenters` as plan Step 3 said. It must follow `nativePresenters`, whose members it reads. Equivalent.
- Ruling: `NativeWorkspace.seam` became `drive`, synchronous readers typed from `DriveCommandDeps`. The async core no longer passes the `CoreSeams.workspace` factory; PR C deletes it.
- Ruling: a `port.ask` that errors closes its turn as an `error` event, and the machine continues. The RxJS machine would die on it; that is kinder behaviour the contract cannot see. The same holds for a failing `availability$` (logged, the machine keeps running).
- Ruling (review Minor 3): a failing price stream silences only its own pair until the next roster. The RxJS narrator's single `catchError` ends all narration. Kept, and documented in `narrator.ts`. Cost if wrong: one more narration source than RxJS after a feed failure.
- Ruling (review Minor 6): the countdown now starts before outside subscribers hear the card, matching RxJS. No test can observe the old order: the expiry and tick patches are pending-guarded (PR A Important 4). Cost if wrong: none.
- Ruling (review Minor 9): a throwing command cannot stall later batches. `applyDriveCommand` is total, topic delivery and Store listeners isolate throwers, and state listeners are rxjs subscribers. A catch would be unreachable code. Cost if wrong: queued batches wait for the next `command` event.
- Mutation:
  - native files: 22/22, after one fix (a double guard on send-after-dispose; one mechanism kept);
  - review Minors: 7/7.
- Contract: 368 + 3 unit files. e2e on the async core: 91 Playwright tests ×2 and 47 Gherkin scenarios ×2, all green.
- Review: no Critical or Important findings. Ten Minors, all addressed: 1, 2, 4, 5, 7 and 8 fixed test-first; 3, 6 and 9 ruled above; 10 fixed (the comment and README).
- **Correction: my own gauntlet runner was vacuous.** After PR A's first run, the loop recorded `exit=$?` inside `echo "$(printf …) exit=$?"`. The command substitution resets `$?` to 0, so every gate read as passing:
  - PR A's second and third runs reported 33/33 without real exit codes. PR A was still gated honestly: CI passed on its final head before merge.
  - PR B's two runs did the same. PR B's CI then caught three Biome findings, `useExplicitType` and `noUnusedImports`.
  - With the exit code captured correctly (`e=$?` straight after the gate), the re-run also found a knip finding: an exported `WorkspaceDriveDeps` type.
  - All four are fixed, and the corrected run passes 33/33.
