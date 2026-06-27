# Coverage Report — Full-File Rendering + Per-Tier Sections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render whole files (uncovered + partial-branch lines highlighted) in the coverage job summary, and report the two UI test tiers as separate sections.

**Architecture:** Enrich the coverage library with per-line branch data and drop cross-tier union; render each file as a `diff` fenced block (full file ≤200 lines, else context windows); the CLI groups the five `coverage-final.json` files as five standalone tiers.

**Tech Stack:** TypeScript (Node ESM via tsx), vitest, istanbul-lib-coverage, GitHub Actions job summary.

## Global Constraints

- `@rtc/tests` lives at `tests/`. Run commands as `pnpm --filter @rtc/tests …` (or `pnpm exec …` from `tests/`). Relative imports OMIT the `.ts` extension (moduleResolution: bundler).
- **CI runs ESLint AST rules + a type-aware ESLint pass ON TOP of Biome.** Biome-clean ≠ CI-clean. Every code task MUST end green on ALL of: `pnpm exec biome ci .`, `pnpm lint:eslint`, `pnpm lint:eslint:types`, `pnpm --filter @rtc/tests typecheck`. The non-auto-fixable rule is `func-style` — **always use function declarations, never arrow consts at statement scope**. `arrow-body-style` (block bodies required) and `padding-line-between-statements` are auto-fixed by `eslint --fix`; run it then `biome format --write` to reconcile.
- Biome strict, NO disables: no non-null assertions (`!`), no default exports, explicit return types on every function, no `any`.
- `istanbul-lib-coverage` is CommonJS — keep the existing `import libCoverage, { type CoverageMapData } from "istanbul-lib-coverage"` + `libCoverage.createCoverageMap(...)` form.
- `SUMMARY_CAP = 900_000` (UTF-8 bytes, via `Buffer.byteLength`); `NOTE_RESERVE = 256`; `FULL_FILE_MAX = 200`; `CONTEXT = 5`.
- Per-line diff coloring requires a ```diff fenced block (first char `-` ⇒ red, space ⇒ context). Uncovered statement lines AND partial-branch lines ⇒ `-`; everything else ⇒ space.
- A line with `hits === 0` is **uncovered** (never "partial"); a line with `hits > 0` and `branch.covered < branch.total` is a **partial branch**.
- Five standalone tiers (no union): `domain`, `server`, `client/app`, `client/ui (contract)`, `client/ui (visual)`. The coverage table % stays line-based.
- `.github/workflows/coverage-report.yml`, `ci.yml`, and all coverage scripts are UNCHANGED.

---

## File Structure

- `tests/scripts/lib/coverage.ts` — branch-aware model: `coverageOf`, `fileStat`, `packageStat`; types `LineCov`/`FileCov`/`FileMap`/`FileStat`/`PackageStat`. (`unionLines`/`lineCoverageOf`/`LineHits`/`FileLines` removed.)
- `tests/scripts/lib/render.ts` — `fileDiff` (full/windows), diff-block `fileBlock`, `linesOnlyBlock`, `fileSummary`; `render`, `SUMMARY_CAP`, `testSection`, `coverageTable` retained.
- `tests/scripts/coverage-report.ts` — 5 single-path tiers; `coverageOf` (no union); `coverageOverride` shape `{name, file}`.
- Tests: `coverage.test.ts`, `render.test.ts`, `coverage-report.smoke.test.ts`.
- Fixtures: `tests/scripts/lib/__fixtures__/domain.coverage.json` (add a branch), `domain.results.json` (unchanged).

---

### Task 1: Branch-aware coverage library

**Files:**
- Modify (replace contents): `tests/scripts/lib/coverage.ts`
- Modify (replace contents): `tests/scripts/lib/coverage.test.ts`

**Interfaces:**
- Consumes: `istanbul-lib-coverage`.
- Produces:
  - `interface LineCov { hits: number; branch?: { covered: number; total: number } }`
  - `type FileCov = Map<number, LineCov>`
  - `type FileMap = Map<string, FileCov>`
  - `interface FileStat { file: string; total: number; covered: number; pct: number; uncoveredLines: number[]; partialBranchLines: number[]; lines: FileCov }`
  - `interface PackageStat { name: string; total: number; covered: number; pct: number; files: FileStat[] }`
  - `coverageOf(coverageJson: unknown): FileMap`
  - `fileStat(file: string, lines: FileCov): FileStat`
  - `packageStat(name: string, files: FileMap): PackageStat`

- [ ] **Step 1: Replace the test file**

```ts
// tests/scripts/lib/coverage.test.ts
import { describe, expect, it } from "vitest";

import { coverageOf, type FileMap, fileStat, packageStat } from "./coverage";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/coverage.test.ts`
Expected: FAIL — `coverageOf` is not exported / does not exist.

- [ ] **Step 3: Replace `coverage.ts` with the branch-aware implementation**

```ts
// tests/scripts/lib/coverage.ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/coverage.test.ts`
Expected: PASS (all cases). NOTE: this leaves `render.ts` and `coverage-report.ts` broken (they still import the removed `lineCoverageOf`/`unionLines`) — that is expected; Tasks 2 and 3 fix them. Do not run the whole suite yet.

- [ ] **Step 5: Lint the changed file**

Run: `pnpm exec eslint --fix tests/scripts/lib/coverage.ts tests/scripts/lib/coverage.test.ts && pnpm exec biome format --write tests/scripts/lib/coverage.ts tests/scripts/lib/coverage.test.ts && pnpm exec eslint tests/scripts/lib/coverage.ts tests/scripts/lib/coverage.test.ts && pnpm exec biome ci tests/scripts/lib/coverage.ts tests/scripts/lib/coverage.test.ts`
Expected: eslint exits 0, biome exits 0. (If `func-style` fires, convert the offending arrow const to a `function` declaration.)

- [ ] **Step 6: Commit**

```bash
git add tests/scripts/lib/coverage.ts tests/scripts/lib/coverage.test.ts
git commit -m "feat(coverage-report): branch-aware per-line coverage model

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LRPSjYaPFbgyovy3ngHkNR"
```

---

### Task 2: Diff-block renderer

**Files:**
- Modify (replace contents): `tests/scripts/lib/render.ts`
- Modify (replace contents): `tests/scripts/lib/render.test.ts`

**Interfaces:**
- Consumes: `FileStat`, `FileCov`, `PackageStat`, `fileStat` from `./coverage`; `TierResult` from `./testResults`.
- Produces: `render(input: RenderInput): string`, `SUMMARY_CAP` (unchanged signature/exports). `RenderInput` unchanged.

- [ ] **Step 1: Replace the test file**

```ts
// tests/scripts/lib/render.test.ts
import { describe, expect, it } from "vitest";

import { type FileCov, fileStat, type PackageStat } from "./coverage";
import { render, SUMMARY_CAP } from "./render";

const repoRoot = "/r";

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
      e.branch === undefined ? { hits: e.hits } : { hits: e.hits, branch: e.branch },
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

const src: Record<string, string[]> = {
  "/r/src/a.ts": ["const x = 1", "if (rare) {", "  edge()", "}"],
};

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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/render.test.ts`
Expected: FAIL — render still uses the old `uncovered`/`snippet` model (or compile error on `FileStat` shape).

- [ ] **Step 3: Replace `render.ts`**

```ts
// tests/scripts/lib/render.ts
import { relative } from "node:path";

import type { FileStat, PackageStat } from "./coverage";
import type { TierResult } from "./testResults";

export const SUMMARY_CAP = 900_000;

// Upper bound on the cap-warning note's byte contribution (1 join separator +
// note text). 256 safely covers the longest form including a large count.
const NOTE_RESERVE = 256;

// Render the entire file when it has this many source lines or fewer; larger
// files fall back to ±CONTEXT windows around each gap.
const FULL_FILE_MAX = 200;
const CONTEXT = 5;

export interface RenderInput {
  title: string;
  testResults: TierResult[];
  packages: PackageStat[];
  repoRoot: string;
  readSource: (absPath: string) => string[] | null;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function testSection(results: TierResult[]): string {
  const passed = results.reduce((a, r) => {
    return a + r.passed;
  }, 0);
  const failed = results.reduce((a, r) => {
    return a + r.failed;
  }, 0);
  const skipped = results.reduce((a, r) => {
    return a + r.skipped;
  }, 0);
  const status = failed > 0 ? "❌" : "✅";
  const rows = results
    .map((r) => {
      return `| ${r.tier} | ${r.passed} | ${r.failed} | ${r.skipped} |`;
    })
    .join("\n");
  return [
    "## Tests",
    `${status} ${passed} passed · ${failed} failed · ${skipped} skipped`,
    "",
    "| Suite | Passed | Failed | Skipped |",
    "|-------|-------:|-------:|--------:|",
    rows,
    "",
  ].join("\n");
}

function coverageTable(packages: PackageStat[]): string {
  const rows = packages
    .map((p) => {
      return `| ${p.name} | ${pct(p.pct)} | ${p.covered} | ${p.total - p.covered} |`;
    })
    .join("\n");
  return [
    "## Coverage",
    "| Package | Lines | Covered | Uncovered |",
    "|---------|------:|--------:|----------:|",
    rows,
    "",
  ].join("\n");
}

function fileSummary(stat: FileStat, rel: string, tier: string): string {
  const u = stat.uncoveredLines.length;
  const b = stat.partialBranchLines.length;
  const branchPart = b > 0 ? `, ${b} partial branch${b === 1 ? "" : "es"}` : "";
  return `${tier} · ${rel} — ${pct(stat.pct)} (${u} uncovered${branchPart})`;
}

// The ordered line numbers to render: the full file when small, else merged
// ±CONTEXT windows around gaps. A `0` entry marks a window separator (⋮).
function renderedLineNumbers(stat: FileStat, lineCount: number): number[] {
  if (lineCount <= FULL_FILE_MAX) {
    return Array.from({ length: lineCount }, (_, i) => {
      return i + 1;
    });
  }

  const interesting = [
    ...stat.uncoveredLines,
    ...stat.partialBranchLines,
  ].sort((a, b) => {
    return a - b;
  });
  const ranges: Array<[number, number]> = [];

  for (const line of interesting) {
    const lo = Math.max(1, line - CONTEXT);
    const hi = Math.min(lineCount, line + CONTEXT);
    const last = ranges.at(-1);

    if (last !== undefined && lo <= last[1] + 1) {
      last[1] = Math.max(last[1], hi);
    } else {
      ranges.push([lo, hi]);
    }
  }

  const out: number[] = [];

  for (let r = 0; r < ranges.length; r++) {
    if (r > 0) {
      out.push(0);
    }

    const range = ranges[r];

    for (let n = range[0]; n <= range[1]; n++) {
      out.push(n);
    }
  }

  return out;
}

function diffLine(stat: FileStat, n: number, source: string[]): string {
  const cov = stat.lines.get(n);
  const text = source[n - 1] ?? "";
  const branch = cov?.branch;
  const uncovered = cov !== undefined && cov.hits === 0;
  const partial =
    cov !== undefined &&
    cov.hits > 0 &&
    branch !== undefined &&
    branch.covered < branch.total;
  const prefix = uncovered || partial ? "-" : " ";
  const note =
    partial && branch !== undefined
      ? `    // ⚠ branch ${branch.covered}/${branch.total} not taken`
      : "";
  return `${prefix}  ${String(n).padStart(4)}  ${text}${note}`;
}

function fileDiff(stat: FileStat, source: string[]): string {
  return renderedLineNumbers(stat, source.length)
    .map((n) => {
      if (n === 0) {
        return "    ⋮";
      }

      return diffLine(stat, n, source);
    })
    .join("\n");
}

function linesOnlyBlock(stat: FileStat, rel: string, tier: string): string {
  const parts = [
    `uncovered lines: ${stat.uncoveredLines.join(", ") || "none"}`,
  ];

  if (stat.partialBranchLines.length > 0) {
    parts.push(`partial-branch lines: ${stat.partialBranchLines.join(", ")}`);
  }

  return `<details><summary>${fileSummary(stat, rel, tier)}</summary>\n\n${parts.join("\n")}\n</details>\n`;
}

function fileBlock(
  stat: FileStat,
  rel: string,
  tier: string,
  source: string[] | null,
): string {
  if (source === null) {
    return linesOnlyBlock(stat, rel, tier);
  }

  return [
    `<details><summary>${fileSummary(stat, rel, tier)}</summary>`,
    "",
    "```diff",
    fileDiff(stat, source),
    "```",
    "</details>",
    "",
  ].join("\n");
}

export function render(input: RenderInput): string {
  const head = [
    `# ${input.title}`,
    "",
    testSection(input.testResults),
    coverageTable(input.packages),
  ];

  // Flatten all tiers' files-with-gaps, worst line-coverage first.
  const flat = input.packages
    .flatMap((p) => {
      return p.files.map((f) => {
        return { stat: f, tier: p.name };
      });
    })
    .sort((a, b) => {
      return a.stat.pct - b.stat.pct;
    });

  const body: string[] = ["### Untested lines", ""];
  // Exact UTF-8 byte length of [...head, body.join("\n")].join("\n") so far,
  // including the "\n" between head and body. GitHub's cap is bytes, not UTF-16
  // code units, so Buffer.byteLength is required.
  let size = Buffer.byteLength([...head, body.join("\n")].join("\n"), "utf8");
  let omitted = 0;
  let capped = false;

  for (const { stat, tier } of flat) {
    const rel = relative(input.repoRoot, stat.file);

    if (!capped) {
      const block = fileBlock(stat, rel, tier, input.readSource(stat.file));

      if (
        size + 1 + Buffer.byteLength(block, "utf8") >
        SUMMARY_CAP - NOTE_RESERVE
      ) {
        capped = true;
      } else {
        body.push(block);
        size += 1 + Buffer.byteLength(block, "utf8");
        continue;
      }
    }

    const lean = linesOnlyBlock(stat, rel, tier);

    if (
      size + 1 + Buffer.byteLength(lean, "utf8") >
      SUMMARY_CAP - NOTE_RESERVE
    ) {
      omitted++;
    } else {
      body.push(lean);
      size += 1 + Buffer.byteLength(lean, "utf8");
    }
  }

  if (capped) {
    body.push(
      `\n> ⚠️ Output approached the 1 MiB job-summary cap: remaining files show line numbers only${omitted > 0 ? `, and ${omitted} more files: snippets omitted` : ""}.`,
    );
  }

  return [...head, body.join("\n")].join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/render.test.ts`
Expected: PASS (all cases). The byte-cap test must show `Buffer.byteLength(md) <= 900000` and `/snippets omitted/i`.

- [ ] **Step 5: Lint the changed files**

Run: `pnpm exec eslint --fix tests/scripts/lib/render.ts tests/scripts/lib/render.test.ts && pnpm exec biome format --write tests/scripts/lib/render.ts tests/scripts/lib/render.test.ts && pnpm exec eslint tests/scripts/lib/render.ts tests/scripts/lib/render.test.ts && pnpm exec biome ci tests/scripts/lib/render.ts tests/scripts/lib/render.test.ts`
Expected: both exit 0. (After `eslint --fix`/`biome format`, re-read the file before any further manual edit. Verify the `   1  const x = 1` / `-  3    edge()` spacing assertions still hold — if `biome format` altered template-literal spacing, adjust the test's expected strings to match the emitted output, not the other way around.)

- [ ] **Step 6: Commit**

```bash
git add tests/scripts/lib/render.ts tests/scripts/lib/render.test.ts
git commit -m "feat(coverage-report): full-file diff rendering with branch notes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LRPSjYaPFbgyovy3ngHkNR"
```

---

### Task 3: CLI five-tier manifest + smoke test + fixture

**Files:**
- Modify: `tests/scripts/coverage-report.ts`
- Modify (replace contents): `tests/scripts/coverage-report.smoke.test.ts`
- Modify: `tests/scripts/lib/__fixtures__/domain.coverage.json`

**Interfaces:**
- Consumes: `coverageOf`, `packageStat` from `./lib/coverage`; `render`; `summarize`/`TierResult`.
- Produces: `TIERS` (coverage entries now `{name, path}`, 5 of them); `main` accepting `coverageOverride: { name: string; file: string }[]`.

- [ ] **Step 1: Edit the imports in `coverage-report.ts`**

Replace line 5:
```ts
import { lineCoverageOf, packageStat, unionLines } from "./lib/coverage";
```
with:
```ts
import { coverageOf, packageStat } from "./lib/coverage";
```

- [ ] **Step 2: Replace the `TIERS.coverage` array** (lines 9–31)

```ts
// Coverage tiers (paths relative to repo root). Each tier is reported standalone
// (no union) so every file is attributable to one script; the two UI tiers
// (contract specs vs visual goldens) appear as separate sections.
export const TIERS = {
  coverage: [
    {
      name: "domain",
      path: "packages/domain/reports/unit/coverage/coverage-final.json",
    },
    {
      name: "server",
      path: "packages/server/reports/unit/coverage/coverage-final.json",
    },
    {
      name: "client/app",
      path: "packages/client-react/reports/app/coverage/coverage-final.json",
    },
    {
      name: "client/ui (contract)",
      path: "packages/client-react/reports/ui/contract/coverage/coverage-final.json",
    },
    {
      name: "client/ui (visual)",
      path: "packages/client-react/reports/ui/visual/coverage/coverage-final.json",
    },
  ],
```
(Leave the `results: [...]` array and the closing `} as const;` unchanged.)

- [ ] **Step 3: Replace the `CoverageOverride` interface** (lines 66–69)

```ts
interface CoverageOverride {
  name: string;
  file: string;
}
```

- [ ] **Step 4: Replace the coverage-tier mapping in `main`** (lines 87–111)

```ts
  const covTiers =
    opts.coverageOverride ??
    TIERS.coverage.map((t) => {
      return { name: t.name, file: resolve(repoRoot, t.path) };
    });

  const packages = covTiers
    .map((t) => {
      const json = readJson(t.file);

      if (json === null) {
        return null;
      }

      return packageStat(t.name, coverageOf(json));
    })
    .filter((p): p is NonNullable<typeof p> => {
      return p !== null;
    });
```

- [ ] **Step 5: Replace the smoke test**

```ts
// tests/scripts/coverage-report.smoke.test.ts
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { main, TIERS } from "./coverage-report";

describe("coverage-report CLI", () => {
  it("exposes the five standalone coverage tiers", () => {
    expect(
      TIERS.coverage.map((t) => {
        return t.name;
      }),
    ).toEqual([
      "domain",
      "server",
      "client/app",
      "client/ui (contract)",
      "client/ui (visual)",
    ]);
    // Each tier reads exactly one coverage-final.json (no union).
    for (const t of TIERS.coverage) {
      expect(typeof t.path).toBe("string");
    }
  });

  it("renders a report from fixtures without throwing", async () => {
    const dir = fileURLToPath(new URL("./lib/__fixtures__/", import.meta.url));
    const md = await main({
      repoRoot: "/r",
      coverageOverride: [
        { name: "domain", file: `${dir}domain.coverage.json` },
      ],
      resultsOverride: [
        { tier: "domain", file: `${dir}domain.results.json` },
      ],
    });
    expect(md).toContain("## Coverage");
    expect(md).toContain("3 passed");
    expect(md).toContain("packages/domain/src/sample.ts");
    expect(md).toContain("```diff");
  });
});
```

- [ ] **Step 6: Add a branch to the fixture** so the smoke output exercises a partial branch

Replace `tests/scripts/lib/__fixtures__/domain.coverage.json` with:
```json
{
  "/r/packages/domain/src/sample.ts": {
    "path": "/r/packages/domain/src/sample.ts",
    "statementMap": {
      "0": { "start": { "line": 1, "column": 0 }, "end": { "line": 1, "column": 10 } },
      "1": { "start": { "line": 2, "column": 0 }, "end": { "line": 2, "column": 10 } }
    },
    "s": { "0": 1, "1": 0 },
    "fnMap": {},
    "f": {},
    "branchMap": {
      "0": { "type": "if", "line": 1, "locations": [{ "start": { "line": 1 } }, { "start": { "line": 1 } }] }
    },
    "b": { "0": [1, 0] }
  }
}
```

- [ ] **Step 7: Run the smoke test**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/coverage-report.smoke.test.ts`
Expected: PASS (2 cases).

- [ ] **Step 8: Lint the changed files**

Run: `pnpm exec eslint --fix tests/scripts/coverage-report.ts tests/scripts/coverage-report.smoke.test.ts && pnpm exec biome format --write tests/scripts/coverage-report.ts tests/scripts/coverage-report.smoke.test.ts tests/scripts/lib/__fixtures__/domain.coverage.json && pnpm exec eslint tests/scripts/coverage-report.ts tests/scripts/coverage-report.smoke.test.ts && pnpm exec biome ci tests/scripts`
Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add tests/scripts/coverage-report.ts tests/scripts/coverage-report.smoke.test.ts tests/scripts/lib/__fixtures__/domain.coverage.json
git commit -m "feat(coverage-report): five standalone tiers (split contract/visual)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LRPSjYaPFbgyovy3ngHkNR"
```

---

### Task 4: End-to-end validation + full CI gate verification

**Files:** none (verification only; commit only if a fixup is needed).

**Interfaces:** Consumes everything above.

- [ ] **Step 1: Build, then produce real coverage for the node tiers**

```bash
pnpm build
pnpm --filter @rtc/domain exec vitest run --coverage --coverage.reporter=json --reporter=default --reporter=json --outputFile.json=reports/unit/test-results.json
pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.coverage.config.ts --coverage --coverage.reporter=json --reporter=default --reporter=json --outputFile.json=reports/ui/contract/test-results.json
```
Expected: `coverage-final.json` present under `packages/domain/reports/unit/coverage/` and `packages/client-react/reports/ui/contract/coverage/`.

- [ ] **Step 2: Generate the report to a file and eyeball it**

Run: `pnpm --filter @rtc/tests exec tsx scripts/coverage-report.ts --out /tmp/cov-report.md`
Then: `sed -n '1,80p' /tmp/cov-report.md`
Expected: a `## Coverage` table with separate `client/ui (contract)` (and `domain`) rows; an `### Untested lines` section whose entries are `<details>` blocks each containing a ```diff block; covered lines shown as context, uncovered lines prefixed `-`; a `client/ui (contract) ·` label present. Confirm small files render in full (continuous line numbers, not just the gap lines).

- [ ] **Step 3: Run the lib + smoke suites together**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib scripts/coverage-report.smoke.test.ts`
Expected: all PASS.

- [ ] **Step 4: Run the FULL CI checks-job gate set** (this is the gate that previously went red)

```bash
pnpm exec biome ci .
pnpm lint:eslint
pnpm lint:eslint:types
pnpm typecheck
pnpm lint:dead
pnpm test
```
Expected: every command exits 0. Fix any finding (most likely `func-style`/`arrow-body-style` — convert arrow consts to function declarations, re-run `eslint --fix` + `biome format --write`), then re-run the failing command.

- [ ] **Step 5: Commit any fixups**

```bash
git add -A
git commit -m "chore(coverage-report): lint/type fixups from full-gate validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LRPSjYaPFbgyovy3ngHkNR"
```

---

## Post-implementation: live validation (after merge)

Trigger the workflow (`gh workflow run "Coverage Report" --ref <branch>`) and open the run's
Summary page (or the link in the "Coverage report link" step) in a browser. Confirm the diff
blocks render with red uncovered lines and that `client/ui (contract)` and `client/ui (visual)`
appear as separate sections (a dual-instrumented `.tsx` appears under both).

## Notes for the implementer

- **Order matters:** after Task 1, `render.ts` and `coverage-report.ts` won't compile (they import removed symbols). That's expected — only run per-file tests until Task 3, then the full suite in Task 4.
- **`func-style` is the trap:** the renderer uses many small helpers — write them all as `function` declarations, never `const x = (…) => …`. Inner array-callback arrows must use block bodies (`=> { return … }`); `eslint --fix` enforces this but write them that way to avoid churn.
- **Diff coloring:** the fence MUST be ` ```diff ` (not `ts`/`tsx`) — that's what makes `-` lines render red. Losing TS syntax highlighting is the accepted trade.
- **`renderedLineNumbers` uses `0` as a window separator sentinel** — line numbers are ≥1, so 0 is safe; `fileDiff` maps it to the `⋮` marker.
