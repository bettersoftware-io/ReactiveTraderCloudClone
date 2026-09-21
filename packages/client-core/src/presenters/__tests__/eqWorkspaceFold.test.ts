import { describe, expect, it } from "vitest";

import type { EqWorkspaceState } from "@rtc/core-api";
import type { EquityInstrument } from "@rtc/domain";

import {
  createEqWorkspaceState,
  type EqWorkspaceEvent,
  firstWatchlistSymbol,
  reduceEqWorkspace,
} from "#/presenters/eqWorkspaceFold";

describe("createEqWorkspaceState", () => {
  it("seeds sel/openTabs from a non-empty initial symbol, with defaults for the rest", () => {
    expect(createEqWorkspaceState("AAPL")).toEqual({
      sel: "AAPL",
      openTabs: ["AAPL"],
      timeframe: "1D",
      chartType: "candles",
      indicators: [],
      panes: [],
      yScale: "linear",
      compare: null,
    });
  });

  it("an empty initial symbol opens no tab (no phantom '' tab)", () => {
    expect(createEqWorkspaceState("").openTabs).toEqual([]);
  });
});

describe("reduceEqWorkspace — select", () => {
  it("appends an unopened symbol to openTabs and selects it", () => {
    const state = createEqWorkspaceState("AAPL");
    const next = reduceEqWorkspace(state, selectEvent("MSFT"));
    expect(next.sel).toBe("MSFT");
    expect(next.openTabs).toEqual(["AAPL", "MSFT"]);
  });

  it("re-selecting an already-open symbol does not duplicate the tab", () => {
    const state = createEqWorkspaceState("AAPL");
    const next = reduceEqWorkspace(state, selectEvent("AAPL"));
    expect(next.openTabs).toEqual(["AAPL"]);
  });

  it("selecting the compared symbol clears the comparison", () => {
    const state: EqWorkspaceState = {
      ...createEqWorkspaceState("AAPL"),
      compare: "MSFT",
    };
    const next = reduceEqWorkspace(state, selectEvent("MSFT"));
    expect(next.sel).toBe("MSFT");
    expect(next.compare).toBeNull();
  });
});

describe("reduceEqWorkspace — closeTab", () => {
  it("closing an unknown symbol returns the same reference", () => {
    const state = createEqWorkspaceState("AAPL");
    const next = reduceEqWorkspace(state, closeTabEvent("ZZZZ"));
    expect(next).toBe(state);
  });

  it("closing the sole remaining tab returns the same reference", () => {
    const state = createEqWorkspaceState("AAPL");
    const next = reduceEqWorkspace(state, closeTabEvent("AAPL"));
    expect(next).toBe(state);
  });

  it("closing a non-selected tab keeps sel unchanged", () => {
    const state: EqWorkspaceState = {
      ...createEqWorkspaceState("AAPL"),
      openTabs: ["AAPL", "MSFT"],
    };
    const next = reduceEqWorkspace(state, closeTabEvent("MSFT"));
    expect(next.sel).toBe("AAPL");
    expect(next.openTabs).toEqual(["AAPL"]);
  });

  it("closing the selected middle tab selects the tab that slides into its slot", () => {
    const state: EqWorkspaceState = {
      ...createEqWorkspaceState("AAPL"),
      sel: "MSFT",
      openTabs: ["AAPL", "MSFT", "TSLA"],
    };
    const next = reduceEqWorkspace(state, closeTabEvent("MSFT"));
    expect(next.openTabs).toEqual(["AAPL", "TSLA"]);
    expect(next.sel).toBe("TSLA");
  });

  it("closing the selected last tab selects the new last", () => {
    const state: EqWorkspaceState = {
      ...createEqWorkspaceState("AAPL"),
      sel: "TSLA",
      openTabs: ["AAPL", "MSFT", "TSLA"],
    };
    const next = reduceEqWorkspace(state, closeTabEvent("TSLA"));
    expect(next.openTabs).toEqual(["AAPL", "MSFT"]);
    expect(next.sel).toBe("MSFT");
  });
});

describe("reduceEqWorkspace — timeframe/chartType/indicators/panes/yScale", () => {
  it("setTimeframe replaces the timeframe", () => {
    const state = createEqWorkspaceState("AAPL");
    const next = reduceEqWorkspace(state, {
      kind: "setTimeframe",
      timeframe: "1W",
    });
    expect(next.timeframe).toBe("1W");
  });

  it("setChartType replaces the chart type", () => {
    const state = createEqWorkspaceState("AAPL");
    const next = reduceEqWorkspace(state, {
      kind: "setChartType",
      chartType: "line",
    });
    expect(next.chartType).toBe("line");
  });

  it("toggleIndicator adds then removes, independently of panes", () => {
    const state = createEqWorkspaceState("AAPL");
    const added = reduceEqWorkspace(state, {
      kind: "toggleIndicator",
      id: "sma20",
    });
    expect(added.indicators).toEqual(["sma20"]);
    expect(added.panes).toEqual([]);

    const removed = reduceEqWorkspace(added, {
      kind: "toggleIndicator",
      id: "sma20",
    });
    expect(removed.indicators).toEqual([]);
  });

  it("togglePane adds then removes, independently of indicators", () => {
    const state = createEqWorkspaceState("AAPL");
    const added = reduceEqWorkspace(state, { kind: "togglePane", id: "rsi" });
    expect(added.panes).toEqual(["rsi"]);
    expect(added.indicators).toEqual([]);

    const removed = reduceEqWorkspace(added, {
      kind: "togglePane",
      id: "rsi",
    });
    expect(removed.panes).toEqual([]);
  });

  it("toggleYScale flips linear <-> log", () => {
    const state = createEqWorkspaceState("AAPL");
    const logged = reduceEqWorkspace(state, { kind: "toggleYScale" });
    expect(logged.yScale).toBe("log");

    const linear = reduceEqWorkspace(logged, { kind: "toggleYScale" });
    expect(linear.yScale).toBe("linear");
  });
});

describe("reduceEqWorkspace — setCompare", () => {
  it("sets the compare symbol", () => {
    const state = createEqWorkspaceState("AAPL");
    const next = reduceEqWorkspace(state, { kind: "setCompare", sym: "MSFT" });
    expect(next.compare).toBe("MSFT");
  });

  it("comparing the selected symbol against itself returns the same reference", () => {
    const state = createEqWorkspaceState("AAPL");
    const next = reduceEqWorkspace(state, { kind: "setCompare", sym: "AAPL" });
    expect(next).toBe(state);
  });

  it("setCompare(null) clears the comparison", () => {
    const state: EqWorkspaceState = {
      ...createEqWorkspaceState("AAPL"),
      compare: "MSFT",
    };
    const next = reduceEqWorkspace(state, { kind: "setCompare", sym: null });
    expect(next.compare).toBeNull();
  });

  it("never touches yScale", () => {
    const state: EqWorkspaceState = {
      ...createEqWorkspaceState("AAPL"),
      yScale: "log",
    };
    const next = reduceEqWorkspace(state, { kind: "setCompare", sym: "MSFT" });
    expect(next.yScale).toBe("log");
  });
});

describe("reduceEqWorkspace — seed", () => {
  it("applies only while sel is empty, setting sel and openTabs", () => {
    const state = createEqWorkspaceState("");
    const next = reduceEqWorkspace(state, { kind: "seed", sym: "AAPL" });
    expect(next.sel).toBe("AAPL");
    expect(next.openTabs).toEqual(["AAPL"]);
  });

  it("on a populated state returns the same reference", () => {
    const state = createEqWorkspaceState("AAPL");
    const next = reduceEqWorkspace(state, { kind: "seed", sym: "MSFT" });
    expect(next).toBe(state);
  });
});

describe("firstWatchlistSymbol", () => {
  it("is '' for an empty list", () => {
    expect(firstWatchlistSymbol([])).toBe("");
  });

  it("is the first symbol of a two-item list", () => {
    const list: readonly EquityInstrument[] = [
      instrument("AAPL"),
      instrument("MSFT"),
    ];
    expect(firstWatchlistSymbol(list)).toBe("AAPL");
  });
});

function selectEvent(sym: string): EqWorkspaceEvent {
  return { kind: "select", sym };
}

function closeTabEvent(sym: string): EqWorkspaceEvent {
  return { kind: "closeTab", sym };
}

function instrument(symbol: string): EquityInstrument {
  return { symbol, name: symbol, exchange: "NASDAQ" };
}
