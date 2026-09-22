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
#   ./scripts/new-worktree.sh <name> [--ready]
#
# Creates .claude/worktrees/<name> on branch worktree-<name>.
#
# A fresh worktree has NO node_modules and NO dist, so nothing in it can run a
# test until `pnpm install` (+ a build, for anything that resolves a workspace
# package through its dist) has run there. That state is silent: commands don't
# say "this tree was never installed", they fail to resolve `@rtc/domain`, which
# reads like a broken change. It cost ~500k tokens of subagent workarounds in
# slice 5 of the pluggable-core workstream (two implementers that could not run
# a single test and handed back hand-traced results). So this script always says
# which it is, and `--ready` installs and builds before handing the tree over.
set -euo pipefail

ready=0
args=()
for arg in "$@"; do
  case "$arg" in
    --ready) ready=1 ;;
    *) args+=("$arg") ;;
  esac
done
set -- "${args[@]+"${args[@]}"}"

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "usage: ./scripts/new-worktree.sh <name> [--ready]" >&2
  echo "  e.g. ./scripts/new-worktree.sh rates-filter-fix" >&2
  echo "  --ready: run pnpm install + pnpm build in the new worktree" >&2
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

if [ "$ready" -eq 1 ]; then
  echo
  echo "--ready: installing and building in $path"
  (cd "$path" && pnpm install && pnpm build)
fi

echo
if [ -d "${path}/node_modules" ]; then
  echo "state:    READY — dependencies installed"
else
  cat <<EOF
state:    NOT READY — no node_modules in this worktree.

  Nothing here can run a test yet. Before editing (and ALWAYS before handing
  this tree to a subagent), run:

      cd "$path" && pnpm install && pnpm build

  then prove it with one real test, e.g.
      pnpm --filter @rtc/domain test
EOF
fi
