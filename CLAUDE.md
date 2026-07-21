# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

This project aims to recreate [ReactiveTraderCloud](https://github.com/AdaptiveConsulting/ReactiveTraderCloud) from specifications, following clean architecture principles. ReactiveTraderCloud is a real-time FX trading platform with live pricing, trade execution, and analytics.

## Current Status

Monorepo with pnpm workspaces + Turborepo; eighteen packages plus the `tests` workspace. All packages build, typecheck, and pass tests. Three shipping web/mobile clients (React, RN/Expo, SolidJS) share the framework-free `@rtc/client-core`. `@rtc/client-solid` is at full parity with `@rtc/client-react`: the same shared `@rtc/ui-contract` behavioural specs pass against both (via a per-framework swap-trio), its visual tier asserts pixel-for-pixel against the goldens in `@rtc/ui-contract` (generated only from `client-react` renders; assert-only — `client-solid` owns none of its own), and the same Gherkin e2e suites run against it — built on the parallel `@rtc/solid-bindings` bridge, the `@rtc/react-bindings` sibling. A custom devtools trio (`@rtc/devtools-core` + `@rtc/devtools-app` + `@rtc/devtools-extension`, plus the standalone `@rtc/devtools-relay` for RN) gives the non-Redux state layer live state inspection, dormant until an inspector attaches — served same-origin at `/devtools/`, or attached to any running app (including the deployed build) via the MV3 Chrome extension. `docs/architecture.md` is the authoritative architecture reference.

## Build Commands

```bash
pnpm build       # Topological: domain → shared → client + server
pnpm typecheck   # tsc --noEmit in all packages
pnpm test        # vitest run in all packages
pnpm test:e2e    # Playwright (client only)
pnpm dev         # Alias of `dev:react` — @rtc/client-react in simulator mode (no server); sign in with a committed demo account (see below)
pnpm dev:ws      # @rtc/server only — native WS + login on ws://localhost:4000 (tsx watch)
pnpm dev:watch   # Rebuild-watch every pure-TS library (domain, shared, ws-effects, motion-core, ui-contract, devtools-core) — run alongside a client to hot-rebuild lib edits
pnpm dev:react       # @rtc/client-react only (Vite) → http://localhost:5173 — simulator mode (no server)
pnpm dev:react:ws    # @rtc/client-react only, connected to an already-running `dev:ws` (ws://localhost:4000)
pnpm dev:react:fs    # Full stack: start the WS server + @rtc/client-react connected to it
pnpm dev:solid       # @rtc/client-solid only (Vite) → http://localhost:5473 — simulator mode (no server)
pnpm dev:solid:ws    # @rtc/client-solid only, connected to an already-running `dev:ws`
pnpm dev:solid:fs    # Full stack: start the WS server + @rtc/client-solid connected to it
pnpm dev:proto   # @rtc/client-prototype only — the v2 design React port (Vite) → http://localhost:5273
pnpm dev:design:web     # standalone web design prototype HTML (v5), served by a zero-dep Node script → http://localhost:8899
pnpm dev:design:mobile  # same server, but the standalone mobile design prototype (mobile v1) → http://localhost:8899
pnpm dev:ios     # @rtc/client-react-native on the iOS simulator (expo run:ios: build → install dev client → launch → Metro)
pnpm dev:devtools     # @rtc/devtools-app — the standalone inspector SPA (Vite), served same-origin at /devtools/
pnpm dev:devtools:ext # @rtc/devtools-extension — watch-build the unpacked MV3 bundle → packages/devtools-extension/dist (load via chrome://extensions → Load unpacked → RTC panel)
pnpm dev:devtools:relay # @rtc/devtools-relay — the standalone dev-machine WebSocket relay (ws://localhost:8790) bridging the browser inspector to the React Native client; open the panel at /devtools/?relay=ws://localhost:8790
pnpm clean       # Remove dist/ in all packages
```

**Client dev matrix.** Both web clients pick their data source at composition time from `VITE_SERVER_URL` (`packages/client-*/src/app/buildBrowserPorts.ts`): set → real `WsAdapter`; unset → in-browser simulator. The scripts encode that as an orthogonal matrix — a bare client (`dev:react` / `dev:solid`) runs simulator-only; the `:ws` suffix points the client at an already-running `dev:ws` server (start it in another terminal); the `:fs` suffix starts the WS server **and** the client together (the reconnecting `WsAdapter` tolerates the server coming up moments later, so parallel start is fine). `dev:ws` and `dev:watch` are the reusable building blocks (server alone; library rebuild-watchers alone). Bare `pnpm dev` is a plain **alias of `dev:react`** — `@rtc/client-react` in simulator mode: no server, simulated prices in-browser. It still shows the sign-in gate, but the demo credentials are committed (see below), so it works out of the box. Full-stack live data is the opt-in `dev:react:fs` / `dev:solid:fs`. The turbo-routed scripts (the `*:fs` pair) rely on `VITE_SERVER_URL` (and, for the server, `AUTH_USERS` / `AUTH_SECRET`) being declared on turbo's `dev` task / `globalPassThroughEnv` (turbo's env mode is strict — an undeclared var would be stripped and silently drop the client back to simulator mode).

**Demo accounts & auth env.** All local dev logins use a committed demo roster (`packages/domain/src/auth/roster.ts` — `astark` / `nromanoff` / `tchalla` / `demo`, all password `mcdc2026`; demo-only, safe to commit, rotate if it ever matters). Simulator mode (`pnpm dev` / `dev:react` / `dev:solid`) reads them from each client's own committed `.env.development` (`packages/client-react/.env.development` and `packages/client-solid/.env.development`, both `VITE_DEV_AUTH`, JSON `{"user":"pass"}` — Vite loads it dev-only, never in a production build) via the identical `parseDevAuth` helper in each client's `buildBrowserPorts.ts`. WS-real mode (`dev:*:fs` / `dev:*:ws` and the deployed client) authenticates against the **server's** `AUTH_USERS` instead — a *different* format, `"user:pass,user2:pass2"`, plus an `AUTH_SECRET`; the `dev:ws` / `dev:*:fs` scripts bake the same demo roster in so full-stack works out of the box too. Production is unaffected: Fly sets its own `AUTH_USERS` / `AUTH_SECRET` secrets, and these `dev:*` npm scripts never run there.

**Blank screen on `pnpm dev`?** A stale Vite pre-bundle cache (e.g. after a lockfile change re-links a workspace dep) can silently break the render — the app crashes with the error swallowed and no Vite overlay, leaving a blank white page. Clear it and restart: `rm -rf packages/client-react/node_modules/.vite`.

**Future direction (not yet built).** `pnpm dev` is deliberately ambiguous today — "the default web client" — and currently resolves to React. The plan is to rename it to **`dev:web`** and have it select the client implementation (React vs Solid) from a feature flag, so `dev:web` boots whichever web client the flag points at while `dev:react` / `dev:solid` stay as the explicit per-implementation entry points. Until that lands, treat `pnpm dev` as "the React web client, simulator mode."

`dev:design:web` serves `docs/design/web/v5/standalone/Reactive Trader.html` (a self-contained design artifact, not app code) via `scripts/serve-design.mjs`; `dev:design:mobile` serves the mobile counterpart under `docs/design/mobile/v1/standalone/`. The design prototypes are organized as `docs/design/web/{v1..v5}` (web iterations, v5 current) and `docs/design/mobile/v1` (mobile). v5's HTML and media are Git LFS-tracked (scoped to `docs/design/web/v5/**` in `.gitattributes`), so a fresh clone needs `git lfs pull` before `dev:design:web` can serve it. `dev:proto` runs its React re-implementation in `packages/client-prototype`. `dev:ios` delegates to the RN package's `ios` script (`expo run:ios`); it compiles the native dev client if missing, installs it on the booted simulator, and starts Metro — idempotent, so it's quick on later runs. The native `ios/` folder is gitignored and lives only where you run it (a removed worktree loses it), so run `dev:ios` once from your primary checkout to (re)create the dev build.

## Package Structure

```
packages/
  domain/              @rtc/domain              — Pure TS, depends only on rxjs at runtime. Entities, use cases, port interfaces, simulators.
  shared/              @rtc/shared              — DTOs, wire protocol (CLIENT_MSG/SERVER_MSG), envelopes. Depends on domain.
  client-core/         @rtc/client-core         — Framework-free application core: composition root, presenters, state machines, WsAdapter + port factories. Depends on domain, shared (+ rxjs, @rx-state/core). No React/DOM/RN imports.
  react-bindings/      @rtc/react-bindings      — The React↔RxJS bridge: createViewModel, useMachine, ViewModelProvider/useViewModel. Depends on client-core, domain (+ @react-rxjs/core, react).
  solid-bindings/      @rtc/solid-bindings      — The Solid↔RxJS bridge (parallel to react-bindings): createViewModel, useMachine, ViewModelProvider/useViewModel. Depends on client-core, domain (+ @rx-state/core, rxjs, solid-js). No React.
  client-react/        @rtc/client-react        — Web client: dumb React 19 UI + browser adapters (Vite). Depends on client-core, react-bindings, domain.
  client-react-native/ @rtc/client-react-native — Mobile client: Expo SDK 57 / RN 0.86, dumb RN UI + native adapters. Depends on client-core, react-bindings, domain.
  client-prototype/    @rtc/client-prototype    — Readable React port of the docs/design/web/v2 prototype. Isolated: react/react-dom only, no @rtc/* imports.
  client-solid/        @rtc/client-solid        — Web client, SolidJS port of client-react at full parity (contract + visual + e2e). Dumb Solid UI + browser adapters (Vite, port 5473). Depends on client-core, solid-bindings, domain, motion-core.
  motion-core/         @rtc/motion-core         — Framework-free, zero-dependency view-layer motion math (FLIP deltas, rank-glide coalescing, easing/duration constants). No DOM, no rxjs, no React. Shared by both client animation shells (React and Solid).
  boot-splash/         @rtc/boot-splash         — Framework-free boot/splash feature: the canvas draw engine (six 3D scene variants + shared laser/docking helpers) and the reduced-motion/webdriver gate, plus the two `*.module.css` stylesheets. No `@rtc/*` deps; unlike motion-core it does touch the DOM (canvas 2D context, `navigator`/`location`). Shared by both web clients (`client-react`, `client-solid`), each supplying its own `BootSequence`/`BootGate` React or Solid shell.
  ui-contract/         @rtc/ui-contract         — Framework-neutral UI test contract: shared harness + contract specs + visual scenario matrix, extracted from client-react's test tree, plus the committed `goldens/` PNG trees (generated only from client-react renders; outside `src/`, not compiled or exported). Depends on client-core, domain, motion-core (+ rxjs); consumed by clients as a devDependency, never from src.
  ws-effects/          @rtc/ws-effects          — Small declarative RxJS effects framework. Pure TS, depends only on rxjs at runtime.
  devtools-core/       @rtc/devtools-core       — Devtools event protocol, DevtoolsHub (dormancy/coalescing/ring buffer), the three composition-root decorators (instrumentPresenters, instrumentMachineFactories, instrumentWsAdapter), BroadcastChannel transport. Pure TS, depends only on rxjs at runtime.
  devtools-app/        @rtc/devtools-app        — Inspector SPA (timeline-first: unified event timeline + Event/State/Diff context pane + machines/wire lenses), served same-origin at /devtools/. Depends on devtools-core (+ react, react-dom).
  devtools-relay/      @rtc/devtools-relay      — Standalone dev-machine WebSocket relay bridging the browser inspector to the React Native client (WsRelayDuplex "app" ↔ relay ↔ "panel"). Dev-only, carries only devtools frames. Depends on `ws` at runtime; imports no @rtc package. Pure ws-only leaf.
  devtools-extension/  @rtc/devtools-extension  — MV3 Chrome DevTools extension: a third Duplex (ChromeRuntimeDuplex + reconnecting content-script bridge + tab-keyed background router) that mounts the existing InspectorApp in an "RTC" DevTools panel, attaching the inspector to any running app incl. the deployed build. Leaf consumer: depends on devtools-core + devtools-app (+ react, react-dom, rxjs). Unpacked-dev only.
  server/              @rtc/server              — Native WebSocket + @rtc/ws-effects (24 effects: FX/Credit/Admin/Equities). Depends on domain, shared, ws-effects.
```

**Dependency rule:** dependencies flow inward only. `domain` has only `rxjs` as a runtime dep. `shared` depends only on `domain`. `client-core` is the shared application layer; the client packages and `server` never import each other. `server` additionally depends on `ws-effects`, which itself depends on nothing but `rxjs`. `@rtc/motion-core` is a zero-runtime-dependency leaf consumed directly by both web clients (`client-react` and `client-solid`) for view-layer motion math -- stricter than the rxjs-only exception since it has no runtime deps at all. `@rtc/boot-splash` is likewise a leaf with no `@rtc/*` deps (dependency-cruiser `boot-splash-stays-pure`), but unlike `motion-core` it is a DOM-touching leaf, not a no-DOM one -- its canvas engine and gate reach the 2D context and `navigator`/`location` directly. See `docs/architecture/06-package-dependencies.md` (§6) for the full graph.

**Single-dep constraint on `@rtc/domain`:** Domain may depend on `rxjs` at runtime — and only on `rxjs`. RxJS is the explicit architectural exception, chosen for its declarative stream operators and the team's familiarity with it. No other runtime dependencies are permitted. pnpm strict mode enforces this at install time. `@rtc/ws-effects` follows the same rxjs-only constraint.

**Devtools dependency rule:** `@rtc/devtools-core` is an `rxjs`-only leaf like `ws-effects` — it decorates by structural shape and imports no other `@rtc/*` package; `@rtc/devtools-app` depends only on `devtools-core`. `@rtc/devtools-extension` is itself a leaf consumer that may import only `devtools-core` (transport/protocol/store) and `devtools-app` (the `InspectorApp`), never a client/server/domain package (dependency-cruiser `devtools-extension-is-a-leaf`). Within the app workspace `client-react` takes only a dev-only build-order/asset edge to `devtools-app` (to serve `/devtools/`), never a source import; the extension package is the one workspace consumer that imports `devtools-app` as source (transpiled by its own Vite build). `@rtc/devtools-relay` is a standalone `ws`-only leaf that imports no `@rtc` package (a dep-cruiser rule pins it); `WsRelayDuplex` (in `devtools-core`) is the RN/cross-machine transport that pairs with it, and `client-react-native` applies the same three decorators under `__DEV__` only. See `docs/architecture/20-devtools.md` (§20).

## Architecture Goals

- Follow clean architecture principles (separation of concerns, dependency inversion)
- "Make choices, defer commitment" — any framework (React, RxJS, ws-effects, Vite, Vitest) should be replaceable by changing only its package, not the monorepo config or domain logic
- Turborepo config is framework-blind (task names + dependency graph only)
- Reference implementation: https://github.com/AdaptiveConsulting/ReactiveTraderCloud

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
