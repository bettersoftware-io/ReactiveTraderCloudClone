import { describe, expect, it } from "vitest";

import type { PackageStat } from "./coverage";
import { render, SUMMARY_CAP } from "./render";

const repoRoot = "/r";
const src: Record<string, string[]> = {
  "/r/src/a.ts": ["const x = 1", "if (rare) {", "  edge()", "}"],
};
const readSource = (p: string): string[] | null => src[p] ?? null;

function pkg(over: Partial<PackageStat> = {}): PackageStat {
  return {
    name: "client/ui",
    total: 4,
    covered: 2,
    pct: 50,
    files: [
      { file: "/r/src/a.ts", total: 4, covered: 2, pct: 50, uncovered: [2, 3] },
    ],
    ...over,
  };
}

describe("render", () => {
  it("emits a title, the test summary, and a coverage table", () => {
    const md = render({
      title: "Coverage Report — feat @ abc123",
      testResults: [{ tier: "domain", passed: 10, failed: 0, skipped: 1 }],
      packages: [pkg()],
      repoRoot,
      readSource,
    });
    expect(md).toContain("# Coverage Report — feat @ abc123");
    expect(md).toContain("## Tests");
    expect(md).toContain("10 passed");
    expect(md).toContain("| domain |");
    expect(md).toContain("## Coverage");
    expect(md).toContain("client/ui");
  });

  it("renders untested lines as a collapsible block with source + line numbers", () => {
    const md = render({
      title: "t",
      testResults: [],
      packages: [pkg()],
      repoRoot,
      readSource,
    });
    expect(md).toContain("<details>");
    expect(md).toContain("src/a.ts"); // repo-relative path
    expect(md).toContain("if (rare) {"); // uncovered source line 2
    expect(md).toContain("edge()"); // uncovered source line 3
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

  it("degrades to line-numbers-only and notes omission past the size cap", () => {
    const many: PackageStat = {
      name: "big",
      total: 100000,
      covered: 0,
      pct: 0,
      files: Array.from({ length: 400 }, (_, i) => ({
        file: `/r/src/f${i}.ts`,
        total: 250,
        covered: 0,
        pct: 0,
        uncovered: Array.from({ length: 250 }, (_, n) => n + 1),
      })),
    };
    // Source long enough that full snippets would blow the cap.
    const big = (p: string): string[] =>
      Array.from(
        { length: 250 },
        (_, n) => `line ${n} of ${p} xxxxxxxxxxxxxxxxxxxx`,
      );
    const md = render({
      title: "t",
      testResults: [],
      packages: [many],
      repoRoot,
      readSource: big,
    });
    expect(md.length).toBeLessThanOrEqual(SUMMARY_CAP);
    expect(md).toMatch(/snippets omitted/i);
  });
});
