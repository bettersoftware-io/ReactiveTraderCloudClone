import { describe, expect, it } from "vitest";

import { fileStat, lineCoverageOf, packageStat, unionLines } from "./coverage";

// Minimal istanbul-format coverage: line 1 covered, line 2 uncovered.
function cov(path: string, hits: Record<number, number>): unknown {
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  let i = 0;
  for (const [line, count] of Object.entries(hits)) {
    statementMap[i] = {
      start: { line: Number(line), column: 0 },
      end: { line: Number(line), column: 10 },
    };
    s[i] = count;
    i++;
  }
  return {
    [path]: { path, statementMap, s, fnMap: {}, f: {}, branchMap: {}, b: {} },
  };
}

describe("lineCoverageOf", () => {
  it("maps each instrumented line to its hit count", () => {
    const lines = lineCoverageOf(cov("/r/a.ts", { 1: 3, 2: 0 }));
    expect(lines.get("/r/a.ts")?.get(1)).toBe(3);
    expect(lines.get("/r/a.ts")?.get(2)).toBe(0);
  });
});

describe("unionLines", () => {
  it("treats a line covered in either report as covered (per-line max)", () => {
    const a = lineCoverageOf(cov("/r/a.ts", { 5: 0, 6: 0 })); // contract: both uncovered
    const b = lineCoverageOf(cov("/r/a.ts", { 5: 1, 6: 0 })); // visual: line 5 covered
    const merged = unionLines([a, b]);
    expect(merged.get("/r/a.ts")?.get(5)).toBe(1);
    expect(merged.get("/r/a.ts")?.get(6)).toBe(0);
  });

  it("keeps files present in only one report", () => {
    const a = lineCoverageOf(cov("/r/only-a.ts", { 1: 1 }));
    const b = lineCoverageOf(cov("/r/only-b.ts", { 1: 0 }));
    const merged = unionLines([a, b]);
    expect(merged.has("/r/only-a.ts")).toBe(true);
    expect(merged.has("/r/only-b.ts")).toBe(true);
  });
});

describe("fileStat", () => {
  it("computes pct and sorted uncovered line list", () => {
    const lines = lineCoverageOf(cov("/r/a.ts", { 3: 0, 1: 1, 2: 0 })).get(
      "/r/a.ts",
    );
    if (lines === undefined) throw new Error("fixture missing file"); // no `!` (Biome bans non-null assertions)
    const stat = fileStat("/r/a.ts", lines);
    expect(stat.total).toBe(3);
    expect(stat.covered).toBe(1);
    expect(stat.pct).toBeCloseTo(33.33, 1);
    expect(stat.uncovered).toEqual([2, 3]);
  });

  it("reports 100% for a file with no instrumented lines", () => {
    expect(fileStat("/r/empty.ts", new Map()).pct).toBe(100);
  });
});

describe("packageStat", () => {
  it("aggregates totals and lists only files with gaps, worst pct first", () => {
    const lines = unionLines([
      lineCoverageOf(cov("/r/good.ts", { 1: 1, 2: 1 })), // 100%, no gaps -> omitted
      lineCoverageOf(cov("/r/bad.ts", { 1: 0, 2: 0 })), // 0%
      lineCoverageOf(cov("/r/mid.ts", { 1: 1, 2: 0 })), // 50%
    ]);
    const stat = packageStat("client/ui", lines);
    expect(stat.total).toBe(6);
    expect(stat.covered).toBe(3);
    expect(stat.pct).toBe(50);
    expect(stat.files.map((f) => f.file)).toEqual(["/r/bad.ts", "/r/mid.ts"]);
  });
});
