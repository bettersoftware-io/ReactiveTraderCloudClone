import { describe, expect, it } from "vitest";
import {
  isRfqRequired,
  MAX_NOTIONAL,
  parseNotional,
  RFQ_THRESHOLD,
  validateNotional,
} from "./notional.js";

describe("parseNotional", () => {
  it("parses plain numbers", () => {
    expect(parseNotional("500")).toEqual({ value: 500, error: null });
  });

  it("parses k multiplier", () => {
    expect(parseNotional("1k")).toEqual({ value: 1_000, error: null });
    expect(parseNotional("2.5K")).toEqual({ value: 2_500, error: null });
  });

  it("parses m multiplier", () => {
    expect(parseNotional("1m")).toEqual({ value: 1_000_000, error: null });
    expect(parseNotional("2.5M")).toEqual({ value: 2_500_000, error: null });
  });

  it("returns Max exceeded for values above 1B", () => {
    const result = parseNotional("2000m");
    expect(result.error).toBe("Max exceeded");
    expect(result.value).toBe(2_000_000_000);
  });

  it("returns null for empty input", () => {
    expect(parseNotional("")).toEqual({ value: null, error: null });
  });

  it("returns Invalid input for non-numeric", () => {
    expect(parseNotional("abc")).toEqual({
      value: null,
      error: "Invalid input",
    });
  });
});

describe("isRfqRequired", () => {
  it("returns true at threshold (10M)", () => {
    expect(isRfqRequired(RFQ_THRESHOLD)).toBe(true);
  });

  it("returns true above threshold", () => {
    expect(isRfqRequired(15_000_000)).toBe(true);
  });

  it("returns false below threshold", () => {
    expect(isRfqRequired(9_999_999)).toBe(false);
  });
});

describe("validateNotional", () => {
  it("returns null for valid values", () => {
    expect(validateNotional(1_000_000)).toBeNull();
  });

  it("returns Max exceeded above limit", () => {
    expect(validateNotional(MAX_NOTIONAL + 1)).toBe("Max exceeded");
  });

  it("returns Invalid value for zero or negative", () => {
    expect(validateNotional(0)).toBe("Invalid value");
    expect(validateNotional(-1)).toBe("Invalid value");
  });
});
