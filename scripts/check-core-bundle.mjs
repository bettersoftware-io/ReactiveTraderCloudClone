#!/usr/bin/env node
// Asserts a web client's production build is runtime-switchable between the
// three application cores (docs/superpowers/specs/2026-09-27-runtime-core-
// switch-design.md §4): ONE build, not one per core. src/app/coreSelection.ts's
// `loadCore` reaches EVERY core — the RxJS default included, through the
// `@rtc/client-core/core` subpath export (approach B, ADR-006 Decision 6,
// 2026-10-02) — via `import()`, which the bundler splits into its own lazy
// chunk fetched only once a visitor's choice resolves. So the check is no
// longer "does the rxjs build carry no foreign core" — it is:
//
//   1. the EAGER set (both pages' entry scripts + modulepreload hints) carries
//      NO core's marker — the entry bundle privileges none of the three;
//   2. exactly one non-eager (lazy) chunk carries each core's marker;
//   3. no single file carries two different cores' markers;
//   4. no eager file carries the Effect runtime's own `effect/Fiber` marker.
//
// What "the RxJS core" means here is its COMPOSITION ROOT (the file that
// constructs the app — `createApp`, `createMachineFactories`, stamped with
// RXJS_CORE_BRAND). `@rtc/client-core`'s presenters, machines and adapters are
// still reached eagerly through the root index the UI imports from, so they
// stay in the entry bundle regardless; the measured move is ~3 KB gzip per
// client. Making THOSE lazy needs an explicit edge surface for the UI — see
// ADR-006 Follow-ups.
//
// Two modes:
//   node scripts/check-core-bundle.mjs              — builds each web client
//     once (VITE_CORE_IMPL unset — the default choice, not what's bundled)
//     into a temp dir and checks it.
//   node scripts/check-core-bundle.mjs --dir <dir>   — skips the build and
//     checks an existing output directory directly (deploy.yml's production
//     guard, over `.vercel/output/static`, which already holds exactly the
//     one client that job built).
//
// Precondition (build mode only): the alternative-core packages must already
// be built — each web client consumes @rtc/client-core-async /
// @rtc/client-core-effect through their `dist/`-only `exports`, not their
// `src/`. CI's `Build` step (which runs `pnpm build` before this check)
// guarantees that. Locally, a stale `dist/` produces a false "expected
// exactly one lazy chunk … found 0" below — rebuild first: `pnpm build`.
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { classify, eagerFiles } from "../tests/scripts/lib/coreBundle.ts";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const CLIENTS = [
  { pkg: "@rtc/client-react", dir: "client-react" },
  { pkg: "@rtc/client-solid", dir: "client-solid" },
];

const CORES = ["rxjs", "async", "effect"];

const argv = process.argv.slice(2);
const dirFlagAt = argv.indexOf("--dir");
const explicitDir =
  dirFlagAt === -1 ? undefined : (argv[dirFlagAt + 1] ?? undefined);

if (dirFlagAt !== -1 && explicitDir === undefined) {
  console.error("check-core-bundle: --dir requires a path argument");
  process.exit(1);
}

function listJs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...listJs(p));
    } else if (entry.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

/** Reads one built client directory (`index.html` + `popout.html` at its
 * root, hashed `.js` under `assets/`) and runs `classify` over it. Returns
 * `undefined` failures-only rows when the directory doesn't look built at
 * all, so the caller can fail loudly rather than silently pass on nothing. */
function checkClientDir(pkg, dir) {
  const indexPath = join(dir, "index.html");

  if (!existsSync(indexPath)) {
    return {
      rows: [],
      failures: [
        `${indexPath} does not exist — nothing was built, so this check proved nothing.`,
      ],
    };
  }

  const pagePaths = [indexPath, join(dir, "popout.html")].filter(existsSync);
  const eager = new Set();
  for (const pagePath of pagePaths) {
    for (const href of eagerFiles(readFileSync(pagePath, "utf8"))) {
      eager.add(href);
    }
  }

  const assetsDir = join(dir, "assets");
  const files = new Map();
  if (existsSync(assetsDir)) {
    for (const jsPath of listJs(assetsDir)) {
      // Normalise to the same "/assets/…" form the HTML's src/href attributes
      // use, so `eager` (built from those attributes) matches these keys.
      const relPath = `/${relative(dir, jsPath).split(sep).join("/")}`;
      files.set(relPath, readFileSync(jsPath, "utf8"));
    }
  }

  const result = classify({ files, eager });

  const rows = CORES.map((core) => {
    const gz = result.owners[core].reduce((sum, path) => {
      const abs = join(dir, path.replace(/^\//, ""));
      return sum + gzipSync(readFileSync(abs)).length;
    }, 0);
    return {
      client: pkg,
      core,
      chunks: result.owners[core].length,
      gzKB: (gz / 1024).toFixed(1),
    };
  });

  return { rows, failures: result.failures.map((f) => `${pkg}: ${f}`) };
}

function buildClient(client, outDir) {
  // VITE_CORE_IMPL unset: since the runtime core switch, this only picks the
  // BUILD DEFAULT choice a visitor lands on (resolveCoreChoice's third
  // precedence step), not what gets bundled — every build ships all three,
  // so leaving it unset here exercises the plain default path.
  const env = { ...process.env };
  delete env.VITE_CORE_IMPL;
  execSync(
    `pnpm --filter ${client.pkg} exec vite build --outDir ${outDir} --emptyOutDir`,
    { cwd: REPO_ROOT, stdio: "inherit", env },
  );
}

/** A readable label for the summary table's `client` column when `--dir`
 * points at a directory directly (no known per-client name to use) — the
 * directory's own basename (e.g. `.vercel/output/static` → `static`), or a
 * literal fallback for a path with no usable basename (`/`, `.`, ``). */
function readableDirLabel(dir) {
  const base = basename(dir);
  return base && base !== "." ? base : "static output";
}

/**
 * `--dir` targets to check. `.vercel/output/static` in deploy.yml is already
 * scoped to the ONE client that job built — `index.html` sits directly at
 * `baseDir`'s root (`vercel.{react,solid}.json`'s `outputDirectory` becomes
 * the static root), so that is the common case. A caller pointing at a
 * directory that nests several clients' outputs (e.g. each package's own
 * dist/) is checked once per client subdirectory found instead. Neither
 * shape present still returns `baseDir` itself, so `checkClientDir` reports
 * the "nothing was built" failure rather than the loop silently doing
 * nothing.
 */
function resolveDirTargets(baseDir) {
  if (existsSync(join(baseDir, "index.html"))) {
    return [{ pkg: readableDirLabel(baseDir), dir: baseDir }];
  }

  const nested = CLIENTS.map((client) => {
    return { pkg: client.pkg, dir: join(baseDir, client.dir) };
  }).filter((target) => {
    return existsSync(join(target.dir, "index.html"));
  });

  return nested.length > 0
    ? nested
    : [{ pkg: readableDirLabel(baseDir), dir: baseDir }];
}

let failed = false;
const allRows = [];

function recordResult(pkg, dir) {
  const { rows, failures } = checkClientDir(pkg, dir);
  allRows.push(...rows);
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
    failed = true;
  }
}

if (explicitDir) {
  for (const target of resolveDirTargets(explicitDir)) {
    recordResult(target.pkg, target.dir);
  }
} else {
  for (const client of CLIENTS) {
    const outDir = mkdtempSync(join(tmpdir(), "rtc-core-bundle-"));
    try {
      buildClient(client, outDir);
      recordResult(client.pkg, outDir);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }
}

console.table(allRows);

if (!failed) {
  console.log(
    "OK: the eager set carries no application core; rxjs, async and effect each sit in exactly one lazy chunk.",
  );
}

process.exit(failed ? 1 : 0);
