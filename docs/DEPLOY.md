# Deploy

The web clients deploy to **Vercel**, the WebSocket server to **Fly.io**
(London, `lhr`). Deploys are **on-demand only** — the single official way is to
run `.github/workflows/deploy.yml` manually (Actions tab → "Deploy" → Run
workflow, or `gh workflow run deploy.yml`). One workflow deploys any subset of
three independent targets via checkboxes — `deploy_react` (→
`rtc-clone-react.vercel.app`), `deploy_solid` (→ `rtc-clone-solid.vercel.app`),
and `deploy_server` (→ Fly) — plus `include_sourcemaps` to ship a debuggable
client build. Each ticked target is smoke-checked. Nothing auto-deploys on a
push or merge, on any branch: Vercel's Git integration is turned off by
`"git": { "deploymentEnabled": false }` in each client's `vercel.<client>.json`
(`vercel.react.json` / `vercel.solid.json`), so the workflow is the only path.
Access is gated by genuine
per-user login, not a shared password or token. The deployed web build is
**hybrid** ([`docs/authentication.md` §6](authentication.md#6-hybrid-data-source-one-deployment-two-modes)):
credentials matching the committed demo roster are verified in the browser
and run the in-browser simulators, and any other credentials are POSTed to the
Fly server's `/login`, which validates them against its `AUTH_USERS` roster and
returns a signed session token that gates the WebSocket upgrade.

## One-time setup

You need accounts on Vercel, Fly.io, and GitHub admin on this repo.

### 1. Fly.io (server)

    fly auth login
    fly launch --no-deploy --name rtc-clone-server --region lhr   # accept the existing fly.toml
    fly secrets set AUTH_SECRET="$(openssl rand -hex 32)"          # HMAC session-token signing secret
    fly secrets set AUTH_USERS="user1:pass1,user2:pass2"           # real roster — ask the team, never invent one
    fly tokens create deploy                                        # copy → GitHub secret FLY_API_TOKEN

`AUTH_SECRET` and `AUTH_USERS` are set as Fly secrets **by hand** — the deploy
workflow's `FLY_API_TOKEN` can only deploy code, not manage secrets. Credentials
are never published in this repo; ask the team for the real roster.

### 2. Vercel (client)

    vercel login
    vercel link            # create/select the project; note Org ID + Project ID

In the Vercel dashboard → Project → Settings → Environment Variables, add for
**Production**:

    VITE_SERVER_URL = wss://rtc-clone-server.fly.dev

That's it — no client-side token or password to set. The deployed client logs
in against the Fly server directly, the same as local dev pointed at a live
server.

### 3. GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret:

    FLY_API_TOKEN            = <from `fly tokens create deploy`>
    VERCEL_TOKEN             = <vercel.com/account/tokens>
    VERCEL_ORG_ID            = <from `vercel link` / .vercel/project.json>
    VERCEL_REACT_PROJECT_ID  = <the rtc-clone-react project's id>
    VERCEL_SOLID_PROJECT_ID  = <the rtc-clone-solid project's id>

## Deploying

Run the **Deploy** workflow manually — Actions tab → "Deploy" → Run workflow,
tick the targets you want (`deploy_react` / `deploy_solid` / `deploy_server`,
plus optional `include_sourcemaps`), or e.g.
`gh workflow run deploy.yml -f deploy_react=true -f deploy_server=true`.
(Merging to `main` does **not** deploy; ticking nothing fails the run's `guard`
job.) Each client build is guarded **before** it deploys, so a wrong build fails
loudly instead of shipping:
- the server URL was inlined (`rtc-clone-server.fly.dev` in the bundle) —
  otherwise the client would silently run the simulator with no WebSocket
- the demo roster was inlined (`mcdc2026` in the bundle, from the committed
  `packages/client-*/.env.production`) — otherwise the hybrid would silently
  send every login, demo accounts included, to the server
- the alternative application cores ship only as lazy chunks
  (`scripts/check-core-bundle.mjs`)
- an inline sourcemap is present when `include_sourcemaps` was ticked

Each ticked target is then smoke-checked:
- server `/health` → 200
- each client → 200 on its canonical alias (the deployed SPA renders its own
  login screen; there is no edge-level password wall to smoke-check anymore)

Open `https://rtc-clone-react.vercel.app` (or `https://rtc-clone-solid.vercel.app`),
log in with a real credential (ask the team) and watch live prices tick — or
with a demo account (`demo` / `mcdc2026`) to run the in-browser simulators
instead; the login decides.

### Debuggable (sourcemap) builds

Tick `include_sourcemaps` to ship a build you can profile with real component
names in the DevTools flamechart. The maps are **inline** (embedded in each JS
bundle as a `data:` URI), not external `.map` files — because Vercel's edge
returns **403 for served `.map` files** by design (source-exposure protection),
so an external map would be generated and linked but never fetchable in
production. Inline maps sidestep that (no separate `.map` request), at the cost
of a larger bundle — fine for an opt-in debug deploy. The wiring is
`RTC_SOURCEMAPS=1` (workflow) → `turbo.json` `build.env` → each client's
`vite.config.ts` (`build.sourcemap: "inline"`); the deploy job asserts the
inline map is present when requested, so a regression fails loudly.

The debug build also resolves the `@rtc/*` libraries to their **original TypeScript**: when `RTC_SOURCEMAPS=1`, Vite aliases those workspace packages to their `src` (compiling them from source rather than consuming `dist/*.js`, whose sourcemap chain Vite's dep pre-bundle would otherwise drop), and emits distinct `-dbg-` filenames so the debug and lean builds never collide in a cache. So a profiled deploy resolves the whole flamechart — app components and presenters/machines — to source.

## How it works

- The client is a static Vite SPA. A production build inlines both
  `VITE_SERVER_URL` (from Vercel) and the committed demo roster
  `VITE_DEMO_AUTH` (from `packages/client-*/.env.production`), which makes it
  **hybrid**: the login decides the data source. Credentials matching the
  demo roster are verified in the browser and run the in-browser simulators
  (nothing is sent to any server); any other credentials are POSTed as
  `{ username, password }` to the Fly server's `/login` over HTTPS
  (`HttpAuthAdapter`). A successful server login returns a signed session
  token, which the client then appends as `?access=<token>` when it opens the
  real `wss://` connection. A login that lands in the other mode than the
  page was composed in stores its session plus `localStorage["rtc.dataSource"]`
  and reloads once; the console line `[data] composed <sim|live> from <reason>`
  says which rule won. Full rules and the reload timeline:
  [`docs/authentication.md` §6](authentication.md#6-hybrid-data-source-one-deployment-two-modes).
- The server validates the token at the WebSocket handshake
  (`authorizeUpgrade` → `AuthService.verifyToken`), rejecting a missing,
  malformed, or expired token with 401. `/health` and `/login` stay open (HTTP
  routes, not WS upgrades) for Fly's checks and for login itself.
- **Limits in production** (hardening B1, spec §2.2 / §9.2). Fly refuses new
  connections to the machine past `hard_limit = 250` (`fly.toml`,
  `[http_service.concurrency]`, unit `connections` because WebSockets are
  long-lived) — a flood becomes refused connections, not an out-of-memory
  crash; the reconnecting `WsAdapter` backs off and retries. Below that the
  app itself says no: 200 live sockets per process and 8 per client IP (`503`
  on the upgrade), a 256 KiB frame cap (`1009`), a per-socket message budget
  (`1008` after 100 dropped frames), a 4 KiB `/login` body (`413`), 10 login
  attempts a minute, and an in-memory ban list — 10 weighted strikes in 10
  minutes earn a 15-minute `429 banned`; a redeploy clears it. Every number
  lives in `packages/server/src/config/limits.ts`. All of it keys on
  `Fly-Client-IP`; set `RTC_TRUSTED_IP_HEADER=cf-connecting-ip` as a Fly
  secret once Cloudflare fronts the server. The container runs as the
  unprivileged `node` user.
- There is no Vercel Edge Middleware anymore — the old shared-password
  Basic-Auth wall (`middleware.ts`, `SITE_PASSWORD`) and the shared WebSocket
  token (`WS_ACCESS_TOKEN` / `VITE_WS_TOKEN`) have both been removed. Access
  control is now real per-user authentication on the server, not a static
  edge secret.
- For **local** simulator-mode dev (no real server), `VITE_DEV_AUTH` (a JSON
  map of `username` → `password`, e.g. `{"demo":"mcdc2026"}`) seeds an
  in-process `AuthSimulator` so the login screen works with no backend at all.
  Both web clients read it identically via `buildBrowserPorts.ts`'s
  `parseDevAuth` — `pnpm dev` (`client-react`) and `pnpm dev:solid`
  (`client-solid`) each already read the committed demo roster from their own
  `.env.development`; see `packages/client-react/.env.example` to override.
- The mobile app shows a login screen on every launch (no auto-login); in
  **live** mode the operator signs in with any credential that exists in the
  deployed server's `AUTH_USERS` roster. In **simulator** mode
  (`EXPO_PUBLIC_DEV_AUTH`, expo `extra.devAuth`), a JSON `username -> password`
  map seeds an in-process `AuthSimulator`, falling back to all four roster
  usernames at a shared dev password when unset. See the
  [client-react-native README](../packages/client-react-native/README.md#live-data--signing-in).

## Rotating / managing credentials

- **Server roster (source of truth):** `fly secrets set AUTH_USERS="user:pass,..." -a rtc-clone-server`
  — adds, removes, or changes credentials; no client-side value needs to
  change in step, since the client always authenticates fresh via `/login`.
- **Session-signing secret:** `fly secrets set AUTH_SECRET=<new> -a rtc-clone-server`
  invalidates every outstanding session token immediately (users must log in
  again) — useful if a token were ever compromised.
- This is a **demo app**, so the demo login password (`mcdc2026`) is committed
  for local dev (`.env.development` + the `dev:*` scripts) — throwaway and
  rotatable. The **`AUTH_SECRET`** token-signing key is the credential that
  never belongs in a committed file: it stays a Fly secret set by hand.

See [env-files.md](./env-files.md) for the full inventory of `.env` files and
the auth-related environment variables.
