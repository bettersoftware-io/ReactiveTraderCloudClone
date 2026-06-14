# Coverage Reports & Visual Gap-Finder — Design

**Date:** 2026-06-14

**Status:** Approved (brainstorming) — ready for implementation plan

## Goal

Extend coverage reporting beyond the single existing `test:ui:contract:coverage`
gate to the other in-process test suites, and add a **visual gap-finder**: a
coverage report whose objective (per Martin Fowler — *find untested code*) is to
surface UI components, screens, and conditional branches that **no visual
scenario renders**, i.e. that have **no golden snapshot**.

All new reports are **report-only** — no CI threshold gates in this project.

## Objective & Non-Goals

**Objective:** make untested code visible. The headline artifact is the visual
gap-finder; three plain per-suite coverage reports come along because they are
cheap and close the same blind spot for non-UI code.

**Non-goals (explicitly out of scope):**
- `@rtc/shared` coverage — the package has 0 tests and is mostly compile-erased
  DTO/type declarations; a report would measure ~nothing.
- Coverage of the Playwright / playwright-ct visual runners (via
  `monocart-coverage-reports`). The three visual runners share one scenario
  manifest, so the vitest-browser run is a faithful proxy; monocart is a future
  add only if the tiers ever diverge in what they render.
- Any CI threshold **gate** for the new reports.
- Coverage of the cross-process suites (`test:e2e`, `test:browser:*`,
  `test:fullstack:*`) — the app/server run in a separate process from the
  driver, so coverage would need instrumented bundles + `window.__coverage__`
  scraping. High effort, low marginal value here.
- **Writing the new visual scenarios** to close the gaps the report finds. This
  project ships the instrument plus a one-time inventory; closing gaps is a
  deferred follow-up.

## Architecture Overview

Two independent pieces, sharing only the "honest denominator" discipline already
established by `tests/ui/contract/vitest.coverage.config.ts`:

1. **Visual gap-finder** — istanbul coverage of `src/ui` driven by the
   vitest-browser visual tier.
2. **Three plain coverage scripts** — v8 coverage for `@rtc/client` `src/app`,
   `@rtc/domain` `src`, `@rtc/server` `src`.

Each new report is a *direct package script* (run via `pnpm --filter`), exactly
like the existing `test:app` and `test:ui:contract:coverage`. None are Turborepo
tasks; none touch `turbo.json`.

---

## Piece 1 — Visual Gap-Finder

### Vehicle

The **vitest-browser** visual tier
(`packages/client/tests/ui/visual/vitest-browser/`). Its spec already loops the
shared `scenarios.ts` manifest and `scenarioActions` interaction table and
renders the real `src/ui` components through `VisualScenario` → `registry` →
actual component imports, wrapped in the real `ThemeProvider` + `HooksProvider`
with fake data, in real Chromium. Instrumenting `src/ui` during that run yields
branch-level coverage that maps straight back to source.

**Provider: istanbul** (`@vitest/coverage-istanbul`). Vitest browser mode does
not support the default `v8` provider; istanbul instruments the source through
Vite's transform, which also gives truer **branch** granularity than v8's
range-based data — exactly what a branch-level gap-finder needs.

### New config

`packages/client/tests/ui/visual/vitest-browser/vitest-browser.coverage.config.ts`

A `mergeConfig` over the existing `vitest-browser.config.ts`, adding only a
`coverage` block. The plain `test:ui:visual:vitest-browser:react` run stays
uninstrumented (no slowdown, no behaviour change); coverage is opt-in.

```ts
import { mergeConfig, defineConfig } from "vitest/config";
import base from "./vitest-browser.config";

// Visual gap-finder: instruments src/ui while the vitest-browser tier renders
// every shared scenario, so UNCOVERED branches = visual states no golden
// captures. Report-only — read the branch/function columns, no threshold gate.
export default mergeConfig(base, defineConfig({
  test: {
    coverage: {
      provider: "istanbul",          // browser mode → istanbul, not v8
      include: ["src/ui/**"],
      exclude: [ /* branchless glue, each with a reason comment */ ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/ui/visual/coverage",
    },
  },
}));
```

### New script (`@rtc/client`)

```
"test:ui:visual:vitest-browser:react:coverage":
  "vitest run -c tests/ui/visual/vitest-browser/vitest-browser.coverage.config.ts --coverage"
```

### Denominator

`src/ui/**` **minus branchless glue**. The exclude list is derived from scratch
(NOT copied from the contract tier — the two configs are independent and have
opposite objectives). One rule governs it: exclude only files with no
conditional render path that *could* be missed —

- pure context providers (e.g. `HooksProvider.tsx`),
- the `tokens.ts` constants module,
- barrel / `index` re-export files,
- type-only modules,
- `createAppHooks.ts` — never executed by the visual tier (it renders with
  `buildFakeHooks`).

**Charts and full-page composition roots stay IN** the denominator
(`App.tsx`, `shell/layout/Workspace.tsx`, `credit/CreditWorkspace.tsx`,
`fx/analytics/PnlChart.tsx`, `PositionBubbles.tsx`, `PairPnlBars.tsx`,
`fx/liveRates/tile/TileChart.tsx`) — these are exactly what the visual tier
uniquely renders, so they are valid gap-finding targets.

The exact final exclude list is applied file-by-file during implementation; each
exclusion carries a one-line reason comment, matching the contract config's
style. `ThemeProvider.tsx` is **kept** unless inspection shows it has no
visual-relevant branches (it has theme/localStorage logic exercised by the
`app/fx-light` scenario).

### How it reads as a gap-finder

- **functions** column → a component no scenario mounts at all shows 0%.
- **branches** column → a rendered component's unvisited conditional arm (e.g.
  `Tile`'s down-tick state, an error/stale overlay, empty-vs-populated).

Both are, by construction, visual states with no golden snapshot.

### Honesty caveat (documented, not a defect)

Coverage proves a branch *rendered into some captured frame*, not that the frame
makes that branch visually distinct. Therefore:

- **red = definitely no snapshot** — false-negative-free; this is the property we
  rely on.
- **green = rendered somewhere** — NOT a guarantee of a dedicated scenario.

This is stated in the suite docs so green is never misread as "fully
snapshotted."

### Behaviour notes

- The coverage run reuses the base config's per-environment golden routing (CI
  `react/` vs local `react-local/<plat>-<arch>/`) and still performs
  `toMatchScreenshot` assertions.
- Istanbul accumulates coverage as modules execute and Vitest writes the report
  after the run **even if screenshot assertions fail** — a local golden mismatch
  will not rob you of the gap report. Rendering is what is measured, not the diff
  verdict.

---

## Piece 2 — One-Time Gap Inventory

`packages/client/tests/ui/visual/COVERAGE-GAPS.md`

A dated, hand-authored deliverable produced by reading the first istanbul
report. Point-in-time, clearly stamped — NOT generated or CI-maintained. Table
format:

| File | Gap (function / branch) | Visual state it represents | Suggested scenario name |
|---|---|---|---|
| `fx/liveRates/tile/Tile.tsx` | branch: `movement === "down"` | down-tick (red) tile | `tile/eurusd-down` |
| … | … | … | … |

The suite README gains a short pointer ("Coverage gaps: see `COVERAGE-GAPS.md`,
snapshot 2026-06-14") and a one-paragraph "how to regenerate" note (run the
`:coverage` script, read the red branches). Actually writing the suggested
scenarios is the deferred follow-up.

---

## Piece 3 — Three Plain Coverage Scripts (report-only, v8)

| Package | Script | Mechanism | Report dir |
|---|---|---|---|
| `@rtc/domain` | `test:coverage` | `coverage` block added to existing `vitest.config.ts` (bare `test` already globs `src/**`); script `vitest run --coverage` | `reports/unit/coverage` |
| `@rtc/server` | `test:coverage` | same — coverage block + `vitest run --coverage` | `reports/unit/coverage` |
| `@rtc/client` | `test:app:coverage` | dedicated `vitest.app.coverage.config.ts` (extends base config, `coverage.include: ["src/app/**"]`); script `vitest run src/app -c vitest.app.coverage.config.ts --coverage` | `reports/app/coverage` |

All three: provider `v8`, `coverage.include` scoped to the package's real source
(so untested files appear at 0%), `exclude` test files, reporters
`text` + `html` + `lcov`, **no thresholds**.

**Why domain/server use a config block but client `test:app` needs its own
file:** domain & server's bare `test` already targets `src/**`, so `--coverage`
with an `include` in the shared config works directly. The client package's bare
`test` runs the app **and** ui-contract union, so app-only coverage must scope
its `include` away from `src/ui` — cleanest as a small dedicated config rather
than brittle inline `--coverage.include` flags. (The client config also has the
`@vitejs/plugin-react` + jsdom setup, inherited by extending the base.)

---

## Dependencies

pnpm strict mode requires per-package declaration of dev deps:

- `@rtc/domain`: add `@vitest/coverage-v8` (devDependencies)
- `@rtc/server`: add `@vitest/coverage-v8` (devDependencies)
- `@rtc/client`: add `@vitest/coverage-istanbul` (devDependencies) — already has
  `@vitest/coverage-v8`

Version: match the workspace's existing `@vitest/coverage-v8` (`^4.1.8`) so all
coverage packages track the pinned Vitest 4 line.

## Wiring & Docs

- **Turbo:** no changes — coverage scripts are direct package scripts.
- **CI:** no changes — report-only, no gate. A non-gating artifact-upload step is
  a clean future follow-up.
- **Reports:** land under the already-gitignored `reports/` tree.
- **Docs to update:**
  - `packages/client/README.md` scripts table — add `test:app:coverage` and
    `test:ui:visual:vitest-browser:react:coverage` rows.
  - `packages/client/tests/ui/visual/README.md` — document the gap-finder, the
    honesty caveat, the regenerate steps, and the `COVERAGE-GAPS.md` pointer.
  - (domain/server READMEs if they enumerate scripts — add `test:coverage`.)

## Success Criteria

1. `pnpm --filter @rtc/domain test:coverage`, `--filter @rtc/server
   test:coverage`, `--filter @rtc/client test:app:coverage`, and `--filter
   @rtc/client test:ui:visual:vitest-browser:react:coverage` all run and emit
   `text` + `html` + `lcov` reports to their documented dirs.
2. The visual report's denominator is `src/ui` minus branchless glue, with each
   exclusion carrying a reason comment.
3. `COVERAGE-GAPS.md` exists, is dated, and lists the components/branches the
   visual report shows as uncovered, with suggested scenario names.
4. No new CI gate; no `turbo.json` change; `@rtc/shared` untouched.
5. The everyday `test:ui:visual:vitest-browser:react` run remains
   uninstrumented and unchanged.
