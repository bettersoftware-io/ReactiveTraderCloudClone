import { PositionsBlotter } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityPosition } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const POSITIONS: readonly EquityPosition[] = [
  {
    symbol: "AAPL",
    qty: 1000,
    avgPrice: 180,
    markPrice: 185,
    unrealisedPnl: 5000,
  },
  {
    symbol: "MSFT",
    qty: -500,
    avgPrice: 400,
    markPrice: 410,
    unrealisedPnl: -5000,
  },
];

describe("PositionsBlotter", () => {
  it("shows the desk gauge and an empty-state placeholder with no positions", () => {
    const blotter = mount(PositionsBlotter, {});

    expect(blotter.rowCount()).toBe(0);
    expect(blotter.isEmpty()).toBe(true);
    expect(blotter.hasDeskGauge()).toBe(true);
  });

  it("renders a row per position with its P&L sign", () => {
    const blotter = mount(PositionsBlotter, {
      equities: { positions: POSITIONS },
    });

    expect(blotter.rowCount()).toBe(2);
    expect(blotter.pnlSignOf("AAPL")).toBe("pos");
    expect(blotter.pnlSignOf("MSFT")).toBe("neg");
    expect(blotter.hasDeskGauge()).toBe(true);
  });
});
