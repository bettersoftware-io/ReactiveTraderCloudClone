import { FxBlotterWorkspace } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { ActivityEntry } from "@rtc/client-core";
import { Direction, type Trade, TradeStatus } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("Activity feed (FX Blotter's Activity tab)", () => {
  it("no longer shows the old 'coming online' placeholder", async () => {
    const page = mount(FxBlotterWorkspace, { hooks: { useActivity: [] } });
    await page.selectActivityTab();
    expect(page.hasActivityPlaceholder()).toBe(false);
  });

  it("shows the exact empty-state message when there is no activity yet", async () => {
    const page = mount(FxBlotterWorkspace, { hooks: { useActivity: [] } });
    await page.selectActivityTab();
    expect(page.activityRowCount()).toBe(0);
    expect(page.activityFeedText()).toBe(
      "No activity yet — execute a trade to populate the feed",
    );
  });

  it("renders a row with the time, a TRADE badge, and a formatted description", async () => {
    const entry = activityEntry(1043, "09:30:15", {
      direction: Direction.Sell,
      currencyPair: "EURUSD",
      notional: 1_000_000,
      spotRate: 1.09205,
    });

    const page = mount(FxBlotterWorkspace, {
      hooks: { useActivity: [entry] },
    });
    await page.selectActivityTab();

    expect(page.activityRowCount()).toBe(1);
    const [text] = page.activityRowTexts();
    expect(text).toContain("09:30:15");
    expect(text).toContain("TRADE");
    expect(text).toContain("Sell EURUSD 1,000,000 @ 1.09205");
  });

  it("renders a Buy description alongside a Sell one", async () => {
    const buy = activityEntry(1045, "09:32:10", {
      direction: Direction.Buy,
      currencyPair: "USDJPY",
      notional: 2_000_000,
      spotRate: 151.203,
    });

    const page = mount(FxBlotterWorkspace, {
      hooks: { useActivity: [buy] },
    });
    await page.selectActivityTab();

    expect(page.activityRowTexts()[0]).toContain(
      "Buy USDJPY 2,000,000 @ 151.203",
    );
  });

  it("renders a REJECT badge for a rejected live trade", async () => {
    const entry = activityEntry(1044, "09:31:02", {
      status: TradeStatus.Rejected,
      currencyPair: "GBPJPY",
    });

    const page = mount(FxBlotterWorkspace, {
      hooks: { useActivity: [entry] },
    });
    await page.selectActivityTab();

    expect(page.activityRowTexts()[0]).toContain("REJECT");
  });

  it("shows a newly-executed trade at the top, newest first", async () => {
    const first = activityEntry(1043, "09:30:15", { currencyPair: "EURUSD" });
    const page = mount(FxBlotterWorkspace, {
      hooks: { useActivity: [first] },
    });
    await page.selectActivityTab();
    expect(page.activityRowCount()).toBe(1);

    // A second trade executes — the presenter prepends it, so the feed's
    // hook value arrives newest-first: [second, first].
    const second = activityEntry(1044, "09:31:40", { currencyPair: "GBPUSD" });
    page.emit({ useActivity: [second, first] });

    expect(page.activityRowCount()).toBe(2);
    const [row0, row1] = page.activityRowTexts();
    expect(row0).toContain("GBPUSD");
    expect(row0).toContain("09:31:40");
    expect(row1).toContain("EURUSD");
    expect(row1).toContain("09:30:15");
  });
});

function activityEntry(
  tradeId: number,
  time: string,
  over: Partial<Trade> = {},
): ActivityEntry {
  return { trade: trade(tradeId, over), time };
}

function trade(tradeId: number, over: Partial<Trade> = {}): Trade {
  return {
    tradeId,
    tradeName: "You",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Sell,
    spotRate: 1.09205,
    status: TradeStatus.Done,
    tradeDate: "2026-07-06",
    valueDate: "2026-07-08",
    ...over,
  };
}
