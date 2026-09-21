import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Observable, of, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createOrdersBlotterPresenter } from "#/presenters/ordersBlotter";

describe("ordersBlotter presenter", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("a failing orders() query fails orders$'s subscribers", async () => {
    const boom = new Error("book unreachable");
    const scripted = createScriptedOrders();
    scripted.failBook(boom);
    const p = createOrdersBlotterPresenter(useHost(), scripted.port);
    const errors: unknown[] = [];
    p.orders$.subscribe({
      next: () => {},
      error: (error: unknown) => {
        errors.push(error);
      },
    });
    await tick();
    await tick();
    expect(errors).toEqual([boom]);
  });

  it("place() twice is two port calls, and an unsubscribe releases that call's port", async () => {
    const scripted = createScriptedOrders();
    const p = createOrdersBlotterPresenter(useHost(), scripted.port);
    const first = p.place(REQUEST).subscribe(() => {});
    const second = p.place(REQUEST).subscribe(() => {});
    await tick();
    expect(scripted.placeCalls()).toBe(2);
    expect(scripted.openPlacements()).toBe(2);
    first.unsubscribe();
    await tick();
    expect(scripted.openPlacements()).toBe(1);
    second.unsubscribe();
    await tick();
    expect(scripted.openPlacements()).toBe(0);
  });

  it("a refresh arriving while a query is pending SWITCHES to a fresh one: the stale query is abandoned and only the newest book lands", async () => {
    const scripted = createScriptedOrders();
    const p = createOrdersBlotterPresenter(useHost(), scripted.port);
    const books: (readonly EquityOrder[])[] = [];
    p.orders$.subscribe((book: readonly EquityOrder[]) => {
      books.push(book);
    });
    await tick();
    // The first query is open and pending — nothing has been delivered.
    expect(scripted.openQueries()).toBe(1);
    expect(books).toEqual([]);
    const stale = scripted.oldestQuery();

    // A lifecycle update publishes the refresh, on the real path.
    const placed = p.place(REQUEST).subscribe(() => {});
    await tick();
    scripted.emitOrder(createOrder("working"));
    await tick();

    // Ruling 9: newest wins, one query at a time. The pending first query
    // was unsubscribed rather than left racing the second.
    expect(stale?.observed).toBe(false);
    expect(scripted.queryCalls()).toBe(2);
    expect(scripted.openQueries()).toBe(1);

    // Only the SECOND query's result reaches subscribers — the first's is
    // delivered to nobody even if the port answers it late.
    const fresh = createOrder("filled");
    stale?.next([createOrder("rejected")]);
    scripted.oldestQuery()?.next([fresh]);
    await tick();
    expect(books).toEqual([[fresh]]);
    placed.unsubscribe();
  });

  it("place() is lazy: the port is not called until the returned stream is subscribed", async () => {
    const scripted = createScriptedOrders();
    const p = createOrdersBlotterPresenter(useHost(), scripted.port);
    p.place(REQUEST);
    await tick();
    expect(scripted.placeCalls()).toBe(0);
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

/** An `OrderPort` whose snapshot query can be made to fail or left PENDING
 * (so "a refresh while a query is in flight" is reachable at all), whose
 * `place` calls are counted on invocation, and whose open subscriptions —
 * lifecycle and query alike — are observable: the release witnesses
 * `scopedPortStream` and `{ switch: true }` exist for. */
interface ScriptedOrders {
  port: OrderPort;
  failBook: (error: unknown) => void;
  placeCalls: () => number;
  openPlacements: () => number;
  /** Next on the OLDEST open `place` lifecycle. */
  emitOrder: (order: EquityOrder) => void;
  queryCalls: () => number;
  openQueries: () => number;
  /** The OLDEST still-open `orders()` query, to answer it by hand. */
  oldestQuery: () => Subject<readonly EquityOrder[]> | undefined;
}

function createScriptedOrders(): ScriptedOrders {
  const placements: Subject<EquityOrder>[] = [];
  const queries: Subject<readonly EquityOrder[]>[] = [];
  let bookFailure: unknown = null;
  let placeCalls = 0;
  let queryCalls = 0;

  function dropFrom<T>(list: T[], entry: T): void {
    const at = list.indexOf(entry);

    if (at >= 0) {
      list.splice(at, 1);
    }
  }

  return {
    port: {
      place: (): Observable<EquityOrder> => {
        placeCalls += 1;
        return new Observable<EquityOrder>((subscriber) => {
          const lifecycle = new Subject<EquityOrder>();
          placements.push(lifecycle);
          const inner = lifecycle.subscribe(subscriber);

          return () => {
            inner.unsubscribe();
            dropFrom(placements, lifecycle);
          };
        });
      },
      cancel: (): Observable<void> => {
        return of(undefined);
      },
      // Pending until answered, so a refresh can land mid-query. The
      // failure branch stays synchronous — that case is about the error
      // reaching subscribers, not about timing.
      orders: (): Observable<readonly EquityOrder[]> => {
        return new Observable<readonly EquityOrder[]>((subscriber) => {
          queryCalls += 1;

          if (bookFailure !== null) {
            subscriber.error(bookFailure);
            return;
          }

          const query = new Subject<readonly EquityOrder[]>();
          queries.push(query);
          const inner = query.subscribe(subscriber);

          return () => {
            inner.unsubscribe();
            dropFrom(queries, query);
          };
        });
      },
    },
    failBook: (error: unknown) => {
      bookFailure = error;
    },
    placeCalls: () => {
      return placeCalls;
    },
    openPlacements: () => {
      return placements.length;
    },
    emitOrder: (order: EquityOrder) => {
      placements[0]?.next(order);
    },
    queryCalls: () => {
      return queryCalls;
    },
    openQueries: () => {
      return queries.length;
    },
    oldestQuery: () => {
      return queries[0];
    },
  };
}

function createOrder(status: EquityOrder["status"]): EquityOrder {
  return {
    id: `ord-${status}`,
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status,
    filledQty: status === "filled" ? 100 : 0,
    createdAt: 0,
  };
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const REQUEST: PlaceOrderRequest = {
  symbol: "AAPL",
  side: "buy",
  type: "market",
  qty: 100,
};
