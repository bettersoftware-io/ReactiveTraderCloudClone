# Spec Page-Object Isolation — Design

**Date:** 2026-09-01
**Status:** Approved (decisions taken in the 2026-09-01 code-quality session)
**Plan:** [`../plans/2026-09-01-spec-page-object-isolation.md`](../plans/2026-09-01-spec-page-object-isolation.md)

## Problem

The repo's test suites are bimodal about framework isolation. Two tiers are
near-perfectly isolated and gate-enforced:

- **ui-contract contract specs** (103 files): specs call `mount(Token)` and
  page-object methods only; the 94 `*Page.ts` files under
  `packages/ui-contract/src/shared/pages/` are the single place
  `@testing-library/dom` appears; only the per-framework driver trios name
  React or Solid.
- **`tests/browser` e2e** (16 + cucumber): specs call `scenarios/` verbs;
  `_context.ts` alone touches `page`; grep gates 9–11 enforce it.

Everything co-located under `packages/*/src/**` calls the testing framework
inline, because no chokepoint exists there and no doctrine was ever written
for that tier (`docs/architecture/01-overview.md:27` and
`09-test-strategy.md` state the rule only for the contract/e2e tiers):

| tier | specs | inline `screen.` | inline `fireEvent.` |
|---|---|---|---|
| `client-react-native/src/ui` (jest) | 145 | ~670 | 104 |
| `devtools-app/src/__tests__` | 22 | 257 | 124 |
| `client-react/src/ui` | 39 | ~115 | 19 |
| `client-solid/src/ui` | 33 | ~119 | 19 |
| `client-prototype/tests` | 66 | 59 | 45 |

Additionally, grep gates 9–11 (no raw `page.*` in Playwright spec bodies) are
scoped to `tests/browser/playwright/` only — `tests/fullstack/browser/`
(9 raw `page.locator/getBy`) escaped them. No gate anywhere names
`@testing-library`, `screen.`, `fireEvent`, or `userEvent`.

Cost of the status quo: specs are coupled to a runner and a query library
(jest→vitest or RNTL major bumps mean touching every spec), and they read as
*how* (`evictedLabel.closest("[data-depth]")?.querySelector(...)`) instead of
*what* (`tree.isExpandable("Evicted (2)")`).

## Decisions (taken 2026-09-01, with the user)

1. **Enforce with a custom ESLint rule**, `rtc/no-framework-calls-in-specs`,
   following the `eslint-rules/*.mjs` + `RuleTester` shape.
2. **Ledger rollout**: the rule lands at `warn` across all covered spec
   globs, feeding `docs/lint-warnings.md` (drift-gated). Each per-package
   migration PR brings its package to zero and flips that package's glob to
   `error`. New specs are held to the rule everywhere from day one.
3. **`client-prototype` is out of scope** — abandoned reference port,
   excluded exactly like it is from the memo ban (`eslint.config.mjs`
   comment: "not worth churning").
4. **Chokepoints**: page objects live under each package's `tests/**/pages/`
   directory (specs stay co-located with the source they test). The rule
   exempts, by path: `**/tests/**/pages/**`, `**/page-objects/**`,
   `**/harness/**`, `**/*.page.{ts,tsx}`, `_context.ts`, the per-framework
   driver trios (`tests/ui/contract/react/**`, `tests/ui/contract/solid/**`),
   test `setup`/`fixtures` files, and `packages/ui-contract/src/shared/**`
   (the existing sanctioned home).
5. **Playwright tiers stay grep-gated, not ESLint-gated**: extend gates 9–11's
   `paths` to `fullstack/browser/` after migrating `fullstack.spec.ts` onto
   the existing `buildPlaywrightPageObjects()`. The two visual-tier Playwright
   specs (`packages/client-*/tests/ui/visual/playwright/`) are **exempt with a
   recorded reason**: those 5 files *are* the driver layer (they iterate the
   shared scenario manifest and screenshot), not behavioural specs — there is
   no "what" above them to name.

## The rule

**Name:** `rtc/no-framework-calls-in-specs` — names the defect (framework
calls in a spec body), per the repo's name-the-prescription convention.

**Scope (files):** `**/*.{test,spec}.{ts,tsx}` in the covered packages,
minus the exempt paths above and minus `packages/client-prototype/**`.

**Flags, in spec files only:**
- `import`s from `@testing-library/*`, `@solidjs/testing-library`,
  `vitest-browser-*` (type-only imports allowed — types don't couple runtime
  behaviour).
- Member calls on the identifiers `screen`, `fireEvent`, `userEvent`.
- `.closest(...)` / `.querySelector(...)` / `.querySelectorAll(...)` calls.

**Does not flag:** `render`/`renderHook` calls themselves are *not* named —
banning the import is sufficient and keeps the rule listing small; the
bindings packages' `renderHook` specs (react-bindings/solid-bindings) have no
DOM queries and are exempted by declaring their globs out of scope until a
harness exists there (see plan Task 1's registration block).

**Message** points at the doctrine section this design adds to
`docs/architecture/09-test-strategy.md` and at the package's `pages/` dir.

## Page-object shape for the co-located tier

Same philosophy as ui-contract's pages, scaled down: a page module exports a
factory taking the render result (or nothing, reading `screen`), returning an
object of **semantic queries and actions** named for the domain, not the DOM:

```ts
// packages/devtools-app/tests/pages/NavTreePage.ts
import { fireEvent, screen } from "@testing-library/react";

export function navTreePage() {
  function nodeLabel(text: string): HTMLElement {
    return screen.getByText(text);
  }

  return {
    isExpandable(text: string): boolean {
      return (
        nodeLabel(text)
          .closest("[data-depth]")
          ?.querySelector("[aria-label='Expand'], [aria-label='Collapse']") !=
        null
      );
    },
    toggle(text: string): void {
      fireEvent.click(nodeLabel(text));
    },
  };
}
```

A spec then reads: `expect(tree.isExpandable("Evicted (2)")).toBe(false);
tree.toggle("Evicted (2)")`. The framework surface concentrates in
`tests/pages/**`, which is exactly what a future runner migration touches.

## Migration order

Smallest-first to prove the shape, biggest last:

1. **Wave A — devtools-app** (22 specs, 10 DOM-touching): build
   `packages/devtools-app/tests/pages/`, migrate, flip to `error`.
2. **Wave B — client-react + client-solid `src/ui`** (39 + 33 specs): build
   `packages/client-react/tests/ui/pages/` and the solid mirror; the two
   sides share spec *shapes* (ported files), so page objects port nearly
   verbatim like the CSS modules did. Flip each to `error`.
3. **Wave C — client-react-native** (145 specs, ~670 calls): batch by domain
   (rates, blotter, equities, shell, analytics, credit, jarvis, theme…),
   one PR per batch, `tests/pages/` in the RN package. Flip to `error` last.
4. **Wave D — Playwright gate scope**: migrate `tests/fullstack/browser/fullstack.spec.ts`
   onto `buildPlaywrightPageObjects()` + extend gates 9–11 paths.

## Non-goals

- Rewriting what the specs assert. Migration is mechanical extraction; every
  spec keeps its exact assertions and coverage (the ≥95% gates and per-file
  coverage report are the witnesses).
- Merging the co-located tier into ui-contract. Different purpose: contract
  specs are framework-neutral behaviour; co-located specs may legitimately
  test framework-specific glue.
- Touching `client-prototype`.

## Risks

- **~240 files of churn.** Mitigated by ledger rollout (no red CI at any
  point), per-domain batching, and zero-assertion-change discipline.
- **Page objects rot into dumping grounds.** Mitigated by the same rule that
  governs ui-contract pages: one page module per component/screen, named
  `<Thing>Page.ts`.
- **RN's jest vs vitest split**: pages under `tests/pages/` are imported by
  jest specs; keep them dependency-light (`@testing-library/react-native`
  only) so both runners could consume them later.
