# One Component Per File (component-newspaper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one exported React component per `.tsx` file, with the exported component as the "newspaper" lede (private subcomponents/helpers/types below it) and the filename matching the component, via a new custom rule `rtc/component-newspaper`, then migrate the violators.

**Architecture:** A single custom ESLint rule `eslint-rules/component-newspaper.mjs` (reusing the RuleTester + root-vitest infra and the `newspaper-order` fixer pattern) detects React components, then enforces three facets: (1) one exported component per file — error, not fixable; (2) the exported component is the first declaration after imports — autofix hoists it to the lede; (3) filename === exported component name — error, not fixable. It is wired into `eslint.config.mjs` for `client-react/src` non-test `.tsx`. The one multi-export file is split; the ~11 mis-ordered files are autofixed.

**Tech Stack:** ESLint 10.5 (flat config), `typescript-eslint` 8.61 parser (JSX), vitest 4 (RuleTester driver), Biome 2.5.

## Global Constraints

- **Named export only:** the rule module is `eslint-rules/component-newspaper.mjs` exporting `export const componentNewspaper` (no default export; `.mjs` escapes the TS-only ESLint block + Biome `useExplicitType`).
- **Scope:** the rule applies to `packages/client-react/src/**/*.tsx` and EXCLUDES `**/*.{test,spec}.tsx` (test `.tsx` may define throwaway components and are already governed by the test-scoped `rtc/newspaper-order`).
- **`rtc/newspaper-order` (tests) and `rtc/class-filename-match` (classes) are NOT modified.**
- **Autofix is TDZ-safe by construction:** the lede fix moves ONLY the exported component (render-deferred), hoisting it above other declarations; every other declaration keeps its relative order, so no new temporal-dead-zone error can be introduced. Verified empirically: Biome `noInvalidUseBeforeDeclaration` + ESLint pass on the reordered form.
- **Behaviour preserved / goldens zero-churn:** reordering declarations and extracting `SpreadDisplay` are render-identical, so the migration MUST land with ZERO changed visual-golden files (`react/` x86 + `react-local/<arch>`) and green contract tests. Any golden movement is a red flag to investigate, not regenerate.
- **CI-only gate:** always run `pnpm lint:eslint:types` locally — a new error there does not show in `pnpm lint:eslint`.
- The custom-rule RuleTester suite is auto-gated by the existing `test:rules` CI step (`eslint-rules/**/*.test.mjs`); no workflow change.

---

### Task 1: Custom rule `rtc/component-newspaper` + RuleTester matrix

**Files:**
- Create: `eslint-rules/component-newspaper.mjs`
- Create: `eslint-rules/component-newspaper.test.mjs`

**Interfaces:**
- Produces: `export const componentNewspaper` — an ESLint rule object `{ meta, create }`, `meta.fixable: "code"`, `meta.messages.{multipleExports,notLede,filenameMismatch}`. Imported by `eslint.config.mjs` in Task 2.

- [ ] **Step 1: Create the rule skeleton (no-op) so the test can import it**

`eslint-rules/component-newspaper.mjs`:
```js
function create() {
  return {};
}

export const componentNewspaper = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "One component per .tsx file: the exported component is the newspaper lede (private subcomponents/helpers below), and the filename matches it.",
    },
    fixable: "code",
    schema: [],
    messages: {
      multipleExports:
        "A .tsx file may export only one component. Extract '{{name}}' into its own '{{name}}.tsx'.",
      notLede:
        "The exported component '{{name}}' must be the first declaration after imports (newspaper order); private subcomponents and helpers belong below it.",
      filenameMismatch:
        "Filename must match the exported component: expected '{{name}}.tsx' for component '{{name}}' (got '{{base}}').",
    },
  },
  create,
};
```

- [ ] **Step 2: Write the failing test matrix**

`eslint-rules/component-newspaper.test.mjs`:
```js
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

import { componentNewspaper } from "./component-newspaper.mjs";

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

ruleTester.run("component-newspaper", componentNewspaper, {
  valid: [
    {
      name: "single exported component as lede, private subcomponent below",
      filename: "AdminDashboard.tsx",
      code: "export function AdminDashboard() {\n  return <div />;\n}\n\nfunction Card() {\n  return <div />;\n}\n",
    },
    {
      name: "lone component matching filename",
      filename: "App.tsx",
      code: "export function App() {\n  return <div />;\n}\n",
    },
    {
      name: "helper const below the exported component is fine (render-deferred ref)",
      filename: "Heatmap.tsx",
      code: "export function Heatmap() {\n  return <div>{SECTOR_MAP.a}</div>;\n}\n\nconst SECTOR_MAP = { a: 1 };\n",
    },
    {
      name: "memo-wrapped exported component as lede",
      filename: "Tile.tsx",
      code: "import { memo } from \"react\";\n\nexport const Tile = memo(function Tile() {\n  return <div />;\n});\n\nfunction Inner() {\n  return <span />;\n}\n",
    },
    {
      name: "useX hook is not a component (camelCase) and is ignored",
      filename: "Widget.tsx",
      code: "export function Widget() {\n  return <div />;\n}\n\nfunction useThing() {\n  return 1;\n}\n",
    },
    {
      name: "file with no component is never flagged",
      filename: "helpers.tsx",
      code: "export const x = 1;\n\nexport function helper() {\n  return 1;\n}\n",
    },
  ],
  invalid: [
    {
      name: "private component above the export is reordered to the lede",
      filename: "AdminDashboard.tsx",
      code: "function Card() {\n  return <div />;\n}\n\nexport function AdminDashboard() {\n  return <div />;\n}\n",
      errors: [{ messageId: "notLede", data: { name: "AdminDashboard" } }],
      output: "export function AdminDashboard() {\n  return <div />;\n}\n\nfunction Card() {\n  return <div />;\n}\n",
    },
    {
      name: "non-component const above the export is reordered below it",
      filename: "Heatmap.tsx",
      code: "const SECTOR_MAP = { a: 1 };\n\nexport function Heatmap() {\n  return <div />;\n}\n",
      errors: [{ messageId: "notLede", data: { name: "Heatmap" } }],
      output: "export function Heatmap() {\n  return <div />;\n}\n\nconst SECTOR_MAP = { a: 1 };\n",
    },
    {
      name: "type/interface above the export is reordered below it",
      filename: "Widget.tsx",
      code: "interface Props {\n  x: number;\n}\n\nexport function Widget({ x }: Props) {\n  return <div>{x}</div>;\n}\n",
      errors: [{ messageId: "notLede", data: { name: "Widget" } }],
      output: "export function Widget({ x }: Props) {\n  return <div>{x}</div>;\n}\n\ninterface Props {\n  x: number;\n}\n",
    },
    {
      name: "two exported components: report the second, no autofix",
      filename: "TilePrice.tsx",
      code: "export function TilePrice() {\n  return <div />;\n}\n\nexport function SpreadDisplay() {\n  return <div />;\n}\n",
      errors: [{ messageId: "multipleExports", data: { name: "SpreadDisplay" } }],
      output: null,
    },
    {
      name: "filename mismatch on the single exported component, no autofix",
      filename: "Foo.tsx",
      code: "export function Bar() {\n  return <div />;\n}\n",
      errors: [{ messageId: "filenameMismatch", data: { name: "Bar", base: "Foo" } }],
      output: null,
    },
  ],
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `pnpm test:rules`
Expected: FAIL — the no-op rule reports nothing, so every invalid case fails with "Should have 1 error but had 0".

- [ ] **Step 4: Implement the rule core**

Replace the `function create()` no-op in `eslint-rules/component-newspaper.mjs` with the helpers + `create` below (keep the existing `export const componentNewspaper` block unchanged):
```js
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

function isPascal(name) {
  return typeof name === "string" && PASCAL_CASE.test(name);
}

// Shallow-recursive search for a JSX node anywhere in a subtree (skips `parent`
// back-references and non-AST values).
function containsJsx(node) {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    return true;
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === "string" && containsJsx(child)) {
          return true;
        }
      }
    } else if (value && typeof value.type === "string" && containsJsx(value)) {
      return true;
    }
  }
  return false;
}

// An init expression is a component value if it is an arrow/function returning
// JSX, or a memo(...)/forwardRef(...) wrapper call.
function isComponentInit(init) {
  if (!init) {
    return false;
  }
  if (
    init.type === "ArrowFunctionExpression" ||
    init.type === "FunctionExpression"
  ) {
    return containsJsx(init.body);
  }
  if (init.type === "CallExpression") {
    const callee = init.callee;
    const name =
      callee.type === "Identifier"
        ? callee.name
        : callee.type === "MemberExpression" &&
            callee.property.type === "Identifier"
          ? callee.property.name
          : null;
    return name === "memo" || name === "forwardRef";
  }
  return false;
}

// If a top-level statement declares a React component, return {name, exported};
// else null. Handles `function`, `const = …`, and their `export`/`export
// default` (named) forms.
function componentInfo(stmt) {
  let exported = false;
  let decl = stmt;
  if (
    stmt.type === "ExportNamedDeclaration" ||
    stmt.type === "ExportDefaultDeclaration"
  ) {
    if (!stmt.declaration) {
      return null;
    }
    exported = true;
    decl = stmt.declaration;
  }
  if (
    decl.type === "FunctionDeclaration" &&
    decl.id &&
    isPascal(decl.id.name) &&
    containsJsx(decl.body)
  ) {
    return { name: decl.id.name, exported };
  }
  if (decl.type === "VariableDeclaration" && decl.declarations.length === 1) {
    const d = decl.declarations[0];
    if (
      d.id.type === "Identifier" &&
      isPascal(d.id.name) &&
      isComponentInit(d.init)
    ) {
      return { name: d.id.name, exported };
    }
  }
  return null;
}

function baseSegment(filename) {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.split(".")[0];
}

function startWithLeadingComments(node, sourceCode) {
  const comments = sourceCode.getCommentsBefore(node);
  let start = node.range[0];
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    const tokenBefore = sourceCode.getTokenBefore(comment, {
      includeComments: true,
    });
    if (tokenBefore && tokenBefore.loc.end.line === comment.loc.start.line) {
      break;
    }
    start = comment.range[0];
  }
  return start;
}

function create(context) {
  const sourceCode = context.sourceCode;
  const filename = context.filename;
  return {
    Program(program) {
      const body = program.body;
      const components = [];
      for (let i = 0; i < body.length; i++) {
        const info = componentInfo(body[i]);
        if (info) {
          components.push({ ...info, index: i, node: body[i] });
        }
      }
      if (components.length === 0) {
        return;
      }
      const exported = components.filter((c) => c.exported);

      // Facet 1 — one exported component per file.
      if (exported.length > 1) {
        for (let k = 1; k < exported.length; k++) {
          context.report({
            node: exported[k].node,
            messageId: "multipleExports",
            data: { name: exported[k].name },
          });
        }
        return;
      }
      if (exported.length === 0) {
        return;
      }
      const lede = exported[0];

      // Facet 3 — filename === exported component name.
      const base = baseSegment(filename);
      if (lede.name !== base) {
        context.report({
          node: lede.node,
          messageId: "filenameMismatch",
          data: { name: lede.name, base },
        });
      }

      // Facet 2 — the exported component is the lede (first decl after imports).
      let firstNonImport = 0;
      while (
        firstNonImport < body.length &&
        body[firstNonImport].type === "ImportDeclaration"
      ) {
        firstNonImport++;
      }
      if (lede.index === firstNonImport) {
        return;
      }
      context.report({
        node: lede.node,
        messageId: "notLede",
        data: { name: lede.name },
        fix(fixer) {
          const start = startWithLeadingComments(lede.node, sourceCode);
          const nextToken = sourceCode.getTokenAfter(lede.node, {
            includeComments: true,
          });
          const end = nextToken ? nextToken.range[0] : lede.node.range[1];
          const text = sourceCode.text.slice(start, lede.node.range[1]);
          const anchor =
            firstNonImport > 0 ? body[firstNonImport - 1].range[1] : 0;
          return [
            fixer.removeRange([start, end]),
            fixer.insertTextAfterRange([anchor, anchor], `\n\n${text}`),
          ];
        },
      });
    },
  };
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm test:rules`
Expected: PASS — all `component-newspaper` cases AND the existing `newspaper-order` + `class-filename-match` cases (the runner picks up every `eslint-rules/*.test.mjs`).

- [ ] **Step 6: Confirm the rule files are Biome-clean**

Run: `pnpm exec biome check eslint-rules/component-newspaper.mjs eslint-rules/component-newspaper.test.mjs`
Expected: no errors. If only formatting differs, run with `--write` and re-check.

- [ ] **Step 7: Commit**

```bash
git add eslint-rules/component-newspaper.mjs eslint-rules/component-newspaper.test.mjs
git commit -m "feat(lint): add rtc/component-newspaper rule + RuleTester matrix"
```

---

### Task 2: Wire `rtc/component-newspaper` into ESLint config

**Files:**
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: `componentNewspaper` from Task 1; the existing shared `rtcPlugin` object (already holds `newspaper-order` + `class-filename-match`).

- [ ] **Step 1: Import the new rule**

In `eslint.config.mjs`, after the existing
`import { classFilenameMatch } from "./eslint-rules/class-filename-match.mjs";` line, add:
```js
import { componentNewspaper } from "./eslint-rules/component-newspaper.mjs";
```
(Biome `organizeImports` may reorder the local-rule import group — accept that with `--write` in Step 4; formatting-only.)

- [ ] **Step 2: Register the rule on the shared `rtcPlugin` object**

Find the `const rtcPlugin = {` block and add the third rule so it reads:
```js
const rtcPlugin = {
  rules: {
    "newspaper-order": newspaperOrder,
    "class-filename-match": classFilenameMatch,
    "component-newspaper": componentNewspaper,
  },
};
```

- [ ] **Step 3: Add the component-newspaper config block**

Immediately AFTER the `**/world.ts` carve-out block (the last `rtc/*` block, just before `prettier,`), add:
```js
  {
    // One component per .tsx file: the exported component is the newspaper lede
    // (private subcomponents/helpers/types below it) and the filename matches it.
    // Scoped to client-react source; test .tsx are excluded (they may define
    // throwaway components and are governed by rtc/newspaper-order instead).
    files: ["packages/client-react/src/**/*.tsx"],
    ignores: ["**/*.{test,spec}.tsx"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/component-newspaper": "error" },
  },
```

- [ ] **Step 4: Biome-format the config**

Run: `pnpm exec biome check --write eslint.config.mjs`
Expected: clean after write.

- [ ] **Step 5: Verify the rule flags exactly the known violators (transient red is EXPECTED)**

Run: `pnpm exec eslint packages/client-react/src/ui/fx/liveRates/tile/TilePrice.tsx packages/client-react/src/ui/admin/AdminDashboard.tsx 2>&1 | tail -20`
Expected: `multipleExports` on `TilePrice.tsx` (for `SpreadDisplay`) and `notLede` on `AdminDashboard.tsx` (for `AdminDashboard`). A non-zero exit is EXPECTED — Tasks 3-4 clear these. Confirm there is NO config-load error.

- [ ] **Step 6: Confirm the full set of violators matches the plan (11 notLede + 1 multipleExports)**

Run:
```bash
pnpm exec eslint "packages/client-react/src/**/*.tsx" --format json -o /tmp/cn.json 2>/dev/null; \
node -e "const d=require('/tmp/cn.json');let m=0,l=0;for(const f of d)for(const x of f.messages){if(x.ruleId==='rtc/component-newspaper'){if(x.messageId==='multipleExports')m++;else if(x.messageId==='notLede')l++;}}console.log('multipleExports',m,'notLede',l)"
```
Expected: `multipleExports 1 notLede 11`. (If `notLede` is 12, `TilePrice` is double-counted because the split hasn't happened yet — that's fine; after Task 3 it becomes 11 + the split removes the multi-export.)

- [ ] **Step 7: Commit**

```bash
git add eslint.config.mjs
git commit -m "feat(lint): enable rtc/component-newspaper for client-react src tsx"
```

---

### Task 3: Split `TilePrice.tsx` — extract `SpreadDisplay`

**Files:**
- Create: `packages/client-react/src/ui/fx/liveRates/tile/SpreadDisplay.tsx`
- Create: `packages/client-react/src/ui/fx/liveRates/tile/SpreadDisplay.module.css`
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/TilePrice.tsx`
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/TilePrice.module.css`
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/Tile.tsx`
- Modify: `packages/client-react/tests/ui/contract/react/registry.tsx`

**Context:** `TilePrice.tsx` exports two components: `TilePrice` and `SpreadDisplay`. `SpreadDisplay` is used externally (`Tile.tsx`) and has its own page object + contract coverage, so it earns its own file. `SpreadDisplay` is the ONLY consumer of the `.spread` class in `TilePrice.module.css`, so that rule moves to a co-located `SpreadDisplay.module.css`. The contract spec imports `SpreadDisplay` via the `@ui-contract/components` barrel, which is fed by `registry.tsx` — repoint the registry's source import (the barrel/spec need no change). This task does NOT reorder `TilePrice.tsx` (Task 4's autofix does that).

- [ ] **Step 1: Create `SpreadDisplay.module.css`**

`packages/client-react/src/ui/fx/liveRates/tile/SpreadDisplay.module.css`:
```css
.spread {
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 0;
}
```

- [ ] **Step 2: Remove the `.spread` rule from `TilePrice.module.css`**

In `packages/client-react/src/ui/fx/liveRates/tile/TilePrice.module.css`, delete the `.spread { … }` block (the 5 lines: selector + the 4 properties). Leave every other class untouched.

- [ ] **Step 3: Create `SpreadDisplay.tsx`**

`packages/client-react/src/ui/fx/liveRates/tile/SpreadDisplay.tsx`:
```tsx
import type { ReactElement } from "react";

import styles from "./SpreadDisplay.module.css";

interface SpreadDisplayProps {
  spread: string;
}

export function SpreadDisplay({ spread }: SpreadDisplayProps): ReactElement {
  return <div className={styles.spread}>{spread}</div>;
}
```

- [ ] **Step 4: Remove `SpreadDisplay` (and its props type) from `TilePrice.tsx`**

In `packages/client-react/src/ui/fx/liveRates/tile/TilePrice.tsx`, delete the trailing block:
```tsx
interface SpreadDisplayProps {
  spread: string;
}

export function SpreadDisplay({ spread }: SpreadDisplayProps): ReactElement {
  return <div className={styles.spread}>{spread}</div>;
}
```
`TilePrice.tsx` keeps `TilePrice` (exported), `PriceButton` (private), `splitPrice`/`movementKey` (helpers), and its types. `styles.spread` is no longer referenced here (it was the only use), so `TilePrice.module.css` losing `.spread` is consistent.

- [ ] **Step 5: Repoint `Tile.tsx`**

In `packages/client-react/src/ui/fx/liveRates/tile/Tile.tsx`, replace line 13:
```tsx
import { SpreadDisplay, TilePrice } from "./TilePrice";
```
with two imports:
```tsx
import { SpreadDisplay } from "./SpreadDisplay";
import { TilePrice } from "./TilePrice";
```
(Biome will sort; usages `<TilePrice …/>` and `<SpreadDisplay …/>` are unchanged.)

- [ ] **Step 6: Repoint the contract registry**

In `packages/client-react/tests/ui/contract/react/registry.tsx`, replace the combined import (lines 77-80):
```tsx
import {
  SpreadDisplay as SpreadDisplayComponent,
  TilePrice as TilePriceComponent,
} from "#/ui/fx/liveRates/tile/TilePrice";
```
with:
```tsx
import { SpreadDisplay as SpreadDisplayComponent } from "#/ui/fx/liveRates/tile/SpreadDisplay";
import { TilePrice as TilePriceComponent } from "#/ui/fx/liveRates/tile/TilePrice";
```
(The `SpreadDisplayComponent` / `TilePriceComponent` usages elsewhere in the registry are unchanged. The `@ui-contract/components` barrel and `TilePrice.contract.spec.ts` need NO change — they resolve through the registry.)

- [ ] **Step 7: Verify behaviour + rule clearance for the split**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: green.
Run: `pnpm --filter @rtc/client-react test:ui:contract`
Expected: green (the `SpreadDisplay`/`TilePrice` contract specs resolve through the repointed registry).
Run: `pnpm exec eslint packages/client-react/src/ui/fx/liveRates/tile/SpreadDisplay.tsx`
Expected: 0 errors (one exported component, filename matches, it is the lede).
Run: `pnpm exec eslint packages/client-react/src/ui/fx/liveRates/tile/TilePrice.tsx 2>&1 | tail -5`
Expected: now only `notLede` for `TilePrice` (the `multipleExports` error is gone). This is cleared by Task 4.

- [ ] **Step 8: Confirm zero visual-golden churn for the split**

Run: `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react`
Expected: green with NO updated golden files (`git status --short packages/client-react/tests/ui/visual` is empty). The extraction is render-identical (same DOM, same CSS properties). If any golden changed, STOP and investigate — do not regenerate.

- [ ] **Step 9: Biome + commit**

Run: `pnpm exec biome check --write packages/client-react/src/ui/fx/liveRates/tile/ packages/client-react/tests/ui/contract/react/registry.tsx`
```bash
git add -A packages/client-react/src/ui/fx/liveRates/tile/ packages/client-react/tests/ui/contract/react/registry.tsx
git commit -m "refactor(client): extract SpreadDisplay into its own file + module.css"
```

---

### Task 4: Autofix-reorder the mis-ordered component files

> **SCOPE DECISION (2026-06-30): Option B — strict full-newspaper.** The live
> rule exposed a contradiction in the spec (prose said "types and consts all
> sit below" → strict; the migration inventory listed 11 → component-only). The
> user chose **strict full-newspaper**: the exported component must be the
> ABSOLUTE first declaration after imports, so every `Props` interface, type,
> and const moves below it. After merging the latest `origin/main` (which added
> `react-bindings`/`client-prototype` and removed the `hooks/` dir), the live
> count is **66 `notLede` files + 1 `multipleExports` (TilePrice) + 0
> `filenameMismatch`** across 83 non-test `.tsx` files. After the Task-3 split
> removes TilePrice's second export, TilePrice itself becomes a `notLede` fix,
> so the Task-4 reorder touches **67** files. The migration is
> **autofix-driven**: `eslint --fix` on the glob fixes them ALL regardless of
> the exact list — do NOT hand-enumerate. Comment preservation verified
> zero-loss across all of them (`.superpowers/sdd/cn-probe-all.mjs`).

**Files (all Modify, via `eslint --fix`):** every `notLede` violator under
`packages/client-react/src/**/*.tsx` (67 after the TilePrice split) — the
autofix discovers and fixes them all; no manual list. The original 11 (App, AdminDashboard,
MetricGauges, RfqTilesPanel, SellSidePanel, DepthLadder, SectorHeatmap,
Watchlist, TileConfirmation, TilePrice, InhouseLayoutEngine) are a subset; the
rest are files with a `Props` interface / type / const above the component.

**Context:** each violator has at least one declaration (a private
subcomponent, helper, `Props` interface, type, or const) above the exported
component. The rule's autofix hoists the single exported component to the lede;
everything else keeps its relative order below it (TDZ-safe: types are
compile-time, consts/private components are render-deferred). This is a pure
reorder — render output is byte-identical, proven by zero golden churn (Step 5).

- [ ] **Step 1: Apply the autofix across the scope**

Run: `pnpm exec eslint "packages/client-react/src/**/*.tsx" --fix`
Expected: exits 0 (all `notLede` violations auto-resolved). If it still reports errors, they are NOT auto-fixable (`multipleExports`/`filenameMismatch`) — there should be none left after Task 3; investigate if any appear.

- [ ] **Step 2: Normalize formatting**

Run: `pnpm exec biome check --write packages/client-react/src/ui/`
Expected: applies spacing/blank-line normalization to the reordered files.

- [ ] **Step 3: Confirm every file now has the export as the lede**

Run: `pnpm exec eslint "packages/client-react/src/**/*.tsx" 2>&1 | tail -5`
Expected: 0 `rtc/component-newspaper` errors.

- [ ] **Step 4: Verify behaviour preserved**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: green.
Run: `pnpm --filter @rtc/client-react test:app`
Expected: green.
Run: `pnpm --filter @rtc/client-react test:ui:contract`
Expected: green.

- [ ] **Step 5: Confirm ZERO visual-golden churn (the render-identity proof)**

Run: `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react`
Expected: green with NO changed golden files. Verify:
```bash
git status --short packages/client-react/tests/ui/visual
```
Expected: EMPTY. The reorder is render-identical, so no golden may move. If any golden changed, STOP — a changed golden means the reorder was not behaviour-preserving (e.g. a component was misdetected); investigate, do not regenerate.

- [ ] **Step 6: Commit**

```bash
git add -A packages/client-react/src/ui/
git commit -m "refactor(client): reorder components to newspaper order (exported component first)"
```

---

### Task 5: Final green verification

**Files:** none (verification only; a commit only if Biome/normalization touches anything).

- [ ] **Step 1: Full lint is green**

Run: `pnpm lint:eslint`
Expected: 0 errors (every component violator split/reordered; no unused-directive warnings).
Run: `pnpm lint:eslint:types`
Expected: 0 errors (CI-only gate; the new `SpreadDisplay.tsx` is under `src/**`, already covered by `tsconfig.eslint.json`).
Run: `pnpm exec biome ci .`
Expected: 0 errors.

- [ ] **Step 2: Full behaviour + dead-code + rules green**

Run: `pnpm test`
Expected: all packages green.
Run: `pnpm typecheck`
Expected: green.
Run: `pnpm lint:dead`
Expected: green (SpreadDisplay.tsx is imported by Tile.tsx + registry; no new dead exports).
Run: `pnpm test:rules`
Expected: green (all three RuleTester suites).

- [ ] **Step 3: UI contract coverage gate**

Run: `pnpm --filter @rtc/client-react test:ui:contract:coverage`
Expected: ≥95% (the CI-gated UI contract coverage threshold; SpreadDisplay already had coverage, now from its own file).

- [ ] **Step 4: Regression probe — no component-rule violations remain, zero golden churn**

Run:
```bash
pnpm exec eslint "packages/client-react/src/**/*.tsx" 2>&1 | grep -c "rtc/component-newspaper" || echo "0 component-rule violations remaining"
git status --short packages/client-react/tests/ui/visual
```
Expected: `0 component-rule violations remaining` and an EMPTY visual-golden status.

- [ ] **Step 5: Commit (only if Step 1/2 normalization changed anything)**

```bash
git add -A
git commit -m "chore(lint): component-newspaper migration green" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Custom rule `rtc/component-newspaper`, named export, `.mjs`, fixable → Task 1. ✅
- Component detection (PascalCase function/arrow returning JSX + memo/forwardRef; non-component consts, hooks, types ignored) → Task 1 (`componentInfo`/`isComponentInit`/`containsJsx`) + matrix valid/invalid cases. ✅
- Facet 1 one exported component (error, not fixed) → Task 1 `multipleExports` + matrix; migration = TilePrice split (Task 3). ✅
- Facet 2 exported component is the lede (autofix) → Task 1 `notLede` + fix; migration = 11-file autofix (Task 4). ✅
- Facet 3 filename === component (error, not fixed; 0 current violations) → Task 1 `filenameMismatch` + matrix. ✅
- Scope `client-react/src/**/*.tsx` excluding test tsx; wired via shared `rtcPlugin` → Task 2. ✅
- TilePrice → SpreadDisplay split incl. `.spread` CSS move + 2 importers (Tile.tsx, registry.tsx) → Task 3. ✅
- Goldens zero-churn (render-identity proof) → Task 3 Step 8, Task 4 Step 5, Task 5 Step 4. ✅
- Gates incl. `lint:eslint:types` + contract coverage ≥95% + `test:rules` → Task 5. ✅

**Placeholder scan:** none — every step has exact paths, code, commands, expected output.

**TDZ-guard refinement (deliberate, flagged):** the spec described the fixer as "refuses to cross a load-time const dependency, flagging instead." The implemented fixer uses the simpler **hoist-the-export-to-lede** strategy, which is **unconditionally TDZ-safe**: it moves only the render-deferred exported component upward and leaves every other declaration in its relative order, so it can never introduce a new temporal-dead-zone error (if the file ran before, it runs after). The spec's safety *intent* (never emit an unsafe reorder) is therefore satisfied by construction rather than by a refusal branch — and the matrix demonstrates safety via the const-above-export reorder case (`SECTOR_MAP`) rather than a refusal case. This is a strict improvement, not a deviation in behaviour.

**Type/name consistency:** `componentNewspaper` (export), messageIds `multipleExports`/`notLede`/`filenameMismatch`, `data.{name,base}`, rule id `rtc/component-newspaper`, the shared `rtcPlugin` object, `SpreadDisplay`/`SpreadDisplay.module.css`/`SpreadDisplayProps` — used identically across Tasks 1-5. ✅
