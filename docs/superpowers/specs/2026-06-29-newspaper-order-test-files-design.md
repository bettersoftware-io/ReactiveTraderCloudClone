# Newspaper-order for test files — custom ESLint rule design

**Date:** 2026-06-29
**Status:** Approved (brainstorm)

## Problem

Test files read "upside down": helper factories and type aliases sit at the
top, pushing the actual `describe`/`it` blocks far down the file (e.g.
`RfqsPresenter.test.ts` — helpers on lines 17–59, first `describe` on line 61).
We want **newspaper style**: the most important thing (the tests) at the top,
right after imports and constants; the secondary scaffolding (types and helper
functions) at the bottom.

~81 of 206 test files currently have a helper/type above the first `describe`.

## Decisions (from brainstorm)

- **Custom, autofixable ESLint rule** `rtc/newspaper-order`. Nothing off-the-
  shelf fits: `@typescript-eslint/member-ordering` is class-members only; Biome
  has no statement-ordering rule and its GritQL plugins can't express positional
  ordering or autofix.
- **Autofix migrates the ~81 files** mechanically; behavior is preserved because
  function declarations hoist (verified: no `no-use-before-define` in either
  config; Biome's `noInvalidUseBeforeDeclaration` exempts function declarations
  and types) and the repo already enforces `func-style: declaration`.
- **Scope: all test files** — `**/*.{spec,test}.{ts,tsx}`. This glob covers
  `*.contract.spec.ts`; contract specs are **included** (reordering is cosmetic
  and behavior-preserving, so the React→Solid portability contract is intact).
- **Move types + functions (+ vi.mock) only.** Constants stay on top but a const
  appearing after tests is NOT policed.

## Classification (Program-body top-level statements)

**Secondary → must sit below all tests (autofix moves them):**
- `FunctionDeclaration` — whether or not `export`ed (hoisting applies either
  way; no test file currently exports anything, so the export case is academic).
- `TSTypeAliasDeclaration`, `TSInterfaceDeclaration` (pure compile-time, erased).
- Top-level `vi.mock(...)` / `vi.unmock(...)` expression statements — vitest's
  transform hoists these to the top of the file regardless of source position
  (confirmed behavior for vitest `^4`), so bottom placement is purely cosmetic
  and safe.

**Neutral → never moved, never flagged:**
- Imports; `const`/`let` constants.
- `class` — **not hoisted** (TDZ); the 4 test-double classes (`FakeWs`,
  `MockWebSocket`, `SingleEntryAnalyticsStub`, `RecordingBlob`) stay where the
  author put them. Accepted trade-off: a test-double class may remain above the
  tests. (A future "one class per file" effort may relocate these; out of scope
  here.)
- `enum` — runtime, non-hoisted (none exist in test files anyway).
- `vi.doMock` / `vi.hoisted` — the deliberately *non*-hoisted vitest APIs; must
  stay where written.
- The test statements themselves.

**Primary (defines the boundary):**
- `describe` / `it` / `test` / `suite` calls incl. member forms
  (`.each` / `.only` / `.skip`).
- `beforeEach` / `afterEach` / `beforeAll` / `afterAll`.

## Rule behavior

- **Violation:** a Secondary declaration that has any Primary statement *after*
  it (i.e. a helper/type/vi.mock appearing before a test).
- **Report:** once per file, on the first offending Secondary node:
  *"Newspaper order: move type/helper declarations below the tests (N found)."*
- **Fix (single, deterministic):** relocate every offending Secondary node — in
  original relative order, each carrying its leading comments — to the end of the
  file. Blank-line spacing is left crude on purpose: the existing
  `padding-line-between-statements` ESLint rule and the Biome formatter normalize
  it on the following pass.

### Implementation notes

- **Home:** `eslint-rules/newspaper-order.mjs` exporting `{ meta, create }` with
  `meta.fixable: "code"`. Registered in `eslint.config.mjs` in a new block
  `files: ["**/*.{spec,test}.{ts,tsx}"]` via
  `plugins: { rtc: { rules: { "newspaper-order": rule } } }` and
  `"rtc/newspaper-order": "error"`.
- **Comment attachment** is the main risk: a JSDoc above a helper must travel
  with it. Extend each moved node's start to include `sourceCode
  .getCommentsBefore(node)`. Pinned by `RuleTester` `output` assertions.
- **Single fix, not per-node:** reporting once with one consolidated fixer keeps
  the relocation deterministic and order-preserving in a single pass (avoids
  ESLint multi-pass fix conflicts from same-point insertions).

## Testing (TDD)

Write `eslint-rules/newspaper-order.test.mjs` **first**, using ESLint's
`RuleTester` driven by vitest (`RuleTester.it = it`, etc.):
- **valid:** helpers/types already below the tests; a `class` left in place; a
  const after a test (not policed); an empty/typeless file.
- **invalid:** helper before `describe` → assert exact `output`; type before
  test; `vi.mock` before test moved down; `vi.doMock` left in place; a helper
  with a leading JSDoc comment (comment travels).

**Test home:** there is no root vitest (`pnpm test` = `turbo run test` per
package). Add a minimal root `vitest.config.ts` (project scoped to
`eslint-rules/**/*.test.mjs`) and a root `test:rules` script, gated in CI.

## Migration & verification

1. Implement the rule (RuleTester green).
2. Run `pnpm lint:eslint --fix` (or `eslint . --fix`) to auto-migrate the ~81
   files.
3. Prove behavior preserved: `pnpm test` green (all packages), `pnpm typecheck`
   green (types hoist for checking).
4. `pnpm lint:eslint` + Biome clean after the move.
5. Ship rule + migration in one PR; CI gates.

## Out of scope (separate efforts)

- **One class per file + filename === class name** (#2) — ESLint core
  `max-classes-per-file` + Biome `useFilenamingConvention`. Small migration
  (1 multi-class file, 1 filename outlier).
- **One component per file** (#3) — preferred direction: *extend newspaper style
  to components* (private non-exported subcomponents stay co-located but move
  **below** the exported component; Biome `useFilenamingConvention` enforces
  filename === exported component name). Fall back to strict one-component-per-
  file (`eslint-plugin-react` `no-multi-comp`, a new dep) if the
  move-below-export variant proves infeasible. Its own brainstorm.
- Constants ordering (a const after tests is not policed).
- Moving `class` / `enum` (non-hoisted runtime semantics).
