import { PairPnlBars } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { CurrencyPairPosition } from "@rtc/domain";

afterEach(() => {
  return cleanupMounted();
});

function pos(symbol: string, basePnl: number): CurrencyPairPosition {
  return { symbol, basePnl, baseTradedAmount: 0, counterTradedAmount: 0 };
}

describe("PairPnlBars", () => {
  it("shows each pair's P&L with whole-number scaled notation", () => {
    const bars = mount(PairPnlBars, {
      props: { positions: [pos("EURUSD", 1234), pos("USDJPY", 12_345_678)] },
    });
    expect(bars.labelFor("EURUSD")).toBe("1k");
    expect(bars.labelFor("USDJPY")).toBe("12m");
  });

  it("switches to a precise 2dp comma format while hovered", () => {
    const bars = mount(PairPnlBars, {
      props: { positions: [pos("EURUSD", 1234)] },
    });
    expect(bars.labelFor("EURUSD")).toBe("1k");
    bars.hover("EURUSD");
    expect(bars.labelFor("EURUSD")).toBe("1,234.00");
    bars.unhover("EURUSD");
    expect(bars.labelFor("EURUSD")).toBe("1k");
  });

  it("renders sub-thousand and negative values without a scale suffix change", () => {
    const bars = mount(PairPnlBars, {
      props: { positions: [pos("GBPUSD", -1656.82), pos("EURJPY", 564.97)] },
    });
    expect(bars.labelFor("GBPUSD")).toBe("-2k");
    expect(bars.labelFor("EURJPY")).toBe("565");
    bars.hover("GBPUSD");
    expect(bars.labelFor("GBPUSD")).toBe("-1,656.82");
  });
});
