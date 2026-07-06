import { InstrumentTabs } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityInstrument } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
  { symbol: "JPM", name: "JPMorgan", exchange: "NYSE" },
];

describe("InstrumentTabs", () => {
  it("opens on the first watchlist symbol as the sole tab, selected", () => {
    const tabs = mount(InstrumentTabs, {
      equities: { watchlist: INSTRUMENTS },
    });

    expect(tabs.tabs()).toEqual(["AAPL"]);
    expect(tabs.activeSymbol()).toBe("AAPL");
  });

  it("opens on the seeded initialSymbol when one is given", () => {
    const tabs = mount(InstrumentTabs, {
      equities: { watchlist: INSTRUMENTS, initialSymbol: "MSFT" },
    });

    expect(tabs.tabs()).toEqual(["MSFT"]);
    expect(tabs.activeSymbol()).toBe("MSFT");
  });

  it("selecting the sole open tab is a no-op re-selection through the real machine", async () => {
    const tabs = mount(InstrumentTabs, {
      equities: { watchlist: INSTRUMENTS },
    });

    await tabs.select("AAPL");

    expect(tabs.activeSymbol()).toBe("AAPL");
  });

  it("closing the sole open tab through the real machine never empties the strip", async () => {
    const tabs = mount(InstrumentTabs, {
      equities: { watchlist: INSTRUMENTS },
    });

    await tabs.close("AAPL");

    expect(tabs.tabs()).toEqual(["AAPL"]);
    expect(tabs.activeSymbol()).toBe("AAPL");
  });
});
