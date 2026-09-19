# Reading the OpenSSF Scorecard

`scorecard.yml` scores this repository weekly (and whenever a workflow or the
`main` ruleset changes) and reports into **Security → Code scanning**, tool
`Scorecard`. It is **report-only and gates nothing** — the reasoning is in
[ADR-007](adr/ADR-007-ci-security-tooling.md). This page is the operating
manual: what each check that is, or was, open here actually measures, why it
reads the way it does, and what would change it.

**Read the per-check findings, never the aggregate number.** Scorecard was built
to help a company decide whether to depend on a third-party library, so several
checks measure whether *more than one person* stands behind a project. A
single-maintainer demo is capped on those regardless of engineering quality. A
score of 3/10 on one of them is a fact about the team size, not a defect.

## Where the repo stands

Starting point, first run 2026-09-19: **32 open alerts**, all pre-dating the
workflow that found them.

| Check | First run | Now | How |
|---|---|---|---|
| `Pinned-Dependencies` — Docker base image | open | **closed** | `FROM node:26-slim@sha256:…` (index digest) |
| `Pinned-Dependencies` — actionlint `curl \| bash` | open | **closed** | `scripts/install-actionlint.sh`, sha256-verified |
| `Pinned-Dependencies` — 18× `npm install -g` (corepack, Vercel CLI) | open | **closed** | lockfile-based `npm ci` (`scripts/ci-tooling/`) |
| `Pinned-Dependencies` — flyctl, Maestro ×2 `curl \| sh` | open | **closed** | pinned release + sha256 (`scripts/install-*.sh`) |
| `Token-Permissions` ×4 | open | **closed** | `contents: write` on the job that pushes, never the workflow |
| `Security-Policy` | open | **closed** | root `SECURITY.md` |
| `Fuzzing` | open | **closing** | property-based tests, see [below](#fuzzing--property-based-tests) |
| `CII-Best-Practices` | open | open — owner task | see [the walkthrough](#cii-best-practices--the-badge-walkthrough) |
| `Code-Review` | open | open **by design** | see [below](#code-review-and-branch-protection--capped-by-team-size) |
| `Branch-Protection` | open | open **by design** | see [below](#code-review-and-branch-protection--capped-by-team-size) |

One mechanic worth knowing, learned the hard way (ADR-007 predicted the
opposite): **alerts are emitted per *check*, not per line.** When a check
reaches full marks, *every* alert under it closes — including ones on lines
nobody edited. Moving two workflow-level `contents: write` grants down to their
jobs closed all four `Token-Permissions` alerts, two of which were on untouched
files.

## Fuzzing — property-based tests

**What it measures.** Whether the project uses fuzzing at all. It looks for
OSS-Fuzz enrolment, ClusterFuzzLite, a language's native fuzzer — and, for
JavaScript/TypeScript, **property-based testing with
[`fast-check`](https://fast-check.dev)**, detected by an import of the library
in a source file.

**What that is.** An example-based test says *"for this input, expect that
output"*. A property says *"for **every** input, this must hold"*; the library
generates hundreds of inputs hunting for a counter-example, and on finding one
**shrinks** it to the smallest failing case before reporting. It is fuzzing
with an oracle.

**Why it is the one check of the remaining four worth real effort:** it
improves the code, not just the number. `@rtc/motion-core` is pure, total,
numeric code whose doc comments already *state* properties in prose — "Exact
inverse of `priceToY`", "keeps the math total". Those were claims nothing
checked.

**Where it lives.** `packages/motion-core/src/chartMath.property.test.ts`,
running inside the ordinary `vitest` suite (no separate job). When the first
property was mutation-checked — an off-by-one planted in `clampViewport` — it
failed on the first generated case and shrank to `{start: 1, end: 1}` against a
series of length `0`. Instructively, the *idempotence* property still passed
under that mutant: a wrong clamp can be perfectly stable. One property is never
enough.

It paid for itself on day one, twice, and both are worth remembering:

- **It found a real numerical property of the code.** With an unconstrained
  generator it produced `{cmin: 0.0001, base: 4492, yScale: "percent"}`, where
  `price / base ≈ 2e-8` and the `− 1` in `pctOf` cancels ~8 significant digits
  (catastrophic cancellation). Production cannot reach it — `base` is always a
  price from the series being drawn — so the generator was narrowed and the
  reason written next to it. Out of domain, but now *known*.
- **It found a wrong property.** "Strictly decreasing in price" failed two runs
  in three, on two prices exactly one float apart that legitimately map to the
  same `y`. The code was right; the claim was false at float resolution. **A
  flaky property is worse than none** — before trusting a new one, run it at
  `numRuns: 20000` (`fc.configureGlobal`) once. The six shipped here hold over
  120,000 generated cases.

**Good next targets**, in rough order of value:

| Target | Property |
|---|---|
| `@rtc/shared` wire envelopes | `decode(encode(x))` deep-equals `x` — the classic round trip |
| `@rtc/motion-core` `flip.ts` | a FLIP delta applied to the *last* rect reproduces the *first* rect |
| `@rtc/motion-core` `zoomAt` / `panBy` | the result of any gesture, once clamped, is a valid viewport |
| `@rtc/domain` spread / mid arithmetic | `bid ≤ mid ≤ ask` for every generated quote |

Writing one: generators ("arbitraries") go at the bottom of the file, below the
cases, like any other fixture; keep them inside the domain the function
*documents* — totality on garbage input is a separate property, worth its own
test, not an accident of a loose generator.

## CII-Best-Practices — the badge walkthrough

**What it measures.** Only whether the project holds an **OpenSSF Best Practices
badge** (formerly the CII badge) — a self-certification questionnaire at
<https://www.bestpractices.dev>. Severity: low. Scorecard awards partial credit
for an in-progress badge and more for `passing` / `silver` / `gold`.

**Why only the repo owner can do it.** The entry is created by signing in with
the GitHub account that owns the repository, and the answers are a public
attestation made in that person's name. It cannot be delegated to a bot.

**The procedure** (about 1–2 hours for `passing`):

1. Go to <https://www.bestpractices.dev>, **Log in with GitHub**, then
   **Get Your Badge Now**.
2. Enter the repo URL
   (`https://github.com/bettersoftware-io/ReactiveTraderCloudClone`). The site
   pre-fills what it can detect (licence, repo, some CI facts).
3. Work through the `passing` criteria — about 67, in six groups. Each takes
   `Met` / `Unmet` / `N/A` plus, where asked, a URL as evidence. **You can save
   and come back**; an in-progress entry already earns Scorecard credit.
4. At 100% the badge flips to `passing`. Optionally add the badge markdown to
   the README — Scorecard finds the entry by repo URL either way.

**Evidence to paste**, by group — most of this already exists:

| Group | What it asks | Point to |
|---|---|---|
| **Basics** | description, how to contribute, licence, docs | `README.md`, `LICENSE` (MIT), `docs/README.md`, `CLAUDE.md` |
| **Change control** | public VCS, unique versions, release notes | the GitHub repo. *Versioning / release-notes criteria are `N/A`: the project publishes no releases* — say so plainly |
| **Reporting** | bug-report process; **private vulnerability reporting**; response time | GitHub Issues; `SECURITY.md` (private reporting is enabled; it commits to ~1 week) |
| **Quality** | working build, automated test suite, tests added with new features, warnings enabled and addressed | `pnpm build` / `pnpm test`; `ci.yml`; `docs/architecture/09-test-strategy.md`; Biome at zero findings with a no-disables policy |
| **Security** | secure design knowledge, no leaked credentials, HTTPS delivery, crypto practices | `docs/authentication.md`; the committed demo roster is **public by design** — explain that in the free-text box rather than answering `Unmet`; the site and WS endpoint are HTTPS/WSS only |
| **Analysis** | static analysis, **dynamic analysis**, fixing what they find | CodeQL (default setup) + zizmor + Dependency Review → ADR-007; dynamic analysis = the property-based tests above and the Playwright e2e suites |

Answer honestly rather than optimistically. Two criteria will be genuinely
awkward for a single-maintainer project — *"two or more developers"*-style
questions appear only at `silver`, so `passing` is reachable; don't chase
`silver`.

## Code-Review and Branch-Protection — capped by team size

These two are the same fact seen twice, which is why they are taken together.

**`Code-Review` (high)** inspects the recent merged changesets and asks whether
each was **approved by someone other than its author** before merging. Here
every PR is opened and merged by one account, so the score is 0. GitHub does
not allow approving your own pull request, so nothing short of a second human
reviewer moves it — and the repo's deliberate policy is merge-when-green with
no human gate (the `shipping-repo-changes` skill, Rule 4).

**`Branch-Protection` (high, 3/10)** reads the `main` ruleset — *correctly*; an
early guess that Scorecard's token could not see rulesets was wrong. It already
earns credit for: a ruleset at all, no force-push, no deletion, required status
checks, PRs required, no bypass actors. The five warnings:

| Warning | Why it stays |
|---|---|
| does not require approvers | requiring 1 approval on a one-person repo makes every PR unmergeable |
| stale review dismissal disabled | meaningless without required reviews |
| codeowners review not required | same |
| last-push approval disabled | same |
| "up-to-date branches" disabled | this is `strict_required_status_checks_policy: false`, **chosen on purpose**: strict mode forces a catch-up + ~10 min CI re-run every time `main` moves, which against several concurrent sessions is a treadmill. `shipping-repo-changes` Rule 3 replaces it with a triage; the structural fix (a merge queue) needs an org-owned repo |

**What would change them:** a second maintainer (both checks), or accepting the
strict-status-checks treadmill (one warning). Neither is a to-do. If the repo
ever gains a collaborator, revisit both — that is the trigger.
