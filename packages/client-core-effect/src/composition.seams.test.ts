import { concat, firstValueFrom, NEVER, Observable, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type AnimationIntent,
  type AppPorts,
  createSimulatorPorts,
  InMemorySessionStore,
  type JarvisEvent,
  type JarvisPort,
  reconnect$,
} from "@rtc/client-core";
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

// `composeWithBase` builds the RxJS base app with `CoreSeams` pointing
// every internal reader of the base at THIS core's own members. Without
// that, the base's Jarvis driver would mutate a workspace nothing renders,
// its animation director would never hear a fill or an FX execution made
// through a native presenter, and each port those readers share with a
// native member would be held twice — all invisible to the per-member
// contract, which only ever looks at one app's presenters.

describe("composeWithBase — core seams", () => {
  it("a Jarvis drive batch mutates THIS core's eqWorkspace, and the base's own stays where it was", async () => {
    const composed = composeWithBase(
      createPorts({ jarvis: createSelectingJarvisPort("MSFT") }),
    );

    try {
      const before = await firstValueFrom(
        composed.base.presenters.eqWorkspace.state$,
      );
      composed.app.presenters.jarvis.intents.send("select MSFT");
      await waitForDrive();
      expect(
        (await firstValueFrom(composed.app.presenters.eqWorkspace.state$)).sel,
      ).toBe("MSFT");
      expect(
        (await firstValueFrom(composed.base.presenters.eqWorkspace.state$)).sel,
      ).toBe(before.sel);
    } finally {
      await composed.app.dispose();
    }
  });

  it("the base animation director hears a fill placed through the NATIVE ordersBlotter", async () => {
    const scripted = createScriptedOrders();
    const composed = composeWithBase(createPorts({ orders: scripted.port }));

    try {
      const intents: unknown[] = [];
      const sub = composed.base.presenters.animationDirector
        .intentsFor("ticket:AAPL")
        .subscribe((intent: unknown) => {
          intents.push(intent);
        });

      const placed = composed.app.presenters.ordersBlotter
        .place(REQUEST)
        .subscribe(() => {});
      await settle();
      scripted.emit(createFilledOrder());
      await settle();
      expect(intents).toEqual([{ target: "ticket:AAPL", kind: "fill" }]);
      sub.unsubscribe();
      placed.unsubscribe();
    } finally {
      await composed.app.dispose();
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
      await waitForDrive();

      const executed = app.presenters.execution
        .execute({
          pair: EURUSD,
          direction: Direction.Buy,
          price: createPrice("EURUSD", 1.1),
          notional: 1_000_000,
        })
        .subscribe(() => {});
      await waitForDrive();

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
      await waitForDrive();

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

/** An `OrderPort` whose `place` lifecycle this test drives. Copied rather
 * than imported: a test file may not reach across another package's test
 * tree. */
interface ScriptedOrders {
  port: OrderPort;
  emit: (order: EquityOrder) => void;
}

function createScriptedOrders(): ScriptedOrders {
  const live: Subject<EquityOrder>[] = [];

  return {
    port: {
      place: (): Observable<EquityOrder> => {
        return new Observable<EquityOrder>((subscriber) => {
          const lifecycle = new Subject<EquityOrder>();
          live.push(lifecycle);
          const inner = lifecycle.subscribe(subscriber);

          return () => {
            inner.unsubscribe();
            const at = live.indexOf(lifecycle);

            if (at >= 0) {
              live.splice(at, 1);
            }
          };
        });
      },
      cancel: (): Observable<void> => {
        return of(undefined);
      },
      orders: (): Observable<readonly EquityOrder[]> => {
        return of<readonly EquityOrder[]>([]);
      },
    },
    emit: (order: EquityOrder) => {
      live[0]?.next(order);
    },
  };
}

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

/** A `JarvisPort` whose `ask()` replies with one drive batch selecting
 * `symbol` in the equities workspace. */
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

function createPorts(overrides: Partial<AppPorts>): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator({}),
      auth: new AuthSimulator({ demo: "pw" }),
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

/** The Jarvis machine's reply pipeline runs on real timers (the scripted
 * brain's typed-reveal pacing), so this waits on the wall clock rather
 * than a scheduler turn. */
function waitForDrive(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 50);
  });
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 2; turn += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
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
