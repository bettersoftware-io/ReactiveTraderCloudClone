import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { compareToGolden } from "#/../tests/visual/shared/diff";

function solid(w: number, h: number, rgba: [number, number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data.set(rgba, i * 4);
  }
  return PNG.sync.write(png);
}

describe("compareToGolden", () => {
  it("passes when images are identical", async () => {
    const img = solid(4, 4, [10, 20, 30, 255]);
    const golden = solid(4, 4, [10, 20, 30, 255]);
    const res = await compareToGolden(img, "unused-when-inline.png", { inlineGolden: golden });
    expect(res.pass).toBe(true);
    expect(res.ratio).toBe(0);
  });

  it("fails when mismatch exceeds the 0.06 ratio", async () => {
    const img = solid(4, 4, [0, 0, 0, 255]);
    const golden = solid(4, 4, [255, 255, 255, 255]);
    const res = await compareToGolden(img, "unused-when-inline.png", { inlineGolden: golden });
    expect(res.pass).toBe(false);
    expect(res.ratio).toBeGreaterThan(0.06);
    expect(res.diffPng).not.toBeNull();
  });
});
