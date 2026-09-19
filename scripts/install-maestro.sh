#!/usr/bin/env bash
# Installs a pinned, CHECKSUM-VERIFIED Maestro CLI into ~/.maestro — the
# replacement for ios-visual-spike.yml's `curl -fsSL https://get.maestro.mobile.dev
# | bash`, which executed an unverified script that then fetched whatever the
# LATEST release was. Same end state as that installer (it unzips maestro.zip and
# copies maestro/* into ~/.maestro), so callers keep using ~/.maestro/bin.
#
# Pinning fixes a reliability problem too: the spike's measurements are only
# comparable run-to-run if the tool under measurement does not float.
# maestro.zip is one platform-independent archive (a JVM app), hence one digest.
# BUMPING: change VERSION and SHA256 together, from
#   gh api repos/mobile-dev-inc/maestro/releases/tags/cli-<VERSION> \
#     --jq '.assets[] | "\(.name) \(.digest)"'
# (Renovate does not manage this pin.) See docs/adr/ADR-007-ci-security-tooling.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/fetch-verified.sh
source "$ROOT/scripts/lib/fetch-verified.sh"
VERSION="2.10.0"
SHA256="29b675e10cc12080e445e9bfb2e2b4e4dfb9c0f2e30d5884120d258b5e1cd991"
MAESTRO_DIR="${MAESTRO_DIR:-$HOME/.maestro}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fetch_verified \
  "https://github.com/mobile-dev-inc/maestro/releases/download/cli-${VERSION}/maestro.zip" \
  "$SHA256" "$WORK/maestro.zip"

unzip -qo "$WORK/maestro.zip" -d "$WORK"
mkdir -p "$MAESTRO_DIR"
cp -rf "$WORK"/maestro/* "$MAESTRO_DIR"
chmod +x "$MAESTRO_DIR/bin/maestro"
