import { describe, expect, it } from "vitest";

import { loadGolden } from "./loadGolden.js";

interface SmokeCase {
  input: number;
  expected: number;
}

describe("loadGolden", () => {
  it("loads a co-located golden fixture by name", () => {
    const golden = loadGolden<SmokeCase>("loadGoldenSmoke");
    expect(golden._source).toMatch(/^rtc-original@4a31f01/);
    expect(golden.cases).toEqual([{ input: 1, expected: 1 }]);
  });
});
