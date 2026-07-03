# Prototype deploy (React port)

Deploys the **`@rtc/client-prototype` React port** — the readable, self-contained
React port of the v2 design — to its own Vercel project, `rtc-clone-proto` →
**https://rtc-clone-proto.vercel.app**, behind a shared password.

This is the *running code* prototype. The hand-authored HTML design mockup ships
separately via the **Deploy Claude Design Prototype** workflow →
`rtc-clone-cd-proto`; see [`deploy/cd-proto/README.md`](../cd-proto/README.md).

Completely separate from the main FX app: different Vercel project, no Git
auto-deploy, on-demand only. Updating one never touches the other.

## How it works

`deploy.sh` is the single source of truth (the GitHub Action installs deps, then
calls it). At deploy time it:

1. Builds the SPA: `pnpm turbo run build --filter=@rtc/client-prototype` →
   `packages/client-prototype/dist`.
2. Generates a tiny Basic-Auth gate (`middleware.ts` + `package.json` +
   `vercel.json`) into a throwaway dir — nothing source-like is committed, so the
   strict monorepo linters stay out of it.
3. Copies the built `dist/` in as the deployment root (never committed).
4. `vercel deploy --prod` to the `rtc-clone-proto` project (`framework:null`,
   static serve — the app has no client-side router, so no SPA rewrite), then
   smoke-tests that an unauthenticated request is gated (`401`).

## One-time setup (Vercel)

1. Create a Vercel project named **`rtc-clone-proto`** in the
   `nasantsogt-baasanjavs-projects` scope (Add New → Project; no Git connection —
   this deploys via CLI only).
2. Copy its **project id** (`prj_…`, visible in the project's dashboard URL /
   Settings → General).
3. Add it as a GitHub **Actions variable** (not a secret — project ids aren't
   sensitive): repo Settings → Secrets and variables → Actions → **Variables** →
   New variable → `VERCEL_PROTO_PROJECT_ID` = `prj_…`. The workflow reads it and
   passes it to the script; if it's missing the deploy fails fast with a clear
   message rather than shipping to the wrong project.
   (For local runs instead, export `VERCEL_PROJECT_ID=prj_…` or paste it over the
   sentinel in `deploy/proto/deploy.sh`.)
4. Set **`SITE_PASSWORD`** on the project (Settings → Environment Variables,
   Production + Preview) — the shared password the gate checks.

`VERCEL_TOKEN` (a secret used by CI) already exists for the main deploy and is
reused here.

## Deploy it (two ways)

### 1. The button (GitHub Actions — recommended)

Actions tab → **Deploy Prototype** → **Run workflow**. No inputs. Or from the CLI:

```bash
gh workflow run deploy-proto.yml
```

### 2. Locally

Requires the Vercel CLI logged in (`vercel login`) with access to the
`nasantsogt-baasanjavs-projects` scope, and `VERCEL_PROJECT_ID` set (see setup):

```bash
VERCEL_PROJECT_ID=prj_… ./deploy/proto/deploy.sh
```

## The password

`SITE_PASSWORD` is an environment variable on the `rtc-clone-proto` Vercel
project (Production + Preview), set once in the dashboard and reused every
deploy. Vercel stores it encrypted and write-only, so it never appears in the
repo, the workflow, or CLI output. At the login prompt the **username is
ignored** — only the password is checked.
