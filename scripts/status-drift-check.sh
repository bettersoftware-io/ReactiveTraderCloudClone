#!/usr/bin/env bash
# Stop-hook drift nudge: if a NEW plan file was added in the working tree but
# the cross-workstream backlog (docs/STATUS.md) was not touched, remind that
# the backlog may need updating. Only NEW plan files (staged or untracked)
# trigger this — in-place edits to existing plans (e.g. ticking `- [ ]`
# checkboxes during execution) are intentionally ignored. Advisory only —
# always exits 0, never blocks.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$repo_root"

plans_added="$(git status --porcelain -- docs/superpowers/plans/ 2>/dev/null | grep -E '^(A|\?\?)' || true)"
if [ -n "$plans_added" ]; then
  status_changed="$(git status --porcelain -- docs/STATUS.md 2>/dev/null || true)"
  if [ -z "$status_changed" ]; then
    echo "⚠️  A new plan was added but docs/STATUS.md was not — the pending-work backlog may need a new entry (see the tracking-workstream-status skill)."
  fi
fi
exit 0
