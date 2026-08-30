import { describe, expect, it } from "vitest";

import { formatChangePct } from "#/ui/equities/formatChangePct";

describe("formatChangePct", () => {
  it("signs a positive change with a leading +", () => {
    expect(formatChangePct(1.13)).toBe("+1.13%");
  });
  it("keeps a negative change's own sign, no double minus", () => {
    expect(formatChangePct(-1.06)).toBe("-1.06%");
  });
  it("treats zero as non-negative — a leading + not a bare 0.00%", () => {
    expect(formatChangePct(0)).toBe("+0.00%");
  });
});
