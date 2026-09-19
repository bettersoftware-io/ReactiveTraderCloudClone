#!/usr/bin/env bash
# Installs the Vercel CLI from a LOCKFILE — the replacement for the deploy
# workflows' ad-hoc `npm install -g vercel@57`.
#
#   scripts/install-vercel.sh [home-dir]      # default: $RUNNER_TEMP/rtc-vercel
#
# `vercel@57` pinned the CLI's major but let its ~350-package transitive tree
# re-resolve on every deploy, outside any lockfile and outside the repo's 24h
# release cooldown, in a job that holds VERCEL_TOKEN. Here the whole tree is
# pinned by scripts/ci-tooling/vercel/package-lock.json (sha512 integrity on
# every package); `npm ci` installs exactly that or fails, lifecycle scripts are
# off, and Renovate bumps it behind the cooldown. Regenerate the lockfile with
#   npm install --package-lock-only --ignore-scripts --before=<24h ago>
# so a hand bump honours the cooldown too. See docs/adr/ADR-007.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${1:-${RUNNER_TEMP:?pass a home dir, or run under GitHub Actions}/rtc-vercel}"

mkdir -p "$HOME_DIR"
cp "$ROOT/scripts/ci-tooling/vercel/package.json" \
  "$ROOT/scripts/ci-tooling/vercel/package-lock.json" "$HOME_DIR/"
# `cd`, not `npm ci --prefix` — see the note in enable-corepack.sh.
(cd "$HOME_DIR" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null)
"$HOME_DIR/node_modules/.bin/vercel" --version

if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$HOME_DIR/node_modules/.bin" >>"$GITHUB_PATH"
fi
