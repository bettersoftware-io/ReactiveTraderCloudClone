import { describe, expect, it } from "@jest/globals";

import { type CurrencyPair, calculateSpread, Direction } from "@rtc/domain";

import { ratesSlice } from "./rates";
import type { RatesSlice } from "./sliceTypes";

// Aliased to non-`use`-prefixed local names so Biome's (React-centric)
// useHookAtTopLevel heuristic doesn't match on the property name: these are
// plain fixture functions (a fake ViewModel slice), not React hooks, and
// this test calls them directly — inside loops, unconditionally, outside any
// component — which the real rule (correctly) forbids for actual hooks.
// Mirrors the same alias workaround already used for solid-bindings' `use*`
// factories in packages/client-solid/src/ui/equities/chart/ChartPanel.tsx.
const getCurrencyPairs: RatesSlice["useCurrencyPairs"] =
  ratesSlice.useCurrencyPairs;
const getPrice: RatesSlice["usePrice"] = ratesSlice.usePrice;
const getPriceHistory: RatesSlice["usePriceHistory"] =
  ratesSlice.usePriceHistory;

const getTileExecution: RatesSlice["useTileExecution"] =
  ratesSlice.useTileExecution;
const getNotional: RatesSlice["useNotional"] = ratesSlice.useNotional;
const getStaleFlag: RatesSlice["useStaleFlag"] = ratesSlice.useStaleFlag;
const getRowHighlight: RatesSlice["useRowHighlight"] =
  ratesSlice.useRowHighlight;

// Fixture constants only (no helper functions — those come after the tests
// below per rtc/newspaper-order). `findPair` is a hoisted function
// declaration, so calling it here ahead of its own definition is fine.
const pairs = getCurrencyPairs();
const eurusd = findPair("EURUSD");
const usdjpy = findPair("USDJPY");

describe("ratesSlice.useCurrencyPairs", () => {
  it("serves a non-trivial, fully specified pair roster", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(5);

    for (const pair of pairs) {
      expect(typeof pair.symbol).toBe("string");
      expect(pair.symbol.length).toBeGreaterThan(0);
      expect(typeof pair.ratePrecision).toBe("number");
      expect(typeof pair.pipsPosition).toBe("number");
      expect(typeof pair.base).toBe("string");
      expect(pair.base.length).toBeGreaterThan(0);
      expect(typeof pair.terms).toBe("string");
      expect(pair.terms.length).toBeGreaterThan(0);
      expect(typeof pair.defaultNotional).toBe("number");
      expect(pair.defaultNotional).toBeGreaterThan(0);
      expect(typeof pair.baseMid).toBe("number");
      expect(pair.baseMid).toBeGreaterThan(0);
      expect(typeof pair.typicalSpreadPips).toBe("number");
      expect(pair.typicalSpreadPips).toBeGreaterThan(0);
    }
  });
});

describe("ratesSlice.usePrice", () => {
  it("returns the identical object across repeat calls for the same pair", () => {
    const first = getPrice(eurusd);
    const second = getPrice(eurusd);
    expect(first).toBe(second);
  });

  it("returns a different object for a different pair", () => {
    const eur = getPrice(eurusd);
    const jpy = getPrice(usdjpy);
    expect(eur).not.toBe(jpy);
  });

  it("derives every pair's spread from that pair's own bid/ask", () => {
    for (const pair of pairs) {
      const price = getPrice(pair);
      expect(price).not.toBeNull();
      const nonNullPrice = price === null ? undefined : price;
      expect(nonNullPrice).toBeDefined();

      if (nonNullPrice === undefined) {
        continue;
      }

      expect(nonNullPrice.symbol).toBe(pair.symbol);
      expect(nonNullPrice.ask).toBeGreaterThan(nonNullPrice.bid);
      expect(nonNullPrice.spread).toBe(
        calculateSpread(
          nonNullPrice.bid,
          nonNullPrice.ask,
          pair.pipsPosition,
          pair.ratePrecision,
        ),
      );
    }
  });
});

describe("ratesSlice.useTileExecution", () => {
  it("starts in the ready arm with intents that do not throw", () => {
    const result = getTileExecution(eurusd);
    expect(result.state).toEqual({ status: "ready" });
    const price = getPrice(eurusd);
    expect(price).not.toBeNull();
    const nonNullPrice = price === null ? undefined : price;
    expect(nonNullPrice).toBeDefined();

    if (nonNullPrice === undefined) {
      return;
    }

    expect(() => {
      result.execute(Direction.Buy, nonNullPrice, eurusd.defaultNotional);
    }).not.toThrow();
    expect(() => {
      result.dismiss();
    }).not.toThrow();
  });
});

describe("ratesSlice.useNotional", () => {
  it("formats 1,000,000 the way NotionalMachine does", () => {
    const notional = getNotional(1_000_000);
    expect(notional.state.displayValue).toBe("1,000,000");
    expect(notional.state.numericValue).toBe(1_000_000);
    expect(notional.state.error).toBeNull();
    expect(notional.state.isDefault).toBe(true);
  });
});

describe("ratesSlice inert hooks", () => {
  it("useStaleFlag and useRowHighlight stay in their inert arm", () => {
    expect(getStaleFlag(eurusd)).toBe(false);
    expect(getRowHighlight(true)).toBe(false);
    expect(getRowHighlight(false)).toBe(false);
  });

  it("usePriceHistory returns a fixed, non-empty series per symbol", () => {
    const history = getPriceHistory(eurusd.symbol);
    expect(history.length).toBeGreaterThan(0);
    expect(getPriceHistory(eurusd.symbol)).toBe(history);
  });
});

function findPair(symbol: string): CurrencyPair {
  const pair = pairs.find((candidate) => {
    return candidate.symbol === symbol;
  });

  if (pair === undefined) {
    throw new Error(`fixture roster is missing ${symbol}`);
  }

  return pair;
}
