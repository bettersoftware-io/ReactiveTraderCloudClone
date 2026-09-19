#!/usr/bin/env bash
# Downloads a pinned, CHECKSUM-VERIFIED actionlint binary into ./.tooling
# (gitignored). Same shape as install-zizmor.sh, its security-lint sibling.
#
# This used to pipe upstream's download-actionlint.bash straight into bash —
# an unverified `curl | bash`, which OpenSSF Scorecard flagged
# (PinnedDependencies) on its first run. It now fetches the release tarball
# directly and checks a sha256 per platform. The digests below are the release
# assets' own `digest` field, cross-checked against the release's
# actionlint_<VERSION>_checksums.txt —
#   gh api repos/rhysd/actionlint/releases/tags/v<VERSION> \
#     --jq '.assets[] | "\(.name) \(.digest)"'
# BUMPING: change VERSION and all four digests together, from that command.
# (Renovate does not manage this pin.) See docs/adr/ADR-007-ci-security-tooling.md.
set -euo pipefail
VERSION="1.7.12"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/fetch-verified.sh
source "$ROOT/scripts/lib/fetch-verified.sh"
DEST="$ROOT/.tooling"
mkdir -p "$DEST"
if [ -x "$DEST/actionlint" ] && "$DEST/actionlint" --version | grep -q "$VERSION"; then
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    TARGET="linux_amd64"
    SHA256="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
    ;;
  Linux-aarch64 | Linux-arm64)
    TARGET="linux_arm64"
    SHA256="325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6"
    ;;
  Darwin-arm64)
    TARGET="darwin_arm64"
    SHA256="aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f"
    ;;
  Darwin-x86_64)
    TARGET="darwin_amd64"
    SHA256="5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644"
    ;;
  *)
    echo "install-actionlint: unsupported platform $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

ARCHIVE="$(mktemp)"
trap 'rm -f "$ARCHIVE"' EXIT
fetch_verified \
  "https://github.com/rhysd/actionlint/releases/download/v${VERSION}/actionlint_${VERSION}_${TARGET}.tar.gz" \
  "$SHA256" "$ARCHIVE"

tar -xzf "$ARCHIVE" -C "$DEST" actionlint
chmod +x "$DEST/actionlint"
