import { PositionsTable } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityPosition } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("PositionsTable — empty state", () => {
  it("shows the desk gauge and a placeholder with no positions", () => {
    const table = mount(PositionsTable, { props: { positions: [] } });

    expect(table.rowCount()).toBe(0);
    expect(table.isEmpty()).toBe(true);
    expect(table.hasDeskGauge()).toBe(true);
  });
});

describe("PositionsTable — rows", () => {
  it("derives Mkt Value as qty × markPrice", () => {
    const table = mount(PositionsTable, {
      props: { positions: [position({ qty: 1000, markPrice: 185 })] },
    });

    expect(table.mktValueTextOf("AAPL")).toBe("$185,000");
  });

  it("colors P/L positive for profit", () => {
    const table = mount(PositionsTable, {
      props: { positions: [position({ unrealisedPnl: 5000 })] },
    });

    expect(table.pnlSignOf("AAPL")).toBe("pos");
    expect(table.plTextOf("AAPL")).toContain("+$5,000");
  });

  it("colors P/L negative for loss", () => {
    const table = mount(PositionsTable, {
      props: {
        positions: [
          position({ symbol: "MSFT", qty: -500, unrealisedPnl: -1200 }),
        ],
      },
    });

    expect(table.pnlSignOf("MSFT")).toBe("neg");
    expect(table.plTextOf("MSFT")).toContain("-$1,200");
  });

  it("renders a row per position and keeps the desk gauge visible", () => {
    const table = mount(PositionsTable, {
      props: {
        positions: [
          position({ symbol: "AAPL", unrealisedPnl: 5000 }),
          position({ symbol: "MSFT", qty: -500, unrealisedPnl: -5000 }),
        ],
      },
    });

    expect(table.rowCount()).toBe(2);
    expect(table.hasDeskGauge()).toBe(true);
  });
});

function position(overrides: Partial<EquityPosition> = {}): EquityPosition {
  return {
    symbol: "AAPL",
    qty: 1000,
    avgPrice: 180,
    markPrice: 185,
    unrealisedPnl: 5000,
    ...overrides,
  };
}
