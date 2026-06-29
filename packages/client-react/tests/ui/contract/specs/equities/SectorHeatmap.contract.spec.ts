import { SectorHeatmap } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityInstrument, EquityQuote } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
  { symbol: "JPM", name: "JPMorgan", exchange: "NYSE" },
];

function quote(symbol: string, changePct: number): EquityQuote {
  return { symbol, bid: 99, ask: 101, last: 100, changePct, timestamp: 0 };
}

const QUOTES = {
  AAPL: quote("AAPL", 8),
  MSFT: quote("MSFT", -2),
  JPM: quote("JPM", 1),
};

describe("SectorHeatmap", () => {
  it("renders a cell per instrument grouped by sector", () => {
    const heatmap = mount(SectorHeatmap, {
      props: { selectedSymbol: null, onSelect: () => {} },
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    expect(heatmap.cells().sort()).toEqual(["AAPL", "JPM", "MSFT"]);
  });

  it("maps each cell's change% to its heat and direction", () => {
    const heatmap = mount(SectorHeatmap, {
      props: { selectedSymbol: null, onSelect: () => {} },
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    // 8% move → heat 0.8, positive → "up"; -2% → "down".
    expect(heatmap.heatOf("AAPL")).toBeCloseTo(0.8);
    expect(heatmap.directionOf("AAPL")).toBe("up");
    expect(heatmap.directionOf("MSFT")).toBe("down");
  });

  it("fires onSelect with the symbol when a cell is clicked", async () => {
    const selected: string[] = [];
    const heatmap = mount(SectorHeatmap, {
      props: {
        selectedSymbol: null,
        onSelect: (symbol: string) => {
          selected.push(symbol);
        },
      },
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    await heatmap.select("JPM");

    expect(selected).toEqual(["JPM"]);
  });

  it("shows an empty-state placeholder when there are no instruments", () => {
    const heatmap = mount(SectorHeatmap, {
      props: { selectedSymbol: null, onSelect: () => {} },
    });

    expect(heatmap.cells()).toEqual([]);
    expect(heatmap.isEmpty()).toBe(true);
  });
});
