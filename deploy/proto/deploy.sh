#!/usr/bin/env bash
# Deploy the @rtc/client-prototype React port (the readable, self-contained port
# of the v2 design) to the rtc-clone-proto Vercel project
# (https://rtc-clone-proto.vercel.app), behind a shared-password Basic-Auth gate.
#
#   ./deploy/proto/deploy.sh
#
# This is the *running code* prototype. The hand-authored HTML design mockup
# ships separately via the "Deploy Claude Design Prototype" workflow →
# rtc-clone-cd-proto; see ../cd-proto/README.md.
#
# The gate (a tiny Basic-Auth middleware) is GENERATED here at deploy time, not
# committed — so this is the single source of truth for both local runs and the
# Deploy Prototype GitHub Action, and the strict monorepo linters never see a
# stray middleware.ts / package.json. The built dist/ is copied, never committed.
#
# Auth/targeting:
#   - Project is selected via VERCEL_ORG_ID + VERCEL_PROJECT_ID (not secrets — a
#     project ID appears in dashboard URLs). VERCEL_PROJECT_ID has no default: it
#     must be set to the rtc-clone-proto project's id (one-time, see README).
#   - Locally: relies on `vercel login`. In CI: set VERCEL_TOKEN and it is used.
#   - The password (SITE_PASSWORD) is an env var ON the Vercel project, set once
#     in the dashboard and reused every deploy — it never passes through here.
set -euo pipefail

: "${VERCEL_ORG_ID:=team_Nm5Q36b0kTItH0gXCGG6fGUp}"
# One-time setup: create the rtc-clone-proto Vercel project, then paste its
# project id (visible in the dashboard URL, prj_…) here or export it as
# VERCEL_PROJECT_ID before running. The sentinel below fails the deploy loudly
# so we never ship to the wrong project by accident.
: "${VERCEL_PROJECT_ID:=__SET_RTC_CLONE_PROTO_PROJECT_ID__}"
export VERCEL_ORG_ID VERCEL_PROJECT_ID

if [ "$VERCEL_PROJECT_ID" = "__SET_RTC_CLONE_PROTO_PROJECT_ID__" ]; then
  echo "error: VERCEL_PROJECT_ID is unset. Create the rtc-clone-proto Vercel" >&2
  echo "       project, then set its prj_… id in deploy/proto/deploy.sh (or" >&2
  echo "       export VERCEL_PROJECT_ID). See deploy/proto/README.md." >&2
  exit 1
fi

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
DIST="$REPO_ROOT/packages/client-prototype/dist"

echo "Building @rtc/client-prototype…"
(cd "$REPO_ROOT" && pnpm turbo run build --filter=@rtc/client-prototype)

if [ ! -d "$DIST" ] || [ ! -f "$DIST/index.html" ]; then
  echo "error: build did not produce $DIST/index.html" >&2
  exit 1
fi

# Assemble the deployment in a throwaway dir: generated gate + copied dist/.
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
  "name": "rtc-clone-proto",
  "private": true,
  "version": "0.0.0",
  "dependencies": { "@vercel/edge": "^1.3.1" }
}
EOF

# framework:null → static serve of the pre-built SPA, no build step on Vercel.
# @rtc/client-prototype has no client-side router, so no SPA rewrite is needed.
printf '{ "framework": null }\n' > "$BUILD/vercel.json"

echo "Staging $DIST → deployment root"
cp -R "$DIST/." "$BUILD/"

TOKEN_ARG=()
[ -n "${VERCEL_TOKEN:-}" ] && TOKEN_ARG=(--token "$VERCEL_TOKEN")

echo "Deploying to rtc-clone-proto (production)…"
URL="$(cd "$BUILD" && vercel deploy --prod --yes "${TOKEN_ARG[@]}")"
echo "Deployed: $URL"

echo "Smoke — unauthenticated request must be gated (401)…"
CODE="$(curl -s -o /dev/null -w "%{http_code}" "$URL")"
echo "Got HTTP $CODE"
[ "$CODE" = "401" ] || { echo "error: expected 401 from the gate, got $CODE" >&2; exit 1; }
echo "OK — live at https://rtc-clone-proto.vercel.app (gate active)"
