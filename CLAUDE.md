# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

This project aims to recreate [ReactiveTraderCloud](https://github.com/AdaptiveConsulting/ReactiveTraderCloud) from specifications, following clean architecture principles. ReactiveTraderCloud is a real-time FX trading platform with live pricing, trade execution, and analytics.

## Current Status

Monorepo with pnpm workspaces + Turborepo; twenty packages plus the `tests` workspace. All packages build, typecheck, and pass tests. Three shipping web/mobile clients (React, RN/Expo, SolidJS) share the framework-free `@rtc/client-core`. `@rtc/client-solid` is at full parity with `@rtc/client-react`: the same shared `@rtc/ui-contract` behavioural specs pass against both (via a per-framework swap-trio), its visual tier asserts pixel-for-pixel against the goldens in `@rtc/ui-contract` (generated only from `client-react` renders; assert-only — `client-solid` owns none of its own), and the same Gherkin e2e suites run against it — built on the parallel `@rtc/solid-bindings` bridge, the `@rtc/react-bindings` sibling. A custom devtools trio (`@rtc/devtools-core` + `@rtc/devtools-app` + `@rtc/devtools-extension`, plus the standalone `@rtc/devtools-relay` for RN) gives the non-Redux state layer live state inspection through a store-first navigation tree (Redux DevTools' mental model — All / Presenters→streams / Machines→kind→instance / Wire→msgType, scoped actions list, Clear as Commit), dormant until an inspector attaches — served same-origin at `/devtools/`, or attached to any running app (including the deployed build) via the MV3 Chrome extension. `docs/architecture.md` is the authoritative architecture reference.

## Build Commands

```bash
pnpm build       # Topological: domain → shared → client + server
pnpm typecheck   # tsc --noEmit in all packages
pnpm test        # vitest run in all packages
pnpm test:e2e    # Playwright (client only)
pnpm dev         # Alias of `dev:react` — @rtc/client-react in simulator mode (no server); sign in with a committed demo account (see below)
pnpm dev:ws      # @rtc/server only — native WS + login on ws://localhost:4000 (tsx watch)
pnpm dev:watch   # Rebuild-watch every pure-TS library (domain, shared, ws-effects, motion-core, ui-contract, devtools-core) — run alongside a client to hot-rebuild lib edits
# Web clients — each has the same four data-source modes (bare = alias of :sim):
pnpm dev:react           # @rtc/client-react (Vite) → http://localhost:5173 — simulator mode (no server); alias of dev:react:sim
pnpm dev:react:ws:local  # connect to an already-running local `dev:ws` (ws://localhost:4000)
pnpm dev:react:ws:remote # connect to the deployed server (wss://rtc-clone-server.fly.dev)
pnpm dev:react:fs        # Full stack: start the WS server + @rtc/client-react together (ws://localhost:4000)
pnpm dev:solid           # @rtc/client-solid (Vite) → http://localhost:5473 — simulator mode; alias of dev:solid:sim
pnpm dev:solid:ws:local  # connect to an already-running local `dev:ws`
pnpm dev:solid:ws:remote # connect to the deployed server
pnpm dev:solid:fs        # Full stack: start the WS server + @rtc/client-solid together
pnpm dev:proto   # @rtc/client-prototype only — the v2 design React port (Vite) → http://localhost:5273
pnpm dev:design:web     # standalone web design prototype HTML (v5), served by a zero-dep Node script → http://localhost:8899
pnpm dev:design:mobile  # same server, but the standalone mobile design prototype (mobile v1) → http://localhost:8899
# iOS (React Native) — the same four modes, via expo run:ios (bare = alias of :sim):
pnpm dev:ios             # @rtc/client-react-native on the iOS simulator — simulator mode (no server); alias of dev:ios:sim
pnpm dev:ios:ws:local    # connect to an already-running local `dev:ws` (ws://localhost:4000)
pnpm dev:ios:ws:remote   # connect to the deployed server (wss://rtc-clone-server.fly.dev)
pnpm dev:ios:fs          # Full stack: start the WS server + the RN app together (ws://localhost:4000)
pnpm dev:devtools     # @rtc/devtools-app — the standalone inspector SPA (Vite), served same-origin at /devtools/
pnpm dev:devtools:ext # @rtc/devtools-extension — watch-build the unpacked MV3 bundle → packages/devtools-extension/dist (load via chrome://extensions → Load unpacked → RTC panel)
pnpm dev:devtools:relay # @rtc/devtools-relay — the standalone dev-machine WebSocket relay (ws://localhost:8790) bridging the browser inspector to the React Native client; open the panel at /devtools/?relay=ws://localhost:8790
pnpm clean       # Remove dist/ in all packages
```

**Client dev matrix.** All three clients (React, Solid, iOS/RN) expose the **same four data-source modes** as an orthogonal script suffix, so the mode is always explicit in the command rather than hidden in a default:

| suffix | mode | server URL |
|--------|------|-----------|
| `:sim` (bare alias) | in-process / in-browser simulator | none |
| `:ws:local` | connect to an already-running local `dev:ws` (start it in another terminal) | `ws://localhost:4000` |
| `:ws:remote` | connect to the deployed server | `wss://rtc-clone-server.fly.dev` |
| `:fs` | full stack — starts the WS server **and** the client together | `ws://localhost:4000` |

Each client reads its source at composition time: the **web** clients from `VITE_SERVER_URL` (`packages/client-*/src/app/buildBrowserPorts.ts`), the **RN** client from `EXPO_PUBLIC_SERVER_URL` → `app.config.ts` `extra.serverUrl` → `buildNativePorts.ts`. Set → real `WsAdapter`; empty/unset → simulator. Names use *roles* (`:ws:local` / `:ws:remote`), never a vendor, so a host migration is a URL edit in the `:ws:remote` scripts, not a rename. Bare `dev:react` / `dev:solid` / `dev:ios` alias `:sim`; bare `pnpm dev` aliases `dev:react`. The reconnecting `WsAdapter` tolerates the server coming up moments later, so `:fs`'s parallel start is fine. `dev:ws` and `dev:watch` are the reusable building blocks (server alone; library rebuild-watchers alone).

The turbo-routed `*:fs` scripts rely on `VITE_SERVER_URL` / `EXPO_PUBLIC_SERVER_URL` (and, for the server, `AUTH_USERS` / `AUTH_SECRET`) being declared on turbo's `dev` task `env` / `globalPassThroughEnv` (turbo's env mode is strict — an undeclared var would be stripped and silently drop the client back to simulator mode). **RN caveat:** `EXPO_PUBLIC_*` is baked into the JS bundle by Metro, so switching RN modes needs a Metro restart (the mode scripts each start their own Metro; an in-app reload against a stale Metro keeps the old value). The RN default when no env is set is the deployed endpoint — so a *distributed* build streams live out of the box; `dev:ios:sim` sets `EXPO_PUBLIC_SERVER_URL=` (empty) to force the offline branch locally. That env→`extra.serverUrl` wiring is guarded by `packages/client-react-native/app.config.test.ts` (it was silently dropped once, stranding the app in simulator mode).

**Demo accounts & auth env.** All local dev logins use a committed demo roster (`packages/domain/src/auth/roster.ts` — `astark` / `nromanoff` / `tchalla` / `demo`, all password `mcdc2026`; demo-only, safe to commit, rotate if it ever matters). Simulator mode (`pnpm dev` / `dev:react` / `dev:solid`) reads them from each client's own committed `.env.development` (`packages/client-react/.env.development` and `packages/client-solid/.env.development`, both `VITE_DEV_AUTH`, JSON `{"user":"pass"}` — Vite loads it dev-only, never in a production build) via the identical `parseDevAuth` helper in each client's `buildBrowserPorts.ts`. WS-real mode (`dev:*:fs` / `dev:*:ws:local` / `dev:*:ws:remote` and the deployed client) authenticates against the **server's** `AUTH_USERS` instead — a *different* format, `"user:pass,user2:pass2"`, plus an `AUTH_SECRET`; the `dev:ws` / `dev:*:fs` scripts bake the same demo roster in so full-stack works out of the box too. Production is unaffected: Fly sets its own `AUTH_USERS` / `AUTH_SECRET` secrets, and these `dev:*` npm scripts never run there.

**Blank screen on `pnpm dev`?** A stale Vite pre-bundle cache (e.g. after a lockfile change re-links a workspace dep) can silently break the render — the app crashes with the error swallowed and no Vite overlay, leaving a blank white page. Clear it and restart: `rm -rf packages/client-react/node_modules/.vite`.

**Future direction (not yet built).** `pnpm dev` is deliberately ambiguous today — "the default web client" — and currently resolves to React. The plan is to rename it to **`dev:web`** and have it select the client implementation (React vs Solid) from a feature flag, so `dev:web` boots whichever web client the flag points at while `dev:react` / `dev:solid` stay as the explicit per-implementation entry points. Until that lands, treat `pnpm dev` as "the React web client, simulator mode."

`dev:design:web` serves `docs/design/web/v5/standalone/Reactive Trader.html` (a self-contained design artifact, not app code) via `scripts/serve-design.mjs`; `dev:design:mobile` serves the mobile counterpart under `docs/design/mobile/v1/standalone/`. The design prototypes are organized as `docs/design/web/{v1..v5}` (web iterations, v5 current) and `docs/design/mobile/v1` (mobile). v5's HTML and media are Git LFS-tracked (scoped to `docs/design/web/v5/**` in `.gitattributes`), so a fresh clone needs `git lfs pull` before `dev:design:web` can serve it. `dev:proto` runs its React re-implementation in `packages/client-prototype`. `dev:ios` delegates to the RN package's `ios` script (`expo run:ios`); it compiles the native dev client if missing, installs it on the booted simulator, and starts Metro — idempotent, so it's quick on later runs. The native `ios/` folder is gitignored and lives only where you run it (a removed worktree loses it), so run `dev:ios` once from your primary checkout to (re)create the dev build.

## Repo Slash Commands

Project-scoped Claude Code commands live in `.claude/commands/rtc/` (committed,
so every worktree and session gets them):

| Command | What it does |
|---|---|
| `/rtc:gauntlet [full]` | Local mirror of CI's `checks` job. Bare = the 19 fast gates (~50s, no build). `full` adds typecheck, unit tests, the four ≥95% coverage gates, type-aware ESLint, the lint-warnings ledger, build, and the post-build `/devtools/` check (~8 min). `e2e` is excluded — it's a separate CI job; run `pnpm test:e2e` explicitly. |
| `/rtc:status [live\|backlog]` | Live branch/PR/CI position plus a summary of `docs/STATUS.md` (never inlined — it's ~59k). |
| `/rtc:docs [keywords]` | Capture a session's findings into `docs/` — surveys the 298-file corpus, routes by finding type (STATUS.md goes via its own skill), proposes placement, then ships a PR through merge. |
| `/rtc:backfill-test-coverage [filter]` | Rank **per-file** coverage gaps from a fresh local run (`pnpm coverage:gaps`), propose a shortlist, then backfill tests. Exists because the ≥95% gate asserts an *aggregate* and cannot surface one weak file — `client-solid` sat at 99.35% while a file was at 56%. |
| `/rtc:perf-audit [react\|solid\|both] [freeze\|all-levels]` | Repeatable motion audit (`pnpm perf:motion-audit[:solid]`): drives every workspace view per power-saver level, censuses `document.getAnimations()` + rAF registrations, and asserts freeze is motion-free. The instrument that found freeze's churn leaks (manufactured transitions, retriggered flashes) — see `docs/power-saver-mode.md`. |
| `/rtc:visual-tolerance-audit [samples] [--ref <branch>]` | Measures the visual tier's REAL cross-run noise floor (`pnpm visual:jitter` over N `update-visual-goldens` artifacts of the same commit) and judges **every** tier's `maxDiffPixelRatio` against it. Exists because that budget was once set from an assumption and was wrong both ways at once — too loose to notice a full PreferencesModal restructure (0.017 of pixels), while justified by AA jitter a 5-sample measurement put at **zero**. Step 0 enumerates all tolerance knobs: react and solid both assert against the *same* golden set, so the **loosest** of the two is the real gate — solid sat at `0.06` for three days after react moved to `0.005`, its comment still claiming to be a verbatim copy. Read the "measurement trap" section before touching the script: counting raw pixel differences manufactures phantom flakes on gradients. |

`/rtc:gauntlet` re-reads `ci.yml`'s step list on every run and warns if CI has
gained a gate it doesn't know about, so it can't silently drift out of sync.

**Authoring trap — keep `` !`…` `` blocks free of shell control flow.** Those
pre-execution blocks are parsed and matched against the command's
`allowed-tools` *before* they run; a construct the parser won't analyse fails
closed (`Contains case_statement`) and the block yields an error instead of
data, while the command carries on as if nothing happened. Sequence with `;`,
filter with pipes, and branch on `$ARGUMENTS` when *rendering* rather than in
the shell. This broke `/rtc:status` entirely for 19 days.

Two things make it nastier than it sounds, both measured 2026-08-14: the
failure is invisible until someone **types** the command — a `Bash` tool call,
a Skill-tool invocation, and a user-scope (`~/.claude/commands/`) copy of the
identical block all run it happily — and it appears to be specific to
**project-scoped** commands like these, so a construct proven safe in your own
`~/.claude/commands/` is not proven safe here. Full evidence table in the
"Authoring these blocks" section of
[`.claude/commands/rtc/status.md`](.claude/commands/rtc/status.md).

## Package Structure

```
packages/
  domain/              @rtc/domain              — Pure TS, depends only on rxjs at runtime. Entities, use cases, port interfaces, simulators.
  shared/              @rtc/shared              — DTOs, wire protocol (CLIENT_MSG/SERVER_MSG), envelopes, + the transport-neutral scripted Jarvis brain (src/jarvis/), shared by the sim-mode client adapter and the server's ScriptedAgentLoop. Depends on domain, motion-core (+ rxjs).
  client-core/         @rtc/client-core         — Framework-free application core: composition root, presenters, state machines, WsAdapter + port factories. Depends on domain, shared (+ rxjs, @rx-state/core). No React/DOM/RN imports.
  react-bindings/      @rtc/react-bindings      — The React↔RxJS bridge: createViewModel, useMachine, ViewModelProvider/useViewModel. Depends on client-core, domain (+ @react-rxjs/core, react).
  solid-bindings/      @rtc/solid-bindings      — The Solid↔RxJS bridge (parallel to react-bindings): createViewModel, useMachine, ViewModelProvider/useViewModel. Depends on client-core, domain (+ @rx-state/core, rxjs, solid-js). No React.
  client-react/        @rtc/client-react        — Web client: dumb React 19 UI + browser adapters (Vite). Depends on client-core, react-bindings, domain.
  client-react-native/ @rtc/client-react-native — Mobile client: Expo SDK 57 / RN 0.86, dumb RN UI + native adapters. Depends on client-core, react-bindings, domain.
  client-prototype/    @rtc/client-prototype    — Readable React port of the docs/design/web/v2 prototype. Isolated: react/react-dom only, no @rtc/* imports.
  client-solid/        @rtc/client-solid        — Web client, SolidJS port of client-react at full parity (contract + visual + e2e). Dumb Solid UI + browser adapters (Vite, port 5473). Depends on client-core, solid-bindings, domain, motion-core.
  motion-core/         @rtc/motion-core         — Framework-free, zero-dependency view-layer motion math (FLIP deltas, rank-glide coalescing, easing/duration constants). No DOM, no rxjs, no React. Shared by both client animation shells (React and Solid).
  boot-splash/         @rtc/boot-splash         — Framework-free boot/splash feature: the canvas draw engine (six 3D scene variants + shared laser/docking helpers) and the reduced-motion/webdriver gate, plus the two `*.module.css` stylesheets. No `@rtc/*` deps; unlike motion-core it does touch the DOM (canvas 2D context, `navigator`/`location`). Shared by both web clients (`client-react`, `client-solid`), each supplying its own `BootSequence`/`BootGate` React or Solid shell.
  layout-dockview/     @rtc/layout-dockview     — Framework-neutral Dockview wrapper behind the `LayoutEngine` preference (`"inhouse" | "dockview"`, default in-house; see ADR-002). Exports `createDockEngine` (seed-tree → `SerializedDockview` conversion incl. pixel-pinned rails (held through viewport resizes via live min=max constraints, released on the first sash drag — the in-house `initialPx` semantics), opaque-blob restore/serialize, axis-aware emulated collapse AND maximize (both as in-house strips; maximize scoped per `PanelSpec.maximizeScope`), and `mount`/`mountTab`/`mountActions` hooks so the client's OWN panel header is portalled into Dockview's tab bar) + `dockview-hud.css`, which restyles Dockview's chrome as the in-house panel chrome (card, 38px head, 7px gutters). No `@rtc/*` deps; DOM-touching like boot-splash (mounts Dockview into a container element). Runtime dep is `dockview@7.0.4` (the supported vanilla entry point, not the internal `dockview-core`), confined here by dependency-cruiser. Consumed by both web clients (`client-react`, `client-solid`) via a thin per-client `DockviewLayoutEngine` bridge that portal-mounts the existing panel registries' content into it.
  ui-contract/         @rtc/ui-contract         — Framework-neutral UI test contract: shared harness + contract specs + visual scenario matrix, extracted from client-react's test tree, plus the committed `goldens/` PNG trees (generated only from client-react renders; outside `src/`, not compiled or exported). Depends on client-core, domain, motion-core (+ rxjs); consumed by clients as a devDependency, never from src.
  agent-tools/         @rtc/agent-tools         — The framework-neutral Jarvis desk-tool registry: the seven tools an AI may call (list_currency_pairs, get_price, get_price_history, get_blotter, get_analytics, get_service_health, and the confirm-gated execute_trade), as JSON Schema + a `run(input): Promise<string>` handler over injected domain ports. SDK-free by design — no Anthropic SDK, no MCP SDK, no transport. Pure TS, depends on domain (+ rxjs) only. Consumed by `server` only.
  ws-effects/          @rtc/ws-effects          — Small declarative RxJS effects framework. Pure TS, depends only on rxjs at runtime.
  devtools-core/       @rtc/devtools-core       — Devtools event protocol, DevtoolsHub (dormancy/coalescing/ring buffer), the three composition-root decorators (instrumentPresenters, instrumentMachineFactories, instrumentWsAdapter), BroadcastChannel transport. Pure TS, depends only on rxjs at runtime.
  devtools-app/        @rtc/devtools-app        — Inspector SPA (store-first: navigation tree All/Presenters/Machines/Wire → scoped actions list + Event/State/Diff/Machine context pane, Clear watermark), served same-origin at /devtools/. Depends on devtools-core (+ react, react-dom).
  devtools-relay/      @rtc/devtools-relay      — Standalone dev-machine WebSocket relay bridging the browser inspector to the React Native client (WsRelayDuplex "app" ↔ relay ↔ "panel"). Dev-only, carries only devtools frames. Depends on `ws` at runtime; imports no @rtc package. Pure ws-only leaf.
  devtools-extension/  @rtc/devtools-extension  — MV3 Chrome DevTools extension: a third Duplex (ChromeRuntimeDuplex + reconnecting content-script bridge + tab-keyed background router) that mounts the existing InspectorApp in an "RTC" DevTools panel, attaching the inspector to any running app incl. the deployed build. Leaf consumer: depends on devtools-core + devtools-app (+ react, react-dom, rxjs). Unpacked-dev only.
  server/              @rtc/server              — Native WebSocket + @rtc/ws-effects (24 effects: FX/Credit/Admin/Equities, plus the JARVIS_* effects, which route each chat turn to one of two per-connection sessions — scripted or Anthropic — by the caller's `JarvisBrain` preference, defaulting to Haiku). Depends on domain, shared, ws-effects, agent-tools (+ ws, rxjs, and `@anthropic-ai/sdk` confined to `src/agent/` — the only package in the repo allowed to import it); plus the /mcp Streamable-HTTP endpoint (src/mcp/) exposing the agent-tools registry to external MCP clients — @modelcontextprotocol/sdk is likewise server-confined (dep-cruiser no-mcp-sdk-outside-server).
```

**Dependency rule:** dependencies flow inward only. `domain` has only `rxjs` as a runtime dep. `shared` depends on `domain` and, narrowly, `motion-core` (the scripted Jarvis brain's `speechChunks` typed-reveal pacing). `client-core` is the shared application layer; the client packages and `server` never import each other. `server` additionally depends on `ws-effects`, which itself depends on nothing but `rxjs`. `@rtc/motion-core` is a zero-runtime-dependency leaf consumed directly by both web clients (`client-react` and `client-solid`) for view-layer motion math, and by `@rtc/shared` narrowly (the scripted Jarvis brain's `speechChunks` typed-reveal pacing) -- stricter than the rxjs-only exception since it has no runtime deps at all. `@rtc/boot-splash` is likewise a leaf with no `@rtc/*` deps (dependency-cruiser `boot-splash-stays-pure`), but unlike `motion-core` it is a DOM-touching leaf, not a no-DOM one -- its canvas engine and gate reach the 2D context and `navigator`/`location` directly. See `docs/architecture/06-package-dependencies.md` (§6) for the full graph.

**Agent-tools / Anthropic-SDK rule:** `@rtc/agent-tools` is an inner package that may import **only** `@rtc/domain` (+ `rxjs`) — never `shared`, `client-core`, a client, the bindings, or the server (dependency-cruiser `agent-tools-stays-inner`). The Anthropic SDK is a **server-only** runtime dep, confined to `packages/server/src/agent/`; `no-anthropic-sdk-in-inner-packages` enforces it as an **allowlist** (everything outside `packages/server/` is forbidden), not a blocklist of today's packages — written that way deliberately so the browser clients are covered too, where an SDK import could ship a key-bearing code path into a bundle. The MCP SDK gets the identical treatment: `@modelcontextprotocol/sdk` is confined to `packages/server/src/mcp/`, enforced by the parallel allowlist rule `no-mcp-sdk-outside-server` — `@rtc/agent-tools` in particular must stay SDK-free either way, since the registry's whole design point is transport-neutral raw JSON Schema. See `docs/architecture/18-jarvis-ai-agent-surface.md` (§18.13, §18.14).

**Single-dep constraint on `@rtc/domain`:** Domain may depend on `rxjs` at runtime — and only on `rxjs`. RxJS is the explicit architectural exception, chosen for its declarative stream operators and the team's familiarity with it. No other runtime dependencies are permitted. pnpm strict mode enforces this at install time. `@rtc/ws-effects` follows the same rxjs-only constraint.

**Devtools dependency rule:** `@rtc/devtools-core` is an `rxjs`-only leaf like `ws-effects` — it decorates by structural shape and imports no other `@rtc/*` package; `@rtc/devtools-app` depends only on `devtools-core`. `@rtc/devtools-extension` is itself a leaf consumer that may import only `devtools-core` (transport/protocol/store) and `devtools-app` (the `InspectorApp`), never a client/server/domain package (dependency-cruiser `devtools-extension-is-a-leaf`). Within the app workspace `client-react` takes only a dev-only build-order/asset edge to `devtools-app` (to serve `/devtools/`), never a source import; the extension package is the one workspace consumer that imports `devtools-app` as source (transpiled by its own Vite build). `@rtc/devtools-relay` is a standalone `ws`-only leaf that imports no `@rtc` package (a dep-cruiser rule pins it); `WsRelayDuplex` (in `devtools-core`) is the RN/cross-machine transport that pairs with it, and `client-react-native` applies the same three decorators under `__DEV__` only. See `docs/architecture/20-devtools.md` (§20).

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
| `coverage-report.yml` | **dispatch only** | the gh-pages coverage report (8 istanbul tiers) |
| `update-visual-goldens.yml` | **dispatch only** | the committed x86 `react/` golden set |
| `deploy.yml`, `deploy-proto.yml`, `deploy-cd-proto.yml` | **dispatch only** | the deployed sites |
| `ci.yml` | PR + push to main | — |
| `visual.yml` | push to main (post-merge, **not** a PR gate) | — |
| `publish-site.yml` | push to main | — |
| `e2e-gherkin-weekly.yml` | weekly cron (Mon 06:00) | up to 7 days of Gherkin drift |

**Before trusting the coverage report, refresh it and wait** (~7 min):

```bash
gh run list --workflow=coverage-report.yml --limit 1   # how old is the current one?
gh workflow run coverage-report.yml --ref main         # dispatch on the tree you care about
```

Report: <https://bettersoftware-io.github.io/ReactiveTraderCloudClone/coverage/>
— **ten** tiers: `domain`, `server`, `devtools/core`, `devtools/app`, then `app` / `ui (contract)` /
`ui (visual reach)` for each of `react` and `solid`. It is **report-only and
gates nothing**; the enforced bars are the four ≥95% coverage gates in
`ci.yml` — the `ui:contract` gate for each web client, plus the
`devtools-core` and `devtools-app` `test:coverage` gates. Its per-tier
`index.html` only lists directories, so finding gaps means crawling into them
— or run `pnpm coverage:gaps` for a ranked per-file list from a fresh local
run.

**The `ui (visual reach)` tiers are not the pixel tiers' coverage.** Each is a
vitest-browser instrument that walks the **same shared scenario matrix** as its
client's playwright golden tier while istanbul watches, so react's ~77% means
*"~23% of `src/ui` is never rendered by any golden scenario"*. That is the
guarantee the pixel tier isn't quietly testing less than assumed — work it DOWN
by adding scenarios; do not dismiss it. `EqDepthDock` at 0% is why
`equities/depth-dock-empty` exists. See
`packages/client-react/tests/ui/visual/COVERAGE-GAPS.md`. These were named
`ui (visual)` until 2026-07-26, which read as "the visual tier's own coverage"
and got the metric written off as worthless once already; the URL slug is still
`ui-visual` so old report links keep resolving.

**Engine parity is a number, not an eyeball.** Every layout state in the
visual matrix is shot twice — `X` (in-house engine) and `X-dockview` — and
`pnpm visual:engine-parity [--set react-local/darwin-arm64] [--budget n]`
diffs each pair with Playwright's own metric into a scenario × skin table
(`tests/scripts/visual-engine-parity.ts`; report-only, like `visual:jitter`).
A whole ROW high means the layout state itself diverges; one COLUMN high is a
skin-specific paint difference (the 3D-skin transparent card fill was one).
Adding a layout state to the matrix means adding BOTH twins; they are seeded
through `AppData.layoutMaximized` / `layoutCollapsed`, never a click — the
visual host's layout intents are deliberate no-ops.

**Don't compare the two clients' reach percentages directly** — each
denominator is its own compiled `src/ui`, and Solid's compiler emits a
different statement count for equivalent JSX. The comparable signal is *which
files* sit at 0% on one side but not the other: identical scenarios, so that
means one client has a render path the other lacks.

Three traps when reading the report:
1. The ~88 `*.module.css` rows sit at 0% but carry **zero statements** (a v8
   `PARSE_ERROR` on non-executed files — harmless, and they do not drag any
   percentage down).
2. A file can read 0% in one tier while fully covered in another
   (`appHeadRegistry` was 0% contract / 100% visual). Check the other tiers
   before concluding something is untested.
3. **A passing gate does not mean no gaps.** Gates assert an AGGREGATE, which
   cannot surface one weak file: `solid/ui (contract)` reported 99.36% overall
   while `appPanelRegistry` sat at 56% and `appHeadRegistry` at 69%. Only this
   per-file report shows that — which is the whole reason it exists.

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
catalogues the traps that burned ~70% of a core (only `transform`/`opacity`
composite; no `var()` inside animated transforms; one animation per property
per element; SVG-child transforms and large `filter`s never composite), the
fix patterns that keep the visuals, the profiling recipe, and a pre-merge
checklist. Steady-state animations must show zero `compositeFailed` events
in a trace.

## UI Logic Placement

Before adding a UI hook or moving logic behind the ViewModel, consult
**`docs/adr/ADR-005-ui-logic-placement.md`** — the decision tree for choosing
between an RxJS machine in `client-core`, a plain React hook, and a pure
function in `@rtc/motion-core` + a thin framework shell. The rule of thumb:
RxJS machines are for autonomous async folds decoupled from the view; per-frame
DOM-edge-driven computation is a pure function + injected signal, shared via
`@rtc/motion-core`.

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
