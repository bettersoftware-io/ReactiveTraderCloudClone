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
import {
  countInto,
  countSubscriptions,
  createPrice,
  createTally,
  createTrade,
  EURUSD,
} from "@rtc/core-contract";
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

  it("the base app's own readers hold no port a native member already holds: the watchlist, the pairs, a pair's prices, the credit workflow and the connection events are each subscribed ONCE", async () => {
    const simulated = createPorts({});
    const watchlist = createTally();
    const pairs = createTally();
    const prices = createTally();
    const rfqEvents = createTally();
    const connectionEvents = createTally();
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
          return countInto(concat(of([EURUSD]), NEVER), pairs);
        },
      },
      pricing: countSubscriptions(
        simulated.pricing,
        "getPriceUpdates",
        (symbol: unknown) => {
          return symbol === "EURUSD" ? prices : createTally();
        },
      ),
      // `RfqsPresenter.events$` is `warmReplay()` (refCount false): a base
      // director left on the base instance would hold `workflow.events()`
      // for the whole session — under WS-real, a duplicated server stream.
      workflow: countSubscriptions(simulated.workflow, "events", () => {
        return rfqEvents;
      }),
      connectionEvents: {
        events: () => {
          return countInto(reconnect$, connectionEvents);
        },
      },
    });

    try {
      const subs = [
        app.presenters.watchlist.watchlist$.subscribe(() => {}),
        app.presenters.currencyPairs.pairs$.subscribe(() => {}),
        app.presenters.priceStream.price$(EURUSD).subscribe(() => {}),
        app.presenters.animationDirector
          .intentsFor("tile:EURUSD")
          .subscribe(() => {}),
        app.presenters.rfqs.events$.subscribe(() => {}),
        app.presenters.connection.status$.subscribe(() => {}),
      ];
      await waitForDrive();

      // Copied out: the tallies keep moving through the `finally` below,
      // and a failure message is rendered after it.
      expect({
        watchlist: watchlist.live,
        pairs: pairs.live,
        prices: prices.live,
        rfqEvents: rfqEvents.live,
        connectionEvents: connectionEvents.live,
      }).toEqual({
        watchlist: 1,
        pairs: 1,
        prices: 1,
        rfqEvents: 1,
        connectionEvents: 1,
      });

      for (const sub of subs) {
        sub.unsubscribe();
      }
    } finally {
      await app.dispose();
    }
  });

  // Slice 5 ruling 8: no CoreSeams change, because no internal reader of the
  // base app consumes an admin member and each base copy is lazy. With every
  // native admin stream subscribed, each admin port stream is LIVE once —
  // twice for sessions$, which two native presenters read. `live`, not the
  // open count: the retained mirrors peek their port once at first subscribe.
  it("the base app's own admin presenters stay cold: each admin port stream is held only by the native members", async () => {
    const simulated = createPorts({});
    const tallies = {
      throughput: createTally(),
      latency: createTally(),
      errorRate: createTally(),
      topology: createTally(),
      events: createTally(),
      sessions: createTally(),
    };

    const telemetry = countSubscriptions(
      countSubscriptions(
        countSubscriptions(simulated.telemetry, "throughput$", () => {
          return tallies.throughput;
        }),
        "latency$",
        () => {
          return tallies.latency;
        },
      ),
      "errorRate$",
      () => {
        return tallies.errorRate;
      },
    );

    const { app } = composeWithBase({
      ...simulated,
      telemetry,
      serviceHealth: countSubscriptions(
        simulated.serviceHealth,
        "topology$",
        () => {
          return tallies.topology;
        },
      ),
      eventLog: countSubscriptions(simulated.eventLog, "events$", () => {
        return tallies.events;
      }),
      sessions: countSubscriptions(simulated.sessions, "sessions$", () => {
        return tallies.sessions;
      }),
    });

    try {
      const { presenters } = app;
      const subs = [
        presenters.throughputMetric.samples$.subscribe(() => {}),
        presenters.latencyMetric.samples$.subscribe(() => {}),
        presenters.errorRateMetric.samples$.subscribe(() => {}),
        presenters.topology.topology$.subscribe(() => {}),
        presenters.eventLog.events$.subscribe(() => {}),
        presenters.sessions.sessions$.subscribe(() => {}),
        presenters.sessionsKpi.countSeries$.subscribe(() => {}),
      ];
      await settle();

      expect({
        throughput: tallies.throughput.live,
        latency: tallies.latency.live,
        errorRate: tallies.errorRate.live,
        topology: tallies.topology.live,
        events: tallies.events.live,
        sessions: tallies.sessions.live,
      }).toEqual({
        throughput: 1,
        latency: 1,
        errorRate: 1,
        topology: 1,
        events: 1,
        sessions: 2,
      });

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
