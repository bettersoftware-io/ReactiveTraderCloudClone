# CI performance — how `ci.yml` went from ~12 to ~6 minutes

**Last measured: 2026-10-25.** Between 2026-10-16 and 2026-10-25 the longest
job in a `ci.yml` run fell from **743 s to 374–451 s**. No gate was dropped:
every test, coverage bar and core still runs on every PR. This page records
what changed, why each step was the right next one, what each measured, and
how to measure the next change. The cache decision has its own record,
[ADR-008](adr/ADR-008-ci-turbo-remote-cache.md); the job layout as a picture
is in [test strategy §9.10](architecture/09-test-strategy.md#910-the-ci-gauntlet).

> A run's wall time is set by its **longest job**, because every job starts at
> once on its own runner. Every number below is a job duration from
> `gh run view <run> --json jobs`. A run's own created→updated span is not
> used: it includes queueing and re-run attempts (run 38895571399 reports
> 1375 s for a run whose longest job took 743 s).

## Where it stands

The workflow is eight parallel jobs (five job definitions, two of them
matrices). The `main branch` ruleset requires each of them **by job name**:

| job (`ci.yml` key) | required check | what it runs | #1059 PR · `main` |
|---|---|---|---|
| `checks` | `typecheck · test · build · gates` | lint, typecheck, unit tests, build, bundle checks, knip, dependency graph, type-aware ESLint, grep gates | 269 · 269 s |
| `coverage` | `coverage gates (≥95%)` | build, then the eight ≥95% coverage gates | 352 · 378 s |
| `e2e` | `e2e (browser)` | the two Playwright browser suites, react + solid, rxjs core | 370 · 381 s |
| `e2e-alt-cores` | `e2e (async core · browser)`, `e2e (effect core · browser)` | the same browser suites on the other two cores | 328–374 · 338–451 s |
| `e2e-fullstack` | `e2e (rxjs core · presenter · fullstack)` and the async and effect legs | the full-stack smokes and the presenter peer, once per core | 194–254 · 208–256 s |

Runs: #1059's PR run 40191210429 and its merge on `main`, 40191735987. The
browser jobs are now the long pole. The spread among them is mostly
which runner class each one drew ([below](#measuring-a-ci-change)).

The road there, longest job per run:

| date | state | longest job | run |
|---|---|---|---|
| 2026-10-16 | before any of this | `checks` 743 s | 38895571399 |
| 2026-10-24 | cap, vmThreads and the remote cache in; a code PR | `checks` 715 s | 40126300544 |
| 2026-10-24 | a docs-only PR, every turbo task replayed | `e2e (async…)` 578 s | 40125163221 |
| 2026-10-25 | coverage job and 2 Playwright workers (#1057) | `e2e (browser…)` 604 s, slow runner | 40145681149 |
| 2026-10-25 | e2e split into browser and fullstack jobs (#1059) | `e2e (effect core · browser)` 374 s | 40191210429 |

## What changed, and why

### 1. The runner was saturated: cap, don't add (#1016, #1018)

The trigger was a flake: `credit-screen.test.tsx` timing out at vitest's 5 s
only on CI. `pnpm test` is `turbo run test`, whose default concurrency is 10,
and every vitest defaults to `availableParallelism − 1` = 3 workers. So ~28
processes queued on the 4-vCPU `ubuntu-latest` runner, and every test ran
4–5x slower than locally: `client-prototype`'s suite took ~200 s on CI
against 5 s on a laptop.

- **#1016** made that test 4.7x cheaper: its queries were scoped to the form
  instead of searching the whole screen by role and name.
- **#1018** capped the step at `pnpm test --concurrency=4 -- --maxWorkers=2`
  (turbo forwards `--maxWorkers` to each package's script; vitest and jest
  both read it). A paired experiment found **the same wall time**, because the
  cores are full either way. What changed is headroom: the worst test went from
  0.53–0.81 of its timeout to 0.30, and no test took over 2 s, where 5–20 had.

**Local runs got the same cap on 2026-10-25.** Uncapped, a laptop ran 10
turbo tasks × 11 vitest workers on 12 cores. Measured on a 12-core Mac,
`turbo run test --force --only` (no builds) with every configuration run
twice, order rotated, per-test durations read from each package's vitest
report:

| tasks × workers | wall time | slowest test |
|---|---|---|
| 10 × 11 (the old default) | 30, 25 s; later 23, 23 s | 1516–1581 ms; later 1284–1297 ms |
| 4 × 2 | 19, 20 s | 1055–1062 ms |
| 4 × 3 | 21, 20 s | 1060–1067 ms |
| 6 × 2 | 17, 18 s | 1062–1070 ms |
| the new script | 22, 21 s | 1058–1059 ms |

Every capped run was at least as fast as the default, and had more headroom
under the 5 s timeout. The later pairs ran on a busier machine (load average
17–26 at the start), which narrows the gap. 4 × 2 is within a couple of
seconds of the best, and it is what CI measured, so one cap serves both. The
root script is `VITEST_MAX_WORKERS=2 turbo run test --concurrency=4`: an
environment variable rather than `-- --maxWorkers=2` keeps `pnpm test --force`
and `pnpm test --filter …` working, since anything after a `--` in the script
would reach vitest instead of turbo. `VITEST_MAX_WORKERS` is in turbo's
`globalPassThroughEnv` (strict env mode would strip it otherwise; at 1 worker
`client-react`'s suite took 10 s against 3 s unset, proof that it arrives).
Jest does not read it, so the RN package's jest half is still uncapped locally.
CI's step passes `-- --maxWorkers=2` for that half.

The lesson that set up everything after it: **on this runner a step's wall
time is its CPU time divided by four.** Only less work makes a step faster,
or more runners make the run faster.

### 2. Less work per run: the `vmThreads` pool (#1021)

Vitest's default pool re-imported jsdom and every module for each test file,
~250 ms per file and 50–75% of each jsdom package's test time. Every package
except `server` now runs on `vmThreads`: modules load once per worker, and
each file gets a fresh VM context. All 27 unit suites went from 385 to 117
CPU-seconds (3.3x). On CI, `Tests (unit)` went from 167 to 104 s, the UI
contract coverage gates fell 35–38%, and `checks` from 686 to 566 s.
Coverage under the gates came out identical to the hundredth of a percent.
What a VM context changes for a test, and why `server` stays on `threads`:
[test strategy, "The test pool"](architecture/09-test-strategy.md#the-test-pool--vmthreads-and-what-a-vm-context-changes).

### 3. Less work between runs: the turbo remote cache (#1027, #1049)

CI kept no turbo cache, so every run rebuilt and re-tested all 27 packages
however little a PR touched. A replay of the 30 merges before 2026-10-17
put the skippable share of the unit-test step at a median 87%. The cache is
Vercel Remote Cache over OIDC: no stored credential, pushes to `main`
write, PRs only read. The five options, the security weighing and how to
switch are in [ADR-008](adr/ADR-008-ci-turbo-remote-cache.md).

Two inputs turbo could not see were found and declared at the same time:
`motion-core`'s tests read the clients' chart CSS, and `server`'s read
`supabase/migrations/`. Without the declarations, a change to either would
have replayed a stale green. Grep gate 55 now fails any package whose tests
read outside the package other than through a workspace dependency or a
declared input.

First measured replay (#1049, docs-only): `Typecheck` 36 → 2 s,
`Tests (unit)` 139 → 3 s, `checks` 682 → 527 s. That made `checks` shorter
than the e2e jobs on such a PR. From then on, a faster `checks` alone could
not shorten the run.

### 4. Split the longest job: the coverage gates beside `checks` (#1057)

On a code PR `checks` was still ~700 s, and its six coverage-gate steps
were ~250 s of that (react contract 85 s, solid contract 80 s, the two
alternative cores 38 s, React Native 35 s, devtools and web-boot ~7 s each).
They call vitest/jest through `pnpm --filter`, not turbo, so the cache never
skipped them. They moved unchanged into a `coverage` job that builds first
(each gate imports its dependencies' `dist/`) and asks for no `id-token`.
Result: `checks` 259–317 s, `coverage` 276–383 s.

**Cost:** one more runner per run, ~70–110 s of setup each (checkout
20–34 s, pnpm store 18–43 s, install 8 s, build ~25 s). Standard runners are
free for a public repository. The new name had to be added to the ruleset,
or the gates would have run without blocking a merge.

### 5. Playwright at 2 workers (#1057)

With `checks` shortened, the e2e jobs (~570–610 s) set the wall time. Their
long pole was the react and solid Playwright suites, 103 tests each, both on
`workers: 1` since the suite was created. Nobody had recorded why. Locally the
suite passed at 4 workers (3.4 → 1.2 min), so the tests were not
order-dependent.

On CI it was measured, not assumed (#1052, run 40142597318): both suites
concurrent as in the e2e job, every worker count on the **same** runner,
three runners with the order rotated, `vmstat` per variant.

| runner | 1 worker | 2 workers | 3 workers |
|---|---|---|---|
| A | 317 s | 258 s | 264 / 263 s |
| B | 284 s | 234 / 222 s | 228 s |
| C (slow class) | 372 s | 333 s | — |

Two workers is 14–22% faster. Three is no faster: at 1 worker the CPU was
15–19% idle, at 2 it was 1–3%. Every variant that ran passed 103/103.
Runner C's script died as its third variant started, after two had passed:
a fault in the measurement harness, not in a test.

### 6. The full-stack smokes in their own job (#1059)

Each e2e job ran its suites at most 2 at a time (`RTC_E2E_MAX_PARALLEL=2`).
The timing-sensitive full-stack smokes went first, so that no browser suite
competed with them. The browser suites therefore started only after ~100 s
of smokes. `tests/scripts/run-all.ts` now takes `RTC_E2E_GROUP`:

- `browser`: the `test:browser:*` suites. Run by `e2e` and `e2e-alt-cores`,
  without a cap, since two suites are the whole pool.
- `fullstack`: the smokes and the 5 s presenter peer. Run by `e2e-fullstack`,
  a matrix over all three cores, keeping the cap of 2 that protects the smokes.
- Unset runs both, as before, so a local `pnpm test:e2e` is unchanged. An
  unknown value throws.

Result: browser jobs 328–451 s, fullstack 194–256 s, and the longest job on
the PR **374 s** against 604 s the day before.

## Ubuntu 26 needed nothing (#1053)

GitHub moves `ubuntu-latest` from 24.04 to 26.04 gradually between
2026-10-19 and 2026-11-19
([runner-images#14748](https://github.com/actions/runner-images/issues/14748)).
One report on that notice cites missing packages. Rather than pin on
suspicion, every `ci.yml` job and both `e2e-gherkin-weekly.yml` jobs were run
on an explicit `ubuntu-26.04` (draft #1051, image 20261023.163.3). A probe
job also ran the deploy workflows' flyctl and Vercel CLI installers and listed
the runner's own tools. Everything passed at the same speed. shellcheck 0.11.0,
which `lint:actions` needs and would otherwise skip silently, is on the image.
Playwright's `--with-deps` did not warn about the OS. So the workflows stay on
`ubuntu-latest`. Pinning `ubuntu-26.04` would also need an `actionlint.yaml`
entry, since actionlint 1.7.12, the newest release, rejects that label as
unknown. The three container jobs (`visual`, `update-visual-goldens`,
`coverage-report`) take their libraries from the pinned Playwright image either way.

## Measuring a CI change

- **Two runner classes.** GitHub's standard runners come in a fast and a slow
  kind, about 1.4–1.6x apart, and each job draws one independently
  ([`tests/README.md`](../tests/README.md#dev-server-payload-lean-deps) has the
  older presenter-suite control). Read
  `test:fullstack:browser` in the run-all `SUMMARY` as the control: 59–74 s on
  a fast runner, 93–103 s on a slow one. One run compared across classes
  proves nothing. #1057's own run looked like no gain until the control
  showed two of its three e2e jobs had drawn slow runners.
- **Pair the variants on one runner.** Run every configuration in the same
  job, order rotated across a small matrix, so runner class and noisy
  neighbours cancel out. #1018 and #1052 both did this. The throwaway workflow
  from #1052 (a PR that is never merged) is the template.
- **Check saturation before adding parallelism.** `vmstat 5` alongside the
  run: idle near zero means more workers or processes cannot help, and
  only less work or more runners can.
- **A dispatch is not a measurement of the cache's write side.** A
  `workflow_dispatch` only reads the remote cache. A PR replays only what a
  `main` push already wrote, and only if its branch contains that commit.

## Traps met on the way

- **Required checks are matched by job name.** Renaming a job, adding a
  matrix leg or moving a gate into a new job leaves the ruleset requiring a
  name nothing produces, which blocks every PR. Or the new job runs without
  being required. Swap the names in the `main branch` ruleset
  (`gh api repos/bettersoftware-io/ReactiveTraderCloudClone/rulesets/18221238`,
  then `-X PUT` with the edited `rules`) right before merging. Open PRs
  on the old workflow then show the new checks missing until their CI re-runs.
- **A `continue-on-error` step shows green when it failed.** The remote-cache
  step did, for a whole run, while its log said "Not authorized." Verify such
  a step from its log ([ADR-008, Setup](adr/ADR-008-ci-turbo-remote-cache.md#setup)).
- **A dispatch on `main` cancels `main`'s run in progress.** The workflow's
  concurrency group is per ref, with `cancel-in-progress`. Check
  `gh run list --branch main` first.
- **Job logs come from the API while a run is still going.**
  `gh run view --job <id> --log` refuses until the whole run completes;
  `gh api --allow-escape-sequences repos/…/actions/jobs/<id>/logs` serves a
  finished job's log at once.
- **Comments about the runner rot.** The e2e jobs' comments said "2-vCPU
  runner" for months. `nproc` in #1052 printed 4.

## Considered, not done

- **Caching the coverage gates through turbo.** `coverage` (276–383 s) sits
  below the browser jobs, so skipping it on a docs PR would not shorten the
  run. Doing it would mean turbo tasks for `test:ui:contract:coverage` and
  `test:coverage:gate`, and gate 55 extended to them.
- **Caching the e2e suites.** `test:e2e` stays `cache: false`. A replayed
  green ran nothing, and it once masked real failures
  ([`tests/README.md`, "Caching & freshness"](../tests/README.md#caching--freshness)).
- **3 Playwright workers.** Measured; no faster than 2 on 4 vCPUs.
- **Pinning the Ubuntu image.** Not needed (above). It would also turn every
  future image move into a PR someone has to remember.

## Next levers

The jobs now finish within ~3 minutes of each other, so the next saving has
to come from the browser jobs themselves (~220–250 s of suite time at 2
workers on a fast runner):

- **Shard each browser suite across two runners** (`playwright test
  --shard=1/2`). Each shard would get a whole runner, but pays the
  ~70–110 s job setup again. Unmeasured.
- **Read the three browser jobs like for like before ranking them.** On the
  production build the Effect core's suites ran ~1.06x the RxJS ones
  ([`tests/README.md`, "Reading e2e job timings"](../tests/README.md#dev-server-payload-lean-deps)),
  so a 451 s against 381 s gap on one run is mostly the runner class.

## Related

- [ADR-008](adr/ADR-008-ci-turbo-remote-cache.md): the remote cache decision.
- [Test strategy §9.10](architecture/09-test-strategy.md#910-the-ci-gauntlet):
  the job layout and its diagram.
- `.github/workflows/ci.yml`: each change above is commented at its step or job.
- `tests/browser/playwright/playwright.config.ts`: the worker count and its measurement.
- `tests/scripts/run-all.ts`: `RTC_E2E_GROUP` and `RTC_E2E_MAX_PARALLEL`.
