import { Watchlist } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityInstrument, EquityQuote } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
];

function quote(symbol: string, changePct: number): EquityQuote {
  return { symbol, bid: 99, ask: 101, last: 100, changePct, timestamp: 0 };
}

const QUOTES = {
  AAPL: quote("AAPL", 5),
  MSFT: quote("MSFT", -3),
};

describe("Watchlist", () => {
  it("renders a row per watchlist instrument", () => {
    const wl = mount(Watchlist, {
      props: { selectedSymbol: null, onSelect: () => {} },
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    expect(wl.rows()).toEqual(["AAPL", "MSFT"]);
  });

  it("maps each symbol's change% to its heat and direction", () => {
    const wl = mount(Watchlist, {
      props: { selectedSymbol: null, onSelect: () => {} },
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    // 5% move → heat 0.5 (10% = full heat), positive → "up".
    expect(wl.heatOf("AAPL")).toBeCloseTo(0.5);
    expect(wl.directionOf("AAPL")).toBe("up");
    expect(wl.directionOf("MSFT")).toBe("down");
  });

  it("reflects the selected symbol as the active row", () => {
    const wl = mount(Watchlist, {
      props: { selectedSymbol: "MSFT", onSelect: () => {} },
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    expect(wl.activeSymbol()).toBe("MSFT");
  });

  it("fires onSelect with the symbol when a row is clicked", async () => {
    const selected: string[] = [];
    const wl = mount(Watchlist, {
      props: {
        selectedSymbol: null,
        onSelect: (symbol: string) => {
          selected.push(symbol);
        },
      },
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    await wl.select("AAPL");

    expect(selected).toEqual(["AAPL"]);
  });

  it("shows an empty-state placeholder when there are no instruments", () => {
    const wl = mount(Watchlist, {
      props: { selectedSymbol: null, onSelect: () => {} },
    });

    expect(wl.rows()).toEqual([]);
    expect(wl.isEmpty()).toBe(true);
  });

  it("renders a flat, neutral row for an instrument with no quote yet", () => {
    const wl = mount(Watchlist, {
      props: { selectedSymbol: null, onSelect: () => {} },
      equities: { watchlist: INSTRUMENTS },
    });

    // No quote → zero heat, defaulted "up" direction (changePct falls back to 0).
    expect(wl.rows()).toEqual(["AAPL", "MSFT"]);
    expect(wl.heatOf("AAPL")).toBe(0);
    expect(wl.directionOf("AAPL")).toBe("up");
  });
});
