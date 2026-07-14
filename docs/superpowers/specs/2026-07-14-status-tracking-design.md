# Cross-Workstream Status Tracking — Design

**Date:** 2026-07-14
**Status:** approved (brainstorming), pending spec review

## Problem

The repo has ~100 plan files under `docs/superpowers/plans/`, but no single
repo-visible answer to *"what's still pending?"*. The two status surfaces that
exist don't fill the gap:

- `docs/superpowers/STATUS.md` is scoped to the clean-architecture refactor
  (all its phases are ✅) and buried under `superpowers/`.
- The cross-workstream picture currently lives only in a Claude **memory
  index**, which is per-user and invisible to teammates and to any fresh
  session without that memory loaded.

So determining what's left requires reconstructing it from ~100 plans + git log
each time. We want a durable, repo-committed, low-maintenance page — and a
mechanism that keeps it from drifting as work progresses.

## Goals

- A single top-level page that lists **only pending work** (in progress /
  designed-not-built / gated / optional-next), each item linking its plan.
- Kept current with minimal friction: a skill that fires at the moments that
  change status, plus a hook that nudges if a plan changes without the page.
- Zero new runtime dependencies; consistent with existing repo conventions
  (single-file project skills, committed `.claude/settings.json` hooks).

## Non-goals

- Not a record of completed work — git history + `docs/superpowers/STATUS.md`
  already cover "what's done". The page **shrinks** as work lands.
- Not a replacement for individual plan files or the clean-arch STATUS log.
- No automated parsing of plan front-matter or status inference; updates are
  authored, not generated.

## Design

Three small pieces: a page, a skill, and a hook.

### 1. The page — `docs/STATUS.md` (new, top-level)

Pending-only backlog, grouped by state. Each item is one line: **name ·
plan-file link · what's left**. A `Last updated:` line sits under the header.

Section states:

- `🟡 In progress` — plan partially executed.
- `🔴 Designed, not built` — plan/spec merged, no implementation code.
- `🟠 Planned but gated / not executed` — plan exists, execution blocked or
  deferred.
- `⚪ Optional / next step` — identified follow-on, may not have a plan file yet.

The header cross-links to `docs/superpowers/STATUS.md` (clean-arch phase log)
and states explicitly that finished work is *not* listed here.

Seed content (the pending items as of 2026-07-14):

- **🟡 SolidJS port** — Phase 3 (credit / equities / admin);
  `plans/2026-07-12-solidjs-port.md`
- **🔴 Jarvis AI assistant** — design spec `specs/2026-07-12-jarvis-ai-assistant-design.md` (no plan file yet; impl deferred)
- **🔴 Login + server-side auth (Phase 1)** — `plans/2026-07-12-phase1-login-and-server-auth.md`; Phase 2 not yet spec'd
- **🔴 Feature flags** — `plans/2026-07-01-feature-flags.md`
- **🔴 Power-saver mode** — `plans/2026-07-09-power-saver-mode.md`
- **🟠 RN visual snapshot testing** — `plans/2026-07-10-rn-visual-snapshot-testing.md` (gate now lifted)
- **🟠 Atomic test-ID renames** — `plans/2026-07-10-atomic-testid-renames.md`
- **⚪ Devtools MV3 Chrome extension** — design spec drafted, no plan file yet

(Exact plan-file paths are verified against the repo at implementation time.)

### 2. The skill — `.claude/skills/tracking-workstream-status/SKILL.md`

A single `SKILL.md` (same shape as `shipping-repo-changes`). Its **description**
lists the triggers; its **body** is the rulebook for editing the page.

Triggers (description):

- A new plan is written under `docs/superpowers/plans/`.
- A workstream merges to `main` / is completed.
- Someone asks "what's pending / remaining / left to do".

Body rules:

- **New plan** → add a `🔴 Designed` (or `🟡 In progress` if execution starts
  immediately) entry linking the plan.
- **Workstream completes / merges** → *remove* its entry (the page is
  pending-only). Do not move it to a "done" section — there is none.
- **Status change** (designed → in progress, or gate lifts) → move the item
  between sections or update its "what's left" note.
- Always bump the `Last updated:` line to the current date.
- Documents the entry format and the relationship to
  `docs/superpowers/STATUS.md` (clean-arch log) and the memory index (per-user,
  not authoritative for teammates).

### 3. The hook — `.claude/settings.json` Stop hook

A committed `Stop` hook runs `scripts/status-drift-check.sh` (zero-dep POSIX
shell). The script inspects the working tree:

- If files under `docs/superpowers/plans/` are added/modified (`git status
  --porcelain`) **but** `docs/STATUS.md` is unchanged in the same working tree,
  print an advisory reminder to update the page.
- Otherwise print nothing.

Exit code is always `0` — the hook is a **non-blocking nudge**, never a gate, to
avoid noise. It catches the highest-value drift case (a plan was just written
but the page wasn't touched) before the change is committed.

## Components & boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `docs/STATUS.md` | Human-readable pending backlog | nothing (data) |
| `SKILL.md` | Rules for *how/when* to edit the page | the page |
| `status-drift-check.sh` | Detect plan-vs-page drift, nudge | `git`, the page path |
| `.claude/settings.json` Stop hook | Wire the script to session-stop | the script |

Each piece is independently understandable and testable: the script can be run
by hand against a dirty tree; the skill is prose; the page is data.

## Testing / verification

- **Script:** run `scripts/status-drift-check.sh` in three states — (a) clean
  tree → no output; (b) a plan added, page untouched → reminder printed; (c)
  plan added *and* page edited → no output. Verify exit 0 in all three.
- **Hook wiring:** confirm `.claude/settings.json` parses and the Stop hook
  entry references the script by repo-relative path.
- **Skill:** confirm frontmatter `name`/`description` are well-formed and the
  description surfaces the three triggers.
- **CI:** the full repo gauntlet (Biome/ESLint/stylelint, typecheck, tests,
  doc-link check) must stay green — `docs/STATUS.md`'s relative links are
  covered by `pnpm check:doc-links`.

## Risks / mitigations

- **Drift despite the nudge** — the hook only catches *uncommitted* plan
  changes; a plan committed on another branch won't trip it. Mitigation: the
  skill's "workstream merges" trigger + the "what's pending" query trigger are
  the other two catch points. Accepted: the page is best-effort, not enforced.
- **Hook noise** — advisory-only, single line, only when plans actually
  changed. Non-blocking exit 0 keeps it ignorable.
- **Name confusion with `superpowers/STATUS.md`** — mitigated by the header
  cross-link and distinct scoping (top-level = cross-workstream pending;
  buried = clean-arch phase log).

## Rollout

Per `shipping-repo-changes`: implemented on a git worktree branch, one PR
containing spec + plan + implementation, green CI, merge commit, worktree
cleanup.
