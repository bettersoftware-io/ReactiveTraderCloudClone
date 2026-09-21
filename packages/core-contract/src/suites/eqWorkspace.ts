import { describe, expect, it } from "vitest";

import type { EqWorkspaceState } from "@rtc/core-api";

import { collect } from "#/harness/collect";
import { AAPL, MSFT, TSLA } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const SEEDED: EqWorkspaceState = {
  sel: "AAPL",
  openTabs: ["AAPL"],
  timeframe: "1D",
  chartType: "candles",
  indicators: [],
  panes: [],
  yScale: "linear",
  compare: null,
};

export function describeEqWorkspaceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("opens on the first symbol of the roster the world already holds — synchronously, as its first state", async () => {
      const h = makeHarness({ watchlist: [AAPL, MSFT] });

      try {
        const c = collect(h.app.presenters.eqWorkspace.state$);
        expect(c.values).toEqual([SEEDED]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("with no roster yet it starts empty — no phantom tab — ignores an empty roster, seeds from the first non-empty one, and never re-seeds", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.eqWorkspace.state$);
        expect(c.values).toEqual([{ ...SEEDED, sel: "", openTabs: [] }]);
        h.driver.emitWatchlist([]);
        await settle();
        expect(c.values.at(-1)?.sel).toBe("");
        h.driver.emitWatchlist([MSFT, AAPL]);
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...SEEDED,
          sel: "MSFT",
          openTabs: ["MSFT"],
        });
        h.driver.emitWatchlist([AAPL]);
        await settle();
        expect(c.values.at(-1)?.sel).toBe("MSFT");
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a selection made before the roster arrives wins over the seed", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.eqWorkspace;
        const c = collect(m.state$);
        m.intents.select(TSLA.symbol);
        await settle();
        h.driver.emitWatchlist([AAPL]);
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...SEEDED,
          sel: TSLA.symbol,
          openTabs: [TSLA.symbol],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("select opens a tab once and selects it; closeTab never empties the strip and hands a closed selection to its neighbour", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const m = h.app.presenters.eqWorkspace;
        const c = collect(m.state$);
        m.intents.select("MSFT");
        m.intents.select(TSLA.symbol);
        m.intents.select("MSFT");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: "MSFT",
          openTabs: ["AAPL", "MSFT", TSLA.symbol],
        });
        m.intents.closeTab("NVDA");
        m.intents.closeTab("AAPL");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: "MSFT",
          openTabs: ["MSFT", TSLA.symbol],
        });
        m.intents.closeTab("MSFT");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: TSLA.symbol,
          openTabs: [TSLA.symbol],
        });
        m.intents.closeTab(TSLA.symbol);
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: TSLA.symbol,
          openTabs: [TSLA.symbol],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("closing the selected LAST tab selects the new last tab", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const m = h.app.presenters.eqWorkspace;
        const c = collect(m.state$);
        m.intents.select("MSFT");
        m.intents.closeTab("MSFT");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: "AAPL",
          openTabs: ["AAPL"],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("chart settings: timeframe and chart type are set; indicators and panes toggle independently; the y-scale flips", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const m = h.app.presenters.eqWorkspace;
        const c = collect(m.state$);
        m.intents.setTimeframe("1W");
        m.intents.setChartType("line");
        m.intents.toggleIndicator("sma20");
        m.intents.toggleIndicator("ema50");
        m.intents.toggleIndicator("sma20");
        m.intents.togglePane("rsi");
        m.intents.toggleYScale();
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...SEEDED,
          timeframe: "1W",
          chartType: "line",
          indicators: ["ema50"],
          panes: ["rsi"],
          yScale: "log",
        });
        m.intents.togglePane("rsi");
        m.intents.toggleYScale();
        await settle();
        expect(c.values.at(-1)).toMatchObject({ panes: [], yScale: "linear" });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("compare: set and cleared; comparing the selection against itself is ignored; selecting the compared symbol clears it; the y-scale is never touched", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const m = h.app.presenters.eqWorkspace;
        const c = collect(m.state$);
        m.intents.toggleYScale();
        m.intents.setCompare("MSFT");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          compare: "MSFT",
          yScale: "log",
        });
        m.intents.setCompare("AAPL");
        await settle();
        expect(c.values.at(-1)?.compare).toBe("MSFT");
        m.intents.select("MSFT");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: "MSFT",
          compare: null,
          yScale: "log",
        });
        m.intents.setCompare("AAPL");
        m.intents.setCompare(null);
        await settle();
        expect(c.values.at(-1)?.compare).toBeNull();
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("is warm with nobody watching: a change made with zero subscribers is what getValue() reads and what the next subscriber hears first", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const m = h.app.presenters.eqWorkspace;
        m.intents.select("MSFT");
        await settle();
        expect(m.state$.getValue()).toMatchObject({ sel: "MSFT" });
        const c = collect(m.state$);
        expect(c.values).toHaveLength(1);
        expect(c.values[0]).toMatchObject({
          sel: "MSFT",
          openTabs: ["AAPL", "MSFT"],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
