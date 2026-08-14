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

// A package whose tsconfig pins `dist/tsconfig.tsbuildinfo` has its `build`
// (`tsc --build`) writing that file. `tsconfig.base.json` sets `composite: true`
// repo-wide, which implies `incremental`, so `tsc --noEmit` writes a buildinfo
// too — and `turbo.json` declares `typecheck.dependsOn: ["^build"]`, the
// UPSTREAM build rather than the package's own, so a package's `typecheck` and
// `build` run CONCURRENTLY in the same directory. Aimed at one path they
// corrupt each other, and the failure does not look like a race: CI run
// 30204813551 reported ~40 `TS2305` errors — EVERY export of `@rtc/client-core`
// missing at once — then `Segmentation fault (core dumped)` (exit 139), and a
// rerun of the identical SHA was green. That reads as infrastructure and is
// not. Each such `typecheck` must therefore name its own `--tsBuildInfoFile`.
function pinsSharedBuildInfo(dir) {
  try {
    return readFileSync(join(repoRoot, dir, "tsconfig.json"), "utf8").includes(
      "dist/tsconfig.tsbuildinfo",
    );
  } catch {
    return false;
  }
}

function sharesBuildInfoAcrossTasks(dir, scripts) {
  const typecheck = scripts.typecheck ?? "";
  if (!typecheck.includes("tsc --noEmit") || !pinsSharedBuildInfo(dir)) {
    return false;
  }
  return !typecheck.includes("--tsBuildInfoFile");
}

const workspaceDirs = [
  ...new Set(readWorkspaceGlobs().flatMap(expandGlob)),
].sort();
const violations = [];
const buildInfoViolations = [];
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
  if (sharesBuildInfoAcrossTasks(dir, scripts)) {
    buildInfoViolations.push({ name: manifest.name ?? dir, dir });
  }
}

if (buildInfoViolations.length > 0) {
  console.error(
    "✖ Workspace script gate: `typecheck` and `build` would share one tsbuildinfo.\n",
  );
  for (const v of buildInfoViolations) {
    console.error(`  ${v.name} (${v.dir})`);
  }
  console.error(
    `\nThese packages pin dist/tsconfig.tsbuildinfo for \`tsc --build\`, and their\n` +
      `\`typecheck\` runs \`tsc --noEmit\` with no --tsBuildInfoFile of its own. Because\n` +
      `turbo's typecheck.dependsOn is ["^build"] (upstream only), the two tasks run\n` +
      `concurrently in the same directory and corrupt that one file.\n` +
      `Fix: append \`--tsBuildInfoFile .turbo/typecheck.tsbuildinfo\` to the typecheck\n` +
      `script, then re-run \`pnpm check:scripts\`.`,
  );
  process.exit(1);
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
  `✓ Workspace script gate: all ${checked} workspaces declare the required scripts, ` +
    `and no package's typecheck shares a tsbuildinfo with its build.`,
);
