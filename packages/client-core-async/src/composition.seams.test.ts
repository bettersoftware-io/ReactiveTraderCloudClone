import { concat, firstValueFrom, NEVER, Observable, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type AnimationIntent,
  createSimulatorPorts,
  InMemorySessionStore,
  type JarvisEvent,
  type JarvisPort,
  reconnect$,
} from "@rtc/client-core";
import type { AppPorts } from "@rtc/core-api";
import { createPrice, createTrade, EURUSD } from "@rtc/core-contract";
import type {
  EquityOrder,
  ExecutionPort,
  OrderPort,
  PlaceOrderRequest,
  Trade,
} from "@rtc/domain";
import { AuthSimulator, Direction, PreferencesSimulator } from "@rtc/domain";

import { composeWithBase } from "#/composition";

describe("composeWithBase — core seams", () => {
  it("a Jarvis drive batch selecting a symbol lands on the app's NATIVE eqWorkspace, not the base's own", async () => {
    const { app, base } = composeWithBase(
      createPorts({ jarvis: createSelectingJarvisPort("MSFT") }),
    );

    try {
      const before = await firstValueFrom(base.presenters.eqWorkspace.state$);
      app.presenters.jarvis.intents.send("select MSFT");
      await settle();

      const afterApp = await firstValueFrom(app.presenters.eqWorkspace.state$);
      const afterBase = await firstValueFrom(
        base.presenters.eqWorkspace.state$,
      );
      expect(afterApp.sel).toBe("MSFT");
      expect(afterBase.sel).toBe(before.sel);
    } finally {
      await app.dispose();
    }
  });

  it("a fill placed through the NATIVE ordersBlotter.place reaches the base's own animationDirector", async () => {
    const orders$ = new Subject<EquityOrder>();
    const orders: OrderPort = {
      place: (): Observable<EquityOrder> => {
        return orders$;
      },
      cancel: (): Observable<void> => {
        return new Subject<void>();
      },
      orders: (): Observable<readonly EquityOrder[]> => {
        return of([]);
      },
    };
    const { app } = composeWithBase(createPorts({ orders }));

    try {
      const intents: AnimationIntent[] = [];
      const sub = app.presenters.animationDirector
        .intentsFor("ticket:AAPL")
        .subscribe((intent: AnimationIntent) => {
          intents.push(intent);
        });

      const placed = app.presenters.ordersBlotter
        .place(REQUEST)
        .subscribe(() => {});
      await settle();
      orders$.next(createFilledOrder());
      await settle();

      expect(intents).toEqual([{ target: "ticket:AAPL", kind: "fill" }]);
      sub.unsubscribe();
      placed.unsubscribe();
    } finally {
      await app.dispose();
    }
  });

  it("an FX execution through the NATIVE execution presenter reaches the base's own animationDirector as a tile fill", async () => {
    const execution: ExecutionPort = {
      executeTrade: (): Observable<Trade> => {
        return of(createTrade());
      },
    };
    const { app } = composeWithBase(createPorts({ execution }));

    try {
      const fills: AnimationIntent[] = [];
      const sub = app.presenters.animationDirector
        .intentsFor("tile:EURUSD")
        .subscribe((intent: AnimationIntent) => {
          // The simulator's own ticks land on the same target.
          if (intent.kind === "fill") {
            fills.push(intent);
          }
        });
      await settle();

      const executed = app.presenters.execution
        .execute({
          pair: EURUSD,
          direction: Direction.Buy,
          price: createPrice("EURUSD", 1.1),
          notional: 1_000_000,
        })
        .subscribe(() => {});
      await settle();

      expect(fills).toEqual([{ target: "tile:EURUSD", kind: "fill" }]);
      sub.unsubscribe();
      executed.unsubscribe();
    } finally {
      await app.dispose();
    }
  });

  it("the base app's own readers hold no port a native member already holds: the watchlist, the pairs and a pair's prices are each subscribed ONCE", async () => {
    const simulated = createPorts({});
    const watchlist = createTally();
    const pairs = createTally();
    const prices = createTally();
    const { app } = composeWithBase({
      ...simulated,
      marketData: countSubscriptions(
        simulated.marketData,
        "watchlist",
        () => {
          return watchlist;
        },
        // `of(WATCHLIST)` completes on subscribe, which would read as zero
        // live subscriptions however many readers there were.
        (roster: Observable<unknown>) => {
          return concat(roster, NEVER);
        },
      ),
      // The simulator delays its roster; a synchronous one that never
      // completes puts the base director's per-pair price reads inside the
      // settle below, and keeps `live` meaningful.
      referenceData: {
        getCurrencyPairs: () => {
          return counted(concat(of([EURUSD]), NEVER), pairs);
        },
      },
      pricing: countSubscriptions(
        simulated.pricing,
        "getPriceUpdates",
        (symbol: unknown) => {
          return symbol === "EURUSD" ? prices : createTally();
        },
      ),
    });

    try {
      const subs = [
        app.presenters.watchlist.watchlist$.subscribe(() => {}),
        app.presenters.currencyPairs.pairs$.subscribe(() => {}),
        app.presenters.priceStream.price$(EURUSD).subscribe(() => {}),
        app.presenters.animationDirector
          .intentsFor("tile:EURUSD")
          .subscribe(() => {}),
      ];
      await settle();

      // Copied out: the tallies keep moving through the `finally` below,
      // and a failure message is rendered after it.
      expect({
        watchlist: watchlist.live,
        pairs: pairs.live,
        prices: prices.live,
      }).toEqual({ watchlist: 1, pairs: 1, prices: 1 });

      for (const sub of subs) {
        sub.unsubscribe();
      }
    } finally {
      await app.dispose();
    }
  });
});

const REQUEST: PlaceOrderRequest = {
  symbol: "AAPL",
  side: "buy",
  type: "market",
  qty: 100,
};

function createFilledOrder(): EquityOrder {
  return {
    id: "ord-1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "filled",
    filledQty: 100,
    createdAt: 0,
  };
}

function createPorts(overrides: Partial<AppPorts>): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: {
      events: () => {
        return reconnect$;
      },
    },
    ...overrides,
  };
}

/** A JarvisPort whose ask() replies with one drive batch selecting `symbol`
 * in the equities workspace — copied from
 * `packages/client-core/src/__tests__/composition.seams.test.ts` (test
 * files may not import across packages' test trees). */
function createSelectingJarvisPort(symbol: string): JarvisPort {
  return {
    ask: (): Observable<JarvisEvent> => {
      return of<JarvisEvent>({
        type: "command",
        batch: { v: 1, commands: [{ kind: "eqSelect", symbol }] },
      });
    },
    confirm: (): void => {
      // unused by these tests
    },
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

/** Live subscriptions to one port stream. Only `live` is comparable across
 * cores — the Effect core's `mirrorPort` PEEKS a port (subscribe, then
 * unsubscribe) before it follows it, so it opens one twice by design —
 * and only on a source that never completes. */
interface Tally {
  live: number;
}

function createTally(): Tally {
  return { live: 0 };
}

/** `port` with every stream `method` returns counted into the tally
 * `tallyFor` picks from the call's arguments — a Proxy, because the
 * simulators keep their methods on a prototype a spread would drop. */
function countSubscriptions<P extends object>(
  port: P,
  method: keyof P & string,
  tallyFor: (...args: readonly unknown[]) => Tally,
  reshape: (source: Observable<unknown>) => Observable<unknown> = keep,
): P {
  return new Proxy(port, {
    get: (target: P, property: string | symbol): unknown => {
      const member: unknown = Reflect.get(target, property, target);

      if (typeof member !== "function") {
        return member;
      }

      if (property !== method) {
        return member.bind(target);
      }

      return (...args: readonly unknown[]): Observable<unknown> => {
        return counted(
          reshape(member.apply(target, args) as Observable<unknown>),
          tallyFor(...args),
        );
      };
    },
  });
}

function counted<T>(source: Observable<T>, tally: Tally): Observable<T> {
  return new Observable<T>((subscriber) => {
    tally.live += 1;
    const inner = source.subscribe(subscriber);

    return () => {
      tally.live -= 1;
      inner.unsubscribe();
    };
  });
}

function keep<T>(source: Observable<T>): Observable<T> {
  return source;
}
