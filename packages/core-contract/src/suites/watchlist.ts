import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { AAPL, createEquityQuote, MSFT } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeWatchlistContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("watchlist$ is silent until the roster arrives, replays it synchronously to a late subscriber, and stays warm across zero subscribers", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.watchlist;
        const c = collect(p.watchlist$);
        expect(c.values).toEqual([]);
        h.driver.emitWatchlist([AAPL, MSFT]);
        await settle();
        expect(c.values).toEqual([[AAPL, MSFT]]);
        const late = collect(p.watchlist$);
        expect(late.values).toEqual([[AAPL, MSFT]]);
        c.unsubscribe();
        late.unsubscribe();
        await settle();
        expect(h.driver.watchlistObserved()).toBe(true);
        expect(c.errors).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("a roster the world already holds is delivered synchronously to the first subscriber", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const c = collect(h.app.presenters.watchlist.watchlist$);
        expect(c.values).toEqual([[AAPL]]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("quote$(symbol) is memoised per symbol", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.watchlist;
        expect(p.quote$("AAPL")).toBe(p.quote$("AAPL"));
        expect(p.quote$("AAPL")).not.toBe(p.quote$("MSFT"));
      } finally {
        await h.teardown();
      }
    });

    it("quote$ delivers its own symbol's quotes only, replays the latest to a late joiner, releases the port on the last unsubscribe, and a fresh warm period starts with no replay", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.watchlist;
        const aapl = collect(p.quote$("AAPL"));
        const msft = collect(p.quote$("MSFT"));
        await settle();
        const first = createEquityQuote("AAPL", 190);
        h.driver.emitEquityQuote(first);
        await settle();
        expect(aapl.values).toEqual([first]);
        expect(msft.values).toEqual([]);
        const late = collect(p.quote$("AAPL"));
        expect(late.values).toEqual([first]);
        aapl.unsubscribe();
        msft.unsubscribe();
        late.unsubscribe();
        await settle();
        expect(h.driver.equityQuoteObserved("AAPL")).toBe(false);
        const again = collect(p.quote$("AAPL"));
        expect(again.values).toEqual([]);
        await settle();
        const second = createEquityQuote("AAPL", 191);
        h.driver.emitEquityQuote(second);
        await settle();
        expect(again.values).toEqual([second]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
