import { firstValueFrom, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { BlotterPort, Trade } from "@rtc/domain";

import { BlotterPresenter } from "../BlotterPresenter";

function trade(tradeId: number): Trade {
  return { tradeId } as Trade;
}

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
});
