# The RxJS core in its own package — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `@rtc/client-core` into `@rtc/client-core-rxjs` (the RxJS application core) and `@rtc/client-adapters` (the ports every core consumes), with every consumer importing each name from the package that defines it.

**Architecture:** Four PRs, consumers first. A small codemod, driven by the TypeScript checker, repoints imports to each name's defining package; then files move by `git mv`, then the remaining package is renamed. No runtime behaviour changes; the guards are the typecheck, the dependency rules (each proven by a mutant) and the bundle gate.

**Tech Stack:** TypeScript 7 (`tsc`) with the 6.x JS API (`typescript`) for the codemod, pnpm workspaces, Turborepo, dependency-cruiser, Biome, Vitest, Vite.

**Spec:** [`docs/superpowers/specs/2026-10-04-client-core-rxjs-package-split-design.md`](../specs/2026-10-04-client-core-rxjs-package-split-design.md)

## Global Constraints

- One worktree and one PR per phase: `./scripts/new-worktree.sh <name> --ready`. Never edit the primary checkout.
- Never run two builds in one checkout at once.
- No runtime behaviour change in any PR. A test that needs a changed assertion (other than an import path or a snapshot of export names) is a finding, not an edit.
- Files move with `git mv`, so history follows them.
- Every new test and every new or renamed dependency rule is proven by a mutant: `node scripts/mutation-check.mts <spec.json>`.
- `pnpm-lock.yaml` is committed in the PRs that change a package's dependencies (all four do).
- Historical records under `docs/superpowers/` are not rewritten.
- Each outward step (`git push`, `gh pr create`, `gh pr merge`) is its own Bash call.
- Ship flow per PR: full gauntlet on the final tree, one independent reviewer, Minors fixed in the same PR, CI green on the head SHA, CodeQL open alerts 0, then merge with `--merge`, verify ancestry, remove the worktree and branches.
- No deploy. Production `VITE_CORE_IMPL` stays unset.
- Target import style for every rewritten import: types only → `import type { … }`; types and values → one block with inline `type`; never two import declarations from one module.

## Review Focus

- **A type-only import that survives as a runtime edge.** `import { type A } from "x"` with nothing but inline types is kept as `import "x"` under `verbatimModuleSyntax`. From a web client's `src` to a core package that puts the core in the eager bundle. Expect `import type { A } from "x"`. Test: `repointImports` case "types only".
- **References the typecheck cannot see.** String specifiers in `vi.mock` / `jest.mock`, dynamic `import()`, Vite `resolve.alias`, jest `moduleNameMapper`, tsconfig `paths`, `package.json` `exports`, workflow filters. Expect a repo-wide grep for the old specifier to come back empty outside `docs/superpowers/` at the end of PRs 3 and 4.
- **A dependency rule that matches nothing after a rename.** Expect every new or renamed rule to fail on a seeded violation. Test: one mutant per rule.
- **Stale `dist` or turbo cache after a package moves.** Expect `pnpm check:dist` clean and a cold `pnpm build` green in each new worktree. A `TS2306 … is not a module` on an untouched file means a truncated `.d.ts`.
- **React Native resolution.** Metro and jest resolve `@rtc/*` from `dist`, through a hand-written mapper. Expect the RN vitest and jest suites green locally and the Expo bundle smoke green in CI for PRs 1, 3 and 4.

---

## PR 1 — consumers import from the defining package; the pass-throughs go

Worktree: `./scripts/new-worktree.sh core-split-1-repoint --ready`

### Task 1: The import rewriter (pure)

**Files:**
- Create: `tests/scripts/lib/repointImports.ts`
- Test: `tests/scripts/lib/repointImports.test.ts`

**Interfaces:**
- Produces: `repointImports(fileName: string, text: string, map: RepointMap): RepointResult`, with
  `type RepointMap = Readonly<Record<string, Readonly<Record<string, string>>>>` (from-specifier → exported name → new specifier; a name absent from the inner map stays) and
  `interface RepointResult { text: string; moved: number; problems: readonly string[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { type RepointMap, repointImports } from "./repointImports";

describe("repointImports", () => {
  it("moves a type-only import to `import type` from the new home", () => {
    const out = repointImports(
      "a.ts",
      'import type { PanelId, AppPorts } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe(
      'import type { AppPorts, PanelId } from "@rtc/core-api";\n',
    );
    expect(out.moved).toBe(2);
  });

  it("keeps an inline-type-only import erasable: it becomes `import type`", () => {
    const out = repointImports(
      "a.ts",
      'import { type PanelId } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe('import type { PanelId } from "@rtc/core-api";\n');
  });

  it("splits a mixed import by home and leaves the names that stay", () => {
    const out = repointImports(
      "a.ts",
      'import { PANEL_SPECS, WsAdapter, type PanelId } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe(
      [
        'import type { PanelId } from "@rtc/core-api";',
        'import { PANEL_SPECS } from "@rtc/core-logic";',
        'import { WsAdapter } from "@rtc/client-core";',
        "",
      ].join("\n"),
    );
  });

  it("merges into an existing import of the new home as one block with inline `type`", () => {
    const out = repointImports(
      "a.ts",
      [
        'import type { CoreImpl } from "@rtc/core-api";',
        'import { PANEL_SPECS } from "@rtc/core-logic";',
        'import { instanceIdFor, type PanelId } from "@rtc/client-core";',
        "",
      ].join("\n"),
      MAP,
    );

    expect(out.text).toBe(
      [
        'import type { CoreImpl, PanelId } from "@rtc/core-api";',
        'import { instanceIdFor, PANEL_SPECS } from "@rtc/core-logic";',
        "",
      ].join("\n"),
    );
  });

  it("collapses a split type/value pair of the new home into one declaration", () => {
    const out = repointImports(
      "a.ts",
      [
        'import type { WorkspaceDock } from "@rtc/core-logic";',
        'import { PANEL_SPECS } from "@rtc/client-core";',
        "",
      ].join("\n"),
      MAP,
    );

    expect(out.text).toBe(
      'import { PANEL_SPECS, type WorkspaceDock } from "@rtc/core-logic";\n',
    );
  });

  it("keeps an alias", () => {
    const out = repointImports(
      "a.ts",
      'import { PANEL_SPECS as SPECS } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe(
      'import { PANEL_SPECS as SPECS } from "@rtc/core-logic";\n',
    );
  });

  it("rewrites a re-export", () => {
    const out = repointImports(
      "a.ts",
      'export { PANEL_SPECS } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe('export { PANEL_SPECS } from "@rtc/core-logic";\n');
  });

  it("leaves a file alone when nothing in it moves", () => {
    const text = 'import { WsAdapter } from "@rtc/client-core";\n';
    const out = repointImports("a.ts", text, MAP);

    expect(out.text).toBe(text);
    expect(out.moved).toBe(0);
  });

  it("leaves the rest of the file byte for byte, comments included", () => {
    const out = repointImports(
      "a.tsx",
      [
        "// header comment",
        'import { useState } from "react";',
        "",
        "// why this import exists",
        'import type { PanelId } from "@rtc/client-core";',
        "",
        "export const x = <div />;",
        "",
      ].join("\n"),
      MAP,
    );

    expect(out.text).toBe(
      [
        "// header comment",
        'import { useState } from "react";',
        "",
        "// why this import exists",
        'import type { PanelId } from "@rtc/core-api";',
        "",
        "export const x = <div />;",
        "",
      ].join("\n"),
    );
  });

  it("reports a namespace import and a star re-export instead of guessing", () => {
    const out = repointImports(
      "a.ts",
      [
        'import * as core from "@rtc/client-core";',
        'export * from "@rtc/client-core";',
        "",
      ].join("\n"),
      MAP,
    );

    expect(out.moved).toBe(0);
    expect(out.problems).toHaveLength(2);
  });
});

const MAP: RepointMap = {
  "@rtc/client-core": {
    AppPorts: "@rtc/core-api",
    PanelId: "@rtc/core-api",
    PANEL_SPECS: "@rtc/core-logic",
    instanceIdFor: "@rtc/core-logic",
  },
};
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/repointImports.test.ts`
Expected: FAIL — `Cannot find module './repointImports'` (or equivalent resolution error).

- [ ] **Step 3: Implement**

```ts
import ts from "typescript";

/** from-specifier → exported name → the specifier to import it from instead.
 * A name absent from its inner map stays where it is. */
export type RepointMap = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

export interface RepointResult {
  text: string;
  moved: number;
  problems: readonly string[];
}

/** Rewrites every named import and re-export in `text` whose module is a key
 * of `map`, so each name comes from its mapped module. Written to the repo's
 * target import style: types only → `import type { … }`; types and values →
 * ONE declaration with inline `type` (a type-only import spelled with inline
 * `type` survives as a runtime import under `verbatimModuleSyntax`). Names
 * landing in a module the file already imports are merged into that import,
 * and that module's own split type/value declarations collapse into one.
 * Everything outside the touched declarations is left byte for byte. */
export function repointImports(
  fileName: string,
  text: string,
  map: RepointMap,
): RepointResult {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const problems: string[] = [];
  const edits: Edit[] = [];
  const incoming = new Map<string, Spec[]>();
  let anchor: number | undefined;
  let moved = 0;

  for (const node of source.statements) {
    const from = moduleOf(node);
    const names = from === undefined ? undefined : map[from];

    if (from === undefined || names === undefined) {
      continue;
    }

    const specs = namedSpecs(node);

    if (specs === undefined) {
      problems.push(
        `${fileName}: cannot repoint \`${node.getText(source)}\` — only named imports and re-exports are supported`,
      );
      continue;
    }

    const staying = specs.filter((spec) => {
      return names[spec.name] === undefined;
    });

    if (staying.length === specs.length) {
      continue;
    }

    moved += specs.length - staying.length;
    const keyword = ts.isImportDeclaration(node) ? "import" : "export";
    const pieces: string[] = [];

    for (const spec of specs) {
      const target = names[spec.name];

      if (target === undefined) {
        continue;
      }

      if (keyword === "import") {
        incoming.set(target, [...(incoming.get(target) ?? []), spec]);
      } else {
        pieces.push(render("export", target, [spec]));
      }
    }

    if (staying.length > 0) {
      pieces.push(render(keyword, from, staying));
    }

    anchor ??= node.getStart(source);
    edits.push({ ...lineSpan(source, node), text: pieces.join("\n") });
  }

  for (const [target, specs] of incoming) {
    const existing = source.statements.filter((node) => {
      return (
        ts.isImportDeclaration(node) &&
        moduleOf(node) === target &&
        namedSpecs(node) !== undefined
      );
    });
    const merged = dedupe([
      ...existing.flatMap((node) => {
        return namedSpecs(node) ?? [];
      }),
      ...specs,
    ]);
    const [first, ...rest] = existing;

    if (first === undefined) {
      edits.push({
        start: anchor ?? 0,
        end: anchor ?? 0,
        text: `${render("import", target, merged)}\n`,
        insert: true,
      });
      continue;
    }

    edits.push({
      ...lineSpan(source, first),
      text: render("import", target, merged),
    });

    for (const node of rest) {
      edits.push({ ...lineSpan(source, node), text: "" });
    }
  }

  return { text: apply(text, edits), moved, problems };
}

interface Spec {
  name: string;
  alias: string | undefined;
  isType: boolean;
}

interface Edit {
  start: number;
  end: number;
  text: string;
  insert?: boolean;
}

function moduleOf(node: ts.Statement): string | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }

  return undefined;
}

/** The declaration's named specifiers, or `undefined` when it is not purely
 * a named import/re-export (default, namespace, side-effect, `export *`). */
function namedSpecs(node: ts.Statement): Spec[] | undefined {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;

    if (
      clause === undefined ||
      clause.name !== undefined ||
      clause.namedBindings === undefined ||
      !ts.isNamedImports(clause.namedBindings)
    ) {
      return undefined;
    }

    const typeOnly = clause.isTypeOnly;

    return clause.namedBindings.elements.map((element) => {
      return toSpec(element, typeOnly);
    });
  }

  if (
    ts.isExportDeclaration(node) &&
    node.exportClause !== undefined &&
    ts.isNamedExports(node.exportClause)
  ) {
    const typeOnly = node.isTypeOnly;

    return node.exportClause.elements.map((element) => {
      return toSpec(element, typeOnly);
    });
  }

  return undefined;
}

function toSpec(
  element: ts.ImportSpecifier | ts.ExportSpecifier,
  typeOnly: boolean,
): Spec {
  return {
    name: (element.propertyName ?? element.name).text,
    alias:
      element.propertyName === undefined ? undefined : element.name.text,
    isType: typeOnly || element.isTypeOnly,
  };
}

/** One entry per imported binding; a name wanted both as a type and as a
 * value is kept as the value (which also serves as the type). */
function dedupe(specs: readonly Spec[]): Spec[] {
  const byKey = new Map<string, Spec>();

  for (const spec of specs) {
    const key = `${spec.name} as ${spec.alias ?? spec.name}`;
    const seen = byKey.get(key);

    byKey.set(key, {
      ...spec,
      isType: seen === undefined ? spec.isType : seen.isType && spec.isType,
    });
  }

  return [...byKey.values()];
}

function render(
  keyword: "import" | "export",
  module: string,
  specs: readonly Spec[],
): string {
  const allTypes = specs.every((spec) => {
    return spec.isType;
  });
  const names = [...specs]
    .sort((a, b) => {
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    })
    .map((spec) => {
      const binding =
        spec.alias === undefined ? spec.name : `${spec.name} as ${spec.alias}`;

      return !allTypes && spec.isType ? `type ${binding}` : binding;
    });

  return `${keyword}${allTypes ? " type" : ""} { ${names.join(", ")} } from "${module}";`;
}

/** The declaration without its leading comments, up to (not including) its
 * line break — so replacing it keeps the comment above and the newline. */
function lineSpan(
  source: ts.SourceFile,
  node: ts.Node,
): { start: number; end: number } {
  return { start: node.getStart(source), end: node.getEnd() };
}

function apply(text: string, edits: readonly Edit[]): string {
  let out = text;
  const ordered = [...edits].sort((a, b) => {
    return b.start - a.start || Number(a.insert ?? false) - Number(b.insert ?? false);
  });

  for (const edit of ordered) {
    const end =
      edit.text === "" && out[edit.end] === "\n" ? edit.end + 1 : edit.end;

    out = out.slice(0, edit.start) + edit.text + out.slice(end);
  }

  return out;
}
```

- [ ] **Step 4: Run the tests until green**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/repointImports.test.ts`
Expected: PASS, 10 tests. The tests define the behaviour: where the listing above disagrees with a test (declaration order of an inserted import, the order of same-offset edits), fix the listing, not the test. Biome re-sorts imports afterwards, so only the *set* of declarations matters to the real run; the tests pin the exact text so the rewriter stays deterministic.

- [ ] **Step 5: Mutation-check and commit**

Mutants (each must be KILLED by the test file above): `allTypes ? " type" : ""` → `""`; `seen.isType && spec.isType` → `seen.isType || spec.isType`; `names[spec.name] === undefined` → `false`; drop the `for (const node of rest)` deletion loop.

```bash
git add tests/scripts/lib/repointImports.ts tests/scripts/lib/repointImports.test.ts
git commit -m "test(codemod): repointImports — move each import to the module that defines the name"
```

### Task 2: The home map and the command-line driver

**Files:**
- Create: `tests/scripts/lib/homeMap.ts`
- Test: `tests/scripts/lib/homeMap.test.ts`
- Create: `scripts/repoint-imports.mts`

**Interfaces:**
- Consumes: `repointImports`, `RepointMap` (Task 1).
- Produces: `buildHomeMap(entryFile: string, repoRoot: string): Record<string, Home>` with `interface Home { pkg: string; module: string; isValue: boolean }` — for every export of `entryFile`, the workspace package (`packages/<pkg>/src/<module>`) that declares it.
- Produces: `node scripts/repoint-imports.mts --from <specifier>=<entry.ts> [--from …] --scope <dir> [--scope …] [--only-pkg <pkg> …] [--write]`. Without `--write` it prints the files it would change and exits 1 if any problem was reported.

- [ ] **Step 1: Write the failing test**

```ts
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildHomeMap } from "./homeMap";

const REPO = resolve(import.meta.dirname, "../../..");

describe("buildHomeMap", () => {
  const homes = buildHomeMap(
    resolve(REPO, "packages/client-core/src/index.ts"),
    REPO,
  );

  it("follows a re-export to the package that declares the name", () => {
    expect(homes.AppPorts).toMatchObject({ pkg: "core-api", isValue: false });
    expect(homes.PANEL_SPECS).toMatchObject({
      pkg: "core-logic",
      isValue: true,
    });
  });

  it("reports a name the package declares itself as its own", () => {
    expect(homes.WsAdapter).toMatchObject({
      pkg: "client-core",
      module: "adapters/WsAdapter.ts",
      isValue: true,
    });
  });

  it("resolves every export — none is left without a workspace home", () => {
    const unresolved = Object.entries(homes).filter(([, home]) => {
      return home.pkg === "";
    });

    expect(unresolved).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/homeMap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildHomeMap`**

```ts
import path from "node:path";

import ts from "typescript";

export interface Home {
  /** Workspace package directory name (`core-api`), or `""` if the
   * declaration is outside `packages/<pkg>/src`. */
  pkg: string;
  /** Path of the declaring module under that package's `src/`. */
  module: string;
  isValue: boolean;
}

/** For every export of `entryFile`: the workspace package whose source
 * declares it, found by following re-export aliases with the type checker.
 * `@rtc/<pkg>` resolves to that package's `src` through
 * `tsconfig.depcruise.json`'s path pairs; a package's own `#/…` alias
 * resolves to its own `src/`. */
export function buildHomeMap(
  entryFile: string,
  repoRoot: string,
): Record<string, Home> {
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(repoRoot, "tsconfig.depcruise.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      },
    },
  );

  if (config === undefined) {
    throw new Error("tsconfig.depcruise.json did not parse");
  }

  const paths: Record<string, string[]> = {};

  for (const [key, targets] of Object.entries(config.options.paths ?? {})) {
    paths[key] = targets.map((target) => {
      return path.resolve(repoRoot, target);
    });
  }

  const options: ts.CompilerOptions = {
    ...config.options,
    baseUrl: repoRoot,
    paths,
    noEmit: true,
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options);

  host.resolveModuleNames = (names, containingFile) => {
    return names.map((name) => {
      return (
        resolveOwnAlias(name, containingFile) ??
        ts.resolveModuleName(name, containingFile, options, ts.sys)
          .resolvedModule
      );
    });
  };

  const program = ts.createProgram({ rootNames: [entryFile], options, host });
  const checker = program.getTypeChecker();
  const entry = program.getSourceFile(entryFile);
  const moduleSymbol =
    entry === undefined ? undefined : checker.getSymbolAtLocation(entry);

  if (moduleSymbol === undefined) {
    throw new Error(`${entryFile} is not a module`);
  }

  const homes: Record<string, Home> = {};

  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const target =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
    const file = target.declarations?.[0]?.getSourceFile().fileName ?? "";
    const match = path
      .relative(repoRoot, file)
      .match(/^packages\/([^/]+)\/src\/(.*)$/);

    homes[exported.getName()] = {
      pkg: match?.[1] ?? "",
      module: match?.[2] ?? file,
      isValue: (target.flags & ts.SymbolFlags.Value) !== 0,
    };
  }

  return homes;
}

function resolveOwnAlias(
  name: string,
  containingFile: string,
): ts.ResolvedModuleFull | undefined {
  const own = containingFile.match(/^(.*\/packages\/[^/]+)\/src\//);

  if (!name.startsWith("#/") || own === null) {
    return undefined;
  }

  for (const extension of [".ts", ".tsx", "/index.ts"]) {
    const candidate = `${own[1]}/src/${name.slice(2)}${extension}`;

    if (ts.sys.fileExists(candidate)) {
      return {
        resolvedFileName: candidate,
        extension: extension === ".tsx" ? ts.Extension.Tsx : ts.Extension.Ts,
      };
    }
  }

  return undefined;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/homeMap.test.ts`
Expected: PASS, 3 tests. (A probe of this resolver on 2026-10-04 resolved all 423 root exports: 100 `core-api` types, 169 `core-logic` names, 14 `domain`/`shared` names, 140 declared by `client-core` itself.)

- [ ] **Step 5: Write the driver `scripts/repoint-imports.mts`**

```ts
#!/usr/bin/env node
// Moves each named import to the module that defines the name.
//
//   node scripts/repoint-imports.mts --from <specifier>=<entry.ts> [--from …]
//        [--map <RepointMap.json>] [--only-pkg <pkg> …]
//        --scope <dir> [--scope …] [--write]
//
// `--from` asks the TypeScript checker where every export of <entry.ts> is
// declared and repoints each name that lives in ANOTHER package to
// `@rtc/<that package>`. `--map` adds an explicit map, for names that have
// already moved and so are no longer exports of the old module. Without
// `--write` nothing is written. Exit code 1 if any import could not be
// rewritten (a namespace import, a star re-export).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";

import { buildHomeMap, type Home } from "../tests/scripts/lib/homeMap.ts";
import { repointImports } from "../tests/scripts/lib/repointImports.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIPPED = new Set([
  "node_modules",
  "dist",
  ".expo",
  "ios",
  "android",
  "coverage",
  ".turbo",
  "reports",
]);

const flags = readFlags(argv.slice(2));
const map: Record<string, Record<string, string>> =
  flags.map === undefined ? {} : JSON.parse(readFileSync(flags.map, "utf8"));

for (const from of flags.from) {
  const cut = from.indexOf("=");
  const specifier = from.slice(0, cut);
  const entry = from.slice(cut + 1);
  const ownPkg = entry.match(/packages\/([^/]+)\/src\//)?.[1] ?? "";
  const names: Record<string, string> = { ...map[specifier] };

  for (const [name, home] of Object.entries(
    buildHomeMap(resolve(ROOT, entry), ROOT),
  )) {
    const target = targetOf(specifier, ownPkg, home);

    if (
      target !== undefined &&
      (flags.onlyPkg.length === 0 || flags.onlyPkg.includes(home.pkg))
    ) {
      names[name] = target;
    }
  }

  map[specifier] = names;
}

let files = 0;
let names = 0;
const problems: string[] = [];

for (const scope of flags.scope) {
  for (const file of listSourceFiles(resolve(ROOT, scope))) {
    const text = readFileSync(file, "utf8");
    const result = repointImports(relative(ROOT, file), text, map);

    problems.push(...result.problems);

    if (result.text === text) {
      continue;
    }

    files += 1;
    names += result.moved;
    console.log(`${relative(ROOT, file)}: ${result.moved} names`);

    if (flags.write) {
      writeFileSync(file, result.text);
    }
  }
}

console.log(
  `\n${files} files, ${names} names, ${problems.length} problems${flags.write ? "" : " (dry run)"}`,
);

for (const problem of problems) {
  console.error(problem);
}

exit(problems.length > 0 ? 1 : 0);

interface Flags {
  from: string[];
  scope: string[];
  onlyPkg: string[];
  map: string | undefined;
  write: boolean;
}

function readFlags(args: readonly string[]): Flags {
  const flags: Flags = {
    from: [],
    scope: [],
    onlyPkg: [],
    map: undefined,
    write: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1] ?? "";

    if (flag === "--write") {
      flags.write = true;
    } else if (flag === "--from") {
      flags.from.push(value);
      index += 1;
    } else if (flag === "--scope") {
      flags.scope.push(value);
      index += 1;
    } else if (flag === "--only-pkg") {
      flags.onlyPkg.push(value);
      index += 1;
    } else if (flag === "--map") {
      flags.map = value;
      index += 1;
    } else {
      throw new Error(`unknown flag ${flag}`);
    }
  }

  return flags;
}

/** Where a name imported from `specifier` should come from instead, or
 * `undefined` to leave it. A name another package declares goes to that
 * package. A name `client-core` declares in its RxJS core, imported from the
 * ROOT, goes to the `./core` subpath — the root stops exporting it. */
function targetOf(
  specifier: string,
  ownPkg: string,
  home: Home,
): string | undefined {
  if (home.pkg === "") {
    return undefined;
  }

  if (home.pkg !== ownPkg) {
    return `@rtc/${home.pkg}`;
  }

  const inCore =
    home.module.startsWith("presenters/") || home.module === "composition.ts";

  return specifier === "@rtc/client-core" && inCore
    ? "@rtc/client-core/core"
    : undefined;
}

function listSourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) {
        found.push(...listSourceFiles(join(dir, entry.name)));
      }
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(join(dir, entry.name));
    }
  }

  return found;
}
```

- [ ] **Step 6: Dry run**

Run: `node scripts/repoint-imports.mts --from @rtc/client-core=packages/client-core/src/index.ts --from @rtc/client-core/core=packages/client-core/src/core.ts --scope packages --scope tests`
Expected: a list of roughly 270 files, a total near 700 names (574 to `@rtc/core-api`, about 112 to `@rtc/core-logic`, about 19 to `@rtc/shared` / `@rtc/domain`), `0 problems`, exit 0. Nothing written.

- [ ] **Step 7: Commit**

```bash
git add tests/scripts/lib/homeMap.ts tests/scripts/lib/homeMap.test.ts scripts/repoint-imports.mts
git commit -m "chore(codemod): repoint-imports — the TypeScript checker says where each name lives"
```

### Task 3: Repoint every consumer

**Files:**
- Modify: about 270 `.ts`/`.tsx` files under `packages/*` and `tests/` (generated).
- Modify: `package.json` and `tsconfig.json` of `client-react`, `client-solid`, `client-react-native`, `react-bindings`, `solid-bindings`, `ui-contract`, `tests`; `pnpm-lock.yaml`.
- Modify: `.dependency-cruiser.mts` allowlists, where `check:deps` reports a now-direct edge.

- [ ] **Step 1: Add the direct dependencies the rewritten imports need**

`@rtc/core-logic` to `client-react`, `client-solid`, `ui-contract` (`dependencies`) and to `react-bindings`, `solid-bindings` (`devDependencies`, tests only); `@rtc/core-api` and `@rtc/core-logic` to `client-react-native`; whatever of `@rtc/core-api`, `@rtc/core-logic`, `@rtc/shared`, `@rtc/domain` the `tests` workspace lacks. Add the matching tsconfig `references` in packages that use them. Then `pnpm install`.

- [ ] **Step 2: Run the codemod and format**

```bash
node scripts/repoint-imports.mts --from @rtc/client-core=packages/client-core/src/index.ts --from @rtc/client-core/core=packages/client-core/src/core.ts --scope packages --scope tests --write
pnpm exec biome check --write packages tests
```

Expected: the same file list as the dry run, `0 problems`.

- [ ] **Step 3: Build, typecheck, and settle the dependency rules**

```bash
pnpm build && pnpm typecheck && pnpm check:deps && pnpm check:scripts
```

Expected: all green. Where `check:deps` reports a consumer's new direct edge to `core-api`, `core-logic`, `shared` or `domain` against an allowlist rule (`react-bindings-no-apps`, `solid-bindings-no-apps`, `ui-contract-stays-neutral`), widen that rule's allowlist by that package and no further. Where `check:scripts` (`check-package-wiring.mts`) reports a missing wiring for a newly depended-on package, add it.

- [ ] **Step 4: Prove nothing outside the package still takes a pass-through name from it**

Run: `node scripts/repoint-imports.mts --from @rtc/client-core=packages/client-core/src/index.ts --from @rtc/client-core/core=packages/client-core/src/core.ts --scope packages --scope tests`
Expected: `0 files`, `0 names`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: every consumer imports each name from the package that defines it"
```

### Task 4: Remove the pass-throughs from `@rtc/client-core`

**Files:**
- Modify: `packages/client-core/src/index.ts`, `packages/client-core/src/presenters/index.ts`, the eight presenter modules that re-export from another package.
- Delete: `packages/client-core/src/adapters/{jarvisPort,jarvisUsagePort,sessionStore,IWsAdapter}.ts`, `packages/client-core/src/layout/layoutPresets.ts`, `packages/client-core/src/theme/colorSchemeSource.ts`.
- Modify: the files inside `packages/client-core/src` that import through any of the above.
- Create: `tests/scripts/lib/packageSurfaces.test.ts`
- Modify: `packages/client-core/src/__snapshots__/*.snap`.

- [ ] **Step 1: Repoint the package's own imports**

For each of the six pass-through modules and each presenter module with a cross-package re-export, run the codemod scoped to the package with that module as the entry, for example:

```bash
node scripts/repoint-imports.mts --from "#/adapters/jarvisPort=packages/client-core/src/adapters/jarvisPort.ts" --scope packages/client-core --write
```

(one `--from` per module; they can be passed together). Relative imports (`"../X"`) are not covered: the typecheck in Step 3 lists them, and each is fixed by hand.

- [ ] **Step 2: Delete the re-exports**

In `index.ts` remove `export * from "@rtc/core-logic"`, the `export type { App, … } from "@rtc/core-api"` block, `export type * from "#/presenters/index"`, and the `export *` lines of the six deleted modules. In `presenters/index.ts` remove `export type { SessionUser } from "@rtc/domain"`. In the eight presenter modules remove every `export { … } from "@rtc/…"`, every `export type { … }` of imported types, and every `export const X = IMPORTED_X` alias. Delete the six pass-through files.

- [ ] **Step 3: Typecheck, test, update the snapshots**

```bash
pnpm --filter @rtc/client-core typecheck
pnpm --filter @rtc/client-core exec vitest run -u src/publicApi.test.ts src/core.publicApi.test.ts
pnpm build && pnpm typecheck
```

Expected: green. The root snapshot keeps only names `client-core` declares (adapters, helpers); the `/core` snapshot keeps the composition root and the names the presenter modules declare. Read both diffs: a name that disappears and is not a pass-through is a finding. In `core.publicApi.test.ts` the "presenter barrel's values" test loses its `@rtc/core-logic` exemption (no barrel name is on the root any more): assert `leaked` against the root keys directly.

- [ ] **Step 4: Add the test that keeps it so**

Create `tests/scripts/lib/packageSurfaces.test.ts`:

```ts
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildHomeMap } from "./homeMap";

const REPO = resolve(import.meta.dirname, "../../..");

/** An implementation package exports what it declares and nothing else: a
 * name another package declares is imported from that package, never
 * through a pass-through "so existing imports keep working". The checker
 * follows every re-export, so a type-only pass-through is caught too. */
describe("package entry points export only names the package declares", () => {
  it.each(ENTRIES)("$pkg ($entry)", ({ pkg, entry }) => {
    const homes = buildHomeMap(resolve(REPO, "packages", pkg, entry), REPO);
    const foreign = Object.entries(homes)
      .filter(([, home]) => {
        return home.pkg !== pkg;
      })
      .map(([name, home]) => {
        return `${name} (declared in ${home.pkg})`;
      });

    // Positive witness: the map is not empty, so `foreign` being empty
    // means something.
    expect(Object.keys(homes).length).toBeGreaterThan(0);
    expect(foreign).toEqual([]);
  });
});

const ENTRIES: readonly { pkg: string; entry: string }[] = [
  { pkg: "client-core", entry: "src/index.ts" },
  { pkg: "client-core", entry: "src/core.ts" },
  { pkg: "client-core-async", entry: "src/index.ts" },
  { pkg: "client-core-effect", entry: "src/index.ts" },
];
```

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/packageSurfaces.test.ts`
Expected: PASS, 4 cases (a probe on 2026-10-04 found the two alternative cores already clean: 83 and 128 exports, all their own). Mutant: add `export { BOOT_DURATION_MS } from "@rtc/domain";` to `packages/client-core/src/presenters/BootSequenceMachine.ts` → the `src/core.ts` case FAILS naming `BOOT_DURATION_MS (declared in domain)`. `ENTRIES` is updated in PR 3 (`client-core-rxjs`, `src/index.ts`) and PR 4 (`client-adapters`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(client-core): remove every pass-through re-export"
```

### Task 5: Verify and ship PR 1

- [ ] **Step 1:** Full gauntlet on the final tree (`/rtc:gauntlet full`), `pnpm check:core-bundle`, the RN jest suite (`pnpm --filter @rtc/client-react-native exec jest`), and one e2e leg (`pnpm test:e2e`). Expected: all green; the bundle table unchanged within 0.5 KB of main.
- [ ] **Step 2:** `node scripts/mutation-check.mts` over the mutants of Tasks 1 and 4 (the four rewriter mutants and the pass-through mutant). Expected: all KILLED.
- [ ] **Step 3:** One independent reviewer over the diff, with the Review Focus list verbatim. Fix Critical, Important and Minor findings in this PR.
- [ ] **Step 4:** Docs in this PR: `CLAUDE.md` ("Re-exported whole by client-core" leaves the `core-logic` line), `packages/client-core/README.md`, `docs/development.md` where it shows an import of a contract type from `@rtc/client-core`.
- [ ] **Step 5:** Push, open the PR, CI green, CodeQL 0, merge, clean up.

---

## PR 2 — the view helpers move to `@rtc/core-logic`

Worktree: `./scripts/new-worktree.sh core-split-2-helpers --ready`

### Task 6: Move the six helper modules

**Files:**
- Move: `packages/client-core/src/blotter/{columnSort,filterState}.ts` (+ tests) → `packages/core-logic/src/blotter/`
- Move: `packages/client-core/src/admin/adminKpisVm.ts` (+ test) → `packages/core-logic/src/admin/`
- Move: `packages/client-core/src/layout/{lockedWidth,maximizeBoundary,visibleRoot}.ts` (+ tests) → `packages/core-logic/src/layout/`
- Modify: `packages/core-logic/src/index.ts`, `packages/client-core/src/index.ts`, `packages/client-core/src/{blotter,layout}/index.ts`
- Modify: the 38 consumer files (generated)

- [ ] **Step 1: Record the names that move, before moving them**

Run: `node scripts/repoint-imports.mts --from @rtc/client-core=packages/client-core/src/index.ts --scope packages --scope tests` — expected `0 files` (PR 1's end state). Then save the home map's names whose `module` is one of the six files; these are the names Step 4 sends to `@rtc/core-logic`.

- [ ] **Step 2: Move the files**

`git mv` each module and its test. Inside the moved layout helpers, `from "@rtc/core-logic"` becomes the `#/…` path of the module that declares the name (a package does not import its own entry). Add `export * from "#/blotter/columnSort"` and the five siblings to `core-logic`'s index; remove the corresponding lines from `client-core`'s index and delete its now-empty `blotter/index.ts`.

- [ ] **Step 3: Check core-logic's own rules still hold**

Run: `pnpm --filter @rtc/core-logic test && pnpm check:deps`
Expected: green — the helpers import only `@rtc/domain` and core-logic itself, which `core-logic-stays-pure` and `core-logic-stays-inner` allow.

- [ ] **Step 4: Repoint the consumers**

The names are no longer exports of `@rtc/client-core`, so the checker cannot map them; pass the list saved in Step 1 as an explicit map: `node scripts/repoint-imports.mts --map <names.json> --scope packages --scope tests --write` (add the `--map` flag to the driver: a JSON `RepointMap` used as-is), then `pnpm exec biome check --write packages tests`.

- [ ] **Step 5: Build, typecheck, test**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: green; the moved test files report the same test counts as before the move.

- [ ] **Step 6: Docs, verify, ship**

`CLAUDE.md` and §6/§13: `@rtc/core-logic`'s charter reads "pure rules, no stream library, shared by the cores and the UIs". Full gauntlet, `check:core-bundle`, reviewer, ship flow.

```bash
git add -A
git commit -m "refactor(core-logic): the pure view helpers move in from client-core"
```

---

## PR 3 — extract `@rtc/client-core-rxjs`

Worktree: `./scripts/new-worktree.sh core-split-3-extract --ready`

### Task 7: Baseline, then scaffold the package

**Files:**
- Create: `packages/client-core-rxjs/{package.json,tsconfig.json,vitest.config.ts,README.md}`
- Modify: `tsconfig.depcruise.json`, `knip.json`, `.claude-sandbox.json`

- [ ] **Step 1: Record the bundle baseline**

Run `pnpm check:core-bundle` and a sourcemap build of each web client (`pnpm exec vite build --sourcemap --outDir <scratch>` in the client's directory); keep the size tables in the scratchpad. These are the "before" numbers Task 10 compares against.

- [ ] **Step 2: Create the package files**

`packages/client-core-rxjs/package.json` (dependency versions copied from `packages/client-core/package.json` as they stand that day):

```json
{
  "name": "@rtc/client-core-rxjs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "imports": {
    "#/*": "./src/*"
  },
  "scripts": {
    "build": "tsc --build && tsc-alias -p tsconfig.json && node ../../scripts/check-dist.mts",
    "typecheck": "tsc --noEmit --tsBuildInfoFile .turbo/typecheck.tsbuildinfo",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports coverage 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "dependencies": {
    "@rtc/core-api": "workspace:*",
    "@rtc/core-logic": "workspace:*",
    "@rtc/domain": "workspace:*",
    "@rtc/shared": "workspace:*",
    "@rx-state/core": "^0.1.4",
    "rxjs": "^7.8"
  },
  "devDependencies": {
    "@rtc/client-core": "workspace:*",
    "@rtc/core-contract": "workspace:*",
    "@types/node": "^26.2.0",
    "@vitest/coverage-v8": "^5.0.3",
    "tsc-alias": "1.9.5",
    "vitest": "^5.0.3"
  }
}
```

`tsconfig.json` and `vitest.config.ts`: copies of `client-core`'s, with tsconfig `references` to `core-api`, `core-logic`, `domain`, `shared` and (for tests) `client-core`. `client-core` itself drops its `@rtc/core-contract` devDependency if no contract runner is left in it after Task 8. Add the `tsconfig.depcruise.json` path pair, the `knip.json` workspace entry and the three `.claude-sandbox.json` lines.

- [ ] **Step 3: Install and confirm the wiring checker sees it**

Run: `pnpm install && pnpm check:scripts`
Expected: green, or a named missing wiring to add.

### Task 8: Move the core

**Files:**
- Move: `packages/client-core/src/presenters/` → `packages/client-core-rxjs/src/presenters/`
- Move: `packages/client-core/src/composition.ts` and `composition.*.test.ts` → `packages/client-core-rxjs/src/`
- Move: `packages/client-core/src/core.ts` → `packages/client-core-rxjs/src/index.ts`
- Move: `packages/client-core/src/layout/{createLayoutPresets,workspacePersistenceWriter}.ts` (+ tests) → `packages/client-core-rxjs/src/layout/`
- Move: `packages/client-core/src/adapters/{delayedAuthPort,readPreferenceNow}.ts` (+ tests) → `packages/client-core-rxjs/src/ports/`
- Move: every test under `packages/client-core/src` that imports any of the above, with its snapshot
- Modify: `packages/client-core/package.json` (drop `./core`), `packages/client-core/src/index.ts`

- [ ] **Step 1: Confirm the adapters do not need what is leaving**

Run: `grep -rnE 'from "#/(presenters|composition|core|layout/createLayoutPresets|layout/workspacePersistenceWriter|adapters/delayedAuthPort|adapters/readPreferenceNow)' packages/client-core/src --include='*.ts' | grep -v '\.test\.'` restricted to files that stay.
Expected: no line from a staying non-test file. A hit is a finding: decide whether that module moves too, and ledger the ruling.

- [ ] **Step 2: Move with `git mv`, then fix the moved files' imports**

Inside the new package: `#/adapters/delayedAuthPort` → `#/ports/delayedAuthPort`, `#/adapters/readPreferenceNow` → `#/ports/readPreferenceNow`; any other `#/adapters/…`, `#/blotter/…`, `#/layout/…` import of a name that stayed behind becomes `@rtc/client-core` (tests only — `src` must import nothing from it). The index keeps `export * from "#/presenters/index"`, the composition-root exports and `rxjsCore`.

- [ ] **Step 3: Split the four straddling tests**

`core.publicApi.test.ts` is deleted (Task 9 replaces it). `layout/__tests__/createLayoutPresets.test.ts` moves with its subject. For `layout/__tests__/workspaceDock.test.ts` and `adapters/wsRealJarvis.contract.test.ts`: if the subject is a core module, move the file; otherwise move only the cases that construct a presenter or machine into a new test beside that presenter in the new package.

- [ ] **Step 4: Typecheck and test both packages**

Run: `pnpm --filter @rtc/client-core-rxjs build && pnpm --filter @rtc/client-core build && pnpm --filter @rtc/client-core-rxjs test && pnpm --filter @rtc/client-core test`
Expected: green; the two packages' test counts add up to `client-core`'s count before the move.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: the RxJS core moves into @rtc/client-core-rxjs"
```

### Task 9: Repoint the 95 import sites; rules and brand

**Files:**
- Modify: every file containing `"@rtc/client-core/core"`
- Modify: `packages/client-{react,solid}/package.json`, `packages/client-react-native/package.json`, `packages/{react,solid}-bindings/package.json`, `packages/ui-contract/package.json`, `tests/package.json`
- Modify: `packages/client-{react,solid}/vite.config.ts`, `packages/client-react-native/jest.config.js`
- Modify: `.dependency-cruiser.mts`, `docs/dependency-cruiser.md`
- Modify: `packages/client-core-rxjs/src/composition.ts` (brand), `tests/scripts/lib/coreBundle.ts`, `tests/scripts/lib/coreBundle.test.ts`, `scripts/check-core-bundle.mts`
- Create: `packages/client-core-rxjs/src/publicApi.test.ts`

- [ ] **Step 1: Rename the specifier everywhere**

```bash
grep -rlF '@rtc/client-core/core' packages tests scripts --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.js' --include='*.json' | grep -v node_modules | xargs perl -pi -e 's{\@rtc/client-core/core}{\@rtc/client-core-rxjs}g'
```

Then by hand: both `vite.config.ts` alias maps (delete the `/core` entry, add `"@rtc/client-core-rxjs": pkgSrc("client-core-rxjs")` and fix the comment); the jest `moduleNameMapper` (replace the `/core$` line with `"^@rtc/client-core-rxjs$": "<rootDir>/../client-core-rxjs/dist/index.js"`); add `@rtc/client-core-rxjs` to each consumer's `package.json` (`dependencies` for the two web clients and React Native; `devDependencies` for the bindings, `ui-contract` and `tests`). `pnpm install`.

- [ ] **Step 2: The brand**

`RXJS_CORE_BRAND = "@rtc/client-core-rxjs:brand"`; the same string in `tests/scripts/lib/coreBundle.ts` and its test's `RXJS_MARKER`. Run `pnpm --filter @rtc/tests exec vitest run scripts/lib/coreBundle.test.ts`; expected PASS.

- [ ] **Step 3: The rules (write each, watch its mutant fail, then pass)**

In `.dependency-cruiser.mts`: delete `client-core-root-is-the-edge`; rename `alt-cores-no-client-core-at-runtime` to `cores-never-import-each-other` and widen it to all three `client-core-(rxjs|async|effect)` packages, tests included; re-scope `client-core-src-uses-core-contract-only-in-tests` to `packages/client-core-rxjs/src` (the contract runner moved) under the name `client-core-rxjs-src-uses-core-contract-only-in-tests`; add `cores-take-ports-as-arguments` (no `client-core-*` `src` file, tests excluded, imports `@rtc/client-core`), `client-adapters-imports-no-core` (`packages/client-core/src` imports no `client-core-*`), `client-core-rxjs-stays-inner` and `client-core-rxjs-framework-free` (copies of the two `client-core` rules), and `web-clients-load-cores-lazily` (from `packages/client-(react|solid)/src`, not tests, to any `client-core-(rxjs|async|effect)`, with `dynamic: false`).

Mutants, one per rule, each run with `pnpm check:deps` and expected to FAIL:

| Rule | Seeded violation |
|---|---|
| `cores-never-import-each-other` | `import { createApp } from "@rtc/client-core-rxjs";` in a `client-core-async` test |
| `cores-take-ports-as-arguments` | `import { WsAdapter } from "@rtc/client-core";` in `client-core-rxjs/src/composition.ts` |
| `client-adapters-imports-no-core` | `import { rxjsCore } from "@rtc/client-core-rxjs";` in `client-core/src/adapters/portFactory.ts` |
| `client-core-rxjs-framework-free` | `import "react";` in `client-core-rxjs/src/composition.ts` |
| `web-clients-load-cores-lazily` | `import { rxjsCore } from "@rtc/client-core-rxjs";` in `client-react/src/app/coreSelection.ts` |

If the `dynamic: false` mutant is not killed (the attribute does not behave as documented), drop that rule and record in the PR body that `check:core-bundle` is its only witness.

- [ ] **Step 4: Pin the new surface**

```ts
import { describe, expect, it } from "vitest";

import * as rxjsCorePackage from "#/index";

/** The whole RxJS core's runtime surface: the composition root and, for
 * tests and harnesses that construct one directly, every presenter class and
 * machine factory. An addition here is a decision, not a side effect. */
describe("@rtc/client-core-rxjs public runtime API", () => {
  it("has a pinned runtime surface", () => {
    expect(Object.keys(rxjsCorePackage).sort()).toMatchSnapshot();
  });

  it("exports the composition root", () => {
    expect(Object.keys(rxjsCorePackage)).toEqual(
      expect.arrayContaining([
        "RXJS_CORE_BRAND",
        "createApp",
        "createMachineFactories",
        "rxjsCore",
      ]),
    );
  });
});
```

- [ ] **Step 5: Nothing names the subpath any more**

Run: `grep -rnF '@rtc/client-core/core' . --include='*' -r --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.turbo --exclude-dir=.git | grep -v '^./docs/superpowers/'`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: import the RxJS core from @rtc/client-core-rxjs; one rule set for three sibling cores"
```

### Task 10: Verify and ship PR 3

- [ ] **Step 1:** Cold `pnpm build`, `pnpm check:dist`, full gauntlet, RN jest.
- [ ] **Step 2:** `pnpm check:core-bundle` and the sourcemap builds again. Expected: each eager set and each of the three core chunks within 0.5 KB gzip of the Task 7 baseline; the RxJS chunk's sources now under `packages/client-core-rxjs/`.
- [ ] **Step 3:** The three e2e legs: `pnpm test:e2e`, `pnpm test:e2e:async`, `pnpm test:e2e:effect`. Each run's output goes to its own file and is read whole, never filtered. Expected: every scenario and every Playwright test passed.
- [ ] **Step 4:** Mutation spec over Task 9's five rule mutants plus: removing `export * from "#/presenters/index"` from the new index (snapshot test FAILS).
- [ ] **Step 5:** Docs in this PR: `CLAUDE.md` (package table gains the new package; the count becomes twenty-six; the application-core rule), §6 graph, §13, §14, §22, `docs/dependency-cruiser.md`, the new package's README, `scripts/check-core-bundle.mts` header.
- [ ] **Step 6:** Reviewer, ship flow.

---

## PR 4 — rename `@rtc/client-core` to `@rtc/client-adapters`

Worktree: `./scripts/new-worktree.sh core-split-4-rename --ready`

### Task 11: Rename the package

**Files:**
- Move: `packages/client-core/` → `packages/client-adapters/`
- Modify: every file that names `@rtc/client-core` or `packages/client-core` exactly (not `client-core-rxjs`, `-async`, `-effect`)

- [ ] **Step 1: Move and rename**

```bash
git mv packages/client-core packages/client-adapters
grep -rlE '@rtc/client-core(?![-\w])|packages/client-core(?![-\w])|"client-core"' -P packages tests scripts .github .dependency-cruiser.mts knip.json tsconfig.depcruise.json .claude-sandbox.json eslint.config.mts turbo.json 2>/dev/null | grep -v node_modules | xargs perl -pi -e 's{\@rtc/client-core(?![-\w])}{\@rtc/client-adapters}g; s{packages/client-core(?![-\w])}{packages/client-adapters}g'
```

Then by hand, reading each hit of `grep -rnE 'client-core(?![-\w])' -P` outside `docs/` and `node_modules`: the dependency rule names (`client-core-stays-inner` → `client-adapters-stays-inner`, `client-core-framework-free` → `client-adapters-framework-free`, both re-scoped to `packages/client-adapters/src`) and their path patterns, the Vite alias `pkgSrc("client-core")`, the jest mapper path, tsconfig `references` paths, comments. `pnpm install`.

- [ ] **Step 2: Build cold and gate**

Run: `pnpm clean && pnpm install && pnpm build && pnpm check:dist && pnpm typecheck && pnpm test && pnpm check:deps && pnpm check:scripts && pnpm lint:dead`
Expected: all green.

- [ ] **Step 3: Re-prove the renamed rules**

Mutants, each expected to FAIL `pnpm check:deps`: `import "react";` in `packages/client-adapters/src/adapters/WsAdapter.ts` (`client-adapters-framework-free`); `import { rxjsCore } from "@rtc/client-core-rxjs";` in `packages/client-adapters/src/adapters/portFactory.ts` (`client-adapters-imports-no-core`); `import { WsAdapter } from "@rtc/client-adapters";` in `packages/client-core-rxjs/src/composition.ts` (`cores-take-ports-as-arguments`).

- [ ] **Step 4: Nothing names the old package**

Run: `grep -rnE 'client-core(?![-\w])' -P . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.turbo --exclude-dir=.git | grep -v '^./docs/superpowers/' | grep -v '^./docs/'`
Expected: no output. (Docs are Task 12.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: @rtc/client-core becomes @rtc/client-adapters"
```

### Task 12: Docs, the record, and the codemod's retirement

**Files:**
- Modify: the 69 current docs that mention `client-core` (not `docs/superpowers/`), `CLAUDE.md`, package READMEs
- Modify: `docs/adr/ADR-006-pluggable-application-core.md`, `docs/STATUS.md`
- Delete: `scripts/repoint-imports.mts`, `tests/scripts/lib/repointImports.ts` and its test (`homeMap.ts` stays: `packageSurfaces.test.ts` uses it)

- [ ] **Step 1: Rewrite the current docs**

For each file from `grep -rlE 'client-core(?![-\w])' -P docs CLAUDE.md README.md packages/*/README.md | grep -v docs/superpowers`: read each mention and rewrite it for what it now means — the adapters (`@rtc/client-adapters`), the RxJS core (`@rtc/client-core-rxjs`), or, in a dated historical passage, the old name left as it was with "(now `@rtc/client-adapters` / `@rtc/client-core-rxjs`)" on first mention. No blind replace: the old name meant two things.

- [ ] **Step 2: The record**

ADR-006: an "Amended <date> — the RxJS core in its own package" paragraph under Decision 6 (what moved, the four PRs, the bundle numbers from Task 10), Follow-up 10 struck. `docs/STATUS.md`: this workstream's entry is deleted; the runtime-switch entry's order note drops its first item.

- [ ] **Step 3: Retire the codemod**

Delete the driver and `repointImports.ts` with its test; keep `homeMap.ts`, its test and `packageSurfaces.test.ts`, with `ENTRIES` now naming `client-core-rxjs`, `client-core-async`, `client-core-effect` and `client-adapters`. Run `pnpm lint:dead && pnpm --filter @rtc/tests test:report`; expected green.

- [ ] **Step 4: Verify and ship**

`pnpm check:doc-links`, full gauntlet, `check:core-bundle`, the three e2e legs, RN jest, reviewer, ship flow.

```bash
git add -A
git commit -m "docs: the three sibling cores and @rtc/client-adapters; retire the import codemod"
```
