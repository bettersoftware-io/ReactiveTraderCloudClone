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

This skill is the planning half. The enforcing half is the project's
PreToolUse hook [`.claude/hooks/split-outward-commands.py`](../../hooks/split-outward-commands.py),
registered in `.claude/settings.json`, which refuses any Bash command that
chains an outward step with other commands, and asks a person before a push
that can lose something on the remote.

## The pre-approved forms (no prompt at all)

`.claude/settings.json` allow-lists the routine outward steps, so a closing
batch written in these exact forms runs unattended:

| step | pre-approved form |
|---|---|
| push a worktree branch | `git push -u origin worktree-<name>` or `git push origin worktree-<name>`, **run from inside the worktree** (a `git -C <dir> push …` does not match the rule and prompts) |
| open the PR | `gh pr create …` |
| merge it | `gh pr merge …` |

These always **ask**:

- a push that can lose something on the remote: a force (`--force`,
  `--force-with-lease`, `-f`, a `+refspec`), a delete (`--delete`, `-d`, a
  `:branch` refspec), `--mirror`, `--prune`. The hook asks, and the prompt
  names the word it stopped at;
- a push that sweeps (`--all`, `--tags`) and a merge past branch protection
  (`gh pr merge … --admin`): `ask` rules, which beat the allow rules;
- a push of anything that isn't a `worktree-*` branch: no rule allows it.

Those need a person to look at them. The hook decides the first group
because it reads the words git will receive, and a rule cannot: the allow
rules end in `*`, a pattern cannot say "one more word", and a list of
spellings missed an option git accepts shortened (`--del`), bundled (`-uf`)
or quoted (`"--force"`). Nine `ask` rules for the plain spellings stay as a
backstop for a hook that fails to run. The hook asks only for a push that
can lose something, so that no routine command gains a prompt.

Still unasked, because nothing is lost: a named target
(`git push origin worktree-a:main`), a second branch after the first
(`git push origin worktree-a main`), and `gh pr merge` of any pull request
number. The `main` ruleset stands behind a push to `main`; nothing but
attention stands behind the rest.

The hook catches a mistake; it does not hold back an agent that wants past
it. It finds a push wherever it sits in the command (behind `timeout`, in
`( … )`, after a pipe), but it is not a shell: a push built from a string
(`sh -c '…'`, `eval`, a script, an alias) is not read, and neither is what
the words do (a `remote.origin.push` setting can turn a plain push into a
forced one).

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
