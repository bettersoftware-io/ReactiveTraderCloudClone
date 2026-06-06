# ADR-001: Tooling for the visual-diff test tier

**Status:** Accepted (retrospective — the choice was made in the implementation
plan; this records the rationale and the framework-migration guidance).

## Context

We want a deterministic visual-regression tier that screenshots `@rtc/client`
UI rendered against injected fake data (`AppHooks`), with one explicit goal
beyond catching CSS regressions: the **same baselines must later gate a
reimplementation of the UI layer in another framework** (SolidJS is the stated
near-term target; Vue/Svelte/Angular are possible). True pixel diffing rules out
jsdom/happy-dom (they don't lay out or paint), so a real browser engine is
mandatory.

## Decision

Use **Playwright Component Testing** (`@playwright/experimental-ct-react`),
bundling via Vite (`@vitejs/plugin-react`, already a client dependency).

Reasons, in priority order:

1. **In-repo goldens are the cross-framework contract.** `toHaveScreenshot`
   writes committed PNGs under `__screenshots__/`; a future framework points its
   `snapshotPathTemplate` at the *same* directory. A cloud service
   (Chromatic/Percy/Applitools) stores baselines off-repo and behind an account,
   which breaks that contract and the repo's "works from a cold/offline
   checkout" philosophy.
2. **Vite-native, minimal config.** The harness is essentially
   `ctViteConfig: { plugins: [react()] }`; a Solid port reuses the same runner
   with `vite-plugin-solid`.
3. **Reuses the existing engine.** The e2e tier already runs Playwright; one
   engine, one version to manage (we keep `@playwright/test` and
   `experimental-ct-react` pinned to the same version).
4. **Cypress was a documented dead-end here.** Its command-queue model is
   incompatible with the Promise-shaped page-object contracts, and `.should()`
   retry starves the app's timers. Playwright's `await`/auto-retry model fits a
   tier that mounts live components and needs deterministic settle.

## Consequences / known weaknesses

- **Experimental API.** `experimental-ct-*` can change between releases.
- **Cross-platform pixel drift.** Local-screenshot tools are subject to OS/arch
  font rendering. We generate on Linux with a single golden filename; a stricter
  setup would pin baseline generation to a container.
- **No review UI.** Baselines are inspected by eye and committed (no
  Chromatic-style approve/reject workflow).

## Alternatives considered

- **Vitest browser mode** (v4): the closest alternative since the repo already
  runs Vitest. Loses on visual-assertion maturity (`toHaveScreenshot` has
  masking/threshold/retry-until-stable; Vitest's visual matcher is newer). It is,
  however, the recommended *driver for a Solid port* — see below.
- **Storybook + test-runner / Chromatic:** duplicates the role of
  `scenarios.ts`/`registry.tsx`, adds a large dependency, and (Chromatic) moves
  baselines off-repo.
- **Cloud SaaS (Percy/Applitools/Lost Pixel):** robust diffing + review UI, but
  off-repo baselines and an account requirement — rejected for the contract and
  offline-checkout reasons above.
- **jsdom + jest-image-snapshot:** non-starter; jsdom does not paint.

### Vitest browser mode — attempted (Task 3)

We attempted to stand up a third comparison tier driven by Vitest's
`@vitest/browser` + `vitest-browser-react`, using the **experimental**
`expect.element(...).toMatchScreenshot()` matcher. That matcher only ships in
**Vitest 4**; this repo pins **Vitest 3.2.4**, and the same `vitest` dependency
backs the unit suite (`src/**/*.test.ts(x)`). The tier was **not adopted** — it
was dropped at **decision Gate A (the unit-suite guard), before the matcher
itself was ever exercised**.

Concretely: installing `vitest@4.1.8` / `@vitest/browser@4.1.8` /
`vitest-browser-react@1.0.1` / `playwright@1.60.0` and re-running
`pnpm --filter @rtc/client test` broke the existing unit suite — **9 of 69 tests
failed** (1 of 26 files), all in `src/app/adapters/WsAdapter.test.ts`. The
failure is a Vitest-4 behavioral change in `vi.stubGlobal`: that test stubs the
global `WebSocket` with an **arrow function**
(`vi.stubGlobal("WebSocket", () => { ... return new MockWebSocket(); })`), and on
v4 the stubbed global is now invoked with `new`, so it throws
`TypeError: (() => {...}) is not a constructor` at `new WebSocket(this.url)`
(`WsAdapter.ts:47`). This is unrelated to the visual-diff work and out of scope
for this tier, so per the task's hard gate we reverted `package.json` +
`pnpm-lock.yaml` to Vitest 3.2.4, reinstalled, and confirmed the unit suite is
green again (26 files / 69 tests).

Net: `toMatchScreenshot` was never reached — the v4 prerequisite regressed an
unrelated, in-scope suite, and the two Playwright tiers (CT and plain) already
provide the cross-framework golden comparison this matcher would have
duplicated. Vitest browser mode remains the recommended *driver for a future
Solid port* (see below); revisiting it cleanly would require first migrating the
unit suite's global mocks to a v4-compatible form (e.g. stub `WebSocket` with a
real class rather than an arrow function).

## Switching the UI framework — is Playwright CT an impediment?

No, *if* you treat the **goldens + the React-free `shared/` manifest** as the
portable contract rather than the runner. The framework-specific surface is only
three small files (`react/buildFakeHooks.ts`, `react/registry.tsx`,
`react/VisualScenario.tsx`); a new framework reimplements those and reuses
`shared/` + `__screenshots__/` unchanged.

Official Playwright CT adapter status (checked 2026-06):

| Target | `@playwright/experimental-ct-*` | Vite-native | Notes |
|--------|--------------------------------|-------------|-------|
| React  | 1.60.0 (current)               | yes         | current harness |
| Vue    | 1.60.0 (current)               | yes         | low friction |
| Svelte | 1.58.2 (slightly behind)       | yes         | low friction |
| Solid  | **1.48.2 (lags ~1.5 yr)**      | yes (`vite-plugin-solid`) | adapter/core version-locked — friction |
| Angular| none                           | no          | CT does not apply |

**Pick the driver per target — you are not locked to a CT adapter:**

1. **Matching CT adapter** — fine for Vue/Svelte; avoid for Solid (its adapter
   lags the core `playwright` version and would fragment or downgrade the repo).
2. **Vitest browser mode** — recommended for the **Solid** port: Vite-native,
   already in the repo, sidesteps the lagging `ct-solid` adapter. Compare against
   the same committed PNGs.
3. **Plain Playwright over a tiny Vite page** — serve a `?scenario=<name>` page
   that mounts the framework's `VisualScenario` equivalent, then `page.goto` +
   `toHaveScreenshot`. Depends on no CT adapter at all; most framework-agnostic.

**Expect a parity punch-list, not day-one green.** Different frameworks can emit
slightly different DOM/CSS (wrapper nodes, attribute order, hydration markers)
that occasionally shift a pixel. The first run's diffs against the shared goldens
*are* the parity report.
