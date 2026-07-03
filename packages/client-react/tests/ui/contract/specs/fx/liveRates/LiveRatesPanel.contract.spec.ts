import { LiveRatesPanel } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

import { type CurrencyPair, KNOWN_CURRENCY_PAIRS } from "@rtc/domain";

const pairs: readonly CurrencyPair[] = KNOWN_CURRENCY_PAIRS;
const _eurusd = pairs.find((p) => {
  return p.symbol === "EURUSD";
});
if (!_eurusd) throw new Error("EURUSD not found in KNOWN_CURRENCY_PAIRS");
const eurusd: CurrencyPair = _eurusd;
const _usdjpy = pairs.find((p) => {
  return p.symbol === "USDJPY";
});
if (!_usdjpy) throw new Error("USDJPY not found in KNOWN_CURRENCY_PAIRS");
const usdjpy: CurrencyPair = _usdjpy;
const _gbpjpy = pairs.find((p) => {
  return p.symbol === "GBPJPY";
});
if (!_gbpjpy) throw new Error("GBPJPY not found in KNOWN_CURRENCY_PAIRS");
const gbpjpy: CurrencyPair = _gbpjpy;

describe("LiveRatesPanel", () => {
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
    const panel = mount(LiveRatesPanel, {
      hooks: { useCurrencyPairs: subset },
    });
    expect(panel.tileCount()).toBe(3);
    await panel.chooseFilter("JPY");
    // Only pairs whose symbol contains "JPY" remain.
    expect(panel.tileSymbols().sort()).toEqual(["GBPJPY", "USDJPY"]);
  });

  it("returns to all tiles when the All filter is reselected", async () => {
    const subset: readonly CurrencyPair[] = [eurusd, usdjpy, gbpjpy];
    const panel = mount(LiveRatesPanel, {
      hooks: { useCurrencyPairs: subset },
    });
    await panel.chooseFilter("JPY");
    expect(panel.tileCount()).toBe(2);
    await panel.chooseFilter("All");
    expect(panel.tileCount()).toBe(3);
  });

  it("appends a tile when a new pair streams in", () => {
    const panel = mount(LiveRatesPanel, {
      hooks: { useCurrencyPairs: [eurusd] },
    });
    expect(panel.tileCount()).toBe(1);
    panel.emit({ useCurrencyPairs: [eurusd, usdjpy] });
    expect(panel.tileCount()).toBe(2);
    expect(panel.hasTile("USDJPY")).toBe(true);
  });

  it("defaults to chart view and renders sparklines", () => {
    const panel = mount(LiveRatesPanel, {
      hooks: { useCurrencyPairs: [eurusd] },
    });
    expect(panel.hasAnyChart()).toBe(true);
  });

  it("reflects the seeded view mode on mount", () => {
    const panel = mount(LiveRatesPanel, {
      hooks: { useCurrencyPairs: [eurusd] },
      viewMode: "price",
    });
    // Seeded "price" → charts suppressed. The CHARTS chip that drives this
    // seam now lives in LiveRatesHead (Task 11) — see
    // LiveRatesHead.contract.spec.ts for the toggle-through-the-chip contract.
    expect(panel.hasAnyChart()).toBe(false);
  });
});
