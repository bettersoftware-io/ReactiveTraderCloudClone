import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatPnlValue } from "./formatPnlValue.js";

const golden: Golden = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("./__golden__/formatPnlValue.original.json", import.meta.url),
    ),
    "utf8",
  ),
);

describe("formatPnlValue (golden: original LastPosition + formatAsWholeNumber)", () => {
  for (const { input, expected } of golden.cases) {
    it(`formats ${input} as ${expected}`, () => {
      expect(formatPnlValue(input)).toBe(expected);
    });
  }
});

interface GoldenCase {
  input: number;
  expected: string;
}

interface Golden {
  readonly _source: string;
  readonly cases: ReadonlyArray<GoldenCase>;
}
