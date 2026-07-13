# Claude Design prototype deploy

Deploys a **standalone Claude Design prototype** (the hand-authored, self-contained
HTML under `docs/design/web/<version>/standalone/` or
`docs/design/mobile/<version>/standalone/`) to one of **two** Vercel projects,
each behind a shared password:

| Target   | Vercel project              | URL                                          | Default prototype                                    |
| -------- | --------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `web`    | `rtc-clone-web-cd-proto`    | https://rtc-clone-web-cd-proto.vercel.app    | `docs/design/web/v5/standalone/Reactive Trader.html` |
| `mobile` | `rtc-clone-mobile-cd-proto` | https://rtc-clone-mobile-cd-proto.vercel.app | `docs/design/mobile/v1/standalone/Reactive Trader Mobile.html` |

These are the *design mockups*. The readable **React port** (`@rtc/client-prototype`)
ships separately via the **Deploy Prototype** workflow → `rtc-clone-proto`; see
[`deploy/proto/README.md`](../proto/README.md).

Completely separate from the main FX app: different Vercel projects, no Git
auto-deploy, on-demand only. Updating one never touches the others.

## How it works

`deploy.sh` is the single source of truth (the GitHub Action just calls it). At
deploy time it:

1. Validates the chosen prototype HTML path exists.
2. Generates a tiny Basic-Auth gate (`middleware.ts` + `package.json` +
   `vercel.json`) into a throwaway dir — nothing source-like is committed, so the
   strict monorepo linters stay out of it.
3. Copies the chosen HTML in as `index.html` (never committed — it's a large
   duplicate of the standalone).
4. `vercel deploy --prod` to the project named by `VERCEL_PROJECT_ID`, then
   smoke-tests that an unauthenticated request to `CD_PROTO_ALIAS` is gated (`401`).

In CI the workflow passes `VERCEL_PROJECT_ID` from the target's project-id secret
— `VERCEL_CD_PROTO_WEB_PROJECT_ID` or `VERCEL_CD_PROTO_MOBILE_PROJECT_ID`. For
local runs `deploy.sh` still carries the web project id as a hardcoded default (a
project id isn't sensitive — it shows in dashboard URLs), so `./deploy.sh` works
without env; the mobile project id must be passed explicitly. Both projects live in
the same Vercel team (`nasantsogt-baasanjavs-projects`), so `VERCEL_ORG_ID` is shared.

## Deploy it (two ways)

### 1. The button (GitHub Actions — recommended)

Actions tab → **Deploy Claude Design Prototype** → **Run workflow**. Pick a
**target** (`web` or `mobile`); leave **Path** blank to ship that target's default
prototype, or set it to a specific version, e.g.
`docs/design/web/v3/standalone/Reactive Trader.html`. Or from the CLI:

```bash
gh workflow run deploy-cd-proto.yml -f target=web                     # web v4 (default)
gh workflow run deploy-cd-proto.yml -f target=mobile                  # mobile v1
gh workflow run deploy-cd-proto.yml \
  -f prototype_path="docs/design/web/v3/standalone/Reactive Trader.html"   # a specific web version
```

### 2. Locally

Requires the Vercel CLI logged in (`vercel login`) with access to the
`nasantsogt-baasanjavs-projects` scope.

```bash
# Web (default project + alias):
./deploy/cd-proto/deploy.sh                                                    # web v4 (default)
./deploy/cd-proto/deploy.sh "docs/design/web/v3/standalone/Reactive Trader.html"  # a specific web version

# Mobile (override the project id + smoke alias):
VERCEL_PROJECT_ID=prj_aWczPu0wohwQT9tcbkONTL0bh9wj \
CD_PROTO_ALIAS=https://rtc-clone-mobile-cd-proto.vercel.app \
  ./deploy/cd-proto/deploy.sh "docs/design/mobile/v1/standalone/Reactive Trader Mobile.html"
```

## One-time setup (project-id secrets)

Both projects live in the team already; the workflow reads each project id from a
repo secret (Settings → Secrets and variables → Actions). A project id isn't
sensitive, but it's kept a Secret to match the other deploy workflows' convention.

1. **Web** — `VERCEL_CD_PROTO_WEB_PROJECT_ID` = `prj_VxG4x6dsstNbG3cEnhrZjZZM2Ayl`
   (the `rtc-clone-web-cd-proto` project). If unset, CI falls back to the same id
   hardcoded in `deploy.sh`.
2. **Mobile** — `VERCEL_CD_PROTO_MOBILE_PROJECT_ID` =
   `prj_aWczPu0wohwQT9tcbkONTL0bh9wj` (the `rtc-clone-mobile-cd-proto` project). A
   guard step fails the mobile deploy if this is unset (no hardcoded fallback).
3. **Password** — set `SITE_PASSWORD` on each project (see below).

## The password

`SITE_PASSWORD` is an environment variable **on each Vercel project** (Production +
Preview), set once in the dashboard (Project → Settings → Environment Variables)
and reused every deploy. Vercel stores it encrypted and write-only, so it never
appears in the repo, the workflow, or CLI output. At the login prompt the
**username is ignored** — only the password is checked. The gate **fail-closes**:
if `SITE_PASSWORD` is unset, every request is denied (`401`), so a brand-new
project stays locked (and inaccessible to you too) until you set it.
