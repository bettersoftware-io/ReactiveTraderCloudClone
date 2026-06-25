import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatPrecise2, formatWithScale } from "./formatScale.js";

interface Golden {
  readonly _source: string;
  readonly cases: ReadonlyArray<{
    input: number;
    expected: { withScale: string; precise2: string };
  }>;
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
