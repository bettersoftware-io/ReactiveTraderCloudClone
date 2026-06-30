# One class per file + filename === class name — design

**Date:** 2026-06-30
**Status:** Approved (brainstorm)

## Problem

We want each class to live in its own file, with the filename matching the
class name exactly. This keeps modules focused, makes classes trivially
locatable, and (together with the newspaper-order effort) removes the need to
reason about class ordering within a file. It is effort #2 of the three-rule
lint workstream (newspaper-order shipped as #1, PR #50).

The codebase is already ~99% compliant: every presenter, use-case, simulator,
and adapter in `src/` is one-class-per-file with a PascalCase filename equal to
the class name. The repo follows a clear convention — **PascalCase filenames
for class/component files, camelCase for plain modules** (`defined.ts`,
`aggregatePositions.ts`, entity modules like `dealer.ts`). The rules formalize
the existing convention and prevent regressions.

## Decisions (from brainstorm)

- **Two rules, both enforced repo-wide on `**/*.{ts,tsx}`; no test-file
  carve-out in config.** The rules self-limit (one only bites multi-class
  files, the other only files with a top-level class), so exceptions are
  explicit per-file `eslint-disable`s rather than blanket scope exclusions.
- **Rule A — one class per file:** ESLint core `max-classes-per-file`
  (`["error", 1]`). No dependency, no custom code. Counts all classes in a file
  (including nested).
- **Rule B — filename === class name:** a **custom** ESLint rule
  `rtc/class-filename-match` in `eslint-rules/` (reuses the RuleTester + root
  vitest infra built for newspaper-order). Biome's `useFilenamingConvention`
  was rejected: it enforces "filename matches an allowed *case* OR *some*
  export name" — content-blind to classes, so it cannot express "if this file
  declares a class, the filename must equal *that class*," and forcing its
  generic filename=export convention repo-wide would flag many legitimate
  utility modules and every export-less test file (a far larger, noisier
  migration than the class-specific intent).
- **`*.testHelpers.ts` convention:** substantial test-double classes are
  extracted to `<ClassName>.testHelpers.ts` beside their test. These are plain
  modules (NOT matched by the `*.{test,spec}` newspaper glob), satisfy both
  rules naturally, and are added to the vitest coverage `exclude` lists so they
  do not count as production coverage.
- **Small inline doubles stay inline** with a targeted, reason-bearing
  `// eslint-disable` — the repo's existing pattern for sanctioned exceptions.

## Rule B behavior (`rtc/class-filename-match`)

- Fires on every **top-level (module-scope) `ClassDeclaration`**, whether or
  not it is `export`ed. Non-exported top-level classes are still subject to the
  rule — test doubles (`MockWebSocket`, `FakeWs`) and internal helper classes
  (`MemoryStorage`) are non-exported but must still match or be exempted, which
  is the whole point of the extract/inline migration. A class nested inside a
  function / `it()` block / any other block is local detail and is **ignored**.
  (`abstract class` is treated identically.)
- The class name must equal the filename's **first dot-segment**:
  `basename.split(".")[0]`. Examples that PASS:
  `AnalyticsPresenter.ts` → `AnalyticsPresenter`;
  `MockWebSocket.testHelpers.ts` → `MockWebSocket`;
  `WsAdapter.tsx` → `WsAdapter`.
- A file with no top-level class is never flagged, so camelCase utility modules
  and export-less test files are untouched (zero collateral migration).
- Report message: *"Filename must match the class name: expected file
  '<ClassName>.<ext>' for class '<ClassName>' (got '<basename>')."*
- **Not autofixable** (renaming files + rewriting importers is beyond a safe
  in-file fixer); violations are resolved by the one-time migration below and by
  authors thereafter.

## Migration inventory

**Split (2, production):**
- `packages/domain/src/simulators/creditReferenceDataSimulator.ts` (2 classes,
  camelCase name) → `InstrumentSimulator.ts` (with `INSTRUMENTS_CATALOG`) +
  `DealerSimulator.ts` (with `DEALERS_CATALOG`). Update the domain barrel
  (`packages/domain/src/index.ts`) and the two contract-test imports
  (`InstrumentSimulator.contract.test.ts`, `DealerSimulator.contract.test.ts`).
- `packages/client-react/src/app/presenters/MetricsPresenters.ts` (3 classes —
  `ThroughputMetricPresenter`, `LatencyPresenter`, `ErrorRatePresenter`; plural
  filename matches none) → `ThroughputMetricPresenter.ts` + `LatencyPresenter.ts`
  + `ErrorRatePresenter.ts`. Update the importer `src/app/composition.ts`.
  `MetricsPresenters.test.ts` violates no rule (no top-level class) so it can
  keep its name and import from the three new files; splitting it into
  per-presenter tests to mirror the repo's one-test-per-presenter convention is
  optional (plan's choice, not rule-required). *(Added 2026-06-30 after merging
  Admin Phase 5 — PR #49 — into the branch; not present in the original scan.)*

**Extract (3 — a class declaration moved to its own correctly-named file):**
- `MountedComponent` (in `tests/ui/contract/shared/harness/component.ts`) →
  `tests/ui/contract/shared/harness/MountedComponent.ts`. `component.ts` is a
  harness module named after its public `component()` factory; it keeps the
  factory + `ComponentToken` interface and either re-exports `MountedComponent`
  (`export { MountedComponent } from "./MountedComponent.js"` — zero importer
  churn) or the 69 Page-object imports of
  `#tests/ui/contract/shared/harness/component` are repointed directly (plan's
  choice). After extraction, `component.ts` declares no class, so Rule B no
  longer fires on it; `MountedComponent.ts` matches. (Plain `.ts`, not
  `.testHelpers.ts` — it is harness infrastructure, not a test double.)
- `MockWebSocket` (~28 lines, in `src/app/adapters/WsAdapter.test.ts`) →
  `src/app/adapters/MockWebSocket.testHelpers.ts`, imported by the test.
- `FakeWs` (~28 lines, in `server/src/ws/wsHandler.test.ts`) →
  `server/src/ws/FakeWs.testHelpers.ts`, imported by the test.

**Inline + targeted `eslint-disable` (small / internal / nested):**
- `tests/setup/jsdom-storage.ts` — internal (non-exported) `MemoryStorage` in a
  side-effecting setup shim registered by path in vitest `setupFiles`: disable
  `rtc/class-filename-match` (renaming would misname a purpose-named module;
  extracting an internal shim class is ceremony).
- `csvExport.test.ts` — top-level `RecordingBlob` (10 lines): disable
  `rtc/class-filename-match`.
- `AnalyticsSimulator.minimalHistory.contract.test.ts` — top-level
  `SingleEntryAnalyticsStub` (8 lines): disable `rtc/class-filename-match`.
- `CreditBlotter.contract.spec.ts` — **2 nested** `RecordingBlob` (in separate
  `it()` blocks): disable `max-classes-per-file` (Rule B N/A — nested).
- `FxBlotter.contract.spec.ts` — 1 nested `RecordingBlob`: needs nothing
  (1 class, not top-level).

**e2e / harness carve-out (added 2026-06-30 after wiring the rule — the live
ESLint run surfaced 27 violators in the repo-root `tests/` tree that the
planning scan, scoped to `packages/`, missed):**
- `tests/browser/page-objects/{cypress,playwright}/**` — 20 page objects use
  framework-prefixed class names (`CypressBlotterTable` / `PlaywrightBlotterTable`)
  inside subject-named files (`BlotterTable.ts`) that mirror the shared
  `contracts/<Subject>.ts`. The `cypress/ <-> playwright/ <-> contracts/`
  filename parallelism is the whole point, so the filename intentionally matches
  the *contract*, not the *class*. This is a **systematic convention across 20
  files**, not a one-off, so — by explicit user decision — it is scoped off
  `rtc/class-filename-match` with a documented `eslint.config.mjs` block rather
  than 20 near-identical per-file disables. This is the sanctioned exception to
  the "no config carve-out" default above: a carve-out is warranted when the
  deviation is a *deliberate parallel structure*, not a scattered handful.
- `**/world.ts` — the 4 cucumber World subclasses (`PresenterWorld`,
  `PlaywrightWorld`, `FakePresenterWorld`, `VitestFakePresenterWorld`) live in
  `world.ts` by the `setWorldConstructor` framework convention, one World per
  flavor directory. Carved off the rule (filename is the cucumber idiom).
- The two remaining harness one-offs stay as **per-file disables** (Task 6):
  `tests/browser/testContext.ts` (`Scratchpad`) and
  `tests/presenter/scenarios/_await.ts` (`RealAwaitHelpers`).

**Coverage config:** add `**/*.testHelpers.ts` to the `exclude` arrays in
`packages/server/vitest.config.ts`,
`packages/client-react/vitest.app.coverage.config.ts`, and
(if a class ever lands there) `packages/domain/vitest.config.ts`.

## Testing

- **`rtc/class-filename-match`** — RuleTester matrix (`eslint-rules/
  class-filename-match.test.mjs`): top-level class matching filename (valid);
  mismatch (invalid, exact message); **non-exported** top-level class that
  mismatches (invalid — exported-ness is irrelevant);
  `<Class>.testHelpers.ts` accepted (valid);
  `<Class>.test.ts` with a mismatched top-level class (invalid); nested class
  ignored (valid); `abstract class` matching (valid); `.tsx` file (valid);
  file with no class (valid).
- **Migration proof:** full `pnpm test` + `pnpm typecheck` green;
  `pnpm lint:eslint` (incl. both new rules) + `pnpm lint:eslint:types`
  + `pnpm exec biome ci .` + `pnpm lint:dead` green.
- **CI:** the existing `test:rules` step already runs every
  `eslint-rules/**/*.test.mjs`, so the new RuleTester suite is gated with no
  workflow change.

## Implementation notes / gotchas

- **`eslint-rules/*.ts` is already in the type-aware umbrella** (added for
  newspaper-order); the new rule is `.mjs`, so nothing changes there.
- **Run `pnpm lint:eslint:types` locally** — it is a CI-only gate the standard
  `lint:eslint` does not cover (the lesson from PR #50's red round-1).
- **Named export only** for the rule module: `export const classFilenameMatch`.
- **File renames must use `git mv`** so history follows; rewrite importers in
  the same commit so no intermediate state breaks the build.
- The `MountedComponent` extraction touches the most files (69 Page objects
  import it via `#tests/ui/contract/shared/harness/component`). A re-export from
  `component.ts` keeps that at zero importer changes; a direct repoint is a
  clean alias-path find-replace. Keep it to its own task so its diff is
  reviewable in isolation.

## Out of scope (separate effort)

- **One component per file** (#3) — component-newspaper (private subcomponents
  below the exported one + filename === component name), its own brainstorm.
- Broadening filename===export-name to non-class modules (the Biome convention
  we rejected); not requested.
- Autofix for the filename rule (file moves are out of an in-file fixer's safe
  reach).
