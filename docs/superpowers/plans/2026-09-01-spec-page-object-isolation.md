# Spec Page-Object Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concentrate every testing-framework call in the co-located test tiers behind page objects — specs speak semantic verbs (`tree.isExpandable("Evicted (2)")`), pages own `screen`/`fireEvent`/`querySelector` — enforced by a new `rtc/no-framework-calls-in-specs` rule rolled out warn→ledger→per-package-error.

**Architecture:** See the spec. One custom ESLint rule + per-package `tests/**/pages/` chokepoints, migrated in four waves (devtools-app → web src/ui pair → RN → Playwright gate-scope extension). The ledger (`docs/lint-warnings.md`) absorbs the interim backlog so CI is never red; each wave's PR flips its package to `error`.

**Tech Stack:** ESLint flat config + `RuleTester`/vitest (`pnpm test:rules`), lint-warnings ledger (`pnpm sync:lint-warnings` / `check:lint-warnings-drift`), grep gates (`tests/scripts/grep-gates.ts`), `@testing-library/*` confined to page modules.

**Spec:** `docs/superpowers/specs/2026-09-01-spec-page-object-isolation-design.md` — read it first; decisions (ledger rollout, client-prototype excluded, visual-tier Playwright specs exempt-with-reason, pages under `tests/**/pages/`) are fixed there.

## Global Constraints

- Worktree + PR per task; shipping-repo-changes rules; run `pnpm lint:eslint && pnpm test:rules && npx biome ci .` plus the touched package's suite before each push.
- **Zero assertion changes** in any migrated spec — extraction only. Coverage gates (≥95% ui:contract, devtools ≥95%) and per-file `pnpm coverage:gaps` are the witnesses that nothing was dropped.
- Page modules are the ONLY test files allowed to import `@testing-library/*`; they are named `<Thing>Page.ts` under `tests/**/pages/` (exempt paths listed in Task 1's registration block — keep the rule's exemptions and this sentence in sync).
- `client-prototype` stays untouched.
- Warnings flow through the ledger: after any warn-severity change, `pnpm sync:lint-warnings` and commit `docs/lint-warnings.md`.

---

### Task 1: The rule, tests, warn-severity registration, doctrine

**Files:**
- Create: `eslint-rules/no-framework-calls-in-specs.mjs`
- Create: `eslint-rules/no-framework-calls-in-specs.test.mjs`
- Modify: `eslint.config.mjs` (import ~line 8; `rtcPlugin` map ~line 96; new block near the `rtc/newspaper-order` test-file block ~line 339)
- Modify: `docs/architecture/09-test-strategy.md` (doctrine section)
- Modify: `docs/lint-warnings.md` (regenerated — the initial backlog lands here)

**Interfaces:**
- Produces: named export `noFrameworkCallsInSpecs`; messageIds `bannedImport`, `bannedGlobal`, `bannedDomQuery`. Waves 2–4 only edit severity/globs and migrate files.

- [ ] **Step 1: Write the failing rule test**

`eslint-rules/no-framework-calls-in-specs.test.mjs` (harness identical to `no-render-functions.test.mjs` — parser, `RuleTester` wiring):

```js
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

import { noFrameworkCallsInSpecs } from "./no-framework-calls-in-specs.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2023,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("no-framework-calls-in-specs", noFrameworkCallsInSpecs, {
  valid: [
    {
      name: "page-object import + semantic calls only",
      code: 'import { navTreePage } from "../pages/NavTreePage";\nconst tree = navTreePage();\ntree.toggle("Evicted (2)");\n',
    },
    {
      name: "type-only testing-library import is legal",
      code: 'import type { RenderResult } from "@testing-library/react";\n',
    },
    {
      name: "vitest itself is not banned",
      code: 'import { describe, expect, it } from "vitest";\n',
    },
    {
      name: "a local object named screen-like is not the RTL screen",
      code: "const screens = { lock: 1 };\nconst n = screens.lock;\n",
    },
  ],
  invalid: [
    {
      name: "runtime testing-library import",
      code: 'import { fireEvent, screen } from "@testing-library/react";\n',
      errors: [{ messageId: "bannedImport" }],
    },
    {
      name: "solid testing-library import",
      code: 'import { render } from "@solidjs/testing-library";\n',
      errors: [{ messageId: "bannedImport" }],
    },
    {
      name: "screen member call",
      code: 'screen.getByText("Evicted (2)");\n',
      errors: [{ messageId: "bannedGlobal" }],
    },
    {
      name: "fireEvent member call",
      code: "fireEvent.click(el);\n",
      errors: [{ messageId: "bannedGlobal" }],
    },
    {
      name: "closest/querySelector chain",
      code: 'label.closest("[data-depth]")?.querySelector("[aria-label]");\n',
      errors: [{ messageId: "bannedDomQuery" }, { messageId: "bannedDomQuery" }],
    },
  ],
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:rules -- no-framework-calls-in-specs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the rule**

`eslint-rules/no-framework-calls-in-specs.mjs`:

```js
// rtc/no-framework-calls-in-specs — a spec states WHAT, a page object knows
// HOW. Testing-framework surface (testing-library imports, screen/fireEvent/
// userEvent, raw DOM queries) is confined to page modules under
// tests/**/pages/ (and the other chokepoints exempted in eslint.config.mjs),
// so specs read as semantic verbs and a runner/query-library migration
// touches pages, not every spec. Doctrine:
// docs/architecture/09-test-strategy.md §"Page objects in the co-located
// tier"; design:
// docs/superpowers/specs/2026-09-01-spec-page-object-isolation-design.md.
//
// Deliberately NOT flagged:
// - Type-only imports (importKind === "type") — types don't couple runtime
//   behaviour to a library.
// - `render(...)` by name — banning the imports is sufficient; a page module
//   re-exporting a mount helper is the sanctioned path.
// - Playwright's `page` — the Playwright tiers are governed by grep gates
//   9–11 instead (this rule runs on the vitest/jest co-located tiers).

const BANNED_IMPORT = [
  /^@testing-library\//,
  /^@solidjs\/testing-library$/,
  /^vitest-browser-/,
];

const BANNED_GLOBAL = new Set(["screen", "fireEvent", "userEvent"]);

const BANNED_DOM_QUERY = new Set([
  "closest",
  "querySelector",
  "querySelectorAll",
]);

export const noFrameworkCallsInSpecs = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "specs call page objects; testing-framework surface lives in tests/**/pages/",
    },
    schema: [],
    messages: {
      bannedImport:
        "Specs must not import {{source}} — move the framework surface into a page module (tests/**/pages/<Thing>Page.ts) and call its semantic methods.",
      bannedGlobal:
        "Specs must not call {{object}}.* — express this as a page-object method (what, not how).",
      bannedDomQuery:
        "Raw DOM traversal ({{method}}) belongs inside a page object, behind a semantically named method.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") {
          return;
        }

        const source = node.source.value;

        if (BANNED_IMPORT.some((re) => re.test(source))) {
          context.report({
            node,
            messageId: "bannedImport",
            data: { source },
          });
        }
      },
      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          BANNED_GLOBAL.has(node.object.name)
        ) {
          context.report({
            node,
            messageId: "bannedGlobal",
            data: { object: node.object.name },
          });
        }
      },
      CallExpression(node) {
        const callee = node.callee;

        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          BANNED_DOM_QUERY.has(callee.property.name)
        ) {
          context.report({
            node,
            messageId: "bannedDomQuery",
            data: { method: callee.property.name },
          });
        }
      },
    };
  },
};
```

Note the `MemberExpression` visitor double-reports `screen.getByText(…)` sites… it does not: `screen.getByText` is one MemberExpression (one report); the call's callee is that same node — `CallExpression` only reports `BANNED_DOM_QUERY` names, which don't overlap `BANNED_GLOBAL` methods. The optional-chain form (`?.querySelector`) arrives as `CallExpression` with `optional: true` and the same callee shape — covered.

- [ ] **Step 4: Run rule tests to green**

Run: `pnpm test:rules -- no-framework-calls-in-specs` → PASS.

- [ ] **Step 5: Register at warn across the covered spec globs**

In `eslint.config.mjs` (import + `rtcPlugin` map as usual), add:

```js
  {
    // Specs speak page objects; framework surface lives in the chokepoints
    // ignored below. WARN while the backlog burns down through the
    // lint-warnings ledger; each migrated package is flipped to error by a
    // dedicated block (see the per-package blocks that follow this one).
    // client-prototype is out of scope (abandoned reference port), and the
    // bindings packages' renderHook specs stay out until a harness exists
    // for them.
    files: [
      "packages/client-react/src/**/*.{test,spec}.{ts,tsx}",
      "packages/client-react/tests/**/*.{test,spec}.{ts,tsx}",
      "packages/client-solid/src/**/*.{test,spec}.{ts,tsx}",
      "packages/client-solid/tests/**/*.{test,spec}.{ts,tsx}",
      "packages/client-react-native/src/**/*.{test,spec}.{ts,tsx}",
      "packages/client-react-native/tests/**/*.{test,spec}.{ts,tsx}",
      "packages/devtools-app/src/**/*.{test,spec}.{ts,tsx}",
    ],
    ignores: [
      "**/tests/**/pages/**",
      "**/page-objects/**",
      "**/harness/**",
      "**/*.page.{ts,tsx}",
      "**/tests/ui/contract/react/**",
      "**/tests/ui/contract/solid/**",
      "**/tests/ui/visual/**", // the visual specs ARE the driver layer (spec §Decisions 5)
      "**/setup/**",
      "**/*fixtures*",
      "**/*.testHelpers.*",
    ],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/no-framework-calls-in-specs": "warn" },
  },
```

- [ ] **Step 6: Baseline the ledger**

Run: `pnpm lint:eslint` (must exit 0 — warnings don't fail it; if it treats warnings as errors via `--max-warnings`, check how `lint:eslint` is invoked in CI and adjust expectations BEFORE landing), then `pnpm sync:lint-warnings` and commit the regenerated `docs/lint-warnings.md` (expect roughly: RN ~770+, devtools-app ~380, react ~130, solid ~140 entries — the audit's counts).

- [ ] **Step 7: Doctrine section in §9**

Append to `docs/architecture/09-test-strategy.md` (near the sociable-RTL tier description):

```markdown
### Page objects in the co-located tier

The isolation rule stated for the contract and e2e tiers ("specs do not
import React, RxJS, or Playwright internals") applies to the co-located
`src/**` unit tier too, enforced by `rtc/no-framework-calls-in-specs`:
specs call semantic methods on page modules under the package's
`tests/**/pages/`; those modules are the only test files importing
`@testing-library/*`. Rollout state and per-package backlog:
[`docs/lint-warnings.md`](../lint-warnings.md). Design:
[page-object isolation spec](../superpowers/specs/2026-09-01-spec-page-object-isolation-design.md).
```

- [ ] **Step 8: Verify + commit + ship**

Run: `pnpm test:rules && pnpm lint:eslint && pnpm check:lint-warnings-drift && pnpm check:doc-links && npx biome ci .` → all green.

```bash
git add eslint-rules/no-framework-calls-in-specs.mjs eslint-rules/no-framework-calls-in-specs.test.mjs eslint.config.mjs docs/lint-warnings.md docs/architecture/09-test-strategy.md
git commit -m "lint: rtc/no-framework-calls-in-specs at warn + ledger baseline + tier doctrine"
```

Push, PR, CI loop, merge.

### Task 2: Wave A — devtools-app (22 specs → pages, flip to error)

**Files:**
- Create: `packages/devtools-app/tests/pages/` — expect roughly one page per DOM-touching spec: `NavTreePage.ts`, `StateTabPage.ts`, `InspectorAppPage.ts`, `TimelinePanePage.ts`, plus what Step 1's inventory finds (10 of 22 specs touch the DOM; the other 12 are pure and need nothing).
- Modify: the 10 DOM-touching specs under `packages/devtools-app/src/__tests__/`
- Modify: `eslint.config.mjs` (per-package error block)
- Modify: `docs/lint-warnings.md` (regenerated)

**Interfaces:**
- Consumes: `rtc/no-framework-calls-in-specs` (Task 1).
- Produces: the page-module pattern Waves B/C copy. Page factory shape: `export function navTreePage() { return { isExpandable(text: string): boolean, toggle(text: string): void, … } }` — semantic queries/actions, TL inside.

- [ ] **Step 1: Inventory**

Run: `pnpm lint:eslint 2>&1 | grep "no-framework-calls-in-specs" | grep devtools-app | cut -d: -f1 | sort -u`
Expected: the 10 DOM-touching specs (`InspectorApp.test.tsx` is the worst at 134 hits).

- [ ] **Step 2: Build pages + migrate, one spec at a time**

Worked example (the exact NavTree case from the audit):

```ts
// packages/devtools-app/tests/pages/NavTreePage.ts
import { fireEvent, screen } from "@testing-library/react";

export function navTreePage() {
  function labelNode(text: string): HTMLElement {
    return screen.getByText(text);
  }

  return {
    isExpandable(text: string): boolean {
      return (
        labelNode(text)
          .closest("[data-depth]")
          ?.querySelector("[aria-label='Expand'], [aria-label='Collapse']") !=
        null
      );
    },
    toggle(text: string): void {
      fireEvent.click(labelNode(text));
    },
  };
}
```

```tsx
// in NavTree.test.tsx — before
const evictedLabel = screen.getByText("Evicted (2)");
expect(
  evictedLabel.closest("[data-depth]")?.querySelector("[aria-label='Expand'], [aria-label='Collapse']"),
).toBeNull();
fireEvent.click(evictedLabel);

// after
const tree = navTreePage();
expect(tree.isExpandable("Evicted (2)")).toBe(false);
tree.toggle("Evicted (2)");
```

Rendering stays in the spec via a page-exported mount helper when the spec
currently calls `render(<StateTab …/>)` directly: give the page module a
`mountStateTab(props)` that wraps `render`, so the spec keeps naming its
input props but not the library. Assertion semantics must not change
(`toBeNull()` → `toBe(false)` above is the allowed shape-change: the page
method defines the truthiness contract; the *fact asserted* is identical).

jest vs vitest note: devtools-app is vitest; pages import from
`@testing-library/react` exactly as the specs did.

- [ ] **Step 3: Flip devtools-app to error**

Add after Task 1's warn block:

```js
  {
    files: ["packages/devtools-app/src/**/*.{test,spec}.{ts,tsx}"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/no-framework-calls-in-specs": "error" },
  },
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @rtc/devtools-app test:coverage` → green AND coverage still ≥95% (the CI gate; pages count as test code, not covered source). `pnpm lint:eslint` → 0 errors. `pnpm sync:lint-warnings` → devtools-app entries gone; commit ledger.

- [ ] **Step 5: Commit + ship**

```bash
git add packages/devtools-app eslint.config.mjs docs/lint-warnings.md
git commit -m "test(devtools-app): specs speak page objects; no-framework-calls-in-specs → error"
```

Push, PR, CI loop, merge.

### Task 3: Wave B — client-react + client-solid src/ui (39 + 33 specs)

**Files:**
- Create: `packages/client-react/tests/ui/pages/` and `packages/client-solid/tests/ui/pages/`
- Modify: the ~22 (react) + ~18 (solid) leaky specs under each `src/ui/**`
- Modify: `eslint.config.mjs` (two per-package error blocks, same shape as Wave A's)
- Modify: `docs/lint-warnings.md`

**Interfaces:**
- Consumes: the Wave-A page shape.
- Produces: paired page modules — the two clients' co-located specs are ports of each other, so author the react page first, port to solid (`@solidjs/testing-library` inside, identical method surface), exactly as the CSS-modules port worked.

- [ ] **Step 1: Inventory both packages** (same grep as Wave A per package).

- [ ] **Step 2: Migrate react, then port pages to solid**

Same recipe as Wave A Step 2. The 8 react files with ad-hoc local `render*`
helpers: hoist each helper into the page module (it already is one, just
misplaced). Keep spec-to-page naming 1:1 (`Tile.test.tsx` ↔ `TilePage.ts`).

- [ ] **Step 3: Flip both packages to error; verify**

Run per package: `pnpm --filter @rtc/client-react test` / `--filter @rtc/client-solid test` → green; ui:contract coverage gates unaffected (contract tier untouched); `pnpm lint:eslint` → 0 errors; ledger re-synced + committed.

- [ ] **Step 4: Commit + ship** (one PR per package — a reviewer can reject the solid port while approving react):

```bash
git commit -m "test(client-react): co-located specs speak page objects; rule → error"
git commit -m "test(client-solid): co-located specs speak page objects; rule → error"
```

### Task 4: Wave C — client-react-native (145 specs, ~670 calls)

**Files:**
- Create: `packages/client-react-native/tests/pages/` (one page per screen/component under test; expect ~40 modules)
- Modify: specs under `packages/client-react-native/src/**` in domain batches
- Modify: `eslint.config.mjs` (error block, last)
- Modify: `docs/lint-warnings.md` per batch

- [ ] **Step 1: Batch by domain**

One PR per batch, in this order (roughly ascending coupling): `theme` + `ambient`, `rates`, `blotter`, `analytics`, `equities`, `credit`, `shell` (boot/lock/hud), `jarvis` + remaining. Inventory per batch: `pnpm lint:eslint 2>&1 | grep "no-framework-calls-in-specs" | grep "src/ui/<domain>"`.

- [ ] **Step 2: Migrate each batch**

Wave-A recipe with the RN library inside pages (`@testing-library/react-native`; `fireEvent.press`, `getByTestId`). The 20 file-local `renderScreen` helpers hoist into their page modules. Keep pages importable by jest (they are `.ts` under `tests/pages/` — confirm jest's `testMatch` (`**/*.test.tsx`) does NOT match them, so they are plain modules; no config change needed).

- [ ] **Step 3: Per batch: verify + ship**

`pnpm --filter @rtc/client-react-native test` (both runners) green; ledger synced; PR per batch. After the last batch: flip RN to error (same block shape), final ledger sync should show the rule at 0 entries.

### Task 5: Wave D — Playwright gate-scope extension

**Files:**
- Modify: `tests/fullstack/browser/fullstack.spec.ts` (9 raw `page.locator/getBy` → existing POs via `buildPlaywrightPageObjects()`; import `_context`-equivalent wiring from the native suite — copy the pattern in `tests/browser/playwright/_context.ts`)
- Modify: `tests/scripts/grep-gates.ts` (gates 9–11: add `"fullstack/browser/"` to each `paths` array)
- Modify: `docs/architecture/12-architectural-gates.md` (scope note)

- [ ] **Step 1: Migrate the fullstack spec onto the existing page objects**, keeping its assertions identical (it is 1 file; the scenarios verbs in `tests/browser/scenarios/` likely already cover its actions — reuse before writing new ones).

- [ ] **Step 2: Extend gates 9–11 paths**; run `pnpm --filter tests gates` → green.

- [ ] **Step 3: Record the visual-tier exemption** in `docs/architecture/12-architectural-gates.md`: gates 9–11 deliberately exclude `packages/client-*/tests/ui/visual/playwright/` — those specs are the driver layer (spec §Decisions 5).

- [ ] **Step 4: Verify + ship**

`pnpm test:e2e` (runs the gates + suites) → green. Commit, PR, CI loop, merge.

```bash
git commit -m "test(fullstack): raw page.* → page objects; gates 9-11 cover fullstack/browser"
```
