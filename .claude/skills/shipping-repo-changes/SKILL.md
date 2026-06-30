---
name: shipping-repo-changes
description: Use when about to change anything in this repo — before editing, creating, or deleting any file, before committing, and before merging a PR to main. Triggers include any file modification, "commit", "push", "open a PR", "merge to main", concurrent Claude sessions sharing this checkout, and main auto-pushing to origin.
---

# Shipping Repo Changes

## Overview

This repo is shared by **concurrent Claude Code sessions** working in the same checkout, and **local `main` auto-pushes to origin** the moment it advances. So every change must be isolated, proven on CI **against an up-to-date base**, and merged as an explicit merge commit — never improvised on `main`.

**The six rules are non-negotiable. Violating the letter of a rule is violating its spirit.**

## The Six Rules

1. **Isolate first, off the latest `main`.** Before touching *any* file, `git fetch` and create a git worktree on a fresh branch cut from an up-to-date `origin/main`. Never edit the live working tree or `main` directly.
2. **PR + loop until CI is green.** When work is done, push the branch, open a PR, and poll CI until the run for your latest commit completes **successfully**. If it fails, fix on the branch and loop again.
3. **Catch up to `main` before merging.** Once green, if `origin/main` has advanced past your branch, merge `origin/main` *into* the branch and re-run the CI loop. Only merge a branch that is green **and** current.
4. **Merge once green.** As soon as CI is green on a current branch you may merge to `main` immediately via the GitHub API — no human review gate (move-fast policy, may tighten later).
5. **Always a merge commit.** Merge with `--merge`. **Never** `--squash`, `--rebase`, or a fast-forward.
6. **Clean up.** Once your commit is confirmed on `origin/main`, remove *your* worktree and delete its branch — immediately, not "later."

## Rule 1 — Isolate off the *latest* `main`, before any change

Create the worktree *before* the first edit, not after — and branch it off an **up-to-date** `origin/main`. A stale base only grows Rule 3's catch-up burden, so **fetch first:**

```bash
git fetch origin main
```

- **Native tool (`EnterWorktree`)** — preferred. It branches off `origin/<default-branch>` only when `worktree.baseRef` is `fresh` (the default); if it's `head` you'd inherit your local `HEAD` instead. Either way the base is only as fresh as your last fetch — so fetch first.
- **Git fallback (`superpowers:using-git-worktrees`)** — its `git worktree add <path> -b <branch>` branches off your **current `HEAD`**, *not* `origin/main`. So either fast-forward local `main` to `origin/main` before creating the worktree, or branch explicitly: `git worktree add <path> -b <branch> origin/main`.

Pre-existing uncommitted files in the primary checkout stay there, untouched — that's the point of isolating.

## Rule 2 — Push, PR, then loop on CI

```bash
git push -u origin <branch>
gh pr create --base main --head <branch> --title "<title>" --body "<body>"
```

**Read CI with `gh run list` — NOT `gh pr checks`.** This repo's token is a fine-grained PAT that returns **403** on `gh pr checks` / `statusCheckRollup` / check-runs. The working signal is the Actions run list:

```bash
HEAD_SHA=$(git rev-parse HEAD)
gh run list --branch <branch> --workflow CI --json status,conclusion,headSha,databaseId --limit 5
```

Loop until the run **whose `headSha` equals `$HEAD_SHA`** has `status == "completed"`:
- `conclusion == "success"` → go to Rule 3.
- `conclusion == "failure"` (or anything else) → diagnose, fix on the branch, commit, push, and re-enter the loop (a new run starts for the new SHA).

Match on `headSha` so you never read a stale run from an earlier push. Poll on a sensible interval (CI here takes ~10 min); don't merge while the matching run is still `in_progress`/`queued`.

## Rule 3 — Catch up to `main` before merging

Rule 2 proves your branch green against the base it *branched from*. But `main` auto-pushes and concurrent sessions land commits, so by the time you're green that base may have moved on — and `gh pr merge --merge` would then produce a `main` state (latest `main` + your changes) that **CI never tested**. Textual conflicts block the merge; **semantic** conflicts — a renamed export, a tightened lint rule, a changed fixture, each side fine alone but broken together — merge silently and turn `main` red.

So once your branch is green, before merging, check whether it is behind:

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD && echo "up to date" || echo "behind"
```

- **Up to date** (`origin/main` is already an ancestor of `HEAD`) → go straight to Rule 4. No wasted CI cycle.
- **Behind** → merge `origin/main` *into* your branch, then **re-enter the Rule 2 CI loop**:

```bash
git merge origin/main          # resolve any conflicts, commit the merge
git push
```

Only proceed to Rule 4 once a `success` run exists for a `HEAD_SHA` that has `origin/main` as an ancestor — i.e. green **and** current.

**Merge `origin/main` *in* — never rebase the branch to update it.** Rebase rewrites pushed commits, needs a force-push, and discards the branch's CI history; merging is non-destructive and keeps the PR intact. (The final merge *to* `main` is still `--merge` per Rule 5.)

This can race: if `main` advances *again* during your catch-up CI run, you are briefly stale once more. Catch up once, re-green, and merge promptly — the post-merge `main` CI run is the backstop for that residual window. Don't loop forever chasing a fast-moving `main`.

## Rule 4 + 5 — Merge as a merge commit

```bash
gh pr merge <number> --merge --subject "Merge PR #<number>: <title>"
```

`--merge` produces the required merge commit (matches the repo's `Merge PR #NN: …` history). Then confirm and clean up:

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
| Isolate before editing | `git fetch origin main` first, then `EnterWorktree` (native) or `superpowers:using-git-worktrees` — base off latest `origin/main` |
| Read CI status | `gh run list --branch <b> --workflow CI --json status,conclusion,headSha` |
| ❌ Never for CI status | `gh pr checks` / `statusCheckRollup` (403 with this PAT) |
| Is the branch current? | `git merge-base --is-ancestor origin/main HEAD` (exit 0 = current; else merge `origin/main` in + re-green) |
| Update a stale branch | `git merge origin/main` (✅ merge in) — **never** rebase/force-push |
| Merge (merge commit) | `gh pr merge <n> --merge --subject "Merge PR #<n>: <title>"` |
| ❌ Never to merge | `--squash`, `--rebase`, fast-forward |
| Confirm landed | `git merge-base --is-ancestor $(git rev-parse HEAD) origin/main` |
| Clean up after merge | `ExitWorktree action:remove` → fallback `git worktree remove <path>` + `git branch -D <branch>` |

## Rationalization Table

| Excuse | Reality |
|--------|---------|
| "It's a tiny/one-line change, I'll just edit main." | Another session may be mid-change and `main` auto-pushes. Isolate first — always. |
| "`gh pr checks --watch` is the obvious way to wait for CI." | It returns 403 with this repo's PAT. Use `gh run list --workflow CI`. |
| "My branch CI is green, so I can merge." | Green only proves your branch against the base it *branched from*. If `origin/main` advanced, that combined state was never tested — catch up (merge `origin/main` in) and re-green first (Rule 3). |
| "I'll rebase onto main to get up to date." | Rebase needs a force-push and discards CI history. Merge `origin/main` *into* the branch instead. |
| "Squash keeps history clean." | Rule 5 requires a merge commit. `--squash` is not a merge commit. Use `--merge`. |
| "I'll rebase so history is linear." | Rebase/fast-forward is explicitly forbidden. `--merge` only. |
| "CI will obviously pass, I'll merge now." | Loop until the run for *your SHA* is `completed`+`success`. No merging on assumption. |
| "I'll set `--auto` and walk away." | Read CI explicitly and confirm green, then merge. Don't delegate the gate to a flag. |
| "I read a green run, good enough." | Verify its `headSha` is your latest commit, not a stale run. |

## Red Flags — STOP

- About to run Edit/Write/`git mv`/`rm` while still in the primary checkout on `main`.
- About to create the worktree without a fresh `git fetch` — you'd branch off a stale `origin/main`.
- About to merge while your branch is **behind** `origin/main` — catch up (merge `origin/main` in) and re-green first.
- About to type `gh pr merge` with `--squash`, `--rebase`, or `--auto`.
- About to merge without having seen a `completed`/`success` run for your current `HEAD_SHA`.
- Reaching for `gh pr checks` to read CI.
- PR is merged but your worktree is still on disk — Rule 6 isn't done until it's removed.

**Each of these means: stop and follow the rule above.**
