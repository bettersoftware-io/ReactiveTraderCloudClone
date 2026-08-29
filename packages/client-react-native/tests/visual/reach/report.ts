import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Prints the per-file visual-reach list from the coverage summary that
 * `scenarioReach.test.tsx` produced (see its header for what "reach" means).
 * Report-only: it gates nothing, like the web reach tiers, and exits 0.
 *
 * Files that are test scaffolding living under `src/ui` are excluded from
 * both the list and the total, so a 0% there cannot be mistaken for an
 * unwitnessed app surface: the `*Harness.tsx` jest harnesses around the boot
 * scenes, `renderWithTheme.tsx`, the dev-only `_probe/MotionProbe`, and the
 * `*.test.tsx` files themselves.
 */
const SUMMARY = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../reports/native/visual-reach/coverage-summary.json",
);

const SCAFFOLDING =
  /(\.test\.tsx|Harness\.tsx|renderWithTheme\.tsx|\/_probe\/)/;

const LOW_WATERMARK = 60;

interface FileReach {
  readonly file: string;
  readonly covered: number;
  readonly total: number;
  readonly pct: number;
}

interface IstanbulSummary {
  readonly [path: string]: {
    readonly statements: { readonly covered: number; readonly total: number };
  };
}

const summary = JSON.parse(readFileSync(SUMMARY, "utf8")) as IstanbulSummary;
const files: FileReach[] = Object.entries(summary)
  .filter(([path]) => {
    return path !== "total" && !SCAFFOLDING.test(path);
  })
  .map(([path, { statements }]) => {
    const file = path.slice(path.indexOf("/src/ui/") + 1);
    const pct =
      statements.total === 0
        ? 100
        : (statements.covered / statements.total) * 100;
    return { file, covered: statements.covered, total: statements.total, pct };
  })
  .sort((a, b) => {
    return a.pct - b.pct || a.file.localeCompare(b.file);
  });

const covered = files.reduce((acc, f) => {
  return acc + f.covered;
}, 0);

const total = files.reduce((acc, f) => {
  return acc + f.total;
}, 0);

const unreached = files.filter((f) => {
  return f.pct === 0;
});

const low = files.filter((f) => {
  return f.pct > 0 && f.pct < LOW_WATERMARK;
});

console.log(
  `visual reach: ${((covered / total) * 100).toFixed(1)}% of src/ui statements (${covered}/${total}, ${files.length} files) are rendered by the scenario registry`,
);
console.log(
  `\n${unreached.length} file(s) NO golden renders — a change here has no "before":`,
);

for (const f of unreached) {
  console.log(`  ${f.file}  (${f.total} statements)`);
}

console.log(`\n${low.length} file(s) below ${LOW_WATERMARK}%:`);

for (const f of low) {
  console.log(`  ${f.file}  ${f.pct.toFixed(1)}%`);
}
