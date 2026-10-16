# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

This project aims to recreate [ReactiveTraderCloud](https://github.com/AdaptiveConsulting/ReactiveTraderCloud) from specifications, following clean architecture principles. ReactiveTraderCloud is a real-time FX trading platform with live pricing, trade execution, and analytics.

## Current Status

Monorepo (pnpm workspaces + Turborepo): three shipping clients (React, Solid, RN/Expo) over three interchangeable application cores (RxJS, async/await, Effect-TS) behind the types-only `@rtc/core-api`. What is pending lives in `docs/STATUS.md`; `docs/architecture.md` is the authoritative architecture reference.

Package roles and the allowed dependency edges are in each `package.json`, `docs/architecture/06-package-dependencies.md` (§6) and `.dependency-cruiser.mts`, which enforces them: dependencies flow inward only; `@rtc/domain` and `@rtc/ws-effects` take `rxjs` as their only runtime dependency; the Anthropic and MCP SDKs are confined to `packages/server/src/agent/` and `packages/server/src/mcp/`. The rules with their reasons are in the `application-core-rules` skill.

**Application cores.** Before changing a member of an application core (`client-core-rxjs` / `-async` / `-effect`), or `core-api`, `core-logic` or `core-contract`, load the `application-core-rules` skill — the guarantees there are what the contract suites test, and the reasons behind them.

## Build Commands

```bash
pnpm build       # Topological: domain → shared → client + server
pnpm typecheck   # tsc --noEmit in all packages, then the tooling program (scripts, lint rules, root configs)
pnpm test        # vitest run in all packages
pnpm test:e2e    # Gherkin/Playwright e2e suites under tests/ against the web clients — the Playwright suites drive a production build (RTC_E2E_SERVE=dev puts them on the dev server), the Gherkin suites the dev server
```

Every other script (dev servers, the four data-source modes, devtools, design prototypes, iOS/Android) is in the root `package.json`. How to launch a client, the demo logins and the env traps: the `launching-the-app` skill.

**TypeScript toolchain — a deliberate dual install (since 2026-09-13).** `tsc` is TypeScript **7** (the Go-native compiler, linked from the `@typescript/native` alias) while the `typescript` package name resolves to the **6.x JS API** (`npm:@typescript/typescript6`), because TS 7.0 ships no programmatic API and three CI gates need one (`typescript-eslint`, `dependency-cruiser`, Expo's `app.config.ts` loader). Consequences that look wrong but are correct: `pnpm outdated` / Renovate showing `typescript` at 6.x; a `tsc6` bin nothing calls (it is for A/B repros); `tsconfig.depcruise.json` keeping `baseUrl`, an option `tsc` 7 rejects but only the 6.x API ever reads. Whole-repo typecheck went 21.9 s → 4.7 s sequential. Measurements, blockers and the exit plan: `docs/typescript-7.md`; the move-off-6 item lives in `docs/STATUS.md`. **Never run two builds in one checkout at once:** 14 packages use project references, so a `--filter`ed `tsc --build` of one package also rebuilds the libraries it references, and two such builds can truncate a shared `.d.ts` to zero bytes — tsc's incremental build info then marks it emitted and turbo caches it, surfacing later as `TS2306 … is not a module` on a file nobody touched. Every tsc-emitting `build` therefore ends with `scripts/check-dist.mts` (enforced by `pnpm check:scripts`), which fails THAT build by name; `pnpm check:dist` runs it over every package, and its message carries the recovery recipe (delete the package's dist + build info, rebuild it alone, `turbo run build --filter=… --force`).

**Tooling is TypeScript too — `.mts`, run by plain `node` (since 2026-10-04).** The gate scripts (`scripts/**/*.mts`), the custom ESLint rules (`eslint-rules/*.mts`) and the root tool configs (`eslint.config.mts`, `.dependency-cruiser.mts`, the two `cucumber.mts`) are TypeScript that Node 26 runs directly by stripping the types: `node scripts/check-dist.mts`, no `tsx`, no build step. The extension is `.mts` rather than `.ts` because the root `package.json` has no `"type"` field, so `.mts` is what guarantees ESM. Three consequences:

- **Node never typechecks them** — stripping is not checking. `pnpm typecheck:tooling` (`tsconfig.tooling.json`, chained onto `pnpm typecheck`) is the only place they are checked, so a new tooling file must fall inside that tsconfig's `include`.
- **Erasable syntax only.** An `enum`, a `namespace` or a constructor parameter property dies at runtime with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`; `erasableSyntaxOnly` rejects them at typecheck time instead. Relative imports spell out the extension (`./workspaces.mts`).
- **No new JavaScript, no CommonJS.** Both are lint errors (`eslint.config.mts`); the exemptions, and the reason each needs, are documented there.

The Node floor this relies on is declared in the root `package.json` `devEngines.runtime`, which pnpm enforces on install — not in `engines.node`, which `vercel build` reads and rejects above the Node it hosts (grep gate 52; it failed a Deploy on 2026-10-06).

**Every script runs on plain `node`; `tsx` survives only as the two dev servers' watch-runner.** A script's relative and `#/` imports spell out the extension (`./lib/coreImpl.ts`), and `erasableSyntaxOnly` is on wherever node runs the source (the tooling program, `tests/`). Workspace packages are importable from such a script because every tsc-built `dist` is Node-resolvable ESM: `tsconfig.base.json` sets tsc-alias's `resolveFullPaths`, which writes the `.js` extension onto each relative import (the file is in turbo's `globalDependencies`, so changing it busts the build cache). The RN package's node-run scripts pass `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`: that package cannot declare `"type": "module"` while Jest 29 needs a CommonJS `jest.config.js`. What still uses the npm tool `tsx`: `@rtc/server`'s and `@rtc/devtools-relay`'s `dev` scripts, which run **source** (whose imports are `./x.js`-style or extensionless `#/`), and the fullstack smokes that launch the server that same way.

## Repo Slash Commands

Project-scoped Claude Code commands live in `.claude/commands/rtc/` (committed,
so every worktree and session gets them):

| Command | What it does |
|---|---|
| `/rtc:gauntlet [full]` | Local mirror of CI's `checks` job. Bare = the 21 fast gates (~50s, no build). `full` adds typecheck, unit tests, the eight ≥95% coverage gates (both UI contracts, devtools core + app, both alternative cores, `@rtc/web-boot`, the React Native client's merged lines), type-aware ESLint, build, and the post-build `/devtools/` and core-bundle checks (~9 min). `e2e` is excluded — it's a separate CI job; run `pnpm test:e2e` explicitly. |
| `/rtc:status [live\|backlog]` | Live branch/PR/CI position plus a summary of `docs/STATUS.md` (never inlined — it is well over 100 KB). |
| `/rtc:docs [keywords]` | Capture a session's findings into `docs/` — surveys the ~430-file corpus, routes by finding type (STATUS.md goes via its own skill), proposes placement, then ships a PR through merge. |
| `/rtc:changelog [week]` | Write the week's entry in the root `CHANGELOG.md` from the PRs merged that week (ISO-week "versions", grouped by theme with a `Decisions` section), prove every merged PR is cited, then ship a PR. The changelog says what **landed**; `docs/STATUS.md` says what is **pending**. |
| `/rtc:backfill-test-coverage [filter]` | Rank **per-file** coverage gaps from a fresh local run (`pnpm coverage:gaps`), propose a shortlist, then backfill tests. Exists because the ≥95% gate asserts an *aggregate* and cannot surface one weak file — `client-solid` sat at 99.35% while a file was at 56%. |
| `/rtc:perf-audit [react\|solid\|both] [freeze\|all-levels]` | Repeatable motion audit (`pnpm perf:motion-audit[:solid]`): drives every workspace view per power-saver level, censuses `document.getAnimations()` + rAF registrations, and asserts freeze is motion-free. The instrument that found freeze's churn leaks (manufactured transitions, retriggered flashes) — see `docs/power-saver-mode.md`. |
| `/rtc:visual-tolerance-audit [samples] [--ref <branch>]` | Measures the visual tier's REAL cross-run noise floor (`pnpm visual:jitter` over N `update-visual-goldens` artifacts of the same commit) and judges **every** tier's `maxDiffPixelRatio` against it. Exists because that budget was once set from an assumption and was wrong both ways at once — too loose to notice a full PreferencesModal restructure (0.017 of pixels), while justified by AA jitter a 5-sample measurement put at **zero**. Step 0 enumerates all tolerance knobs: react and solid both assert against the *same* golden set, so the **loosest** of the two is the real gate — solid sat at `0.06` for three days after react moved to `0.005`, its comment still claiming to be a verbatim copy. Read the "measurement trap" section before touching the script: counting raw pixel differences manufactures phantom flakes on gradients. |

`/rtc:gauntlet` re-reads `ci.yml`'s step list on every run and warns if CI has
gained a gate it doesn't know about, so it can't silently drift out of sync.

Editing a command under `.claude/commands/`? Read `.claude/commands/CLAUDE.md` first — its `` !`…` `` blocks have a silent failure mode.

## Architecture Goals

- Follow clean architecture principles (separation of concerns, dependency inversion)
- "Make choices, defer commitment" — any framework (React, RxJS, ws-effects, Vite, Vitest) should be replaceable by changing only its package, not the monorepo config or domain logic
- Turborepo config is framework-blind (task names + dependency graph only)
- Reference implementation: https://github.com/AdaptiveConsulting/ReactiveTraderCloud

## Published Reports Are Stale By Default

Several workflows here **never trigger themselves** — they only run on
`workflow_dispatch`. Whatever they publish keeps serving the last *manually
dispatched* commit, with no banner saying so. Reading one of those artifacts
without checking its provenance means reasoning about a tree that may be weeks
and dozens of merges old.

| workflow | trigger | what goes stale |
|---|---|---|
| `coverage-report.yml` | **dispatch only** | the gh-pages coverage report (11 istanbul tiers) |
| `update-visual-goldens.yml` | **dispatch only** | the committed x86 `react/` golden set |
| `deploy.yml`, `deploy-proto.yml`, `deploy-cd-proto.yml` | **dispatch only** | the deployed sites |
| `ci.yml` | PR + push to main | — |
| `visual.yml` | push to main (post-merge, **not** a PR gate) | — |
| `publish-site.yml` | push to main | — |
| `e2e-gherkin-weekly.yml` | weekly cron (Mon 06:00) | up to 7 days of Gherkin drift |
| `weekly-tag.yml` | weekly cron (Mon 00:05 UTC) | — (tags the finished ISO week `2026-Wnn` and opens a "write the changelog" issue; the entry itself is written by `/rtc:changelog`, so `CHANGELOG.md` lags until someone runs it) |
| `accounts-keepalive.yml` | cron (Mon + Thu 07:17 UTC) | — (reads the deployed server's `/health/accounts`, which keeps a free-plan Supabase project from pausing; fails when the account store reads `down`, e.g. a paused project) |

**Before trusting the coverage report, refresh it and wait** (~7 min):

```bash
gh run list --workflow=coverage-report.yml --limit 1   # how old is the current one?
gh workflow run coverage-report.yml --ref main         # dispatch on the tree you care about
```

Report: <https://bettersoftware-io.github.io/ReactiveTraderCloudClone/coverage/>
— **eleven** tiers: `domain`, `server`, `devtools/core`, `devtools/app`, `web-boot`, then `app` / `ui (contract)` /
`ui (visual reach)` for each of `react` and `solid`. It is **report-only and
gates nothing**; the enforced bars are the eight ≥95% coverage gates in
`ci.yml` (six steps) — the `ui:contract` gate for each web client, the
`devtools-core`, `devtools-app`, `client-core-async`, `client-core-effect`
and `web-boot` `test:coverage` gates, and `client-react-native`'s `test:coverage:gate` (the
merged line coverage of its two runners; RN is not in the published report).
Its per-tier
`index.html` only lists directories, so finding gaps means crawling into them
— or run `pnpm coverage:gaps` for a ranked per-file list from a fresh local
run.

Reading the report (the visual-reach tiers, engine parity, comparing the two clients, three traps): the `reading-coverage-reports` skill.

## Markdown Diagrams

GitHub (and most md viewers) scale every diagram down to column width, so
**horizontal space is the scarce resource — vertical scroll is free**. Compose
diagrams tall, not wide: ≤4–5 sibling boxes per rank, split anything wider,
stack parallel lanes vertically. Mermaid trap: **edge-less subgraphs tile
side-by-side** — connect them with real edges or force vertical stacking with
invisible links (`laneA ~~~ laneB`). Sequence diagrams get wide fast: keep
participants ≤6 or split the scenario. Heading anchors: verify slugs with the
real `github-slugger` (` -- ` slugs to four dashes); `pnpm check:doc-links`
gates every relative md link + anchor in CI.

## Rendering Performance

The app is a permanently-animated HUD over a live data stream, so per-frame
main-thread work compounds forever. **Before writing or reviewing any CSS
animation, transition, or WAAPI call, read `docs/performance.md`** — it
catalogues the traps that burned ~70% of a core, as rules: animate only
`transform`/`opacity`; no `var()` inside animated transforms; one animation
per property per element; no transforms on SVG children; no large `filter`s.
It also holds the fix patterns that keep the visuals, the profiling recipe,
and a pre-merge checklist. Steady-state animations must show zero
`compositeFailed` events in a trace. Three of those rules (`background-color`,
`var()` in a transform, SVG children) are stricter than Chromium 153 needs in
the simplest case — re-measured 2026-10-04, see the doc's "Re-measured"
section. They stay as rules; do not state them as limits of the browser.

## UI Logic Placement

Before adding a UI hook or moving logic behind the ViewModel, consult
**`docs/adr/ADR-005-ui-logic-placement.md`** — the decision tree for choosing
between an RxJS machine in `client-core-rxjs`, a plain React hook, and a pure
function in `@rtc/motion-core` + a thin framework shell. The rule of thumb:
RxJS machines are for autonomous async folds decoupled from the view; per-frame
DOM-edge-driven computation is a pure function + injected signal, shared via
`@rtc/motion-core`.

## Test Fixtures

JSON fixtures and fixture-factory names are lint-enforced (`rtc/no-minified-json-literal`, `rtc/json-fixtures-in-factories`, `rtc/name-fixture-factories`); the rationale is in `docs/architecture/09-test-strategy.md` §"Readable JSON fixtures".

**A test is only worth its lines if some wrong implementation makes it fail.**
Prove it with a mutant rather than by reading: `node scripts/mutation-check.mts
<spec.json>` applies each `{file, find, replace}`, runs that mutant's test,
expects RED and restores the file in a `finally` (so a crash can never leave a
mutant behind for the next run to read as real). A SURVIVED row is a finding
about the test. See `docs/architecture/09-test-strategy.md` §"Proving a test
can fail".

**A test waiting for a timer-driven outcome runs on fake timers**
(`vi.useFakeTimers()` before composition, `vi.advanceTimersByTimeAsync` by the
exact interval, plus a positive witness that the step ran) — never a real
`setTimeout` sleep, and never a raised timeout. Both cores follow fake timers
(RxJS schedules through `setTimeout`; `Effect.sleep` advances under them).
The one safe real wait is a single earlier-deadline timer; anything behind a
chain of async hops races on a loaded CI runner (#829 went red three times
that way). Rule, safe shapes and the user-event / React-Testing-Library traps:
`docs/architecture/09-test-strategy.md` §"Waiting on time".

## Handler Naming

Before naming a function or a prop callback, read **`docs/handler-naming.md`**
— a function's own name must state its **effect** (what it does, to what),
never the occasion that triggers it; `rtc/name-functions-by-effect` enforces
this on every `.ts`/`.tsx` file. **Slots are exempt and correct as `onX`** — a
function-typed prop or callback-only method parameter, because its declarer
must not know what gets attached — but a concrete handler must be named for
its effect, even when the body is one line. The doc covers the full
slot-vs-handler doctrine (the `<Car>` example, the property-vs-method syntax
consequence), the name-decay rule, and the two known limits.

## Import Statements

One import statement per module, with types inline (`import { findRosterUser, type RosterEntry } from "@rtc/domain"`) — `rtc/one-import-per-module`, autofixable. A statement naming **only** types stays `import type { … }`: under `verbatimModuleSyntax` an `import { type A }` survives as a runtime import of the module, which here could pull a lazy application core into the eager bundle (Biome `useImportType` / `useExportType`).
