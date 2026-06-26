import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { lineCoverageOf, packageStat, unionLines } from "./lib/coverage";
import { render } from "./lib/render";
import { summarize, type TierResult } from "./lib/testResults";

// Coverage tiers (paths relative to repo root). client/ui unions contract+visual.
export const TIERS = {
  coverage: [
    {
      name: "domain",
      paths: ["packages/domain/reports/unit/coverage/coverage-final.json"],
    },
    {
      name: "server",
      paths: ["packages/server/reports/unit/coverage/coverage-final.json"],
    },
    {
      name: "client/app",
      paths: ["packages/client-react/reports/app/coverage/coverage-final.json"],
    },
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
    {
      tier: "app",
      path: "packages/client-react/reports/app/test-results.json",
    },
    {
      tier: "contract",
      path: "packages/client-react/reports/ui/contract/test-results.json",
    },
    {
      tier: "visual",
      path: "packages/client-react/reports/ui/visual/test-results.json",
    },
  ],
} as const;

function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
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

interface CoverageOverride {
  name: string;
  files: string[];
}

interface ResultsOverride {
  tier: string;
  file: string;
}

interface MainOpts {
  repoRoot: string;
  title?: string;
  out?: NodeJS.WritableStream;
  coverageOverride?: CoverageOverride[];
  resultsOverride?: ResultsOverride[];
}

export async function main(opts: MainOpts): Promise<string> {
  const { repoRoot } = opts;

  const covTiers =
    opts.coverageOverride ??
    TIERS.coverage.map((t) => {
      return {
        name: t.name,
        files: t.paths.map((p) => {
          return resolve(repoRoot, p);
        }),
      };
    });

  const packages = covTiers
    .map((t) => {
      const reports = t.files
        .map(readJson)
        .filter((j): j is unknown => {
          return j !== null;
        })
        .map(lineCoverageOf);
      if (reports.length === 0) return null;
      return packageStat(t.name, unionLines(reports));
    })
    .filter((p): p is NonNullable<typeof p> => {
      return p !== null;
    });

  const resTiers =
    opts.resultsOverride ??
    TIERS.results.map((t) => {
      return {
        tier: t.tier,
        file: resolve(repoRoot, t.path),
      };
    });

  const testResults: TierResult[] = resTiers
    .map((t) => {
      const json = readJson(t.file);
      return json === null ? null : summarize(t.tier, json);
    })
    .filter((r): r is TierResult => {
      return r !== null;
    });

  const md = render({
    title: opts.title ?? "Coverage Report",
    testResults,
    packages,
    repoRoot,
    readSource,
  });

  const out = opts.out;
  if (out) out.write(`${md}\n`);
  return md;
}

// CLI: `tsx tests/scripts/coverage-report.ts`
// Writes to $GITHUB_STEP_SUMMARY when set, else --out <file>, else stdout.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const outFlag = process.argv.indexOf("--out");
  const sha = process.env.GITHUB_SHA?.slice(0, 7) ?? "local";
  const branch = process.env.GITHUB_REF_NAME ?? "local";
  const title = `Coverage Report — ${branch} @ ${sha}`;

  const { createWriteStream } = await import("node:fs");
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const fileOut =
    summaryPath !== undefined
      ? createWriteStream(summaryPath, { flags: "a" })
      : outFlag !== -1
        ? createWriteStream(process.argv[outFlag + 1], { flags: "w" })
        : null;
  const out = fileOut ?? process.stdout;

  await main({ repoRoot, title, out });
  // Close the file stream so it flushes deterministically; never close stdout.
  if (fileOut !== null) fileOut.end();
}
