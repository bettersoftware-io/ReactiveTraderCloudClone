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
