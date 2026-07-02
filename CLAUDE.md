# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

This project aims to recreate [ReactiveTraderCloud](https://github.com/AdaptiveConsulting/ReactiveTraderCloud) from specifications, following clean architecture principles. ReactiveTraderCloud is a real-time FX trading platform with live pricing, trade execution, and analytics.

## Current Status

Monorepo scaffolding is in place with pnpm workspaces + Turborepo. All four packages build, typecheck, and pass tests.

## Build Commands

```bash
pnpm build       # Topological: domain → shared → client + server
pnpm typecheck   # tsc --noEmit in all packages
pnpm test        # vitest run in all packages
pnpm test:e2e    # Playwright (client only)
pnpm dev         # Vite dev server (client) + tsx watch (server)
pnpm clean       # Remove dist/ in all packages
```

## Package Structure

```
packages/
  domain/        @rtc/domain         — Pure TS, depends only on rxjs at runtime. Entities, use cases, port interfaces, simulators.
  shared/        @rtc/shared         — DTOs, wire-format contracts. Depends on domain.
  client-react/  @rtc/client-react   — React + RxJS + Vite. Depends on domain, shared.
  mobile/        @rtc/mobile         — React Native (planned). Depends on domain, shared.
  ws-effects/    @rtc/ws-effects     — Small declarative RxJS effects framework. Pure TS, depends only on rxjs at runtime.
  server/        @rtc/server         — Native WebSocket + @rtc/ws-effects. Depends on domain, shared, ws-effects.
```

**Dependency rule:** dependencies flow inward only. `domain` has only `rxjs` as a runtime dep. `shared` depends only on `domain`. `client`, `mobile`, and `server` depend on `domain` + `shared` but never on each other. `server` additionally depends on `ws-effects`, which itself depends on nothing but `rxjs`.

**Single-dep constraint on `@rtc/domain`:** Domain may depend on `rxjs` at runtime — and only on `rxjs`. RxJS is the explicit architectural exception, chosen for its declarative stream operators and the team's familiarity with it. No other runtime dependencies are permitted. pnpm strict mode enforces this at install time. `@rtc/ws-effects` follows the same rxjs-only constraint.

## Architecture Goals

- Follow clean architecture principles (separation of concerns, dependency inversion)
- "Make choices, defer commitment" — any framework (React, RxJS, ws-effects, Vite, Vitest) should be replaceable by changing only its package, not the monorepo config or domain logic
- Turborepo config is framework-blind (task names + dependency graph only)
- Reference implementation: https://github.com/AdaptiveConsulting/ReactiveTraderCloud
