import { describe, expect, it } from "vitest";

import { matchesCurrencyFilter } from "./currencyFilter.js";

describe("matchesCurrencyFilter", () => {
  it("All matches everything", () => {
    expect(matchesCurrencyFilter("EURUSD", "All")).toBe(true);
    expect(matchesCurrencyFilter("NZDUSD", "All")).toBe(true);
  });

  it("EUR matches pairs containing EUR", () => {
    expect(matchesCurrencyFilter("EURUSD", "EUR")).toBe(true);
    expect(matchesCurrencyFilter("EURJPY", "EUR")).toBe(true);
    expect(matchesCurrencyFilter("EURCAD", "EUR")).toBe(true);
    expect(matchesCurrencyFilter("EURAUD", "EUR")).toBe(true);
    expect(matchesCurrencyFilter("GBPUSD", "EUR")).toBe(false);
  });

  it("USD matches pairs containing USD", () => {
    expect(matchesCurrencyFilter("EURUSD", "USD")).toBe(true);
    expect(matchesCurrencyFilter("USDJPY", "USD")).toBe(true);
    expect(matchesCurrencyFilter("GBPUSD", "USD")).toBe(true);
    expect(matchesCurrencyFilter("AUDUSD", "USD")).toBe(true);
    expect(matchesCurrencyFilter("NZDUSD", "USD")).toBe(true);
    expect(matchesCurrencyFilter("EURJPY", "USD")).toBe(false);
  });

  it("GBP matches GBPUSD and GBPJPY only", () => {
    expect(matchesCurrencyFilter("GBPUSD", "GBP")).toBe(true);
    expect(matchesCurrencyFilter("GBPJPY", "GBP")).toBe(true);
    expect(matchesCurrencyFilter("EURUSD", "GBP")).toBe(false);
  });

  it("NZD matches NZDUSD only", () => {
    expect(matchesCurrencyFilter("NZDUSD", "NZD")).toBe(true);
    expect(matchesCurrencyFilter("EURUSD", "NZD")).toBe(false);
  });

  it("JPY matches pairs containing JPY", () => {
    expect(matchesCurrencyFilter("USDJPY", "JPY")).toBe(true);
    expect(matchesCurrencyFilter("GBPJPY", "JPY")).toBe(true);
    expect(matchesCurrencyFilter("EURJPY", "JPY")).toBe(true);
    expect(matchesCurrencyFilter("EURUSD", "JPY")).toBe(false);
  });

  it("CAD matches EURCAD only", () => {
    expect(matchesCurrencyFilter("EURCAD", "CAD")).toBe(true);
    expect(matchesCurrencyFilter("EURUSD", "CAD")).toBe(false);
  });

  it("AUD matches AUDUSD and EURAUD", () => {
    expect(matchesCurrencyFilter("AUDUSD", "AUD")).toBe(true);
    expect(matchesCurrencyFilter("EURAUD", "AUD")).toBe(true);
    expect(matchesCurrencyFilter("EURUSD", "AUD")).toBe(false);
  });
});
