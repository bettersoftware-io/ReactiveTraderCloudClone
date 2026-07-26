---
description: Find per-file coverage gaps from a fresh local run, then backfill tests for the ones you approve
argument-hint: [package-or-path filter]
allowed-tools: Bash(pnpm:*), Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Edit
---

Find and close per-file test-coverage gaps. Optional filter: `$ARGUMENTS`.

## Coverage data already on disk

!`node scripts/coverage-gaps.mjs --limit 5 2>&1 | tail -12; echo "---"; find packages -path '*/coverage/coverage-final.json' -newermt '-1 day' 2>/dev/null | wc -l | xargs echo "tier files written in the last 24h:"`

## Other sessions may be doing this already

!`git worktree list | grep -v "^$(git rev-parse --show-toplevel) " || echo "(no other worktrees)"`

**Check before you start.** Coverage backfill is the single most collision-prone
work in this repo — the gap list is public in `docs/STATUS.md`, so two sessions
independently pick the same top file. Before proposing anything, read the
**"Coverage-gap sweep"** entry in `docs/STATUS.md` and glance at the worktrees
above. If another worktree is plainly doing coverage work, say so and ask before
proceeding rather than racing it.

## Procedure

### 1. Get fresh data

If the block above reported no coverage files, or they are older than the code
you care about, run the tiers first:

```bash
pnpm test:coverage        # unit tiers: domain, server, client-core, …
pnpm test:ui:coverage     # contract/visual tiers
```

This takes a few minutes. Do not substitute the **published gh-pages report** —
it is dispatch-only and stale by default (last time: 10 days / 48 commits), and
its per-tier `index.html` lists directories only.

### 2. Rank the gaps

```bash
node scripts/coverage-gaps.mjs --limit 40
```

Ranked by uncovered statements + branches, each file shown at its **best** tier.

### 3. Propose, then stop

Present the shortlist you intend to work on and **wait for approval**. For each,
say what is actually uncovered — a branch, an error path, a whole module — not
just the percentage. A file at 92% because one `catch` is unreachable in tests is
a different proposition from one at 92% because a feature is untested.

Prefer gaps where the uncovered code encodes **behaviour that could regress
silently**. This repo has shipped exactly that twice: `buildBrowserPorts.ts`'s
entire ws-real branch was untested, including the `autoConnect: false` pre-login
gate that shipped as a regression; `appHeadRegistry.tsx` sat at 0% inside a
*passing* 98.45% tier.

### 4. Write the tests

Isolate first — this is a repo change, so `./scripts/new-worktree.sh <name>`
before touching a file, per the `shipping-repo-changes` skill. Then write tests,
re-run that package's coverage to prove the number moved, run
`/rtc:gauntlet`, open a PR, poll CI, merge when green, and remove the worktree.

Update the **"Coverage-gap sweep"** entry in `docs/STATUS.md` in the same PR —
that entry is the backlog of record and goes stale the moment you close a gap.

## Reading coverage honestly

The analyzer already encodes these; do not undo them by reasoning past the output.

- **A file can read 0% in one tier and 100% in another.** `appHeadRegistry` was
  0% contract / 100% visual. Files are ranked at their best tier for this reason
  — never chase a gap from a single tier's report.
- **Zero-statement files are not gaps.** Barrels and the ~88 `*.module.css` rows
  report 0% under a v8 `PARSE_ERROR` but carry no statements. Filtered out.
- **The ≥95% CI gate cannot find any of this.** It asserts an *aggregate*, so one
  weak file hides inside a passing tier. That is the whole reason this command
  exists; a green gate is not evidence of coverage.
- **`__testUtils__` and similar** are often better excluded from the denominator
  than tested. If a "gap" is test scaffolding, say so instead of writing a test
  for it.
- Coverage is a **floor, not a goal**. Do not write assertions whose only purpose
  is to execute a line. If a gap does not correspond to behaviour worth pinning,
  recommend excluding it and move on.
