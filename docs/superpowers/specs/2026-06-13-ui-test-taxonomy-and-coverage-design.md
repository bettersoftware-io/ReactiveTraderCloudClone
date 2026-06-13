# UI Test Taxonomy + Coverage — Design

**Status:** Approved (2026-06-13). Supersedes the tier naming in
`2026-06-11-behaviour-contract-tests-design.md` (the tier built there is renamed
here; its architecture is unchanged).

## Problem

Two issues surfaced after the "behaviour" tier landed:

1. **The name is misleading.** Testing behaviour-not-implementation is a
   universal discipline, not a tier. What that tier actually tests is the **thin
   `src/ui` React layer's function/DOM contract**. Meanwhile `tests/visual-diff/`
   tests the *same* `src/ui` layer's **appearance**. The real axis is *layer*
   (`app` vs `ui`) and, within `ui`, *aspect* (contract vs visual).
2. **Script ↔ layer mapping is muddled.** `pnpm test` is documented as the
   "unit tier — presenters, adapters", but Task 6 folded the ui specs into the
   same default config, so `test` now runs **both** layers (26 app + 4 ui = 30
   files / 90 tests). The README is stale.

Separately: the ui contract tier currently covers only 4 of ~45 components, and
the `onCreated` callback passed to `NewRfqForm` is never asserted.

## Goals

- Rename the tier so the **script ↔ folder ↔ report ↔ source-layer** mapping is
  obvious at a glance.
- Add a focused runner per source layer.
- Drive `src/ui` to a high coverage bar and enforce it in CI.

## Taxonomy (target)

| Script | Tests | Folder | Report |
|---|---|---|---|
| `test:app` *(new)* | `src/app` presenters + adapters | co-located `src/app/**/*.test.ts*` | `reports/app/` |
| `test:ui:contract` *(was `test:behaviour`)* | `src/ui` function/DOM contract | `tests/ui/contract/` | `reports/ui/contract/` |
| `test:ui:contract:coverage` | ↑ + v8 coverage (+ CI gate) | — | `reports/ui/contract/coverage/` |
| `test` *(unchanged semantics)* | union (app + ui contract) | — | `reports/unit/` |

- Folder tree mirrors the script prefix: `tests/ui/contract/` (and, in the
  deferred Phase 3, `tests/ui/visual/`).
- Import alias `@behaviour` → **`@ui-contract`** (distinct from visual-diff's
  existing `@ui-harness`). tsconfig `tsconfig.behaviour.json` →
  `tsconfig.ui-contract.json`.
- Report routing keeps the repo rule `test:<a>:<b> ⇒ reports/<a>/<b>/`. Bare
  `test` stays `⇒ reports/unit/` (preserves the Turbo cache-output contract and
  the cross-package `test` task; we only ADD `test:app`/`test:ui:contract` as
  focused runners, never redefine `test`).

**Out of scope here (deferred to its own branch — Phase 3):** refolding
`tests/visual-diff/` → `tests/ui/visual/` and renaming `test:visual-diff:*` →
`test:ui:visual:*`. That change rewires `turbo.json`, the root `package.json`,
**both** GitHub workflows (`ci.yml` + `update-visual-goldens.yml`, incl. the
golden-update bot) and moves 102 committed goldens, so it is isolated for
CI validation.

## Phase 1 — rename + restructure (client-local, no new tests)

Pure, mechanical rename verified by an unchanged green suite:

- `git mv packages/client/tests/behaviour packages/client/tests/ui/contract`.
- Update the alias (`@behaviour` → `@ui-contract`) and tsconfig name in: the
  focused config, the default `vitest.config.ts`, `tsconfig.json` removal already
  done, the new `tsconfig.ui-contract.json`, `tsconfig.visual-diff.json` exclude,
  and the `typecheck` script.
- Rename spec files `*.behaviour.spec.ts` → `*.contract.spec.ts`; update the
  config `include` glob accordingly.
- Scripts: `test:behaviour` → `test:ui:contract`, `test:behaviour:coverage` →
  `test:ui:contract:coverage` (reports → `reports/ui/contract/…`); add
  `test:app` (`vitest run src/app` → `reports/app/`).
- Rename the harness's internal `behaviour`-named symbols where they read as the
  tier name (`BehaviourDriver` → `UiContractDriver`, `getDriver` message, the
  `@behaviour` doc references). Keep RxJS/React mechanics untouched.
- Docs: rewrite `tests/ui/contract/README.md`; fix the **stale** client README
  (`test` is the union; add `test:app`, `test:ui:contract*`); update root README
  + `tests/README.md` test tables + `docs/superpowers/STATUS.md`. Update the two
  affected memory files.
- **Acceptance:** `pnpm --filter @rtc/client test` (30/90), `test:ui:contract`
  (4 files/21), `test:app` (26 files/69), `typecheck`, `build` all green;
  `grep -rl "behaviour"` returns only historical `docs/superpowers/plans|specs`
  (point-in-time records, never rewritten).

## Phase 2 — coverage to target + CI gate

**Source-of-truth for "done": the v8 coverage report on `src/ui/**`.**

Two test styles, chosen per file:

1. **Sociable `ui:contract` specs (`.tsx` components)** — mount via the harness,
   assert rendered DOM + recorded command/callback inputs + dynamic
   `setProps`/`emit`. New page objects + tokens + registry entries per component,
   following the established 4. Includes the **`onCreated` spy** assertion on
   `NewRfqForm` (pass `vi.fn()` via `props`, assert `toHaveBeenCalledWith` — using
   fake timers for the 1.5s `setTimeout`, or asserting the already-rendered "RFQ
   Created" confirmation as the observable proxy) and `FxBlotter`'s missing
   **sort/filter/quick-filter** branches.
2. **Plain co-located unit tests (`.ts` utils/hooks)** — `src/ui/**/*.test.ts`
   for pure logic that DOM tests cover poorly: `columnSort.ts`, `csvExport.ts`,
   `columnFilter/filterState.ts`, `blotterColumns.ts`, and the `tile/hooks/*`,
   `admin/hooks/useThroughput.ts`, `shell/stale/useStaleDetection.ts`
   (hook logic via `@testing-library/react`'s `renderHook` through the harness
   provider where they need hook context, else pure-function tests). These run
   under `test:app`-style co-location and are picked up by the default `test`.

**Coverage gate (`tests/ui/contract/vitest.config.ts`):**
`coverage.thresholds` ≈ 95% (statements/branches/functions/lines) over
`include: ["src/ui/**"]`, so regressions fail `test:ui:contract:coverage`.

**Justified exclusions from the gate** (documented in the config via
`coverage.exclude`), because jsdom-mounting them adds cost without contract
value and they are covered by the visual/e2e tiers:
- `src/ui/App.tsx`, `shell/layout/Workspace.tsx`, `credit/CreditWorkspace.tsx`
  — full-page composition roots (visual-diff `app/*` scenarios + e2e own these).
- `src/ui/hooks/createAppHooks.ts`, `hooks/HooksProvider.tsx`,
  `shell/theme/ThemeProvider.tsx`, `shell/theme/tokens.ts` — the real
  composition-root/provider/constants the harness deliberately *replaces* or that
  carry no branches.
- Chart/canvas leaf visuals with no DOM-assertable logic
  (`PnlChart.tsx`, `TileChart.tsx`, `PositionBubbles.tsx`, `PairPnlBars.tsx`) —
  owned by visual-diff; smoke-mounted only if cheap.

Every exclusion is listed explicitly so the gate's denominator is honest, not
silently shrunk.

**Acceptance:** `test:ui:contract:coverage` ≥ 95% on the non-excluded `src/ui`
surface and passes the threshold gate; `onCreated` is asserted; full suite +
typecheck + build green.

## Risks

- **Rename churn** touching the default config could break the unit suite — Phase
  1 is verified by the unchanged 30/90 before any new tests.
- **Over-testing composition roots** — mitigated by the explicit exclusion list;
  we do not chase 100% on wiring that other tiers already own.
- **`NewRfqForm` real timer** — the 1.5s `setTimeout(onCreated)` is handled with
  fake timers in the spy test, not by waiting wall-clock.
