import coreBundle, { type Comparator } from "playwright-core/lib/coreBundle";
import { PNG } from "pngjs";

/**
 * The fraction of pixels two PNG goldens differ by, measured with
 * **Playwright's own screenshot comparator**: the function
 * `toHaveScreenshot` runs, with the same per-pixel `threshold`.
 *
 * `visual-jitter.ts` and `visual-engine-parity.ts` use this to set and judge
 * the visual tier's `maxDiffPixelRatio`. They used to call the `pixelmatch`
 * package directly and so measured the gate only by imitation. pixelmatch 8
 * replaced its colour metric (YIQ → OKLab/HyAB) while Playwright still
 * bundles the old one, and every engine pair moved by up to +0.0012 against
 * a 0.005 budget (2026-11-22). Going through Playwright's comparator makes
 * the scripts measure what the gate measures by construction, whichever
 * pixelmatch the rest of the repo installs.
 *
 * Playwright exposes the comparator as `utils.getComparator` on its
 * `lib/coreBundle` export, but not as documented API, and it reports the
 * differing-pixel count only inside its message. `playwrightPixelDiff.test.ts`
 * pins both with known images, so a Playwright release that renames the
 * function, rewords the message or changes the metric fails that test. That
 * is the moment the tolerance audit needs re-running anyway.
 */
export function differingPixelRatio(
  aBytes: Buffer,
  bBytes: Buffer,
  perPixel: number,
): number {
  // Fast path: most goldens are byte-identical, and decoding every one of
  // ~1,500 PNGs would dominate the runtime for nothing.
  if (aBytes.equals(bBytes)) {
    return 0;
  }

  const a = PNG.sync.read(aBytes);
  const b = PNG.sync.read(bBytes);

  if (a.width !== b.width || a.height !== b.height) {
    // Different dimensions are never jitter: that is a real layout change.
    // Report the maximum so it stands out.
    return 1;
  }

  const result = loadComparator()(aBytes, bBytes, {
    threshold: perPixel,
    maxDiffPixels: 0,
  });

  if (result === null) {
    return 0;
  }

  return countIn(result.errorMessage) / (a.width * a.height);
}

let comparator: Comparator | undefined;

function loadComparator(): Comparator {
  if (comparator === undefined) {
    const getComparator = coreBundle.utils?.getComparator;

    if (getComparator === undefined) {
      throw new Error(
        "playwright-core no longer exports utils.getComparator from lib/coreBundle; " +
          "find its new home before trusting any visual-tolerance measurement",
      );
    }

    comparator = getComparator("image/png");
  }

  return comparator;
}

const DIFFERING_PIXELS =
  /(\d+) pixels \(ratio [\d.]+ of all image pixels\) are different/;

function countIn(errorMessage: string): number {
  const match = DIFFERING_PIXELS.exec(errorMessage);

  if (match === null) {
    throw new Error(
      `Playwright's comparator message no longer states a pixel count: ${errorMessage}`,
    );
  }

  return Number(match[1]);
}
