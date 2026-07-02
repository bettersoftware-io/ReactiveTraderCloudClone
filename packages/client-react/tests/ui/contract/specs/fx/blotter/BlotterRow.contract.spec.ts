import { BlotterRow } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

afterEach(() => {
  vi.useRealTimers();
});

describe("BlotterRow", () => {
  it("renders one formatted cell per column", () => {
    const row = mount(BlotterRow, { props: { trade: trade(), isNew: false } });
    const cells = row.cellText();
    expect(cells).toHaveLength(10);
    expect(row.hasCell("7001")).toBe(true);
    expect(row.hasCell("EURUSD")).toBe(true);
    expect(row.hasCell("2,500,000")).toBe(true);
    expect(row.hasCell("1.09221")).toBe(true);
    expect(row.hasCell("30-Mar-2026")).toBe(true);
  });

  it("strikes through rejected trades", () => {
    const row = mount(BlotterRow, {
      props: { trade: trade({ status: TradeStatus.Rejected }), isNew: false },
    });
    expect(row.isRejected()).toBe(true);
  });

  it("renders a non-rejected trade without strike-through", () => {
    const row = mount(BlotterRow, { props: { trade: trade(), isNew: false } });
    expect(row.isRejected()).toBe(false);
  });

  it("flashes a newly arrived trade", () => {
    const row = mount(BlotterRow, { props: { trade: trade(), isNew: true } });
    expect(row.backgroundColor()).toBe("animation:backgroundFlash");
  });

  it("does not highlight an existing trade", () => {
    const row = mount(BlotterRow, { props: { trade: trade(), isNew: false } });
    expect(row.backgroundColor()).toBe("transparent");
  });

  it("applies a hover background and removes it on mouse-leave", () => {
    const row = mount(BlotterRow, { props: { trade: trade(), isNew: false } });
    expect(row.backgroundColor()).toBe("transparent");
    row.hover();
    expect(row.backgroundColor()).toBe("var(--chip)");
    row.unhover();
    expect(row.backgroundColor()).toBe("transparent");
  });

  it("clears the flash after the 3s highlight window elapses", () => {
    vi.useFakeTimers();
    const row = mount(BlotterRow, { props: { trade: trade(), isNew: true } });
    expect(row.backgroundColor()).toBe("animation:backgroundFlash");
    vi.advanceTimersByTime(3000);
    row.setProps({ isNew: true });
    expect(row.backgroundColor()).toBe("transparent");
  });
});

function trade(over: Partial<Trade> = {}): Trade {
  return {
    tradeId: 7001,
    tradeName: "Alice",
    currencyPair: "EURUSD",
    notional: 2_500_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.09221,
    status: TradeStatus.Done,
    tradeDate: "2026-03-30",
    valueDate: "2026-04-01",
    ...over,
  };
}
