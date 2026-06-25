import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatPrecise2, formatWithScale, scaleNumber } from "./formatScale.js";

interface GoldenCase {
  input: number;
  expected: { withScale: string; precise2: string };
}

interface Golden {
  readonly _source: string;
  readonly cases: ReadonlyArray<GoldenCase>;
}

const golden: Golden = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("./__golden__/formatScale.original.json", import.meta.url),
    ),
    "utf8",
  ),
);

describe("formatScale (golden: original PNLBar default + hover)", () => {
  for (const { input, expected } of golden.cases) {
    it(`scales ${input} to ${expected.withScale}`, () => {
      expect(formatWithScale(input)).toBe(expected.withScale);
    });
    it(`renders ${input} to 2dp as ${expected.precise2}`, () => {
      expect(formatPrecise2(input)).toBe(expected.precise2);
    });
  }
});

describe("scaleNumber — billion and trillion thresholds", () => {
  it("routes 1_200_000_000 to the 'b' scale", () => {
    const { value, scale } = scaleNumber(1_200_000_000);
    expect(scale).toBe("b");
    expect(value).toBeCloseTo(1.2, 10);
  });

  it("routes 3_700_000_000_000 to the 't' scale", () => {
    const { value, scale } = scaleNumber(3_700_000_000_000);
    expect(scale).toBe("t");
    expect(value).toBeCloseTo(3.7, 10);
  });

  it("formats 1_200_000_000 with scale as '1b'", () => {
    expect(formatWithScale(1_200_000_000)).toBe("1b");
  });

  it("formats 3_700_000_000_000 with scale as '4t'", () => {
    expect(formatWithScale(3_700_000_000_000)).toBe("4t");
  });

  it("routes negative billion to 'b' scale", () => {
    const { value, scale } = scaleNumber(-2_000_000_000);
    expect(scale).toBe("b");
    expect(value).toBeCloseTo(-2, 10);
  });
});
