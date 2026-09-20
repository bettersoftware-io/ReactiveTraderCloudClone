// Fails on any zero-byte file under packages/*/dist — the fingerprint of two
// `tsc --build` processes writing one library's dist at the same time. Thirteen
// packages use project references, so a `--filter`ed build of one package also
// rebuilds the libraries it references; two such builds in one checkout (two
// agents, two terminals) can leave a `.d.ts` truncated to nothing. tsc's
// incremental build info then records that file as emitted and skips it on
// every later build, and turbo caches the broken output — so the symptom
// surfaces later, elsewhere, as `TS2306: File '…' is not a module` on a file
// nobody touched. Running this as the last step of every tsc package's `build`
// makes the collision fail THAT build, loudly and by name, so turbo never
// caches it. `pnpm check:dist` runs it over every package from the root.
//
// Zero dependencies (Node built-ins only); the repo root is derived from this
// file's location, so the check covers every package whichever package's
// `build` invoked it — a truncated file in a REFERENCED project's dist is the
// case that matters.

import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(repoRoot, "packages");

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

const empty = [];
let scanned = 0;
for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!pkg.isDirectory()) {
    continue;
  }
  const dist = join(packagesDir, pkg.name, "dist");
  try {
    if (!statSync(dist).isDirectory()) {
      continue;
    }
  } catch {
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
      `  rm -rf packages/<pkg>/dist packages/<pkg>/dist/tsconfig.tsbuildinfo\n` +
      `  pnpm --filter @rtc/<pkg> build\n` +
      `then \`pnpm turbo run build --filter=@rtc/<pkg> --force\` so turbo's ` +
      `cache entry is overwritten. Never run two builds in one checkout at ` +
      `once (see CLAUDE.md, "TypeScript toolchain").`,
  );
  process.exit(1);
}

console.log(`check-dist: no zero-byte files across ${scanned} package dist(s)`);
