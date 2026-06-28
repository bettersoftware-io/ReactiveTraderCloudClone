---
name: shipping-repo-changes
description: Use when about to change anything in this repo — before editing, creating, or deleting any file, before committing, and before merging a PR to main. Triggers include any file modification, "commit", "push", "open a PR", "merge to main", concurrent Claude sessions sharing this checkout, and main auto-pushing to origin.
---

# Shipping Repo Changes

## Overview

This repo is shared by **concurrent Claude Code sessions** working in the same checkout, and **local `main` auto-pushes to origin** the moment it advances. So every change must be isolated, proven on CI, and merged as an explicit merge commit — never improvised on `main`.

**The four rules are non-negotiable. Violating the letter of a rule is violating its spirit.**

## The Four Rules

1. **Isolate first.** Before touching *any* file, create a git worktree on a fresh branch. Never edit the live working tree or `main` directly.
2. **PR + loop until CI is green.** When work is done, push the branch, open a PR, and poll CI until the run for your latest commit completes **successfully**. If it fails, fix on the branch and loop again.
3. **Merge once green.** As soon as CI is green you may merge to `main` immediately via the GitHub API — no human review gate (move-fast policy, may tighten later).
4. **Always a merge commit.** Merge with `--merge`. **Never** `--squash`, `--rebase`, or a fast-forward.

## Rule 1 — Isolate before any change

Use the **native worktree tool** if available (`EnterWorktree`); otherwise follow `superpowers:using-git-worktrees` (git fallback branches off `origin/main`). Do this *before* the first edit, not after.

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

## Rule 3 + 4 — Merge as a merge commit

```bash
gh pr merge <number> --merge --subject "Merge PR #<number>: <title>"
```

`--merge` produces the required merge commit (matches the repo's `Merge PR #NN: …` history). Then confirm and clean up:

```bash
gh pr view <number> --json state -q .state          # expect MERGED
git fetch origin main
git merge-base --is-ancestor $HEAD_SHA origin/main   # exit 0 = your work is on main
```

Only after confirming your commit is an ancestor of `origin/main` may you remove the worktree (`ExitWorktree action:remove`, or `git worktree remove`).

## Quick Reference

| Need | Command |
|------|---------|
| Isolate before editing | `EnterWorktree` (native) or `superpowers:using-git-worktrees` |
| Read CI status | `gh run list --branch <b> --workflow CI --json status,conclusion,headSha` |
| ❌ Never for CI status | `gh pr checks` / `statusCheckRollup` (403 with this PAT) |
| Merge (merge commit) | `gh pr merge <n> --merge --subject "Merge PR #<n>: <title>"` |
| ❌ Never to merge | `--squash`, `--rebase`, fast-forward |
| Confirm landed | `git merge-base --is-ancestor $(git rev-parse HEAD) origin/main` |

## Rationalization Table

| Excuse | Reality |
|--------|---------|
| "It's a tiny/one-line change, I'll just edit main." | Another session may be mid-change and `main` auto-pushes. Isolate first — always. |
| "`gh pr checks --watch` is the obvious way to wait for CI." | It returns 403 with this repo's PAT. Use `gh run list --workflow CI`. |
| "Squash keeps history clean." | Rule 4 requires a merge commit. `--squash` is not a merge commit. Use `--merge`. |
| "I'll rebase so history is linear." | Rebase/fast-forward is explicitly forbidden. `--merge` only. |
| "CI will obviously pass, I'll merge now." | Loop until the run for *your SHA* is `completed`+`success`. No merging on assumption. |
| "I'll set `--auto` and walk away." | Read CI explicitly and confirm green, then merge. Don't delegate the gate to a flag. |
| "I read a green run, good enough." | Verify its `headSha` is your latest commit, not a stale run. |

## Red Flags — STOP

- About to run Edit/Write/`git mv`/`rm` while still in the primary checkout on `main`.
- About to type `gh pr merge` with `--squash`, `--rebase`, or `--auto`.
- About to merge without having seen a `completed`/`success` run for your current `HEAD_SHA`.
- Reaching for `gh pr checks` to read CI.

**Each of these means: stop and follow the rule above.**
