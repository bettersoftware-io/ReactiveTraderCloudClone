# @rtc/tests — cross-package test suites

Browser e2e, presenter integration, and full-stack smoke suites. Unit tests and
visual-diff tests live inside each package (see `packages/client/README.md`).

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

| script | what it runs | server |
|---|---|---|
| `test:e2e` | gates, then ALL 10 suites below in parallel via `scripts/run-all.ts` | per-suite |
| `test:browser:playwright` | native `@playwright/test` specs, `browser/playwright/` | dev server |
| `test:browser:cypress` | native Cypress Mocha specs, `browser/cypress/` | dev server |
| `test:browser:playwright-cucumber` | cucumber-js driving Playwright, `specs/*.feature` + `browser/steps/` | dev server |
| `test:browser:cypress-cucumber` | Cypress + @badeball preprocessor, same features/steps | dev server |
| `test:browser:cypress-cucumber:open` | the above in the interactive Cypress runner | dev server |
| `test:presenter:cucumber` | cucumber-js against live presenters (in-process simulators), real timers | none |
| `test:presenter:cucumber-fake-timers` | same scenarios under `@sinonjs/fake-timers` | none |
| `test:presenter:vitest-fake-timers` | same scenarios as plain vitest `it()` blocks (no Gherkin), virtual time | none |
| `test:presenter:vitest-quickpickle-fake-timers` | same `.feature` files via quickpickle + `vi.useFakeTimers` | none |
| `test:fullstack:node` | smoke against the REAL server via a Node WebSocket (no browser) | own server |
| `test:fullstack:browser` | smoke against the REAL server + client, Playwright drives the browser | own server + client |
| `gates` | 25 grep/custom architecture gates (`scripts/grep-gates.ts`) | none |
| `port:free` | frees the dev-server port (`RTC_DEV_PORT`, default 3000) | — |

Utility scripts (`clean`, `clean:deep`, `typecheck`) are not included in the
table — they are not part of the test pipeline.

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

## Why so many overlapping suites?

The browser pairs and the four presenter peers intentionally implement the
same behavior specs on different stacks — they are a comparison artifact and
portability proof for the clean-architecture seams (see
`docs/architecture.md` §9 "Test Strategy"). The shared layers (`specs/`,
`steps/`, `scenarios/`, `page-objects/contracts/`) are the deliverable; the
per-suite folders show how little each stack needs on top.
