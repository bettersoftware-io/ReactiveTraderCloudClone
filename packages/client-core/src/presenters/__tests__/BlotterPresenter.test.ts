import { firstValueFrom, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type BlotterPort,
  DEFAULT_TRADER_NAME,
  Direction,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import {
  ACTIVITY_CAP,
  type ActivityEntry,
  BlotterPresenter,
} from "../BlotterPresenter";

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

    it(`caps at ACTIVITY_CAP (${ACTIVITY_CAP}) and keeps the newest entries`, () => {
      const subject = new Subject<readonly Trade[]>();
      const port: BlotterPort = {
        getTradeStream: () => {
          return subject;
        },
      };
      const presenter = new BlotterPresenter(port);

      let last: readonly ActivityEntry[] = [];
      const sub = presenter.activity$.subscribe((entries) => {
        last = entries;
      });

      subject.next([]); // initial snapshot — empty

      const total = ACTIVITY_CAP + 10;

      for (let i = 1; i <= total; i++) {
        subject.next([trade(i, { tradeName: DEFAULT_TRADER_NAME })]);
      }

      sub.unsubscribe();

      expect(last).toHaveLength(ACTIVITY_CAP);
      // Newest arrival (highest tradeId) is first.
      expect(last[0]?.trade.tradeId).toBe(total);
      // Oldest retained arrival is at the tail.
      expect(last[ACTIVITY_CAP - 1]?.trade.tradeId).toBe(
        total - ACTIVITY_CAP + 1,
      );
    });

    // Regression for the Critical review finding: App.tsx remounts a tab's
    // whole subtree on switch (`<WorkspaceEngine key={activeTab}>`), which
    // unsubscribes FxBlotter/ActivityView. TradeStoreSimulator's real
    // getTradeStream() replays the CURRENT snapshot to a fresh subscriber
    // (defer → concat(of(snapshot), ...)) — modelled here by the source
    // re-emitting the same snapshot on resubscribe. With the old
    // `refCount: true`, that tore down the scan accumulator and the
    // replayed snapshot was (correctly, per the "suppress first snapshot"
    // rule) treated as non-activity — silently discarding all session
    // activity. `refCount: false` must keep the accumulator alive across
    // this unsubscribe/resubscribe cycle.
    it("survives unsubscribe/resubscribe (tab remount) without losing accumulated entries", () => {
      const subject = new Subject<readonly Trade[]>();
      const port: BlotterPort = {
        getTradeStream: () => {
          return subject;
        },
      };
      const presenter = new BlotterPresenter(port);

      const firstRun: (readonly ActivityEntry[])[] = [];
      const sub1 = presenter.activity$.subscribe((entries) => {
        firstRun.push(entries);
      });

      subject.next([]); // initial snapshot — empty
      subject.next([trade(1, { tradeName: DEFAULT_TRADER_NAME })]); // live execution

      const afterFirstExecution = firstRun.at(-1);
      expect(afterFirstExecution).toHaveLength(1);
      const capturedTimestamp = afterFirstExecution?.[0]?.time;

      // Simulate the FX tab unmounting (switch to Equities, etc.) — the
      // presenter itself is a composition-root singleton and is NOT
      // recreated, only its subscribers come and go.
      sub1.unsubscribe();

      const secondRun: (readonly ActivityEntry[])[] = [];
      const sub2 = presenter.activity$.subscribe((entries) => {
        secondRun.push(entries);
      });

      // Resubscription (real TradeStoreSimulator behaviour): the source
      // replays the CURRENT snapshot, which still contains trade 1.
      subject.next([trade(1, { tradeName: DEFAULT_TRADER_NAME })]);

      // shareReplay(1) immediately replays the last buffered value to the
      // new subscriber — that's the accumulated entry surviving the gap.
      expect(secondRun[0]).toHaveLength(1);
      expect(secondRun[0]?.[0]?.trade.tradeId).toBe(1);
      expect(secondRun[0]?.[0]?.time).toBe(capturedTimestamp);

      // The replayed snapshot must not be treated as a fresh arrival —
      // no duplicate entry.
      const afterResubscribeSnapshot = secondRun.at(-1);
      expect(afterResubscribeSnapshot).toHaveLength(1);
      expect(afterResubscribeSnapshot?.[0]?.time).toBe(capturedTimestamp);

      sub2.unsubscribe();
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
