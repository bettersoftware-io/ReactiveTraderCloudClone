# Reactive Trader — Clone

**An experiment in running a *lit software factory*: can clean architecture,
simplicity, modularity and hard engineering discipline let AI agents build and
keep evolving a real, non-trivial product — while one human reviews specs,
tests and behaviour instead of every line of code?**

The product the factory built is a real-time, multi-asset trading desk — FX,
credit RFQs and equities — inspired by
[Adaptive's ReactiveTraderCloud](https://github.com/AdaptiveConsulting/ReactiveTraderCloud).
One framework-free application core drives **three clients** — React, SolidJS
and React Native — and that core itself comes in **three interchangeable
implementations** (RxJS, async/await, Effect-TS), all held to the same
behavioural contract. None of it was written by hand.

**Read the story:** [the software-factory experiment](#the-experiment-a-lit-software-factory) ·
case study [Part I — the discipline](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/presentations/2026-07-14/Clean-Architecture-case-study.html) ·
[Part II — living with it](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/presentations/2026-07-21/Clean-Architecture-case-study-part-II.html)

![Reactive Trader web client — the FX workspace streaming live prices on the Holo HUD 3D skin, with a just-executed trade confirmation](docs/readme/web-fx.jpg)

## Live demo

| Client | URL | Stack |
|---|---|---|
| **Web — React** | **<https://rtc-clone-react.vercel.app>** | React 19 + Vite |
| **Web — SolidJS** | **<https://rtc-clone-solid.vercel.app>** | SolidJS + Vite — same UI, same pixel goldens |
| Backend | `wss://rtc-clone-server.fly.dev` ([health](https://rtc-clone-server.fly.dev/health)) | Node WebSocket server on Fly.io (London) |

Open the React and Solid builds side by side: they are the **same product**,
sharing one application core and one test contract, and asserted against the
**same pixel goldens** — the only difference is the UI framework underneath.
Both stream live from the same server.

> The deployed demo is login-gated. To try it with zero setup, run it locally
> in simulator mode — see [Quick start](#quick-start) — and sign in with the
> committed demo accounts. Deploys are on demand, so the live sites can trail
> `main` slightly.

## The experiment: a lit software factory

Addy Osmani describes a
[software factory](https://addyosmani.com/blog/software-factories/) as *"many
harnessed loops running at once, fed by a queue of work and drained through a
review gate into production, with humans owning the whole thing from above."*
In a **dark** factory, code ships that no human has read, verified only by
other machines. A **lit** factory runs the same pipeline *"with the lights
left on where judgment lives."*

This repo is an attempt at the lit version — by one developer, on spare-time
evenings, on a product big enough to hurt. The bet is that the decisive
ingredient isn't a smarter model but **engineering discipline**: the
article's own bottleneck is verification, not generation, and verification
needs exactly what clean architecture supplies — types, test seams, component
boundaries and dependency injection.

| Factory part | How it looks here |
|---|---|
| **The loop** — an agent gathering context, acting, checking | Claude Code implements from a written spec and plan, each change in its own git worktree, several sessions in parallel on one repo |
| **The harness** — tools, memory and gates around the loop | A blocking gauntlet on every PR: typecheck, type-aware lint, dependency-cruiser layering rules, 40+ architectural gates, contract suites for both web UIs and every application core, ≥95 % coverage gates, e2e — plus pixel goldens after merge. Memory lives in specs, ADRs, [`STATUS.md`](docs/STATUS.md) and a chaptered [architecture atlas](docs/architecture.md), never in anyone's head |
| **Back pressure** — autonomy reaches only as far as verification does | *Fight non-determinism with determinism.* Agents merge green PRs without a human reading the diff, because the gates check what a reviewer would — and more, and never tire |
| **Lights on where judgment lives** | The human owns the specs, the tests, the architecture and the product: using the app, judging behaviour, filing findings. Rendering changes arrive as golden PNGs in the diff; deploys stay a human decision |

What made it work was four practices reinforcing each other:

- **Clean architecture** — strict dependency inversion, ports & adapters, a
  pure domain that depends on nothing but RxJS, a "dumb" UI. It keeps every
  change small and local, so an agent's loop stays short and a human can read
  the diff when they choose to.
- **Spec-driven development** — behaviour is written down first; the
  implementation is built to satisfy it. The project began as exactly that
  experiment: regenerate a real app from specs alone. Its lesson — tests
  derived from the implementation just ratify its mistakes — is why tests here
  assert the spec.
- **Redundant verification** — the same behaviour checked several independent
  ways, so the test suite becomes the artifact the human actually reviews.
- **AI-assisted development** — the agents write the code; the structure
  above is what makes that safe.

The outcome, in the words of the second talk: the work moved up a layer.
Features land in days and bugs die in hours, and unplanned features — six boot
scenes, a power-saver mode, an AI assistant — dropped in with zero
refactoring. The two case-study decks tell the whole story, with the real code
and diagrams:

- **[Part I — a clean-architecture case study, and the things it unlocked](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/presentations/2026-07-14/Clean-Architecture-case-study.html)**
  — the origin experiment, the compiled dependency rule, verification as the
  backbone, and the payoffs: a second platform, a framework regeneration, an AI
  that trades.
- **[Part II — living with a clean architecture](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/presentations/2026-07-21/Clean-Architecture-case-study-part-II.html)**
  — the day-to-day: boring code on purpose, review by machine, understanding by
  map, and the speed that falls out.

## Screenshots

### Web

| | |
|---|---|
| ![Equities: three candlestick chart panels with SMA, EMA and RSI, order ticket, watchlist and filled orders](docs/readme/web-equities-multichart.jpg) | ![Credit: three live RFQs with competing dealer quotes, countdowns and accept buttons](docs/readme/web-credit-rfqs.jpg) |
| **Equities** — any number of chart panels, indicators, order ticket, live watchlist | **Credit** — multi-dealer RFQs racing their countdowns, best quote starred |
| ![Admin: throughput, P99 latency, error rate, latency histogram, service health, live events, topology and incident injection](docs/readme/web-admin.jpg) | ![Dockview workspace: a Jarvis panel docked as a new column and the Positions panel floating over the grid](docs/readme/web-dockview.jpg) |
| **Admin** — live observability, plus incident injection to watch the system degrade | **Dockable workspace** — dock, tab, float, pop out, maximize and collapse any panel |
| ![J.A.R.V.I.S. conversation ending in a confirm-gated EURUSD trade awaiting approval](docs/readme/web-jarvis-confirm.jpg) | ![The workspace after Jarvis rearranged it: maximized chart, collapsed side rails and a floating GBP volatility panel](docs/readme/web-jarvis-drives-layout.jpg) |
| **J.A.R.V.I.S.** — quotes, briefs, charts on request; trades only after you approve | **…and drives the app** — the same intents the UI emits, so it can re-lay-out your workspace |
| ![The FX workspace on the Terminal 3D skin](docs/readme/web-fx-terminal3d.jpg) | ![The equities workspace on the Classic light skin](docs/readme/web-equities-classic-light.jpg) |
| **Terminal 3D** skin | **Classic** skin, light mode — six skins in all, each light or dark |

**Boot sequence** — one of eight animated canvas scenes plays on each launch, cycling launch to launch:

| | |
|---|---|
| ![Web boot scene: docking camera closing on target](docs/readme/web-boot-docking.jpg) | ![Web boot scene: volumetric hologram resolving](docs/readme/web-boot-hologram.jpg) |
| ![Web boot scene: the workspace assembling in exploded 3D layers](docs/readme/web-boot-layers.jpg) | ![Web boot scene: topographic market terrain with labelled peaks](docs/readme/web-boot-topo.jpg) |

### Mobile (iOS — React Native / Expo)

| Rates | Equities | Credit | Analytics |
|:---:|:---:|:---:|:---:|
| ![Mobile FX rate tiles](docs/readme/mobile-rates.jpg) | ![Mobile equities trade screen: chart, order ticket and positions](docs/readme/mobile-equities-trade.jpg) | ![Mobile credit RFQ with competing dealer quotes](docs/readme/mobile-credit.jpg) | ![Mobile P&L, pair P&L and net exposure](docs/readme/mobile-analytics.jpg) |

**Terminal 3D skin** — the same screens, one preference away:

| Rates | Equities | Credit | Analytics |
|:---:|:---:|:---:|:---:|
| ![Mobile rates on the Terminal 3D skin](docs/readme/mobile-t3d-rates.jpg) | ![Mobile equities trade on the Terminal 3D skin](docs/readme/mobile-t3d-equities.jpg) | ![Mobile credit RFQs on the Terminal 3D skin](docs/readme/mobile-t3d-credit.jpg) | ![Mobile analytics on the Terminal 3D skin](docs/readme/mobile-t3d-analytics.jpg) |

| Boot — docking cam | Boot — holo projector | Boot — schematic core | Appearance |
|:---:|:---:|:---:|:---:|
| ![Boot scene: docking camera with target lock](docs/readme/mobile-boot-docking.jpg) | ![Boot scene: volumetric hologram depth field](docs/readme/mobile-boot-hologram.jpg) | ![Boot scene: 3D schematic core linking subsystems](docs/readme/mobile-boot-core.jpg) | ![Appearance sheet: six skins, ambient background, power saver](docs/readme/mobile-appearance.jpg) |

Web shots are the running React client in simulator mode; mobile shots are the
iOS visual-regression harness (`packages/client-react-native/tests/visual/`) —
the committed goldens, plus the same scenarios re-rendered on Terminal 3D.
Two showcase pages go deeper on mobile:
[the app beside its design prototype, screen by screen](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/showcase/rn-prototype-fidelity-comparison.html),
and [every iOS golden before and after the harness moved to a static fake](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/showcase/rn-visual-goldens-static-fake.html).

## What's inside

**The product**

- **FX** — streaming price tiles and a watchlist, one-click execution, a live
  blotter, P&L and position analytics.
- **Credit** — request-for-quote workflow: build an RFQ, collect competing
  dealer quotes against a countdown, accept the best; plus a sell-side view.
- **Equities** — interactive candlestick charts (indicators, comparisons,
  drawing tools) in as many panels as you like, order ticket, watchlist,
  depth, orders and positions.
- **Admin** — an observability console: throughput, latency, service topology,
  sessions, live events, and incident injection to watch the system degrade.
- **J.A.R.V.I.S.** — an AI assistant backed by Claude (or a deterministic
  scripted brain offline) that can quote, brief, chart, lay out your workspace
  and execute confirm-gated trades through a typed tool registry — also
  exposed to external agents over an **MCP** endpoint.
- **Dockable workspace** — dock, tab, float, pop out, maximize and collapse
  panels; save layout presets.
- **A HUD you can tune** — six skins × light/dark, animated 3D boot scenes, and
  a power-saver mode down to a fully motion-free *freeze*.
- **Custom DevTools** — a Redux-DevTools-style inspector for the non-Redux state
  layer (presenters, state machines, wire traffic), in-app at `/devtools/` or as
  a Chrome extension that attaches to any running build, including production.

## What clean architecture bought us

The claim of clean architecture is that the things you are most likely to
change — the UI framework, the state library, where the data comes from — sit
at the edge, behind interfaces the inner layers own. Here that claim was
**tested for real, more than once**:

- **A second UI framework without a second app.** The SolidJS client was
  written against the *same* application core and passes the *same*
  behavioural specs, the same e2e suites and the same pixel goldens as the
  React client. The core, the domain and the tests did not fork; only the
  "dumb" view layer and a thin bindings package are Solid-specific.
  How one suite tests two frameworks, animated:
  [one suite, two frameworks](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/showcase/cross-framework-testing.html).
- **A second — and third — application core.** Every presenter and state
  machine (75 members) was re-implemented on async/await + AsyncIterable and
  again on Effect-TS, slice by slice, while the app kept shipping. All three
  implement one types-only contract and pass one behavioural contract suite;
  the React and Solid UIs run on any of them, chosen at load time (`?core=` / Preferences,
  with `VITE_CORE_IMPL` as the build default), without knowing which. No
  product needs three cores — this is the experiment's instrument; the
  real-world shape is a *migration* of the reactive substrate, and
  [§23 "Why three cores?"](docs/architecture/23-application-cores-explained.md#why-three-cores-read-this-first)
  says which techniques transfer and how the indirection is collapsed at the end.
- **The server is optional.** The domain ships simulators behind the same
  ports the WebSocket adapter implements, so every client runs fully offline —
  which is also what lets the whole e2e matrix run in parallel with no backend.
- **An AI agent got the app for free.** J.A.R.V.I.S. drives the workspace by
  emitting the *same* intents the UI does into the *same* state machines, so
  what the agent can do is exactly what the machine boundary exposes — no
  second API to build or keep in sync.
  The receipts, capability by capability:
  [the machine boundary is the agent's reach](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/showcase/machine-boundary-agent-reach.html).
- **Tooling bolts on at the composition root.** The DevTools inspector wraps
  presenters, machine factories and the socket adapter with decorators where
  the app is assembled — no feature code knows it is being observed.

### The layers

Every arrow points inward. The domain knows nothing about the application
core; the core knows nothing about React, Solid, React Native or the network.

```mermaid
flowchart TB
  subgraph fw["Frameworks & drivers — replaceable"]
    ui["UI<br/>React · SolidJS · React Native"]
    io["I/O adapters<br/>WebSocket · browser storage · native storage"]
  end
  subgraph adapters["Interface adapters"]
    vm["ViewModel bindings<br/>react-bindings · solid-bindings"]
    ports["Port implementations<br/>WsAdapter · simulators · storage adapters"]
  end
  subgraph app["Application core — one contract, three implementations"]
    core["Presenters + state machines<br/>RxJS · async/await · Effect-TS"]
  end
  subgraph dom["Domain — depends on nothing but RxJS"]
    domain["Entities · use cases · port interfaces"]
  end
  ui --> vm --> core
  io --> ports --> core
  core --> domain
  ports -. implements .-> domain
```

### One contract, many combinations

Because each seam is an interface, the pieces compose freely — any client, on
any core, against any data source — and a single contract suite holds every
core to the same behaviour.

```mermaid
flowchart TB
  subgraph clients["Clients — dumb views behind a ViewModel seam"]
    direction LR
    react["React"] ~~~ solid["SolidJS"] ~~~ rn["React Native"]
  end
  contract{{"@rtc/core-api — types-only contract"}}
  subgraph cores["Application cores — switch at load time"]
    direction LR
    rx["RxJS"] ~~~ asyncCore["async/await"] ~~~ effectCore["Effect-TS"]
  end
  suite[["@rtc/core-contract — one behavioural suite for every core"]]
  subgraph sources["Data sources — behind AppPorts"]
    direction LR
    sim["In-process simulators"] ~~~ local["Local server"] ~~~ remote["Deployed server"]
  end
  clients -- "consume" --> contract
  contract -- "implemented by" --> cores
  suite -. "verifies" .-> cores
  cores -- "talk to" --> sources
```

The rules are enforced, not just drawn: dependency-cruiser fails CI on any
import that points outward, pnpm strict mode keeps the domain's only runtime
dependency RxJS, and grep gates catch what types cannot (for example, an
"alternative core" reaching for an RxJS operator outside its bridge).

## Architecture at a glance

A [pnpm](https://pnpm.io/) + [Turborepo](https://turbo.build/) monorepo of 26
packages. The clients and the server never import each other; the three
cores never depend on each other. Any framework (React, RxJS,
Vite, Vitest…) is meant to be replaceable by changing only its own package.

<details>
<summary>All 26 packages</summary>

```
packages/
  # Inner layers — framework-free
  domain/              @rtc/domain              Entities, use cases, port interfaces, simulators. Only runtime dep: rxjs.
  shared/              @rtc/shared              DTOs, wire protocol, the scripted Jarvis brain. Depends on domain.
  ws-effects/          @rtc/ws-effects          Small declarative RxJS effects framework. rxjs only.
  motion-core/         @rtc/motion-core         View-layer motion math (FLIP, easing). No dependencies at all.
  agent-tools/         @rtc/agent-tools         The Jarvis desk-tool registry (JSON Schema + handlers). Depends on domain.

  # Application core — pluggable, three implementations of one contract
  core-api/            @rtc/core-api            Types-only contract every core implements.
  core-logic/          @rtc/core-logic          Rules the three cores share that need no stream library.
  client-adapters/         @rtc/client-adapters         The ports every core consumes: WsAdapter, port factories, stores.
  client-core-rxjs/    @rtc/client-core-rxjs    The RxJS core (the default): composition root, presenters, state machines.
  client-core-async/   @rtc/client-core-async   Alternative core on async/await + AsyncIterable.
  client-core-effect/  @rtc/client-core-effect  Alternative core on Effect-TS.
  core-contract/       @rtc/core-contract       Dev-only behavioural suites all three cores must pass.

  # Clients and their bindings
  react-bindings/      @rtc/react-bindings      React <-> RxJS bridge (createViewModel, useMachine).
  solid-bindings/      @rtc/solid-bindings      Solid <-> RxJS bridge.
  client-react/        @rtc/client-react        Web client: React 19 + Vite.
  client-solid/        @rtc/client-solid        Web client: SolidJS port at full parity.
  client-react-native/ @rtc/client-react-native Mobile client: Expo / React Native.
  client-prototype/    @rtc/client-prototype    Readable React port of the v2 design prototype. Isolated.
  boot-splash/         @rtc/boot-splash         Canvas boot/splash engine shared by both web clients.
  layout-dockview/     @rtc/layout-dockview     Dockview wrapper behind the layout-engine preference.
  ui-contract/         @rtc/ui-contract         Framework-neutral UI test contract + visual goldens.

  # Server and tooling
  server/              @rtc/server              Native WebSocket + ws-effects backend, plus the /mcp endpoint.
  devtools-core/       @rtc/devtools-core       Devtools event protocol + hub. rxjs only.
  devtools-app/        @rtc/devtools-app        Inspector SPA, served at /devtools/.
  devtools-extension/  @rtc/devtools-extension  MV3 Chrome DevTools extension around the inspector.
  devtools-relay/      @rtc/devtools-relay      Dev-machine WebSocket relay for the React Native inspector.
```

[`CLAUDE.md`](CLAUDE.md) has the full per-package description and dependency rules.

</details>

## Quick start

Requires **Node.js 26** and **pnpm 12** (pinned via `packageManager`; see the
[development guide](docs/development.md#prerequisites) for Corepack setup).

```bash
git clone https://github.com/bettersoftware-io/ReactiveTraderCloudClone.git
cd ReactiveTraderCloudClone
pnpm install
pnpm build
pnpm dev            # React web client, simulator mode → http://localhost:5173
```

Sign in as `astark`, `nromanoff`, `tchalla` or `demo` — password `mcdc2026`
(committed demo-only accounts, see [`docs/authentication.md`](docs/authentication.md)).
No backend needed: with no server URL set, the client runs against in-process
domain simulators.

More ways to run it:

```bash
pnpm dev:solid          # the SolidJS client instead          → http://localhost:5473
pnpm dev:react:fs       # full stack: WebSocket server + React client
pnpm dev:react:effect   # React client on the Effect-TS core (also :async, and dev:solid:*)
pnpm dev:ios            # React Native client on the iOS simulator
pnpm dev:android        # React Native client in an Android emulator
pnpm dev:devtools       # the state inspector
```

Every client has the same four data-source modes — `:sim`, `:ws:local`,
`:ws:remote`, `:fs`. The [development guide](docs/development.md) covers them
all, plus choosing an application core, the test stack and deploying.

The core is switchable at load time in any build, the deployed one included:
add `?core=async` or `?core=effect` to the URL, or pick one in Preferences →
**Application core** (saved, then the page reloads). The async and Effect
cores are lazy chunks, so the default RxJS load costs nothing extra.

## Tests & verification

```bash
pnpm typecheck       # tsc across every package
pnpm test            # unit + contract tests (Vitest) across every package
pnpm test:e2e        # architectural gates, then every e2e suite in parallel
pnpm test:ui:visual  # pixel-golden visual regression
```

The same user-facing behaviour is exercised by browser runners against **both**
web clients, a pure-Node presenter runner, full-stack smokes against the real
server, a framework-neutral UI contract, pixel goldens shared by React and
Solid, a behavioural contract every application core must pass, and 40+
architectural gates. See the [development guide](docs/development.md#checks--tests)
and [§9 Test strategy](docs/architecture/09-test-strategy.md).

In factory terms this suite *is* the review gate — it is what lets an agent's
green PR merge without a human reading the diff. Two showcases show it at work:
[one suite, two frameworks](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/showcase/cross-framework-testing.html) (the same
contract, visual and e2e suites passing on React and Solid) and
[the iOS goldens contact sheet](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/showcase/rn-visual-goldens-static-fake.html)
(21 device screenshots, with the measured drift that justified re-pinning them).

## Documentation

- [`docs/README.md`](docs/README.md) — **documentation map**: every doc grouped by purpose. Start here.
- [`docs/development.md`](docs/development.md) — running, testing and deploying, in full.
- [`docs/architecture.md`](docs/architecture.md) — layers, ports, data flow, sequence diagrams.
- [`docs/adr/`](docs/adr/) — architecture decision records.
- [`CHANGELOG.md`](CHANGELOG.md) — what landed, week by week, with the decisions behind it.
- [`docs/STATUS.md`](docs/STATUS.md) — the pending-work backlog; [`docs/IDEAS.md`](docs/IDEAS.md) is the icebox upstream of it.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — how the Vercel + Fly.io demo is deployed.
- [Project site](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/) — presentations and the coverage report.

**Talks and showcases** — self-contained pages generated during the work,
animated where a picture can't show the behaviour:

- [Case study, Part I](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/presentations/2026-07-14/Clean-Architecture-case-study.html) — the discipline, the verification, and what it unlocked.
- [Case study, Part II](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/presentations/2026-07-21/Clean-Architecture-case-study-part-II.html) — the day-to-day payoff: review by machine, understanding by map, speed.
- [One suite, two frameworks](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/showcase/cross-framework-testing.html) — how the React and Solid clients share one contract, visual and e2e suite.
- [The machine boundary is the agent's reach](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/showcase/machine-boundary-agent-reach.html) — why Jarvis can drive exactly what the state machines expose, and nothing else.
- [iOS visual goldens](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/showcase/rn-visual-goldens-static-fake.html) — every React Native golden, before and after the harness moved to a static fake.
- [React Native vs the design prototype](https://bettersoftware-io.github.io/ReactiveTraderCloudClone/showcase/rn-prototype-fidelity-comparison.html) — the mobile app beside its design, screen by screen, with a verdict per surface.
