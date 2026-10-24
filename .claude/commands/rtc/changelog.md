---
description: Write the week's entry in CHANGELOG.md from the PRs merged that week, then ship it as a PR
argument-hint: [ISO week, e.g. 2026-W41 — default: every week not yet in the file]
allowed-tools: Bash(git:*), Bash(gh:*), Bash(node:*), Bash(grep:*), Bash(sort:*), Bash(comm:*), Bash(pnpm:*), Read, Write, Edit
---

Bring `CHANGELOG.md` up to date. Requested week: `$ARGUMENTS` (empty = every
ISO week after the newest one in the file, up to and including the current
one).

This command has no pre-executed shell blocks on purpose — see the "Authoring
trap" in the `authoring-slash-commands` skill. Run each step yourself.

## 1. Find the gap

Read the top of `CHANGELOG.md`: its intro states the format. A week runs
Monday–Sunday, and a PR belongs to the week of its **merge time in UTC**.

Then ask the checker what is outstanding — do not infer it from the newest
heading:

```bash
node scripts/changelog/check-changelog.mts --repo bettersoftware-io/ReactiveTraderCloudClone
```

It prints one line per week that needs work:

- `unwritten` — a finished week with merged PRs and no section: write it.
- `leaves out N PR(s)` — a section written before its week ended (2026-W40
  was written on its Sunday afternoon and missed 30 PRs). Extend that section
  in place; the newest heading being "done" is exactly how this hides.
- `partial` — the current week. Writing it now is allowed, but it will be
  reported as `leaves out` once the week ends, until someone extends it.
- `cites #N, which merged in …` / `definitions: …` — a wrong statement; fix it.

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

Run the checker from step 1 again. It must report **0 errors**, and the
weeks you wrote must no longer be listed: every week cites exactly the PRs
merged in it (no fewer, and none from another week), and the `[#n]` /
``[`sha`]`` definitions match the citations one to one, PRs in ascending
order. Then run `pnpm check:doc-links`. The `Changelog check` workflow runs
the same checker on the PR.

## 6. Ship

Follow the `shipping-repo-changes` skill: worktree off `origin/main`, one PR
titled `docs(changelog): 2026-Wnn`, merge commit once CI is green.

The `Weekly tag` workflow opens an issue titled `Changelog: write 2026-Wnn`
when it tags a finished week. If one is open for the week you wrote
(`gh issue list --search "in:title Changelog: write"`), put `Closes #<n>` in
the PR body.

Merging publishes the week as a GitHub Release by itself: `sync-releases.yml`
regenerates the notes from the section on every change to this file (and
waits for the week's tag if it does not exist yet). Never edit a release by
hand — the next sync overwrites it.

Do not create or move a week tag here: `weekly-tag.yml` owns them, and tags
the last commit on `main` before Monday 00:00 UTC — which is by design
*earlier* than the PR that writes the week up.
