# Slice 6a — execution rulings ledger

Plan: [`2026-09-23-pluggable-core-slice-6.md`](2026-09-23-pluggable-core-slice-6.md).
Regime: in-session implementation, `--ready` worktree, scripted
`pnpm mutation-check`, one read-only reviewer per PR (slice 5's PR B regime).
Committed with each PR, not left in a git-ignored ledger (slice 5 lost one).

## PR A — the suites

1. **A-1 — scope split confirmed by the user before execution** (plan ruling
   1): slice 6a is `auth`, `bootGate`, `workspaceNav`, `animationDirector`,
   `machines.boot`; the eleven layout/dock members move to slice 7.
2. **A-2 — `readPreferenceNow` moved to `adapters/readPreferenceNow.ts`.**
   `createAuthDeps` needs it and it was module-private to `composition.ts`;
   one copy, imported by both.
3. **A-3 — `boot`'s post-dispose states are uncontracted.** The first draft
   asserted "no later state after dispose()"; the RxJS core failed it (49
   states vs 5): its `dispose()` releases the machine's own subscriptions,
   and a subscriber still attached keeps hearing the ramp. Slice 2 already
   left post-dispose machine behaviour uncontracted; the case now pins only
   what dispose promises — `onDone` never runs.
4. **A-4 — a second `skip()` may re-emit the finished state.** The RxJS
   `skipped$` emits a fresh `{ progress: 100, done: true }` object per skip,
   and `state()` does not conflate by value. The suite asserts every state
   after the first skip is finished, not that none arrives.
5. **A-5 — the auth "expired session clears the store" case cannot tell a
   sibling's native `auth` from the base's.** Both cores construct an `auth`
   at composition and each resumes from the same store; whichever runs second
   finds it already cleared. The siblings' own unit tests must pin the clear
   (PR B).

## Receipts, PR A

- Task 1 mutation pass: 6/6 killed (the `CoreSeams.workspaceNav` routing,
  both halves; the four pure folds).
- Task 2 + 3 mutation pass: 24/24 killed — 21 contract points against the
  RxJS presenters/machines and 3 harness verbs.
- Runners: RxJS 2950/2950 (`client-core`), async 489/489, effect 497/497 (the
  five still delegate). `PENDING_SUITES` 21 → 16.

## Independent review, PR A (opus, read-only) — SHIP, 0 must-fix

Taken:
- **The `latestActiveTab` mirror had no witness** (the ledger's "both halves"
  receipt above overstated Task 1's mutation coverage — it covered the driver
  routing and the seam default, not the mirror). New seam test: a panel docked
  after the SEAM nav moved lands in the seam's tab. Mutant killed.
- **The login-wait cycle is asserted through the stored preference**, via a
  new uncounted harness verb `storedLoginWaitVariant()`, and **a pinned style
  is its own case.** A-6: with two treatments, an advance made while pinned
  is visible only when the pin equals the stored treatment; two drafts of
  the case pinned the other one and the "pin freezes the cycle" mutant
  survived both. The case now pins the other treatment (pin honoured) and
  then the stored one (cycle frozen). All four review mutants killed.
- **The unlock-with-nobody case** counts `portCalls("auth.login")` and covers
  signed-out-at-start as well as after-logout.
- **The expired-store blind spot (A-5)** is now stated in the suite itself.
- Minors: duplicated `// FX` comment in `domain/src/index.ts`; `./shellFolds`
  import spelling; `LoginCall` un-exported (knip).

Declined:
- **"A repeated identical connection status must not flash again."** The
  RxJS core DOES flash it again (its connection fold does not conflate), so
  the case would force a sibling to differ from the reference. Left
  uncontracted and said so in the suite.

**Gate:** full local gauntlet 32/33 before the review fixes — the one red was
knip's unused `LoginCall` export, fixed here; biome, ESLint, knip and
typecheck re-run green on the final tree.
