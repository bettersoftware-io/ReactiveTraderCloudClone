# Slice 6 — execution rulings ledger

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

## PR B — the ports

1. **B-1 — the `bootGate` and `auth` suites settled.** Both asserted an
   intent's new state reached an EXISTING subscriber synchronously; the
   Effect core failed them (its refs are followed on a fiber, as every other
   Effect member's are, whose suites already settle). Over-specification of an
   RxJS incidental — the suites now settle before reading a stream; the
   synchronous `visible` getter stays pinned.
2. **B-2 — `createAuthDeps` was not exported from `@rtc/client-core`'s
   entry.** PR A's plan required it; the RxJS core used it only internally, so
   neither knip nor a test noticed. Exported here.
3. **B-3 — both siblings' `boot.dispose()` stops the ramp** (RxJS keeps it
   live for an attached subscriber, which A-3 left uncontracted); each
   sibling's unit test pins its own stop.
4. **B-4 — the Effect director is a `sharedFold`** over a merged Effect
   `Stream`; per-pair prices are `scopedPortStream`s under
   `flatMap(..., { switch: true })`, because `fromPort` would pile a period-
   lived subscription per roster. Unit test: a dropped pair's price stream is
   released on the roster switch.
5. **B-5 — Effect layer count is 46, not the plan's 47:** `boot` is a
   machine factory, not a Layer.
6. **B-6 — the machine-factory witnesses' delegated example moved from
   `boot` to `layout`** in both siblings.

**Receipts.** `core:parity` 58/74 both. Runners: RxJS 2960, async 500, effect
498 (+ unit tests). Mutation: async 25/25, Effect 24/24 (first pass each).
A-5 is closed for the siblings: each one's own unit test pins the expired-
session clear.

## Independent review, PR B (opus, read-only) — SHIP, 0 must-fix

Gate before the review fixes: full gauntlet 33/33, `VITE_CORE_IMPL=async`
e2e 7/7 suites, `VITE_CORE_IMPL=effect` e2e 7/7 suites.

Taken:
- **Effect boot skip race** — the reviewer read that `runFork` defers the
  ramp fiber, so a `skip()` in the creation tick could be overwritten by the
  ramp's first `progress: 0` write. Guard added (the ramp stands down once
  finished or disposed) plus a skip-at-t=0 unit case. **B-7: the race did
  not reproduce** — with the guard mutated away the case still passes, so on
  effect 3.22.2 the interrupt reaches the ramp fiber before its first write.
  The guard stays as cheap defence; it is recorded here as an untested race
  guard, not claimed as proved.
- **async `once()` leaked an abort listener per call** on the app-lifetime
  signal (each holding its subscription until dispose) — now removed when the
  call settles; general fix in `bridge/in.ts`, unit test + mutant killed.
- **Late `intentsFor` replay is now contracted** — all three cores replay the
  director's latest intent to a new subscriber while it is live (a tile that
  mounts after a flash replays it). Mutant (async `replay: false`) killed.
- **The target-filter case ticks the NEW roster's pair** (it checked nothing
  before); the async post-lifetime login case waits a macrotask and asserts
  the port released.

Mutation on the fixes: 3/4 killed + B-7.
