import { describe, expect, test } from "vitest";

import {
  formatSignedCompact,
  formatSignedInteger,
} from "./formatSignedNumbers";

describe("formatSignedCompact", () => {
  test("signs positives and rounds below a thousand", () => {
    expect(formatSignedCompact(517.5)).toBe("+518");
    expect(formatSignedCompact(0)).toBe("+0");
  });

  test("uses the typographic minus for negatives", () => {
    expect(formatSignedCompact(-192)).toBe("−192");
  });

  test("compacts at the thousand mark with one decimal", () => {
    expect(formatSignedCompact(999)).toBe("+999");
    expect(formatSignedCompact(1000)).toBe("+1.0K");
    expect(formatSignedCompact(1300)).toBe("+1.3K");
    expect(formatSignedCompact(-15_440)).toBe("−15.4K");
  });

  test("compacts at the million mark with two decimals", () => {
    expect(formatSignedCompact(999_999)).toBe("+1000.0K");
    expect(formatSignedCompact(1_000_000)).toBe("+1.00M");
    expect(formatSignedCompact(-2_345_678)).toBe("−2.35M");
  });
});

describe("formatSignedInteger", () => {
  test("signs and groups", () => {
    expect(formatSignedInteger(400)).toBe("+400");
    expect(formatSignedInteger(1200)).toBe("+1,200");
    expect(formatSignedInteger(-300)).toBe("−300");
    expect(formatSignedInteger(0)).toBe("+0");
  });
});
