import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { applyMaximum } from "./rfq.js";

const golden = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("./__golden__/creditMaxQuantity.original.json", import.meta.url),
    ),
    "utf8",
  ),
) as Golden;

describe("applyMaximum (credit max-quantity cap)", () => {
  for (const c of golden.cases) {
    it(`caps ${c.input} -> ${c.expected}`, () => {
      expect(applyMaximum(c.input)).toBe(c.expected);
    });
  }
});

interface Case {
  readonly input: number;
  readonly expected: number;
}

interface Golden {
  cases: Case[];
}
