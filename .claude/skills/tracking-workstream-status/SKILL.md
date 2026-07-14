---
name: tracking-workstream-status
description: Use when a plan or design spec is created under docs/superpowers/, when a workstream merges to main or is completed, or when asked "what's pending / remaining / left to do" — keep docs/STATUS.md (the cross-workstream pending-work backlog) current.
---

# Tracking Workstream Status

## Overview

`docs/STATUS.md` is the repo's single answer to "what's still pending?". It is a
**pending-only backlog** — finished work is *removed*, not archived. This skill
is the rulebook for keeping it accurate. It is the authoritative, teammate-visible
status surface; the per-user Claude memory index is a convenience, not a substitute.

Sibling surfaces, do **not** duplicate them here:
- `docs/superpowers/STATUS.md` — clean-architecture phase log (all done).
- Individual plans under `docs/superpowers/plans/` — the detail per workstream.

## The four sections

`docs/STATUS.md` groups items by state. Keep these exact headings:

- `## 🟡 In progress` — plan partially executed.
- `## 🔴 Designed, not built (plan/spec merged, no implementation)`
- `## 🟠 Planned but gated / not executed`
- `## ⚪ Optional / next step (no plan file yet)`

## Entry format

One bullet per workstream: **bold name** — short "what's left" note — a relative
link to the plan (or spec, if no plan yet). Example:

    - **SolidJS port** — Phase 3 remaining (credit / equities / admin). Plan: [superpowers/plans/2026-07-12-solidjs-port.md](superpowers/plans/2026-07-12-solidjs-port.md)

Only link files that exist on `main` — a link to a file that lives on an unmerged
branch breaks `pnpm check:doc-links`. If there's no committed file yet, describe
it without a link (see the ⚪ section).

## When to edit

1. **A new plan/spec is written** under `docs/superpowers/` → add an entry.
   Default section `🔴 Designed, not built`; use `🟡 In progress` if
   implementation starts in the same stroke.
2. **A workstream completes / its PR merges to `main`** → **delete** its entry.
   There is no "done" section — the page shrinks.
3. **Status changes** (designed → in progress, or a gate lifts) → move the entry
   to the right section and update its "what's left" note.
4. **Asked "what's pending"** → read the page; if it's stale versus reality,
   reconcile it as part of answering.

## Every edit

- Bump the `**Last updated: YYYY-MM-DD**` line in the header to today.
- Run `pnpm check:doc-links` before committing — links must resolve.
- Ship the edit under the `shipping-repo-changes` rules (worktree + PR).
