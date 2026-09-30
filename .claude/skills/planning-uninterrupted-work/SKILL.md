---
name: planning-uninterrupted-work
description: Use at the start of any multi-step task in this repo, and before any Bash call that pushes, opens/merges a PR, dispatches a workflow, or writes through gh api. Orders the work so every permission-prompting step runs in ONE batch at the start or the end, each as its own Bash call — never chained with local steps, never scattered mid-flow.
---

# Planning Uninterrupted Work

## Overview

Long sessions here run in auto mode, and the user is **away from the
keyboard between prompts**. Every permission prompt parks the session until
they come back. Ten prompts scattered through a two-hour task cost ten
interruptions, and the work sits idle during each one. The goal is **at most
one prompt boundary at each end of a unit of work**. Nothing in between.

This skill is the planning half. The enforcing half is a PreToolUse hook
(`split-outward-commands.py`) that refuses any Bash command which chains an
outward step with other commands.

## Two rules

### Rule 1: One outward step per Bash call

An **outward step** sends something off this machine, or changes shared state:

| outward (prompts) | local (no prompt) |
|---|---|
| `git push` (incl. `--dry-run`) | `git add`, `git commit`, `git merge origin/main` |
| `gh pr create / merge / edit / comment / close` | `gh pr view`, `gh run list`, `gh run view` |
| `gh workflow run`, `gh run rerun / cancel` | tests, builds, lint, typecheck |
| `gh api` with `-X POST/PATCH/PUT/DELETE` or `-f/-F` | `gh api` GET |
| `gh issue / release / repo` writes | `git fetch`, `./scripts/new-worktree.sh` |

Each outward step gets **its own Bash call**. Piping its output into a filter
(`git push … 2>&1 | tail -2`) is fine, because that is still one step. Joining it
to anything else with `&&`, `;`, `||` or a newline is not.

**Why:** auto mode judges a chained command as a whole and labels the prompt
with its first word. `git add -A && git commit … && git push && gh pr create`
showed up as "git add needs permission". The user saw a trivial local step
being blocked, the local steps waited on the outward one, and one approval
covered actions they couldn't see (2026-09-30).

### Rule 2: Batch outward steps at the boundaries

Plan every unit of work in three phases:

```
1. OPENING BATCH (optional): anything outward the work depends on
   (e.g. a workflow dispatch whose artifact you need later)
2. LOCAL WORK (no prompts): worktree, edits, tests, gates, commits.
   For several PRs, do ALL of their local work here, in dependency order
3. CLOSING BATCH: push → PR create → CI watch → merge → cleanup,
   one outward call each, back to back
```

- **Several PRs in one session:** finish the local work for all of them
  first. Then push and open them one after another in the closing batch. A
  PR that depends on another merging first (a dependency fix every PR's CI
  needs, say) is pushed first, and its merge is the first merge in the batch.
- **Waiting on CI is not a reason to go back to local work** that will need a
  second outward batch. Use the wait for read-only checks and for writing up
  the report.
- **Anything the user must decide** (a merge gate, a destructive cleanup)
  goes at the same boundary, not in the middle of local work.
- **When the hook refuses a command,** split it. Don't rephrase it to get past
  the hook: the hook's purpose is to get the batching right, not just the
  command's shape.

## Red flags: stop and re-plan

- You are about to type `&&` after a `git commit` whose next word is `git push`.
- You pushed, then went back to editing, and now plan to push again: fold
  the edit into the next closing batch instead.
- A plan step says "push and open PR" in the middle of a task list.
- Second PR: you pushed PR A, and now you're starting B's local work.

## Related

- `shipping-repo-changes`: what the outward steps are (Rules 2–6). This
  skill decides when they run.
