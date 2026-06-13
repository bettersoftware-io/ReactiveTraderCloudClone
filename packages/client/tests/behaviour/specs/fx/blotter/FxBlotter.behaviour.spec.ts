import { describe, it, expect } from "vitest";
import { Direction, TradeStatus, type Trade } from "@rtc/domain";
import { mount } from "@behaviour/mount";
import { FxBlotter } from "@behaviour/components";

const trade = (tradeId: number, over: Partial<Trade> = {}): Trade => ({
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
});

const t1 = trade(4001, { currencyPair: "EURUSD" });
const t2 = trade(4002, { currencyPair: "USDJPY", notional: 5_000_000, status: TradeStatus.Rejected });

describe("FxBlotter", () => {
  it("renders one row per trade", () => {
    expect(mount(FxBlotter, { hooks: { useTrades: [t1, t2] } }).tradeRowCount()).toBe(2);
  });

  it("shows each trade's key cells, including rejected trades", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
    expect(blotter.hasCell("EURUSD")).toBe(true);
    expect(blotter.hasCell("USDJPY")).toBe(true);
    expect(blotter.hasCell("5,000,000")).toBe(true);
    expect(blotter.hasCell("Rejected")).toBe(true);
  });

  it("exposes the trade columns", () => {
    const headers = mount(FxBlotter, { hooks: { useTrades: [t1] } }).columnHeaders();
    expect(headers.some((h) => h.includes("Trade ID"))).toBe(true);
    expect(headers.some((h) => h.includes("Status"))).toBe(true);
  });

  it("shows an empty-state message when there are no trades", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [] } });
    expect(blotter.tradeRowCount()).toBe(0);
    expect(blotter.emptyMessage()).toMatch(/no trades yet/i);
  });

  it("appends a newly streamed trade to the same blotter", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
    expect(blotter.tradeRowCount()).toBe(2);
    blotter.emit({ useTrades: [t1, t2, trade(4003, { currencyPair: "GBPUSD" })] });
    expect(blotter.tradeRowCount()).toBe(3);
    expect(blotter.hasCell("GBPUSD")).toBe(true);
  });
});
