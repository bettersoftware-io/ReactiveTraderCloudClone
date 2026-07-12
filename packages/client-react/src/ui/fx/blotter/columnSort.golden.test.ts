// loadGolden reads the fixture via fileURLToPath(import.meta.url). Under the
// client-react default jsdom env, import.meta.url is an http:// URL and
// fileURLToPath throws, so this golden test must run in the node environment.
// @vitest-environment node
//
// nextSortDirection itself now lives in @rtc/client-core's blotter/ module
// (relocated out of this package — it was already framework-free, importing
// only @rtc/domain). This golden test stays here rather than moving with it:
// the fixture-loading harness (loadGolden + the `.original.json` fixture
// under tests/ui/__golden__/) is client-react-local test infrastructure, so
// duplicating it into client-core for one fixture wasn't worth it — this file
// just imports the relocated function and keeps exercising it against the
// pinned original-codebase ground truth.
import { describe, expect, it } from "vitest";

import { nextSortDirection, type SortState } from "@rtc/client-core";
import type { Trade } from "@rtc/domain";

import { loadGolden } from "#tests/ui/__golden__/loadGolden";

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

interface FirstClickCase {
  input: keyof Trade;
  expected: "asc" | "desc";
}
