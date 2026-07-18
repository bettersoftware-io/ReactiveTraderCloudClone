# Deploy Solid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Deploy Solid` GitHub Action that ships `@rtc/client-solid` to `rtc-clone-solid.vercel.app`, mirroring the existing React client deploy.

**Architecture:** A client-only `workflow_dispatch` job copied from `deploy.yml`'s `deploy-client` job, pointed at a new Vercel project via `VERCEL_SOLID_PROJECT_ID` and a dedicated `vercel.solid.json` build config passed with `-A/--local-config` (so it never collides with the React-pinned root `vercel.json`). Solid connects to the same shared Fly WS server — no second server deploy. The deferred React-deploy rename is recorded in `docs/STATUS.md` only.

**Tech Stack:** GitHub Actions, Vercel CLI (`vercel@latest`), pnpm + Turborepo, Vite (SolidJS), actionlint.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-deploy-solid-design.md` — every task's requirements implicitly include it.
- All work happens in the isolated worktree at `.claude/worktrees/deploy-solid` (per `shipping-repo-changes`). Use worktree-relative paths for all Write/Edit; never write to the primary checkout's absolute path.
- Fly WS server URL (verbatim): `https://rtc-clone-server.fly.dev`.
- Canonical Solid alias (verbatim): `https://rtc-clone-solid.vercel.app`.
- Vercel org id (verbatim): `team_Nm5Q36b0kTItH0gXCGG6fGUp`.
- Build filter (verbatim): `pnpm turbo run build --filter=@rtc/client-solid`; output dir `packages/client-solid/dist`.
- The Solid deploy is **client-only** — no `deploy-server` job.
- Smoke must curl the **canonical alias**, not the per-deploy hash URL (new-project Deployment Protection 302s the hash URL, exempts the alias).
- CI never runs a real deploy (needs secrets); the only gate that sees the workflow is `actionlint` via `pnpm lint:actions`. The YAML must be correct by construction.
- `VERCEL_SOLID_PROJECT_ID` repo secret is added by the **user** by hand (the repo PAT 403s on secret writes).

---

### Task 1: Vercel build config + Deploy Solid workflow

**Files:**
- Create: `vercel.solid.json`
- Create: `.github/workflows/deploy-solid.yml`
- Modify: `.github/workflows/deploy.yml` (the stale "client-solid has no deployment" comment, lines ~10-13)
- Test: `pnpm lint:actions` (actionlint) + local Solid build sanity

**Interfaces:**
- Consumes: repo secrets `VERCEL_ORG_ID`, `VERCEL_TOKEN` (existing, shared) and `VERCEL_SOLID_PROJECT_ID` (new, user-added in Task 3).
- Produces: workflow file `deploy-solid.yml` dispatchable via `gh workflow run deploy-solid.yml --ref main`; build config `vercel.solid.json` consumed by its `vercel build`/`vercel deploy` steps.

- [ ] **Step 1: Create `vercel.solid.json`**

```json
{
  "framework": "vite",
  "buildCommand": "pnpm turbo run build --filter=@rtc/client-solid",
  "outputDirectory": "packages/client-solid/dist",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "git": { "deploymentEnabled": false }
}
```

- [ ] **Step 2: Create `.github/workflows/deploy-solid.yml`**

```yaml
name: Deploy Solid

# Production deploy of the @rtc/client-solid web client (Vercel). Runs ON DEMAND
# ONLY (manual trigger) — a merge to main does NOT auto-deploy. Start it from the
# Actions tab ("Run workflow") or `gh workflow run deploy-solid.yml`.
#
# CLIENT-ONLY BY DESIGN: the Solid client connects to the SAME shared WS server
# that the `Deploy` (React) workflow ships to Fly.io — there is no second server
# deploy here. The build is pinned to @rtc/client-solid via vercel.solid.json
# (passed with `-A`), so it never collides with the React-pinned root vercel.json.
on:
  workflow_dispatch:

concurrency:
  group: deploy-solid-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  deploy-client:
    name: client-solid → vercel
    runs-on: ubuntu-latest
    env:
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_SOLID_PROJECT_ID }}
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

      # `-A vercel.solid.json` selects the Solid build (filter + output dir) so the
      # React-pinned root vercel.json is never auto-detected here.
      - name: Build (Vercel bakes VITE_SERVER_URL from pulled env)
        run: vercel build --prod -A vercel.solid.json --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      # If VITE_SERVER_URL is not inlined, the client silently falls back to the
      # in-browser simulator and never opens a WebSocket — no error, just wrong.
      # Fail loudly BEFORE deploying rather than ship a simulator build.
      - name: Guard — server URL was inlined into the client bundle
        run: |
          if ! grep -rq "rtc-clone-server.fly.dev" .vercel/output/static; then
            echo "::error::VITE_SERVER_URL absent from build output — client would run the simulator with no WebSocket. Check turbo.json build.env and the Vercel Production env vars."
            exit 1
          fi
          echo "OK: Fly WS URL is present in the built client bundle."

      - name: Deploy prebuilt
        id: deploy
        run: |
          vercel deploy --prebuilt --prod -A vercel.solid.json --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      # New Vercel projects default to Deployment Protection ON, which 302s the
      # per-deploy hash URL but EXEMPTS the canonical alias. Smoke the alias.
      - name: Smoke — deployed client responds on the canonical alias
        run: |
          code=$(curl -s -o /dev/null -w "%{http_code}" "https://rtc-clone-solid.vercel.app")
          echo "Got HTTP $code"
          test "$code" = "200"
```

- [ ] **Step 3: Update the stale comment in `.github/workflows/deploy.yml`**

Replace the block (currently lines ~10-13) that reads:

```
# "the client" here is @rtc/client-react ONLY, BY DESIGN — the build command is
# pinned in the root vercel.json (`--filter=@rtc/client-react`). @rtc/client-solid
# is still a walking skeleton (see CLAUDE.md) and has no deployment of its own
# this workstream; revisit once it reaches parity with the deployed react client.
```

with:

```
# "the client" here is @rtc/client-react ONLY, BY DESIGN — the build command is
# pinned in the root vercel.json (`--filter=@rtc/client-react`). @rtc/client-solid
# is deployed separately by the `Deploy Solid` workflow (deploy-solid.yml), which
# ships it to rtc-clone-solid.vercel.app against this same shared Fly WS server.
```

- [ ] **Step 4: Verify the workflow lints (actionlint)**

Run: `pnpm lint:actions`
Expected: PASS — no findings on `deploy-solid.yml` (or `deploy.yml`).

- [ ] **Step 5: Verify the Solid build produces the configured output dir**

Run: `pnpm turbo run build --filter=@rtc/client-solid`
Expected: PASS, and `packages/client-solid/dist/index.html` exists — confirms `vercel.solid.json`'s `outputDirectory` is correct.

Run: `test -f packages/client-solid/dist/index.html && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add vercel.solid.json .github/workflows/deploy-solid.yml .github/workflows/deploy.yml
git commit -m "feat(deploy): add Deploy Solid action → rtc-clone-solid.vercel.app"
```

---

### Task 2: STATUS.md deferred-rename entry

**Files:**
- Modify: `docs/STATUS.md` (⚪ Optional / next step section)
- Test: `pnpm check:doc-links`

**Interfaces:**
- Consumes: nothing.
- Produces: a tracked backlog entry for the deferred React-deploy symmetry rename.

- [ ] **Step 1: Add the deferred entry under `## ⚪ Optional / next step`**

Append this bullet to that section in `docs/STATUS.md`:

```markdown
- **Rename the React deploy for Deploy-React/Deploy-Solid symmetry** — now that `Deploy Solid` (`deploy-solid.yml` → `rtc-clone-solid.vercel.app`, spec: [superpowers/specs/2026-07-18-deploy-solid-design.md](superpowers/specs/2026-07-18-deploy-solid-design.md)) ships, the original React deploy is asymmetric (bare `Deploy` / `vercel.json` / `rtc-clone`). A full symmetry sweep, deferred: (1) `.github/workflows/deploy.yml` → `deploy-react.yml`; (2) workflow `name: Deploy` → `Deploy React`; (3) root `vercel.json` → `vercel.react.json` **plus add `-A vercel.react.json`** to its build/deploy steps — once renamed, Vercel no longer auto-detects it (the easy-to-miss coupling); (4) Vercel project `rtc-clone` → `rtc-clone-react` (dashboard rename; project id stable, only the `.vercel.app` URL changes) → `rtc-clone-react.vercel.app`; (5) concurrency group `deploy-` → `deploy-react-`; (6) *(optional)* repo secret `VERCEL_PROJECT_ID` → `VERCEL_REACT_PROJECT_ID`, symmetric with `VERCEL_SOLID_PROJECT_ID` (user-only secret op); (7) doc/comment sweep for `rtc-clone.vercel.app`. The server→Fly deploy job stays inside the renamed `Deploy React` workflow (server is shared; Solid is client-only). Not spec'd as its own plan.
```

- [ ] **Step 2: Verify doc links resolve**

Run: `pnpm check:doc-links`
Expected: PASS — the new relative link to the spec resolves.

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): track deferred Deploy-React symmetry rename"
```

---

### Task 3: Vercel-side setup (operational — run in-session, not by a plan executor)

> This task performs live actions against the user's Vercel org via the already-authenticated local `vercel` CLI token (`~/Library/Application Support/com.vercel.cli/auth.json`). It creates no repo files. It is outward-facing — the user pre-approved it. Run it from the primary checkout (the CLI is repo-independent); do not confuse with worktree file edits.

**Files:** none (operational).

**Interfaces:**
- Consumes: local `vercel` CLI auth token.
- Produces: Vercel project `rtc-clone-solid` (a new `prj_…` id) with `VITE_SERVER_URL` set; the id is reported to the user for the `VERCEL_SOLID_PROJECT_ID` secret.

- [ ] **Step 1: Confirm the local CLI is authenticated**

Run: `vercel whoami`
Expected: prints the Vercel username (not a login prompt). If it prompts, stop and ask the user to `vercel login` via a `!` command.

- [ ] **Step 2: Create the Vercel project**

Run: `vercel projects add rtc-clone-solid --scope team_Nm5Q36b0kTItH0gXCGG6fGUp`
Expected: project created (or "already exists" — idempotent, fine). Capture the `prj_…` id (via `vercel projects ls` or the create output).

- [ ] **Step 3: Set the production `VITE_SERVER_URL` env**

Run: `printf 'https://rtc-clone-server.fly.dev' | vercel env add VITE_SERVER_URL production --scope team_Nm5Q36b0kTItH0gXCGG6fGUp` (link the project first if prompted: `vercel link --project rtc-clone-solid --yes --scope team_Nm5Q36b0kTItH0gXCGG6fGUp`)
Expected: env var added to Production.

- [ ] **Step 4: Report the project id to the user**

Tell the user the exact `prj_…` id and ask them to add repo secret `VERCEL_SOLID_PROJECT_ID=<id>` by hand (the repo PAT 403s on secret writes). This gates the first successful deploy run.

---

### Task 4: Refresh the deploy-topology memory (post-merge)

**Files:** none in-repo — updates the user's auto-memory.

- [ ] **Step 1:** After the PR merges, update `reference_vercel_deploy_topology` memory to note the fifth deploy (Deploy Solid → `rtc-clone-solid`, project id, client-only, alias smoke), and the deferred React-rename tracked in STATUS.md.

---

## Verification (whole-branch, before merge)

- `pnpm lint:actions` — actionlint clean (the one CI gate that sees the workflow).
- `pnpm check:doc-links` — STATUS.md link resolves.
- `pnpm turbo run build --filter=@rtc/client-solid` — dist produced.
- After the user adds `VERCEL_SOLID_PROJECT_ID`: `gh workflow run deploy-solid.yml --ref main`, watch green, confirm `https://rtc-clone-solid.vercel.app` → `200` and the app connects to the live Fly server. (This is post-merge — CI can't run a real deploy.)
