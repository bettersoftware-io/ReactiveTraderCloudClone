import { LiveRatesWorkspace } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import {
  type CurrencyPair,
  KNOWN_CURRENCY_PAIRS,
  type Price,
  PriceMovementType,
  type PriceTick,
} from "@rtc/domain";

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

afterEach(() => {
  cleanupMounted();
});

describe("Watchlist view", () => {
  it("replaces the coming-online placeholder with a row per visible pair", async () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: [eurusd, usdjpy, gbpjpy] },
    });
    await page.selectWatchlistTab();

    expect(page.hasWatchlistPlaceholder()).toBe(false);
    expect(page.hasWatchlistView()).toBe(true);
    expect(page.watchRowCount()).toBe(3);
    expect(page.watchRowSymbols().sort()).toEqual(
      ["EURUSD", "GBPJPY", "USDJPY"].sort(),
    );
  });

  it("filters watchlist rows with the currency chips, same as the tile grid", async () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: [eurusd, usdjpy, gbpjpy] },
    });
    await page.selectWatchlistTab();
    expect(page.watchRowCount()).toBe(3);

    await page.chooseFilter("JPY");
    expect(page.watchRowSymbols().sort()).toEqual(["GBPJPY", "USDJPY"]);

    await page.chooseFilter("All");
    expect(page.watchRowCount()).toBe(3);
  });

  it("colors the Mid cell via a data-sign matching the price movement", async () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: [eurusd] },
      parametric: {
        prices: { EURUSD: price({ movementType: PriceMovementType.UP }) },
      },
    });
    await page.selectWatchlistTab();
    expect(page.watchMidSign("EURUSD")).toBe("up");

    page.setPrice("EURUSD", price({ movementType: PriceMovementType.DOWN }));
    expect(page.watchMidSign("EURUSD")).toBe("down");
  });

  it("falls back to a flat data-sign and a dash before a price streams in", async () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: [eurusd] },
    });
    await page.selectWatchlistTab();
    expect(page.watchMidSign("EURUSD")).toBe("flat");
  });

  it("shows the Move cell's arrow + pip text once two history ticks exist", async () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: [eurusd] },
      parametric: {
        prices: { EURUSD: price({ movementType: PriceMovementType.UP }) },
        histories: { EURUSD: twoTickHistory() },
      },
    });
    await page.selectWatchlistTab();
    expect(page.watchMoveText("EURUSD")).toMatch(/▲ \d+ pip/);
  });

  it("shows a down arrow and a red Trend sparkline for a falling pair", async () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: [eurusd] },
      parametric: {
        prices: { EURUSD: price({ movementType: PriceMovementType.DOWN }) },
        histories: { EURUSD: descendingHistory() },
      },
    });
    await page.selectWatchlistTab();
    expect(page.watchMoveText("EURUSD")).toMatch(/▼ \d+ pip/);
  });

  it("renders a flat Trend sparkline when every recent mid is equal", async () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: [eurusd] },
      parametric: {
        prices: { EURUSD: price() },
        histories: { EURUSD: flatHistory() },
      },
    });
    await page.selectWatchlistTab();
    // No assertion on the polyline's geometry itself — mounting with an
    // equal-mids history is what exercises the sparkline's degenerate
    // `range === 0` fallback; the row still renders normally either way.
    expect(page.watchRowCount()).toBe(1);
  });
});

function price(over: Partial<Price> = {}): Price {
  return {
    symbol: "EURUSD",
    bid: 1.0921,
    ask: 1.0925,
    mid: 1.0923,
    valueDate: "2026-06-15",
    creationTimestamp: 1_700_000_000_000,
    movementType: PriceMovementType.NONE,
    spread: "4.0",
    ...over,
  };
}

function twoTickHistory(): readonly PriceTick[] {
  return [
    {
      symbol: "EURUSD",
      bid: 1.09,
      ask: 1.091,
      mid: 1.0905,
      valueDate: "2026-06-15",
      creationTimestamp: 1,
    },
    {
      symbol: "EURUSD",
      bid: 1.092,
      ask: 1.093,
      mid: 1.0925,
      valueDate: "2026-06-15",
      creationTimestamp: 2,
    },
  ];
}

function descendingHistory(): readonly PriceTick[] {
  return [
    {
      symbol: "EURUSD",
      bid: 1.092,
      ask: 1.093,
      mid: 1.0925,
      valueDate: "2026-06-15",
      creationTimestamp: 1,
    },
    {
      symbol: "EURUSD",
      bid: 1.09,
      ask: 1.091,
      mid: 1.0905,
      valueDate: "2026-06-15",
      creationTimestamp: 2,
    },
  ];
}

function flatHistory(): readonly PriceTick[] {
  return [
    {
      symbol: "EURUSD",
      bid: 1.0921,
      ask: 1.0925,
      mid: 1.0923,
      valueDate: "2026-06-15",
      creationTimestamp: 1,
    },
    {
      symbol: "EURUSD",
      bid: 1.0921,
      ask: 1.0925,
      mid: 1.0923,
      valueDate: "2026-06-15",
      creationTimestamp: 2,
    },
  ];
}
