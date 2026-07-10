# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

This project aims to recreate [ReactiveTraderCloud](https://github.com/AdaptiveConsulting/ReactiveTraderCloud) from specifications, following clean architecture principles. ReactiveTraderCloud is a real-time FX trading platform with live pricing, trade execution, and analytics.

## Current Status

Monorepo with pnpm workspaces + Turborepo; nine packages plus the `tests` workspace. All packages build, typecheck, and pass tests. Two shipping clients (web React, RN/Expo) share the framework-free `@rtc/client-core`; `docs/architecture.md` is the authoritative architecture reference.

## Build Commands

```bash
pnpm build       # Topological: domain → shared → client + server
pnpm typecheck   # tsc --noEmit in all packages
pnpm test        # vitest run in all packages
pnpm test:e2e    # Playwright (client only)
pnpm dev         # Vite dev server (client) + tsx watch (server)
pnpm dev:proto   # @rtc/client-prototype only — the v2 design React port (Vite) → http://localhost:5273
pnpm dev:design  # standalone v3 design prototype HTML, served by a zero-dep Node script → http://localhost:8899
pnpm dev:ios     # @rtc/client-react-native on the iOS simulator (expo run:ios: build → install dev client → launch → Metro)
pnpm clean       # Remove dist/ in all packages
```

`dev:design` serves `docs/design/v3/standalone/Reactive Trader.html` (a self-contained design artifact, not app code) via `scripts/serve-design.mjs`. `dev:proto` runs its React re-implementation in `packages/client-prototype`. `dev:ios` delegates to the RN package's `ios` script (`expo run:ios`); it compiles the native dev client if missing, installs it on the booted simulator, and starts Metro — idempotent, so it's quick on later runs. The native `ios/` folder is gitignored and lives only where you run it (a removed worktree loses it), so run `dev:ios` once from your primary checkout to (re)create the dev build.

## Package Structure

```
packages/
  domain/              @rtc/domain              — Pure TS, depends only on rxjs at runtime. Entities, use cases, port interfaces, simulators.
  shared/              @rtc/shared              — DTOs, wire protocol (CLIENT_MSG/SERVER_MSG), envelopes. Depends on domain.
  client-core/         @rtc/client-core         — Framework-free application core: composition root, presenters, state machines, WsAdapter + port factories. Depends on domain, shared (+ rxjs, @rx-state/core). No React/DOM/RN imports.
  react-bindings/      @rtc/react-bindings      — The React↔RxJS bridge: createViewModel, useMachine, ViewModelProvider/useViewModel. Depends on client-core, domain (+ @react-rxjs/core, react).
  client-react/        @rtc/client-react        — Web client: dumb React 19 UI + browser adapters (Vite). Depends on client-core, react-bindings, domain.
  client-react-native/ @rtc/client-react-native — Mobile client: Expo SDK 57 / RN 0.86, dumb RN UI + native adapters. Depends on client-core, react-bindings, domain.
  client-prototype/    @rtc/client-prototype    — Readable React port of the docs/design/v2 prototype. Isolated: react/react-dom only, no @rtc/* imports.
  ws-effects/          @rtc/ws-effects          — Small declarative RxJS effects framework. Pure TS, depends only on rxjs at runtime.
  server/              @rtc/server              — Native WebSocket + @rtc/ws-effects (24 effects: FX/Credit/Admin/Equities). Depends on domain, shared, ws-effects.
```

**Dependency rule:** dependencies flow inward only. `domain` has only `rxjs` as a runtime dep. `shared` depends only on `domain`. `client-core` is the shared application layer; the client packages and `server` never import each other. `server` additionally depends on `ws-effects`, which itself depends on nothing but `rxjs`. See `docs/architecture/06-package-dependencies.md` (§6) for the full graph.

**Single-dep constraint on `@rtc/domain`:** Domain may depend on `rxjs` at runtime — and only on `rxjs`. RxJS is the explicit architectural exception, chosen for its declarative stream operators and the team's familiarity with it. No other runtime dependencies are permitted. pnpm strict mode enforces this at install time. `@rtc/ws-effects` follows the same rxjs-only constraint.

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
