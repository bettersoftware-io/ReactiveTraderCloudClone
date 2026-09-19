#!/usr/bin/env bash
# Downloads a pinned, CHECKSUM-VERIFIED zizmor binary into ./.tooling (gitignored).
#
# zizmor is the security linter for .github/ (template injection, credential
# persistence, excessive permissions, unpinned actions…) — actionlint's sibling:
# actionlint asks "is this workflow VALID?", zizmor asks "is it SAFE?".
# See docs/adr/ADR-007-ci-security-tooling.md.
#
# Unlike install-actionlint.sh this verifies a sha256 per platform: a security
# gate that pipes an unverified binary into CI would be its own finding. The
# digests below are the release assets' own `digest` field —
#   gh api repos/zizmorcore/zizmor/releases/tags/v<VERSION> \
#     --jq '.assets[] | "\(.name) \(.digest)"'
# BUMPING: change VERSION and all four digests together, from that command.
# (Renovate does not manage this pin — same as actionlint's.)
set -euo pipefail
VERSION="1.30.1"
DEST="$(cd "$(dirname "$0")/.." && pwd)/.tooling"
mkdir -p "$DEST"
if [ -x "$DEST/zizmor" ] && "$DEST/zizmor" --version | grep -q "$VERSION"; then
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    TARGET="x86_64-unknown-linux-gnu"
    SHA256="e65324f4430c2717591937edcec90ccbefaf14c174f8ec9415e03ca875b46e1a"
    ;;
  Linux-aarch64 | Linux-arm64)
    TARGET="aarch64-unknown-linux-gnu"
    SHA256="7ff1dce33bdd18fd2a4affe63bdd47efcccca97b2cec1c1863ec26e9e2647540"
    ;;
  Darwin-arm64)
    TARGET="aarch64-apple-darwin"
    SHA256="e28d22b087f9ebb8d99da6e740d348c930f559961c7c3f12badda54f882195a2"
    ;;
  Darwin-x86_64)
    TARGET="x86_64-apple-darwin"
    SHA256="10e6b18b11ea07e515a16f0f0518c7b07527bc9977c1fd5698181ce7f3554202"
    ;;
  *)
    echo "install-zizmor: unsupported platform $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

ARCHIVE="$(mktemp)"
trap 'rm -f "$ARCHIVE"' EXIT
curl -fsSL -o "$ARCHIVE" \
  "https://github.com/zizmorcore/zizmor/releases/download/v${VERSION}/zizmor-${TARGET}.tar.gz"

# shasum ships on macOS and on GitHub's ubuntu runners; sha256sum is the
# fallback for slim Linux containers (the claude-sandbox image).
if command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "$ARCHIVE" | cut -d' ' -f1)"
else
  ACTUAL="$(sha256sum "$ARCHIVE" | cut -d' ' -f1)"
fi
if [ "$ACTUAL" != "$SHA256" ]; then
  echo "install-zizmor: checksum mismatch for zizmor-${TARGET} v${VERSION}" >&2
  echo "  expected $SHA256" >&2
  echo "  actual   $ACTUAL" >&2
  exit 1
fi

tar -xzf "$ARCHIVE" -C "$DEST" zizmor
chmod +x "$DEST/zizmor"
