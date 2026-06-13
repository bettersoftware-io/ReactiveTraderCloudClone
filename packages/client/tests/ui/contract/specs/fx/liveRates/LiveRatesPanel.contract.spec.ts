import { describe, it, expect, beforeEach } from "vitest";
import { KNOWN_CURRENCY_PAIRS, type CurrencyPair } from "@rtc/domain";
import { mount } from "@ui-contract/mount";
import { LiveRatesPanel } from "@ui-contract/components";

const pairs = KNOWN_CURRENCY_PAIRS;
const eurusd = pairs.find((p) => p.symbol === "EURUSD")!;
const usdjpy = pairs.find((p) => p.symbol === "USDJPY")!;
const gbpjpy = pairs.find((p) => p.symbol === "GBPJPY")!;

const STORAGE_KEY = "rtc-view-mode";

describe("LiveRatesPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows a loading placeholder until currency pairs arrive", () => {
    const panel = mount(LiveRatesPanel, { hooks: { useCurrencyPairs: [] } });
    expect(panel.loadingMessage()).toMatch(/loading currency pairs/i);
    expect(panel.tileCount()).toBe(0);
  });

  it("renders one tile per currency pair", () => {
    const panel = mount(LiveRatesPanel, { hooks: { useCurrencyPairs: pairs } });
    expect(panel.tileCount()).toBe(pairs.length);
    expect(panel.hasTile("EURUSD")).toBe(true);
    expect(panel.hasTile("USDJPY")).toBe(true);
  });

  it("filters tiles to the selected currency category", async () => {
    const subset: readonly CurrencyPair[] = [eurusd, usdjpy, gbpjpy];
    const panel = mount(LiveRatesPanel, { hooks: { useCurrencyPairs: subset } });
    expect(panel.tileCount()).toBe(3);
    await panel.chooseFilter("JPY");
    // Only pairs whose symbol contains "JPY" remain.
    expect(panel.tileSymbols().sort()).toEqual(["GBPJPY", "USDJPY"]);
  });

  it("returns to all tiles when the All filter is reselected", async () => {
    const subset: readonly CurrencyPair[] = [eurusd, usdjpy, gbpjpy];
    const panel = mount(LiveRatesPanel, { hooks: { useCurrencyPairs: subset } });
    await panel.chooseFilter("JPY");
    expect(panel.tileCount()).toBe(2);
    await panel.chooseFilter("All");
    expect(panel.tileCount()).toBe(3);
  });

  it("appends a tile when a new pair streams in", () => {
    const panel = mount(LiveRatesPanel, { hooks: { useCurrencyPairs: [eurusd] } });
    expect(panel.tileCount()).toBe(1);
    panel.emit({ useCurrencyPairs: [eurusd, usdjpy] });
    expect(panel.tileCount()).toBe(2);
    expect(panel.hasTile("USDJPY")).toBe(true);
  });

  it("defaults to chart view and renders sparklines", () => {
    const panel = mount(LiveRatesPanel, { hooks: { useCurrencyPairs: [eurusd] } });
    expect(panel.hasAnyChart()).toBe(true);
    expect(panel.viewToggleLabel()).toMatch(/price/i);
  });

  it("toggles to price view, hiding the charts, and persists the choice", async () => {
    const panel = mount(LiveRatesPanel, { hooks: { useCurrencyPairs: [eurusd] } });
    expect(panel.hasAnyChart()).toBe(true);
    await panel.toggleView();
    expect(panel.hasAnyChart()).toBe(false);
    expect(panel.viewToggleLabel()).toMatch(/chart/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("price");
  });

  it("restores the persisted view mode on mount", () => {
    localStorage.setItem(STORAGE_KEY, "price");
    const panel = mount(LiveRatesPanel, { hooks: { useCurrencyPairs: [eurusd] } });
    // Persisted "price" → charts suppressed, toggle offers "chart".
    expect(panel.hasAnyChart()).toBe(false);
    expect(panel.viewToggleLabel()).toMatch(/chart/i);
  });
});
