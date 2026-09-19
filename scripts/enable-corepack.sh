#!/usr/bin/env bash
# Provisions Corepack from a LOCKFILE, then enables it — the replacement for the
# ad-hoc `npm install -g corepack@<v> && corepack enable` that every workflow and
# the server Dockerfile used to run.
#
#   scripts/enable-corepack.sh [home-dir]     # default: $RUNNER_TEMP/rtc-corepack
#
# Why: node ≥ 25 no longer bundles Corepack, so it has to be installed before it
# can provision the pnpm pinned by package.json's `packageManager`. A global
# `npm install` sits outside every lockfile (zizmor `adhoc-packages`, Scorecard
# `PinnedDependencies`). It cannot come from pnpm-lock.yaml — it is what
# provisions pnpm — but npm ships WITH node, so an *npm* lockfile works:
# scripts/ci-tooling/corepack/package-lock.json pins it with a sha512 integrity
# hash, `npm ci` refuses anything else, and Renovate bumps it like any other
# dependency (one manifest, instead of 14 hand-edited version strings).
#
# Installs OUTSIDE the checkout (nothing is written into the repo tree), puts the
# pnpm/yarn shims in <home-dir>/bin, and appends that to $GITHUB_PATH when
# running under GitHub Actions. See docs/adr/ADR-007-ci-security-tooling.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${1:-${RUNNER_TEMP:?pass a home dir, or run under GitHub Actions}/rtc-corepack}"

mkdir -p "$HOME_DIR/pkg" "$HOME_DIR/bin"
cp "$ROOT/scripts/ci-tooling/corepack/package.json" \
  "$ROOT/scripts/ci-tooling/corepack/package-lock.json" "$HOME_DIR/pkg/"
# `cd`, not `npm ci --prefix`: invoked from inside the repo, --prefix mis-resolves
# the project root for some target paths ("Missing: pkg@ from lock file").
(cd "$HOME_DIR/pkg" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null)
"$HOME_DIR/pkg/node_modules/.bin/corepack" enable --install-directory "$HOME_DIR/bin"

if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$HOME_DIR/bin" >>"$GITHUB_PATH"
fi
