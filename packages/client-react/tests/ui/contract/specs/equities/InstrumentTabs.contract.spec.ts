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
  it("renders a tab per watchlist instrument", () => {
    const tabs = mount(InstrumentTabs, {
      props: { selectedSymbol: "AAPL", onSelect: () => {} },
      equities: { watchlist: INSTRUMENTS },
    });

    expect(tabs.tabs()).toEqual(["AAPL", "MSFT", "JPM"]);
  });

  it("marks the selected symbol as the active tab", () => {
    const tabs = mount(InstrumentTabs, {
      props: { selectedSymbol: "MSFT", onSelect: () => {} },
      equities: { watchlist: INSTRUMENTS },
    });

    expect(tabs.activeSymbol()).toBe("MSFT");
  });

  it("fires onSelect with the symbol when a tab is clicked", async () => {
    const selected: string[] = [];
    const tabs = mount(InstrumentTabs, {
      props: {
        selectedSymbol: "AAPL",
        onSelect: (symbol: string) => {
          selected.push(symbol);
        },
      },
      equities: { watchlist: INSTRUMENTS },
    });

    await tabs.select("JPM");

    expect(selected).toEqual(["JPM"]);
  });
});
