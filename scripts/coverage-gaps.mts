#!/usr/bin/env node
// Rank per-FILE coverage gaps across every tier that has been run.
//
// Why this exists: the enforced CI bar is an AGGREGATE (>=95% per tier), which is
// structurally unable to surface a single weak file. client-solid sat at 99.35%
// overall while appHeadRegistry.tsx was 69.23%; client-react passed a 98.45%
// ui-contract tier with appHeadRegistry.tsx at 0%. Only per-file numbers find those.
//
// Reads whatever this repo's tiers actually emit:
//   * lcov.info            — every package emits it, so this is the reliable path.
//   * coverage-final.json  — istanbul JSON, only when the `json` reporter is on.
//     Most packages configure reporter: ["text","html","lcov"], so it is ABSENT
//     locally; coverage-report.yml adds --coverage.reporter=json explicitly, which
//     is why the published report has it and a plain local run does not. Preferred
//     when present, since it matches that report.
// lcov counts LINES where istanbul counts STATEMENTS — close enough to rank, and
// flagged in the output.
//
// Two rules this encodes, both of which have misled readers of the gh-pages report:
//   * A file can read 0% in one tier and 100% in another, so a file is only a gap
//     if it is weak in its BEST tier. We merge across tiers and keep the best.
//   * Files with nothing executable (barrels, *.module.css under v8) are not gaps.
//
// Usage:  node scripts/coverage-gaps.mts [--limit N] [--min-pct P] [--json]
//
// Generate data first:  pnpm test:coverage && pnpm test:ui:coverage

import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

/** One file's totals in one tier — the shape both readers normalise to. */
interface FileCoverage {
  file: string;
  stmtTotal: number;
  stmtCov: number;
  brTotal: number;
  brCov: number;
}

/** The fields this script reads from one istanbul `coverage-final.json` entry. */
interface IstanbulFileCoverage {
  path: string;
  s?: Record<string, number>;
  b?: Record<string, number[]>;
}

type IstanbulCoverageMap = Record<string, IstanbulFileCoverage>;

type CoverageKind = "lcov" | "json";

interface CoverageSource {
  path: string;
  kind: CoverageKind;
}

/** A file's record at the tier where it is covered best. */
interface BestRecord {
  file: string;
  tier: string;
  sPct: number;
  uncoveredS: number;
  uncoveredB: number;
}

interface TierSummary {
  tier: string;
  kind: CoverageKind;
  pct: number;
}

const args = process.argv.slice(2);

function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}

/** A numeric flag's value. A flag given with no value, or with one that is not
 * a number, is a usage error — it would otherwise read as NaN, which compares
 * false against everything and silently reports no gaps at all. */
function numberFlag(name: string, fallback: number): number {
  const value = Number(flag(name, String(fallback)));

  if (!Number.isFinite(value)) {
    console.error(`${name} needs a number, e.g. ${name} ${fallback}`);
    process.exit(2);
  }

  return value;
}

const LIMIT = numberFlag("--limit", 30);
const MIN_PCT = numberFlag("--min-pct", 95);
const AS_JSON = args.includes("--json");

const root = resolve(process.cwd());

// Both layouts are in use: packages/<pkg>/coverage/ (vitest's default
// reportsDirectory) and packages/<pkg>/reports/<tier>/coverage/ (explicit).
// `report/` is the html reporter's own nested copy of the same data — including it
// double-counts every tier.
function findAll(name: string): string[] {
  return globSync(`packages/*/**/${name}`, { cwd: root })
    .filter((p) => {
      return !p.includes("/node_modules/") && !/(^|\/)report\//.test(p);
    })
    .sort();
}

/** …/<tier>/coverage/<file> -> pkg/tier, e.g. domain/unit — or just pkg. */
function tierOf(rel: string): string {
  const m = rel.match(
    /^packages\/([^/]+)\/(?:reports\/(.+)\/)?coverage\/[^/]+$/,
  );

  if (!m) {
    return rel;
  }

  return m[2] ? `${m[1]}/${m[2]}` : m[1];
}

/**
 * Normalise a coverage entry's path to `packages/<pkg>/<...>` so the same file
 * merges across tiers. Two shapes arrive here:
 *   * istanbul json — an ABSOLUTE path, which also carries the checkout prefix
 *     (a sibling worktree's copy must collapse onto ours).
 *   * lcov `SF:`    — usually PACKAGE-relative (`src/foo.ts`), so it needs the
 *     owning package prefixed or it becomes a distinct key from the json entry
 *     for the same file, silently defeating the best-tier merge.
 */
function normalisePath(p: string, pkgDir: string): string {
  const i = p.indexOf("/packages/");

  if (i !== -1) {
    return p.slice(i + 1);
  }

  if (p.startsWith("packages/")) {
    return p;
  }

  return `${pkgDir}/${relative(pkgDir, resolve(root, pkgDir, p))}`;
}

function pct(covered: number, total: number): number {
  return total === 0 ? 100 : (covered / total) * 100;
}

/** istanbul coverage-final.json -> [{file, stmtTotal, stmtCov, brTotal, brCov}] */
function readJsonTier(absPath: string, pkgDir: string): FileCoverage[] {
  const data = JSON.parse(readFileSync(absPath, "utf8")) as IstanbulCoverageMap;
  return Object.values(data).map((e) => {
    const bAll = Object.values(e.b ?? {}).flat();
    return {
      file: normalisePath(e.path, pkgDir),
      stmtTotal: Object.keys(e.s ?? {}).length,
      stmtCov: Object.values(e.s ?? {}).filter((n) => {
        return n > 0;
      }).length,
      brTotal: bAll.length,
      brCov: bAll.filter((n) => {
        return n > 0;
      }).length,
    };
  });
}

/** lcov.info -> the same shape, from LF/LH (lines) and BRF/BRH (branches). */
function readLcovTier(absPath: string, pkgDir: string): FileCoverage[] {
  const out: FileCoverage[] = [];
  let cur: FileCoverage | null = null;

  for (const line of readFileSync(absPath, "utf8").split("\n")) {
    if (line.startsWith("SF:")) {
      cur = {
        file: normalisePath(line.slice(3).trim(), pkgDir),
        stmtTotal: 0,
        stmtCov: 0,
        brTotal: 0,
        brCov: 0,
      };
    } else if (!cur) {
      // header noise before the first record
    } else if (line.startsWith("LF:")) {
      cur.stmtTotal = Number(line.slice(3));
    } else if (line.startsWith("LH:")) {
      cur.stmtCov = Number(line.slice(3));
    } else if (line.startsWith("BRF:")) {
      cur.brTotal = Number(line.slice(4));
    } else if (line.startsWith("BRH:")) {
      cur.brCov = Number(line.slice(4));
    } else if (line.startsWith("end_of_record")) {
      out.push(cur);
      cur = null;
    }
  }

  return out;
}

// Prefer a tier's json; fall back to its lcov.
const sources = new Map<string, CoverageSource>();

for (const rel of findAll("lcov.info")) {
  sources.set(tierOf(rel), { path: rel, kind: "lcov" });
}

for (const rel of findAll("coverage-final.json")) {
  sources.set(tierOf(rel), { path: rel, kind: "json" });
}

if (sources.size === 0) {
  console.error(
    "coverage-gaps: no coverage output found under packages/.\n" +
      "Generate it first:  pnpm test:coverage && pnpm test:ui:coverage",
  );
  process.exit(1);
}

const best = new Map<string, BestRecord>();
const tiers: TierSummary[] = [];

for (const [tier, { path: rel, kind }] of [...sources].sort()) {
  const pkgDir = `packages/${rel.split("/")[1]}`;
  const entries =
    kind === "json"
      ? readJsonTier(resolve(root, rel), pkgDir)
      : readLcovTier(resolve(root, rel), pkgDir);
  let tS = 0;
  let tSC = 0;

  for (const e of entries) {
    if (e.stmtTotal === 0) {
      continue; // barrels and CSS modules carry nothing executable — not gaps
    }

    tS += e.stmtTotal;
    tSC += e.stmtCov;

    const rec: BestRecord = {
      file: e.file,
      tier,
      sPct: pct(e.stmtCov, e.stmtTotal),
      uncoveredS: e.stmtTotal - e.stmtCov,
      uncoveredB: e.brTotal - e.brCov,
    };
    const prev = best.get(e.file);

    if (!prev || rec.sPct > prev.sPct) {
      best.set(e.file, rec);
    }
  }

  tiers.push({ tier, kind, pct: pct(tSC, tS) });
}

// Rank on STATEMENTS only. Branches are counted but never drive the order: Solid's
// compiler emits reactive-effect guards that inflate v8's branch denominator (which
// is why its CI gate is branches >=85%), so branch-weighted ranking buries real
// react/domain gaps under compiled-Solid noise.
const gaps = [...best.values()]
  .filter((r) => {
    return r.sPct < MIN_PCT;
  })
  .sort((a, b) => {
    return b.uncoveredS - a.uncoveredS || a.sPct - b.sPct;
  });

const branchOnly = [...best.values()].filter((r) => {
  return r.sPct >= MIN_PCT && r.uncoveredB > 0;
});

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        tiers,
        gaps: gaps.slice(0, LIMIT),
        totalGaps: gaps.length,
        branchOnly: branchOnly.length,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`tiers measured (${tiers.length}):`);

for (const t of tiers) {
  console.log(`  ${t.pct.toFixed(2).padStart(6)}%  ${t.tier}  [${t.kind}]`);
}

console.log(
  `\nfiles below ${MIN_PCT}% statements, at their BEST tier ` +
    "(a file covered elsewhere is not a gap):\n",
);

if (gaps.length === 0) {
  console.log("  none.");
} else {
  console.log("  stmt%   miss  file  (best tier)");

  for (const g of gaps.slice(0, LIMIT)) {
    console.log(
      `  ${g.sPct.toFixed(1).padStart(5)}  ${String(g.uncoveredS).padStart(4)}  ${g.file}  (${g.tier})`,
    );
  }

  if (gaps.length > LIMIT) {
    console.log(`\n  … ${gaps.length - LIMIT} more (raise --limit)`);
  }
}

console.log(
  `\n${gaps.length} file(s) below ${MIN_PCT}% statements, out of ${best.size} measured.` +
    `\n${branchOnly.length} further file(s) clear ${MIN_PCT}% but carry an uncovered branch —` +
    " deliberately unranked:\nv8 over-counts branches on compiled Solid, so that list is mostly noise." +
    "\nlcov tiers count LINES where istanbul json counts STATEMENTS; close enough to rank.",
);
