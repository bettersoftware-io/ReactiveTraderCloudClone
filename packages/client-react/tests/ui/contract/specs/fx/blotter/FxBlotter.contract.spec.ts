import { FxBlotter } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

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

  it("shows an empty-state message when there are no trades", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [] } });
    expect(blotter.tradeRowCount()).toBe(0);
    expect(blotter.emptyMessage()).toMatch(/no trades yet/i);
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

  describe("quick filter", () => {
    it("filters rows to those matching the typed term", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
      expect(blotter.tradeRowCount()).toBe(2);
      await blotter.typeQuickFilter("usdjpy");
      expect(blotter.tradeRowCount()).toBe(1);
      expect(blotter.hasCell("USDJPY")).toBe(true);
    });

    it("shows the no-match message when nothing matches the quick filter", async () => {
      const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
      await blotter.typeQuickFilter("zzz-nomatch");
      expect(blotter.tradeRowCount()).toBe(0);
      expect(blotter.emptyMessage()).toMatch(/no trades match/i);
    });
  });

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

  describe("CSV export", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("serializes the visible trades when Export CSV is clicked", async () => {
      // jsdom lacks URL.createObjectURL; stub the download plumbing.
      const RealBlob = globalThis.Blob;
      let captured = "";
      class RecordingBlob extends RealBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          captured = (parts ?? [])
            .map((p) => {
              return String(p);
            })
            .join("");
        }
      }
      vi.stubGlobal("Blob", RecordingBlob);
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );

      const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
      await blotter.clickExport();

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      const lines = captured.split("\n");
      expect(lines[0]).toContain("Trade ID");
      expect(lines).toHaveLength(3); // header + 2 trades
    });
  });
});
