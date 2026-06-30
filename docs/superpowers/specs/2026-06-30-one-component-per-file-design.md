# One component per file (component-newspaper) — design

**Date:** 2026-06-30
**Status:** Approved (brainstorm)

## Problem

We want each `.tsx` module to expose exactly **one** React component, with any
private subcomponents co-located but ordered **below** the exported one
("newspaper order" — the lede on top), and the filename matching the exported
component. This is effort #3 of the three-rule lint workstream (newspaper-order
for tests #1 / PR #50; one-class-per-file #2 / PR #53). It formalizes a
convention the codebase already follows ~99%: one PascalCase component per
file, filename === component name.

The one place the codebase deviates is **ordering**: ~10 component files place
their private subcomponent(s) *above* the exported component (bottom-up
ordering), and one file (`TilePrice.tsx`) exports two components.

## Decisions (from brainstorm)

- **One cohesive custom rule `rtc/component-newspaper`** in `eslint-rules/`
  (reuses the RuleTester + root-vitest infra and the `newspaper-order` fixer
  pattern). Chosen over three thin parallel rules (the three facets all depend
  on the same "which declarations are components, which is exported" analysis —
  computing it once is simpler and less error-prone) and over
  `eslint-plugin-react`'s `no-multi-comp` (not a dependency; and it cannot
  express "private subcomponents allowed but below the export" — it flags *all*
  multiple components).
- **TilePrice.tsx → extract `SpreadDisplay.tsx`** (user decision). It exports
  both `TilePrice` and `SpreadDisplay`, and `SpreadDisplay` is genuinely a
  first-class component (used externally by `Tile.tsx`, with its own
  `SpreadDisplayPage` page object + visual/contract coverage), so it earns its
  own file rather than a co-location exception.
- **Full newspaper ordering** (user decision): the exported component is the
  lede (first declaration after imports); private subcomponents, helper
  functions, types, and consts all sit below it. **Verified TDZ-safe** — see
  the safety section.

## Rule behavior (`rtc/component-newspaper`)

Fires on `client-react/src` `.tsx` files (test files excluded — see Scope).

**Component detection.** A *component* is a top-level declaration whose name is
**PascalCase** and which is a React component: a `function` declaration or an
arrow/function `const` that returns JSX / `ReactElement`, including
`memo(...)` / `forwardRef(...)`-wrapped forms. Explicitly **not** components
(and therefore ignored / treated as movable preamble-or-helper): PascalCase
consts that are not components (e.g. `SECTOR_MAP` object literals), `useX`
hooks, plain helper functions, types/interfaces.

**Facet 1 — one exported component per file.** If a file exports two or more
components, the rule reports the second and subsequent ones: *"A file may export
only one component; extract '<Name>' into its own '<Name>.tsx'."* **Not
autofixable** (a cross-file move is beyond a safe in-file fixer). Only
`TilePrice.tsx` currently trips this.

**Facet 2 — the exported component is the lede.** The single exported component
must be the **first declaration after the import block**. Every other top-level
declaration — private subcomponents, helper functions, types, consts — must
appear **below** it. **Autofixable**: reuses the `newspaper-order` fixer pattern
(cut the exported component's node, re-append it directly after imports / move
the trailing declarations below it; Biome normalizes spacing). Report:
*"The exported component '<Name>' must be the first declaration (newspaper
order): private subcomponents and helpers belong below it."*

**Facet 3 — filename === exported component name.** The exported component's
name must equal the filename's first dot-segment (`SectorHeatmap.tsx` →
`SectorHeatmap`). **0 current violations** — pure regression guard. **Not
autofixable** (a file rename). Folds in for free since the rule has already
identified the single exported component.

## TDZ / hoisting safety (full newspaper is safe — empirically verified)

Moving the exported component above the consts/types/private-components it
references is safe because:

- A React component (whether `function Foo()` or `const Foo = () => …`) does not
  execute its body at **module-evaluation** time — only when React **renders**
  it. By render time the module has finished top-to-bottom evaluation and every
  module-level `const` is initialized. So a direct `SECTOR_MAP` reference inside
  the exported component body is fine even with `const SECTOR_MAP` *below* the
  component. The TDZ only bites a reference that fires during module evaluation.
- Private subcomponents are `function` declarations (hoisted) or arrow consts
  referenced only from the lede's JSX (render-time) — safe below the export.
- Types are compile-time — order-independent.
- The only shape that *would* break is a module-level statement that **executes
  at load time** and references a symbol declared later (almost always a `const`
  whose initializer reads another `const`). The fixer therefore **preserves the
  relative order of module-level `const`/`let`** and **refuses to cross a
  load-time const→later-symbol dependency**, flagging instead of producing an
  unsafe reorder. None of the 11 target files contain such a dependency
  (`SECTOR_MAP`/`DEFAULT_SECTOR` etc. are plain literals).

**Empirical confirmation (2026-06-30):** a worst-case probe — the exported
`SectorHeatmap`-shaped component placed first, referencing two consts and a
private subcomponent all declared below it — was run through the real repo
config. **Biome `noInvalidUseBeforeDeclaration` (in the `recommended` preset):
clean. ESLint: no `no-use-before-define`** (not configured; not type-aware); the
only findings were cosmetic formatting from the hand-written probe. No other
lint rule breaks on the reordering, so constants do **not** need to be hoisted
into separate files.

## Scope

- **Applies to:** `packages/client-react/src/**/*.tsx`.
- **Excludes:** `**/*.{test,spec}.tsx`. Test `.tsx` files may define throwaway
  harness components and are already governed by the test-scoped
  `rtc/newspaper-order` rule; excluding them avoids double-governance and false
  fires.
- **Wiring:** add `"component-newspaper": componentNewspaper` to the shared
  `rtcPlugin` object in `eslint.config.mjs` and a new config block scoped to the
  glob above. `rtc/newspaper-order` stays test-scoped; `rtc/class-filename-match`
  is class-only (no overlap); `func-style` is satisfied (components are function
  declarations).

## Migration inventory

> **SCOPE DECISION (2026-06-30): Option B — strict full-newspaper.** During
> execution the live rule exposed a contradiction in this spec: the prose below
> said "private subcomponents, helper functions, types, and consts all sit
> below" the export (strict — the export is the ABSOLUTE first declaration),
> but the "Reorder (11)" list assumed only files with a private *component*
> above the export violate (component-only). The two interpretations diverge
> sharply: strict flags **66** files, component-only flags **11**. The user
> chose **strict full-newspaper** — every `Props` interface, type, and const
> moves below the exported component. The 11-file list below is therefore a
> *subset*; the real migration autofixes ALL ~66 `notLede` violators (count
> measured after merging the latest `origin/main`). The autofix is
> count-agnostic (`eslint --fix` on the glob), TDZ-safe by construction, and
> comment-preserving (verified zero-loss across all 66).

**Split (1, manual):**
- `packages/client-react/src/ui/fx/liveRates/tile/TilePrice.tsx` exports
  `TilePrice` + `SpreadDisplay` → extract `SpreadDisplay.tsx` (move the
  `SpreadDisplay` component + its `SpreadDisplayProps` type); repoint the import
  in `tile/Tile.tsx` (`import { SpreadDisplay, TilePrice } from "./TilePrice"` →
  separate imports). After the split `TilePrice.tsx` still needs the reorder
  below (private `PriceButton` moves under `TilePrice`).

**Reorder (11, autofix via `eslint --fix`):** every multi-component file
currently has its private subcomponent(s) above the export:
`App.tsx` (`WorkspaceEngine`), `admin/AdminDashboard.tsx` (`Card`),
`admin/MetricGauges.tsx`, `credit/rfqTiles/RfqTilesPanel.tsx`,
`credit/sellSide/SellSidePanel.tsx` (`SellSideRfqRow`),
`equities/chart/DepthLadder.tsx`,
`equities/watchlist/SectorHeatmap.tsx` (`HeatCell` + `SECTOR_MAP`/`DEFAULT_SECTOR`),
`equities/watchlist/Watchlist.tsx`,
`fx/liveRates/tile/TileConfirmation.tsx`,
`fx/liveRates/tile/TilePrice.tsx` (`PriceButton`),
`shell/layout/engine/InhouseLayoutEngine.tsx` (`SplitNode`).

**Filename renames:** none (0 violations).

## Behaviour / goldens safety

Reordering declarations within a file produces **byte-identical render output**,
and the `SpreadDisplay` extraction changes only an import path — so the visual
goldens (both committed sets: `react/` x86 and `react-local/<arch>`) and the UI
contract tests are **unaffected**. The migration must land with **zero changed
golden files**; any golden movement signals a non-behaviour-preserving change
and must be investigated, not regenerated. This mirrors the one-class-per-file
splits, which were verified byte-identical.

## Testing

- **`rtc/component-newspaper`** — RuleTester matrix
  (`eslint-rules/component-newspaper.test.mjs`):
  - *valid:* single exported component as lede with private subcomponents /
    consts / types below; lone-component file; `memo`/`forwardRef`-wrapped
    export as lede; non-component PascalCase const ignored; `useX` hook ignored;
    file with no component ignored.
  - *invalid:* private component above the export (assert autofix output moves
    the export to the lede); two exported components (error on the second, **not**
    fixed); a type/helper declaration above the export (reordered below);
    filename mismatch (error, not fixed).
  - *TDZ guard:* a load-time `const`→later-`const` dependency arranged so the
    naive reorder would be unsafe — assert the fixer refuses (flags, no unsafe
    autofix).
- **Migration proof:** full `pnpm test` + `pnpm typecheck` green;
  `pnpm lint:eslint` + `pnpm lint:eslint:types` + `pnpm exec biome ci .` +
  `pnpm lint:dead` + `pnpm test:rules` green; **UI contract coverage ≥95%**
  (`test:ui:contract:coverage`); **visual tiers green with ZERO changed golden
  files**.
- **CI:** the existing `test:rules` step auto-gates the new RuleTester suite
  (`eslint-rules/**/*.test.mjs`); no workflow change.

## Implementation notes / gotchas

- **Named export only** for the rule module: `export const componentNewspaper`
  in `eslint-rules/component-newspaper.mjs` (`.mjs` to escape the TS-only ESLint
  block + Biome `useExplicitType`).
- **Run `pnpm lint:eslint:types` locally** — a CI-only gate the standard
  `lint:eslint` does not cover.
- **Component detection is the main rule-complexity risk.** Detection walks the
  declaration for a PascalCase name + a JSX/`ReactElement` return (or a
  `memo`/`forwardRef` call wrapping such). The RuleTester matrix above pins the
  edge cases (non-component PascalCase const, hook, wrapper forms).
- **Autofix preserves `const`/`let` relative order** and never crosses a
  load-time dependency (the TDZ invariant). The fixer only hoists the single
  exported component to the lede position; trailing declarations keep their
  mutual order.
- **`git mv` not needed** for the reorders (in-file). The `SpreadDisplay`
  extraction creates a new file + edits two importers in one commit so no
  intermediate state breaks the build.

## Out of scope (separate effort / not requested)

- Broadening component-newspaper to non-`.tsx` or to `mobile` (React Native)
  — that package is still planned, not built.
- Enforcing ordering *within* the private-subcomponent group (only the
  export-is-lede boundary is enforced; private components keep their order).
- Any change to the existing `rtc/newspaper-order` (tests) or
  `rtc/class-filename-match` (classes) rules.
