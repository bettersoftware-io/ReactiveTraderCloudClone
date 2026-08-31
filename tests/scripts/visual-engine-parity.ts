#!/usr/bin/env tsx
/**
 * Engine-parity report — how far the Dockview layout engine's rendering sits
 * from the in-house engine's, per workspace state and skin.
 *
 * The visual tier asserts each engine against its OWN golden, so it can pin
 * both engines' pixels without ever saying how alike they are. The matrix
 * shoots every layout state twice — `X` (in-house) and `X-dockview` (Dockview),
 * identical fixture and interaction, only the `LayoutEngine` preference
 * flipped — precisely so the two can be diffed. This script is that diff:
 * the hand-run pixelmatch that found the transparent 3D-skin card fill (PR
 * #594) and the blank x86 first frame, made repeatable.
 *
 * It measures the way Playwright does (see visual-jitter.ts's "measurement
 * trap"): pixelmatch with a per-pixel colour threshold, counting only pixels
 * above it. A ratio of 0.01 means 1% of the full-page pixels differ. Pairs
 * whose dimensions differ report 1 — that is a layout change, not a nuance.
 *
 * Usage:
 *   pnpm visual:engine-parity                 # the committed x86 `react/` set
 *   pnpm visual:engine-parity --set react-local/darwin-arm64
 *   pnpm visual:engine-parity <dir>           # any extracted golden tree
 *                                              (contains <skin>/<scenario>.png)
 * Options:
 *   --threshold <n>   per-pixel colour threshold (default 0.2, Playwright's)
 *   --budget <n>      fail (exit 1) when any pair's ratio exceeds it — off by
 *                     default: this is a report, not a gate. The known
 *                     structural floor is the ≤1px half-pixel edge offset
 *                     (ADR-002), ~0.003–0.035 depending on the scenario.
 *   --json <path>     also write the full per-pair table as JSON
 */

import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import { type EnginePair, pairEngineGoldens } from "./lib/enginePairs";

const PLAYWRIGHT_DEFAULT_PER_PIXEL_THRESHOLD = 0.2;
const GOLDEN_SETS_ROOT = path.resolve(
  import.meta.dirname,
  "../../packages/ui-contract/goldens/playwright/__screenshots__",
);
const SPEC_FOLDER = "visual.spec.ts";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const root =
    options.dir ?? path.join(GOLDEN_SETS_ROOT, options.set, SPEC_FOLDER);
  const keys = await collectPngKeys(root);
  const pairs = pairEngineGoldens(keys);

  console.log(`golden set : ${root}`);
  console.log(`per-pixel threshold: ${options.threshold}`);
  console.log(
    `pairs      : ${pairs.length} (in-house ↔ dockview, same skin)\n`,
  );

  if (pairs.length === 0) {
    console.log("no engine pairs found — is this a playwright golden tree?");
    process.exitCode = 1;
    return;
  }

  const results = pairs.map((pair): PairResult => {
    return {
      ...pair,
      ratio: ratioBetween(
        path.join(root, pair.inhouse),
        path.join(root, pair.dockview),
        options.threshold,
      ),
    };
  });

  report(results, options.budget);

  if (options.json !== undefined) {
    writeFileSync(options.json, JSON.stringify(results, null, 2));
    console.log(`\nwrote ${options.json}`);
  }
}

interface Options {
  set: string;
  dir?: string;
  threshold: number;
  budget?: number;
  json?: string;
}

interface PairResult extends EnginePair {
  ratio: number;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    set: "react",
    threshold: PLAYWRIGHT_DEFAULT_PER_PIXEL_THRESHOLD,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--set" && next !== undefined) {
      options.set = next;
      i += 1;
    } else if (arg === "--threshold" && next !== undefined) {
      options.threshold = Number(next);
      i += 1;
    } else if (arg === "--budget" && next !== undefined) {
      options.budget = Number(next);
      i += 1;
    } else if (arg === "--json" && next !== undefined) {
      options.json = next;
      i += 1;
    } else if (arg !== undefined && !arg.startsWith("--")) {
      options.dir = path.resolve(arg);
    }
  }

  return options;
}

/** Every PNG under `root`, as `<skin>/<file>.png` keys. */
async function collectPngKeys(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const keys: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".png")) {
      keys.push(path.relative(root, path.join(entry.parentPath, entry.name)));
    }
  }

  return keys;
}

function ratioBetween(aPath: string, bPath: string, perPixel: number): number {
  const aBytes = readFileSync(aPath);
  const bBytes = readFileSync(bPath);

  if (aBytes.equals(bBytes)) {
    return 0;
  }

  const a = PNG.sync.read(aBytes);
  const b = PNG.sync.read(bBytes);

  if (a.width !== b.width || a.height !== b.height) {
    return 1;
  }

  const differing = pixelmatch(a.data, b.data, undefined, a.width, a.height, {
    threshold: perPixel,
  });

  return differing / (a.width * a.height);
}

function report(
  results: readonly PairResult[],
  budget: number | undefined,
): void {
  const scenarios = [
    ...new Set(
      results.map((r) => {
        return r.scenario;
      }),
    ),
  ].sort();

  const skins = [
    ...new Set(
      results.map((r) => {
        return r.skin;
      }),
    ),
  ].sort();

  const width = Math.max(
    ...scenarios.map((s) => {
      return s.length;
    }),
  );

  // One row per scenario, one column per skin — the shape the eye compares:
  // a whole ROW high means the state itself diverges; one COLUMN high means
  // a skin-specific paint difference (the 3D-skin card fill was one).
  console.log(
    `${"scenario".padEnd(width)}  ${skins
      .map((s) => {
        return s.padStart(16);
      })
      .join("")}`,
  );

  for (const scenario of scenarios) {
    const cells = skins.map((skin) => {
      const hit = results.find((r) => {
        return r.scenario === scenario && r.skin === skin;
      });

      return (hit === undefined ? "—" : hit.ratio.toFixed(4)).padStart(16);
    });
    console.log(`${scenario.padEnd(width)}  ${cells.join("")}`);
  }

  const ratios = results
    .map((r) => {
      return r.ratio;
    })
    .sort((x, y) => {
      return x - y;
    });

  const worst = results.reduce((a, b) => {
    return b.ratio > a.ratio ? b : a;
  });

  console.log("");
  console.log(`p50   : ${percentile(ratios, 50).toFixed(4)}`);
  console.log(`p90   : ${percentile(ratios, 90).toFixed(4)}`);
  console.log(
    `worst : ${worst.ratio.toFixed(4)}  ${worst.skin}/${worst.scenario}`,
  );

  if (budget !== undefined) {
    const over = results.filter((r) => {
      return r.ratio > budget;
    });
    console.log(
      `budget: ${budget} — ${over.length === 0 ? "every pair within it" : `${over.length} pair(s) OVER`}`,
    );

    if (over.length > 0) {
      process.exitCode = 1;
    }
  }
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );

  return sorted[Math.max(0, index)] ?? 0;
}

await main();
