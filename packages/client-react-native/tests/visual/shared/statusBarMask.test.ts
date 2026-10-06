import { PNG } from "pngjs";
import { expect, test } from "vitest";

import { maskTopRows, STATUS_BAR_ROWS } from "./statusBarMask";

test("the masked rows become opaque black and the rest is left alone", () => {
  const masked = PNG.sync.read(maskTopRows(createWhitePng(4, 3), 2));

  expect([...masked.data.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
  // Last pixel of the second row: still inside the mask.
  expect([...masked.data.subarray(28, 32)]).toEqual([0, 0, 0, 255]);
  // First pixel of the third row: outside it.
  expect([...masked.data.subarray(32, 36)]).toEqual([255, 255, 255, 255]);
});

// iOS goldens are stored as captured; a re-encode would rewrite every one.
test("masking no rows returns the very same bytes", () => {
  const png = createWhitePng(2, 2);

  expect(maskTopRows(png, 0)).toBe(png);
});

test("a mask taller than the image stops at its last row", () => {
  const masked = PNG.sync.read(maskTopRows(createWhitePng(2, 2), 9));

  expect(
    [...masked.data].every((value, index) => {
      return value === (index % 4 === 3 ? 255 : 0);
    }),
  ).toBe(true);
});

test("only Android's bar is masked", () => {
  expect(STATUS_BAR_ROWS).toEqual({ ios: 0, android: 142 });
});

function createWhitePng(width: number, height: number): Buffer {
  const image = new PNG({ width, height });

  image.data.fill(255);
  return PNG.sync.write(image);
}
