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
