import { FxBlotter } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

const t1 = trade(4001, { currencyPair: "EURUSD" });
const t2 = trade(4002, {
  currencyPair: "USDJPY",
  notional: 5_000_000,
  status: TradeStatus.Rejected,
});

describe("FxBlotter", () => {
  it("renders one row per trade", () => {
    expect(
      mount(FxBlotter, { hooks: { useTrades: [t1, t2] } }).tradeRowCount(),
    ).toBe(2);
  });

  it("shows each trade's key cells, including rejected trades", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
    expect(blotter.hasCell("EURUSD")).toBe(true);
    expect(blotter.hasCell("USDJPY")).toBe(true);
    expect(blotter.hasCell("5,000,000")).toBe(true);
    expect(blotter.hasCell("Rejected")).toBe(true);
  });

  it("exposes the trade columns", () => {
    const headers = mount(FxBlotter, {
      hooks: { useTrades: [t1] },
    }).columnHeaders();
    expect(
      headers.some((h) => {
        return h.includes("Trade ID");
      }),
    ).toBe(true);
    expect(
      headers.some((h) => {
        return h.includes("Status");
      }),
    ).toBe(true);
  });

  // Fixed header: the column headers live in their own table ABOVE the
  // scrolling rows region, so they stay put while rows scroll and the
  // filter popover anchors outside the scroll clip (position:sticky broke
  // its hit-testing in real Chromium — see CreditBlotter.module.css).
  it("splits the column headers out of the scrolling rows region", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
    expect(blotter.headerIsSplitFromRows()).toBe(true);
  });

  it("shows an empty-state message when there are no trades", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [] } });
    expect(blotter.tradeRowCount()).toBe(0);
    expect(blotter.emptyMessage()).toMatch(/no trades yet/i);
  });

  // Twin of the above: trades EXIST but a column filter excludes all of
  // them — a distinct empty-state message from the "no trades at all" arm.
  it("shows a filtered empty-state message when trades exist but none match the active filters", async () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
    await blotter.openColumnFilter("Notional");
    // t1 = 1,000,000 ; t2 = 5,000,000 — both fall below this threshold.
    await blotter.applyNumberFilter("gt", "999999999");
    expect(blotter.tradeRowCount()).toBe(0);
    expect(blotter.emptyMessage()).toMatch(
      /no trades match the current filters/i,
    );
  });

  it("appends a newly streamed trade to the same blotter", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
    expect(blotter.tradeRowCount()).toBe(2);
    blotter.emit({
      useTrades: [t1, t2, trade(4003, { currencyPair: "GBPUSD" })],
    });
    expect(blotter.tradeRowCount()).toBe(3);
    expect(blotter.hasCell("GBPUSD")).toBe(true);
  });

  describe("sorting", () => {
    const a = trade(4001, { currencyPair: "EURUSD", notional: 3_000_000 });
    const b = trade(4002, { currencyPair: "USDJPY", notional: 1_000_000 });
    const c = trade(4003, { currencyPair: "GBPUSD", notional: 2_000_000 });

    it("sorts a numeric column ascending on first header click", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [a, b, c] } });
      await blotter.clickColumnHeader("Notional");
      expect(blotter.sortIndicatorFor("Notional")).toBe("asc");
      expect(blotter.columnValues("Notional")).toEqual([
        "1,000,000",
        "2,000,000",
        "3,000,000",
      ]);
    });

    it("toggles a numeric column to descending on the second click", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [a, b, c] } });
      await blotter.clickColumnHeader("Notional");
      await blotter.clickColumnHeader("Notional");
      expect(blotter.sortIndicatorFor("Notional")).toBe("desc");
      expect(blotter.columnValues("Notional")).toEqual([
        "3,000,000",
        "2,000,000",
        "1,000,000",
      ]);
    });

    it("clears the sort on the third click", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [a, b, c] } });
      await blotter.clickColumnHeader("Notional");
      await blotter.clickColumnHeader("Notional");
      await blotter.clickColumnHeader("Notional");
      expect(blotter.sortIndicatorFor("Notional")).toBe(null);
      // Back to insertion order.
      expect(blotter.columnValues("Notional")).toEqual([
        "3,000,000",
        "1,000,000",
        "2,000,000",
      ]);
    });

    it("sorts a text column ascending on first click", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [a, b, c] } });
      await blotter.clickColumnHeader("CCYCCY");
      expect(blotter.sortIndicatorFor("CCYCCY")).toBe("asc");
      expect(blotter.columnValues("CCYCCY")).toEqual([
        "EURUSD",
        "GBPUSD",
        "USDJPY",
      ]);
    });
  });

  // Quick filter is exercised via FxBlotterHead.contract.spec.ts (the input
  // moved to the head slot in Task 12) — FxBlotter alone only reads
  // `quickFilter` from FxViewContext, it doesn't render the input.

  describe("column filter", () => {
    it("filters rows via a set filter and shows the active-filter summary", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
      await blotter.openColumnFilter("CCYCCY");
      // Set filter starts all-selected; unselect EURUSD so only USDJPY remains.
      await blotter.toggleSetOption("EURUSD");
      await blotter.applyOpenFilter();
      expect(blotter.tradeRowCount()).toBe(1);
      expect(blotter.hasCell("USDJPY")).toBe(true);
      expect(blotter.activeFilterSummary()).toMatch(/CCYCCY/);
    });

    it("filters rows via a number filter (greater-than)", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
      await blotter.openColumnFilter("Notional");
      await blotter.applyNumberFilter("gt", "2000000");
      // t1 = 1,000,000 ; t2 = 5,000,000 → only t2 remains.
      expect(blotter.tradeRowCount()).toBe(1);
      expect(blotter.hasCell("5,000,000")).toBe(true);
    });

    it("removes a column filter when it is reset", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
      await blotter.openColumnFilter("Notional");
      await blotter.applyNumberFilter("gt", "2000000");
      expect(blotter.tradeRowCount()).toBe(1);
      expect(blotter.activeFilterSummary()).toMatch(/Notional/);
      // Re-open and reset → filter is removed, both rows return.
      await blotter.openColumnFilter("Notional");
      await blotter.resetOpenFilter();
      expect(blotter.tradeRowCount()).toBe(2);
      expect(blotter.activeFilterSummary()).toBeNull();
    });
  });

  // CSV export is exercised via FxBlotterHead.contract.spec.ts (the CSV chip
  // moved to the head slot in Task 12) — FxBlotter alone only registers the
  // export handler via setExportCsvHandler, it doesn't render a trigger.
});

function trade(tradeId: number, over: Partial<Trade> = {}): Trade {
  return {
    tradeId,
    tradeName: `Trade ${tradeId}`,
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.09221,
    status: TradeStatus.Done,
    tradeDate: "2026-06-06",
    valueDate: "2026-06-08",
    ...over,
  };
}
