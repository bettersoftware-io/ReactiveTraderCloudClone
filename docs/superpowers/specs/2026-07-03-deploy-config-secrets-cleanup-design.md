# Deploy config: secrets-vs-variables cleanup — Design

**Date:** 2026-07-03
**Status:** approved (design), pending implementation plan

## Problem

The three on-demand deploys store the *same class* of non-sensitive value — Vercel
org id and project ids — in three different ways, and mix them with true
credentials:

| Value | Sensitive? | Stored today |
|---|---|---|
| `VERCEL_TOKEN` | **yes** | GitHub Actions **secret** ✓ |
| `FLY_API_TOKEN` | **yes** | GitHub Actions **secret** ✓ |
| Vercel org id (`team_Nm5Q36b0kTItH0gXCGG6fGUp`, same for all 3) | no | **secret** (app) **+ hardcoded** (both proto scripts) |
| app project id (`prj_2gPCaiFJGqD8dw3DoS360zx1JrxN`) | no | **secret** |
| cd-proto project id (`prj_VxG4x6dsstNbG3cEnhrZjZZM2Ayl`) | no | **hardcoded** in script |
| proto project id (`prj_nEBXpOwzucWlI4fn991R0Jx0DeXU`) | no | **secret** |

Three conventions (secret / hardcoded / both) for one kind of value is confusing
and semantically wrong: a Vercel project id is not a credential — it appears in
dashboard URLs — so storing it as a write-only, log-masked secret buys nothing
and hides config that belongs with the code.

## Principle

- **Secrets hold credentials only.** A value goes in Actions Secrets iff leaking
  it causes harm. That is exactly `VERCEL_TOKEN` and `FLY_API_TOKEN`.
- **Non-secret deploy-target config lives in the repo** as committed literals —
  version-controlled, reviewable in PRs, travels with a clone, needs no dashboard
  access. This is the pattern `deploy/cd-proto/deploy.sh` already uses; we unify
  the other two deploys onto it.
- We deliberately do **not** use GitHub Actions *Variables* for these ids.
  Variables are the right tool for non-secret config that must change without a
  commit or stay out of git; our ids are stable and code-tied, so committing them
  is cleaner and — given the repo PAT cannot write Variables (403) — avoids making
  every id a manual dashboard step.

## Target state

- **Secrets (only these two):** `VERCEL_TOKEN`, `FLY_API_TOKEN`.
- **Committed literals:** org id and every project id, each in the workflow/script
  that deploys that target.
- **Retired secrets (deleted by the maintainer):** `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID`, `VERCEL_PROTO_PROJECT_ID`.

## Changes

Repo (verified: the three id-secrets are referenced only in `deploy.yml` and
`deploy-proto.yml`; nothing else):

1. **`.github/workflows/deploy.yml`** — replace `${{ secrets.VERCEL_ORG_ID }}` →
   literal `team_Nm5Q36b0kTItH0gXCGG6fGUp` and `${{ secrets.VERCEL_PROJECT_ID }}`
   → literal `prj_2gPCaiFJGqD8dw3DoS360zx1JrxN`. `VERCEL_TOKEN`/`FLY_API_TOKEN`
   stay secrets. (App id confirmed via the Vercel API and `.vercel/project.json`.)
2. **`.github/workflows/deploy-proto.yml`** — drop the
   `VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROTO_PROJECT_ID }}` env line and update
   the header comment (no longer "requires the repo secret").
3. **`deploy/proto/deploy.sh`** — replace the `__SET_RTC_CLONE_PROTO_PROJECT_ID__`
   sentinel default with the real id `prj_nEBXpOwzucWlI4fn991R0Jx0DeXU`, and remove
   the now-dead sentinel fail-fast guard. The script ends up shaped like
   `deploy/cd-proto/deploy.sh` (org + project id hardcoded, env-overridable).
4. **`deploy/proto/README.md`** — drop the "add `VERCEL_PROTO_PROJECT_ID` secret"
   step; remaining one-time setup is: create the Vercel project + set
   `SITE_PASSWORD`. Simplify the local-run note (no env export needed).
5. **`docs/DEPLOY.md` §3** — remove `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` from the
   "GitHub repo secrets" list; state that they are committed literals now, leaving
   only `VERCEL_TOKEN` (+ Fly's `FLY_API_TOKEN`).

No change to `deploy/cd-proto/deploy.sh` or `deploy-cd-proto.yml` (already the
reference pattern).

Manual (maintainer — the repo PAT gets 403 on Actions secrets):

6. After merge, delete the three retired secrets `VERCEL_ORG_ID`,
   `VERCEL_PROJECT_ID`, `VERCEL_PROTO_PROJECT_ID`. **Order: merge first, then
   delete** — deploys are `workflow_dispatch`-only, so there is no window in which
   a deploy references a just-deleted secret.

## Accepted trade-offs

- **Org id hardcoded in 3 places** (app workflow + both scripts). Deliberate: a
  stable team-id constant does not justify a shared-config-file/include mechanism
  (YAGNI), and per-script hardcoding matches the existing style. If it ever needs
  to change, it is a three-line grep-and-replace.
- **Ids visible in git.** Intended — they are not secret. This is the whole point.

## Verification

- `actionlint` clean on all changed workflows (the only CI gate that runs on the
  deploy YAML — deploy jobs are dispatch-only and never run in CI).
- Grep confirms no `secrets.VERCEL_(ORG|PROJECT|PROTO_PROJECT)_ID` references
  remain after the edits.
- App project id literal already cross-checked against the Vercel API
  (`rtc-clone` → `prj_2gPC…`) and `.vercel/project.json`.

## Non-goals

- Not touching `VERCEL_TOKEN` / `FLY_API_TOKEN` (correctly secrets).
- Not introducing Actions Variables.
- Not changing deploy behaviour, targets, or the Basic-Auth gate — values are
  identical, only where they are stored changes.
