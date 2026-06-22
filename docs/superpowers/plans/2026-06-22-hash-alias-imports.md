# `#/` Subpath-Alias Imports + Deep-Relative-Import Ban — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every ≥2-level relative import (`../../…`) across the repo with a `#/` subpath alias, and add a Biome lint that forbids `../../` going forward (one `../` stays allowed).

**Architecture:** Node's package.json `imports` field provides the `#/` alias at runtime (Vite/Vitest/Playwright/tsx resolve it natively); tsconfig `paths` mirror it for `tsc`. For packages built with `tsc --build` and consumed from `dist/` (domain, shared, server), a `tsc-alias` post-build step rewrites `#/` back to relative paths in the emitted `.js`/`.d.ts` so `dist/` stays self-contained. A deterministic codemod performs the bulk rewrite; `biome check --write` re-sorts the rewritten imports into the existing `:ALIAS:` group; a `noRestrictedImports` rule then locks the door.

**Tech Stack:** Biome 2.5.0, TypeScript (`moduleResolution: "bundler"`), Vite 8 / Vitest 4, Playwright, pnpm workspaces + Turborepo, `tsc-alias` (new devDep, build-time only).

## Global Constraints

- **Notation is `#/`** (package.json `imports`), NOT `@/`. Per-package alias roots: client-react `#/*`→`./src/*` and `#tests/*`→`./tests/*`; domain/shared/server `#/*`→`./src/*`; top-level tests `#/*`→`./*`.
- **Threshold:** one level up (`../foo`) is allowed and untouched. Two-or-more (`../../…`) must use an alias. Lint pattern is exactly `["../../**"]`.
- **Biome policy (unchanged):** zero findings, NO rule disables. Every rewrite must leave `biome ci` green. No `"off"` entries.
- **Visual goldens MUST NOT be regenerated.** Never pass `--update`/`--update-snapshots`. Import-path changes do not alter rendering; goldens must stay green as-is.
- **Contract spec files:** import-path rewrites are pre-approved as non-semantic. Do NOT change any assertion, scenario, or behavior in `*.contract.spec.ts` — only their import specifiers may change (via the codemod + biome sort).
- **`@rtc/domain` runtime deps:** still only `rxjs`. `tsc-alias` is a **devDependency** (build-time) — this is allowed.
- **dist/ is a mounted volume in the sandbox** — `rm -rf packages/*/dist` fails with "Device or resource busy". To force a clean rebuild use `find packages/<pkg>/dist -mindepth 1 -delete` (removes contents incl. `tsconfig.tsbuildinfo`), then build.
- **No `cd`** (zoxide hook errors). Use `pnpm -C <dir> …`, `env -C <dir> …`, or absolute paths.
- **Commits:** end every commit message with the trailer exactly:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Do NOT** add `@/`-style tsconfig paths, vite alias plugins, or a JS bundler to the libs. `tsc-alias` is the only new mechanism.

### Verified facts (spiked 2026-06-22, all reverted)

- Runtime: Vitest, Playwright, and tsx all resolve `#/` from the `imports` field with **zero** runner config. (Contract spec through a `#tests/`-converted page: 8/8 passed. tsx + standalone Playwright: passed.)
- `tsc` does **not** read `imports`; it needs tsconfig `paths`. With paths added, `tsc --noEmit` passed.
- `tsc-alias` on domain: raw `tsc` emit leaked `#/fx/trade.js`; after `tsc-alias` the `.js` and `.d.ts` were rewritten to `../../fx/trade.js`; the built file loaded at runtime; domain typecheck + 175 tests passed; zero `#/` left in `dist`.
- Biome's `:ALIAS:` group (already reserved in `biome.jsonc`) catches `#/…` and `#tests/…` with no config change.
- `noRestrictedImports` `{group:["../../**"]}` flags depth ≥2 (incl. 3,4,…) and passes depth 0,1.

### Import inventory (baseline, for verification)

| Package | ≥2-up imports | Targets |
|---|---|---|
| `packages/client-react` | 159 | 122 → `#/`, 37 → `#tests/` |
| `packages/domain` | 7 | all → `#/` (in `src/ports/__contracts__/`) |
| top-level `tests` | 25 | all → `#/` (browser 16, presenter 8, scripts 1) |
| `packages/shared`, `packages/server` | 0 | capability-wiring only |

---

### Task 1: Migration codemod script

**Files:**
- Create: `tests/scripts/migrate-imports.ts` (temporary; deleted in Task 6)

**Interfaces:**
- Produces: a CLI run as `pnpm -C tests exec tsx scripts/migrate-imports.ts <client-react|domain|tests>`; honors `DRY=1` to count without writing. Resolves each ≥2-up relative specifier to an absolute path, classifies it against the package's ordered alias roots, and rewrites it to the alias form. Throws if a specifier resolves outside the package or matches no root.

- [ ] **Step 1: Write the codemod**

Create `tests/scripts/migrate-imports.ts` with exactly:

```ts
#!/usr/bin/env tsx
// One-shot migration: rewrite >=2-level relative imports to #/ (and #tests/)
// subpath aliases. DELETED after the migration lands (see plan Task 6).
//
// Usage (from anywhere): pnpm -C tests exec tsx scripts/migrate-imports.ts <pkg> [--dry]
//   <pkg> in { client-react | domain | tests }
// Pass --dry to report counts without writing.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

type AliasMap = ReadonlyArray<readonly [string, string]>; // [relPrefix, aliasPrefix]

const PKGS: Record<string, { dir: string; aliases: AliasMap }> = {
  "client-react": {
    dir: "packages/client-react",
    aliases: [
      ["tests/", "#tests/"],
      ["src/", "#/"],
    ],
  },
  domain: { dir: "packages/domain", aliases: [["src/", "#/"]] },
  tests: { dir: "tests", aliases: [["", "#/"]] },
};

const which = process.argv[2];
const cfg = PKGS[which];
if (!cfg) {
  console.error(`usage: migrate-imports <${Object.keys(PKGS).join(" | ")}>`);
  process.exit(1);
}

const dry = process.argv.includes("--dry");
const repoRoot = execSync("git rev-parse --show-toplevel", {
  encoding: "utf8",
}).trim();
const pkgRoot = resolve(repoRoot, cfg.dir);

const files = execSync(
  `git ls-files "${cfg.dir}/**/*.ts" "${cfg.dir}/**/*.tsx"`,
  { cwd: repoRoot, encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean)
  .filter((f) => !f.includes("/dist/"))
  .filter((f) => !f.endsWith("scripts/migrate-imports.ts"));

// matches: from "../../x" | from '../../x' | import("../../x") | import('../../x')
const specRe = /(from\s*|import\(\s*)(["'])((?:\.\.\/){2,}[^"']*)\2/g;

let rewrites = 0;
let touchedFiles = 0;
for (const f of files) {
  const abs = resolve(repoRoot, f);
  const src = readFileSync(abs, "utf8");
  let touched = false;
  const out = src.replace(specRe, (_m, pre, q, spec) => {
    const target = resolve(dirname(abs), spec);
    const rel = relative(pkgRoot, target);
    if (rel.startsWith("..")) {
      throw new Error(`${f}: "${spec}" resolves OUTSIDE the package (${rel})`);
    }
    const hit = cfg.aliases.find(([p]) => rel.startsWith(p));
    if (!hit) {
      throw new Error(`${f}: "${spec}" -> "${rel}" matches no alias root`);
    }
    const [relPrefix, aliasPrefix] = hit;
    rewrites += 1;
    touched = true;
    return `${pre}${q}${aliasPrefix}${rel.slice(relPrefix.length)}${q}`;
  });
  if (touched) {
    touchedFiles += 1;
    if (!dry) writeFileSync(abs, out);
  }
}
console.log(
  `${which}: ${dry ? "[dry] would rewrite" : "rewrote"} ${rewrites} imports across ${touchedFiles} files`,
);
```

- [ ] **Step 2: Verify it lints clean**

Run: `pnpm exec biome check tests/scripts/migrate-imports.ts`
Expected: no errors (exit 0).

- [ ] **Step 3: Dry-run self-check against the known baseline**

Run:
```bash
pnpm -C tests exec tsx scripts/migrate-imports.ts client-react --dry
pnpm -C tests exec tsx scripts/migrate-imports.ts domain --dry
pnpm -C tests exec tsx scripts/migrate-imports.ts tests --dry
```
Expected (counts must be non-zero and match the inventory ±a few for dynamic imports):
- `client-react: [dry] would rewrite 159 imports across …`
- `domain: [dry] would rewrite 7 imports across …`
- `tests: [dry] would rewrite 25 imports across …`

If any command **throws** ("resolves OUTSIDE" / "matches no alias root"), STOP and report — the alias map needs a new root. Confirm the working tree is unchanged: `git status --porcelain` is empty (dry run writes nothing).

- [ ] **Step 4: Commit**

```bash
git add tests/scripts/migrate-imports.ts
git commit -m "chore: add one-shot relative->#/ import codemod

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migrate `client-react`

**Files:**
- Modify: `packages/client-react/package.json` (add `imports`; add `tsc-alias` to build/dev + devDep)
- Modify: `packages/client-react/tsconfig.json` (add `paths`)
- Modify: `packages/client-react/tsconfig.ui-contract.json` (add `#/` + `#tests/` paths)
- Modify: `packages/client-react/tsconfig.ui-visual.json` (add `#/` + `#tests/` paths)
- Modify: ~70 source/test files under `packages/client-react/{src,tests}` (via codemod + biome sort)

**Interfaces:**
- Consumes: the codemod from Task 1.
- Produces: client-react resolves `#/…`→`./src/…` and `#tests/…`→`./tests/…` in `tsc`, Vite, and Vitest. Other packages still consume client-react via its `types` field (`./dist/index.d.ts`), so the `.d.ts` emit is run through `tsc-alias`.

- [ ] **Step 1: Add the `imports` field**

Edit `packages/client-react/package.json` — insert directly after the `"exports": { … }` block:
```jsonc
  "imports": {
    "#/*": "./src/*",
    "#tests/*": "./tests/*"
  },
```

- [ ] **Step 2: Add `tsc-alias` devDep + wire the declaration build**

Run: `pnpm -C packages/client-react add -D -E tsc-alias`
(Confirm the pinned version is a current stable release ≥ 1.8.0; `tsc-alias` has no install scripts, so no `allowBuilds` entry is needed.)

Then edit the `"build"` script in `packages/client-react/package.json` to append the alias step:
```jsonc
"build": "vite build && tsc -p tsconfig.types.json --noCheck && tsc-alias -p tsconfig.types.json",
```

- [ ] **Step 3: Add tsconfig `paths`**

In `packages/client-react/tsconfig.json`, add to `compilerOptions`:
```jsonc
    "paths": { "#/*": ["./src/*"] },
```
In `packages/client-react/tsconfig.ui-contract.json`, extend the existing `paths` (keep `@ui-contract`):
```jsonc
    "paths": {
      "@ui-contract": ["./tests/ui/contract/shared"],
      "@ui-contract/*": ["./tests/ui/contract/shared/*"],
      "#/*": ["./src/*"],
      "#tests/*": ["./tests/*"]
    }
```
In `packages/client-react/tsconfig.ui-visual.json`, extend the existing `paths` (keep `@ui-visual`):
```jsonc
    "paths": {
      "@ui-visual": ["./tests/ui/visual/react"],
      "@ui-visual/*": ["./tests/ui/visual/react/*"],
      "#/*": ["./src/*"],
      "#tests/*": ["./tests/*"]
    }
```
(`tsconfig.types.json` extends `tsconfig.json`, so it inherits `#/*` automatically — no edit needed there.)

- [ ] **Step 4: Run the codemod**

Run: `pnpm -C tests exec tsx scripts/migrate-imports.ts client-react`
Expected: `client-react: rewrote 159 imports across …` (no throw).

- [ ] **Step 5: Re-sort imports with Biome**

Run: `pnpm exec biome check --write packages/client-react`
Expected: rewritten `#/…` imports are reordered into the `:ALIAS:` group; exit 0. Spot-check `git diff packages/client-react/tests/ui/contract/react/registry.tsx` — the `../../../../src/ui/…` lines are now `#/ui/…` grouped together.

- [ ] **Step 6: Typecheck**

Run: `pnpm -C packages/client-react typecheck`
Expected: exit 0 (all four tsc programs: main, node, ui-visual, ui-contract).

- [ ] **Step 7: Build and confirm no alias leaks into dist**

Run:
```bash
find packages/client-react/dist -mindepth 1 -delete 2>/dev/null
pnpm -C packages/client-react build
grep -rn '#/' packages/client-react/dist | wc -l
```
Expected: build succeeds; the `grep … | wc -l` prints `0` (Vite bundles the `.js`; `tsc-alias` cleaned the `.d.ts`).

- [ ] **Step 8: Run the unit + UI test tiers (NO --update)**

Run:
```bash
pnpm -C packages/client-react test
pnpm -C packages/client-react test:ui:contract
pnpm -C packages/client-react test:ui:visual:vitest-browser:react
```
Expected: all pass. The visual tier compares against committed goldens with no `--update`; goldens stay green (rendering unchanged).

- [ ] **Step 9: Biome gate on the package**

Run: `pnpm exec biome ci packages/client-react`
Expected: exit 0 (zero findings; imports correctly sorted).

- [ ] **Step 10: Commit**

```bash
git add packages/client-react
git commit -m "refactor(client-react): migrate >=2-up relative imports to #/ and #tests/ aliases

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Migrate `domain` (with `tsc-alias`)

**Files:**
- Modify: `packages/domain/package.json` (add `imports`; add `tsc-alias` to build/dev + devDep)
- Modify: `packages/domain/tsconfig.json` (add `paths`)
- Modify: 6 files under `packages/domain/src/ports/__contracts__/` (7 imports, via codemod + biome sort)

**Interfaces:**
- Consumes: codemod from Task 1.
- Produces: domain source uses `#/…` (resolving to `./src/*` for `tsc`/Vitest); its built `dist/` is rewritten back to relative by `tsc-alias`, so external consumers (shared, server, tests, client-react) that load `dist/*.js` / `dist/*.d.ts` see only relative specifiers. domain's runtime deps stay `rxjs`-only.

- [ ] **Step 1: Add the `imports` field**

Edit `packages/domain/package.json` — insert after the `"exports": { … }` block:
```jsonc
  "imports": {
    "#/*": "./src/*"
  },
```

- [ ] **Step 2: Add `tsc-alias` devDep + wire build and dev (watch) scripts**

Run: `pnpm -C packages/domain add -D -E tsc-alias`

Edit `packages/domain/package.json` scripts:
```jsonc
    "build": "tsc --build && tsc-alias -p tsconfig.json",
    "dev": "tsc-alias -w -p tsconfig.json & tsc --build --watch",
```
(The `dev` watch must also run `tsc-alias` because `pnpm dev` makes Vite load domain from `dist/`; without it, dev `dist/` would carry leaked `#/`.)

- [ ] **Step 3: Add tsconfig `paths`**

In `packages/domain/tsconfig.json`, add to `compilerOptions` (after `"outDir": "dist",`):
```jsonc
    "paths": { "#/*": ["./src/*"] },
```

- [ ] **Step 4: Run the codemod**

Run: `pnpm -C tests exec tsx scripts/migrate-imports.ts domain`
Expected: `domain: rewrote 7 imports across 6 files`. The rewritten specifiers keep their `.js` extension (e.g. `#/fx/trade.js`).

- [ ] **Step 5: Re-sort imports with Biome**

Run: `pnpm exec biome check --write packages/domain`
Expected: exit 0.

- [ ] **Step 6: Typecheck**

Run: `pnpm -C packages/domain typecheck`
Expected: exit 0.

- [ ] **Step 7: Clean build + verify dist is alias-free**

Run:
```bash
find packages/domain/dist -mindepth 1 -delete 2>/dev/null
pnpm -C packages/domain build
grep -rn '#/' packages/domain/dist | wc -l
```
Expected: build succeeds; `grep … | wc -l` prints `0`.

- [ ] **Step 8: Prove the built `dist/` resolves at runtime**

Run:
```bash
node --input-type=module -e 'import("./packages/domain/dist/ports/__contracts__/ExecutionPortContract.js").then(m=>console.log("DIST LOAD OK",Object.keys(m))).catch(e=>{console.error("FAIL",e.message);process.exit(1)})'
```
Expected: `DIST LOAD OK [ 'describeExecutionPortContract' ]`.

- [ ] **Step 9: Run domain tests (source-side `#/` resolution)**

Run: `pnpm -C packages/domain test`
Expected: 175 passed (or the current full count) — all green.

- [ ] **Step 10: Commit**

```bash
git add packages/domain
git commit -m "refactor(domain): migrate >=2-up imports to #/; add tsc-alias build step

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Migrate the top-level `tests` package

**Files:**
- Modify: `tests/package.json` (add `imports`)
- Modify: `tests/tsconfig.json` (add `paths`)
- Modify: ~files under `tests/{browser,presenter,scripts}` (25 imports, via codemod + biome sort)

**Interfaces:**
- Consumes: codemod from Task 1. Not built/consumed, so NO `tsc-alias`.
- Produces: `#/*`→`./*` resolves across all of this package's runners (vitest, playwright, tsx/cucumber). Cypress is verified on CI only (cannot run on local aarch64).

- [ ] **Step 1: Add the `imports` field**

Edit `tests/package.json` — insert after `"private": true,` (this package has no `exports`):
```jsonc
  "imports": {
    "#/*": "./*"
  },
```

- [ ] **Step 2: Add tsconfig `paths`**

In `tests/tsconfig.json`, add to `compilerOptions`:
```jsonc
    "paths": { "#/*": ["./*"] },
```

- [ ] **Step 3: Run the codemod**

Run: `pnpm -C tests exec tsx scripts/migrate-imports.ts tests`
Expected: `tests: rewrote 25 imports across …` (no throw). The codemod must NOT rewrite `tests/scripts/migrate-imports.ts` itself (it has only node-builtin imports).

- [ ] **Step 4: Re-sort imports with Biome**

Run: `pnpm exec biome check --write tests`
Expected: exit 0.

- [ ] **Step 5: Typecheck**

Run: `pnpm -C tests typecheck`
Expected: exit 0.

- [ ] **Step 6: Run the locally-runnable suites**

Run:
```bash
pnpm -C tests test:presenter:vitest-fake-timers
pnpm -C tests test:presenter:vitest-quickpickle-fake-timers
pnpm -C tests test:browser:playwright
pnpm -C tests gates
```
Expected: all pass. (`test:browser:playwright` starts its own dev server via `with-server.ts`.) Cypress suites are NOT run locally (aarch64 busy-spin) — they are covered by CI; note this explicitly in the task report.

- [ ] **Step 7: Biome gate on the package**

Run: `pnpm exec biome ci tests`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add tests
git commit -m "refactor(tests): migrate >=2-up relative imports to #/ alias

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire `shared` + `server` for the alias (capability only)

**Files:**
- Modify: `packages/shared/package.json`, `packages/server/package.json` (add `imports`; add `tsc-alias` to build/dev + devDep)
- Modify: `packages/shared/tsconfig.json`, `packages/server/tsconfig.json` (add `paths`)

**Interfaces:**
- Produces: both libs become `#/`-capable and alias-safe (tsc-alias on emit), so the repo-wide lint in Task 6 is coherent everywhere. **No imports are rewritten** — both packages currently have zero ≥2-up imports.

- [ ] **Step 1: Confirm there is nothing to migrate**

Run: `for p in shared server; do echo "$p: $(grep -rhoE 'from "(\.\./){2,}' packages/$p/src 2>/dev/null | wc -l | tr -d ' ')"; done`
Expected: `shared: 0` and `server: 0`. (If non-zero, run the codemod for that package — but extend `PKGS` in the codemod first; not expected.)

- [ ] **Step 2: Add `imports` + `paths` + `tsc-alias` to each**

For each of `packages/shared` and `packages/server`:

Add to `package.json` after `"exports"` (shared) / after `"private": true,` (server — confirm whether it has `exports` and place accordingly):
```jsonc
  "imports": {
    "#/*": "./src/*"
  },
```
Run: `pnpm -C packages/shared add -D -E tsc-alias` and `pnpm -C packages/server add -D -E tsc-alias`

Update each `package.json` `build`/`dev` scripts (match each package's existing build; both are `tsc --build`):
```jsonc
    "build": "tsc --build && tsc-alias -p tsconfig.json",
    "dev": "tsc-alias -w -p tsconfig.json & tsc --build --watch",
```
(Only add a `dev` line if one already exists for that package; otherwise just update `build`.)

Add to each `tsconfig.json` `compilerOptions`:
```jsonc
    "paths": { "#/*": ["./src/*"] },
```

- [ ] **Step 3: Build both + confirm clean (tsc-alias is a no-op here)**

Run:
```bash
for p in shared server; do find packages/$p/dist -mindepth 1 -delete 2>/dev/null; pnpm -C packages/$p build; echo "$p dist #/ count: $(grep -rn '#/' packages/$p/dist | wc -l | tr -d ' ')"; done
```
Expected: both build; both print `dist #/ count: 0`.

- [ ] **Step 4: Typecheck + test both**

Run: `pnpm -C packages/shared typecheck && pnpm -C packages/server typecheck && pnpm -C packages/server test`
Expected: exit 0 / green (shared has no tests; skip if its `test` script is a no-op).

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/server
git commit -m "chore(shared,server): wire #/ alias capability (imports+paths+tsc-alias)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Enable the lint, remove the codemod, full-repo verification

**Files:**
- Modify: `biome.jsonc` (add `style.noRestrictedImports`)
- Delete: `tests/scripts/migrate-imports.ts`

**Interfaces:**
- Consumes: all prior migrations (every package now alias-clean).
- Produces: a repo-wide rule that fails CI on any `../../…` import.

- [ ] **Step 1: Add the rule to `biome.jsonc`**

In `biome.jsonc`, under `linter.rules.style` (alongside `useComponentExportOnlyModules`), add:
```jsonc
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "patterns": [
              {
                "group": ["../../**"],
                "message": "Imports may go at most one level up (\"../\"). For anything deeper use the #/ alias (or #tests/ in client-react tests). Built libs rewrite #/ to relative at build time via tsc-alias."
              }
            ]
          }
        }
```

- [ ] **Step 2: Prove the gate FIRES (diagnose-first)**

Temporarily add a deep import to a scratch file and confirm Biome errors:
```bash
printf 'import { x } from "../../foo/bar";\nexport const y = x;\n' > packages/client-react/src/__lintprobe__.ts
pnpm exec biome lint packages/client-react/src/__lintprobe__.ts; echo "exit: $?"
rm packages/client-react/src/__lintprobe__.ts
```
Expected: a `lint/style/noRestrictedImports` error and non-zero exit. (Confirms the rule is active, not silently inert.) Then confirm removal: `git status --porcelain` shows only `biome.jsonc` + the codemod deletion staged later.

- [ ] **Step 3: Remove the codemod script**

Run: `git rm tests/scripts/migrate-imports.ts`

- [ ] **Step 4: Full-repo Biome gate (zero findings, incl. the new rule)**

Run: `pnpm exec biome ci .`
Expected: exit 0. If it reports any `noRestrictedImports` error, a deep import was missed — rerun the codemod for that package, biome-sort, and re-verify before continuing.

- [ ] **Step 5: Full-repo typecheck, test, build**

Run:
```bash
pnpm typecheck
pnpm test
pnpm build
```
Expected: all green. (`pnpm build` exercises every `tsc-alias` step; a leak would surface as a downstream resolution error.)

- [ ] **Step 6: Confirm no `#/` leaked into any dist**

Run: `grep -rn '#/' packages/*/dist 2>/dev/null | wc -l`
Expected: `0`.

- [ ] **Step 7: Commit**

```bash
git add biome.jsonc
git commit -m "feat(lint): forbid >=2-level relative imports (noRestrictedImports); drop codemod

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 8: Update project memory**

After merge, update `project_biome_formatter_linter.md` (and add a note to `MEMORY.md` if needed): record the `#/` convention, per-package alias roots, the `tsc-alias` build step for tsc-built libs, and the `noRestrictedImports ["../../**"]` gate. (This is a notebook step for the controller, not a subagent task.)

---

## Non-goals / out of scope

- Unifying the pre-existing `@ui-contract` / `@ui-visual` tsconfig aliases with `#/` — left as-is (orthogonal; not relative imports).
- Lowering the threshold to ban `../` (one level) — explicitly allowed.
- Converting `@rtc/*` workspace imports — those are bare package specifiers, untouched.
- A JS bundler for the libs — rejected in favor of `tsc-alias`.
