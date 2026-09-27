import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { ActivityEntry } from "@rtc/core-api";
import { formatClockTime } from "@rtc/core-logic";
import {
  type BlotterPort,
  DEFAULT_TRADER_NAME,
  Direction,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import { createBlotterPresenter } from "#/presenters/blotter";

describe("createBlotterPresenter (async)", () => {
  it("activity$ keeps its accumulator across zero subscribers and stamps entries with the injected clock", () => {
    const { port, trades } = createPort();
    const lifetime = new AbortController();
    const presenter = createBlotterPresenter(port, lifetime.signal, () => {
      return STAMP;
    });
    const first: (readonly ActivityEntry[])[] = [];
    const a = presenter.activity$.subscribe((entries) => {
      first.push(entries);
    });
    trades.next([]);
    trades.next([createLiveTrade(1)]);
    a.unsubscribe();

    const again: (readonly ActivityEntry[])[] = [];
    const b = presenter.activity$.subscribe((entries) => {
      again.push(entries);
    });
    expect(ids(again[0] ?? [])).toEqual([1]);
    expect(again[0]?.[0]?.time).toBe(formatClockTime(STAMP));
    trades.next([createLiveTrade(1), createLiveTrade(2)]);
    expect(ids(again.at(-1) ?? [])).toEqual([2, 1]);
    b.unsubscribe();
    lifetime.abort();
  });

  it("newTradeIds$ restarts its scan per warm period: after a resubscribe the current snapshot marks nothing", () => {
    const { port, trades } = createPort();
    const lifetime = new AbortController();
    const presenter = createBlotterPresenter(port, lifetime.signal);
    const first: ReadonlySet<number>[] = [];
    const a = presenter.newTradeIds$.subscribe((set) => {
      first.push(set);
    });
    trades.next([createLiveTrade(1)]);
    trades.next([createLiveTrade(1), createLiveTrade(2)]);
    expect([...(first.at(-1) ?? [])]).toEqual([2]);
    a.unsubscribe();

    const again: ReadonlySet<number>[] = [];
    const b = presenter.newTradeIds$.subscribe((set) => {
      again.push(set);
    });
    // trades$ is retained, so its replayed snapshot reaches the fresh scan
    // as a FIRST snapshot — which marks nothing, exactly as the RxJS
    // refCounted `scan` under a warm source does.
    expect(
      again.map((set) => {
        return [...set];
      }),
    ).toEqual([[]]);
    b.unsubscribe();
    lifetime.abort();
  });

  interface PortFixture {
    port: BlotterPort;
    trades: Subject<readonly Trade[]>;
  }

  function ids(entries: readonly ActivityEntry[]): number[] {
    return entries.map((entry) => {
      return entry.trade.tradeId;
    });
  }

  function createLiveTrade(tradeId: number): Trade {
    return {
      tradeId,
      tradeName: DEFAULT_TRADER_NAME,
      currencyPair: "EURUSD",
      notional: 1_000_000,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1.1,
      status: TradeStatus.Done,
      tradeDate: "2026-01-01",
      valueDate: "2026-01-03",
    };
  }

  function createPort(): PortFixture {
    const trades = new Subject<readonly Trade[]>();
    return {
      trades,
      port: {
        getTradeStream: () => {
          return trades;
        },
      },
    };
  }
});

const STAMP = Date.UTC(2026, 0, 1, 10, 20, 30);
