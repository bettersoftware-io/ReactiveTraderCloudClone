import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { defer, Observable, of, Subject, throwError } from "rxjs";
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

/** An `OrderPort` whose snapshot query can be made to fail, whose `place`
 * calls are counted on invocation and whose open lifecycle subscriptions are
 * observable — the release witness `scopedPortStream` exists for. */
interface ScriptedOrders {
  port: OrderPort;
  failBook: (error: unknown) => void;
  placeCalls: () => number;
  openPlacements: () => number;
}

function createScriptedOrders(): ScriptedOrders {
  const placements = new Set<Subject<EquityOrder>>();
  let bookFailure: unknown = null;
  let placeCalls = 0;

  return {
    port: {
      place: (): Observable<EquityOrder> => {
        placeCalls += 1;
        return new Observable<EquityOrder>((subscriber) => {
          const lifecycle = new Subject<EquityOrder>();
          placements.add(lifecycle);
          const inner = lifecycle.subscribe(subscriber);

          return () => {
            inner.unsubscribe();
            placements.delete(lifecycle);
          };
        });
      },
      cancel: (): Observable<void> => {
        return of(undefined);
      },
      orders: (): Observable<readonly EquityOrder[]> => {
        return defer(() => {
          return bookFailure === null
            ? of<readonly EquityOrder[]>([])
            : throwError(() => {
                return bookFailure;
              });
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
      return placements.size;
    },
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
