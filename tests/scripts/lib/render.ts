import { relative } from "node:path";

import type { FileStat, PackageStat } from "./coverage";
import type { TierResult } from "./testResults";

export const SUMMARY_CAP = 900_000;

// Reserve headroom for the cap-warning note text, the body.join("\n") separator
// per pushed block (up to ~70), and the final head-to-body join separator.
// Without this reserve, size tracking under-counts and the note pushes md past SUMMARY_CAP.
const CAP_RESERVE = 300;

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
    `\`\`\`${lang(stat.file)}`,
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
  const head = [
    `# ${input.title}`,
    "",
    testSection(input.testResults),
    coverageTable(input.packages),
  ];

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
      if (size + block.length > SUMMARY_CAP - CAP_RESERVE) {
        capped = true;
      } else {
        body.push(block);
        size += block.length;
        continue;
      }
    }
    // capped: line-numbers only (much smaller); count anything that still won't fit.
    const lean = linesOnlyBlock(stat, rel, pkg);
    if (size + lean.length > SUMMARY_CAP - CAP_RESERVE) {
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
