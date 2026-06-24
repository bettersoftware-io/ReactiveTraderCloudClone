import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { CurrencyPairPosition } from "./position.js";
import {
  aggregatePositionsByCurrency,
  type CurrencyPositionNode,
} from "./aggregatePositions.js";

interface Golden {
  readonly _source: string;
  readonly cases: ReadonlyArray<{
    input: CurrencyPairPosition[];
    expected: CurrencyPositionNode[];
  }>;
}

const golden: Golden = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "./__golden__/aggregatePositions.original.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
);

describe("aggregatePositionsByCurrency (golden: original Positions/data.ts)", () => {
  golden.cases.forEach(({ input, expected }, i) => {
    it(`aggregates case ${i} to the original per-currency nodes`, () => {
      const got = [...aggregatePositionsByCurrency(input)].sort((a, b) => {
        return a.currency.localeCompare(b.currency);
      });
      const want = [...expected].sort((a, b) => {
        return a.currency.localeCompare(b.currency);
      });
      expect(got).toEqual(want);
    });

    it(`drops zero-net currencies in case ${i}`, () => {
      const got = aggregatePositionsByCurrency(input);
      expect(got.every((n) => n.tradedAmount !== 0)).toBe(true);
    });
  });

  it("scales radii linearly between 15 and 60", () => {
    const nodes = aggregatePositionsByCurrency(golden.cases[1].input);
    for (const n of nodes) {
      expect(n.radius).toBeGreaterThanOrEqual(15);
      expect(n.radius).toBeLessThanOrEqual(60);
    }
  });
});
