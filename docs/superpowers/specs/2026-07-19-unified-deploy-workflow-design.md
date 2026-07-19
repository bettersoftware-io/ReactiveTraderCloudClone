# Unified deploy workflow + client-react/solid symmetry + sourcemaps

**Date:** 2026-07-19
**Status:** Approved (design)
**Supersedes:** STATUS.md line 45 ("Rename the React deploy for Deploy-React/Deploy-Solid symmetry") — the rename sweep is folded into this unified design rather than executed as a like-for-like `deploy.yml` → `deploy-react.yml` split.

## Problem

Three asymmetries / gaps around production deploys:

1. **Two divergent client deploy workflows.** `deploy.yml` (React + Fly server, name `Deploy`, relies on auto-detected root `vercel.json`) and `deploy-solid.yml` (Solid only, name `Deploy Solid`, `-A vercel.solid.json`). They duplicate ~90% of their steps and drift independently. STATUS.md line 45 tracked a symmetry sweep to rename React's half; instead we unify.

2. **Server (Fly) deploy is coupled to the React client deploy.** The backend is redeployed far less often than the clients, and there is no way to deploy it independently, nor to deploy a client without touching the (unchanged) server job's expectations.

3. **No sourcemaps in production builds.** Profiling the deployed app shows minified frames — you cannot see which components appear in a flamechart. There is no toggle to ship a debuggable build on demand.

## Goals

- One on-demand `Deploy` workflow that can deploy **any independent subset** of `{react, solid, server}` in a single run (checkboxes), including react+server together (today's combined behaviour) or the server alone.
- An `include_sourcemaps` checkbox that, when set, ships debuggable React/Solid builds (external `.map` files → real component names in the DevTools flamechart). Server build unaffected.
- Full client-react/client-solid symmetry: symmetric Vercel config filenames, symmetric project/URL naming (`rtc-clone` → `rtc-clone-react`), symmetric concurrency and secret conventions.

## Non-goals

- No change to *what* gets built or to the apps themselves (only build flags + deploy plumbing).
- No auto-deploy on merge — deploys stay strictly on-demand (`workflow_dispatch`).
- No rewrite of historical `docs/superpowers/specs|plans/**` (point-in-time records); doc sweep touches live docs only.
- Sourcemaps for the RN client / the Fly server are out of scope.

## Decisions (locked with user)

- **Input shape:** boolean checkboxes, not a single `choice` dropdown — so any subset is selectable in one run.
- **Rename scope:** full symmetry *including* the public URL (`rtc-clone` → `rtc-clone-react`), accepting that `rtc-clone.vercel.app` breaks.

## Design

### A. Unified `Deploy` workflow (`.github/workflows/deploy.yml`; delete `deploy-solid.yml`)

Single `workflow_dispatch` with four boolean inputs → conditional jobs. Follows the per-target selection pattern already used by `deploy-cd-proto.yml`.

```yaml
name: Deploy
on:
  workflow_dispatch:
    inputs:
      deploy_react:       { type: boolean, default: true,  description: "Deploy @rtc/client-react → Vercel (rtc-clone-react)" }
      deploy_solid:       { type: boolean, default: false, description: "Deploy @rtc/client-solid → Vercel (rtc-clone-solid)" }
      deploy_server:      { type: boolean, default: false, description: "Deploy @rtc/server → Fly.io" }
      include_sourcemaps: { type: boolean, default: false, description: "Ship debuggable client builds (external sourcemaps). React/Solid only." }

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  guard:   # fails fast if nothing is selected (else the run is green-but-did-nothing)
  server:  { needs: guard, if: ${{ inputs.deploy_server }}, ... }   # current Fly job, verbatim
  react:   { needs: guard, if: ${{ inputs.deploy_react }},  ... }   # current deploy-client job + -A vercel.react.json + sourcemap env
  solid:   { needs: guard, if: ${{ inputs.deploy_solid }},  ... }   # current deploy-solid-client job + sourcemap env
```

- **`guard` job**: a trivial job that runs unconditionally and fails with a clear message if `!deploy_react && !deploy_solid && !deploy_server`, so an all-unchecked dispatch is a visible red rather than a silent no-op. All three deploy jobs `needs: guard`.
- **Independence**: the three deploy jobs have no inter-dependencies (matches today — the Fly URL is a build-time constant baked into the client, so a client build never waits on the server). `needs: guard` only gates on the cheap validation.
- **Concurrency**: one group per ref (`deploy-${{ github.ref }}`) covers the whole run; a second dispatch on the same ref cancels the in-progress one.
- **Reproducing today's behaviour**: `gh workflow run deploy.yml -f deploy_react=true -f deploy_server=true`.

The `server`, `react`, and `solid` job bodies are the existing steps moved verbatim, with only the deltas below (B/C/D).

### B. Vercel config symmetry

- `git mv vercel.json vercel.react.json` (contents unchanged).
- The `react` job passes `-A vercel.react.json` to **both** `vercel build` and `vercel deploy`.
- **Coupling note (documented in the workflow):** once root `vercel.json` no longer exists, Vercel cannot auto-detect the config, so `-A vercel.react.json` is mandatory on every Vercel CLI invocation in the react job — exactly as the solid job already does with `vercel.solid.json`. This is symmetric and intentional.
- `vercel.solid.json` unchanged.

### C. Sourcemaps toggle

Chain: workflow step env → `vercel build` (inherits process env) → `pnpm turbo run build` → `vite build` → `vite.config.ts`.

- **`turbo.json`**: add `RTC_SOURCEMAPS` to `tasks.build.env`. In Turbo strict env mode, vars listed in `build.env` are both hashed into the cache key (so a sourcemap build and a non-sourcemap build get distinct cache entries — no stale non-sourcemap artifact served for a sourcemap request) **and** passed through to the task. This is the same mechanism `VITE_SERVER_URL` relies on today.
- **`packages/client-react/vite.config.ts`** and **`packages/client-solid/vite.config.ts`**: set `build.sourcemap = process.env.RTC_SOURCEMAPS === "1"` (currently `build: { outDir: "dist" }` in both). Default (`undefined`/unset) → `false`, i.e. today's behaviour.
- **`react` + `solid` jobs**: on the build step, `env: { RTC_SOURCEMAPS: ${{ inputs.include_sourcemaps && '1' || '' }} }`.
- **Effect:** external `.map` files emitted into `dist/` → deployed as static assets → DevTools resolves real component names in the flamechart.
- **Trade-off (documented):** sourcemaps are then publicly served, so the bundled source becomes inspectable. Acceptable and arguably desirable for a capability-showcase clone. The Fly/server build is untouched.

### D. Project / URL rename `rtc-clone` → `rtc-clone-react`

- **User action (Vercel dashboard):** rename the project `rtc-clone` → `rtc-clone-react`. The project *id* is stable, so only the canonical `.vercel.app` URL changes (`rtc-clone.vercel.app` → `rtc-clone-react.vercel.app`).
- **User action (optional, repo secret):** add `VERCEL_REACT_PROJECT_ID` (copy of the existing `VERCEL_PROJECT_ID` value) for naming symmetry with `VERCEL_SOLID_PROJECT_ID`.
- **Workflow (non-breaking):** `VERCEL_PROJECT_ID: ${{ secrets.VERCEL_REACT_PROJECT_ID || secrets.VERCEL_PROJECT_ID }}` — a GitHub-expression fallback so the deploy works both before and after the secret is added (no flag-day).
- **Smoke check:** the react job smokes `https://rtc-clone-react.vercel.app` (the canonical alias, exempt from Deployment Protection), matching the solid job's alias-smoke pattern.
- **Concurrency:** the old per-workflow `deploy-` / `deploy-solid-` groups collapse into the single unified `deploy-${{ github.ref }}`.

### E. Doc sweep (live docs only)

Update live pointers to the new URL / unified workflow; **leave `docs/superpowers/specs|plans/**` untouched** (historical records):

- `docs/STATUS.md` — resolve line 45; note the unification + new URL.
- `docs/architecture/07-communication-patterns.md` — `rtc-clone.vercel.app` → `rtc-clone-react.vercel.app`.
- `deploy/**/README*`, `CLAUDE.md`, `docs/env-files.md` (and any other live doc surfaced by a fresh `grep -rl "rtc-clone.vercel.app\b"` excluding `docs/superpowers/`) — URL + reference to the unified `Deploy` workflow / `vercel.react.json`.

## Verification

No production secrets are available locally, so the live deploy itself is only provable by the user running it once. Locally / in CI we verify:

- Workflow YAML validity (`actionlint` if installed; otherwise a YAML parse).
- `pnpm turbo run build --dry` still resolves with `RTC_SOURCEMAPS` added to `build.env`.
- Both `vite.config.ts` files typecheck (`pnpm typecheck`).
- `RTC_SOURCEMAPS=1 pnpm build --filter=@rtc/client-react` emits `.map` files in `dist/`; unset → none (proves the toggle).
- `pnpm build --filter=@rtc/client-react` still succeeds with the renamed config referenced via `-A vercel.react.json` (spot-check nothing local reads root `vercel.json` by name).
- Existing repo gates (Biome/ESLint/stylelint, `check:doc-links`) pass on the doc edits.

## Rollback

- Revert the merge commit. The Vercel dashboard rename is independently reversible (rename back; id stable). The old `VERCEL_PROJECT_ID` secret is retained (fallback path), so reverting the workflow needs no secret changes.

## Risks

- **Vercel env inheritance for `RTC_SOURCEMAPS`.** The design assumes `vercel build` forwards the shell/step environment to the build command (as it does for the process env generally, layered under the pulled project env). If a probe during implementation shows it does *not* reach Vite, the fallback is to inject the flag via a Vercel Project Environment Variable or a wrapper build command — verify early in implementation.
- **URL break.** `rtc-clone.vercel.app` stops resolving after the dashboard rename; the doc sweep + STATUS note mitigate stale references. Accepted by the user.
