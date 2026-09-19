import { describe, expect, it } from "vitest";

import type { ActivityEntry } from "@rtc/core-api";
import {
  ACTIVITY_FEED_CAP,
  DEFAULT_TRADER_NAME,
  type Trade,
} from "@rtc/domain";

import { collect } from "#/harness/collect";
import { createTrade } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

function createLiveTrade(tradeId: number): Trade {
  return createTrade({ tradeId, tradeName: DEFAULT_TRADER_NAME });
}

function ids(entries: readonly ActivityEntry[]): number[] {
  return entries.map((entry) => {
    return entry.trade.tradeId;
  });
}

export function describeBlotterContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("trades$ delivers each snapshot, replays the latest to a late subscriber synchronously, and stays warm across zero subscribers", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.blotter.trades$);
        expect(c.values).toEqual([]);
        const snapshot = [createTrade({ tradeId: 1 })];
        h.driver.emitTrades(snapshot);
        await settle();
        expect(c.values).toEqual([snapshot]);
        const late = collect(h.app.presenters.blotter.trades$);
        expect(late.values).toEqual([snapshot]);
        c.unsubscribe();
        late.unsubscribe();
        await settle();
        expect(h.driver.tradesObserved()).toBe(true);
      } finally {
        await h.teardown();
      }
    });

    it("newTradeIds$: the first snapshot marks nothing; ids appearing later are marked once, then cleared by the next snapshot", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.blotter.newTradeIds$);
        h.driver.emitTrades([createTrade({ tradeId: 1 })]);
        await settle();
        expect(
          c.values.map((set) => {
            return [...set];
          }),
        ).toEqual([[]]);
        h.driver.emitTrades([
          createTrade({ tradeId: 1 }),
          createTrade({ tradeId: 2 }),
        ]);
        await settle();
        expect([...(c.values.at(-1) ?? [])]).toEqual([2]);
        h.driver.emitTrades([
          createTrade({ tradeId: 1 }),
          createTrade({ tradeId: 2 }),
        ]);
        await settle();
        expect([...(c.values.at(-1) ?? [])]).toEqual([]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("activity$ starts empty even when the first snapshot has live trades, lists later live trades newest first with a clock stamp, and never lists seeded rows", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.blotter.activity$);
        h.driver.emitTrades([createLiveTrade(1)]);
        await settle();
        expect(c.values.at(-1)).toEqual([]);
        h.driver.emitTrades([
          createLiveTrade(1),
          createTrade({ tradeId: 2 }),
          createLiveTrade(3),
        ]);
        await settle();
        expect(ids(c.values.at(-1) ?? [])).toEqual([3]);
        expect(c.values.at(-1)?.[0].time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        h.driver.emitTrades([
          createLiveTrade(1),
          createTrade({ tradeId: 2 }),
          createLiveTrade(3),
          createLiveTrade(4),
        ]);
        await settle();
        expect(ids(c.values.at(-1) ?? [])).toEqual([4, 3]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("activity$ caps at ACTIVITY_FEED_CAP, keeping the newest", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.blotter.activity$);
        h.driver.emitTrades([]);
        await settle();
        // Each new trade arrives in ITS OWN snapshot, one at a time: the fold
        // prepends the additions found in a single snapshot in that
        // snapshot's own array order (see blotterFolds.ts `reduceActivity`),
        // so "newest first" is a property of SUCCESSIVE snapshots — not of
        // arrival order within one multi-trade snapshot.
        const trades: Trade[] = [];

        for (let id = 1; id <= ACTIVITY_FEED_CAP + 5; id += 1) {
          trades.push(createLiveTrade(id));
          h.driver.emitTrades([...trades]);
        }

        await settle();
        const feed = ids(c.values.at(-1) ?? []);
        expect(feed).toHaveLength(ACTIVITY_FEED_CAP);
        expect(feed[0]).toBe(ACTIVITY_FEED_CAP + 5);
        expect(feed.at(-1)).toBe(6);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("activity$ survives zero subscribers: a resubscribe replays the accumulated feed synchronously and keeps accumulating", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.blotter.activity$);
        h.driver.emitTrades([]);
        h.driver.emitTrades([createLiveTrade(1)]);
        await settle();
        first.unsubscribe();
        await settle();
        const again = collect(h.app.presenters.blotter.activity$);
        expect(ids(again.values[0] ?? [])).toEqual([1]);
        h.driver.emitTrades([createLiveTrade(1), createLiveTrade(2)]);
        await settle();
        expect(ids(again.values.at(-1) ?? [])).toEqual([2, 1]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
