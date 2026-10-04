import { firstValueFrom, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { createEqWorkspaceMachine } from "../EqWorkspaceMachine";

describe("EqWorkspaceMachine", () => {
  it("starts with the initial symbol selected, its sole open tab, and timeframe 1D", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    const state = await firstValueFrom(m.state$);
    expect(state).toEqual({
      sel: "AAPL",
      openTabs: ["AAPL"],
      timeframe: "1D",
      chartType: "candles",
      indicators: [],
      panes: [],
      yScale: "linear",
      compare: null,
    });
    m.dispose();
  });

  it("select(sym) opens a new tab and selects it", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.select("MSFT");
    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("MSFT");
    expect(state.openTabs).toEqual(["AAPL", "MSFT"]);
    m.dispose();
  });

  it("select(sym) on an already-open tab re-selects it without duplicating", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.select("MSFT");
    m.intents.select("AAPL");
    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("AAPL");
    expect(state.openTabs).toEqual(["AAPL", "MSFT"]);
    m.dispose();
  });

  it("closeTab(sym) on a non-selected tab removes it and keeps the current selection", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.select("MSFT");
    m.intents.select("TSLA");
    // tabs: [AAPL, MSFT, TSLA], sel: TSLA
    m.intents.closeTab("MSFT");
    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("TSLA");
    expect(state.openTabs).toEqual(["AAPL", "TSLA"]);
    m.dispose();
  });

  it("closeTab(sym) on the selected middle tab falls back to the neighbour that slides into its slot", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.select("MSFT");
    m.intents.select("TSLA");
    m.intents.select("AAPL");
    // tabs: [AAPL, MSFT, TSLA], sel: AAPL (index 0)
    m.intents.closeTab("AAPL");
    // remaining [MSFT, TSLA]; neighbourIdx = min(0, 1) = 0 -> MSFT
    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("MSFT");
    expect(state.openTabs).toEqual(["MSFT", "TSLA"]);
    m.dispose();
  });

  it("closeTab(sym) on the selected LAST tab falls back to the new last tab", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.select("MSFT");
    m.intents.select("TSLA");
    // tabs: [AAPL, MSFT, TSLA], sel: TSLA (index 2, last)
    m.intents.closeTab("TSLA");
    // remaining [AAPL, MSFT]; neighbourIdx = min(2, 1) = 1 -> MSFT
    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("MSFT");
    expect(state.openTabs).toEqual(["AAPL", "MSFT"]);
    m.dispose();
  });

  it("closeTab(sym) is a no-op when it is the sole remaining open tab", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.closeTab("AAPL");
    const state = await firstValueFrom(m.state$);
    expect(state).toEqual({
      sel: "AAPL",
      openTabs: ["AAPL"],
      timeframe: "1D",
      chartType: "candles",
      indicators: [],
      panes: [],
      yScale: "linear",
      compare: null,
    });
    m.dispose();
  });

  it("closeTab(sym) for a symbol that isn't open is a no-op", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.closeTab("MSFT");
    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("AAPL");
    expect(state.openTabs).toEqual(["AAPL"]);
    m.dispose();
  });

  it("setTimeframe(tf) updates the shared timeframe without touching selection/tabs", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.select("MSFT");
    m.intents.setTimeframe("1W");
    const state = await firstValueFrom(m.state$);
    expect(state.timeframe).toBe("1W");
    expect(state.sel).toBe("MSFT");
    expect(state.openTabs).toEqual(["AAPL", "MSFT"]);
    m.dispose();
  });
});

describe("EqWorkspaceMachine — empty-seed recovery (C2 regression)", () => {
  it("starts with no selection and NO phantom tab when initialSymbol is empty", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "" });
    const state = await firstValueFrom(m.state$);
    expect(state).toEqual({
      sel: "",
      openTabs: [],
      timeframe: "1D",
      chartType: "candles",
      indicators: [],
      panes: [],
      yScale: "linear",
      compare: null,
    });
    m.dispose();
  });

  it("seeds sel/openTabs from an async deferred watchlist port once it resolves", async () => {
    // Mirrors the WS-real composition path: the synchronous peek finds
    // nothing (initialSymbol ""), but the watchlist arrives moments later —
    // this deferred Subject stands in for that async watchlist port.
    const seed$ = new Subject<string>();
    const m = createEqWorkspaceMachine({ initialSymbol: "", seed$ });

    let state = await firstValueFrom(m.state$);
    expect(state).toEqual({
      sel: "",
      openTabs: [],
      timeframe: "1D",
      chartType: "candles",
      indicators: [],
      panes: [],
      yScale: "linear",
      compare: null,
    });

    seed$.next("AAPL");
    state = await firstValueFrom(m.state$);
    expect(state).toEqual({
      sel: "AAPL",
      openTabs: ["AAPL"],
      timeframe: "1D",
      chartType: "candles",
      indicators: [],
      panes: [],
      yScale: "linear",
      compare: null,
    });
    m.dispose();
  });

  it("only ever seeds once — a second seed$ emission is ignored", async () => {
    const seed$ = new Subject<string>();
    const m = createEqWorkspaceMachine({ initialSymbol: "", seed$ });

    seed$.next("AAPL");
    seed$.next("MSFT");
    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("AAPL");
    expect(state.openTabs).toEqual(["AAPL"]);
    m.dispose();
  });

  it("a user select() before the seed arrives wins — the late seed never clobbers it", async () => {
    const seed$ = new Subject<string>();
    const m = createEqWorkspaceMachine({ initialSymbol: "", seed$ });

    m.intents.select("TSLA");
    seed$.next("AAPL");

    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("TSLA");
    expect(state.openTabs).toEqual(["TSLA"]);
    m.dispose();
  });

  it("a non-empty initialSymbol is never overridden by a later seed$ emission", async () => {
    const seed$ = new Subject<string>();
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL", seed$ });

    seed$.next("MSFT");
    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("AAPL");
    expect(state.openTabs).toEqual(["AAPL"]);
    m.dispose();
  });
});

describe("EqWorkspaceMachine — chartType + indicators (C1)", () => {
  it("starts with chartType 'candles' and no indicators", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    const state = await firstValueFrom(m.state$);
    expect(state.chartType).toBe("candles");
    expect(state.indicators).toEqual([]);
    m.dispose();
  });

  it("setChartType(kind) patches the chart type without touching selection/tabs/timeframe/indicators", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.select("MSFT");
    m.intents.setTimeframe("1W");
    m.intents.setChartType("area");
    const state = await firstValueFrom(m.state$);
    expect(state.chartType).toBe("area");
    expect(state.sel).toBe("MSFT");
    expect(state.openTabs).toEqual(["AAPL", "MSFT"]);
    expect(state.timeframe).toBe("1W");
    expect(state.indicators).toEqual([]);
    expect(state.panes).toEqual([]);
    m.dispose();
  });

  it("toggleIndicator(id) adds the indicator when absent", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.toggleIndicator("sma20");
    const state = await firstValueFrom(m.state$);
    expect(state.indicators).toEqual(["sma20"]);
    m.dispose();
  });

  it("toggleIndicator(id) removes the indicator when already present", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.toggleIndicator("sma20");
    m.intents.toggleIndicator("sma20");
    const state = await firstValueFrom(m.state$);
    expect(state.indicators).toEqual([]);
    m.dispose();
  });

  it("toggleIndicator(id) tracks multiple indicators independently", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.toggleIndicator("sma20");
    m.intents.toggleIndicator("ema50");
    let state = await firstValueFrom(m.state$);
    expect(state.indicators).toEqual(["sma20", "ema50"]);

    m.intents.toggleIndicator("sma20");
    state = await firstValueFrom(m.state$);
    expect(state.indicators).toEqual(["ema50"]);
    m.dispose();
  });

  it("chartType and indicators survive interleaved select()/setTimeframe() patches", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setChartType("line");
    m.intents.toggleIndicator("sma20");
    m.intents.select("MSFT");
    m.intents.setTimeframe("1M");
    m.intents.toggleIndicator("ema50");
    m.intents.select("TSLA");

    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("TSLA");
    expect(state.openTabs).toEqual(["AAPL", "MSFT", "TSLA"]);
    expect(state.timeframe).toBe("1M");
    expect(state.chartType).toBe("line");
    expect(state.indicators).toEqual(["sma20", "ema50"]);
    expect(state.panes).toEqual([]);
    m.dispose();
  });
});

describe("EqWorkspaceMachine — indicator panes (RSI/MACD)", () => {
  it("starts with no panes", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    const state = await firstValueFrom(m.state$);
    expect(state.panes).toEqual([]);
    m.dispose();
  });

  it("togglePane(id) adds the pane when absent", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.togglePane("rsi");
    const state = await firstValueFrom(m.state$);
    expect(state.panes).toEqual(["rsi"]);
    m.dispose();
  });

  it("togglePane(id) removes the pane when already present", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.togglePane("rsi");
    m.intents.togglePane("rsi");
    const state = await firstValueFrom(m.state$);
    expect(state.panes).toEqual([]);
    m.dispose();
  });

  it("preserves activation order: rsi then macd, then macd alone after removing rsi", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.togglePane("rsi");
    m.intents.togglePane("macd");
    let state = await firstValueFrom(m.state$);
    expect(state.panes).toEqual(["rsi", "macd"]);

    m.intents.togglePane("rsi");
    state = await firstValueFrom(m.state$);
    expect(state.panes).toEqual(["macd"]);
    m.dispose();
  });

  it("is independent of indicators — toggling one never touches the other", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.toggleIndicator("sma20");
    m.intents.togglePane("rsi");
    const state = await firstValueFrom(m.state$);
    expect(state.indicators).toEqual(["sma20"]);
    expect(state.panes).toEqual(["rsi"]);
    m.dispose();
  });
});

describe("EqWorkspaceMachine — price axis scale (linear/log)", () => {
  it("toggleYScale flips linear ↔ log, starting linear", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    let state = await firstValueFrom(m.state$);
    expect(state.yScale).toBe("linear");

    m.intents.toggleYScale();
    state = await firstValueFrom(m.state$);
    expect(state.yScale).toBe("log");

    m.intents.toggleYScale();
    state = await firstValueFrom(m.state$);
    expect(state.yScale).toBe("linear");
    m.dispose();
  });
});

describe("EqWorkspaceMachine — comparison series (compare)", () => {
  it("starts with no comparison symbol", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    const state = await firstValueFrom(m.state$);
    expect(state.compare).toBeNull();
    m.dispose();
  });

  it("setCompare(sym) sets the comparison; setCompare(null) clears it", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setCompare("MSFT");
    expect((await firstValueFrom(m.state$)).compare).toBe("MSFT");
    m.intents.setCompare(null);
    expect((await firstValueFrom(m.state$)).compare).toBeNull();
    m.dispose();
  });

  it("setCompare(the selected symbol) is a no-op", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setCompare("AAPL");
    expect((await firstValueFrom(m.state$)).compare).toBeNull();
    m.dispose();
  });

  it("select(the compared symbol) clears the comparison — the primary absorbs it", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setCompare("MSFT");
    m.intents.select("MSFT");
    const state = await firstValueFrom(m.state$);
    expect(state.sel).toBe("MSFT");
    expect(state.compare).toBeNull();
    m.dispose();
  });

  it("selecting an unrelated symbol keeps the comparison", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setCompare("MSFT");
    m.intents.select("TSLA");
    expect((await firstValueFrom(m.state$)).compare).toBe("MSFT");
    m.dispose();
  });

  it("setTimeframe keeps the comparison", async () => {
    const m = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    m.intents.setCompare("MSFT");
    m.intents.setTimeframe("1W");
    expect((await firstValueFrom(m.state$)).compare).toBe("MSFT");
    m.dispose();
  });
});
