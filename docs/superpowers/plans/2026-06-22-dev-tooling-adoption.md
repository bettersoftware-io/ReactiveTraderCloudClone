# Dev Tooling Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt actionlint, manypkg, syncpack, knip, dependency-cruiser, and ESLint (AST + type-aware tiers), drive every new check to zero findings, and make each blocking in CI and runnable locally.

**Architecture:** Risk-graded waves — config/low-blast tools first, the source-editing ESLint sweep last. Each wave ends green + blocking + committed. ESLint subsumes the custom rules from the roadmap (GritQL plugins are NOT built). Both version tools are adopted despite overlap (exploratory repo).

**Tech Stack:** pnpm 11.7 workspaces + Turborepo, Node 26, TypeScript 6, Biome 2.5 (sole formatter), Vitest/Playwright/Cypress. New: eslint + typescript-eslint, knip, dependency-cruiser, syncpack, @manypkg/cli, actionlint (Go binary).

## Global Constraints

- Biome stays the **sole formatter + correctness linter**; ESLint enables **only** the rules listed here, with `eslint-config-prettier` last so there is zero formatting overlap. Do not enable `js.configs.recommended` or `tseslint.configs.recommended` (they duplicate Biome).
- **Block everything:** every new check is a blocking CI step and reaches **zero findings** before its task is done.
- **Do not regress existing gates.** After every task: `pnpm exec biome ci .`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @rtc/client-react test:ui:contract:coverage`, `pnpm build`, `pnpm --filter @rtc/tests gates` all stay green.
- **Visual goldens MUST NOT be regenerated** — never pass `--update`. After any source edit re-run `pnpm test:ui:visual`; it must pass unchanged.
- **Contract spec files are behavior-frozen** (`packages/client-react/tests/ui/contract/**/*.contract.spec.ts`): apply only non-behavioral autofixes and re-run `pnpm --filter @rtc/client-react test:ui:contract`; if a rule would force a behavioral edit, add that file to the rule's ignore list instead.
- `@rtc/domain` may depend only on `rxjs` at runtime.
- `dist/` is a mounted volume — never `rm -rf dist`; use `find <dir> -mindepth 1 -delete`.
- Supply chain: `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` (refuses versions <24h old) and an `allowBuilds` allowlist. If `pnpm add` is rejected for a too-fresh version, pin the previous stable. If install reports a blocked build script for a new dep, add that dep to `allowBuilds`.
- Add root devDeps with `pnpm add -D -w <pkg>`.
- Work on branch `feat/dev-tooling-adoption`, not `main`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- Create: `eslint.config.js` (AST rules), `eslint.config.typed.js` (type-aware), `.dependency-cruiser.cjs`, `.syncpackrc.json`, `knip.json`, `scripts/install-actionlint.sh`.
- Modify: root `package.json` (devDeps + scripts), `pnpm-workspace.yaml` (only if a build script is blocked), `.gitignore` (`.tooling/`), `.github/workflows/ci.yml` (new blocking steps), `tests/package.json` (tsx range), source files fixed by the ESLint sweep, `docs/tooling-roadmap.md` (status boxes).

---

### Task 1: Branch + actionlint (workflow lint)

**Files:**
- Create: `scripts/install-actionlint.sh`
- Modify: `package.json` (script), `.gitignore`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: root script `lint:actions`; gitignored binary at `.tooling/actionlint`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/dev-tooling-adoption
```

- [ ] **Step 2: Add the actionlint installer** (actionlint is a Go binary, not an npm package; use the official pinned download script)

Create `scripts/install-actionlint.sh`:
```bash
#!/usr/bin/env bash
# Downloads a pinned actionlint binary into ./.tooling (gitignored).
# Official method: https://github.com/rhysd/actionlint/blob/main/docs/install.md
set -euo pipefail
VERSION="1.7.7"
DEST="$(cd "$(dirname "$0")/.." && pwd)/.tooling"
mkdir -p "$DEST"
if [ -x "$DEST/actionlint" ] && "$DEST/actionlint" --version | grep -q "$VERSION"; then
  exit 0
fi
curl -fsSL "https://raw.githubusercontent.com/rhysd/actionlint/v${VERSION}/scripts/download-actionlint.bash" \
  | bash -s -- "$VERSION" "$DEST"
```

```bash
chmod +x scripts/install-actionlint.sh
```

- [ ] **Step 3: Gitignore the binary dir**

Append to `.gitignore`:
```
# actionlint binary (downloaded via scripts/install-actionlint.sh)
.tooling/
```

- [ ] **Step 4: Add the local script**

In root `package.json` `scripts`, add:
```json
"lint:actions": "scripts/install-actionlint.sh && .tooling/actionlint -color"
```

- [ ] **Step 5: Run it (discovery + fix)**

Run: `pnpm lint:actions`
Expected: either clean exit 0, or findings. Fix any reported workflow issues in `.github/workflows/*.yml` until exit 0. (Known workflows: `ci.yml`, `update-visual-goldens.yml`.)

- [ ] **Step 6: Wire the blocking CI step**

In `.github/workflows/ci.yml`, in the `checks` job, immediately after the `Lint + format (Biome)` step, add:
```yaml
      - name: Workflow lint (actionlint)
        run: pnpm lint:actions
```

- [ ] **Step 7: Verify no regressions + commit**

```bash
pnpm exec biome ci .
git add scripts/install-actionlint.sh .gitignore package.json .github/workflows/ci.yml
git commit -m "ci: add blocking actionlint workflow gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Version consistency (manypkg + syncpack) + tsx fix

**Files:**
- Create: `.syncpackrc.json`
- Modify: `package.json` (devDeps + script), `tests/package.json` (tsx range), `.github/workflows/ci.yml`

**Interfaces:**
- Produces: root script `check:versions` (runs both tools).

- [ ] **Step 1: Install both tools**

```bash
pnpm add -D -w @manypkg/cli syncpack
```
Expected: install succeeds. If a version is rejected by the 24h cooldown, append `@<previous-stable>` and retry.

- [ ] **Step 2: Configure syncpack** (version-alignment only; ignore the private root's missing version; we never run `syncpack format` so script order is untouched)

Create `.syncpackrc.json`:
```json
{
  "versionGroups": [
    {
      "label": "Private workspace root has no version field by design",
      "packages": ["@rtc/root"],
      "isIgnored": true
    }
  ]
}
```

- [ ] **Step 3: Fix the known drift**

In `tests/package.json`, change the `tsx` devDependency range from `^4.19.0` to `^4` (match the repo norm).

- [ ] **Step 4: Add the local script**

In root `package.json` `scripts`, add:
```json
"check:versions": "manypkg check && syncpack lint"
```

- [ ] **Step 5: Run it (must be zero findings)**

Run: `pnpm check:versions`
Expected: manypkg prints no errors; syncpack prints "no issues" / exits 0. If syncpack still reports `tsx`, ensure Step 3 landed and re-run `pnpm install`.

- [ ] **Step 6: Wire the blocking CI step**

In `.github/workflows/ci.yml`, in the `checks` job, after the `Workflow lint (actionlint)` step, add:
```yaml
      - name: Version consistency (manypkg + syncpack)
        run: pnpm check:versions
```

- [ ] **Step 7: Verify + commit**

```bash
pnpm install --frozen-lockfile && pnpm check:versions && pnpm exec biome ci .
git add package.json pnpm-lock.yaml .syncpackrc.json tests/package.json .github/workflows/ci.yml
git commit -m "ci: add blocking version-consistency gate (manypkg + syncpack)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: knip (dead files / exports / deps)

**Files:**
- Create: `knip.json`
- Modify: `package.json` (devDep + script), `.github/workflows/ci.yml`

**Interfaces:**
- Produces: root script `lint:dead`.

- [ ] **Step 1: Install + build first** (cross-package resolution needs `dist/`)

```bash
pnpm add -D -w knip
pnpm build
```

- [ ] **Step 2: Seed the config with verified entry points**

Create `knip.json` (entries confirmed: domain/shared/server → `src/index.ts`, client app → `src/main.tsx` + `index.html`, plus exported subpaths):
```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    "packages/domain": {
      "entry": ["src/index.ts", "src/ports/__contracts__/*.ts"],
      "project": "src/**/*.ts"
    },
    "packages/shared": {
      "entry": ["src/index.ts", "src/__fixtures__/wireFrames.ts"],
      "project": "src/**/*.ts"
    },
    "packages/server": {
      "entry": ["src/index.ts"],
      "project": "src/**/*.ts"
    },
    "packages/client-react": {
      "entry": ["src/main.tsx", "src/index.ts", "index.html", "vite.config.ts"],
      "project": "src/**/*.{ts,tsx}"
    },
    "tests": {
      "entry": ["**/*.spec.{ts,tsx}", "**/*.steps.ts", "scripts/*.ts", "**/*.config.{ts,js}"],
      "project": "**/*.{ts,tsx}"
    }
  }
}
```

- [ ] **Step 3: Add the local script**

In root `package.json` `scripts`, add:
```json
"lint:dead": "knip"
```

- [ ] **Step 4: Discovery run — capture findings BEFORE deleting**

Run: `pnpm lint:dead`
Record the full output (unused files, exports, deps). **Do not mass-delete.** Triage each:
- Genuinely dead (no reference anywhere) → delete the code/export/dep.
- Intentional public API or framework-required entry that knip can't see → add it to that workspace's `entry` in `knip.json` (NOT a blanket ignore).

If the unused-export count is large (>30) or includes anything in `@rtc/domain`'s public ports surface, STOP and report the list to the controller before deleting — domain exports may be consumed only by tests/other packages and need an `entry` adjustment, not deletion.

- [ ] **Step 5: Apply fixes until clean**

Apply the Step 4 triage. For unused devDeps, `pnpm remove -w <dep>` (or from the owning package). Re-run `pnpm lint:dead` until it exits 0 with no findings.

- [ ] **Step 6: Wire the blocking CI step** (after `Build`, since knip needs `dist/`)

In `.github/workflows/ci.yml`, in the `checks` job, after the `Build` step, add:
```yaml
      - name: Dead code (knip)
        run: pnpm lint:dead
```

- [ ] **Step 7: Verify full suite + commit**

```bash
pnpm exec biome ci . && pnpm typecheck && pnpm test && pnpm build && pnpm lint:dead
git add knip.json package.json pnpm-lock.yaml .github/workflows/ci.yml
git add -A   # include any deleted files / edited source from triage
git commit -m "ci: add blocking dead-code gate (knip) + remove dead code

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: dependency-cruiser (cycles + architecture)

**Files:**
- Create: `.dependency-cruiser.cjs`
- Modify: `package.json` (devDep + script), `.github/workflows/ci.yml`

**Interfaces:**
- Produces: root script `check:deps`.

- [ ] **Step 1: Install**

```bash
pnpm add -D -w dependency-cruiser
```

- [ ] **Step 2: Write the config** (type-only edges are excluded because `tsPreCompilationDeps` defaults to false — the analog of `dpdm -T` that proved 0 real cycles)

Create `.dependency-cruiser.cjs`:
```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependency. Type-only edges are excluded (tsPreCompilationDeps:false).",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-stays-pure",
      severity: "error",
      comment: "@rtc/domain must not depend on shared/client/server.",
      from: { path: "^packages/domain/src" },
      to: { path: "^packages/(shared|client-react|server)/" },
    },
    {
      name: "shared-no-apps",
      severity: "error",
      comment: "@rtc/shared must not depend on client/server.",
      from: { path: "^packages/shared/src" },
      to: { path: "^packages/(client-react|server)/" },
    },
    {
      name: "client-not-server",
      severity: "error",
      comment: "client and server must never import each other.",
      from: { path: "^packages/client-react/src" },
      to: { path: "^packages/server/" },
    },
    {
      name: "server-not-client",
      severity: "error",
      from: { path: "^packages/server/src" },
      to: { path: "^packages/client-react/" },
    },
  ],
  options: {
    tsPreCompilationDeps: false,
    tsConfig: { fileName: "tsconfig.base.json" },
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "node", "default"],
    },
  },
};
```

- [ ] **Step 3: Add the local script**

In root `package.json` `scripts`, add:
```json
"check:deps": "depcruise --config .dependency-cruiser.cjs packages tests"
```

- [ ] **Step 4: Build, then run (expect pass)**

```bash
pnpm build
pnpm check:deps
```
Expected: "no dependency violations found". If any `no-circular` violations appear, confirm they are NOT type-only (inspect the cycle's imports); a genuine runtime cycle must be refactored, not suppressed. If layering violations appear, they are real architecture breaks — fix the offending import.

- [ ] **Step 5: Wire the blocking CI step** (after `Build`)

In `.github/workflows/ci.yml`, in the `checks` job, after the `Dead code (knip)` step, add:
```yaml
      - name: Dependency graph (cycles + layering)
        run: pnpm check:deps
```

- [ ] **Step 6: Verify + commit**

```bash
pnpm build && pnpm check:deps && pnpm exec biome ci .
git add .dependency-cruiser.cjs package.json pnpm-lock.yaml .github/workflows/ci.yml
git commit -m "ci: add blocking dependency-graph gate (cycles + layering)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: ESLint AST tier — config + discovery (NOT blocking yet)

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (devDeps + script)

**Interfaces:**
- Produces: root script `lint:eslint`; the flat config consumed by Task 6 and extended by Task 7.

- [ ] **Step 1: Install**

```bash
pnpm add -D -w eslint typescript-eslint eslint-config-prettier
```
(typescript-eslint must support TypeScript 6 / Node 26 — use the current stable. If the 24h cooldown blocks it, pin the previous stable.)

- [ ] **Step 2: Write the AST-only flat config** (ONLY these rules; no recommended preset → zero overlap with Biome)

Create `eslint.config.js`:
```js
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "**/coverage/**",
      "**/reports/**",
      "**/__screenshots__/**",
      "**/.turbo/**",
      ".tooling/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "func-style": ["error", "declaration", { allowArrowFunctions: false }],
      "arrow-body-style": ["error", "always"],
      "func-names": ["error", "always"],
      "lines-between-class-members": [
        "error",
        "always",
        { exceptAfterSingleLine: false },
      ],
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "function" },
        { blankLine: "always", prev: "function", next: "*" },
        { blankLine: "always", prev: "multiline-block-like", next: "*" },
        { blankLine: "always", prev: "*", next: "multiline-block-like" },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction, TSMethodSignature) > .returnType TSTypeLiteral",
          message:
            "Inline object return type — extract to a named interface/type alias.",
        },
        {
          selector:
            "VariableDeclarator[init.callee.name='useHooks'][id.type='Identifier']",
          message:
            "Destructure the hooks you need: const { useX } = useHooks().",
        },
      ],
    },
  },
  prettier,
);
```

> **Known scope limit:** ESLint core `padding-line-between-statements` has no `interface`/`type` statement types, so blank lines *between type/interface declarations* are not enforced (functions and `describe`/`it` blocks are, via `function` + `multiline-block-like`). This is a deliberate gap — do not add a plugin for it in this plan.

- [ ] **Step 3: Add the local script**

In root `package.json` `scripts`, add:
```json
"lint:eslint": "eslint ."
```

- [ ] **Step 4: Discovery run — report counts, do NOT fix yet**

Run: `pnpm lint:eslint --format stylish 2>&1 | tail -1` for the total, and per-rule counts with:
```bash
pnpm exec eslint . --format json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);const m={};for(const f of r)for(const x of f.messages){m[x.ruleId]=(m[x.ruleId]||0)+1}console.log(m)})'
```
Record the per-rule counts. **Report them to the controller before any sweeping** (this is the spec's pause-and-report gate). The likely-largest are `func-style` (arrow-assigned function definitions) and `arrow-body-style` (implicit-return arrows incl. JSX handlers). Do NOT make the gate blocking in this task.

- [ ] **Step 5: Commit the config only**

```bash
pnpm exec biome ci .
git add eslint.config.js package.json pnpm-lock.yaml
git commit -m "build: add ESLint AST-tier config (not yet gating)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: ESLint AST tier — sweep to zero + make blocking

**Files:**
- Modify: source files across `packages/*/src` and `tests/` as flagged; `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `eslint.config.js`, script `lint:eslint` (Task 5).

- [ ] **Step 1: Autofix the fixable rules**

```bash
pnpm exec eslint . --fix
```
This auto-resolves `arrow-body-style` (adds `{ return … }`) and `padding-line-between-statements` / `lines-between-class-members` (inserts blank lines). It does NOT fix `func-style`, `func-names`, or `no-restricted-syntax` (not autofixable).

- [ ] **Step 2: Re-format with Biome** (ESLint --fix may touch whitespace; Biome owns formatting)

```bash
pnpm exec biome format --write .
```

- [ ] **Step 3: Manually fix the non-autofixable findings, by category**

Re-run `pnpm lint:eslint` and fix each remaining finding using these exact transforms:

- `func-style` — convert an arrow-assigned function definition to a declaration:
  ```ts
  // before
  const compute = (x: number) => { return x + 1; };
  // after
  function compute(x: number) { return x + 1; }
  ```
  For an arrow React component:
  ```tsx
  // before
  const Panel = (props: PanelProps) => { return <div/>; };
  // after
  function Panel(props: PanelProps) { return <div/>; }
  ```
  (Inline arrow *callbacks* passed as arguments are NOT flagged by `func-style`.)

- `func-names` — name a function expression:
  ```ts
  // before
  const handler = function () { return 1; };
  // after
  function handler() { return 1; }   // also satisfies func-style
  ```

- `no-restricted-syntax` (inline return type) — extract:
  ```ts
  // before
  function usePropsHost(): { state: number; intents: string } { … }
  // after
  interface PropsHost { state: number; intents: string }
  function usePropsHost(): PropsHost { … }
  ```

- `no-restricted-syntax` (whole-object useHooks) — destructure:
  ```ts
  // before
  const hooks = useHooks();
  const price = hooks.usePrice(pair);
  // after
  const { usePrice } = useHooks();
  const price = usePrice(pair);
  ```

For files under `packages/client-react/tests/ui/contract/**/*.contract.spec.ts` (behavior-frozen): apply only the whitespace/brace autofixes; if `func-style`/`func-names`/destructure would change behavior, add that file path to a scoped `ignores` block in `eslint.config.js` instead of editing it.

- [ ] **Step 4: Reach zero**

Run: `pnpm lint:eslint`
Expected: exit 0, no findings.

- [ ] **Step 5: Prove no behavioral or visual drift**

```bash
pnpm exec biome ci .
pnpm typecheck
pnpm test
pnpm --filter @rtc/client-react test:ui:contract
pnpm test:ui:visual        # MUST pass with NO --update
pnpm build
```
Expected: all green; visual goldens unchanged. If a visual test fails, a style edit changed render output — revert that specific edit and fix the lint finding a non-visual way (do not update goldens).

- [ ] **Step 6: Make the gate blocking** (AST tier needs no build → place right after Biome, before the actionlint step)

In `.github/workflows/ci.yml`, in the `checks` job, immediately after `Lint + format (Biome)` and before `Workflow lint (actionlint)`, add:
```yaml
      - name: ESLint (AST rules)
        run: pnpm lint:eslint
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "style: satisfy ESLint AST rules + make the gate blocking

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: ESLint type-aware tier

**Files:**
- Create: `eslint.config.typed.js`
- Modify: `package.json` (script), source files as flagged, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `eslint.config.js` (Task 5). Produces: script `lint:eslint:types`.

- [ ] **Step 1: Write the type-aware config** (extends the AST config; `projectService` auto-discovers each package's tsconfig)

Create `eslint.config.typed.js`:
```js
import tseslint from "typescript-eslint";
import base from "./eslint.config.js";

export default tseslint.config(
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
);
```

- [ ] **Step 2: Add the local script**

In root `package.json` `scripts`, add:
```json
"lint:eslint:types": "eslint . --config eslint.config.typed.js"
```

- [ ] **Step 3: Build (type-aware needs workspace `.d.ts`) + discovery**

```bash
pnpm build
pnpm lint:eslint:types
```
Record per-rule counts (reuse the JSON one-liner from Task 5 Step 4 with `--config eslint.config.typed.js`). Report to the controller before fixing if non-trivial (these surface real bugs — unawaited promises — so review each).

- [ ] **Step 4: Fix all findings**

Fix each by category:
- `no-floating-promises` — `await` the promise, or explicitly `void` it if fire-and-forget is intended:
  ```ts
  void doThing();           // intentional fire-and-forget
  await doThing();          // otherwise
  ```
- `no-misused-promises` — don't pass an async function where a void callback is expected; wrap it.
- `switch-exhaustiveness-check` — add the missing `case` or a `default` that exhaustively narrows.

- [ ] **Step 5: Reach zero + verify**

```bash
pnpm lint:eslint:types
pnpm exec biome ci . && pnpm typecheck && pnpm test && pnpm build
pnpm test:ui:visual        # no --update
```
Expected: all green.

- [ ] **Step 6: Make blocking** (needs build → after the `Build` step, near the other post-build gates)

In `.github/workflows/ci.yml`, in the `checks` job, after the `Dependency graph (cycles + layering)` step, add:
```yaml
      - name: ESLint (type-aware rules)
        run: pnpm lint:eslint:types
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "ci: add blocking type-aware ESLint gate (no-floating-promises et al.)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Update the roadmap + whole-suite verification

**Files:**
- Modify: `docs/tooling-roadmap.md`

- [ ] **Step 1: Flip the status boxes**

In `docs/tooling-roadmap.md`, update statuses to ✅ for: knip (#2), actionlint (#3), dependency-cruiser (#4), manypkg + syncpack (#5), ESLint (#6). For Custom GritQL rules (#1), change status to ✅ with a note: "Implemented as ESLint rules (item 6); GritQL plugins not built — see spec." Leave Stylelint (Hold) and the Rejected items as-is. Tick the `tsx` quick-win checkbox.

- [ ] **Step 2: Run the entire gate suite end-to-end**

```bash
pnpm install --frozen-lockfile
pnpm exec biome ci .
pnpm lint:eslint
pnpm check:versions
pnpm lint:actions
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @rtc/client-react test:ui:contract:coverage
pnpm lint:dead
pnpm check:deps
pnpm lint:eslint:types
pnpm test:ui:visual
pnpm --filter @rtc/tests gates
```
Expected: every command exits 0; visual goldens unchanged.

- [ ] **Step 3: Commit**

```bash
git add docs/tooling-roadmap.md
git commit -m "docs(tooling-roadmap): mark adopted tools as implemented

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch to merge/PR `feat/dev-tooling-adoption`.

---

## Self-Review

**Spec coverage:** actionlint (T1), manypkg+syncpack+tsx (T2), knip (T3), dependency-cruiser (T4), ESLint AST incl. all 6 custom/style rules (T5–T6), ESLint type-aware (T7), GritQL-not-built + roadmap statuses (T8), block-everything (every tool ends blocking), both version tools (T2), discovery-before-sweep gates (T3 S4, T5 S4, T7 S3), goldens/frozen-spec guardrails (T6 S3/S5, global constraints). All spec sections map to a task.

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Config files and fix transforms are shown in full. The two source-sweep tasks (T6/T7) can't enumerate unknown-until-discovery files, so they give the exact per-rule transform + a discovery step that reports counts first — the correct procedure for a lint sweep, not a placeholder.

**Type/name consistency:** Scripts (`lint:actions`, `check:versions`, `lint:dead`, `check:deps`, `lint:eslint`, `lint:eslint:types`) are defined once and referenced consistently in CI steps. Config filenames consistent (`eslint.config.js`, `eslint.config.typed.js`, `.dependency-cruiser.cjs`, `.syncpackrc.json`, `knip.json`). CI step ordering: ESLint-AST + actionlint + versions after Biome; knip + deps + ESLint-typed after Build (the three that need `dist/`).
