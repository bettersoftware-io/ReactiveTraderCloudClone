---
description: Where this repo stands — live branch/PR/CI state plus the pending-work backlog
argument-hint: [backlog|live]
allowed-tools: Bash(git:*), Bash(gh:*), Bash(grep:*), Read
---

Report where the repo stands. Argument: `$ARGUMENTS` — empty → both halves;
`live` → skip the backlog; `backlog` → skip the live half.

**The argument filters what you *render*, not what runs.** Every block below
executes unconditionally — see "Authoring these blocks" at the bottom for why
they must not branch. Collecting both halves costs one `git fetch` and two `gh`
calls, which is cheaper than the failure mode branching caused.

## Local state

!`git rev-parse --abbrev-ref HEAD; git rev-parse --show-toplevel; git status --short | head -15; echo "--- dirty file count ---"; git status --short | wc -l`

## Position against origin/main

!`git fetch origin main --quiet 2>/dev/null; echo "counts are <behind origin/main> <ahead>:"; git rev-list --left-right --count origin/main...HEAD`

## Open PRs

!`gh pr list --limit 15 --json number,title,headRefName,isDraft,createdAt --jq '.[] | "#\(.number)\t\(if .isDraft then "draft" else "open " end)\t\(.headRefName)\t\(.title)"' 2>&1 | head -20`

## Recent CI on main

!`gh run list --workflow CI --branch main --limit 5 --json status,conclusion,headSha,createdAt --jq '.[] | "\(.createdAt[5:16])  \(.status)/\(.conclusion // "—")  \(.headSha[0:8])"' 2>&1`

## Backlog skeleton — docs/STATUS.md

!`grep -m1 'Last updated' docs/STATUS.md; echo; grep -oE '^## .*|^- \*\*[^*]+\*\*' docs/STATUS.md`

## What to render

**Never inline `docs/STATUS.md`.** It is ~59k and single entries run to
thousands of words. The skeleton above is the whole point — work from it, and
`Read` only the specific entry a follow-up question is actually about.

Apply `$ARGUMENTS` here, at render time: `live` → emit 1–3 only; `backlog` →
emit 4 only; empty → all four. The blocks all ran regardless, so simply leave
the unwanted half out of the report rather than reporting it as skipped.

Structure the report as:

1. **One line of live position** — which checkout (primary or which worktree),
   branch, dirty-file count, and how it sits against `origin/main`.
2. **Open PRs**, one line each. Flag any that look stalled.
3. **Last CI conclusion on `main`.** If the most recent completed run is a
   failure, that is the headline — say so first, above everything else.
4. **Backlog**, summarized from the skeleton: counts per section, then name the
   handful of entries that look most actionable. Do not list all ~37.

Keep the whole thing readable on a phone. Terse beats complete.

## Reading this repo honestly

- **`docs/STATUS.md` is pending-only.** Finished work is deleted, not archived.
  An entry's absence means done or never-started — never infer progress from it.
  Its "Last updated" line is the freshness bound on the entire backlog half.
- **`git fetch` above only fetched `main`.** Other remote branches may be stale
  in this report.
- **Several published artefacts are dispatch-only and stale by default** — the
  coverage report, the x86 golden set, the deployed sites. If a question depends
  on one, check when it was last dispatched before trusting it; do not quote
  figures from them as current.
- **`visual.yml` runs post-merge on `main`, not as a PR gate.** A green PR does
  not mean the visual tier passed.
- If a `gh` call above returned an error rather than data, report that plainly
  instead of treating the empty result as "nothing open".

## Authoring these blocks — no shell control flow

**A `!` block must never contain `case`, `if`, a `for`/`while` loop, or a
`{ …; }` group.** Claude Code parses each block with a shell grammar *before*
running it, to decompose it into individual commands it can match against the
`allowed-tools` frontmatter. Control-flow constructs don't decompose into a
`git …`/`gh …` prefix, so the checker fails closed and the block never runs:

```
Error: Shell command permission check failed for pattern "!`case "" in backlog) …":
Contains case_statement
```

That kills the block outright — the command still runs, but with an error where
its data should be, and **every** block written that way is dead.

This is not hypothetical. The `$ARGUMENTS` handling here was originally five
`case` statements (added 2026-07-26 in `10277e194`, "make `/rtc:status` args
real"); all five failed this check, so the command was fully broken from that
commit until 2026-08-14 — ~19 days — because nothing surfaces the defect until
someone actually runs it. Reading the file looks fine. `git diff` looks fine.

Consequences for anything added below:

- **Sequence with `;`, filter with pipes.** `cmd-a; cmd-b | head -5` parses and
  decomposes cleanly. Pipelines are fine — each segment is checked separately,
  which is why `awk`/`sed` work in `/rtc:gauntlet` despite not being listed in
  its `allowed-tools`.
- **Branch at render time, not in the shell.** Collect unconditionally and let
  the prose above decide what reaches the report.
- **Quoted control-flow keywords are fine** — the `if … then … else … end`
  inside the `--jq` argument above is a single-quoted string to the shell, so
  the parser never sees it as a construct.
- **A Bash *tool call* proves nothing about a `!` block.** The two go through
  different permission paths, and `case` succeeds as a tool call. The only real
  test is running `/rtc:status` from the primary checkout — worktrees don't
  supply the session's commands, so a fix verified only in a worktree is
  unverified.
