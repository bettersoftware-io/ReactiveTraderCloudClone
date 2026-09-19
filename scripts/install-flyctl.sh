#!/usr/bin/env bash
# Installs a pinned, CHECKSUM-VERIFIED flyctl — the replacement for deploy.yml's
# `curl -L https://fly.io/install.sh | sh`, which executed whatever that URL
# served, unverified, in the job that holds FLY_API_TOKEN.
#
#   scripts/install-flyctl.sh [home-dir]      # default: $RUNNER_TEMP/rtc-flyctl
#
# THE TRADE-OFF, stated plainly: a pinned CLI can rot. Fly's API eventually
# refuses old flyctl versions, so a deploy may one day fail with "please update
# flyctl". That failure is loud and the fix is this file; the alternative was a
# deploy path that silently runs a new, unreviewed binary every time.
# BUMPING: change VERSION and all four digests together, from
#   gh api repos/superfly/flyctl/releases/tags/v<VERSION> \
#     --jq '.assets[] | "\(.name) \(.digest)"'
# Pick a release older than the repo's 24h cooldown. (Renovate does not manage
# this pin.) See docs/adr/ADR-007-ci-security-tooling.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/fetch-verified.sh
source "$ROOT/scripts/lib/fetch-verified.sh"
VERSION="0.4.104"
HOME_DIR="${1:-${RUNNER_TEMP:?pass a home dir, or run under GitHub Actions}/rtc-flyctl}"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    TARGET="Linux_x86_64"
    SHA256="4023d2a4f5e76198197f80bde74271184b200b9034bb16d799acba373714bfbc"
    ;;
  Linux-aarch64 | Linux-arm64)
    TARGET="Linux_arm64"
    SHA256="245d48c4e48b11c4b75e8a860afddb6f7ceabaf8975eea1b113ccff69a9e92c7"
    ;;
  Darwin-arm64)
    TARGET="macOS_arm64"
    SHA256="dc8c3c46027e375173afa5ebdcc384a1994f24a247231604603d0019a8bfc123"
    ;;
  Darwin-x86_64)
    TARGET="macOS_x86_64"
    SHA256="776655df707bd4c4d599fcb822a7c21c2634240cb68d2bdd9ab5b5dc6aa927ed"
    ;;
  *)
    echo "install-flyctl: unsupported platform $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

ARCHIVE="$(mktemp)"
trap 'rm -f "$ARCHIVE"' EXIT
fetch_verified \
  "https://github.com/superfly/flyctl/releases/download/v${VERSION}/flyctl_${VERSION}_${TARGET}.tar.gz" \
  "$SHA256" "$ARCHIVE"

mkdir -p "$HOME_DIR/bin"
tar -xzf "$ARCHIVE" -C "$HOME_DIR/bin" flyctl
chmod +x "$HOME_DIR/bin/flyctl"
"$HOME_DIR/bin/flyctl" version

if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$HOME_DIR/bin" >>"$GITHUB_PATH"
fi
