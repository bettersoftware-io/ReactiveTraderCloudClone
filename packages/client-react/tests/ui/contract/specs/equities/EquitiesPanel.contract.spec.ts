import { EquitiesPanel } from "@ui-contract/components";
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

const QUOTES = { AAPL: quote("AAPL", 2), MSFT: quote("MSFT", -1) };

describe("EquitiesPanel", () => {
  it("shows a select-an-instrument placeholder when the watchlist is empty", () => {
    const panel = mount(EquitiesPanel, {});

    expect(panel.placeholder()).toMatch(/select an instrument/i);
    expect(panel.hasOrderTicket()).toBe(false);
  });

  it("defaults the selection to the first instrument and composes its sub-panels", () => {
    const panel = mount(EquitiesPanel, {
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    expect(panel.placeholder()).toBeNull();
    expect(panel.activeTab()).toBe("AAPL");
    expect(panel.chartHeading()).toMatch(/AAPL — price chart/i);
    expect(panel.hasOrderTicket()).toBe(true);
  });

  it("re-points the active symbol when a watchlist row is selected", async () => {
    const panel = mount(EquitiesPanel, {
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    await panel.selectFromWatchlist("MSFT");

    expect(panel.activeTab()).toBe("MSFT");
    expect(panel.chartHeading()).toMatch(/MSFT — price chart/i);
  });

  it("toggles the blotter pane between orders and positions", async () => {
    const panel = mount(EquitiesPanel, {
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    expect(panel.showsOrders()).toBe(true);

    await panel.showPositions();
    expect(panel.showsPositions()).toBe(true);

    await panel.showOrders();
    expect(panel.showsOrders()).toBe(true);
  });
});

function quote(symbol: string, changePct: number): EquityQuote {
  return { symbol, bid: 99, ask: 101, last: 100, changePct, timestamp: 0 };
}
