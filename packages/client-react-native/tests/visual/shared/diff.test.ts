import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { compareToGolden, verdictLine } from "#/../tests/visual/shared/diff";

describe("compareToGolden", () => {
  it("passes when images are identical", async () => {
    const img = solid(4, 4, [10, 20, 30, 255]);
    const golden = solid(4, 4, [10, 20, 30, 255]);
    const res = await compareToGolden(img, "unused-when-inline.png", {
      inlineGolden: golden,
    });
    expect(res.pass).toBe(true);
    expect(res.ratio).toBe(0);
  });

  it("fails when mismatch exceeds the 0.06 ratio", async () => {
    const img = solid(4, 4, [0, 0, 0, 255]);
    const golden = solid(4, 4, [255, 255, 255, 255]);
    const res = await compareToGolden(img, "unused-when-inline.png", {
      inlineGolden: golden,
    });
    expect(res.pass).toBe(false);
    expect(res.ratio).toBeGreaterThan(0.06);
    expect(res.diffPng).not.toBeNull();
    expect(res.noComparison).toBeNull();
  });

  it("reports a missing golden as such, not as a pixel diff", async () => {
    const img = solid(4, 4, [0, 0, 0, 255]);
    const res = await compareToGolden(
      img,
      "/nonexistent/dir/no-such-golden.png",
    );
    expect(res.pass).toBe(false);
    expect(res.noComparison).toBe("missing-golden");
  });

  it("reports a dimension mismatch as such, not as a pixel diff", async () => {
    const img = solid(4, 4, [0, 0, 0, 255]);
    const golden = solid(2, 2, [0, 0, 0, 255]);
    const res = await compareToGolden(img, "unused-when-inline.png", {
      inlineGolden: golden,
    });
    expect(res.pass).toBe(false);
    expect(res.noComparison).toBe("size-mismatch");
  });
});

describe("verdictLine", () => {
  it("prints the diff percentage for a real comparison", async () => {
    const img = solid(4, 4, [10, 20, 30, 255]);
    const same = await compareToGolden(img, "unused-when-inline.png", {
      inlineGolden: img,
    });

    const different = await compareToGolden(img, "unused-when-inline.png", {
      inlineGolden: solid(4, 4, [255, 255, 255, 255]),
    });
    expect(verdictLine("a/b", same)).toBe("pass     a/b  (0.0000%)");
    expect(verdictLine("a/b", different)).toBe("FAIL     a/b  (100.0000%)");
  });

  it("names a missing golden instead of printing 100%", async () => {
    const img = solid(4, 4, [0, 0, 0, 255]);
    const res = await compareToGolden(
      img,
      "/nonexistent/dir/no-such-golden.png",
    );
    const line = verdictLine("a/b", res);
    expect(line).toMatch(/^NO GOLDEN a\/b/);
    expect(line).not.toContain("%");
  });

  it("names a dimension mismatch instead of printing 100%", async () => {
    const res = await compareToGolden(
      solid(4, 4, [0, 0, 0, 255]),
      "unused-when-inline.png",
      { inlineGolden: solid(2, 2, [0, 0, 0, 255]) },
    );
    const line = verdictLine("a/b", res);
    expect(line).toMatch(/^SIZE {5}a\/b/);
    expect(line).not.toContain("%");
  });
});

function solid(
  w: number,
  h: number,
  rgba: [number, number, number, number],
): Buffer {
  const png = new PNG({ width: w, height: h });

  for (let i = 0; i < w * h; i++) {
    png.data.set(rgba, i * 4);
  }

  return PNG.sync.write(png);
}
