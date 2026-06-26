# On-Demand Coverage Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand GitHub Actions workflow that renders a mobile-readable job summary — a test pass/fail summary plus per-package coverage with collapsible per-file snippets of untested source.

**Architecture:** A pure TypeScript generator library (`tests/scripts/lib/`) merges per-tier istanbul-format coverage JSON at the *line* level (covered in either tier ⇒ covered), aggregates vitest JSON test-results, and renders Markdown under a size cap. A thin CLI (`tests/scripts/coverage-report.ts`) wires file IO and appends to `$GITHUB_STEP_SUMMARY`. A `workflow_dispatch` workflow runs every coverage tier (non-fatal), then the CLI.

**Tech Stack:** Node 26, pnpm 11, vitest 4 (v8 + istanbul coverage providers), `istanbul-lib-coverage` (new devDep), tsx, GitHub Actions, Playwright container.

## Global Constraints

- Repo is **private** → no GitHub Pages; output goes to `$GITHUB_STEP_SUMMARY` only.
- Job summary hard cap: **1 MiB per step**; renderer guards at **900_000 bytes** then degrades to line-numbers-only.
- No new third-party services. New npm devDeps allowed (single-runtime-dep rule binds only `@rtc/domain`).
- New deps must respect the `minimumReleaseAge: 1440` (24h) cooldown and the `allowBuilds` allowlist (`istanbul-lib-coverage` has no install script — fine).
- `@rtc/tests` package lives at `tests/` (workspace entry `tests`), not `packages/tests/`. Its `imports` map is `{ "#/*": "./*" }`, `type: module`.
- Coverage scope: `domain`, `server`, `client-react` (app + contract + visual). **No `shared`** (zero tests). **No e2e**.
- Existing `ci.yml` and the `≥95%` contract gate are **untouched**.
- All vitest coverage providers emit **istanbul-format** `coverage-final.json`; load via `istanbul-lib-coverage.createCoverageMap`.
- Coverage-final.json locations (relative to repo root), produced when the run includes the `json` coverage reporter:
  - domain: `packages/domain/reports/unit/coverage/coverage-final.json`
  - server: `packages/server/reports/unit/coverage/coverage-final.json`
  - client/app: `packages/client-react/reports/app/coverage/coverage-final.json`
  - client/contract: `packages/client-react/reports/ui/contract/coverage/coverage-final.json`
  - client/visual: `packages/client-react/reports/ui/visual/coverage/coverage-final.json`

---

## File Structure

**Created**
- `tests/scripts/lib/coverage.ts` — pure: load line coverage, union-merge, per-file & per-package stats.
- `tests/scripts/lib/coverage.test.ts` — unit tests for the above.
- `tests/scripts/lib/testResults.ts` — pure: summarize one vitest JSON results object.
- `tests/scripts/lib/testResults.test.ts` — unit tests.
- `tests/scripts/lib/render.ts` — pure: render Markdown report + size-cap fallback.
- `tests/scripts/lib/render.test.ts` — unit tests.
- `tests/scripts/coverage-report.ts` — CLI: read known paths, read source, write `$GITHUB_STEP_SUMMARY`/`--out`/stdout.
- `tests/scripts/lib/__fixtures__/` — small fixture JSON for the smoke test.
- `.github/workflows/coverage-report.yml` — the `workflow_dispatch` workflow.

**Modified**
- `tests/package.json` — add `istanbul-lib-coverage` + `@types/istanbul-lib-coverage` devDeps; add `"test:report"` (lib unit tests) and `"coverage:report"` (run the CLI) scripts.

---

### Task 1: Generator library — line coverage, union merge, stats

**Files:**
- Create: `tests/scripts/lib/coverage.ts`
- Test: `tests/scripts/lib/coverage.test.ts`
- Modify: `tests/package.json`

**Interfaces:**
- Consumes: nothing (entry task).
- Produces:
  - `type LineHits = Map<number, number>`
  - `type FileLines = Map<string, LineHits>`
  - `lineCoverageOf(coverageJson: unknown): FileLines`
  - `unionLines(reports: FileLines[]): FileLines`
  - `interface FileStat { file: string; total: number; covered: number; pct: number; uncovered: number[] }`
  - `interface PackageStat { name: string; total: number; covered: number; pct: number; files: FileStat[] }`
  - `fileStat(file: string, lines: LineHits): FileStat`
  - `packageStat(name: string, lines: FileLines): PackageStat`

- [ ] **Step 1: Add the dependency**

Run (from repo root):
```bash
pnpm --filter @rtc/tests add -D istanbul-lib-coverage @types/istanbul-lib-coverage
pnpm outdated -r | grep istanbul-lib-coverage || echo "at latest acceptable"
```
Expected: both added to `tests/package.json` devDependencies; lockfile updated; no `minimumReleaseAge` rejection (the package is years-stable).

- [ ] **Step 2: Write the failing test**

```ts
// tests/scripts/lib/coverage.test.ts
import { describe, expect, it } from "vitest";

import { fileStat, lineCoverageOf, packageStat, unionLines } from "./coverage.ts";

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
  return { [path]: { path, statementMap, s, fnMap: {}, f: {}, branchMap: {}, b: {} } };
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
    const lines = lineCoverageOf(cov("/r/a.ts", { 3: 0, 1: 1, 2: 0 })).get("/r/a.ts");
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
      lineCoverageOf(cov("/r/bad.ts", { 1: 0, 2: 0 })),  // 0%
      lineCoverageOf(cov("/r/mid.ts", { 1: 1, 2: 0 })),  // 50%
    ]);
    const stat = packageStat("client/ui", lines);
    expect(stat.total).toBe(6);
    expect(stat.covered).toBe(3);
    expect(stat.pct).toBe(50);
    expect(stat.files.map((f) => f.file)).toEqual(["/r/bad.ts", "/r/mid.ts"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/coverage.test.ts`
Expected: FAIL — `Cannot find module './coverage.ts'`.

- [ ] **Step 4: Write minimal implementation**

```ts
// tests/scripts/lib/coverage.ts
// istanbul-lib-coverage is CommonJS — use named imports (NodeNext synthesizes
// them via esModuleInterop), not a default import.
import { type CoverageMapData, createCoverageMap } from "istanbul-lib-coverage";

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
  const map = createCoverageMap(coverageJson as CoverageMapData);
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/coverage.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/package.json pnpm-lock.yaml tests/scripts/lib/coverage.ts tests/scripts/lib/coverage.test.ts
git commit -m "feat(coverage-report): line-level coverage merge + stats library

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LRPSjYaPFbgyovy3ngHkNR"
```

---

### Task 2: Generator library — test-results summary + Markdown render

**Files:**
- Create: `tests/scripts/lib/testResults.ts`, `tests/scripts/lib/testResults.test.ts`
- Create: `tests/scripts/lib/render.ts`, `tests/scripts/lib/render.test.ts`

**Interfaces:**
- Consumes: `FileStat`, `PackageStat` from `./coverage.ts`.
- Produces:
  - `interface TierResult { tier: string; passed: number; failed: number; skipped: number }`
  - `summarize(tier: string, json: unknown): TierResult`
  - `interface RenderInput { title: string; testResults: TierResult[]; packages: PackageStat[]; repoRoot: string; readSource: (absPath: string) => string[] | null }`
  - `render(input: RenderInput): string`
  - `const SUMMARY_CAP = 900_000`

- [ ] **Step 1: Write the failing test for testResults**

```ts
// tests/scripts/lib/testResults.test.ts
import { describe, expect, it } from "vitest";

import { summarize } from "./testResults.ts";

describe("summarize", () => {
  it("reads vitest json reporter counts", () => {
    const r = summarize("domain", {
      numTotalTests: 10,
      numPassedTests: 9,
      numFailedTests: 1,
      numPendingTests: 0,
    });
    expect(r).toEqual({ tier: "domain", passed: 9, failed: 1, skipped: 0 });
  });

  it("defaults missing counts to zero", () => {
    expect(summarize("server", {})).toEqual({
      tier: "server",
      passed: 0,
      failed: 0,
      skipped: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/testResults.test.ts`
Expected: FAIL — `Cannot find module './testResults.ts'`.

- [ ] **Step 3: Implement testResults**

```ts
// tests/scripts/lib/testResults.ts
export interface TierResult {
  tier: string;
  passed: number;
  failed: number;
  skipped: number;
}

export function summarize(tier: string, json: unknown): TierResult {
  const j = (json ?? {}) as Record<string, number | undefined>;
  return {
    tier,
    passed: j.numPassedTests ?? 0,
    failed: j.numFailedTests ?? 0,
    skipped: j.numPendingTests ?? 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/testResults.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for render**

```ts
// tests/scripts/lib/render.test.ts
import { describe, expect, it } from "vitest";

import type { PackageStat } from "./coverage.ts";
import { render, SUMMARY_CAP } from "./render.ts";

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
    files: [{ file: "/r/src/a.ts", total: 4, covered: 2, pct: 50, uncovered: [2, 3] }],
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
      Array.from({ length: 250 }, (_, n) => `line ${n} of ${p} xxxxxxxxxxxxxxxxxxxx`);
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/render.test.ts`
Expected: FAIL — `Cannot find module './render.ts'`.

- [ ] **Step 7: Implement render**

```ts
// tests/scripts/lib/render.ts
import { relative } from "node:path";

import type { FileStat, PackageStat } from "./coverage.ts";
import type { TierResult } from "./testResults.ts";

export const SUMMARY_CAP = 900_000;

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

function lang(file: string): string {
  if (file.endsWith(".tsx")) return "tsx";
  if (file.endsWith(".ts")) return "ts";
  return "";
}

function testSection(results: TierResult[]): string {
  const passed = results.reduce((a, r) => a + r.passed, 0);
  const failed = results.reduce((a, r) => a + r.failed, 0);
  const skipped = results.reduce((a, r) => a + r.skipped, 0);
  const status = failed > 0 ? "❌" : "✅";
  const rows = results
    .map((r) => `| ${r.tier} | ${r.passed} | ${r.failed} | ${r.skipped} |`)
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
    .map(
      (p) =>
        `| ${p.name} | ${pct(p.pct)} | ${p.covered} | ${p.total - p.covered} |`,
    )
    .join("\n");
  return [
    "## Coverage",
    "| Package | Lines | Covered | Uncovered |",
    "|---------|------:|--------:|----------:|",
    rows,
    "",
  ].join("\n");
}

// Uncovered lines as numbered text, with a `⋮` marker between non-contiguous runs.
function snippet(uncovered: number[], source: string[]): string {
  const parts: string[] = [];
  let prev: number | null = null;
  for (const line of uncovered) {
    if (prev !== null && line > prev + 1) parts.push("  ⋮");
    const text = source[line - 1] ?? "";
    parts.push(`${String(line).padStart(4)}  ${text}`);
    prev = line;
  }
  return parts.join("\n");
}

function fileBlock(
  stat: FileStat,
  rel: string,
  pkgName: string,
  source: string[] | null,
): string {
  const summary = `${pkgName} · ${rel} — ${pct(stat.pct)} (${stat.uncovered.length} uncovered)`;
  if (!source) {
    return `<details><summary>${summary}</summary>\n\nuncovered lines: ${stat.uncovered.join(", ")}\n</details>\n`;
  }
  return [
    `<details><summary>${summary}</summary>`,
    "",
    "```" + lang(stat.file),
    snippet(stat.uncovered, source),
    "```",
    "</details>",
    "",
  ].join("\n");
}

function linesOnlyBlock(stat: FileStat, rel: string, pkgName: string): string {
  return `<details><summary>${pkgName} · ${rel} — ${pct(stat.pct)} (${stat.uncovered.length} uncovered)</summary>\n\nuncovered lines: ${stat.uncovered.join(", ")}\n</details>\n`;
}

export function render(input: RenderInput): string {
  const head = [`# ${input.title}`, "", testSection(input.testResults), coverageTable(input.packages)];

  // Flatten all files-with-gaps across packages, worst pct first.
  const flat = input.packages
    .flatMap((p) => p.files.map((f) => ({ stat: f, pkg: p.name })))
    .sort((a, b) => a.stat.pct - b.stat.pct);

  const body: string[] = ["### Untested lines", ""];
  let size = head.join("\n").length + body.join("\n").length;
  let omitted = 0;
  let capped = false;

  for (const { stat, pkg } of flat) {
    const rel = relative(input.repoRoot, stat.file);
    if (!capped) {
      const block = fileBlock(stat, rel, pkg, input.readSource(stat.file));
      if (size + block.length > SUMMARY_CAP) {
        capped = true;
      } else {
        body.push(block);
        size += block.length;
        continue;
      }
    }
    // capped: line-numbers only (much smaller); count anything that still won't fit.
    const lean = linesOnlyBlock(stat, rel, pkg);
    if (size + lean.length > SUMMARY_CAP) {
      omitted++;
    } else {
      body.push(lean);
      size += lean.length;
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

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/testResults.test.ts scripts/lib/render.test.ts`
Expected: PASS (all tests).

- [ ] **Step 9: Add the lib unit-test script and commit**

Add to `tests/package.json` `scripts` (alphabetical neighborhood near `test:browser:*`):
```json
"test:report": "vitest run scripts/lib",
```

```bash
git add tests/package.json tests/scripts/lib/testResults.ts tests/scripts/lib/testResults.test.ts tests/scripts/lib/render.ts tests/scripts/lib/render.test.ts
git commit -m "feat(coverage-report): test-results summary + markdown renderer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LRPSjYaPFbgyovy3ngHkNR"
```

---

### Task 3: CLI entry point

**Files:**
- Create: `tests/scripts/coverage-report.ts`
- Create: `tests/scripts/lib/__fixtures__/domain.coverage.json`, `tests/scripts/lib/__fixtures__/domain.results.json`
- Create: `tests/scripts/coverage-report.smoke.test.ts`
- Modify: `tests/package.json` (add `coverage:report` script)

**Interfaces:**
- Consumes: `lineCoverageOf`, `unionLines`, `packageStat` (coverage.ts); `summarize` (testResults.ts); `render` (render.ts).
- Produces: `main(opts: { repoRoot: string; out?: NodeJS.WritableStream }): Promise<string>` (returns rendered Markdown; also writes it). A default-export-free module — exports `main` and a `TIERS` manifest for the smoke test.

- [ ] **Step 1: Write the fixtures**

`tests/scripts/lib/__fixtures__/domain.coverage.json` — one file, line 1 covered, line 2 uncovered:
```json
{
  "/r/packages/domain/src/sample.ts": {
    "path": "/r/packages/domain/src/sample.ts",
    "statementMap": {
      "0": { "start": { "line": 1, "column": 0 }, "end": { "line": 1, "column": 10 } },
      "1": { "start": { "line": 2, "column": 0 }, "end": { "line": 2, "column": 10 } }
    },
    "s": { "0": 1, "1": 0 },
    "fnMap": {}, "f": {}, "branchMap": {}, "b": {}
  }
}
```

`tests/scripts/lib/__fixtures__/domain.results.json`:
```json
{ "numTotalTests": 3, "numPassedTests": 3, "numFailedTests": 0, "numPendingTests": 0 }
```

- [ ] **Step 2: Write the failing smoke test**

```ts
// tests/scripts/coverage-report.smoke.test.ts
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { main, TIERS } from "./coverage-report.ts";

describe("coverage-report CLI", () => {
  it("exposes a tier manifest covering domain, server, and the three client tiers", () => {
    expect(TIERS.coverage.map((t) => t.name)).toEqual([
      "domain",
      "server",
      "client/app",
      "client/ui",
    ]);
    // client/ui unions contract + visual.
    const ui = TIERS.coverage.find((t) => t.name === "client/ui");
    expect(ui?.paths.length).toBe(2);
  });

  it("renders a report from fixtures without throwing", async () => {
    const repoRoot = fileURLToPath(new URL("./lib/__fixtures__/", import.meta.url));
    // Point the manifest at fixtures via env override (see implementation).
    const md = await main({
      repoRoot: "/r",
      coverageOverride: [
        { name: "domain", files: [`${repoRoot}domain.coverage.json`] },
      ],
      resultsOverride: [{ tier: "domain", file: `${repoRoot}domain.results.json` }],
    });
    expect(md).toContain("## Coverage");
    expect(md).toContain("3 passed");
    expect(md).toContain("packages/domain/src/sample.ts");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/coverage-report.smoke.test.ts`
Expected: FAIL — `Cannot find module './coverage-report.ts'`.

- [ ] **Step 4: Implement the CLI**

```ts
// tests/scripts/coverage-report.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { lineCoverageOf, packageStat, unionLines } from "./lib/coverage.ts";
import { render } from "./lib/render.ts";
import { summarize, type TierResult } from "./lib/testResults.ts";

// Coverage tiers (paths relative to repo root). client/ui unions contract+visual.
export const TIERS = {
  coverage: [
    { name: "domain", paths: ["packages/domain/reports/unit/coverage/coverage-final.json"] },
    { name: "server", paths: ["packages/server/reports/unit/coverage/coverage-final.json"] },
    { name: "client/app", paths: ["packages/client-react/reports/app/coverage/coverage-final.json"] },
    {
      name: "client/ui",
      paths: [
        "packages/client-react/reports/ui/contract/coverage/coverage-final.json",
        "packages/client-react/reports/ui/visual/coverage/coverage-final.json",
      ],
    },
  ],
  results: [
    { tier: "domain", path: "packages/domain/reports/unit/test-results.json" },
    { tier: "server", path: "packages/server/reports/unit/test-results.json" },
    { tier: "app", path: "packages/client-react/reports/app/test-results.json" },
    { tier: "contract", path: "packages/client-react/reports/ui/contract/test-results.json" },
    { tier: "visual", path: "packages/client-react/reports/ui/visual/test-results.json" },
  ],
} as const;

function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null; // a tier that failed to run / produce output is simply skipped
  }
}

function readSource(absPath: string): string[] | null {
  try {
    return readFileSync(absPath, "utf8").split("\n");
  } catch {
    return null;
  }
}

interface MainOpts {
  repoRoot: string;
  title?: string;
  out?: NodeJS.WritableStream;
  coverageOverride?: Array<{ name: string; files: string[] }>;
  resultsOverride?: Array<{ tier: string; file: string }>;
}

export async function main(opts: MainOpts): Promise<string> {
  const { repoRoot } = opts;

  const covTiers =
    opts.coverageOverride ??
    TIERS.coverage.map((t) => ({
      name: t.name,
      files: t.paths.map((p) => resolve(repoRoot, p)),
    }));

  const packages = covTiers
    .map((t) => {
      const reports = t.files
        .map(readJson)
        .filter((j): j is unknown => j !== null)
        .map(lineCoverageOf);
      if (reports.length === 0) return null;
      return packageStat(t.name, unionLines(reports));
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const resTiers =
    opts.resultsOverride ??
    TIERS.results.map((t) => ({ tier: t.tier, file: resolve(repoRoot, t.path) }));

  const testResults: TierResult[] = resTiers
    .map((t) => {
      const json = readJson(t.file);
      return json === null ? null : summarize(t.tier, json);
    })
    .filter((r): r is TierResult => r !== null);

  const md = render({
    title: opts.title ?? "Coverage Report",
    testResults,
    packages,
    repoRoot,
    readSource,
  });

  const out = opts.out;
  if (out) out.write(md + "\n");
  return md;
}

// CLI: `tsx tests/scripts/coverage-report.ts`
// Writes to $GITHUB_STEP_SUMMARY when set, else --out <file>, else stdout.
if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const outFlag = process.argv.indexOf("--out");
  const sha = process.env.GITHUB_SHA?.slice(0, 7) ?? "local";
  const branch = process.env.GITHUB_REF_NAME ?? "local";
  const title = `Coverage Report — ${branch} @ ${sha}`;

  const { createWriteStream } = await import("node:fs");
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const out =
    summaryPath !== undefined
      ? createWriteStream(summaryPath, { flags: "a" })
      : outFlag !== -1
        ? createWriteStream(process.argv[outFlag + 1], { flags: "w" })
        : process.stdout;

  await main({ repoRoot, title, out });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/coverage-report.smoke.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the `coverage:report` script and typecheck**

Add to `tests/package.json` `scripts`:
```json
"coverage:report": "tsx scripts/coverage-report.ts",
```

Run: `pnpm --filter @rtc/tests typecheck`
Expected: PASS (no type errors). If `import.meta.url === \`file://${process.argv[1]}\`` trips the lint's restricted-syntax or types, prefer `process.argv[1] && import.meta.url.endsWith(process.argv[1])`.

- [ ] **Step 7: Commit**

```bash
git add tests/scripts/coverage-report.ts tests/scripts/coverage-report.smoke.test.ts tests/scripts/lib/__fixtures__ tests/package.json
git commit -m "feat(coverage-report): CLI wiring report generation to GITHUB_STEP_SUMMARY

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LRPSjYaPFbgyovy3ngHkNR"
```

---

### Task 4: The on-demand workflow

**Files:**
- Create: `.github/workflows/coverage-report.yml`

**Interfaces:**
- Consumes: the `coverage:report` script + the coverage-final.json / test-results.json paths from Task 3's `TIERS` manifest.
- Produces: a `workflow_dispatch` workflow named "Coverage Report".

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/coverage-report.yml
name: Coverage Report

# On-demand only. Run from the GitHub mobile app: Actions -> Coverage Report ->
# Run workflow -> pick any branch. Renders test pass/fail + per-package coverage
# with collapsible per-file untested-source snippets into the job summary
# (readable on mobile, behind repo auth — the private repo rules out Pages).
on:
  workflow_dispatch:

jobs:
  coverage:
    name: coverage + untested lines
    runs-on: ubuntu-latest
    # Same Playwright image as the `visual` job: the client visual coverage tier
    # renders in a real browser; the Node-based tiers run fine here too. Tag must
    # track @playwright/test in packages/client-react.
    container: mcr.microsoft.com/playwright:v1.61.0-noble
    env:
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"
      CYPRESS_INSTALL_BINARY: "0" # e2e is out of scope here
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7

      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 26

      - name: Enable Corepack (pins pnpm from packageManager)
        run: npm install -g corepack@0.35.0 && corepack enable

      - name: Resolve pnpm store path
        run: echo "STORE_PATH=$(pnpm store path)" >> "$GITHUB_ENV"

      - name: Cache the pnpm content-addressable store
        uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
        with:
          path: ${{ env.STORE_PATH }}
          key: pnpm-store-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: pnpm-store-${{ runner.os }}-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # tsc-built libs (domain/shared/server) + the visual harness import workspace
      # libs via their dist/; a fresh checkout has none. Build once up front so the
      # direct `pnpm --filter ... test:*coverage` calls below resolve them.
      - name: Build workspace
        run: pnpm build

      # Each tier emits istanbul-format coverage-final.json (--coverage.reporter=json)
      # AND a vitest json test-results file (--reporter). continue-on-error so a tier
      # below its threshold gate (contract's 95%) does NOT abort the report — surfacing
      # gaps is the whole point.
      - name: Coverage — domain
        continue-on-error: true
        run: >
          pnpm --filter @rtc/domain test:coverage --
          --coverage.reporter=json
          --reporter=default --reporter=json
          --outputFile.json=reports/unit/test-results.json

      - name: Coverage — server
        continue-on-error: true
        run: >
          pnpm --filter @rtc/server test:coverage --
          --coverage.reporter=json
          --reporter=default --reporter=json
          --outputFile.json=reports/unit/test-results.json

      - name: Coverage — client app
        continue-on-error: true
        run: >
          pnpm --filter @rtc/client-react test:app:coverage --
          --coverage.reporter=json
          --reporter=default --reporter=json
          --outputFile.json=reports/app/test-results.json

      - name: Coverage — client UI (contract tier)
        continue-on-error: true
        run: >
          pnpm --filter @rtc/client-react test:ui:contract:coverage --
          --coverage.reporter=json
          --reporter=default --reporter=json
          --outputFile.json=reports/ui/contract/test-results.json

      - name: Coverage — client UI (visual tier)
        continue-on-error: true
        run: >
          pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:coverage --
          --coverage.reporter=json
          --reporter=default --reporter=json
          --outputFile.json=reports/ui/visual/test-results.json

      - name: Render report to job summary
        run: pnpm --filter @rtc/tests coverage:report
```

- [ ] **Step 2: Lint the workflow**

Run: `pnpm lint:actions`
Expected: PASS (actionlint clean). Fix any quoting / shell issues it flags.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/coverage-report.yml
git commit -m "feat(ci): on-demand coverage-report workflow (workflow_dispatch)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LRPSjYaPFbgyovy3ngHkNR"
```

---

### Task 5: End-to-end local validation

**Files:** none (verification only).

**Interfaces:** Consumes everything built above.

- [ ] **Step 1: Produce real coverage locally (the Node tiers; the visual tier needs a browser)**

```bash
pnpm build
pnpm --filter @rtc/domain test:coverage -- --coverage.reporter=json --reporter=default --reporter=json --outputFile.json=reports/unit/test-results.json
pnpm --filter @rtc/client-react test:app:coverage -- --coverage.reporter=json --reporter=default --reporter=json --outputFile.json=reports/app/test-results.json
pnpm --filter @rtc/client-react test:ui:contract:coverage -- --coverage.reporter=json --reporter=default --reporter=json --outputFile.json=reports/ui/contract/test-results.json
```
Expected: `coverage-final.json` + `test-results.json` present under each tier's reports dir.

- [ ] **Step 2: Dry-run the generator to a file (no $GITHUB_STEP_SUMMARY locally)**

Run: `pnpm --filter @rtc/tests coverage:report -- --out /tmp/coverage-report.md`
Expected: `/tmp/coverage-report.md` contains a Tests table, a Coverage table (domain, client/app, client/ui — server/visual rows absent if not run locally), and `<details>` blocks with real untested source from `src/`.

- [ ] **Step 3: Eyeball the Markdown**

Run: `head -60 /tmp/coverage-report.md`
Expected: renders as valid Markdown; untested snippets show real code with line numbers; worst-coverage files first.

- [ ] **Step 4: Run the full lib + smoke test suite once more**

Run: `pnpm --filter @rtc/tests test:report && pnpm --filter @rtc/tests exec vitest run scripts/coverage-report.smoke.test.ts`
Expected: all PASS.

- [ ] **Step 5: Verify no repo-wide gates regressed**

Run: `pnpm exec biome ci tests/scripts && pnpm --filter @rtc/tests typecheck`
Expected: PASS. (Full `pnpm lint:eslint` optional but recommended if touching shared config.)

- [ ] **Step 6: Final commit (if Step 5 required fixups)**

```bash
git add -A
git commit -m "chore(coverage-report): lint/type fixups from local validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LRPSjYaPFbgyovy3ngHkNR"
```

---

## Post-implementation: live validation (manual, after merge or on the branch)

Trigger the workflow from the GitHub UI/mobile app against this branch and confirm
the job summary renders test counts + coverage + untested snippets. The visual tier's
real numbers only appear in this CI run (it needs the browser container).

## Notes for the implementer

- **Why `--coverage.reporter=json`:** the configs' default reporters are `[text, html, lcov]` — none is machine-mergeable. The `json` reporter writes `coverage-final.json` at each config's `reportsDirectory`. CLI flags are appended after `--` so the repo configs stay untouched.
- **Why line-level union, not map merge:** contract is v8-instrumented, visual is istanbul-instrumented; their statement maps differ, so istanbul's map-merge is unreliable across them. `getLineCoverage()` normalizes both to `{line: hits}`, so "covered in either" is a per-line `max` — robust and provider-agnostic.
- **Why `continue-on-error`:** the contract tier has a `95%` threshold gate that exits non-zero below target; without this the report would never render on exactly the low-coverage branches you most want to inspect.
- **Path note:** `coverage-final.json` stores absolute paths from the run machine; the generator reads source from those abs paths (same checkout) and shows `relative(repoRoot, …)` for display.
