#!/usr/bin/env bash
# Downloads a pinned actionlint binary into ./.tooling (gitignored).
# Official method: https://github.com/rhysd/actionlint/blob/main/docs/install.md
set -euo pipefail
VERSION="1.7.7"
DEST="$(cd "$(dirname "$0")/.." && pwd)/.tooling"
mkdir -p "$DEST"
if [ -x "$DEST/actionlint" ] && "$DEST/actionlint" --version | grep -q "$VERSION"; then
  exit 0
fi
curl -fsSL "https://raw.githubusercontent.com/rhysd/actionlint/v${VERSION}/scripts/download-actionlint.bash" \
  | bash -s -- "$VERSION" "$DEST"
