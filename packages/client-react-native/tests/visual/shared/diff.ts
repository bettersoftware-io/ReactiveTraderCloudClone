import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * **Exact reproduction is the default** — zero differing pixels — as of
 * 2026-08-12. Was `0.06` (6%).
 *
 * Once the harness renders a static fake rather than composing a live
 * simulator, nothing on screen moves, so "identical" is the honest bar.
 * Measured over three captures of all 21 scenarios: **20 of 21 reproduce at
 * exactly 0 differing pixels.** Only the one scenario that cannot gets an
 * allowance, in `MEASURED_TOLERANCE` below.
 *
 * **Why a single global budget had to go, rather than just shrink.** The
 * obvious replacement was one number just above the measured noise floor of
 * 0.1107%. That is unsound, and the tier itself proves it: pinning
 * `shell/connection-banner` to a disconnected state — status text changed,
 * dot green to red, an entire "Reconnect" button added — moves **0.0833%** of
 * the frame. A real semantic change is SMALLER than this tier's worst
 * anti-aliasing noise, so no global threshold can separate them. Any budget
 * loose enough to tolerate the noise is loose enough to sleep through the
 * rewrite.
 *
 * The old 6% was 54× the noise floor and would have missed both. That is not
 * hypothetical — the web tier's audit found a 1.7% budget hiding a complete
 * PreferencesModal restructure, and this tier let the blotter re-date itself
 * every calendar day (T32) because five date strings are ~0.1% of a frame.
 */
const DEFAULT_RATIO = 0;

/**
 * The scenarios that provably cannot reproduce byte-exactly, and by how much.
 *
 * One entry only, and it is a measurement rather than a guess. Add to this map
 * ONLY with three fresh samples and a diagnosis of what is moving — never to
 * quiet a scenario that started failing, which is the failure the whole tier
 * exists to report.
 */
const MEASURED_TOLERANCE: Readonly<Record<string, number>> = {
  // Empty, deliberately. See the `blotter/seeded` note below for the one
  // scenario that has a reason to want an entry here and is not getting one.
};

/**
 * **`blotter/seeded` is a known intermittent, and is deliberately NOT given an
 * allowance here.** Measured 2026-08-12 over nine consecutive captures against
 * a freshly pinned golden: eight reproduce at exactly 0 differing pixels, and
 * one lands 0.5266% out. It is bimodal — never a spread, always exactly one of
 * those two figures — and the failing state is the whole row list rendered
 * about a pixel lower, with identical content. A separate verify loop
 * alternated pass/fail on four consecutive runs, so the rate is somewhere
 * between 1-in-9 and 1-in-2 and is not yet understood.
 *
 * Silencing it would take a budget of ~0.006. That is six times the entire
 * rest of the matrix, and this tier has already shown what such a budget
 * costs: rewriting `shell/connection-banner`'s status — text, colour, and a
 * whole new button — moves only 0.0833%. An allowance big enough to hide the
 * flake is big enough to hide the next real change to the busiest screen in
 * the app, which is precisely the trade the old global 0.06 made and lost.
 *
 * So it stays exact and reports honestly. A red run on this one scenario is a
 * true statement about the harness. Root-causing it is tracked as an open
 * item; the likely family is the same font-metric/layout settling that forced
 * `postReadySettleMs` up to 1500, since the residual survives that raise.
 */

/**
 * The pixel budget for one scenario: exact, unless it has a measured reason
 * not to be.
 *
 * Re-measure before changing any of this, with **three samples minimum**.
 * `equities/markets` once read 0.00% between runs 1 and 2 and 1.60% between
 * runs 1 and 3 — two samples can certify a drifting scenario as stable.
 */
export function toleranceFor(scenarioId: string): number {
  return MEASURED_TOLERANCE[scenarioId] ?? DEFAULT_RATIO;
}

interface CompareOpts {
  allowedMismatchedPixelRatio?: number;
  createIfMissing?: boolean;
  inlineGolden?: Buffer;
}

interface CompareResult {
  pass: boolean;
  mismatchedPixels: number;
  ratio: number;
  diffPng: Buffer | null;
}

export async function compareToGolden(
  actualPng: Buffer,
  goldenPath: string,
  opts: CompareOpts = {},
): Promise<CompareResult> {
  const tolerance = opts.allowedMismatchedPixelRatio ?? DEFAULT_RATIO;
  const actual = PNG.sync.read(actualPng);

  let goldenBytes = opts.inlineGolden ?? null;

  if (!goldenBytes) {
    try {
      goldenBytes = await readFile(goldenPath);
    } catch {
      if (opts.createIfMissing) {
        await mkdir(dirname(goldenPath), { recursive: true });
        await writeFile(goldenPath, actualPng);
        return { pass: true, mismatchedPixels: 0, ratio: 0, diffPng: null };
      }

      return {
        pass: false,
        mismatchedPixels: actual.width * actual.height,
        ratio: 1,
        diffPng: null,
      };
    }
  }

  const golden = PNG.sync.read(goldenBytes);

  if (golden.width !== actual.width || golden.height !== actual.height) {
    // Dimension mismatch can never be absorbed by tolerance (web suite lesson).
    return {
      pass: false,
      mismatchedPixels: actual.width * actual.height,
      ratio: 1,
      diffPng: null,
    };
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  const mismatched = pixelmatch(
    actual.data,
    golden.data,
    diff.data,
    actual.width,
    actual.height,
    {
      threshold: 0.1,
    },
  );
  const ratio = mismatched / (actual.width * actual.height);
  const pass = ratio <= tolerance;
  return {
    pass,
    mismatchedPixels: mismatched,
    ratio,
    diffPng: pass ? null : PNG.sync.write(diff),
  };
}
