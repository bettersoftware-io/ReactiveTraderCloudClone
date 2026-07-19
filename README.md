# ReactiveTraderCloudClone

A from-scratch reimagining of [Adaptive's ReactiveTraderCloud](https://github.com/AdaptiveConsulting/ReactiveTraderCloud) — a real-time FX trading platform with live pricing, trade execution, and analytics.

> **This is a concept project, not a product.** Its purpose is not to ship a
> trading platform but to demonstrate — end to end, on a non-trivial domain —
> how four practices reinforce each other:
>
> - **Clean architecture** — strict dependency inversion, ports & adapters, a
>   pure domain core that depends on nothing but RxJS.
> - **Spec-driven development** — behaviour is captured as executable
>   specifications first; the implementation is built to satisfy them.
> - **Robust, redundant verification** — the *same* behaviour is checked by
>   **eight independent test runners** plus a set of architectural "gates", so
>   the test suite itself becomes a comparison artifact you can trust.
> - **AI-assisted development** — the entire codebase was built in close
>   collaboration with an AI coding agent, and the structure above is precisely
>   what makes that collaboration safe and productive: tight contracts, fast
>   feedback, and verification that doesn't rely on a human reading every line.
>
> The interesting result is the *combination* — clean boundaries make specs easy
> to write, specs make verification meaningful, and meaningful verification is
> what lets an AI agent move quickly without breaking things.

## Architecture at a glance

The repo is a [pnpm](https://pnpm.io/) + [Turborepo](https://turbo.build/)
monorepo. Dependencies flow **inward only**:

```
packages/
  domain/    @rtc/domain   Pure TS. Entities, use cases, port interfaces,
                           simulators. Only runtime dependency: rxjs.
  shared/    @rtc/shared   DTOs and wire-format contracts. Depends on domain.
  client-react/  @rtc/client-react   React + RxJS + Vite web app. Depends on domain + shared.
  motion-core/  @rtc/motion-core   Framework-free view-layer motion math (FLIP deltas, rank-glide coalescing, easing/duration constants). Depends on nothing.
  ws-effects/  @rtc/ws-effects   Small declarative RxJS effects framework (rxjs-only). Depends on nothing but rxjs.
  server/    @rtc/server   Native WebSocket + @rtc/ws-effects backend. Depends on domain + shared + ws-effects.
  mobile/    @rtc/mobile   React Native client (planned). Depends on domain + shared.
```

**The rule:** `domain` knows nothing of `shared`; `shared` knows nothing of the
apps; `client`, `server`, and `mobile` never depend on each other. Any
framework (React, RxJS, ws-effects, Vite, Vitest) is meant to be replaceable by
changing only its own package. pnpm strict mode enforces the single-dependency
constraint on the domain at install time.

For the full picture, see:

- [`docs/README.md`](docs/README.md) — **documentation map**: every doc grouped by purpose, and how work flows from ideas to shipped. Start here.
- [`docs/architecture.md`](docs/architecture.md) — layers, ports, data flow, sequence diagrams.
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — the phased plan the build followed.
- [`docs/STATUS.md`](docs/STATUS.md) — cross-workstream **pending-work backlog** (what's not done yet); [`docs/IDEAS.md`](docs/IDEAS.md) is the upstream icebox of not-yet-planned ideas.
- [`docs/superpowers/STATUS.md`](docs/superpowers/STATUS.md) — authoritative status of each phase, including the current test topology.
- [`docs/superpowers/`](docs/superpowers/) — the per-phase specs and plans, including the design of the multi-runner verification stack (phases 5a–5e).
- [`docs/claude-sandbox.md`](docs/claude-sandbox.md) — running this repo from macOS WebStorm + the Linux claude-sandbox container at once: volume-isolating `node_modules`/`dist` so both work without interfering, and fixing WebStorm module resolution.

## Prerequisites

- **Node.js** 20 or newer (current LTS recommended)
- **pnpm** 9.15.4 (the repo pins this via `packageManager`; the easiest way to
  match it is [Corepack](https://nodejs.org/api/corepack.html)):

  ```bash
  corepack enable
  corepack prepare pnpm@9.15.4 --activate
  ```

## Install

```bash
git clone https://github.com/bettersoftware-io/ReactiveTraderCloudClone.git
cd ReactiveTraderCloudClone
pnpm install
```

> If you ever hit `Cannot find module @rollup/rollup-darwin-arm64` (a known
> pnpm optional-dependency quirk), re-run `pnpm install` — it's an install-time
> environment issue, not a code defect.

## Build

```bash
pnpm build       # Topological build: domain → shared → client + server
```

## Run

```bash
pnpm dev                          # @rtc/client-react, simulator mode — alias of dev:react, zero setup, no backend (Vite, http://localhost:5173)
pnpm dev:react:fs                 # full stack: WS server + @rtc/client-react wired to it (ws://localhost:4000)
pnpm --filter @rtc/server dev     # backend only (native WebSocket + @rtc/ws-effects, tsx watch)
```

The client is served by Vite (default `http://localhost:5173`). The composition
root selects live WebSocket adapters or in-process simulators based on the
`VITE_SERVER_URL` environment variable — with it unset, the client runs fully
against domain simulators, **no backend required**. Point it at a running
backend by setting `VITE_SERVER_URL` before starting the client.

**Sign in** at the login screen as any demo account — `astark`, `nromanoff`,
`tchalla`, or `demo` — password `mcdc2026`. These are committed demo credentials
(this is a demo app); the full-stack `dev:*:fs` scripts and the simulator both
work out of the box. See [`docs/authentication.md`](docs/authentication.md) for
the roster and how credentials are wired. (If `pnpm dev` renders a blank page
after a dependency change, clear the stale Vite cache:
`rm -rf packages/client-react/node_modules/.vite`.)

## Checks & tests

Everything below is wired through Turborepo, so runs are cached and incremental.

```bash
pnpm typecheck                    # tsc --noEmit across every package
pnpm test                         # unit tests (Vitest) across every package
pnpm test:e2e                     # gates, then all 10 suites in parallel (8 runners + 2 smokes)
pnpm test:ui:visual               # UI visual regression screenshots (all 3 runners)
pnpm --filter @rtc/tests gates    # architectural "grep gates" only
```

Reports land under each package's own `reports/` tree — gitignored, and wiped by
`pnpm clean`. There are two kinds, both keyed off the script name:

- **Test results** (HTML) — every test script writes one, mirroring its name:
  `test:<a>:<b>` ⇒ `<package>/reports/<a>/<b>/report/index.html` (bare `test` ⇒
  `reports/unit/report/`). Browser suites also drop failure traces/screenshots in
  the `artifacts/` sibling. Sole exception: `test:fullstack:node` is terminal-only.
- **Coverage** (HTML + `lcov.info`) — the opt-in `:coverage` scripts ⇒
  `<package>/reports/<a>/<b>/coverage/` (`@rtc/domain` & `@rtc/server`
  `test:coverage` ⇒ `reports/unit/coverage/`). All report-only except
  `@rtc/client-react test:ui:contract:coverage`, a CI-enforced ≥95% gate. The
  `@rtc/client-react test:ui:visual:vitest-browser:react:coverage` report is a
  **gap-finder**: uncovered `src/ui` branches are visual states with no golden
  snapshot (inventory: `packages/client-react/tests/ui/visual/COVERAGE-GAPS.md`).

Where each package writes:

| Package | Test-result reports | Coverage reports |
|---|---|---|
| `@rtc/domain` | `reports/unit/report/` | `reports/unit/coverage/` (`test:coverage`) |
| `@rtc/server` | `reports/unit/report/` | `reports/unit/coverage/` (`test:coverage`) |
| `@rtc/shared` | `reports/unit/report/` | — (package has no tests) |
| `@rtc/client-react` | `reports/{unit,app,ui/contract}/report/`, `reports/ui/visual/<runner>/react/report/` | `reports/{app,ui/contract,ui/visual}/coverage/` |
| `@rtc/tests` (e2e) | `reports/{presenter,browser,fullstack}/<suite>/report/` | — (cross-process; not measured) |

Per-package detail: [`packages/client-react/README.md`](packages/client-react/README.md)
(every client script ↔ report dir) and [`tests/README.md`](tests/README.md) (the
e2e suite matrix).

`pnpm test` runs each package's bare `test`; in `@rtc/client-react` that's the
**union** of two co-resident tiers — the **app tier** (`test:app`: presenters +
adapters under `src/app`) and the **ui contract tier** (`test:ui:contract`:
sociable RTL specs over `src/ui`) — which also have focused per-tier runners.

`pnpm test:e2e` is the full behavioural suite: it runs the gates first, then
launches all ten suites — the eight runners and the two full-stack smokes (see
below) — **in parallel**, buffering each suite's output and printing a pass/fail
summary at the end (non-zero exit if any fails). Wall-clock time is the slowest
single suite, not the sum. To run the entire verification stack in one go:

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e
```

> The architectural gates live in the `@rtc/tests` package, so run them with
> `pnpm --filter @rtc/tests gates` (or `pnpm gates` from inside `tests/`).

### Caching: why `pnpm test` can return instantly

`build`, `typecheck`, and `test` are **cached** Turborepo tasks. Turbo hashes
each task's inputs (source files, workspace deps, declared env vars); on a hash
hit it replays the stored logs instead of re-running — that's the instant
`>>> FULL TURBO` / `cache hit, replaying logs` output. An instant pass means
the inputs genuinely didn't change, so the result would be the same.

To force a real run anyway (a flaky test, something turbo doesn't hash, or you
just want to watch it run):

```bash
pnpm test --force                                       # ignore the cache, run fresh
TURBO_FORCE=true pnpm test                              # same, via env var
pnpm exec turbo run test --filter @rtc/client-react --force   # one package only
```

Two tasks are deliberately **never cached** (`cache: false` in `turbo.json`):
`test:e2e` and `test:ui:visual`. They exercise real browsers and servers, and a
cached "pass" replaying old logs has masked real failures here before.

Two non-solutions to know about:

- `pnpm clean` does **not** force a fresh run — it removes `dist/`, but turbo
  restores it straight from cache on the next run. `--force` is the tool.
- `pnpm --filter <pkg> <script>` bypasses turbo entirely (always fresh), but it
  also skips the task graph, so workspace deps are **not** auto-built — on a
  fresh checkout run `pnpm build` first.

A cached `pnpm test` replay also restores `reports/unit/` from cache (declared
turbo outputs) — `--force` regenerates them.

### Visual tests (a third tier — neither e2e nor integration)

`pnpm test:ui:visual` is a separate tier that screenshots
`@rtc/client-react` UI components and pages rendered against **injected fake data**.
It mounts only `src/ui/**` behind the `ViewModelProvider` seam — no presenters, no
domain use cases, no server, no live streams, no timers — so it tests *rendering
only*, the exact layer the SolidJS port replaced. The fixtures, scenario
manifest, and golden PNGs live in a React-free `@rtc/ui-contract`'s
`src/visual/` core (a separate package, consumed as a devDependency) so the
same baselines gate that reimplementation — `@rtc/client-solid`'s three visual
tiers assert against these goldens directly, owning none of their own.

```bash
pnpm test:ui:visual                                              # all 3 runners vs committed goldens
pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react:ui  # interactive (runner 1; runner 2 has :ui too)
# Regenerate goldens per runner — inspect before committing:
pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react:update
pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:update
```

See `packages/client-react/tests/ui/visual/README.md` for the layout and the SolidJS port's
execution record (`@rtc/client-solid` runs the same three tiers, assert-only against these goldens).

### Do I need to start the servers first?

No — every step boots whatever it needs and tears it down afterwards, so
`pnpm test:e2e` works from a cold checkout with nothing running.

- The **eight runners** test the client against **in-process domain simulators**
  (`VITE_SERVER_URL` unset) — no backend at all. Each browser runner starts its
  **own** Vite frontend: on a dedicated port during `pnpm test:e2e` (`:3001`–
  `:3004`, so the four run concurrently), or on `http://127.0.0.1:3000` by
  default when run standalone (override with `RTC_DEV_PORT`). The four presenter
  peers don't even need a browser.
- The **two full-stack smokes** are the only steps that involve the real
  backend, and each starts its own server (and, for the browser smoke, its own
  client) on dedicated ports.

> **The target port must be free.** A browser runner refuses to reuse a server
> it didn't start: if something is already on its port it fails immediately
> rather than running the tests against an unknown server (a leftover dev server,
> or a hand-started dev server such as `dev:react:fs` in WS-real mode) — which otherwise
> causes confusing, misattributed failures. `pnpm test:e2e` sidesteps contention
> by giving each browser suite its own port (`:3001`–`:3004`); a standalone
> runner uses `:3000` unless you set `RTC_DEV_PORT`. Within the Cucumber+Playwright
> suite, its parallel workers reuse the one server their runner started (signalled
> via `RTC_DEV_SERVER_SHARED`) rather than each binding the port. To free a port,
> run `pnpm --filter @rtc/tests port:free` (or
> `RTC_DEV_PORT=3002 pnpm --filter @rtc/tests port:free` for a specific one) — a
> cross-platform helper that probes for `lsof`, `ss`, or `fuser` (whichever your
> machine has; macOS ships `lsof`, our linuxkit/CI images often ship only `ss`)
> and kills the listener.

### Scope: what the eight runners do *not* cover

The eight-runner suite is end-to-end *within the client* (UI → presenters →
RxJS → adapters → **domain simulators**) — it is deliberately **not** full-stack.
It never starts `@rtc/server`, so the server's WebSocket translation layer is
covered separately by two layers:

- **Server protocol tests** (`packages/server/src/ws/wsHandler.test.ts`, run by
  `pnpm test`) — drive the real handler through a fake socket and assert it
  routes client frames to domain calls and emits the correct `@rtc/shared` wire
  shapes (subscribe routing, state-of-the-world markers, ack/nack, teardown).
- **Full-stack smokes** (`tests/fullstack/`, run by `pnpm test:e2e`) — boot the
  real server and drive the real client against it. The **node** smoke connects
  the client's `WsAdapter` over a real socket (subscribe→tick, execute→ack); the
  **browser** smoke points a Vite-built client at the server via `VITE_SERVER_URL`
  and asserts live prices render in the DOM.

### Running individual test runners

All runners are scripts in the `@rtc/tests` package; run any one in isolation
with a filter (each browser runner starts its own frontend on `:3000` by default
— must be free; override with `RTC_DEV_PORT` — see the port note above):

```bash
# Browser peers (drive the real UI against simulators)
pnpm --filter @rtc/tests test:browser:playwright            # native Playwright
pnpm --filter @rtc/tests test:browser:playwright-cucumber   # Cucumber + Playwright
pnpm --filter @rtc/tests test:browser:cypress               # native Cypress
pnpm --filter @rtc/tests test:browser:cypress-cucumber      # Cucumber + Cypress

# Presenter peers (pure Node, no browser/server)
pnpm --filter @rtc/tests test:presenter:cucumber                       # Gherkin, real timers (default)
pnpm --filter @rtc/tests test:presenter:cucumber-fake-timers           # Gherkin, virtual time
pnpm --filter @rtc/tests test:presenter:vitest-fake-timers             # plain vitest it() blocks, virtual time
pnpm --filter @rtc/tests test:presenter:vitest-quickpickle-fake-timers # Gherkin via quickpickle, virtual time

# Full-stack smokes (real server + real client)
pnpm --filter @rtc/tests test:fullstack:node     # real socket, no browser
pnpm --filter @rtc/tests test:fullstack:browser  # real browser via VITE_SERVER_URL

# Watch any browser suite live (:headed) — dev tools, not part of test:e2e
pnpm --filter @rtc/tests test:browser:playwright:headed          # Playwright --headed (runs once)
pnpm --filter @rtc/tests test:browser:playwright:ui              # Playwright UI mode (sidebar, watch, time-travel)
pnpm --filter @rtc/tests test:browser:playwright-cucumber:headed # headed Chromium + slowMo
pnpm --filter @rtc/tests test:browser:cypress:headed             # Cypress interactive runner (open)
pnpm --filter @rtc/tests test:browser:cypress-cucumber:headed    # Cypress interactive runner (open)
pnpm --filter @rtc/tests test:fullstack:browser:headed           # full stack, --headed
```

See tests/README.md for the full suite matrix and naming convention.

### What "verification" means here

This is where the project earns its keep. The same user-facing behaviour is
exercised by **eight independent runners** so they can be compared head-to-head:

- **Four browser peers** drive the real UI — Cucumber+Playwright, native
  Playwright, Cucumber+Cypress, and native Cypress.
- **Four presenter peers** drive the RxJS presenter layer in pure Node against
  domain simulators — `cucumber` (real timers), `cucumber-fake-timers`,
  `vitest-fake-timers` (plain `it()`), and `vitest-quickpickle-fake-timers`
  (Gherkin via quickpickle).

All eight run against in-process simulators; on top of them the **two full-stack
smokes** (above) exercise the real backend end to end. `pnpm test:e2e` runs the
gates, then all ten suites in parallel, exiting non-zero if any fails. The **25 architectural gates** (`pnpm gates`, also run first by
`test:e2e`) assert structural invariants that types alone can't — e.g. the
dependency rule, layering boundaries, and parity between the spec scenarios and
the tests that implement them. See
[`docs/superpowers/STATUS.md`](docs/superpowers/STATUS.md) for the current map and
the phase 5a–5e specs under [`docs/superpowers/`](docs/superpowers/) for the
design rationale.

## Working in a single package

Every command above is a Turborepo task; you can scope any of them to one
package with a filter:

```bash
pnpm --filter @rtc/domain test
pnpm --filter @rtc/client-react dev
```

## Deploy

A public, login-gated demo can be deployed to **Vercel** (the web clients) +
**Fly.io** (the WebSocket server, London `lhr`). **Deploys are on-demand only —
nothing auto-deploys on a push or merge, on any branch** (Vercel's Git
integration is disabled via `"git": { "deploymentEnabled": false }` in each
client's `vercel.<client>.json`). There is exactly **one official way** to deploy
each app: its GitHub Actions workflow, triggered manually.

### Main app (clients + server)

**Actions tab → "Deploy" → Run workflow** (or `gh workflow run deploy.yml`).
One workflow deploys any subset of three independent targets — tick the
checkboxes:

- **`deploy_react`** → `@rtc/client-react` → Vercel (`rtc-clone-react.vercel.app`)
- **`deploy_solid`** → `@rtc/client-solid` → Vercel (`rtc-clone-solid.vercel.app`)
- **`deploy_server`** → `@rtc/server` → Fly.io (`rtc-clone-server.fly.dev`)

Both web clients connect to the **same** shared Fly WS server (its URL is a
build-time constant baked into each client), so a client build never waits on
the server — and the server, redeployed far less often, has its own opt-in
checkbox (default off). Each ticked target is smoke-checked (server `/health`
→ 200; each client → 200 on its canonical alias). Tick **`include_sourcemaps`**
to ship a debuggable build of the ticked client(s) — external `.map` files, so a
profiled deploy shows real component names in the flamechart.

Reproduce the old combined client+server deploy with
`gh workflow run deploy.yml -f deploy_react=true -f deploy_server=true`.

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for one-time setup (accounts, secrets,
the shared password/token) and how the gating works.

### Design prototypes

The hand-authored Claude Design mockups (web + mobile) and the readable React
port deploy separately from the main app, each to its own Vercel project, on
demand, behind a shared password:

- **Claude Design Prototype (web + mobile)** — the hand-authored standalone HTML
  mockups under `docs/design/web/<version>/standalone/` and
  `docs/design/mobile/<version>/standalone/`. **Actions tab → "Deploy Claude
  Design Prototype" → Run workflow** — pick a **target** (`web` or `mobile`);
  leave the path blank for that target's default (web v4 / mobile v1) or set it
  to a specific version. Or `gh workflow run deploy-cd-proto.yml -f target=mobile`.
  → `rtc-clone-web-cd-proto.vercel.app` / `rtc-clone-mobile-cd-proto.vercel.app`.
  See [`deploy/cd-proto/README.md`](deploy/cd-proto/README.md).
- **Prototype (React port)** — the readable `@rtc/client-prototype` React port.
  **Actions tab → "Deploy Prototype" → Run workflow** (no inputs). Or
  `gh workflow run deploy-proto.yml`. → `rtc-clone-proto.vercel.app`. See
  [`deploy/proto/README.md`](deploy/proto/README.md).

## Status

All planned phases are complete; the platform builds, typechecks, and passes the
full eight-runner suite, the two full-stack smokes, and all gates. See
[`docs/superpowers/STATUS.md`](docs/superpowers/STATUS.md) for the authoritative
per-phase breakdown.
