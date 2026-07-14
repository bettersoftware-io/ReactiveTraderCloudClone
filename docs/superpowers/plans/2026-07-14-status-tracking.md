# Cross-Workstream Status Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level `docs/STATUS.md` pending-work backlog, a project skill that keeps it current, and a Stop-hook that nudges when a plan changes without the page.

**Architecture:** Three decoupled artifacts — a Markdown data page (`docs/STATUS.md`), a single-file project skill (`.claude/skills/tracking-workstream-status/SKILL.md`) documenting when/how to edit the page, and a zero-dep POSIX-shell drift detector (`scripts/status-drift-check.sh`) wired as a `Stop` hook in `.claude/settings.json`. No runtime code, no new dependencies.

**Tech Stack:** Markdown, POSIX shell + `git`, Claude Code project skills + `settings.json` hooks.

## Global Constraints

- Land via git worktree + one PR; merge commit only (`shipping-repo-changes` skill). Worktree `worktree-status-tracking` already exists and this plan is being authored inside it.
- Page is **pending-only**: finished work is *removed*, never moved to a "done" section.
- Zero new runtime dependencies; drift script is POSIX shell + `git` only.
- The Stop hook is **non-blocking**: always `exit 0`, advisory output only.
- All relative Markdown links must pass `pnpm check:doc-links` — only link to files that exist on this branch. Do **not** link the Jarvis/devtools-extension items to files that live only on unmerged branches.
- Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BA8wYATxQGYbA7qYH89JwM
  ```

---

## File Structure

- Create `docs/STATUS.md` — the pending-work backlog (data).
- Create `.claude/skills/tracking-workstream-status/SKILL.md` — the update rulebook.
- Create `scripts/status-drift-check.sh` — plan-vs-page drift detector.
- Modify `.claude/settings.json` — add a `hooks.Stop` entry running the script.

---

## Task 1: The pending-work page (`docs/STATUS.md`)

**Files:**
- Create: `docs/STATUS.md`

**Interfaces:**
- Consumes: existing plan/spec files under `docs/superpowers/{plans,specs}/`.
- Produces: the path `docs/STATUS.md` and its section headings (`## 🟡 In progress`, `## 🔴 Designed, not built`, `## 🟠 Planned but gated / not executed`, `## ⚪ Optional / next step`) that Task 2's skill references and Task 3's script watches.

- [ ] **Step 1: Verify the seed plan-file paths exist (so doc-links stays green)**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
for f in \
  docs/superpowers/plans/2026-07-12-solidjs-port.md \
  docs/superpowers/specs/2026-07-12-jarvis-ai-assistant-design.md \
  docs/superpowers/plans/2026-07-12-phase1-login-and-server-auth.md \
  docs/superpowers/plans/2026-07-01-feature-flags.md \
  docs/superpowers/plans/2026-07-09-power-saver-mode.md \
  docs/superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md \
  docs/superpowers/plans/2026-07-10-atomic-testid-renames.md ; do
  test -f "$f" && echo "OK  $f" || echo "MISSING  $f"
done
```
Expected: seven `OK` lines. If any is `MISSING`, correct that item's path in Step 2 (or drop its link) before continuing — a broken relative link fails `check:doc-links`.

- [ ] **Step 2: Create `docs/STATUS.md`**

```markdown
# Project Status — Pending Work

> Cross-workstream backlog: what's **not** done yet across the whole repo.
> Finished work is **not** listed here — it's removed as it lands. For history
> see git log; for the clean-architecture phase log see
> [superpowers/STATUS.md](superpowers/STATUS.md).
>
> Maintained via the `tracking-workstream-status` skill. **Last updated: 2026-07-14**

## 🟡 In progress

- **SolidJS port** — Phase 3 remaining (credit / equities / admin). Plan: [superpowers/plans/2026-07-12-solidjs-port.md](superpowers/plans/2026-07-12-solidjs-port.md)

## 🔴 Designed, not built (plan/spec merged, no implementation)

- **Jarvis AI assistant** — impl deferred. Spec: [superpowers/specs/2026-07-12-jarvis-ai-assistant-design.md](superpowers/specs/2026-07-12-jarvis-ai-assistant-design.md) (no plan file yet)
- **Login + server-side auth (Phase 1)** — not built; Phase 2 not yet spec'd. Plan: [superpowers/plans/2026-07-12-phase1-login-and-server-auth.md](superpowers/plans/2026-07-12-phase1-login-and-server-auth.md)
- **Feature flags** — OpenFeature + Flagsmith. Plan: [superpowers/plans/2026-07-01-feature-flags.md](superpowers/plans/2026-07-01-feature-flags.md)
- **Power-saver mode** — Plan: [superpowers/plans/2026-07-09-power-saver-mode.md](superpowers/plans/2026-07-09-power-saver-mode.md)

## 🟠 Planned but gated / not executed

- **RN visual snapshot testing / Maestro e2e** — gate (v3 design rehaul) now lifted. Plan: [superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md](superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md)
- **Atomic test-ID renames** — plan written, never executed. Plan: [superpowers/plans/2026-07-10-atomic-testid-renames.md](superpowers/plans/2026-07-10-atomic-testid-renames.md)

## ⚪ Optional / next step (no plan file yet)

- **Devtools MV3 Chrome extension** — second BroadcastChannel/Duplex transport for the custom devtools; design drafted on an unmerged branch, no plan yet.
```

- [ ] **Step 3: Verify doc-links pass**

Run: `cd "$(git rev-parse --show-toplevel)" && pnpm check:doc-links`
Expected: exits 0, no broken-link errors mentioning `docs/STATUS.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): add cross-workstream pending-work backlog

$(printf 'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01BA8wYATxQGYbA7qYH89JwM')"
```

---

## Task 2: The maintenance skill (`SKILL.md`)

**Files:**
- Create: `.claude/skills/tracking-workstream-status/SKILL.md`

**Interfaces:**
- Consumes: `docs/STATUS.md` and its four section headings from Task 1.
- Produces: a skill named `tracking-workstream-status` discoverable by Claude Code.

- [ ] **Step 1: Create the skill file**

```markdown
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
```

- [ ] **Step 2: Verify frontmatter parses**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
head -4 .claude/skills/tracking-workstream-status/SKILL.md
```
Expected: a `---` fenced block with `name:` and `description:` keys; the description names all three triggers (new plan, merge/complete, "what's pending").

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/tracking-workstream-status/SKILL.md
git commit -m "feat(skill): tracking-workstream-status to maintain docs/STATUS.md

$(printf 'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01BA8wYATxQGYbA7qYH89JwM')"
```

---

## Task 3: The drift-detection script (`status-drift-check.sh`)

**Files:**
- Create: `scripts/status-drift-check.sh`

**Interfaces:**
- Consumes: `git` working-tree state; the paths `docs/superpowers/plans/` and `docs/STATUS.md`.
- Produces: an executable `scripts/status-drift-check.sh` that prints a one-line reminder to stdout and exits 0 when plans changed but `docs/STATUS.md` did not; silent + exit 0 otherwise. Task 4 wires it as a Stop hook.

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
# Stop-hook drift nudge: if plan files changed in the working tree but the
# cross-workstream backlog (docs/STATUS.md) did not, remind that the backlog
# may need updating. Advisory only — always exits 0, never blocks.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$repo_root"

plans_changed="$(git status --porcelain -- docs/superpowers/plans/ 2>/dev/null || true)"
if [ -n "$plans_changed" ]; then
  status_changed="$(git status --porcelain -- docs/STATUS.md 2>/dev/null || true)"
  if [ -z "$status_changed" ]; then
    echo "⚠️  Plan files changed but docs/STATUS.md was not — the pending-work backlog may need updating (see the tracking-workstream-status skill)."
  fi
fi
exit 0
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/status-drift-check.sh`

- [ ] **Step 3: Commit the page + skill first so the working tree is clean** (they were committed in Tasks 1–2; confirm)

Run: `cd "$(git rev-parse --show-toplevel)" && git status --porcelain -- docs/STATUS.md`
Expected: empty output (STATUS.md is committed and clean — required so the next test isn't masked by our own STATUS.md edit).

- [ ] **Step 4: Test state B — plan changed, page untouched → reminder**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
printf '\n' >> docs/superpowers/plans/2026-07-01-feature-flags.md   # throwaway edit
bash scripts/status-drift-check.sh
```
Expected: prints the `⚠️  Plan files changed but docs/STATUS.md was not …` line.

- [ ] **Step 5: Test state C — plan changed AND page changed → silent**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
printf '\n' >> docs/STATUS.md
bash scripts/status-drift-check.sh; echo "exit=$?"
```
Expected: no reminder line; `exit=0`.

- [ ] **Step 6: Revert the throwaway edits and test state A — clean → silent**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
git checkout -- docs/superpowers/plans/2026-07-01-feature-flags.md docs/STATUS.md
bash scripts/status-drift-check.sh; echo "exit=$?"
```
Expected: no output before `exit=0`; `git status` shows no lingering edits to those two files.

- [ ] **Step 7: Commit**

```bash
git add scripts/status-drift-check.sh
git commit -m "feat(scripts): status-drift-check.sh plan-vs-backlog nudge

$(printf 'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01BA8wYATxQGYbA7qYH89JwM')"
```

---

## Task 4: Wire the Stop hook (`.claude/settings.json`)

**Files:**
- Modify: `.claude/settings.json`

**Interfaces:**
- Consumes: `scripts/status-drift-check.sh` from Task 3.
- Produces: a `hooks.Stop` entry that runs the script at session-stop.

- [ ] **Step 1: Add the `hooks` block** — merge a `Stop` hook alongside the existing `permissions` key. The full file becomes:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm test)",
      "Bash(pnpm test:e2e)",
      "Bash(pnpm typecheck)",
      "Bash(pnpm build)",
      "Bash(pnpm clean)",
      "Bash(pnpm -w test)",
      "Bash(pnpm -w typecheck)",
      "Bash(pnpm --filter @rtc/tests test:e2e)",
      "Bash(pnpm --filter @rtc/tests typecheck)",
      "Bash(pnpm --filter @rtc/client-react test)",
      "Bash(pnpm --filter @rtc/client-react test:e2e)",
      "Bash(pnpm --filter @rtc/client-react typecheck)"
    ]
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash scripts/status-drift-check.sh"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify the JSON parses**

Run: `cd "$(git rev-parse --show-toplevel)" && node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('valid json')"`
Expected: prints `valid json`.

- [ ] **Step 3: Verify the hook command resolves**

Run: `cd "$(git rev-parse --show-toplevel)" && test -x scripts/status-drift-check.sh && echo "script executable"`
Expected: prints `script executable`.

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json
git commit -m "chore(hooks): Stop-hook nudge when plans drift from docs/STATUS.md

$(printf 'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01BA8wYATxQGYbA7qYH89JwM')"
```

---

## Task 5: Pre-PR local gauntlet

**Files:** none (verification only).

- [ ] **Step 1: Doc-link check**

Run: `cd "$(git rev-parse --show-toplevel)" && pnpm check:doc-links`
Expected: exit 0.

- [ ] **Step 2: Biome check on the changed non-source files**

Run: `cd "$(git rev-parse --show-toplevel)" && pnpm biome check docs/STATUS.md .claude/settings.json 2>&1 | tail -20`
Expected: no errors (warnings acceptable). If Biome reformats `.claude/settings.json`, accept its formatting, re-commit with `git add .claude/settings.json && git commit --amend --no-edit`, and re-run.

- [ ] **Step 3: Confirm the working tree is clean**

Run: `cd "$(git rev-parse --show-toplevel)" && git status --porcelain`
Expected: empty — every change is committed. Then hand off to the `shipping-repo-changes` PR/CI/merge loop.

---

## Self-Review

- **Spec coverage:** page (Task 1) ✓; skill with 3 triggers + remove-on-complete semantics (Task 2) ✓; drift script with 3-state verification (Task 3) ✓; Stop hook non-blocking (Task 4) ✓; CI/doc-link green (Tasks 1.3, 5) ✓; worktree+PR rollout (Global Constraints + Task 5.3) ✓.
- **Placeholder scan:** no TBD/TODO; all file contents shown in full.
- **Type/name consistency:** section headings in Task 1's `docs/STATUS.md` match those referenced by Task 2's skill and watched by Task 3's script; the script path `scripts/status-drift-check.sh` is identical in Tasks 3 and 4; `docs/STATUS.md` and `docs/superpowers/plans/` paths are identical across the script, skill, and page.
```
