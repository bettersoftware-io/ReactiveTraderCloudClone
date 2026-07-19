# Unified Deploy Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold `deploy.yml` + `deploy-solid.yml` into one on-demand `Deploy` workflow with independent react/solid/server checkboxes and an `include_sourcemaps` toggle, and complete the `rtc-clone` → `rtc-clone-react` client-react/solid symmetry sweep.

**Architecture:** A single `workflow_dispatch` with four boolean inputs gates four conditional jobs (`guard`, `server`, `react`, `solid`) — the existing job bodies moved verbatim with three deltas: `-A vercel.react.json` on the react job, an `RTC_SOURCEMAPS` build-env on the client jobs, and a fallback project-id secret. Sourcemaps are wired through Turbo's strict `build.env` into each client's `vite.config.ts`.

**Tech Stack:** GitHub Actions (`workflow_dispatch`), Vercel CLI, Fly CLI, Turborepo (strict env mode), Vite.

Spec: [../specs/2026-07-19-unified-deploy-workflow-design.md](../specs/2026-07-19-unified-deploy-workflow-design.md)

## Global Constraints

- **Deploys stay on-demand only** — `on: workflow_dispatch`. Never add `push`/`pull_request`/`schedule` triggers.
- **`RTC_SOURCEMAPS` convention:** `"1"` = emit sourcemaps; unset or empty = off (today's behaviour).
- **Turbo strict env mode:** any env var read during `turbo run build` MUST be declared in `turbo.json` `tasks.build.env`, or Turbo strips it before Vite sees it (the same trap that once dropped `VITE_SERVER_URL`).
- **Vercel config via `-A`:** once root `vercel.json` is renamed, Vercel cannot auto-detect it — `-A vercel.react.json` is mandatory on **every** Vercel CLI call in the react job (build *and* deploy), exactly as the solid job uses `-A vercel.solid.json`.
- **Do NOT edit `docs/superpowers/specs/**` or `docs/superpowers/plans/**`** other than creating this plan — they are point-in-time records.
- **Pinned action SHAs:** reuse the exact pinned `uses:` refs already in the repo — `actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7` and `actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0`. Do not bump or unpin.
- **Commit trailer (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FSBT2hKxdjSPc1dY1tTxux
  ```
- **Repo gates that must stay green:** `biome ci .` (JSON/TS), ESLint, stylelint, `pnpm check:doc-links` (md links + anchors). Run the relevant ones per task.

---

### Task 1: Sourcemap toggle wiring (Turbo + both Vite configs)

Wire an `RTC_SOURCEMAPS` env var end-to-end so a client build emits external `.map` files only when it is `"1"`. This task has a real, local test cycle and depends on nothing else.

**Files:**
- Modify: `turbo.json` (add `RTC_SOURCEMAPS` to `tasks.build.env`)
- Modify: `packages/client-react/vite.config.ts` (the `build:` block, currently `build: { outDir: "dist" }`)
- Modify: `packages/client-solid/vite.config.ts` (the `build:` block, currently `build: { outDir: "dist" }`)

**Interfaces:**
- Produces: the env var name `RTC_SOURCEMAPS` (value `"1"` = on), consumed by Task 2's workflow build steps.

- [ ] **Step 1: Prove the current default emits NO sourcemaps (baseline)**

Run:
```bash
pnpm build --filter=@rtc/client-react
ls packages/client-react/dist/assets/*.map 2>/dev/null && echo "MAPS PRESENT" || echo "no maps (expected)"
```
Expected: `no maps (expected)` — Vite's `build.sourcemap` defaults to `false`.

- [ ] **Step 2: Declare `RTC_SOURCEMAPS` in Turbo's build env**

In `turbo.json`, change the `build` task's `env` array from:
```json
      "env": ["VITE_SERVER_URL", "DEV"]
```
to:
```json
      "env": ["VITE_SERVER_URL", "DEV", "RTC_SOURCEMAPS"]
```

- [ ] **Step 3: Read the flag in the React Vite config**

In `packages/client-react/vite.config.ts`, change:
```ts
  build: {
    outDir: "dist",
  },
```
to:
```ts
  build: {
    outDir: "dist",
    // On-demand debuggable production build: the Deploy workflow sets
    // RTC_SOURCEMAPS=1 (declared in turbo.json build.env so strict-mode Turbo
    // passes it through) so a profiled deploy shows real component names in the
    // flamechart. Unset/"" → false, i.e. today's minified build.
    sourcemap: process.env.RTC_SOURCEMAPS === "1",
  },
```

- [ ] **Step 4: Read the flag in the Solid Vite config**

In `packages/client-solid/vite.config.ts`, apply the identical change to its `build:` block:
```ts
  build: {
    outDir: "dist",
    // On-demand debuggable production build: the Deploy workflow sets
    // RTC_SOURCEMAPS=1 (declared in turbo.json build.env so strict-mode Turbo
    // passes it through) so a profiled deploy shows real component names in the
    // flamechart. Unset/"" → false, i.e. today's minified build.
    sourcemap: process.env.RTC_SOURCEMAPS === "1",
  },
```

- [ ] **Step 5: Prove the flag ON emits sourcemaps**

Run (Turbo re-runs the build because `RTC_SOURCEMAPS` is now part of the cache key):
```bash
RTC_SOURCEMAPS=1 pnpm build --filter=@rtc/client-react
ls packages/client-react/dist/assets/*.map >/dev/null 2>&1 && echo "MAPS PRESENT (expected)" || echo "NO MAPS — FAIL"
```
Expected: `MAPS PRESENT (expected)`.

- [ ] **Step 6: Prove the flag OFF again still emits none (round-trip)**

Run:
```bash
pnpm build --filter=@rtc/client-react --force
ls packages/client-react/dist/assets/*.map 2>/dev/null && echo "MAPS PRESENT — FAIL" || echo "no maps (expected)"
```
Expected: `no maps (expected)`.

- [ ] **Step 7: Prove Solid honours the flag too**

Run:
```bash
RTC_SOURCEMAPS=1 pnpm build --filter=@rtc/client-solid
ls packages/client-solid/dist/assets/*.map >/dev/null 2>&1 && echo "MAPS PRESENT (expected)" || echo "NO MAPS — FAIL"
```
Expected: `MAPS PRESENT (expected)`.

- [ ] **Step 8: Typecheck + format the config edits**

Run:
```bash
pnpm typecheck --filter=@rtc/client-react --filter=@rtc/client-solid
npx @biomejs/biome ci turbo.json packages/client-react/vite.config.ts packages/client-solid/vite.config.ts
```
Expected: typecheck passes; Biome reports no errors.

- [ ] **Step 9: Commit**

```bash
git add turbo.json packages/client-react/vite.config.ts packages/client-solid/vite.config.ts
git commit -m "$(cat <<'EOF'
feat(deploy): add RTC_SOURCEMAPS build toggle for debuggable client builds

turbo.json build.env + both clients' vite.config build.sourcemap read
process.env.RTC_SOURCEMAPS === "1". Default (unset) keeps today's minified
build; the Deploy workflow sets it per-run for a profileable deploy.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FSBT2hKxdjSPc1dY1tTxux
EOF
)"
```

---

### Task 2: Unified `Deploy` workflow + `vercel.json` rename

Replace the two client-deploy workflows with one, and rename the root Vercel config for symmetry. These are coupled — renaming `vercel.json` without the workflow's `-A vercel.react.json` breaks the deploy — so they ship together.

**Files:**
- Rename: `vercel.json` → `vercel.react.json` (via `git mv`; contents unchanged)
- Replace: `.github/workflows/deploy.yml` (full new content below)
- Delete: `.github/workflows/deploy-solid.yml`
- Unchanged (reference only): `vercel.solid.json`

**Interfaces:**
- Consumes: `RTC_SOURCEMAPS` env convention from Task 1.
- Consumes: repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_SOLID_PROJECT_ID`, `FLY_API_TOKEN`, and (optional, added later by the user) `VERCEL_REACT_PROJECT_ID`.

- [ ] **Step 1: Rename the root Vercel config**

```bash
git mv vercel.json vercel.react.json
```

- [ ] **Step 2: Confirm nothing local reads root `vercel.json` by name**

Run:
```bash
grep -rn '"vercel\.json"\|/vercel\.json\| vercel\.json' --include='*.ts' --include='*.mjs' --include='*.cjs' --include='*.js' . | grep -v node_modules | grep -v '.claude/worktrees' || echo "no code references to root vercel.json (expected)"
pnpm build --filter=@rtc/client-react
```
Expected: no code references; the build still succeeds (proves local tooling never depended on the root `vercel.json` filename — only the Vercel CLI does, and that now gets `-A`).

- [ ] **Step 3: Write the unified `deploy.yml`**

Replace the entire contents of `.github/workflows/deploy.yml` with:

```yaml
name: Deploy

# On-demand production deploy of any subset of the three deployables. Runs
# ON DEMAND ONLY (manual trigger) — a merge to main does NOT auto-deploy. Start
# it from the Actions tab ("Run workflow", tick the targets) or e.g.
#   gh workflow run deploy.yml -f deploy_react=true -f deploy_server=true
#
# The three deploy jobs are INDEPENDENT — tick any combination:
#   - deploy_react  → @rtc/client-react → Vercel (rtc-clone-react.vercel.app)
#   - deploy_solid  → @rtc/client-solid → Vercel (rtc-clone-solid.vercel.app)
#   - deploy_server → @rtc/server       → Fly.io  (rtc-clone-server.fly.dev)
# Both web clients connect to the SAME shared Fly WS server (the Fly URL is a
# build-time constant baked into each client), so a client build never waits on
# the server job. The server is deployed far less often than the clients, hence
# its own opt-in checkbox (default off).
#
# include_sourcemaps ships a debuggable build of the ticked CLIENT(s) — external
# .map files, so a profiled deploy shows real component names in the flamechart.
# It has no effect on the server job.
on:
  workflow_dispatch:
    inputs:
      deploy_react:
        description: "Deploy @rtc/client-react → Vercel (rtc-clone-react)"
        type: boolean
        default: true
      deploy_solid:
        description: "Deploy @rtc/client-solid → Vercel (rtc-clone-solid)"
        type: boolean
        default: false
      deploy_server:
        description: "Deploy @rtc/server → Fly.io"
        type: boolean
        default: false
      include_sourcemaps:
        description: "Ship debuggable client builds (external sourcemaps). React/Solid only."
        type: boolean
        default: false

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  # Fail a nothing-ticked dispatch loudly, rather than run green-but-do-nothing.
  # All deploy jobs gate on this so an empty selection is a single visible red.
  guard:
    name: validate selection
    runs-on: ubuntu-latest
    steps:
      - name: At least one target must be selected
        run: |
          if [ "${{ inputs.deploy_react }}" != "true" ] \
             && [ "${{ inputs.deploy_solid }}" != "true" ] \
             && [ "${{ inputs.deploy_server }}" != "true" ]; then
            echo "::error::No deploy target selected. Tick at least one of deploy_react / deploy_solid / deploy_server."
            exit 1
          fi
          echo "Targets — react=${{ inputs.deploy_react }} solid=${{ inputs.deploy_solid }} server=${{ inputs.deploy_server }} sourcemaps=${{ inputs.include_sourcemaps }}"

  server:
    name: server → fly.io
    needs: guard
    if: ${{ inputs.deploy_server }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7

      - name: Install flyctl
        run: |
          curl -L https://fly.io/install.sh | sh
          echo "$HOME/.fly/bin" >> "$GITHUB_PATH"

      # AUTH_SECRET (HMAC signing secret) and AUTH_USERS (the "user:pass,..."
      # credential roster) are Fly secrets set BY HAND (`flyctl secrets set`) —
      # this deploy token can't set secrets, only deploy code.
      - name: Deploy
        run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      - name: Smoke — /health returns 200
        run: curl -fsS https://rtc-clone-server.fly.dev/health

  react:
    name: client-react → vercel
    needs: guard
    if: ${{ inputs.deploy_react }}
    runs-on: ubuntu-latest
    env:
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      # Non-breaking fallback: prefer the symmetric VERCEL_REACT_PROJECT_ID once
      # you add it, else keep using the original VERCEL_PROJECT_ID. Renaming the
      # Vercel project to rtc-clone-react leaves the project id stable, so the
      # existing secret keeps working either way.
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_REACT_PROJECT_ID || secrets.VERCEL_PROJECT_ID }}
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

      # `-A vercel.react.json` selects the React build (filter + output dir); once
      # the root vercel.json was renamed, Vercel no longer auto-detects it, so
      # every Vercel CLI call here must pass `-A`. RTC_SOURCEMAPS is inherited by
      # the turbo/vite build (declared in turbo.json build.env).
      - name: Build (Vercel bakes VITE_SERVER_URL from pulled env)
        run: vercel build --prod -A vercel.react.json --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          RTC_SOURCEMAPS: ${{ inputs.include_sourcemaps && '1' || '' }}

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
        run: vercel deploy --prebuilt --prod -A vercel.react.json --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      # New Vercel projects default to Deployment Protection ON, which 302s the
      # per-deploy hash URL but EXEMPTS the canonical alias. Smoke the alias.
      - name: Smoke — deployed client responds on the canonical alias
        run: |
          code=$(curl -s -o /dev/null -w "%{http_code}" "https://rtc-clone-react.vercel.app")
          echo "Got HTTP $code"
          test "$code" = "200"

  solid:
    name: client-solid → vercel
    needs: guard
    if: ${{ inputs.deploy_solid }}
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
      # React-pinned vercel.react.json is never auto-detected here.
      - name: Build (Vercel bakes VITE_SERVER_URL from pulled env)
        run: vercel build --prod -A vercel.solid.json --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          RTC_SOURCEMAPS: ${{ inputs.include_sourcemaps && '1' || '' }}

      - name: Guard — server URL was inlined into the client bundle
        run: |
          if ! grep -rq "rtc-clone-server.fly.dev" .vercel/output/static; then
            echo "::error::VITE_SERVER_URL absent from build output — client would run the simulator with no WebSocket. Check turbo.json build.env and the Vercel Production env vars."
            exit 1
          fi
          echo "OK: Fly WS URL is present in the built client bundle."

      - name: Deploy prebuilt
        run: vercel deploy --prebuilt --prod -A vercel.solid.json --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Smoke — deployed client responds on the canonical alias
        run: |
          code=$(curl -s -o /dev/null -w "%{http_code}" "https://rtc-clone-solid.vercel.app")
          echo "Got HTTP $code"
          test "$code" = "200"
```

- [ ] **Step 4: Delete the now-folded-in Solid workflow**

```bash
git rm .github/workflows/deploy-solid.yml
```

- [ ] **Step 5: Validate YAML well-formedness (offline)**

There is no `actionlint` in this environment; Ruby's built-in YAML parser (always on macOS) checks well-formedness. It does NOT validate the Actions schema/expressions — that is proven only when the user runs the workflow.

Run:
```bash
ruby -ryaml -e 'YAML.load_file(".github/workflows/deploy.yml"); puts "deploy.yml: well-formed"'
test ! -f .github/workflows/deploy-solid.yml && echo "deploy-solid.yml: removed"
```
Expected: `deploy.yml: well-formed` and `deploy-solid.yml: removed`.

- [ ] **Step 6: Diff-review against the proven pattern**

Read the new `deploy.yml` alongside the still-present `.github/workflows/deploy-cd-proto.yml` and confirm: (a) `guard` uses `needs`/`if` correctly, (b) both client jobs pass `-A` on **both** `vercel build` and `vercel deploy`, (c) the react job smokes `rtc-clone-react.vercel.app`, (d) the sourcemap expression is `${{ inputs.include_sourcemaps && '1' || '' }}` on both client build steps, (e) the fallback secret expression is present on the react job only. No command — a read-and-confirm gate.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/deploy.yml vercel.react.json
git rm --cached vercel.json 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(deploy): unify react/solid/server deploy into one Deploy workflow

Fold deploy-solid.yml into deploy.yml with independent deploy_react /
deploy_solid / deploy_server checkboxes + a guard job for empty selection, and
add include_sourcemaps to both client jobs. Rename root vercel.json ->
vercel.react.json (passed with -A, symmetric with vercel.solid.json) and rename
the React deploy target to rtc-clone-react.vercel.app, with a non-breaking
VERCEL_REACT_PROJECT_ID || VERCEL_PROJECT_ID secret fallback.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FSBT2hKxdjSPc1dY1tTxux
EOF
)"
```
(The `git mv` from Step 1 already staged the rename; the explicit `git rm --cached` is a harmless belt-and-braces in case the rename was re-materialised.)

---

### Task 3: Live-doc sweep

Update every **live** doc that names the old workflow topology or `rtc-clone.vercel.app`, and resolve STATUS.md line 45. Historical `docs/superpowers/**` records are left untouched (per Global Constraints).

**Files:**
- Modify: `README.md` (the `### Main app (client + server)` subsection, ~lines 345–357)
- Modify: `docs/DEPLOY.md` (intro, secrets list, "Deploying" section, "Open ..." line)
- Modify: `docs/architecture/07-communication-patterns.md` (mermaid nodes `d1` and `v1`, +add a solid node)
- Modify: `docs/STATUS.md` (resolve line 45)

- [ ] **Step 1: README — rewrite the main-app deploy subsection**

In `README.md`, replace this block:
```markdown
### Main app (client + server)

**Actions tab → "Deploy" → Run workflow** (or `gh workflow run deploy.yml`).

One run deploys **both** halves together and smoke-checks each — server
`/health` → 200, client unauthenticated → 401 (the password wall). Deploying the
two together is the whole point of the manual workflow: the client and server
share a token and must move in lockstep, which a piecemeal auto-deploy can't
guarantee.
```
with:
```markdown
### Main app (clients + server)

**Actions tab → "Deploy" → Run workflow** (or `gh workflow run deploy.yml`).
One workflow deploys any subset of three independent targets — tick the
checkboxes:

- **`deploy_react`** → `@rtc/client-react` → Vercel (`rtc-clone-react.vercel.app`)
- **`deploy_solid`** → `@rtc/client-solid` → Vercel (`rtc-clone-solid.vercel.app`)
- **`deploy_server`** → `@rtc/server` → Fly.io (`rtc-clone-server.fly.dev`)

Both web clients connect to the **same** shared Fly WS server (its URL is a
build-time constant baked into each client), so a client build never waits on
the server — and the server, redeployed far less often, has its own opt-in
checkbox (default off). Each ticked target is smoke-checked (server `/health`
→ 200; each client → 200 on its canonical alias). Tick **`include_sourcemaps`**
to ship a debuggable build of the ticked client(s) — external `.map` files, so a
profiled deploy shows real component names in the flamechart.

Reproduce the old combined client+server deploy with
`gh workflow run deploy.yml -f deploy_react=true -f deploy_server=true`.
```

- [ ] **Step 2: DEPLOY.md — rewrite the intro paragraph**

In `docs/DEPLOY.md`, replace:
```markdown
The client deploys to **Vercel**, the WebSocket server to **Fly.io** (London,
`lhr`). Deploys are **on-demand only** — the single official way is to run
`.github/workflows/deploy.yml` manually (Actions tab → "Deploy" → Run workflow,
or `gh workflow run deploy.yml`). It deploys both in parallel and smoke-checks
each. Nothing auto-deploys on a push or merge, on any branch: Vercel's Git
integration is turned off by `"git": { "deploymentEnabled": false }` in
`vercel.json`, so the workflow is the only path. Access is gated by genuine
```
with:
```markdown
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
```

- [ ] **Step 3: DEPLOY.md — note the optional symmetric React secret**

In `docs/DEPLOY.md`, replace the repo-secrets block:
```markdown
    FLY_API_TOKEN      = <from `fly tokens create deploy`>
    VERCEL_TOKEN       = <vercel.com/account/tokens>
    VERCEL_ORG_ID      = <from `vercel link` / .vercel/project.json>
    VERCEL_PROJECT_ID  = <from `vercel link` / .vercel/project.json>
```
with:
```markdown
    FLY_API_TOKEN            = <from `fly tokens create deploy`>
    VERCEL_TOKEN             = <vercel.com/account/tokens>
    VERCEL_ORG_ID            = <from `vercel link` / .vercel/project.json>
    VERCEL_PROJECT_ID        = <the rtc-clone-react project's id> (or the symmetric
                               VERCEL_REACT_PROJECT_ID — the react job prefers it and
                               falls back to VERCEL_PROJECT_ID)
    VERCEL_SOLID_PROJECT_ID  = <the rtc-clone-solid project's id>
```

- [ ] **Step 4: DEPLOY.md — rewrite the "Deploying" section**

In `docs/DEPLOY.md`, replace:
```markdown
Run the **Deploy** workflow manually — Actions tab → "Deploy" → Run workflow, or
`gh workflow run deploy.yml`. (Merging to `main` does **not** deploy.) The
workflow deploys both and smoke-checks:
- server `/health` → 200
- client responds → 200 (the deployed SPA renders its own login screen; there
  is no edge-level password wall to smoke-check anymore)

Open `https://<your-project>.vercel.app`, log in with a real credential (ask
the team), and watch live prices tick.
```
with:
```markdown
Run the **Deploy** workflow manually — Actions tab → "Deploy" → Run workflow,
tick the targets you want (`deploy_react` / `deploy_solid` / `deploy_server`,
plus optional `include_sourcemaps`), or e.g.
`gh workflow run deploy.yml -f deploy_react=true -f deploy_server=true`.
(Merging to `main` does **not** deploy; ticking nothing fails the run's `guard`
job.) Each ticked target is smoke-checked:
- server `/health` → 200
- each client → 200 on its canonical alias (the deployed SPA renders its own
  login screen; there is no edge-level password wall to smoke-check anymore)

Open `https://rtc-clone-react.vercel.app` (or `https://rtc-clone-solid.vercel.app`),
log in with a real credential (ask the team), and watch live prices tick.
```

- [ ] **Step 5: architecture/07 — update the mermaid deploy topology**

In `docs/architecture/07-communication-patterns.md`, change the `d1` node:
```
        d1["deploy.yml<br/>deploy-server + deploy-client"]
```
to:
```
        d1["deploy.yml<br/>server + react + solid (checkboxes)"]
```
and change the `v1` node and add a sibling solid node — replace:
```
        v1["rtc-clone<br/>@rtc/client-react<br/>VITE_SERVER_URL baked at build"]
```
with:
```
        v1["rtc-clone-react<br/>@rtc/client-react<br/>VITE_SERVER_URL baked at build"]
        v1s["rtc-clone-solid<br/>@rtc/client-solid<br/>VITE_SERVER_URL baked at build"]
```
(One extra node stacks vertically — fine per the repo's diagram width rule.)

- [ ] **Step 6: STATUS.md — resolve line 45**

In `docs/STATUS.md`, replace the entire `- **Rename the React deploy for Deploy-React/Deploy-Solid symmetry** — …` bullet (the long one ending "Not spec'd as its own plan.") with:
```markdown
- **Unified `Deploy` workflow — DONE (code); ONE user action remaining.** `deploy.yml` now deploys any subset of react/solid/server via checkboxes (+ `include_sourcemaps`), `deploy-solid.yml` is folded in, root `vercel.json` → `vercel.react.json` (passed with `-A`, symmetric with `vercel.solid.json`), and the React target is `rtc-clone-react.vercel.app`. The workflow uses a non-breaking `VERCEL_REACT_PROJECT_ID || VERCEL_PROJECT_ID` secret fallback. **Remaining user action:** rename the Vercel project `rtc-clone` → `rtc-clone-react` in the dashboard (project id stable; only the `.vercel.app` URL changes — until done, the React smoke-check 404s) and, optionally, add the symmetric `VERCEL_REACT_PROJECT_ID` secret. Spec: [superpowers/specs/2026-07-19-unified-deploy-workflow-design.md](superpowers/specs/2026-07-19-unified-deploy-workflow-design.md); plan: [superpowers/plans/2026-07-19-unified-deploy-workflow.md](superpowers/plans/2026-07-19-unified-deploy-workflow.md).
```

- [ ] **Step 7: Verify doc links + no stray live references remain**

Run:
```bash
pnpm check:doc-links
grep -rn "rtc-clone\.vercel\.app" --include='*.md' . | grep -v node_modules | grep -v '.claude/worktrees' | grep -v 'docs/superpowers/' || echo "no live rtc-clone.vercel.app references remain (expected)"
grep -rn "deploy-solid\.yml" --include='*.md' . | grep -v node_modules | grep -v '.claude/worktrees' | grep -v 'docs/superpowers/' || echo "no live deploy-solid.yml references remain (expected)"
```
Expected: `check:doc-links` passes; both greps print their "no … remain (expected)" line.

- [ ] **Step 8: Commit**

```bash
git add README.md docs/DEPLOY.md docs/architecture/07-communication-patterns.md docs/STATUS.md
git commit -m "$(cat <<'EOF'
docs(deploy): sweep live docs for the unified Deploy workflow + rtc-clone-react

README/DEPLOY/architecture updated for the checkbox model, include_sourcemaps,
vercel.react.json, and the rtc-clone-react/rtc-clone-solid URLs; STATUS line 45
resolved (code done, Vercel project rename left as the one user action).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FSBT2hKxdjSPc1dY1tTxux
EOF
)"
```

---

## Post-implementation (ship)

Follow **shipping-repo-changes**: push the branch, open a PR, loop on CI (`gh run list --branch <branch> --workflow CI --json status,conclusion,headSha`) until the run for HEAD is `completed`/`success`, triage catch-up per Rule 3, merge `--merge`, confirm on `origin/main`, then remove the worktree.

**Then hand the user the one manual action** (it cannot be automated with this PAT):
1. Vercel dashboard → rename project `rtc-clone` → `rtc-clone-react` (project id stable; URL becomes `rtc-clone-react.vercel.app`). Until this is done, the react smoke-check will 404.
2. *(optional)* Add repo secret `VERCEL_REACT_PROJECT_ID` (= the existing `VERCEL_PROJECT_ID` value) for naming symmetry.
3. Verify by running the workflow once: `gh workflow run deploy.yml -f deploy_react=true` (and confirm the flamechart shows component names with `-f include_sourcemaps=true`).

## Self-Review

- **Spec coverage:** A (unified workflow, guard, checkboxes, independence, concurrency) → Task 2 Step 3. B (vercel.json rename + `-A`) → Task 2 Steps 1/3. C (sourcemaps: turbo.env + vite + job env) → Task 1 + Task 2 Step 3. D (URL rename, fallback secret, alias smoke) → Task 2 Step 3 + Task 3 Step 6 + Post-impl. E (doc sweep, historical untouched) → Task 3. F (verification) → per-task steps. Risk (Vercel env inheritance) → flagged in spec + Post-impl step 3 verifies on first real run.
- **Placeholder scan:** none — all code/edits are literal.
- **Type/name consistency:** `RTC_SOURCEMAPS` (value `"1"`), `vercel.react.json`, `rtc-clone-react.vercel.app`, `VERCEL_REACT_PROJECT_ID` used identically across Task 1, Task 2, and Task 3.
