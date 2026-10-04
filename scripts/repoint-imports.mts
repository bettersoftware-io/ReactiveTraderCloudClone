#!/usr/bin/env node
// Moves each named import to the module that defines the name.
//
//   node scripts/repoint-imports.mts --from <specifier>=<entry.ts> [--from …]
//        [--map <RepointMap.json>] [--only-pkg <pkg> …]
//        --scope <dir> [--scope …] [--own <pkg> …] [--write]
//
// `--from` asks the TypeScript checker where every export of <entry.ts> is
// declared and repoints each name that lives in ANOTHER package to
// `@rtc/<that package>`. `--map` adds an explicit map, for names that have
// already moved and so are no longer exports of the old module. `--own`
// does the same INSIDE a package: every `#/…` or relative import in
// `packages/<pkg>/src` that reaches another package's name through one of the
// package's own modules is repointed to that package. Without `--write`
// nothing is written. Exit code 1 if any import could not be rewritten (a
// namespace import, a star re-export).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
const map: Record<string, Record<string, string>> = flags.map === undefined
  ? {}
  : JSON.parse(readFileSync(flags.map, "utf8"));

let files = 0;
let names = 0;
const problems: string[] = [];

for (const from of flags.from) {
  const cut = from.indexOf("=");
  const specifier = from.slice(0, cut);
  const entry = from.slice(cut + 1);
  const ownPkg = entry.match(/packages\/([^/]+)\/src\//)?.[1] ?? "";
  const names: Record<string, string> = { ...map[specifier] };

  for (const [name, home] of Object.entries(
    buildHomeMap(resolve(ROOT, entry), ROOT),
  )) {
    const target = targetOf(ownPkg, home);

    if (target !== undefined && home.name !== name) {
      problems.push(
        `${entry}: \`${name}\` is \`${home.name}\` renamed — repoint its importers by hand`,
      );
      continue;
    }

    if (
      target !== undefined &&
      (flags.onlyPkg.length === 0 || flags.onlyPkg.includes(home.pkg))
    ) {
      names[name] = target;
    }
  }

  map[specifier] = names;
}

for (const scope of flags.scope) {
  for (const file of listSourceFiles(resolve(ROOT, scope))) {
    rewriteFile(file, map);
  }
}

for (const pkg of flags.own) {
  const src = resolve(ROOT, "packages", pkg, "src");
  const foreignNames = new Map<string, Record<string, string>>();

  for (const file of listSourceFiles(src)) {
    const ownMap: Record<string, Record<string, string>> = {};

    for (const [, specifier = ""] of readFileSync(file, "utf8").matchAll(
      /from "((?:#\/|\.\.?\/)[^"]+)"/g,
    )) {
      const module = resolveOwnModule(specifier, file, src);

      if (module === undefined) {
        continue;
      }

      const foreign = foreignNames.get(module) ?? listForeignNames(module, pkg);

      foreignNames.set(module, foreign);

      if (Object.keys(foreign).length > 0) {
        ownMap[specifier] = foreign;
      }
    }

    rewriteFile(file, ownMap);
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
  own: string[];
  map: string | undefined;
  write: boolean;
}

function readFlags(args: readonly string[]): Flags {
  const flags: Flags = {
    from: [],
    scope: [],
    onlyPkg: [],
    own: [],
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
    } else if (flag === "--own") {
      flags.own.push(value);
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

function rewriteFile(
  file: string,
  fileMap: Record<string, Record<string, string>>,
): void {
  const text = readFileSync(file, "utf8");
  const result = repointImports(relative(ROOT, file), text, fileMap);

  problems.push(...result.problems);

  if (result.text === text) {
    return;
  }

  files += 1;
  names += result.moved;
  console.log(`${relative(ROOT, file)}: ${result.moved} names`);

  if (flags.write) {
    writeFileSync(file, result.text);
  }
}

/** The module file a `#/…` or relative specifier names, if it is one of the
 * package's own source modules. */
function resolveOwnModule(
  specifier: string,
  containingFile: string,
  src: string,
): string | undefined {
  // A relative import may spell out an extension (`./x.js`, `./x.ts`).
  const bare = specifier.replace(/\.(?:js|tsx?)$/, "");
  const base = bare.startsWith("#/")
    ? join(src, bare.slice(2))
    : resolve(dirname(containingFile), bare);

  return [".ts", ".tsx", "/index.ts"]
    .map((extension) => {
      return `${base}${extension}`;
    })
    .find((candidate) => {
      return existsSync(candidate);
    });
}

/** The names `module` exports that another package declares, each mapped to
 * that package's specifier. */
function listForeignNames(module: string, pkg: string): Record<string, string> {
  const foreign: Record<string, string> = {};

  for (const [name, home] of Object.entries(buildHomeMap(module, ROOT))) {
    if (home.pkg === "" || home.pkg === pkg) {
      continue;
    }

    if (home.name === name) {
      foreign[name] = `@rtc/${home.pkg}`;
    } else {
      problems.push(
        `${relative(ROOT, module)}: \`${name}\` is \`${home.name}\` renamed — repoint its importers by hand`,
      );
    }
  }

  return foreign;
}

/** Where a name should come from instead, or `undefined` to leave it: a
 * name another package declares goes to that package. */
function targetOf(ownPkg: string, home: Home): string | undefined {
  if (home.pkg === "") {
    return undefined;
  }

  return home.pkg === ownPkg ? undefined : `@rtc/${home.pkg}`;
}

function listSourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) {
        found.push(...listSourceFiles(join(dir, entry.name)));
      }
    } else if (/\.[cm]?tsx?$/.test(entry.name)) {
      found.push(join(dir, entry.name));
    }
  }

  return found;
}
