/**
 * Merges the line coverage of this package's two test runners into the one
 * figure that is actually "RN's coverage".
 *
 * jest (istanbul) and vitest (v8) each run half the tests and each report the
 * whole package, so neither percentage is the package's and they cannot be
 * added: the two providers do not even agree on how many statements a file
 * has. LINES are the one unit both report against the same source text, so the
 * merge is a union of lines:
 *
 * - the DENOMINATOR is the set of lines the first report (jest's) instruments
 *   for a file — one provider's notion of "a line that can be covered", so a
 *   file is never counted twice or measured by two rulers;
 * - a line is COVERED when either report recorded a hit on it;
 * - a file only the second report knows is taken as that report has it.
 *
 * Statements, branches and functions are deliberately not merged: their
 * identities are provider-specific and a union of them would be invented.
 */
export function mergeLineCoverage(
  primaryLcov: string,
  secondaryLcov: string,
): MergedCoverage {
  const primary = parseLcov(primaryLcov);
  const secondary = parseLcov(secondaryLcov);
  const files: FileCoverage[] = [];

  for (const [file, lines] of primary) {
    const other = secondary.get(file);
    let covered = 0;

    for (const [line, hits] of lines) {
      if (hits > 0 || (other?.get(line) ?? 0) > 0) {
        covered += 1;
      }
    }

    files.push({ file, covered, total: lines.size });
  }

  for (const [file, lines] of secondary) {
    if (primary.has(file)) {
      continue;
    }

    let covered = 0;

    for (const hits of lines.values()) {
      if (hits > 0) {
        covered += 1;
      }
    }

    files.push({ file, covered, total: lines.size });
  }

  const covered = files.reduce((sum, f) => {
    return sum + f.covered;
  }, 0);

  const total = files.reduce((sum, f) => {
    return sum + f.total;
  }, 0);

  return { files, covered, total, pct: percent(covered, total) };
}

/** A file's or a package's covered share, as a percentage. An empty
 * denominator reads 100: nothing coverable is nothing uncovered. */
export function percent(covered: number, total: number): number {
  return total === 0 ? 100 : (covered / total) * 100;
}

export interface FileCoverage {
  /** Path from the package root (`src/…`), the same in both reports. */
  readonly file: string;
  readonly covered: number;
  readonly total: number;
}

export interface MergedCoverage {
  readonly files: readonly FileCoverage[];
  readonly covered: number;
  readonly total: number;
  readonly pct: number;
}

/** file → line → hit count, from an lcov tracefile's `SF:` / `DA:` records. */
function parseLcov(lcov: string): Map<string, Map<number, number>> {
  const files = new Map<string, Map<number, number>>();
  let lines: Map<number, number> | undefined;

  for (const raw of lcov.split("\n")) {
    const record = raw.trim();

    if (record.startsWith("SF:")) {
      const file = packageRelative(record.slice(3));
      lines = files.get(file) ?? new Map<number, number>();
      files.set(file, lines);
      continue;
    }

    if (record.startsWith("DA:") && lines !== undefined) {
      const [line, hits] = record.slice(3).split(",");
      const lineNumber = Number(line);
      lines.set(lineNumber, Math.max(lines.get(lineNumber) ?? 0, Number(hits)));
    }
  }

  return files;
}

/** jest writes `SF:src/…`, vitest an absolute path; both end in the same
 * `src/…` tail, which is the key the two reports are joined on. */
function packageRelative(path: string): string {
  const at = path.lastIndexOf("/src/");

  if (path.startsWith("src/") || at === -1) {
    return path;
  }

  return path.slice(at + 1);
}
