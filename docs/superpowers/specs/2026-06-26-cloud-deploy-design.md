# Cloud Deploy — Design Spec

**Date:** 2026-06-26
**Status:** Approved (pending spec review)
**Branch:** `worktree-cloud-deploy`

## Goal

Make the running app reachable from a phone (and shareable with a few friends)
via public URLs, without giving access to the whole world. Deliver a real
end-to-end deployment: the React client on Vercel talking over a live WebSocket
to the Node server on Fly.io, both deployed from GitHub Actions, both gated by a
single shared password / token.

## Decisions (locked)

| Question | Decision |
|---|---|
| Backend scope | Full end-to-end: client (Vercel) **and** WS server (Fly.io) |
| Deploy trigger | GitHub Actions (`flyctl` for server, Vercel CLI for client) |
| Server host | Fly.io, region **`lhr` (London)**, always-on (no cold start) |
| Access control | **Gate both.** Vercel Basic-Auth password on the client UI; shared token on the server WS handshake |

## Architecture

```
   Phone / friend ──HTTPS──► Vercel (static Vite SPA, @rtc/client-react)
        │  Basic-Auth password gate (Edge Middleware, SITE_PASSWORD)
        ▼
   app loads → composition.ts reads VITE_SERVER_URL + VITE_WS_TOKEN
        │
        ▼  wss://rtc-clone-server.fly.dev/?access=<token>
   Fly.io (Node `ws` server, @rtc/server)
        │  verifyClient() checks ?access= against WS_ACCESS_TOKEN → 401 if wrong
        ▼  runs @rtc/domain simulators server-side
   live prices / trades / RFQ / blotter / analytics
```

When `VITE_SERVER_URL` is set, `buildDefaultPorts()`
(`packages/client-react/src/app/composition.ts:103`) wires the **real WS ports**
instead of in-browser simulators. The server runs the same `@rtc/domain`
simulators, so the data is identical — just delivered over a real socket.
Preferences stay client-side via `LocalStoragePreferencesAdapter` in both modes.

## Components & files

### New files

| File | Purpose |
|---|---|
| `packages/server/Dockerfile` | Single-stage: copy repo → `pnpm install` (frozen) → `pnpm turbo run build --filter=@rtc/server` → `CMD ["node","packages/server/dist/index.js"]`. Single-stage chosen for reliability — pnpm workspace symlinks (`@rtc/domain`, `@rtc/shared` resolved from their `dist`) resolve at runtime without cross-stage copy fragility. Image size is irrelevant for a demo. |
| `packages/server/.dockerignore` | Exclude `node_modules`, `**/dist`, `.git`, tests, `.turbo`, reports — lean build context. |
| `fly.toml` (repo root) | Fly app config. `app = "rtc-clone-server"`, `primary_region = "lhr"`, `[build] dockerfile = "packages/server/Dockerfile"`, `[http_service] internal_port = 4000`, `force_https = true`, `min_machines_running = 1`, `auto_stop_machines = false` (always-on, no cold start), HTTP health check `GET /health`. |
| `vercel.json` (repo root) | `framework: "vite"`, `buildCommand: "pnpm turbo run build --filter=@rtc/client-react"`, `outputDirectory: "packages/client-react/dist"`, SPA rewrite `{"source":"/((?!api/).*)","destination":"/index.html"}` (matches graflyn). Builds workspace deps topologically first. |
| `middleware.ts` (repo root) | Vercel Edge Middleware. Reads `Authorization: Basic`; compares password against `process.env.SITE_PASSWORD` (username ignored). On miss/mismatch → `401` + `WWW-Authenticate: Basic realm="RTC"`, triggering the browser's native credential dialog. `matcher` covers all routes so the whole app sits behind the wall (browser caches the credential for the session, so assets load after one prompt). Must pass repo lint gates (Biome / ESLint / knip) — see Risks. |
| `.github/workflows/deploy.yml` | Two parallel jobs on push to `main` (see below). |
| `docs/DEPLOY.md` | One-time setup runbook + "how it works" reference. |

### Modified files (app code — the server gate)

| File | Change |
|---|---|
| `packages/client-react/src/app/composition.ts` | In `buildDefaultPorts()`, read `VITE_WS_TOKEN`; build the WS URL as `token ? \`${url}?access=${token}\` : url` and pass to `new WsAdapter(...)`. `WsAdapter` itself is unchanged (it already takes a URL string). |
| `packages/server/src/index.ts` | Add `const ACCESS_TOKEN = process.env.WS_ACCESS_TOKEN;` and a `verifyClient` option on `new WebSocketServer({ server, verifyClient })`. The callback parses `info.req.url` for `?access=` and returns `true` only if it matches (or if `ACCESS_TOKEN` is unset → open, for local dev / e2e). Rejection sends `401` before any socket exists, so `handleConnection` never runs for unauthorized clients. `/health` stays token-free for Fly health checks. |

## Deploy workflow (`.github/workflows/deploy.yml`)

Trigger: `push` to `main` (production). The two jobs are independent — the Fly
URL is a stable known constant, so the client build does not wait on the server
deploy. Both must go green.

- **`deploy-server`**: checkout → `superfly/flyctl-actions/setup-flyctl` →
  `flyctl deploy --remote-only` → smoke `curl -fsS https://rtc-clone-server.fly.dev/health`.
- **`deploy-client`**: checkout → pnpm + Node 26 → `vercel pull --environment=production`
  → `vercel build --prod` → `vercel deploy --prebuilt --prod` → smoke `curl -fsS -o /dev/null -w "%{http_code}"`
  the prod URL expecting `401` (the gate is working) — a `200` would mean the password
  wall is missing.

## Configuration & secrets (set once, by the user)

Split by home so nothing sensitive lands in the repo:

| Where | Name | Value |
|---|---|---|
| GitHub repo secrets | `FLY_API_TOKEN` | from `fly tokens create deploy` |
| GitHub repo secrets | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | from `vercel link` / dashboard |
| Vercel project env (Production) | `SITE_PASSWORD` | the shared password (middleware, runtime) |
| Vercel project env (Production) | `VITE_SERVER_URL` | `wss://rtc-clone-server.fly.dev` (build-time, baked in) |
| Vercel project env (Production) | `VITE_WS_TOKEN` | the shared WS token (build-time, baked in) |
| Fly secret | `WS_ACCESS_TOKEN` | **must equal** `VITE_WS_TOKEN`; `fly secrets set` |

`VITE_SERVER_URL` / `VITE_WS_TOKEN` live in Vercel env (picked up by
`vercel pull` + `vercel build`), so the workflow needs no app config — only the
4 deploy creds.

## One-time manual setup (user; exact commands in `docs/DEPLOY.md`)

1. `fly launch --no-deploy` (or `fly apps create rtc-clone-server`) — reserves name/URL/region.
2. `fly secrets set WS_ACCESS_TOKEN=<token>`.
3. `vercel link` against the repo — creates the Vercel project; yields org/project IDs.
4. In Vercel dashboard: add `SITE_PASSWORD`, `VITE_SERVER_URL`, `VITE_WS_TOKEN` to Production env.
5. Add the 4 deploy secrets to GitHub.

Thereafter every push to `main` redeploys both. All repo changes are delivered
as a PR from `worktree-cloud-deploy`; `main` is untouched until the user merges.

## Testing & verification

Config/infra is not unit-testable, so verification is layered:

1. **App-code changes get tests (TDD):**
   - `composition.ts`: a test asserting the WS URL includes `?access=<token>` when
     `VITE_WS_TOKEN` is set, and is the bare URL when unset.
   - `index.ts` `verifyClient`: extract the predicate into a small pure helper
     (e.g. `isAuthorizedUpgrade(reqUrl, token)`) and unit-test it
     (match / mismatch / token-unset-is-open). Keeps the entry file thin and testable.
2. **Existing real-stack e2e** (WsAdapter pre-open buffering smoke, etc.) must still
   pass: with `WS_ACCESS_TOKEN` unset in the test env the server stays open and the
   client sends no token, so the contract is unchanged. Confirm locally before first deploy.
3. **Deploy smokes** in the workflow gate success: server `/health` 200; client returns
   `401` unauthenticated (proves the password wall), `200` with the credential.
4. **Manual:** load the prod URL on a phone, enter the password, watch live prices tick.

## Risks & mitigations

- **`middleware.ts` at repo root vs. monorepo lint gates.** Biome / ESLint / knip /
  dependency-cruiser run repo-wide. The middleware must conform (it's plain TS) or be
  explicitly scoped in the relevant ignore/config. Mitigation: write it to pass the gates;
  if knip flags it as an unused entry, add it to knip's `entry`/`ignore`. Verify
  `pnpm lint` / `pnpm lint:eslint` / `pnpm lint:dead` clean before PR.
- **Vercel Edge Middleware on a non-Next Vite project.** Vercel runs a root `middleware.ts`
  for any framework. Mitigation: the workflow's `401`-unauthenticated smoke proves it's
  actually engaged; if Vercel doesn't pick it up, fall back to a `vercel.json` route with
  an edge function.
- **Token in query string is logged / low-strength.** Acceptable for "me and friends";
  the token only protects simulated data and sits behind the password wall in the bundle.
  Redact it from `WsAdapter`'s `console.log` connect line. Proper auth is explicitly deferred.
- **Pushing to `main` is outward-facing** (CI + auto-push noted in project memory). All work
  stays on the worktree branch; merge is the user's explicit call. The deploy workflow only
  fires after that merge.

## Out of scope (YAGNI)

- PR preview deploys (easy follow-up; `main`→prod only for v1).
- Multi-stage Docker size optimization.
- Custom domains (use `.vercel.app` / `.fly.dev`).
- Real authentication / per-user accounts (explicitly "another time").
- Hosting/securing for high traffic; rate limiting; origin allowlists.
