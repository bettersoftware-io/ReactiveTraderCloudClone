import { firstValueFrom } from "rxjs";
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
