// istanbul-lib-coverage is CommonJS. Under Node's native ESM loader (how the
// CLI runs via tsx) a named import fails — the cjs-module-lexer doesn't surface
// `createCoverageMap` as a named export — so default-import the module object
// and reach members off it (`libCoverage.createCoverageMap`). The type import is
// erased at runtime, so it's harmless.
import libCoverage, { type CoverageMapData } from "istanbul-lib-coverage";

export type LineHits = Map<number, number>;
export type FileLines = Map<string, LineHits>;

export interface FileStat {
  file: string;
  total: number;
  covered: number;
  pct: number;
  uncovered: number[];
}

export interface PackageStat {
  name: string;
  total: number;
  covered: number;
  pct: number;
  files: FileStat[];
}

export function lineCoverageOf(coverageJson: unknown): FileLines {
  const map = libCoverage.createCoverageMap(coverageJson as CoverageMapData);
  const out: FileLines = new Map();
  for (const file of map.files()) {
    const lc = map.fileCoverageFor(file).getLineCoverage();
    const lines: LineHits = new Map();
    for (const [line, hits] of Object.entries(lc)) {
      lines.set(Number(line), hits);
    }
    out.set(file, lines);
  }
  return out;
}

export function unionLines(reports: FileLines[]): FileLines {
  const out: FileLines = new Map();
  for (const report of reports) {
    for (const [file, lines] of report) {
      const merged = out.get(file) ?? new Map<number, number>();
      for (const [line, hits] of lines) {
        merged.set(line, Math.max(merged.get(line) ?? 0, hits));
      }
      out.set(file, merged);
    }
  }
  return out;
}

export function fileStat(file: string, lines: LineHits): FileStat {
  let covered = 0;
  const uncovered: number[] = [];
  for (const [line, hits] of lines) {
    if (hits > 0) covered++;
    else uncovered.push(line);
  }
  uncovered.sort((a, b) => a - b);
  const total = lines.size;
  const pct = total === 0 ? 100 : (covered / total) * 100;
  return { file, total, covered, pct, uncovered };
}

export function packageStat(name: string, lines: FileLines): PackageStat {
  const files: FileStat[] = [];
  let total = 0;
  let covered = 0;
  for (const [file, lh] of lines) {
    const stat = fileStat(file, lh);
    total += stat.total;
    covered += stat.covered;
    if (stat.uncovered.length > 0) files.push(stat);
  }
  files.sort((a, b) => a.pct - b.pct);
  const pct = total === 0 ? 100 : (covered / total) * 100;
  return { name, total, covered, pct, files };
}
