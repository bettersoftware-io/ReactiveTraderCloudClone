---
name: shipping-repo-changes
description: Use when about to change anything in this repo — before editing, creating, or deleting any file, before committing, and before merging a PR to main. Triggers include any file modification, "commit", "push", "open a PR", "merge to main", and concurrent Claude sessions sharing this checkout.
---

# Shipping Repo Changes

## Overview

This repo is shared by **concurrent Claude Code sessions** working in the same checkout, and the `main` ruleset admits changes only through a PR. So every change must be isolated, proven on CI **against an up-to-date base**, and merged as an explicit merge commit — never improvised on `main`.

> **A note on "local `main` auto-pushes to origin."** Earlier revisions of this
> skill justified Rule 1 that way. Verified 2026-07-26 in this checkout: it is
> **not true here** — `.git/hooks` holds only Git LFS hooks, the sole Claude
> hook is a `Stop` drift-check, and no repo script pushes `main`. It is an
> artifact of the **sandbox** environment, recorded as if it were a repo fact.
> Rule 1 is unaffected: concurrent sessions sharing one checkout justify
> isolating first on their own, and the ruleset blocks direct pushes to `main`
> regardless. Don't rely on the auto-push premise in either direction.

**The six rules are non-negotiable. Violating the letter of a rule is violating its spirit.**

## The Six Rules

1. **Isolate first, off the latest `main`.** Before touching *any* file, run **`./scripts/new-worktree.sh <name>`** — it fetches and branches explicitly off `origin/main`. Never edit the live working tree or `main` directly.
2. **One PR per reviewable unit; loop until CI is green.** Put everything a reviewer would accept or reject *together* in one PR. Then push, open the PR, and poll CI until the run for your latest commit completes **successfully**. If it fails, fix on the branch and loop again.
3. **Assess catch-up risk before merging.** Once green, if `origin/main` has advanced, don't reflexively catch up — triage what landed. Merge as-is when it's plainly disjoint from your change; merge `origin/main` *in* and re-run the CI loop only when there's an overlap / semantic-conflict path or the incoming diff is too broad to cheaply assess.
4. **Merge once green.** As soon as CI is green on a current branch you may merge to `main` immediately via the GitHub API — no human review gate (move-fast policy, may tighten later).
5. **Always a merge commit.** Merge with `--merge`. **Never** `--squash`, `--rebase`, or a fast-forward.
6. **Clean up.** Once your commit is confirmed on `origin/main`, remove *your* worktree and delete its branch — immediately, not "later."

## Rule 1 — Isolate off the *latest* `main`, before any change

Create the worktree *before* the first edit, not after — and branch it off an **up-to-date** `origin/main`. **Use the script, always:**

```bash
./scripts/new-worktree.sh <name>     # → .claude/worktrees/<name> on branch worktree-<name>
```

It fetches, then branches explicitly off `origin/main`, and prints the base commit it landed on. Works from the primary checkout or from inside another worktree.

**Why a script and not "remember to fetch."** Every hand-rolled path branches off your **current `HEAD`**, which inherits however stale local `main` is — and local `main` is stale *by default* here, because concurrent sessions land merges on `origin/main` continuously while your local ref sits where it was last fetched. This isn't theoretical: an audit on 2026-07-20 found local `main` 6 commits / 4h37m behind `origin/main`, with four of the five live worktrees sitting on that stale tip (one at **21 commits behind**). A stale base never fails loudly — it just silently inflates Rule 3's catch-up burden until a branch is too far behind to merge cheaply. Branching off `origin/main` by name removes the failure mode instead of asking you to remember.

- **Native tool (`EnterWorktree`)** — acceptable *only* when `worktree.baseRef` is `fresh` (the default) **and** you've fetched first; it branches off `origin/<default-branch>`, but only as fresh as your last fetch. If `baseRef` is `head` it inherits local `HEAD` and is unsafe. Prefer the script.
- **Bare `git worktree add <path> -b <branch>`** — ❌ never. It branches off `HEAD`. If you must go manual, name the base: `git worktree add <path> -b <branch> origin/main` — after a `git fetch origin main`.

Pre-existing uncommitted files in the primary checkout stay there, untouched — that's the point of isolating.

## Rule 2 — One PR per reviewable unit, then loop on CI

### What belongs in ONE PR

**The test: could a reviewer meaningfully reject one part while approving the other?**

- **No → one PR.** Same workstream, non-overlapping files, no dependency between them. A doc-sync fix and the close-out entry for that same workstream fail this test — nobody approves one and blocks the other.
- **Yes → separate PRs.** Independent concerns, different workstreams, or one genuinely depends on the other having landed.

**"I'll do X once the current PR lands" is a dependency claim — verify it.** It's real only when the later change would be *wrong* until the earlier one merges, or when the two touch the same files. Neither is satisfied by "they're related" or "I want to see the first one land first." Sequencing without a real dependency costs a full extra CI run (~8 min here), a second review-and-merge cycle, and an extra worktree — per split.

Fold in without a second thought: the tests covering the change, the doc update it invalidates, the status/backlog entry it closes, the config it needs.

### Push, PR, then loop on CI

```bash
git push -u origin <branch>
gh pr create --base main --head <branch> --title "<title>" --body "<body>"
```

**Read CI with `gh run list`.** It is the signal that works under *every* token this repo is driven with, which `gh pr checks` is not:

| token | where it comes from | `gh run list` | `gh pr checks` / `statusCheckRollup` |
|---|---|---|---|
| `gho_…` OAuth (`repo` scope) | host keychain, `gh auth login` | ✅ | ✅ **works** |
| `github_pat_…` fine-grained | `.github/.token`, injected as `GH_TOKEN` by the sandbox launcher | ✅ | ❌ 403 unless granted *Checks: read* + *Commit statuses: read* |

**The blanket claim "this repo's PAT 403s on `gh pr checks`" was wrong** — corrected 2026-07-26. It was never a property of the repo or the API, only of *which token happened to be loaded*. Verified on the host OAuth token: `gh pr checks 370` exits 0 with all 7 checks, and `statusCheckRollup` returns `SUCCESS`. `gh run list` remains the standing recommendation because it is token-portable and `headSha`-matchable — not because the alternative is broken.

> ⚠️ **The PAT in `.github/.token` is currently revoked** (verified 2026-07-26: `gh api user` → `401 Bad credentials`, not 403). The sandbox launcher prefers that file over the host keychain, so a **sandboxed session will fail every `gh` call**, not just check-rollup. Fix: delete `.github/.token` — the launcher then falls back to `gh auth token`, whose OAuth `repo` scope covers check-rollup too — or rotate it with *Checks: read* + *Commit statuses: read* granted.

The run list:

```bash
HEAD_SHA=$(git rev-parse HEAD)
gh run list --branch <branch> --workflow CI --json status,conclusion,headSha,databaseId --limit 5
```

Loop until the run **whose `headSha` equals `$HEAD_SHA`** has `status == "completed"`:
- `conclusion == "success"` → go to Rule 3.
- `conclusion == "failure"` (or anything else) → diagnose, fix on the branch, commit, push, and re-enter the loop (a new run starts for the new SHA).

Match on `headSha` so you never read a stale run from an earlier push. Poll on a sensible interval (CI here takes ~10 min); don't merge while the matching run is still `in_progress`/`queued`.

### No run appears at all — check mergeability BEFORE re-triggering

An **absent** run and a **slow** run look identical to a poll loop that only tests for `completed`. They are not the same problem, and the most common cause of an absent run is not a flake:

```bash
gh pr view <number> --json mergeable,mergeStateStatus
```

- **`mergeable: CONFLICTING` / `mergeStateStatus: DIRTY` → no run will EVER be created.** `pull_request` workflows build the *computed merge commit*; when the PR conflicts that ref cannot be produced, so GitHub creates nothing — it does not queue, and it does not fail. CodeQL still runs, because it uses `refs/pull/N/head` instead, which needs no merge. **Re-triggering cannot help**: an empty commit produces another unmergeable head. Fix the conflict (`git merge origin/main`, resolve, push) and the run appears immediately.
- **`mergeable: MERGEABLE` and still no run after a few minutes** → *then* it's the genuine synchronize-event flake, and an empty-commit re-trigger is the right move. Prefer that over `workflow_dispatch`: a dispatch run does not satisfy the required PR contexts (see #291).

**Your poll loop must emit on the no-match branch.** A loop that prints only on completion is silent through both cases and looks exactly like "still running" — a real absent-run diagnosis was delayed by ~40 min this way (2026-07-26). Emit something after a few empty polls, and include the mergeability check in that message.

### Don't poll forever — budget, then diagnose

Passive polling has a **wall-clock budget**. A normal full run here is ~10 min; the e2e job is the long pole and can stretch a run to ~20 min. **Once the matching run passes ~25 min (≈2× normal), STOP polling and diagnose — never poll for hours waiting on a hang.** "The run is slow" is not a diagnosis; find the *specific stuck step*:

```bash
gh run view <run-id> --json jobs   # find the in_progress job, then ITS in_progress step
```

Then classify the stuck step and act — don't just keep waiting:

| Stuck step | Meaning | Action |
|---|---|---|
| A **setup/infra** step — `Set up job`, checkout, `setup-node`, **`Cache the … store`**, `Install dependencies` | GitHub-Actions hang, **not your code** (the real checks haven't even run) | Re-trigger on a fresh runner: `gh run cancel <id>` then `gh run rerun <id> --failed`. If cancel wedges (the hung step resists for minutes), `git commit --allow-empty -m "ci: re-trigger"` && `git push` to start a clean run. |
| A **real check** — `Typecheck`, `Tests`, e2e | Genuinely slow, maybe legit | Allow the known ceiling (e2e ~15–20 min) before treating as hung; below it, keep waiting. |
| A step already **failed** (job red, later steps skipped) | Real failure | `gh run view <id> --log-failed`, then fix forward per Rule 2. |

**If the same infra step hangs again after a re-trigger,** it's likely a live GitHub-Actions/cache outage — stop re-running and tell the user rather than burn cycles.

**Red flag:** you've polled past the budget without once running `gh run view --json jobs`. Drill in the moment the budget is blown, not after another hour.

## Rule 3 — Assess catch-up risk before merging

Rule 2 proves your branch green against the base it *branched from*. But concurrent sessions keep merging into `origin/main`, so by the time you're green that base may have moved on — and `gh pr merge --merge` would then produce a `main` state (latest `main` + your changes) that **CI never tested**. Git blocks *textual* conflicts, so the only silent risk is a **semantic** conflict: a renamed export, a tightened lint rule, a changed fixture — each side fine alone, broken together.

The blanket "always catch up when behind" rule spins into cat-and-mouse against a fast-moving `main` (docs churn, sibling sessions): each catch-up costs a full ~10-min CI run, and `main` often advances *again* before it finishes. So **don't reflexively catch up — triage what landed.** The only question is: *can I cheaply convince myself the two changes can't collide?*

```bash
git fetch origin main
git diff --name-only HEAD...origin/main    # what landed on main since you diverged
git diff --name-only origin/main...HEAD    # what your branch touched
```

- **Merge as-is (skip catch-up)** — the common case — when the incoming commits are plainly **disjoint** from your change: a different package, docs-only while you touched code, no shared exports / fixtures / lint / build config. `git merge-base --is-ancestor origin/main HEAD` may report "behind," but *behind ≠ risky*. Go straight to Rule 4.
- **Merge as-is even when a file IS shared, if every shared file is prose** — i.e. every path in the overlap matches `**/*.md`. Prose in different sections of a document has no semantic-conflict path to code, and git still blocks a genuine *textual* conflict regardless. `CLAUDE.md` counts as prose (instructions, not executable); `.claude/settings.json` does **not** (JSON that changes tool behaviour). The glob is deliberately narrower than `docs/**`: that directory also holds 24 `.html`, 9 `.svg`, 6 `.js`, 5 `.css` and LFS media, and `docs/pages/`, `docs/presentations/`, `docs/showcase/` publish straight to gh-pages on push to `main` (`publish-site.yml`) while `docs/design/**/*.html` deploys to Vercel — none behind a CI gate, so "prose" there would be true of the wrong claim. A renamed heading or moved/renamed doc is *not* prose-safe either — `check:doc-links` validates cross-file anchors, so branch A renaming a heading + branch B linking the old one auto-merges clean and reds `main`; catch up in that case. Generated `.md` (e.g. `docs/lint-warnings.md`, drift-checked) is likewise not prose. **This is the single highest-value case:** measured over 59 merges (2026-07-26), 17 needed a catch-up and **9 of those 17 — 53% — shared only `docs/STATUS.md`**, every one of which auto-merged cleanly. They were not conflicts; they were this rule read too literally, at ~10 min of CI each.
- **Catch up (merge `origin/main` *in* + re-enter the Rule 2 CI loop)** when **either**:
  - **(a) Overlap with a real semantic-conflict path** — the incoming diff touches code, a lockfile, config, fixtures, lint / tsconfig / `turbo.json`, CI workflows, exported symbols, or a package your branch also touches. `pnpm-lock.yaml` is the case that genuinely warrants it (4 of those 17); **or**
  - **(b) Too broad to cheaply assess** — the incoming diff spans more files than you can quickly eyeball for disjointness. Don't agonize over a big overlap analysis; just catch up. This is rare, so one extra catch-up is cheap.

```bash
git merge origin/main          # resolve any conflicts, commit the merge
git push                       # then re-loop on CI (Rule 2) until green again
```

A **textual** conflict always forces a resolve regardless — git won't merge otherwise; resolve minimally, don't preemptively catch up just to dodge one.

**A conflict inside a function your branch renamed gets a name check too, not just a correctness check.** Resolving the conflict is the one moment where two independently-reviewed diffs actually combine — the "each side fine alone, broken together" risk this rule exists for applies to names exactly as much as to logic, and nobody is reviewing the combination the way a normal PR review would. If the other side's hunk widens a condition or adds a branch inside a function you renamed, re-read the merged body against the name before committing the resolution — no gate catches a decayed-but-well-formed name; lint and typecheck both stay green on it. This happened for real: a workstream named a function `dismissOnReducedMotion`, then a catch-up merge pulled in `main`'s widened condition (`isFreeze || (reduce && !forced)`), which made the name understate itself — it became `dismissOnJumpCut`.

**Merge `origin/main` *in* — never rebase the branch to update it.** Rebase rewrites pushed commits, needs a force-push, and discards the branch's CI history; merging is non-destructive and keeps the PR intact. (The final merge *to* `main` is still `--merge` per Rule 5.)

**Framing the risk.** A red `main` is bounded and recoverable — the post-merge `main` CI run is the backstop, and fixing forward is fine *as long as it's rare*. Optimize for throughput: pay the catch-up cycle only when overlap is real or the diff is too broad to judge, not on every advance. If you do land a break, fix it forward immediately.

> **The residual risk, and the structural fix on the roadmap.** `strict_required_status_checks_policy` is `false` on the `main` ruleset, so a green-but-stale PR *can* merge into a `main` it was never tested against — this has caught exactly once (a green PR-CI that reddened `main` during the SolidJS port); post-merge `main` CI is the backstop. A **GitHub merge queue** would close this structurally — it would test the combined (`main` + your PR) state automatically and merge in order, dissolving this whole triage — but it is **not available to this repo**: merge queue requires an **organization-owned** repository, and this one is owned by a *user* account (verified 2026-07-26). Public visibility is not sufficient. Adopting it would mean transferring the repo to an org first, so **this manual triage is the rule for the foreseeable future**, not a stopgap. See [`docs/IDEAS.md`](../../../docs/IDEAS.md) and the [design spec](../../../docs/superpowers/specs/2026-07-26-catchup-triage-and-merge-queue-design.md).

## Rule 4 + 5 — Merge as a merge commit

```bash
gh pr merge <number> --merge --subject "Merge PR #<number>: <title>"
```

`--merge` produces the required merge commit (matches the repo's `Merge PR #NN: …` history).

**This command is pre-approved repo-wide.** `Bash(gh pr merge *)` is in the committed [`.claude/settings.json`](../../settings.json) allow-list, so no permission prompt stands between a green branch and `main` — for *any* session in this checkout, not just the one that set it up. That is deliberate (it's what makes Rule 4's no-human-gate policy actually work unattended), but it means **Rules 2 and 3 are the only gate left**: a run that is green for your SHA, and a triaged base. Do not type this command until you have seen both. Nothing downstream will stop you.

Then confirm and clean up:

```bash
gh pr view <number> --json state -q .state          # expect MERGED
git fetch origin main
git merge-base --is-ancestor $HEAD_SHA origin/main   # exit 0 = your work is on main
```

Confirming your commit is an ancestor of `origin/main` is the gate for Rule 6 — do not clean up before `git merge-base --is-ancestor` exits 0.

## Rule 6 — Clean up the worktree

A merged PR with its worktree still on disk is *not done*. Once the commit is confirmed on `origin/main`:

```bash
ExitWorktree action:remove        # native tool — preferred when it works
```

**If `ExitWorktree` no-ops** ("no active worktree session" — happens after a session resume, which drops the in-memory session link), fall back to git, targeting **only your** worktree and branch:

```bash
git worktree remove .claude/worktrees/<your-worktree>
git branch -D <your-branch>       # the remote branch is auto-deleted by the merge
```

Never bulk-remove or prune other worktrees — concurrent sessions own them.

## Quick Reference

| Need | Command |
|------|---------|
| Isolate before editing | `./scripts/new-worktree.sh <name>` — fetches + branches off `origin/main` |
| ❌ Never to isolate | bare `git worktree add <path> -b <branch>` (branches off stale local `HEAD`) |
| Does this belong in the open PR? | Could a reviewer reject one part and approve the other? No → same PR |
| Read CI status | `gh run list --branch <b> --workflow CI --json status,conclusion,headSha` |
| Prefer for CI status | `gh run list` — token-portable and `headSha`-matchable. `gh pr checks` works on the host OAuth token but 403s on an under-scoped fine-grained PAT |
| **No** run exists for your SHA | `gh pr view <n> --json mergeable` **first** — `CONFLICTING` means no run will ever be created (the merge ref can't be built); fix the conflict. Only if `MERGEABLE` is an empty-commit re-trigger the answer |
| Run stuck >~25 min → diagnose | `gh run view <id> --json jobs` → find the stuck step; infra/cache step = cancel + `rerun --failed` (or empty-commit re-trigger), real check = wait its ceiling, failed = `--log-failed` |
| Is the branch current? | `git merge-base --is-ancestor origin/main HEAD` (exit 0 = current; if "behind" → triage per Rule 3: **prose-only overlap merges as-is**, catch up only on a real semantic-conflict path or a too-broad diff) |
| What landed on `main`? | `git diff --name-only HEAD...origin/main` vs. `git diff --name-only origin/main...HEAD` — disjoint → merge as-is |
| Update a stale branch | `git merge origin/main` (✅ merge in) — **never** rebase/force-push |
| Merge (merge commit) | `gh pr merge <n> --merge --subject "Merge PR #<n>: <title>"` |
| ❌ Never to merge | `--squash`, `--rebase`, fast-forward |
| Confirm landed | `git merge-base --is-ancestor $(git rev-parse HEAD) origin/main` |
| Clean up after merge | `ExitWorktree action:remove` → fallback `git worktree remove <path>` + `git branch -D <branch>` |

## Rationalization Table

| Excuse | Reality |
|--------|---------|
| "It's a tiny/one-line change, I'll just edit main." | Another session may be mid-change in the same checkout, and the `main` ruleset rejects direct pushes anyway — the edit can only reach `main` through a PR. Isolate first — always. |
| "`git worktree add -b foo` is the normal way to make a worktree." | It branches off your **current `HEAD`**, and local `main` is stale by default here. Use `./scripts/new-worktree.sh`. |
| "I fetched recently, local `main` is fine." | An audit found it 6 commits behind after 4½ hours. Branch off `origin/main` by name; don't estimate freshness. |
| "I'll do the doc/STATUS update once this PR lands." | That's sequencing, not a dependency. If the files don't overlap and neither change needs the other merged, it's one PR — you're paying an extra CI run for nothing. |
| "These are separate concerns, so separate PRs is cleaner." | Apply the test: would a reviewer approve one and reject the other? If not, it's one reviewable unit. |
| "`gh pr checks --watch` is the obvious way to wait for CI." | It works on the host OAuth token, but 403s under the sandbox's fine-grained PAT, and it can't be matched to your `headSha`. Use `gh run list --workflow CI` so the same loop works everywhere. |
| "My branch CI is green, so I can merge." | Green proves your branch against the base it *branched from*. If `origin/main` advanced, triage the incoming diff first (Rule 3) — merge as-is when it's disjoint, catch up + re-green only on overlap or a too-broad diff. |
| "`main` moved while I was green, so I have to catch up." | Only if the incoming diff overlaps your change **in code/config** or is too broad to judge. Plainly-disjoint advances (docs churn, another package) merge as-is — reflexive catch-up against a fast-moving `main` is the cat-and-mouse trap Rule 3 now avoids. |
| "I'll rebase onto main to get up to date." | Rebase needs a force-push and discards CI history. Merge `origin/main` *into* the branch instead. |
| "Squash keeps history clean." | Rule 5 requires a merge commit. `--squash` is not a merge commit. Use `--merge`. |
| "I'll rebase so history is linear." | Rebase/fast-forward is explicitly forbidden. `--merge` only. |
| "CI will obviously pass, I'll merge now." | Loop until the run for *your SHA* is `completed`+`success`. No merging on assumption. |
| "I'll set `--auto` and walk away." | Read CI explicitly and confirm green, then merge. Don't delegate the gate to a flag. |
| "I read a green run, good enough." | Verify its `headSha` is your latest commit, not a stale run. |
| "It's still running, I'll just keep polling." | Past ~25 min, polling is negligence, not patience. `gh run view --json jobs`, find the stuck step, act (infra hang → re-trigger; real failure → fix). |

## Red Flags — STOP

- About to run Edit/Write/`git mv`/`rm` while still in the primary checkout on `main`.
- About to create a worktree with anything other than `./scripts/new-worktree.sh` — bare `git worktree add -b` branches off stale local `HEAD`.
- About to defer a doc / test / STATUS update to "a follow-up PR" without a file overlap or a real dependency — it belongs in the PR you have open.
- About to merge while **behind** `origin/main` *without checking what landed* — triage first (Rule 3): merge as-is if disjoint, catch up + re-green only on overlap or a too-broad diff.
- About to type `gh pr merge` with `--squash`, `--rebase`, or `--auto`.
- About to merge without having seen a `completed`/`success` run for your current `HEAD_SHA`.
- Reading CI with `gh pr checks` instead of `gh run list` — it can't be matched to your `headSha`, so it may report a stale run, and it 403s under the sandbox's PAT.
- Polling a run past ~25 min without once running `gh run view --json jobs` to find the stuck step.
- Re-triggering a "missing" CI run without first checking `gh pr view --json mergeable` — a `CONFLICTING` PR never gets a run, so the re-trigger is guaranteed to be wasted.
- PR is merged but your worktree is still on disk — Rule 6 isn't done until it's removed.

**Each of these means: stop and follow the rule above.**
