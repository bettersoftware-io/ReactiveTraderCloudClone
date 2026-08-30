import { describe, expect, it } from "vitest";

import {
  formatSignedCompact,
  formatSignedDollars,
  formatUnsignedCompact,
} from "#/ui/analytics/formatAnalytics";

/** U+2212, the design's minus. Spelled out here so a test asserting it cannot
 * be "fixed" into an ASCII hyphen by a stray find-and-replace without the
 * failure naming what changed. */
const MINUS_SIGN = "−";

describe("formatSignedDollars", () => {
  it("groups the headline in thousands with an explicit plus", () => {
    expect(formatSignedDollars(29_672)).toBe("+$29,672");
  });

  it("groups every three digits, however long the figure", () => {
    expect(formatSignedDollars(1_234_567)).toBe("+$1,234,567");
    expect(formatSignedDollars(1000)).toBe("+$1,000");
  });

  it("leaves a sub-thousand figure ungrouped", () => {
    expect(formatSignedDollars(999)).toBe("+$999");
    expect(formatSignedDollars(0)).toBe("+$0");
  });

  it("signs a loss with the design's U+2212, not an ASCII hyphen", () => {
    expect(formatSignedDollars(-4000)).toBe(`${MINUS_SIGN}$4,000`);
    expect(formatSignedDollars(-999)).toBe(`${MINUS_SIGN}$999`);
  });

  it("rounds to whole dollars before grouping", () => {
    expect(formatSignedDollars(29_671.6)).toBe("+$29,672");
    // Rounds to zero but stays on the negative side of the sign test, exactly
    // as the prototype's `(last >= 0 ? '+$' : '−$')` does.
    expect(formatSignedDollars(-0.4)).toBe(`${MINUS_SIGN}$0`);
  });
});

describe("formatSignedCompact", () => {
  it("uses two decimals and an M from a million up", () => {
    expect(formatSignedCompact(1_000_000)).toBe("+1.00M");
    expect(formatSignedCompact(24_800_000)).toBe("+24.80M");
    expect(formatSignedCompact(-1_000_000)).toBe(`${MINUS_SIGN}1.00M`);
  });

  it("uses one decimal and an uppercase K from a thousand up", () => {
    expect(formatSignedCompact(1000)).toBe("+1.0K");
    expect(formatSignedCompact(4200)).toBe("+4.2K");
    expect(formatSignedCompact(-4200)).toBe(`${MINUS_SIGN}4.2K`);
  });

  it("prints sub-thousand figures whole, with their sign", () => {
    expect(formatSignedCompact(999)).toBe("+999");
    expect(formatSignedCompact(-999)).toBe(`${MINUS_SIGN}999`);
    expect(formatSignedCompact(0)).toBe("+0");
  });

  // Both quirks are the prototype's own, pinned so they are not "corrected"
  // into a divergence from the design: the K branch keeps counting past 1000K
  // right up to a million, and -0 reads as non-negative because `-0 >= 0`.
  it("keeps counting in K to just under a million", () => {
    expect(formatSignedCompact(999_999)).toBe("+1000.0K");
    expect(formatSignedCompact(-999_999)).toBe(`${MINUS_SIGN}1000.0K`);
  });

  it("treats negative zero as non-negative", () => {
    expect(formatSignedCompact(-0)).toBe("+0");
  });
});

describe("formatUnsignedCompact", () => {
  it("drops the plus from a long position", () => {
    expect(formatUnsignedCompact(24_800_000)).toBe("24.80M");
    expect(formatUnsignedCompact(900_000)).toBe("900.0K");
    expect(formatUnsignedCompact(0)).toBe("0");
  });

  it("narrows a short position's U+2212 to an ASCII hyphen", () => {
    expect(formatUnsignedCompact(-18_200_000)).toBe("-18.20M");
    expect(formatUnsignedCompact(-900_000)).toBe("-900.0K");
    expect(formatUnsignedCompact(-999)).toBe("-999");
  });
});
