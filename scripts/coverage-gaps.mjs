#!/usr/bin/env node
// Rank per-FILE coverage gaps across every tier that has been run.
//
// Why this exists: the enforced CI bar is an AGGREGATE (>=95% per tier), which is
// structurally unable to surface a single weak file. client-solid sat at 99.35%
// overall while appHeadRegistry.tsx was 69.23%; client-react passed a 98.45%
// ui-contract tier with appHeadRegistry.tsx at 0%. Only per-file numbers find those.
//
// Two rules this encodes, both of which have burned readers of the gh-pages report:
//   * A file can read 0% in one tier and 100% in another, so a file is only a gap
//     if it is weak in its BEST tier. We merge across tiers and keep the best.
//   * Files with zero statements (barrels, *.module.css under v8) are not gaps.
//     They report 0% and drag the eye, but there is nothing to cover.
//
// Usage:  node scripts/coverage-gaps.mjs [--limit N] [--min-pct P] [--json]
//
// Reads whatever coverage-final.json files already exist under
// packages/<pkg>/reports/**/coverage/. Run the coverage tiers first, e.g.
//   pnpm test:coverage && pnpm test:ui:coverage

import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const LIMIT = Number(flag("--limit", "30"));
const MIN_PCT = Number(flag("--min-pct", "95"));
const AS_JSON = args.includes("--json");

const root = resolve(process.cwd());
const reports = globSync("packages/*/reports/**/coverage/coverage-final.json", {
  cwd: root,
});

if (reports.length === 0) {
  console.error(
    "coverage-gaps: no coverage-final.json found under packages/*/reports/**/coverage/.\n" +
      "Run the coverage tiers first, e.g. `pnpm test:coverage && pnpm test:ui:coverage`.",
  );
  process.exit(1);
}

/** packages/domain/reports/unit/coverage/coverage-final.json -> domain/unit */
const tierOf = (rel) => {
  const m = rel.match(
    /^packages\/([^/]+)\/reports\/(.+)\/coverage\/coverage-final\.json$/,
  );
  return m ? `${m[1]}/${m[2]}` : rel;
};

/** Absolute path from any checkout -> repo-relative, so worktrees collapse together. */
const repoRelative = (abs) => {
  const i = abs.indexOf("/packages/");
  return i === -1 ? relative(root, abs) : abs.slice(i + 1);
};

const pct = (covered, total) => (total === 0 ? 100 : (covered / total) * 100);

// file -> best-tier record. "Best" is decided on statement pct, since that is the
// number the gates and the published report both lead with.
const best = new Map();
const tiers = [];

for (const rel of reports.sort()) {
  const tier = tierOf(rel);
  const data = JSON.parse(readFileSync(resolve(root, rel), "utf8"));
  let tS = 0;
  let tSC = 0;

  for (const entry of Object.values(data)) {
    const sTotal = Object.keys(entry.s ?? {}).length;
    if (sTotal === 0) {
      continue; // barrels and CSS modules carry no statements — not gaps
    }
    const sCov = Object.values(entry.s).filter((n) => n > 0).length;
    const bAll = Object.values(entry.b ?? {}).flat();
    const bTotal = bAll.length;
    const bCov = bAll.filter((n) => n > 0).length;

    tS += sTotal;
    tSC += sCov;

    const file = repoRelative(entry.path);
    const rec = {
      file,
      tier,
      sPct: pct(sCov, sTotal),
      bPct: pct(bCov, bTotal),
      uncoveredS: sTotal - sCov,
      uncoveredB: bTotal - bCov,
    };
    const prev = best.get(file);
    if (!prev || rec.sPct > prev.sPct) {
      best.set(file, rec);
    }
  }
  tiers.push({ tier, pct: pct(tSC, tS), files: Object.keys(data).length });
}

const gaps = [...best.values()]
  .filter((r) => r.sPct < MIN_PCT || r.uncoveredB > 0)
  .sort(
    (a, b) =>
      b.uncoveredS + b.uncoveredB - (a.uncoveredS + a.uncoveredB) ||
      a.sPct - b.sPct,
  );

if (AS_JSON) {
  console.log(
    JSON.stringify(
      { tiers, gaps: gaps.slice(0, LIMIT), totalGaps: gaps.length },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`tiers measured (${tiers.length}):`);
for (const t of tiers) {
  console.log(`  ${t.pct.toFixed(2).padStart(6)}%  ${t.tier}`);
}
console.log(
  `\nper-file gaps below ${MIN_PCT}% statements, or with any uncovered branch.` +
    `\nEach file is shown at its BEST tier — a file covered elsewhere is not a gap.\n`,
);
console.log("  stmt%   miss-s  miss-b  file  (best tier)");
for (const g of gaps.slice(0, LIMIT)) {
  console.log(
    `  ${g.sPct.toFixed(1).padStart(5)}  ${String(g.uncoveredS).padStart(6)}  ` +
      `${String(g.uncoveredB).padStart(6)}  ${g.file}  (${g.tier})`,
  );
}
if (gaps.length > LIMIT) {
  console.log(`\n  … ${gaps.length - LIMIT} more (raise --limit)`);
}
console.log(
  `\n${gaps.length} file(s) with a gap, out of ${best.size} measured.`,
);
