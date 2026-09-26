// Asserts the two hand-maintained per-package wirings that FAIL SILENTLY when
// a package is added and they are forgotten — both missed for @rtc/core-logic
// (pluggable-core slice 8, PR #829) and found late:
//
// 1. tsconfig.depcruise.json path pair. dependency-cruiser resolves an
//    `@rtc/<pkg>` import through this file's `paths`; without the pair it
//    resolves to the package's dist/ (excluded) and EVERY boundary rule skips
//    that package's edges — the dependency graph reads green on nothing.
//    Required for every workspace package another workspace package depends
//    on: the exact `@rtc/<pkg>` entry and the `@rtc/<pkg>/*` subpath entry.
//
// 2. The React Native client's jest `moduleNameMapper`. Jest pins each @rtc
//    package to its dist by an explicit entry, so a package reached at runtime
//    through a dependency's re-export fails every RN suite with "Cannot find
//    module" (34 suites, #829). Required for every @rtc package in the RN
//    client's transitive runtime `dependencies`.
//
// Unconditional, no allowlist: a gap is fixed by adding the entry. Zero
// dependencies (Node built-ins only). Chained from `pnpm check:scripts`.
// Workspaces come from pnpm-workspace.yaml, so the `tests` workspace counts:
// dependency-cruiser scans it (`check:deps` runs over `packages tests`), and
// it is the ONLY dependent of @rtc/client-react and @rtc/server.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { listWorkspaceDirs, readManifest, repoRoot } from "./workspaces.mjs";

const RN_CLIENT = "@rtc/client-react-native";
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

function readManifests() {
  const manifests = new Map();

  for (const dir of listWorkspaceDirs()) {
    const manifest = readManifest(dir);

    if (manifest?.name) {
      manifests.set(manifest.name, manifest);
    }
  }

  return manifests;
}

function workspaceDepsOf(manifest, fields) {
  return fields.flatMap((field) => {
    return Object.entries(manifest[field] ?? {})
      .filter(([, range]) => {
        return String(range).startsWith("workspace:");
      })
      .map(([name]) => {
        return name;
      });
  });
}

// JSONC → JSON: drops `//` line comments and `/* */` block comments wherever
// they sit (whole-line or trailing), leaving string contents untouched — a
// path string may legitimately contain `//` or `/*`.
function stripJsonComments(text) {
  let out = "";
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      const start = index;
      index += 1;

      while (index < text.length && text[index] !== '"') {
        index += text[index] === "\\" ? 2 : 1;
      }

      index += 1;
      out += text.slice(start, index);
    } else if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") {
        index += 1;
      }
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
    } else {
      out += char;
      index += 1;
    }
  }

  return out;
}

function readDepcruisePaths() {
  const raw = readFileSync(join(repoRoot, "tsconfig.depcruise.json"), "utf8");

  return JSON.parse(stripJsonComments(raw)).compilerOptions?.paths ?? {};
}

// The REAL mapper keys, from the loaded config — a text search would be
// satisfied by a commented-out entry. jest.config.js is plain CommonJS.
function readRnJestMapperKeys() {
  const configPath = join(
    repoRoot,
    "packages",
    "client-react-native",
    "jest.config.js",
  );
  const config = createRequire(import.meta.url)(configPath);

  return new Set(Object.keys(config.moduleNameMapper ?? {}));
}

function runtimeClosure(manifests, root) {
  const seen = new Set();
  const queue = [root];

  while (queue.length > 0) {
    const name = queue.pop();

    if (seen.has(name) || !manifests.has(name)) {
      continue;
    }

    seen.add(name);
    queue.push(
      ...workspaceDepsOf(manifests.get(name), [
        "dependencies",
        "optionalDependencies",
      ]),
    );
  }

  seen.delete(root);
  return [...seen].sort();
}

const manifests = readManifests();
const problems = [];

// 1. dependency-cruiser path pairs.
const depcruisePaths = readDepcruisePaths();
const dependedOn = new Set(
  [...manifests.values()].flatMap((manifest) => {
    return workspaceDepsOf(manifest, DEPENDENCY_FIELDS);
  }),
);

for (const name of [...dependedOn].sort()) {
  for (const key of [name, `${name}/*`]) {
    if (!(key in depcruisePaths)) {
      problems.push(
        `tsconfig.depcruise.json is missing paths["${key}"] — without it dependency-cruiser resolves ${name} to dist/ (excluded) and no boundary rule sees its edges`,
      );
    }
  }
}

// 2. The RN client's jest moduleNameMapper.
const mapperKeys = readRnJestMapperKeys();

for (const name of runtimeClosure(manifests, RN_CLIENT)) {
  if (!mapperKeys.has(`^${name}$`)) {
    problems.push(
      `packages/client-react-native/jest.config.js moduleNameMapper is missing "^${name}$" — ${name} is in ${RN_CLIENT}'s runtime dependency tree, so a dependency's re-export of it fails every RN suite with "Cannot find module"`,
    );
  }
}

if (problems.length > 0) {
  console.error("✖ Package wiring gate:\n");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error(
    "\nAdd each missing entry (see the other packages' entries in the same file for the shape), then re-run `pnpm check:scripts`.",
  );
  process.exit(1);
}

console.log(
  `✓ Package wiring gate: all ${dependedOn.size} depended-on workspace packages have a tsconfig.depcruise.json path pair, ` +
    `and the RN client's jest maps every @rtc package in its runtime dependency tree.`,
);
