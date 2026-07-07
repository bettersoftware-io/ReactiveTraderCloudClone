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
    expect(state).toEqual({ sel: "", openTabs: [], timeframe: "1D" });
    m.dispose();
  });

  it("seeds sel/openTabs from an async deferred watchlist port once it resolves", async () => {
    // Mirrors the WS-real composition path: the synchronous peek finds
    // nothing (initialSymbol ""), but the watchlist arrives moments later —
    // this deferred Subject stands in for that async watchlist port.
    const seed$ = new Subject<string>();
    const m = createEqWorkspaceMachine({ initialSymbol: "", seed$ });

    let state = await firstValueFrom(m.state$);
    expect(state).toEqual({ sel: "", openTabs: [], timeframe: "1D" });

    seed$.next("AAPL");
    state = await firstValueFrom(m.state$);
    expect(state).toEqual({ sel: "AAPL", openTabs: ["AAPL"], timeframe: "1D" });
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
