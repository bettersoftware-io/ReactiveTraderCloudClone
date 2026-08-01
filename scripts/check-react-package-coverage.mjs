// Asserts every package that imports React has made an EXPLICIT decision about
// the three React policies, so a newly-added React package can never silently
// inherit no protection.
//
// The problem this closes: each policy is a hand-maintained list keyed on
// package name — the memo ban's `files` globs, the `react-hooks` block's globs,
// and per-package React Compiler enablement. Add `packages/client-foo`, and it
// is governed by none of them, silently. Nothing fails; the package is simply
// outside every rule. This repo has been bitten by exactly that shape before:
// the dependency-cruiser package rules sat dormant for months because new
// packages were never wired into their tsconfig, so the rules matched nothing.
//
// Sibling gate: `check-workspace-scripts.mjs` does the same job for turbo task
// scripts. Config that enumerates targets rots; config that enumerates targets
// PLUS a gate asserting the enumeration is complete does not.
//
// How it verifies: rather than parsing `eslint.config.mjs` (brittle — flat
// config globs, block ordering, and replace-not-merge semantics all matter),
// it asks ESLint itself what it resolves for a real file in each package. That
// is the same answer a developer gets, so the gate cannot disagree with
// reality.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// EVERY package importing React must appear here. `compiler` and the two lint
// policies are DECLARED intent; the gate then checks the repo actually matches.
// A new React package fails until someone adds a row — which is the point: the
// row forces the question "does this package run the compiler?", and that
// answer decides the other two.
const POLICY = {
  "client-react": { compiler: true, memoBan: true, reactHooks: true },
  "client-react-native": { compiler: true, memoBan: true, reactHooks: true },
  "devtools-app": { compiler: true, memoBan: true, reactHooks: true },
  "devtools-extension": {
    compiler: true,
    memoBan: true,
    reactHooks: false,
    why: "Compiles @rtc/devtools-app's SOURCE (it exports ./src/index.ts), so it needs the compiler for the same reason devtools-app does. The react-hooks diagnostics run on devtools-app's own copy of that source; duplicating them here would double-report the same findings.",
  },
  "react-bindings": {
    compiler: false,
    memoBan: true,
    reactHooks: false,
    why: "tsc-built, so the compiler cannot run over it. Banned anyway: the bridge stays memo-free by design — a memo here signals logic belonging in client-core or motion-core (ADR-005). react-hooks is off because its deliberate build-once-ref seam trips `refs`.",
  },
  "client-prototype": {
    compiler: false,
    memoBan: false,
    reactHooks: false,
    why: "Abandoned port of the design prototype, kept for reference only. Deliberately not churned — see eslint.config.mjs.",
  },
};

const failures = [];

/** Packages whose source imports React, discovered rather than declared — that
 * asymmetry is what makes a NEW package fail instead of passing unnoticed. */
function discoverReactPackages() {
  const found = new Map();

  for (const pkg of readdirSync(join(repoRoot, "packages"))) {
    for (const dir of ["src", "app"]) {
      const root = join(repoRoot, "packages", pkg, dir);
      const file = firstReactFile(root);

      if (file !== null) {
        found.set(pkg, file);
        break;
      }
    }
  }

  return found;
}

function firstReactFile(dir) {
  let entries;

  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }

  for (const entry of entries) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") {
        continue;
      }

      const nested = firstReactFile(full);

      if (nested !== null) {
        return nested;
      }

      continue;
    }

    if (!/\.tsx?$/.test(entry) || /\.(test|spec)\./.test(entry)) {
      continue;
    }

    if (/\bfrom "react"/.test(readFileSync(full, "utf8"))) {
      return full;
    }
  }

  return null;
}

function compilerEnabled(pkg) {
  for (const [file, marker] of [
    ["vite.config.ts", /reactCompilerPreset/],
    ["app.config.ts", /reactCompiler:\s*true/],
  ]) {
    try {
      if (
        marker.test(readFileSync(join(repoRoot, "packages", pkg, file), "utf8"))
      ) {
        return true;
      }
    } catch {
      // No such config file in this package — try the next marker.
    }
  }

  return false;
}

function severityOf(config, rule) {
  const entry = config.rules?.[rule];

  if (entry === undefined) {
    return "off";
  }

  return (Array.isArray(entry) ? entry[0] : entry) === 2 ? "error" : "off";
}

const discovered = discoverReactPackages();

// 1. Every discovered React package must be declared, and vice versa.
for (const pkg of discovered.keys()) {
  if (!(pkg in POLICY)) {
    failures.push(
      `packages/${pkg} imports React but has no entry in POLICY.\n` +
        `      Add one to ${relative(repoRoot, fileURLToPath(import.meta.url))}, deciding three things:\n` +
        `        compiler   — does this package run the React Compiler? (wire it in its vite/app config)\n` +
        `        memoBan    — should useMemo/useCallback/memo be banned? (eslint.config.mjs)\n` +
        `        reactHooks — should the Rules-of-React diagnostics run? (eslint.config.mjs)\n` +
        `      If any is false, say why in a 'why' field.`,
    );
  }
}

for (const pkg of Object.keys(POLICY)) {
  if (!discovered.has(pkg)) {
    failures.push(
      `packages/${pkg} is declared in POLICY but no longer imports React — remove its entry.`,
    );
  }
}

// 2. Declared intent must match what the repo actually does.
const eslint = new ESLint({ cwd: repoRoot });

for (const [pkg, sample] of discovered) {
  const policy = POLICY[pkg];

  if (policy === undefined) {
    continue;
  }

  const rel = relative(repoRoot, sample);
  const config = await eslint.calculateConfigForFile(rel);

  const actual = {
    compiler: compilerEnabled(pkg),
    memoBan: severityOf(config, "no-restricted-imports") === "error",
    reactHooks: severityOf(config, "react-hooks/rules-of-hooks") === "error",
  };

  for (const key of ["compiler", "memoBan", "reactHooks"]) {
    if (actual[key] !== policy[key]) {
      failures.push(
        `packages/${pkg}: POLICY declares ${key}=${policy[key]} but the repo has ${key}=${actual[key]}.\n` +
          `      Checked against ${rel}. Either fix the config or update the declaration.`,
      );
    }
  }

  // 3. A policy consistency rule: relying on the compiler while still allowing
  //    hand-written memos is incoherent — the ban is what makes the reliance
  //    real. The reverse (ban without compiler) is fine but must justify itself.
  if (policy.compiler && !policy.memoBan) {
    failures.push(
      `packages/${pkg}: runs the React Compiler but does not ban manual memoization.\n` +
        `      Pick one — the ban is what makes the compiler reliance meaningful.`,
    );
  }

  if (!policy.compiler && policy.memoBan && !policy.why) {
    failures.push(
      `packages/${pkg}: bans memoization without running the compiler, and gives no 'why'.\n` +
        `      That combination removes memoization with nothing replacing it — justify it.`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    "\nReact package coverage — a package is outside a policy it should be inside:\n",
  );

  for (const failure of failures) {
    console.error(`  ${failure}\n`);
  }

  process.exit(1);
}

console.log(
  `check:react-coverage: ${discovered.size} React packages, all with an explicit policy`,
);
