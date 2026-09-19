# ADR-007: CI security tooling — what we run, what we declined, and why

**Status:** Accepted (implemented 2026-09-19). Adds three tools — **Dependency
Review**, **zizmor**, **OpenSSF Scorecard** — on top of the existing CodeQL /
Dependabot / Renovate / `pnpm audit` / actionlint layers, and records the
candidates that were considered and declined (Snyk, SonarCloud, the rest of
GitHub's starter-workflow catalogue). One finding is knowingly left open and
tracked: see [Open items](#open-items).

> Sibling decision records live alongside this one in `docs/adr/`. This ADR is
> about the **pipeline**, not the product: nothing here touches `packages/`.

## Context

The trigger was a survey of GitHub's *Actions → New workflow* catalogue
(`/actions/new`): which of those starter workflows are worth having here? The
honest answer needed an inventory first, because the catalogue is written for a
fresh repository and this one is not.

**What was already in place** (measured 2026-09-19, not assumed):

| Layer | What it covers | Where |
|---|---|---|
| CodeQL default setup | Static analysis of first-party code — `javascript-typescript` **and** `actions` | repo setting (`code-scanning/default-setup` → `configured`) |
| Dependabot **security** updates | Opens a fix PR once an advisory hits a dependency already on `main` | `.github/dependabot.yml` (version updates deliberately off, limit 0) |
| Renovate | Routine bumps + action-digest pinning, behind a **24h release cooldown** | `.github/renovate.json5` |
| `pnpm audit --prod` | Known advisories in the **production** tree, every CI run | `ci.yml` → grep-gates step |
| actionlint | Workflow **validity** (syntax, expressions, runner labels) | `pnpm lint:actions` |
| SHA-pinned actions, top-level `permissions:`, `main` ruleset | Workflow hygiene | every workflow |

Laying those side by side exposed three gaps — each one a *window in time or
scope* that no existing layer watches:

1. **Nothing looks at a PR's dependency delta.** The cooldown vets *freshness*,
   not advisories. `pnpm audit --prod` is prod-only, so a vulnerable
   **devDependency** — build tooling and test runners, i.e. the code that
   executes with CI secrets within reach — passes it. Dependabot acts only
   *after* the vulnerable version is on `main`. And **nothing checks licences**.
2. **Nothing asks whether a workflow is *safe*.** actionlint proves a workflow is
   well-formed; it has no opinion on template injection, persisted credentials,
   or an action ref that does not belong to the repo it names. CodeQL's `actions`
   pack overlaps here but runs asynchronously, *after* the CI rollup — it has
   been missed at merge time more than once.
3. **Nothing watches the repo's own posture for drift.** The hygiene above is
   convention, upheld by whoever writes the next workflow. No tool notices the
   day one ships without it, or a ruleset is loosened in Settings.

## Decision

Add one tool per gap, each placed where its signal is actionable:

| Tool | Gap | Runs | Gates? |
|---|---|---|---|
| **Dependency Review** (`actions/dependency-review-action`) | 1 | every PR, own workflow, ~20s | **yes** — fails the PR |
| **zizmor** | 2 | every CI run, a `checks`-job step + the local gauntlet | **yes** — zero findings |
| **OpenSSF Scorecard** (`ossf/scorecard-action`) | 3 | weekly + on workflow/ruleset change | **no** — report-only |

```mermaid
flowchart TB
  subgraph pr["On every PR"]
    direction TB
    DR["Dependency Review<br/>advisories + licences<br/>in the DELTA"]
    ZZ["zizmor<br/>is the workflow SAFE?"]
    AL["actionlint<br/>is the workflow VALID?"]
    AU["pnpm audit --prod<br/>whole prod tree"]
  end
  subgraph async["Asynchronous"]
    direction TB
    CQ["CodeQL<br/>first-party code"]
    SC["Scorecard<br/>repo posture, weekly"]
  end
  subgraph after["After merge"]
    direction TB
    DB["Dependabot<br/>security-fix PRs"]
    RN["Renovate<br/>bumps, 24h cooldown"]
  end
  pr --> async --> after
```

### Dependency Review — a gate, on both scopes, with a licence *deny* list

- **`fail-on-severity: low`.** The repo's standing policy is zero findings, not
  a severity budget.
- **`fail-on-scopes: runtime, development`.** The action's default is `runtime`
  only — which would have reproduced exactly the blind spot it was added to
  close.
- **`deny-licenses` (AGPL / GPL / SSPL), not `allow-licenses`.** Decided from a
  measurement, not a preference: all ~1,200 packages in the tree are permissive
  (1,045 MIT, then ISC / Apache-2.0 / BSD / …) and the repo is MIT, so strong
  copyleft is the only class that would change what this repo may do. An allow
  list would instead fail a PR on every novel-but-harmless SPDX id — and
  `BlueOak-1.0.0`, `MIT-0` and `0BSD` are all *already* in the tree.
- **No checkout, no PR comment.** It reads the dependency graph over the API, so
  the job holds a read-only token and posts its verdict to the job summary.

Known soft spot: `node-forge` is dual-licensed `(BSD-3-Clause OR GPL-2.0)`. If a
future bump of it trips the deny list, the fix is
`allow-dependencies-licenses: pkg:npm/node-forge` (the `OR` means BSD applies) —
not loosening the list.

### zizmor — a hard gate, fixed to zero rather than baselined

Wired as `pnpm lint:actions:security`, next to actionlint, via a pinned binary
(`scripts/install-zizmor.sh`) that **verifies a sha256 per platform** — a
security gate that pipes an unverified download into CI would be its own
finding. (actionlint's installer did exactly that until Scorecard flagged it;
it now has the same verified shape — see
[First Scorecard run](#first-scorecard-run-2026-09-19).)

The first run over the ten existing workflows reported **35 findings under three
rules**. They were resolved as *classes*, not baselined:

| Rule | Hits | Resolution |
|---|---|---|
| `artipacked` | 17 | **Fixed.** Every `actions/checkout` now states `persist-credentials` explicitly: `false` on the 13 jobs that never push, `true` — with a comment saying why — on the 4 that do (gh-pages publishing ×3, the golden-regeneration commit). Verified first that no non-pushing job makes a later git network call. |
| `dependabot-cooldown` | 1 | **Fixed.** `cooldown: default-days: 7` added. Inert today (version updates are off) but it means re-enabling them can never bypass the cooldown by accident. Cooldown does not apply to security updates. |
| `adhoc-packages` | 17 | **Ignored inline, with reasons** — 13 permanently, 4 temporarily. See below. |

**The `adhoc-packages` call.** The rule flags `npm install -g <pkg>` because
such installs sit outside any lockfile. It fired on two different things, and
they were *measured* rather than argued about:

- **`corepack@0.35.0` ×13 — a true false positive; ignore is permanent.** The
  rule names two risks: an unpinned version, and unpinned sub-dependencies.
  This is an exact pin, and `npm view corepack@0.35.0 dependencies` returns
  **nothing** — there is no sub-tree to float. It also *cannot* move under the
  lockfile: it provisions the package manager that reads the lockfile.
  Swapping to `pnpm/action-setup` would satisfy the linter only by moving an
  equivalent ad-hoc install inside a third-party action, where the linter
  cannot see it — relocating the finding, not resolving it.
- **`vercel@57` ×4 — a real, mild finding; ignore is temporary.** `57` resolves
  to exactly `57.0.0` today and 34 of its 35 direct deps are exact pins, but the
  transitive tree still re-resolves on every deploy, outside the lockfile and
  the 24h cooldown, in a job holding `VERCEL_TOKEN`. The proper fix (the CLI
  under a lockfile) changes the three deploy workflows, which are
  dispatch-only — it can only be verified by a real deploy, so it is its own PR.

Each ignore is an inline `# zizmor: ignore[adhoc-packages]` with its reason on
the lines above it — deliberately **not** a line-numbered `zizmor.yml` list
(which rots on every edit) and **not** a repo-wide `disable` (which would blind
the gate to the *next* ad-hoc install, including an unpinned one — the case the
rule is actually good at).

One prediction was **wrong** and is recorded as such: the `workflow_dispatch`
inputs (`scenario_pattern` and friends) were expected to be template-injection
risks. zizmor found **none** — they were already routed through `env:`.

**Online vs offline.** With `GH_TOKEN` set zizmor also runs its online audits
(`known-vulnerable-actions`, `impostor-commit`, `ref-confusion`). CI sets it; a
local gauntlet run without a token degrades to the offline set. **CI is the
authoritative run.**

### Scorecard — report-only, results kept in-repo

- **Report-only by design.** Several checks cannot score well here for reasons
  that are decisions, not defects: a single maintainer (`Code-Review`), no
  published releases (`Signed-Releases`, `Packaging`), no fuzzing. A gate on the
  aggregate would be a gate on those. **Read the per-check findings, not the
  number.**
- **`publish_results: false`.** Findings go to this repo's code-scanning tab
  only. Publishing to the public scorecard.dev API (what a README badge reads)
  is an outward-facing choice, left open — see below.

### First Scorecard run (2026-09-19)

The first run on `main` raised **32 alerts**, every one pre-dating the PR that
added it — nothing had ever scored the repo. Triage, by class:

| Alerts | Verdict | Action |
|---|---|---|
| `PinnedDependencies` — `packages/server/Dockerfile` `FROM node:26-slim` | **real** — a tag is mutable | **Fixed**: pinned by multi-arch index digest; Renovate's docker manager keeps it current behind the cooldown |
| `PinnedDependencies` — `scripts/install-actionlint.sh` (`curl … \| bash`) | **real** — unverified download | **Fixed**: direct tarball + per-platform sha256, same shape as `install-zizmor.sh`. Bumped 1.7.7 → 1.7.12 in passing, which knows `macos-26` natively — so `.github/actionlint.yaml`, a suppression whose own comment asked to be deleted on the next bump, is gone |
| `PinnedDependencies` — `deploy.yml` flyctl (`curl … \| sh`) | **real** | **Deferred** to the deploy-workflow item in `docs/STATUS.md`: replacing a deploy-path installer can only be proven by a real deploy |
| `PinnedDependencies` — `ios-visual-spike.yml` Maestro (`curl … \| bash`, ×2) | **real** | **Deferred**, tracked in `docs/STATUS.md`: a dispatch-only macOS spike — only a paid macOS run proves a changed installer |
| `PinnedDependencies` — 18× `npmCommand`: the 13 + 4 workflow `npm install -g corepack` / `vercel` lines, plus the Dockerfile's corepack line | same lines zizmor's `adhoc-packages` flagged | **No change** — already decided above. Scorecard does not read zizmor's ignore comments and has no notion of "exact pin, zero deps"; dismiss in the UI citing this ADR |
| `TokenPermissions` ×4 (high) — the four publishing jobs | **by design** — they push, so they need `contents: write` | **Tightened**, not cleared: `publish-site.yml` and `update-visual-goldens.yml` granted write at the *workflow* level; all four now grant it on the one job that pushes. Scorecard still warns on job-level write, correctly — that is what these jobs do |
| `SecurityPolicy` | **real**, cheap | **Fixed**: root `SECURITY.md` (private vulnerability reporting was already enabled) |
| `CodeReview`, `Fuzzing`, `CIIBestPractices` | structural — single maintainer, a demo, no fuzz targets | **No change**, as predicted above |
| `BranchProtection` (high) | **unverified** — Scorecard's default token often cannot read rulesets, so this may be a false reading rather than a gap | **Open** — see Open items |

This is the argument for *report-only* in concrete form: of 32 alerts, roughly
25 describe decisions this ADR already made. As a gate, Scorecard would have
demanded those be "fixed".

## Considered and declined

### Snyk — declined (for now): duplicates four layers, adds an account and a token

Snyk's two relevant products map onto things already running:

| Snyk product | Already covered by |
|---|---|
| Snyk Open Source (dependency CVEs + fix PRs) | Dependabot security updates · `pnpm audit --prod` · Dependency Review · Renovate |
| Snyk Code (SAST) | CodeQL |
| Snyk licence compliance | Dependency Review `deny-licenses` |

Its genuine edges — a proprietary advisory DB that sometimes leads GHSA, and
reachability analysis — are real but marginal for a public demo with no
customer data, and cost a third-party account, a `SNYK_TOKEN` secret in CI, and
a second stream of fix PRs to de-duplicate against Dependabot's (the exact
two-bots problem `dependabot.yml` already documents avoiding with Renovate).

**Revisit if:** the repo goes private (the GitHub-native layers stop being
free), or reachability analysis becomes worth paying for.

### SonarCloud — declined (for now): its unique value is already enforced harder, in-tree

SonarCloud's security rules overlap CodeQL. What it uniquely offers is
*maintainability* — code smells, duplication, complexity, a coverage gate. Here
those are already enforced, and enforced as **hard gates rather than a
dashboard**: Biome at zero findings with a no-disables policy, two ESLint
configs plus the repo's own custom rules, stylelint, knip (dead code),
dependency-cruiser (layering), the grep gates, and four ≥95% coverage gates.
Sonar would add a second opinion the repo's conventions would routinely
contradict, plus an external quality gate to keep in sync with them.

**Revisit if:** duplication detection specifically becomes wanted — it is the
one Sonar capability with no in-tree counterpart (`jscpd` would be the
lighter-weight first try).

### The rest of the starter catalogue

| Template(s) | Verdict | Why |
|---|---|---|
| Node.js CI, Webpack, Gulp, Deno | declined | `ci.yml` is a strict superset |
| Stale, Greetings, Labeler | declined | high-traffic-OSS tools; single maintainer, no issue backlog — they would only generate noise |
| AWS / Azure / GCP / Terraform deploys | declined | wrong targets (Vercel + Fly) |
| Pages templates (Jekyll, Astro, static) | declined | `publish-site.yml` already does this |
| SLSA provenance, attestations, SBOM | declined | meaningful for *published* artifacts; this repo publishes none, so nobody would verify them |
| Other vendor scanners (Trivy, Semgrep, Checkmarx, …) | declined | same overlap argument as Snyk; each wants an account and a token |
| **CodeQL** | already on | default setup |

## Consequences

- **Two new PR checks.** `dependency review` is its own workflow; zizmor is one
  more step in `checks`. Neither is in the `main` ruleset's *required* contexts
  yet — see Open items.
- **Every new `actions/checkout` must state `persist-credentials`**, and every
  new global install must justify itself. That is the gate working as intended.
- **The local gauntlet grew to 20 fast gates** (`CLAUDE.md` and
  `.claude/commands/rtc/gauntlet.md` updated together).
- **Two pins Renovate does not manage**: the zizmor version + its four digests
  (`scripts/install-zizmor.sh`), same as actionlint's. Bump them together, from
  the `gh api` command in that script's header.

## Open items

Tracked in [`docs/STATUS.md`](../STATUS.md):

1. **Move the Vercel CLI under a lockfile** and delete the four temporary
   `adhoc-packages` ignores. Two shapes: a root devDependency run via
   `pnpm exec vercel` (simplest, but ~35 direct deps on every install and a knip
   exemption), or a tiny dedicated manifest + lockfile beside the workflows
   installed with `npm ci` (no cost to normal installs). Own PR; needs a deploy
   dispatch to verify — pair it with the existing `vercel@57` unpin item, which
   edits the same four lines.
2. **Decide whether `dependency review` becomes a required check** on the `main`
   ruleset. It is a repo-settings change, so it was deliberately not made by the
   PR that introduced the workflow.
3. **Replace `deploy.yml`'s `curl -L https://fly.io/install.sh | sh`** with a
   pinned, verified flyctl install. Rides with item 1: same workflow, same
   "only a real deploy proves it" constraint. Note the trade-off before picking
   a shape — the SHA-pinned `superfly/flyctl-actions/setup-flyctl` action
   satisfies Scorecard but, without a `version:`, still installs *latest* at
   run time (relocating the finding, as with `pnpm/action-setup` above); a
   pinned `version:` is honest but needs a Renovate regex manager, because Fly's
   API retires old CLI versions.
4. **Replace the two Maestro `curl … | bash` installs** in
   `ios-visual-spike.yml` with a pinned release download + checksum. Do it the
   next time that spike is dispatched for its own reasons, so the macOS run
   that proves it is not spent on this alone.
5. **Read the `BranchProtection` alert properly** — confirm whether it reflects
   the real `main` ruleset or only what Scorecard's token could see.
6. **Decide `publish_results`** — flip to `true` (plus `id-token: write`) only if
   a public Scorecard badge is wanted.
