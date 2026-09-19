#!/usr/bin/env bash
# Sourced, not executed. One function:
#
#   fetch_verified <url> <sha256> <output-file>
#
# Downloads <url> to <output-file> and fails unless its sha256 matches. Shared by
# every pinned-binary installer in scripts/ (actionlint, zizmor, flyctl, Maestro)
# so "download, then verify, THEN run" is written once — the opposite of the
# `curl … | sh` shape those installers replaced, where the bytes execute before
# anything has looked at them. See docs/adr/ADR-007-ci-security-tooling.md.
fetch_verified() {
  local url="$1" expected="$2" out="$3" actual
  curl -fsSL -o "$out" "$url"
  # shasum ships on macOS and on GitHub's ubuntu/macOS runners; sha256sum is the
  # fallback for slim Linux containers (the claude-sandbox image).
  if command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$out" | cut -d' ' -f1)"
  else
    actual="$(sha256sum "$out" | cut -d' ' -f1)"
  fi
  if [ "$actual" != "$expected" ]; then
    echo "fetch_verified: checksum mismatch for $url" >&2
    echo "  expected $expected" >&2
    echo "  actual   $actual" >&2
    rm -f "$out"
    return 1
  fi
}
