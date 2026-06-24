// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Trade } from "@rtc/domain";

import { loadGolden } from "#tests/ui/__golden__/loadGolden";

import { nextSortDirection, type SortState } from "./columnSort";

interface FirstClickCase {
  input: keyof Trade;
  expected: "asc" | "desc";
}

describe("nextSortDirection — first-click direction matches rtc-original descDefaultFields", () => {
  const golden = loadGolden<FirstClickCase>("sort-first-click-direction");
  const none: SortState = { column: null, direction: null };

  for (const { input, expected } of golden.cases) {
    it(`sorts ${input} ${expected} on first click`, () => {
      expect(nextSortDirection(input, none)).toEqual({
        column: input,
        direction: expected,
      });
    });
  }
});
