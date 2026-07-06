import { FxBlotterWorkspace } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const t1 = trade(4001, { currencyPair: "EURUSD" });
const t2 = trade(4002, { currencyPair: "USDJPY" });

describe("FxBlotterHead + FxBlotter", () => {
  it("defaults to the FX Blotter tab with the trade table showing", () => {
    const page = mount(FxBlotterWorkspace, {
      hooks: { useTrades: [t1, t2] },
    });
    expect(page.isTradesTabActive()).toBe(true);
    expect(page.isActivityTabActive()).toBe(false);
    expect(page.hasActivityPlaceholder()).toBe(false);
  });

  it("shows the live trade count in the head", () => {
    const page = mount(FxBlotterWorkspace, {
      hooks: { useTrades: [t1, t2] },
    });
    expect(page.tradeCountText()).toBe("2 trades");
  });

  it("narrows the body rows when typing in the head's quick filter", async () => {
    const page = mount(FxBlotterWorkspace, {
      hooks: { useTrades: [t1, t2] },
    });
    expect(page.tradeRowCount()).toBe(2);
    await page.typeQuickFilter("usdjpy");
    expect(page.tradeRowCount()).toBe(1);
  });

  it("swaps the panel body to the activity feed when Activity is selected", async () => {
    const page = mount(FxBlotterWorkspace, {
      hooks: { useTrades: [t1, t2] },
    });
    await page.selectActivityTab();
    expect(page.isActivityTabActive()).toBe(true);
    expect(page.isTradesTabActive()).toBe(false);
    // The old "COMING ONLINE" placeholder must never reappear.
    expect(page.hasActivityPlaceholder()).toBe(false);
    expect(page.activityFeedText()).toMatch(/no activity yet/i);
  });

  it("hides the count, filter and CSV chip while the Activity tab is showing", async () => {
    const page = mount(FxBlotterWorkspace, {
      hooks: { useTrades: [t1, t2] },
    });
    await page.selectActivityTab();
    expect(page.hasTradeCount()).toBe(false);
  });

  it("returns to the trade table when FX Blotter is reselected", async () => {
    const page = mount(FxBlotterWorkspace, {
      hooks: { useTrades: [t1, t2] },
    });
    await page.selectActivityTab();
    await page.selectTradesTab();
    expect(page.hasActivityPlaceholder()).toBe(false);
    expect(page.isTradesTabActive()).toBe(true);
    expect(page.tradeRowCount()).toBe(2);
  });

  describe("CSV export", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("exports the currently filtered/sorted rows when the head's CSV chip is clicked", async () => {
      // jsdom lacks URL.createObjectURL; stub the download plumbing (mirrors
      // FxBlotter.contract.spec.ts).
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

      const page = mount(FxBlotterWorkspace, {
        hooks: { useTrades: [t1, t2] },
      });
      await page.clickExport();

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      const lines = captured.split("\n");
      expect(lines[0]).toContain("Trade ID");
      expect(lines).toHaveLength(3); // header + 2 trades
    });
  });
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
