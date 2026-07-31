#!/usr/bin/env tsx
/**
 * Visual-tolerance audit — the comparison half of /rtc:visual-tolerance-audit.
 *
 * Answers one question with data: **how much do the visual goldens actually
 * wobble between CI runs of the SAME commit?** That number is the noise floor
 * the tier's tolerance has to clear, and it is the only honest basis for
 * choosing `maxDiffPixelRatio`.
 *
 * It exists because the tolerance was once set from an assumption rather than
 * a measurement, and the assumption was wrong in BOTH directions at once: too
 * loose to notice a complete two-column restructure of PreferencesModal
 * (0.017 of pixels — a third of the budget), while being justified by a "~0.04
 * AA jitter" figure that a later measurement could not reproduce at all.
 *
 * THE MEASUREMENT TRAP THIS SCRIPT EXISTS TO AVOID
 * -----------------------------------------------
 * Do NOT count "pixels that differ at all". A first pass at this analysis did,
 * and reported `jarvis-orb-attention` wobbling by 30% — which looked like a
 * live flake and was nearly "fixed". It was an artifact: that scenario is a
 * soft blurred glow, so nearly every pixel differs by an average of ~2/765 —
 * invisible, and *below the per-pixel threshold Playwright applies before it
 * counts anything*. Under Playwright's own metric the wobble is exactly zero.
 *
 * So this script compares the way Playwright does: pixelmatch with the same
 * per-pixel `threshold`, and only pixels above it count toward the ratio.
 * Anything else manufactures false alarms on gradients, shadows and glows.
 *
 * Usage — compare two or more downloaded golden trees:
 *   pnpm visual:jitter <dirA> <dirB> [dirC ...]
 * Each dir is an extracted `visual-goldens` artifact (i.e. contains
 * `visual.spec.ts/<theme>/<scenario>.png`). Every pair is compared and the
 * WORST ratio per golden is reported, since that is what a CI run risks.
 *
 * Options:
 *   --threshold <n>   per-pixel colour threshold (default: read from the
 *                     playwright config, else Playwright's own default 0.2)
 *   --budget <n>      the configured maxDiffPixelRatio to judge against
 *                     (default: read from the playwright config)
 *   --top <n>         how many worst offenders to list (default 10)
 *   --json <path>     also write the full per-golden table as JSON
 */

import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const PLAYWRIGHT_DEFAULT_PER_PIXEL_THRESHOLD = 0.2;

// EVERY tier that judges against the shared golden set, not just the one that
// writes it. This list was react-only until 2026-07-31, and that omission is
// exactly how client-solid sat at 0.06 for three days after PR #424 lowered
// react to 0.005: the instrument built to audit the budget could not see half
// of it. An audit tool that reads one config cannot report a divergence.
const TIER_CONFIGS: readonly TierConfig[] = [
  {
    tier: "react",
    configPath: path.resolve(
      import.meta.dirname,
      "../../packages/client-react/tests/ui/visual/playwright/playwright.config.ts",
    ),
  },
  {
    tier: "solid",
    configPath: path.resolve(
      import.meta.dirname,
      "../../packages/client-solid/tests/ui/visual/playwright/playwright.config.ts",
    ),
  },
];

async function main(): Promise<void> {
  const { dirs, options } = parseArgs(process.argv.slice(2));

  if (dirs.length < 2) {
    console.error(
      "visual-jitter: need at least two golden directories to compare.\n" +
        "  pnpm visual:jitter <dirA> <dirB> [dirC ...]",
    );
    process.exitCode = 1;
    return;
  }

  const tiers = readEveryTierTolerance();
  const configured = tiers[0] ?? {};
  const perPixel =
    options.threshold ??
    configured.threshold ??
    PLAYWRIGHT_DEFAULT_PER_PIXEL_THRESHOLD;
  // Judge measured jitter against the TIGHTEST configured budget: that is the
  // tier most likely to flake, so it is the binding constraint on headroom.
  // The LOOSEST is reported separately below, because it is the one that
  // decides how much real drift can hide.
  const budget = options.budget ?? tightestBudget(tiers);

  console.log(`comparing ${dirs.length} golden trees`);
  dirs.forEach((d, i) => {
    console.log(`  [${String.fromCharCode(65 + i)}] ${d}`);
  });
  console.log(
    `per-pixel threshold: ${perPixel}` +
      (options.threshold === undefined
        ? " (from config/default)"
        : " (--threshold)"),
  );
  console.log(
    `configured budget  : ${budget === undefined ? "unknown" : budget}` +
      (options.budget === undefined ? " (tightest tier)" : " (--budget)"),
  );
  reportTierBudgets(tiers);

  const trees = await Promise.all(dirs.map(collectPngs));
  const shared = sharedKeys(trees);
  const results = shared.map((key) => {
    return { key, ratio: worstRatioAcross(dirs, trees, key, perPixel) };
  });

  report(results, budget, options.top);

  if (options.json) {
    writeFileSync(options.json, JSON.stringify(results, null, 2));
    console.log(`\nwrote ${options.json}`);
  }
}

interface Options {
  threshold?: number;
  budget?: number;
  top: number;
  json?: string;
}

interface Result {
  key: string;
  ratio: number;
}

interface ParsedArgs {
  dirs: string[];
  options: Options;
}

interface ConfiguredTolerances {
  threshold?: number;
  maxDiffPixelRatio?: number;
}

interface TierConfig {
  tier: string;
  configPath: string;
}

interface TierTolerances extends ConfiguredTolerances {
  tier: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const dirs: string[] = [];
  const options: Options = { top: 10 };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--threshold" && next !== undefined) {
      options.threshold = Number(next);
      i += 1;
    } else if (arg === "--budget" && next !== undefined) {
      options.budget = Number(next);
      i += 1;
    } else if (arg === "--top" && next !== undefined) {
      options.top = Number(next);
      i += 1;
    } else if (arg === "--json" && next !== undefined) {
      options.json = next;
      i += 1;
    } else if (arg !== undefined && !arg.startsWith("--")) {
      dirs.push(path.resolve(arg));
    }
  }

  return { dirs, options };
}

/** Reads every golden-consuming tier's settings, so a divergence between them
 * is visible rather than inferred from whichever config happened to be read. */
function readEveryTierTolerance(): TierTolerances[] {
  return TIER_CONFIGS.map((config) => {
    return {
      tier: config.tier,
      ...readConfiguredTolerances(config.configPath),
    };
  });
}

/** Reads one tier's own settings so the audit judges against what actually
 * ships, not a number duplicated here that could silently drift. */
function readConfiguredTolerances(configPath: string): ConfiguredTolerances {
  try {
    const src = readFileSync(configPath, "utf8");
    const ratio = /maxDiffPixelRatio:\s*([0-9.]+)/.exec(src);
    const threshold = /\bthreshold:\s*([0-9.]+)/.exec(src);
    return {
      maxDiffPixelRatio: ratio ? Number(ratio[1]) : undefined,
      threshold: threshold ? Number(threshold[1]) : undefined,
    };
  } catch {
    return {};
  }
}

/** The smallest configured budget — the tier likeliest to flake, so the one
 * measured jitter has to clear. */
function tightestBudget(tiers: readonly TierTolerances[]): number | undefined {
  const budgets = tiers
    .map((tier) => {
      return tier.maxDiffPixelRatio;
    })
    .filter((budget): budget is number => {
      return budget !== undefined;
    });

  if (budgets.length === 0) {
    return undefined;
  }

  return Math.min(...budgets);
}

/** Prints every tier's budget and shouts when they disagree. Two clients judged
 * against ONE golden set means the LOOSEST budget is the real drift gate — a
 * tightened react tier buys nothing while solid still tolerates 12x more. */
function reportTierBudgets(tiers: readonly TierTolerances[]): void {
  for (const tier of tiers) {
    const budget = tier.maxDiffPixelRatio;

    console.log(
      `  ${tier.tier.padEnd(6)} maxDiffPixelRatio: ${budget ?? "unreadable"}`,
    );
  }

  const distinct = new Set(
    tiers.map((tier) => {
      return tier.maxDiffPixelRatio;
    }),
  );

  if (distinct.size > 1) {
    const loosest = Math.max(
      ...tiers.map((tier) => {
        return tier.maxDiffPixelRatio ?? 0;
      }),
    );

    console.log(
      `\n  !! TIERS DIVERGE — the effective drift gate is the LOOSEST: ${loosest}.\n` +
        "     Both tiers assert against the same golden set, so the tighter\n" +
        "     one does not constrain what the looser one lets through.",
    );
  }

  console.log("");
}

async function collectPngs(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".png")) {
      continue;
    }

    const full = path.join(entry.parentPath, entry.name);
    out.set(path.relative(dir, full), full);
  }

  return out;
}

function sharedKeys(trees: readonly Map<string, string>[]): string[] {
  const [first, ...rest] = trees;

  if (!first) {
    return [];
  }

  return [...first.keys()]
    .filter((k) => {
      return rest.every((t) => {
        return t.has(k);
      });
    })
    .sort();
}

/** The worst pairwise ratio for one golden — what a CI run actually risks. */
function worstRatioAcross(
  dirs: readonly string[],
  trees: readonly Map<string, string>[],
  key: string,
  perPixel: number,
): number {
  let worst = 0;

  for (let i = 0; i < dirs.length; i += 1) {
    for (let j = i + 1; j < dirs.length; j += 1) {
      const a = trees[i]?.get(key);
      const b = trees[j]?.get(key);

      if (a === undefined || b === undefined) {
        continue;
      }

      worst = Math.max(worst, ratioBetween(a, b, perPixel));
    }
  }

  return worst;
}

function ratioBetween(aPath: string, bPath: string, perPixel: number): number {
  const aBytes = readFileSync(aPath);
  const bBytes = readFileSync(bPath);

  // Fast path — the overwhelming majority of goldens are byte-identical, and
  // decoding every one of ~1,500 PNGs would dominate the runtime for nothing.
  if (aBytes.equals(bBytes)) {
    return 0;
  }

  const a = PNG.sync.read(aBytes);
  const b = PNG.sync.read(bBytes);

  if (a.width !== b.width || a.height !== b.height) {
    // Different dimensions are never jitter — that is a real layout change,
    // and pixelmatch cannot compare them. Report the maximum so it stands out.
    return 1;
  }

  const differing = pixelmatch(a.data, b.data, undefined, a.width, a.height, {
    threshold: perPixel,
  });

  return differing / (a.width * a.height);
}

function report(
  results: readonly Result[],
  budget: number | undefined,
  top: number,
): void {
  if (results.length === 0) {
    console.log("no goldens in common between the supplied trees");
    process.exitCode = 1;
    return;
  }

  const ratios = results
    .map((r) => {
      return r.ratio;
    })
    .sort((x, y) => {
      return x - y;
    });

  const zero = ratios.filter((r) => {
    return r === 0;
  }).length;
  const max = ratios[ratios.length - 1] ?? 0;

  console.log(`goldens compared : ${results.length.toLocaleString()}`);
  console.log(
    `identical        : ${zero.toLocaleString()} (${((zero / results.length) * 100).toFixed(2)}%)`,
  );
  console.log(`differing        : ${results.length - zero}`);
  console.log("");
  console.log("jitter ratio (Playwright's metric):");

  for (const p of [50, 90, 99, 100]) {
    console.log(
      `  p${String(p).padEnd(4)} = ${percentile(ratios, p).toFixed(6)}`,
    );
  }

  if (budget !== undefined) {
    console.log("");
    console.log(`configured maxDiffPixelRatio : ${budget}`);
    console.log(`measured worst jitter        : ${max.toFixed(6)}`);
    console.log(
      max === 0
        ? "headroom                     : unbounded (no measured jitter)"
        : `headroom                     : ${(budget / max).toFixed(1)}x`,
    );
  }

  const offenders = [...results]
    .filter((r) => {
      return r.ratio > 0;
    })
    .sort((a, b) => {
      return b.ratio - a.ratio;
    })
    .slice(0, top);

  if (offenders.length > 0) {
    console.log("\nworst offenders:");

    for (const o of offenders) {
      console.log(`  ${o.ratio.toFixed(6)}  ${o.key}`);
    }
  }
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? 0;
}

await main();
