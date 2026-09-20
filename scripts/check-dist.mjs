// Fails on any zero-byte file in the dist directories a `tsc --build` just
// wrote — the fingerprint of two tsc processes writing one library's dist at
// the same time. Thirteen packages use project references, so a `--filter`ed
// build of one package also rebuilds the libraries it references; two such
// builds in one checkout (two agents, two terminals) can leave a `.d.ts`
// truncated to nothing. tsc's incremental build info then records that file
// as emitted and skips it on every later build, and turbo caches the broken
// output — so the symptom surfaces later, elsewhere, as `TS2306: File '…' is
// not a module` on a file nobody touched. Running this as the last step of
// every tsc package's `build` makes the collision fail THAT build, loudly and
// by name, so turbo never caches it.
//
// SCOPE — the package's own dist plus the dists of its TRANSITIVE tsconfig
// `references`: exactly what its `tsc --build` may have emitted. Not every
// package's dist: under turbo up to two dozen builds run concurrently and a
// leaf package's check would observe an unrelated package's dist mid-emit
// (TypeScript 7 writes files in parallel, so several sit at zero bytes for an
// instant) — CI run 35514236984 failed `boot-splash`, `motion-core`,
// `devtools-core` and `devtools-relay` on `domain`'s files that way, none of
// which reference `domain`. A referenced project, by contrast, is complete
// before the dependent's task starts (turbo's `dependsOn: ["^build"]`), so a
// zero-byte file there has exactly one explanation: a second build in this
// checkout. `--all` checks every package's dist (`pnpm check:dist`, from the
// root, when nothing is building).
//
// Depends only on the `typescript` 6.x API already at the repo root.

import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(repoRoot, "packages");
const all = process.argv.includes("--all");

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && statSync(full).size === 0) {
      out.push(relative(repoRoot, full));
    }
  }
  return out;
}

// `references[].path` entries, resolved and followed transitively. tsconfig
// files are JSONC (comments, trailing commas), so they are read with
// TypeScript's own config reader — the 6.x API the repo keeps for exactly
// this kind of tooling (see CLAUDE.md, "TypeScript toolchain") — never
// `JSON.parse`, whose failure would silently shrink the scope to nothing.
function referencedPackages(pkgDir, seen = new Set()) {
  if (seen.has(pkgDir)) {
    return seen;
  }
  seen.add(pkgDir);
  const file = join(pkgDir, "tsconfig.json");
  const { config, error } = ts.readConfigFile(file, ts.sys.readFile);
  if (error !== undefined || config === undefined) {
    console.error(`✖ check-dist: cannot read ${relative(repoRoot, file)}`);
    process.exit(2);
  }
  for (const ref of config.references ?? []) {
    referencedPackages(resolve(pkgDir, ref.path), seen);
  }
  return seen;
}

function scope() {
  if (all) {
    return readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(packagesDir, entry.name));
  }
  const own = process.cwd();
  if (
    !isDirectory(join(own, "dist")) &&
    !isDirectory(join(own, "node_modules"))
  ) {
    console.error(
      `✖ check-dist: run from a package directory (cwd ${own} has no dist/), ` +
        `or pass --all from the repo root.`,
    );
    process.exit(2);
  }
  return [...referencedPackages(own)];
}

const dirs = scope();
const empty = [];
let scanned = 0;
for (const pkgDir of dirs) {
  const dist = join(pkgDir, "dist");
  if (!isDirectory(dist)) {
    continue;
  }
  scanned += 1;
  walk(dist, empty);
}

if (empty.length > 0) {
  console.error(
    `✖ check-dist: ${empty.length} zero-byte file(s) in a package dist — a ` +
      `concurrent \`tsc --build\` truncated them:\n`,
  );
  for (const file of empty) {
    console.error(`  ${file}`);
  }
  console.error(
    `\nFix: for each package above, delete its dist and build info and ` +
      `rebuild it alone —\n` +
      `  rm -rf packages/<pkg>/dist\n` +
      `  pnpm --filter @rtc/<pkg> build\n` +
      `then \`pnpm turbo run build --filter=@rtc/<pkg> --force\` so turbo's ` +
      `cache entry is overwritten. Never run two builds in one checkout at ` +
      `once (see CLAUDE.md, "TypeScript toolchain").`,
  );
  process.exit(1);
}

console.log(
  all
    ? `check-dist: no zero-byte files across ${scanned} package dist(s)`
    : `check-dist: no zero-byte files in ${relative(repoRoot, process.cwd())} and its ${scanned - 1} referenced dist(s)`,
);
