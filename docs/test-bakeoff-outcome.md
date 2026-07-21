# Test bake-off — outcome

**Concluded 2026-07-20.** This repo deliberately shipped several parallel testing
tools per category — not for coverage or redundancy, but to **evaluate the tooling
on concrete evidence and then pick one winner per category.** This is the record of
how that ended: what won, what was deleted or parked, what it cost, and the proof
that nothing was lost.

> Companion visual page: [`showcase/test-bakeoff-outcome.html`](./showcase/test-bakeoff-outcome.html).
> Deeper tier detail lives in [`architecture/09-test-strategy.md`](./architecture/09-test-strategy.md)
> (§9.7 visual, §9.10 gauntlet); the execution plan is
> [`superpowers/plans/2026-07-19-test-bakeoff-retirement.md`](./superpowers/plans/2026-07-19-test-bakeoff-retirement.md).

## The headline

- **Visual-diff CI job: ~52 min → ~15 min per post-merge run** — a bit over **two-thirds off** the single biggest CI cost in the repo. ~29 min of that came from retiring two of the three visual tiers; the rest from a follow-up that parallelized the survivors across a job matrix.
- **~5,300 golden PNGs / ~226 MB deleted** from the repo.
- **Zero coverage lost** — verified adversarially, not assumed.
- **One real pre-existing coverage gap found and closed** in the process. The retirement made the suite *more* correct, not just faster.

## Verdicts, by category

The rule throughout: **pick the winner, delete or park the losers, lose zero coverage.**

### Visual diff — 3 tiers → 1

| Approach | Verdict | Why |
|---|---|---|
| **`playwright`** (plain Playwright over a Vite host) | ✅ **Kept** — sole CI-asserted tier, both clients | It *is* the cross-framework portability contract: `visual.spec.ts` is framework-agnostic and reused verbatim by `client-solid`, with no CT-adapter version lag, exercising production-like `page.route`/navigation. |
| **`playwright-ct`** | ❌ **Deleted outright** (both clients) | Its Solid side was never a real component-test mount — the official Solid CT adapter trailed core Playwright by ~1.5 years, so it faked a mount with a URL-navigation fallback. |
| **`vitest-browser`** | ⚠️ **Assert role retired; kept coverage-only** | Still renders + interacts through all 1282 scenarios so istanbul sees every branch, but the pixel assert is compiled out via a `define`-injected `__RTC_VISUAL_SKIP_DIFF__` flag — so it never reads a golden. This is how the **code-coverage signal was preserved** while dropping the redundant assert. |

Speed did **not** decide it (measured at the full 1282-scenario matrix: playwright-ct 241s, playwright 258s, vitest-browser 83s — the winner was the *slowest* of the three). It won on being the portability contract. Goldens: only `packages/ui-contract/goldens/playwright/` survives (~2,659 PNGs).

### Browser e2e — Cypress deleted, Gherkin parked

| Approach | Verdict | Why |
|---|---|---|
| **Native Playwright** (react + solid) | ✅ **Kept** — declared the browser source-of-truth | New browser behaviour lands here first; a matching `.feature` scenario is now optional. |
| **Cypress** (native + cucumber) | ❌ **Deleted** | The forked, queue-aware scenario layer was the deciding maintenance cost, plus a standing arm64/Electron busy-spin hazard. (Cypress was already de-gated from CI beforehand.) |
| **playwright-cucumber** (Gherkin, react + solid) | ⏸️ **Parked, not deleted** | Off the PR gate (`RTC_E2E_SKIP_GHERKIN_BROWSER=1`), kept alive by a weekly workflow (`.github/workflows/e2e-gherkin-weekly.yml`, Mondays) so the `.feature`/step tree can't silently rot. |

Suites: **12 → 7 total, 5 on the PR gate.**

### Presenter — 4 peers → 1 gating winner + 1 parked BDD showcase

| Approach | Verdict |
|---|---|
| **`vitest-fake-timers`** (plain vitest, fake timers) | ✅ **Kept — the gating presenter runner** |
| **`cucumber-fake-timers`** (Cucumber.js + `@sinonjs/fake-timers`) | ⏸️ **Parked as the presenter BDD showcase** (see below) |
| `cucumber` (Cucumber.js, real timers) | ❌ **Deleted** — slowest peer (real-time waits, 40.7s CI) |
| `vitest-quickpickle-fake-timers` (quickpickle: Gherkin-in-Vitest) | ❌ **Deleted** |

The gating winner is the plain `vitest-fake-timers` peer (describe-based, no Gherkin loader). Its `RealAwaitHelpers` real-timer path went with the deleted real-timer `cucumber` peer, and the `quickpickle` dependency went with its peer — so **no presenter test runs under real timers any more** (the parked showcase uses `@sinonjs/fake-timers` too).

#### Presenter BDD showcase — how the survivor was chosen

The initial retirement deleted all three non-winner peers. A later decision kept **one** as a parked BDD showcase — mirroring how `playwright-cucumber` was parked at the browser tier — and the choice between the two fake-timer peers was made on evidence, not taste:

| | `cucumber-fake-timers` ✅ | `vitest-quickpickle-fake-timers` |
|---|---|---|
| Runner | **`@cucumber/cucumber`** — same as the parked browser peer | quickpickle (Gherkin-in-Vitest) |
| Structure | `cucumber.js` + `hooks` + `world` + shared `steps/` — identical shape to `playwright-cucumber` | own `vitest.config` + self-contained `steps/` |
| Feature corpus | **`specs/**/*.feature`** — the same files `playwright-cucumber` runs | (own step-binding of the corpus) |
| Dependency to re-add | `@sinonjs/fake-timers` (`@cucumber/cucumber` already kept for the browser peer) | `quickpickle` |
| Speed (CI) | **2.0s** (fastest of the four peers) | 4.0s |

**Verdict: `cucumber-fake-timers`.** It is the literal presenter-tier twin of `playwright-cucumber` — same Cucumber.js runner, same structure, same `tests/specs/` corpus — so the repo tells one coherent story: *the Gherkin corpus is executed by Cucumber.js at both the browser and presenter layers.* Its runner dependency was already retained for the browser peer, so it adds the least, and it was the fastest of the four. The counter-case for quickpickle (it keeps the presenter tier single-runner, Gherkin inside Vitest) was real but lost to the mirroring argument.

**Parked, not gating:** it is never in `run-all.ts` (so it can't touch the PR gate), is runnable via `pnpm --filter @rtc/tests test:presenter:cucumber-fake-timers`, and is exercised every Monday by `.github/workflows/e2e-gherkin-weekly.yml` so its step tree can't silently rot. It runs all 21 `@presenter` scenarios (incl. `admin/incident`), green.

### Contract tier — untouched

Its four "variants" were never a bake-off: they are `{react, solid} × {plain, coverage}` over **one** spec corpus (86 files / 622 tests) — parity insurance plus the ≥95% coverage gates. Left exactly as-is.

## Measured before → after (CI job-time)

| CI job | Before | After | Note |
|---|---|---|---|
| **Visual diffs** (post-merge) | ~52 min | **~15 min** | ~52→~29 from tier retirement; ~29→~15 from a follow-up job-matrix parallelization (react + solid on separate runners). |
| Goldens regen (`update-visual-goldens.yml`) | ~32 min | ~11 min | Two dead tiers' regen steps removed. |
| `checks` (typecheck · test · build · gates) | ~10.1 min | ~7.9 min | Fewer deps to install, fewer tests. |
| `e2e` (browser · presenter · fullstack) | ~8.0 min | ~7.8 min | Small — see below. |

**Why the browser/presenter deletions barely moved CI time — and why they still mattered.** Cypress was already de-gated (≈0 CI minutes), and the e2e suites run ~10-wide in parallel, so parking 2 of 12 suites and dropping 3 presenter peers doesn't cut wall-clock unless you remove the *longest pole* — and none of these were it. Their payoff was in **local full-run time, dependency count, and flakiness surface**, not the CI bottleneck. **Visual was the entire CI story.**

## Coverage integrity — the hard requirement, verified

"Don't lose anything" was the binding constraint. A final whole-branch review checked it adversarially rather than by assertion:

- All **48 deleted Cypress `it()`s map name-for-name** to surviving Playwright tests (the two differences were both in Playwright's favour).
- The deleted presenter step files contained **zero `expect`/`assert` calls** — they were drivers, not oracles.
- The visual **scenario matrix stayed at 1282**, and the surviving golden tree is **byte-identical** at 2,659 PNGs.

### The gap this found and closed

`admin/incident.feature`'s `@presenter` scenario had been exercised **only** by the deleted cucumber peers, and was never listed in gate 21's checked feature set — so retiring those peers would have silently dropped it. It was recovered into the surviving vitest peer (**21 → 22 presenter scenarios**) and gate 21 was extended to enforce it mechanically. The retirement improved correctness.

## Two accepted reductions (by design, not oversight)

Choosing this shape traded two things away deliberately, recorded here so they're not mistaken for regressions:

1. **A Gherkin / step-tree regression is now caught weekly, not per-PR** (the parked browser layer).
2. **No presenter test runs under real timers any more** — `RealAwaitHelpers` went with the cucumber peer, so a bug that only manifests with a real `setTimeout` has lost its witness.

## Trail

Retirement PRs: #294, #296, #297, #299, #300, #303, #304. Close-out: #305. Follow-up visual parallelization: #311. Backlog of remaining, deliberately-deferred follow-ups (gate-21 hardening, theme-matrix trim, `visual.yml` paths filter, revisit the parked Gherkin layer): [`STATUS.md`](./STATUS.md).
