---
description: Write the week's entry in CHANGELOG.md from the PRs merged that week, then ship it as a PR
argument-hint: [ISO week, e.g. 2026-W41 — default: every week not yet in the file]
allowed-tools: Bash(git:*), Bash(gh:*), Bash(grep:*), Bash(sort:*), Bash(comm:*), Bash(pnpm:*), Read, Write, Edit
---

Bring `CHANGELOG.md` up to date. Requested week: `$ARGUMENTS` (empty = every
ISO week after the newest one in the file, up to and including the current
one).

This command has no pre-executed shell blocks on purpose — see the "Authoring
trap" section of `CLAUDE.md`. Run each step yourself.

## 1. Find the gap

Read the top of `CHANGELOG.md`: its intro states the format, and the first
`## 2026-Wnn` heading is the newest week on file. A week runs Monday–Sunday,
and a PR belongs to the week of its **merge time in UTC**.

If the newest week on file is the current week, it is a partial entry: extend
it in place rather than adding a second heading.

## 2. List what merged

```bash
gh pr list --state merged --search "merged:YYYY-MM-DD..YYYY-MM-DD" --limit 500 \
  --json number,title,mergedAt \
  --jq 'sort_by(.mergedAt) | .[] | "\(.mergedAt[0:10])\t#\(.number)\t\(.title)"'
```

Titles in this repo usually carry the what and the why. Where one does not —
or where a PR records a decision — read its body (`gh pr view <n> --json body`)
before summarising it. Never describe a PR from its title alone when the title
is ambiguous.

## 3. Write the week

Match the existing weeks exactly:

- Heading `## 2026-Wnn — D Mon – D Mon`, newest week first.
- A two-to-four-line summary of what the week was *about*.
- `### Added`, `### Changed`, `### Fixed` — what a user of the app or a
  developer of the repo would notice. Group related PRs into one bullet with a
  bold lead; do not write one bullet per PR.
- `### Decisions` — choices worth remembering, each pointing at the ADR, spec
  or doc that holds the reasoning. A revert, a parked spike and a "we chose not
  to" all belong here.
- `### Under the hood` — tests, gates, tooling, docs, dependency bumps.
  Renovate PRs collapse into one line.
- Cite PRs as `[#123]`. Plain language; no session jargon, no plan-internal
  labels a reader six months on could not decode.

Omit a section that would be empty.

## 4. Add the link definitions

Each cited PR needs a definition in the block at the bottom of the file, kept
in ascending order:

```
[#123]: https://github.com/bettersoftware-io/ReactiveTraderCloudClone/pull/123
```

## 5. Prove completeness

Every merged PR in the range must be cited, and every citation must have a
definition. Compare the number list from step 2 against
`grep -o '\[#[0-9]*\]' CHANGELOG.md | sort -u`; both differences must be
empty. Then run `pnpm check:doc-links`.

## 6. Ship

Follow the `shipping-repo-changes` skill: worktree off `origin/main`, one PR
titled `docs(changelog): 2026-Wnn`, merge commit once CI is green.
