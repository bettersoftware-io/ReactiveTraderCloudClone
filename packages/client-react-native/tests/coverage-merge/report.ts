import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";

import { type FileCoverage, mergeLineCoverage, percent } from "./mergeLcov";

/**
 * Prints this package's MERGED line coverage — the union of its two runners,
 * see `mergeLcov.ts` — and fails when it is below `--min-lines=<pct>`.
 *
 *     pnpm test:coverage            # both runners, then this report
 *     pnpm test:coverage:gate       # the same, failing below the CI floor
 *
 * Reads the two `lcov.info` files `test:unit:coverage` and
 * `test:native:coverage` wrote, so it must run after both.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NATIVE_LCOV = join(ROOT, "reports/native/coverage/lcov.info");
const UNIT_LCOV = join(ROOT, "reports/unit/coverage/lcov.info");
const SUMMARY = join(ROOT, "reports/merged/coverage/summary.json");
/** How many of the weakest files to list. The gate is an aggregate and cannot
 * see one weak file, so the report always names them. */
const WEAKEST = 12;

const merged = mergeLineCoverage(
  readFileSync(NATIVE_LCOV, "utf8"),
  readFileSync(UNIT_LCOV, "utf8"),
);

const weakest = [...merged.files]
  .filter((f) => {
    return f.covered < f.total;
  })
  .sort((a, b) => {
    return uncovered(b) - uncovered(a) || a.file.localeCompare(b.file);
  })
  .slice(0, WEAKEST);

console.log(
  `merged line coverage (jest ∪ vitest): ${merged.pct.toFixed(2)}% (${merged.covered}/${merged.total} lines, ${merged.files.length} files)`,
);
console.log(`\nthe ${weakest.length} files with the most uncovered lines:`);

for (const f of weakest) {
  console.log(
    `  ${String(uncovered(f)).padStart(4)} uncovered  ${percent(f.covered, f.total).toFixed(1).padStart(5)}%  ${f.file}`,
  );
}

mkdirSync(dirname(SUMMARY), { recursive: true });
writeFileSync(
  SUMMARY,
  `${JSON.stringify({ lines: { covered: merged.covered, total: merged.total, pct: Number(merged.pct.toFixed(2)) }, files: merged.files }, null, 2)}\n`,
);

const minLines = minLinesFrom(argv);

if (minLines !== undefined && merged.pct < minLines) {
  console.error(
    `\nFAIL: merged line coverage ${merged.pct.toFixed(2)}% is below the ${minLines}% floor`,
  );
  exit(1);
}

function uncovered(f: FileCoverage): number {
  return f.total - f.covered;
}

function minLinesFrom(args: readonly string[]): number | undefined {
  const flag = args.find((arg) => {
    return arg.startsWith("--min-lines=");
  });

  if (flag === undefined) {
    return undefined;
  }

  const value = Number(flag.slice("--min-lines=".length));

  if (Number.isNaN(value)) {
    throw new Error(`--min-lines needs a number, got "${flag}"`);
  }

  return value;
}
