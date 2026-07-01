# Cloud Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the React client to Vercel and the WebSocket server to Fly.io from GitHub Actions, gated by a shared password (client UI) and a shared token (server WS), so the running app is reachable from a phone but not the whole world.

**Architecture:** The Vite SPA is served by Vercel behind an Edge-Middleware Basic-Auth wall; on load it connects over `wss://` to the Node `ws` server on Fly.io, appending `?access=<token>` which the server validates at the handshake. The same `@rtc/domain` simulators run server-side, so data is identical to local. A `push` to `main` triggers two parallel deploy jobs.

**Tech Stack:** Vite, React, RxJS, Node `ws`, pnpm + Turborepo, Vercel CLI, Fly.io (`flyctl`) + Docker, GitHub Actions, Vitest.

## Global Constraints

- **Node version:** 26 (matches `.nvmrc` and all CI jobs).
- **Package manager:** pnpm 11 via Corepack (`packageManager` pin); set `COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"`.
- **Pin third-party GitHub Actions to commit SHAs** (repo convention; Renovate keeps them current). Reuse existing pins: `actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` (v7), `actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` (v6.4.0), `corepack@0.35.0`. Install `flyctl` and `vercel` via CLI (no new marketplace actions).
- **Lint gates must stay green:** `pnpm lint` (Biome), `pnpm lint:eslint`, `pnpm lint:css`, `pnpm lint:dead` (knip), `pnpm check:deps` (dependency-cruiser). Repo policy: zero findings, no inline disables. Any unavoidable exception (see Task 4) must be scoped + commented + surfaced for review.
- **Clean-architecture rule:** domain → shared → client/server; no new runtime deps on `@rtc/domain` beyond `rxjs`. The token/password code lives only in client app layer + server entry + edge middleware — never in `domain`/`shared`.
- **Fly app name:** `rtc-clone-server`; region `lhr`; URL `wss://rtc-clone-server.fly.dev`.
- **Secrets never committed.** Tokens/passwords live in GitHub/Vercel/Fly settings only.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/server/src/auth.ts` (new) | Pure `isAuthorizedUpgrade(reqUrl, token)` predicate. |
| `packages/server/src/auth.test.ts` (new) | Unit tests for the predicate. |
| `packages/server/src/index.ts` (modify) | Wire `verifyClient` using the predicate + `WS_ACCESS_TOKEN`. |
| `packages/client-react/src/app/wsUrl.ts` (new) | Pure `buildWsUrl(url, token)`. |
| `packages/client-react/src/app/wsUrl.test.ts` (new) | Unit tests for the builder. |
| `packages/client-react/src/app/composition.ts` (modify) | Read `VITE_WS_TOKEN`; build URL via `buildWsUrl`. |
| `packages/server/Dockerfile` (new) | Build monorepo, run server. |
| `packages/server/.dockerignore` (new) | Lean build context. |
| `fly.toml` (new, repo root) | Fly app/runtime config. |
| `vercel.json` (new, repo root) | Vercel build config + SPA rewrite. |
| `middleware.ts` (new, repo root) | Vercel Edge Middleware Basic-Auth gate. |
| `.github/workflows/deploy.yml` (new) | Two parallel deploy jobs on push to `main`. |
| `docs/DEPLOY.md` (new) | One-time setup runbook + how-it-works. |

---

## Task 1: Server WS access-token gate

**Files:**
- Create: `packages/server/src/auth.ts`
- Test: `packages/server/src/auth.test.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Produces: `isAuthorizedUpgrade(reqUrl: string | undefined, token: string | undefined): boolean` — returns `true` when `token` is falsy (gate disabled, e.g. local dev/e2e) OR the `access` query param of `reqUrl` equals `token`; else `false`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/auth.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { isAuthorizedUpgrade } from "./auth.js";

describe("isAuthorizedUpgrade", () => {
  it("is open when no token configured (local dev / e2e)", () => {
    expect(isAuthorizedUpgrade("/", undefined)).toBe(true);
    expect(isAuthorizedUpgrade("/?access=anything", "")).toBe(true);
  });

  it("accepts a matching access token", () => {
    expect(isAuthorizedUpgrade("/?access=s3cret", "s3cret")).toBe(true);
  });

  it("rejects a missing or wrong token when one is required", () => {
    expect(isAuthorizedUpgrade("/", "s3cret")).toBe(false);
    expect(isAuthorizedUpgrade("/?access=nope", "s3cret")).toBe(false);
    expect(isAuthorizedUpgrade(undefined, "s3cret")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/server exec vitest run src/auth.test.ts`
Expected: FAIL — cannot find module `./auth.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/server/src/auth.ts`:
```ts
/**
 * WebSocket upgrade authorization. The browser cannot set headers on a
 * `WebSocket`, so the shared access token rides in the `?access=` query param
 * (baked into the client bundle behind the Vercel password wall). An empty /
 * unset token disables the gate — used by local dev and the real-stack e2e
 * smoke, which connect without a token.
 */
export function isAuthorizedUpgrade(
  reqUrl: string | undefined,
  token: string | undefined,
): boolean {
  if (!token) return true;
  if (reqUrl === undefined) return false;
  const url = new URL(reqUrl, "http://localhost");
  return url.searchParams.get("access") === token;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/server exec vitest run src/auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `verifyClient` into the server**

In `packages/server/src/index.ts`, add the import (with the other local imports):
```ts
import { isAuthorizedUpgrade } from "./auth.js";
```
Add the token constant near `PORT`/`HOSTNAME`:
```ts
const WS_ACCESS_TOKEN = process.env.WS_ACCESS_TOKEN;
```
Replace the `WebSocketServer` construction:
```ts
const wss = new WebSocketServer({
  server: httpServer,
  // Reject unauthorized upgrades with 401 before a socket exists, so
  // handleConnection only ever runs for authorized clients. /health stays
  // token-free (it is an HTTP route, not a WS upgrade) for Fly health checks.
  verifyClient: (info) => isAuthorizedUpgrade(info.req.url, WS_ACCESS_TOKEN),
});
```

- [ ] **Step 6: Verify server build + unit tests + full server test run**

Run: `pnpm --filter @rtc/server build && pnpm --filter @rtc/server test`
Expected: build succeeds; all server tests PASS (existing `wsHandler.test.ts`, `ThroughputService.test.ts`, new `auth.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/auth.ts packages/server/src/auth.test.ts packages/server/src/index.ts
git commit -m "feat(server): gate WS handshake on shared access token"
```

---

## Task 2: Client WS token in composition root

**Files:**
- Create: `packages/client-react/src/app/wsUrl.ts`
- Test: `packages/client-react/src/app/wsUrl.test.ts`
- Modify: `packages/client-react/src/app/composition.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `buildWsUrl(url: string, token: string | undefined): string` — returns `url` unchanged when `token` is falsy; otherwise appends `access=<token>` as a query param (preserving any existing query string).

- [ ] **Step 1: Write the failing test**

`packages/client-react/src/app/wsUrl.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { buildWsUrl } from "./wsUrl";

describe("buildWsUrl", () => {
  it("returns the bare url when no token is set", () => {
    expect(buildWsUrl("wss://h.fly.dev", undefined)).toBe("wss://h.fly.dev");
    expect(buildWsUrl("wss://h.fly.dev", "")).toBe("wss://h.fly.dev");
  });

  it("appends the access token as a query param", () => {
    expect(buildWsUrl("wss://h.fly.dev", "tok")).toBe(
      "wss://h.fly.dev/?access=tok",
    );
  });

  it("preserves an existing query string", () => {
    expect(buildWsUrl("wss://h.fly.dev/?x=1", "tok")).toBe(
      "wss://h.fly.dev/?x=1&access=tok",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react exec vitest run src/app/wsUrl.test.ts`
Expected: FAIL — cannot find module `./wsUrl`.

- [ ] **Step 3: Write minimal implementation**

`packages/client-react/src/app/wsUrl.ts`:
```ts
/**
 * Build the WebSocket URL the client connects with. When a shared access token
 * is configured (VITE_WS_TOKEN), it rides in the `?access=` query param — the
 * only browser-compatible way to pass it, since the WebSocket API forbids
 * custom headers. No token → the bare URL (local dev / simulator-less builds).
 */
export function buildWsUrl(url: string, token: string | undefined): string {
  if (!token) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("access", token);
  return parsed.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react exec vitest run src/app/wsUrl.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into composition**

In `packages/client-react/src/app/composition.ts`, add the import with the other local imports:
```ts
import { buildWsUrl } from "./wsUrl";
```
In `buildDefaultPorts`, the block currently reads:
```ts
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const browser = new BrowserConnectionEventsAdapter();

  if (url) {
    const ws = new WsAdapter(url);
```
Change the last line to thread the token:
```ts
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const token = import.meta.env.VITE_WS_TOKEN as string | undefined;
  const browser = new BrowserConnectionEventsAdapter();

  if (url) {
    const ws = new WsAdapter(buildWsUrl(url, token));
```

- [ ] **Step 6: Redact the token from the WsAdapter connect log**

In `packages/client-react/src/app/adapters/WsAdapter.ts`, the `onopen` handler logs the URL:
```ts
      console.log("[WsAdapter] Connected to", this.url);
```
Replace with a redacted form so the token never hits the console:
```ts
      console.log("[WsAdapter] Connected to", this.url.split("?")[0]);
```

- [ ] **Step 7: Verify client typecheck + app tests**

Run: `pnpm --filter @rtc/client-react exec vitest run src/app && pnpm --filter @rtc/client-react typecheck`
Expected: all `src/app` tests PASS (including new `wsUrl.test.ts`); typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add packages/client-react/src/app/wsUrl.ts packages/client-react/src/app/wsUrl.test.ts packages/client-react/src/app/composition.ts packages/client-react/src/app/adapters/WsAdapter.ts
git commit -m "feat(client): append shared access token to WS url via composition"
```

---

## Task 3: Server packaging for Fly.io (Dockerfile + fly.toml)

**Files:**
- Create: `packages/server/Dockerfile`
- Create: `packages/server/.dockerignore`
- Create: `fly.toml` (repo root)

**Interfaces:**
- Consumes: server built by `pnpm turbo run build --filter=@rtc/server`; runtime entry `packages/server/dist/index.js`; reads `PORT` (default 4000), `HOSTNAME` (default `0.0.0.0`), `WS_ACCESS_TOKEN`.
- Produces: a Fly app `rtc-clone-server` listening on internal port 4000 with `/health`.

- [ ] **Step 1: Write the Dockerfile**

`packages/server/Dockerfile` (build context is the repo root — see fly.toml):
```dockerfile
# Single-stage build. The monorepo's pnpm workspace symlinks (@rtc/domain,
# @rtc/shared resolved from their dist/) resolve at runtime, so we keep the
# whole installed workspace rather than risk a fragile cross-stage copy. Image
# size is irrelevant for a demo server.
FROM node:26-slim

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app

# Corepack provides the pnpm version pinned in package.json's packageManager.
RUN corepack enable

# Copy the whole repo (the .dockerignore keeps it lean), install, build server.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@rtc/server

ENV PORT=4000
ENV HOSTNAME=0.0.0.0
EXPOSE 4000

CMD ["node", "packages/server/dist/index.js"]
```

- [ ] **Step 2: Write the .dockerignore**

`packages/server/.dockerignore`:
```
**/node_modules
**/dist
**/.turbo
**/*.tsbuildinfo
.git
.github
**/reports
**/coverage
**/tests
**/__screenshots__
.claude
docs
```

- [ ] **Step 3: Write fly.toml**

`fly.toml` (repo root):
```toml
app = "rtc-clone-server"
primary_region = "lhr"

[build]
  dockerfile = "packages/server/Dockerfile"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    interval = "15s"
    timeout = "2s"
    grace_period = "10s"
    method = "GET"
    path = "/health"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

- [ ] **Step 4: Verify the Docker build locally (if Docker available)**

Run (from repo root): `docker build -f packages/server/Dockerfile -t rtc-server-test .`
Expected: build succeeds, ending with the server image. If Docker is unavailable in this environment, skip and note that the build is verified by the first `flyctl deploy` in CI (Task 5 smoke gates it). Do **not** block the task on local Docker.

- [ ] **Step 5: Smoke-run the image locally (only if Step 4 ran)**

Run: `docker run -d -p 4000:4000 --name rtc-server-test rtc-server-test && sleep 3 && curl -fsS http://localhost:4000/health && docker rm -f rtc-server-test`
Expected: `{"ok":true}`.

- [ ] **Step 6: Commit**

```bash
git add packages/server/Dockerfile packages/server/.dockerignore fly.toml
git commit -m "build(server): containerize for Fly.io (lhr, always-on, /health check)"
```

---

## Task 4: Client packaging + password gate (vercel.json + middleware)

**Files:**
- Create: `vercel.json` (repo root)
- Create: `middleware.ts` (repo root)
- Possibly modify: `biome.json` / `knip` config (only if a gate flags the new files)

**Interfaces:**
- Consumes: client built by `pnpm turbo run build --filter=@rtc/client-react` → output `packages/client-react/dist`.
- Produces: a Vercel project that serves the SPA behind Basic-Auth using `SITE_PASSWORD`.

- [ ] **Step 1: Write vercel.json**

`vercel.json` (repo root):
```json
{
  "framework": "vite",
  "buildCommand": "pnpm turbo run build --filter=@rtc/client-react",
  "outputDirectory": "packages/client-react/dist",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Write the Edge Middleware**

`middleware.ts` (repo root). Vercel runs a root `middleware.ts` for any
framework. It requires a default export (framework contract), which collides
with Biome `noDefaultExport`; Step 4 handles that as a documented exception.
```ts
import { next } from "@vercel/edge";

export const config = { matcher: "/(.*)" };

/**
 * Single shared-password gate via HTTP Basic Auth. Returns 401 +
 * WWW-Authenticate so the browser shows its native credential dialog; the
 * username is ignored, only the password (SITE_PASSWORD) is checked. The
 * browser caches the credential for the session, so assets load after one
 * prompt. This protects only the Vercel-served UI — the Fly WS is gated
 * separately by the access token (Task 1).
 */
export default function middleware(request: Request): Response {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return next();

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === expected) return next();
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RTC"' },
  });
}
```

- [ ] **Step 3: Add the `@vercel/edge` dev dependency**

The middleware imports `next` from `@vercel/edge` (types + helper). Add it to the
client package (or root) as a dev dependency. Per repo memory, respect the
24h `minimumReleaseAge` cooldown and `pnpm outdated -r`.
```bash
pnpm add -D -w @vercel/edge
```
Run: `pnpm install` and confirm the lockfile updates cleanly.

- [ ] **Step 4: Make the new files pass the lint gates**

Run the gates over the new files:
```bash
pnpm lint && pnpm lint:eslint && pnpm lint:dead && pnpm check:deps
```
Expected friction + fixes:
- **Biome `noDefaultExport`** will flag `middleware.ts`. Vercel mandates the
  default export, so add a *scoped* `overrides` entry in `biome.json` disabling
  only `noDefaultExport` only for `middleware.ts`, with a comment noting it is a
  Vercel framework requirement. **This touches the repo's "no disables" policy —
  surface it explicitly in the task's review.** (Alternative to try first: if a
  named `export function middleware` is accepted by Vercel for this project,
  prefer it and avoid the override — verify against Vercel docs before deciding.)
- **knip** may report `middleware.ts` (repo root, outside any configured
  workspace `project` glob). If so, add `"middleware.ts"` to the root `ignore`
  array in `knip.json` (alongside `".remember/**"`, `"docs/design/**"`) — it is a
  real deploy entry point Vercel consumes, not dead code.
- **dependency-cruiser**: ensure `middleware.ts` (root, outside `packages`) is not
  caught by an orphan rule; add to the cruiser ignore if needed.
Re-run the four gates until clean.

- [ ] **Step 5: Verify the client still builds via the Vercel build command**

Run (from repo root): `pnpm turbo run build --filter=@rtc/client-react`
Expected: builds `packages/client-react/dist/index.html` + assets.

- [ ] **Step 6: Commit**

```bash
git add vercel.json middleware.ts biome.json package.json pnpm-lock.yaml knip.json .dependency-cruiser.cjs
git commit -m "feat(deploy): Vercel build config + Basic-Auth password gate"
```
(Only `git add` the gate-config files that actually changed.)

---

## Task 5: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: GitHub secrets `FLY_API_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`; Vercel project env `SITE_PASSWORD`, `VITE_SERVER_URL`, `VITE_WS_TOKEN`; Fly secret `WS_ACCESS_TOKEN`.
- Produces: production deploys of server (Fly) + client (Vercel) on push to `main`, each smoke-checked.

- [ ] **Step 1: Write the workflow**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy

# Production deploy of the WS server (Fly.io) and the client (Vercel) on every
# push to main. The two jobs are independent — the Fly URL is a stable constant
# baked into the client at build time, so the client build does not wait on the
# server deploy. Both must go green.
on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

jobs:
  deploy-server:
    name: server → fly.io
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7

      - name: Install flyctl
        run: |
          curl -L https://fly.io/install.sh | sh
          echo "$HOME/.fly/bin" >> "$GITHUB_PATH"

      - name: Deploy
        run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      - name: Smoke — /health returns 200
        run: curl -fsS https://rtc-clone-server.fly.dev/health

  deploy-client:
    name: client → vercel
    runs-on: ubuntu-latest
    env:
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7

      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 26

      - name: Enable Corepack
        run: npm install -g corepack@0.35.0 && corepack enable

      - name: Install Vercel CLI
        run: npm install -g vercel@latest

      - name: Pull Vercel project settings + env
        run: vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Build (Vercel bakes VITE_SERVER_URL + VITE_WS_TOKEN from pulled env)
        run: vercel build --prod --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Deploy prebuilt
        id: deploy
        run: |
          url=$(vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN")
          echo "url=$url" >> "$GITHUB_OUTPUT"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Smoke — unauthenticated request is gated (401)
        run: |
          code=$(curl -s -o /dev/null -w "%{http_code}" "${{ steps.deploy.outputs.url }}")
          echo "Got HTTP $code"
          test "$code" = "401"
```

- [ ] **Step 2: Lint the workflow**

Run: `pnpm lint:actions`
Expected: actionlint reports no errors for `deploy.yml`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(deploy): deploy server (fly) + client (vercel) on push to main"
```

> **Note:** This workflow only *runs* once it lands on `main` and the secrets/env
> exist. It is validated statically here (actionlint) and live by the first real
> deploy after the user completes Task 6 setup and merges.

---

## Task 6: Deploy runbook (`docs/DEPLOY.md`)

**Files:**
- Create: `docs/DEPLOY.md`

**Interfaces:**
- Consumes: everything above. Documents the one-time human setup and the steady-state flow.

- [ ] **Step 1: Write the runbook**

`docs/DEPLOY.md`:
```markdown
# Deploy

The client deploys to **Vercel**, the WebSocket server to **Fly.io** (London,
`lhr`). A push to `main` triggers `.github/workflows/deploy.yml`, which deploys
both in parallel and smoke-checks each. Access is gated by a single shared
password (the Vercel UI) and a matching token (the Fly WS handshake).

## One-time setup

You need accounts on Vercel, Fly.io, and GitHub admin on this repo. Pick one
shared password and one shared token (any strong random strings):

    PASSWORD=...        # the site password you'll type on your phone
    TOKEN=$(openssl rand -hex 16)

### 1. Fly.io (server)

    fly auth login
    fly launch --no-deploy --name rtc-clone-server --region lhr   # accept the existing fly.toml
    fly secrets set WS_ACCESS_TOKEN="$TOKEN"
    fly tokens create deploy                                       # copy → GitHub secret FLY_API_TOKEN

### 2. Vercel (client)

    vercel login
    vercel link            # create/select the project; note Org ID + Project ID

In the Vercel dashboard → Project → Settings → Environment Variables, add for
**Production**:

    SITE_PASSWORD   = <PASSWORD>
    VITE_SERVER_URL = wss://rtc-clone-server.fly.dev
    VITE_WS_TOKEN   = <TOKEN>          # must equal the Fly WS_ACCESS_TOKEN

### 3. GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret:

    FLY_API_TOKEN      = <from `fly tokens create deploy`>
    VERCEL_TOKEN       = <vercel.com/account/tokens>
    VERCEL_ORG_ID      = <from `vercel link` / .vercel/project.json>
    VERCEL_PROJECT_ID  = <from `vercel link` / .vercel/project.json>

## Deploying

Merge to `main`. The workflow deploys both and smoke-checks:
- server `/health` → 200
- client unauthenticated → 401 (the password wall is live)

Open `https://<your-project>.vercel.app` on your phone, enter the password, and
watch live prices tick. Share the URL + password with friends.

## How it works

- The client is a static Vite SPA. When `VITE_SERVER_URL` is set it connects to
  the real server over `wss://`, appending `?access=<VITE_WS_TOKEN>`.
- The server validates that token at the WebSocket handshake (`verifyClient`),
  rejecting unknown clients with 401. `/health` stays open for Fly's checks.
- The Vercel Edge Middleware (`middleware.ts`) Basic-Auth-gates the whole site
  using `SITE_PASSWORD`.
- `VITE_WS_TOKEN` (Vercel) and `WS_ACCESS_TOKEN` (Fly) MUST match.

## Rotating the password / token

- Password: change `SITE_PASSWORD` in Vercel → redeploy (re-run the workflow).
- Token: set a new value in BOTH `VITE_WS_TOKEN` (Vercel) and `WS_ACCESS_TOKEN`
  (Fly: `fly secrets set ...`) → redeploy both.
```

- [ ] **Step 2: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs(deploy): one-time setup runbook + how-it-works"
```

---

## Final verification (after all tasks)

- [ ] **Full test + lint sweep**

Run:
```bash
pnpm test && pnpm lint && pnpm lint:eslint && pnpm lint:css && pnpm lint:dead && pnpm check:deps && pnpm lint:actions
```
Expected: all green. (This proves the app-code gates work and the new config
files don't break any repo gate.)

- [ ] **Real-stack contract intact**

Run the e2e suite (or at least the real-stack smoke) to confirm the unset-token
path keeps client↔server working:
```bash
pnpm test:e2e:no-cypress
```
Expected: real-stack scenarios pass (server open when `WS_ACCESS_TOKEN` unset;
client sends no token when `VITE_WS_TOKEN` unset).

- [ ] **Open PR for the user to merge**

Push `worktree-cloud-deploy` and open a PR. Do **not** merge — the user controls
when `main` advances (merging triggers the live deploy). The PR description links
this plan and `docs/DEPLOY.md`, and lists the one-time setup the user must do
before the first deploy will succeed.

---

## Self-Review notes

- **Spec coverage:** server gate → Task 1; client token → Task 2; Fly packaging
  (Dockerfile/.dockerignore/fly.toml, lhr, always-on, /health) → Task 3; Vercel
  build config + password middleware → Task 4; GitHub Actions both-jobs +
  smokes → Task 5; secrets split + manual runbook → Task 6 + DEPLOY.md;
  TDD on the two helpers + e2e intact + deploy smokes → tasks 1–2 + Final.
- **Known policy exceptions surfaced for review:** Biome `noDefaultExport`
  override for `middleware.ts` (Task 4 Step 4) vs. the repo "no disables"
  policy; the named-export alternative is to be tried first.
- **Type consistency:** `isAuthorizedUpgrade(reqUrl, token)` and
  `buildWsUrl(url, token)` are used with identical signatures in their wiring
  steps; `WS_ACCESS_TOKEN` (server/Fly) ↔ `VITE_WS_TOKEN` (client/Vercel) named
  consistently throughout, with the must-match invariant stated in DEPLOY.md.
```
