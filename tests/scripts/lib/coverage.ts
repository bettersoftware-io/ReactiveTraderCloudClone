// istanbul-lib-coverage is CommonJS. Under Node's native ESM loader (how the
// CLI runs via tsx) a named import fails — the cjs-module-lexer doesn't surface
// `createCoverageMap` as a named export — so default-import the module object
// and reach members off it. The type import is erased at runtime.
import libCoverage, { type CoverageMapData } from "istanbul-lib-coverage";

export interface LineCov {
  hits: number;
  branch?: { covered: number; total: number };
}

export type FileCov = Map<number, LineCov>;
export type FileMap = Map<string, FileCov>;

export interface FileStat {
  file: string;
  total: number;
  covered: number;
  pct: number;
  uncoveredLines: number[];
  partialBranchLines: number[];
  lines: FileCov;
}

export interface PackageStat {
  name: string;
  total: number;
  covered: number;
  pct: number;
  files: FileStat[];
}

export function coverageOf(coverageJson: unknown): FileMap {
  const map = libCoverage.createCoverageMap(coverageJson as CoverageMapData);
  const out: FileMap = new Map();

  for (const file of map.files()) {
    const fc = map.fileCoverageFor(file);
    const lineHits = fc.getLineCoverage();
    const branchByLine = fc.getBranchCoverageByLine();
    const lines: FileCov = new Map();

    for (const [line, hits] of Object.entries(lineHits)) {
      lines.set(Number(line), { hits });
    }

    for (const [line, data] of Object.entries(branchByLine)) {
      const n = Number(line);
      const existing = lines.get(n) ?? { hits: 0 };

      lines.set(n, {
        hits: existing.hits,
        branch: { covered: data.covered, total: data.total },
      });
    }

    out.set(file, lines);
  }

  return out;
}

export function fileStat(file: string, lines: FileCov): FileStat {
  let covered = 0;
  const uncoveredLines: number[] = [];
  const partialBranchLines: number[] = [];

  for (const [line, cov] of lines) {
    if (cov.hits > 0) {
      covered++;

      if (cov.branch !== undefined && cov.branch.covered < cov.branch.total) {
        partialBranchLines.push(line);
      }
    } else {
      uncoveredLines.push(line);
    }
  }

  uncoveredLines.sort((a, b) => {
    return a - b;
  });
  partialBranchLines.sort((a, b) => {
    return a - b;
  });

  const total = lines.size;
  const pct = total === 0 ? 100 : (covered / total) * 100;
  return {
    file,
    total,
    covered,
    pct,
    uncoveredLines,
    partialBranchLines,
    lines,
  };
}

export function packageStat(name: string, files: FileMap): PackageStat {
  const stats: FileStat[] = [];
  let total = 0;
  let covered = 0;

  for (const [file, lines] of files) {
    const stat = fileStat(file, lines);
    total += stat.total;
    covered += stat.covered;

    if (stat.uncoveredLines.length > 0 || stat.partialBranchLines.length > 0) {
      stats.push(stat);
    }
  }

  stats.sort((a, b) => {
    return a.pct - b.pct;
  });

  const pct = total === 0 ? 100 : (covered / total) * 100;
  return { name, total, covered, pct, files: stats };
}
