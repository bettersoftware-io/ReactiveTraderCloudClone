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
 * Measured over repeated captures of all 21 scenarios: **20 of 21 reproduce
 * at exactly 0 differing pixels**, every time. The 21st is a known
 * intermittent that is deliberately NOT given an allowance — see the
 * `blotter/seeded` note below.
 *
 * **Why a single global budget had to go, rather than just shrink.** The
 * obvious replacement was one number just above the observed noise. That is
 * unsound, and the tier itself proves it: pinning
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
 * **Currently empty, and that is the intended steady state.** Add an entry
 * ONLY with fresh samples and a diagnosis of what is moving — never to quiet a
 * scenario that started failing, which is the failure the whole tier exists to
 * report. An allowance is a claim that a difference is meaningless; it needs
 * the same evidence as any other claim.
 */
const MEASURED_TOLERANCE: Readonly<Record<string, number>> = {
  // Empty, deliberately. See the `blotter/seeded` note below for the one
  // scenario that has a reason to want an entry here and is not getting one.
};

/**
 * **`blotter/seeded` is a known intermittent, and is deliberately NOT given an
 * allowance here.** Measured against a freshly pinned golden on 2026-08-12,
 * it lands on one of at least THREE discrete values: exactly 0 (the large
 * majority — eight of nine consecutive captures), 0.0846%, and 0.5266%. Never
 * a continuous spread; always one of a small set. The 0.5266% state is the
 * whole row list rendered about a pixel lower with identical content.
 *
 * A first reading of this called it bimodal, from a sample that had only
 * produced two of the values. It is recorded here as wrong because the
 * correction matters to whoever picks it up: a discrete-state bug with three
 * states is a different search than one with two, and the third value was
 * found only by re-verifying after an unrelated catch-up merge.
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
 * Re-measure before changing any of this, and take MORE than three samples.
 * Three is the floor, not a sufficiency: `equities/markets` once read 0.00%
 * between runs 1 and 2 and 1.60% between runs 1 and 3, so two samples can
 * certify a drifting scenario as stable — and `blotter/seeded`'s third
 * discrete state did not appear until a tenth capture, after three had
 * "settled" the question twice.
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
