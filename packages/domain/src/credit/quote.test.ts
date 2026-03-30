import { describe, it, expect } from "vitest";
import { validQuoteTransitions } from "./quote.js";

describe("validQuoteTransitions", () => {
  it("pendingWithoutPrice can transition to pendingWithPrice, passed, or rejectedWithoutPrice", () => {
    expect(validQuoteTransitions("pendingWithoutPrice")).toEqual([
      "pendingWithPrice",
      "passed",
      "rejectedWithoutPrice",
    ]);
  });

  it("pendingWithPrice can transition to accepted or rejectedWithPrice", () => {
    expect(validQuoteTransitions("pendingWithPrice")).toEqual([
      "accepted",
      "rejectedWithPrice",
    ]);
  });

  it("passed is terminal", () => {
    expect(validQuoteTransitions("passed")).toEqual(["passed"]);
  });

  it("accepted is terminal", () => {
    expect(validQuoteTransitions("accepted")).toEqual([]);
  });

  it("rejectedWithPrice is terminal", () => {
    expect(validQuoteTransitions("rejectedWithPrice")).toEqual([]);
  });

  it("rejectedWithoutPrice is terminal", () => {
    expect(validQuoteTransitions("rejectedWithoutPrice")).toEqual([]);
  });
});
