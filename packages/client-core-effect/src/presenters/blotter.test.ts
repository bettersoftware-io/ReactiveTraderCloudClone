import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type { ActivityEntry } from "@rtc/core-api";
import {
  type BlotterPort,
  DEFAULT_TRADER_NAME,
  Direction,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createBlotterPresenter } from "#/presenters/blotter";

describe("createBlotterPresenter", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("activity$ is retained across zero subscribers and stamps with the injected clock", async () => {
    const trades = new Subject<readonly Trade[]>();
    const p = createBlotterPresenter(useHost(), portFor(trades), () => {
      // 1970-01-01T01:02:03Z, read through the local zone the fold formats in.
      return new Date(2026, 0, 2, 1, 2, 3).getTime();
    });
    const first: (readonly ActivityEntry[])[] = [];
    const sub = p.activity$.subscribe((entries: readonly ActivityEntry[]) => {
      first.push(entries);
    });
    trades.next([]);
    trades.next([createLiveTrade(1)]);
    await tick();
    expect(ids(first.at(-1) ?? [])).toEqual([1]);
    expect(first.at(-1)?.[0]?.time).toBe("01:02:03");
    sub.unsubscribe();
    await tick();
    const again: (readonly ActivityEntry[])[] = [];
    p.activity$.subscribe((entries: readonly ActivityEntry[]) => {
      again.push(entries);
    });
    expect(ids(again[0] ?? [])).toEqual([1]);
    trades.next([createLiveTrade(1), createLiveTrade(2)]);
    await tick();
    expect(ids(again.at(-1) ?? [])).toEqual([2, 1]);
  });

  it("newTradeIds$ restarts per period while trades$ stays warm", async () => {
    const trades = new Subject<readonly Trade[]>();
    const p = createBlotterPresenter(useHost(), portFor(trades));
    const first: ReadonlySet<number>[] = [];
    const sub = p.newTradeIds$.subscribe((fresh: ReadonlySet<number>) => {
      first.push(fresh);
    });
    trades.next([createLiveTrade(1)]);
    trades.next([createLiveTrade(1), createLiveTrade(2)]);
    await tick();
    expect([...(first.at(-1) ?? [])]).toEqual([2]);
    sub.unsubscribe();
    await tick();
    // trades$ is the RETAINED mirror, so the port is still live …
    expect(trades.observed).toBe(true);
    const again: ReadonlySet<number>[] = [];
    p.newTradeIds$.subscribe((fresh: ReadonlySet<number>) => {
      again.push(fresh);
    });
    // … but the scan starts over: the retained mirror replays the current
    // snapshot into the NEW period, and that snapshot marks nothing (it is
    // the period's first), exactly as the RxJS `scan` under a refCounted
    // share does. Only what arrives AFTER it is new again.
    await tick();
    expect(
      again.map((fresh) => {
        return [...fresh];
      }),
    ).toEqual([[]]);
    trades.next([createLiveTrade(1), createLiveTrade(2), createLiveTrade(3)]);
    await tick();
    expect([...(again.at(-1) ?? [])]).toEqual([3]);
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

function portFor(trades: Subject<readonly Trade[]>): BlotterPort {
  return {
    getTradeStream: () => {
      return trades;
    },
  };
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

function ids(entries: readonly ActivityEntry[]): number[] {
  return entries.map((entry) => {
    return entry.trade.tradeId;
  });
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
