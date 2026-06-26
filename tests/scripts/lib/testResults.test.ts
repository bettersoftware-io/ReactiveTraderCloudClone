import { describe, expect, it } from "vitest";

import { summarize } from "./testResults";

describe("summarize", () => {
  it("reads vitest json reporter counts", () => {
    const r = summarize("domain", {
      numTotalTests: 10,
      numPassedTests: 9,
      numFailedTests: 1,
      numPendingTests: 0,
    });
    expect(r).toEqual({ tier: "domain", passed: 9, failed: 1, skipped: 0 });
  });

  it("defaults missing counts to zero", () => {
    expect(summarize("server", {})).toEqual({
      tier: "server",
      passed: 0,
      failed: 0,
      skipped: 0,
    });
  });
});
