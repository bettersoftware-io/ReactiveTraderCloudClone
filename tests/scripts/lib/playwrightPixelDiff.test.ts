import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { differingPixelRatio } from "./playwrightPixelDiff.ts";

describe("differingPixelRatio (Playwright's own comparator)", () => {
  it("is 0 for byte-identical images", () => {
    expect(
      differingPixelRatio(createGreyPng(0, 0), createGreyPng(0, 0), 0),
    ).toBe(0);
  });

  it("counts exactly the pixels that differ beyond the threshold", () => {
    // 7 of 100 pixels moved from grey 128 to near-white: far past any
    // threshold, so the comparator must report exactly 7.
    expect(
      differingPixelRatio(createGreyPng(0, 0), createGreyPng(7, 120), 0.2),
    ).toBe(0.07);
  });

  it("applies the per-pixel threshold the way toHaveScreenshot does", () => {
    // A 4-level brightening is below Playwright's default 0.2 threshold but
    // above a zero threshold: the same images measure 0 or 0.05 depending
    // only on the threshold handed through.
    const base = createGreyPng(0, 0);
    const subtle = createGreyPng(5, 4);

    expect(differingPixelRatio(base, subtle, 0.2)).toBe(0);
    expect(differingPixelRatio(base, subtle, 0)).toBe(0.05);
  });

  it("reports a size change as the maximum, never as jitter", () => {
    expect(
      differingPixelRatio(createPngOfSize(10, 10), createPngOfSize(10, 11), 0),
    ).toBe(1);
  });
});

const SIZE = 10;

const MID_GREY = 128;

/** A SIZE×SIZE opaque mid-grey PNG, with `changed` pixels (row-major from
 * the top-left) brightened by `delta` on every channel. */
function createGreyPng(changed: number, delta: number): Buffer {
  const png = new PNG({ width: SIZE, height: SIZE });

  for (let i = 0; i < SIZE * SIZE; i++) {
    const value = i < changed ? MID_GREY + delta : MID_GREY;

    png.data[i * 4] = value;
    png.data[i * 4 + 1] = value;
    png.data[i * 4 + 2] = value;
    png.data[i * 4 + 3] = 255;
  }

  return PNG.sync.write(png);
}

function createPngOfSize(width: number, height: number): Buffer {
  const png = new PNG({ width, height });

  png.data.fill(255);

  return PNG.sync.write(png);
}
