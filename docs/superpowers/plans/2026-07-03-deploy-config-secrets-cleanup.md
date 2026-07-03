# Deploy config secrets-vs-variables cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every non-secret Vercel id (org id + project ids) as a committed literal in the repo, leaving only `VERCEL_TOKEN` and `FLY_API_TOKEN` as GitHub Actions Secrets, consistently across all three deploys.

**Architecture:** Pure config edits to three GitHub Actions workflows, one shell script, and two docs. No product code, no tests-as-code — verification is `actionlint` (the only CI gate on deploy YAML) plus `grep`/`bash -n` assertions. Spec: `docs/superpowers/specs/2026-07-03-deploy-config-secrets-cleanup-design.md`.

**Tech Stack:** GitHub Actions YAML, bash, Vercel CLI (unchanged behaviour).

## Global Constraints

- Only `VERCEL_TOKEN` and `FLY_API_TOKEN` remain Secrets. No other value may be read via `${{ secrets.* }}` in the deploy workflows after this change.
- Do **not** introduce GitHub Actions Variables (`${{ vars.* }}`) — non-secret ids become committed literals.
- Exact literal values (copy verbatim):
  - Vercel org id: `team_Nm5Q36b0kTItH0gXCGG6fGUp`
  - app project id: `prj_2gPCaiFJGqD8dw3DoS360zx1JrxN`
  - proto (React) project id: `prj_nEBXpOwzucWlI4fn991R0Jx0DeXU`
  - cd-proto (HTML) project id: `prj_VxG4x6dsstNbG3cEnhrZjZZM2Ayl` (already committed — reference only, do not change)
- `deploy/cd-proto/deploy.sh` and `.github/workflows/deploy-cd-proto.yml` are the reference pattern — **do not modify**.
- Org id hardcoded in 3 places is an accepted trade-off (no shared-config indirection).
- Deploy jobs are `workflow_dispatch`-only; `actionlint` (`.tooling/actionlint`, installed via `pnpm run lint:actions`) is the validating gate.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `.github/workflows/deploy.yml` | app + server deploy | org id + app project id → literals (Task 1) |
| `.github/workflows/deploy-proto.yml` | React proto deploy | drop the project-id Secret env line + comment (Task 2) |
| `deploy/proto/deploy.sh` | React proto deploy logic | hardcode project-id default, remove sentinel guard (Task 2) |
| `deploy/proto/README.md` | proto setup docs | drop the "add the Secret" step (Task 3) |
| `docs/DEPLOY.md` | app deploy setup docs | drop `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` from the Secrets list (Task 3) |

---

## Task 1: App deploy — commit org id + app project id

**Files:**
- Modify: `.github/workflows/deploy.yml` (the `deploy-client` job `env:` block, lines ~44-45)

- [ ] **Step 1: Confirm the current (secret-based) state**

Run: `grep -n "VERCEL_ORG_ID\|VERCEL_PROJECT_ID" .github/workflows/deploy.yml`
Expected: two lines referencing `${{ secrets.VERCEL_ORG_ID }}` and `${{ secrets.VERCEL_PROJECT_ID }}`.

- [ ] **Step 2: Replace the two secret refs with committed literals**

Change:
```yaml
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```
to:
```yaml
      # Non-secret deploy-target config — committed, not Secrets (org/project ids
      # appear in dashboard URLs). Only VERCEL_TOKEN + FLY_API_TOKEN are Secrets.
      VERCEL_ORG_ID: team_Nm5Q36b0kTItH0gXCGG6fGUp
      VERCEL_PROJECT_ID: prj_2gPCaiFJGqD8dw3DoS360zx1JrxN
```

- [ ] **Step 3: Verify no secret ref remains and actionlint passes**

Run: `grep -c "secrets.VERCEL_ORG_ID\|secrets.VERCEL_PROJECT_ID" .github/workflows/deploy.yml`
Expected: `0`

Run: `pnpm run lint:actions >/dev/null 2>&1; .tooling/actionlint .github/workflows/deploy.yml; echo exit:$?`
Expected: `exit:0`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(deploy): commit app Vercel org+project id as literals, not secrets"
```

---

## Task 2: React proto deploy — move project id from Secret into the script

**Files:**
- Modify: `.github/workflows/deploy-proto.yml` (header comment ~lines 11-14; deploy-step `env:` ~lines 48-50)
- Modify: `deploy/proto/deploy.sh` (header comment ~lines 17-20; the org/project id + sentinel block ~lines 26-39)

**Interfaces:**
- Produces: `deploy/proto/deploy.sh` now supplies `VERCEL_PROJECT_ID` from a committed default (`prj_nEBXpOwzucWlI4fn991R0Jx0DeXU`), still env-overridable. The workflow no longer passes it.

- [ ] **Step 1: Confirm the current (secret + sentinel) state**

Run: `grep -rn "VERCEL_PROTO_PROJECT_ID\|__SET_RTC_CLONE_PROTO_PROJECT_ID__" .github/workflows/deploy-proto.yml deploy/proto/deploy.sh`
Expected: the workflow env line + header comment reference the secret; the script has the sentinel default and the fail-fast `if` block.

- [ ] **Step 2: In `deploy-proto.yml`, replace the header-comment block**

Change:
```yaml
# Requires the repo secret VERCEL_PROTO_PROJECT_ID (the rtc-clone-proto
# project's prj_… id) — see deploy/proto/README.md for one-time setup. (A
# project id isn't sensitive, so a Variable would work too; it's kept a
# Secret to match the main app's VERCEL_PROJECT_ID convention.)
```
to:
```yaml
# The Vercel org + project id are committed in deploy/proto/deploy.sh (they're
# not secret — they appear in dashboard URLs); only VERCEL_TOKEN is a Secret.
```

- [ ] **Step 3: In `deploy-proto.yml`, drop the project-id env line**

Change:
```yaml
        env:
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROTO_PROJECT_ID }}
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
```
to:
```yaml
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
```

- [ ] **Step 4: In `deploy/proto/deploy.sh`, fix the header comment**

Change:
```bash
#   - Project is selected via VERCEL_ORG_ID + VERCEL_PROJECT_ID (not secrets — a
#     project ID appears in dashboard URLs). VERCEL_PROJECT_ID has no default: it
#     must be set to the rtc-clone-proto project's id (one-time, see README).
```
to:
```bash
#   - Project is selected via VERCEL_ORG_ID + VERCEL_PROJECT_ID (not secrets — a
#     project ID appears in dashboard URLs); both default to the rtc-clone-proto
#     project below and are env-overridable.
```

- [ ] **Step 5: In `deploy/proto/deploy.sh`, replace the sentinel block with a committed default**

Change:
```bash
: "${VERCEL_ORG_ID:=team_Nm5Q36b0kTItH0gXCGG6fGUp}"
# One-time setup: create the rtc-clone-proto Vercel project, then paste its
# project id (visible in the dashboard URL, prj_…) here or export it as
# VERCEL_PROJECT_ID before running. The sentinel below fails the deploy loudly
# so we never ship to the wrong project by accident.
: "${VERCEL_PROJECT_ID:=__SET_RTC_CLONE_PROTO_PROJECT_ID__}"
export VERCEL_ORG_ID VERCEL_PROJECT_ID

if [ "$VERCEL_PROJECT_ID" = "__SET_RTC_CLONE_PROTO_PROJECT_ID__" ]; then
  echo "error: VERCEL_PROJECT_ID is unset. Create the rtc-clone-proto Vercel" >&2
  echo "       project, then set its prj_… id in deploy/proto/deploy.sh (or" >&2
  echo "       export VERCEL_PROJECT_ID). See deploy/proto/README.md." >&2
  exit 1
fi
```
to:
```bash
: "${VERCEL_ORG_ID:=team_Nm5Q36b0kTItH0gXCGG6fGUp}"
: "${VERCEL_PROJECT_ID:=prj_nEBXpOwzucWlI4fn991R0Jx0DeXU}"
export VERCEL_ORG_ID VERCEL_PROJECT_ID
```

- [ ] **Step 6: Verify — no secret/sentinel refs remain, script parses, actionlint passes**

Run: `grep -rn "VERCEL_PROTO_PROJECT_ID\|__SET_RTC_CLONE_PROTO_PROJECT_ID__" .github/workflows/deploy-proto.yml deploy/proto/`
Expected: no matches.

Run: `bash -n deploy/proto/deploy.sh; echo syntax:$?`
Expected: `syntax:0`

Run: `.tooling/actionlint .github/workflows/deploy-proto.yml; echo exit:$?`
Expected: `exit:0`

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/deploy-proto.yml deploy/proto/deploy.sh
git commit -m "ci(deploy): commit rtc-clone-proto project id in script, drop the secret"
```

---

## Task 3: Docs — stop teaching the retired secrets

**Files:**
- Modify: `deploy/proto/README.md` (the "One-time setup (Vercel)" section)
- Modify: `docs/DEPLOY.md` (§3 "GitHub repo secrets")

- [ ] **Step 1: Rewrite the `deploy/proto/README.md` setup section**

Replace the whole "## One-time setup (Vercel)" block (the numbered list including the `VERCEL_PROTO_PROJECT_ID` secret step) with:
```markdown
## One-time setup (Vercel)

The project id is already committed in `deploy/proto/deploy.sh`
(`prj_nEBXpOwzucWlI4fn991R0Jx0DeXU`), so there is no Actions secret/variable to
set. Two things must exist on Vercel:

1. A Vercel project named **`rtc-clone-proto`** in the
   `nasantsogt-baasanjavs-projects` scope (Add New → Project; no Git connection —
   this deploys via CLI only). If you ever recreate it, update the
   `VERCEL_PROJECT_ID` default literal in `deploy/proto/deploy.sh`.
2. **`SITE_PASSWORD`** on the project (Settings → Environment Variables,
   Production + Preview) — the shared password the gate checks.

`VERCEL_TOKEN` (a Secret used by CI) already exists for the main deploy and is
reused here.
```

- [ ] **Step 2: Update `docs/DEPLOY.md` §3 secrets list**

Change:
```
Settings → Secrets and variables → Actions → New repository secret:

    FLY_API_TOKEN      = <from `fly tokens create deploy`>
    VERCEL_TOKEN       = <vercel.com/account/tokens>
    VERCEL_ORG_ID      = <from `vercel link` / .vercel/project.json>
    VERCEL_PROJECT_ID  = <from `vercel link` / .vercel/project.json>
```
to:
```
Settings → Secrets and variables → Actions → New repository secret:

    FLY_API_TOKEN      = <from `fly tokens create deploy`>
    VERCEL_TOKEN       = <vercel.com/account/tokens>

The Vercel org id and project ids are **not** secrets — they appear in dashboard
URLs — and are committed as literals in the workflows/scripts
(`deploy.yml`, `deploy/proto/deploy.sh`, `deploy/cd-proto/deploy.sh`).
```

- [ ] **Step 3: Verify the docs no longer teach the retired secrets**

Run: `grep -rn "VERCEL_PROTO_PROJECT_ID\|VERCEL_ORG_ID\|VERCEL_PROJECT_ID" deploy/proto/README.md docs/DEPLOY.md`
Expected: no line that instructs creating any of these as a secret/variable (a mention of the `VERCEL_PROJECT_ID` *literal* in deploy.sh prose is fine).

- [ ] **Step 4: Commit**

```bash
git add deploy/proto/README.md docs/DEPLOY.md
git commit -m "docs(deploy): stop documenting retired Vercel id secrets"
```

---

## Manual handoff (maintainer — NOT a code task)

After the PR merges to `main`, delete the three now-unreferenced Actions Secrets (the repo PAT gets 403 on the Secrets API, so this is dashboard-only):

- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_PROTO_PROJECT_ID`

Order matters only in one direction: **merge first, then delete.** Because deploys are `workflow_dispatch`-only, there is no automated run between merge and deletion that could reference a just-removed secret. Leaving them undeleted is harmless (dead secrets), but deleting completes the cleanup.

Post-delete sanity: the two remaining Secrets should be exactly `VERCEL_TOKEN` and `FLY_API_TOKEN`.

---

## Self-Review

- **Spec coverage:** spec changes 1→Task 1; 2+3→Task 2; 4+5→Task 3; manual step 6→"Manual handoff". Principle (secrets = credentials only), target state, and non-goals all realised. ✓
- **Placeholder scan:** no TBD/TODO; every edit shows exact before/after text and exact literals. ✓
- **Value consistency:** org id `team_Nm5Q36b0kTItH0gXCGG6fGUp`, app id `prj_2gPCaiFJGqD8dw3DoS360zx1JrxN`, proto id `prj_nEBXpOwzucWlI4fn991R0Jx0DeXU` used identically everywhere they appear. ✓
