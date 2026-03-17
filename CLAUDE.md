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
  domain/    @rtc/domain   — Pure TS, ZERO runtime dependencies. Entities, use cases, port interfaces.
  shared/    @rtc/shared   — DTOs, wire-format contracts. Depends on domain.
  client/    @rtc/client   — React + RxJS + Vite. Depends on domain, shared.
  mobile/    @rtc/mobile   — React Native (planned). Depends on domain, shared.
  server/    @rtc/server   — Marble.js + RxJS. Depends on domain, shared.
```

**Dependency rule:** dependencies flow inward only. `domain` has zero runtime deps. `shared` depends only on `domain`. `client`, `mobile`, and `server` depend on `domain` + `shared` but never on each other.

**Zero-dep constraint on `@rtc/domain`:** Domain must never have `dependencies` in its `package.json`. It uses native JS abstractions (e.g., `AsyncIterable<T>`) — never framework types like `Observable<T>`. pnpm strict mode enforces this at install time.

## Architecture Goals

- Follow clean architecture principles (separation of concerns, dependency inversion)
- "Make choices, defer commitment" — any framework (React, RxJS, Marble.js, Vite, Vitest) should be replaceable by changing only its package, not the monorepo config or domain logic
- Turborepo config is framework-blind (task names + dependency graph only)
- Reference implementation: https://github.com/AdaptiveConsulting/ReactiveTraderCloud
