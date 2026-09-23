# Slice 5 — rulings ledger (SDD execution, 2026-09-22)

Reconstructed from the controller's context after the worktree removal deleted the
git-ignored `.superpowers/sdd/` ledger and the five agent reports. The rulings
below are the controller's own record; the per-agent reports are NOT recoverable.

Plan: [`2026-09-22-pluggable-core-slice-5.md`](2026-09-22-pluggable-core-slice-5.md).
**PR A** #814 (Tasks 1–3, merged `8826fee7a`) — this file ships with the docs
PR that followed it rather than with PR B, because a ledger that waits for the
next PR is a ledger that can be lost in between (it was, once, already).
**PR B** (Tasks 4–6, the ports) pending. The prevention tooling that came out of
this slice's process failures is PR #815 (`f280bd773`).

## Rulings made during execution

1. **P1 (process) — implementers on `sonnet`, foreground only, `git -C "$WORKTREE"`,
   commit by pathspec, NO builds; the controller prebuilds per wave.** Slice-4 P1
   carried. Cost if wrong: a rebuild.
2. **P2 — Tasks 1 and 2 dispatched in parallel** (disjoint packages: domain +
   client-core/presenters vs core-contract + the three runner test files). Held.
   Cost if wrong: one re-run.
3. **P3 — `scripts/new-worktree.sh` does not install, and nothing was built.**
   Both first-wave implementers ran in a tree where no test could execute: Task 1
   improvised a throwaway vitest alias config, Task 2 hand-traced and handed back
   inspection-only results, and both owed mutation checks afterwards. The
   controller ran `pnpm install` + `pnpm build` once both settled; the real runs
   were green (client-core 2780, core-contract 47, async 378, effect 389, domain
   494). **A future plan installs and builds BEFORE the first dispatch.** Cost as
   incurred: ~500k tokens of workaround plus a deferred mutation pass.
4. **P4 — the resumed Task 2 implementer wedged for 4 h mid-mutation-pass** and was
   stopped with a mutant (mutant 5) still in the working tree. The controller
   restored the file and ran the remaining mutants itself in minutes: shared
   Subject (RED, witnessed by the reviewer), count-on-read (3 RED), write value+1
   (RED), control index 0 (RED), clear unrecorded (RED). **A controller test run
   raced that agent's restore and read a live mutant as "survived"** — never run
   tests against a file an agent is mutating. Cost if wrong: a false defect report.
5. **R-3d — the Task 3 must-fix.** Seven of the ten `throughput` cases called
   `resolveThroughputLoad(BASELINE_VALUE)` BEFORE the first `collect(m.state$)`.
   `ThroughputPresenter` calls `admin.getThroughput()` on first subscribe and
   `createPendingQueue.open()` only enqueues inside the subscribe body, so the
   resolve found an empty queue and did nothing: the cases ran against a
   still-loading view and read clean — the repo's recurring "absence reported as a
   clean reading" class, this time inside the suites. Fixed by the controller
   (`5449fe97c`): subscribe first, then resolve, and assert the loaded view
   (`BASELINE_VALUE`, `loading: false`) so the ordering is load-bearing.
   Mutation-proved: restoring the old order fails the case. Cost if wrong: none.
6. **R-3e — the `admin.getThroughput` port-discipline case now states that it counts
   CALLS, not subscriptions** (ruling 5's boundary): how often the load is
   subscribed across a cold resubscribe is uncontracted, but the port method is
   obtained once, at construction. A core calling it per subscriber fails there.
7. **R-3f — `describeMetricWindowContract` made file-local** (`3ed45e7f7`): knip
   flagged it as an unused export; the registry imports the three named suites.
8. **R-3g (deviation, ledgered by the implementer) — throughput case 10.** RxJS's
   `switchMap` unsubscribes the whole prior inner Observable — the write-completion
   path AND the dismiss timer — whether or not that write had settled, so a newer
   value's debounce orphans an already-shown banner. Verified against the RxJS core
   and written to match; RxJS is the contract.
9. **Controller trap — `git checkout -- <file>` after a mutation run also discarded
   the controller's own uncommitted fix to that file.** Commit a fix BEFORE
   mutating the same file.
10. **Cleanup trap — the worktree was removed before the ledger was committed**, so
    `.superpowers/sdd/` (ledger + five agent reports) was lost. This file is the
    reconstruction. Commit the rulings file BEFORE `git worktree remove`.

## What the reviews caught

- **T1+T2 review:** spec ✅ ✅, quality ✅, 0 must-fix. Behaviour identity of the five
  rewritten RxJS presenters confirmed line by line, including `IncidentMachine`'s
  controls-perturbed-before-connection-push ordering in both branches. One minor
  (a `getThroughput` harness test does not re-assert the pending count before
  failing it) — SHIP.
- **T3 review:** spec ✅, quality ❌ — 1 must-fix (R-3d), 1 should-fix (R-3e), 2
  minor (incident cases 2 and 5) — SHIP for the minors.

## Receipts at PR A merge

`PENDING_SUITES` 30 → 21. Contract runners: RxJS 462/462, async 231/231, effect
231/231 (the nine admin members still delegate by reference). Gauntlet full green
incl. build, `check:devtools-dist`, `check:core-bundle`. CodeQL: 4 open alerts, all
pre-existing Scorecard policy alerts on `main` from 2026-09-19, none from this branch.

## PR B, async half (2026-09-23)

Executed in-session by the controller rather than by subagents — the direct
response to PR A's cost (see "What the reviews caught" above and the #815
tooling). Worktree made with `new-worktree.sh --ready`, proved with a full
`client-core-async` test run before the first edit.

1. **B-1 — PR B split by core.** The async half ships alone; the Effect half
   follows after the weekly usage reset, and first measures whether Effect's
   `Clock` follows vitest fake timers. Cost if wrong: one extra PR cycle.
2. **B-2 — `foldTopic` added to `kernel/`** (the plan's Step 3 fallback): no
   existing primitive folded a topic into a replay-current seeded stream.
3. **B-3 — `getThroughput()` moved to construction.** The first draft called
   it on first subscribe; `portDiscipline`'s "two warm periods do not call
   admin.getThroughput() again" failed it (2 vs 1, the base's call plus the
   native's). The load's SUBSCRIPTION stays lazy via a new `onSubscribe` hook
   on `storeToStateStream`.
4. **B-4 — four uncontracted divergences plus one user-visible one recorded
   in ADR-006**, not coded around: synchronous `setThroughput` throw → error
   banner; `setValue` with no subscriber is applied; post-`lifetime`
   `setValue` is silent; an emit-less `setThroughput` completion → error
   banner; and (visible, allowed by ruling 5) `throughput` stays warm across
   the Admin tab's remount where RxJS cancels and reloads. The last two were
   added from the independent review.
5. **B-5 — the seam-witness test has no mutant.** It can only fail if the
   base app's admin presenters become hot, which no find/replace on this
   branch produces; it stands as slice 4's witnesses do, as a guard against
   a future base change.

## Receipts, PR B async half

`client-core-async`: 458/458 (47 files), `coreContract` all nine admin suites
native. `pnpm mutation-check`: first pass 21/25 — two SURVIVED (the
post-lifetime `throughput` case asserted only writes; the `incident` case
called `dispose()` itself) and two ERROR (a `find` matched the doc comment
too); after strengthening both tests, **25/25 killed**. `core:parity`:
`native: async 53/74, effect 44/74`.

**Independent review (opus, read-only):** SHIP, 0 must-fix. Should-fix 1 — the
lifetime-abort release of an in-flight write and of the debounce timer had no
test that could fail — fixed with two cases. Should-fix 2 — the tab-remount
divergence was missing from the ADR — recorded. Minors taken: `incident`'s
clear-order test now logs every state emission; eventLog/sessionsKpi gained
retention + release tests. The seam witness's inability to tell native from
delegated stands as B-5 (parity.json proves provenance).

## PR B, Effect half (2026-09-23)

Same regime as the async half, same day (the user judged the weekly budget
sufficient). No new primitive: retained `sharedFold`s and mirrors, a
`SubscriptionRef` + debounce fiber + `createRunSlot` for `throughput`, a
child-host singleton for `incident`, one Tag + Layer each (`layers.test.ts`
33 → 42).

1. **E-1 — the "unmeasured" Clock question was already measured.**
   `bridge/clock.test.ts` has pinned `Effect.sleep` under fake timers since
   slice 2; STATUS had called it open. Checked before writing, not after.
2. **E-2 — `incident` unit tests wait a tick for state.** The ref is followed
   on a fiber, so the synchronous-state assertions of the async tests do not
   transfer; the contract suites already settle.
3. **E-3 — one equivalent mutant.** Moving the ref write before the push is
   unobservable (state reaches subscribers a tick later either way); recorded
   in ADR-006 rather than tested around.

**Receipts.** `client-core-effect` 468/468; all nine admin contract suites
native. `pnpm mutation-check`: 26/28 first pass — one weak test (a synchronous
`observed` check a microtask-deferred load slipped past; fixed, now killed) and
one equivalent mutant (E-3). `core:parity`: 53/74 both.

**Independent review of the Effect half (opus, read-only):** SHIP, 0 must-fix.
Taken: (1) `throughput`'s `disposed` flag flipped LAST in the child scope's
reverse-order close, so a debounce due mid-close could fork an unowned write —
it now flips on the PARENT scope, first, and a token drops a superseded timer
due in the same batch; (2)–(3) three tests read state through a subscriber the
close had already interrupted — an absence reported as a clean reading, the
repo's recurring class — and now read a fresh subscriber's seed; (4) the
`errorBurst` case cleared its log before asserting. Mutation pass on the fixes:
3/6 killed. **E-4 — the three survivors are race guards no deterministic test
reaches:** under fake timers the scope close always interrupts the sleeping
debounce fiber before its timer is due, and an interrupt is delivered before a
same-batch stale timer, so the window the reviewer found by reading Effect's
`ScopeImpl.close` / `runtime.ts` cannot be opened in a test. Kept as defence,
recorded here rather than claimed as tested.
