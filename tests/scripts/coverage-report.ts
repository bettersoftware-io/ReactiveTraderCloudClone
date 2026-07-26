import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { coverageOf, packageStat } from "./lib/coverage";
import { render } from "./lib/render";
import { summarize, type TierResult } from "./lib/testResults";

// Coverage tiers (paths relative to repo root). Each tier is reported standalone
// (no union) so every file is attributable to one script; the two UI tiers
// (contract specs vs visual goldens) appear as separate sections.
//
// BOTH web clients are measured. This was react-only until 2026-07-25, which
// left client-solid's per-file gaps invisible in two different ways:
//   - its ui:contract CI gate asserts an AGGREGATE >=95%, and an aggregate
//     hides individual files — solid sat at 99.35% overall while
//     appHeadRegistry was 69% and appPanelRegistry 56%;
//   - its app tier had no coverage denominator at all, hiding
//     buildBrowserPorts.ts at 50% (the same gap its react twin had).
// Tier names are framework-prefixed so the two are never conflated.
//
// WHAT "react/ui (visual)" ACTUALLY MEASURES — its ~77% is easy to misread as
// a weak tier. It is not incidental coverage, and it is not the pixel tier's
// own coverage. It is a purpose-built instrument: the vitest-browser spec walks
// the SAME shared scenario matrix as the playwright golden tier
// (@ui-visual-shared/scenarios) with the pixel assert compiled out via
// __RTC_VISUAL_SKIP_DIFF__, so istanbul sees exactly what the visual scenarios
// render. The number therefore answers "how much of src/ui does the golden
// matrix actually exercise?" — it exists to find components and branches the
// pixel tier never reaches. It has a track record: EqDepthDock showed 0% here,
// which is why the equities/depth-dock-empty scenario was added. See
// client-react/tests/ui/visual/COVERAGE-GAPS.md.
//
// There is no solid equivalent because client-solid has no vitest-browser
// harness at all (only tests/ui/visual/playwright/ + its render target) —
// nothing to instrument, not a judgement that the metric is worthless. Porting
// one would add real information (solid-specific branches the shared matrix
// misses) and is tracked as a follow-up in docs/STATUS.md.
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
      name: "react/app",
      path: "packages/client-react/reports/app/coverage/coverage-final.json",
    },
    {
      name: "react/ui (contract)",
      path: "packages/client-react/reports/ui/contract/coverage/coverage-final.json",
    },
    {
      name: "react/ui (visual)",
      path: "packages/client-react/reports/ui/visual/coverage/coverage-final.json",
    },
    {
      name: "solid/app",
      path: "packages/client-solid/reports/app/coverage/coverage-final.json",
    },
    {
      name: "solid/ui (contract)",
      path: "packages/client-solid/reports/ui/contract/coverage/coverage-final.json",
    },
  ],
  results: [
    { tier: "domain", path: "packages/domain/reports/unit/test-results.json" },
    { tier: "server", path: "packages/server/reports/unit/test-results.json" },
    {
      tier: "react/app",
      path: "packages/client-react/reports/app/test-results.json",
    },
    {
      tier: "react/contract",
      path: "packages/client-react/reports/ui/contract/test-results.json",
    },
    {
      tier: "react/visual",
      path: "packages/client-react/reports/ui/visual/test-results.json",
    },
    {
      tier: "solid/app",
      path: "packages/client-solid/reports/app/test-results.json",
    },
    {
      tier: "solid/contract",
      path: "packages/client-solid/reports/ui/contract/test-results.json",
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
  file: string;
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
  readSource?: (absPath: string) => string[] | null;
}

export async function main(opts: MainOpts): Promise<string> {
  const { repoRoot } = opts;

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

  const read = opts.readSource ?? readSource;
  const md = render({
    title: opts.title ?? "Coverage Report",
    testResults,
    packages,
    repoRoot,
    readSource: read,
  });

  const out = opts.out;

  if (out) {
    out.write(`${md}\n`);
  }

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
  if (fileOut !== null) {
    fileOut.end();
  }
}
