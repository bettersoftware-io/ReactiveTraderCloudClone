import { describe, expect, it } from "vitest";

import {
  createInitialNotionalView,
  reduceNotionalInput,
} from "#/presenters/notionalView";

describe("notionalView", () => {
  it("createInitialNotionalView formats the default with commas and flags RFQ above the threshold", () => {
    expect(createInitialNotionalView(1_000_000)).toEqual({
      displayValue: "1,000,000",
      numericValue: 1_000_000,
      error: null,
      isRfq: false,
      isDefault: true,
    });
    expect(createInitialNotionalView(20_000_000).isRfq).toBe(true);
  });

  it("reduceNotionalInput parses, reformats, and keeps raw input on a parse failure", () => {
    expect(reduceNotionalInput(1_000_000, "2m")).toEqual({
      displayValue: "2,000,000",
      numericValue: 2_000_000,
      error: null,
      isRfq: false,
      isDefault: false,
    });
    expect(reduceNotionalInput(1_000_000, "1m").isDefault).toBe(true);
    expect(reduceNotionalInput(1_000_000, "abc")).toEqual({
      displayValue: "abc",
      numericValue: 0,
      error: "Invalid input",
      isRfq: false,
      isDefault: false,
    });
    expect(reduceNotionalInput(1_000_000, "2000m").error).toBe("Max exceeded");
  });
});
