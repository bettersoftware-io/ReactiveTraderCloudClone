#!/usr/bin/env bash
# Creates an isolated worktree branched off the LATEST origin/main.
#
# Rule 1 of the shipping-repo-changes skill requires every change to start in a
# worktree cut from an up-to-date origin/main. Bare `git worktree add -b <br>`
# branches off the current HEAD instead, so it inherits however stale the local
# main happens to be — and local main is stale by default here, because main
# auto-pushes and concurrent sessions land commits continuously. A stale base
# doesn't fail loudly; it just inflates the Rule 3 catch-up triage later.
#
# This script removes the choice: it fetches, then branches explicitly off
# origin/main, so the base is fresh whether or not local main was.
#
#   ./scripts/new-worktree.sh <name>
#
# Creates .claude/worktrees/<name> on branch worktree-<name>.
set -euo pipefail

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "usage: ./scripts/new-worktree.sh <name>" >&2
  echo "  e.g. ./scripts/new-worktree.sh rates-filter-fix" >&2
  exit 1
fi

name="$1"
branch="worktree-${name}"

# Resolve the MAIN checkout, not the current one — this script must behave the
# same whether it's invoked from the primary tree or from inside a worktree.
main_root="$(git worktree list --porcelain | head -1 | cut -d' ' -f2-)"
path="${main_root}/.claude/worktrees/${name}"

if [ -e "$path" ]; then
  echo "error: $path already exists" >&2
  exit 1
fi

if git show-ref --quiet --verify "refs/heads/${branch}"; then
  echo "error: branch ${branch} already exists" >&2
  exit 1
fi

git fetch origin main
git worktree add "$path" -b "$branch" origin/main

echo
echo "worktree: $path"
echo "branch:   $branch"
echo "base:     $(git -C "$path" log -1 --format='%h %s')"
