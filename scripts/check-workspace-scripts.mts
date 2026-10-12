// Asserts every workspace package carries the standard quality-gate scripts,
// so a newly-added package can never silently opt out of a gate. Turbo runs a
// task only where a package DECLARES the script (unlike Biome/ESLint/stylelint,
// which glob the whole tree), so `turbo run typecheck` skips — without error —
// any package missing a `typecheck` script. This gate closes that gap.
//
// Zero dependencies (Node built-ins only). Workspaces are read from
// pnpm-workspace.yaml so this stays in lockstep with the real workspace set.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { listWorkspaceDirs, readManifest, repoRoot } from "./workspaces.mts";

// Each requirement names a scripts-object predicate. `typecheck` must exist
// verbatim; the test requirement accepts `test` OR any `test:*` variant (the
// `tests` e2e workspace has no plain `test`, only `test:e2e`, `test:browser:*`,
// etc.), so it stays satisfiable for specialised runners.
type Scripts = Readonly<Record<string, string>>;

interface Requirement {
  readonly label: string;
  readonly satisfied: (scripts: Scripts) => boolean;
}

interface Violation {
  readonly name: string;
  readonly dir: string;
}

interface MissingScriptsViolation extends Violation {
  readonly missing: string[];
}

const REQUIRED: readonly Requirement[] = [
  {
    label: "typecheck",
    satisfied: (scripts: Scripts): boolean => {
      return "typecheck" in scripts;
    },
  },
  {
    label: "test (or a test:* variant)",
    satisfied: (scripts: Scripts): boolean => {
      return Object.keys(scripts).some((k): boolean => {
        return /^test(:|$)/.test(k);
      });
    },
  },
];

// A package whose tsconfig pins `dist/tsconfig.tsbuildinfo` has its `build`
// (`tsc --build`) writing that file. `tsconfig.base.json` sets `composite: true`
// repo-wide, which implies `incremental`, so `tsc --noEmit` writes a buildinfo
// too — and `turbo.json` declares `typecheck.dependsOn: ["^build"]`, the
// UPSTREAM build rather than the package's own, so a package's `typecheck` and
// `build` run CONCURRENTLY in the same directory. Aimed at one path they
// corrupt each other, and the failure does not look like a race: CI run
// 30204813551 reported ~40 `TS2305` errors — EVERY export of `@rtc/client-core` (as the package holding the adapters and the RxJS core was then named)
// missing at once — then `Segmentation fault (core dumped)` (exit 139), and a
// rerun of the identical SHA was green. That reads as infrastructure and is
// not. Each such `typecheck` must therefore name its own `--tsBuildInfoFile`.
function pinsSharedBuildInfo(dir: string): boolean {
  try {
    return readFileSync(join(repoRoot, dir, "tsconfig.json"), "utf8").includes(
      "dist/tsconfig.tsbuildinfo",
    );
  } catch {
    return false;
  }
}

function sharesBuildInfoAcrossTasks(dir: string, scripts: Scripts): boolean {
  const typecheck = scripts.typecheck ?? "";

  if (!typecheck.includes("tsc --noEmit") || !pinsSharedBuildInfo(dir)) {
    return false;
  }

  return !typecheck.includes("--tsBuildInfoFile");
}

// A `build` that emits with tsc (`tsc --build`, or `tsc -p … --noCheck` for the
// vite packages that emit types separately) must end by running
// scripts/check-dist.mts: two tsc builds in one checkout can truncate a
// referenced project's `.d.ts` to zero bytes, tsc's incremental build info
// then records it as emitted, and turbo caches the broken output. The check
// makes THAT build fail by name instead, so nothing caches it.
function emitsWithTsc(scripts: Scripts): boolean {
  const build = scripts.build ?? "";
  return build.includes("tsc --build") || /tsc -p \S+ --noCheck/.test(build);
}

function buildLacksDistCheck(scripts: Scripts): boolean {
  return (
    emitsWithTsc(scripts) && !(scripts.build ?? "").includes("check-dist.mts")
  );
}

const workspaceDirs = listWorkspaceDirs();
const violations: MissingScriptsViolation[] = [];
const buildInfoViolations: Violation[] = [];
const distCheckViolations: Violation[] = [];
let checked = 0;

for (const dir of workspaceDirs) {
  const manifest = readManifest(dir);

  if (manifest === null) {
    continue;
  }

  checked += 1;
  const scripts: Scripts = manifest.scripts ?? {};
  const missing = REQUIRED.filter((req): boolean => {
    return !req.satisfied(scripts);
  }).map((req): string => {
    return req.label;
  });

  if (missing.length > 0) {
    violations.push({ name: manifest.name ?? dir, dir, missing });
  }

  if (sharesBuildInfoAcrossTasks(dir, scripts)) {
    buildInfoViolations.push({ name: manifest.name ?? dir, dir });
  }

  if (buildLacksDistCheck(scripts)) {
    distCheckViolations.push({ name: manifest.name ?? dir, dir });
  }
}

if (distCheckViolations.length > 0) {
  console.error(
    "✖ Workspace script gate: a tsc-emitting `build` does not run scripts/check-dist.mts.\n",
  );

  for (const v of distCheckViolations) {
    console.error(`  ${v.name} (${v.dir})`);
  }

  console.error(
    `\nEvery build that emits with tsc ends with \`&& node ../../scripts/check-dist.mts\`,\n` +
      `so a dist truncated by a concurrent build fails that build by name instead of\n` +
      `being cached by turbo and surfacing later as TS2306 on an untouched file.\n` +
      `Append it to the build script, then re-run \`pnpm check:scripts\`.`,
  );
  process.exit(1);
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
    `no package's typecheck shares a tsbuildinfo with its build, and every tsc-emitting build runs check-dist.`,
);
