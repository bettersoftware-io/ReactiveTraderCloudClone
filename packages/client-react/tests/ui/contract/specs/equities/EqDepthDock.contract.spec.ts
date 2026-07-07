import { EqDepthDock } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { DepthBook, EquityInstrument } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
];

const BOOK: DepthBook = {
  symbol: "AAPL",
  bids: [{ price: 99.9, size: 500 }],
  asks: [{ price: 100.1, size: 400 }],
};

describe("EqDepthDock", () => {
  it("shows a select-an-instrument placeholder when the workspace has no selection", () => {
    const dock = mount(EqDepthDock, {});

    expect(dock.isEmpty()).toBe(true);
  });

  it("mounts DepthLadder for the workspace's selected symbol", () => {
    const dock = mount(EqDepthDock, {
      equities: { watchlist: INSTRUMENTS, depth: { AAPL: BOOK } },
    });

    expect(dock.isEmpty()).toBe(false);
    expect(dock.rowCount("bid")).toBe(1);
    expect(dock.rowCount("ask")).toBe(1);
  });
});
