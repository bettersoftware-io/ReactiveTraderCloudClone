# Dependency Upgrades — Design

**Date:** 2026-06-06
**Status:** Approved (brainstorming complete; next step is a written implementation plan for Plan A)

## Goal

Bring the monorepo's dependencies up to date, with the major-version bumps done
as a sequence of **independent, separately-testable plans** rather than one
sweeping change. The first plan upgrades the `@rtc/client` build/test toolchain
(vite, `@vitejs/plugin-react`, vitest, jsdom). The remaining clusters are
documented here as a roadmap and each gets its own spec→plan→implementation
cycle when reached.

This effort is **devDependency-focused**: every major bump in the roadmap is a
build/test tool, not a runtime dependency that ships to users. The only runtime
deps with updates (react, react-dom, ws) are trivial patches handled in the
safe-sweep plan.

## Context / current state

- Monorepo: pnpm workspaces + Turborepo. Packages: `domain`, `shared`, `client`,
  `server`, `tests` (e2e). `mobile` is planned, not present.
- All packages declare `vitest: ^3` (resolved 3.2.4). `@rtc/client` additionally
  has `vite: ^6`, `@vitejs/plugin-react: ^4`, `jsdom: ^25`.
- Node in the environment: **v24.16.0**.
- A prior project (three-runner visual-diff harness) attempted a vitest-browser
  visual runner but **dropped** it because `toMatchScreenshot` needs vitest 4 and
  bumping to v4 broke an existing unit test (`WsAdapter.test.ts`). That diagnosis
  is the seed of Plan A. See `packages/client/visual/ADR-001-visual-diff-tooling.md`.

### Peer-dependency facts that shape the plan

Checked against the npm registry on 2026-06-06:

- `vitest@4.1.8` peers `vite@^6 || ^7 || ^8` — **vitest 4 runs on the current
  vite 6**; the two are separable.
- `@vitejs/plugin-react@6.0.2` peers `vite@^8` — **vite 6→8 and plugin-react 4→6
  are a coupled pair**.
- `vitest@4` peers `jsdom: *` — jsdom is free-floating (any version).
- Engines: `vitest@4` needs Node `>=24` (also accepts ^20/^22); `vite@8` needs
  Node `>=22.12`. Node v24.16 satisfies both.

Although vitest 4 and vite 8 are technically separable, the chosen execution for
Plan A is to bump the whole client toolchain **at once** (see Plan A).

## Roadmap (decomposition)

Four independent plans. Only **Plan A** is detailed for implementation now; B/C/D
are roadmap entries to be expanded via `writing-plans` when reached.

| Plan | Scope | Packages affected | Risk | Order |
|---|---|---|---|---|
| **A. Client build/test toolchain** | vite 6→8, `@vitejs/plugin-react` 4→6, vitest 3→4, jsdom 25→29 — at once | `@rtc/client` (vite/plugin/jsdom) + **all 5 packages** for vitest | High | **1st (now)** |
| **B. TypeScript 5→6** | `typescript` major, cross-cutting | root + all packages via `tsconfig.base.json` | Medium-High | later |
| **C. E2E test tooling** | `@cucumber/cucumber` 11→13, `@sinonjs/fake-timers` 14→15 | `@rtc/tests` | Highest | later |
| **D. Safe sweep** | react, react-dom, ws, @types/react, @types/node, cypress, tsx, turbo — patch/minor within carets | various | Minimal | anytime |

**Relationships & sequencing rationale:**

- Plans B, C, D have no hard dependency on A or each other; sequencing controls
  blast radius. Recommended order: **A → (D anytime) → B → C**, saving the
  fragile e2e tooling (C) for last.
- **Inter-plan link:** Plan A's vitest 4 unblocks the previously-dropped
  vitest-browser visual runner. Building that runner is a **separate follow-up**,
  explicitly **out of scope** for Plan A.
- **Plan C is the highest risk** because `@rtc/tests` has a documented, delicate
  cucumber-cypress interaction (`.should()` retry vs. app-timer starvation; the
  Promise-shaped page-object incompatibility that forced forked scenarios). A
  cucumber two-major jump plus a fake-timers major in exactly that package must
  be done with the full e2e suite green before and after.

## Plan A — Client build/test toolchain upgrade (detailed)

### Version moves

- `vitest: ^3 → ^4` in **all 5 packages** (`domain`, `shared`, `server`,
  `client`, `tests`) — one resolved version across the workspace, no split
  majors.
- `vite: ^6 → ^8`, `@vitejs/plugin-react: ^4 → ^6`, `jsdom: ^25 → ^29` in
  `@rtc/client` only.
- `@types/node` stays at `^25.5` (already satisfies both vite 8 and vitest 4
  peers). No runtime/`dependencies` changes.

### Execution shape

One branch (e.g. `chore/upgrade-client-toolchain`). Bump all versions in a single
install pass, then drive the fallout to green ("all-at-once"). Sequence of work:

1. Edit the `vitest` range to `^4` in all 5 package.json files; edit `vite`,
   `@vitejs/plugin-react`, `jsdom` in client. `pnpm install`. (If a post-install
   "Cannot find module @rollup/rollup-…" appears, re-run `pnpm install` — known
   pnpm optional-dep quirk, not a code defect.)
2. **Fix the one known breakage first:** `packages/client/src/app/adapters/WsAdapter.test.ts`.
   vitest 4 invokes the mocked global `WebSocket` with `new`, and the stub's
   `vi.fn().mockImplementation(() => { … return new MockWebSocket(); })` arrow is
   not a constructor → `TypeError: (…) is not a constructor` at `WsAdapter.ts`'s
   `new WebSocket(this.url)`. Fix: make the stub constructable — a plain
   `function` or a `class` (or stub with the `MockWebSocket` class directly) —
   preserving the existing `OPEN` static and `lastMock` capture behaviour.
3. Work the remaining fallout across the verification surfaces below.

### Verification surfaces (acceptance gates)

- `pnpm typecheck` — clean (TypeScript stays at 5.9 in this plan).
- `pnpm test` — green in **every package** on vitest 4 (wide surface:
  domain/shared/server/tests unit suites too, not just client).
- `pnpm build` — succeeds on vite 8 + plugin-react 6; a quick `pnpm dev` smoke
  (server boots, page renders).
- `pnpm --filter @rtc/client test:visual` — **2/2 runners green**. Two sub-risks:
  the plain-Playwright host runs `vite --config …` (now vite 8 serving the page),
  and Playwright-CT bundles via its own Vite (`ctViteConfig`). Both must still
  work. A genuine no-op anti-aliasing shift → regenerate that tier's goldens and
  eyeball one PNG; a **content** change is a real regression to investigate.
- `pnpm --filter @rtc/tests test:e2e` — vite 8 now serves the app under
  Playwright; confirm the e2e harness still boots and passes.

### Anticipated fallout sources (beyond the known mock)

- **vite 7/8:** config/plugin API changes (build target defaults, removal of the
  CJS Node API, the Environment API), and any `vite.config.ts` options that moved
  or were renamed.
- **`@vitejs/plugin-react` 6:** option/signature changes.
- **jsdom 29:** DOM-behaviour shifts that could surface in DOM-touching unit
  tests (matchers, layout/Selection APIs, etc.).
- Each is handled as "run the gate, fix what it surfaces" — the plan enumerates
  the gates; the exact fixes are discovered during execution.

### Error handling / rollback stance

If one piece proves intractable in reasonable time (e.g. a vite 8 issue that
can't be quickly resolved), **isolate and defer that single package's bump**,
landing the rest green rather than blocking the whole cluster — and document what
was deferred and why. vitest 4 is the highest-value piece (it unblocks the
browser tier), so it is the last thing to give up. This is a stated fallback, not
an expected path.

### Out of scope for Plan A

- Building the vitest-browser visual tier (separate follow-up).
- TypeScript 5→6 (Plan B), the e2e cucumber/fake-timers bump (Plan C), the safe
  patch/minor sweep (Plan D).

## Testing / acceptance (Plan A summary)

Plan A is "done" when, on the upgrade branch: `pnpm typecheck` is clean,
`pnpm test` is green in all 5 packages on vitest 4, `pnpm build` succeeds on vite
8, `pnpm --filter @rtc/client test:visual` is 2/2 green (goldens regenerated only
for genuine no-op AA shifts, with a PNG eyeballed), and `pnpm --filter @rtc/tests
test:e2e` passes — with the working tree committed.

## Out of scope / deferred (whole effort)

- Runtime/behavioural feature changes — this is purely a dependency-version
  effort.
- Building the vitest-browser visual runner (unblocked by Plan A, done later).
- Any dependency not listed in the roadmap table.
