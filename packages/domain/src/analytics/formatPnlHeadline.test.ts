import { describe, expect, it } from "vitest";

import { formatPnlHeadline, formatPnlK } from "./formatPnlHeadline.js";

describe("formatPnlHeadline (PROTO dc.html L1299)", () => {
  it("formats positives as +$X.Xk", () => {
    expect(formatPnlHeadline(17120)).toBe("+$17.1k");
    expect(formatPnlHeadline(29100)).toBe("+$29.1k");
  });

  it("formats negatives as -$X.Xk", () => {
    expect(formatPnlHeadline(-1499)).toBe("-$1.5k");
  });

  it("formats zero as +$0.0k", () => {
    expect(formatPnlHeadline(0)).toBe("+$0.0k");
  });
});

describe("formatPnlK (PROTO bar values, dc.html L1302)", () => {
  it("rounds to whole k with explicit sign", () => {
    expect(formatPnlK(13000)).toBe("+13k");
    expect(formatPnlK(-4000)).toBe("-4k");
    expect(formatPnlK(800)).toBe("+1k");
    expect(formatPnlK(0)).toBe("+0k");
  });
});
