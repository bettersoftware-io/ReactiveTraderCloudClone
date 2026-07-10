#!/usr/bin/env bash
# Deploy a standalone Claude Design prototype to the rtc-clone-cd-proto Vercel
# project (https://rtc-clone-cd-proto.vercel.app), behind a shared-password
# Basic-Auth gate.
#
#   ./deploy/cd-proto/deploy.sh [PATH_TO_STANDALONE_HTML]
#
# PATH_TO_STANDALONE_HTML defaults to the v3 standalone. Pass another version's
# path to ship it instead, e.g.:
#   ./deploy/cd-proto/deploy.sh "docs/design/v2/standalone/Reactive Trader.html"
#
# The gate (a tiny Basic-Auth middleware) is GENERATED here at deploy time, not
# committed — so this is the single source of truth for both local runs and the
# Deploy Claude Design Prototype GitHub Action, and the strict monorepo linters
# never see a stray middleware.ts / package.json. The HTML is copied, never
# committed (it is an 835 KB duplicate of the standalone).
#
# Auth/targeting:
#   - Project is selected via VERCEL_ORG_ID + VERCEL_PROJECT_ID (not secrets — a
#     project ID appears in dashboard URLs); defaults below point at the proto.
#   - Locally: relies on `vercel login`. In CI: set VERCEL_TOKEN and it is used.
#   - The password (SITE_PASSWORD) is an env var ON the Vercel project, set once
#     in the dashboard and reused every deploy — it never passes through here.
set -euo pipefail

: "${VERCEL_ORG_ID:=team_Nm5Q36b0kTItH0gXCGG6fGUp}"
: "${VERCEL_PROJECT_ID:=prj_VxG4x6dsstNbG3cEnhrZjZZM2Ayl}"
export VERCEL_ORG_ID VERCEL_PROJECT_ID

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
SRC="${1:-docs/design/v3/standalone/Reactive Trader.html}"
case "$SRC" in
  /*) ABS="$SRC" ;;
  *)  ABS="$REPO_ROOT/$SRC" ;;
esac

if [ ! -f "$ABS" ]; then
  echo "error: prototype HTML not found at: $SRC" >&2
  exit 1
fi

# Assemble the deployment in a throwaway dir: generated gate + copied HTML.
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

cat > "$BUILD/middleware.ts" <<'EOF'
import { next } from "@vercel/edge";

export const config = { matcher: "/(.*)" };

/**
 * Single shared-password gate via HTTP Basic Auth. FAIL-CLOSED: if SITE_PASSWORD
 * is unset the request is denied (401) rather than allowed through — for a
 * preview, "accidentally public" is worse than "accidentally locked out". The
 * username is ignored; only the password (SITE_PASSWORD) is checked.
 */
export default function middleware(request: Request): Response {
  const expected = process.env.SITE_PASSWORD;
  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");

  if (expected && scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const password = decoded.slice(decoded.indexOf(":") + 1);
      if (password === expected) return next();
    } catch {
      // malformed base64 → fall through to 401
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RTC Prototype"' },
  });
}
EOF

cat > "$BUILD/package.json" <<'EOF'
{
  "name": "rtc-clone-cd-proto",
  "private": true,
  "version": "0.0.0",
  "dependencies": { "@vercel/edge": "^1.3.1" }
}
EOF

# framework:null → static serve of index.html, no build step.
printf '{ "framework": null }\n' > "$BUILD/vercel.json"

echo "Staging '$SRC' ($(wc -c < "$ABS" | tr -d ' ') bytes) as index.html"
cp "$ABS" "$BUILD/index.html"

TOKEN_ARG=()
[ -n "${VERCEL_TOKEN:-}" ] && TOKEN_ARG=(--token "$VERCEL_TOKEN")

echo "Deploying to rtc-clone-cd-proto (production)…"
URL="$(cd "$BUILD" && vercel deploy --prod --yes "${TOKEN_ARG[@]}")"
echo "Deployed: $URL"

# Smoke the canonical alias (what users hit), NOT the per-deployment URL that
# `vercel deploy` prints: Vercel Deployment Protection guards generated
# *.vercel.app deployment URLs with a 302 (redirect to Vercel login) but exempts
# the project alias, so only the alias reaches our SITE_PASSWORD gate → 401.
ALIAS="https://rtc-clone-cd-proto.vercel.app"
echo "Smoke — unauthenticated request to $ALIAS must be gated (401)…"
CODE=""
for attempt in 1 2 3 4 5; do
  CODE="$(curl -s -o /dev/null -w "%{http_code}" "$ALIAS")"
  [ "$CODE" = "401" ] && break
  echo "attempt $attempt: got HTTP $CODE, waiting for the alias to settle…"
  sleep 3
done
echo "Got HTTP $CODE"
[ "$CODE" = "401" ] || { echo "error: expected 401 from the gate, got $CODE" >&2; exit 1; }
echo "OK — live at $ALIAS (gate active)"
