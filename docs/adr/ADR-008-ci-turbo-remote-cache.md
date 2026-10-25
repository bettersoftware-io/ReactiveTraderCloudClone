# ADR-008: CI's turbo cache — Vercel Remote Cache over OIDC

**Status:** Accepted 2026-10-18; **active since 2026-10-24**, when the Vercel
OIDC policy and the `TURBO_TEAM` repository variable were created
([Setup](#setup)) and a dispatched `ci.yml` run on `main` traded its token,
reported "Remote caching enabled" and revoked the token at the end. First
measured the same day ([Measured](#measured-2026-10-24)). Reversible in one
step ([Reversing or switching](#reversing-or-switching)).

> This record exists so the next look at CI caching starts from here, not
> from scratch: the measurements, all five options with their trade-offs, and
> the security reasoning are below.

## Context

The decision closes a run of CI-speed work on 2026-10-17:

| PR | change | effect on the `checks` job |
|---|---|---|
| #1016 | the Credit RFQ test made 4.7x cheaper | removed one 5 s timeout flake |
| #1018 | `pnpm test --concurrency=4 -- --maxWorkers=2` | **same wall time**, worst test 0.81 → 0.30 of its timeout |
| #1021 | every vitest suite on the `vmThreads` pool | `Tests (unit)` 167 → 104 s, contract gates −35–38%, job 686 → 566 s |

#1018 showed why only less *work* can make the step faster: the 4-vCPU
runner is saturated either way, so a step's wall time is its CPU time divided
by four. #1021 cut the work per run. A cache cuts the work **between** runs.
CI keeps no turbo cache, so every run rebuilds all 27 packages and re-runs all
27 test suites, however little a PR touched. (What came after this decision —
the coverage job, Playwright workers and the e2e split, 2026-10-25 — is in
[`ci-performance.md`](../ci-performance.md).)

### What a cache would skip (measured)

For each of the last 30 merges to `main` (2026-10-17), the task hashes of
`turbo run test --dry=json` were compared before and after the merge, and
every unchanged task was weighted by its measured local CPU cost:

| | |
|---|---|
| CPU of the unit-test step a cache would have skipped | **mean 72%, median 87%** |
| PRs skipping ≥ 90% | 15 of 30 (docs, CI, single-client PRs) |
| PRs skipping nothing | 3 of 30 (a lockfile-wide bump, two server PRs touching shared inputs) |
| one full run's cache entries | 51–77 entries, **6–20 MB** compressed |

The expected saving is roughly **1.5–2 minutes per typical PR** off a
~9.5-minute job: `Tests (unit)` (104 s) and `Typecheck` (~27 s) both run
through turbo. That figure is an estimate until the first cached runs
([Setup](#setup), step 3).

## Options considered

| # | option | cost per run (est.) | credential stored in GitHub | who can plant a cached result |
|---|---|---|---|---|
| 1 | Vercel Remote Cache, **personal access token** | ~1–3 s | **yes**: long-lived, team-scoped, can deploy | any code in a PR job |
| 2 | **Vercel Remote Cache, OIDC** ← chosen | ~1–3 s | none | code in a PR job, for minutes (read-only by flag) |
| 3 | GitHub Actions cache (`actions/cache` of `.turbo/cache`) | ~5–15 s | none | nobody from a PR: GitHub scopes PR writes to the PR |
| 4 | third-party action serving turbo's cache API from GitHub's cache | ~2–5 s | none | as 3, plus the action's own code |
| 5 | no cache | — | — | — |

**1 — Vercel, stored PAT.** Turbo's native backend; artifacts are fetched per
task, on demand. Vercel PATs scope to a team but not to "cache only": the
token can deploy, read env vars, delete projects. `ci.yml` runs on every PR,
including Renovate's dependency bumps, so a compromised package could take it.
The production site is public with open registration, so a deploy-capable
token is the one risk here with a real-world downside. **Declined.**

**2 — Vercel, OIDC (chosen).** The same backend, but nothing is stored: each
run trades its GitHub OIDC token for a Turborepo token that Vercel documents as
"short-lived", "only grants access to Vercel Remote Cache" and "associated to
your team, rather than a specific team member". Vercel's own action revokes it
when the job ends. Costs: one dashboard step for the operator; "PRs only read"
is turbo's `TURBO_CACHE` setting, which Vercel does not enforce; and with PRs
read-only, a PR's second push does not reuse its first.

**3 — GitHub Actions cache.** No credential and no third party, and the
strongest isolation: GitHub lets a PR write only its own cache scope, while
`main`'s is readable by PRs and writable only by `main` runs. A PR's later
pushes reuse its earlier results. Costs: the whole folder is restored and saved
each run (estimated 5–15 s, depending on how many runs pruning keeps) and
some YAML to prune the folder inside the repo's 10 GB cache budget.

**4 — Third-party action.** Per-task fetches like option 2, GitHub's storage
and scoping like option 3, but someone else's code runs in every job with
access to the cache — a supply-chain risk for a few seconds over option 3.

**5 — No cache.** Zero risk and nothing to maintain; every run repeats all
the work.

## Decision

**Option 2.** Speed separates options 2, 3 and 4 by seconds, against a saving
of minutes, so the choice came down to risk weighed for *this* repository
([below](#how-realistic-the-risks-are)): option 2's residual risk is a
possibly misleading green on a PR, which cannot reach a deploy, in exchange for
the fewest moving parts.

How it is wired (`ci.yml`, `checks` job):

- **`vercel/setup-turborepo-remote-cache-action`, pinned to v1.1.0's commit.**
  Its bundle was read before adoption (2026-10-18): zero dependencies; it calls
  only GitHub's OIDC endpoint and `api.vercel.com`; it masks both tokens in
  logs; it exports `TURBO_TOKEN`/`TURBO_TEAM`; and its post step revokes the
  token.
- **`if: vars.TURBO_TEAM != ''` and `continue-on-error: true`.** The cache is
  an optimisation, never a gate: the step is skipped until configured, and a
  Vercel outage leaves turbo running uncached (verified: with a remote cache
  requested but no token, turbo prints "Remote caching disabled" and carries
  on).
- **`TURBO_CACHE`**: `local:rw,remote:rw` on pushes to `main`,
  `local:rw,remote:r` for everything else. Only merged code writes.
- **`permissions: id-token: write` on the `checks` job only.** Nothing else in
  this repository trusts GitHub OIDC (deploys use stored tokens), so the
  permission opens nothing besides the cache.
- **CI-only.** Don't `turbo login` on a workstation against this team: nothing
  from the shared cache should land in local builds.

## What the cache may skip — keeping the hashes honest

A task replays from the cache when its hash is unchanged. The hash covers the
package's own files, its workspace dependencies' hashes,
`globalDependencies` and the declared env vars. Turbo's strict env mode already
hides undeclared variables from tasks, so the real hole is **a test that reads
files outside its package without declaring them**: it would replay as passed
after those files changed.

The audit (2026-10-18) resolved every relative path in every package's source
and test files — imports, `import()`, `require`, `new URL` — and found two:

| test | read, unhashed | fix |
|---|---|---|
| `motion-core` › `drawChartScene.test.ts` | the clients' `src/ui/equities/chart/*.module.css` (a reverse dependency) | `packages/motion-core/turbo.json` declares both globs |
| `server` › `accounts/migrations.test.ts` | the repo root's `supabase/migrations/` | `packages/server/turbo.json` declares it |

Both are declared for `test` and `test:coverage`, since turbo hashes each task
separately. A dry run showed the fix: a migration edit now changes
`@rtc/server#test`'s hash, and changed nothing before. `client-react` and
`client-solid` read `ui-contract` too, which is fine: they depend on it.

**Grep gate 55** keeps it that way: an outside read must land in a workspace
dependency or in a `$TURBO_ROOT$/…` input declared for **every** test task the
package has. Mutation-checked: 3 of 3 mutants killed. Its first version pooled
inputs across tasks and let two survive, which is why the check is per task.
**Its limit:** it sees literal paths only. A path assembled at runtime from
separate segments (`join(root, "docs", name)`) is invisible to it, so review
such code by hand.

## How realistic the risks are

Weighed for this repository rather than in general:

- **Who can try.** Fork PRs get no OIDC token and no secrets, so they run
  uncached. That leaves code in branches of this repo: the maintainer, Claude
  sessions, and Renovate's dependency bumps. The plausible attacker is a
  malicious npm release arriving through Renovate. That happens (2025's npm
  worms harvested CI tokens), but Renovate and pnpm both hold new releases for
  24 hours (`minimumReleaseAge`), most poisoned versions are pulled within
  hours, and pnpm runs install scripts only from an allowlist
  (`strictDepBuilds`).
- **What they would get (option 2).** A cache-only token for the rest of the
  job. The worst outcome is a planted "passed" for some task, i.e. a misleading
  green on a later run. **It cannot reach production:** `deploy.yml` builds
  from scratch and does not use the turbo cache. A malicious dependency that
  runs in CI has also run on the maintainer's machine at `pnpm install`, which
  is the bigger exposure.
- **What would change the answer.** If `deploy.yml` (or anything shipped)
  ever consumes this cache, a planted artifact becomes a production risk. Move
  to option 3 at that point, or add `TURBO_REMOTE_CACHE_SIGNATURE_KEY` signing
  with the key kept away from PR jobs.

## Reversing or switching

Nothing is migrated in either direction; a new backend fills itself on the
next `main` run.

- **Off:** delete the `TURBO_TEAM` variable (the step is skipped) or the
  Vercel policy. To remove it entirely, delete the step, the job's
  `permissions`/`env` blocks and the variable.
- **To option 3:** replace the step with `actions/cache` on `.turbo/cache`
  (key per run, `restore-keys` prefix, prune old entries before saving) and
  drop `id-token: write` and `TURBO_CACHE`.
- **Unchanged by any switch:** the two packages' `turbo.json` inputs and
  gate 55.

**Revisit when:** the first cached runs fall well short of the estimate above;
the repo starts taking PRs from people other than its maintainer; something
shipped starts consuming the cache; or the e2e jobs, which also build every
package and are left uncached for now (unmeasured), become worth caching.

## Setup

1. **Vercel** (team dashboard): Settings → Build and Deployment → **OIDC
   Policies for CLI Access** → *Add* next to *Turborepo CLI Policies*. Select
   GitHub, the `bettersoftware-io` account (a user account, not an
   organisation) and the `ReactiveTraderCloudClone` repository. Leave the
   issuer (`https://token.actions.githubusercontent.com`) and the audience
   (`https://github.com/bettersoftware-io`, GitHub's default for the owner) as
   the form fills them, and **leave the workflow and branch restrictions
   empty**. Done 2026-10-24 as policy `rtc-ci`. A workflow restriction of
   `ci.yml` made Vercel refuse every token ("Not authorized."). GitHub's
   `workflow` claim holds the display name `CI`, not the file name, and the
   form's expected format was not established. The repository restriction is
   what matters: in this repo only `ci.yml`'s `checks` job is granted
   `id-token: write`, so no other job can request a token without a reviewed
   change.
2. **GitHub**: `gh variable set TURBO_TEAM --body "<team-slug>"` (the slug is
   the part after `vercel.com/` in the team URL). A variable, not a secret, so
   logs show it. Set 2026-10-24 to `nasantsogt-baasanjavs-projects`, the
   team's only slug.
3. **Verify from the log, never from the step's tick.** The step is
   `continue-on-error`, so it shows green even when Vercel refuses the token —
   which is what the first attempt did on 2026-10-24 (`Failed to exchange OIDC
   token for Vercel access token (HTTP 400 …"Not authorized.")`, then turbo's
   "Remote caching disabled" and a cache miss on every task). Dispatch `ci.yml`
   on `main` (a dispatch only reads the cache, so it tests the exchange without
   writing; check first that no `main` run is in progress, because the
   workflow's concurrency group cancels it) and read the `checks` job's log
   once it completes: it must contain no `Failed to exchange`, turbo must not
   say "Remote caching disabled", and the post step must log "Revoked the
   Turborepo access token". Then the next push to `main` fills the cache, and
   the PR runs after it should report `cache hit, replaying logs` for
   unchanged tasks. Measure `Tests (unit)` and `Typecheck` against the
   [estimate](#what-a-cache-would-skip-measured) and record the real numbers
   here.

## Measured (2026-10-24)

The first push to `main` with the cache on (#1048's merge, run 40124250584)
ran uncached and wrote every result; the docs-only PR after it (#1049, run
40125163221) replayed them. Same runner class (the uncached type-aware ESLint
step took 66 s and 68 s):

| step | `main`, uncached | #1049, from the cache |
|---|---|---|
| `Typecheck` | 36 s | 2 s |
| `Tests (unit)` | 139 s | 3 s |
| whole `checks` job | 682 s | 527 s (−155 s, −23%) |
| turbo tasks | 109 executed, 23 replayed from the job's own local cache | 132 cache hits, 0 misses |

That is the **best case**: a PR that changes no package replays every task.
A PR that touches packages re-runs those packages and everything that
depends on them, so expect the median PR's saving to sit below this. The
30-merge replay above put the skippable share at a median 87%: applied to
today's 175 s of turbo-driven steps, that is roughly 2.5 min. That figure is an
inference, not a measurement; replace it with real PR runs as they
accumulate. The steps the cache cannot reach (the two UI-contract
coverage gates, type-aware ESLint, the e2e jobs) are now most of the job.

## Related

- `.github/workflows/ci.yml`: the `checks` job's `permissions`/`env`, the
  remote-cache step, and the `Tests (unit)` step's comment (the #1018 cap).
- [`docs/architecture/09-test-strategy.md`](../architecture/09-test-strategy.md#the-test-pool--vmthreads-and-what-a-vm-context-changes)
  — the `vmThreads` pool (#1021).
- [`docs/security.md`](../security.md#5-inventory) §5.4–5.5 — the OIDC policy
  and the `TURBO_TEAM` variable in the settings inventory.
- [ADR-007](ADR-007-ci-security-tooling.md) — the CI security tooling this
  sits alongside (zizmor audits the new step).
