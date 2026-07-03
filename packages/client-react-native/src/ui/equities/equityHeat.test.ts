import { describe, expect, it } from "vitest";

import type { EquityInstrument } from "@rtc/domain";

import {
  DEFAULT_SECTOR,
  groupBySector,
  heat,
  SECTOR_MAP,
} from "#/ui/equities/equityHeat";

describe("heat", () => {
  it("is 0 for no change and 0.5 for a 5% move", () => {
    expect(heat(0)).toBe(0);
    expect(heat(5)).toBe(0.5);
    expect(heat(-5)).toBe(0.5);
  });
  it("clamps to 1 at or beyond a 10% move", () => {
    expect(heat(10)).toBe(1);
    expect(heat(-12.5)).toBe(1);
  });
});

describe("groupBySector", () => {
  function inst(symbol: string): EquityInstrument {
    return {
      symbol,
      name: symbol,
      exchange: "NASDAQ",
    };
  }

  it("groups by SECTOR_MAP preserving first-seen order and falls back to DEFAULT_SECTOR", () => {
    const groups = groupBySector([
      inst("AAPL"),
      inst("JPM"),
      inst("ZZZ"),
      inst("MSFT"),
    ]);
    expect(
      groups.map((g) => {
        return g.sector;
      }),
    ).toEqual(["Technology", "Finance", DEFAULT_SECTOR]);
    expect(
      groups[0].instruments.map((i) => {
        return i.symbol;
      }),
    ).toEqual(["AAPL", "MSFT"]);
    expect(
      groups[2].instruments.map((i) => {
        return i.symbol;
      }),
    ).toEqual(["ZZZ"]);
    expect(SECTOR_MAP.AAPL).toBe("Technology");
  });
});
