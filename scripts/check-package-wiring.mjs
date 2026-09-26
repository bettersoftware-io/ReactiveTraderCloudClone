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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const RN_CLIENT = "@rtc/client-react-native";

function readManifests() {
  const packagesDir = join(repoRoot, "packages");
  const manifests = new Map();

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    const manifestPath = join(packagesDir, entry.name, "package.json");

    if (entry.isDirectory() && existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
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

// tsconfig.depcruise.json is JSONC. Its comments are whole-line `//` and its
// strings never contain `//`, so dropping comment lines is enough to parse it.
function readDepcruisePaths() {
  const raw = readFileSync(join(repoRoot, "tsconfig.depcruise.json"), "utf8");
  const json = raw
    .split("\n")
    .filter((line) => {
      return !line.trim().startsWith("//");
    })
    .join("\n");

  return JSON.parse(json).compilerOptions?.paths ?? {};
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
    queue.push(...workspaceDepsOf(manifests.get(name), ["dependencies"]));
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
    return workspaceDepsOf(manifest, [
      "dependencies",
      "devDependencies",
      "peerDependencies",
    ]);
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
const jestConfig = readFileSync(
  join(repoRoot, "packages", "client-react-native", "jest.config.js"),
  "utf8",
);

for (const name of runtimeClosure(manifests, RN_CLIENT)) {
  if (!jestConfig.includes(`"^${name}$"`)) {
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
