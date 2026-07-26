import { describe, expect, it } from "vitest";

import { BOOT_DURATION_MS, ease, hexToRgba } from "./bootCanvas";

// The drawing in bootCanvas.ts is excluded from coverage (see vitest.config.ts):
// its only output is pixels, so a unit test could assert nothing but a call
// sequence against a mock 2D context. These two exports are the part that is NOT
// drawing — pure maths every scene depends on, cheap to pin, and the kind of
// thing that fails silently. A wrong `hexToRgba` yields a valid-looking colour
// string; a wrong `ease` yields a plausible-looking animation.

describe("hexToRgba", () => {
  it("converts a 6-digit hex to rgba with the given alpha", () => {
    expect(hexToRgba("#4ade80", 0.5)).toBe("rgba(74,222,128,0.5)");
  });

  it("expands 3-digit shorthand to the same colour as its 6-digit form", () => {
    expect(hexToRgba("#abc", 1)).toBe(hexToRgba("#aabbcc", 1));
  });

  it("accepts a hex with no leading #", () => {
    expect(hexToRgba("4ade80", 0.5)).toBe(hexToRgba("#4ade80", 0.5));
  });

  it("keeps the channel order red, green, blue", () => {
    expect(hexToRgba("#ff0000", 1)).toBe("rgba(255,0,0,1)");
    expect(hexToRgba("#00ff00", 1)).toBe("rgba(0,255,0,1)");
    expect(hexToRgba("#0000ff", 1)).toBe("rgba(0,0,255,1)");
  });

  it("passes alpha through untouched, including 0", () => {
    expect(hexToRgba("#000000", 0)).toBe("rgba(0,0,0,0)");
  });
});

describe("ease", () => {
  it("spans 0 to 1 across the unit interval", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it("clamps outside the unit interval rather than extrapolating", () => {
    expect(ease(-5)).toBe(0);
    expect(ease(5)).toBe(1);
  });

  it("eases OUT — past halfway by the midpoint", () => {
    // cubic ease-out: 1 - (1-0.5)^3 = 0.875. An ease-IN would sit below 0.5,
    // so this assertion is what distinguishes the two if the curve is inverted.
    expect(ease(0.5)).toBeCloseTo(0.875, 10);
  });

  it("is monotonically increasing", () => {
    let previous = ease(0);

    for (let i = 1; i <= 20; i++) {
      const next = ease(i / 20);

      expect(next).toBeGreaterThan(previous);
      previous = next;
    }
  });

  it("decelerates — each step gains less than the one before", () => {
    expect(gainOver(0.1)).toBeGreaterThan(gainOver(0.5));
    expect(gainOver(0.5)).toBeGreaterThan(gainOver(0.8));
  });
});

describe("BOOT_DURATION_MS", () => {
  it("is the shared boot length the scenes and shells animate against", () => {
    expect(BOOT_DURATION_MS).toBe(4200);
  });
});

/** How much the eased value gains over the 0.1 window starting at `t`. */
function gainOver(t: number): number {
  return ease(t + 0.1) - ease(t);
}
