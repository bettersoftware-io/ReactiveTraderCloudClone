import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const DEFAULT_RATIO = 0.06;

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
