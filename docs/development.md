# Development guide

The hands-on reference for working in this repo: prerequisites, running every
client in every mode, choosing an application core, the full test and
verification stack, and deploying. The project overview, live demos and
screenshots are in the [root README](../README.md); the architecture is in
[`architecture.md`](architecture.md).

## Prerequisites

- **Node.js** 26 — what every CI workflow and the server image run
- **pnpm** 12 — the exact version is pinned by `packageManager` in the root
  `package.json`. Any globally installed pnpm ≥ 9.7 switches to the pinned
  version on its own; alternatively let
  [Corepack](https://nodejs.org/api/corepack.html) (≥ 0.35, what CI uses)
  provide it:

  ```bash
  npm install -g corepack@0.35.0
  corepack enable
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
work out of the box. See [`docs/authentication.md`](authentication.md) for
the roster and how credentials are wired. (If `pnpm dev` renders a blank page
after a dependency change, clear the stale Vite cache:
`rm -rf packages/client-react/node_modules/.vite`.)

### Choosing an application core

The web clients can run on any of three interchangeable application cores,
and — since 2026-09-27 — switching between them no longer needs a rebuild:
every build ships all three as lazy chunks (the RxJS composition root too, since 2026-10-02), and
the choice is resolved at **load time**:

| `VITE_CORE_IMPL`  | Core                                                    |
|-------------------|---------------------------------------------------------|
| unset or `rxjs`   | `@rtc/client-core` — RxJS, the default                  |
| `async`           | `@rtc/client-core-async` — async/await + AsyncIterable  |
| `effect`          | `@rtc/client-core-effect` — Effect-TS                   |

```bash
pnpm dev:react:async                            # shortcuts, simulator mode
pnpm dev:react:effect                           # (dev:solid:async / dev:solid:effect too)
VITE_CORE_IMPL=effect pnpm dev:react:fs         # composes with any mode
pnpm test:e2e:async                             # e2e against that core (also test:e2e:effect)
# VITE_CORE_IMPL only sets the BUILD DEFAULT a fresh visitor lands on — a stored Preferences
# choice or a `?core=` URL parameter outranks it; the console line `[core] booted <impl> from
# <url|stored|build|fallback>` says which won and why.
```

- **Switch at load time — no rebuild, on any deployed build.** Precedence:
  a `?core=async`/`?core=effect`/`?core=rxjs` URL parameter (this load only,
  never saved) beats the persisted choice, which beats `VITE_CORE_IMPL` (now
  just the **build default** a fresh visitor lands on), which beats `rxjs`.
  Preferences → **Application core** lets a signed-in visitor pick one; it
  saves the choice and reloads (a real navigation, not an SPA transition),
  and the choice survives later plain reloads. An unknown `?core=` or stored
  value is ignored/cleared with a console warning and falls through; an
  unknown `VITE_CORE_IMPL` still fails loudly, never falling back to RxJS
  silently. Every successful boot logs which core won and why: `[core]
  booted <impl> from <url|stored|build|fallback>`.
- **Every core loads lazily.** Each core's composition root is fetched as
  its own chunk only once the choice resolves — RxJS included since approach
  B (2026-10-02; its root sits behind the `@rtc/client-core/core` subpath
  export). `pnpm check:core-bundle` proves the split in CI — the eager set
  carries no core's marker, and each core sits in exactly one lazy chunk.
  `@rtc/client-core`'s presenters, machines and adapters still ship eagerly
  through the root index the UI imports from — on purpose: the presenters
  and machines are ~7 KB gzip that the default visitor needs at boot anyway
  (ADR-006 Follow-up 9, declined with the measurement).
- **Web only.** The React Native client always runs the RxJS core.
- **e2e honours either variable.** The harness's own knob is `RTC_CORE_IMPL`
  (what `test:e2e:async` / `test:e2e:effect` set); `VITE_CORE_IMPL=async pnpm
  test:e2e` works too. Set both to different cores and the run refuses to
  start, and it logs `[run-all] application core: …` so you can see which one
  ran (`tests/scripts/lib/coreImpl.ts`).

New to the three cores? Start with the guided tour,
[§23 Application cores, explained](architecture/23-application-cores-explained.md).
How it works and why: [§22 Pluggable application core](architecture/22-pluggable-application-core.md)
and [ADR-006](adr/ADR-006-pluggable-application-core.md) (see Decision 6
for the load-time switch specifically).

## Checks & tests

Everything below is wired through Turborepo, so runs are cached and incremental.

```bash
pnpm typecheck                    # tsc --noEmit across every package
pnpm test                         # unit tests (Vitest) across every package
pnpm test:e2e                     # gates, then all 7 suites in parallel (5 runners + 2 smokes; the CI gate skips the 2 parked Gherkin peers)
pnpm test:ui:visual               # UI visual regression screenshots (the playwright tier)
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
  seven CI-enforced ≥95% gates (five steps in `ci.yml`): the `test:ui:contract:coverage`
  of `@rtc/client-react` and `@rtc/client-solid`, the `test:coverage` of
  `@rtc/devtools-core`, `@rtc/devtools-app`, `@rtc/client-core-async` and
  `@rtc/client-core-effect`, and `@rtc/client-react-native`'s
  `test:coverage:gate` (merged lines of its two runners). The
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

Per-package detail: [`packages/client-react/README.md`](../packages/client-react/README.md)
(every client script ↔ report dir) and [`tests/README.md`](../tests/README.md) (the
e2e suite matrix).

`pnpm test` runs each package's bare `test`; in `@rtc/client-react` that's the
**union** of two co-resident tiers — the **app tier** (`test:app`: presenters +
adapters under `src/app`) and the **ui contract tier** (`test:ui:contract`:
sociable RTL specs over `src/ui`) — which also have focused per-tier runners.

`pnpm test:e2e` is the full behavioural suite: it runs the gates first, then
launches all seven suites — the five runners and the two full-stack smokes (see
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
same baselines gate that reimplementation — `@rtc/client-solid`'s visual tier
asserts against these goldens directly, owning none of its own.

```bash
pnpm test:ui:visual                                              # the playwright tier vs committed goldens
pnpm --filter @rtc/client-react test:ui:visual:playwright:react:ui      # interactive
# Regenerate goldens — inspect before committing:
pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
# Coverage-only instrument (renders every scenario, pixel assert compiled out):
pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:coverage
```

See `packages/client-react/tests/ui/visual/README.md` for the layout and the SolidJS port's
execution record (`@rtc/client-solid` runs the same tier, assert-only against these goldens).

### Do I need to start the servers first?

No — every step boots whatever it needs and tears it down afterwards, so
`pnpm test:e2e` works from a cold checkout with nothing running.

- The **five runners** test the client against **in-process domain simulators**
  (`VITE_SERVER_URL` unset) — no backend at all. Each browser runner starts its
  **own** Vite frontend: on a dedicated port during `pnpm test:e2e` (`:3001`–
  `:3004`, so the four run concurrently), or on `http://127.0.0.1:3000` by
  default when run standalone (override with `RTC_DEV_PORT`). The presenter
  peer doesn't even need a browser.
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

### Scope: what the five runners do *not* cover

The five-runner suite is end-to-end *within the client* (UI → presenters →
RxJS → adapters → **domain simulators**) — it is deliberately **not** full-stack.
It never starts `@rtc/server`, so the server's WebSocket translation layer is
covered separately by two layers:

- **Server protocol tests** (`packages/server/src/effects/index.test.ts` and the per-domain
  `*.effects.test.ts` files beside it, run by `pnpm test`) — drive the real
  `@rtc/ws-effects` listener through a fake socket and assert it
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

# Presenter peer (pure Node, no browser/server)
pnpm --filter @rtc/tests test:presenter:vitest-fake-timers             # plain vitest it() blocks, virtual time

# Full-stack smokes (real server + real client)
pnpm --filter @rtc/tests test:fullstack:node     # real socket, no browser
pnpm --filter @rtc/tests test:fullstack:browser  # real browser via VITE_SERVER_URL

# Watch any browser suite live (:headed) — dev tools, not part of test:e2e
pnpm --filter @rtc/tests test:browser:playwright:headed          # Playwright --headed (runs once)
pnpm --filter @rtc/tests test:browser:playwright:ui              # Playwright UI mode (sidebar, watch, time-travel)
pnpm --filter @rtc/tests test:browser:playwright-cucumber:headed # headed Chromium + slowMo
pnpm --filter @rtc/tests test:fullstack:browser:headed           # full stack, --headed
```

See tests/README.md for the full suite matrix and naming convention.

### What "verification" means here

This is where the project earns its keep. The same user-facing behaviour is
exercised by **five independent runners** so they can be compared head-to-head:

- **Four browser peers** drive the real UI — Cucumber+Playwright and native
  Playwright, each run once against the React client and once against the
  Solid client.
- **One presenter peer** (`vitest-fake-timers`) drives the RxJS presenter layer
  in pure Node against domain simulators, with plain `describe`/`it()` blocks
  and no Gherkin loader. It was the winner of a bake-off against three other
  runner/time-model peers — a real-timer Gherkin oracle and two virtual-time
  peers (one Gherkin, one plain) — retired 2026-07-20 once the plain-vitest
  peer proved fastest (1s local / 2.5s CI) with zero Gherkin-loader deps; see
  `tests/STRATEGY.md` for the verdict.

All five run against in-process simulators; on top of them the **two full-stack
smokes** (above) exercise the real backend end to end. `pnpm test:e2e` runs the
gates, then all seven suites in parallel, exiting non-zero if any fails. The **40+ architectural gates** (`pnpm gates`, also run first by
`test:e2e`) assert structural invariants that types alone can't — e.g. the
dependency rule, layering boundaries, and parity between the spec scenarios and
the tests that implement them. See
[`docs/STATUS.md`](STATUS.md) for the current map and
the phase 5a–5e specs under [`docs/superpowers/`](superpowers/) for the
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
to ship a debuggable build of the ticked client(s) — inline sourcemaps (production builds ship none), so a
profiled deploy shows real component names in the flamechart.

Reproduce the old combined client+server deploy with
`gh workflow run deploy.yml -f deploy_react=true -f deploy_server=true`.

See [`docs/DEPLOY.md`](DEPLOY.md) for one-time setup (accounts, secrets,
the shared password/token) and how the gating works.

### Design prototypes

The hand-authored Claude Design mockups (web + mobile) and the readable React
port deploy separately from the main app, each to its own Vercel project, on
demand, behind a shared password:

- **Claude Design Prototype (web + mobile)** — the hand-authored standalone HTML
  mockups under `docs/design/web/<version>/standalone/` and
  `docs/design/mobile/<version>/standalone/`. **Actions tab → "Deploy Claude
  Design Prototype" → Run workflow** — pick a **target** (`web` or `mobile`);
  leave the path blank for that target's default (web v5 / mobile v1) or set it
  to a specific version. Or `gh workflow run deploy-cd-proto.yml -f target=mobile`.
  → `rtc-clone-web-cd-proto.vercel.app` / `rtc-clone-mobile-cd-proto.vercel.app`.
  See [`deploy/cd-proto/README.md`](../deploy/cd-proto/README.md).
- **Prototype (React port)** — the readable `@rtc/client-prototype` React port.
  **Actions tab → "Deploy Prototype" → Run workflow** (no inputs). Or
  `gh workflow run deploy-proto.yml`. → `rtc-clone-proto.vercel.app`. See
  [`deploy/proto/README.md`](../deploy/proto/README.md).

