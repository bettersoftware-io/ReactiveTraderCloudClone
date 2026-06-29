# Design prototype deploy

Deploys a **standalone design prototype** (the self-contained HTML under
`docs/design/<version>/standalone/`) to its own Vercel project,
`rtc-clone-proto` → **https://rtc-clone-proto.vercel.app**, behind a shared
password.

Completely separate from the main FX app: different Vercel project, no Git
auto-deploy, on-demand only. Updating one never touches the other.

## How it works

`deploy.sh` is the single source of truth (the GitHub Action just calls it). At
deploy time it:

1. Validates the chosen prototype HTML path exists.
2. Generates a tiny Basic-Auth gate (`middleware.ts` + `package.json` +
   `vercel.json`) into a throwaway dir — nothing source-like is committed, so the
   strict monorepo linters stay out of it.
3. Copies the chosen HTML in as `index.html` (never committed — it's an 835 KB
   duplicate).
4. `vercel deploy --prod` to the `rtc-clone-proto` project, then smoke-tests that
   an unauthenticated request is gated (`401`).

## Deploy it (two ways)

### 1. The button (GitHub Actions — recommended)

Actions tab → **Deploy Prototype** → **Run workflow**. The form has one field,
**Path to the standalone prototype HTML**, pre-filled with the v2 path. To ship a
future version, change it to e.g. `docs/design/v3/standalone/Reactive Trader.html`
and run. Or from the CLI:

```bash
gh workflow run deploy-proto.yml -f prototype_path="docs/design/v3/standalone/Reactive Trader.html"
```

### 2. Locally

Requires the Vercel CLI logged in (`vercel login`) with access to the
`nasantsogt-baasanjavs-projects` scope.

```bash
./deploy/prototype/deploy.sh                                                    # v2 (default)
./deploy/prototype/deploy.sh "docs/design/v3/standalone/Reactive Trader.html"   # v3
```

## The password

`SITE_PASSWORD` is an environment variable on the `rtc-clone-proto` Vercel
project (Production + Preview), set once in the dashboard
(Project → Settings → Environment Variables) and reused every deploy. Vercel
stores it encrypted and write-only, so it never appears in the repo, the
workflow, or CLI output. At the login prompt the **username is ignored** — only
the password is checked.
