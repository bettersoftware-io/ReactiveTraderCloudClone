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

  // Rejected trades get the muted "rejected" row state (status cell text
  // recolours red via CSS keyed off data-status — see BlotterRow.module.css)
  // and never the struck-through look: `data-state="rejected"` is the only
  // presentation hook the row exposes, with no separate line-through class.
  it("marks rejected trades with the rejected row state", () => {
    const row = mount(BlotterRow, {
      props: { trade: trade({ status: TradeStatus.Rejected }), isNew: false },
    });
    expect(row.isRejected()).toBe(true);
  });

  it("does not mark a non-rejected trade as rejected", () => {
    const row = mount(BlotterRow, { props: { trade: trade(), isNew: false } });
    expect(row.isRejected()).toBe(false);
  });

  // The status-cell colour (Done → positive, Pending → aware accent) hangs
  // off this attribute in CSS, which jsdom can't compute — so the contract
  // pins the attribute itself for every TradeStatus.
  it("exposes each trade status as a lowercased data-status", () => {
    const row = mount(BlotterRow, { props: { trade: trade(), isNew: false } });
    expect(row.status()).toBe("done");
    row.setProps({ trade: trade({ status: TradeStatus.Pending }) });
    expect(row.status()).toBe("pending");
    row.setProps({ trade: trade({ status: TradeStatus.Rejected }) });
    expect(row.status()).toBe("rejected");
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
