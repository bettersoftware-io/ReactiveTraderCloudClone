import { EqSectorsDock } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityInstrument } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
];

describe("EqSectorsDock", () => {
  it("marks the workspace's selected symbol active", () => {
    const dock = mount(EqSectorsDock, {
      equities: { watchlist: INSTRUMENTS, initialSymbol: "AAPL" },
    });

    expect(dock.isActive("AAPL")).toBe(true);
    expect(dock.isActive("MSFT")).toBe(false);
  });

  it("clicking a cell selects it in the shared eqWorkspace", async () => {
    const dock = mount(EqSectorsDock, {
      equities: { watchlist: INSTRUMENTS, initialSymbol: "AAPL" },
    });

    await dock.select("MSFT");

    expect(dock.isActive("MSFT")).toBe(true);
    expect(dock.isActive("AAPL")).toBe(false);
  });
});
