# @rtc/tests — cross-package test suites

Browser e2e, presenter integration, and full-stack smoke suites. Unit tests and
visual tests live inside each package (see `packages/client/README.md`).

> This README is the **operational** reference (how to run, reports,
> orchestration). For the **decision & migration** view — what the suites share,
> a diagram, pros/cons, and how to migrate the UI library or the test framework
> — see [`STRATEGY.md`](./STRATEGY.md).

## Naming convention

**Name the deviation, leave the default bare.**

- `test:<group>:<suite>` ⇒ code lives at `tests/<group>/<suite>/`.
- Bare `cypress` / `playwright` = the runner's **native** authoring style (the
  default). The `-cucumber` suffix marks the Gherkin-driven variants.
- The presenter reference suite is `cucumber` (Gherkin, **real timers**).
  Every other presenter peer runs **virtual time**: `cucumber-fake-timers`
  (`@sinonjs/fake-timers`), `vitest-fake-timers` (plain `it()` blocks,
  `vi.useFakeTimers`), and `vitest-quickpickle-fake-timers` (`.feature` files
  via quickpickle, `vi.useFakeTimers`).

## Scripts

| script | what it runs | server | report (under `reports/`) |
|---|---|---|---|
| `test:e2e` | gates, then ALL 10 suites below in parallel via `scripts/run-all.ts` | per-suite | — (each suite writes its own) |
| `test:browser:playwright` | native `@playwright/test` specs, `browser/playwright/` | dev server | `browser/playwright/` |
| `test:browser:playwright:headed` | ↑ in a visible browser (`playwright test --headed`, one window at a time) | dev server | `browser/playwright/` |
| `test:browser:playwright:ui` | ↑ in Playwright UI mode (`playwright test --ui`: test-tree sidebar, watch mode, time-travel/trace) | dev server | — (interactive) |
| `test:browser:cypress` | native Cypress Mocha specs, `browser/cypress/` | dev server | `browser/cypress/` |
| `test:browser:cypress:headed` | ↑ in the interactive Cypress runner (`cypress open`) | dev server | — (interactive) |
| `test:browser:playwright-cucumber` | cucumber-js driving Playwright, `specs/*.feature` + `browser/steps/` | dev server | `browser/playwright-cucumber/` |
| `test:browser:playwright-cucumber:headed` | ↑ in a visible browser (headed Chromium + slowMo) | dev server | `browser/playwright-cucumber/` |
| `test:browser:cypress-cucumber` | Cypress + @badeball preprocessor, same features/steps | dev server | `browser/cypress-cucumber/` |
| `test:browser:cypress-cucumber:headed` | ↑ in the interactive Cypress runner (`cypress open`) | dev server | — (interactive) |
| `test:presenter:cucumber` | cucumber-js against live presenters (in-process simulators), real timers | none | `presenter/cucumber/` |
| `test:presenter:cucumber-fake-timers` | same scenarios under `@sinonjs/fake-timers` | none | `presenter/cucumber-fake-timers/` |
| `test:presenter:vitest-fake-timers` | same scenarios as plain vitest `it()` blocks (no Gherkin), virtual time | none | `presenter/vitest-fake-timers/` |
| `test:presenter:vitest-quickpickle-fake-timers` | same `.feature` files via quickpickle + `vi.useFakeTimers` | none | `presenter/vitest-quickpickle-fake-timers/` |
| `test:fullstack:node` | smoke against the REAL server via a Node WebSocket (no browser) | own server | — (bare tsx script, no framework — the one exception) |
| `test:fullstack:browser` | smoke against the REAL server + client, Playwright drives the browser | own server + client | `fullstack/browser/` |
| `test:fullstack:browser:headed` | ↑ in a visible browser (`--headed`) | own server + client | `fullstack/browser/` |
| `gates` | 25 grep/custom architecture gates (`scripts/grep-gates.ts`) | none | — |
| `port:free` | frees the dev-server port (`RTC_DEV_PORT`, default 3000) | — | — |

Utility scripts (`clean`, `clean:deep`, `typecheck`) are not included in the
table — they are not part of the test pipeline. The `:headed` and `:ui` variants
are interactive dev tools and are NOT run by `test:e2e`. `:headed` watches a suite
live in a visible browser; `:ui` (native Playwright only) opens Playwright UI mode
— a separate runner app with a test-tree sidebar, watch mode, and time-travel
debugging. UI mode requires the native `@playwright/test` runner to enumerate the
test tree, so the cucumber-driven suites (which drive Playwright through their own
cucumber-js runner) get a `:headed` variant only, not `:ui`.

> **Heads-up:** the Cypress suites currently hang (silently, 100% CPU) in the
> arm64 dev container — see "Known issue" below. They still pass on x86 CI.

## Layout

Folders without a `[shared: …]` tag belong only to the suite they sit in.

```
browser/
  playwright/           native Playwright suite (config + specs + context helpers)
  cypress/              native Cypress suite (config + specs + context helper)
    scenarios/          queue-aware scenario forks (this suite only)
  playwright-cucumber/  cucumber.js config + world/hooks
  cypress-cucumber/     cypress config + world/e2e support + cucumber shim
  steps/                [shared: both *-cucumber suites] Gherkin step defs
  scenarios/            [shared: playwright + both *-cucumber] async scenario layer
  page-objects/         [shared: all 4 browser suites] contracts/ (driver-free) + impls
  testContext.ts        [shared: all 4 browser suites] driver-agnostic ctx: { po, scratch }
presenter/
  cucumber/             cucumber.js config + world/hooks (real timers)
  cucumber-fake-timers/ cucumber.js config + world/hooks (virtual time)
  vitest-fake-timers/   vitest config + plain *.test.ts files
  vitest-quickpickle-fake-timers/  vitest config + quickpickle setup + steps/
  steps/                [shared: both presenter cucumber suites] step defs
  scenarios/            [shared: all 4 presenter peers] _buildApp seam + _shared/
specs/                  [shared: all 5 Gherkin-driven suites] .feature files
fullstack/              node + browser smokes against the real server
scripts/                run-all, with-server, devServer, free-port, grep-gates
```

Path-resolution rule: cucumber `import:` globs, cypress `specPattern`/
`supportFile`, and the preprocessorrc `stepDefinitions` are all **tests-root
relative** (CWD/projectRoot = `tests/`), even though the config files live in
suite folders. The vitest configs pin `root` back to `tests/` explicitly.

## Reports

Every test script writes an HTML report whose path mirrors the script name:
`test:<group>:<suite>` ⇒ `reports/<group>/<suite>/report/index.html` — open
that. Browser suites also write raw failure output (screenshots, traces) to
the `artifacts/` **sibling**; the two are siblings because each HTML reporter
owns — and wipes — its own `report/` folder at write time.

Failure screenshots are embedded in the report itself for all four browser
suites. One caveat: a step that throws from plain `await`ed JS (outside the
Cypress command queue) crashes the badeball plugin before report write
("Unexpected state in testStepFinishedHandler", upstream), so the
cypress-cucumber report only appears when failures stay in-queue — assert
via `cy` commands, per the steps' existing convention. The one script with
no report: `test:fullstack:node` (a bare tsx script with no test framework —
terminal output only). `reports/` is gitignored and removed by `pnpm clean`.

These suites measure **behaviour, not coverage** — they drive the app in a
separate process from the test runner, so there are no coverage reports here.
Code-coverage lives in the in-process tiers (`@rtc/domain` / `@rtc/server`
`test:coverage`, and `@rtc/client` `test:app:coverage` /
`test:ui:contract:coverage` / `test:ui:visual:vitest-browser:react:coverage`);
see the root README's report map.

## Orchestration

`test:e2e` → `scripts/run-all.ts`: every suite runs concurrently; each browser
suite gets its own dev server on `RTC_DEV_PORT` 3001–3004 (via
`scripts/with-server.ts`); Cypress suites get private X displays via
`xvfb-run -a` on Linux. `RTC_E2E_MAX_PARALLEL=n` caps concurrency (CI uses 2).
Wall-clock ≈ the slowest single suite when uncapped; a cap stretches that
proportionally.

Full-stack smokes are self-contained: `test:fullstack:node` boots the real
server on port 4123 and drives it directly over a Node WebSocket;
`test:fullstack:browser` boots the real server on 4124 and the Vite client on
3100, then runs a Playwright spec against the live UI. Neither uses mocks or
simulators.

## Caching & freshness

Nothing in this package is ever cache-replayed:

- Root `pnpm test:e2e` runs through Turborepo, but the task is `cache: false`
  in `turbo.json` — a cached "pass" would replay old logs without running
  anything, which masked real failures here once. (Unlike the cached unit-test
  task, there is no `--force` to remember.)
- The per-suite scripts in the table above, invoked via
  `pnpm --filter @rtc/tests …`, bypass turbo entirely — always fresh. The flip
  side: they also skip turbo's task graph, so workspace packages are **not**
  auto-built; on a fresh checkout run `pnpm build` at the root first
  (`test:e2e` does this for you via its `dependsOn: ["build"]`).

## Known issue: Cypress suites hang in the arm64 dev container (2026-06)

**Symptom:** every `test:browser:cypress*` script (headless and `:headed`)
produces no output forever; the Cypress main process pins one core at 100%
CPU and never connects to its X display. Playwright suites are unaffected,
and all four browser suites pass on x86 CI.

**Root cause (established empirically, 2026-06-08 → 06-10):** the Cypress
runner is itself an Electron *app* — server, proxy, and reporter boot on the
bundled Electron before any test browser is chosen. In this container, every
Electron browser-process boot fails: vanilla Electron 37.6.0 (Cypress 15.16's
exact bundle) **and** latest 42.4.0 die with a silent SIGTRAP after the Node
side boots but before `app.whenReady()`, while Playwright's plain Chromium 148
boots fine under the same Xvfb. Cypress's wrapper turns that same boot failure
into an infinite respawn spin — hence "stuck" rather than an error.

**Not fixable in this repo:**

- `--browser <path>` can't help — the orchestrator dies before the browser
  option is read. (Electron's Chromium is compiled in; it is not swappable.)
- No Cypress version helps — 15.14.2 and 15.16.0 hang identically, and the
  newest Electron crashes the same way.
- Falsified: GPU/GL, X11/GTK (`--ozone-platform=headless` crashes too),
  io_uring, `/dev/shm`, dbus, suite renames, page size, glibc, fd limits,
  and the agent-sandbox seccomp layer.

**Suspected trigger:** a Docker Desktop upgrade replacing the VM under the
container (kernel `6.12.76-linuxkit`, built 2026-05-28). Cypress runs fine
natively on the same Apple-Silicon Mac. Quick in-container health check —
this should print a version instantly; if it hangs, the issue is still live:

```bash
timeout 20 ~/.cache/Cypress/15.16.0/Cypress/Cypress --no-sandbox --version
```

Host-side isolation test (stock container, no repo code; `FAIL exit=133`
on the current Docker Desktop + `PASS` after downgrading one release would
confirm a Docker Desktop regression worth filing at docker/for-mac):

```bash
docker run --rm node:24-bookworm bash -c '
  apt-get update -qq && apt-get install -qq -y --no-install-recommends \
    xvfb libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgtk-3-0 libgbm1 libasound2 >/dev/null
  mkdir /t && cd /t && npm init -y >/dev/null && npm i electron@37.6.0 >/dev/null 2>&1
  echo "const {app}=require(\"electron\");app.whenReady().then(()=>{console.log(\"ELECTRON BOOT OK\");app.quit()})" > m.js
  xvfb-run ./node_modules/.bin/electron --no-sandbox m.js && echo PASS || echo "FAIL exit=$?"
'
```

**What's reported upstream (researched 2026-06-19):** no exact public match
exists for this signature (silent SIGTRAP before `app.whenReady()` on the
`6.12.76-linuxkit` arm64 VM), but the surrounding evidence triangulates it:

- The well-known aarch64 Chromium SIGTRAP bug is a **64KB-page** PartitionAlloc
  failure (Red Hat Bugzilla 2166146, Chromium issue 40257452), fixed ~Chromium
  121. We falsified page size above, so ours is a *different* mechanism.
- Electron's own arm64 silent-SIGTRAP reports (electron/electron#32754, #35829)
  match the symptom but are all closed "not planned / need-repro" — upstream
  treats this family as environment-specific, so no Electron-side fix is coming.
- Docker Desktop linuxkit kernel regressions on Apple Silicon are a recurring
  2026 theme (docker/for-mac#7176 kernel-6.6.12 crash since Docker 4.27.1, #7024
  virtualization.framework crash, #7852 a 4.60.0 Electron crash) — consistent
  with the VM-upgrade trigger, though none is an exact match.

The load-bearing discriminator is local: Playwright's standalone Chromium 148
boots under the *same* Xvfb while Electron's older bundled Chromium does not.
Best current reading: the Docker Desktop linuxkit kernel is the **trigger**, and
the latent incompatibility lives in Electron's (older) bundled Chromium, which
newer standalone Chromium has already worked around. So the two cheap ways to
confirm are (a) try an Electron whose Chromium approaches 148 — if it boots, the
bundled-Chromium-version gap is the cause; (b) run the host-side isolation test
above before/after downgrading Docker Desktop one release — a flip from FAIL to
PASS confirms a docker/for-mac regression worth filing.

**Until resolved:** use the Playwright suites locally (including `:headed` /
`:ui`); treat the Cypress suites as CI-verified. To run the full e2e set minus
Cypress in a constrained sandbox, use `pnpm test:e2e:no-cypress` (sets
`RTC_E2E_SKIP_CYPRESS=1`). Alternatively run the dev container as `linux/amd64`
(matches CI, but emulation-slow).

## Why so many overlapping suites?

The browser pairs and the four presenter peers intentionally implement the
same behavior specs on different stacks — they are a comparison artifact and
portability proof for the clean-architecture seams (see
`docs/architecture.md` §9 "Test Strategy"). The shared layers (`specs/`,
`steps/`, `scenarios/`, `page-objects/contracts/`) are the deliverable; the
per-suite folders show how little each stack needs on top.
