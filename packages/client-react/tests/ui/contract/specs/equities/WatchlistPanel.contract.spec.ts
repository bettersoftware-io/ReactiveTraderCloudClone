import { act } from "@testing-library/react";
import { EqWatchlistHead, WatchlistPanel } from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityInstrument, EquityQuote } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc", exchange: "NASDAQ" },
];

const QUOTES = {
  AAPL: quote("AAPL", 229.35, 0.5),
  MSFT: quote("MSFT", 467.12, 2.1),
  TSLA: quote("TSLA", 251.44, -1.2),
};

describe("WatchlistPanel — rows", () => {
  it("renders a row per watchlist instrument, sorted by the default (chg) preference", () => {
    const panel = mount(WatchlistPanel, {
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    expect(panel.rows()).toEqual(["MSFT", "AAPL", "TSLA"]);
  });

  it("shows an empty-state placeholder when there are no instruments", () => {
    const panel = mount(WatchlistPanel, {});

    expect(panel.isEmpty()).toBe(true);
    expect(panel.rows()).toEqual([]);
  });

  it("reflects the shared eqWorkspace selection as the active row", () => {
    const panel = mount(WatchlistPanel, {
      equities: {
        watchlist: INSTRUMENTS,
        quotes: QUOTES,
        initialSymbol: "MSFT",
      },
    });

    expect(panel.selectedSymbol()).toBe("MSFT");
  });

  it("renders a row with no quote yet without crashing, sorted to the end", () => {
    // AMZN has no seeded quote — the row's useEquityQuote(symbol) hasn't
    // ticked yet, exercising the null-quote guard in both WatchlistRow and
    // the sort's null-handling in watchlistVm.
    const withUnquoted = [
      ...INSTRUMENTS,
      { symbol: "AMZN", name: "Amazon.com", exchange: "NASDAQ" },
    ];
    const panel = mount(WatchlistPanel, {
      equities: { watchlist: withUnquoted, quotes: QUOTES },
    });

    expect(panel.rows()).toEqual(["MSFT", "AAPL", "TSLA", "AMZN"]);
  });

  it("re-runs the rank-glide layout pass for a single-row watchlist without crashing", () => {
    // With exactly one row, the glide's row-height measurement takes its
    // fallback (fewer than two nodes to measure a gap between).
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
      { watchlist: [INSTRUMENTS[0] as EquityInstrument], quotes: QUOTES },
    );
    const panel = mountWith(world, WatchlistPanel, {});

    expect(panel.rows()).toEqual(["AAPL"]);

    act(() => {
      world.setEquityQuote("AAPL", quote("AAPL", 240, 4.6));
    });

    expect(panel.rows()).toEqual(["AAPL"]);
  });
});

describe("WatchlistPanel — tick pulse", () => {
  it("renders no pulse before the first tick, then one on the next quote change", () => {
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
      { watchlist: INSTRUMENTS, quotes: QUOTES },
    );
    const panel = mountWith(world, WatchlistPanel, {});

    // The seeded quote is the FIRST tick this row observes — no prior value
    // to diff against, so no pulse yet.
    expect(panel.flashDirection("AAPL")).toBeNull();

    act(() => {
      world.setEquityQuote("AAPL", quote("AAPL", 235, 3.2));
    });
    expect(panel.flashDirection("AAPL")).toBe("up");

    act(() => {
      world.setEquityQuote("AAPL", quote("AAPL", 220, -3.6));
    });
    expect(panel.flashDirection("AAPL")).toBe("down");
  });

  it("re-reporting the same last/changePct is a no-op for the panel's sort inputs", () => {
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
      { watchlist: INSTRUMENTS, quotes: QUOTES },
    );
    const panel = mountWith(world, WatchlistPanel, {});

    act(() => {
      world.setEquityQuote("AAPL", quote("AAPL", 235, 3.2));
    });
    expect(panel.rows()).toEqual(["AAPL", "MSFT", "TSLA"]);

    // Same last/changePct values (a fresh object, but the panel dedupes on
    // value equality) — the sort order is unaffected.
    act(() => {
      world.setEquityQuote("AAPL", quote("AAPL", 235, 3.2));
    });
    expect(panel.rows()).toEqual(["AAPL", "MSFT", "TSLA"]);
  });
});

describe("WatchlistPanel — row select hits the shared eqWorkspace machine", () => {
  it("clicking a row selects it in the REAL eqWorkspace machine, observed by a second independent mount", async () => {
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
      { watchlist: INSTRUMENTS, quotes: QUOTES, initialSymbol: "AAPL" },
    );
    // Two independent mounts sharing one World's REAL eqWorkspace machine —
    // proves the click drives the shared singleton, not local component state
    // (mirrors the EqWorkspaceMachine cross-component-sharing proof).
    const panel = mountWith(world, WatchlistPanel, {});
    const otherPanel = mountWith(world, WatchlistPanel, {});

    expect(panel.selectedSymbol()).toBe("AAPL");
    expect(otherPanel.selectedSymbol()).toBe("AAPL");

    await panel.select("TSLA");

    expect(panel.selectedSymbol()).toBe("TSLA");
    expect(otherPanel.selectedSymbol()).toBe("TSLA");
  });
});

describe("WatchlistPanel + EqWatchlistHead — sort cycle order + persistence", () => {
  it("cycling the head's ⇅ chip re-sorts the SAME shared watchlist rows", async () => {
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
      { watchlist: INSTRUMENTS, quotes: QUOTES },
    );
    const panel = mountWith(world, WatchlistPanel, {});
    const head = mountWith(world, EqWatchlistHead, {});

    // Default seam value is "chg" (DEFAULT_EQ_WATCHLIST_SORT).
    expect(head.label()).toBe("⇅ % CHG");
    expect(panel.rows()).toEqual(["MSFT", "AAPL", "TSLA"]);

    await head.cycle();
    expect(head.label()).toBe("⇅ PRICE");
    expect(panel.rows()).toEqual(["MSFT", "TSLA", "AAPL"]);

    await head.cycle();
    expect(head.label()).toBe("⇅ A–Z");
    expect(panel.rows()).toEqual(["AAPL", "MSFT", "TSLA"]);

    await head.cycle();
    expect(head.label()).toBe("⇅ % CHG");
    expect(panel.rows()).toEqual(["MSFT", "AAPL", "TSLA"]);
  });
});

function quote(symbol: string, last: number, changePct: number): EquityQuote {
  return {
    symbol,
    bid: last - 0.05,
    ask: last + 0.05,
    last,
    changePct,
    timestamp: 0,
  };
}
