# @rtc/tests — cross-package test suites

Browser e2e, presenter integration, and full-stack smoke suites. Unit tests and
visual tests live inside each package (see `packages/client-react/README.md`).
The **visual** (pixel-golden) tier has its own home under `client-react`:
[layout & rationale](../packages/client-react/tests/ui/visual/README.md) and a
[golden-update runbook](../packages/client-react/tests/ui/visual/UPDATING-GOLDENS.md).

> This README is the **operational** reference (how to run, reports,
> orchestration). For the **decision & migration** view — what the suites share,
> a diagram, pros/cons, and how to migrate the UI library or the test framework
> — see [`STRATEGY.md`](./STRATEGY.md).

## Naming convention

**Name the deviation, leave the default bare.**

- `test:<group>:<suite>` ⇒ code lives at `tests/<group>/<suite>/`.
- Bare `playwright` = the runner's **native** authoring style (the default).
  The `-cucumber` suffix marks the Gherkin-driven variant.
- The presenter family is a single suite, `vitest-fake-timers` (plain `it()`
  blocks, no Gherkin loader, `vi.useFakeTimers`) — the winner of a bake-off
  against a real-timer Gherkin oracle and two virtual-time peers (one Gherkin,
  one plain), retired 2026-07-20; see `STRATEGY.md` §5 for the verdict.

## Scripts

| script | what it runs | server | report (under `reports/`) |
|---|---|---|---|
| `test:e2e` | gates, then ALL 7 suites below in parallel via `scripts/run-all.ts` | per-suite | — (each suite writes its own) |
| `test:browser:playwright` | native `@playwright/test` specs, `browser/playwright/` | dev server | `browser/playwright/` |
| `test:browser:playwright:headed` | ↑ in a visible browser (`playwright test --headed`, one window at a time) | dev server | `browser/playwright/` |
| `test:browser:playwright:ui` | ↑ in Playwright UI mode (`playwright test --ui`: test-tree sidebar, watch mode, time-travel/trace) | dev server | — (interactive) |
| `test:browser:playwright-cucumber` | cucumber-js driving Playwright, `specs/*.feature` + `browser/steps/` | dev server | `browser/playwright-cucumber/` |
| `test:browser:playwright-cucumber:headed` | ↑ in a visible browser (headed Chromium + slowMo) | dev server | `browser/playwright-cucumber/` |
| `test:browser:playwright:solid` | same config + specs as `test:browser:playwright`, driven against `@rtc/client-solid` (`RTC_CLIENT_PKG=@rtc/client-solid`), ports 3003/3004 | dev server | `browser/playwright-solid/` |
| `test:browser:playwright-cucumber:solid` | same config + `.feature`/steps as `test:browser:playwright-cucumber`, driven against `@rtc/client-solid`, ports 3003/3004 | dev server | `browser/playwright-cucumber-solid/` |
| `test:presenter:vitest-fake-timers` | presenter scenarios as plain vitest `it()` blocks (no Gherkin), virtual time | none | `presenter/vitest-fake-timers/` |
| `test:fullstack:node` | smoke against the REAL server via a Node WebSocket (no browser) | own server | — (bare tsx script, no framework — the one exception) |
| `test:fullstack:browser` | smoke against the REAL server + client, Playwright drives the browser | own server + client | `fullstack/browser/` |
| `test:fullstack:browser:headed` | ↑ in a visible browser (`--headed`) | own server + client | `fullstack/browser/` |
| `gates` | the grep/custom architecture gates (see `scripts/grep-gates.ts` for the current list) | none | — |
| `port:free` | frees the dev-server port (`RTC_DEV_PORT`, default 3000) | — | — |

The two `:solid` rows are not a separate suite family — they run the *same*
config, specs, steps, and page objects as their React counterparts, only
re-pointed at `@rtc/client-solid` via `RTC_CLIENT_PKG`. See
[`docs/architecture/21-cross-framework-testing.md`](../docs/architecture/21-cross-framework-testing.md#mechanism-3--e2e-via-rtc_client_pkg)
§21 Mechanism 3 for the full env-var → `devServer.ts` → `run-all.ts` wiring.

Utility scripts (`clean`, `clean:deep`, `typecheck`) are not included in the
table — they are not part of the test pipeline. The `:headed` and `:ui` variants
are interactive dev tools and are NOT run by `test:e2e`. `:headed` watches a suite
live in a visible browser; `:ui` (native Playwright only) opens Playwright UI mode
— a separate runner app with a test-tree sidebar, watch mode, and time-travel
debugging. UI mode requires the native `@playwright/test` runner to enumerate the
test tree, so the cucumber-driven suites (which drive Playwright through their own
cucumber-js runner) get a `:headed` variant only, not `:ui`.

## Layout

Folders without a `[shared: …]` tag belong only to the suite they sit in.

```
browser/
  playwright/           native Playwright suite (config + specs + context helpers)
  playwright-cucumber/  cucumber.js config + world/hooks
  steps/                [shared: playwright-cucumber + its :solid peer] Gherkin step defs
  scenarios/            [shared: playwright + playwright-cucumber] async scenario layer
  page-objects/         [shared: all 4 browser suites] contracts/ (driver-free) + impls
  testContext.ts        [shared: all 4 browser suites] driver-agnostic ctx: { po, scratch }
presenter/
  vitest-fake-timers/   vitest config + plain *.test.ts files (virtual time)
  scenarios/            _buildApp seam + _shared/ scenario fns used by
                        vitest-fake-timers (formerly shared by 3 other
                        runner/time-model peers, retired 2026-07-20)
specs/                  [shared: playwright-cucumber (incl. its :solid peer)]
                        .feature files
fullstack/              node + browser smokes against the real server
scripts/                run-all, with-server, devServer, free-port, grep-gates
```

Path-resolution rule: cucumber `import:` globs are **tests-root relative**
(CWD/projectRoot = `tests/`), even though the config files live in suite
folders. The vitest configs pin `root` back to `tests/` explicitly.

## Reports

Every test script writes an HTML report whose path mirrors the script name:
`test:<group>:<suite>` ⇒ `reports/<group>/<suite>/report/index.html` — open
that. Browser suites also write raw failure output (screenshots, traces) to
the `artifacts/` **sibling**; the two are siblings because each HTML reporter
owns — and wipes — its own `report/` folder at write time.

Failure screenshots are embedded in the report itself for all four browser
suites. The one script with no report: `test:fullstack:node` (a bare tsx
script with no test framework — terminal output only). `reports/` is
gitignored and removed by `pnpm clean`.

These suites measure **behaviour, not coverage** — they drive the app in a
separate process from the test runner, so there are no coverage reports here.
Code-coverage lives in the in-process tiers (`@rtc/domain` / `@rtc/server`
`test:coverage`, and `@rtc/client-react` `test:app:coverage` /
`test:ui:contract:coverage` / `test:ui:visual:vitest-browser:react:coverage`);
see the root README's report map.

## Orchestration

`test:e2e` → `scripts/run-all.ts`: every suite runs concurrently; each browser
suite gets its own dev server on `RTC_DEV_PORT` 3001–3004 (react 3001–3002,
solid 3003–3004) (via `scripts/with-server.ts`). `RTC_E2E_MAX_PARALLEL=n` caps
concurrency (CI uses 2). Wall-clock ≈ the slowest single suite when uncapped;
a cap stretches that proportionally.

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

The playwright/playwright-cucumber pair (each also run against the Solid
client) intentionally implements the same behavior specs on different
authoring styles — a portability proof for the clean-architecture seams (see
`docs/architecture/09-test-strategy.md` §9 "Test Strategy"). The shared layers
(`specs/`, `steps/`, `scenarios/`, `page-objects/contracts/`) are the
deliverable; the per-suite folders show how little each stack needs on top.

Cypress was a third browser-driver option in this comparison — a native suite
and a Cucumber-driven suite, mirroring the Playwright pair. Both were deleted
2026-07-20 after a framework bake-off concluded native Playwright was the
better browser driver for this app (async-native scenario reuse vs Cypress's
forked queue layer, no Electron/arm64 hazard, and a clear wall-clock win); see
`STRATEGY.md` §7 for the full verdict.

The presenter family ran the same 21 `@presenter` scenarios through four
runner/time-model peers — a real-timer Gherkin oracle (`cucumber`) and three
virtual-time peers (`cucumber-fake-timers`, `vitest-quickpickle-fake-timers`,
and the plain `vitest-fake-timers`) — as a second portability proof: could the
same `scenarios/_shared/*.ts` + `AwaitHelpers`/`PresenterWorld` abstractions
serve a Gherkin runner and a raw-Vitest runner equally well? All four were
collapsed to the single `vitest-fake-timers` peer 2026-07-20 once it proved the
fastest (1s local / 2.5s CI, vs the real-timer oracle's ~41s CI) with zero
Gherkin-loader dependencies; see `STRATEGY.md` §5 for the full verdict.
