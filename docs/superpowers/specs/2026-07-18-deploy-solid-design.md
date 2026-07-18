# Deploy Solid — design

**Date:** 2026-07-18
**Status:** approved, ready for implementation plan

## Problem

Today only `@rtc/client-react` is deployed (workflow **Deploy** / `deploy.yml` →
Vercel project `rtc-clone` → `rtc-clone.vercel.app`, plus the shared WS server →
Fly). `@rtc/client-solid` has reached full parity (contract + visual + e2e) but
has no deployment of its own. We want a **Deploy Solid** action that ships
`client-solid` to `rtc-clone-solid.vercel.app`, mirroring the existing React
client deploy.

A separate, **deferred** consistency pass (tracked in `docs/STATUS.md`, not built
here) renames the existing React deploy for symmetry.

## Constraints discovered

- The **root `vercel.json` hard-pins the build to React**: `buildCommand:
  pnpm turbo run build --filter=@rtc/client-react`, `outputDirectory:
  packages/client-react/dist`. A repo `vercel.json` overrides Vercel dashboard
  project settings, so a second Vercel project pointed at the same repo would
  still build React. The Solid deploy therefore needs its **own** build config.
- Both web clients pick real-WS vs. in-browser-simulator from `VITE_SERVER_URL`
  at build time (`packages/client-*/src/app/buildBrowserPorts.ts`). If the Fly
  URL is not inlined into the Solid bundle, the deployed Solid app silently runs
  the simulator with no WebSocket — no error, just wrong.
- New Vercel projects default to **Deployment Protection ON**
  (`ssoProtection: all_except_custom_domains`). That guards the per-deployment
  hash URL (`…-<hash>-….vercel.app`) with a 302→Vercel-login but **exempts** the
  canonical alias (`rtc-clone-solid.vercel.app`). A smoke curl must hit the
  canonical alias, not the hash URL, or a good deploy false-fails. (Learned from
  the proto deploys, PR #101.)
- The repo's fine-grained PAT **403s on Actions secret writes**, so the new
  `VERCEL_SOLID_PROJECT_ID` secret must be added by the user by hand.

## Scope

**In scope (build now):** a client-only Deploy Solid workflow + its Vercel build
config + Vercel-side project/env setup + docs.

**Out of scope (deferred to `docs/STATUS.md`):** renaming the React deploy for
symmetry.

The Solid deploy is **client-only** — it connects to the *same shared* Fly WS
server that Deploy already ships. There is no second server deploy.

## Components

### 1. `vercel.solid.json` (repo root)

The Solid twin of `vercel.json`, passed explicitly to the Vercel CLI via
`-A/--local-config` so it never collides with React's auto-detected root config:

```json
{
  "framework": "vite",
  "buildCommand": "pnpm turbo run build --filter=@rtc/client-solid",
  "outputDirectory": "packages/client-solid/dist",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "git": { "deploymentEnabled": false }
}
```

Note the asymmetry-for-now: React uses the bare `vercel.json`; Solid uses
`vercel.solid.json`. This keeps the React deploy untouched. The deferred rename
below makes both explicit (`vercel.react.json` + `-A`).

### 2. `.github/workflows/deploy-solid.yml`

A copy of `deploy.yml`'s **`deploy-client` job only** (no `deploy-server` job).
Differences from the React job:

- `name: Deploy Solid`
- `concurrency.group: deploy-solid-${{ github.ref }}`
- `VERCEL_PROJECT_ID: ${{ secrets.VERCEL_SOLID_PROJECT_ID }}`
- `-A vercel.solid.json` on the `vercel build` **and** `vercel deploy` steps
  (`vercel pull` needs no config — it keys off `VERCEL_PROJECT_ID`)
- Same "server URL was inlined" guard: `grep -rq "rtc-clone-server.fly.dev"
  .vercel/output/static`, fail loudly otherwise
- Smoke curls the **canonical alias** `https://rtc-clone-solid.vercel.app` for a
  `200`, not the per-deploy hash URL (Deployment Protection would 302 the hash
  URL)

`workflow_dispatch`-only, `permissions: contents: read`, Node 26 + Corepack +
`vercel@latest`, same as the React job. CI never runs a real deploy (needs
secrets); only `actionlint` (`lint:actions`) validates the YAML, so the workflow
must be correct by construction.

### 3. Vercel-side setup (run via the local `vercel` CLI token)

- `vercel projects add rtc-clone-solid` (org `team_Nm5Q36b0kTItH0gXCGG6fGUp`)
- `vercel env add VITE_SERVER_URL production` → `https://rtc-clone-server.fly.dev`
- Report the new `prj_…` id to the user → they add the `VERCEL_SOLID_PROJECT_ID`
  repo secret by hand (PAT 403s on secret writes).
- Deployment Protection stays at its ON default; the alias smoke handles that.

### 4. Docs

- Header comment in `deploy-solid.yml` mirroring `deploy.yml`.
- Update the `deploy.yml` comment that says *"@rtc/client-solid … has no
  deployment of its own this workstream"* — it now does.
- Refresh the `reference_vercel_deploy_topology` memory (now five deploys).

## Deferred: rename the React deploy for symmetry (STATUS.md, not built here)

A full symmetry sweep, tracked under `docs/STATUS.md` → ⚪ Optional / next step:

| # | Change |
|---|--------|
| 1 | `.github/workflows/deploy.yml` → `deploy-react.yml` |
| 2 | workflow `name: Deploy` → `Deploy React` |
| 3 | root `vercel.json` → `vercel.react.json` **+ add `-A vercel.react.json`** to its build/deploy steps (once renamed, Vercel no longer auto-detects it — the easy-to-miss coupling) |
| 4 | Vercel project `rtc-clone` → `rtc-clone-react` (dashboard rename; project id stable, only the `.vercel.app` URL changes) → `rtc-clone-react.vercel.app` |
| 5 | concurrency group `deploy-` → `deploy-react-` |
| 6 | *(optional)* repo secret `VERCEL_PROJECT_ID` → `VERCEL_REACT_PROJECT_ID`, symmetric with `VERCEL_SOLID_PROJECT_ID` (user-only secret op) |
| 7 | doc/comment sweep: any docs citing `rtc-clone.vercel.app`, CLAUDE.md deploy mentions, the memory topic file |

**Resolved sub-decision:** the server→Fly deploy job stays inside the renamed
`Deploy React` workflow (server is shared; Deploy React remains the canonical
full deploy; Solid is client-only). Not extracted into its own workflow.

## Testing / verification

- **Correct-by-construction** static checks: `actionlint` (via `lint:actions`)
  must pass on the new YAML — it is the only CI gate that sees a deploy workflow.
- **Local build sanity:** `pnpm turbo run build --filter=@rtc/client-solid`
  produces `packages/client-solid/dist` (confirms the `outputDirectory`).
- **End-to-end deploy:** after the user adds `VERCEL_SOLID_PROJECT_ID`, dispatch
  `gh workflow run deploy-solid.yml --ref main`, watch it green, and confirm
  `rtc-clone-solid.vercel.app` returns `200` and connects to the live Fly server
  (the inline guard already proves the URL is baked in).
```
