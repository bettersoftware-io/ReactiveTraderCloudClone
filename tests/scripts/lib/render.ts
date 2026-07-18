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

  const interesting = [...stat.uncoveredLines, ...stat.partialBranchLines].sort(
    (a, b) => {
      return a - b;
    },
  );
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
