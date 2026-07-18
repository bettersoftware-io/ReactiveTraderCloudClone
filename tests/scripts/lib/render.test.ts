import { describe, expect, it } from "vitest";

import { type FileCov, fileStat, type PackageStat } from "./coverage";
import { render, SUMMARY_CAP } from "./render";

const repoRoot = "/r";

const src: Record<string, string[]> = {
  "/r/src/a.ts": ["const x = 1", "if (rare) {", "  edge()", "}"],
};

describe("render", () => {
  it("emits a title, the test summary, and a coverage table", () => {
    const md = render({
      title: "Coverage Report — feat @ abc123",
      testResults: [{ tier: "domain", passed: 10, failed: 0, skipped: 1 }],
      packages: [
        pkg(
          "client/ui (visual)",
          "/r/src/a.ts",
          cov([
            { line: 1, hits: 1 },
            { line: 2, hits: 1 },
            { line: 3, hits: 0 },
            { line: 4, hits: 1 },
          ]),
        ),
      ],
      repoRoot,
      readSource,
    });
    expect(md).toContain("# Coverage Report — feat @ abc123");
    expect(md).toContain("## Tests");
    expect(md).toContain("10 passed");
    expect(md).toContain("| domain |");
    expect(md).toContain("## Coverage");
    expect(md).toContain("client/ui (visual)");
  });

  it("renders the WHOLE small file in a diff block; uncovered red, covered context", () => {
    const md = render({
      title: "t",
      testResults: [],
      packages: [
        pkg(
          "client/ui (visual)",
          "/r/src/a.ts",
          cov([
            { line: 1, hits: 1 },
            { line: 2, hits: 1 },
            { line: 3, hits: 0 },
            { line: 4, hits: 1 },
          ]),
        ),
      ],
      repoRoot,
      readSource,
    });
    expect(md).toContain("```diff");
    expect(md).toContain("client/ui (visual) · src/a.ts");
    // Full file: all four source lines are present.
    expect(md).toContain("const x = 1");
    expect(md).toContain("if (rare) {");
    expect(md).toContain("edge()");
    // Covered line 1 is context (starts with space); uncovered line 3 is red (`-`).
    expect(lineWith(md, "const x = 1").startsWith(" ")).toBe(true);
    expect(lineWith(md, "edge()").startsWith("-")).toBe(true);
    // Line number 1 appears on the covered line.
    expect(lineWith(md, "const x = 1")).toContain("1");
  });

  it("annotates partial-branch lines with a branch note and flags them red", () => {
    const md = render({
      title: "t",
      testResults: [],
      packages: [
        pkg(
          "client/ui (contract)",
          "/r/src/a.ts",
          cov([
            { line: 1, hits: 1 },
            { line: 2, hits: 1, branch: { covered: 1, total: 2 } },
            { line: 3, hits: 1 },
            { line: 4, hits: 1 },
          ]),
        ),
      ],
      repoRoot,
      readSource,
    });
    const branchLine = lineWith(md, "if (rare) {");
    expect(branchLine.startsWith("-")).toBe(true);
    expect(branchLine).toContain("⚠ branch 1/2 not taken");
    expect(md).toContain("1 partial branch");
  });

  it("marks overall failure when any tier has failures", () => {
    const md = render({
      title: "t",
      testResults: [{ tier: "x", passed: 1, failed: 2, skipped: 0 }],
      packages: [],
      repoRoot,
      readSource,
    });
    expect(md).toContain("❌");
  });

  it("byte cap holds for a large pathological input (degrades + notes omission)", () => {
    const N = 5_000;
    const files = Array.from({ length: N }, (_, i) => {
      return fileStat(`/r/src/f${i}.ts`, cov([{ line: 1, hits: 0 }]));
    });

    const many: PackageStat = {
      name: "pkg",
      total: N,
      covered: 0,
      pct: 0,
      files,
    };
    const shortLine = "x".repeat(100);
    const md = render({
      title: "t",
      testResults: [],
      packages: [many],
      repoRoot,
      readSource: () => {
        return [shortLine];
      },
    });
    expect(Buffer.byteLength(md, "utf8")).toBeLessThanOrEqual(SUMMARY_CAP);
    expect(md).toMatch(/snippets omitted/i);
  });

  it("renders context windows with a ⋮ separator for a large file (>200 lines)", () => {
    const lineCount = 210;
    const source = Array.from({ length: lineCount }, (_, i) => {
      return `line ${i + 1}`;
    });
    const spec: LineSpec[] = [];

    for (let n = 1; n <= lineCount; n++) {
      spec.push({ line: n, hits: n === 5 || n === 100 ? 0 : 1 });
    }

    const md = render({
      title: "t",
      testResults: [],
      packages: [pkg("domain", "/r/src/big.ts", cov(spec))],
      repoRoot,
      readSource: () => {
        return source;
      },
    });
    // The two gaps (lines 5 and 100) sit in non-contiguous windows, so a ⋮
    // separator appears between them.
    expect(md).toContain("⋮");
    // Uncovered lines render red.
    expect(lineWith(md, "line 5").startsWith("-")).toBe(true);
    expect(lineWith(md, "line 100").startsWith("-")).toBe(true);
    // Context around a gap renders as space-prefixed (line 4 is in the first window).
    expect(lineWith(md, "line 4").startsWith(" ")).toBe(true);
    // A line far from any gap is NOT rendered — this is windowing, not full file.
    expect(md).not.toContain("line 50");
  });
});

interface LineSpec {
  line: number;
  hits: number;
  branch?: { covered: number; total: number };
}

function cov(spec: LineSpec[]): FileCov {
  const m: FileCov = new Map();

  for (const e of spec) {
    m.set(
      e.line,
      e.branch === undefined
        ? { hits: e.hits }
        : { hits: e.hits, branch: e.branch },
    );
  }

  return m;
}

function pkg(name: string, file: string, lines: FileCov): PackageStat {
  const stat = fileStat(file, lines);
  return {
    name,
    total: stat.total,
    covered: stat.covered,
    pct: stat.pct,
    files: [stat],
  };
}

function readSource(p: string): string[] | null {
  return src[p] ?? null;
}

// First rendered line that includes a given source substring (spacing-robust).
function lineWith(md: string, needle: string): string {
  return (
    md.split("\n").find((l) => {
      return l.includes(needle);
    }) ?? ""
  );
}
