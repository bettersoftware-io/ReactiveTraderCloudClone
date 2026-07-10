// Asserts every workspace package carries the standard quality-gate scripts,
// so a newly-added package can never silently opt out of a gate. Turbo runs a
// task only where a package DECLARES the script (unlike Biome/ESLint/stylelint,
// which glob the whole tree), so `turbo run typecheck` skips — without error —
// any package missing a `typecheck` script. This gate closes that gap.
//
// Zero dependencies (Node built-ins only). Workspaces are read from
// pnpm-workspace.yaml so this stays in lockstep with the real workspace set.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Each requirement names a scripts-object predicate. `typecheck` must exist
// verbatim; the test requirement accepts `test` OR any `test:*` variant (the
// `tests` e2e workspace has no plain `test`, only `test:e2e`, `test:browser:*`,
// etc.), so it stays satisfiable for specialised runners.
const REQUIRED = [
  {
    label: "typecheck",
    satisfied: (scripts) => "typecheck" in scripts,
  },
  {
    label: "test (or a test:* variant)",
    satisfied: (scripts) =>
      Object.keys(scripts).some((k) => /^test(:|$)/.test(k)),
  },
];

// Read the `packages:` list from pnpm-workspace.yaml. The file is trivially
// shaped (a flat YAML sequence of quoted globs), so a full YAML parser would be
// overkill — we collect the `- "<glob>"` items directly under the key.
function readWorkspaceGlobs() {
  const yaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
  const globs = [];
  let inPackages = false;
  for (const raw of yaml.split("\n")) {
    if (/^packages:\s*$/.test(raw)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const item = raw.match(/^\s*-\s*["']?([^"'#]+?)["']?\s*(#.*)?$/);
      if (item) {
        globs.push(item[1].trim());
        continue;
      }
      // A non-list, non-blank line ends the sequence.
      if (raw.trim() !== "" && !raw.startsWith(" ")) {
        break;
      }
    }
  }
  return globs;
}

// Expand a workspace glob to concrete directories. pnpm-workspace globs here use
// a trailing `*` segment at most (`packages/*`), plus literals (`tests`), so we
// resolve each path segment, fanning out only on a `*` segment.
function expandGlob(glob) {
  let dirs = [""];
  for (const segment of glob.split("/")) {
    const next = [];
    for (const dir of dirs) {
      if (segment === "*") {
        for (const entry of readdirSync(join(repoRoot, dir), {
          withFileTypes: true,
        })) {
          if (entry.isDirectory()) {
            next.push(join(dir, entry.name));
          }
        }
      } else {
        next.push(join(dir, segment));
      }
    }
    dirs = next;
  }
  return dirs;
}

function readManifest(dir) {
  try {
    return JSON.parse(
      readFileSync(join(repoRoot, dir, "package.json"), "utf8"),
    );
  } catch {
    // Not every matched directory is a package (a `*` glob can catch a stray
    // dir); a missing/unreadable package.json just means "no workspace here".
    return null;
  }
}

const workspaceDirs = [
  ...new Set(readWorkspaceGlobs().flatMap(expandGlob)),
].sort();
const violations = [];
let checked = 0;

for (const dir of workspaceDirs) {
  const manifest = readManifest(dir);
  if (manifest === null) {
    continue;
  }

  checked += 1;
  const scripts = manifest.scripts ?? {};
  const missing = REQUIRED.filter((req) => !req.satisfied(scripts)).map(
    (req) => req.label,
  );
  if (missing.length > 0) {
    violations.push({ name: manifest.name ?? dir, dir, missing });
  }
}

if (violations.length > 0) {
  console.error(
    "✖ Workspace script gate: some packages are missing required scripts.\n",
  );
  for (const v of violations) {
    console.error(`  ${v.name} (${v.dir})`);
    for (const label of v.missing) {
      console.error(`    - missing: ${label}`);
    }
  }
  console.error(
    `\nEvery workspace must declare these scripts so no gate silently skips it.\n` +
      `Add the missing script(s) to the package's package.json, then re-run \`pnpm check:scripts\`.`,
  );
  process.exit(1);
}

console.log(
  `✓ Workspace script gate: all ${checked} workspaces declare the required scripts.`,
);
