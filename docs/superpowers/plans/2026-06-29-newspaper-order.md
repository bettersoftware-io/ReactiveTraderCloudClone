# Newspaper-order ESLint rule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A custom, autofixable ESLint rule `rtc/newspaper-order` that forces type/helper/`vi.mock` declarations below the tests in every test file, and migrate the ~81 offending files.

**Architecture:** A local ESLint rule lives in `eslint-rules/newspaper-order.mjs` (named export, ESM). It is registered in `eslint.config.mjs` under a test-file-scoped flat-config block as the `rtc` plugin. The rule is TDD'd with ESLint's `RuleTester` driven by vitest in a small root vitest project (`eslint-rules/vitest.config.ts`, run via `pnpm test:rules`), gated in CI. After the rule lands, `eslint --fix` migrates the existing test files; correctness is proven by the full test + typecheck suites staying green (function declarations hoist).

**Tech Stack:** ESLint 10.5 (flat config), `typescript-eslint` 8.61 parser, vitest 4, Biome 2.5 (formatter).

## Global Constraints

- **Named exports only.** `noDefaultExport` is enforced repo-wide; only `**/*.config.*` / `*.d.ts` / `middleware.ts` may default-export. The rule module must use `export const newspaperOrder`. (The rule file is `.mjs`, so it escapes the `**/*.{ts,tsx}` ESLint block AND Biome's TS-only `useExplicitType`; it must still be Biome-format-clean.)
- **Single dependency range (syncpack).** `vitest` already exists in packages at `^4`; the root dep MUST also be `^4` (no new version introduced; resolves to the installed 4.1.9).
- **Worktree + CI + merge-commit shipping.** All work happens in the current worktree (`worktree-lint-newspaper-order`); ship via PR, loop on `gh run list --workflow CI` until the run for HEAD_SHA is `success`, merge with `--merge`, then remove the worktree. (See `shipping-repo-changes` skill — handled at execution, not a plan task.)
- **Biome + ESLint must both stay green** after the migration; CI runs `biome ci .`, `eslint .`, `pnpm test`, `pnpm typecheck`, `knip`, and more.

---

### Task 1: Test harness + rule core (first red→green)

**Files:**
- Create: `eslint-rules/newspaper-order.mjs`
- Create: `eslint-rules/newspaper-order.test.mjs`
- Create: `eslint-rules/vitest.config.ts`
- Modify: `package.json` (add `vitest` devDep + `test:rules` script)

**Interfaces:**
- Produces: `export const newspaperOrder` — an ESLint rule object `{ meta, create }`, `meta.fixable: "code"`, `meta.messages.moveDown`. Imported by the test and by `eslint.config.mjs` (Task 3).

- [ ] **Step 1: Add vitest as a root dev dependency and the test:rules script**

In `package.json`, add to `devDependencies` (keep alphabetical):
```json
    "vitest": "^4"
```
And add to `scripts` (after `"test:ui:visual"`):
```json
    "test:rules": "vitest run --config eslint-rules/vitest.config.ts",
```
Then install (updates the lockfile, which CI's `--frozen-lockfile` requires):
```bash
pnpm install
```
Expected: `Done`. Confirm no unexpected version drift:
```bash
pnpm outdated -r | grep -i vitest || echo "vitest at latest acceptable range"
```

- [ ] **Step 2: Create the root vitest project scoped to the rule tests**

`eslint-rules/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["eslint-rules/**/*.test.mjs"],
  },
});
```

- [ ] **Step 3: Create a no-op rule skeleton so the test can import it**

`eslint-rules/newspaper-order.mjs`:
```js
function create() {
  return {};
}

export const newspaperOrder = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Test files: keep type/helper declarations below the tests (newspaper order).",
    },
    fixable: "code",
    schema: [],
    messages: {
      moveDown:
        "Newspaper order: move type/helper declarations below the tests ({{count}} found).",
    },
  },
  create,
};
```

- [ ] **Step 4: Write the failing test (canonical invalid case)**

`eslint-rules/newspaper-order.test.mjs`:
```js
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

import { newspaperOrder } from "./newspaper-order.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2023,
    sourceType: "module",
  },
});

ruleTester.run("newspaper-order", newspaperOrder, {
  valid: [],
  invalid: [
    {
      name: "function helper before describe is moved to the bottom",
      code: `import { describe, it, expect } from "vitest";

function helper() {
  return 1;
}

describe("x", () => {
  it("works", () => {
    expect(helper()).toBe(1);
  });
});
`,
      output: `import { describe, it, expect } from "vitest";

describe("x", () => {
  it("works", () => {
    expect(helper()).toBe(1);
  });
});

function helper() {
  return 1;
}
`,
      errors: [{ messageId: "moveDown", data: { count: "1" } }],
    },
  ],
});
```

- [ ] **Step 5: Run the test to confirm it fails**

Run: `pnpm test:rules`
Expected: FAIL — the no-op rule reports nothing, so RuleTester reports "Should have 1 error but had 0".

- [ ] **Step 6: Implement the rule core**

Replace the body of `eslint-rules/newspaper-order.mjs` (keep the `export const newspaperOrder` block, swap the helpers + `create`):
```js
const PRIMARY_CALLERS = new Set([
  "describe",
  "it",
  "test",
  "suite",
  "beforeEach",
  "afterEach",
  "beforeAll",
  "afterAll",
]);

function baseCalleeName(callee) {
  let node = callee;
  while (node && node.type === "MemberExpression") {
    node = node.object;
  }
  return node && node.type === "Identifier" ? node.name : null;
}

function isPrimary(stmt) {
  if (stmt.type !== "ExpressionStatement") return false;
  const expr = stmt.expression;
  if (!expr || expr.type !== "CallExpression") return false;
  const name = baseCalleeName(expr.callee);
  return name !== null && PRIMARY_CALLERS.has(name);
}

function isMovableViMock(stmt) {
  if (stmt.type !== "ExpressionStatement") return false;
  const expr = stmt.expression;
  if (!expr || expr.type !== "CallExpression") return false;
  const callee = expr.callee;
  return (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "vi" &&
    callee.property.type === "Identifier" &&
    (callee.property.name === "mock" || callee.property.name === "unmock")
  );
}

function declKind(stmt) {
  const node =
    stmt.type === "ExportNamedDeclaration" && stmt.declaration
      ? stmt.declaration
      : stmt;
  return node.type;
}

function isSecondary(stmt) {
  if (isMovableViMock(stmt)) return true;
  const kind = declKind(stmt);
  return (
    kind === "FunctionDeclaration" ||
    kind === "TSTypeAliasDeclaration" ||
    kind === "TSInterfaceDeclaration"
  );
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
  return {
    Program(program) {
      const body = program.body;
      let lastPrimary = -1;
      for (let i = 0; i < body.length; i++) {
        if (isPrimary(body[i])) lastPrimary = i;
      }
      if (lastPrimary === -1) return;

      const violations = [];
      for (let i = 0; i < lastPrimary; i++) {
        if (isSecondary(body[i])) violations.push(body[i]);
      }
      if (violations.length === 0) return;

      context.report({
        node: violations[0],
        messageId: "moveDown",
        data: { count: String(violations.length) },
        fix(fixer) {
          const fixes = [];
          const chunks = [];
          for (const node of violations) {
            const start = startWithLeadingComments(node, sourceCode);
            const nextToken = sourceCode.getTokenAfter(node, {
              includeComments: true,
            });
            const end = nextToken ? nextToken.range[0] : node.range[1];
            fixes.push(fixer.removeRange([start, end]));
            chunks.push(sourceCode.text.slice(start, node.range[1]));
          }
          const programEnd = sourceCode.ast.range[1];
          fixes.push(
            fixer.insertTextAfterRange(
              [programEnd, programEnd],
              `\n\n${chunks.join("\n\n")}`,
            ),
          );
          return fixes;
        },
      });
    },
  };
}
```

- [ ] **Step 7: Run the test to confirm it passes**

Run: `pnpm test:rules`
Expected: PASS (1 test).

- [ ] **Step 8: Confirm the rule file is Biome-clean**

Run: `pnpm exec biome check eslint-rules/`
Expected: no errors (format + lint clean). If only formatting differs, run `pnpm exec biome check --write eslint-rules/` and re-run.

- [ ] **Step 9: Commit**

```bash
git add eslint-rules/ package.json pnpm-lock.yaml
git commit -m "feat(lint): add rtc/newspaper-order rule core + RuleTester harness"
```

---

### Task 2: Full case matrix (types, vi.mock, neutrals, comments, multi-violation)

**Files:**
- Modify: `eslint-rules/newspaper-order.test.mjs`
- Modify: `eslint-rules/newspaper-order.mjs` (only if a case exposes a gap)

**Interfaces:**
- Consumes: `newspaperOrder` from Task 1.

- [ ] **Step 1: Add the valid cases**

Add these objects to the `valid` array in `eslint-rules/newspaper-order.test.mjs`:
```js
  {
    name: "helpers already below the tests",
    code: `import { describe, it } from "vitest";

describe("x", () => {
  it("works", () => {
    helper();
  });
});

function helper() {
  return 1;
}
`,
  },
  {
    name: "no test statements -> rule does nothing",
    code: `export function add(a: number, b: number): number {
  return a + b;
}
`,
  },
  {
    name: "class before describe is left in place (not hoisted)",
    code: `import { describe, it } from "vitest";

class FakeWs {}

describe("x", () => {
  it("uses fake", () => {
    new FakeWs();
  });
});
`,
  },
  {
    name: "vi.doMock before describe is left in place (not hoisted)",
    code: `import { describe, it, vi } from "vitest";

vi.doMock("./dep", () => ({ default: 1 }));

describe("x", () => {
  it("works", () => {});
});
`,
  },
  {
    name: "const after a test is not policed",
    code: `import { describe, it } from "vitest";

describe("x", () => {
  it("works", () => {});
});

const AFTER = 1;
`,
  },
```

- [ ] **Step 2: Add the remaining invalid cases**

Add these objects to the `invalid` array:
```js
  {
    name: "type alias before describe is moved down",
    code: `import { describe, it } from "vitest";

type Foo = { a: number };

describe("x", () => {
  it("works", () => {
    const f: Foo = { a: 1 };
  });
});
`,
    output: `import { describe, it } from "vitest";

describe("x", () => {
  it("works", () => {
    const f: Foo = { a: 1 };
  });
});

type Foo = { a: number };
`,
    errors: [{ messageId: "moveDown", data: { count: "1" } }],
  },
  {
    name: "vi.mock before describe is moved down (vitest hoists it anyway)",
    code: `import { describe, it, vi } from "vitest";

vi.mock("./dep");

describe("x", () => {
  it("works", () => {});
});
`,
    output: `import { describe, it, vi } from "vitest";

describe("x", () => {
  it("works", () => {});
});

vi.mock("./dep");
`,
    errors: [{ messageId: "moveDown", data: { count: "1" } }],
  },
  {
    name: "leading JSDoc comment travels with the helper",
    code: `import { describe, it } from "vitest";

// makes a thing
function helper() {
  return 1;
}

describe("x", () => {
  it("works", () => {
    helper();
  });
});
`,
    output: `import { describe, it } from "vitest";

describe("x", () => {
  it("works", () => {
    helper();
  });
});

// makes a thing
function helper() {
  return 1;
}
`,
    errors: [{ messageId: "moveDown", data: { count: "1" } }],
  },
  {
    name: "two helpers before describe keep their original order at the bottom",
    code: `import { describe, it } from "vitest";

function a() {
  return 1;
}

function b() {
  return 2;
}

describe("x", () => {
  it("works", () => {
    a();
    b();
  });
});
`,
    output: `import { describe, it } from "vitest";

describe("x", () => {
  it("works", () => {
    a();
    b();
  });
});

function a() {
  return 1;
}

function b() {
  return 2;
}
`,
    errors: [{ messageId: "moveDown", data: { count: "2" } }],
  },
```

- [ ] **Step 3: Run the full matrix**

Run: `pnpm test:rules`
Expected: PASS (all valid + invalid cases). If an `output` assertion fails on whitespace only, the fixer's actual output is the source of truth for the *real* migration (Biome normalizes there) — correct the expected string to match the fixer; do NOT loosen the fixer to chase formatting.

- [ ] **Step 4: Commit**

```bash
git add eslint-rules/newspaper-order.test.mjs eslint-rules/newspaper-order.mjs
git commit -m "test(lint): full case matrix for rtc/newspaper-order (types, vi.mock, neutrals, comments)"
```

---

### Task 3: Wire the rule into ESLint config + CI

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `newspaperOrder` from Task 1.

- [ ] **Step 1: Import and register the rule (test-file-scoped block)**

In `eslint.config.mjs`, add the import at the top (after the existing imports):
```js
import { newspaperOrder } from "./eslint-rules/newspaper-order.mjs";
```
Then add a new config block immediately BEFORE the final `prettier,` entry:
```js
  {
    // Newspaper order for test files: type/helper/vi.mock declarations must sit
    // BELOW the describe/it blocks. Custom autofixable rule in eslint-rules/.
    // Scoped to test files only (contract specs included — reordering is
    // behaviour-preserving). class/enum/vi.doMock/vi.hoisted stay put.
    files: ["**/*.{spec,test}.{ts,tsx}"],
    plugins: { rtc: { rules: { "newspaper-order": newspaperOrder } } },
    rules: { "rtc/newspaper-order": "error" },
  },
```

- [ ] **Step 2: Verify the rule flags a real offending file (report only, no fix)**

Run: `pnpm exec eslint packages/client-react/src/app/presenters/__tests__/RfqsPresenter.test.ts`
Expected: 1 error `Newspaper order: move type/helper declarations below the tests (3 found).` (the `rfq`/`quote`/`port` helpers).

- [ ] **Step 3: Add the CI step**

In `.github/workflows/ci.yml`, in the `checks` job, add a step immediately after the `ESLint (AST rules)` step (the one running `pnpm lint:eslint`):
```yaml
      - name: Custom ESLint rule tests (RuleTester)
        run: pnpm test:rules
```

- [ ] **Step 4: Lint the workflow file**

Run: `pnpm lint:actions`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs .github/workflows/ci.yml
git commit -m "feat(lint): enable rtc/newspaper-order for test files + CI rule tests"
```

---

### Task 4: Migrate the existing test files + full green verification

**Files:**
- Modify: ~81 test files across `packages/**` (mechanical, via `--fix`)

- [ ] **Step 1: Auto-migrate with ESLint --fix**

Run: `pnpm exec eslint . --fix`
(The rule only matches test files, and `main` is already lint-clean, so this should change only test files.)

- [ ] **Step 2: Normalize formatting with Biome**

Run: `pnpm exec biome check --write .`
Expected: fixes applied (blank-line normalization around the moved declarations).

- [ ] **Step 3: Confirm only test files changed**

Run: `git status --short | grep -vE '\.(spec|test)\.(ts|tsx)$' || echo "ONLY test files changed"`
Expected: `ONLY test files changed`. If any non-test file appears, investigate before continuing (an unrelated `--fix` slipped in).

- [ ] **Step 4: Prove behaviour is preserved — tests + typecheck**

Run: `pnpm test`
Expected: all packages green.
Run: `pnpm typecheck`
Expected: green (types hoist for checking).

- [ ] **Step 5: Confirm both linters + dead-code are green**

Run: `pnpm lint:eslint`
Expected: green (no remaining `rtc/newspaper-order` errors).
Run: `pnpm exec biome ci .`
Expected: green.
Run: `pnpm lint:dead`
Expected: green (vitest root dep is referenced by `test:rules`; the rule + config are reachable).

- [ ] **Step 6: Spot-check one migrated file**

Run: `pnpm exec sed -n '1,80p' packages/client-react/src/app/presenters/__tests__/RfqsPresenter.test.ts`
Expected: imports at top, `describe` block now near the top, `rfq`/`quote`/`port` helpers at the bottom.

- [ ] **Step 7: Commit the migration**

```bash
git add -A
git commit -m "refactor(test): apply newspaper order — move helpers/types below tests (~81 files)"
```

---

## Self-Review

**Spec coverage:**
- Custom autofixable rule → Tasks 1–2. ✅
- Scope `**/*.{spec,test}.{ts,tsx}` incl. contract specs → Task 3 Step 1. ✅
- Secondary = function/type/interface/`vi.mock`/`vi.unmock` → `isSecondary`/`isMovableViMock` (Task 1 Step 6), tested Task 2. ✅
- Neutral = class/enum/`vi.doMock`/`vi.hoisted`/const → valid cases Task 2 Step 1. ✅ (enum not separately cased — same code path as class/const "not secondary"; covered implicitly.)
- Primary boundary incl. `.each/.only/.skip` member forms + lifecycle hooks → `baseCalleeName` + `PRIMARY_CALLERS` (Task 1 Step 6). ✅
- Single deterministic comment-aware fixer → Task 1 Step 6; comment travel tested Task 2. ✅
- Root vitest project + `test:rules` + CI gate → Task 1 Steps 1–2, Task 3 Step 3. ✅
- Migrate ~81 files, prove via test+typecheck → Task 4. ✅

**Placeholder scan:** none — all steps carry exact code/commands/expected output.

**Type/name consistency:** `newspaperOrder` (export), `messageId: "moveDown"`, `data.count` (string), `rtc/newspaper-order` (rule id), `test:rules` (script) — used identically across Tasks 1–4. ✅

**Gap added during review:** enum has no dedicated test case but follows the identical "not secondary" path as `class`/const; the `class` valid case exercises that path. Acceptable (no enum exists in any test file).
