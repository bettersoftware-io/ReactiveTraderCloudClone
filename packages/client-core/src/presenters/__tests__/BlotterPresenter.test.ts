import { firstValueFrom, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type BlotterPort,
  DEFAULT_TRADER_NAME,
  Direction,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import { type ActivityEntry, BlotterPresenter } from "../BlotterPresenter";

describe("BlotterPresenter", () => {
  it("exposes the trade stream", async () => {
    const trades: readonly Trade[] = [];
    const port: BlotterPort = {
      getTradeStream: () => {
        return of(trades);
      },
    };
    const presenter = new BlotterPresenter(port);
    expect(await firstValueFrom(presenter.trades$)).toBe(trades);
  });

  it("flags only trades that appear after the first snapshot", () => {
    const subject = new Subject<readonly Trade[]>();
    const port: BlotterPort = {
      getTradeStream: () => {
        return subject;
      },
    };
    const presenter = new BlotterPresenter(port);

    const emitted: ReadonlySet<number>[] = [];
    const sub = presenter.newTradeIds$.subscribe((ids) => {
      emitted.push(ids);
    });

    subject.next([trade(1), trade(2)]); // initial snapshot — nothing is "new"
    subject.next([trade(1), trade(2), trade(3)]); // 3 arrived after the snapshot
    subject.next([trade(1), trade(3)]); // removals are not "new" arrivals
    sub.unsubscribe();

    expect([...emitted[0]]).toEqual([]);
    expect([...emitted[1]]).toEqual([3]);
    expect([...emitted[2]]).toEqual([]);
  });

  describe("activity$", () => {
    it("starts empty even when the first snapshot already has trades", () => {
      const subject = new Subject<readonly Trade[]>();
      const port: BlotterPort = {
        getTradeStream: () => {
          return subject;
        },
      };
      const presenter = new BlotterPresenter(port);

      const emitted: (readonly ActivityEntry[])[] = [];
      const sub = presenter.activity$.subscribe((entries) => {
        emitted.push(entries);
      });

      // Seeded history — even a "You" trade in the initial snapshot is not
      // activity; only arrivals on LATER emissions count.
      subject.next([
        trade(1, { tradeName: "A.Stark" }),
        trade(2, { tradeName: DEFAULT_TRADER_NAME }),
      ]);
      sub.unsubscribe();

      expect(emitted[0]).toEqual([]);
    });

    it("excludes seeded trades (by tradeName) and includes live executions", () => {
      const subject = new Subject<readonly Trade[]>();
      const port: BlotterPort = {
        getTradeStream: () => {
          return subject;
        },
      };
      const presenter = new BlotterPresenter(port);

      const emitted: (readonly ActivityEntry[])[] = [];
      const sub = presenter.activity$.subscribe((entries) => {
        emitted.push(entries);
      });

      subject.next([trade(1, { tradeName: "A.Stark" })]); // initial snapshot
      subject.next([
        trade(2, { tradeName: DEFAULT_TRADER_NAME }), // live execution
        trade(1, { tradeName: "A.Stark" }),
      ]);
      sub.unsubscribe();

      expect(emitted[1]).toHaveLength(1);
      expect(emitted[1][0]?.trade.tradeId).toBe(2);
      expect(emitted[1][0]?.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it("prepends newest-first across multiple live executions", () => {
      const subject = new Subject<readonly Trade[]>();
      const port: BlotterPort = {
        getTradeStream: () => {
          return subject;
        },
      };
      const presenter = new BlotterPresenter(port);

      const emitted: (readonly ActivityEntry[])[] = [];
      const sub = presenter.activity$.subscribe((entries) => {
        emitted.push(entries);
      });

      subject.next([]); // initial snapshot — empty
      subject.next([trade(1, { tradeName: DEFAULT_TRADER_NAME })]);
      subject.next([
        trade(2, { tradeName: DEFAULT_TRADER_NAME }),
        trade(1, { tradeName: DEFAULT_TRADER_NAME }),
      ]);
      sub.unsubscribe();

      expect(
        emitted[1].map((e) => {
          return e.trade.tradeId;
        }),
      ).toEqual([1]);
      expect(
        emitted[2].map((e) => {
          return e.trade.tradeId;
        }),
      ).toEqual([2, 1]);
    });
  });
});

function trade(tradeId: number, over: Partial<Trade> = {}): Trade {
  return {
    tradeId,
    tradeName: "Trade",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.09221,
    status: TradeStatus.Done,
    tradeDate: "2026-06-06",
    valueDate: "2026-06-08",
    ...over,
  };
}
