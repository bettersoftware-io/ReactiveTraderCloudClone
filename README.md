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
  client/    @rtc/client   React + RxJS + Vite web app. Depends on domain + shared.
  server/    @rtc/server   Marble.js + RxJS backend. Depends on domain + shared.
  mobile/    @rtc/mobile   React Native client (planned). Depends on domain + shared.
```

**The rule:** `domain` knows nothing of `shared`; `shared` knows nothing of the
apps; `client`, `server`, and `mobile` never depend on each other. Any
framework (React, RxJS, Marble.js, Vite, Vitest) is meant to be replaceable by
changing only its own package. pnpm strict mode enforces the single-dependency
constraint on the domain at install time.

For the full picture, see:

- [`docs/architecture.md`](docs/architecture.md) — layers, ports, data flow, sequence diagrams.
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — the phased plan the build followed.
- [`docs/superpowers/STATUS.md`](docs/superpowers/STATUS.md) — authoritative status of each phase, including the current test topology.
- [`docs/superpowers/`](docs/superpowers/) — the per-phase specs and plans, including the design of the multi-runner verification stack (phases 5a–5e).

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
pnpm dev                          # everything: Vite client + tsx-watch server, concurrently
pnpm --filter @rtc/client dev     # frontend only (Vite, http://localhost:5173)
pnpm --filter @rtc/server dev     # backend only (Marble.js, tsx watch)
```

The client is served by Vite (default `http://localhost:5173`). The composition
root selects live WebSocket adapters or in-process simulators based on the
`VITE_SERVER_URL` environment variable — with it unset, the client runs fully
against domain simulators, **no backend required**. Point it at a running
backend by setting `VITE_SERVER_URL` before starting the client.

## Checks & tests

Everything below is wired through Turborepo, so runs are cached and incremental.

```bash
pnpm typecheck                    # tsc --noEmit across every package
pnpm test                         # unit tests (Vitest) across every package
pnpm test:e2e                     # runs the gates, then all eight runners
pnpm --filter @rtc/tests gates    # architectural "grep gates" only
```

`pnpm test:e2e` is the full behavioural suite: it runs the gates first and then
drives all eight runners in sequence, reporting pass/fail per peer. To run the
entire verification stack in one go:

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e
```

> The architectural gates live in the `@rtc/tests` package, so run them with
> `pnpm --filter @rtc/tests gates` (or `pnpm gates` from inside `tests/`).
> Turborepo caches results; to force a clean run append `-- --force`
> (e.g. `pnpm test -- --force`) or run `pnpm clean` first.

### Do I need to start the servers first?

No. **Every browser runner starts the frontend on its own** (Vite on
`http://127.0.0.1:3000`) and tears it down afterwards — and if something is
already listening on that port, the runner reuses it instead of spawning another.
So `pnpm test:e2e` works from a cold checkout with nothing running.

The **backend is not involved in the e2e suite at all**: the client under test
runs against in-process domain simulators (`VITE_SERVER_URL` unset), so there is
no gateway to boot. The four presenter peers don't even need a browser — they
drive the RxJS presenter layer directly in Node.

### Running individual test runners

All eight runners are scripts in the `@rtc/tests` package; run any one in
isolation with a filter (each browser runner auto-starts/​reuses the frontend):

```bash
# Browser peers (drive the real UI)
pnpm --filter @rtc/tests test:e2e:playwright       # Cucumber + Playwright
pnpm --filter @rtc/tests test:e2e:raw-playwright   # raw Playwright
pnpm --filter @rtc/tests test:e2e:cypress          # Cucumber + Cypress
pnpm --filter @rtc/tests test:e2e:raw-cypress      # raw Cypress
pnpm --filter @rtc/tests test:e2e:cypress:open     # Cypress interactive runner

# Presenter peers (pure Node, no browser/server)
pnpm --filter @rtc/tests test:presenter:cucumber-real
pnpm --filter @rtc/tests test:presenter:cucumber-fake
pnpm --filter @rtc/tests test:presenter:vitest-fake
pnpm --filter @rtc/tests test:presenter:vitest-plain
```

### What "verification" means here

This is where the project earns its keep. The same user-facing behaviour is
exercised by **eight independent runners** so they can be compared head-to-head:

- **Four browser peers** drive the real UI — Cucumber+Playwright, raw
  Playwright, Cucumber+Cypress, and raw Cypress.
- **Four presenter peers** drive the RxJS presenter layer in pure Node against
  domain simulators — cucumber-real, cucumber-fake, vitest-fake, and
  vitest-plain.

All eight are run together by `pnpm test:e2e`, which summarises pass/fail per
peer and exits non-zero if any peer fails. On top of the runners, **24
grep-based architectural gates** (`pnpm gates`, also run first by `test:e2e`)
assert structural invariants that types alone can't — e.g. the dependency rule,
layering boundaries, and parity between the spec scenarios and the tests that
implement them. See
[`docs/superpowers/STATUS.md`](docs/superpowers/STATUS.md) for the current map and
the phase 5a–5e specs under [`docs/superpowers/`](docs/superpowers/) for the
design rationale.

## Working in a single package

Every command above is a Turborepo task; you can scope any of them to one
package with a filter:

```bash
pnpm --filter @rtc/domain test
pnpm --filter @rtc/client dev
```

## Status

All planned phases are complete; the platform builds, typechecks, and passes the
full eight-runner suite and all gates. See
[`docs/superpowers/STATUS.md`](docs/superpowers/STATUS.md) for the authoritative
per-phase breakdown.
