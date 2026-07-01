import { describe, expect, it } from "vitest";

import { coverageOf, type FileMap, fileStat, packageStat } from "./coverage";

describe("coverageOf", () => {
  it("maps each line to its statement hit count", () => {
    const fm = coverageOf(cov("/r/a.ts", { 1: 3, 2: 0 }));
    expect(fm.get("/r/a.ts")?.get(1)?.hits).toBe(3);
    expect(fm.get("/r/a.ts")?.get(2)?.hits).toBe(0);
  });

  it("attaches per-line branch coverage where present", () => {
    const fm = coverageOf(cov("/r/a.ts", { 1: 1 }, { 1: [1, 0] }));
    expect(fm.get("/r/a.ts")?.get(1)?.branch).toEqual({ covered: 1, total: 2 });
  });
});

describe("fileStat", () => {
  it("separates uncovered lines from partial-branch lines", () => {
    const lines = coverageOf(
      cov("/r/a.ts", { 1: 1, 2: 0, 3: 1 }, { 3: [1, 0] }),
    ).get("/r/a.ts");

    if (lines === undefined) {
      throw new Error("fixture missing file");
    }

    const stat = fileStat("/r/a.ts", lines);
    expect(stat.total).toBe(3);
    expect(stat.covered).toBe(2);
    expect(stat.uncoveredLines).toEqual([2]);
    expect(stat.partialBranchLines).toEqual([3]);
  });

  it("does not flag a fully-covered branch line", () => {
    const lines = coverageOf(cov("/r/a.ts", { 1: 1 }, { 1: [1, 1] })).get(
      "/r/a.ts",
    );

    if (lines === undefined) {
      throw new Error("fixture missing file");
    }

    const stat = fileStat("/r/a.ts", lines);
    expect(stat.partialBranchLines).toEqual([]);
    expect(stat.uncoveredLines).toEqual([]);
  });

  it("reports 100% for a file with no instrumented lines", () => {
    expect(fileStat("/r/empty.ts", new Map()).pct).toBe(100);
  });
});

describe("packageStat", () => {
  it("includes files with uncovered OR partial-branch lines, worst pct first", () => {
    const fm: FileMap = new Map();
    const parts = [
      cov("/r/good.ts", { 1: 1, 2: 1 }), // 100% — excluded
      cov("/r/bad.ts", { 1: 0, 2: 0 }), // 0%
      cov("/r/partial.ts", { 1: 1 }, { 1: [1, 0] }), // 100% line, partial branch
    ];

    for (const part of parts) {
      for (const [file, lines] of coverageOf(part)) {
        fm.set(file, lines);
      }
    }

    const stat = packageStat("client/ui (visual)", fm);
    expect(stat.name).toBe("client/ui (visual)");
    expect(
      stat.files.map((f) => {
        return f.file;
      }),
    ).toEqual(["/r/bad.ts", "/r/partial.ts"]);
  });
});

// Minimal istanbul-format coverage: per-line statement hits + optional branch.
// `branches`: map of line -> [hits-per-branch-arm].
function cov(
  path: string,
  hits: Record<number, number>,
  branches: Record<number, number[]> = {},
): unknown {
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

  const branchMap: Record<string, unknown> = {};
  const b: Record<string, number[]> = {};
  let j = 0;

  for (const [line, arms] of Object.entries(branches)) {
    branchMap[j] = {
      type: "branch",
      line: Number(line),
      locations: arms.map(() => {
        return { start: { line: Number(line) } };
      }),
    };
    b[j] = arms;
    j++;
  }

  return { [path]: { path, statementMap, s, fnMap: {}, f: {}, branchMap, b } };
}
