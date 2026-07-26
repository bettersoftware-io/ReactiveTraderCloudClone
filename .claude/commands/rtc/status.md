---
description: Where this repo stands — live branch/PR/CI state plus the pending-work backlog
argument-hint: [backlog|live]
allowed-tools: Bash(git:*), Bash(gh:*), Bash(grep:*), Read
---

Report where the repo stands. Argument: `$ARGUMENTS` — empty → both halves;
`live` → skip the backlog; `backlog` → skip the live half.

## Local state

!`git rev-parse --abbrev-ref HEAD; git rev-parse --show-toplevel; git status --short | head -15; echo "--- dirty file count ---"; git status --short | wc -l`

## Position against origin/main

!`git fetch origin main --quiet 2>/dev/null; git rev-list --left-right --count origin/main...HEAD 2>/dev/null | awk '{print "behind origin/main: "$1"   ahead: "$2}'`

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
