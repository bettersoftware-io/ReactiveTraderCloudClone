import { PositionsPanel } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { CurrencyPairPosition, PositionUpdates } from "@rtc/domain";

afterEach(() => {
  return cleanupMounted();
});

describe("PositionsPanel", () => {
  it("shows a loading placeholder until positions data arrives", () => {
    const panel = mount(PositionsPanel, { hooks: { useAnalytics: null } });
    expect(panel.isLoaded()).toBe(false);
    expect(panel.loadingMessage()).toMatch(/loading positions/i);
  });

  it("renders the panel with the Net Exposure label once data arrives", () => {
    const panel = mount(PositionsPanel, { hooks: { useAnalytics: updates() } });
    expect(panel.isLoaded()).toBe(true);
    expect(panel.loadingMessage()).toBeNull();
    expect(panel.sectionLabel()).toBe("Net Exposure");
  });

  it("renders one bubble per non-zero currency, in PROTO book order", () => {
    const panel = mount(PositionsPanel, { hooks: { useAnalytics: updates() } });
    expect(panel.bubbleCurrencies()).toEqual([
      "EUR",
      "USD",
      "JPY",
      "GBP",
      "AUD",
      "NZD",
      "CAD",
    ]);
  });

  it("shows the PROTO net-exposure amount and sign on the EUR and USD bubbles", () => {
    const panel = mount(PositionsPanel, { hooks: { useAnalytics: updates() } });
    expect(panel.bubbleAmountText("EUR")).toBe("+15.2M");
    expect(panel.bubbleSign("EUR")).toBe("pos");
    expect(panel.bubbleAmountText("USD")).toBe("-22.8M");
    expect(panel.bubbleSign("USD")).toBe("neg");
  });

  it("scales bubble diameter with the absolute exposure amount", () => {
    const panel = mount(PositionsPanel, { hooks: { useAnalytics: updates() } });
    // USD nets to -22.8M (larger magnitude); NZD nets to +2.1M (smaller).
    expect(panel.bubbleDiameter("USD")).toBeGreaterThan(
      panel.bubbleDiameter("NZD"),
    );
  });

  it("renders ladder rows in the same order with matching signed amounts", () => {
    const panel = mount(PositionsPanel, { hooks: { useAnalytics: updates() } });
    expect(panel.ladderCurrencies()).toEqual([
      "EUR",
      "USD",
      "JPY",
      "GBP",
      "AUD",
      "NZD",
      "CAD",
    ]);
    expect(panel.ladderAmountText("EUR")).toBe("+15.2M");
    expect(panel.ladderSign("EUR")).toBe("pos");
    expect(panel.ladderAmountText("USD")).toBe("-22.8M");
    expect(panel.ladderSign("USD")).toBe("neg");
  });
});

/**
 * The PROTO-scale demo book (spec §4.4, dc.html L1300), mirrored from
 * AnalyticsSimulator's STATIC_POSITIONS so this spec pins the exact values
 * the real seeded simulator serves: EUR +15.2M, USD -22.8M, JPY +8.4M,
 * GBP -6.1M, AUD +4.7M, NZD +2.1M, CAD -3.2M net exposure.
 */
const PROTO_POSITIONS: readonly CurrencyPairPosition[] = [
  {
    symbol: "EURUSD",
    basePnl: 13_000,
    baseTradedAmount: 6_200_000,
    counterTradedAmount: -6_800_000,
  },
  {
    symbol: "USDJPY",
    basePnl: -4_000,
    baseTradedAmount: -13_400_000,
    counterTradedAmount: 11_300_000,
  },
  {
    symbol: "GBPUSD",
    basePnl: 9_000,
    baseTradedAmount: -4_100_000,
    counterTradedAmount: 5_200_000,
  },
  {
    symbol: "GBPJPY",
    basePnl: -1_200,
    baseTradedAmount: -2_000_000,
    counterTradedAmount: 1_400_000,
  },
  {
    symbol: "EURJPY",
    basePnl: 5_000,
    baseTradedAmount: 4_000_000,
    counterTradedAmount: -4_300_000,
  },
  {
    symbol: "AUDUSD",
    basePnl: 6_000,
    baseTradedAmount: 6_000_000,
    counterTradedAmount: -6_500_000,
  },
  {
    symbol: "NZDUSD",
    basePnl: 800,
    baseTradedAmount: 2_100_000,
    counterTradedAmount: -1_300_000,
  },
  {
    symbol: "EURCAD",
    basePnl: -2_000,
    baseTradedAmount: 3_100_000,
    counterTradedAmount: -3_200_000,
  },
  {
    symbol: "EURAUD",
    basePnl: -600,
    baseTradedAmount: 1_900_000,
    counterTradedAmount: -1_300_000,
  },
];

function updates(over: Partial<PositionUpdates> = {}): PositionUpdates {
  return {
    currentPositions: PROTO_POSITIONS,
    history: [],
    ...over,
  };
}
