# Deploy

The client deploys to **Vercel**, the WebSocket server to **Fly.io** (London,
`lhr`). Deploys are **on-demand only** — the single official way is to run
`.github/workflows/deploy.yml` manually (Actions tab → "Deploy" → Run workflow,
or `gh workflow run deploy.yml`). It deploys both in parallel and smoke-checks
each. Nothing auto-deploys on a push or merge, on any branch: Vercel's Git
integration is turned off by `"git": { "deploymentEnabled": false }` in
`vercel.json`, so the workflow is the only path. Access is gated by a single
shared password (the Vercel UI) and a matching token (the Fly WS handshake).

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

Run the **Deploy** workflow manually — Actions tab → "Deploy" → Run workflow, or
`gh workflow run deploy.yml`. (Merging to `main` does **not** deploy.) The
workflow deploys both and smoke-checks:
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
