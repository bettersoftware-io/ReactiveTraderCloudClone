import { act } from "@testing-library/react";
import { EqChartHead } from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityInstrument } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
];

describe("EqChartHead", () => {
  it("opens on the first watchlist symbol and defaults the timeframe to 1D", () => {
    const head = mount(EqChartHead, { equities: { watchlist: INSTRUMENTS } });

    expect(head.tabs()).toEqual(["AAPL"]);
    expect(head.activeTab()).toBe("AAPL");
    expect(head.activeTf()).toBe("1D");
  });

  it("switching a pill drives the real eqWorkspace machine's timeframe", async () => {
    const head = mount(EqChartHead, { equities: { watchlist: INSTRUMENTS } });

    await head.selectTimeframe("1M");

    expect(head.activeTf()).toBe("1M");
  });

  it("selecting a newly-opened tab and closing it both drive the REAL eqWorkspace machine", async () => {
    // Programmatically open a second tab (mirrors a watchlist-row click,
    // which lives outside EqChartHead) through the shared World's REAL
    // eqWorkspace machine instance.
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { watchlist: INSTRUMENTS },
    );
    const head = mountWith(world, EqChartHead, {});

    act(() => {
      world.eqWorkspace.intents.select("MSFT");
    });

    expect(head.tabs()).toEqual(["AAPL", "MSFT"]);
    expect(head.activeTab()).toBe("MSFT");

    await head.selectTab("AAPL");

    expect(head.activeTab()).toBe("AAPL");

    await head.closeTab("AAPL");

    expect(head.tabs()).toEqual(["MSFT"]);
    expect(head.activeTab()).toBe("MSFT");
  });
});
